const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const vStamp = `?v=${Date.now()}`;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Restore missing script section if it was corrupted in batch-upload.html
    if (file === 'batch-upload.html' && (!content.includes('js/batch-upload-v11.js') || !content.includes('handleSmartUpload'))) {
        // Find the place before </body>
        const closingTag = '</body>';
        const scriptSection = `
    <!-- Scripts -->
    <script src="js/config.js"></script>
    <script src="js/supabase.js"></script>
    <script src="js/utils.js${vStamp}"></script>
    <script src="js/auth.js"></script>
    <script src="js/batch-upload-v11.js${vStamp}"></script>
    <script>
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobile-overlay');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        }
    </script>
`;
        // If it looks like it was cut off (has stray JS fragments)
        content = content.replace(/const overlay = document\.getElementById\('mobile-overlay'\);[\s\S]*?<\/body>/, scriptSection + '</body>');
    }

    // Sidebar Categorization v2
    if (content.includes('id="sidebar"')) {
        console.log(`- Categorizing sidebar in ${file}`);

        // 1. Remove old dividers
        content = content.replace(/<!-- Divider -->[\s\S]*?<p class="text-\[10px\] text-gray-600 uppercase tracking-widest mt-3 mb-1">Tools<\/p>\s*<\/div>/g, '');

        // 2. Hide Media Ads globally
        content = content.replace(/(<a href="ads-media\.html"[\s\S]*?<\/a>)/g, '<div class="hidden">$1</div>');

        // 3. Inject Headers
        // Menu Utama (Dashboard)
        content = content.replace(/(<a href="dashboard\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-3 mb-1 px-4">Menu Utama</p>\n            $1');

        // Upload (Upload, Piutang, History)
        content = content.replace(/(<a href="upload\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Upload</p>\n            $1');

        // Manajemen (Users, Tokos, Zonas)
        content = content.replace(/(<a href="users\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Manajemen</p>\n            $1');

        // Sistem (Trash)
        content = content.replace(/(<a href="trash\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Sistem</p>\n            $1');

        // Laporan & Analitik (Reports)
        content = content.replace(/(<a href="dashboard\.html"[\s\S]*?<\/a>)/, '$1\n            <p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Laporan & Analitik</p>\n            <a href="reports.html" data-role="super_admin" class="sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all group text-gray-400 hover:text-white hover:bg-white/5">\n                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>\n                Laporan BI\n            </a>');

        // Ensure no duplicate headers or links if run twice
        const hd = 'text-\\[10px\\] text-gray-600 uppercase tracking-widest mt-[0-9] mb-1 px-4';
        content = content.replace(new RegExp(`(<p class="${hd}">Menu Utama<\/p>\\s*){2,}`, 'g'), '$1');
        content = content.replace(new RegExp(`(<p class="${hd}">Laporan & Analitik<\/p>\\s*){2,}`, 'g'), '$1');
        content = content.replace(new RegExp(`(<a href="reports\\.html"[\s\S]*?<\/a>\\s*){2,}`, 'g'), '$1');
        content = content.replace(new RegExp(`(<p class="${hd}">Upload<\/p>\\s*){2,}`, 'g'), '$1');
        content = content.replace(new RegExp(`(<p class="${hd}">Manajemen<\/p>\\s*){2,}`, 'g'), '$1');
        content = content.replace(new RegExp(`(<p class="${hd}">Sistem<\/p>\\s*){2,}`, 'g'), '$1');
    }

    fs.writeFileSync(filePath, content);
    console.log(`Processed ${file}`);
}
