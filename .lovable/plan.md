

# Simplified Single-Flag Queue System Implementation

## Summary

Replace the 10-slot Apollo system with a single processing flag. When a request is made, if the flag is "free" (0), the request proceeds immediately. If "occupied" (1), it goes into the queue. n8n will call back when ready for the next request to release the flag.

## What Changes

### Database Changes

**1. Modify `api_slots` table data:**
- Delete all 10 Apollo slots
- Insert a single row with `slot_name = 'processing'`

**2. Create new function `acquire_processing_flag`:**
- Simpler logic - just check if the single flag is available
- Returns boolean (true = acquired, false = busy)

**3. Create new function `release_processing_flag`:**
- Takes only `p_search_id` (no slot_name needed)
- Releases the flag and checks queue for next item
- If queue has items, claims flag for next and returns its data

**4. Keep existing (no changes):**
- `request_queue` table - already works perfectly
- `get_queue_position` function - already works for position display

### Edge Function Changes

**1. `trigger-n8n-webhook` (modify):**
- Change from `acquire_api_slot` to `acquire_processing_flag`
- Remove `api_to_use` from payload sent to n8n
- Remove slot release on failure (now uses search_id only)
- Remove `slot_used` from response

**2. `release-api-slot` (modify):**
- Simplify payload validation - only needs `search_id`
- Change from `release_api_slot` to `release_processing_flag`
- Remove `slot_name` handling
- Update response to not include `slot_released`

### Frontend Changes

**None required!** The frontend already:
- Handles "queued" status with position display
- Uses real-time updates for queue position
- Shows "In Queue" badge in Results.tsx

---

## Technical Details

### New Database Function: `acquire_processing_flag`

```sql
CREATE OR REPLACE FUNCTION public.acquire_processing_flag(p_search_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  -- Atomically try to acquire the processing flag
  UPDATE api_slots 
  SET is_locked = true, 
      locked_by_search_id = p_search_id,
      locked_at = now()
  WHERE slot_name = 'processing' 
    AND is_locked = false;
  
  -- Check if we acquired it
  GET DIAGNOSTICS v_acquired = ROW_COUNT;
  
  RETURN v_acquired > 0;
END;
$$;
```

### New Database Function: `release_processing_flag`

```sql
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
```

---

## n8n Integration Changes

### What n8n receives (simplified - NO api_to_use):

```json
{
  "search_id": "uuid",
  "user_email": "user@example.com",
  "enrichment_remaining": 500,
  "enrichment_limit": 1000,
  "data": { ... }
}
```

### What n8n sends back (simplified - NO slot_name):

```
POST https://okiragtncugfnuetjoqt.supabase.co/functions/v1/release-api-slot
Headers:
  x-webhook-secret: [N8N_WEBHOOK_SECRET]
  Content-Type: application/json
Body:
{
  "search_id": "uuid-of-search-that-is-ready-for-next"
}
```

This can be called **mid-processing** when n8n is ready to accept the next request.

---

## Flow Diagram

```text
Request comes in
       |
       v
Is processing flag free?
       |
  +----+----+
  |         |
 YES        NO
  |         |
  v         v
Set flag   Add to request_queue
to 1       Set search status = "queued"
  |         |
  v         v
Send to    Return success
n8n        (queued: true)
  |
  v
n8n calls release-api-slot
when ready for next
       |
       v
Is queue empty?
       |
  +----+----+
  |         |
 YES        NO
  |         |
  v         v
Set flag   Keep flag = 1
to 0       Send next queued item to n8n
(free)     Update search status to "processing"
```

---

## Files to Modify

| File | Action | Changes |
|------|--------|---------|
| Database Migration | Create | Delete Apollo slots, insert single flag, create new functions |
| `trigger-n8n-webhook/index.ts` | Modify | Use `acquire_processing_flag`, remove `api_to_use` |
| `release-api-slot/index.ts` | Modify | Use `release_processing_flag`, remove `slot_name` |

### Files NOT Changed (reused as-is):
- `ProcessingStatus.tsx` - Already handles queued status
- `Results.tsx` - Already has "In Queue" badge
- `ManualForm.tsx` - Already has queued type
- `request_queue` table - Already exists
- `get_queue_position` function - Already works

---

## Credit Efficiency

- **Reusing**: `request_queue` table, `get_queue_position` function, all frontend queue handling
- **Modifying**: 2 edge functions (simplifying ~50 lines total)
- **Creating**: 1 small migration (delete/insert + 2 new functions)
- **No frontend changes needed**

---

## Current State

The database currently has:
- 10 Apollo slots (5 locked, 5 free)
- Empty request_queue table

After implementation:
- 1 processing flag (initially unlocked)
- Same request_queue table (ready to use)

