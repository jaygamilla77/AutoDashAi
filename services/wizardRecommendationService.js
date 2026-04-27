/**
 * Wizard Recommendation Service
 * Provides AI-driven recommendations for dashboard creation
 */

const aiService = require('./aiService');

/**
 * Get dashboard type recommendations based on data analysis
 */
async function recommendDashboardType(dataAnalysis) {
  const measures = dataAnalysis.measures || [];
  const dimensions = dataAnalysis.dimensions || [];
  const hasTimeSeries = dataAnalysis.analysis?.hasTimeSeries;
  const qualityScore = dataAnalysis.qualityScore;

  // Rule-based recommendations
  if (dimensions.some((d) => /employee|staff|team|department/i.test(d))) {
    return {
      type: 'HR Dashboard',
      icon: 'bi-people-fill',
      color: '#06b6d4',
      description: 'Track HR metrics, headcount, and team performance',
    };
  }

  if (dimensions.some((d) => /product|sales|customer|order/i.test(d))) {
    return {
      type: 'Sales Dashboard',
      icon: 'bi-graph-up',
      color: '#10b981',
      description: 'Monitor sales performance and customer metrics',
    };
  }

  if (dimensions.some((d) => /cost|budget|expense|revenue|profit/i.test(d))) {
    return {
      type: 'Finance Dashboard',
      icon: 'bi-calculator-fill',
      color: '#f59e0b',
      description: 'Analyze financial metrics and budgets',
    };
  }

  if (hasTimeSeries && measures.length > 0) {
    return {
      type: 'Executive Dashboard',
      icon: 'bi-bar-chart-fill',
      color: '#3b82f6',
      description: 'Executive summary with KPIs and trends',
    };
  }

  return {
    type: 'Operations Dashboard',
    icon: 'bi-diagram-3',
    color: '#8b5cf6',
    description: 'Monitor operational metrics and performance',
  };
}

/**
 * Recommend KPIs based on data
 */
function recommendKpis(dataAnalysis) {
  const potentialKpis = dataAnalysis.potentialKpis || [];
  const measures = dataAnalysis.measures || [];
  const dimensions = dataAnalysis.dimensions || [];

  const kpiRecommendations = [
    // Default KPIs if potential KPIs are found
    ...potentialKpis.slice(0, 3),
  ];

  // Add additional common KPIs
  if (measures.length > 0) {
    kpiRecommendations.push({
      label: 'Average',
      column: measures[0],
      type: 'avg',
      icon: 'bi-graph-up',
    });
    kpiRecommendations.push({
      label: 'Total',
      column: measures[0],
      type: 'sum',
      icon: 'bi-calculator',
    });
  }

  if (dimensions.length > 0) {
    kpiRecommendations.push({
      label: 'Count',
      column: dimensions[0],
      type: 'count',
      icon: 'bi-hash',
    });
  }

  return kpiRecommendations.slice(0, 5);
}

/**
 * Recommend chart types based on data characteristics
 */
