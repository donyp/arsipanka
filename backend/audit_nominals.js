require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function audit() {
    const { data: files } = await supabase.from('files').select('nama_file, total_jual, created_at').order('created_at', { ascending: false }).limit(10);
    console.log(JSON.stringify(files, null, 2));
}
audit();
