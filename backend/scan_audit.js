require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function scan() {
    const fromTime = new Date(Date.now() - 3600000).toISOString(); // Last 1 hour
    console.log("Scanning from:", fromTime);

    const { data: batches } = await supabase.from('upload_batches').select('*').gte('created_at', fromTime);
    console.log("Batches found:", batches.length);
    console.log(batches.map(b => ({ id: b.id, created_at: b.created_at })));

    const { data: files } = await supabase.from('files').select('nama_file, batch_id, created_at').gte('created_at', fromTime);
    console.log("Files found:", files.length);
    console.log(files.map(f => ({ file: f.nama_file, batch: f.batch_id, created: f.created_at })));
}
scan();
