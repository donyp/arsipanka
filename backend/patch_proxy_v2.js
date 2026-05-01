const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../data/data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Enabling Native Proxy for TeraBox...');

    // Set webdav_policy to native_proxy
    // Set web_proxy to true (1)
    db.run(
        "UPDATE x_storages SET webdav_policy = 'native_proxy', web_proxy = 1 WHERE driver = 'TeraBox'",
        function (err) {
            if (err) {
                console.error('Update failed:', err.message);
            } else {
                console.log(`SUCCESS: Updated ${this.changes} storage(s).`);
            }
        }
    );
});

db.close();
