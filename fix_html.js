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
        content = content.replace(/const overlay = document\.getElementById\('mobile-overlay'\);[\s\S]*?<\/body>/, scriptSection + '</body>');
    }

    // Sidebar Categorization v3 (Idempotent + Polish)
    if (content.includes('id="sidebar"')) {
        console.log(`- Polishing sidebar in ${file}`);

        // 1. CLEANUP: Reset state by removing all previously injected headers and problematic links
        const hdRegex = /<p class="text-\[10px\] text-gray-600 uppercase tracking-widest mt-[0-9] mb-1 px-4">.*?<\/p>\s*/g;
        content = content.replace(hdRegex, '');
        content = content.replace(/<a href="cleanup\.html"[\s\S]*?<\/a>\s*/g, '');
        content = content.replace(/<a href="reports\.html"[\s\S]*?<\/a>\s*/g, '');
        content = content.replace(/<!-- Divider -->[\s\S]*?<p class="text-\[10px\] text-gray-600 uppercase tracking-widest mt-3 mb-1">Tools<\/p>\s*/g, '');

        // Anti-mess: Clean nested hidden ads-media legacy
        content = content.replace(/<div class="hidden">[\s\S]*?<a href="ads-media\.html"[\s\S]*?<\/a>[\s\S]*?<\/div>/g, '');
        content = content.replace(/<a href="ads-media\.html"[\s\S]*?<\/a>/g, '');

        // 2. INJECT: Re-apply headers and links in the premium ordered architecture

        // Menu Utama
        content = content.replace(/(<a href="dashboard\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-3 mb-1 px-4">Menu Utama</p>\n            $1');

        // Upload
        content = content.replace(/(<a href="upload\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Upload</p>\n            $1');

        // Manajemen
        content = content.replace(/(<a href="users\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Manajemen</p>\n            $1');

        // Sistem (+ Cleanup)
        content = content.replace(/(<a href="trash\.html"[\s\S]*?<\/a>)/, '<p class="text-[10px] text-gray-600 uppercase tracking-widest mt-6 mb-1 px-4">Sistem</p>\n            $1\n            <a href="cleanup.html" data-role="super_admin" class="sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all group text-gray-400 hover:text-white hover:bg-white/5">\n                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.051.046M15.571 8.572a2 2 0 011.022.547l2.387.477a6 6 0 013.86-.517l.318-.158a6 6 0 003.86-.517L20.95 8.79a2 2 0 011.051-.046M12 7v10m0 0l-1.5-1.5M12 17l1.5-1.5" /></svg>\n                Optimasi Penyimpanan\n            </a>');

        // 3. POST-PROCESS: Cleanup whitespace and ensure single blocks
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    }

    fs.writeFileSync(filePath, content);
    console.log(`Processed ${file}`);
}
