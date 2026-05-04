// ============================================================
// Rclone Storage Wrapper — Terabox Primary, Storj Backup
// ============================================================
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class Mutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
    lock() {
        return new Promise(resolve => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
    unlock() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
}

const globalUploadMutex = new Mutex();
const createdDirsCache = new Set();

// Rclone remote names (must match rclone.conf)
const PRIMARY_REMOTE = process.env.RCLONE_PRIMARY_REMOTE || 'terabox';
const BACKUP_REMOTE = process.env.RCLONE_BACKUP_REMOTE || 'storj';
const BASE_PATH = process.env.RCLONE_BASE_PATH || '/arsip';

/**
 * Execute an rclone command and return a promise.
 */
function rcloneExec(args) {
    return new Promise((resolve, reject) => {
        // Linux standard binary 'rclone' (installed via apt) or local binary
        const isWindows = process.platform === 'win32';
        const rclonePath = isWindows ? path.join(__dirname, '..', 'rclone.exe') : 'rclone';
        const configPath = process.env.RCLONE_CONFIG || path.join(__dirname, '..', 'rclone.conf');
        const finalArgs = ['--config', configPath, ...args];

        execFile(rclonePath, finalArgs, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Rclone Error]', stderr || error.message);
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout.trim());
        });
    });
}

function rcloneSpawn(args) {
    const isWindows = process.platform === 'win32';
    const rclonePath = isWindows ? path.join(__dirname, '..', 'rclone.exe') : 'rclone';
    const configPath = process.env.RCLONE_CONFIG || path.join(__dirname, '..', 'rclone.conf');
    const finalArgs = ['--config', configPath, ...args];
    const logMsg = `[Rclone Spawn] ${rclonePath} ${finalArgs.join(' ')}\n`;
    const logPath = path.join(__dirname, 'debug_rclone_spawn.log');
    try { fs.appendFileSync(logPath, logMsg); } catch (_) { }
    console.log('[Rclone Spawn]', finalArgs.join(' '));
    return spawn(rclonePath, finalArgs);
}

