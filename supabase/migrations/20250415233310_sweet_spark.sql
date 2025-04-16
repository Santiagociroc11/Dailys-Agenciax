/*
  # Initial Schema for Activity Tracking Platform

  1. New Tables
    - `users` (uses built-in auth.users for authentication)
    - `tasks`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text)
      - `start_date` (timestamptz)
      - `deadline` (timestamptz)
      - `estimated_duration` (integer, in minutes)
      - `priority` (enum: low, medium, high)
      - `is_sequential` (boolean)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references auth.users)
    - `subtasks`
      - `id` (uuid, primary key)
      - `task_id` (uuid, references tasks)
      - `title` (text)
      - `description` (text)
      - `estimated_duration` (integer, in minutes)
      - `sequence_order` (integer, for sequential subtasks)
      - `assigned_to` (uuid, references auth.users)
      - `status` (enum: pending, in_progress, completed)
      - `created_at` (timestamptz)
    - `user_roles`
      - `user_id` (uuid, references auth.users)
      - `role` (enum: admin, user)

  2. Security
    - Enable RLS on all tables
    - Add policies for admin and user access
*/

-- Create custom types
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create user_roles table
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  estimated_duration INTEGER NOT NULL, -- in minutes
  priority task_priority NOT NULL DEFAULT 'medium',
  is_sequential BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users NOT NULL
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create subtasks table
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_duration INTEGER NOT NULL, -- in minutes
  sequence_order INTEGER,
  assigned_to UUID REFERENCES auth.users NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- User roles policies
CREATE POLICY "Admins can read all user roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can read their own role"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Tasks policies
CREATE POLICY "Admins can CRUD all tasks"
  ON tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can read tasks assigned to them"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subtasks WHERE task_id = tasks.id AND assigned_to = auth.uid()
    )
  );

-- Subtasks policies
CREATE POLICY "Admins can CRUD all subtasks"
  ON subtasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can read and update their assigned subtasks"
  ON subtasks
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Users can update status of their assigned subtasks"
  ON subtasks
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());