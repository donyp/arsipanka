const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUsers() {
    const { data: users, error } = await supabase
        .from('users')
        .select('*');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log('--- Users and Permissions ---');
    users.forEach(u => {
        console.log(`User: ${u.username} (${u.role})`);
        console.log(`Permissions: ${JSON.stringify(u.permissions)}`);
        console.log('---');
    });
}

checkUsers();
