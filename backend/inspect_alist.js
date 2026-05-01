const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join('d:', '.gemini', 'antigravity', 'scratch', 'arsip anka', 'alist', 'data', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('Inspecting Alist Storage Configuration...');
db.all("SELECT mount_path, driver, disabled, status FROM x_storages", [], (err, rows) => {
    if (err) {
        console.error('Error querying Alist DB:', err);
        return;
    }
    console.log('Active Storages:', JSON.stringify(rows, null, 2));
    db.close();
});
