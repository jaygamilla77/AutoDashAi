const mysql = require('mysql2/promise');
(async () => {
  require('dotenv').config();
  const {
    PROD_DB_HOST = process.env.DB_HOST,
    PROD_DB_PORT = process.env.DB_PORT || 3306,
    PROD_DB_USER,
    PROD_DB_PASSWORD,
    PROD_DB_NAME,
  } = process.env;
  if (!PROD_DB_USER || !PROD_DB_PASSWORD || !PROD_DB_NAME) {
    console.error('Set PROD_DB_USER / PROD_DB_PASSWORD / PROD_DB_NAME (and optionally PROD_DB_HOST / PROD_DB_PORT) in the environment before running this script.');
    process.exit(1);
  }
  const c = await mysql.createConnection({
    host: PROD_DB_HOST,
    port: Number(PROD_DB_PORT),
    user: PROD_DB_USER,
    password: PROD_DB_PASSWORD,
    database: PROD_DB_NAME,
  });
  const [cols] = await c.query('SHOW COLUMNS FROM users');
  console.log('--- users columns ---');
  console.log(cols.map(x => `${x.Field}: ${x.Type} ${x.Null === 'YES' ? 'NULL' : 'NOT NULL'} default=${x.Default}`).join('\n'));
  const [t] = await c.query("SHOW TABLES LIKE 'pending_signups'");
  console.log('\npending_signups exists:', t.length > 0);
  if (t.length) {
    const [pc] = await c.query('SHOW COLUMNS FROM pending_signups');
    console.log(pc.map(x => `${x.Field}: ${x.Type}`).join('\n'));
  }
  await c.end();
})().catch(e => { console.error('ERR', e.code, e.message); process.exit(1); });
