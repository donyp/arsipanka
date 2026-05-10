/**
 * Migration: Create upload_batches table and add batch_id to files
 * Uses direct fetch to Supabase's SQL endpoint
 */
require('dotenv').config({ path: './backend/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSQL(sql) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    return resp;
}

async function migrate() {
    console.log('Attempting migration via PostgREST...');

    // Try creating table by inserting into it (if it exists, great)
    // First, let's check if upload_batches exists by trying to select from it
    const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/upload_batches?select=id&limit=1`, {
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
        }
    });

    if (checkResp.status === 200) {
        console.log('upload_batches table already exists!');
    } else {
        console.log('upload_batches table does NOT exist yet.');
        console.log('');
        console.log('====================================');
        console.log('Please run the following SQL in Supabase SQL Editor:');
        console.log('====================================');
        console.log(`
CREATE TABLE IF NOT EXISTS upload_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
    uploader_name TEXT,
    total_files INT DEFAULT 0,
    success_files INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE upload_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE files ADD COLUMN IF NOT EXISTS batch_id UUID;
`);
        return false;
    }

    // Check if batch_id column exists on files
    const checkFiles = await fetch(`${SUPABASE_URL}/rest/v1/files?select=batch_id&limit=1`, {
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
        }
    });

    if (checkFiles.status === 200) {
        console.log('batch_id column already exists on files!');
    } else {
        console.log('batch_id column does NOT exist on files yet.');
        console.log('Please add it via Supabase SQL Editor:');
        console.log('ALTER TABLE files ADD COLUMN IF NOT EXISTS batch_id UUID;');
        return false;
    }

    console.log('All migrations verified!');
    return true;
}

migrate();
