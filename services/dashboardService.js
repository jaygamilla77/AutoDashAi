/**
 * Dashboard Service
 *
 * Orchestrates the full dashboard generation flow:
 * 1. Parse prompt
 * 2. Identify source
 * 3. Query data
 * 4. Build KPIs
 * 5. Build chart config
 * 6. Assemble dashboard
 * 7. Save prompt history
 */

const db = require('../models');
const promptParserService = require('./promptParserService');
const queryService = require('./queryService');
const kpiService = require('./kpiService');
const chartService = require('./chartService');
const aiInsightService = require('./aiInsightService');
const aiService = require('./aiService');

/**
 * Smartly pick a chart type from the structuredRequest context when chartPreference is 'auto'.
 */
function resolveAutoChartType(sr) {
  const prompt = (sr.originalPrompt || sr.title || '').toLowerCase();
  const dims = sr.dimensions || [];
  const metrics = sr.metrics || [];
  const limit = sr.limit || 0;
  const focus = (sr.focusArea || '').toLowerCase();

  // KPI / single value indicators
  if (metrics.length === 1 && dims.length === 0) return 'gauge';
  if (/\btotal\b|\bcount\b|\bsum\b|\bkpi\b/.test(prompt) && dims.length <= 1 && limit <= 1) return 'gauge';

  // Time-series indicators
  const timeWords = ['month','year','week','day','date','quarter','daily','monthly','weekly','yearly','trend','over time','timeline'];
  if (timeWords.some(w => prompt.includes(w))) {
    return limit > 20 ? 'timeline' : 'line';
  }

  // Forecast
  if (/forecast|predict|projection|next month|next year/.test(prompt)) return 'forecast';

  // Funnel / pipeline
  if (/funnel|pipeline|stage|conversion/.test(prompt)) return 'funnel';

  // Distribution
  if (/distribut|histogram|spread|frequency/.test(prompt)) return 'histogram';
  if (/scatter|correlation/.test(prompt)) return 'scatter';

  // Part-to-whole — small number of items
  if (/share|portion|breakdown|composition|by category|by type|mix/.test(prompt) && limit <= 8) return 'pie';

  // Treemap for many categories
  if (/treemap|by department|by region|by product/.test(prompt) && limit > 5) return 'treemap';

  // Many items → horizontal bar
  if (limit > 10) return 'hbar';

  // Few items comparison
  if (limit > 0 && limit <= 5) return 'pie';

  // Heatmap
  if (/heat|intensity|matrix/.test(prompt)) return 'heatmap';

  return 'bar'; // sensible default
}

/**
 * Generate a complete dashboard from a prompt.
 * @param {{ prompt: string, chartType: string, dataSourceId: number|null, templateId: number|null }} options
 * @returns {object} dashboard result
 */
async function generate({ prompt, chartType, dataSourceId, templateId }) {
  // 1. Parse prompt — try AI first, fall back to regex
  let structuredRequest = null;
  let parsedByAI = false;

  if (aiService.isAvailable()) {
    try {
      // Build schema context for better AI understanding
      let schemaCtx = null;
      if (dataSourceId) {
        const schemas = await db.DataSourceSchema.findAll({ where: { dataSourceId }, raw: true });
        if (schemas.length > 0) {
          schemaCtx = schemas.map(s => {
            const cols = JSON.parse(s.schemaJson || '[]');
            return `Table "${s.datasetName}": ${cols.map(c => c.name + ' (' + c.type + ')').join(', ')}`;
          }).join('\n');
        }
      }
      structuredRequest = await promptParserService.parseWithAI(prompt, chartType, schemaCtx);
      if (structuredRequest) parsedByAI = true;
    } catch (err) {
      console.warn('[Dashboard] AI parse failed, using regex fallback:', err.message);
    }
  }

  if (!structuredRequest) {
    structuredRequest = promptParserService.parse(prompt, chartType);
  }
  if (!structuredRequest) {
    throw new Error('Could not interpret the prompt. Please try rephrasing.');
  }

  // 2. Identify data source
  let dataSource = null;
  if (dataSourceId) {
    dataSource = await db.DataSource.findByPk(dataSourceId);
  }

  // 2b. Load template if provided
  let template = null;
  if (templateId) {
    template = await db.DashboardTemplate.findByPk(templateId);
  }

  // If template has preferred chart types and current chartPreference is 'auto',
  // use the first preferred type from the template.
  if (template && template.preferredChartTypes && structuredRequest.chartPreference === 'auto') {
    try {
      const preferred = JSON.parse(template.preferredChartTypes);
      if (Array.isArray(preferred) && preferred.length > 0) {
        structuredRequest.chartPreference = preferred[0];
      }
    } catch { /* ignore parse errors */ }
  }

  // Smart auto chart-type resolution
  if (!structuredRequest.chartPreference || structuredRequest.chartPreference === 'auto') {
    structuredRequest.chartPreference = resolveAutoChartType(structuredRequest);
  }

  // 3. Query data
  const queryResult = await queryService.execute(structuredRequest, dataSource);

  // 4. Build KPIs
  const kpis = await kpiService.generateKPIs(structuredRequest.focusArea, queryResult, dataSource);

  // 5. Build chart config
  const chartResult = chartService.buildChartConfig(
    queryResult.labels,
    queryResult.values,
    structuredRequest.chartPreference,
    structuredRequest.title,
    template
  );
  const chartConfig = chartResult ? chartResult.config : null;
  const chartEngine = chartResult ? chartResult.engine : 'chartjs';

  // 6. Assemble dashboard
  const dashboard = {
    title: structuredRequest.title,
    subtitle: `Focus: ${structuredRequest.focusArea} | Chart: ${structuredRequest.chartPreference}`,
    originalPrompt: prompt,
    chartType: structuredRequest.chartPreference,
    chartEngine,
    dataSourceId: dataSourceId,
    dataSourceName: dataSource ? dataSource.name : 'Internal App Database',
    structuredRequest,
    kpis,
    chartConfig,
    template: template ? {
      id: template.id,
      name: template.name,
      fontFamily: template.fontFamily,
      accentColor: template.accentColor,
      colorPalette: template.colorPalette,
      preferredChartTypes: template.preferredChartTypes,
    } : null,
    tableData: {
      columns: queryResult.columns,
      rows: queryResult.rows,
    },
    summary: queryResult.summary,
    hasData: queryResult.rows && queryResult.rows.length > 0,
    parsedByAI,
    aiInsight: null,
  };

  // 6b. Generate AI narrative insight
  try {
    dashboard.aiInsight = await aiInsightService.generateInsight({
      title: dashboard.title,
      chartType: dashboard.chartType,
      labels: queryResult.labels,
      values: queryResult.values,
      kpis,
    });
  } catch (err) {
    console.warn('[Dashboard] AI insight generation failed:', err.message);
  }

  // 7. Save prompt history
  try {
    await db.PromptHistory.create({
      promptText: prompt,
      selectedChartType: chartType,
      interpretedIntent: structuredRequest.focusArea,
      generatedTitle: structuredRequest.title,
      structuredRequestJson: JSON.stringify(structuredRequest),
      dataSourceId: dataSourceId || null,
    });
  } catch (err) {
    console.error('Failed to save prompt history:', err);
  }

  return dashboard;
}

module.exports = { generate };
