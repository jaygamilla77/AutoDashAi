/**
 * Data Analysis Service
 * Analyzes uploaded files and database connections
 * Extracts schema, data quality, and KPI suggestions
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const aiService = require('./aiService');

/**
 * Analyze uploaded file (Excel, CSV, JSON)
 */
async function analyzeFile(filePath, fileType) {
  try {
    const extension = path.extname(filePath).toLowerCase();
    let data = [];
    
    if (extension === '.csv' || fileType === 'csv') {
      data = await analyzeCsv(filePath);
    } else if (['.xlsx', '.xls'].includes(extension) || fileType === 'excel') {
      data = await analyzeExcel(filePath);
    } else if (extension === '.json' || fileType === 'json') {
      data = await analyzeJson(filePath);
    } else {
      throw new Error('Unsupported file type');
    }

    return analyzeDataQuality(data);
  } catch (e) {
    console.error('File analysis error:', e);
    throw new Error(`File analysis failed: ${e.message}`);
  }
}

/**
 * Analyze CSV file
 */
async function analyzeCsv(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Read file content as string
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Parse CSV content
      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            reject(new Error(`CSV parse error: ${results.errors[0].message}`));
          } else {
            resolve(results.data || []);
          }
        },
        error: (error) => {
          reject(error);
        },
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Analyze Excel file
 */
async function analyzeExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel file has no sheets');
  
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

/**
 * Analyze JSON file
 */
async function analyzeJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  
  if (!Array.isArray(parsed)) {
    if (typeof parsed === 'object' && parsed !== null) {
      return Array.isArray(parsed.data) ? parsed.data : [parsed];
    }
    throw new Error('JSON file must contain an array or object with data property');
  }
  
  return parsed;
}

/**
 * Analyze data quality and extract insights
 */
function analyzeDataQuality(data) {
  if (!data || data.length === 0) {
    throw new Error('No data found in file');
  }

  const totalRows = data.length;
  const columns = Object.keys(data[0] || {});
  const totalColumns = columns.length;

  // Analyze each column
  const columnAnalysis = {};
  let nullCount = 0;
  let duplicateCount = 0;

  columns.forEach((col) => {
    const values = data.map((row) => row[col]);
    const nonNullValues = values.filter((v) => v != null && v !== '');
    const nulls = values.length - nonNullValues.length;
    const duplicates = values.length - new Set(values).size;

    nullCount += nulls;
    duplicateCount += duplicates;

    // Infer column type
    const inferredType = inferColumnType(nonNullValues);

    columnAnalysis[col] = {
      type: inferredType,
      nullCount: nulls,
      nullPercentage: ((nulls / values.length) * 100).toFixed(1),
      duplicates: duplicates,
      uniqueValues: new Set(nonNullValues).size,
      sampleValues: nonNullValues.slice(0, 5),
    };
  });

  // Calculate data quality score
  const qualityScore = Math.max(0, Math.min(100, 
    100 - (nullCount / (totalRows * totalColumns)) * 50 - (duplicateCount / totalRows) * 10
  )).toFixed(1);

  // Detect potential KPIs
  const potentialKpis = detectKpis(columns, columnAnalysis);

  // Detect potential measures and dimensions
  const measures = columns.filter((col) => columnAnalysis[col].type === 'number');
  const dimensions = columns.filter((col) => columnAnalysis[col].type !== 'number');

  return {
    totalRows,
    totalColumns,
    columns,
    columnAnalysis,
    qualityScore,
    nullCount,
    duplicateCount,
    potentialKpis,
    measures,
    dimensions,
    suggestedCharts: suggestCharts(measures, dimensions),
    analysis: {
      hasTimeSeries: hasTimeSeriesColumn(columns, columnAnalysis),
      hasCategorical: dimensions.length > 0,
      hasNumerical: measures.length > 0,
      dataCompleteness: (((totalRows * totalColumns - nullCount) / (totalRows * totalColumns)) * 100).toFixed(1),
    },
  };
}

/**
 * Infer column data type from sample values
 */
function inferColumnType(values) {
  if (values.length === 0) return 'unknown';

  const sample = values.slice(0, 20);
  const numberCount = sample.filter((v) => !isNaN(v) && v !== '').length;
  const dateCount = sample.filter((v) => !isNaN(Date.parse(v)) && v.length >= 8).length;

  if (numberCount / sample.length > 0.8) return 'number';
  if (dateCount / sample.length > 0.6) return 'date';
  
  return 'text';
}

/**
 * Detect potential KPIs from data
 */
