import type { FilterQuery, Model, Types } from 'mongoose';
import {
  MINI_APP_TOTAL_CONTENT_MAX_LENGTH,
  MINI_APP_TITLE_MAX_LENGTH,
  MINI_APP_FILE_PATH_MAX_LENGTH,
  MINI_APP_DESCRIPTION_MAX_LENGTH,
  MINI_APP_FILE_CONTENT_MAX_LENGTH,
} from 'librechat-data-provider';
import logger from '~/config/winston';
import { isValidObjectIdString } from '~/utils/objectId';
import { escapeRegExp } from '~/utils/string';
import type { IMiniApp, IMiniAppDocument, MiniAppFileMap, MiniAppFiles } from '~/types';

export type CreateMiniAppInput = {
  title: string;
  description?: string | null;
  files: MiniAppFiles;
  entryFile?: string | null;
  conversationId?: string;
  messageId?: string;
  tenantId?: string;
};

export type UpdateMiniAppInput = Partial<
  Pick<CreateMiniAppInput, 'title' | 'description' | 'files' | 'entryFile'>
>;

export type ListMiniAppsOptions = {
  cursor?: string | null;
  limit?: number;
  search?: string;
};

export type ListMiniAppsResult = {
  miniApps: IMiniApp[];
  nextCursor: string | null;
};

export interface MiniAppMethods {
  createMiniApp(user: string, input: CreateMiniAppInput): Promise<IMiniApp>;
  getMiniApp(user: string, miniAppId: string): Promise<IMiniApp | null>;
  listMiniApps(user: string, options?: ListMiniAppsOptions): Promise<ListMiniAppsResult>;
  updateMiniApp(
    user: string,
    miniAppId: string,
    input: UpdateMiniAppInput,
  ): Promise<IMiniApp | null>;
  deleteMiniApp(user: string, miniAppId: string): Promise<{ deletedCount: number }>;
}

type MiniAppLean = IMiniApp & { _id: Types.ObjectId };
type MiniAppCursor = { updatedAt: string; id: string };

const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._\-/]+$/;

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit) || !limit) {
    return 24;
  }
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function normalizeText(value: string | null | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

function normalizeEntryFile(entryFile: string | null | undefined, files: MiniAppFileMap): string {
  const preferred = normalizeText(entryFile, MINI_APP_FILE_PATH_MAX_LENGTH);
  if (preferred && files[preferred] != null) {
    return preferred;
  }
  if (files['src/App.jsx'] != null) {
    return 'src/App.jsx';
  }
  if (files['App.jsx'] != null) {
    return 'App.jsx';
  }
  return Object.keys(files)[0] ?? 'src/App.jsx';
}

function toRawFileEntries(files: MiniAppFiles | null | undefined): Array<[string, unknown]> {
  if (!files || typeof files !== 'object') {
    return [];
  }
  if (!Array.isArray(files)) {
    return Object.entries(files);
  }
  return files.map((file) => {
    if (!file || typeof file !== 'object') {
      return ['', undefined];
    }
    return [typeof file.path === 'string' ? file.path : '', file.content];
  });
}

function normalizeFiles(files: MiniAppFiles): MiniAppFileMap {
  const rawEntries = toRawFileEntries(files);
  const invalidPaths: string[] = [];
  const entries = rawEntries.filter(([path, content]) => {
    const isValid =
      typeof path === 'string' &&
      path.length > 0 &&
      path.length <= MINI_APP_FILE_PATH_MAX_LENGTH &&
      RELATIVE_PATH_PATTERN.test(path) &&
      typeof content === 'string';
    if (!isValid) {
      invalidPaths.push(String(path || '(empty)'));
    }
    return isValid;
  });

  if (invalidPaths.length > 0) {
    throw new Error(`Invalid mini app file path: ${invalidPaths.slice(0, 3).join(', ')}`);
  }

  const normalized = Object.fromEntries(
    entries.map(([path, content]) => [path, content.slice(0, MINI_APP_FILE_CONTENT_MAX_LENGTH)]),
  );
  const total = Object.values(normalized).reduce((sum, content) => sum + content.length, 0);
  if (entries.length === 0) {
    throw new Error('Mini app must include at least one non-empty file');
  }
  if (total === 0) {
    throw new Error('Mini app files cannot be empty');
  }
  if (total > MINI_APP_TOTAL_CONTENT_MAX_LENGTH) {
    throw new Error('Mini app files are too large');
  }
  return normalized;
}

function toStoredFiles(files: MiniAppFileMap): Array<{ path: string; content: string }> {
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

function sanitizeInput(input: CreateMiniAppInput): CreateMiniAppInput {
  const files = normalizeFiles(input.files);
  const title = normalizeText(input.title, MINI_APP_TITLE_MAX_LENGTH);
  if (!title) {
    throw new Error('Mini app title is required');
  }
  return {
    ...input,
    title,
    description: normalizeText(input.description, MINI_APP_DESCRIPTION_MAX_LENGTH),
    files,
    entryFile: normalizeEntryFile(input.entryFile, files),
  };
}

function parseCursor(cursor?: string | null): MiniAppCursor | null {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString()) as MiniAppCursor;
    if (!decoded.updatedAt || !isValidObjectIdString(decoded.id)) {
      return null;
    }
    return decoded;
  } catch {
    logger.warn('[listMiniApps] Invalid cursor format, starting from beginning');
    return null;
  }
}

