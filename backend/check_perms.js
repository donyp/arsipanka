require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function checkPerms() {
    const { data: users, error } = await supabase.from('users').select('email, role, permissions');
    console.log(users);
}
checkPerms();
