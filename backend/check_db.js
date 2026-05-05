const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Try to load from .env manually since I might not have dotenv
const envPath = path.join(__dirname, '.env');
const env = fs.readFileSync(envPath, 'utf8');
const lines = env.split('\n');
const config = {};
lines.forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) config[parts[0].trim()] = parts[1].trim();
});

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

async function check() {
    console.log('Checking database...');
    const { data, error } = await supabase
        .from('files')
        .select('id, nama_file, ukuran_bytes')
        .is('deleted_at', null)
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Sample Data:');
    data.forEach(f => {
        console.log(`- ${f.nama_file}: ${f.ukuran_bytes} bytes`);
    });

    const { data: totalData } = await supabase
        .from('files')
        .select('ukuran_bytes')
        .is('deleted_at', null);

    const totalCount = totalData.length;
    const totalBytes = totalData.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
    const nullCount = totalData.filter(f => f.ukuran_bytes === null).length;

    console.log('\nSummary:');
    console.log('Total Active Files:', totalCount);
    console.log('Total Bytes:', totalBytes);
    console.log('Files with NULL size:', nullCount);
}

check();
