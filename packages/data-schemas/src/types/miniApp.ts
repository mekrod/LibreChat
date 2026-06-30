import type { Document } from 'mongoose';

export type MiniAppFileMap = Record<string, string>;
export type MiniAppStoredFile = {
  path: string;
  content: string;
};
export type MiniAppFiles = MiniAppFileMap | MiniAppStoredFile[];

export interface IMiniApp {
  title: string;
  description: string;
  files: MiniAppFiles;
  entryFile: string;
  user: string;
  conversationId?: string;
  messageId?: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IMiniAppDocument = IMiniApp & Document;
