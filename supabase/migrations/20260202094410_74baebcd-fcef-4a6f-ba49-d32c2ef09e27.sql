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