-- Enable real-time updates for searches table
ALTER TABLE public.searches REPLICA IDENTITY FULL;

-- Add table to real-time publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.searches;