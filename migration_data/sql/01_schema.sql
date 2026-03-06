-- Schema migrations (30 files)
-- Run this FIRST in the SQL editor

-- ── 20251101181616_8fc11db9-a3de-4482-91bf-528f64b675a6.sql ─────────────────────────────────────
-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create searches table to store search history
CREATE TABLE public.searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_type TEXT NOT NULL CHECK (search_type IN ('manual', 'excel')),
  company_name TEXT,
  domain TEXT,
  functions TEXT[],
  geography TEXT,
  seniority TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  result_url TEXT,
  error_message TEXT,
  excel_file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;

-- Searches policies
CREATE POLICY "Users can view own searches"
  ON public.searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own searches"
  ON public.searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own searches"
  ON public.searches FOR UPDATE
  USING (auth.uid() = user_id);

-- Create webhook_settings table
CREATE TABLE public.webhook_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  webhook_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.webhook_settings ENABLE ROW LEVEL SECURITY;

-- Webhook settings policies
CREATE POLICY "Users can view own webhook settings"
  ON public.webhook_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhook settings"
  ON public.webhook_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own webhook settings"
  ON public.webhook_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_searches_updated_at
  BEFORE UPDATE ON public.searches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_settings_updated_at
  BEFORE UPDATE ON public.webhook_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── 20251101181627_48533d67-80eb-4987-a71e-9bd104a32bc8.sql ─────────────────────────────────────
-- Fix the update_updated_at_column function to have secure search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 20251101181925_83b7bbce-d7a0-48b8-bd98-e198453873b1.sql ─────────────────────────────────────
-- Enable real-time updates for searches table
ALTER TABLE public.searches REPLICA IDENTITY FULL;

-- Add table to real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.searches;

-- ── 20251104230625_59dfd43c-20e1-4eb2-a850-860b62fd6da5.sql ─────────────────────────────────────
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add requires_password_reset column to profiles
ALTER TABLE public.profiles ADD COLUMN requires_password_reset BOOLEAN DEFAULT false;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Update profiles RLS to allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Update profiles RLS to allow admins to update all profiles
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle admin user creation trigger
CREATE OR REPLACE FUNCTION public.handle_admin_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if this is the admin email
  IF NEW.email = 'pranavshah0907@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Regular users get 'user' role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for auto role assignment
CREATE TRIGGER on_auth_user_role_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_admin_user_role();

-- ── 20251107162743_ca9ea736-4e30-4457-82b7-e5c99c32a218.sql ─────────────────────────────────────
-- Alter searches table to support multiple seniority levels and add results per function
ALTER TABLE public.searches 
  ALTER COLUMN seniority TYPE text[] USING ARRAY[seniority]::text[];

ALTER TABLE public.searches 
  ADD COLUMN results_per_function integer DEFAULT 10;

-- ── jobs table (created manually in old project, injected here) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  result_file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON public.jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage jobs"
  ON public.jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);

-- ── 20251119223020_34f3eb9a-d5cf-4771-a89b-271dfbaf08a1.sql ─────────────────────────────────────
-- Add updated_at column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_jobs_updated_at ON public.jobs;

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── Create results storage bucket (created manually in old project) ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('results', 'results', false)
ON CONFLICT (id) DO NOTHING;

-- ── 20251119223826_ce511103-7a88-4ded-ab4a-edfcac42dc8b.sql ─────────────────────────────────────
-- Drop the incorrect existing policy
DROP POLICY IF EXISTS "Users can view own result files" ON storage.objects;

-- Create correct policy: Users can download result files for their own jobs
CREATE POLICY "Users can download their job results"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'results' 
  AND auth.uid() IN (
    SELECT user_id 
    FROM public.jobs 
    WHERE id::text = split_part(name, '_result.xlsx', 1)
  )
);

-- ── 20251121075940_600ad9fd-6c3e-4334-b605-df8c305b2dc1.sql ─────────────────────────────────────
-- Drop the old constraint first
ALTER TABLE searches DROP CONSTRAINT IF EXISTS searches_search_type_check;

-- Update any existing 'excel' rows to 'bulk'
UPDATE searches SET search_type = 'bulk' WHERE search_type = 'excel';

-- Add the new constraint that allows 'manual' and 'bulk'
ALTER TABLE searches ADD CONSTRAINT searches_search_type_check 
CHECK (search_type = ANY (ARRAY['manual'::text, 'bulk'::text]));

