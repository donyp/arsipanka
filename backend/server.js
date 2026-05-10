// ============================================================
// Arsip Digital Backend â€” JWT Auth + Rclone Storage
// ============================================================
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const archiver = require('archiver');
const RcloneStorage = require('./rclone_wrapper');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontend from root
app.use(express.static(path.join(__dirname, '..')));

// Version Header
app.use((req, res, next) => {
    res.setHeader('X-Backend-Version', '2.0.1-fixed');
    next();
});

app.get('/api/heartbeat', (req, res) => res.json({ status: 'alive', version: '2.0.1-fixed' }));
// Supabase Admin Client (for DB access, not for auth)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Multer config (memory storage for streaming to Rclone)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PDF yang diizinkan'), false);
        }
    }
});

// Multer config for Ads Media (accepts images, videos, design files)
const uploadMediaMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for media
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-very-long-random-string';
const JWT_EXPIRES_IN = '8h';

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

/**
 * Verify JWT token from Authorization header.
 * Populates req.user = { userId, email, role, zona_id }
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // Allow token from Header OR Query Parameter (?token=...)
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
        }
        // --- BYPASS CONSTRAINT CHECK: Elevate to moderator dynamically ---
        if (decoded.permissions && decoded.permissions.includes('IS_MODERATOR')) {
            decoded.role = 'moderator';
        }

        req.user = decoded;

        // Session Heartbeat (Asynchronous)
        const sessionId = req.headers['x-session-id'];
        if (sessionId) {
            supabase.from('active_sessions')
                .update({ last_active: new Date().toISOString() })
                .eq('session_id', sessionId)
                .then(({ error }) => {
                    if (error) console.warn('[HEARTBEAT] Error:', error.message);
                });
        }

        next();
    });
}

/**
 * RBAC Middleware â€” restrict routes to specific roles.
 */
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini.' });
        }
        next();
    };
}

// Granular Permission Middleware
function requirePermission(perm) {
    return (req, res, next) => {
        if (req.user.role === 'moderator') return next();
        if (req.user.role === 'super_admin' && perm !== 'manage_users') return next();
        const perms = req.user.permissions || [];
        if (perms.includes(perm)) return next();
        return res.status(403).json({ error: `Akses ditolak. Dibutuhkan izin khusus: ${perm}` });
    };
}

// Any Upload Permission Middleware
function requireUploadPermission(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next();
    const perms = req.user.permissions || [];
    if (perms.includes('upload_single') || perms.includes('upload_batch')) return next();
    return res.status(403).json({ error: 'Anda tidak memiliki akses untuk mengunggah file.' });
}

function authorizeZone(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next(); // Bypass

    const requestedZona = req.query.zona_id || req.body?.zona_id || req.params?.zona_id;
    if (requestedZona && parseInt(requestedZona) !== req.user.zona_id) {
        return res.status(403).json({ error: 'Anda tidak memiliki akses ke zona ini.' });
    }
    next();
}

// [DISABLED] Automatic WA Notification System removed — replaced by manual copy-paste notice system.

// ============================================================
// AUTH ENDPOINTS
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email dan password wajib diisi.' });
        }

        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('*, zonas(kode, nama)')
            .eq('email', email.toLowerCase().trim())
            .eq('is_active', true)
            .single();

        if (error) console.error("Supabase Error during login:", error);
        if (!user) console.error("User not found for email:", email);

        if (error || !user) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        // Check Session Limit for Admin Zona
        const { data: activeSessions, error: sessionError } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('user_id', user.id);

        if (sessionError) console.error("[SESSION] Check Error:", sessionError);

        if (user.role === 'admin_zona' && activeSessions && activeSessions.length >= 2) {
            const { session_id } = req.body;
            const currentSession = activeSessions.find(s => s.session_id === session_id);

            if (!currentSession) {
                return res.status(403).json({
                    error: 'Sesi Terbatas: Akun ini sudah aktif di 2 perangkat lain. Silakan logout dari perangkat sebelumnya.'
                });
            }
        }

        // Generate JWT
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            zona_id: user.zona_id,
            name: user.name,
            permissions: user.permissions || []
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Upsert Session
        const { session_id } = req.body;
        if (session_id) {
            await supabase
                .from('active_sessions')
                .upsert({
                    user_id: user.id,
                    session_id: session_id,
                    user_agent: req.headers['user-agent'] || 'Unknown',
                    last_active: new Date().toISOString()
                }, { onConflict: 'session_id' });
        }

        // Audit with detailed info
        const userAgent = req.headers['user-agent'] || 'Unknown';
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'Login',
            context: JSON.stringify({
                ip: req.ip,
                ua: userAgent,
                status: 'Success'
            })
        });



        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                zona_id: user.zona_id
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error saat login.' });
    }
});

