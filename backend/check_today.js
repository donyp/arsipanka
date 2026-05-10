require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function checkToday() {
    const today = new Date().toISOString().split('T')[0];
    console.log("Checking files for:", today);

    const { data, error } = await supabase
        .from('files')
        .select('*')
        .gte('created_at', today)
        .order('created_at', { ascending: false });

    if (error) console.error(error);
    console.log(`Found ${data?.length || 0} files.`);
    console.log(data);
}
checkToday();
