const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const vStamp = `?v=${Date.now()}`;

let changes = 0;
for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    let original = content;
    // Replace script src string like src="js/batch-upload.js" to src="js/batch-upload.js?v=..."
    // Be careful to replace only specific files that changed or just all local ones
    const scriptsToUpdate = ['batch-upload.js', 'history.js', 'server.js', 'utils.js', 'dashboard.js'];

    scriptsToUpdate.forEach(script => {
        // match src="js/script.js" or src="js/script.js?v=old"
        const regex = new RegExp(`src="js/${script}(?:\\?v=[0-9]+)?"`, 'g');
        content = content.replace(regex, `src="js/${script}${vStamp}"`);
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
        changes++;
    }
}
console.log(`Cache buster added to ${changes} HTML files.`);
