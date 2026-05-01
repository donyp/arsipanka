// ============================================================
// Upload Logic — v2.0 (JWT + Backend API + Rclone Storage)
// Replaces direct Google Drive uploads
// ============================================================

let selectedFiles = [];

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    await loadAllTokos();
    setupDragDrop();
    setupForm();
    loadRecentUploads();
});



// ---- Load ALL Tokos (for filename auto-detection) ----
async function loadAllTokos() {
    try {
        const { toko } = await API.get('/api/toko');
        window._allTokos = toko || [];
    } catch (err) {
        window._allTokos = [];
    }
}

// ---- Detect Toko from Filename ----
// Normalizes both strings: uppercase, strips non-alphanumeric.
// Matches even if toko name has spaces or not in the filename.
function detectTokoFromFilename(filename) {
    if (!window._allTokos || !window._allTokos.length) return null;

    const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const normalizedFilename = normalize(filename);

    // Sort by name length descending: prefer longer/more-specific match
    const sorted = [...window._allTokos].sort((a, b) => b.nama.length - a.nama.length);

    for (const toko of sorted) {
        const normalizedToko = normalize(toko.nama);
        if (normalizedToko && normalizedFilename.includes(normalizedToko)) {
            return toko;
        }
    }
    return null;
}



// ---- Drag & Drop Setup ----
function setupDragDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('border-indigo-500', 'bg-indigo-500/5');
        });
    });
    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/5');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        addFiles(e.dataTransfer.files);
    });
}

// ---- File Selection ----
function handleFileSelect(input) {
    if (input.files.length > 0) {
        addFiles(input.files);
    }
}

function addFiles(files) {
    const newFiles = Array.from(files).filter(f => {
        if (f.type !== 'application/pdf') {
            Toast.warning(`File "${f.name}" bukan PDF, dilewati.`);
            return false;
        }
        // Check duplicate
        if (selectedFiles.some(sf => sf.file.name === f.name)) {
            Toast.warning(`File "${f.name}" sudah ada dalam antrian.`);
            return false;
        }
        return true;
    }).map(f => {
        // Detect date and toko for each file individually
        const toko = detectTokoFromFilename(f.name);
        const date = extractDateFromFilename(f.name);
        const tipe_ppn = detectPPNFromFilename(f.name);

        return {
            file: f,
            toko: toko,
            date: date,
            tipe_ppn: tipe_ppn
        };
    });

    selectedFiles = [...selectedFiles, ...newFiles];
    updateFileUI();
}

function detectPPNFromFilename(name) {
    if (!name) return null;
    const n = name.toUpperCase();
    if (n.includes('NON')) return 'NON';
    if (n.includes('PPN')) return 'PPN';
    return null;
}

