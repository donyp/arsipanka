// ============================================================
// Users Management Logic — v2.0 (JWT + Backend API)
// ============================================================

let users = [];
let loginHistory = [];
let activityLogs = [];
let currentTab = 'users';

// ---- Initialize Users Page ----
document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth('super_admin');
    if (!user) return;

    await populateModalZonas();
    setupUserForm();
    await loadUsers();
    await loadLoginHistory();
    await loadActivityLogs();
});

// ---- Tab Navigation ----
function switchTab(tabId) {
    currentTab = tabId;

    // Buttons
    const btnUsers = document.getElementById('tab-btn-users');
    const btnHistory = document.getElementById('tab-btn-history');
    const btnActivity = document.getElementById('tab-btn-activity');

    // Content
    const contentUsers = document.getElementById('tab-content-users');
    const contentHistory = document.getElementById('tab-content-history');
    const contentActivity = document.getElementById('tab-content-activity');

    // Reset all buttons
    [btnUsers, btnHistory, btnActivity].forEach(btn => {
        if (btn) btn.className = 'px-4 py-2 font-medium text-sm text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition-all';
    });

    // Hide all content
    [contentUsers, contentHistory, contentActivity].forEach(content => {
        if (content) {
            content.classList.remove('block');
            content.classList.add('hidden');
        }
    });

    if (tabId === 'users') {
        if (btnUsers) btnUsers.className = 'px-4 py-2 font-medium text-sm text-indigo-400 border-b-2 border-indigo-500 transition-all';
        if (contentUsers) {
            contentUsers.classList.remove('hidden');
            contentUsers.classList.add('block');
        }
        updateUserStats();
    } else if (tabId === 'history') {
        if (btnHistory) btnHistory.className = 'px-4 py-2 font-medium text-sm text-indigo-400 border-b-2 border-indigo-500 transition-all';
        if (contentHistory) {
            contentHistory.classList.remove('hidden');
            contentHistory.classList.add('block');
        }
        hideStats();
    } else if (tabId === 'activity') {
        if (btnActivity) btnActivity.className = 'px-4 py-2 font-medium text-sm text-indigo-400 border-b-2 border-indigo-500 transition-all';
        if (contentActivity) {
            contentActivity.classList.remove('hidden');
            contentActivity.classList.add('block');
        }
        hideStats();
    }
}

function hideStats() {
    const el = (id) => document.getElementById(id);
    if (el('stat-total-users')) el('stat-total-users').textContent = '-';
    if (el('stat-super-admin')) el('stat-super-admin').textContent = '-';
    if (el('stat-admin-zona')) el('stat-admin-zona').textContent = '-';
}

// ---- Populate Modal Zona Dropdown from API ----
async function populateModalZonas() {
    try {
        const { zonas } = await API.get('/api/zonas');
        window._zonaCache = zonas || [];

        const select = document.getElementById('modal-zona');
        if (!select) return;

        zonas.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z.id;
            opt.textContent = z.nama;
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Failed to load zonas:', err);
    }
}

// ---- Load Users from API ----
async function loadUsers() {
    showLoading('main-content');

    try {
        const { users: data } = await API.get('/api/users');
        users = data || [];
        renderUsers();
        updateUserStats();
    } catch (err) {
        Toast.error('Gagal memuat data user: ' + err.message);
    } finally {
        hideLoading();
    }
}

// ---- Update Stats ----
function updateUserStats() {
    const el = (id) => document.getElementById(id);
    if (el('stat-total-users')) el('stat-total-users').textContent = users.length;
    if (el('stat-super-admin')) el('stat-super-admin').textContent = users.filter(u => u.role === 'super_admin').length;
    if (el('stat-admin-zona')) el('stat-admin-zona').textContent = users.filter(u => u.role === 'admin_zona').length;
}

