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