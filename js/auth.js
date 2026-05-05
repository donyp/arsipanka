// ============================================================
// Authentication Module — JWT Email/Password
// Replaces Google OAuth + Supabase Auth
// ============================================================

let currentUser = null;

// ---- Initialize Auth (check JWT on page load) ----
async function initAuth(requiredRole = null) {
    const token = API.getToken();

    if (!token) {
        // Not logged in — redirect to login (unless already on login page)
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
            window.location.href = 'index.html';
        }
        return null;
    }

    try {
        // Verify token with backend and get fresh user data
        const { user } = await API.get('/api/auth/me');

        if (!user || !user.is_active) {
            API.clearAuth();
            window.location.href = 'index.html';
            return null;
        }

        // --- BYPASS CONSTRAINT CHECK: Elevate to moderator dynamically ---
        if (user.permissions && user.permissions.includes('IS_MODERATOR')) {
            user.role = 'moderator';
        }

        currentUser = user;

    } catch (err) {
        console.error('Init Auth Error:', err);
        API.clearAuth();
        window.location.href = 'index.html';
        return null;
    }

    // Role guard
    if (requiredRole) {
        let isAllowed = false;
        if (requiredRole === 'super_admin' && (currentUser.role === 'super_admin' || currentUser.role === 'moderator')) {
            isAllowed = true;
        } else if (currentUser.role === requiredRole) {
            isAllowed = true;
        }

        if (!isAllowed) {
            Toast.error('Anda tidak memiliki akses ke halaman ini.');
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
            return null;
        }
    }

    updateUserUI();
    return currentUser;
}

// ---- Login with Email & Password via Backend JWT ----
async function loginWithCredentials(email, password) {
    const { token, user } = await API.post('/api/auth/login', {
        email,
        password,
        session_id: API.getSessionId()
    });

    // Store JWT + user in localStorage
    API.setAuth(token, user);

    // Redirect to dashboard
    window.location.href = 'dashboard.html';
}

// ---- Logout ----
async function logout() {
    try {
        await API.post('/api/auth/logout', { session_id: API.getSessionId() });
    } catch (_) {
        // Silent fail — we're logging out anyway
    }
    API.clearAuth();
    currentUser = null;
    window.location.href = 'index.html';
}

// ---- Update User UI Elements ----
function updateUserUI() {
    if (!currentUser) return;

    // Update user name displays
    document.querySelectorAll('[data-user-name]').forEach(el => {
        el.textContent = currentUser.name;
    });

    // Update user email displays
    document.querySelectorAll('[data-user-email]').forEach(el => {
        el.textContent = currentUser.email;
    });

    // Update avatar
    document.querySelectorAll('[data-user-avatar]').forEach(el => {
        el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6366f1&color=fff&size=80`;
    });

    // Update role badge
    document.querySelectorAll('[data-user-role]').forEach(el => {
        el.textContent = currentUser.role === 'super_admin' ? 'Super Admin' : 'Admin Zona';
        el.className = currentUser.role === 'super_admin'
            ? 'text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            : 'text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    });

    // Update zona display
    document.querySelectorAll('[data-user-zona]').forEach(el => {
        el.textContent = currentUser.zonas ? currentUser.zonas.nama : 'Semua Zona';
    });

    // Show/hide super admin elements
    document.querySelectorAll('[data-role="super_admin"]').forEach(el => {
        el.style.display = (currentUser.role === 'super_admin' || currentUser.role === 'moderator') ? '' : 'none';
    });

    // Handle Granular Permissions
    document.querySelectorAll('[data-permission]').forEach(el => {
        const requiredPerm = el.getAttribute('data-permission');
        const hasPerm = hasPermission(requiredPerm);
        el.style.display = hasPerm ? '' : 'none';
    });

    // Hide elements only for admin zona
    document.querySelectorAll('[data-role="admin_zona"]').forEach(el => {
        el.style.display = currentUser.role === 'admin_zona' ? '' : 'none';
    });

    // --- Admin Zona: Hide sidebar, expand main to full-width ---
    if (currentUser.role === 'admin_zona') {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('main');
        const headerLogout = document.getElementById('header-logout-btn');
        if (sidebar) sidebar.style.display = 'none';
        if (mainContent) {
            mainContent.classList.remove('ml-64');
            mainContent.style.marginLeft = '0';
        }
        if (headerLogout) headerLogout.classList.replace('hidden', 'flex');
    }
}

// ---- Check if current user is Super Admin ----
function isSuperAdmin() {
    return currentUser?.role === 'super_admin' || currentUser?.role === 'moderator';
}

function hasPermission(perm) {
    if (!currentUser) return false;
    if (currentUser.role === 'moderator') return true;
    if (currentUser.role === 'super_admin' && perm !== 'manage_users') return true;
    return currentUser.permissions && currentUser.permissions.includes(perm);
}

// ---- Helper: Get zone label from currentUser or zona list ----
function getZoneLabel(zonaId) {
    // If zones are loaded, find the label
    if (window._zonaCache) {
        const z = window._zonaCache.find(z => z.id === zonaId);
        if (z) return z.nama;
    }
    return `Zona ${zonaId}`;
}