function detectKpis(columns, columnAnalysis) {
  const kpis = [];
  
  // Look for common KPI patterns
  const kpiPatterns = [
    { regex: /revenue|sales|income|profit|earnings/i, label: 'Revenue', type: 'sum' },
    { regex: /cost|expense|spending/i, label: 'Cost', type: 'sum' },
    { regex: /count|total|quantity|volume/i, label: 'Volume', type: 'count' },
    { regex: /rate|percentage|ratio|margin|growth/i, label: 'Rate', type: 'avg' },
    { regex: /employee|staff|worker|headcount/i, label: 'Headcount', type: 'count' },
    { regex: /customer|client|user|account/i, label: 'Customers', type: 'count' },
    { regex: /order|transaction|sale|deal/i, label: 'Orders', type: 'count' },
    { regex: /time|duration|date|period/i, label: 'Timeline', type: 'date' },
  ];

  columns.forEach((col) => {
    kpiPatterns.forEach((pattern) => {
      if (pattern.regex.test(col) && kpis.length < 5) {
        const type = columnAnalysis[col].type;
        
        if ((pattern.type === 'sum' || pattern.type === 'avg') && type === 'number') {
          kpis.push({
            column: col,
            label: pattern.label,
            type: pattern.type,
            aggregation: pattern.type,
          });
        } else if (pattern.type === 'count' && type !== 'number') {
          kpis.push({
            column: col,
            label: pattern.label,
            type: 'count',
            aggregation: 'count',
          });
        } else if (pattern.type === 'date' && type === 'date') {
          kpis.push({
            column: col,
            label: pattern.label,
            type: 'date',
            aggregation: 'none',
          });
        }
      }
    });
  });

  return kpis.slice(0, 5);
}

/**
 * Suggest appropriate chart types based on data
 */
function suggestCharts(measures, dimensions) {
  const suggestions = [];

  if (measures.length > 0 && dimensions.length > 0) {
    suggestions.push('bar', 'line', 'area', 'scatter');
  } else if (measures.length > 1) {
    suggestions.push('pie', 'doughnut', 'line');
  } else if (dimensions.length > 0) {
    suggestions.push('table', 'cards');
  }

  return suggestions;
}

/**
 * Check if data has time series characteristics
 */
function hasTimeSeriesColumn(columns, columnAnalysis) {
  return columns.some((col) => columnAnalysis[col].type === 'date');
}

/**
 * Get AI recommendations for dashboard type based on data analysis
 */
async function getAiRecommendations(analysis) {
  try {
    const prompt = `
Based on this data analysis, recommend a dashboard type and KPIs for a professional business dashboard.

Data Summary:
- Total Rows: ${analysis.totalRows}
- Total Columns: ${analysis.totalColumns}
- Data Quality Score: ${analysis.qualityScore}
- Available Measures: ${analysis.measures.join(', ')}
- Available Dimensions: ${analysis.dimensions.join(', ')}
- Potential KPIs: ${analysis.potentialKpis.map((k) => k.label).join(', ')}
- Has Time Series: ${analysis.analysis.hasTimeSeries}
- Has Categorical Data: ${analysis.analysis.hasCategorical}

Provide a JSON response with:
{
  "recommendedDashboardType": "Executive|Operations|Finance|HR|Sales|Recruitment",
  "reasoning": "brief explanation",
  "recommendedKpis": ["KPI 1", "KPI 2", "KPI 3"],
  "recommendedCharts": ["chart_type_1", "chart_type_2"],
  "suggestedAnalysis": "What insights could be derived",
  "anomalyDetectionOpportunities": ["opportunity1", "opportunity2"]
}

Respond ONLY with valid JSON.
    `;

    const recommendations = await aiService.chatJSON(
      'You are a data analysis expert. Analyze the provided data structure and suggest insights, KPIs, and chart recommendations.',
      prompt,
      { max_tokens: 1500 }
    );
    return JSON.parse(recommendations);
  } catch (e) {
    console.error('AI recommendations error:', e);
    return {
      recommendedDashboardType: 'Executive',
      reasoning: 'Based on data characteristics',
      recommendedKpis: analysis.potentialKpis.map((k) => k.label).slice(0, 3),
      recommendedCharts: analysis.suggestedCharts.slice(0, 3),
      suggestedAnalysis: 'Explore trends and patterns in your data',
      anomalyDetectionOpportunities: ['Outliers in numerical data', 'Missing value patterns'],
    };
  }
}

/**
 * Test database connection (placeholder)
 */
async function testDatabaseConnection(config) {
  try {
    // This would connect to actual database based on config
    // For now, return success
    return {
      success: true,
      message: 'Connection successful',
      tables: config.tables || [],
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
    };
  }
}

module.exports = {
  analyzeFile,
  analyzeCsv,
  analyzeExcel,
  analyzeJson,
  analyzeDataQuality,
  inferColumnType,
  detectKpis,
  suggestCharts,
  hasTimeSeriesColumn,
  getAiRecommendations,
  testDatabaseConnection,
};
