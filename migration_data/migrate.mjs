import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MIGRATION_DATA = __dirname;

// IPv6 address for db.ggvhwxpaovfvoyvzixqw.supabase.co (IPv6-only host)
const client = new pg.Client({
  host: '2a05:d014:1c06:5f4f:f0e5:dda5:9016:6b7e',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '@Gurudev108!!',
  ssl: { rejectUnauthorized: false },
});

// Empty string or undefined → null
const nullify = (v) => (v === '' || v === undefined || v === null ? null : v);

// Trim all string values in a record
const clean = (record) => {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
};

// Find and parse CSV by filename prefix
const parseCSV = (prefix) => {
  const files = fs.readdirSync(MIGRATION_DATA).filter(
    (f) => f.startsWith(prefix) && f.endsWith('.csv')
  );
  if (files.length === 0) throw new Error(`No CSV found for prefix: ${prefix}`);
  const content = fs.readFileSync(path.join(MIGRATION_DATA, files[0]), 'utf8');
  return parse(content, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
};

// Batch insert with ON CONFLICT DO NOTHING
const batchInsert = async (table, columns, rows, chunkSize = 100) => {
  if (rows.length === 0) {
    console.log(`  ⟶ ${table}: 0 rows (skipping)`);
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk
      .map(
        (_, ri) =>
          `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`
      )
      .join(', ');
    const values = chunk.flatMap((row) => columns.map((col) => nullify(row[col])));
    try {
      const result = await client.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        values
      );
      inserted += result.rowCount ?? chunk.length;
    } catch (err) {
      console.error(`  ✗ chunk error in ${table}:`, err.message);
    }
  }
  console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows`);
};

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Supabase Migration Script');
  console.log('  Target: ggvhwxpaovfvoyvzixqw.supabase.co');
  console.log('═══════════════════════════════════════════\n');

  console.log('Connecting...');
  await client.connect();
  console.log('Connected!\n');

  // ── 1. Run all migration SQL files ──────────────────────────────────────
  console.log('Step 1: Running schema migrations...');
  const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      // Codes: 42P07 = relation exists, 42710 = object exists, 42P06 = schema exists
      if (['42P07', '42710', '42P06', '42P16'].includes(err.code) || err.message.includes('already exists')) {
        console.log(`  ⟶ ${file} (already exists, skipped)`);
      } else {
        console.error(`  ✗ ${file}: [${err.code}] ${err.message}`);
      }
    }
  }
  console.log();

  // ── 2. Disable FK constraints ────────────────────────────────────────────
  console.log('Step 2: Disabling FK constraints...');
  await client.query("SET session_replication_role = 'replica'");
  console.log('  ✓ FK constraints disabled\n');

  // ── 3. Insert auth users ─────────────────────────────────────────────────
  console.log('Step 3: Inserting auth users...');
  const authUsers = parseCSV('User_query-results');
  for (const user of authUsers) {
    const u = clean(user);
    try {
      await client.query(
        `INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, confirmed_at,
          raw_user_meta_data, raw_app_meta_data,
          created_at, updated_at,
          confirmation_token, recovery_token,
          email_change, email_change_token_new
        ) VALUES (
          $1,
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          $2, $3, $4, $4,
          $5::jsonb,
          '{"provider":"email","providers":["email"]}'::jsonb,
          $4, $4,
          '', '', '', ''
        ) ON CONFLICT (id) DO NOTHING`,
        [
          u.id,
          u.email,
          u.encrypted_password,
          u.confirmed_at,
          u.raw_user_meta_data || '{}',
        ]
      );
      console.log(`  ✓ ${u.email}`);
    } catch (err) {
      console.error(`  ✗ ${u.email}: ${err.message}`);
    }
  }
  console.log();

  // ── 4. Import public tables in FK order ──────────────────────────────────
  console.log('Step 4: Importing public tables...\n');

  // api_slots
  await batchInsert(
    'public.api_slots',
    ['id', 'slot_name', 'is_locked', 'locked_by_search_id', 'locked_at', 'created_at'],
    parseCSV('api_slots').map(clean)
  );

  // profiles
  await batchInsert(
    'public.profiles',
    ['id', 'email', 'full_name', 'created_at', 'updated_at', 'requires_password_reset', 'enrichment_limit', 'enrichment_used'],
    parseCSV('profiles').map(clean)
  );

  // user_roles
  await batchInsert(
    'public.user_roles',
    ['id', 'user_id', 'role', 'created_at'],
    parseCSV('user_roles').map(clean)
  );

  // webhook_settings
  await batchInsert(
    'public.webhook_settings',
    ['id', 'user_id', 'webhook_url', 'created_at', 'updated_at'],
    parseCSV('webhook_settings').map(clean)
  );

  // searches
  await batchInsert(
    'public.searches',
    ['id', 'user_id', 'search_type', 'company_name', 'domain', 'functions', 'geography', 'seniority', 'status', 'result_url', 'error_message', 'excel_file_name', 'created_at', 'updated_at', 'results_per_function'],
    parseCSV('searches').map(clean)
  );

  // jobs
  await batchInsert(
    'public.jobs',
    ['id', 'user_id', 'status', 'result_file_url', 'error_message', 'created_at', 'completed_at', 'updated_at'],
    parseCSV('jobs').map(clean)
  );

  // search_results (large — use chunk size 50)
  await batchInsert(
    'public.search_results',
    ['id', 'search_id', 'company_name', 'domain', 'contact_data', 'created_at', 'updated_at', 'result_type'],
    parseCSV('search_results').map(clean),
    50
  );

  // credit_usage
  await batchInsert(
    'public.credit_usage',
    ['id', 'user_id', 'search_id', 'apollo_credits', 'aleads_credits', 'lusha_credits', 'created_at', 'updated_at', 'contacts_count', 'enriched_contacts_count', 'apollo_email_credits', 'apollo_phone_credits', 'grand_total_credits'],
    parseCSV('credit_usage').map(clean)
  );

  // master_contacts
  await batchInsert(
    'public.master_contacts',
    ['id', 'person_id', 'first_name', 'last_name', 'email', 'email_2', 'phone_1', 'phone_2', 'linkedin', 'title', 'organization', 'domain', 'first_seen_at', 'last_updated_at', 'source_search_id', 'source_user_id'],
    parseCSV('master_contacts').map(clean)
  );

  // request_queue (0 rows but import anyway)
  await batchInsert(
    'public.request_queue',
    ['id', 'search_id', 'entry_type', 'search_data', 'status', 'created_at'],
    parseCSV('request_queue').map(clean)
  );

  // password_reset_tokens
  await batchInsert(
    'public.password_reset_tokens',
    ['id', 'user_id', 'token_hash', 'email', 'expires_at', 'used_at', 'created_at'],
    parseCSV('password_reset_tokens').map(clean)
  );

  // ── 5. Re-enable FK constraints ──────────────────────────────────────────
  console.log('\nStep 5: Re-enabling FK constraints...');
  await client.query("SET session_replication_role = 'DEFAULT'");
  console.log('  ✓ FK constraints re-enabled');

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ Migration complete!');
  console.log('═══════════════════════════════════════════');

  await client.end();
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  client.end().catch(() => {});
  process.exit(1);
});
