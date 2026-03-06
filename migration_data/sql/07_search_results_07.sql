-- search_results part 7/7 (rows 3001–3018)
-- Run AFTER 06_master_contacts.sql

SET session_replication_role = 'replica';

INSERT INTO public.search_results (id, search_id, company_name, domain, contact_data, created_at, updated_at, result_type) VALUES
  ('63350ed3-a3af-496a-b736-985e2c41f8bc', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'H. Carnuth KG', 'carnuth.de', '[]', '2026-02-17 13:18:50.761125+00', '2026-02-17 13:18:50.761125+00', 'missing_company'),
  ('5cd10693-1a74-411e-96de-52e98ba7f528', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'M Entsorgung und Umwelttechnik Lausitz GmbH & Co. KG', 'entsorgung.m-alteno.de', '[]', '2026-02-17 13:18:50.877424+00', '2026-02-17 13:18:50.877424+00', 'missing_company'),
  ('f30042dd-fc27-4611-bbb5-bc98814547c8', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'RECONIC GMBH', 'reconic.io', '[]', '2026-02-17 13:18:50.992074+00', '2026-02-17 13:18:50.992074+00', 'missing_company'),
  ('e65c2865-d606-4daf-9858-147be8d9fa16', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'HEMA Kuechenstudio GmbH', 'hemakuechenstudio.de', '[]', '2026-02-17 13:18:51.057322+00', '2026-02-17 13:18:51.057322+00', 'missing_company'),
  ('345d7612-c490-47ce-8475-970c598596a5', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'B&C GmbH', 'bc-gmbh.com', '[]', '2026-02-17 13:18:51.213855+00', '2026-02-17 13:18:51.213855+00', 'missing_company'),
  ('1c6b1f64-799e-4cae-9686-f47e732c475d', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'DAS TELEFONBUCH-SERVICEGESELLSCHAFT MBH', 'adresse.dastelefonbuch.de', '[]', '2026-02-17 13:18:51.363504+00', '2026-02-17 13:18:51.363504+00', 'missing_company'),
  ('de0de7ee-d275-44ed-981e-5372743401f2', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Autorecycling Elma Ljuca e.K.', 'autoverwertung-ljuca.de', '[]', '2026-02-17 13:18:51.504656+00', '2026-02-17 13:18:51.504656+00', 'missing_company'),
  ('febeacbe-a0b2-4fc0-b63a-4b113c5633ec', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'AM Abbruch GmbH', 'am-abbruch.com', '[]', '2026-02-17 13:18:51.642609+00', '2026-02-17 13:18:51.642609+00', 'missing_company'),
  ('90b2aa66-e6a9-4289-8822-2de5b345b4f0', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Rudolf Stoffers GmbH', 'rudolf-stoffers.de', '[]', '2026-02-17 13:18:51.764383+00', '2026-02-17 13:18:51.764383+00', 'missing_company'),
  ('c68f25d3-87b7-403f-90bb-07d9706a18be', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Johann Oldenburg GmbH', 'johann-oldenburg.de', '[]', '2026-02-17 13:18:51.88943+00', '2026-02-17 13:18:51.88943+00', 'missing_company'),
  ('c3ed924f-acd2-4973-bb19-66a7295dbc1c', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Nordwind UmzÃ¼ge', 'nordwind-umzuege.de', '[]', '2026-02-17 13:18:52.003638+00', '2026-02-17 13:18:52.003638+00', 'missing_company'),
  ('39eb89df-0826-4b28-95bb-d04d5fd4d2ec', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Hillebrand GmbH', 'hillebrand-damme.de', '[]', '2026-02-17 13:18:52.125526+00', '2026-02-17 13:18:52.125526+00', 'missing_company'),
  ('5b9d0cf7-90bb-4485-bf1c-c57ee40e3e9b', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'CONTAINERWERK eins GmbH', 'containerwerk.com', '[]', '2026-02-17 13:18:52.267679+00', '2026-02-17 13:18:52.267679+00', 'missing_company'),
  ('c3398b6c-884f-4f8c-986b-c9a2c7c11d85', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Hermann Holste KlÃ¤rtechnik GmbH', 'hermann-holste-klaertechnik.de', '[]', '2026-02-17 13:18:52.503283+00', '2026-02-17 13:18:52.503283+00', 'missing_company'),
  ('76aa937e-7d5b-4b6c-8bcc-6cce062e040a', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'JRT GmbH', 'jrt-recycling.de', '[]', '2026-02-17 13:18:52.7645+00', '2026-02-17 13:18:52.7645+00', 'missing_company'),
  ('c1ba0de8-dc45-4707-8873-e52856cb6fb4', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'Verbandsgemeindeverwaltung Hermeskeil', 'hermeskeil.de', '[]', '2026-02-17 13:18:52.89075+00', '2026-02-17 13:18:52.89075+00', 'missing_company'),
  ('f75b2c9f-12c3-4d53-ab3a-f459667a103a', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'O.Kuhnert GmbH & CoKG', 'auto-verwertung.eu', '[]', '2026-02-17 13:18:53.013003+00', '2026-02-17 13:18:53.013003+00', 'missing_company'),
  ('7f51959a-12c9-4287-8bcc-05c4ccd296e8', 'e95215e8-4c83-4938-834a-0d7b1757f0e9', 'ALPHA Verwertung GmbH', 'alpha-verwertung.de', '[]', '2026-02-17 13:18:53.163429+00', '2026-02-17 13:18:53.163429+00', 'missing_company')
ON CONFLICT DO NOTHING;

SET session_replication_role = 'DEFAULT';