function recommendCharts(dataAnalysis) {
  const measures = dataAnalysis.measures || [];
  const dimensions = dataAnalysis.dimensions || [];
  const hasTimeSeries = dataAnalysis.analysis?.hasTimeSeries;

  const recommendations = [];

  if (hasTimeSeries && measures.length > 0) {
    recommendations.push({
      type: 'line',
      label: 'Trend Line',
      description: 'Show trends over time',
      icon: 'bi-graph-up',
      priority: 1,
    });
    recommendations.push({
      type: 'area',
      label: 'Area Chart',
      description: 'Cumulative trends with fill',
      icon: 'bi-graph-up',
      priority: 2,
    });
  }

  if (dimensions.length > 0 && measures.length > 0) {
    recommendations.push({
      type: 'bar',
      label: 'Bar Chart',
      description: 'Compare across categories',
      icon: 'bi-bar-chart-fill',
      priority: hasTimeSeries ? 3 : 1,
    });
    recommendations.push({
      type: 'column',
      label: 'Column Chart',
      description: 'Vertical comparison chart',
      icon: 'bi-bar-chart',
      priority: hasTimeSeries ? 4 : 2,
    });
  }

  if (dimensions.length > 0 && measures.length === 0) {
    recommendations.push({
      type: 'pie',
      label: 'Pie Chart',
      description: 'Show composition and parts',
      icon: 'bi-pie-chart-fill',
      priority: 1,
    });
  }

  if (measures.length > 1 && dimensions.length > 0) {
    recommendations.push({
      type: 'scatter',
      label: 'Scatter Plot',
      description: 'Correlation analysis',
      icon: 'bi-diagram-3',
      priority: 3,
    });
  }

  recommendations.push({
    type: 'table',
    label: 'Data Table',
    description: 'Detailed data view',
    icon: 'bi-table',
    priority: 5,
  });

  return recommendations.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/**
 * Recommend dashboard themes
 */
function getThemeOptions() {
  return [
    {
      id: 'modern-corporate',
      name: 'Modern Corporate',
      description: 'Clean, professional, and minimalist',
      colors: ['#3b82f6', '#1f2937', '#f3f4f6'],
      icon: 'bi-palette',
    },
    {
      id: 'executive-premium',
      name: 'Executive Premium',
      description: 'Premium dark theme with gold accents',
      colors: ['#fbbf24', '#1f2937', '#111827'],
      icon: 'bi-gem',
    },
    {
      id: 'minimal-clean',
      name: 'Minimal Clean',
      description: 'Lightweight with subtle colors',
      colors: ['#10b981', '#f5f5f5', '#ffffff'],
      icon: 'bi-sparkles',
    },
    {
      id: 'dark-professional',
      name: 'Dark Professional',
      description: 'Dark mode optimized for readability',
      colors: ['#06b6d4', '#1e293b', '#0f172a'],
      icon: 'bi-moon-stars',
    },
  ];
}

/**
 * Recommend layout options
 */
function getLayoutOptions() {
  return [
    {
      id: 'standard',
      name: 'Standard Layout',
      description: 'Balanced mix of KPIs and charts',
      preview: '2-column grid',
    },
    {
      id: 'kpi-heavy',
      name: 'KPI Heavy',
      description: 'Emphasize key metrics prominently',
      preview: 'Large KPI cards + charts',
    },
    {
      id: 'chart-heavy',
      name: 'Chart Heavy',
      description: 'Focus on data visualization',
      preview: 'Large charts + smaller cards',
    },
    {
      id: 'executive-summary-first',
      name: 'Executive Summary First',
      description: 'Summary at top, details below',
      preview: 'Executive summary + drill-down',
    },
  ];
}

/**
 * Get AI-powered template suggestions
 */
async function getTemplateSuggestions(dataAnalysis, dashboardType) {
  try {
    const prompt = `
You are a dashboard design expert. Based on this data analysis and dashboard type, suggest 3 dashboard templates.

Data Analysis:
- Rows: ${dataAnalysis.totalRows}
- Columns: ${dataAnalysis.totalColumns}
- Measures: ${dataAnalysis.measures.slice(0, 5).join(', ')}
- Dimensions: ${dataAnalysis.dimensions.slice(0, 5).join(', ')}

Dashboard Type: ${dashboardType}

Provide exactly 3 template suggestions in JSON format:
[
  {
    "name": "Template Name",
    "description": "What this template is best for",
    "sections": ["KPI Summary", "Trends", "Performance", "Details"],
    "priority": 1
  }
]

Respond ONLY with valid JSON array.
    `;

    const response = await aiService.chatJSON(
      'You are a dashboard design expert.',
      prompt,
      { max_tokens: 1500 }
    );
    return response || [
      {
        name: 'Balanced Overview',
        description: 'Mix of KPIs, trends, and details',
        sections: ['Executive Summary', 'Key Metrics', 'Trends', 'Performance Details'],
        priority: 1,
      },
      {
        name: 'Executive Focus',
        description: 'Top-level insights and key indicators',
        sections: ['Executive Summary', 'Critical KPIs', 'Anomalies', 'Action Items'],
        priority: 2,
      },
      {
        name: 'Detail-Oriented',
        description: 'Comprehensive data exploration',
        sections: ['Overview', 'Detailed Metrics', 'Drill-down Analysis', 'Data Table'],
        priority: 3,
      },
    ];
  } catch (e) {
    console.error('Template suggestions error:', e);
    return [
      {
        name: 'Balanced Overview',
        description: 'Mix of KPIs, trends, and details',
        sections: ['Executive Summary', 'Key Metrics', 'Trends', 'Performance Details'],
        priority: 1,
      },
      {
        name: 'Executive Focus',
        description: 'Top-level insights and key indicators',
        sections: ['Executive Summary', 'Critical KPIs', 'Anomalies', 'Action Items'],
        priority: 2,
      },
      {
        name: 'Detail-Oriented',
        description: 'Comprehensive data exploration',
        sections: ['Overview', 'Detailed Metrics', 'Drill-down Analysis', 'Data Table'],
        priority: 3,
      },
    ];
  }
}

/**
 * Recommend dashboard title based on data and type
 */
async function recommendDashboardTitle(dataAnalysis, dashboardType) {
  try {
    const dimensions = (dataAnalysis.dimensions || []).slice(0, 3);
    const measures = (dataAnalysis.measures || []).slice(0, 3);

    const prompt = `
Suggest a professional dashboard title for a ${dashboardType}.

Data Context:
- Key dimensions: ${dimensions.join(', ')}
- Key measures: ${measures.join(', ')}

Provide only the title, no explanation. Keep it under 50 characters.
    `;

    const title = await aiService.chat(
      'You are a dashboard naming expert.',
      prompt,
      { max_tokens: 100 }
    );
    return (title || `${dashboardType} Report`).trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    return `${dashboardType} Report`;
  }
}

/**
 * Get anomaly detection opportunities
 */
function getAnomalyDetectionOpportunities(dataAnalysis) {
  const opportunities = [];

  if (dataAnalysis.measures.length > 0) {
    opportunities.push({
      type: 'outliers',
      description: 'Detect unusual values in metrics',
      icon: 'bi-exclamation-triangle',
    });
  }

  if (dataAnalysis.analysis?.hasTimeSeries) {
    opportunities.push({
      type: 'trend-breaks',
      description: 'Identify sudden changes in trends',
      icon: 'bi-lightning',
    });
  }

  if (dataAnalysis.nullCount > 0) {
    opportunities.push({
      type: 'missing-data',
      description: 'Alert on missing or incomplete data',
      icon: 'bi-question-circle',
    });
  }

  if (dataAnalysis.dimensions.length > 0 && dataAnalysis.measures.length > 0) {
    opportunities.push({
      type: 'category-anomalies',
      description: 'Unusual patterns within categories',
      icon: 'bi-diagram-3',
    });
  }

  return opportunities;
}

module.exports = {
  recommendDashboardType,
  recommendKpis,
  recommendCharts,
  getThemeOptions,
  getLayoutOptions,
  getTemplateSuggestions,
  recommendDashboardTitle,
  getAnomalyDetectionOpportunities,
};
