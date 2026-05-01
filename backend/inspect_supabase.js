require('dotenv').config();
const { createClient } = require('@supabase/supabase-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkFilesSchema() {
    // We can't use PRAGMA on Supabase (Postgres), but we can try to select one row
    // and check the keys, or use a query to informational_schema
    try {
        const { data, error } = await supabase.from('files').select('*').limit(1);
        if (error) {
            console.error('Error fetching file:', error);
            // Fallback: search for column names in informational_schema via rpc or just list a few columns
            return;
        }
        if (data && data.length > 0) {
            console.log('Columns in "files" table:', Object.keys(data[0]));
        } else {
            console.log('No data in "files" table to inspect.');
            // Try another way: select a non-existent column to see the error message which might listed valid columns
            const { error: err2 } = await supabase.from('files').select('non_existent_column').limit(1);
            console.log('Error hint for columns:', err2.message);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

checkFilesSchema();
