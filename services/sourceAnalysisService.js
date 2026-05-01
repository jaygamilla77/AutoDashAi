'use strict';

/**
 * Comprehensive Source Analysis Service
 * 
 * Analyzes all connected data sources to detect:
 * - Schema and relationships
 * - Recommended KPIs and dimensions
 * - Best chart opportunities
 * - Business insights
 */

const db = require('../models');
const builderService = require('./builderService');
const aiService = require('./aiService');
const { safeJsonParse } = require('../utils/helpers');

/**
 * Scan all active data sources and return analysis
 * Analyzes both internal database and external uploaded sources
 */
async function analyzeAllSources() {
  try {
    const sources = await db.DataSource.findAll({
      where: { status: 'active' },
      order: [['createdAt', 'DESC']],
    });

    const analyses = [];

    // Analyze internal database
    const internalAnalysis = await analyzeInternalDatabase();
    analyses.push(internalAnalysis);

    // Analyze each external data source
    for (const source of sources) {
      try {
        const sourceAnalysis = await analyzeDataSource(source);
        analyses.push(sourceAnalysis);
      } catch (err) {
        console.warn('[Source Analyzer] Error analyzing source', source.id, err.message);
      }
    }

    return {
      success: true,
      totalSources: analyses.length,
      sources: analyses,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Source Analyzer] Error analyzing all sources:', err.message);
    throw err;
  }
}

/**
 * Analyze internal database
 */
async function analyzeInternalDatabase() {
  try {
    const schema = await builderService.getSchema(null);
    
    const tables = Object.keys(schema).map(tableKey => {
      const table = schema[tableKey];
      return {
        name: tableKey,
        displayName: formatTableName(tableKey),
        columnCount: Object.keys(table).length,
        columns: table,
      };
    });

    // Generate recommendations using AI if available
    let recommendations = [];
    if (aiService.isAvailable()) {
      recommendations = await generateInternalRecommendations(schema, tables);
    } else {
      recommendations = generateBasicRecommendations(schema);
    }

    return {
      sourceId: null,
      name: 'Internal Database',
      type: 'internal',
      status: 'active',
      tables,
      tableCount: tables.length,
      totalColumns: tables.reduce((sum, t) => sum + t.columnCount, 0),
      estimatedRows: null,
      dataQuality: 'high',
      recommendations,
      insights: generateDataInsights(schema),
      detectedRelationships: detectTableRelationships(schema),
      suggestedKpis: suggestKpis(schema, 'internal'),
      analyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Source Analyzer] Error analyzing internal database:', err.message);
    throw err;
  }
}

/**
 * Analyze individual external data source
 */
async function analyzeDataSource(source) {
  try {
    const sourceId = source.id;
    const schema = await builderService.getSchema(sourceId);
    
    const analysis = safeJsonParse(source.analysisJson) || {};
    
    const tables = Object.keys(schema).map(tableKey => {
      const table = schema[tableKey];
      return {
        name: tableKey,
        displayName: formatTableName(tableKey),
        columnCount: Object.keys(table).length,
        columns: table,
      };
    });

    // Generate recommendations
    let recommendations = [];
    if (aiService.isAvailable()) {
      recommendations = await generateSourceRecommendations(source, schema, tables);
    } else {
      recommendations = generateBasicRecommendations(schema);
    }

    return {
      sourceId,
      name: source.name,
      type: source.sourceType,
      status: source.status,
      tables,
      tableCount: tables.length,
      totalColumns: tables.reduce((sum, t) => sum + t.columnCount, 0),
      estimatedRows: analysis.totalRows || null,
      dataQuality: analysis.qualityScore || 'medium',
      recommendations,
      insights: generateDataInsights(schema),
      detectedRelationships: detectTableRelationships(schema),
      suggestedKpis: suggestKpis(schema, source.sourceType),
      analyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Source Analyzer] Error analyzing source:', err.message);
    throw err;
  }
}

/**
 * Generate AI-powered recommendations for internal database
 */
async function generateInternalRecommendations(schema, tables) {
  try {
    const tableNames = tables.map(t => t.displayName).join(', ');
    
    const prompt = `Given these tables in an HR/Operations database: ${tableNames}

Generate 5-7 specific, actionable dashboard recommendations that a business user would find valuable.
Focus on:
1. Cross-table insights (joining multiple tables)
2. Time-series trends
3. Comparisons and rankings
4. Distribution analysis
5. Key business metrics

Format as JSON array of objects with:
{
  "title": "Chart/Dashboard name",
  "description": "What it shows and why it's valuable",
  "type": "bar|line|pie|cards|table",
  "tables": ["table1", "table2"],
  "businessValue": "Why this matters to the business"
}`;

    const result = await aiService.chatJson(
      'You are a business intelligence expert.',
      prompt,
      { max_tokens: 2048 }
    );

    return result || [];
  } catch (err) {
    console.warn('[Source Analyzer] AI recommendation failed:', err.message);
    return generateBasicRecommendations(schema);
  }
}

/**
 * Generate AI-powered recommendations for external source
 */