// POST /api/auth/logout (stateless â€” just for audit logging)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    await supabase.from('audit_logs').insert({
        user_id: req.user.userId,
        action: 'Logout',
        context: 'User logged out'
    });
    res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me â€” get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, contact_email, name, role, zona_id, toko_id, is_active, permissions, zonas(kode, nama)')
            .eq('id', req.user.userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User tidak ditemukan.' });
        }

        res.json({ user });

        // POST /api/logout â€” Terminate session
        app.post('/api/logout', authenticateToken, async (req, res) => {
            try {
                const { session_id } = req.body;
                if (session_id) {
                    await supabase.from('active_sessions').delete().eq('session_id', session_id);
                }
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// ============================================================
// FILES ENDPOINTS
// ============================================================

// GET /api/files â€” list files (auto-filtered by zona for admin_zona)
app.get('/api/files', authenticateToken, authorizeZone, async (req, res) => {
    try {
        let query = supabase
            .from('files')
            .select('*, zonas(kode, nama), toko(kode, nama)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        // Auto-filter by zona for admin_zona
        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id)
                .eq('category', 'INVOICE'); // Strict: admin_zona only sees INVOICE category
        } else if (req.query.zona_id) {
            // Super admin can filter optionally
            query = query.eq('zona_id', parseInt(req.query.zona_id));
        }

        // Category filter
        if (req.query.category) {
            query = query.eq('category', req.query.category);
        }

        // Toko filter
        if (req.query.toko_id) {
            query = query.eq('toko_id', parseInt(req.query.toko_id));
        }

        // Filter by Tipe PPN (PPN/NON)
        if (req.query.tipe_ppn) {
            query = query.eq('tipe_ppn', req.query.tipe_ppn);
        }

        // Search
        if (req.query.search) {
            query = query.ilike('nama_file', `%${req.query.search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ files: data || [] });

    } catch (err) {
        console.error('List Files Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar file.' });
    }
});

// GET /api/files/trash — list deleted files
app.get('/api/files/trash', authenticateToken, requirePermission('restore_trash'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('files')
            .select('*, zonas(kode, nama), toko(kode, nama), users!deleted_by(name)')
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false });

        if (error) throw error;

        // Fallback for "Unknown" if deleted_by is NULL or user deleted
        const filesWithFallback = (data || []).map(f => {
            let userName = 'Admin (System)';
            if (f.users && f.users.name) {
                userName = f.users.name;
            }
            return {
                ...f,
                display_name: userName, // Explicit helper field
                users: f.users || { name: userName }
            };
        });

        res.json({ files: filesWithFallback });
    } catch (err) {
        console.error('Trash List Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar sampah.' });
    }
});


// GET /api/files/:id/view â€” return file for PDF.js viewer
app.get('/api/files/:id/view', authenticateToken, async (req, res) => {
    try {
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Stream directly from Alist via Fetch Proxy
        let fileStream;
        try {
            fileStream = await RcloneStorage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Alist Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal memuat data dari storage.' });
        }

        // Mark as read
        await supabase.from('files').update({ status: 'Read' }).eq('id', file.id);

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'View File',
            context: `Viewed ${file.nama_file}`
        });

        // Dynamic Mime Type handling
        const ext = file.nama_file.split('.').pop().toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (['jpg', 'jpeg', 'jpe'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Stream error]', err);
            if (!res.headersSent) res.status(500).send('Stream error');
        });

    } catch (err) {
        console.error('View File Absolute Error:', err);
        res.status(500).json({ error: 'Gagal menampilkan file: ' + err.message });
    }
});

// GET /api/files/:id/download â€” download file
app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
    try {
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Stream directly
        let fileStream;
        try {
            fileStream = await RcloneStorage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Alist Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Stream Error]', err);
        });

    } catch (err) {
        console.error('Download File Error:', err);
        res.status(500).json({ error: 'Gagal download file.' });
    }
});

// Alias for sequential download (1-3 files) used by frontend
app.get('/api/files/download/:id', authenticateToken, (req, res) => {
    // Redirect or just call the same logic
    res.redirect(`/api/files/${req.params.id}/download?token=${req.query.token}`);
});

// --- Helper for Filename Scanning (Direct Scan Logic) ---
function extractMetadataFromFilename(filename) {
    const name = filename.replace(/\.pdf$/i, '').toUpperCase();
    let meta = { total: 0, tipe_ppn: 'NON' };

    // 1. Nominal Regex (e.g., 15.370.000 or 15370000)
    const priceMatch = name.match(/\d{1,3}(?:\.\d{3})+|\d{5,10}/);
    if (priceMatch) {
        meta.total = parseFloat(priceMatch[0].replace(/\./g, '')) || 0;
    }

    // 2. PPN/NON detection
    if (name.includes('PPN')) meta.tipe_ppn = 'PPN';
    else if (name.includes('NON')) meta.tipe_ppn = 'NON';

    return meta;
}

// POST /api/files/upload
app.post('/api/files/upload', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const { zona_id, toko_id, category } = req.body;
        console.log(`[Upload Audit] User: ${req.user.userId}, Body:`, { ...req.body, file: req.file?.originalname });

        if (!zona_id) {
            return res.status(400).json({ error: 'zona_id wajib diisi.' });
        }

        // Parallelize Zona/Toko lookups
        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('kode').eq('id', parseInt(zona_id)).single(),
            toko_id ? supabase.from('toko').select('kode').eq('id', parseInt(toko_id)).single() : Promise.resolve({ data: null })
        ]);

        const zona = zonaRes.data;
        if (!zona) return res.status(400).json({ error: 'Zona tidak ditemukan.' });

        let tokoKode = 'umum';
        if (tokoRes.data) tokoKode = tokoRes.data.kode;

        // Validate Date (tanggal_dokumen)
        if (req.body.tanggal_dokumen) {
            const parsedDate = Date.parse(req.body.tanggal_dokumen);
            if (isNaN(parsedDate)) {
                return res.status(400).json({ error: 'Format tanggal_dokumen tidak valid atau tidak terbaca kalender.' });
            }
        }

        // --- Duplicate Detection (Nama File + Zona) ---
        const { data: existingFile } = await supabase
            .from('files')
            .select('id')
            .eq('nama_file', req.file.originalname)
            .eq('zona_id', parseInt(zona_id))
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        if (existingFile) {
            return res.status(409).json({ error: 'File dengan nama yang sama sudah ada di zona ini.' });
        }

        // Calculate Storage Path Instantly
        const storagePath = RcloneStorage.buildStoragePath(
            zona.kode,
            tokoKode,
            category || 'PPN',
            req.file.originalname
        );
        const size = req.file.buffer.length;

        // --- RESILIENCE: Auto-Batching Fallback with In-Memory Mutex ---
        let finalBatchId = req.body.batch_id;

        // Skip auto-batching for PIUTANG category
        if (!finalBatchId && category !== 'PIUTANG') {
            console.log(`[Upload] File "${req.file.originalname}" arrived without batch_id. Finding/Creating...`);
            if (!global.batchLocks) global.batchLocks = {};
            const userLockKey = req.user.userId;

            // Wait if locked
            while (global.batchLocks[userLockKey]) {
                await new Promise(r => setTimeout(r, 50));
            }

            global.batchLocks[userLockKey] = true;
            try {
                // Double-check recent batch under lock
                const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
                const { data: recentBatch } = await supabase
                    .from('upload_batches')
                    .select('id')
                    .eq('uploader_id', req.user.userId)
                    .gte('created_at', fiveMinAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (recentBatch) {
                    finalBatchId = recentBatch.id;
                    console.log(`[Auto-Batch] Grouped into: ${finalBatchId}`);
                } else {
                    const { data: newBatch, error: bErr } = await supabase
                        .from('upload_batches')
                        .insert({ uploader_id: req.user.userId, total_files: 0, success_files: 0 })
                        .select('id')
                        .single();
                    if (bErr) throw bErr;
                    finalBatchId = newBatch.id;
                    console.log(`[Auto-Batch] Created NEW: ${finalBatchId}`);
                }
            } catch (err) {
                console.error("[Auto-Batch] Critical failure:", err.message);
                // Fallback to a random ID if everything fails, to avoid "null" batches
                finalBatchId = 'err_' + Date.now();
            } finally {
                delete global.batchLocks[userLockKey];
            }
        } else {
            // Ensure batch record exists if explicitly provided (Auto-Upsert)
            try {
                await supabase.from('upload_batches').upsert({
                    id: finalBatchId,
                    uploader_id: req.user.userId,
                    total_files: 0,
                    success_files: 0
                }, { onConflict: 'id', ignoreDuplicates: true });
            } catch (err) {
                console.warn('[Upload] Failed to auto-upsert batch record:', err.message);
            }
        }

        // --- FAIL-SAFE: Server-Side Filename Scanning ---
        const filenameMeta = extractMetadataFromFilename(req.file.originalname);

        let finalNominal = req.body.total_jual ? parseFloat(req.body.total_jual) : 0;
        if ((!finalNominal || finalNominal === 0) && filenameMeta.total > 0) {
            console.log(`[Fail-Safe] Auto-recovered Nominal: ${filenameMeta.total} from ${req.file.originalname}`);
            finalNominal = filenameMeta.total;
        }

        const finalTipePPN = req.body.tipe_ppn || filenameMeta.tipe_ppn || 'NON';

        console.log(`[Metadata] File: ${req.file.originalname} | Final Nominal: ${finalNominal} | Batch: ${finalBatchId}`);

        // Background Upload (Fire and FORGET to unblock UI)
        const fileBuffer = Buffer.from(req.file.buffer);
        RcloneStorage.uploadInBackground(
            fileBuffer,
            req.file.originalname,
            zona.kode,
            tokoKode,
            category || 'PPN'
        ).catch(err => console.error("Critical background upload error:", err));

        // Insert metadata into DB immediately so it appears on dashboard/history
        const { data: fileRecord, error: dbError } = await supabase
            .from('files')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                zona_id: parseInt(zona_id),
                toko_id: toko_id ? parseInt(toko_id) : null,
                category: category || 'PPN',
                ukuran_bytes: size,
                uploaded_by: req.user.userId,
                batch_id: finalBatchId,
                tanggal_dokumen: req.body.tanggal_dokumen,
                tipe_ppn: finalTipePPN,
                no_invoice: req.body.no_invoice,
                total_jual: finalNominal
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload File',
            context: `Uploaded ${req.file.originalname} to ${storagePath}`
        });

        // [DISABLED] WA Notification — replaced by manual copy-paste system via /api/batches

        res.json({
            success: true,
            message: 'File berhasil diupload.',
            file: fileRecord
        });

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Gagal upload file: ' + err.message });
    }
});

// DELETE /api/files/:id
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    try {
        const isHardDelete = req.query.hard === 'true';
        if (req.user.role !== 'super_admin') {
            const perms = req.user.permissions || [];
            if (isHardDelete && !perms.includes('hard_delete')) return res.status(403).json({ error: 'Akses ditolak. Butuh izin Hapus Permanen.' });
            if (!isHardDelete && !perms.includes('soft_delete')) return res.status(403).json({ error: 'Akses ditolak. Butuh izin Buang Ke Sampah.' });
        }

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Soft delete (set deleted_at)

        if (isHardDelete) {
            // FIRE AND FORGET: Delete from storage in background
            RcloneStorage.deleteFile(file.storage_path).catch(err => console.error(`[Background Delete Error] ${file.nama_file}:`, err.message));

            // Delete from DB immediately
            await supabase.from('files').delete().eq('id', file.id);

            await supabase.from('audit_logs').insert({
                user_id: req.user.userId,
                action: 'Hard Delete',
                context: `Permanently deleted ${file.nama_file}`
            });
        } else {
            // Soft delete
            await supabase.from('files')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: req.user.userId
                })
                .eq('id', file.id);

            await supabase.from('audit_logs').insert({
                user_id: req.user.userId,
                action: 'Soft Delete',
                context: `Moved ${file.nama_file} to recycle bin`
            });
        }

        res.json({ success: true, message: isHardDelete ? 'File dihapus permanen.' : 'File dipindah ke sampah.' });

    } catch (err) {
        console.error('Delete Error:', err);
        res.status(500).json({ error: 'Gagal menghapus file.' });
    }
});

// POST /api/files/bulk-delete - bulk soft delete
app.post('/api/files/bulk-delete', authenticateToken, requirePermission('soft_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        const now = new Date().toISOString();
        const { error } = await supabase
            .from('files')
            .update({ deleted_at: now })
            .in('id', ids);

        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Soft Delete',
            context: `Moved ${ids.length} files to trash`
        });

        res.json({ success: true, message: `${ids.length} file dipindahkan ke sampah.` });
    } catch (err) {
        console.error('Bulk Soft Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});

// POST /api/files/bulk-restore - bulk restore from trash
app.post('/api/files/bulk-restore', authenticateToken, requirePermission('restore_trash'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        const { error } = await supabase
            .from('files')
            .update({ deleted_at: null })
            .in('id', ids);

        if (error) throw error;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Restore',
            context: `Restored ${ids.length} files from trash`
        });

        res.json({ success: true, message: `${ids.length} file berhasil dipulihkan.` });
    } catch (err) {
        console.error('Bulk Restore Error:', err);
        res.status(500).json({ error: 'Gagal memulihkan file massal.' });
    }
});

// POST /api/files/bulk-trash-delete - bulk permanent delete
app.post('/api/files/bulk-trash-delete', authenticateToken, requirePermission('hard_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        // Fetch storage paths
        const { data: files, error } = await supabase
            .from('files')
            .select('id, nama_file, storage_path')
            .in('id', ids);

        if (error || !files) throw error;

        let successCount = 0;
        let errors = [];

        for (const file of files) {
            try {
                // 1. Storage
                await RcloneStorage.deleteFile(file.storage_path);
                // 2. DB
                await supabase.from('files').delete().eq('id', file.id);
                successCount++;
            } catch (err) {
                console.error(`[Bulk Hard Delete Error] ID ${file.id}:`, err);
                errors.push(`${file.nama_file}: ${err.message}`);
            }
        }

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Hard Delete',
            context: `Permanently deleted ${successCount} files. Errors: ${errors.length}`
        });

        res.json({
            success: true,
            message: `${successCount} file berhasil dihapus permanen.`,
            errors: errors.length > 0 ? errors : null
        });

    } catch (err) {
        console.error('Bulk Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat menghapus masal.' });
    }
});

// PUT /api/files/:id/restore — Super Admin only
app.put('/api/files/:id/restore', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('files')
            .update({
                deleted_at: null,
                deleted_by: null
            })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Restore File',
            context: `Restored file ${req.params.id}`
        });

        res.json({ success: true, message: 'File berhasil dipulihkan.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memulihkan file.' });
    }
});

// GET/POST /api/files/bulk-download - Download multiple files as ZIP
app.all('/api/files/bulk-download', authenticateToken, async (req, res) => {
    try {
        // Permission Check: super_admin, moderator, and admin_zona are allowed
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator' && req.user.role !== 'admin_zona') {
            const perms = req.user.permissions || [];
            if (!perms.includes('bulk_download')) {
                return res.status(403).json({ error: 'Akses ditolak. Dibutuhkan izin Unduh ZIP Massal.' });
            }
        }

        let { ids } = (req.method === 'POST' || req.method === 'PUT') ? req.body : req.query;
        if (typeof ids === 'string') ids = ids.split(',').map(id => id.trim());

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        // 1. Fetch metadata from Supabase
        const { data: files, error } = await supabase
            .from('files')
            .select('*')
            .in('id', ids);

        if (error || !files || files.length === 0) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // 1b. Post-fetch security filter (Piutang only for Super Admin or view_piutang)
        const allowedFiles = files.filter(f => {
            if (req.user.role === 'admin_zona') {
                if (f.zona_id !== req.user.zona_id) return false;
                if (f.category === 'PIUTANG') {
                    const userPerms = req.user.permissions || [];
                    if (!userPerms.includes('view_piutang')) return false;
                }
                return true;
            }
            return true; // Super Admin can access all
        });

        if (allowedFiles.length === 0) {
            return res.status(403).json({ error: 'Tidak ada file yang diizinkan untuk didownload.' });
        }

        // Use allowedFiles for the rest of the logic
        const archive = archiver('zip', { zlib: { level: 5 } }); // Level 5 for better speed

        // Error handling for archive
        archive.on('error', (err) => {
            console.error('[Archiver Error]', err);
            if (!res.headersSent) res.status(500).send({ error: err.message });
        });

        // Use stream to send Zip to response
        res.attachment(`arsip_batch_${Date.now()}.zip`);
        archive.pipe(res);

        // 3. Add files to ZIP sequentially to prevent server overload
        for (const file of allowedFiles) {
            try {
                console.log(`[ZIP] Processing: ${file.nama_file}`);
                const fileStream = await RcloneStorage.getStream(file.storage_path);

                archive.append(fileStream, { name: file.nama_file });

                // Wait for the entry to be fully processed by archiver
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.warn(`[ZIP] Timeout on ${file.nama_file}. Skipping...`);
                        resolve();
                    }, 60000); // 60s max per file

                    archive.once('entry', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    fileStream.on('error', (err) => {
                        clearTimeout(timeout);
                        console.error(`[ZIP] Stream error for ${file.nama_file}:`, err.message);
                        resolve(); // Continue with next file
                    });
                });
            } catch (err) {
                console.warn(`[Bulk Download] Failed to initialize stream for ${file.nama_file}:`, err.message);
            }
        }

        await archive.finalize();

    } catch (err) {
        console.error('Bulk Download Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Terjadi kesalahan saat memproses ZIP.' });
    }
});

// ============================================================
// USER MANAGEMENT ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/users
app.get('/api/users', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, contact_email, name, role, zona_id, toko_id, is_active, permissions, created_at, zonas(kode, nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar user.' });
    }
});

// POST /api/users â€” create user
app.post('/api/users', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { email, contact_email, password, name, role, zona_id, toko_id, permissions } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Username, password, nama, dan role wajib diisi.' });
        }

        // Check duplicate Username (column 'email')
        const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase().trim()).single();
        if (existing) {
            return res.status(400).json({ error: 'Username sudah digunakan.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: email.toLowerCase().trim(),
                contact_email: contact_email ? contact_email.toLowerCase().trim() : null,
                password_hash,
                name,
                role,
                zona_id: role === 'admin_zona' ? zona_id : null,
                toko_id: role === 'admin_zona' ? toko_id : null,
                is_active: true,
                permissions: permissions || []
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create User',
            context: `Created user ${email} (${contact_email || 'No Email'}) with role ${role}`
        });

        res.json({ success: true, user });
    } catch (err) {
        console.error('Create User Error:', err);
        res.status(500).json({ error: 'Gagal membuat user: ' + err.message });
    }
});

// PUT /api/users/:id â€” update user
app.put('/api/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { email, contact_email, password, name, role, zona_id, toko_id, is_active, permissions } = req.body;

        const updates = {};
        if (email) updates.email = email.toLowerCase().trim();
        if (contact_email !== undefined) updates.contact_email = contact_email ? contact_email.toLowerCase().trim() : null;
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (zona_id !== undefined) updates.zona_id = zona_id;
        if (toko_id !== undefined) updates.toko_id = toko_id;
        if (permissions !== undefined) updates.permissions = permissions;

        // Re-hash password if provided
        if (password) {
            const salt = await bcrypt.genSalt(12);
            updates.password_hash = await bcrypt.hash(password, salt);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Update User',
            context: `Updated user ${req.params.id}`
        });

        res.json({ success: true, user: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update user: ' + err.message });
    }
});

// DELETE /api/users/:id â€” Permanent Delete
app.delete('/api/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const userIdToDelete = req.params.id;

        // Prevent self-deletion
        if (userIdToDelete === req.user.userId) {
            return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
        }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userIdToDelete);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete User Permanent',
            context: `Permanently deleted user ${userIdToDelete}`
        });

        res.json({ success: true, message: 'User berhasil dihapus secara permanen.' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).json({ error: 'Gagal menghapus user: ' + err.message });
    }
});

// ============================================================
// OPERATIONAL FEATURES (Broadcast & Stats)
// ============================================================

// POST /api/broadcasts â€” Send broadcast (Super Admin only)
app.post('/api/broadcasts', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { content, target_zona_id } = req.body;
        if (!content) return res.status(400).json({ error: 'Isi pengumuman wajib diisi.' });

        const { error } = await supabase
            .from('broadcast_messages')
            .insert({
                content,
                target_zona_id: target_zona_id || null, // null means all zones
                created_by: req.user.userId
            });

        if (error) throw error;
        res.json({ success: true, message: 'Pengumuman berhasil disiarkan.' });
    } catch (err) {
        console.error('Broadcast Error:', err);
        res.status(500).json({ error: 'Gagal mengirim pengumuman: ' + err.message });
    }
});

// GET /api/broadcasts â€” Fetch all broadcasts (Super Admin only)
app.get('/api/broadcasts', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('broadcast_messages')
            .select('*, zonas(nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ broadcasts: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar pengumuman.' });
    }
});

// GET /api/broadcasts â€” Fetch all broadcasts (Super Admin only)
console.log('Registering GET /api/broadcasts');
app.get('/api/broadcasts', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('broadcast_messages')
            .select('*, zonas(nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ broadcasts: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar pengumuman.' });
    }
});

// DELETE /api/broadcasts/:id â€” Delete broadcast (Super Admin only)
console.log('Registering DELETE /api/broadcasts/:id');
app.delete('/api/broadcasts/:id', authenticateToken, authorizeRole('super_admin'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('broadcast_messages')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Pengumuman berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus pengumuman.' });
    }
});

// GET /api/broadcasts/latest
app.get('/api/broadcasts/latest', authenticateToken, async (req, res) => {
    try {
        let query = supabase
            .from('broadcast_messages')
            .select('content, created_at, target_zona_id')
            .order('created_at', { ascending: false });

        // Filter: Target the user's specific zone OR show global (null)
        if (req.user.role !== 'super_admin' && req.user.zonaId) {
            query = query.or(`target_zona_id.is.null,target_zona_id.eq.${req.user.zonaId}`);
        }

        const { data, error } = await query.limit(1).maybeSingle();

        if (error) throw error;
        res.json({ broadcast: data || null });
    } catch (err) {
        console.error('Broadcast Load Error:', err);
        res.status(500).json({ error: 'Gagal memuat pengumuman.' });
    }
});

// TEMPORARY: Fix NULL ukuran_bytes for existing files
app.get('/api/debug/fix-sizes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('files')
            .update({ ukuran_bytes: 524288 }) // 512KB default
            .is('ukuran_bytes', null);

        if (error) throw error;
        res.json({ message: 'Fixed NULL sizes', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/storage — storage usage statistics
app.get('/api/stats/storage', authenticateToken, async (req, res) => {
    try {
        console.log('[STATS] Fetching storage stats for user:', req.user.userId);
        // Today's start in local time (then to UTC-like ISO)
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Total Bytes
        const { data: allFiles, error: errTotal } = await supabase
            .from('files')
            .select('ukuran_bytes')
            .is('deleted_at', null);

        if (errTotal) {
            console.error('[STATS] Error fetching total files:', errTotal);
            throw errTotal;
        }

        console.log(`[STATS] Found ${allFiles.length} active files.`);
        const totalUsed = allFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Total bytes calculated: ${totalUsed}`);

        // 2. Today's Bytes
        const { data: todayFiles, error: errToday } = await supabase
            .from('files')
            .select('ukuran_bytes')
            .gte('created_at', todayStr)
            .is('deleted_at', null);

        if (errToday) {
            console.error('[STATS] Error fetching today files:', errToday);
            throw errToday;
        }
        const todayUsed = todayFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Today's bytes calculated: ${todayUsed}`);

        res.json({
            total_bytes: totalUsed,
            today_bytes: todayUsed,
            limit_bytes: 1024 * 1024 * 1024 * 1024 // 1024 GB (Terabox Default)
        });
    } catch (err) {
        console.error('Storage Stats Error:', err);
        res.status(500).json({ error: 'Gagal menghitung statistik penyimpanan.' });
    }
});

// GET /api/stats/chart — Invoice Analytics (Zone-Aware)
app.get('/api/stats/chart', authenticateToken, async (req, res) => {
    try {
        const chartData = {};
        const isZoneAdmin = req.user.role === 'admin_zona';
        const userZonaId = req.user.zona_id;

        // 1. Fetch zones — admin_zona only gets their own zone
        let zonaQuery = supabase.from('zonas').select('id, nama').order('kode');
        if (isZoneAdmin && userZonaId) {
            zonaQuery = zonaQuery.eq('id', userZonaId);
        }
        const { data: allZonas, error: zError } = await zonaQuery;
        if (!zError && allZonas) {
            for (const z of allZonas) {
                chartData[z.nama] = 0;
            }
        }

        // 2. Fetch INVOICE files — filtered by zone for admin_zona
        let fileQuery = supabase
            .from('files')
            .select('total_jual, category, nama_file, zona_id, zonas(nama)')
            .is('deleted_at', null)
            .eq('category', 'INVOICE');

        if (isZoneAdmin && userZonaId) {
            fileQuery = fileQuery.eq('zona_id', userZonaId);
        }

        const { data, error } = await fileQuery;

        if (error) throw error;
        console.log(`[DEBUG_CHART] Fetched ${data?.length || 0} invoice files.`);
        if (data && data.length > 0) {
            console.log(`[DEBUG_CHART] First row:`, data[0]);
        }

        // Grouping by Zone
        const invoiceFiles = data || [];
        for (const row of invoiceFiles) {
            let zName = row.zonas?.nama || 'Unknown Zone';
            let value = parseFloat(row.total_jual) || 0;

            // --- Filename Parser Fallback ---
            if (value === 0 && row.nama_file) {
                const priceMatch = row.nama_file.match(/(\d{1,3}(\.\d{3})+)/);
                if (priceMatch) {
                    const cleanValue = priceMatch[0].replace(/\./g, '');
                    value = parseFloat(cleanValue) || 0;
                }
            }

            if (chartData[zName] !== undefined) {
                chartData[zName] += value;
            } else {
                chartData[zName] = value;
            }
        }

        const labels = Object.keys(chartData);
        const values = Object.values(chartData);
        console.log(`[DEBUG_CHART] Result:`, chartData);

        res.json({ labels, values });
    } catch (err) {
        console.error('Chart Data Error:', err);
        res.status(500).json({ error: 'Gagal memuat analitik visual.' });
    }
});

// GET /api/admin/login-history
app.get('/api/admin/login-history', authenticateToken, requirePermission('view_activity_logs'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                id,
                created_at,
                action,
                context,
                user_id,
                users!inner ( name, role )
            `)
            .eq('action', 'Login')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json({ logs: data });
    } catch (err) {
        console.error('History API Error:', err);
        res.status(500).json({ error: 'Gagal memuat riwayat login.' });
    }
});

// GET /api/admin/activity-logs
app.get('/api/admin/activity-logs', authenticateToken, requirePermission('view_activity_logs'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                id,
                created_at,
                action,
                context,
                user_id,
                users!inner ( name, role )
            `)
            .neq('action', 'Login')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        res.json({ logs: data });
    } catch (err) {
        console.error('Activity Logs API Error:', err);
        res.status(500).json({ error: 'Gagal memuat log aktivitas.' });
    }
});

// ============================================================
// ZONA & TOKO REFERENCE ENDPOINTS
// ============================================================

// ============================================================
// BATCH UPLOAD HISTORY & NOTICE SYSTEM
// ============================================================

// POST /api/batches — Create a new batch session
app.post('/api/batches', authenticateToken, requireUploadPermission, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('upload_batches')
            .insert({
                uploader_id: req.user.userId,
                total_files: 0,
                success_files: 0
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, batch: data });
    } catch (err) {
        console.error('[CRITICAL] Failed to create batch session:', err);
        res.status(500).json({ error: 'Gagal membuat sesi batch: ' + err.message });
    }
});

