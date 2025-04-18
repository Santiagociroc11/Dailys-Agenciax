-- Migración para trasladar datos de daily_tasks a task_work_assignments
-- Esta migración conserva todos los datos existentes

-- 1. Primero, asegurarse de que task_work_assignments existe con la estructura correcta
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_work_assignments') THEN
        CREATE TABLE IF NOT EXISTS task_work_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            date DATE NOT NULL,
            task_id UUID NOT NULL,
            task_type VARCHAR(10) NOT NULL CHECK (task_type IN ('task', 'subtask')),
            project_id UUID REFERENCES projects(id),
            estimated_duration INTEGER NOT NULL,  -- en minutos
            actual_duration INTEGER,              -- en minutos, nulo hasta que se complete
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'in_review', 'returned', 'approved')),
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now(),
            
            -- Restricción única para evitar duplicación de una tarea por usuario y fecha
            UNIQUE (user_id, date, task_id, task_type)
        );
        
        -- Índices para mejorar el rendimiento de consultas comunes
        CREATE INDEX IF NOT EXISTS idx_task_work_assignments_user_date ON task_work_assignments(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_task_work_assignments_task ON task_work_assignments(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_work_assignments_project ON task_work_assignments(project_id);
        CREATE INDEX IF NOT EXISTS idx_task_work_assignments_status ON task_work_assignments(status);
        
        -- Trigger para actualizar el timestamp de updated_at
        CREATE OR REPLACE FUNCTION update_task_work_assignment_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        CREATE TRIGGER update_task_work_assignment_timestamp
        BEFORE UPDATE ON task_work_assignments
        FOR EACH ROW
        EXECUTE FUNCTION update_task_work_assignment_timestamp();
    END IF;
END$$;

-- 2. Migrar datos de daily_tasks a task_work_assignments
DO $$
DECLARE
    daily_record RECORD;
    task_id TEXT;
    is_subtask BOOLEAN;
    original_id UUID;
    task_duration INTEGER;
    task_project_id UUID;
BEGIN
    -- Solo proceder si la tabla daily_tasks existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_tasks') THEN
        -- Iterar por cada registro en daily_tasks
        FOR daily_record IN SELECT * FROM daily_tasks LOOP
            -- Iterar por cada tarea en el array 'tasks'
            FOREACH task_id IN ARRAY daily_record.tasks LOOP
                -- Comprobar si es una subtarea (si comienza con 'subtask-')
                is_subtask := position('subtask-' in task_id) > 0;
                
                -- Extraer el ID original sin el prefijo
                IF is_subtask THEN
                    original_id := (regexp_replace(task_id, 'subtask-', ''))::uuid;
                ELSE
                    original_id := task_id::uuid;
                END IF;
                
                -- Obtener la duración estimada y el ID del proyecto
                IF is_subtask THEN
                    -- Para subtareas
                    SELECT s.estimated_duration, t.project_id
                    INTO task_duration, task_project_id
                    FROM subtasks s
                    JOIN tasks t ON s.task_id = t.id
                    WHERE s.id = original_id;
                ELSE
                    -- Para tareas normales
                    SELECT estimated_duration, project_id
                    INTO task_duration, task_project_id
                    FROM tasks
                    WHERE id = original_id;
                END IF;
                
                -- Si no se encontró la tarea, usar valores por defecto
                IF task_duration IS NULL THEN
                    task_duration := 30; -- 30 minutos por defecto
                END IF;
                
                -- Insertar en task_work_assignments si no existe
                INSERT INTO task_work_assignments (
                    user_id, 
                    date, 
                    task_id, 
                    task_type,
                    project_id,
                    estimated_duration,
                    status,
                    created_at,
                    updated_at
                )
                SELECT 
                    daily_record.user_id,
                    daily_record.date,
                    original_id,
                    CASE WHEN is_subtask THEN 'subtask' ELSE 'task' END,
                    task_project_id,
                    task_duration,
                    'pending',
                    daily_record.created_at,
                    daily_record.updated_at
                WHERE NOT EXISTS (
                    SELECT 1 FROM task_work_assignments 
                    WHERE user_id = daily_record.user_id 
                    AND date = daily_record.date 
                    AND task_id = original_id
                    AND task_type = CASE WHEN is_subtask THEN 'subtask' ELSE 'task' END
                );
                
            END LOOP;
        END LOOP;
        
        -- 3. Crear vista para estadísticas diarias si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'daily_work_statistics') THEN
            CREATE OR REPLACE VIEW daily_work_statistics AS
            SELECT 
                user_id,
                date,
                COUNT(id) AS total_tasks,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
                SUM(estimated_duration) AS total_estimated_minutes,
                SUM(actual_duration) AS total_actual_minutes,
                SUM(CASE WHEN actual_duration IS NOT NULL THEN actual_duration ELSE 0 END) / 
                    NULLIF(SUM(CASE WHEN actual_duration IS NOT NULL THEN estimated_duration ELSE 0 END), 0) AS efficiency_ratio
            FROM task_work_assignments
            GROUP BY user_id, date
            ORDER BY date DESC;
        END IF;
    END IF;
END$$;

-- 4. Comentarios para documentar la tabla y vista
COMMENT ON TABLE task_work_assignments IS 'Seguimiento detallado de tareas asignadas para trabajo diario';
COMMENT ON COLUMN task_work_assignments.id IS 'Identificador único de la asignación';
COMMENT ON COLUMN task_work_assignments.user_id IS 'Usuario al que se asigna la tarea';
COMMENT ON COLUMN task_work_assignments.date IS 'Fecha para la que se asigna la tarea';
COMMENT ON COLUMN task_work_assignments.task_id IS 'ID de la tarea o subtarea asignada';
COMMENT ON COLUMN task_work_assignments.task_type IS 'Tipo: task o subtask';
COMMENT ON COLUMN task_work_assignments.project_id IS 'Proyecto al que pertenece la tarea';
COMMENT ON COLUMN task_work_assignments.estimated_duration IS 'Duración estimada en minutos';
COMMENT ON COLUMN task_work_assignments.actual_duration IS 'Duración real en minutos, registrada al completar';
COMMENT ON COLUMN task_work_assignments.status IS 'Estado de la tarea';
COMMENT ON COLUMN task_work_assignments.start_time IS 'Marca de tiempo cuando se inició el trabajo';
COMMENT ON COLUMN task_work_assignments.end_time IS 'Marca de tiempo cuando se terminó el trabajo';
COMMENT ON COLUMN task_work_assignments.notes IS 'Notas o comentarios sobre el trabajo';
COMMENT ON COLUMN task_work_assignments.created_at IS 'Fecha de creación del registro';
COMMENT ON COLUMN task_work_assignments.updated_at IS 'Fecha de última actualización del registro';

COMMENT ON VIEW daily_work_statistics IS 'Estadísticas diarias de trabajo por usuario';

-- Para eliminar la tabla daily_tasks, descomenta las siguientes líneas
-- cuando estés seguro de que la migración ha funcionado correctamente:
/*
DO $$
BEGIN
    -- Esperar un tiempo prudencial para que se completen otras operaciones
    PERFORM pg_sleep(2);
    
    -- Eliminar tabla daily_tasks
    DROP TABLE IF EXISTS daily_tasks;
END$$;
*/ 