-- ── 20251121093336_13a717f7-2550-4fb8-a978-ead8435964cf.sql ─────────────────────────────────────
-- Allow authenticated users to read files from the 'results' bucket
CREATE POLICY "Authenticated can read results files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'results');

-- ── 20251121093937_09080cab-7b09-46c3-b0d3-2298ae74d915.sql ─────────────────────────────────────
-- Add DELETE policies for user data privacy (GDPR compliance)

-- Allow users to delete their own job records
CREATE POLICY "Users can delete own jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own search history
CREATE POLICY "Users can delete own searches"
ON public.searches
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own webhook settings
CREATE POLICY "Users can delete own webhook settings"
ON public.webhook_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own profile
CREATE POLICY "Users can delete own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- ── 20251121162100_e965f2d8-f80b-41e9-9617-aa3d056207cc.sql ─────────────────────────────────────
-- Create credit_usage table to track service credits
CREATE TABLE public.credit_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  search_id UUID REFERENCES public.searches(id) ON DELETE CASCADE,
  apollo_credits INTEGER NOT NULL DEFAULT 0,
  cleon1_credits INTEGER NOT NULL DEFAULT 0,
  lusha_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own credit usage"
ON public.credit_usage
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credit usage"
ON public.credit_usage
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_credit_usage_user_id ON public.credit_usage(user_id);
CREATE INDEX idx_credit_usage_created_at ON public.credit_usage(created_at DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_credit_usage_updated_at
BEFORE UPDATE ON public.credit_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ── 20251217170526_ba71873c-2c46-4cd6-bfcd-57569e62a167.sql ─────────────────────────────────────
-- Create search_results table to store contact data per company per search
CREATE TABLE public.search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  domain TEXT,
  contact_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups by search_id
CREATE INDEX idx_search_results_search_id ON public.search_results(search_id);

-- Enable RLS
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

-- Users can view results for their own searches
CREATE POLICY "Users can view own search results"
ON public.search_results
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.searches
    WHERE searches.id = search_results.search_id
    AND searches.user_id = auth.uid()
  )
);

-- Admins can view all search results
CREATE POLICY "Admins can view all search results"
ON public.search_results
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (for edge function)
CREATE POLICY "Service role can insert search results"
ON public.search_results
FOR INSERT
WITH CHECK (true);

-- Service role can update search results
CREATE POLICY "Service role can update search results"
ON public.search_results
FOR UPDATE
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_search_results_updated_at
BEFORE UPDATE ON public.search_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ── 20251219125223_f2c0adc3-0e9a-4c08-bef1-9562232e08f1.sql ─────────────────────────────────────
-- Drop the existing check constraint and create a new one that includes bulk_people_enrichment
ALTER TABLE public.searches DROP CONSTRAINT IF EXISTS searches_search_type_check;

ALTER TABLE public.searches ADD CONSTRAINT searches_search_type_check 
CHECK (search_type IN ('manual', 'bulk', 'bulk_people_enrichment'));

-- ── 20251223172304_174c4846-0afa-4a5c-804b-3e0e91c1e2bc.sql ─────────────────────────────────────
-- Add CHECK constraints to credit_usage table for server-side validation
ALTER TABLE credit_usage
ADD CONSTRAINT check_apollo_credits 
  CHECK (apollo_credits >= 0 AND apollo_credits <= 1000000),
ADD CONSTRAINT check_cleon1_credits 
  CHECK (cleon1_credits >= 0 AND cleon1_credits <= 1000000),
ADD CONSTRAINT check_lusha_credits 
  CHECK (lusha_credits >= 0 AND lusha_credits <= 1000000);

-- ── 20251223174351_e8decf6d-18ae-4387-bc50-b6dd2722c737.sql ─────────────────────────────────────
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated can read results files" ON storage.objects;

-- Create user-scoped policy based on searches table ownership
CREATE POLICY "Users can read own search results files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'results' AND
  auth.uid() IN (
    SELECT user_id FROM public.searches 
    WHERE id::text = split_part(name, '_result.xlsx', 1)
  )
);

-- Allow admins to read all result files
CREATE POLICY "Admins can read all results files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'results' AND
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- ── 20260113204322_96ee6a26-0c71-470e-b741-7cfdc6091065.sql ─────────────────────────────────────
-- Allow service role to insert credit usage (for edge functions)
CREATE POLICY "Service role can insert credit usage"
ON public.credit_usage
FOR INSERT
WITH CHECK (true);

