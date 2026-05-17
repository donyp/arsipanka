// ============================================================
// Shared Sidebar Component — Single Source of Truth
// Auto-detects current page and renders the sidebar
// ============================================================

(function () {
    const activePage = window.location.pathname.split('/').pop() || 'dashboard.html';

    const menuItems = [
        { section: 'Menu Utama' },
        { href: 'dashboard.html', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', guard: 'data-role="super_admin"' },

        { section: 'Upload' },
        { href: 'upload.html', label: 'Upload Invoice Merah', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', guard: 'data-permission="upload_single"' },
        { href: 'piutang.html', label: 'Bukti Pembayaran Piutang', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', guard: 'data-permission="view_piutang"' },
        { href: 'history.html', label: 'Riwayat Batch', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', guard: 'data-role="super_admin"' },

        { section: 'Manajemen' },
        { href: 'users.html', label: 'Manajemen User', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', guard: 'data-permission="manage_users"' },
        { href: 'tokos.html', label: 'Manajemen Toko', icon: 'M19 21V5a2 2 0 012-2H9a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', guard: 'data-permission="manage_toko"' },
        { href: 'zonas.html', label: 'Manajemen Zona', iconPaths: ['M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z', 'M15 11a3 3 0 11-6 0 3 3 0 016 0z'], guard: 'data-permission="manage_zonas"' },

        { section: 'Sistem' },
        { href: 'audit.html', label: 'Log Aktivitas', iconPaths: ['M15 12a3 3 0 11-6 0 3 3 0 016 0z', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'], guard: 'data-role="super_admin"' },
        { href: 'requests.html', label: 'Antrean Request', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z', guard: '' },
        { href: 'trash.html', label: 'Tong Sampah', icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', guard: 'data-permission="restore_trash"' },
        { href: 'cleanup.html', label: 'Optimasi Penyimpanan', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.051.046M15.571 8.572a2 2 0 011.022.547l2.387.477a6 6 0 013.86-.517l.318-.158a6 6 0 003.86-.517L20.95 8.79a2 2 0 011.051-.046M12 7v10m0 0l-1.5-1.5M12 17l1.5-1.5', guard: 'data-role="super_admin"' },
    ];

    let navHTML = '';
    for (const item of menuItems) {
        if (item.section) {
            navHTML += `<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">${item.section}</p>`;
            continue;
        }

        const isActive = activePage === item.href;
        const activeClass = isActive
            ? 'active text-white bg-white/10 ring-1 ring-white/10 shadow-lg'
            : 'text-gray-400 hover:text-white hover:bg-white/5';

        let svgContent = '';
        if (item.iconPaths) {
            svgContent = item.iconPaths.map(p =>
                `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p}" />`
            ).join('');
        } else {
            svgContent = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${item.icon}" />`;
        }

        const guardAttr = item.guard || '';

        navHTML += `
            <a href="${item.href}" ${guardAttr}
                class="sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all group ${activeClass}">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${svgContent}
                </svg>
                ${item.label}
            </a>`;
    }

    // Wait for DOM to be ready, then inject
    function inject() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        sidebar.innerHTML = `
            <div class="p-5 border-b border-white/5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 class="text-sm font-bold text-white">Pusat Arsip Anka</h1>
                        <span class="text-xs text-gray-500">Multi-Zona System</span>
                    </div>
                </div>
            </div>

            <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
                ${navHTML}
            </nav>

            <div class="p-4 border-t border-white/5">
                <div class="flex items-center gap-3">
                    <img data-user-avatar src="" alt="avatar" class="w-9 h-9 rounded-full ring-2 ring-indigo-500/30">
                    <div class="flex-1 min-w-0">
                        <p data-user-name class="text-sm font-medium text-white truncate">Loading...</p>
                        <span data-user-role class="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">-</span>
                    </div>
                    <button onclick="logout()" title="Logout"
                        class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    // Run immediately if DOM is ready, otherwise wait
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
