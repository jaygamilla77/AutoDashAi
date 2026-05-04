const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  const {
    PROD_DB_HOST = process.env.DB_HOST,
    PROD_DB_PORT = process.env.DB_PORT || 3306,
    PROD_DB_USER,
    PROD_DB_PASSWORD,
    PROD_DB_NAME,
    PROD_ADMIN_EMAIL,
    PROD_ADMIN_NEW_PASSWORD,
  } = process.env;

  if (!PROD_DB_USER || !PROD_DB_PASSWORD || !PROD_DB_NAME || !PROD_ADMIN_NEW_PASSWORD) {
    console.error('Set PROD_DB_USER / PROD_DB_PASSWORD / PROD_DB_NAME / PROD_ADMIN_NEW_PASSWORD (and optionally PROD_ADMIN_EMAIL) before running.');
    process.exit(1);
  }

  const c = await mysql.createConnection({
    host: PROD_DB_HOST,
    port: Number(PROD_DB_PORT),
    user: PROD_DB_USER,
    password: PROD_DB_PASSWORD,
    database: PROD_DB_NAME,
  });

  const [users] = await c.query('SELECT id, email, name, authProvider FROM users ORDER BY id ASC');
  console.log('--- existing users ---');
  console.table(users);

  let target;
  if (PROD_ADMIN_EMAIL) {
    target = users.find(u => u.email.toLowerCase() === PROD_ADMIN_EMAIL.toLowerCase());
  } else {
    target = users[0];
  }
  if (!target) {
    console.error('No matching user found.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(PROD_ADMIN_NEW_PASSWORD, 10);
  await c.query(
    "UPDATE users SET passwordHash = ?, authProvider = 'local', emailVerified = 1, updatedAt = NOW() WHERE id = ?",
    [hash, target.id]
  );
  console.log(`\nPassword reset for user id=${target.id} email=${target.email}`);
  await c.end();
})().catch(e => { console.error('ERR', e.code, e.message); process.exit(1); });
