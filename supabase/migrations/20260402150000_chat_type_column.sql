-- Add chat_type to distinguish AI Staffing vs Recruiting conversations
ALTER TABLE ai_chat_conversations
  ADD COLUMN IF NOT EXISTS chat_type text NOT NULL DEFAULT 'ai_staffing';

-- Constraint to ensure valid values
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_conversations_chat_type_check') THEN
    ALTER TABLE ai_chat_conversations
      ADD CONSTRAINT ai_chat_conversations_chat_type_check
      CHECK (chat_type IN ('ai_staffing', 'recruiting'));
  END IF;
END $$;

-- Index for filtered queries (each wrapper queries by user_id + chat_type)
CREATE INDEX IF NOT EXISTS idx_ai_chat_conversations_user_chat_type
  ON ai_chat_conversations (user_id, chat_type);
