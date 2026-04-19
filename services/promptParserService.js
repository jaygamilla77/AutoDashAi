/**
 * Prompt Parser Service
 *
 * Converts natural language prompts into structured dashboard requests.
 * Uses rule-based keyword matching (no external AI needed for local mode).
 * Architecture supports future OpenAI integration.
 */

const { CHART_TYPES, KNOWN_ENTITIES } = require('../utils/constants');
const dateFilterService = require('./dateFilterService');

// Entity detection patterns
const ENTITY_PATTERNS = {
  employee: /\b(employee|employees|staff|people|worker|workers|team member)\b/i,
  department: /\b(department|departments|dept|division|divisions)\b/i,
  project: /\b(project|projects)\b/i,
  ticket: /\b(ticket|tickets|issue|issues|bug|bugs|request|requests)\b/i,
  productivity: /\b(productivity|performance|output|efficiency|tasks?\s*completed|hours?\s*logged)\b/i,
};

// Metric detection patterns
const METRIC_PATTERNS = {
  count: /\b(count|total|number|how many|quantity)\b/i,
  avg: /\b(average|avg|mean)\b/i,
  sum: /\b(sum|total\s+(?:budget|hours|score|amount))\b/i,
  max: /\b(highest|max|maximum|top|best|most)\b/i,
  min: /\b(lowest|min|minimum|bottom|worst|least)\b/i,
};

// Dimension detection
const DIMENSION_PATTERNS = {
  department: /\bby\s+department\b/i,
  priority: /\bby\s+priority\b/i,
  status: /\bby\s+status\b/i,
  category: /\bby\s+category\b/i,
  employee: /\bby\s+employee\b/i,
  project: /\bby\s+project\b/i,
  month: /\b(monthly|by\s+month|month\s+over|per\s+month)\b/i,
  week: /\b(weekly|by\s+week|week\s+over|per\s+week)\b/i,
};

// Filter detection
const FILTER_PATTERNS = {
  open: /\b(open|unresolved|pending|active)\b/i,
  closed: /\b(closed|resolved|done|completed)\b/i,
  high_priority: /\b(high\s+priority|critical|urgent)\b/i,
  low: /\b(low\s+productivity|low\s+performance|poor|underperform)\b/i,
  inactive: /\b(inactive|disabled|deactivated)\b/i,
  active: /\b(active)\b/i,
};

// Ranking detection
const RANKING_PATTERNS = {
  top: /\btop\s+(\d+)\b/i,
  bottom: /\b(bottom|lowest)\s+(\d+)\b/i,
};

// Chart intent detection
const CHART_INTENT_PATTERNS = {
  pie: /\b(pie|donut|doughnut|distribution|breakdown)\b/i,
  line: /\b(trend|over\s+time|monthly|weekly|timeline|progress)\b/i,
  bar: /\b(compare|comparison|bar|ranking|by\b)/i,
  table: /\b(list|table|detail|show\s+all|all\b)/i,
};

// Metric field mapping per entity
const METRIC_FIELD_MAP = {
  employee: {
    default: 'count',
    fields: ['count', 'isActive'],
  },
  productivity: {
    default: 'avg_productivity_score',
    fields: ['productivityScore', 'hoursLogged', 'tasksCompleted'],
  },
  ticket: {
    default: 'count',
    fields: ['count', 'priority', 'status'],
  },
  project: {
    default: 'count',
    fields: ['count', 'budget', 'status'],
  },
};

/**
 * Parse a natural language prompt into a structured request.
 */
function parse(prompt, chartTypeHint) {
  const text = (prompt || '').trim().toLowerCase();
  if (!text) return null;

  const result = {
    goal: 'build_dashboard',
    focusArea: detectEntity(text),
    metrics: detectMetrics(text),
    dimensions: detectDimensions(text),
    filters: detectFilters(text),
    sort: null,
    limit: null,
    chartPreference: detectChartIntent(text, chartTypeHint),
    title: generateTitle(prompt),
    originalPrompt: prompt,
  };

  // Detect ranking / limit
  const ranking = detectRanking(text);
  if (ranking) {
    result.sort = { field: result.metrics[0] || 'count', direction: ranking.direction };
    result.limit = ranking.limit;
  }

  // Refine metrics based on entity
  if (result.focusArea && result.metrics.length === 0) {
    const mapping = METRIC_FIELD_MAP[result.focusArea];
    if (mapping) {
      result.metrics = [mapping.default];
    } else {
      result.metrics = ['count'];
    }
  }

  // Detect specific metric fields from prompt
  if (/budget/i.test(text)) result.metrics = ['budget'];
  if (/hours?\s*logged/i.test(text)) result.metrics = ['avg_hours_logged'];
  if (/productivity\s*score/i.test(text)) result.metrics = ['avg_productivity_score'];
  if (/tasks?\s*completed/i.test(text)) result.metrics = ['avg_tasks_completed'];

  // Detect date range
  const dateRange = dateFilterService.detectDatePhrase(text);
  if (dateRange) {
    result.filters.dateRange = dateRange.phrase;
    result.filters.dateStart = dateRange.start;
    result.filters.dateEnd = dateRange.end;
  }

  return result;
}

function detectEntity(text) {
  // Check most specific first
  for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
    if (pattern.test(text)) return entity;
  }
  return 'generic';
}

function detectMetrics(text) {
  const metrics = [];
  for (const [metric, pattern] of Object.entries(METRIC_PATTERNS)) {
    if (pattern.test(text)) metrics.push(metric);
  }
  return metrics;
}

function detectDimensions(text) {
  const dims = [];
  for (const [dim, pattern] of Object.entries(DIMENSION_PATTERNS)) {
    if (pattern.test(text)) dims.push(dim);
  }
  return dims;
}

function detectFilters(text) {
  const filters = {};
  if (FILTER_PATTERNS.open.test(text) && !FILTER_PATTERNS.closed.test(text)) {
    filters.status = 'open';
  }
  if (FILTER_PATTERNS.closed.test(text)) {
    filters.status = 'resolved';
  }
  if (FILTER_PATTERNS.high_priority.test(text)) {
    filters.priority = 'high';
  }
  if (FILTER_PATTERNS.low.test(text)) {
    filters.lowPerformance = true;
  }
  if (FILTER_PATTERNS.inactive.test(text)) {
    filters.isActive = false;
  } else if (/\bactive\s+(project|employee)/i.test(text)) {
    filters.isActive = true;
  }
  return filters;
}

function detectRanking(text) {
  let match = text.match(RANKING_PATTERNS.top);
  if (match) {
    return { direction: 'desc', limit: parseInt(match[1], 10) };
  }
  match = text.match(RANKING_PATTERNS.bottom);
  if (match) {
    return { direction: 'asc', limit: parseInt(match[2] || match[1], 10) };
  }
  // "highest" implies top without explicit number
  if (/\bhighest\b/i.test(text)) {
    return { direction: 'desc', limit: 10 };
  }
  return null;
}

function detectChartIntent(text, hint) {
  if (hint && hint !== 'auto' && CHART_TYPES.includes(hint)) return hint;
  for (const [type, pattern] of Object.entries(CHART_INTENT_PATTERNS)) {
    if (pattern.test(text)) return type;
  }
  return 'bar';
}

function generateTitle(prompt) {
  // Capitalize first letter and clean up
  const cleaned = prompt.replace(/^show\s+(me\s+)?/i, '').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

module.exports = { parse };
