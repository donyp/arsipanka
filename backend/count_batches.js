require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function countRows() {
    const { data, count, error } = await supabase
        .from('upload_batches')
        .select('*', { count: 'exact' });

    console.log("Total Batches:", count);
    console.log("Rows Data (IDs):", data.map(r => r.id));
}
countRows();
