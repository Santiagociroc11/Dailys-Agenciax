import mongoose, { InferSchemaType } from 'mongoose';

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: 'app_settings',
  }
);

export type AppSettingsDoc = InferSchemaType<typeof appSettingsSchema>;
export const AppSettings = mongoose.model<AppSettingsDoc>(
  'AppSettings',
  appSettingsSchema
);
