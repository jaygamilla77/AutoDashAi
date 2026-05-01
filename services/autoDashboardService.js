'use strict';

/**
 * Auto Dashboard Generation Service
 * 
 * Automatically generates complete dashboards based on:
 * 1. Selected template
 * 2. Color theme
 * 3. Available data sources
 * 4. AI analysis of relationships and KPIs
 */

const db = require('../models');
const builderService = require('./builderService');
const fullDashboardService = require('./fullDashboardService');
const aiService = require('./aiService');
const templateService = require('./dashboardTemplateService');
const sourceAnalysisService = require('./sourceAnalysisService');
const { safeJsonParse } = require('../utils/helpers');

/**
 * Generate a full dashboard automatically
 * 
 * @param {object} config - Generation configuration
 * @param {string} config.templateId - Selected template ID
 * @param {string} config.colorTheme - Selected color theme ID
 * @param {number|null} config.sourceId - Data source ID (null for internal DB)
 * @param {string} config.dashboardType - Type of dashboard (from template)
 * @param {string} [config.title] - Dashboard title
 * @returns {object} Generated dashboard data ready for rendering
 */
async function generateAutoDashboard(config) {
  try {
    const { templateId, colorTheme, sourceId, dashboardType, title } = config;

    // Load template and theme
    const template = templateService.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const themes = templateService.getColorThemes();
    const theme = themes.find(t => t.id === colorTheme);
    if (!theme) {
      throw new Error(`Color theme not found: ${colorTheme}`);
    }

    // Get data source schema
    const schema = await builderService.getSchema(sourceId ? parseInt(sourceId, 10) : null);
    
    // Analyze source for recommendations
    let sourceAnalysis = null;
    try {
      if (sourceId) {
        const source = await db.DataSource.findByPk(sourceId);
        sourceAnalysis = await sourceAnalysisService.analyzeDataSource(source);
      } else {
        sourceAnalysis = await sourceAnalysisService.analyzeInternalDatabase();
      }
    } catch (err) {
      console.warn('[AutoDashboard] Source analysis failed:', err.message);
      sourceAnalysis = { tables: [], recommendations: [] };
    }

    // Generate dashboard panels using AI if available
    let panels = [];
    if (templateId === 'custom-ai-dashboard') {
      panels = await generateAiOptimizedPanels(schema, sourceAnalysis, sourceId);
    } else {
      panels = await generateTemplatePanels(template, schema, sourceAnalysis, sourceId);
    }

    // Build dashboard configuration
    const dashboardTitle = title || `${template.name} — Generated`;
    const executiveSummary = generateExecutiveSummary(template, sourceAnalysis);

    return {
      success: true,
      title: dashboardTitle,
      description: template.description,
      template: template.name,
      templateId,
      colorTheme: theme.id,
      themeName: theme.name,
      colors: theme.colors,
      panels: panels.filter(Boolean),
      panelCount: panels.filter(Boolean).length,
      sourceId,
      sourceName: sourceId ? (await getSourceName(sourceId)) : 'Internal Database',
      executiveSummary,
      dataQuality: sourceAnalysis.dataQuality || 'medium',
      estimatedRows: sourceAnalysis.estimatedRows,
      insights: sourceAnalysis.insights || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[AutoDashboard] Generation error:', err.message);
    throw err;
  }
}

/**
 * Generate panels based on template selection
 */
async function generateTemplatePanels(template, schema, sourceAnalysis, sourceId) {
  const panels = [];
  const templateId = template.id;

  try {
    switch (templateId) {
      case 'executive-dashboard':
        panels.push(...await buildExecutivePanels(schema, sourceId));
        break;
      case 'hr-dashboard':
        panels.push(...await buildHRPanels(schema, sourceId));
        break;
      case 'sales-dashboard':
        panels.push(...await buildSalesPanels(schema, sourceId));
        break;
      case 'finance-dashboard':
        panels.push(...await buildFinancePanels(schema, sourceId));
        break;
      case 'operations-dashboard':
        panels.push(...await buildOperationsPanels(schema, sourceId));
        break;
      case 'customer-service-dashboard':
        panels.push(...await buildCustomerServicePanels(schema, sourceId));
        break;
      case 'it-service-management':
        panels.push(...await buildITPanels(schema, sourceId));
        break;
      case 'project-management-dashboard':
        panels.push(...await buildProjectPanels(schema, sourceId));
        break;
      case 'recruitment-dashboard':
        panels.push(...await buildRecruitmentPanels(schema, sourceId));
        break;
      case 'inventory-dashboard':
        panels.push(...await buildInventoryPanels(schema, sourceId));
        break;
      default:
        // Fallback: use AI or recommendations
        panels.push(...await generateRecommendationPanels(sourceAnalysis, sourceId));
    }

    return panels;
  } catch (err) {
    console.warn('[AutoDashboard] Template panel generation failed:', err.message);
    // Return recommendation-based panels as fallback
    return await generateRecommendationPanels(sourceAnalysis, sourceId);
  }
}

/**
 * Build executive dashboard panels
 */
async function buildExecutivePanels(schema, sourceId) {
  const panels = [];
  const tables = Object.keys(schema);

  if (tables.length === 0) return panels;

  // KPI cards (top metrics)
  try {
    const table = tables[0];
    const measures = Object.values(schema[table]).filter(c => c.role === 'measure');
    
    for (const measure of measures.slice(0, 4)) {
      panels.push(await safePanel({
        sourceId,
        tableKey: table,
        dimension: 'id',
        measure: measure.name,
        aggregation: 'SUM',
        chartType: 'cards',
        limit: 1,
        title: `Total ${measure.name}`
      }));
    }
  } catch (err) {
    console.warn('[AutoDashboard] KPI panel failed:', err.message);
  }

  // Key trend charts
  try {
    const table = tables[0];
    const dimensions = Object.values(schema[table]).filter(c => c.role === 'dimension');
    const measures = Object.values(schema[table]).filter(c => c.role === 'measure');
    
    if (dimensions.length > 0 && measures.length > 0) {
      panels.push(await safePanel({
        sourceId,
        tableKey: table,
        dimension: dimensions[0].name,
        measure: measures[0].name,
        aggregation: 'SUM',
        chartType: 'bar',
        limit: 10,
        title: `${measures[0].name} by ${dimensions[0].name}`
      }));
    }
  } catch (err) {
    console.warn('[AutoDashboard] Trend panel failed:', err.message);
  }

  return panels;
}

/**
 * Build HR dashboard panels
 */
async function buildHRPanels(schema, sourceId) {
  const panels = [];

  // Look for employee-related tables
  const employeeTables = Object.keys(schema).filter(t => 
    t.toLowerCase().includes('employee') || t.toLowerCase().includes('staff')
  );

  const departmentTables = Object.keys(schema).filter(t => 
    t.toLowerCase().includes('department') || t.toLowerCase().includes('team')
  );

  // Headcount KPI
  if (employeeTables.length > 0) {
    panels.push(await safePanel({
      sourceId,
      tableKey: employeeTables[0],
      dimension: 'id',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'cards',
      limit: 1,
      title: 'Total Headcount'
    }));
  }

  // Employees by department
  if (employeeTables.length > 0 && departmentTables.length > 0) {
    panels.push(await safePanel({
      sourceId,
      tableKey: employeeTables[0],
      joinTableKey: departmentTables[0],
      dimension: `${departmentTables[0]}.name`,
      measure: `${employeeTables[0]}.id`,
      aggregation: 'COUNT',
      chartType: 'bar',
      limit: 10,
      title: 'Employees by Department'
    }));
  }

  // Salary analysis
  if (employeeTables.length > 0) {
    panels.push(await safePanel({
      sourceId,
      tableKey: employeeTables[0],
      dimension: 'id',
      measure: 'salary',
      aggregation: 'AVG',
      chartType: 'cards',
      limit: 1,
      title: 'Average Salary'
    }));
  }

  return panels;
}

/**
 * Build Sales dashboard panels
 */
async function buildSalesPanels(schema, sourceId) {
  const panels = [];

  // Revenue KPI
  const salesTables = Object.keys(schema).filter(t => 
    t.toLowerCase().includes('sales') || t.toLowerCase().includes('order') || t.toLowerCase().includes('transaction')
  );

  if (salesTables.length > 0) {
    panels.push(await safePanel({
      sourceId,
      tableKey: salesTables[0],
      dimension: 'id',
      measure: 'amount',
      aggregation: 'SUM',
      chartType: 'cards',
      limit: 1,
      title: 'Total Revenue'
    }));

    // Sales by period or region
    const dimensions = Object.values(schema[salesTables[0]]).filter(c => c.role === 'dimension');
    if (dimensions.length > 0) {
      panels.push(await safePanel({
        sourceId,
        tableKey: salesTables[0],
        dimension: dimensions[0].name,
        measure: 'amount',
        aggregation: 'SUM',
        chartType: 'bar',
        limit: 10,
        title: `Revenue by ${dimensions[0].name}`
      }));
    }
  }

  return panels;
}

/**
 * Build Finance dashboard panels
 */
async function buildFinancePanels(schema, sourceId) {
  const panels = [];

  const financeTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('budget') || t.toLowerCase().includes('expense') || t.toLowerCase().includes('finance')
  );

  if (financeTables.length > 0) {
    const table = financeTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'id',
      measure: 'amount',
      aggregation: 'SUM',
      chartType: 'cards',
      limit: 1,
      title: 'Total Budget'
    }));
  }

  return panels;
}