-- ── 20260115201312_db80d408-304e-4b5a-b9bc-c7b145d48b5b.sql ─────────────────────────────────────
-- Rename cleon1_credits column to aleads_credits in credit_usage table
ALTER TABLE public.credit_usage RENAME COLUMN cleon1_credits TO aleads_credits;

-- ── 20260116153213_a95c856a-86e8-4c53-b0f9-d3a45a2acf0e.sql ─────────────────────────────────────
-- Add enrichment limit columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS enrichment_limit INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS enrichment_used INTEGER NOT NULL DEFAULT 0;

-- Create function to atomically increment enrichment_used
CREATE OR REPLACE FUNCTION public.increment_enrichment_used(p_user_id UUID, p_count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles 
  SET enrichment_used = enrichment_used + p_count,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 20260121184132_c426ef90-58a9-43b8-86b5-1bf7d4ad7fdf.sql ─────────────────────────────────────
-- Add result_type column to search_results table for distinguishing enriched vs missing contacts
ALTER TABLE public.search_results 
ADD COLUMN result_type text DEFAULT 'enriched';

-- ── 20260123115358_191d0e7c-4399-4264-adaa-35df06067918.sql ─────────────────────────────────────
-- Add new columns to credit_usage for detailed credit tracking
ALTER TABLE public.credit_usage 
ADD COLUMN IF NOT EXISTS contacts_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS enriched_contacts_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS apollo_email_credits integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS apollo_phone_credits integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total_credits integer NOT NULL DEFAULT 0;

-- ── 20260126121143_b4610a33-bd19-48db-bb0a-4dc8a39355e7.sql ─────────────────────────────────────
-- Add admin SELECT policy to credit_usage table so admins can view all users' credit data
CREATE POLICY "Admins can view all credit usage"
ON public.credit_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- ── 20260128153833_79e867ab-e3a3-47ba-82dd-d1fd3119855e.sql ─────────────────────────────────────
-- Create api_slots table for the 10 Apollo API key slots
CREATE TABLE IF NOT EXISTS public.api_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name text NOT NULL UNIQUE,
  is_locked boolean NOT NULL DEFAULT false,
  locked_by_search_id uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  locked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Insert the 10 slots
INSERT INTO public.api_slots (slot_name) VALUES
  ('Apollo1'), ('Apollo2'), ('Apollo3'), ('Apollo4'), ('Apollo5'),
  ('Apollo6'), ('Apollo7'), ('Apollo8'), ('Apollo9'), ('Apollo10');

-- Index for fast lookup of available slots
CREATE INDEX idx_api_slots_is_locked ON public.api_slots(is_locked);

-- Enable RLS
ALTER TABLE public.api_slots ENABLE ROW LEVEL SECURITY;

-- Service role can manage slots (edge functions use service role)
CREATE POLICY "Service role full access on api_slots"
ON public.api_slots
FOR ALL
USING (true)
WITH CHECK (true);

-- Create request_queue table for pending requests when all slots are occupied
CREATE TABLE IF NOT EXISTS public.request_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  search_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamp with time zone DEFAULT now()
);

-- Index for efficient queue ordering
CREATE INDEX idx_request_queue_status_created ON public.request_queue(status, created_at);

-- Enable RLS
ALTER TABLE public.request_queue ENABLE ROW LEVEL SECURITY;

-- Service role can manage queue
CREATE POLICY "Service role full access on request_queue"
ON public.request_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Users can view their own queue entries
CREATE POLICY "Users can view own queue entries"
ON public.request_queue
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.searches
    WHERE searches.id = request_queue.search_id
    AND searches.user_id = auth.uid()
  )
);

-- Enable realtime for request_queue so users can see position updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.request_queue;

