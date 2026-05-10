require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function checkBatchTypes() {
    console.log("Checking batch_id types...");

    // Check upload_batches sample
    const { data: sampleBatch, error: bErr } = await supabase.from('upload_batches').select('*').limit(1);
    if (bErr) console.log("Batch Error:", bErr.message);
    else console.log("Sample Batch Record:", sampleBatch);

    const { data: sampleFiles, error: fErr } = await supabase.from('files').select('nama_file, batch_id').not('batch_id', 'is', null).limit(1);
    if (fErr) console.log("File Error:", fErr.message);
    else console.log("Sample File Record with batch_id:", sampleFiles);
}
checkBatchTypes();
