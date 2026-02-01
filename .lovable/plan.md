
# Master Database Implementation Plan

## Overview
This feature creates a centralized "Master Database" that aggregates all successful search results across all users. It enables admins to search and access all contact data ever collected, with intelligent duplicate handling and data freshness tracking.

---

## Part 1: Database Schema

### New Table: `master_contacts`

This table stores individual contacts (not grouped by company) for efficient searching and deduplication.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `person_id` | TEXT | Unique identifier from n8n (primary dedup key) |
| `first_name` | TEXT | Contact's first name |
| `last_name` | TEXT | Contact's last name |
| `email` | TEXT | Email address |
| `email_2` | TEXT | Secondary email (if found later) |
| `phone_1` | TEXT | Primary phone number |
| `phone_2` | TEXT | Secondary phone number |
| `linkedin` | TEXT | LinkedIn profile URL |
| `title` | TEXT | Job title |
| `organization` | TEXT | Company name |
| `domain` | TEXT | Company domain |
| `first_seen_at` | TIMESTAMPTZ | When contact was first added |
| `last_updated_at` | TIMESTAMPTZ | Last time data was refreshed |
| `source_search_id` | UUID | Reference to the original search |
| `source_user_id` | UUID | User who first found this contact |

### Indexes for Fast Searching
- Unique composite index on `person_id` (when not null)
- Index on `organization` for alphabetical listing
- Index on `domain` for duplicate fallback matching
- Index on `(first_name, last_name, organization)` for fallback deduplication
- Full-text search index on `organization` for company search

### RLS Policies
- Admins only: SELECT access via `has_role(auth.uid(), 'admin')`
- Service role: INSERT/UPDATE for edge function operations

---

## Part 2: Edge Function Changes (`save-search-results`)

### Payload Changes
Add `person_id` field to the Contact interface:

```text
interface Contact {
  person_id?: string;       // NEW: Unique ID from n8n
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
}
```

### Duplicate Detection Logic

When saving results, for each contact:

1. **If `person_id` exists:** Search master_contacts by person_id
2. **If no `person_id`:** Use fallback matching with multiple parameters:
   - Match by `linkedin` URL (highly unique)
   - Match by `email` (when not null)
   - Match by combination of `first_name + last_name + organization + domain`

### Upsert Logic

```text
For each contact in payload:
  1. Find existing record using person_id OR fallback params
  
  2. If FOUND:
     - Compare email: if different/new, update (or add to email_2)
     - Compare phones: if new numbers found, update/add
     - Always update last_updated_at to current timestamp
     
  3. If NOT FOUND:
     - Insert new record with all fields
     - Set first_seen_at = now()
     - Set last_updated_at = now()
```

---

## Part 3: Admin UI - Master Database Tab

### Tab Structure
Add a third tab to the Admin panel:

```text
[User Management] [User Analytics] [Master Database]
```

### Layout Components

**Header Section:**
- Search input with autocomplete for company names
- Export dropdown: "Export Selected Company" / "Export Entire Database"

**Company List (Left Panel):**
- Alphabetically sorted list of all unique organizations
- Click to select and view contacts
- Shows contact count badge per company

**Contact Table (Right Panel):**
- Displays all contacts for selected company
- Columns: Name, Title, Email, Phone(s), LinkedIn, Last Updated
- Data freshness indicator (e.g., "Updated 3 days ago")

### Search Functionality
- Real-time search as user types
- Suggestions dropdown showing matching companies
- On Enter: filter list to show all matching companies
- Clear button to reset search

### Export Options

**Export Selected Company:**
- Button appears when a company is selected
- Generates Excel with contacts for that company only
- Filename: `master_db_{company_name}_{date}.xlsx`

**Export Entire Database:**
- Dropdown option always available
- Generates Excel with all contacts
- Sheets organized by company (like segregated export)
- Includes summary sheet with statistics
- Warning dialog for large exports (>10,000 contacts)

---

## Technical Details

### Data Flow Diagram

```text
n8n Webhook
     |
     v
save-search-results (Edge Function)
     |
     +---> search_results table (per-search data, unchanged)
     |
     +---> master_contacts table (deduplicated, centralized)
```

### Performance Considerations
- Use batch upserts when processing multiple contacts
- Index optimization for company search queries
- Pagination for large company contact lists (50 per page)
- Lazy loading for company list if >1000 companies

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/save-search-results/index.ts` | Modify - Add master_contacts upsert logic |
| `src/pages/Admin.tsx` | Modify - Add Master Database tab |
| `src/components/MasterDatabaseTab.tsx` | Create - New component for the tab content |
| Database migration | Create - New master_contacts table with indexes and RLS |

---

## Implementation Order

1. **Database Migration**
   - Create master_contacts table
   - Add indexes
   - Set up RLS policies

2. **Edge Function Update**
   - Update Contact interface with person_id
   - Add master_contacts upsert logic with dedup
   - Test with sample payloads

3. **Admin UI - Basic Structure**
   - Add third tab to Admin panel
   - Create MasterDatabaseTab component
   - Implement company list with alphabetical sorting

4. **Admin UI - Search & Selection**
   - Implement search with autocomplete
   - Add company selection and contact display
   - Add pagination for contacts

5. **Admin UI - Export Features**
   - Single company export
   - Full database export with sheets
   - Export confirmation dialogs

---

## Summary

This implementation creates a powerful centralized contact repository that:
- Automatically aggregates all enriched contacts across all users
- Intelligently handles duplicates using person_id or fallback matching
- Tracks data freshness with timestamps
- Provides admins with easy search and export capabilities
- Maintains security with admin-only access
