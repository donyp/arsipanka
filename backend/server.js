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

// Global Storage for WhatsApp Batching
const waQueue = {}; // { [zonaId]: [{ toko, filename, tanggal, kategori }] }
const waTimeouts = {}; // { [zonaId]: timeoutRef }

/**
 * WhatsApp Notification Helper (Fonnte Gateway - Batch Edition)
 * Aggregates messages for 2 seconds before sending a summary.
 */
function sendWANotification(zonaId, details) {
    // Disabled permanently in code per user request
    console.log('[WA] System is currently disabled in code.');
    return;

    if (process.env.DISABLE_WA_NOTIFICATIONS === 'true') {
        console.log('[WA] Notifications are disabled.');
        return;
    }
    // Add to queue
    if (!waQueue[zonaId]) waQueue[zonaId] = [];
    waQueue[zonaId].push(details);

    // Reset/Set Debounce Timer (2 seconds for speed & efficiency)
    if (waTimeouts[zonaId]) clearTimeout(waTimeouts[zonaId]);

    waTimeouts[zonaId] = setTimeout(async () => {
        if (!waQueue[zonaId]) return;
        const batch = [...waQueue[zonaId]];
        delete waQueue[zonaId]; // Clear queue for this zone
        delete waTimeouts[zonaId];

        try {
            const token = process.env.FONNTE_TOKEN;
            if (!token || token === "CHANGE_ME_WITH_YOUR_FONNTE_TOKEN") return;

            // Fetch zone info
            const { data: zona } = await supabase
                .from('zonas')
                .select('nama, wa_recipient')
                .eq('id', parseInt(zonaId))
                .single();

            if (!zona || !zona.wa_recipient) return;

            // Build Professional Message
            const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
            let message = '';

            if (batch.length === 1) {
                // Individual Professional Format
                const d = batch[0];
                message = `ðŸ”” *PEMBERITAHUAN ARSIP BARU*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ“… *Waktu*: ${timestamp}
ðŸŒ *Zona*: ${zona.nama}

ðŸª *Nama Toko*: ${d.toko || 'Umum'}
ðŸ“„ *Nama File*: ${d.filename}
ðŸ—“ï¸ *Tgl Dokumen*: ${d.tanggal || '-'}
ðŸ“‚ *Kategori*: ${d.kategori}

âœ… *Status*: Berhasil diunggah ke Storage.
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
_Silakan hubungi administrator jika ada kesalahan data._`;
            } else {
                // Batch Professional Format
                message = `ðŸ“¦ *RINGKASAN UPLOAD BATCH*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸŒ *Wilayah*: ${zona.nama}
ðŸ”¢ *Jumlah Dokumen*: ${batch.length} File

*Daftar Dokumen:*
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
`;
                // List items (limit to 12 for better mobile readability)
                batch.slice(0, 12).forEach((item, idx) => {
                    const cleanFileName = item.filename.length > 25 ? item.filename.substring(0, 22) + '...' : item.filename;
                    message += `â–«ï¸ *${item.toko}* Â» ${cleanFileName}\n`;
                });

                if (batch.length > 12) {
                    message += `_... dan ${batch.length - 12} file lainnya_\n`;
                }

                message += `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ•’ *Selesai*: ${timestamp}
âœ… Dokumen telah aman diproses ke sistem.`;
            }

            console.log(`[WA] Sending batch to ${zona.wa_recipient} (${batch.length} files)...`);

            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 8000); // 8s wait for API

            const response = await fetch('https://api.fonnte.com/send', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    target: zona.wa_recipient,
                    message: message
                })
            });

            clearTimeout(fetchTimeout);
            const result = await response.json();
            if (result.status) {
                console.log(`[WA] Batch sent successfully! (Zone: ${zona.nama})`);
            } else {
                console.error('[WA] Fonnte Error:', result.reason);
            }
        } catch (err) {
            console.error('[WA] Fatal Notification Error:', err.message);
        }
    }, 2000); // 2 seconds debounce
}

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

        // Stream directly from Rclone
        let rcloneProcess;
        try {
            rcloneProcess = await RcloneStorage.stream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Rclone Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal menghubungkan storage.' });
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

        // Handle client disconnect: kill rclone to save bandwidth/process
        req.on('close', () => {
            if (rcloneProcess && rcloneProcess.kill) rcloneProcess.kill();
        });

        rcloneProcess.stdout.pipe(res);

        rcloneProcess.on('error', (err) => {
            console.error('[Rclone Stream Error]', err);
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
        let rcloneProcess;
        try {
            rcloneProcess = await RcloneStorage.stream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Rclone Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        req.on('close', () => {
            if (rcloneProcess && rcloneProcess.kill) rcloneProcess.kill();
        });

        rcloneProcess.stdout.pipe(res);

        rcloneProcess.on('error', (err) => {
            console.error('[Rclone Stream Error]', err);
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

// POST /api/files/upload
app.post('/api/files/upload', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const { zona_id, toko_id, category } = req.body;
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

        // Upload via Rclone
        const { storagePath, size } = await RcloneStorage.upload(
            req.file.buffer,
            req.file.originalname,
            zona.kode,
            tokoKode,
            category || 'PPN'
        );

        // Insert metadata into DB
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
                tanggal_dokumen: req.body.tanggal_dokumen,
                tipe_ppn: req.body.tipe_ppn,
                no_invoice: req.body.no_invoice,
                total_jual: req.body.total_jual ? parseFloat(req.body.total_jual) : null
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

        // WhatsApp Notification (Asynchronous)
        // We fetch toko name for better message if available
        let tokoName = 'Umum';
        if (toko_id) {
            const { data: toko } = await supabase.from('toko').select('nama').eq('id', parseInt(toko_id)).single();
            if (toko) tokoName = toko.nama;
        }

        sendWANotification(zona_id, {
            toko: tokoName,
            filename: req.file.originalname,
            tanggal: req.body.tanggal_dokumen,
            kategori: category || 'PPN'
        });

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
            // Delete from storage
            await RcloneStorage.deleteFile(file.storage_path);
            // Delete from DB
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

// PUT /api/files/:id/restore â€” Super Admin only
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

// POST /api/files/bulk-download â€” Download multiple files as ZIP
app.post('/api/files/bulk-download', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            const perms = req.user.permissions || [];
            if (!perms.includes('bulk_download')) {
                return res.status(403).json({ error: 'Akses ditolak. Dibutuhkan izin Unduh ZIP Massal.' });
            }
        }

        const { ids } = req.body;
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

        // Track running processes to kill them if client disconnects
        const activeProcesses = new Set();
        req.on('close', () => {
            for (const p of activeProcesses) {
                if (p && p.kill) p.kill();
            }
        });

        // 3. Add files to ZIP sequentially to prevent server overload
        for (const file of allowedFiles) {
            try {
                const rcloneProcess = await RcloneStorage.stream(file.storage_path);
                activeProcesses.add(rcloneProcess);

                archive.append(rcloneProcess.stdout, { name: file.nama_file });

                // Wait for this specific process to finish before starting the next one
                await new Promise((resolve) => {
                    rcloneProcess.on('close', (code) => {
                        activeProcesses.delete(rcloneProcess);
                        resolve();
                    });
                });
            } catch (err) {
                console.warn(`[Bulk Download] Failed to stream ${file.nama_file}:`, err.message);
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

// GET /api/zonas
app.get('/api/zonas', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('zonas').select('*').order('id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ zonas: data });
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