-- Create atomic slot acquisition function with race condition prevention
CREATE OR REPLACE FUNCTION public.acquire_api_slot(p_search_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_id uuid;
  v_slot_name text;
BEGIN
  -- Atomically find and lock an available slot
  -- FOR UPDATE SKIP LOCKED ensures no race conditions
  SELECT id, slot_name INTO v_slot_id, v_slot_name
  FROM api_slots
  WHERE is_locked = false
  ORDER BY slot_name
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- If no slot available, return null
  IF v_slot_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Mark slot as locked
  UPDATE api_slots 
  SET is_locked = true, 
      locked_by_search_id = p_search_id,
      locked_at = now()
  WHERE id = v_slot_id;
  
  RETURN v_slot_name;
END;
$$;

-- Create slot release function that also processes next queued item
CREATE OR REPLACE FUNCTION public.release_api_slot(p_slot_name text, p_search_id uuid)
RETURNS TABLE(
  next_search_id uuid,
  next_entry_type text,
  next_search_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item record;
  v_new_slot_name text;
BEGIN
  -- Release the slot
  UPDATE api_slots
  SET is_locked = false,
      locked_by_search_id = NULL,
      locked_at = NULL
  WHERE slot_name = p_slot_name
    AND locked_by_search_id = p_search_id;
  
  -- Check if there's a queued item
  SELECT rq.id, rq.search_id, rq.entry_type, rq.search_data
  INTO v_queue_item
  FROM request_queue rq
  WHERE rq.status = 'queued'
  ORDER BY rq.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_queue_item IS NULL THEN
    -- No queued items
    RETURN;
  END IF;
  
  -- Try to acquire a slot for the queued item
  SELECT acquire_api_slot(v_queue_item.search_id) INTO v_new_slot_name;
  
  IF v_new_slot_name IS NULL THEN
    -- Slot was taken by another process (rare edge case)
    RETURN;
  END IF;
  
  -- Update queue item status
  UPDATE request_queue
  SET status = 'processing'
  WHERE id = v_queue_item.id;
  
  -- Update search status back to processing
  UPDATE searches
  SET status = 'processing',
      updated_at = now()
  WHERE id = v_queue_item.search_id;
  
  -- Return the next item to process with the slot name embedded
  RETURN QUERY SELECT 
    v_queue_item.search_id,
    v_queue_item.entry_type,
    jsonb_set(v_queue_item.search_data, '{api_to_use}', to_jsonb(v_new_slot_name));
END;
$$;

-- Create function to get queue position
CREATE OR REPLACE FUNCTION public.get_queue_position(p_search_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COUNT(*)::integer + 1
     FROM request_queue
     WHERE status = 'queued'
       AND created_at < (
         SELECT created_at FROM request_queue WHERE search_id = p_search_id AND status = 'queued'
       )),
    0
  );
$$;

-- ── 20260130090143_556357e3-1ac6-4f0b-99ee-052f548af2a8.sql ─────────────────────────────────────
-- Delete all existing Apollo slots
DELETE FROM api_slots;

-- Insert single processing flag
INSERT INTO api_slots (slot_name, is_locked) 
VALUES ('processing', false);

-- Create acquire_processing_flag function
CREATE OR REPLACE FUNCTION public.acquire_processing_flag(p_search_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count integer;
BEGIN
  -- Atomically try to acquire the processing flag
  UPDATE api_slots 
  SET is_locked = true, 
      locked_by_search_id = p_search_id,
      locked_at = now()
  WHERE slot_name = 'processing' 
    AND is_locked = false;
  
  -- Check if we acquired it
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  RETURN v_row_count > 0;
END;
$$;

-- Create release_processing_flag function
CREATE OR REPLACE FUNCTION public.release_processing_flag(p_search_id uuid)
RETURNS TABLE(
  next_search_id uuid,
  next_entry_type text,
  next_search_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_item record;
BEGIN
  -- Release the flag
  UPDATE api_slots
  SET is_locked = false,
      locked_by_search_id = NULL,
      locked_at = NULL
  WHERE slot_name = 'processing'
    AND locked_by_search_id = p_search_id;
  
  -- Check if there's a queued item
  SELECT rq.id, rq.search_id, rq.entry_type, rq.search_data
  INTO v_queue_item
  FROM request_queue rq
  WHERE rq.status = 'queued'
  ORDER BY rq.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_queue_item IS NULL THEN
    -- No queued items, flag stays free
    RETURN;
  END IF;
  
  -- Claim the flag for the queued item
  UPDATE api_slots 
  SET is_locked = true, 
      locked_by_search_id = v_queue_item.search_id,
      locked_at = now()
  WHERE slot_name = 'processing';
  
  -- Update queue item status
  UPDATE request_queue
  SET status = 'processing'
  WHERE id = v_queue_item.id;
  
  -- Update search status back to processing
  UPDATE searches
  SET status = 'processing',
      updated_at = now()
  WHERE id = v_queue_item.search_id;
  
  -- Return the next item to process
  RETURN QUERY SELECT 
    v_queue_item.search_id,
    v_queue_item.entry_type,
    v_queue_item.search_data;
END;
$$;

-- ── 20260130115446_0e5f1541-b571-4782-be88-cebda322cbdd.sql ─────────────────────────────────────
-- Drop the existing constraint
ALTER TABLE searches DROP CONSTRAINT IF EXISTS searches_status_check;

-- Recreate with 'queued' and 'pending' statuses added
ALTER TABLE searches ADD CONSTRAINT searches_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'queued'::text, 'completed'::text, 'error'::text]));

