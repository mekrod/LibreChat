import { logger } from '@librechat/data-schemas';
import type { IMiniApp } from '@librechat/data-schemas';
import type {
  TMiniApp,
  TMiniAppSummary,
  TCreateMiniAppRequest,
  TUpdateMiniAppRequest,
  TDeleteMiniAppResponse,
  TMiniAppListResponse,
  MiniAppFileMap,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

export interface MiniAppHandlersDeps {
  createMiniApp: (
    user: string,
    input: TCreateMiniAppRequest & { tenantId?: string },
  ) => Promise<IMiniApp>;
  getMiniApp: (user: string, miniAppId: string) => Promise<IMiniApp | null>;
  listMiniApps: (
    user: string,
    options?: { cursor?: string | null; limit?: number; search?: string },
  ) => Promise<{ miniApps: IMiniApp[]; nextCursor: string | null }>;
  updateMiniApp: (
    user: string,
    miniAppId: string,
    input: TUpdateMiniAppRequest,
  ) => Promise<IMiniApp | null>;
  deleteMiniApp: (user: string, miniAppId: string) => Promise<{ deletedCount: number }>;
}

type MiniAppWithId = IMiniApp & { _id?: { toString(): string } };

function serializeFiles(files: IMiniApp['files']): Record<string, string> {
  if (Array.isArray(files)) {
    return Object.fromEntries(
      files
        .filter((file) => typeof file.path === 'string' && typeof file.content === 'string')
        .map((file) => [file.path, file.content]),
    );
  }
  if (files instanceof Map) {
    return Object.fromEntries(files.entries());
  }
  return files ?? {};
}

function serializeMiniApp(miniApp: MiniAppWithId): TMiniApp {
  const files = serializeFiles(miniApp.files);
  return {
    _id: miniApp._id?.toString() ?? '',
    title: miniApp.title,
    description: miniApp.description,
    files,
    entryFile: miniApp.entryFile,
    user: miniApp.user,
    conversationId: miniApp.conversationId,
    messageId: miniApp.messageId,
    tenantId: miniApp.tenantId,
    createdAt: (miniApp.createdAt ?? new Date()).toISOString(),
    updatedAt: (miniApp.updatedAt ?? new Date()).toISOString(),
  };
}

function serializeMiniAppSummary(miniApp: MiniAppWithId): TMiniAppSummary {
  const { files: _files, ...rest } = serializeMiniApp(miniApp);
  return {
    ...rest,
    fileCount: Object.keys(serializeFiles(miniApp.files)).length,
  };
}

function parseLimit(raw: unknown): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getMiniAppId(req: ServerRequest): string {
  const params = req.params as { id?: string } | undefined;
  return params?.id ?? '';
}

function normalizeRequestFiles(
  files: TCreateMiniAppRequest['files'] | TUpdateMiniAppRequest['files'],
): MiniAppFileMap | undefined {
  if (files === undefined) {
    return undefined;
  }
  if (!Array.isArray(files)) {
    return files;
  }
  return Object.fromEntries(
    files
      .filter((file) => typeof file.path === 'string' && typeof file.content === 'string')
      .map((file) => [file.path, file.content]),
  );
}

export function createMiniAppHandlers(deps: MiniAppHandlersDeps): {
  list: (req: ServerRequest, res: Response) => Promise<Response>;
  create: (req: ServerRequest, res: Response) => Promise<Response>;
  get: (req: ServerRequest, res: Response) => Promise<Response>;
  patch: (req: ServerRequest, res: Response) => Promise<Response>;
  delete: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const { createMiniApp, getMiniApp, listMiniApps, updateMiniApp, deleteMiniApp } = deps;

  async function list(req: ServerRequest, res: Response): Promise<Response> {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { cursor, limit, search } = req.query as {
        cursor?: string;
        limit?: string;
        search?: string;
      };
      const result = await listMiniApps(req.user.id, {
        cursor,
        limit: parseLimit(limit),
        search,
      });
      const response: TMiniAppListResponse = {
        miniApps: result.miniApps.map(serializeMiniAppSummary),
        nextCursor: result.nextCursor,
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[GET /mini-apps] Error listing mini apps', error);
      return res.status(500).json({ error: 'Error listing mini apps' });
    }
  }

  async function create(req: ServerRequest, res: Response): Promise<Response> {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const body = (req.body ?? {}) as TCreateMiniAppRequest;
      const miniApp = await createMiniApp(req.user.id, {
        ...body,
        files: normalizeRequestFiles(body.files) ?? {},
        tenantId: req.user.tenantId,
      });
      return res.status(201).json(serializeMiniApp(miniApp));
    } catch (error) {
      logger.error('[POST /mini-apps] Error creating mini app', error);
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Error creating mini app',
      });
    }
  }

  async function get(req: ServerRequest, res: Response): Promise<Response> {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const miniApp = await getMiniApp(req.user.id, getMiniAppId(req));
      if (!miniApp) {
        return res.status(404).json({ error: 'Mini app not found' });
      }
      return res.status(200).json(serializeMiniApp(miniApp));
    } catch (error) {
      logger.error('[GET /mini-apps/:id] Error fetching mini app', error);
      return res.status(500).json({ error: 'Error fetching mini app' });
    }
  }

  async function patch(req: ServerRequest, res: Response): Promise<Response> {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const body = (req.body ?? {}) as TUpdateMiniAppRequest;
      const miniApp = await updateMiniApp(req.user.id, getMiniAppId(req), {
        ...body,
        files: normalizeRequestFiles(body.files),
      });
      if (!miniApp) {
        return res.status(404).json({ error: 'Mini app not found' });
      }
      return res.status(200).json(serializeMiniApp(miniApp));
    } catch (error) {
      logger.error('[PATCH /mini-apps/:id] Error updating mini app', error);
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Error updating mini app',
      });
    }
  }

  async function remove(req: ServerRequest, res: Response): Promise<Response> {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const miniAppId = getMiniAppId(req);
      const result = await deleteMiniApp(req.user.id, miniAppId);
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Mini app not found' });
      }
      const response: TDeleteMiniAppResponse = { id: miniAppId, deleted: true };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[DELETE /mini-apps/:id] Error deleting mini app', error);
      return res.status(500).json({ error: 'Error deleting mini app' });
    }
  }

  return { list: list, create: create, get: get, patch: patch, delete: remove };
}

export type MiniAppHandlers = ReturnType<typeof createMiniAppHandlers>;
