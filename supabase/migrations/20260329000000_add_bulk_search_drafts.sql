-- Bulk Search Drafts: save/restore SpreadsheetGrid state per user
CREATE TABLE IF NOT EXISTS bulk_search_drafts (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text        NOT NULL DEFAULT 'Untitled Draft',
  grid_data   jsonb       NOT NULL DEFAULT '[]',
  row_count   integer     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE bulk_search_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts"
  ON bulk_search_drafts FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bsd_user_updated
  ON bulk_search_drafts (user_id, updated_at DESC);