/**
 * Build Operations dashboard panels
 */
async function buildOperationsPanels(schema, sourceId) {
  const panels = [];

  const operationsTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('ticket') || t.toLowerCase().includes('incident') || t.toLowerCase().includes('process')
  );

  if (operationsTables.length > 0) {
    const table = operationsTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'status',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'bar',
      limit: 5,
      title: 'Tickets by Status'
    }));
  }

  return panels;
}

/**
 * Build Customer Service dashboard panels
 */
async function buildCustomerServicePanels(schema, sourceId) {
  const panels = [];

  const ticketTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('ticket') || t.toLowerCase().includes('support') || t.toLowerCase().includes('issue')
  );

  if (ticketTables.length > 0) {
    const table = ticketTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'status',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'pie',
      limit: 10,
      title: 'Tickets by Status'
    }));
  }

  return panels;
}

/**
 * Build IT Service Management dashboard panels
 */
async function buildITPanels(schema, sourceId) {
  const panels = [];

  const itTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('incident') || t.toLowerCase().includes('server') || t.toLowerCase().includes('service')
  );

  if (itTables.length > 0) {
    const table = itTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'id',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'cards',
      limit: 1,
      title: 'Total Incidents'
    }));
  }

  return panels;
}

/**
 * Build Project Management dashboard panels
 */
