/*
  # Complete Database Recreation
  
  1. Tables
    - users: Basic user management without auth
    - tasks: Main tasks table
    - subtasks: Subtasks linked to main tasks
  
  2. Enums
    - task_priority: low, medium, high
    - task_status: pending, in_progress, completed
  
  3. Security
    - Basic RLS policies for data access
*/

-- Drop existing tables and types
DROP TABLE IF EXISTS subtasks CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TYPE IF EXISTS task_priority CASCADE;
DROP TYPE IF EXISTS task_status CASCADE;

-- Create enums
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create users table
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

-- Create tasks table
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  start_date timestamptz NOT NULL,
  deadline timestamptz NOT NULL,
  estimated_duration integer NOT NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  is_sequential boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

-- Create subtasks table
CREATE TABLE subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id),
  title text NOT NULL,
  description text,
  estimated_duration integer NOT NULL,
  sequence_order integer,
  assigned_to uuid NOT NULL REFERENCES users(id),
  status task_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read all users"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  USING (id = (SELECT id FROM users WHERE id = users.id AND email = current_setting('request.jwt.claims')::json->>'email'))
  WITH CHECK (id = (SELECT id FROM users WHERE id = users.id AND email = current_setting('request.jwt.claims')::json->>'email'));

-- Tasks policies
CREATE POLICY "Users can read their assigned tasks"
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subtasks 
      WHERE subtasks.task_id = tasks.id 
      AND subtasks.assigned_to = (
        SELECT id FROM users 
        WHERE email = current_setting('request.jwt.claims')::json->>'email'
      )
    )
    OR
    created_by = (
      SELECT id FROM users 
      WHERE email = current_setting('request.jwt.claims')::json->>'email'
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (
        SELECT id FROM users 
        WHERE email = current_setting('request.jwt.claims')::json->>'email'
      )
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage all tasks"
  ON tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (
        SELECT id FROM users 
        WHERE email = current_setting('request.jwt.claims')::json->>'email'
      )
      AND users.role = 'admin'
    )
  );

-- Subtasks policies
CREATE POLICY "Users can read their assigned subtasks"
  ON subtasks FOR SELECT
  USING (
    assigned_to = (
      SELECT id FROM users 
      WHERE email = current_setting('request.jwt.claims')::json->>'email'
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (
        SELECT id FROM users 
        WHERE email = current_setting('request.jwt.claims')::json->>'email'
      )
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can update their assigned subtasks"
  ON subtasks FOR UPDATE
  USING (
    assigned_to = (
      SELECT id FROM users 
      WHERE email = current_setting('request.jwt.claims')::json->>'email'
    )
  )
  WITH CHECK (
    assigned_to = (
      SELECT id FROM users 
      WHERE email = current_setting('request.jwt.claims')::json->>'email'
    )
  );

CREATE POLICY "Admins can manage all subtasks"
  ON subtasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (
        SELECT id FROM users 
        WHERE email = current_setting('request.jwt.claims')::json->>'email'
      )
      AND users.role = 'admin'
    )
  );

-- Create initial admin user
INSERT INTO users (name, email, password, role)
VALUES ('Admin', 'admin@example.com', 'admin123', 'admin');