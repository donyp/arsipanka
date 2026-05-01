const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../data/data.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT driver, mount_path FROM x_storages", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
});
db.close();