// PUT /api/batches/:id — Update batch counters
app.put('/api/batches/:id', authenticateToken, async (req, res) => {
    try {
        const { total_files, success_files } = req.body;
        const { error } = await supabase
            .from('upload_batches')
            .update({ total_files, success_files })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update batch: ' + err.message });
    }
});

// GET /api/batches — List recent batches with dynamic counts from files table
app.get('/api/batches', authenticateToken, async (req, res) => {
    try {
        // Fetch batches
        const { data: batches, error: bError } = await supabase
            .from('upload_batches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (bError) throw bError;

        if (!batches || batches.length === 0) {
            return res.json({ batches: [] });
        }

        // Fetch user names for uploader_id mapping (optional enrichment)
        const uploaderIds = [...new Set(batches.filter(b => b.uploader_id).map(b => b.uploader_id))];
        const { data: users } = await supabase.from('users').select('id, name').in('id', uploaderIds);
        const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});

        // Fetch counts from files table for THESE batches
        const batchIds = batches.map(b => b.id);
        const { data: counts, error: cError } = await supabase
            .from('files')
            .select('batch_id')
            .in('batch_id', batchIds)
            .is('deleted_at', null);

        if (cError) console.warn('[Batch History] File count error:', cError);

        // Group counts by batch_id
        const countMap = (counts || []).reduce((acc, f) => {
            acc[f.batch_id] = (acc[f.batch_id] || 0) + 1;
            return acc;
        }, {});

        // Combine
        const enrichedBatches = batches.map(b => ({
            ...b,
            uploader_name: userMap[b.uploader_id] || '-',
            // Use dynamic count if greater than stored count (or just use dynamic)
            total_files: countMap[b.id] || b.total_files || 0,
            success_files: countMap[b.id] || b.success_files || 0
        }));

        res.json({ batches: enrichedBatches });
    } catch (err) {
        console.error('[CRITICAL] Failed to load batches:', err);
        res.status(500).json({ error: 'Gagal memuat riwayat batch: ' + err.message });
    }
});

