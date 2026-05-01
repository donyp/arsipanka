// ============================================================
// Utility Functions - Toast, Modals, Helpers
// ============================================================

// ---- Toast Notification System ----
const Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'fixed top-6 right-6 z-[9999] flex flex-col gap-3';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3500) {
        this.init();

        const icons = {
            success: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            warning: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>`,
            info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        };

        const colors = {
            success: 'from-emerald-500/20 border-emerald-500/40 text-emerald-300',
            error: 'from-red-500/20 border-red-500/40 text-red-300',
            warning: 'from-amber-500/20 border-amber-500/40 text-amber-300',
            info: 'from-blue-500/20 border-blue-500/40 text-blue-300'
        };

        const toast = document.createElement('div');
        toast.className = `toast-item flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl bg-gradient-to-r ${colors[type]} to-transparent shadow-2xl min-w-[320px] max-w-[420px] animate-slide-in`;
        toast.innerHTML = `
            <span class="flex-shrink-0">${icons[type]}</span>
            <span class="text-sm font-medium flex-1">${message}</span>
            <button onclick="this.parentElement.remove()" class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('animate-slide-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// ---- Confirmation Modal ----
function showConfirmModal(title, message, onConfirm, confirmText = 'Konfirmasi', cancelText = 'Batal') {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9998] flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="confirm-backdrop"></div>
        <div class="relative bg-gray-900/95 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
            <h3 class="text-lg font-semibold text-white mb-2">${title}</h3>
            <p class="text-gray-400 text-sm mb-6">${message}</p>
            <div class="flex gap-3 justify-end">
                <button id="confirm-cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200">${cancelText}</button>
                <button id="confirm-ok" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/25 transition-all duration-200">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-backdrop').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#confirm-ok').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
}

// ---- Loading Spinner ----
function showLoading(targetId = 'main-content') {
    const target = document.getElementById(targetId);
    if (!target) return;

    const loader = document.createElement('div');
    loader.id = 'loading-overlay';
    loader.className = 'absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm rounded-2xl';
    loader.innerHTML = `
        <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <span class="text-sm text-gray-400">Memuat data...</span>
        </div>
    `;
    target.style.position = 'relative';
    target.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.remove();
}

// ---- Date Formatting ----
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- Category Label ----
function getCategoryLabel(value) {
    const cat = CONFIG.CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : value;
}

function getCategoryColor(value) {
    const colors = {
        'PPN': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'NON_PPN': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'INVOICE': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        'PIUTANG': 'bg-purple-500/15 text-purple-400 border-purple-500/30'
    };
    return colors[value] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
}

// ---- Zone Label ----
function getZoneLabel(value) {
    const zone = CONFIG.ZONES.find(z => z.value === value);
    return zone ? zone.label : value;
}

// ---- Debounce ----
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Truncate Text ----
function truncate(str, len = 40) {
    if (!str) return '';
    // Strip .pdf extension for display if requested
    const cleanStr = str.replace(/\.pdf$/i, '');
    return cleanStr.length > len ? cleanStr.substring(0, len) + '...' : cleanStr;
}

// ---- Currency Formatting ----
function formatCurrency(val) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(val);
}
