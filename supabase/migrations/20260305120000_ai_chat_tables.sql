-- AI Chat Conversations table
create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Chat',
  session_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI Chat Messages table
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists ai_chat_conversations_user_id_idx on public.ai_chat_conversations(user_id);
create index if not exists ai_chat_messages_conversation_id_idx on public.ai_chat_messages(conversation_id);

-- Auto-update updated_at on conversations when a new message is inserted
create or replace function public.touch_conversation_updated_at()
returns trigger language plpgsql as $$
begin
  update public.ai_chat_conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return NEW;
end;
$$;

create trigger ai_chat_messages_touch_conversation
after insert on public.ai_chat_messages
for each row execute function public.touch_conversation_updated_at();

-- Row Level Security
alter table public.ai_chat_conversations enable row level security;
alter table public.ai_chat_messages enable row level security;

-- Conversations: users can only see/modify their own
create policy "Users can manage their own conversations"
  on public.ai_chat_conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages: users can only see/insert messages for their own conversations
create policy "Users can manage messages in their own conversations"
  on public.ai_chat_messages
  for all
  using (
    exists (
      select 1 from public.ai_chat_conversations
      where id = ai_chat_messages.conversation_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_chat_conversations
      where id = ai_chat_messages.conversation_id
        and user_id = auth.uid()
    )
  );
