const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function grantPermissions() {
    console.log('Granting permissions to admin_zona users...');

    // Add bulk_download, view_piutang, upload_batch, upload_single
    const { data, error } = await supabase
        .from('users')
        .update({ permissions: ['bulk_download', 'view_piutang', 'upload_batch', 'upload_single'] })
        .eq('role', 'admin_zona');

    if (error) {
        console.error('Error updating permissions:', error);
    } else {
        console.log('Successfully updated permissions for admin_zona users.');
    }
}

grantPermissions();
