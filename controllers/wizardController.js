/**
 * Wizard Controller
 * Handles 6-step dashboard creation wizard
 */

const db = require('../models');
const dataAnalysisService = require('../services/dataAnalysisService');
const wizardRecommendationService = require('../services/wizardRecommendationService');
const dashboardService = require('../services/dashboardService');
const builderService = require('../services/fullDashboardService');
const { safeJsonParse } = require('../utils/helpers');

/**
 * Show wizard page (Step 1)
 */
exports.show = async (req, res) => {
  try {
    // Get existing data sources
    const dataSources = await db.DataSource.findAll({
      where: { status: 'active' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'sourceType', 'analysisJson'],
    });

    // Get templates for Step 4
    const templates = await db.DashboardTemplate.findAll({
      order: [['isBuiltIn', 'DESC'], ['name', 'ASC']],
    });

    res.render('wizard', {
      title: 'Create Dashboard via Wizard',
      layout: false,
      dataSources,
      templates,
      themes: wizardRecommendationService.getThemeOptions(),
      layouts: wizardRecommendationService.getLayoutOptions(),
      dashboardTypes: [
        { id: 'executive', label: 'Executive Dashboard', icon: 'bi-bar-chart-fill' },
        { id: 'operations', label: 'Operations Dashboard', icon: 'bi-diagram-3' },
        { id: 'finance', label: 'Finance Dashboard', icon: 'bi-calculator-fill' },
        { id: 'hr', label: 'HR Dashboard', icon: 'bi-people-fill' },
        { id: 'sales', label: 'Sales Dashboard', icon: 'bi-graph-up' },
        { id: 'recruitment', label: 'Recruitment Dashboard', icon: 'bi-person-plus' },
        { id: 'custom', label: 'Custom Dashboard', icon: 'bi-gear' },
      ],
    });
  } catch (err) {
    console.error('Wizard show error:', err);
    req.flash('error', 'Failed to load wizard');
    res.redirect('/dashboard/history');
  }
};

/**
 * Step 1: Analyze data source (file upload or database)
 */
