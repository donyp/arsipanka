require('dotenv').config({ path: 'backend/.env' });

async function getUsers() {
    const baseUrl = process.env.SUPABASE_URL.replace(/"/g, '');
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, '');

    const res = await fetch(`${baseUrl}/rest/v1/users?select=email`, {
        headers: { 'apikey': apiKey, 'Authorization': `Bearer ${apiKey}` }
    });
    console.log(await res.json());
}
getUsers();
