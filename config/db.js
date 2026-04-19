const path = require('path');
require('dotenv').config();

const dbClient = process.env.DB_CLIENT || 'sqlite';

const config = {
  development: {
    dialect: dbClient,
    logging: false,
    ...(dbClient === 'sqlite'
      ? {
          storage: path.resolve(process.env.SQLITE_STORAGE || './data/app.db'),
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT, 10) || 3306,
          database: process.env.DB_NAME || 'ai_auto_dashboard_builder',
          username: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
        }),
    define: {
      timestamps: true,
      underscored: false,
    },
  },
  production: {
    dialect: process.env.DB_CLIENT || 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'ai_auto_dashboard_builder',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    logging: false,
    define: {
      timestamps: true,
      underscored: false,
    },
  },
};

module.exports = config;