// ---- Render Users Table ----
function renderUsers() {
    const tbody = document.getElementById('users-body');
    const emptyState = document.getElementById('users-empty');

    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = users.map((u, i) => `
        <tr class="animate-fade-in" style="animation-delay: ${i * 30}ms">
            <td>
                <div class="flex items-center gap-3">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=6366f1&color=fff&size=40"
                         alt="" class="w-8 h-8 rounded-full">
                    <span class="font-medium text-white text-sm">${u.name}</span>
                </div>
            </td>
            <td class="text-gray-400 text-sm font-mono">${u.email}</td>
            <td class="text-gray-400 text-sm">${u.contact_email || '-'}</td>
            <td>
                <span class="${u.role === 'super_admin'
            ? 'badge bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
            : 'badge bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}">
                    ${u.role === 'super_admin' ? 'Super Admin' : 'Admin Zona'}
                </span>
            </td>
            <td class="text-gray-400 text-sm">${u.zonas?.nama || '-'}</td>
            <td>
                <span class="px-2 py-0.5 rounded-full text-[10px] ${u.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}">
                    ${u.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td class="text-gray-500 text-xs">${formatDate(u.created_at)}</td>
            <td>
                <div class="flex items-center justify-end gap-1">
                    <button onclick='editUser(${JSON.stringify(u).replace(/'/g, "&#39;")})'
                        title="Edit" class="p-2 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    ${u.id !== currentUser.id ? `
                    <button onclick="deleteUser('${u.id}', '${u.name.replace(/'/g, "\\'")}')"
                        title="Hapus" class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// ---- Open Modal for Add ----
function openUserModal() {
    document.getElementById('modal-title').textContent = 'Tambah User Baru';
    document.getElementById('edit-user-id').value = '';
    document.getElementById('user-form').reset();
    document.getElementById('modal-user-email').value = '';
    document.getElementById('modal-password').required = true;
    document.getElementById('password-hint').textContent = '';
    document.getElementById('modal-email').readOnly = false;
    toggleZonaField();
    document.getElementById('user-modal').classList.remove('hidden');
}

// ---- Open Modal for Edit ----
function editUser(user) {
    document.getElementById('modal-title').textContent = 'Edit User';
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('modal-name').value = user.name;
    document.getElementById('modal-user-email').value = user.contact_email || '';
    document.getElementById('modal-email').value = user.email;
    document.getElementById('modal-email').readOnly = false;
    document.getElementById('modal-password').value = '';
    document.getElementById('modal-password').required = false;
    document.getElementById('password-hint').textContent = '(kosongkan jika tidak diubah)';
    document.getElementById('modal-role').value = user.role;
    document.getElementById('modal-zona').value = user.zona_id || '';
    toggleZonaField();
    document.getElementById('user-modal').classList.remove('hidden');
}

// ---- Close Modal ----
function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

// ---- Toggle Zona Field Visibility ----
function toggleZonaField() {
    const role = document.getElementById('modal-role').value;
    const zonaField = document.getElementById('zona-field');
    const zonaSelect = document.getElementById('modal-zona');

    if (role === 'super_admin') {
        zonaField.style.opacity = '0.4';
        zonaSelect.required = false;
    } else {
        zonaField.style.opacity = '1';
        zonaSelect.required = true;
    }
}

// ---- Form Submit (Create or Update via API) ----
function setupUserForm() {
    const form = document.getElementById('user-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = document.getElementById('edit-user-id').value;
        const name = document.getElementById('modal-name').value.trim();
        const contact_email = document.getElementById('modal-user-email').value.trim();
        const email = document.getElementById('modal-email').value.trim().toLowerCase();
        const password = document.getElementById('modal-password').value;
        const role = document.getElementById('modal-role').value;
        const zona_id = document.getElementById('modal-zona').value;

        if (!name || !email || !role) {
            Toast.warning('Mohon lengkapi semua field.');
            return;
        }

        if (!editId && !password) {
            Toast.warning('Password wajib diisi untuk user baru.');
            return;
        }

        if (role === 'admin_zona' && !zona_id) {
            Toast.warning('Pilih zona untuk Admin Zona.');
            return;
        }

        const userData = {
            name,
            email,
            contact_email,
            role,
            zona_id: role === 'super_admin' ? null : parseInt(zona_id)
        };

        console.log('[DEBUG] Saving User Data:', userData);

        if (password) userData.password = password;

        try {
            if (editId) {
                const res = await API.put(`/api/users/${editId}`, userData);
                console.log('[DEBUG] Update Response:', res);
                Toast.success('User berhasil diperbarui');
            } else {
                const res = await API.post('/api/users', userData);
                console.log('[DEBUG] Create Response:', res);
                Toast.success('User berhasil ditambahkan');
            }

            closeUserModal();
            await loadUsers();
        } catch (err) {
            Toast.error('Gagal menyimpan user: ' + err.message);
        }
    });
}

// ---- Delete User ----
function deleteUser(id, name) {
    showConfirmModal(
        'Hapus User Permanen',
        `Apakah Anda yakin ingin menghapus user "${name}"? Akun ini akan dihapus secara PERMANEN dari database dan tidak bisa dipulihkan.`,
        async () => {
            try {
                await API.del(`/api/users/${id}`);
                Toast.success('User berhasil dihapus secara permanen');
                await loadUsers();
            } catch (err) {
                Toast.error('Gagal menghapus user: ' + err.message);
            }
        },
        'Hapus Permanen'
    );
}

// ============================================================
// LOGIN HISTORY LOGIC
// ============================================================

async function loadLoginHistory() {
    try {
        const { logs } = await API.get('/api/admin/login-history');
        loginHistory = logs || [];
        renderLoginHistory();
    } catch (err) {
        console.warn('Failed to load login history:', err);
    }
}

