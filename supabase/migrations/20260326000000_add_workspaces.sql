-- Create workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  company_address text,
  primary_contact_name text NOT NULL,
  primary_contact_email text,
  primary_contact_phone text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add workspace_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON public.profiles(workspace_id);

-- Enable RLS on workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Admins can manage all workspaces
CREATE POLICY "Admins can manage workspaces"
  ON public.workspaces
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Users can read their own workspace
CREATE POLICY "Users can read own workspace"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );
