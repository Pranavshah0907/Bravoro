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