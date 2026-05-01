require('dotenv').config();

const express = require('express');
const path = require('path');
const morgan = require('morgan');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');

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

// Expose mock-auth state to all views (so layouts can hide/show sidebar etc.)
app.use((req, res, next) => {
  var raw = req.headers && req.headers.cookie;
  var authed = false;
  if (raw) {
    raw.split(';').some(function (part) {
      var idx = part.indexOf('=');
      if (idx < 0) return false;
      var k = part.slice(0, idx).trim();
      if (k === 'autodash_auth') {
        var v = part.slice(idx + 1).trim();
        if (v && v !== '""') { authed = true; return true; }
      }
      return false;
    });
  }
  res.locals.isAuthenticated = authed;
  next();
});

// Debug middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[Router] API request: ${req.method} ${req.path}`);
  }
  next();
});

// Routes
app.use('/', webRoutes);

// 404 handler
app.use((req, res) => {
  // Return JSON for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.path,
    });
  }

  // For HTML requests, render the home page
  res.status(404).render('home', {
    title: '404 - Not Found',
    userDisplayName: 'User',
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
  console.error('[Error Handler] Error caught:', {
    message: err.message,
    code: err.code,
    field: err.field,
    path: req.path,
    method: req.method,
  });

  // Always return JSON for API paths
  const isApiPath = req.path.startsWith('/api/');

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    console.error('[Error Handler] File size limit exceeded');
    return res.status(413).json({
      success: false,
      error: `File size exceeds limit of ${appConfig.maxUploadMb}MB`,
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    console.error('[Error Handler] File count limit exceeded');
    return res.status(413).json({
      success: false,
      error: 'Too many files',
    });
  }

  if (err instanceof multer.MulterError) {
    console.error('[Error Handler] Multer error:', err.code);
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  // If the error is from file filter
  if (err.message && err.message.includes('File type')) {
    console.error('[Error Handler] File type rejection:', err.message);
    return res.status(415).json({
      success: false,
      error: err.message,
    });
  }

  // For API paths, always return JSON
  if (isApiPath || req.accepts('json')) {
    console.error('[Error Handler] Returning JSON error for', req.path);
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }

  // For HTML requests, send HTML error
  console.error('[Error Handler] Returning HTML error for', req.path);
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
