// ============================================================
// Dashboard Logic — v2.0 (JWT + Backend API)
// Replaces direct Supabase/Drive calls
// ============================================================

let archives = [];
let filteredArchives = [];
let selectedIds = [];
let currentPage = 1;
let totalPages = 1;
let viewMode = 'active'; // 'active' or 'deleted'

// Zona cache for labels
window._zonaCache = [];

// ---- Initialize Dashboard ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth();
    if (!user) return;

    setCurrentDate();
    await loadZonas();
    populateFilters();
    await loadArchives();
    await loadBroadcast();

    await loadStorageStats();
    // Chart is available to ALL roles — backend handles zone filtering
    await loadAnalyticsChart();

    // Admin controls only for super admin
    if (hasPermission('view_dashboard_stats')) {
        document.getElementById('admin-controls')?.classList.remove('hidden');
    }
    setupEventListeners();
});

// ---- Set Current Date ----
function setCurrentDate() {
    const el = document.getElementById('current-date');
    if (el) {
        el.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // Auto-fill filter-date-end to today
    const endDate = document.getElementById('filter-date-end');
    if (endDate) {
        endDate.value = new Date().toISOString().split('T')[0];
    }
}

// ---- Load Zonas from API ----
async function loadZonas() {
    try {
        const { zonas } = await API.get('/api/zonas');
        window._zonaCache = zonas || [];
    } catch (err) {
        console.warn('Failed to load zonas:', err);
    }
}

// ---- Populate Filter Dropdowns ----
function populateFilters() {
    // Zona dropdown (only for super admin)
    const zonaSelect = document.getElementById('filter-zona');
    const broadcastZona = document.getElementById('broadcast-zona'); // New
    if (zonaSelect || broadcastZona) {
        window._zonaCache.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z.id;
            opt.textContent = z.nama;

            if (zonaSelect) zonaSelect.appendChild(opt.cloneNode(true));
            if (broadcastZona) broadcastZona.appendChild(opt.cloneNode(true));
        });
    }

    // Inverted Permit: Inject restricted options ONLY for Super Admins
    const catSelect = document.getElementById('filter-category');
    const roleDiag = document.getElementById('role-diag');

    if (roleDiag) roleDiag.textContent = `(${currentUser?.role || 'null'})`;

    if (catSelect) {
        if (isSuperAdmin()) {
            // Unlock and Inject
            catSelect.disabled = false;
            catSelect.classList.remove('opacity-50', 'cursor-not-allowed');

            // Avoid duplicates
            if (!catSelect.querySelector('option[value=""]')) {
                const allOpt = document.createElement('option');
                allOpt.value = '';
                allOpt.textContent = 'Semua Kategori';
                catSelect.prepend(allOpt);
            }
            if (!catSelect.querySelector('option[value="PIUTANG"]')) {
                const piutangOpt = document.createElement('option');
                piutangOpt.value = 'PIUTANG';
                piutangOpt.textContent = 'Bukti Pembayaran Piutang';
                catSelect.appendChild(piutangOpt);
            }
        } else {
            // Force selection to INVOICE and ensure LOCKED for Admin Zona
            catSelect.value = 'INVOICE';
            catSelect.disabled = true;
            catSelect.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    populateTokoFilter();
}

// ---- Load Archives from Backend API ----
async function loadArchives() {
    showLoading('main-content');

    try {
        let endpoint = '/api/files';

        if (isSuperAdmin() && viewMode === 'deleted') {
            endpoint = '/api/files/trash';
        }

        const { files } = await API.get(endpoint);
        archives = files || [];
        applyFilters();
        populateTokoFilter();
    } catch (err) {
        Toast.error('Gagal memuat arsip: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ---- Populate Toko Filter based on selected Zona ----
function populateTokoFilter() {
    const tokoSelect = document.getElementById('filter-toko');
    const zonaSelect = document.getElementById('filter-zona');
    if (!tokoSelect) return;

    let zonaId = zonaSelect?.value;

    // Fix for admin_zona: if they have no zona select, use their zona_id from currentUser
    if (!zonaId && typeof currentUser !== 'undefined' && currentUser.role === 'admin_zona') {
        zonaId = currentUser.zona_id;
    }

    // Disable if no zona selected
    tokoSelect.disabled = !zonaId;

    const currentValue = tokoSelect.value;
    // Clear existing (keep first "Semua" option)
    while (tokoSelect.options.length > 1) tokoSelect.remove(1);

    if (!zonaId) {
        tokoSelect.value = '';
        return;
    }

    // Get unique tokos from archives matching the selected zona
    const tokos = [...new Set(
        archives
            .filter(a => a.zona_id === parseInt(zonaId))
            .map(a => a.toko?.nama)
            .filter(Boolean)
    )].sort();

    tokos.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tokoSelect.appendChild(opt);
    });

    tokoSelect.value = currentValue;
}

// ---- Update Stats ----
function updateStats() {
    const el = (id) => document.getElementById(id);
    if (el('stat-ppn')) el('stat-ppn').textContent = filteredArchives.filter(a => a.category === 'PPN').length;
    if (el('stat-nonppn')) el('stat-nonppn').textContent = filteredArchives.filter(a => a.category === 'NON_PPN').length;
    if (el('stat-invoice')) el('stat-invoice').textContent = filteredArchives.filter(a => a.category === 'INVOICE').length;
    if (el('stat-piutang')) el('stat-piutang').textContent = filteredArchives.filter(a => a.category === 'PIUTANG').length;
}

// ---- Apply Filters ----
function applyFilters() {
    const getVal = (id) => document.getElementById(id)?.value || '';

    const category = getVal('filter-category');
    const zona = getVal('filter-zona');
    const toko = getVal('filter-toko');
    const dateStart = getVal('filter-date-start');
    const dateEnd = getVal('filter-date-end');
    const tipe_ppn = getVal('filter-tipe');
    const search = (getVal('search-input') || getVal('search-input-mobile')).toLowerCase();

    filteredArchives = archives.filter(a => {
        if (category && a.category !== category) return false;
        if (zona && a.zona_id !== parseInt(zona)) return false;
        if (toko && a.toko?.nama !== toko) return false;
        if (tipe_ppn && a.tipe_ppn !== tipe_ppn) return false;
        if (dateStart && a.created_at < dateStart) return false;
        if (dateEnd && a.created_at > dateEnd + 'T23:59:59') return false;
        if (search && !a.nama_file.toLowerCase().includes(search)) return false;
        return true;
    });

    currentPage = 1;
    totalPages = Math.ceil(filteredArchives.length / CONFIG.PAGE_SIZE) || 1;
    renderTable();
    updateStats();
}

// ---- Export CSV ----
function exportCSV() {
    if (filteredArchives.length === 0) {
        Toast.warning('Tidak ada data untuk diexport.');
        return;
    }

    const headers = ['Nama File', 'Kategori', 'Zona', 'Toko', 'Tanggal Upload', 'Status'];
    const rows = filteredArchives.map(a => [
        `"${a.nama_file}"`,
        `"${a.category}"`,
        `"${a.zonas?.nama || ''}"`,
        `"${a.toko?.nama || ''}"`,
        `"${new Date(a.created_at).toLocaleString('id-ID')}"`,
        `"${a.status}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(',') + "\n"
        + rows.map(e => e.join(',')).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Rekap_Arsip_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ---- Toggle Recycle Bin ----
function toggleRecycleBin() {
    const btn = document.getElementById('btn-recycle-bin');
    if (viewMode === 'active') {
        viewMode = 'deleted';
        btn.classList.remove('text-red-400');
        btn.classList.add('text-indigo-400', 'bg-indigo-500/10');
        Toast.info('Menampilkan Recycle Bin');
    } else {
        viewMode = 'active';
        btn.classList.add('text-red-400');
        btn.classList.remove('text-indigo-400', 'bg-indigo-500/10');
        Toast.info('Menampilkan Dokumen Aktif');
    }
    loadArchives();
}

// ---- Render Table ----
function renderTable() {
    const tbody = document.getElementById('archive-body');
    const emptyState = document.getElementById('empty-state');
    const pagination = document.getElementById('pagination');

    if (!tbody) return;

    const start = (currentPage - 1) * CONFIG.PAGE_SIZE;
    const end = start + CONFIG.PAGE_SIZE;
    const pageItems = filteredArchives.slice(start, end);

    if (filteredArchives.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        pagination?.classList.add('hidden');
        return;
    }

    emptyState?.classList.add('hidden');
    pagination?.classList.remove('hidden');

    tbody.innerHTML = pageItems.map((a, i) => {
        let cleanName = a.nama_file.toUpperCase().replace(/^(NON\s+|PPN\s+)/i, '');
        // Strip out trailing or embedded dates like " 18 FEB"
        cleanName = cleanName.replace(/\s+\d{1,2}\s+(JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC)[A-Z]*\b/i, '').trim();
        return `
        <tr class="animate-fade-in ${a.status === 'Unread' && !isSuperAdmin() ? 'bg-indigo-900/10 border-l-2 border-indigo-500' : 'border-b border-white/5 hover:bg-white/5'}" style="animation-delay: ${i * 30}ms">
            <td class="w-10">
                <input type="checkbox" class="custom-checkbox row-checkbox" data-id="${a.id}" 
                    ${selectedIds.includes(a.id) ? 'checked' : ''} 
                    onclick="toggleItemSelection('${a.id}', this)">
            </td>
            <td>
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg outline outline-1 outline-white/10 ${a.status === 'Unread' ? 'bg-indigo-500/20' : 'bg-gray-800'} flex items-center justify-center flex-shrink-0 transition-colors">
                        <svg class="w-4 h-4 ${a.status === 'Unread' ? 'text-indigo-300' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <p class="font-medium ${a.status === 'Unread' ? 'text-white font-semibold' : 'text-gray-300 hover:text-white transition-colors'} text-sm cursor-pointer" title="${a.nama_file}">${truncate(cleanName, 35)}</p>
                            ${a.status === 'Unread' && !isSuperAdmin() ? '<span class="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium tracking-wide">BARU</span>' : ''}
                        </div>
                    </div>
                </div>
            </td>
            <td><span class="px-2 py-1 rounded-md border border-white/5 bg-black/20 text-gray-300 text-[11px]">${getCategoryLabel(a.category)}</span></td>
            <td>${a.tipe_ppn ? `<span class="px-2 py-1 rounded-md text-[10px] ${a.tipe_ppn === 'PPN' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'} font-medium tracking-wide uppercase">${a.tipe_ppn}</span>` : '<span class="text-gray-600 text-sm">-</span>'}</td>
            <td class="text-gray-400 text-sm whitespace-nowrap">${a.zonas?.nama || '-'}</td>
            <td class="text-gray-400 text-sm whitespace-nowrap">${a.toko?.nama || '-'}</td>
            <td class="text-gray-400 text-sm whitespace-nowrap">
                ${a.tanggal_dokumen ? new Date(a.tanggal_dokumen).toLocaleDateString('id-ID') : (extractDateFromFilename(a.nama_file) || new Date(a.created_at).toLocaleDateString('id-ID'))}
            </td>
            <td class="text-gray-500 text-[11px] whitespace-nowrap">${new Date(a.created_at).toLocaleDateString('id-ID')}</td>
            <td>
                <div class="relative group flex justify-end" style="z-index: ${40 - i}">
                    <button class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Aksi">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                    </button>
                    <!-- Dropdown -->
                    <div class="absolute right-0 top-8 mt-1 w-36 bg-[#162032] border border-white/10 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col py-1 z-50">
                        ${viewMode === 'active' ? `
                            <button onclick="openPreview('${a.id}', '${a.nama_file}')" class="flex items-center gap-2 px-4 py-2.5 text-[13px] text-gray-300 hover:text-white hover:bg-white/5 w-full text-left transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                Preview
                            </button>
                            <a href="${CONFIG.API_URL}/api/files/${a.id}/download?token=${API.getToken()}" target="_blank" class="flex items-center gap-2 px-4 py-2.5 text-[13px] text-gray-300 hover:text-white hover:bg-white/5 w-full text-left transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                Download
                            </a>
                            ${isSuperAdmin() ? `
                                <button onclick="deleteArchive('${a.id}', '${a.nama_file}')" class="flex items-center gap-2 px-4 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full text-left transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    Hapus
                                </button>
                            ` : ''}
                        ` : `
                            <button onclick="restoreArchive('${a.id}', '${a.nama_file}')" class="flex items-center gap-2 px-4 py-2.5 text-[13px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 w-full text-left transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                Pulihkan
                            </button>
                            <button onclick="deleteArchive('${a.id}', '${a.nama_file}', true)" class="flex items-center gap-2 px-4 py-2.5 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full text-left transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                Hapus Permanen
                            </button>
                        `}
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Update pagination info
    const rangeEl = document.getElementById('showing-range');
    const totalEl = document.getElementById('total-count');
    const btnPrev = document.getElementById('prev-btn');
    const btnNext = document.getElementById('next-btn');

    if (totalEl) totalEl.textContent = filteredArchives.length;
    if (rangeEl) {
        const startIdx = filteredArchives.length > 0 ? start + 1 : 0;
        const endIdx = Math.min(start + pageItems.length, filteredArchives.length);
        rangeEl.textContent = `${startIdx}-${endIdx}`;
    }

    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

    updateBulkUI();
}

// ---- Pagination ----
function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
}

// ---- Reset Filters ----
function resetFilters() {
    ['filter-category', 'filter-tipe', 'filter-zona', 'filter-toko'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['filter-date-start', 'filter-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const search = document.getElementById('search-input');
    const searchMobile = document.getElementById('search-input-mobile');
    if (search) search.value = '';
    if (searchMobile) searchMobile.value = '';
    applyFilters();
}

// ---- Preview via PDF.js ----
function openPreview(fileId, fileName) {
    const modal = document.getElementById('preview-modal');
    const iframe = document.getElementById('preview-iframe');
    const title = document.getElementById('preview-title');
    const download = document.getElementById('preview-download');

    title.textContent = fileName;

    // Use the backend API to serve the PDF for viewing
    const token = API.getToken();
    iframe.src = `${CONFIG.API_URL}/api/files/${fileId}/view?token=${token}`;
    download.href = `${CONFIG.API_URL}/api/files/${fileId}/download?token=${token}`;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    const modal = document.getElementById('preview-modal');
    const iframe = document.getElementById('preview-iframe');
    modal.classList.add('hidden');
    iframe.src = '';
    document.body.style.overflow = '';
}

// ---- Broadcast System ----
async function loadBroadcast() {
    try {
        const { broadcast } = await API.get('/api/broadcasts/latest');
        const container = document.getElementById('broadcast-container');
        const marquee = document.getElementById('broadcast-marquee');

        if (broadcast && broadcast.content) {
            // Replaced: Removed timestamp detail as requested for "modern/professional" look
            marquee.textContent = broadcast.content;
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    } catch (err) {
        console.warn('Failed to load broadcast:', err);
    }
}

async function sendBroadcast() {
    const input = document.getElementById('broadcast-input');
    const zonaSelect = document.getElementById('broadcast-zona');
    const content = input?.value.trim();
    const target_zona_id = zonaSelect?.value || null;

    if (!content) return;

    try {
        await API.post('/api/broadcasts', { content, target_zona_id });
        Toast.success('Pengumuman berhasil disiarkan!');
        input.value = '';
        await loadBroadcast();
    } catch (err) {
        Toast.error('Gagal mengirim pengumuman: ' + err.message);
    }
}

// ---- Broadcast Management (Super Admin) ----
async function openManageBroadcasts() {
    const modal = document.getElementById('broadcast-manage-modal');
    const list = document.getElementById('broadcast-list');
    if (!modal || !list) return;

    list.innerHTML = '<div class="py-10 flex justify-center"><div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>';
    modal.classList.remove('hidden');

    try {
        const { broadcasts } = await API.get('/api/broadcasts');
        if (!broadcasts || broadcasts.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-500 py-10 text-sm">Belum ada riwayat pengumuman.</p>';
            return;
        }

        list.innerHTML = broadcasts.map(b => `
            <div class="glass-card p-4 rounded-2xl border border-white/5 flex items-center justify-between group">
                <div class="flex-1 min-w-0 pr-4">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-tighter">
                            ${b.zonas?.nama || 'Semua Zona'}
                        </span>
                        <span class="text-[10px] text-gray-500">${new Date(b.created_at).toLocaleString('id-ID')}</span>
                    </div>
                    <p class="text-sm text-gray-200 truncate" title="${b.content}">${b.content}</p>
                </div>
                <button onclick="deleteBroadcast('${b.id}')" class="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-center text-red-400 py-10 text-sm">${err.message}</p>`;
    }
}

function closeBroadcastManage() {
    document.getElementById('broadcast-manage-modal')?.classList.add('hidden');
}

async function deleteBroadcast(id) {
    if (!confirm('Hapus pengumuman ini?')) return;

    try {
        await API.del(`/api/broadcasts/${id}`);
        Toast.success('Pengumuman dihapus');
        openManageBroadcasts(); // Refresh list
        loadBroadcast(); // Refresh current marquee
    } catch (err) {
        Toast.error('Gagal menghapus: ' + err.message);
    }
}

// ---- Storage Stats ----
async function loadStorageStats() {
    try {
        const stats = await API.get('/api/stats/storage');
        console.log('[STATS] Received:', stats);
        const { total_bytes, today_bytes, limit_bytes } = stats;

        // 1. Used vs Total
        const storageEl = document.getElementById('stat-storage');
        const progressEl = document.getElementById('stat-storage-progress');
        if (storageEl && progressEl) {
            const usedGB = (total_bytes / (1024 ** 3)).toFixed(2);
            // Fallback to 1024 GB if limit_bytes is missing or 0
            const totalGB = ((limit_bytes || (1024 ** 4)) / (1024 ** 3)).toFixed(0);
            storageEl.textContent = `${usedGB} / ${totalGB} GB`;

            const percent = Math.min((total_bytes / limit_bytes) * 100, 100);
            progressEl.style.width = percent + '%';
        }

        // 2. Today's Usage
        const todayEl = document.getElementById('stat-storage-today');
        if (todayEl) {
            if (today_bytes >= 1024 ** 2) {
                todayEl.textContent = (today_bytes / (1024 ** 2)).toFixed(2) + ' MB';
            } else {
                todayEl.textContent = (today_bytes / 1024).toFixed(1) + ' KB';
            }
        }
    } catch (err) {
        console.warn('Failed to load storage stats:', err);
    }
}

// ---- Analytics Chart ----
let analyticsChartInstance = null;
async function loadAnalyticsChart() {
    try {
        const stats = await API.get('/api/stats/chart');
        console.log('[DEBUG_CHART] Frontend received stats:', stats);
        const ctx = document.getElementById('analyticsChart');
        if (!ctx) return;

        // ========== ADMIN ZONA: Single-Zone Premium Card ==========
        const isZoneAdmin = currentUser?.role === 'admin_zona';
        if (isZoneAdmin && stats.labels?.length <= 2) {
            const chartCard = ctx.closest('.glass-card');
            if (!chartCard) return;

            const zoneName = stats.labels[0] || 'Zona Anda';
            const totalValue = stats.values[0] || 0;
            const formatted = new Intl.NumberFormat('id-ID', {
                style: 'currency', currency: 'IDR',
                minimumFractionDigits: 0, maximumFractionDigits: 0
            }).format(totalValue);
            const invoiceCount = (typeof archives !== 'undefined' ? archives : []).filter(a => a.category === 'INVOICE').length;
            const piutangCount = (typeof archives !== 'undefined' ? archives : []).filter(a => a.category === 'PIUTANG').length;

            chartCard.style.background = 'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, transparent 100%)';
            chartCard.style.borderColor = 'rgba(16,185,129,0.15)';
            chartCard.innerHTML = `
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-white font-semibold text-sm flex items-center gap-2">
                        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Ringkasan Invoice — ${zoneName}
                    </h3>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 tracking-wider uppercase">Zona Anda</span>
                </div>
                <div class="rounded-2xl p-6 border border-emerald-500/10 mb-4"
                     style="background: linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%);">
                    <p class="text-xs text-emerald-400/70 font-medium uppercase tracking-wider mb-2">Total Nilai Invoice Merah</p>
                    <p class="text-3xl md:text-4xl font-bold text-white tracking-tight">${formatted}</p>
                    <div class="flex items-center gap-2 mt-3">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                            📄 ${invoiceCount} Invoice
                        </span>
                    </div>
                </div>
            `;
            return;
        }

        if (analyticsChartInstance) {
            analyticsChartInstance.destroy();
        }

        // Create gradient fill
        const chartCtx = ctx.getContext('2d');
        const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.7)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.4)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)');

        const hoverGradient = chartCtx.createLinearGradient(0, 0, 0, 300);
        hoverGradient.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
        hoverGradient.addColorStop(1, 'rgba(239, 68, 68, 0.5)');

        analyticsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: stats.labels,
                datasets: [{
                    label: 'Total Nilai Invoice (Rp)',
                    data: stats.values,
                    backgroundColor: gradient,
                    borderColor: 'rgba(239, 68, 68, 0.6)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    hoverBackgroundColor: hoverGradient,
                    hoverBorderColor: 'rgb(239, 68, 68)',
                    hoverBorderWidth: 2,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: '#9ca3af',
                            font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                            padding: 16
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        titleFont: { family: "'Inter', sans-serif", weight: '600', size: 13 },
                        bodyFont: { family: "'Inter', sans-serif", size: 12 },
                        displayColors: false,
                        callbacks: {
                            title: function (items) {
                                return '📍 ' + items[0].label;
                            },
                            label: function (context) {
                                const val = context.parsed.y;
                                if (val === 0) return '  Belum ada data';
                                const formatted = new Intl.NumberFormat('id-ID', {
                                    style: 'currency', currency: 'IDR',
                                    minimumFractionDigits: 0, maximumFractionDigits: 0
                                }).format(val);
                                return '  💰 ' + formatted;
                            },
                            afterLabel: function (context) {
                                const val = context.parsed.y;
                                if (val === 0) return '';
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((val / total) * 100).toFixed(1);
                                return '  📊 ' + pct + '% dari total';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: {
                            color: 'rgba(255,255,255,0.04)',
                            drawTicks: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: { family: "'Inter', sans-serif", size: 10, weight: '500' },
                            padding: 8,
                            callback: function (value) {
                                if (value === 0) return 'Rp 0';
                                if (value >= 1000000000) return 'Rp ' + (value / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
                                if (value >= 1000000) return 'Rp ' + (value / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Jt';
                                if (value >= 1000) return 'Rp ' + (value / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Rb';
                                return 'Rp ' + value.toLocaleString('id-ID');
                            }
                        }
                    },
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: '#64748b',
                            font: { family: "'Inter', sans-serif", size: 10, weight: '500' },
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 45,
                            padding: 4
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.warn('Failed to load chart:', err);
    }
}

// ---- Soft Delete / Hard Delete (Super Admin) ----
async function deleteArchive(id, fileName, isHardDelete = false) {
    const msg = isHardDelete
        ? `Apakah Anda yakin ingin MENGHAPUS PERMANEN "${fileName}"? Tindakan ini tidak dapat dibatalkan.`
        : `Apakah Anda yakin ingin memindahkan "${fileName}" ke Tong Sampah?`;

    showConfirmModal(
        isHardDelete ? 'Hapus Permanen' : 'Pindahkan ke Sampah',
        msg,
        async () => {
            try {
                const endpoint = isHardDelete
                    ? `/api/files/${id}?hard=true`
                    : `/api/files/${id}`;

                await API.del(endpoint);
                Toast.success(isHardDelete ? 'Arsip dihapus permanen' : 'Arsip dipindahkan ke Sampah');
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal menghapus: ' + err.message);
            }
        },
        'Hapus'
    );
}

// ---- Restore Archive ----
async function restoreArchive(id, fileName) {
    showConfirmModal(
        'Pulihkan Arsip',
        `Kembalikan arsip "${fileName}" menjadi aktif kembali?`,
        async () => {
            try {
                await API.put(`/api/files/${id}/restore`);
                Toast.success('Arsip berhasil dipulihkan');
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal memulihkan: ' + err.message);
            }
        },
        'Pulihkan'
    );
}

// ---- Event Listeners ----
function setupEventListeners() {
    // Filters
    ['filter-category', 'filter-tipe', 'filter-zona', 'filter-toko', 'filter-date-start', 'filter-date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                if (id === 'filter-zona') populateTokoFilter();
                applyFilters();
            });
        }
    });

    // Search (debounced)
    const searchHandler = debounce(() => applyFilters(), 300);
    const searchInput = document.getElementById('search-input');
    const searchMobile = document.getElementById('search-input-mobile');

    if (searchInput) searchInput.addEventListener('input', searchHandler);
    if (searchMobile) searchMobile.addEventListener('input', searchHandler);

    // Close preview on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePreview();
    });
}

document.addEventListener('DOMContentLoaded', init);

/**
 * Parses patterns like "17 FEB" or "2 MAR" from filename.
 * Used as fallback if database field is empty.
 */
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
        return `${d}/${m}/${y}`;
    }

    // 2. YYYY/MM/DD or YYYY-MM-DD
    const ymdRegex = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
    const ymdMatch = text.match(ymdRegex);
    if (ymdMatch) {
        const y = ymdMatch[1];
        const m = ymdMatch[2].padStart(2, '0');
        const d = ymdMatch[3].padStart(2, '0');
        return `${d}/${m}/${y}`;
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
            const year = new Date().getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    return null;
}

/**
 * Bulk Selection Logic
 */
function toggleSelectAll(master) {
    if (master.checked) {
        selectedIds = filteredArchives.map(a => a.id);
    } else {
        selectedIds = [];
    }

    // Sync UI for the current page only
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = master.checked;
    });

    updateBulkUI();
}

function toggleItemSelection(id, cb) {
    if (cb.checked) {
        if (!selectedIds.includes(id)) selectedIds.push(id);
    } else {
        selectedIds = selectedIds.filter(sid => sid !== id);
        // Uncheck master if one unselected
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
    updateBulkUI();
}

function updateBulkUI() {
    const bar = document.getElementById('bulk-action-bar');
    const countEl = document.getElementById('selected-count');
    const btnText = document.getElementById('bulk-download-text');

    if (!bar || !countEl) return;

    if (selectedIds.length > 0) {
        bar.classList.add('active');
        countEl.textContent = selectedIds.length;
        if (selectedIds.length > 3) {
            btnText.textContent = 'Download ZIP (Bundled)';
        } else {
            btnText.textContent = `Download ${selectedIds.length} Berkas`;
        }
    } else {
        bar.classList.remove('active');
        const master = document.getElementById('select-all');
        if (master) master.checked = false;
    }
}

function clearSelection() {
    selectedIds = [];
    const checkboxes = document.querySelectorAll('.custom-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateBulkUI();
}

async function downloadSelected() {
    if (selectedIds.length === 0) return;

    const btn = document.getElementById('btn-bulk-download');
    const originalContent = btn.innerHTML;
    btn.disabled = true;

    try {
        if (selectedIds.length <= 3) {
            // Sequence download
            for (const id of selectedIds) {
                const file = archives.find(f => f.id === id);
                if (file) {
                    const token = localStorage.getItem('jwt_token');
                    const downloadUrl = `${CONFIG.API_URL}/api/files/download/${file.id}?token=${token}`;

                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = file.nama_file;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    await new Promise(r => setTimeout(r, 800));
                }
            }
            Toast.success('Download dimulai.');
        } else {
            // ZIP Bulk Download via Backend
            btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div><span>Zipping...</span>';

            const token = API.getToken();
            const downloadUrl = `${CONFIG.API_URL}/api/files/bulk-download?token=${token}`;

            // We use a hidden form to send a large number of IDs via POST 
            // while still allowing the browser to handle the resulting stream as a download.
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = downloadUrl;
            form.style.display = 'none';

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'ids';
            input.value = selectedIds.join(',');
            form.appendChild(input);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);

            // Give it some time before resetting UI
            setTimeout(() => {
                Toast.success('Proses ZIP dimulai. Tunggu hingga download selesai.');
                btn.disabled = false;
                btn.innerHTML = originalContent;
                clearSelection();
            }, 3000);
            return; // Exit early as we handled everything
        }
    } catch (err) {
        console.error('Bulk Download Error:', err);
        Toast.error('Gagal mendownload berkas masal.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        clearSelection();
    }
}

async function bulkDeleteSelected() {
    if (selectedIds.length === 0) return;

    showConfirmModal(
        viewMode === 'active' ? 'Pindahkan ke Sampah' : 'Hapus Permanen',
        viewMode === 'active'
            ? `Apakah Anda yakin ingin memindahkan ${selectedIds.length} berkas ke Tong Sampah?`
            : `HAPUS PERMANEN ${selectedIds.length} berkas? Tindakan ini tidak dapat dibatalkan.`,
        async () => {
            const btn = document.getElementById('btn-bulk-delete');
            const originalContent = btn.innerHTML;
            btn.disabled = true;

            try {
                const endpoint = viewMode === 'active'
                    ? '/api/files/bulk-delete'
                    : '/api/files/bulk-trash-delete';

                await API.post(endpoint, { ids: selectedIds });

                Toast.success(`${selectedIds.length} arsip berhasil dihapus.`);
                clearSelection();
                await loadArchives();
            } catch (err) {
                Toast.error('Gagal menghapus: ' + err.message);
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        },
        'Hapus'
    );
}