// GET /api/batches/:id/details — Get files in a batch, grouped by zona
app.get('/api/batches/:id/details', authenticateToken, async (req, res) => {
    try {
        const { data: files, error } = await supabase
            .from('files')
            .select('id, nama_file, zona_id, toko_id, category, no_invoice, total_jual, created_at, tipe_ppn, tanggal_dokumen')
            .eq('batch_id', req.params.id)
            .is('deleted_at', null)
            .order('zona_id');

        if (error) throw error;

        const zonaIds = [...new Set(files.map(f => f.zona_id))];
        const tokoIds = [...new Set(files.filter(f => f.toko_id).map(f => f.toko_id))];

        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('id, nama').in('id', zonaIds),
            tokoIds.length > 0 ? supabase.from('toko').select('id, nama').in('id', tokoIds) : { data: [] }
        ]);

        const zonaMap = {};
        (zonaRes.data || []).forEach(z => zonaMap[z.id] = z.nama);
        const tokoMap = {};
        (tokoRes.data || []).forEach(t => tokoMap[t.id] = t.nama);

        // Group files by zona
        const grouped = {};
        files.forEach(f => {
            const zonaName = zonaMap[f.zona_id] || 'Zona ' + f.zona_id;
            if (!grouped[zonaName]) grouped[zonaName] = [];
            grouped[zonaName].push({
                ...f,
                toko_nama: tokoMap[f.toko_id] || 'Umum'
            });
        });

        res.json({ success: true, grouped, total: files.length });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat detail batch: ' + err.message });
    }
});

