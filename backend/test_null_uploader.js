require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

async function checkSchema() {
    // Try to insert a row with NULL uploader_id to see if it's allowed
    const { data, error } = await supabase.from('upload_batches').insert({
        uploader_id: null,
        total_files: 10,
        success_files: 5
    }).select();

    if (error) {
        console.log("Insert with NULL uploader_id FAILED:", error.message);
    } else {
        console.log("Insert with NULL uploader_id SUCCEEDED:", data);
    }
}
checkSchema();
