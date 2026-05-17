/**
 * Automated fix for Flash of Unauthorized Content (FOUC)
 * Synchronize the strengthened anti-flash script across all HTML files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pages = [
    'dashboard.html', 'upload.html', 'piutang.html', 'history.html',
    'users.html', 'tokos.html', 'zonas.html', 'audit.html',
    'requests.html', 'trash.html', 'cleanup.html', 'batch-upload.html',
    'ads-media.html',
];

const ANTI_FLASH_SCRIPT = `
    <script>
        // Strengthened Anti-Flash (FOUC) System v2.0
        (function () {
            document.documentElement.classList.add('auth-loading');
            try {
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    if (user.role === 'admin_zona') {
                        document.documentElement.classList.add('role-admin-zona');
                    }
                }
            } catch (e) { }
        })();
    </script>`;

for (const page of pages) {
    const filePath = path.join(ROOT, page);
    if (!fs.existsSync(filePath)) { console.log(`SKIP: ${page}`); continue; }

    let html = fs.readFileSync(filePath, 'utf-8');

    // Replace old anti-flash block
    // We look for the generic comment or script pattern
    const regex = /<script>\s*\/\/ Anti-flash for Admin Zona[\s\S]*?<\/script>/i;

    if (regex.test(html)) {
        html = html.replace(regex, ANTI_FLASH_SCRIPT.trim());
        fs.writeFileSync(filePath, html, 'utf-8');
        console.log(`UPDATED: ${page}`);
    } else {
        // Fallback: Insert into head
        html = html.replace('</head>', `${ANTI_FLASH_SCRIPT}\n</head>`);
        fs.writeFileSync(filePath, html, 'utf-8');
        console.log(`INJECTED: ${page}`);
    }
}

console.log('\nFOUC fix applied to all pages.');
