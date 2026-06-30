import { Schema } from 'mongoose';
import {
  MINI_APP_TITLE_MAX_LENGTH,
  MINI_APP_FILE_PATH_MAX_LENGTH,
  MINI_APP_DESCRIPTION_MAX_LENGTH,
  MINI_APP_FILE_CONTENT_MAX_LENGTH,
} from 'librechat-data-provider';
import type { IMiniAppDocument } from '~/types';

const miniAppSchema = new Schema<IMiniAppDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: MINI_APP_TITLE_MAX_LENGTH,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: MINI_APP_DESCRIPTION_MAX_LENGTH,
    },
    files: [
      {
        _id: false,
        path: {
          type: String,
          required: true,
          maxlength: MINI_APP_FILE_PATH_MAX_LENGTH,
        },
        content: {
          type: String,
          required: true,
          maxlength: MINI_APP_FILE_CONTENT_MAX_LENGTH,
        },
      },
    ],
    entryFile: {
      type: String,
      required: true,
      maxlength: MINI_APP_FILE_PATH_MAX_LENGTH,
      default: 'src/App.jsx',
    },
    user: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
    messageId: {
      type: String,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

miniAppSchema.index({ user: 1, updatedAt: -1, _id: -1 });
miniAppSchema.index({ user: 1, title: 1, _id: 1 });

export default miniAppSchema;