function encodeCursor(miniApp: MiniAppLean): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: (miniApp.updatedAt ?? new Date()).toISOString(),
      id: miniApp._id.toString(),
    }),
  ).toString('base64');
}

export function createMiniAppMethods(mongoose: typeof import('mongoose')): MiniAppMethods {
  async function createMiniApp(user: string, input: CreateMiniAppInput): Promise<IMiniApp> {
    const MiniApp = mongoose.models.MiniApp as Model<IMiniAppDocument>;
    const sanitized = sanitizeInput(input);
    const miniApp = await MiniApp.create({
      ...sanitized,
      files: toStoredFiles(sanitized.files),
      user,
    });
    return miniApp.toObject() as IMiniApp;
  }

  async function getMiniApp(user: string, miniAppId: string): Promise<IMiniApp | null> {
    if (!isValidObjectIdString(miniAppId)) {
      return null;
    }
    const MiniApp = mongoose.models.MiniApp as Model<IMiniAppDocument>;
    return await MiniApp.findOne({
      _id: new mongoose.Types.ObjectId(miniAppId),
      user,
    }).lean<IMiniApp>();
  }

  async function listMiniApps(
    user: string,
    options: ListMiniAppsOptions = {},
  ): Promise<ListMiniAppsResult> {
    const MiniApp = mongoose.models.MiniApp as Model<IMiniAppDocument>;
    const limit = normalizeLimit(options.limit);
    const filters: FilterQuery<IMiniAppDocument>[] = [{ user }];
    if (options.search?.trim()) {
      filters.push({ title: { $regex: escapeRegExp(options.search.trim()), $options: 'i' } });
    }
    const cursor = parseCursor(options.cursor);
    if (cursor) {
      const updatedAt = new Date(cursor.updatedAt);
      filters.push({
        $or: [
          { updatedAt: { $lt: updatedAt } },
          { updatedAt, _id: { $lt: new mongoose.Types.ObjectId(cursor.id) } },
        ],
      });
    }
    const query =
      filters.length === 1 ? filters[0] : ({ $and: filters } as FilterQuery<IMiniAppDocument>);
    const miniApps = await MiniApp.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<MiniAppLean[]>();
    let nextCursor: string | null = null;
    if (miniApps.length > limit) {
      miniApps.pop();
      const last = miniApps[miniApps.length - 1];
      nextCursor = last ? encodeCursor(last) : null;
    }
    return { miniApps, nextCursor };
  }

  async function updateMiniApp(
    user: string,
    miniAppId: string,
    input: UpdateMiniAppInput,
  ): Promise<IMiniApp | null> {
    if (!isValidObjectIdString(miniAppId)) {
      return null;
    }
    const update: Partial<CreateMiniAppInput> = {};
    if (input.title !== undefined) {
      update.title = normalizeText(input.title, MINI_APP_TITLE_MAX_LENGTH);
    }
    if (input.description !== undefined) {
      update.description = normalizeText(input.description, MINI_APP_DESCRIPTION_MAX_LENGTH);
    }
    if (input.files !== undefined) {
      update.files = normalizeFiles(input.files);
      update.entryFile = normalizeEntryFile(input.entryFile, update.files);
    } else if (input.entryFile !== undefined) {
      update.entryFile = normalizeText(input.entryFile, MINI_APP_FILE_PATH_MAX_LENGTH);
    }
    const MiniApp = mongoose.models.MiniApp as Model<IMiniAppDocument>;
    return await MiniApp.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(miniAppId), user },
      { $set: { ...update, ...(update.files ? { files: toStoredFiles(update.files) } : {}) } },
      { new: true, runValidators: true },
    ).lean<IMiniApp>();
  }

  async function deleteMiniApp(user: string, miniAppId: string): Promise<{ deletedCount: number }> {
    if (!isValidObjectIdString(miniAppId)) {
      return { deletedCount: 0 };
    }
    const MiniApp = mongoose.models.MiniApp as Model<IMiniAppDocument>;
    const result = await MiniApp.deleteOne({ _id: new mongoose.Types.ObjectId(miniAppId), user });
    return { deletedCount: result.deletedCount ?? 0 };
  }

  return { createMiniApp, getMiniApp, listMiniApps, updateMiniApp, deleteMiniApp };
}
