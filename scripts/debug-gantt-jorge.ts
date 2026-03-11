import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function debug() {
  const startDate = '2026-03-09';
  const endDate = '2026-03-15';
  
  const startISO = new Date(startDate + 'T00:00:00').toISOString();
  const endISO = new Date(endDate + 'T23:59:59.999').toISOString();

  console.log('--- BUSCANDO USUARIO JORGE ---');
  const { data: users } = await supabase.from('users').select('id, name').ilike('name', '%Jorge%');
  if (!users || users.length === 0) {
    console.log('No se encontró a Jorge');
    return;
  }
  const jorge = users[0];
  console.log(`Usuario: ${jorge.name} (${jorge.id})`);

  console.log('\n--- ASIGNACIONES DE LA SEMANA ---');
  const { data: assignments } = await supabase
    .from('task_work_assignments')
    .select('id, task_id, subtask_id, task_type, date, actual_duration')
    .eq('user_id', jorge.id)
    .gte('date', startDate)
    .lte('date', endDate);

  assignments?.forEach(a => {
    const taskKey = `${a.task_type}-${a.task_type === 'subtask' ? a.subtask_id : a.task_id}`;
    console.log(`Assignment: ${a.id} | Date: ${a.date} | TaskKey: ${taskKey} | ActualDur: ${a.actual_duration}`);
  });

  console.log('\n--- WORK SESSIONS DE LA SEMANA ---');
  const { data: workSessions, error: wsError } = await supabase
    .from('work_sessions')
    .select(`
      id, assignment_id, duration_minutes, created_at,
      task_work_assignments!inner(id, user_id, task_id, subtask_id, task_type, date)
    `)
    .eq('task_work_assignments.user_id', jorge.id)
    .gte('created_at', startISO)
    .lte('created_at', endISO);

  if (wsError) console.error('Error fetching work sessions:', wsError);

  workSessions?.forEach(s => {
    const assign = s.task_work_assignments;
    const taskKey = `${assign.task_type}-${assign.task_type === 'subtask' ? assign.subtask_id : assign.task_id}`;
    const sDate = s.created_at ? format(new Date(s.created_at), 'yyyy-MM-dd') : 'no-date';
    console.log(`Session: ${s.id} | Assign: ${s.assignment_id} | TaskKey: ${taskKey} | Date: ${sDate} | Duration: ${s.duration_minutes}`);
  });
}

debug();
