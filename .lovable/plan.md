

# Fix Queue Status Constraint and Investigate Data Flow

## Problem Summary

Two issues were discovered when submitting files back-to-back:

1. **Database constraint violation**: The `searches` table has a check constraint that only allows statuses: `['processing', 'completed', 'error']`, but the queuing logic tries to set `status: 'queued'`
2. **n8n validation failure**: The second file was queued correctly with data, but when triggered, n8n returned a validation error

## Evidence from Logs

```text
trigger-n8n-webhook logs:
[e448814d-...] Status update error: {
  code: "23514",
  message: 'new row for relation "searches" violates check constraint "searches_status_check"'
}
[e448814d-...] Processing flag occupied, adding to queue
[e448814d-...] Request queued successfully
```

The queue **does have the Excel data** (7138 bytes), but when n8n processed it, it returned:
```
"⚠️ Validation failed. Please update the fields and try again."
```

## Root Cause

The `searches_status_check` constraint was never updated to include `'queued'` as a valid status when the queuing system was implemented.

## Solution

### 1. Update Database Constraint

Add `'queued'` to the allowed statuses in the `searches_status_check` constraint:

```sql
ALTER TABLE searches DROP CONSTRAINT searches_status_check;
ALTER TABLE searches ADD CONSTRAINT searches_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'queued'::text, 'completed'::text, 'error'::text]));
```

### 2. Also Add 'pending' Status

Since we tried to use `'pending'` earlier (and will likely need it), include it in the constraint.

## Flow After Fix

```text
User submits file
      |
      v
Frontend inserts search with status: "processing"
      |
      v
trigger-n8n-webhook checks flag
      |
      +---> [Flag free] Send to n8n, status stays "processing"
      |
      +---> [Flag busy] Queue the request, update status to "queued"
                         (This UPDATE will now succeed!)
```

## Files to Modify

| Change | Description |
|--------|-------------|
| SQL Migration | Drop and recreate `searches_status_check` constraint with `'queued'` and `'pending'` statuses |

## Technical Details

The constraint modification will:
- Allow the queuing system to properly set `status: 'queued'`
- Allow future use of `status: 'pending'` if needed
- Maintain backward compatibility with existing statuses

## Summary

The data WAS being queued correctly - the Excel content was stored in the `request_queue` table. The issue was that the status update to `'queued'` was silently failing due to the database constraint, which could lead to confusing UI states. Additionally, n8n returned a validation error for the queued request, which may require investigation on the n8n side.

