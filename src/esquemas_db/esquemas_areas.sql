-- Tabla para almacenar las Áreas de Trabajo
CREATE TABLE IF NOT EXISTS public.areas (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT areas_pkey PRIMARY KEY (id),
  CONSTRAINT areas_name_unique UNIQUE (name)
);

-- Índice para búsquedas por nombre
CREATE INDEX IF NOT EXISTS idx_areas_name ON public.areas USING btree (name);

-- Trigger para actualizar automáticamente el timestamp de modificación
CREATE OR REPLACE FUNCTION update_areas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_areas_timestamp
BEFORE UPDATE ON public.areas
FOR EACH ROW
EXECUTE FUNCTION update_areas_timestamp();

-- Tabla de unión para la relación muchos a muchos entre usuarios y áreas
CREATE TABLE IF NOT EXISTS public.area_user_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  area_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT area_user_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT area_user_assignments_user_area_unique UNIQUE (user_id, area_id),
  CONSTRAINT area_user_assignments_user_fkey FOREIGN KEY (user_id)
    REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT area_user_assignments_area_fkey FOREIGN KEY (area_id)
    REFERENCES public.areas (id) ON DELETE CASCADE
);

-- Índices para optimizar la búsqueda de asignaciones
CREATE INDEX IF NOT EXISTS idx_area_user_user_id ON public.area_user_assignments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_area_user_area_id ON public.area_user_assignments USING btree (area_id);

-- Función para obtener todos los usuarios asignados a un área específica
CREATE OR REPLACE FUNCTION get_users_by_area(area_uuid UUID)
RETURNS TABLE (user_id UUID, user_name TEXT, user_email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name, u.email
  FROM users u
  JOIN area_user_assignments aua ON u.id = aua.user_id
  WHERE aua.area_id = area_uuid;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener todas las áreas asignadas a un usuario específico
CREATE OR REPLACE FUNCTION get_areas_by_user(user_uuid UUID)
RETURNS TABLE (area_id UUID, area_name VARCHAR, area_description TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.name, a.description
  FROM areas a
  JOIN area_user_assignments aua ON a.id = aua.area_id
  WHERE aua.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql; 