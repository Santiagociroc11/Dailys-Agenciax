CREATE TABLE "public"."tasks" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "title" TEXT NOT NULL,
  "description" TEXT NULL,
  "start_date" TIMESTAMP WITH TIME ZONE NOT NULL,
  "deadline" TIMESTAMP WITH TIME ZONE NOT NULL,
  "estimated_duration" INTEGER NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'medium'::text ,
  "is_sequential" BOOLEAN NOT NULL DEFAULT false ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "created_by" UUID NOT NULL,
  "assigned_users" ARRAY NULL DEFAULT '{}'::uuid[] ,
  "project_id" UUID NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying ,
  "status_history" JSONB NULL DEFAULT '[]'::jsonb ,
  "review_comments" TEXT NULL,
  "notes" TEXT NULL,
  "feedback" JSONB NULL,
  "returned_at" TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."users" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user'::text ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "assigned_projects" ARRAY NULL DEFAULT '{}'::uuid[] ,
  "phone" TEXT NULL,
  "telegram_chat_id" TEXT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
CREATE TABLE "public"."subtasks" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "task_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NULL,
  "estimated_duration" INTEGER NOT NULL,
  "sequence_order" INTEGER NULL,
  "assigned_to" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying ,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "start_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() ,
  "deadline" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() ,
  "status_history" JSONB NULL DEFAULT '[]'::jsonb ,
  "review_comments" TEXT NULL,
  "notes" JSONB NULL DEFAULT '{}'::jsonb ,
  "feedback" JSONB NULL,
  "returned_at" TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."areas" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "updated_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "areas_name_key" UNIQUE ("name")
);
CREATE TABLE "public"."projects" ( 
  "id" UUID NOT NULL DEFAULT uuid_generate_v4() ,
  "name" TEXT NOT NULL,
  "description" TEXT NULL,
  "start_date" TIMESTAMP WITH TIME ZONE NOT NULL,
  "deadline" TIMESTAMP WITH TIME ZONE NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  "created_by" UUID NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."task_work_assignments" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "user_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "task_id" UUID NULL,
  "task_type" VARCHAR(10) NOT NULL,
  "project_id" UUID NULL,
  "estimated_duration" INTEGER NOT NULL,
  "actual_duration" INTEGER NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying ,
  "start_time" TIMESTAMP NULL,
  "end_time" TIMESTAMP NULL,
  "notes" JSONB NULL DEFAULT '[]'::jsonb ,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NULL DEFAULT now() ,
  "subtask_id" UUID NULL,
  CONSTRAINT "task_work_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_work_assignments_user_date_type_subtask_key" UNIQUE ("user_id", "date", "task_type", "subtask_id"),
  CONSTRAINT "uq_assignments_user_date_type_task_subtask" UNIQUE ("user_id", "date", "task_type", "task_id", "subtask_id"),
  CONSTRAINT "task_work_assignments_user_id_date_task_id_task_type_key" UNIQUE ("user_id", "date", "task_id", "task_type")
);
CREATE TABLE "public"."area_user_assignments" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "user_id" UUID NOT NULL,
  "area_id" UUID NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NULL DEFAULT now() ,
  CONSTRAINT "area_user_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area_user_assignments_user_id_area_id_key" UNIQUE ("user_id", "area_id")
);
CREATE TABLE "public"."status_history" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "task_id" UUID NULL,
  "subtask_id" UUID NULL,
  "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() ,
  "changed_by" UUID NULL,
  "previous_status" VARCHAR(50) NULL,
  "new_status" VARCHAR(50) NOT NULL,
  "metadata" JSONB NULL,
  CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."app_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "tasks_project_id_idx" 
ON "public"."tasks" (
  "project_id" ASC
);
CREATE INDEX "tasks_status_idx" 
ON "public"."tasks" (
  "status" ASC
);
CREATE INDEX "subtasks_status_idx" 
ON "public"."subtasks" (
  "status" ASC
);
CREATE INDEX "areas_name_idx" 
ON "public"."areas" (
  "name" ASC
);
CREATE INDEX "projects_created_at_idx" 
ON "public"."projects" (
  "created_at" ASC
);
CREATE INDEX "projects_created_by_idx" 
ON "public"."projects" (
  "created_by" ASC
);
CREATE INDEX "task_work_assignments_project_id_idx" 
ON "public"."task_work_assignments" (
  "project_id" ASC
);
CREATE INDEX "task_work_assignments_status_idx" 
ON "public"."task_work_assignments" (
  "status" ASC
);
CREATE INDEX "task_work_assignments_user_id_date_idx" 
ON "public"."task_work_assignments" (
  "user_id" ASC,
  "date" ASC
);
CREATE INDEX "task_work_assignments_task_id_idx" 
ON "public"."task_work_assignments" (
  "task_id" ASC
);
CREATE INDEX "area_user_assignments_area_id_idx" 
ON "public"."area_user_assignments" (
  "area_id" ASC
);
CREATE INDEX "area_user_assignments_user_id_idx" 
ON "public"."area_user_assignments" (
  "user_id" ASC
);
CREATE INDEX "idx_status_history_changed_at" 
ON "public"."status_history" (
  "changed_at" ASC
);
CREATE INDEX "idx_status_history_task_id" 
ON "public"."status_history" (
  "task_id" ASC
);
CREATE INDEX "idx_status_history_subtask_id" 
ON "public"."status_history" (
  "subtask_id" ASC
);
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id");
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects" ("id");
ALTER TABLE "public"."subtasks" ADD CONSTRAINT "subtasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users" ("id");
ALTER TABLE "public"."subtasks" ADD CONSTRAINT "subtasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id");
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id");
ALTER TABLE "public"."task_work_assignments" ADD CONSTRAINT "twa_project_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects" ("id");
ALTER TABLE "public"."task_work_assignments" ADD CONSTRAINT "twa_subtask_fkey" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks" ("id");
ALTER TABLE "public"."task_work_assignments" ADD CONSTRAINT "twa_task_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id");
ALTER TABLE "public"."task_work_assignments" ADD CONSTRAINT "twa_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");
ALTER TABLE "public"."area_user_assignments" ADD CONSTRAINT "aua_area_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas" ("id");
ALTER TABLE "public"."area_user_assignments" ADD CONSTRAINT "aua_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");
ALTER TABLE "public"."status_history" ADD CONSTRAINT "status_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks" ("id");
ALTER TABLE "public"."status_history" ADD CONSTRAINT "status_history_subtask_id_fkey" FOREIGN KEY ("subtask_id") REFERENCES "public"."subtasks" ("id");
ALTER TABLE "public"."status_history" ADD CONSTRAINT "status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users" ("id");
CREATE FUNCTION "public"."fix_inconsistent_assignments"() RETURNS VOID LANGUAGE PLPGSQL
AS
$$

