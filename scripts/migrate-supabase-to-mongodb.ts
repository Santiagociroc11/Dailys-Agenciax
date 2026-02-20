/**
 * Script de migración: Supabase (PostgreSQL) → MongoDB
 *
 * Uso: npx tsx scripts/migrate-supabase-to-mongodb.ts
 *
 * Requiere en .env:
 *   - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (origen)
 *   - MONGODB_URI (destino)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { connectDB } from '../lib/mongoose.js';
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
} from '../models/index.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toDateStr(val: string | null | undefined): string | null {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

async function migrateTable<T>(
  name: string,
  fetchFn: () => Promise<{ data: T[] | null; error: unknown }>,
  insertFn: (rows: T[]) => Promise<void>,
  transform?: (row: T) => Record<string, unknown>
) {
  console.log(`\n📦 Migrando ${name}...`);
  const { data, error } = await fetchFn();
  if (error) {
    console.error(`   ❌ Error leyendo ${name}:`, error);
    return 0;
  }
  if (!data || data.length === 0) {
    console.log(`   ⏭️  Sin datos`);
    return 0;
  }
  const rows = transform ? data.map(transform) : (data as Record<string, unknown>[]);
  await insertFn(rows);
  console.log(`   ✅ ${rows.length} registros migrados`);
  return rows.length;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  await connectDB();

  let total = 0;

  total += await migrateTable(
    'users',
    () => supabase.from('users').select('*'),
    async (rows) => {
      for (const r of rows) {
        await User.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              name: r.name,
              email: r.email,
              password: r.password,
              role: r.role ?? 'user',
              assigned_projects: r.assigned_projects ?? [],
              phone: r.phone ?? null,
              telegram_chat_id: r.telegram_chat_id ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'projects',
    () => supabase.from('projects').select('*'),
    async (rows) => {
      for (const r of rows) {
        await Project.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              name: r.name,
              description: r.description ?? null,
              start_date: toDate(r.start_date)!,
              deadline: toDate(r.deadline)!,
              created_by: r.created_by,
              is_archived: r.is_archived ?? false,
              archived_at: toDate(r.archived_at),
              restricted_access: r.restricted_access ?? false,
              client_id: r.client_id ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'areas',
    () => supabase.from('areas').select('*'),
    async (rows) => {
      for (const r of rows) {
        await Area.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              name: r.name,
              description: r.description ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'area_user_assignments',
    () => supabase.from('area_user_assignments').select('*'),
    async (rows) => {
      for (const r of rows) {
        await AreaUserAssignment.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              user_id: r.user_id,
              area_id: r.area_id,
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'tasks',
    () => supabase.from('tasks').select('*'),
    async (rows) => {
      for (const r of rows) {
        await Task.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              title: r.title,
              description: r.description ?? null,
              start_date: toDate(r.start_date)!,
              deadline: toDate(r.deadline)!,
              estimated_duration: r.estimated_duration,
              priority: r.priority ?? 'medium',
              is_sequential: r.is_sequential ?? false,
              created_by: r.created_by,
              assigned_users: r.assigned_users ?? [],
              project_id: r.project_id ?? null,
              status: r.status ?? 'pending',
              status_history: r.status_history ?? [],
              review_comments: r.review_comments ?? null,
              notes: r.notes ?? null,
              feedback: r.feedback ?? null,
              returned_at: toDate(r.returned_at),
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'subtasks',
    () => supabase.from('subtasks').select('*'),
    async (rows) => {
      for (const r of rows) {
        await Subtask.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              task_id: r.task_id,
              title: r.title,
              description: r.description ?? null,
              estimated_duration: r.estimated_duration,
              sequence_order: r.sequence_order ?? null,
              assigned_to: r.assigned_to,
              status: r.status ?? 'pending',
              start_date: toDate(r.start_date) ?? new Date(),
              deadline: toDate(r.deadline) ?? new Date(),
              status_history: r.status_history ?? [],
              review_comments: r.review_comments ?? null,
              notes: r.notes ?? {},
              feedback: r.feedback ?? null,
              returned_at: toDate(r.returned_at),
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'task_work_assignments',
    () => supabase.from('task_work_assignments').select('*'),
    async (rows) => {
      for (const r of rows) {
        await TaskWorkAssignment.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              user_id: r.user_id,
              date: typeof r.date === 'string' ? r.date.split('T')[0] : toDateStr(r.date) ?? '',
              task_id: r.task_id ?? r.subtask_id ?? '',
              task_type: r.task_type,
              project_id: r.project_id ?? null,
              subtask_id: r.subtask_id ?? null,
              estimated_duration: r.estimated_duration,
              actual_duration: r.actual_duration ?? null,
              status: r.status ?? 'pending',
              start_time: toDate(r.start_time),
              end_time: toDate(r.end_time),
              notes: r.notes ?? [],
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'status_history',
    () => supabase.from('status_history').select('*'),
    async (rows) => {
      for (const r of rows) {
        await StatusHistory.findOneAndUpdate(
          { id: r.id },
          {
            $set: {
              id: r.id,
              task_id: r.task_id ?? null,
              subtask_id: r.subtask_id ?? null,
              changed_at: toDate(r.changed_at) ?? new Date(),
              changed_by: r.changed_by ?? null,
              previous_status: r.previous_status ?? null,
              new_status: r.new_status,
              metadata: r.metadata ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  );

  total += await migrateTable(
    'app_settings',
    () => supabase.from('app_settings').select('*'),
    async (rows) => {
      for (const r of rows) {
        await AppSettings.findOneAndUpdate(
          { key: r.key },
          { $set: { key: r.key, value: r.value ?? null } },
          { upsert: true, new: true }
        );
      }
    }
  );

  const { data: workEvents } = await supabase.from('work_events').select('*');
  if (workEvents && workEvents.length > 0) {
    total += await migrateTable(
      'work_events',
      () => supabase.from('work_events').select('*'),
      async (rows) => {
        for (const r of rows) {
          await WorkEvent.findOneAndUpdate(
            { id: r.id },
            {
              $set: {
                id: r.id,
                user_id: r.user_id,
                date: typeof r.date === 'string' ? r.date.split('T')[0] : toDateStr(r.date) ?? '',
                title: r.title,
                description: r.description ?? null,
                start_time: r.start_time,
                end_time: r.end_time,
                event_type: r.event_type,
                project_id: r.project_id ?? null,
              },
            },
            { upsert: true, new: true }
          );
        }
      }
    );
  } else {
    console.log('\n📦 work_events: ⏭️  Sin datos o tabla no existe');
  }

  const { data: workSessions } = await supabase.from('work_sessions').select('*');
  if (workSessions && workSessions.length > 0) {
    total += await migrateTable(
      'work_sessions',
      () => supabase.from('work_sessions').select('*'),
      async (rows) => {
        for (const r of rows) {
          await WorkSession.findOneAndUpdate(
            { id: r.id },
            {
              $set: {
                id: r.id,
                assignment_id: r.assignment_id,
                start_time: toDate(r.start_time) ?? new Date(),
                end_time: toDate(r.end_time) ?? new Date(),
                duration_minutes: r.duration_minutes,
                notes: r.notes ?? '',
                session_type: r.session_type,
              },
            },
            { upsert: true, new: true }
          );
        }
      }
    );
  } else {
    console.log('\n📦 work_sessions: ⏭️  Sin datos o tabla no existe');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Migración completada. Total: ${total} registros`);
  console.log('='.repeat(50));
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
