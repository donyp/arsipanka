const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../data/data.db');
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(x_storages)", (err, columns) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('Columns in x_storages:');
    columns.forEach(c => console.log(` - ${c.name} (${c.type})`));
});
db.close();
