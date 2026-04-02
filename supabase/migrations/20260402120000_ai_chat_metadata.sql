-- Add metadata JSONB column to ai_chat_messages for structured data (companies, contacts, credits)
alter table public.ai_chat_messages
  add column if not exists metadata jsonb default null;

-- Comment for documentation
comment on column public.ai_chat_messages.metadata is
  'Stores structured response data from n8n: { data: { companies, contacts, ... }, credits: { theirstack, cognism, ... } }';
