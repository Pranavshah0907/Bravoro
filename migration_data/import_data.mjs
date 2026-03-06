/**
 * import_data.mjs
 * Imports all CSV data into the new Supabase project via HTTPS (REST API).
 * Requires the schema to already exist (run 01_schema.sql in SQL editor first).
 * Run: node migration_data/import_data.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

// Convert empty string → null; trim whitespace
const cleanRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const trimmed = typeof v === 'string' ? v.trim() : v;
    out[k] = trimmed === '' ? null : trimmed;
  }
  return out;
};

// Parse JSON string fields safely
const parseJsonField = (val) => {
  if (!val || val === 'null') return null;
  try {
    return JSON.parse(val);
  } catch {
    return val; // return as-is if not valid JSON
  }
};

// Batch upsert via Supabase REST
const batchUpsert = async (table, rows, chunkSize = 100) => {
  if (!rows.length) {
    console.log(`  ⟶ ${table}: 0 rows`);
    return;
  }
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error(`  ✗ ${table} chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
    } else {
      total += chunk.length;
    }
  }
  console.log(`  ✓ ${table}: ${total}/${rows.length} rows`);
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Supabase Data Import (HTTPS/REST)');
  console.log('  Target: ggvhwxpaovfvoyvzixqw.supabase.co');
  console.log('═══════════════════════════════════════════\n');

  // ── 1. Test connection ─────────────────────────────────────────────────
  console.log('Testing connection...');
  const { error: pingErr } = await supabase.from('profiles').select('id').limit(1);
  if (pingErr && pingErr.code !== 'PGRST116') {
    console.error('❌ Connection failed:', pingErr.message);
    console.error('   → Make sure you ran 01_schema.sql in the SQL editor first!');
    process.exit(1);
  }
  console.log('  ✓ Connected!\n');

  // ── 2. Auth users ──────────────────────────────────────────────────────
  console.log('Step 1: Creating auth users...');
  const authUsers = readCSV('User_query-results').map(cleanRow);
  for (const u of authUsers) {
    // Try to create with the original UUID
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: 'TempPass_ChangeMe_2024!',
      email_confirm: true,
      user_metadata: u.raw_user_meta_data ? parseJsonField(u.raw_user_meta_data) : {},
    });
    if (error) {
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        console.log(`  ⟶ ${u.email} (already exists)`);
      } else {
        console.error(`  ✗ ${u.email}: ${error.message}`);
      }
    } else {
      console.log(`  ✓ ${u.email} (id: ${data.user?.id})`);
    }
  }
  console.log();

  // Note: We need to remap user IDs if they differ from original.
  // Build a map: old_id → new_id
  console.log('  Building user ID map...');
  const { data: newUsers, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('  ✗ Could not list users:', listErr.message);
    process.exit(1);
  }

  // Map email → new UUID
  const emailToNewId = {};
  for (const u of newUsers.users) {
    emailToNewId[u.email] = u.id;
  }

  // Map old UUID → new UUID
  const idMap = {};
  for (const u of authUsers) {
    const newId = emailToNewId[u.email];
    if (newId) {
      idMap[u.id] = newId;
      if (u.id !== newId) {
        console.log(`  ↔ ${u.email}: ${u.id.slice(0,8)}... → ${newId.slice(0,8)}...`);
      }
    }
  }
  const remap = (id) => (id ? (idMap[id] || id) : null);
  console.log();

  // ── 3. api_slots ──────────────────────────────────────────────────────
  console.log('Step 2: Importing public tables...\n');

  const apiSlots = readCSV('api_slots').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      slot_name: c.slot_name,
      is_locked: c.is_locked === 'true' || c.is_locked === true,
      locked_by_search_id: c.locked_by_search_id,
      locked_at: c.locked_at,
      created_at: c.created_at,
    };
  });
  await batchUpsert('api_slots', apiSlots);

  // ── 4. profiles ───────────────────────────────────────────────────────
  const profiles = readCSV('profiles').map(r => {
    const c = cleanRow(r);
    return {
      id: remap(c.id),
      email: c.email,
      full_name: c.full_name,
      created_at: c.created_at,
      updated_at: c.updated_at,
      requires_password_reset: c.requires_password_reset === 'true',
      enrichment_limit: parseInt(c.enrichment_limit) || 0,
      enrichment_used: parseInt(c.enrichment_used) || 0,
    };
  });
  await batchUpsert('profiles', profiles);

  // ── 5. user_roles ─────────────────────────────────────────────────────
  const userRoles = readCSV('user_roles').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      role: c.role,
      created_at: c.created_at,
    };
  });
  await batchUpsert('user_roles', userRoles);

  // ── 6. webhook_settings ───────────────────────────────────────────────
  const webhooks = readCSV('webhook_settings').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      webhook_url: c.webhook_url,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  });
  await batchUpsert('webhook_settings', webhooks);

  // ── 7. searches ───────────────────────────────────────────────────────
  const searches = readCSV('searches').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      search_type: c.search_type,
      company_name: c.company_name,
      domain: c.domain,
      functions: parseJsonField(c.functions),
      geography: c.geography,
      seniority: parseJsonField(c.seniority),
      status: c.status,
      result_url: c.result_url,
      error_message: c.error_message,
      excel_file_name: c.excel_file_name,
      created_at: c.created_at,
      updated_at: c.updated_at,
      results_per_function: parseInt(c.results_per_function) || null,
    };
  });
  await batchUpsert('searches', searches, 100);

  // ── 8. jobs ───────────────────────────────────────────────────────────
  const jobs = readCSV('jobs').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      status: c.status,
      result_file_url: c.result_file_url,
      error_message: c.error_message,
      created_at: c.created_at,
      completed_at: c.completed_at,
      updated_at: c.updated_at,
    };
  });
  await batchUpsert('jobs', jobs);

  // ── 9. search_results ─────────────────────────────────────────────────
  const searchResults = readCSV('search_results').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      search_id: c.search_id,
      company_name: c.company_name,
      domain: c.domain,
      contact_data: parseJsonField(c.contact_data),
      created_at: c.created_at,
      updated_at: c.updated_at,
      result_type: c.result_type,
    };
  });
  await batchUpsert('search_results', searchResults, 50);

  // ── 10. credit_usage ──────────────────────────────────────────────────
  const credits = readCSV('credit_usage').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      search_id: c.search_id,
      apollo_credits: parseInt(c.apollo_credits) || 0,
      aleads_credits: parseInt(c.aleads_credits) || 0,
      lusha_credits: parseInt(c.lusha_credits) || 0,
      created_at: c.created_at,
      updated_at: c.updated_at,
      contacts_count: parseInt(c.contacts_count) || 0,
      enriched_contacts_count: parseInt(c.enriched_contacts_count) || 0,
      apollo_email_credits: parseInt(c.apollo_email_credits) || 0,
      apollo_phone_credits: parseInt(c.apollo_phone_credits) || 0,
      grand_total_credits: parseInt(c.grand_total_credits) || 0,
    };
  });
  await batchUpsert('credit_usage', credits);

  // ── 11. master_contacts ───────────────────────────────────────────────
  const contacts = readCSV('master_contacts').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      person_id: c.person_id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      email_2: c.email_2,
      phone_1: c.phone_1,
      phone_2: c.phone_2,
      linkedin: c.linkedin,
      title: c.title,
      organization: c.organization,
      domain: c.domain,
      first_seen_at: c.first_seen_at,
      last_updated_at: c.last_updated_at,
      source_search_id: c.source_search_id,
      source_user_id: remap(c.source_user_id),
    };
  });
  await batchUpsert('master_contacts', contacts, 100);

  // ── 12. request_queue ─────────────────────────────────────────────────
  const queue = readCSV('request_queue').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      search_id: c.search_id,
      entry_type: c.entry_type,
      search_data: parseJsonField(c.search_data),
      status: c.status,
      created_at: c.created_at,
    };
  });
  await batchUpsert('request_queue', queue);

  // ── 13. password_reset_tokens ─────────────────────────────────────────
  const tokens = readCSV('password_reset_tokens').map(r => {
    const c = cleanRow(r);
    return {
      id: c.id,
      user_id: remap(c.user_id),
      token_hash: c.token_hash,
      email: c.email,
      expires_at: c.expires_at,
      used_at: c.used_at,
      created_at: c.created_at,
    };
  });
  await batchUpsert('password_reset_tokens', tokens);

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ Data import complete!');
  console.log('');
  console.log('  ⚠ IMPORTANT: Auth users were created with');
  console.log('    a temporary password:');
  console.log('    TempPass_ChangeMe_2024!');
  console.log('    Ask each user to use "Forgot Password"');
  console.log('    to set their own password.');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Import failed:', err.message);
  process.exit(1);
});
