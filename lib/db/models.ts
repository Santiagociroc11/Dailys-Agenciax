import type { Model } from 'mongoose';
import {
  User,
  Project,
  Task,
  Subtask,
  Area,
  AreaUserAssignment,
  TaskWorkAssignment,
  StatusHistory,
  AppSettings,
  WorkEvent,
  WorkSession,
} from '../../models/index.js';

export const MODEL_MAP: Record<string, Model<unknown>> = {
  users: User as Model<unknown>,
  projects: Project as Model<unknown>,
  tasks: Task as Model<unknown>,
  subtasks: Subtask as Model<unknown>,
  areas: Area as Model<unknown>,
  area_user_assignments: AreaUserAssignment as Model<unknown>,
  task_work_assignments: TaskWorkAssignment as Model<unknown>,
  status_history: StatusHistory as Model<unknown>,
  app_settings: AppSettings as Model<unknown>,
  work_events: WorkEvent as Model<unknown>,
  work_sessions: WorkSession as Model<unknown>,
};

export function getModel(table: string): Model<unknown> | null {
  return MODEL_MAP[table] ?? null;
}
