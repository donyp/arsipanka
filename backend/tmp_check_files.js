const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkFiles() {
    const { data, error } = await supabase.from('files').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkFiles();
