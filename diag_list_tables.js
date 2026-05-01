const path = require('path');
module.paths.push(path.join(__dirname, 'backend', 'node_modules'));
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'data', 'data.db');
const db = new sqlite3.Database(dbPath);
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
    db.close();
});
