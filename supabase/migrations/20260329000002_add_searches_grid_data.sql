-- Add grid_data to searches so bulk-search rows can be reloaded from "My Sheets"
ALTER TABLE searches ADD COLUMN IF NOT EXISTS grid_data JSONB;
