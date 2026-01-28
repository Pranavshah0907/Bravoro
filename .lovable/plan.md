

# API Slot Queuing System - Implementation Plan

## Overview

This plan implements a robust 10-slot resource locking system (Apollo1 through Apollo10) with PostgreSQL atomic row-level locking to handle concurrent requests without conflicts. The system uses `SELECT ... FOR UPDATE SKIP LOCKED` to guarantee that even requests arriving at the exact same millisecond will never acquire the same slot.

## Architecture

```text
                         Request Flow
                              |
                              v
                   +---------------------+
                   | Frontend submits    |
                   | search with status  |
                   | "processing"        |
                   +---------------------+
                              |
                              v
                   +---------------------+
                   | trigger-n8n-webhook |
                   | attempts to acquire |
                   | slot using atomic   |
                   | database function   |
                   +---------------------+
                         |         |
               Slot acquired    No slot free
                         |         |
                         v         v
                +------------+  +-----------------+
                | Update     |  | Update search   |
                | search to  |  | status to       |
                | "processing"|  | "queued"        |
                | Send to n8n |  | Add to queue    |
                | with api_   |  | table           |
                | to_use     |  +-----------------+
                +------------+          |
                                        v
                                +-----------------+
                                | Realtime shows  |
                                | "In Queue"      |
                                | with position   |
                                +-----------------+

                    Release Flow (from n8n)
                              |
                              v
                   +---------------------+
                   | release-api-slot    |
                   | edge function       |
                   +---------------------+
                              |
                              v
                   +---------------------+
                   | 1. Release the slot |
                   | 2. Check queue for  |
                   |    pending requests |
                   | 3. If queue empty:  |
                   |    slot stays free  |
                   | 4. If queue has     |
                   |    items: claim for |
                   |    next request,    |
                   |    send to n8n      |
                   +---------------------+
```

## Race Condition Prevention

PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` provides hardware-level guarantee:

1. Transaction A locks row for `Apollo1`
2. Transaction B's query skips locked rows, gets `Apollo2`
3. No conflicts possible, even at nanosecond timing

If all 10 slots are locked:
- Query returns no rows
- Request is added to the queue table
- Search status is updated to "queued"
- User sees queue position in real-time

---

## Database Changes

### New Table: `api_slots`

Stores the 10 API key slots and their lock status.

```sql
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

-- Index for fast lookup
CREATE INDEX idx_api_slots_is_locked ON public.api_slots(is_locked);

-- Enable RLS
ALTER TABLE public.api_slots ENABLE ROW LEVEL SECURITY;

-- Service role can manage slots
CREATE POLICY "Service role full access"
ON public.api_slots
FOR ALL
USING (true)
WITH CHECK (true);
```

### New Table: `request_queue`

Stores pending requests when all slots are occupied.

```sql
CREATE TABLE IF NOT EXISTS public.request_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  search_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamp with time zone DEFAULT now()
);

-- Index for queue ordering
CREATE INDEX idx_request_queue_status_created ON public.request_queue(status, created_at);

-- Enable RLS
ALTER TABLE public.request_queue ENABLE ROW LEVEL SECURITY;

