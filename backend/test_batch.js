require('dotenv').config({ path: 'backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
    // First let's get a real uploader_id to avoid FK errors
    const { data: users, error: errU } = await supabase.from('users').select('id').limit(1);
    if (errU || !users.length) {
        console.error("Failed to fetch user:", errU);
        return;
    }
    const realUserId = users[0].id;
    console.log("Using User ID:", realUserId);

    const check = {
        uploader_id: realUserId,
        total_files: 0,
        success_files: 0
        // removed uploader_name because it doesn't exist
    };

    console.log("Payload:", check);
    const { data, error } = await supabase.from('upload_batches').insert(check).select().single();

    if (error) {
        console.error("\n[CRITICAL ERROR INSERTING BATCH]:", JSON.stringify(error, null, 2));
    } else {
        console.log("\n[SUCCESS]:", data);
    }
}

testInsert();
