-- Migración para crear la tabla task_work_assignments
-- Esta tabla proporciona un seguimiento detallado de tareas asignadas para trabajo diario

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
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_task_work_assignments_user_date') THEN
        CREATE INDEX idx_task_work_assignments_user_date ON task_work_assignments(user_id, date);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_task_work_assignments_task') THEN
        CREATE INDEX idx_task_work_assignments_task ON task_work_assignments(task_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_task_work_assignments_project') THEN
        CREATE INDEX idx_task_work_assignments_project ON task_work_assignments(project_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_task_work_assignments_status') THEN
        CREATE INDEX idx_task_work_assignments_status ON task_work_assignments(status);
    END IF;
END$$;

-- Trigger para actualizar el timestamp de updated_at
CREATE OR REPLACE FUNCTION update_task_work_assignment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Solo crear el trigger si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_work_assignment_timestamp') THEN
        CREATE TRIGGER update_task_work_assignment_timestamp
        BEFORE UPDATE ON task_work_assignments
        FOR EACH ROW
        EXECUTE FUNCTION update_task_work_assignment_timestamp();
    END IF;
END$$;

-- Vista para obtener estadísticas diarias de trabajo
DO $$
BEGIN
    DROP VIEW IF EXISTS daily_work_statistics;
    
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
END$$;

-- Comentarios para documentar la tabla
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