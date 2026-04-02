-- Allow AI chat conversations to sync results to the searches/search_results tables.

-- 1. Add 'ai_chat' to the search_type CHECK constraint
ALTER TABLE searches DROP CONSTRAINT IF EXISTS searches_search_type_check;
ALTER TABLE searches ADD CONSTRAINT searches_search_type_check
  CHECK (search_type IN ('manual', 'bulk', 'bulk_people_enrichment', 'ai_chat'));

-- 2. Add synced_search_id to ai_chat_conversations so we can track which
--    conversation has been synced and update (not duplicate) on re-sync.
ALTER TABLE ai_chat_conversations
  ADD COLUMN IF NOT EXISTS synced_search_id UUID REFERENCES searches(id) ON DELETE SET NULL;

-- 3. Allow authenticated users to INSERT search_results for their own searches.
--    Currently only the service role can insert (edge functions). The AI chat
--    sync feature inserts from the frontend.
CREATE POLICY "Users can insert results for own searches"
  ON search_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );

-- 4. Allow authenticated users to DELETE search_results for own searches.
--    Needed for re-sync (delete old results before re-inserting).
CREATE POLICY "Users can delete results for own searches"
  ON search_results FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );
