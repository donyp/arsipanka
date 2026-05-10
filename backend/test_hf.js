const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'backend/.env' });

const adminLogin = async () => {
    console.log("Faking JWT from .env...");
    // Just a dummy payload with valid permissions
    const payload = {
        userId: 'f8b1db5d-9b16-4af5-b1a1-9a74aa9a7b93', // dummy uuid
        email: 'adminpuput',
        role: 'super_admin',
        zona_id: 1,
        name: 'Puput',
        permissions: ["upload_single", "upload_batch"]
    };

    // JWT_SECRET="arsip-digital-super-secret-jwt-key-2026-change-me"
    const secret = process.env.JWT_SECRET.replace(/"/g, '');
    const token = jwt.sign(payload, secret);

    console.log("Attempting to create batch on HF server...");
    const batchRes = await fetch('https://ankaindonesia-arsip.hf.space/api/batches', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
    });

    console.log("Batch POST Status:", batchRes.status);
    console.log("Batch POST Response:", await batchRes.text());
};
adminLogin();
