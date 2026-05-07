-- Without REPLICA IDENTITY FULL, DELETE events on a realtime publication
-- only carry the primary key. Our useCrmPushes hook listens with a
-- `search_id=eq.X` filter and reads `bravoro_record_id` off the deleted
-- row to know which entry in its Map to remove — both fields require the
-- full row to be present in the WAL.
ALTER TABLE public.crm_pushes REPLICA IDENTITY FULL;
