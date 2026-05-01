const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const RcloneStorage = require('./rclone_wrapper');

async function test() {
    try {
        console.log('Environment Remote:', process.env.RCLONE_PRIMARY_REMOTE);
        console.log('Environment Base Path:', process.env.RCLONE_BASE_PATH);

        const buffer = Buffer.from('test encryption content ' + new Date().toISOString());
        const originalName = 'test_security_check.pdf';

        const result = await RcloneStorage.upload(buffer, originalName, 'zona-00', 'toko-00', 'SECURITY');
        console.log('Upload Success:', result);

        // Verify listing through crypt
        const list = await RcloneStorage.listFiles('/zona-00/toko-00/SECURITY');
        console.log('List through Crypt:', list);

    } catch (err) {
        console.error('Test Failed:', err);
    }
}

test();
