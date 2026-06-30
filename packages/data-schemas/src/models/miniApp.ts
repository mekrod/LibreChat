import { Model } from 'mongoose';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import miniAppSchema from '~/schema/miniApp';
import type { IMiniAppDocument } from '~/types';

export function createMiniAppModel(mongoose: typeof import('mongoose')): Model<IMiniAppDocument> {
  applyTenantIsolation(miniAppSchema);
  return (
    mongoose.models.MiniApp ||
    mongoose.model<IMiniAppDocument>('MiniApp', miniAppSchema, 'miniapps')
  );
}
