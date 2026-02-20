import type { Model } from 'mongoose';
import {
  User,
  Client,
  Project,
  ProjectTemplate,
  Task,
  Subtask,
  Area,
  AreaUserAssignment,
  TaskWorkAssignment,
  StatusHistory,
  AppSettings,
  WorkEvent,
  WorkSession,
  AuditLog,
  PayrollPayment,
} from '../../models/index.js';

export const MODEL_MAP: Record<string, Model<unknown>> = {
  users: User as Model<unknown>,
  clients: Client as Model<unknown>,
  projects: Project as Model<unknown>,
  project_templates: ProjectTemplate as Model<unknown>,
  tasks: Task as Model<unknown>,
  subtasks: Subtask as Model<unknown>,
  areas: Area as Model<unknown>,
  area_user_assignments: AreaUserAssignment as Model<unknown>,
  task_work_assignments: TaskWorkAssignment as Model<unknown>,
  status_history: StatusHistory as Model<unknown>,
  app_settings: AppSettings as Model<unknown>,
  work_events: WorkEvent as Model<unknown>,
  work_sessions: WorkSession as Model<unknown>,
  audit_log: AuditLog as Model<unknown>,
  payroll_payments: PayrollPayment as Model<unknown>,
};

export function getModel(table: string): Model<unknown> | null {
  return MODEL_MAP[table] ?? null;
}