function renderLoginHistory() {
    const tbody = document.getElementById('history-body');
    const emptyState = document.getElementById('history-empty');

    if (!tbody) return;

    if (loginHistory.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = loginHistory.map((log, i) => {
        let meta = { ip: '-', ua: '-', status: 'Success' };
        try {
            if (log.context.startsWith('{')) {
                meta = JSON.parse(log.context);
            } else {
                meta.ip = log.context.replace('User logged in from ', '');
            }
        } catch (e) { }

        const uaData = parseUserAgent(meta.ua);
        const role = log.users?.role || '-';
        const roleBadge = role === 'super_admin'
            ? '<span class="badge bg-indigo-500/15 text-indigo-400 border-indigo-500/30">Super Admin</span>'
            : '<span class="badge bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Admin Zona</span>';

        return `
        <tr class="animate-fade-in" style="animation-delay: ${Math.min(i * 30, 500)}ms">
            <td class="text-xs text-gray-400">${formatDateTime(log.created_at)}</td>
            <td>
                <div class="flex items-center gap-3">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(log.users?.name || '?')}&background=1e293b&color=cbd5e1" class="w-7 h-7 rounded-full">
                    <span class="font-medium text-gray-300 text-sm">${log.users?.name || 'Unknown User'}</span>
                </div>
            </td>
            <td>${roleBadge}</td>
            <td class="font-mono text-xs text-gray-500">${meta.ip}</td>
            <td>
                <div class="flex items-center gap-2">
                    <span class="text-lg">${uaData.icon}</span>
                    <div>
                        <p class="text-xs text-gray-400 font-medium">${uaData.browser}</p>
                        <p class="text-[10px] text-gray-600">${uaData.os}</p>
                    </div>
                </div>
            </td>
            <td>
                <span class="px-2 py-0.5 rounded-full text-[10px] ${meta.status === 'Success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}">
                    ${meta.status}
                </span>
            </td>
        </tr>
        `;
    }).join('');
}

function parseUserAgent(uaString) {
    if (!uaString || uaString === 'Unknown' || uaString === '-') {
        return { browser: 'Unknown', os: 'Unknown', icon: '💻' };
    }

    let browser = 'Unknown';
    let icon = '💻';
    if (uaString.includes('Edg/')) { browser = 'Edge'; icon = '🌐'; }
    else if (uaString.includes('Chrome/')) { browser = 'Chrome'; icon = '🌍'; }
    else if (uaString.includes('Firefox/')) { browser = 'Firefox'; icon = '🦊'; }
    else if (uaString.includes('Safari/') && !uaString.includes('Chrome')) { browser = 'Safari'; icon = '🧭'; }

    let os = 'Unknown';
    if (uaString.includes('Windows')) os = 'Windows';
    else if (uaString.includes('Mac OS')) os = 'macOS';
    else if (uaString.includes('Linux')) os = 'Linux';
    else if (uaString.includes('Android')) { os = 'Android'; icon = '📱'; }
    else if (uaString.includes('iPhone') || uaString.includes('iPad')) { os = 'iOS'; icon = '📱'; }

    return { browser, os, icon };
}

// ============================================================
// SYSTEM ACTIVITY LOGS LOGIC
// ============================================================

async function loadActivityLogs() {
    try {
        const { logs } = await API.get('/api/admin/activity-logs');
        activityLogs = logs || [];
        renderActivityLogs();
    } catch (err) {
        console.warn('Failed to load activity logs:', err);
    }
}

function renderActivityLogs() {
    const tbody = document.getElementById('activity-body');
    const emptyState = document.getElementById('activity-empty');

    if (!tbody) return;

    if (activityLogs.length === 0) {
        tbody.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');

    tbody.innerHTML = activityLogs.map((log, i) => {
        const role = log.users?.role || '-';
        const roleBadge = role === 'super_admin'
            ? '<span class="badge bg-indigo-500/15 text-indigo-400 border-indigo-500/30">Super Admin</span>'
            : '<span class="badge bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Admin Zona</span>';

        return `
        <tr class="animate-fade-in" style="animation-delay: ${Math.min(i * 30, 500)}ms">
            <td class="text-xs text-gray-400">${formatDateTime(log.created_at)}</td>
            <td>
                <div class="flex items-center gap-3">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(log.users?.name || '?')}&background=1e293b&color=cbd5e1" class="w-7 h-7 rounded-full">
                    <div class="flex flex-col">
                        <span class="font-medium text-gray-300 text-sm">${log.users?.name || 'Unknown User'}</span>
                        ${roleBadge}
                    </div>
                </div>
            </td>
            <td>
                <span class="px-3 py-1 font-medium text-xs rounded-lg border border-white/10 bg-white/5 text-gray-300 tracking-wide">${log.action}</span>
            </td>
            <td class="text-sm text-gray-400 truncate max-w-sm" title="${log.context}">
                ${log.context}
            </td>
        </tr>
        `;
    }).join('');
}
