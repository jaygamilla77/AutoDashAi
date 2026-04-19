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

/**
 * Generate a complete dashboard from a prompt.
 * @param {{ prompt: string, chartType: string, dataSourceId: number|null, templateId: number|null }} options
 * @returns {object} dashboard result
 */
async function generate({ prompt, chartType, dataSourceId, templateId }) {
  // 1. Parse prompt
  const structuredRequest = promptParserService.parse(prompt, chartType);
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

  // 3. Query data
  const queryResult = await queryService.execute(structuredRequest, dataSource);

  // 4. Build KPIs
  const kpis = await kpiService.generateKPIs(structuredRequest.focusArea, queryResult, dataSource);

  // 5. Build chart config
  const chartConfig = chartService.buildChartConfig(
    queryResult.labels,
    queryResult.values,
    structuredRequest.chartPreference,
    structuredRequest.title,
    template
  );

  // 6. Assemble dashboard
  const dashboard = {
    title: structuredRequest.title,
    subtitle: `Focus: ${structuredRequest.focusArea} | Chart: ${structuredRequest.chartPreference}`,
    originalPrompt: prompt,
    chartType: structuredRequest.chartPreference,
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
  };

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
