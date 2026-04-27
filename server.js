require('dotenv').config();

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

const appConfig = require('./config/app');
const db = require('./models');
const webRoutes = require('./routes/web');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session and flash
app.use(session({
  secret: appConfig.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(flash());

// Flash messages middleware
app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash('success')[0],
    error: req.flash('error')[0],
    warning: req.flash('warning')[0],
  };
  next();
});

// Routes
app.use('/', webRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('home', {
    title: '404 - Not Found',
    samplePrompts: [],
    chartTypes: appConfig.chartTypes,
    recentDashboards: [],
    recentSources: [],
    recentPrompts: [],
    sources: [],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

// Prevent unhandled rejections from silently crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

// Start server
const PORT = appConfig.port;

async function start() {
  try {
    // Sync database (create tables if needed)
    await db.sequelize.sync();
    console.log('Database synchronized.');

    const server = app.listen(PORT, () => {
      console.log(`AI Auto-Dashboard Builder running at http://localhost:${PORT}`);
      console.log(`Environment: ${appConfig.nodeEnv}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[ERROR] Port ${PORT} is already in use.\nRun this to free it, then try again:\n  npx kill-port ${PORT}\nor:\n  Get-NetTCPConnection -LocalPort ${PORT} | Select OwningProcess | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
      } else {
        console.error('[Server Error]', err);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
