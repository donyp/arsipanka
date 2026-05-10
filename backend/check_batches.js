const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: batches, error: e1 } = await supabase.from('upload_batches').select('*');
    if (e1) console.error("Error batches:", e1);
    else console.log("Batches:", batches);

    const { data: files, error: e2 } = await supabase.from('files').select('id, nama_file, batch_id').order('created_at', { ascending: false }).limit(5);
    if (e2) console.error("Error files:", e2);
    else console.log("Last 5 files:", files);
}

check();
