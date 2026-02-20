import { generateUUID } from '../../lib/uuid.js';

export const idField = {
  id: {
    type: String,
    default: () => generateUUID(),
    unique: true,
    required: true,
  },
};