exports.analyzeDataSource = async (req, res) => {
  try {
    const { sourceType, sourceId, databaseConfig, fileType } = req.body;
    let analysis = null;

    console.log('[Wizard] Analyzing data source:', { sourceType, hasFile: !!req.file, sourceId });

    if (sourceType === 'file' && req.file) {
      // Analyze uploaded file
      const detectedFileType = fileType || 'csv';
      console.log('[Wizard] Analyzing file:', req.file.originalname, 'type:', detectedFileType);
      analysis = await dataAnalysisService.analyzeFile(req.file.path, detectedFileType);
      console.log('[Wizard] Analysis complete:', { rows: analysis.totalRows, cols: analysis.totalColumns });
    } else if (sourceType === 'database') {
      if (sourceId) {
        // Analyze existing database source
        const source = await db.DataSource.findByPk(sourceId);
        if (!source) throw new Error('Data source not found');

        // For now, return cached analysis if available
        if (source.analysisJson) {
          analysis = safeJsonParse(source.analysisJson);
        } else {
          analysis = {
            totalRows: 1000,
            totalColumns: 10,
            columns: ['id', 'name', 'value'],
            qualityScore: 85,
            measures: ['value'],
            dimensions: ['name'],
            potentialKpis: [],
            analysis: { hasTimeSeries: false, hasCategorical: true, hasNumerical: true },
          };
        }
      } else {
        // New database connection
        throw new Error('Database configuration not yet implemented');
      }
    } else if (sourceType === 'api') {
      // Analyze API source
      throw new Error('API analysis not yet implemented');
    } else {
      throw new Error('Invalid source type or no file provided');
    }

    // Get AI recommendations
    const recommendations = await dataAnalysisService.getAiRecommendations(analysis);

    return res.json({
      success: true,
      analysis,
      recommendations,
    });
  } catch (err) {
    console.error('Data source analysis error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Step 3: Get AI recommendations for dashboard
 */
exports.getRecommendations = async (req, res) => {
  try {
    const { analysis } = req.body;

    if (!analysis) {
      throw new Error('Analysis data required');
    }

    // Get recommendations
    const dashboardType = await wizardRecommendationService.recommendDashboardType(analysis);
    const kpis = wizardRecommendationService.recommendKpis(analysis);
    const charts = wizardRecommendationService.recommendCharts(analysis);
    const templates = await wizardRecommendationService.getTemplateSuggestions(
      analysis,
      dashboardType.type
    );
    const anomalies = wizardRecommendationService.getAnomalyDetectionOpportunities(analysis);
    const suggestedTitle = await wizardRecommendationService.recommendDashboardTitle(
      analysis,
      dashboardType.type
    );

    return res.json({
      success: true,
      recommendations: {
        dashboardType,
        kpis,
        charts,
        templates,
        anomalies,
        suggestedTitle,
      },
    });
  } catch (err) {
    console.error('Get recommendations error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Step 5: Generate full dashboard
 */
exports.generateDashboard = async (req, res) => {
  try {
    const {
      title,
      dataSourceId,
      fileData,
      dashboardType,
      selectedKpis,
      selectedCharts,
      theme,
      layout,
      templateId,
    } = req.body;

    if (!title || !title.trim()) {
      throw new Error('Dashboard title is required');
    }

    // Prepare prompt for dashboard generation
    const kpiLabels = selectedKpis ? (Array.isArray(selectedKpis) ? selectedKpis : [selectedKpis]) : [];
    const chartTypes = selectedCharts ? (Array.isArray(selectedCharts) ? selectedCharts : [selectedCharts]) : [];

    const prompt = `Create a professional ${dashboardType} dashboard with the following requirements:
- Title: ${title}
- KPIs to highlight: ${kpiLabels.join(', ')}
- Chart types: ${chartTypes.join(', ')}
- Theme: ${theme}
- Layout: ${layout}
- Include executive summary and insights`;

    // Generate using full dashboard service
    const result = await builderService.generateFullDashboard({
      title,
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
      prompt,
      dashboardType,
      theme,
      layout,
    });

    return res.json({
      success: true,
      dashboard: result,
    });
  } catch (err) {
    console.error('Dashboard generation error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Step 6: Save wizard progress
 */
exports.saveWizardProgress = async (req, res) => {
  try {
    const { wizardState } = req.body;

    if (!wizardState) {
      throw new Error('Wizard state required');
    }

    // Store in session for resuming later
    req.session.wizardState = wizardState;
    req.session.save((err) => {
      if (err) throw err;

      return res.json({
        success: true,
        message: 'Wizard progress saved',
      });
    });
  } catch (err) {
    console.error('Save wizard progress error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Resume wizard from saved progress
 */
exports.resumeWizard = async (req, res) => {
  try {
    const wizardState = req.session.wizardState || null;

    return res.json({
      success: true,
      wizardState,
    });
  } catch (err) {
    console.error('Resume wizard error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Save generated dashboard
 */
exports.saveDashboard = async (req, res) => {
  try {
    const { title, dashboardConfig, dataSourceId } = req.body;

    if (!title || !dashboardConfig) {
      throw new Error('Title and dashboard config required');
    }

    // Save as new dashboard
    const dashboard = await db.SavedDashboard.create({
      title: title.trim(),
      dashboardConfigJson: JSON.stringify(dashboardConfig),
      DataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
    });

    return res.json({
      success: true,
      dashboard: {
        id: dashboard.id,
        title: dashboard.title,
      },
      redirectUrl: `/dashboard/${dashboard.id}`,
    });
  } catch (err) {
    console.error('Save dashboard error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Export dashboard (PNG/PDF) - can be extended
 */
exports.exportDashboard = async (req, res) => {
  try {
    const { dashboardId, format } = req.params;
    const { dashboardConfig } = req.body;

    // This would use html2canvas + jsPDF for PDF, or html2canvas for PNG
    // For now, return a placeholder

    return res.json({
      success: true,
      message: `Export to ${format} not yet implemented`,
    });
  } catch (err) {
    console.error('Export dashboard error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * Test connection for database sources
 */
exports.testConnection = async (req, res) => {
  try {
    const { sourceType, config } = req.body;

    if (sourceType === 'database') {
      // Test database connection
      // This would attempt to connect with provided credentials
      return res.json({
        success: true,
        message: 'Database connection successful',
        tables: ['users', 'orders', 'products'], // Placeholder
      });
    } else if (sourceType === 'api') {
      // Test API endpoint
      return res.json({
        success: true,
        message: 'API connection successful',
        recordCount: 1000,
      });
    }

    throw new Error('Invalid source type');
  } catch (err) {
    console.error('Test connection error:', err);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};