function extractDateFromFilename(name) {
    if (!name) return null;

    const text = name.toUpperCase();

    // 1. DD/MM/YYYY or DD-MM-YYYY
    const dmyRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/;
    const dmyMatch = text.match(dmyRegex);
    if (dmyMatch) {
        let y = dmyMatch[3];
        if (y.length === 2) y = '20' + y;
        const m = dmyMatch[2].padStart(2, '0');
        const d = dmyMatch[1].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // 2. YYYY/MM/DD or YYYY-MM-DD
    const ymdRegex = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
    const ymdMatch = text.match(ymdRegex);
    if (ymdMatch) {
        const y = ymdMatch[1];
        const m = ymdMatch[2].padStart(2, '0');
        const d = ymdMatch[3].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const months = {
        'JAN': '01', 'FEB': '02', 'PEB': '02', 'MAR': '03', 'APR': '04',
        'MEI': '05', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AGU': '08',
        'AUG': '08', 'SEP': '09', 'OKT': '10', 'OCT': '10', 'NOV': '11',
        'NOP': '11', 'DES': '12', 'DEC': '12'
    };

    // 3. DD MMM (e.g. 17 FEB or 2 MAR, 17FEB, 2MAR)
    // Matches 1-2 digits followed optionally by space then 3 letters
    const regex = /(\d{1,2})\s*([A-Z]{3})/i;
    const match = text.match(regex);

    if (match) {
        const day = match[1].padStart(2, '0');
        const monthAbbr = match[2];
        const month = months[monthAbbr];

        if (month) {
            const year = new Date().getFullYear(); // Assume current year
            return `${year}-${month}-${day}`;
        }
    }
    return null;
}

function removeFile(index, e) {
    e.stopPropagation();
    selectedFiles.splice(index, 1);
    updateFileUI();
}

function clearFile(e) {
    e.preventDefault();
    selectedFiles = [];
    updateFileUI();
    // Clear detection badge if any
    const badge = document.getElementById('toko-detect-badge');
    if (badge) badge.remove();
}



function updateFileUI() {
    const listDisplay = document.getElementById('file-list-display');
    const fileInfo = document.getElementById('file-info');
    const dropZoneContent = document.getElementById('drop-zone-content');
    const submitBtn = document.getElementById('upload-btn');

    if (!listDisplay || !fileInfo || !dropZoneContent) return;

    if (selectedFiles.length === 0) {
        fileInfo.classList.add('hidden');
        dropZoneContent.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    // Show file info, hide drop prompt
    fileInfo.classList.remove('hidden');
    dropZoneContent.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;

    listDisplay.innerHTML = selectedFiles.map((item, i) => `
        <li class="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 group">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-7 h-7 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                    <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div class="flex flex-col truncate">
                    <p class="text-xs font-medium text-gray-300 truncate">${item.file.name}</p>
                    <div class="flex items-center gap-4 text-[11px]">
                        <span class="text-gray-500">🏪 ${item.toko ? item.toko.nama : '<span class="text-red-400">Toko tidak cocok</span>'}</span>
                        <span class="text-gray-500">📅 ${item.date || '<span class="text-red-400">Tanggal tidak ditemukan</span>'}</span>
                        <span class="px-2 py-0.5 rounded ${item.tipe_ppn === 'PPN' ? 'bg-blue-500/10 text-blue-400' : item.tipe_ppn === 'NON' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-500'} font-bold">
                            ${item.tipe_ppn || 'REGULAR'}
                        </span>
                    </div>
                </div>
            </div>
            <button type="button" onclick="removeFile(${i}, event)" class="p-1 text-gray-600 hover:text-red-400 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </li>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ---- Form Submit (Bulk Upload via Backend API) ----
function setupForm() {
    const form = document.getElementById('upload-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = document.getElementById('upload-category')?.value || 'INVOICE';

        if (selectedFiles.length === 0) {
            Toast.warning('Pilih file PDF terlebih dahulu.');
            return;
        }

        // Validate all files have detected toko and date
        const undetectedToko = selectedFiles.filter(f => !f.toko).length;
        const undetectedDate = selectedFiles.filter(f => !f.date).length;

        if (undetectedToko > 0 || undetectedDate > 0) {
            let msg = 'Mohon perbaiki file berikut:\n';
            if (undetectedToko > 0) msg += `- ${undetectedToko} file toko tidak terdeteksi\n`;
            if (undetectedDate > 0) msg += `- ${undetectedDate} file tanggal tidak terdeteksi\n`;
            Toast.error(msg + 'Rename file agar informasi lengkap.');
            return;
        }

        const btn = document.getElementById('upload-btn');
        btn.disabled = true;
        btn.innerHTML = '<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span class="ml-2">Mengupload...</span>';

        const progressContainer = document.getElementById('upload-progress-container');
        const progressPct = document.getElementById('upload-progress-pct');
        const progressBar = document.getElementById('upload-progress-bar');

        if (progressContainer) progressContainer.classList.remove('hidden');

        const CONCURRENCY_LIMIT = 5;
        let uploaded = 0;
        const total = selectedFiles.length;

        const uploadTask = async (item) => {
            try {
                const formData = new FormData();
                formData.append('file', item.file);
                formData.append('zona_id', item.toko.zona_id);
                formData.append('toko_id', item.toko.id);
                formData.append('category', category);
                formData.append('tanggal_dokumen', item.date);
                formData.append('tipe_ppn', item.tipe_ppn || '');
                formData.append('tanggal_upload', new Date().toISOString().split('T')[0]);

                await API.upload('/api/files/upload', formData);
                uploaded++;

                const pct = Math.round((uploaded / total) * 100);
                if (progressPct) progressPct.textContent = `${pct}%`;
                if (progressBar) progressBar.style.width = pct + '%';
            } catch (err) {
                console.error('Upload error:', err);
                Toast.error(`Gagal upload "${item.file.name}": ${err.message}`);
                throw err; // Allow Promise.all to catch if needed, though we handle individually
            }
        };

        // Process in chunks of 5
        for (let i = 0; i < selectedFiles.length; i += CONCURRENCY_LIMIT) {
            const chunk = selectedFiles.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(item => uploadTask(item).catch(err => {
                // Individual error caught, loop continues to next chunk
                console.error(`Chunk error for ${item.file.name}:`, err);
            })));
        }

        Toast.success(`${uploaded}/${total} file berhasil diupload!`);

        // Reset
        selectedFiles = [];
        updateFileUI();
        if (progressContainer) progressContainer.classList.add('hidden');
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Semua File
        `;
        loadRecentUploads();
    });
}

// ---- Load Recent Uploads ----
async function loadRecentUploads() {
    const container = document.getElementById('recent-uploads');
    if (!container) return;

    try {
        const { files } = await API.get('/api/files');
        const recent = (files || []).slice(0, 5);

        if (recent.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Belum ada upload terbaru</p>';
            return;
        }

        container.innerHTML = recent.map(a => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-gray-300">${a.nama_file}</p>
                        <p class="text-xs text-gray-500">${a.zonas?.nama || ''} • ${new Date(a.created_at).toLocaleDateString('id-ID')}</p>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p class="text-sm text-red-400 text-center py-4">Gagal memuat data.</p>';
    }
}
