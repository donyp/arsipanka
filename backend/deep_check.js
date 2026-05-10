require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL.replace(/"/g, ''), process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, ''));

// Forge User
const forgedUser = {
    userId: 'd0548d41-c30f-4d73-9127-12f974349091',
    email: 'adminpuput',
    role: 'super_admin'
};

async function checkInsert() {
    console.log("Checking insert for:", forgedUser.email);
    const { data, error } = await supabase
        .from('upload_batches')
        .insert({
            uploader_id: forgedUser.userId,
            total_files: 0,
            success_files: 0
        })
        .select()
        .single();

    if (error) {
        console.error("DB INSERT ERROR:", JSON.stringify(error, null, 2));
    } else {
        console.log("DB INSERT SUCCESS:", data);
    }
}
checkInsert();