-- Service role can manage queue
CREATE POLICY "Service role full access"
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
```

### Database Function: `acquire_api_slot`

Atomic slot acquisition with race condition prevention.

```sql
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
```

### Database Function: `release_api_slot`

Releases a slot and returns next queued item if any.

```sql
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
```

### Database Function: `get_queue_position`

Returns a user's position in the queue.

```sql
CREATE OR REPLACE FUNCTION public.get_queue_position(p_search_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer + 1
  FROM request_queue
  WHERE status = 'queued'
    AND created_at < (
      SELECT created_at FROM request_queue WHERE search_id = p_search_id
    );
$$;
```

### Modify `searches` Table

Add "queued" as a valid status by updating the places that check status.

---

## Edge Function Changes

### Modified: `trigger-n8n-webhook`

Updated to attempt slot acquisition before sending to n8n.

**Key Changes:**
1. Call `acquire_api_slot` RPC before sending request
2. If slot acquired: add `api_to_use` to payload, send to n8n
3. If no slot: create queue entry, update search status to "queued"
4. Return success immediately (non-blocking for user)

**New Payload Field:**
```json
{
  "search_id": "xxx",
  "user_email": "user@example.com",
  "api_to_use": "Apollo3",
  "enrichment_remaining": 500,
  "data": { ... }
}
```

### New: `release-api-slot`

Endpoint for n8n to call when processing completes.

**Payload from n8n:**
```json
{
  "slot_name": "Apollo3",
  "search_id": "uuid-of-completed-search"
}
```

**Logic:**
1. Validate webhook secret
2. Call `release_api_slot` database function
3. If queue has pending items, automatically process next one
4. If next item exists, send it to n8n webhook with acquired slot
5. Return success

---

## Frontend Changes

### Modified: `ProcessingStatus.tsx`

Add support for "queued" status with queue position display.

**New Status Display:**
- Show queue icon
- Display "In Queue - Position X"
- Real-time position updates via Supabase Realtime

### Modified: `Results.tsx`

Update `getStatusBadge` function to include "queued" status.

**New Badge:**
```tsx
case "queued":
  return (
    <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 font-medium">
      In Queue
    </Badge>
  );
```

### Modified: `ManualForm.tsx`, `ExcelUpload.tsx`, `BulkPeopleEnrichment.tsx`

Update `processingStatus` type to include "queued".

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Database Migration | Create | Create `api_slots`, `request_queue` tables and functions |
| `supabase/functions/trigger-n8n-webhook/index.ts` | Modify | Add slot acquisition logic |
| `supabase/functions/release-api-slot/index.ts` | Create | New endpoint for n8n callbacks |
| `supabase/config.toml` | Modify | Add release-api-slot function |
| `src/components/ProcessingStatus.tsx` | Modify | Add "queued" status with position |
| `src/pages/Results.tsx` | Modify | Add "queued" status badge |
| `src/components/ManualForm.tsx` | Modify | Update processingStatus type |
| `src/components/ExcelUpload.tsx` | Modify | Update for queued state |
| `src/components/BulkPeopleEnrichment.tsx` | Modify | Update for queued state |
| `src/integrations/supabase/types.ts` | Auto-updated | New tables reflected |

---

## n8n Integration Requirements

**What n8n receives (new field in payload):**
```json
{
  "search_id": "uuid",
  "user_email": "user@example.com",
  "api_to_use": "Apollo3",
  "enrichment_remaining": 500,
  "enrichment_limit": 1000,
  "data": { ... }
}
```

**What n8n must send back (new endpoint to call when done):**
```
POST https://okiragtncugfnuetjoqt.supabase.co/functions/v1/release-api-slot
Headers:
  x-webhook-secret: [N8N_WEBHOOK_SECRET]
  Content-Type: application/json
Body:
{
  "slot_name": "Apollo3",
  "search_id": "uuid-of-completed-search"
}
```

This call should be made after n8n has finished processing (either success or error), so the slot can be released for the next request.

---

## Technical Details

### Slot Acquisition in Edge Function

```typescript
// Attempt to acquire a slot atomically
const { data: slotName, error: slotError } = await supabase
  .rpc('acquire_api_slot', { p_search_id: searchId });

if (slotError) {
  console.error(`[${requestId}] Slot acquisition error:`, slotError);
  throw slotError;
}

if (!slotName) {
  // No slot available - add to queue
  console.log(`[${requestId}] No slot available, adding to queue`);
  
  const { error: queueError } = await supabase
    .from('request_queue')
    .insert({
      search_id: searchId,
      entry_type: entryType,
      search_data: payloadToSend,
      status: 'queued'
    });
  
  if (queueError) throw queueError;
  
  // Update search status to queued
  await supabase
    .from('searches')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', searchId);
  
  return new Response(
    JSON.stringify({ success: true, queued: true, request_id: requestId }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Slot acquired - add to payload
payloadToSend.api_to_use = slotName;
console.log(`[${requestId}] Acquired slot: ${slotName}`);
```

### Queue Position Realtime Updates

The frontend subscribes to changes on the `request_queue` table to get real-time position updates:

```typescript
// Subscribe to queue changes
const queueChannel = supabase
  .channel('queue-updates')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'request_queue',
    },
    async () => {
      // Recalculate position when queue changes
      const { data } = await supabase.rpc('get_queue_position', { p_search_id: searchId });
      setQueuePosition(data);
    }
  )
  .subscribe();
```

---

## Security Considerations

1. **Webhook Secret Validation**: `release-api-slot` validates the `x-webhook-secret` header
2. **Slot Ownership**: Only the search that locked a slot can release it (verified by `locked_by_search_id`)
3. **RLS Policies**: Users can only see their own queue entries
4. **Service Role**: All slot management uses service role key for atomic operations

---

## Summary

1. **Create** `api_slots` table with 10 slots (Apollo1-Apollo10)
2. **Create** `request_queue` table for pending requests
3. **Create** database functions for atomic slot operations
4. **Modify** `trigger-n8n-webhook` to acquire slots or queue requests
5. **Create** `release-api-slot` edge function for n8n callbacks
6. **Update** frontend components to show "queued" status with position
7. **n8n** must call `release-api-slot` when done processing

This guarantees no two requests ever get the same slot, even under heavy concurrent load.

