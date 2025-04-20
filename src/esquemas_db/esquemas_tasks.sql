create table public.subtasks (
  id uuid not null default gen_random_uuid (),
  task_id uuid not null,
  title text not null,
  description text null,
  estimated_duration integer not null,
  sequence_order integer null,
  assigned_to uuid not null,
  status character varying(20) not null default 'pending'::task_status,
  created_at timestamp with time zone null default now(),
  start_date timestamp with time zone not null default now(),
  deadline timestamp with time zone not null default now(),
  constraint subtasks_pkey primary key (id),
  constraint subtasks_assigned_to_fkey foreign KEY (assigned_to) references users (id),
  constraint subtasks_task_id_fkey foreign KEY (task_id) references tasks (id)
) TABLESPACE pg_default;

create index IF not exists subtasks_status_idx on public.subtasks using btree (status) TABLESPACE pg_default;

create trigger update_task_assigned_users_trigger
after INSERT
or DELETE
or
update on subtasks for EACH row
execute FUNCTION update_task_assigned_users ();

create trigger update_task_duration_trigger
after INSERT
or DELETE
or
update on subtasks for EACH row
execute FUNCTION update_task_duration ();



create table public.task_work_assignments (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  date date not null,
  task_id uuid not null,
  task_type character varying(10) not null,
  project_id uuid null,
  estimated_duration integer not null,
  actual_duration integer null,
  status character varying(20) not null default 'pending'::character varying,
  start_time timestamp without time zone null,
  end_time timestamp without time zone null,
  notes text null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  constraint task_work_assignments_pkey primary key (id),
  constraint task_work_assignments_user_id_date_task_id_task_type_key unique (user_id, date, task_id, task_type),
  constraint task_work_assignments_project_id_fkey foreign KEY (project_id) references projects (id),
  constraint task_work_assignments_user_id_fkey foreign KEY (user_id) references users (id),
  constraint task_work_assignments_task_type_check check (
    (
      (task_type)::text = any (
        (
          array[
            'task'::character varying,
            'subtask'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_task_work_assignments_user_date on public.task_work_assignments using btree (user_id, date) TABLESPACE pg_default;

create index IF not exists idx_task_work_assignments_task on public.task_work_assignments using btree (task_id) TABLESPACE pg_default;

create index IF not exists idx_task_work_assignments_project on public.task_work_assignments using btree (project_id) TABLESPACE pg_default;

create index IF not exists idx_task_work_assignments_status on public.task_work_assignments using btree (status) TABLESPACE pg_default;

create trigger update_task_work_assignment_timestamp BEFORE
update on task_work_assignments for EACH row
execute FUNCTION update_task_work_assignment_timestamp ();


create table public.tasks (
  id uuid not null default gen_random_uuid (),
  title text not null,
  description text null,
  start_date timestamp with time zone not null,
  deadline timestamp with time zone not null,
  estimated_duration integer not null,
  priority public.task_priority not null default 'medium'::task_priority,
  is_sequential boolean not null default false,
  created_at timestamp with time zone null default now(),
  created_by uuid not null,
  assigned_users uuid[] null default '{}'::uuid[],
  project_id uuid null,
  status character varying(20) not null default 'pending'::character varying,
  constraint tasks_pkey primary key (id),
  constraint tasks_created_by_fkey foreign KEY (created_by) references users (id),
  constraint tasks_project_id_fkey foreign KEY (project_id) references projects (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists tasks_project_id_idx on public.tasks using btree (project_id) TABLESPACE pg_default;

create index IF not exists tasks_status_idx on public.tasks using btree (status) TABLESPACE pg_default;
