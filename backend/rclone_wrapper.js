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

const mkdirMutex = new Mutex();
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
        // storagePath is like '/ads-media/stiker/file.png'
        // We need to ensure the folder part is capitalized if it's an ads-media path
        let cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;

        if (cleanPath.startsWith('ads-media/')) {
            // No capitalization needed, folders are lowercase
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
     * @param {Buffer} fileBuffer - The file data
     * @param {string} originalName - Original file name
     * @param {string} zonaKode - e.g. 'zona-01'
     * @param {string} tokoKode - e.g. 'toko-a'
     * @param {string} category - e.g. 'PPN'
     * @returns {object} { storagePath, size }
     */
    async upload(fileBuffer, originalName, zonaKode, tokoKode, category) {
        const storagePath = `${BASE_PATH}/${zonaKode}/${tokoKode}/${category}/${originalName}`;

        try {
            console.log(`[Upload] Sending ${originalName} to Terabox via Alist API...`);

            // Use Alist REST API (Bypasses WebDAV mkParentDir 409 Conflict entirely)
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

            // 1.5 Create Parent Directory recursively using Alist mkdir
            const parentUrlPath = '/terabox' + storagePath.substring(0, storagePath.lastIndexOf('/'));

            // Fast-path: bypass Mutex and Alist checks completely if we know we already created this path this session
            if (!createdDirsCache.has(parentUrlPath)) {
                // Use Mutex to prevent race conditions when creating nested directories during bulk uploads
                await mkdirMutex.lock();
                try {
                    // Check again inside Mutex in case another concurrent request just created it
                    if (!createdDirsCache.has(parentUrlPath)) {
                        const pathParts = parentUrlPath.split('/').filter(Boolean);
                        let currentPath = '';

                        for (const part of pathParts) {
                            currentPath += '/' + part;

                            if (createdDirsCache.has(currentPath)) continue;

                            // Verify if directory exists first to avoid unnecessary Mkdirs with delays
                            const listCheck = await fetch(`${alistDomain}/api/fs/list`, {
                                method: 'POST',
                                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: currentPath, password: '', page: 1, per_page: 1 })
                            }).then(r => r.json()).catch(() => ({ code: 500 }));

                            if (listCheck.code !== 200) {
                                await fetch(`${alistDomain}/api/fs/mkdir`, {
                                    method: 'POST',
                                    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ path: currentPath })
                                });

                                // Robust loop to wait until Terabox actually registers the directory
                                let dirReady = false;
                                for (let retry = 0; retry < 5; retry++) {
                                    await new Promise(resolve => setTimeout(resolve, 800));
                                    const reCheck = await fetch(`${alistDomain}/api/fs/list`, {
                                        method: 'POST',
                                        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ path: currentPath, password: '', page: 1, per_page: 1, refresh: true })
                                    }).then(r => r.json()).catch(() => ({ code: 500 }));

                                    if (reCheck.code === 200) {
                                        dirReady = true;
                                        break;
                                    }
                                }
                                if (!dirReady) console.warn(`[Alist] Timeout wait for dir: ${currentPath}`);
                            }

                            createdDirsCache.add(currentPath);
                        }
                        createdDirsCache.add(parentUrlPath);
                    }
                } finally {
                    mkdirMutex.unlock();
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
        }
    },

    /**
     * Stream/download a file from primary storage.
     * Returns the local temp file path.
     */
    async download(storagePath) {
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const fileName = path.basename(storagePath);
        const localPath = path.join(tmpDir, `dl_${Date.now()}_${fileName}`);
        const remotePath = PRIMARY_REMOTE + ':' + storagePath;

        await rcloneExec(['copyto', remotePath, localPath]);
        return localPath;
    },

    /**
     * Delete a file from primary + backup storage.
     */
    async deleteFile(storagePath) {
        const primaryPath = PRIMARY_REMOTE + ':' + storagePath;
        const backupPath = BACKUP_REMOTE + ':' + storagePath;

        await rcloneExec(['deletefile', primaryPath]).catch(err => {
            console.warn('[Rclone] Primary delete warning:', err.message);
        });

        rcloneExec(['deletefile', backupPath]).catch(err => {
            console.warn('[Rclone] Backup delete warning (non-critical):', err.message);
        });
    },

    /**
     * List files at a given path (for sync/browse).
     */
    async listFiles(remotePath) {
        const fullPath = PRIMARY_REMOTE + ':' + remotePath;
        const raw = await rcloneExec(['lsjson', fullPath, '--no-modtime']);
        return JSON.parse(raw || '[]');
    },

    /**
     * Upload a media file (Ads) to primary storage.
     * Path: terabox:/arsip/ads-media/{category}/{filename}
     */
    async uploadMedia(fileBuffer, originalName, category) {
        // Use lowercase category to match existing folders
        const storagePath = `/ads-media/${category}/${originalName}`;

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

            // 1.5 Create Parent Directory recursively using Alist mkdir
            const parentUrlPath = '/terabox' + storagePath.substring(0, storagePath.lastIndexOf('/'));

            // Fast-path: bypass Mutex and Alist checks completely if we know we already created this path this session
            if (!createdDirsCache.has(parentUrlPath)) {
                // Use Mutex to prevent race conditions when creating nested directories during bulk uploads
                await mkdirMutex.lock();
                try {
                    // Check again inside Mutex in case another concurrent request just created it
                    if (!createdDirsCache.has(parentUrlPath)) {
                        const pathParts = parentUrlPath.split('/').filter(Boolean);
                        let currentPath = '';

                        for (const part of pathParts) {
                            currentPath += '/' + part;

                            if (createdDirsCache.has(currentPath)) continue;

                            // Verify if directory exists first to avoid unnecessary Mkdirs with delays
                            const listCheck = await fetch(`${alistDomain}/api/fs/list`, {
                                method: 'POST',
                                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: currentPath, password: '', page: 1, per_page: 1 })
                            }).then(r => r.json()).catch(() => ({ code: 500 }));

                            if (listCheck.code !== 200) {
                                await fetch(`${alistDomain}/api/fs/mkdir`, {
                                    method: 'POST',
                                    headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ path: currentPath })
                                });

                                // Robust loop to wait until Terabox actually registers the directory
                                let dirReady = false;
                                for (let retry = 0; retry < 5; retry++) {
                                    await new Promise(resolve => setTimeout(resolve, 800));
                                    const reCheck = await fetch(`${alistDomain}/api/fs/list`, {
                                        method: 'POST',
                                        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ path: currentPath, password: '', page: 1, per_page: 1, refresh: true })
                                    }).then(r => r.json()).catch(() => ({ code: 500 }));

                                    if (reCheck.code === 200) {
                                        dirReady = true;
                                        break;
                                    }
                                }
                                if (!dirReady) console.warn(`[Alist] Timeout wait for dir: ${currentPath}`);
                            }

                            createdDirsCache.add(currentPath);
                        }
                        createdDirsCache.add(parentUrlPath);
                    }
                } finally {
                    mkdirMutex.unlock();
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
        }
    },

    /**
     * Create an empty directory for a media category
     * Path: terabox:/ads-media/{category}
     */
    async createMediaFolder(category) {
        // Create directly in root /ads-media
        const primaryDest = `${PRIMARY_REMOTE}:/ads-media/${category}`;
        await rcloneExec(['mkdir', primaryDest]);
        console.log(`[Rclone] Category folder created: ${primaryDest}`);

        // Backup (fire and forget)
        const backupDest = `${BACKUP_REMOTE}:/ads-media/${category}`;
        rcloneExec(['mkdir', backupDest]).catch(() => { });
    }
};

module.exports = RcloneStorage;
