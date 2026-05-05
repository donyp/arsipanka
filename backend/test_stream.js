const RcloneStorage = require('./rclone_wrapper');

async function test(storagePath) {
    try {
        console.log('Testing path:', storagePath);
        const rawUrl = await RcloneStorage.getRawUrl(storagePath);
        console.log('Raw URL generated:', rawUrl);

        // Check if rawUrl looks valid
        if (!rawUrl || !rawUrl.startsWith('http')) {
            console.error('Invalid URL format!');
            return;
        }

        console.log('Testing stream (first 100 bytes)...');
        const proc = await RcloneStorage.stream(storagePath);

        return new Promise((resolve) => {
            let dataSize = 0;
            let stderr = '';

            proc.stdout.on('data', (d) => {
                dataSize += d.length;
                if (dataSize < 100) console.log('Chunk received, size so far:', dataSize);
            });

            proc.stderr.on('data', (d) => {
                stderr += d.toString();
            });

            proc.on('close', (code) => {
                console.log('Rclone exited with code:', code);
                if (code !== 0) console.error('Stderr:', stderr);
                console.log('Total data received:', dataSize);
                resolve();
            });

            // Timeout after 10s
            setTimeout(() => {
                proc.kill();
                resolve();
            }, 10000);
        });

    } catch (err) {
        console.error('Diagnostic failed:', err.message);
    }
}

// Test with a known file path from the screenshot or typical path
const testPath = process.argv[2] || '/arsip/zona-15/TOKO-KAYU-PUTIH/INVOICE/NON KAYUPUTIH 2.601.600 28 FEB.pdf';
test(testPath);