// GET /api/zonas
app.get('/api/zonas', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('zonas').select('*').order('id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ zonas: data });
});

// POST /api/zonas — Create new zone
app.post('/api/zonas', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama Zona wajib diisi.' });

        const kode = `ZONA-${Date.now().toString().slice(-4)}`;

        const { data, error } = await supabase
            .from('zonas')
            .insert({ nama, wa_recipient, kode, deskripsi: `Zona ${nama}` })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Zona baru berhasil ditambahkan.', zona: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambahkan zona: ' + err.message });
    }
});

// PUT /api/zonas/:id â€” Update zone settings
app.put('/api/zonas/:id', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        const { error } = await supabase
            .from('zonas')
            .update({ nama, wa_recipient })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data zona berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui zona: ' + err.message });
    }
});

// GET /api/toko — List all shops
app.get('/api/toko', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('toko').select('*').order('nama');

        // Security: admin_zona only sees shops in their zone
        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        } else if (req.query.zona_id) {
            query = query.eq('zona_id', parseInt(req.query.zona_id));
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ toko: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar toko: ' + err.message });
    }
});

// POST /api/toko â€” Create new shop
app.post('/api/toko', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        if (!kode || !nama || !zona_id) {
            return res.status(400).json({ error: 'Data tidak lengkap (kode, nama, zona_id diperlukan).' });
        }

        const { data, error } = await supabase
            .from('toko')
            .insert({ kode, nama, zona_id: parseInt(zona_id) })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, toko: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambah toko: ' + err.message });
    }
});

