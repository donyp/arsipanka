const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function check() {
    console.log('Checking Supabase columns for table "files"...');
    // Selecting one row to see keys
    const { data, error } = await supabase.from('files').select('*').limit(1);

    if (error) {
        console.error('Error:', error);
        // If it fails with "column does not exist" in a select *, that's very strange.
        // Let's try to get a list of columns from a known successful query
        return;
    }

    if (data && data.length > 0) {
        console.log('SUCCESS! Found columns:', Object.keys(data[0]));
    } else {
        console.log('Table "files" is empty. Trying to force an error to see column list...');
        const { error: err2 } = await supabase.from('files').select('non_existent_column');
        console.log('Error hint:', err2.message);
    }
}

check();