async function buildProjectPanels(schema, sourceId) {
  const panels = [];

  const projectTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('project') || t.toLowerCase().includes('task')
  );

  if (projectTables.length > 0) {
    const table = projectTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'status',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'bar',
      limit: 5,
      title: 'Projects by Status'
    }));
  }

  return panels;
}

/**
 * Build Recruitment dashboard panels
 */
async function buildRecruitmentPanels(schema, sourceId) {
  const panels = [];

  const recruitmentTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('job') || t.toLowerCase().includes('applicant') || t.toLowerCase().includes('candidate')
  );

  if (recruitmentTables.length > 0) {
    const table = recruitmentTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'status',
      measure: 'id',
      aggregation: 'COUNT',
      chartType: 'bar',
      limit: 10,
      title: 'Applications by Status'
    }));
  }

  return panels;
}

/**
 * Build Inventory dashboard panels
 */
async function buildInventoryPanels(schema, sourceId) {
  const panels = [];

  const inventoryTables = Object.keys(schema).filter(t =>
    t.toLowerCase().includes('inventory') || t.toLowerCase().includes('product') || t.toLowerCase().includes('stock')
  );

  if (inventoryTables.length > 0) {
    const table = inventoryTables[0];
    panels.push(await safePanel({
      sourceId,
      tableKey: table,
      dimension: 'category',
      measure: 'quantity',
      aggregation: 'SUM',
      chartType: 'bar',
      limit: 10,
      title: 'Inventory by Category'
    }));
  }

  return panels;
}

