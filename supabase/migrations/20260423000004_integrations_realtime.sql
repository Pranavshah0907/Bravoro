-- Add public.integrations to the Supabase Realtime publication.
--
-- The useIntegration React hook (src/components/integrations/useIntegration.ts)
-- subscribes to postgres_changes on this table, filtered by workspace_id, so
-- that ConnectedCard / ErrorCard / empty-state transitions surface without
-- requiring manual refresh when the daily health-check cron flips an
-- integration's status, or when another device disconnects.
--
-- Flagged by the Codex whole-branch adversarial review on 2026-04-23:
-- the realtime subscription was a no-op without this publication entry
-- in environments applied solely from migrations.

ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;
