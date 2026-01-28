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