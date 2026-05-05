const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectSchema() {
    // Check if column exists by trying to select it or using RPC if available
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error) {
        console.error('Error inspecting users table:', error);
        return;
    }
    console.log('Columns in users table:', Object.keys(data[0]));

    // Check if bulk_download permission is missing
    const { data: users } = await supabase.from('users').select('email, role, permissions');
    console.log('\nCurrent User Permissions:');
    users.forEach(u => {
        console.log(`- ${u.email} (${u.role}): ${JSON.stringify(u.permissions)}`);
    });
}

inspectSchema();
