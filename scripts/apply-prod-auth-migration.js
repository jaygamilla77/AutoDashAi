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
    multipleStatements: true,
  });

  const stmts = [
    "ALTER TABLE users MODIFY COLUMN passwordHash VARCHAR(255) NULL",
    "ALTER TABLE users ADD COLUMN plan VARCHAR(32) NOT NULL DEFAULT 'starter'",
    "ALTER TABLE users ADD COLUMN planTrialEndsAt DATETIME NULL",
    "ALTER TABLE users ADD COLUMN authProvider VARCHAR(32) NOT NULL DEFAULT 'local'",
    "ALTER TABLE users ADD COLUMN providerUserId VARCHAR(255) NULL",
    "ALTER TABLE users ADD COLUMN avatarUrl VARCHAR(500) NULL",
    "ALTER TABLE users ADD COLUMN onboardingCompleted TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN onboardingStep INT NOT NULL DEFAULT 0",
  ];

  for (const sql of stmts) {
    try {
      await c.query(sql);
      console.log('OK   ', sql);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(e.message)) {
        console.log('SKIP ', sql, '(already exists)');
      } else {
        console.log('FAIL ', sql, '->', e.code, e.message);
      }
    }
  }

  console.log('\n--- users columns after ---');
  const [cols] = await c.query('SHOW COLUMNS FROM users');
  console.log(cols.map(x => `${x.Field}: ${x.Type} ${x.Null === 'YES' ? 'NULL' : 'NOT NULL'}`).join('\n'));
  await c.end();
})().catch(e => { console.error('ERR', e.code, e.message); process.exit(1); });
