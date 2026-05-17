const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

const linkHTML = `            <a href="requests.html"
                class="sidebar-link flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all group text-gray-400 hover:text-white hover:bg-white/5">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/>
                </svg>
                Antrean Request
            </a>`;

const regex = /(<a href="audit.html".*?<\/a>)/s;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('href="requests.html"')) {
        content = content.replace(regex, '$1\n' + linkHTML);
        fs.writeFileSync(file, content);
        console.log('Injected into ' + file);
    }
});
