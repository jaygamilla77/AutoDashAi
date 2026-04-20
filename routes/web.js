const express = require('express');
const router = express.Router();
const upload = require('../config/multer');

const homeController = require('../controllers/homeController');
const sourceController = require('../controllers/sourceController');
const dashboardController = require('../controllers/dashboardController');
const builderController = require('../controllers/builderController');
const historyController = require('../controllers/historyController');
const templateController = require('../controllers/templateController');
const aiController = require('../controllers/aiController');

// Home
router.get('/', homeController.index);

// Data Sources
router.get('/sources', sourceController.list);
router.get('/sources/new', sourceController.showForm);
router.post('/sources', upload.single('file'), sourceController.create);
router.get('/sources/:id', sourceController.detail);
router.post('/sources/:id/test', sourceController.test);
router.post('/sources/:id/analyze', sourceController.analyze);
router.post('/sources/:id/delete', sourceController.destroy);

// Dashboard
router.post('/dashboard/generate-multi', dashboardController.generateMulti);
router.post('/dashboard/generate', dashboardController.generate);
router.post('/dashboard/save', dashboardController.save);
router.post('/dashboard/generate-panel', dashboardController.generatePanel);
router.get('/dashboard/schema', builderController.schema);          // Manual builder schema API
router.post('/dashboard/manual-panel', builderController.manualPanel); // Manual builder single panel
router.post('/dashboard/manual-multi', builderController.manualMulti);  // Manual builder render result
router.post('/dashboard/full', builderController.fullDashboard);         // Auto full corporate dashboard
router.post('/dashboard/:id/update', dashboardController.update);
router.post('/dashboard/:id/delete', dashboardController.destroy);
router.get('/dashboard/history', historyController.index);
router.get('/dashboard/:id/edit-canvas', dashboardController.editInCanvas);
router.get('/dashboard/:id', dashboardController.detail);

// Templates
router.get('/templates', templateController.list);
router.get('/templates/new', templateController.showForm);
router.post('/templates', templateController.create);
router.get('/templates/:id/edit', templateController.showForm);
router.post('/templates/:id', templateController.update);
router.post('/templates/:id/delete', templateController.destroy);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AI
router.get('/ai/status', aiController.status);
router.post('/ai/suggestions', aiController.suggestions);
router.post('/ai/executive-summary', aiController.executiveSummary);
router.get('/ai/settings', aiController.settingsPage);
router.post('/ai/test', aiController.testConnection);

module.exports = router;
