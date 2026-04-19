const express = require('express');
const router = express.Router();
const upload = require('../config/multer');

const homeController = require('../controllers/homeController');
const sourceController = require('../controllers/sourceController');
const dashboardController = require('../controllers/dashboardController');
const historyController = require('../controllers/historyController');

// Home
router.get('/', homeController.index);

// Data Sources
router.get('/sources', sourceController.list);
router.get('/sources/new', sourceController.showForm);
router.post('/sources', upload.single('file'), sourceController.create);
router.get('/sources/:id', sourceController.detail);
router.post('/sources/:id/test', sourceController.test);

// Dashboard
router.post('/dashboard/generate', dashboardController.generate);
router.post('/dashboard/save', dashboardController.save);
router.get('/dashboard/history', historyController.index);
router.get('/dashboard/:id', dashboardController.detail);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
