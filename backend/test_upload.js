require('dotenv').config();
const jwt = require('jsonwebtoken');
const fs = require('fs');

async function testUpload() {
    console.log('Testing upload...');
    const token = jwt.sign({ userId: 1, role: 'super_admin' }, process.env.JWT_SECRET);

    const formData = new FormData();
    formData.append('file', new Blob(['test dummy content for upload ads media']), 'test_dummy.mp4');
    formData.append('category', 'footage');

    try {
        const res = await fetch('http://localhost:4000/api/ads-media/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const text = await res.text();
        console.log('STATUS:', res.status);
        console.log('RESPONSE:', text);
    } catch (err) {
        console.error('FETCH ERROR:', err);
    }
}
testUpload();
