const bcrypt = require('bcryptjs');

const rawPassword = 'Admin123!';
const testHash = '$2a$12$VjpDNswE9XYYWaLgiFeLuuC5f9/wg6ArhrBrObk4Cnf7k.opsUj8q';

bcrypt.compare(rawPassword, testHash).then(res => console.log('Does test hash match? ', res));

bcrypt.hash(rawPassword, 12).then(h => {
    console.log('NEW CLEAN HASH:');
    console.log(h);
    require('fs').writeFileSync('hash.txt', h);
});
