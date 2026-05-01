const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractDate(name) {
    if (!name) return null;
    const months = {
        'JAN': '01', 'FEB': '02', 'PEB': '02', 'MAR': '03', 'APR': '04',
        'MEI': '05', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGU': '08',
        'AUG': '08', 'SEP': '09', 'OKT': '10', 'OCT': '10', 'NOV': '11',
        'NOP': '11', 'DES': '12', 'DEC': '12'
    };
    const regex = /(\d{1,2})\s+([A-Z]{3})/i;
    const match = name.match(regex);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthAbbr = match[2].toUpperCase();
        const month = months[monthAbbr];
        if (month) {
            const year = new Date().getFullYear();
            return `${year}-${month}-${day}`;
        }
    }
    return null;
}

async function fixDates() {
    console.log('Fetching files with missing tanggal_dokumen...');
    const { data: files, error } = await supabase
        .from('files')
        .select('id, nama_file, created_at')
        .is('tanggal_dokumen', null);

    if (error) {
        console.error('Error fetching files:', error);
        return;
    }

    console.log(`Found ${files.length} files to process.`);

    for (const file of files) {
        const parsedDate = extractDate(file.nama_file);
        const finalDate = parsedDate || file.created_at.split('T')[0];

        console.log(`Updating "${file.nama_file}" -> ${finalDate}`);

        const { error: updateError } = await supabase
            .from('files')
            .update({ tanggal_dokumen: finalDate })
            .eq('id', file.id);

        if (updateError) {
            console.error(`Failed to update ${file.id}:`, updateError);
        }
    }

    console.log('Migration complete!');
}

fixDates();
