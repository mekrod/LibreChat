export const MINI_APP_TITLE_MAX_LENGTH = 120;
export const MINI_APP_DESCRIPTION_MAX_LENGTH = 1000;
export const MINI_APP_FILE_PATH_MAX_LENGTH = 160;
export const MINI_APP_FILE_CONTENT_MAX_LENGTH = 300_000;
export const MINI_APP_TOTAL_CONTENT_MAX_LENGTH = 1_000_000;

export type MiniAppFileMap = Record<string, string>;
export type MiniAppStoredFile = {
  path: string;
  content: string;
};
export type MiniAppFileInput = MiniAppFileMap | MiniAppStoredFile[];

export type TMiniApp = {
  _id: string;
  title: string;
  description: string;
  files: MiniAppFileMap;
  entryFile: string;
  user: string;
  conversationId?: string;
  messageId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TMiniAppSummary = Omit<TMiniApp, 'files'> & {
  fileCount: number;
};

export type TCreateMiniAppRequest = {
  title: string;
  description?: string;
  files: MiniAppFileInput;
  entryFile?: string;
  conversationId?: string;
  messageId?: string;
};

export type TUpdateMiniAppRequest = Partial<
  Pick<TCreateMiniAppRequest, 'title' | 'description' | 'files' | 'entryFile'>
>;

export type TMiniAppListRequest = {
  cursor?: string;
  limit?: number;
  search?: string;
};

export type TMiniAppListResponse = {
  miniApps: TMiniAppSummary[];
  nextCursor: string | null;
};

export type TDeleteMiniAppResponse = {
  id: string;
  deleted: true;
};
