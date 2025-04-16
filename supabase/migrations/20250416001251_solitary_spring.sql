/*
  # Habilitar RLS y ajustar políticas

  1. Cambios
    - Habilitar RLS en todas las tablas
    - Actualizar políticas para permitir a los usuarios ver y actualizar sus tareas asignadas
    - Permitir a los administradores gestionar todas las tareas y subtareas

  2. Seguridad
    - Los usuarios solo pueden ver y actualizar sus propias tareas asignadas
    - Los administradores tienen acceso completo a todas las tareas
*/

-- Habilitar RLS en todas las tablas
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Políticas para tareas
CREATE POLICY "Los usuarios pueden ver tareas asignadas a ellos a través de subtareas"
  ON tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subtasks 
      WHERE subtasks.task_id = tasks.id 
      AND subtasks.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Los administradores pueden gestionar todas las tareas"
  ON tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Políticas para subtareas
CREATE POLICY "Los usuarios pueden ver y actualizar sus subtareas asignadas"
  ON subtasks FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Los usuarios pueden actualizar el estado de sus subtareas"
  ON subtasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "Los administradores pueden gestionar todas las subtareas"
  ON subtasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Políticas para roles de usuario
CREATE POLICY "Los usuarios pueden ver su propio rol"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Los administradores pueden gestionar roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur2
      WHERE ur2.user_id = auth.uid()
      AND ur2.role = 'admin'
    )
  );