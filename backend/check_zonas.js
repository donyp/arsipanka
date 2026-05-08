const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkZonas() {
    const { data, error } = await supabase
        .from('zonas')
        .select('*')
        .order('id');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Columns:', Object.keys(data[0]));
    console.log('');
    data.forEach(z => {
        console.log('Zona ' + z.id + ': ' + z.nama + ' | wa: ' + (z.wa_recipient || 'NOT SET'));
    });
}

checkZonas();
