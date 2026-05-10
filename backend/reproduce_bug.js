const jwt = require('jsonwebtoken');
require('dotenv').config({ path: '.env' });

// 1. Get Secret
const secret = (process.env.JWT_SECRET || '').replace(/"/g, '');

// 2. Forge Token for adminpuput (ID found in diag)
const payload = {
    userId: 'd0548d41-c30f-4d73-9127-12f974349091',
    email: 'adminpuput',
    role: 'super_admin',
    zona_id: 1,
    name: 'Puput',
    permissions: []
};
const token = jwt.sign(payload, secret);

async function reproduce() {
    const port = process.env.PORT || 4000;
    const url = `http://localhost:${port}/api/batches`;

    console.log("POSTing to", url);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });

        console.log("Status:", res.status);
        console.log("Response:", await res.json());
    } catch (e) {
        console.error("REPRODUCE ERROR:", e.message);
    }
}

reproduce();
