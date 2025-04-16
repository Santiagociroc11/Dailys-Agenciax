/*
  # Create new users system

  1. Changes
    - Remove existing policies that depend on user_roles
    - Drop user_roles table
    - Create new users table with direct role management
    - Update policies for tasks and subtasks

  2. Security
    - Enable RLS on users table
    - Add policies for user access
    - Update task and subtask policies to use new role system
*/

-- First remove policies that depend on user_roles
DROP POLICY IF EXISTS "Admins can CRUD all tasks" ON tasks;
DROP POLICY IF EXISTS "Admins can CRUD all subtasks" ON subtasks;
DROP POLICY IF EXISTS "Admins can read all user data" ON users;

-- Now we can safely drop the user_roles table
DROP TABLE IF EXISTS user_roles CASCADE;

-- Create new users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Add new policies for users table
CREATE POLICY "Users can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Update task policies to use role field
CREATE POLICY "Admins can manage all tasks"
  ON tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Update subtask policies to use role field
CREATE POLICY "Admins can manage all subtasks"
  ON subtasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Create initial admin user (password: admin123)
INSERT INTO users (name, email, password, role)
VALUES ('Admin', 'admin@example.com', 'admin123', 'admin');