const RcloneStorage = {
    /**
     * Stream a file from primary storage (Terabox) directly.
     * Uses 'rclone cat' to output to stdout.
     */
    stream(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

        if (cleanPath.startsWith('ads-media/')) {
            const parts = cleanPath.split('/');
            if (parts.length >= 3) {
                cleanPath = parts.join('/');
            }
        }

        const fullPath = PRIMARY_REMOTE + ':/' + cleanPath;
        return rcloneSpawn(['cat', fullPath]);
    },

    /**
     * Build the full remote path: terabox:/arsip/zona-01/toko-a/PPN/file.pdf
     */
    buildPath(remote, zonaKode, tokoKode, category, fileName) {
        const parts = [remote + ':' + BASE_PATH];
        if (zonaKode) parts.push(zonaKode);
        if (tokoKode) parts.push(tokoKode);
        if (category) parts.push(category);
        if (fileName) parts.push(fileName);
        return parts.join('/');
    },

    /**
     * Upload a file buffer to primary storage (Terabox) and optional backup (Storj).
     */
    async upload(fileBuffer, originalName, zonaKode, tokoKode, category) {
        const storagePath = `${BASE_PATH}/${zonaKode}/${tokoKode}/${category}/${originalName}`;

        await globalUploadMutex.lock();
        try {
            console.log(`[Upload] Sending ${originalName} to Terabox via Alist API...`);

            const alistDomain = 'http://127.0.0.1:5244';

            // 1. Get Token
            const tokenResponse = await fetch(`${alistDomain}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'AdminArsip2026!' })
            });
            const tokenData = await tokenResponse.json();
            const token = tokenData.data?.token;
            if (!token) throw new Error('Alist login failed: ' + tokenData.message);

            // 1.5 Create Parent Directory using robust rclone mkdir
            const parentFolderPath = storagePath.substring(0, storagePath.lastIndexOf('/'));

            if (!createdDirsCache.has(parentFolderPath)) {
                console.log(`[Upload] Ensuring directory exists: ${parentFolderPath}`);
                try {
                    // rclone mkdir handles recursive creation natively and is extremely robust.
                    // With globalUploadMutex, we are safe from concurrent 409 Conflicts.
                    await rcloneExec(['mkdir', `${PRIMARY_REMOTE}:${parentFolderPath}`]);
                    createdDirsCache.add(parentFolderPath);
                } catch (err) {
                    // If error is 409 Conflict, it usually means the folder already exists or is being synced.
                    // We can proceed to 'put' the file regardless.
                    if (err.message.includes('409 Conflict')) {
                        console.warn(`[Upload] Directory conflict (409) for ${parentFolderPath}, continuing...`);
                        createdDirsCache.add(parentFolderPath);
                    } else {
                        throw err;
                    }
                }
            }

            // 2. Put File directly via Alist API
            const putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'File-Path': encodeURIComponent('/terabox' + storagePath)
                },
                body: fileBuffer
            });
            const putData = await putResponse.json();
            if (putData.code !== 200) throw new Error('Alist API upload failed: ' + putData.message);

            console.log(`[Upload] Alist API upload success for: ${originalName}`);

            // Backup to Storj (fire and forget via rcat)
            const backupDest = `${BACKUP_REMOTE}:${storagePath}`;
            const backupPromise = new Promise((resolve, reject) => {
                const isWindows = process.platform === 'win32';
                const rclonePath = isWindows ? path.join(__dirname, '..', 'rclone.exe') : 'rclone';
                const configPath = process.env.RCLONE_CONFIG || path.join(__dirname, '..', 'rclone.conf');
                const child = spawn(rclonePath, ['--config', configPath, 'rcat', backupDest]);
                child.on('close', (code) => code === 0 ? resolve() : reject(new Error('Backup rcat failed')));
                child.on('error', reject);
                child.stdin.write(fileBuffer);
                child.stdin.end();
            });
            backupPromise
                .then(() => console.log(`[Rclone] Backup to storj complete.`))
                .catch(err => console.warn(`[Rclone] Backup failed (non-critical):`, err.message));

            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            console.error(`[Upload Error]`, err);
            throw err;
        } finally {
            globalUploadMutex.unlock();
        }
    },

    /**
     * Upload a media file (Ads) to primary storage.
     */
    async uploadMedia(fileBuffer, originalName, category) {
        const storagePath = `/ads-media/${category}/${originalName}`;

        await globalUploadMutex.lock();
        try {
            console.log(`[Upload] Sending Media ${originalName} to Terabox via Alist API...`);

            const alistDomain = 'http://127.0.0.1:5244';

            // 1. Get Token
            const tokenResponse = await fetch(`${alistDomain}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'AdminArsip2026!' })
            });
            const tokenData = await tokenResponse.json();
            const token = tokenData.data?.token;
            if (!token) throw new Error('Alist login failed: ' + tokenData.message);

            // 1.5 Create Parent Directory using robust rclone mkdir
            const parentFolderPath = storagePath.substring(0, storagePath.lastIndexOf('/'));

            if (!createdDirsCache.has(parentFolderPath)) {
                console.log(`[Upload] Ensuring Media directory exists: ${parentFolderPath}`);
                try {
                    await rcloneExec(['mkdir', `${PRIMARY_REMOTE}:${parentFolderPath}`]);
                    createdDirsCache.add(parentFolderPath);
                } catch (err) {
                    if (err.message.includes('409 Conflict')) {
                        console.warn(`[Upload Media] Directory conflict (409) for ${parentFolderPath}, continuing...`);
                        createdDirsCache.add(parentFolderPath);
                    } else {
                        throw err;
                    }
                }
            }

            // 2. Put File directly
            const putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'File-Path': encodeURIComponent('/terabox' + storagePath)
                },
                body: fileBuffer
            });
            const putData = await putResponse.json();
            if (putData.code !== 200) throw new Error('Alist API upload failed: ' + putData.message);

            console.log(`[Upload] Media API upload success for: ${originalName}`);

            // Backup (fire and forget via rcat)
            const backupDest = `${BACKUP_REMOTE}:${storagePath}`;
            const backupPromise = new Promise((resolve, reject) => {
                const isWindows = process.platform === 'win32';
                const rclonePath = isWindows ? path.join(__dirname, '..', 'rclone.exe') : 'rclone';
                const configPath = process.env.RCLONE_CONFIG || path.join(__dirname, '..', 'rclone.conf');
                const child = spawn(rclonePath, ['--config', configPath, 'rcat', backupDest]);
                child.on('close', (code) => code === 0 ? resolve() : reject(new Error('Backup rcat failed')));
                child.on('error', reject);
                child.stdin.write(fileBuffer);
                child.stdin.end();
            });
            backupPromise.catch(err => console.warn(`[Rclone] Media backup failed:`, err.message));

            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            console.error(`[Upload Media Error]`, err);
            throw err;
        } finally {
            globalUploadMutex.unlock();
        }
    },

    /**
     * Create an empty directory for a media category
     */
    async createMediaFolder(category) {
        const primaryDest = `${PRIMARY_REMOTE}:/ads-media/${category}`;
        await rcloneExec(['mkdir', primaryDest]);
        console.log(`[Rclone] Category folder created: ${primaryDest}`);

        // Backup
        const backupDest = `${BACKUP_REMOTE}:/ads-media/${category}`;
        rcloneExec(['mkdir', backupDest]).catch(() => { });
    },

    /**
     * Stream/download a file from primary storage.
     */
    async download(storagePath) {
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const tempFilePath = path.join(tmpDir, `download-${Date.now()}-${path.basename(storagePath)}`);
        await rcloneExec(['copyto', `${PRIMARY_REMOTE}:${storagePath}`, tempFilePath]);
        return tempFilePath;
    }
};

module.exports = RcloneStorage;
