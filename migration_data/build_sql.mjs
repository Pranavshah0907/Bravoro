/**
 * build_sql.mjs
 * Generates numbered SQL files from CSV exports to paste into Supabase SQL editor.
 * Run: node migration_data/build_sql.mjs
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'sql');

// Create output directory
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// ── Helpers ────────────────────────────────────────────────────────────────

const findCSV = (prefix) => {
  const files = fs.readdirSync(__dirname).filter(f => f.startsWith(prefix) && f.endsWith('.csv'));
  if (!files.length) throw new Error(`CSV not found: ${prefix}`);
  return path.join(__dirname, files[0]);
};

const readCSV = (prefix) => {
  const content = fs.readFileSync(findCSV(prefix), 'utf8');
  return parse(content, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
};

// Escape a value for SQL literal. Returns NULL or a quoted string.
const esc = (val) => {
  if (val === null || val === undefined || val === '') return 'NULL';
  const s = String(val).trim();
  if (s === '') return 'NULL';
  // Booleans
  if (s === 'true') return 'TRUE';
  if (s === 'false') return 'FALSE';
  // Numbers (integers and decimals, no leading zeros beyond single 0)
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  // Everything else: escape single quotes and wrap
  return `'${s.replace(/'/g, "''")}'`;
};

// Generate INSERT rows for a table
const buildInserts = (table, columns, rows) => {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const lines = rows.map(row => {
    const vals = columns.map(col => esc(row[col])).join(', ');
    return `  (${vals})`;
  });
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n` +
    lines.join(',\n') +
    `\nON CONFLICT DO NOTHING;\n`
  );
};

// Split rows into chunks and build multiple INSERT statements
const buildChunkedInserts = (table, columns, rows, chunkSize = 200) => {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  let out = '';
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    out += buildInserts(table, columns, chunk) + '\n';
  }
  return out;
};

const write = (filename, content) => {
  const p = path.join(OUT, filename);
  fs.writeFileSync(p, content, 'utf8');
  const kb = Math.round(content.length / 1024);
  console.log(`  ✓ ${filename} (${kb} KB)`);
};

// ── Step 1: Schema migrations ──────────────────────────────────────────────
console.log('Building 01_schema.sql...');
const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
const migFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
let schema = `-- Schema migrations (${migFiles.length} files)\n-- Run this FIRST in the SQL editor\n\n`;
for (const f of migFiles) {
  schema += `-- ── ${f} ─────────────────────────────────────\n`;
  schema += fs.readFileSync(path.join(migrationsDir, f), 'utf8').trim() + '\n\n';
}
write('01_schema.sql', schema);

// ── Step 2: Auth users ─────────────────────────────────────────────────────
console.log('Building 02_auth_users.sql...');
const authRows = readCSV('User_query-results');
let authSQL = `-- Auth users (${authRows.length} rows)\n-- IMPORTANT: Run AFTER 01_schema.sql\n\n`;
authSQL += `-- Disable FK constraints during auth insert\nSET session_replication_role = 'replica';\n\n`;

for (const u of authRows) {
  const email = u.email.trim();
  const encPwd = u.encrypted_password.trim().replace(/'/g, "''");
  const confirmedAt = u.confirmed_at.trim();
  const metaRaw = (u.raw_user_meta_data || '{}').trim().replace(/'/g, "''");
  const userId = u.id.trim();

  authSQL += `INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '${userId}',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  '${email}',
  '${encPwd}',
  '${confirmedAt}', '${confirmedAt}',
  '${metaRaw}'::jsonb,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '${confirmedAt}', '${confirmedAt}',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;\n\n`;
}

authSQL += `-- Re-enable FK constraints\nSET session_replication_role = 'DEFAULT';\n`;
write('02_auth_users.sql', authSQL);

// ── Step 3: Small tables ───────────────────────────────────────────────────
console.log('Building 03_small_tables.sql...');
let small = `-- Small tables: api_slots, profiles, user_roles, webhook_settings\n-- Run AFTER 02_auth_users.sql\n\n`;
small += `SET session_replication_role = 'replica';\n\n`;

const apiSlots = readCSV('api_slots');
small += buildInserts('public.api_slots',
  ['id', 'slot_name', 'is_locked', 'locked_by_search_id', 'locked_at', 'created_at'],
  apiSlots) + '\n';

const profiles = readCSV('profiles');
small += buildInserts('public.profiles',
  ['id', 'email', 'full_name', 'created_at', 'updated_at', 'requires_password_reset', 'enrichment_limit', 'enrichment_used'],
  profiles) + '\n';

const userRoles = readCSV('user_roles');
small += buildInserts('public.user_roles',
  ['id', 'user_id', 'role', 'created_at'],
  userRoles) + '\n';

const webhookSettings = readCSV('webhook_settings');
small += buildInserts('public.webhook_settings',
  ['id', 'user_id', 'webhook_url', 'created_at', 'updated_at'],
  webhookSettings) + '\n';

small += `SET session_replication_role = 'DEFAULT';\n`;
write('03_small_tables.sql', small);

// ── Step 4: Searches ───────────────────────────────────────────────────────
console.log('Building 04_searches.sql...');
const searches = readCSV('searches');
let searchSQL = `-- searches (${searches.length} rows)\n-- Run AFTER 03_small_tables.sql\n\n`;
searchSQL += `SET session_replication_role = 'replica';\n\n`;
searchSQL += buildChunkedInserts('public.searches',
  ['id', 'user_id', 'search_type', 'company_name', 'domain', 'functions', 'geography',
   'seniority', 'status', 'result_url', 'error_message', 'excel_file_name',
   'created_at', 'updated_at', 'results_per_function'],
  searches, 200);
searchSQL += `\nSET session_replication_role = 'DEFAULT';\n`;
write('04_searches.sql', searchSQL);

// ── Step 5: Jobs & credit_usage ────────────────────────────────────────────
console.log('Building 05_jobs_credits.sql...');
const jobs = readCSV('jobs');
const credits = readCSV('credit_usage');
let jobsSQL = `-- jobs (${jobs.length} rows) + credit_usage (${credits.length} rows)\n-- Run AFTER 04_searches.sql\n\n`;
jobsSQL += `SET session_replication_role = 'replica';\n\n`;
jobsSQL += buildChunkedInserts('public.jobs',
  ['id', 'user_id', 'status', 'result_file_url', 'error_message', 'created_at', 'completed_at', 'updated_at'],
  jobs, 200) + '\n';
jobsSQL += buildChunkedInserts('public.credit_usage',
  ['id', 'user_id', 'search_id', 'apollo_credits', 'aleads_credits', 'lusha_credits',
   'created_at', 'updated_at', 'contacts_count', 'enriched_contacts_count',
   'apollo_email_credits', 'apollo_phone_credits', 'grand_total_credits'],
  credits, 200) + '\n';
jobsSQL += `SET session_replication_role = 'DEFAULT';\n`;
write('05_jobs_credits.sql', jobsSQL);

// ── Step 6: Master contacts ────────────────────────────────────────────────
console.log('Building 06_master_contacts.sql...');
const contacts = readCSV('master_contacts');
let contactsSQL = `-- master_contacts (${contacts.length} rows)\n-- Run AFTER 05_jobs_credits.sql\n\n`;
contactsSQL += `SET session_replication_role = 'replica';\n\n`;
contactsSQL += buildChunkedInserts('public.master_contacts',
  ['id', 'person_id', 'first_name', 'last_name', 'email', 'email_2',
   'phone_1', 'phone_2', 'linkedin', 'title', 'organization', 'domain',
   'first_seen_at', 'last_updated_at', 'source_search_id', 'source_user_id'],
  contacts, 200);
contactsSQL += `\nSET session_replication_role = 'DEFAULT';\n`;
write('06_master_contacts.sql', contactsSQL);

// ── Step 7: Search results (large — split into 300-row chunks per file) ────
console.log('Building 07_search_results_*.sql...');
const results = readCSV('search_results');
const RESULTS_PER_FILE = 500;
const numFiles = Math.ceil(results.length / RESULTS_PER_FILE);
for (let i = 0; i < numFiles; i++) {
  const chunk = results.slice(i * RESULTS_PER_FILE, (i + 1) * RESULTS_PER_FILE);
  const fileNum = String(i + 1).padStart(2, '0');
  let sql = `-- search_results part ${i + 1}/${numFiles} (rows ${i * RESULTS_PER_FILE + 1}–${Math.min((i + 1) * RESULTS_PER_FILE, results.length)})\n`;
  sql += `-- Run AFTER 06_master_contacts.sql\n\n`;
  sql += `SET session_replication_role = 'replica';\n\n`;
  sql += buildInserts('public.search_results',
    ['id', 'search_id', 'company_name', 'domain', 'contact_data', 'created_at', 'updated_at', 'result_type'],
    chunk);
  sql += `\nSET session_replication_role = 'DEFAULT';\n`;
  write(`07_search_results_${fileNum}.sql`, sql);
}

// ── Step 8: Remaining tables ───────────────────────────────────────────────
console.log('Building 08_remaining.sql...');
const queue = readCSV('request_queue');
const tokens = readCSV('password_reset_tokens');
let remaining = `-- request_queue + password_reset_tokens\n-- Run LAST\n\n`;
remaining += `SET session_replication_role = 'replica';\n\n`;
remaining += buildInserts('public.request_queue',
  ['id', 'search_id', 'entry_type', 'search_data', 'status', 'created_at'],
  queue) + '\n';
remaining += buildInserts('public.password_reset_tokens',
  ['id', 'user_id', 'token_hash', 'email', 'expires_at', 'used_at', 'created_at'],
  tokens) + '\n';
remaining += `SET session_replication_role = 'DEFAULT';\n`;
write('08_remaining.sql', remaining);

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n✅ All SQL files generated in migration_data/sql/');
console.log('\nPaste them in your Supabase SQL editor in this order:');
const sqlFiles = fs.readdirSync(OUT).filter(f => f.endsWith('.sql')).sort();
sqlFiles.forEach((f, i) => {
  const size = Math.round(fs.statFileSync ? 0 : fs.statSync(path.join(OUT, f)).size / 1024);
  console.log(`  ${i + 1}. ${f} (${size} KB)`);
});
