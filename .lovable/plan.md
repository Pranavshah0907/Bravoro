

# Add Flag Control Parameter to save-search-results

## Understanding the Requirement

You need explicit control over the processing flag from n8n's side when calling `save-search-results`. The three options:

| Value | Behavior | Use Case |
|-------|----------|----------|
| `"release"` | Release the flag and trigger next queued item | n8n is done and ready for next |
| `"hold"` | Keep the flag locked | n8n needs more time, don't send next yet |
| `"none"` (or omit) | Don't touch the flag at all | Let `release-api-slot` handle it separately |

## New Payload Field

Add a new optional field `flag_action` to the `save-search-results` payload:

```json
{
  "search_id": "uuid",
  "companies": [...],
  "credit_counter": {...},
  "flag_action": "release"  // or "hold" or "none" or omit entirely
}
```

## Implementation

### 1. Modify `save-search-results` Edge Function

Add to the `RequestBody` interface:

```typescript
interface RequestBody {
  // ... existing fields ...
  flag_action?: 'release' | 'hold' | 'none';  // NEW
}
```

Add flag handling logic before the final return statements (both success and error paths):

```typescript
// ========== HANDLE FLAG ACTION ==========
const flagAction = bodyAny?.flag_action as string | undefined;
console.log(`[${requestId}] Flag action requested: ${flagAction || 'none (default)'}`);

if (flagAction === 'release') {
  try {
    console.log(`[${requestId}] Releasing processing flag for search ${search_id}`);
    
    const { data: nextItems, error: releaseError } = await supabase
      .rpc('release_processing_flag', { p_search_id: search_id });

    if (releaseError) {
      console.error(`[${requestId}] Error releasing flag:`, releaseError);
    } else {
      console.log(`[${requestId}] Flag released. Next items in queue:`, nextItems?.length || 0);
      
      // If there's a queued item, trigger n8n webhook
      if (nextItems && nextItems.length > 0) {
        const nextItem = nextItems[0];
        const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
        
        const n8nWebhookUrl = nextItem.next_entry_type === 'bulk_people_enrichment'
          ? 'https://n8n.srv1081444.hstgr.cloud/webhook/bulk_enrich'
          : 'https://n8n.srv1081444.hstgr.cloud/webhook/incoming_request';

        const webhookHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'type_of_entry': nextItem.next_entry_type,
        };
        if (n8nWebhookSecret) {
          webhookHeaders['x-webhook-secret'] = n8nWebhookSecret;
        }

        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: webhookHeaders,
          body: JSON.stringify(nextItem.next_search_data),
        });

        if (!response.ok) {
          console.error(`[${requestId}] Failed to trigger next queued item`);
          await supabase.from('searches').update({
            status: 'error',
            error_message: 'Failed to process queued request',
            updated_at: new Date().toISOString()
          }).eq('id', nextItem.next_search_id);
          
          await supabase.rpc('release_processing_flag', { 
            p_search_id: nextItem.next_search_id 
          });
        } else {
          console.log(`[${requestId}] Next queued item triggered successfully`);
        }
      }
    }
  } catch (flagError) {
    console.error(`[${requestId}] Flag release error:`, flagError);
  }
} else if (flagAction === 'hold') {
  console.log(`[${requestId}] Flag action is 'hold' - keeping flag locked`);
  // Do nothing - flag stays locked
} else {
  console.log(`[${requestId}] Flag action is 'none' or not specified - not touching flag`);
  // Do nothing - let release-api-slot handle it
}
```

---

## Flow Diagram with Flag Control

```text
n8n Processing Flow:
                        
Request sent to n8n (flag locked)
        |
        v
n8n processes the request
        |
        +---> [Path A] n8n calls release-api-slot mid-processing
        |         |
        |         v
        |     Flag released, next item sent
        |     (search continues independently)
        |
        +---> [Path B] n8n calls save-search-results at end
                  |
                  v
              Check flag_action parameter
                  |
         +--------+---------+--------+
         |        |         |        |
   "release"   "hold"    "none"   (omitted)
         |        |         |        |
         v        v         v        v
    Release    Keep flag   Do       Do
    flag &     locked      nothing  nothing
    trigger
    next
```

---

## n8n Payload Examples

### Example 1: Release flag after completion
```json
{
  "search_id": "uuid",
  "companies": [...],
  "credit_counter": { ... },
  "flag_action": "release"
}
```

### Example 2: Keep flag held (waiting for something else)
```json
{
  "search_id": "uuid",
  "companies": [...],
  "credit_counter": { ... },
  "flag_action": "hold"
}
```

### Example 3: Let release-api-slot handle it (default behavior)
```json
{
  "search_id": "uuid",
  "companies": [...],
  "credit_counter": { ... }
}
```

### Example 4: Error with flag release
```json
{
  "search_id": "uuid",
  "status": "error",
  "error_message": "Something went wrong",
  "flag_action": "release"
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/save-search-results/index.ts` | Add `flag_action` field to interface, add flag handling logic before return statements |

---

## Summary

- **`flag_action: "release"`** - Release the flag and trigger next queued item
- **`flag_action: "hold"`** - Keep the flag locked (explicitly do nothing)
- **`flag_action: "none"` or omit** - Don't touch the flag (default, backward compatible)

This gives you full control from n8n's side on when the queue advances!

