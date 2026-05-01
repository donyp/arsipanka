const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join('d:', '.gemini', 'antigravity', 'scratch', 'arsip anka', 'data', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('Inspecting ACTUAL Alist Storage Configuration...');
db.all("SELECT * FROM x_storages", [], (err, rows) => {
    if (err) {
        console.error('Error querying x_storages:', err);
    } else {
        fs.writeFileSync('storage_dump.json', JSON.stringify(rows, null, 2));
        console.log('Dump complete: storage_dump.json');
    }
    db.close();
});
