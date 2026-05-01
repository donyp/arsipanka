const fs = require('fs');
const path = require('path');

const files = ['upload.html', 'batch-upload.html', 'ads-media.html'];

const appendHtml = `
            <a href="socmed-analytics.html" data-role="super_admin"
                class="sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Socmed Analytics
            </a>
        </nav>`;

files.forEach(file => {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
        console.log('Skipping ' + file + ' - does not exist');
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('socmed-analytics.html')) {
        // Find the block containing Media Ads up to </nav> and swap </nav>
        content = content.replace(/(Media Ads\s*<\/a>\s*)<\/nav>/g, '$1' + appendHtml);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated ' + file);
    } else {
        console.log('Already updated ' + file);
    }
});
