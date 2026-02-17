

## Fix: Skip Empty Rows in People Enrichment Validation

### Problem
When uploading a People Enrichment file, empty rows (Row 3 onwards) are being flagged as validation errors for missing First Name, Last Name, and Organization Domain. This happens because the Excel template may contain formatting, formulas, or hidden metadata in those rows, so `XLSX.utils.sheet_to_json()` includes them as data rows. The current validation checks every returned row without considering whether it is actually empty.

### Root Cause
In `src/components/BulkPeopleEnrichment.tsx`, the `validateData` function (lines 194-214) iterates over all rows and validates mandatory fields on each one. It does not check whether a row is effectively empty before flagging errors.

### Solution
Add an "effectively empty" check at the start of the row loop. If all key fields (First Name, Last Name, Organization Domain, LinkedIn URL) are empty or missing, skip that row entirely -- it is not real data.

### File to Change

**`src/components/BulkPeopleEnrichment.tsx`** -- `validateData` function (lines 194-214)

Add a check after extracting each row's values: if the row has no meaningful data across all relevant columns, skip validation for that row. Additionally, filter out these empty rows from the data before sending to the backend, so n8n does not receive blank entries.

### Technical Details

Inside the `data.forEach` loop, before the mandatory field checks:

1. Extract all field values (First Name, Last Name, Domain, LinkedIn URL, Record Id)
2. Check if ALL of them are empty/undefined/whitespace
3. If the row is effectively empty, skip it (return early from the forEach callback)

This approach:
- Preserves validation for rows that have partial data (e.g., First Name filled but Domain missing)
- Only skips rows where nothing meaningful is entered
- Matches user expectation that trailing empty rows are not real data

