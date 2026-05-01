// Quick migration script to create ads_media table
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
    console.log('Running ads_media migration...');

    const { error } = await supabase.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS ads_media (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                nama_file TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                category TEXT DEFAULT 'lainnya',
                deskripsi TEXT,
                ukuran_bytes BIGINT DEFAULT 0,
                uploaded_by UUID REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT now(),
                deleted_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_ads_media_category ON ads_media(category);
            CREATE INDEX IF NOT EXISTS idx_ads_media_deleted ON ads_media(deleted_at);
            ALTER TABLE ads_media DISABLE ROW LEVEL SECURITY;
        `
    });

    if (error) {
        // If RPC doesn't exist, try direct SQL via REST
        console.log('RPC not available, trying direct table check...');

        // Check if table already exists
        const { data, error: checkErr } = await supabase
            .from('ads_media')
            .select('id')
            .limit(1);

        if (checkErr && checkErr.code === '42P01') {
            console.error('Table does not exist. Please run the SQL migration manually in Supabase SQL Editor:');
            console.log('File: sql/ads_media_migration.sql');
        } else if (checkErr) {
            console.error('Error:', checkErr.message);
        } else {
            console.log('✅ Table ads_media already exists!');
        }
    } else {
        console.log('✅ Migration complete!');
    }
}

migrate().catch(console.error);
