-- Migración para crear la tabla daily_tasks
-- Esta tabla guarda las tareas asignadas a un usuario para un día específico

CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  tasks TEXT[] NOT NULL, -- Array de IDs de tareas/subtareas
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  -- Restricción única para evitar duplicación para un usuario y fecha
  UNIQUE (user_id, date)
);

-- Índices para mejorar el rendimiento de consultas comunes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_daily_tasks_user') THEN
        CREATE INDEX idx_daily_tasks_user ON daily_tasks(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_daily_tasks_date') THEN
        CREATE INDEX idx_daily_tasks_date ON daily_tasks(date);
    END IF;
END$$;

-- Trigger para actualizar el timestamp de updated_at
CREATE OR REPLACE FUNCTION update_daily_tasks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Solo crear el trigger si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_daily_tasks_timestamp') THEN
        CREATE TRIGGER update_daily_tasks_timestamp
        BEFORE UPDATE ON daily_tasks
        FOR EACH ROW
        EXECUTE FUNCTION update_daily_tasks_timestamp();
    END IF;
END$$;

-- Comentarios para documentar la tabla
COMMENT ON TABLE daily_tasks IS 'Tareas diarias asignadas a usuarios';
COMMENT ON COLUMN daily_tasks.id IS 'Identificador único de la asignación diaria';
COMMENT ON COLUMN daily_tasks.user_id IS 'Usuario al que se asignan las tareas';
COMMENT ON COLUMN daily_tasks.date IS 'Fecha para la que se asignan las tareas';
COMMENT ON COLUMN daily_tasks.tasks IS 'Array de IDs de tareas y subtareas asignadas';
COMMENT ON COLUMN daily_tasks.created_at IS 'Fecha de creación del registro';
COMMENT ON COLUMN daily_tasks.updated_at IS 'Fecha de última actualización del registro'; 