// PUT /api/toko/:id â€” Update shop
app.put('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        const { error } = await supabase
            .from('toko')
            .update({ kode, nama, zona_id: parseInt(zona_id) })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data toko berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui toko: ' + err.message });
    }
});

// DELETE /api/toko/:id â€” Delete shop
app.delete('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        // Check if shop still has files linked
        const { count, error: checkError } = await supabase
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('toko_id', req.params.id);

        if (checkError) throw checkError;
        if (count > 0) {
            return res.status(400).json({ error: 'Toko tidak bisa dihapus karena masih memiliki dokumen terkait.' });
        }

        const { error } = await supabase
            .from('toko')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Toko berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus toko: ' + err.message });
    }
});

// ============================================================

// ============================================================
// MEDIA CATEGORIES ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/media-categories â€” list all categories
app.get('/api/media-categories', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('media_categories')
            .select('*')
            .order('id');
        if (error) throw error;
        res.json({ categories: data || [] });
    } catch (err) {
        console.error('List Categories Error:', err);
        res.status(500).json({ error: 'Gagal memuat kategori.' });
    }
});

// POST /api/media-categories â€” create new category
app.post('/api/media-categories', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { nama, emoji, deskripsi, warna } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });

        const slug = nama.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const { data, error } = await supabase
            .from('media_categories')
            .insert({
                nama: slug,
                emoji: emoji || 'ðŸ“',
                deskripsi: deskripsi || '',
                warna: warna || 'gray'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: 'Kategori sudah ada.' });
            throw error;
        }

        // Create folder in Terabox via Rclone
        try {
            await RcloneStorage.createMediaFolder(slug);
        } catch (folderErr) {
            console.warn('[Rclone] Folder creation warning:', folderErr.message);
        }

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create Media Category',
            context: `Created category: ${slug} (${emoji || 'ðŸ“'})`
        });

        res.json({ success: true, category: data });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: 'Gagal membuat kategori: ' + err.message });
    }
});