BEGIN
  UPDATE task_work_assignments twa
    SET project_id = t.project_id
    FROM tasks t
    WHERE twa.task_id = t.id
      AND twa.task_type = 'task'
      AND twa.project_id IS DISTINCT FROM t.project_id;
  UPDATE task_work_assignments twa
    SET project_id = t.project_id
    FROM subtasks s
    JOIN tasks t ON s.task_id = t.id
    WHERE twa.task_id = s.id
      AND twa.task_type = 'subtask'
      AND twa.project_id IS DISTINCT FROM t.project_id;
END;

$$;
CREATE FUNCTION "public"."get_areas_by_user"(IN user_uuid UUID, OUT area_id UUID, OUT area_name VARCHAR, OUT area_description TEXT) RETURNS RECORD LANGUAGE PLPGSQL
AS
$$

BEGIN
  RETURN QUERY
    SELECT a.id, a.name, a.description
    FROM areas a
    JOIN area_user_assignments aua ON a.id = aua.area_id
    WHERE aua.user_id = user_uuid;
END;

$$;
CREATE FUNCTION "public"."get_users_by_area"(IN area_uuid UUID, OUT user_id UUID, OUT user_name TEXT, OUT user_email TEXT) RETURNS RECORD LANGUAGE PLPGSQL
AS
$$

BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.name as user_name,
        u.email as user_email
    FROM users u
    INNER JOIN area_user_assignments aua ON u.id = aua.user_id
    WHERE aua.area_id = area_uuid
    ORDER BY u.name;
END;

$$;
CREATE FUNCTION "public"."handle_new_user"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  INSERT INTO public.users(id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."log_status_change"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_history := OLD.status_history ||
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'changed_at', now());
  END IF;
  RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."log_status_change_attempt"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

DECLARE
    reviewer_id UUID;
    can_review BOOLEAN;
BEGIN
    -- This would be set by the application, but for now we'll skip this validation
    -- because we're doing it in the application layer
    RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."sync_task_assignment_project"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    UPDATE task_work_assignments SET project_id = NEW.project_id WHERE task_id = NEW.id AND task_type = 'task';
    UPDATE task_work_assignments SET project_id = NEW.project_id
      WHERE task_id IN (SELECT id FROM subtasks WHERE task_id = NEW.id) AND task_type = 'subtask';
  END IF;
  RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_areas_timestamp"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  NEW.updated_at = now(); RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_daily_tasks_timestamp"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  NEW.updated_at = now(); RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_task_assigned_users"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  UPDATE tasks SET assigned_users = (
    SELECT ARRAY_AGG(DISTINCT assigned_to) FROM subtasks WHERE task_id = NEW.task_id
  ) WHERE id = NEW.task_id;
  DELETE FROM task_work_assignments
    WHERE task_id = NEW.task_id AND task_type = 'task'
      AND user_id NOT IN (SELECT assigned_to FROM subtasks WHERE task_id = NEW.task_id);
  RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_task_duration"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  IF EXISTS (SELECT 1 FROM subtasks WHERE task_id = NEW.task_id) THEN
    UPDATE tasks SET estimated_duration = (
      SELECT SUM(estimated_duration) FROM subtasks WHERE task_id = NEW.task_id
    ) WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."update_task_work_assignment_timestamp"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$

BEGIN
  NEW.updated_at = now(); RETURN NEW;
END;

$$;
CREATE FUNCTION "public"."user_has_access_to_project"(IN user_id UUID, IN project_id UUID) RETURNS BOOLEAN LANGUAGE PLPGSQL
AS
$$

BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id
      AND (
        project_id = ANY(assigned_projects)
        OR EXISTS (SELECT 1 FROM projects WHERE id = project_id AND created_by = user_id)
      )
  );
END;

$$;
CREATE TRIGGER log_task_status_change BEFORE UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER sync_task_assignment_project_trigger AFTER UPDATE OF project_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION sync_task_assignment_project();
CREATE TRIGGER log_subtask_status_change BEFORE UPDATE OF status ON public.subtasks FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER update_task_assigned_users_trigger AFTER INSERT OR DELETE OR UPDATE ON public.subtasks FOR EACH ROW EXECUTE FUNCTION update_task_assigned_users();
CREATE TRIGGER update_task_duration_trigger AFTER INSERT OR DELETE OR UPDATE ON public.subtasks FOR EACH ROW EXECUTE FUNCTION update_task_duration();
CREATE OR REPLACE FUNCTION "public"."update_app_settings_timestamp"() RETURNS TRIGGER LANGUAGE PLPGSQL
AS
$$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_update_app_settings
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_app_settings_timestamp();
