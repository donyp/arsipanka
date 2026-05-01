const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Checking x_storages table...');

    db.all("SELECT id, mount_path, driver, webdav_proxy FROM x_storages", (err, rows) => {
        if (err) {
            console.error('Error reading table:', err.message);
            return;
        }

        rows.forEach(row => {
            console.log(`Found storage: ${row.mount_path} (Driver: ${row.driver}, Proxy: ${row.webdav_proxy})`);

            if (row.driver === 'TeraBox') {
                console.log(`Enabling webdav_proxy for ${row.mount_path}...`);
                db.run("UPDATE x_storages SET webdav_proxy = 1 WHERE id = ?", [row.id], function (updateErr) {
                    if (updateErr) {
                        console.error('Update failed:', updateErr.message);
                    } else {
                        console.log('SUCCESS: webdav_proxy enabled.');
                    }
                });
            }
        });
    });
});

db.close();
