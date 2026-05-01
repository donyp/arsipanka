const fs = require('fs');
const path = require('path');

const files = ['dashboard.html', 'users.html', 'upload.html', 'batch-upload.html', 'ads-media.html'];

files.forEach(file => {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Regex to match the exact HTML block we added for Socmed Analytics
    const regex = /<a href="socmed-analytics\.html"[\s\S]*?<\/a>\s*<\/nav>/;

    if (regex.test(content)) {
        content = content.replace(regex, '</nav>');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Cleaned ' + file);
    }
});
