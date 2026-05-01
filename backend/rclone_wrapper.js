// ============================================================
// Rclone Storage Wrapper — Terabox Primary, Storj Backup
// ============================================================
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // Use a safe temp filename to avoid Windows path issues with emojis/special chars
        const safeTmpName = `up_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`;
        const tmpPath = path.join(tmpDir, safeTmpName);
        fs.writeFileSync(tmpPath, fileBuffer);

        const storagePath = `${BASE_PATH}/${zonaKode}/${tokoKode}/${category}/${originalName}`;
        // Important: use copyto to set the destination filename correctly even if local name is different
        const primaryDest = PRIMARY_REMOTE + ':' + storagePath;

        try {
            console.log(`[Rclone] Uploading ${originalName} to ${primaryDest}...`);
            // Upload to primary (Terabox)
            await rcloneExec(['copyto', tmpPath, primaryDest]);
            console.log(`[Rclone] Upload check success for: ${originalName}`);

            // Upload to backup (Storj) — fire and forget
            const backupDest = BACKUP_REMOTE + ':' + storagePath;
            rcloneExec(['copyto', tmpPath, backupDest]).then(() => {
                console.log(`[Rclone] Backup to storj complete.`);
            }).catch(err => {
                console.warn(`[Rclone] Backup failed (non-critical):`, err.message);
            });

            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            console.error(`[Rclone Upload Error]`, err);
            throw err;
        } finally {
            // Cleanup temp file
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) { }
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
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const tmpPath = path.join(tmpDir, originalName);
        fs.writeFileSync(tmpPath, fileBuffer);

        // Use lowercase category to match existing folders
        const storagePath = `/ads-media/${category}/${originalName}`;
        const primaryDest = `${PRIMARY_REMOTE}:/ads-media/${category}/`;

        try {
            await rcloneExec(['copy', tmpPath, primaryDest, '--no-traverse']);
            console.log(`[Rclone] Media uploaded: ${storagePath}`);

            // Backup (fire and forget)
            const backupDest = `${BACKUP_REMOTE}:/ads-media/${category}/`;
            rcloneExec(['copy', tmpPath, backupDest, '--no-traverse']).catch(err => {
                console.warn(`[Rclone] Media backup failed (non-critical):`, err.message);
            });

            return { storagePath, size: fileBuffer.length };
        } finally {
            try { fs.unlinkSync(tmpPath); } catch (_) { }
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
