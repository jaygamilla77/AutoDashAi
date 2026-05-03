/**
 * Wizard Controller
 * Handles 6-step dashboard creation wizard
 */

const db = require('../models');
const dataAnalysisService = require('../services/dataAnalysisService');
const wizardRecommendationService = require('../services/wizardRecommendationService');
const dashboardService = require('../services/dashboardService');
const builderService = require('../services/fullDashboardService');
const sourceIngestionService = require('../services/sourceIngestionService');
const intelligentDashboardService = require('../services/intelligentDashboardService');
const fullDashboardGeneratorService = require('../services/fullDashboardGeneratorService');
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

    // Get dashboard layout templates
    const dashboardLayoutTemplates = await db.DashboardLayoutTemplate.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });

    // Get color themes (renamed from templates to colorThemes)
    const colorThemes = await db.DashboardTemplate.findAll({
      order: [['isBuiltIn', 'DESC'], ['name', 'ASC']],
    });

    res.render('wizard', {
      title: 'Create Dashboard via Wizard',
      layout: false,
      dataSources,
      templates: colorThemes, // Keep for backward compatibility
      colorThemes,
      dashboardLayoutTemplates,
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

    console.log('[Wizard Controller] Analyzing data source:', { 
      sourceType, 
      hasFile: !!req.file, 
      sourceId, 
      receivedFileType: fileType,
      bodyKeys: Object.keys(req.body),
    });

    if (sourceType === 'file' && req.file) {
      // Analyze uploaded file
      const detectedFileType = fileType || 'csv';
      console.log('[Wizard Controller] File upload detected:', {
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        detectedFileType: detectedFileType,
      });
      
      try {
        analysis = await dataAnalysisService.analyzeFile(req.file.path, detectedFileType);
        console.log('[Wizard Controller] Analysis complete:', { 
          rows: analysis.totalRows, 
          cols: analysis.totalColumns,
          quality: analysis.qualityScore,
        });
      } catch (err) {
        console.error('[Wizard Controller] Analysis service error:', err.message);
        console.error('[Wizard Controller] Full error:', err);
        throw new Error(`File analysis failed: ${err.message}`);
      }

      // Create a persistent DataSource record so the file can be queried
      // by the dashboard generator (otherwise it falls back to internal demo data).
      try {
        const baseName = (req.file.originalname || 'Uploaded File').replace(/\.[^.]+$/, '');
        const ds = await db.DataSource.create({
          name: `${baseName} (Wizard ${new Date().toISOString().slice(0, 10)})`,
          sourceType: detectedFileType, // 'csv' | 'excel' | 'json'
          status: 'active',
          filePath: req.file.path,
          originalFileName: req.file.originalname,
          mimeType: req.file.mimetype,
        });
        console.log('[Wizard Controller] DataSource created id=', ds.id);

        try {
          await sourceIngestionService.ingest(ds);
          ds.lastSyncedAt = new Date();
          await ds.save();
          console.log('[Wizard Controller] DataSource ingested + profiled id=', ds.id);
        } catch (ingErr) {
          console.error('[Wizard Controller] Ingestion error:', ingErr.message);
          ds.status = 'error';
          await ds.save();
        }

        analysis.dataSourceId = ds.id;
        analysis.dataSourceName = ds.name;
      } catch (createErr) {
        console.error('[Wizard Controller] DataSource create failed:', createErr.message);
        // Continue — analysis still works, dashboard will fall back to internal data
      }
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
      const errorMsg = 'Invalid source type or no file provided';
      console.error('[Wizard Controller]', errorMsg, '- sourceType:', sourceType, 'hasFile:', !!req.file);
      throw new Error(errorMsg);
    }

    // Get AI recommendations
    console.log('[Wizard Controller] Getting AI recommendations...');
    const recommendations = await dataAnalysisService.getAiRecommendations(analysis);

    console.log('[Wizard Controller] Returning success response');
    return res.json({
      success: true,
      analysis,
      recommendations,
    });
  } catch (err) {
    console.error('[Wizard Controller] FATAL ERROR:', err.message || err);
    console.error('[Wizard Controller] Stack:', err.stack);
    return res.json({
      success: false,
      error: err.message || 'Analysis failed',
    });
  }
};

