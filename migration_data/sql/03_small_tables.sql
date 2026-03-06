-- Small tables: api_slots, profiles, user_roles, webhook_settings
-- Run AFTER 02_auth_users.sql

SET session_replication_role = 'replica';

INSERT INTO public.api_slots (id, slot_name, is_locked, locked_by_search_id, locked_at, created_at) VALUES
  ('f866c0b0-2ef7-4bb8-a2e6-4b3fb1e83879', 'processing', FALSE, NULL, NULL, '2026-01-30 09:01:42.215919+00')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at, requires_password_reset, enrichment_limit, enrichment_used) VALUES
  ('4272e641-ed75-4390-8100-98e4ed949581', 'aydin@emploio.de', 'Zeynel Aydin', '2025-11-26 14:18:43.613891+00', '2026-02-25 11:01:52.989372+00', FALSE, 100000000, 1991),
  ('c2546b12-c2a7-44ad-ba71-9a01f75fba5a', 'aliaydin0261@gmail.com', 'Zeynel Aydin', '2026-02-04 10:49:28.871085+00', '2026-02-04 10:50:13.381514+00', FALSE, 100, 0),
  ('5ee1adb1-82e9-474a-a480-7a801c136549', 'christoph@salesup.pro', 'Christoph Koellner', '2025-12-23 23:00:33.276629+00', '2025-12-23 23:00:33.484204+00', TRUE, 0, 0),
  ('691e5bb1-0d53-4e3e-84a8-bff377816430', 'langenscheidt@emploio.de', 'Loris Langenscheidt', '2025-12-23 23:19:41.767847+00', '2025-12-23 23:19:42.177816+00', TRUE, 0, 0),
  ('64f6912f-e055-4fc7-a94c-fd1c395a125f', 'tobias.holke@entsorgungstalente.de', 'Tobias Holke', '2026-02-04 10:57:47.078797+00', '2026-02-06 12:51:08.923533+00', FALSE, 10000, 30),
  ('bba17cb9-8d78-4503-8b1d-f47a3cd2e4f8', 'sandy.s9995@gmail.com', 'Sandeep Sharma', '2025-11-26 13:50:48.846855+00', '2026-02-16 07:03:17.595352+00', FALSE, 1000, 2),
  ('b71b9ee5-7c13-403f-b46a-97efa3a316d1', 'pranavshah0907@gmail.com', NULL, '2025-11-04 23:21:38.090705+00', '2026-02-17 11:35:17.385356+00', FALSE, 10000000, 118),
  ('26a051b3-bbfc-43f9-aa42-cdb9a6989199', 'pranavshah.images@gmail.com', 'Pranav Shah', '2026-01-30 18:56:24.796885+00', '2026-02-03 20:03:07.874026+00', FALSE, 100000, 7)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (id, user_id, role, created_at) VALUES
  ('38d53aa0-2103-4056-86d9-5466e9dd5b8b', 'b71b9ee5-7c13-403f-b46a-97efa3a316d1', 'admin', '2025-11-04 23:21:38.090705+00'),
  ('72f976e0-70ea-44dc-9f9d-aaed59b76c20', 'bba17cb9-8d78-4503-8b1d-f47a3cd2e4f8', 'admin', '2025-11-26 13:50:49.026302+00'),
  ('e297987a-844a-4336-b46b-019d916b99f7', '4272e641-ed75-4390-8100-98e4ed949581', 'admin', '2025-11-26 14:18:43.8201+00'),
  ('c7e589f1-029c-4010-b3e0-040218baa955', '5ee1adb1-82e9-474a-a480-7a801c136549', 'admin', '2025-12-23 23:00:33.840865+00'),
  ('0e31c653-f300-44c1-bc5f-0528f57b72cb', '691e5bb1-0d53-4e3e-84a8-bff377816430', 'admin', '2025-12-23 23:19:42.699604+00'),
  ('39b710c5-ebcd-49e8-9f63-e8600e46c3a6', '26a051b3-bbfc-43f9-aa42-cdb9a6989199', 'user', '2026-01-30 18:56:25.016478+00'),
  ('e1859788-82f2-43dd-bb9d-823bcbf33f31', 'c2546b12-c2a7-44ad-ba71-9a01f75fba5a', 'user', '2026-02-04 10:49:29.131578+00'),
  ('b4d7602b-bcb3-4234-974b-319c70e0c31a', '64f6912f-e055-4fc7-a94c-fd1c395a125f', 'user', '2026-02-04 10:57:47.303587+00')
ON CONFLICT DO NOTHING;

-- public.webhook_settings: 0 rows

SET session_replication_role = 'DEFAULT';
