const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const vStamp = `?v=${Date.now()}`;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Restore missing script section if it was corrupted in batch-upload.html
    if (file === 'batch-upload.html' && !content.includes('js/batch-upload-v4.js')) {
        // Find the place before </body>
        const closingTag = '</body>';
        const scriptSection = `
    <!-- Scripts -->
    <script src="js/config.js"></script>
    <script src="js/supabase.js"></script>
    <script src="js/utils.js${vStamp}"></script>
    <script src="js/auth.js"></script>
    <script src="js/batch-upload-v4.js${vStamp}"></script>
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

    // General replacement for all files to use v4
    content = content.replace(/js\/batch-upload(?:\.js|-v[0-9]+\.js)(?:\?v=[0-9]+)?/g, `js/batch-upload-v4.js${vStamp}`);

    fs.writeFileSync(filePath, content);
    console.log(`Processed ${file}`);
}
