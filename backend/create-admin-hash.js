const bcrypt = require('bcryptjs');
const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: node create-admin-hash.js "A_STRONG_PASSWORD"');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