// DELETE /api/media-categories/:id â€” delete category
app.delete('/api/media-categories/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('media_categories')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Kategori berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus kategori.' });
    }
});

// ============================================================
// ADS MEDIA ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/ads-media â€” list all media
app.get('/api/ads-media', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = supabase
            .from('ads_media')
            .select('*, users!uploaded_by(name, email)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (category && category !== 'all') {
            query = query.eq('category', category);
        }
        if (search) {
            query = query.ilike('nama_file', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ media: data || [] });
    } catch (err) {
        console.error('List Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar media.' });
    }
});

// POST /api/ads-media/upload â€” upload media file
app.post('/api/ads-media/upload', authenticateToken, requirePermission('manage_media_ads'), uploadMediaMulter.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const category = req.body.category || 'lainnya';
        const deskripsi = req.body.deskripsi || '';

        const { storagePath, size } = await RcloneStorage.uploadMedia(
            req.file.buffer,
            req.file.originalname,
            category
        );

        const { data: record, error } = await supabase
            .from('ads_media')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                category,
                deskripsi,
                ukuran_bytes: size,
                uploaded_by: req.user.userId
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload Media Ads',
            context: `Uploaded ${req.file.originalname} [${category}]`
        });

        res.json({ success: true, message: 'Media berhasil diupload.', media: record });
    } catch (err) {
        console.error('Upload Media Error:', err);
        res.status(500).json({ error: 'Gagal upload media: ' + err.message });
    }
});

