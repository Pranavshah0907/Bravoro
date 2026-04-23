-- Add theme_preference column to profiles for cross-device theme sync.
-- Values: 'light' | 'dark' | 'system' (default).
-- Existing RLS policies on profiles already cover this column.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system'
CHECK (theme_preference IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.profiles.theme_preference IS 'User-selected theme: light, dark, or system (follows OS preference).';
