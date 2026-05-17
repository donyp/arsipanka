const fs = require('fs');

// 1. Fix Mojibake in dashboard.html
const dashboardPath = 'dashboard.html';
if (fs.existsSync(dashboardPath)) {
    let content = fs.readFileSync(dashboardPath, 'utf8');
    // More robust replacement for â†  (even if whitespace varies)
    const newContent = content.replace(/â[^\s]*\s*Prev/g, '&larr; Prev');
    if (newContent !== content) {
        fs.writeFileSync(dashboardPath, newContent, 'utf8');
        console.log('[OK] dashboard.html arrow fixed');
    } else {
        console.log('[FAIL] dashboard.html arrow not found');
    }
}

// 2. Fix Admin Zona Filter in dashboard.js
const jsPath = 'js/dashboard.js';
if (fs.existsSync(jsPath)) {
    let content = fs.readFileSync(jsPath, 'utf8');
    // Safer injection: replace the specific block inside populateFilters
    const target = /if\s*\(!isSuperAdmin\(\)\)\s*\{[\s\S]*?catSelect\.value\s*=\s*'INVOICE';\s*\}/;
    const replacement = `if (!isSuperAdmin()) {
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

    const newContent = content.replace(target, replacement);
    if (newContent !== content) {
        fs.writeFileSync(jsPath, newContent, 'utf8');
        console.log('[OK] js/dashboard.js filter fixed');
    } else {
        console.log('[FAIL] js/dashboard.js filter block not found');
    }
}
