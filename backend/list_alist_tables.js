const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join('d:', '.gemini', 'antigravity', 'scratch', 'arsip anka', 'alist', 'data', 'data.db');
const db = new sqlite3.Database(dbPath);

console.log('Listing all tables in Alist DB...');
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    if (err) {
        console.error('Error listing tables:', err);
        return;
    }
    console.log('Tables:', JSON.stringify(rows, null, 2));

    if (rows.length > 0) {
        // Try to find a table that looks like storage
        const storageTable = rows.find(r => r.name.toLowerCase().includes('storage'))?.name;
        if (storageTable) {
            console.log(`Querying ${storageTable}...`);
            db.all(`SELECT * FROM ${storageTable}`, [], (err, data) => {
                if (err) console.error(`Error querying ${storageTable}:`, err);
                else console.log(`${storageTable} content:`, JSON.stringify(data, null, 2));
                db.close();
            });
        } else {
            db.close();
        }
    } else {
        db.close();
    }
});