/**
 * Generate AI-optimized dashboard using full dashboard service
 */
async function generateAiOptimizedPanels(schema, sourceAnalysis, sourceId) {
  try {
    if (sourceId) {
      // Use full dashboard service for external sources
      const panels = await fullDashboardService.planExternalDashboard(sourceId);
      return panels;
    } else {
      // Use internal database plan
      const panels = await fullDashboardService.planInternalDashboard();
      return panels;
    }
  } catch (err) {
    console.warn('[AutoDashboard] AI-optimized generation failed:', err.message);
    return await generateRecommendationPanels(sourceAnalysis, sourceId);
  }
}

/**
 * Generate panels from source analysis recommendations
 */
async function generateRecommendationPanels(sourceAnalysis, sourceId) {
  const panels = [];

  if (!sourceAnalysis.recommendations || sourceAnalysis.recommendations.length === 0) {
    return panels;
  }

  for (const rec of sourceAnalysis.recommendations.slice(0, 6)) {
    try {
      const panel = await safePanel({
        sourceId,
        tableKey: rec.tables[0],
        dimension: rec.title,
        measure: rec.businessValue,
        aggregation: 'SUM',
        chartType: rec.type,
        limit: 10,
        title: rec.title
      });
      panels.push(panel);
    } catch (err) {
      console.warn('[AutoDashboard] Recommendation panel failed:', err.message);
    }
  }

  return panels;
}

/**
 * Safely build a panel, returns null on error
 */
async function safePanel(params) {
  try {
    return await builderService.buildPanel(params);
  } catch (err) {
    console.warn('[AutoDashboard] Panel build failed:', err.message);
    return null;
  }
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(template, sourceAnalysis) {
  const lines = [];

  lines.push(`Dashboard Template: ${template.name}`);
  lines.push(`Purpose: ${template.description}`);

  if (sourceAnalysis.tables && sourceAnalysis.tables.length > 0) {
    lines.push(`Data sources analyzed: ${sourceAnalysis.tables.length} tables`);
  }

  if (sourceAnalysis.totalColumns) {
    lines.push(`Total data columns: ${sourceAnalysis.totalColumns}`);
  }

  if (sourceAnalysis.insights && sourceAnalysis.insights.length > 0) {
    lines.push(`Data insights: ${sourceAnalysis.insights.join('; ')}`);
  }

  return lines.join('\n');
}

/**
 * Get source name
 */
async function getSourceName(sourceId) {
  try {
    const source = await db.DataSource.findByPk(sourceId);
    return source ? source.name : 'Unknown Source';
  } catch (err) {
    return 'Unknown Source';
  }
}

module.exports = {
  generateAutoDashboard,
  generateTemplatePanels,
  buildExecutivePanels,
  buildHRPanels,
  buildSalesPanels,
  buildFinancePanels,
  buildOperationsPanels,
  buildCustomerServicePanels,
  buildITPanels,
  buildProjectPanels,
  buildRecruitmentPanels,
  buildInventoryPanels,
  generateAiOptimizedPanels,
};
