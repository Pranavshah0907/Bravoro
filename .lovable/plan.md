
## Fix UTF-8 Encoding for n8n Webhook Requests

### Problem
German umlauts (e.g., "u") are arriving as mojibake ("Ã¼") in n8n because the `Content-Type` header lacks an explicit charset declaration.

### Solution
Update the `Content-Type` header to `application/json; charset=utf-8` in all outbound webhook calls across two edge functions that send data to n8n.

### Files to Change

**1. `supabase/functions/trigger-n8n-webhook/index.ts`**
Two locations where headers are built for the n8n fetch call:
- Line 207: Change `'Content-Type': 'application/json'` to `'application/json; charset=utf-8'` (direct send path)

**2. `supabase/functions/release-api-slot/index.ts`**
One location where queued items are forwarded to n8n:
- Line 85: Change `'Content-Type': 'application/json'` to `'application/json; charset=utf-8'` (queue forwarding path)

### Why This Works
- `JSON.stringify()` in Deno produces valid UTF-8 strings by default
- The issue is that n8n interprets the incoming bytes using a fallback encoding (likely Latin-1/ISO-8859-1) when no charset is declared
- Explicitly declaring `charset=utf-8` tells n8n to decode the body correctly

### Scope
This covers all 3 search approaches (manual entry, bulk upload, bulk people enrichment) since they all flow through the same `trigger-n8n-webhook` function, and queued re-sends go through `release-api-slot`.

### Technical Details
- No changes to payload serialization needed -- `JSON.stringify` already outputs UTF-8
- No changes to the frontend or other edge functions required
- Both edge functions will be redeployed automatically after the change