// GET /api/ads-media/:id/view â€” view/stream media file (inline)
app.get('/api/ads-media/:id/view', async (req, res) => {
    try {
        // We allow viewing without token if token is in query (for <img> tags)
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Auth token required' });

        const decoded = jwt.verify(token, JWT_SECRET);

        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.pdf': 'application/pdf',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=31536000'
        });
        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id}\n`);

        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id} - Path: ${media.storage_path}\n`);

        const rcloneProcess = await RcloneStorage.stream(media.storage_path);
        rcloneProcess.stdout.pipe(res);

        rcloneProcess.on('error', (err) => {
            console.error('[Rclone Stream Error]', err);
            if (!res.headersSent) res.status(500).send('Stream error');
        });

        rcloneProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Rclone Stderr: ${msg}\n`);
            console.warn('[Rclone Stream Stderr]', msg);
        });
    } catch (err) {
        fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Error: ${err.stack}\n`);
        console.error('View Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat media preview.' });
    }
});

// GET /api/ads-media/:id/download â€” download media file
app.get('/api/ads-media/:id/download', authenticateToken, async (req, res) => {
    try {
        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const localPath = await RcloneStorage.download(media.storage_path);
        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.psd': 'application/octet-stream', '.ai': 'application/postscript',
            '.pdf': 'application/pdf', '.zip': 'application/zip',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(media.nama_file)}"`,
        });

        const stream = fs.createReadStream(localPath);
        stream.pipe(res);
        stream.on('end', () => {
            try { fs.unlinkSync(localPath); } catch (_) { }
        });
    } catch (err) {
        console.error('Download Media Error:', err);
        res.status(500).json({ error: 'Gagal download media.' });
    }
});

// DELETE /api/ads-media/bulk â€” bulk soft delete
app.delete('/api/ads-media/bulk', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID media tidak valid.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Delete Media Ads',
            context: `Deleted ${ids.length} media items`
        });

        res.json({ success: true, message: `${ids.length} media berhasil dihapus.` });
    } catch (err) {
        console.error('Bulk Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media massal.' });
    }
});

// DELETE /api/ads-media/:id â€” soft delete
app.delete('/api/ads-media/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { data: media, error: findErr } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (findErr || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete Media Ads',
            context: `Deleted ${media.nama_file}`
        });

        res.json({ success: true, message: 'Media berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media.' });
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Arsip Digital Backend v2.0 running (JWT + Rclone)' });
});

// ============================================================
// START & CLEANUP
// ============================================================

// ---- Session Cleanup (Every 1 hour, remove sessions older than 24h) ----
setInterval(async () => {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
            .from('active_sessions')
            .delete()
            .lt('last_active', yesterday);
        if (error) console.error('[CLEANUP] Session Error:', error.message);
        else console.log('[CLEANUP] Stale sessions cleared.');
    } catch (err) {
        console.error('[CLEANUP] Fatal Error:', err);
    }
}, 60 * 60 * 1000);

app.listen(port, () => {
    console.log(`ðŸš€ Arsip Digital Backend v2.0 running on http://localhost:${port}`);
    console.log(`   Auth: JWT (${JWT_EXPIRES_IN} expiry)`);
    console.log(`   Storage: Rclone (Terabox + Storj)`);
    console.log(`   DB: Supabase PostgreSQL`);
});

