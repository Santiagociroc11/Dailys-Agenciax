/*
  # Asignar rol de administrador al primer usuario

  1. Cambios
    - Asignar el rol de administrador al primer usuario que se registre
    - Esto asegura que haya al menos un administrador en el sistema

  2. Seguridad
    - Solo se asigna el rol de administrador si no existe ningún otro administrador
*/

-- Insertar rol de administrador para el primer usuario
INSERT INTO user_roles (user_id, role)
SELECT 
  id as user_id,
  'admin'::user_role as role
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_roles)
LIMIT 1;