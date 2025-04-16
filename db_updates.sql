-- Añadir campo status a la tabla tasks
ALTER TABLE tasks 
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending' 
CHECK (status IN ('pending', 'assigned', 'blocked', 'completed', 'in_review', 'returned', 'approved'));

-- Actualizar el tipo de campo status en la tabla subtasks
ALTER TABLE subtasks
DROP CONSTRAINT IF EXISTS subtasks_status_check;

ALTER TABLE subtasks 
ALTER COLUMN status TYPE VARCHAR(20);

ALTER TABLE subtasks
ADD CONSTRAINT subtasks_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'in_review', 'returned', 'approved'));

-- Migrar los valores existentes de status en subtasks
UPDATE subtasks SET status = 'assigned' WHERE status = 'in_progress';

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS subtasks_status_idx ON subtasks(status); 