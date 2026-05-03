/**
 * Copy all tables (schema + data) from a source MySQL/MariaDB database
 * to a target one. Usage:
 *   node scripts/copy-db.js
 *
 * Configuration via env vars (or edit the SOURCE/TARGET objects below):
 *   SRC_HOST, SRC_PORT, SRC_USER, SRC_PASS, SRC_DB
 *   DST_HOST, DST_PORT, DST_USER, DST_PASS, DST_DB
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const SOURCE = {
  host: process.env.SRC_HOST || 'srv1411.hstgr.io',
  port: Number(process.env.SRC_PORT || 3306),
  user: process.env.SRC_USER || 'u986442709_liknayautodash',
  password: process.env.SRC_PASS || 'Df*;=z~mL2g#',
  database: process.env.SRC_DB || 'u986442709_liknayautodash',
  multipleStatements: true,
};

const TARGET = {
  host: process.env.DST_HOST || 'srv1411.hstgr.io',
  port: Number(process.env.DST_PORT || 3306),
  user: process.env.DST_USER || 'u986442709_autodashln',
  password: process.env.DST_PASS || '4wDY8+R;LJv@',
  database: process.env.DST_DB || 'u986442709_autodashln',
  multipleStatements: true,
};

function fmtValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Buffer.isBuffer(v)) return '0x' + v.toString('hex');
  if (v instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `'${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}'`;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'object') return `'${String(JSON.stringify(v)).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function main() {
  console.log(`Source: ${SOURCE.user}@${SOURCE.host}/${SOURCE.database}`);
  console.log(`Target: ${TARGET.user}@${TARGET.host}/${TARGET.database}`);

  const src = await mysql.createConnection(SOURCE);
  const dst = await mysql.createConnection(TARGET);

  try {
    // List tables on source
    const [tablesRows] = await src.query('SHOW TABLES');
    const tables = tablesRows.map((r) => Object.values(r)[0]);
    console.log(`\nFound ${tables.length} tables on source:\n  - ${tables.join('\n  - ')}\n`);

    // Disable FK checks on target
    await dst.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of tables) {
      console.log(`\n=== ${table} ===`);

      // Get CREATE TABLE
      const [createRows] = await src.query(`SHOW CREATE TABLE \`${table}\``);
      const createSql = createRows[0]['Create Table'];

      // Drop + recreate on target
      await dst.query(`DROP TABLE IF EXISTS \`${table}\``);
      await dst.query(createSql);
      console.log(`  schema created`);

      // Copy data
      const [rows] = await src.query(`SELECT * FROM \`${table}\``);
      if (!rows.length) {
        console.log(`  no rows`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `\`${c}\``).join(', ');

      // Insert in batches of 200
      const batchSize = 200;
      for (let i = 0; i < rows.length; i += batchSize) {
        const slice = rows.slice(i, i + batchSize);
        const values = slice
          .map((r) => '(' + columns.map((c) => fmtValue(r[c])).join(', ') + ')')
          .join(',\n');
        const sql = `INSERT INTO \`${table}\` (${colList}) VALUES\n${values}`;
        await dst.query(sql);
      }
      console.log(`  inserted ${rows.length} rows`);
    }

    await dst.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\nDone.');
  } catch (err) {
    console.error('\nERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await src.end();
    await dst.end();
  }
}

main();