async function generateSourceRecommendations(source, schema, tables) {
  try {
    const tableNames = tables.map(t => t.displayName).join(', ');
    const sourceName = source.name;
    
    const prompt = `Given a data source "${sourceName}" with these tables: ${tableNames}

Generate 5-7 specific, actionable dashboard recommendations.
Focus on:
1. Key business metrics and KPIs
2. Trends and patterns
3. Comparisons and rankings
4. Anomalies or alerts
5. Drill-down opportunities

Format as JSON array of objects with:
{
  "title": "Chart/Dashboard name",
  "description": "What it shows",
  "type": "bar|line|pie|cards|table|scatter",
  "tables": ["table1"],
  "businessValue": "Why this matters"
}`;

    const result = await aiService.chatJson(
      'You are a business intelligence and data analysis expert.',
      prompt,
      { max_tokens: 2048 }
    );

    return result || [];
  } catch (err) {
    console.warn('[Source Analyzer] AI recommendation failed:', err.message);
    return generateBasicRecommendations(schema);
  }
}

/**
 * Generate basic recommendations without AI
 */
function generateBasicRecommendations(schema) {
  const recommendations = [];
  
  for (const [tableKey, columns] of Object.entries(schema)) {
    const columnList = Object.values(columns);
    const numericCols = columnList.filter(c => c.role === 'measure');
    const dimensionCols = columnList.filter(c => c.role === 'dimension');
    
    if (numericCols.length > 0 && dimensionCols.length > 0) {
      recommendations.push({
        title: `${formatTableName(tableKey)} by ${dimensionCols[0].name}`,
        description: `Show ${numericCols[0].name} distribution across ${dimensionCols[0].name}`,
        type: 'bar',
        tables: [tableKey],
        businessValue: 'Understand key distribution patterns'
      });

      if (numericCols.length > 1) {
        recommendations.push({
          title: `${numericCols[0].name} vs ${numericCols[1].name}`,
          description: `Compare relationship between two key metrics`,
          type: 'scatter',
          tables: [tableKey],
          businessValue: 'Identify correlations and patterns'
        });
      }
    }

    // Add summary card recommendation
    if (numericCols.length > 0) {
      recommendations.push({
        title: `Total ${formatTableName(tableKey)}`,
        description: `Summary metric for ${tableKey}`,
        type: 'cards',
        tables: [tableKey],
        businessValue: 'Quick overview of key metric'
      });
    }
  }

  return recommendations.slice(0, 7);
}

/**
 * Detect table relationships and foreign keys
 */
function detectTableRelationships(schema) {
  const relationships = [];
  const tableKeys = Object.keys(schema);

  for (let i = 0; i < tableKeys.length; i++) {
    for (let j = i + 1; j < tableKeys.length; j++) {
      const table1 = tableKeys[i];
      const table2 = tableKeys[j];
      
      // Simple heuristic: if columns have similar names or IDs match, they're likely related
      const cols1 = Object.keys(schema[table1]);
      const cols2 = Object.keys(schema[table2]);
      
      for (const col1 of cols1) {
        for (const col2 of cols2) {
          if (col1.toLowerCase().includes(col2.toLowerCase()) ||
              col2.toLowerCase().includes(col1.toLowerCase())) {
            relationships.push({
              table1,
              table2,
              likely: true,
              commonField: col1
            });
            break;
          }
        }
      }
    }
  }

  return relationships;
}

/**
 * Suggest KPIs based on schema
 */
function suggestKpis(schema, sourceType) {
  const kpis = [];

  for (const [tableKey, columns] of Object.entries(schema)) {
    const measures = Object.values(columns).filter(c => c.role === 'measure');
    const dimensions = Object.values(columns).filter(c => c.role === 'dimension');

    for (const measure of measures.slice(0, 3)) {
      kpis.push({
        name: `Total ${measure.name}`,
        field: measure.name,
        table: tableKey,
        aggregation: 'SUM',
        type: 'numeric'
      });

      kpis.push({
        name: `Avg ${measure.name}`,
        field: measure.name,
        table: tableKey,
        aggregation: 'AVG',
        type: 'numeric'
      });
    }

    // Add count KPI
    kpis.push({
      name: `Total ${formatTableName(tableKey)}`,
      field: 'id',
      table: tableKey,
      aggregation: 'COUNT',
      type: 'count'
    });
  }

  return kpis.slice(0, 10);
}

/**
 * Generate data insights
 */
function generateDataInsights(schema) {
  const insights = [];
  let totalTables = 0;
  let totalColumns = 0;
  let totalMeasures = 0;
  let totalDimensions = 0;

  for (const [tableKey, columns] of Object.entries(schema)) {
    totalTables++;
    totalColumns += Object.keys(columns).length;
    totalMeasures += Object.values(columns).filter(c => c.role === 'measure').length;
    totalDimensions += Object.values(columns).filter(c => c.role === 'dimension').length;
  }

  insights.push(`Database contains ${totalTables} tables with ${totalColumns} total columns`);
  insights.push(`${totalMeasures} numeric measures available for aggregation`);
  insights.push(`${totalDimensions} dimension fields for grouping and filtering`);

  if (totalMeasures > 5) {
    insights.push('Rich data for multi-metric analysis and comparisons');
  }

  if (totalDimensions > 5) {
    insights.push('Good variety of dimensions for drill-down and segmentation');
  }

  return insights;
}

/**
 * Format table name for display
 */
function formatTableName(name) {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = {
  analyzeAllSources,
  analyzeInternalDatabase,
  analyzeDataSource,
  detectTableRelationships,
  suggestKpis,
  generateDataInsights,
};