-- ── 20260130182813_9bc08e33-3f3c-415e-8549-cdfe757dd073.sql ─────────────────────────────────────
-- Create password_reset_tokens table for forgot password flow
CREATE TABLE public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for token lookup
CREATE INDEX idx_password_reset_tokens_hash ON public.password_reset_tokens(token_hash);
CREATE INDEX idx_password_reset_tokens_email ON public.password_reset_tokens(email);

-- Enable RLS
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions use service key)
CREATE POLICY "Service role full access" 
ON public.password_reset_tokens 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- ── 20260201195753_0e2d0758-6f05-4307-ba78-241800160395.sql ─────────────────────────────────────
-- Create master_contacts table for centralized contact storage
CREATE TABLE public.master_contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    person_id TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    email_2 TEXT,
    phone_1 TEXT,
    phone_2 TEXT,
    linkedin TEXT,
    title TEXT,
    organization TEXT,
    domain TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_search_id UUID,
    source_user_id UUID
);

-- Create indexes for fast searching and deduplication
CREATE UNIQUE INDEX idx_master_contacts_person_id ON public.master_contacts(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_master_contacts_organization ON public.master_contacts(organization);
CREATE INDEX idx_master_contacts_domain ON public.master_contacts(domain);
CREATE INDEX idx_master_contacts_fallback_dedup ON public.master_contacts(first_name, last_name, organization);
CREATE INDEX idx_master_contacts_linkedin ON public.master_contacts(linkedin) WHERE linkedin IS NOT NULL;
CREATE INDEX idx_master_contacts_email ON public.master_contacts(email) WHERE email IS NOT NULL;

-- Create GIN index for full-text search on organization
CREATE INDEX idx_master_contacts_org_search ON public.master_contacts USING GIN(to_tsvector('english', COALESCE(organization, '')));

-- Enable Row Level Security
ALTER TABLE public.master_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can SELECT from master_contacts
CREATE POLICY "Admins can view all master contacts"
ON public.master_contacts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Service role can INSERT (for edge functions)
CREATE POLICY "Service role can insert master contacts"
ON public.master_contacts
FOR INSERT
WITH CHECK (true);

-- RLS Policy: Service role can UPDATE (for edge functions)
CREATE POLICY "Service role can update master contacts"
ON public.master_contacts
FOR UPDATE
USING (true);

-- ── 20260202094410_74baebcd-fcef-4a6f-ba49-d32c2ef09e27.sql ─────────────────────────────────────
-- Update release_processing_flag to DELETE queue entries instead of updating status
CREATE OR REPLACE FUNCTION public.release_processing_flag(p_search_id uuid)
 RETURNS TABLE(next_search_id uuid, next_entry_type text, next_search_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_item record;
BEGIN
  -- Release the flag
  UPDATE api_slots
  SET is_locked = false,
      locked_by_search_id = NULL,
      locked_at = NULL
  WHERE slot_name = 'processing'
    AND locked_by_search_id = p_search_id;
  
  -- Check if there's a queued item (FIFO: ORDER BY created_at ASC)
  SELECT rq.id, rq.search_id, rq.entry_type, rq.search_data
  INTO v_queue_item
  FROM request_queue rq
  WHERE rq.status = 'queued'
  ORDER BY rq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_queue_item IS NULL THEN
    -- No queued items, flag stays free
    RETURN;
  END IF;
  
  -- Claim the flag for the queued item
  UPDATE api_slots 
  SET is_locked = true, 
      locked_by_search_id = v_queue_item.search_id,
      locked_at = now()
  WHERE slot_name = 'processing';
  
  -- DELETE the queue item instead of updating status
  DELETE FROM request_queue
  WHERE id = v_queue_item.id;
  
  -- Update search status back to processing
  UPDATE searches
  SET status = 'processing',
      updated_at = now()
  WHERE id = v_queue_item.search_id;
  
  -- Return the next item to process
  RETURN QUERY SELECT 
    v_queue_item.search_id,
    v_queue_item.entry_type,
    v_queue_item.search_data;
END;
$function$;

-- Update release_api_slot to DELETE queue entries as well
CREATE OR REPLACE FUNCTION public.release_api_slot(p_slot_name text, p_search_id uuid)
 RETURNS TABLE(next_search_id uuid, next_entry_type text, next_search_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_item record;
  v_new_slot_name text;
BEGIN
  -- Release the slot
  UPDATE api_slots
  SET is_locked = false,
      locked_by_search_id = NULL,
      locked_at = NULL
  WHERE slot_name = p_slot_name
    AND locked_by_search_id = p_search_id;
  
  -- Check if there's a queued item (FIFO: ORDER BY created_at ASC)
  SELECT rq.id, rq.search_id, rq.entry_type, rq.search_data
  INTO v_queue_item
  FROM request_queue rq
  WHERE rq.status = 'queued'
  ORDER BY rq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF v_queue_item IS NULL THEN
    -- No queued items
    RETURN;
  END IF;
  
  -- Try to acquire a slot for the queued item
  SELECT acquire_api_slot(v_queue_item.search_id) INTO v_new_slot_name;
  
  IF v_new_slot_name IS NULL THEN
    -- Slot was taken by another process (rare edge case)
    RETURN;
  END IF;
  
  -- DELETE the queue item instead of updating status
  DELETE FROM request_queue
  WHERE id = v_queue_item.id;
  
  -- Update search status back to processing
  UPDATE searches
  SET status = 'processing',
      updated_at = now()
  WHERE id = v_queue_item.search_id;
  
  -- Return the next item to process with the slot name embedded
  RETURN QUERY SELECT 
    v_queue_item.search_id,
    v_queue_item.entry_type,
    jsonb_set(v_queue_item.search_data, '{api_to_use}', to_jsonb(v_new_slot_name));
END;
$function$;

-- Clean up any existing 'processing' status entries in the queue (they shouldn't be there)
DELETE FROM request_queue WHERE status = 'processing';

-- ── 20260202221019_cdf254ee-d598-455b-9306-a30a17879289.sql ─────────────────────────────────────
-- Add policy to allow users to view their own contacts from their searches
-- This ensures non-admin users can access contacts from searches they own
CREATE POLICY "Users can view their own contacts"
ON public.master_contacts
FOR SELECT
USING (
  auth.uid() = source_user_id OR
  EXISTS (
    SELECT 1 FROM searches
    WHERE searches.id = master_contacts.source_search_id
    AND searches.user_id = auth.uid()
  ) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- ── 20260205135026_d0a70429-d346-4a06-a7b6-b18e534a3d34.sql ─────────────────────────────────────
-- Fix password_reset_tokens RLS policy
-- Remove the overly permissive "Service role full access" policy that allows public SELECT
DROP POLICY IF EXISTS "Service role full access" ON public.password_reset_tokens;

-- Create separate policies for INSERT and UPDATE only (no SELECT for public)
-- Service role can insert new tokens (used by send-email edge function)
CREATE POLICY "Service role can insert tokens"
ON public.password_reset_tokens
FOR INSERT
WITH CHECK (true);

-- Service role can update tokens (to mark as used)
CREATE POLICY "Service role can update tokens"
ON public.password_reset_tokens
FOR UPDATE
USING (true);

-- No SELECT policy for anon/authenticated roles - all reads must go through edge functions
-- This prevents public enumeration of reset tokens, emails, and user IDs

-- ── 20260205141129_0c4a0dd9-9e7d-4c43-9edb-63634899066c.sql ─────────────────────────────────────
-- Fix api_slots RLS: Remove broad policy that allows all authenticated users to read
-- This table is internal state and should only be accessible via service role (edge functions)

-- Remove the overly broad policy
DROP POLICY IF EXISTS "Service role full access on api_slots" ON public.api_slots;

-- Create policy that explicitly targets service_role only
-- Note: In Postgres, policies with TO service_role only apply to that role
-- Regular authenticated/anon users will have no access (default deny)
CREATE POLICY "Service role can manage api_slots"
ON public.api_slots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Similarly fix request_queue - users can view their own entries via searches ownership check
-- but service role needs full access for queue management
DROP POLICY IF EXISTS "Service role full access on request_queue" ON public.request_queue;

-- Create policy explicitly for service_role
CREATE POLICY "Service role can manage request_queue"
ON public.request_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

