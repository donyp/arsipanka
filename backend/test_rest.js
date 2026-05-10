require('dotenv').config({ path: 'backend/.env' });

async function testREST() {
    // Remove any trailing quotes from env var if they exist
    const baseUrl = process.env.SUPABASE_URL.replace(/"/g, '');
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, '');
    const url = `${baseUrl}/rest/v1/upload_batches`;
    console.log("POST", url);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': apiKey,
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            total_files: 0,
            success_files: 0
        })
    });

    const data = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", data);
}

testREST();
