-- Auth users (8 rows)
-- IMPORTANT: Run AFTER 01_schema.sql

-- Disable FK constraints during auth insert
SET session_replication_role = 'replica';

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  'b71b9ee5-7c13-403f-b46a-97efa3a316d1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'pranavshah0907@gmail.com',
  '$2a$10$IJnmRwfHLi5n5x8kmstQYOxSV0xM//.lQnEl.1IqBKjeLql6x.vM6',
  '2025-11-04 23:21:38.092392+00', '2025-11-04 23:21:38.092392+00',
  '{"email_verified":true}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2025-11-04 23:21:38.092392+00', '2025-11-04 23:21:38.092392+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '5ee1adb1-82e9-474a-a480-7a801c136549',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'christoph@salesup.pro',
  '$2a$10$dvOk5h9W9a35rDA3j9v8lejlUk3G9HC1aukpEArUjJe4Pfm9MZYJ.',
  '2025-12-23 23:00:33.278168+00', '2025-12-23 23:00:33.278168+00',
  '{"email_verified":true,"full_name":"Christoph Koellner"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2025-12-23 23:00:33.278168+00', '2025-12-23 23:00:33.278168+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  'c2546b12-c2a7-44ad-ba71-9a01f75fba5a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'aliaydin0261@gmail.com',
  '$2a$10$MOsaXgzGfOD6odkpMXS7..xeoPj6UsYu65qsXR5ZJlcev61HEwQxy',
  '2026-02-04 10:49:28.871487+00', '2026-02-04 10:49:28.871487+00',
  '{"email_verified":true,"full_name":"Zeynel Aydin"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2026-02-04 10:49:28.871487+00', '2026-02-04 10:49:28.871487+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '691e5bb1-0d53-4e3e-84a8-bff377816430',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'langenscheidt@emploio.de',
  '$2a$10$pUgbZD5Tcroq5qbSp42/dODTIQyqEBQpNSV3otH5XjQZYzBicRJjW',
  '2025-12-23 23:19:41.769538+00', '2025-12-23 23:19:41.769538+00',
  '{"email_verified":true,"full_name":"Loris Langenscheidt"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2025-12-23 23:19:41.769538+00', '2025-12-23 23:19:41.769538+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '64f6912f-e055-4fc7-a94c-fd1c395a125f',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'tobias.holke@entsorgungstalente.de',
  '$2a$10$f9VThSXeEyYyD.mFJh3FrOaknzEHHMMAKN2H4qPx5ijt4dSO8hrYu',
  '2026-02-04 10:57:47.079101+00', '2026-02-04 10:57:47.079101+00',
  '{"email_verified":true,"full_name":"Tobias Holke"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2026-02-04 10:57:47.079101+00', '2026-02-04 10:57:47.079101+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '26a051b3-bbfc-43f9-aa42-cdb9a6989199',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'pranavshah.images@gmail.com',
  '$2a$10$qC21LHbt5lBxuT.h4Zn4Ae4xG63rnb5a1NCWhVeefXHeonMxbyYMe',
  '2026-01-30 18:56:24.79726+00', '2026-01-30 18:56:24.79726+00',
  '{"email_verified":true,"full_name":"Pranav Shah"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2026-01-30 18:56:24.79726+00', '2026-01-30 18:56:24.79726+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  'bba17cb9-8d78-4503-8b1d-f47a3cd2e4f8',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'sandy.s9995@gmail.com',
  '$2a$10$EnhEWDumpRRKRxip.Px02O3VNvMU3cuBqQtiGDV0r5.vN43Jnu4xa',
  '2025-11-26 13:50:48.847184+00', '2025-11-26 13:50:48.847184+00',
  '{"email_verified":true,"full_name":"Sandeep Sharma"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2025-11-26 13:50:48.847184+00', '2025-11-26 13:50:48.847184+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '4272e641-ed75-4390-8100-98e4ed949581',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'aydin@emploio.de',
  '$2a$10$I.ZCUxrvRukGIcVp86zkX.NDkrZ77uWuP214EwLjt5BHsYU/joIp6',
  '2025-11-26 14:18:43.614939+00', '2025-11-26 14:18:43.614939+00',
  '{"email_verified":true,"full_name":"Zeynel Aydin"}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '2025-11-26 14:18:43.614939+00', '2025-11-26 14:18:43.614939+00',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Re-enable FK constraints
SET session_replication_role = 'DEFAULT';
