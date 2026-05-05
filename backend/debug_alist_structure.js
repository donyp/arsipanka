const fetch = require('node-fetch');

async function debugList() {
    const alistDomain = 'http://127.0.0.1:5244';
    const adminPassword = 'AdminArsip2026!';

    console.log('Logging in...');
    const loginRes = await fetch(`${alistDomain}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: adminPassword })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;

    if (!token) {
        console.error('Login failed');
        return;
    }

    const testPaths = ['/', '/terabox', '/terabox/arsip'];

    for (const p of testPaths) {
        console.log('Listing path:', p);
        const res = await fetch(`${alistDomain}/api/fs/list`, {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: p })
        });
        const data = await res.json();
        if (data.code === 200) {
            console.log('Found', data.data.content?.length || 0, 'items');
            if (data.data.content) {
                data.data.content.slice(0, 5).forEach(i => console.log(' -', i.name, i.is_dir ? '(DIR)' : '(FILE)'));
            }
        } else {
            console.error('Error listing', p, ':', data.message);
        }
    }
}

debugList();
