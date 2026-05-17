const fs = require('fs');
const path = require('path');

// 1. Fix Mojibake in dashboard.html
const dashboardPath = 'dashboard.html';
if (fs.existsSync(dashboardPath)) {
    let html = fs.readFileSync(dashboardPath, 'utf8');
    // Replace â†  (Mojibake for left arrow)
    html = html.replace(/â†  /g, '&larr; ');
    fs.writeFileSync(dashboardPath, html, 'utf8');
    console.log('[FIX] Encoding Mojibake fixed in dashboard.html');
}

// 2. Fix Admin Zona Filter in dashboard.js
const jsPath = 'js/dashboard.js';
if (fs.existsSync(jsPath)) {
    let js = fs.readFileSync(jsPath, 'utf8');

    const target = `    if (!isSuperAdmin()) {
        const catSelect = document.getElementById('filter-category');
        if (catSelect) catSelect.value = 'INVOICE';
    }`;

    const replacement = `    if (!isSuperAdmin()) {
        const catSelect = document.getElementById('filter-category');
        if (catSelect) {
            catSelect.value = 'INVOICE';
            // Prune restricted options for Admin Zona
            Array.from(catSelect.options).forEach(opt => {
                if (opt.value === 'PIUTANG' || opt.value === '') {
                    opt.remove();
                }
            });
        }
    }`;

    js = js.replace(target, replacement);
    fs.writeFileSync(jsPath, js, 'utf8');
    console.log('[FIX] Admin Zona filter restriction applied in js/dashboard.js');
}
