let isFetching = false;
let requests = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Requires to be logged in. Anyone can access this page (Zone & Super Admin)
    const user = await initAuth(null);
    if (!user) return;

    // Show Create button only for Admin Zona
    if (user.role === 'admin_zona') {
        const btnCreate = document.getElementById('btn-create-request');
        if (btnCreate) btnCreate.classList.remove('hidden');
    }

    loadRequests();
});

async function loadRequests() {
    if (isFetching) return;
    isFetching = true;

    try {
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('table-body').innerHTML = '';

        const res = await API.get('/api/requests');
        requests = res.requests || [];
        renderTable();
    } catch (err) {
        console.error(err);
        Toast.error('Gagal memuat tiket permintaan: ' + err.message);
    } finally {
        isFetching = false;
        document.getElementById('loading-state').classList.add('hidden');
    }
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    const emptyState = document.getElementById('empty-state');

    if (!requests || requests.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        if (currentUser.role === 'super_admin' || currentUser.role === 'moderator') {
            document.getElementById('empty-sub').textContent = 'Belum ada Admin Zona yang mengirimkan request dokumen.';
        }
        return;
    }

    emptyState.classList.add('hidden');

    tbody.innerHTML = requests.map((r, i) => {
        const d = new Date(r.created_at);
        const dateStr = d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        let statusBadge = '';
        if (r.status === 'Pending') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold tracking-wide uppercase">PENDING</span>';
        } else if (r.status === 'Selesai') {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold tracking-wide uppercase">SELESAI</span>';
        } else {
            statusBadge = '<span class="px-2 py-1 rounded-md text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 font-bold tracking-wide uppercase">DITOLAK</span>';
        }

        const isAdmin = currentUser.role === 'super_admin' || currentUser.role === 'moderator';

        return `
        <tr class="animate-fade-in border-b border-white/5 hover:bg-white/5 transition-colors" style="animation-delay: ${i * 30}ms">
            <td class="p-4 align-top">
                <p class="text-sm font-medium text-gray-300">${dateStr}</p>
                ${r.resolved_at ? `<p class="text-[11px] text-gray-500 mt-1">Diselesaikan: ${new Date(r.resolved_at).toLocaleDateString('id-ID')}</p>` : ''}
            </td>
            <td class="p-4 align-top">
                <p class="font-medium text-white text-sm">${r.users?.name || 'Unknown'}</p>
                <p class="text-xs text-indigo-400 mt-0.5">${r.zonas?.nama || '-'}</p>
            </td>
            <td class="p-4 align-top">
                <p class="text-sm text-gray-300 leading-relaxed">${escapeHtml(r.pesan)}</p>
            </td>
            <td class="p-4 align-top">
                ${statusBadge}
            </td>
            <td class="p-4 align-top text-right">
                ${isAdmin ? `
                    <div class="flex items-center justify-end gap-2">
                        ${r.status === 'Pending' ? `
                            <button onclick="updateRequestStatus(${r.id}, 'Selesai')" class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all transform hover:scale-105" title="Tandai Selesai">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button onclick="openRejectModal(${r.id})" class="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all transform hover:scale-105" title="Tolak">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        ` : ''}
                        <button onclick="deleteRequest(${r.id})" class="p-2 rounded-lg bg-gray-500/10 text-gray-500 hover:bg-red-600 hover:text-white transition-all transform hover:scale-105" title="Hapus Tiket Permanen">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                ` : '<span class="text-gray-600 text-sm">-</span>'}
            </td>
        </tr>`;
    }).join('');
}

function openRequestModal() {
    document.getElementById('request-modal').classList.remove('hidden');
    document.getElementById('request-input').value = '';
    document.getElementById('request-input').focus();
}

function closeRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
}

async function submitRequest() {
    const btnSubmit = document.getElementById('btn-submit');
    const input = document.getElementById('request-input');
    const pesan = input.value.trim();

    if (!pesan) {
        Toast.error('Pesan tidak boleh kosong.');
        return;
    }

    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Menyimpan...`;
    btnSubmit.disabled = true;

    try {
        await API.post('/api/requests', { pesan });
        Toast.success('Request berhasil dikirim ke Pusat.');
        closeRequestModal();
        loadRequests();
    } catch (err) {
        Toast.error('Gagal mengirim request: ' + err.message);
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
}

async function updateRequestStatus(id, newStatus) {
    if (newStatus === 'Ditolak') {
        openRejectModal(id);
        return;
    }

    if (!confirm(`Konfirmasi penandaan tiket menjadi: Selesai?`)) return;

    try {
        await API.put(`/api/requests/${id}`, { status: newStatus });
        Toast.success(`Status tiket diubah menjadi Selesai`);
        loadRequests();
    } catch (err) {
        Toast.error('Gagal mengubah status: ' + err.message);
    }
}

async function deleteRequest(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus tiket request ini secara permanen? Data juga akan terhapus dari log Admin Zona.')) return;

    try {
        await API.delete(`/api/requests/${id}`);
        Toast.success('Tiket request berhasil dihapus permanen.');
        loadRequests();
    } catch (err) {
        Toast.error('Gagal menghapus tiket: ' + err.message);
    }
}

let currentRejectId = null;

function openRejectModal(id) {
    currentRejectId = id;
    document.getElementById('reject-modal').classList.remove('hidden');
    document.getElementById('reject-notes-input').value = '';
    document.getElementById('reject-notes-input').focus();
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.add('hidden');
    currentRejectId = null;
}

async function submitReject() {
    const btn = document.getElementById('btn-submit-reject');
    const input = document.getElementById('reject-notes-input');
    const notes = input.value.trim();

    if (!notes) {
        Toast.error('Tolong isi alasan penolakan.');
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;
    btn.disabled = true;

    try {
        await API.put(`/api/requests/${currentRejectId}`, { status: 'Ditolak', notes });
        Toast.success('Tiket berhasil ditolak.');
        closeRejectModal();
        loadRequests();
    } catch (err) {
        Toast.error('Gagal menolak tiket: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
