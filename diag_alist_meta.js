const path = require('path');
const fs = require('fs');
// Add backend modules to paths
module.paths.push(path.join(__dirname, 'backend', 'node_modules'));

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'data', 'data.db');

if (!fs.existsSync(dbPath)) {
    console.error('Database not found at:', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

db.get("SELECT meta FROM x_storages WHERE mount_path = '/terabox'", (err, row) => {
    if (err) {
        console.error(err);
    } else if (row) {
        console.log(JSON.stringify(JSON.parse(row.meta), null, 2));
    } else {
        console.log('No storage found for /terabox');
    }
    db.close();
});
