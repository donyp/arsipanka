require('dotenv').config({ path: 'backend/.env' });

async function diagnostic() {
    const baseUrl = process.env.SUPABASE_URL.replace(/"/g, '');
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, '');

    // Check batches
    const resB = await fetch(`${baseUrl}/rest/v1/upload_batches?select=*`, {
        headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    });
    const batches = await resB.json();
    console.log("=== BATCHES ===");
    console.log(batches);

    // Check files
    const resF = await fetch(`${baseUrl}/rest/v1/files?select=id,nama_file,batch_id,created_at&order=created_at.desc&limit=5`, {
        headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    });
    const files = await resF.json();
    console.log("\n=== FILES ===");
    console.log(files);
}

diagnostic();