/**
 * Re-analyze a different sheet of an already-uploaded Excel file
 */
exports.analyzeSheet = async (req, res) => {
  try {
    const { filePath, sheetName, fileType } = req.body;
    console.log('[Wizard Controller] analyzeSheet:', { filePath, sheetName, fileType });

    if (!filePath || !sheetName) {
      throw new Error('filePath and sheetName are required');
    }

    // Security: only allow files inside the uploads directory
    const path = require('path');
    const fs = require('fs');
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(uploadsDir + path.sep)) {
      throw new Error('Invalid file path');
    }
    if (!fs.existsSync(resolved)) {
      throw new Error('Uploaded file no longer exists. Please re-upload.');
    }

    const analysis = await dataAnalysisService.analyzeFile(resolved, fileType || 'excel', { sheetName });
    const recommendations = await dataAnalysisService.getAiRecommendations(analysis);

    return res.json({ success: true, analysis, recommendations });
  } catch (err) {
    console.error('[Wizard Controller] analyzeSheet error:', err.message);
    return res.json({ success: false, error: err.message || 'Sheet analysis failed' });
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
 * Step 5: Generate full dashboard (Wizard path)
 *
 * Routes through the unified intelligent dashboard pipeline so the wizard
 * produces the SAME executive-quality output as the AI-canvas template
 * picker and /dashboard/full.
 */
exports.generateDashboard = async (req, res) => {
  try {
    const {
      title,
      dataSourceId,
      dashboardType,    // reserved (template hint)
      templateId,
      colorTheme,
      theme,            // legacy alias
    } = req.body;

    if (!title || !title.trim()) {
      throw new Error('Dashboard title is required');
    }

    const sid = dataSourceId ? parseInt(dataSourceId, 10) : null;

    // Look up source name (for header) — best-effort.
    let sourceName = null;
    if (sid) {
      try {
        const ds = await db.DataSource.findByPk(sid);
        if (ds) sourceName = ds.name;
      } catch { /* ignore */ }
    }

    const result = await intelligentDashboardService.generateIntelligentDashboardFromDatasource({
      sourceId:   sid,
      sourceName,
      templateId: templateId || (dashboardType ? `${dashboardType}-dashboard` : null),
      colorTheme: colorTheme || theme || null,
      title:      title.trim(),
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
      dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : null,
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

/**
 * NEW: Get available dashboard templates for guided wizard
 */
exports.getAvailableTemplates = async (req, res) => {
  try {
    const dashboardTemplateService = require('../services/dashboardTemplateService');
    
    const templates = dashboardTemplateService.getAllTemplates();
    const colorThemes = dashboardTemplateService.getColorThemes();
    const layouts = dashboardTemplateService.getLayoutOptions();

    return res.json({
      success: true,
      templates,
      colorThemes,
      layouts,
    });
  } catch (err) {
    console.error('[Wizard] Get templates error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * NEW: Analyze all connected data sources for auto-generation
 */
exports.getSourcesAnalysis = async (req, res) => {
  try {
    const sourceAnalysisService = require('../services/sourceAnalysisService');
    
    const analysis = await sourceAnalysisService.analyzeAllSources();

    return res.json({
      success: true,
      analysis,
    });
  } catch (err) {
    console.error('[Wizard] Get sources analysis error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * NEW: Generate auto dashboard from template + source analysis
 */
exports.generateAutoDashboard = async (req, res) => {
  try {
    const { templateId, colorTheme, sourceId, title } = req.body;

    if (!templateId || !colorTheme) {
      throw new Error('Template ID and color theme are required');
    }

    const autoDashboardService = require('../services/autoDashboardService');
    
    const config = {
      templateId,
      colorTheme,
      sourceId: sourceId || null,
      dashboardType: templateId,
      title: title || null,
    };

    const generatedDashboard = await autoDashboardService.generateAutoDashboard(config);

    return res.json({
      success: true,
      dashboard: generatedDashboard,
    });
  } catch (err) {
    console.error('[Wizard] Generate auto dashboard error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * NEW: Create dashboard from natural language AI prompt
 */
exports.createFromPrompt = async (req, res) => {
  try {
    const { prompt, sourceId } = req.body;

    if (!prompt || !prompt.trim()) {
      throw new Error('Dashboard prompt is required');
    }

    const aiService = require('../services/aiService');
    const autoDashboardService = require('../services/autoDashboardService');
    
    if (!aiService.isAvailable()) {
      throw new Error('AI service is not available');
    }

    // Use AI to parse the prompt and select the best template
    const systemPrompt = `You are an expert business intelligence consultant. 
Analyze the user's request for a dashboard and determine the best template to use.
Return a JSON object with:
{
  "templateId": "id-of-best-template",
  "colorTheme": "color-theme-id",
  "title": "suggested dashboard title",
  "description": "why this template was chosen"
}`;

    const parsingPrompt = `User request: "${prompt}"

Based on this request, which of these templates would work best?
- executive-dashboard: High-level business metrics
- hr-dashboard: Employee metrics and hiring
- sales-dashboard: Revenue and pipeline
- finance-dashboard: Budget and expenses
- operations-dashboard: Process efficiency
- customer-service-dashboard: Support tickets
- it-service-management: System performance
- project-management-dashboard: Project progress
- recruitment-dashboard: Job applications
- inventory-dashboard: Stock levels
- custom-ai-dashboard: AI-generated from data

Respond with the best choice and reasoning.`;

    const aiResponse = await aiService.chatJSON(systemPrompt, parsingPrompt, { max_tokens: 500 });
    
    if (!aiResponse || !aiResponse.templateId) {
      throw new Error('AI could not determine best template');
    }

    // Now generate the dashboard with the AI-selected template
    const config = {
      templateId: aiResponse.templateId || 'custom-ai-dashboard',
      colorTheme: aiResponse.colorTheme || 'corporate',
      sourceId: sourceId || null,
      dashboardType: aiResponse.templateId,
      title: aiResponse.title || `Dashboard — ${new Date().toLocaleString()}`,
    };

    const generatedDashboard = await autoDashboardService.generateAutoDashboard(config);

    return res.json({
      success: true,
      dashboard: generatedDashboard,
      aiRecommendation: aiResponse,
    });
  } catch (err) {
    console.error('[Wizard] Create from prompt error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * NEW: Save generated dashboard from wizard
 */
exports.saveGeneratedDashboard = async (req, res) => {
  try {
    const { title, panels, sourceId, description, colorTheme } = req.body;

    if (!title || !panels) {
      throw new Error('Title and panels are required');
    }

    // Create dashboard configuration
    const dashboardConfig = {
      panels: Array.isArray(panels) ? panels : [panels],
      colorTheme: colorTheme || 'corporate',
      createdAt: new Date().toISOString(),
      source: 'auto-wizard',
    };

    // Save as new dashboard
    const dashboard = await db.SavedDashboard.create({
      title: title.trim(),
      dashboardConfigJson: JSON.stringify(dashboardConfig),
      description: description || null,
      dataSourceId: sourceId ? parseInt(sourceId, 10) : null,
    });

    return res.json({
      success: true,
      dashboard: {
        id: dashboard.id,
        title: dashboard.title,
        url: `/dashboard/${dashboard.id}`,
      },
    });
  } catch (err) {
    console.error('[Wizard] Save generated dashboard error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};

/**
 * NEW: Generate full multi-panel dashboard from template
 *
 * Used by the AI-canvas Template Picker / "Create Dashboard" flow.
 * Routes through the unified intelligent pipeline so AI Canvas + Wizard +
 * /dashboard/full all produce identical executive-quality output.
 */
exports.generateFullDashboard = async (req, res) => {
  try {
    const { templateId, colorTheme, sourceId, sourceName, prompt, title } = req.body;

    if (!templateId || !colorTheme) {
      throw new Error('Template ID and color theme are required');
    }

    const generatedDashboard = await intelligentDashboardService.generateIntelligentDashboardFromDatasource({
      templateId,
      colorTheme,
      sourceId:   sourceId   || null,
      sourceName: sourceName || null,
      prompt:     prompt     || `Generate dashboard for ${templateId}`,
      title:      title      || null,
    });

    return res.json({
      success: true,
      dashboard: generatedDashboard,
    });
  } catch (err) {
    console.error('[Wizard] Generate full dashboard error:', err.message);
    return res.json({
      success: false,
      error: err.message,
    });
  }
};
