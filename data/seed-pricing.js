const { Sequelize } = require('sequelize');
require('dotenv').config();

const s = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  logging: false,
});

const now = new Date();

s.query('DELETE FROM pricing_configs')
  .then(() =>
    s.query(
      `INSERT INTO pricing_configs (planId, basePriceUSD, discountType, discountValue, finalPriceUSD, isActive, description, createdAt, updatedAt) VALUES
       ('starter',      0,   'none', 0,   0,   1, 'Free starter plan',                       '${now.toISOString()}', '${now.toISOString()}'),
       ('professional', 99,  'none', 0,   99,  1, 'Professional plan - $99/month USD',        '${now.toISOString()}', '${now.toISOString()}'),
       ('enterprise',   199, 'none', 0,   199, 1, 'Enterprise plan - $199/month USD',         '${now.toISOString()}', '${now.toISOString()}')`
    )
  )
  .then(() => {
    console.log('✓ Seeded 3 pricing plans (starter, professional, enterprise)');
    process.exit(0);
  })
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
