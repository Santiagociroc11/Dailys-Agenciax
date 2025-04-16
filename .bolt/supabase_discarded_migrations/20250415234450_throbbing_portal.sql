/*
  # Asignar rol de administrador al primer usuario

  1. Cambios
    - Crear función que asigna el rol de administrador al primer usuario
    - Crear trigger que ejecuta la función cuando se crea un nuevo usuario

  2. Seguridad
    - La función se ejecuta con privilegios de seguridad definer
    - Solo se asigna el rol de administrador si no existe ningún otro usuario con rol de administrador
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE role = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();