/*
  # Actualización de tablas para control de acceso por proyecto

  1. Modificaciones
    - Añadir columna `assigned_projects` a la tabla `users` como array de UUIDs
    - Todos los proyectos serán restrictivos por defecto (no necesita un campo extra)

  2. Funcionamiento
    - Cada usuario tendrá un array con los IDs de los proyectos a los que tiene acceso
    - Solo el creador del proyecto y los usuarios asignados pueden ver o editar el proyecto
*/

-- Añadir columna de proyectos asignados a usuarios
ALTER TABLE users
ADD COLUMN IF NOT EXISTS assigned_projects UUID[] DEFAULT '{}';

-- Actualizar todos los proyectos existentes para que los usuarios que han sido asignados 
-- a tareas de ese proyecto tengan acceso
UPDATE users u
SET assigned_projects = (
  SELECT array_agg(DISTINCT t.project_id)
  FROM subtasks s
  JOIN tasks t ON s.task_id = t.id
  WHERE s.assigned_to = u.id
  AND t.project_id IS NOT NULL
);

-- Asegurarse que los creadores de proyectos también tengan acceso a sus proyectos
UPDATE users u
SET assigned_projects = array_cat(
  COALESCE(assigned_projects, '{}'),
  ARRAY(
    SELECT p.id 
    FROM projects p 
    WHERE p.created_by = u.id
  )
);

-- Eliminar duplicados en assigned_projects
UPDATE users
SET assigned_projects = ARRAY(
  SELECT DISTINCT unnest
  FROM unnest(assigned_projects) AS unnest
  WHERE unnest IS NOT NULL
);

-- Añadir nuevas funciones para facilitar las comprobaciones de acceso
CREATE OR REPLACE FUNCTION user_has_access_to_project(user_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id
    AND (
      project_id = ANY(assigned_projects)
      OR EXISTS (
        SELECT 1 FROM projects
        WHERE id = project_id
        AND created_by = user_id
      )
    )
  );
END;
$$ LANGUAGE plpgsql; 