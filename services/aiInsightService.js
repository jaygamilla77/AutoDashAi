/**
 * AI Insight Service
 *
 * Generates narrative insights, executive summaries, and smart suggestions
 * using Azure OpenAI. Falls back to basic statistical summaries when AI is unavailable.
 *
 * Two output modes:
 *   - generateInsight(panel)            -> string (legacy, back-compat)
 *   - generateStructuredInsight(panel)  -> { observation, businessImpact,
 *                                            rootCauseHypothesis, recommendation,
 *                                            riskLevel, confidence, evidence,
 *                                            flags, type }
 */

const aiService = require('./aiService');
const stats = require('./statsAnalysisService');

// ========== Narrative Insights ==========

const INSIGHT_SYSTEM_PROMPT = `You are a senior data analyst writing for busy C-suite executives.
Given chart data (labels, values, chart type, title), produce a concise analytical insight.

Rules:
- Write exactly 2-3 sentences
- Sentence 1: Lead with the single most important finding, including a specific number or percentage
- Sentence 2: Provide context — is this good or concerning? Compare top vs bottom if relevant
- Sentence 3 (optional): One actionable implication or recommended next step
- Use professional, direct business language ("Revenue is up 18%" not "The chart shows revenue")
- Highlight anomalies, concentration risks, or standout outliers
- Do NOT describe the chart type — interpret the data as a business analyst
- Do NOT use bullet points, markdown, or formatting

Return ONLY the insight text.`;

// ─── Structured insight contract ───────────────────────────────────────────
const STRUCTURED_INSIGHT_PROMPT = `You are a senior data analyst writing structured findings for an executive dashboard.

You will be given:
1. A panel description (title, chart type, labels, values).
2. Pre-computed statistics: trend direction, concentration index (HHI), outliers, period-over-period change, risk level.

Return ONLY a single JSON object with this exact shape:
{
  "title":         "<<3-6 word headline, business framing>>",
  "observation":   "<<1 sentence: the single most important fact, with a number>>",
  "businessImpact":"<<1 sentence: why this matters for the business>>",
  "rootCauseHypothesis": "<<1 sentence: a plausible cause; mark as hypothesis>>",
  "recommendation":"<<1 sentence: a specific, defensible action>>",
  "riskLevel":     "CRITICAL|HIGH|MEDIUM|LOW",
  "confidence":    0-100,
  "type":          "concentration|trend|outlier|shock|distribution|positive|other",
  "evidence":      [ { "metric": "<<short label>>", "value": "<<formatted value>>" } ]
}

Rules:
- Use the pre-computed statistics as the source of truth — don't contradict them.
- Risk level must reflect the supplied stats; downgrade only if you detect a positive interpretation.
- Confidence: lower if data points < 5 or values are mostly zero.
- evidence: 2-4 short, scannable bullets.
- No markdown. No commentary outside the JSON.`;

/**
 * Build a compact stats payload string for the LLM prompt.
 */
function _statsToPromptText(p) {
  if (!p) return 'No statistics available.';
  const lines = [];
  lines.push(`points=${p.count}, sum=${Math.round(p.sum)}, mean=${Math.round(p.mean)}, median=${Math.round(p.median)}, min=${p.min}, max=${p.max}`);
  lines.push(`trend.direction=${p.trend.direction}, trend.pctChange=${p.trend.pctChange.toFixed(1)}%, trend.strength=${p.trend.strength.toFixed(2)}`);
  lines.push(`concentration.hhi=${p.concentration.hhi.toFixed(3)}, concentration.top1=${(p.concentration.top1Share * 100).toFixed(1)}% (${p.concentration.dominantLabel || 'n/a'}), top3=${(p.concentration.top3Share * 100).toFixed(1)}%`);
  if (p.outliers && p.outliers.length) lines.push(`outliers=${p.outliers.length} (z>2)`);
  if (p.periodOverPeriod) lines.push(`pop.delta=${p.periodOverPeriod.delta}, pop.pct=${p.periodOverPeriod.pctChange.toFixed(1)}%`);
  lines.push(`riskLevel=${p.riskLevel}, flags=[${(p.flags || []).join(',') || 'none'}]`);
  return lines.join('\n');
}

/**
 * Structured insight contract — preferred output for the renderer.
 * Always returns a valid object, even when AI is unavailable.
 */
async function generateStructuredInsight(panel) {
  const profile = stats.profilePanel(panel) || null;

  // AI path
  if (aiService.isAvailable() && panel && panel.labels && panel.values && panel.labels.length > 0) {
    const dataDesc = panel.labels.slice(0, 30).map((l, i) => `${l}: ${panel.values[i]}`).join(', ');
    const userMsg = `Panel: "${panel.title || 'Untitled'}"
Type: ${panel.chartType || 'bar'}
Data: ${dataDesc}
${panel.kpis && panel.kpis.length ? 'KPIs: ' + panel.kpis.map(k => `${k.label}=${k.value}`).join(', ') : ''}

Pre-computed statistics:
${_statsToPromptText(profile)}`;

    try {
      const result = await aiService.chatJSON(STRUCTURED_INSIGHT_PROMPT, userMsg, { max_tokens: 500 });
      if (result && typeof result === 'object') {
        return _normaliseStructured(result, profile, panel);
      }
    } catch (err) {
      // Fall through to rule-based
    }
  }

  // Rule-based fallback grounded in stats
  return _ruleBasedStructured(panel, profile);
}

function _normaliseStructured(raw, profile, panel) {
  const allowedRisk = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  const risk = allowedRisk.has(raw.riskLevel) ? raw.riskLevel : (profile ? profile.riskLevel : 'LOW');
  const conf = Math.max(0, Math.min(100, Number(raw.confidence) || 70));
  return {
    title:                raw.title || _humanTitle(panel),
    observation:          String(raw.observation || '').trim(),
    businessImpact:       String(raw.businessImpact || '').trim(),
    rootCauseHypothesis:  String(raw.rootCauseHypothesis || '').trim(),
    recommendation:       String(raw.recommendation || '').trim(),
    riskLevel:            risk,
    confidence:           conf,
    type:                 raw.type || (profile && profile.flags[0] ? profile.flags[0].toLowerCase() : 'other'),
    evidence:             Array.isArray(raw.evidence) ? raw.evidence.slice(0, 4) : _evidenceFromProfile(profile),
    flags:                profile ? profile.flags : [],
  };
}

function _humanTitle(panel) {
  return (panel && panel.title) ? panel.title.replace(/[_\-]/g, ' ').slice(0, 60) : 'Insight';
}

function _evidenceFromProfile(p) {
  if (!p) return [];
  const ev = [];
  if (p.concentration && p.concentration.top1Share) {
    ev.push({ metric: 'Top share', value: (p.concentration.top1Share * 100).toFixed(1) + '% (' + (p.concentration.dominantLabel || '—') + ')' });
  }
  if (p.trend && p.trend.direction !== 'flat') {
    ev.push({ metric: 'Trend', value: p.trend.direction + ' ' + p.trend.pctChange.toFixed(1) + '%' });
  }
  if (p.outliers && p.outliers.length) {
    ev.push({ metric: 'Outliers', value: p.outliers.length + ' point(s) > 2σ' });
  }
  if (p.periodOverPeriod) {
    ev.push({ metric: 'Latest vs prior', value: p.periodOverPeriod.pctChange.toFixed(1) + '%' });
  }
  return ev.slice(0, 4);
}

function _ruleBasedStructured(panel, profile) {
  const title = _humanTitle(panel);
  if (!profile) {
    return {
      title, observation: 'Insufficient data for analysis.', businessImpact: '',
      rootCauseHypothesis: '', recommendation: 'Refresh the dataset.',
      riskLevel: 'LOW', confidence: 30, type: 'other', evidence: [], flags: [],
    };
  }
  const dom = profile.concentration.dominantLabel;
  const top1 = (profile.concentration.top1Share * 100).toFixed(1);
  const tr = profile.trend;
  const flagSet = new Set(profile.flags);

  let observation = '';
  let impact = '';
  let cause = '';
  let rec = '';
  let type = 'distribution';

  if (flagSet.has('CONCENTRATION')) {
    observation = `${dom} accounts for ${top1}% of total — a single-segment concentration.`;
    impact = 'High dependence on one segment exposes the business to volatility from that segment.';
    cause = 'Likely a structural workload or revenue mix imbalance, not a data error.';
    rec = `Diversify activity beyond ${dom} or set explicit thresholds.`;
    type = 'concentration';
  } else if (flagSet.has('DECLINE')) {
    observation = `Series declined ${Math.abs(tr.pctChange).toFixed(1)}% from start to end of the period.`;
    impact = 'Sustained decline weakens forecast reliability and revenue capture.';
    cause = 'Possible drivers: seasonality, demand softness, or pipeline gaps.';
    rec = 'Investigate the inflection point and accelerate top-of-funnel activity.';
    type = 'trend';
  } else if (flagSet.has('SHOCK')) {
    const pp = profile.periodOverPeriod;
    observation = `Latest period changed ${pp.pctChange.toFixed(1)}% versus the previous one.`;
    impact = 'Sudden period-over-period swings break the operating cadence.';
    cause = 'Check for one-off events, data ingestion gaps, or process changes.';
    rec = 'Validate the source data and triangulate against an independent metric.';
    type = 'shock';
  } else if (flagSet.has('OUTLIERS')) {
    observation = `${profile.outliers.length} data points exceed 2 standard deviations from the mean.`;
    impact = 'Outliers can mask the trend and bias averages.';
    cause = 'Potential data-entry artifacts or genuinely exceptional periods.';
    rec = 'Review outlier rows; consider a robust statistic (median) for headline reporting.';
    type = 'outlier';
  } else if (tr.direction === 'up') {
    observation = `Series grew ${tr.pctChange.toFixed(1)}% across the window with positive momentum.`;
    impact = 'Sustained growth strengthens the forecast and unit economics.';
    cause = 'Likely structural improvement; validate by holding the growth driver constant.';
    rec = 'Lock in the driver and stress-test capacity to absorb continued growth.';
    type = 'positive';
  } else {
    observation = `Total ${Math.round(profile.sum).toLocaleString()} across ${profile.count} categories with ${dom || 'no dominant'} segment leading.`;
    impact = 'Distribution is balanced — no single point of risk.';
    cause = 'Steady-state pattern.';
    rec = 'Maintain monitoring; revisit on the next reporting cadence.';
    type = 'distribution';
  }

  return {
    title, observation, businessImpact: impact, rootCauseHypothesis: cause, recommendation: rec,
    riskLevel: profile.riskLevel,
    confidence: profile.count >= 5 ? 75 : 55,
    type,
    evidence: _evidenceFromProfile(profile),
    flags: profile.flags,
  };
}

/**
 * Generate a narrative insight for a dashboard panel (legacy string form).
 * Internally delegates to the structured contract for consistency.
 * @param {object} panel - { title, chartType, labels, values, kpis }
 * @returns {string} Insight text
 */
async function generateInsight(panel) {
  const { title, chartType, labels, values, kpis } = panel;

  // Try AI first (legacy text path — preserved for back-compat)
  if (aiService.isAvailable() && labels && values && labels.length > 0) {
    const dataDesc = labels.map((l, i) => `${l}: ${values[i]}`).join(', ');
    const userMsg = `Chart: "${title || 'Untitled'}"
Type: ${chartType || 'bar'}
Data: ${dataDesc}
${kpis && kpis.length > 0 ? 'KPIs: ' + kpis.map(k => `${k.label}=${k.value}`).join(', ') : ''}`;

    const insight = await aiService.chat(INSIGHT_SYSTEM_PROMPT, userMsg, {
      max_tokens: 200,
    });
    if (insight) return insight;
  }

  // Fallback: basic statistical summary
  return generateBasicInsight(title, labels, values);
}

// ========== Executive Summary ==========

const EXECUTIVE_SUMMARY_PROMPT = `You are a chief analytics officer writing a premium executive dashboard summary for a board-level audience.
Given multiple dashboard panels with their data, write a crisp, confident executive overview.

Rules:
- Exactly 4-5 sentences — no more
- Synthesize themes across ALL panels — do not list them individually
- Open with the single most important finding (headline number or trend)
- Identify one business opportunity and one risk or concern
- Close with a forward-looking recommendation or strategic priority
- Use confident, boardroom-quality language with specific numbers
- No bullet points, no markdown, no section headers

Return ONLY the summary text.`;

/**
 * Generate an executive summary across multiple dashboard panels.
 * @param {Array} panels - Array of panel objects with title, labels, values
 * @returns {string} Executive summary text
 */
async function generateExecutiveSummary(panels) {
  if (!aiService.isAvailable() || !panels || panels.length === 0) {
    return generateBasicExecutiveSummary(panels);
  }

  const panelDescs = panels
    .filter(p => p.labels && p.values && p.labels.length > 0)
    .slice(0, 10)  // limit to avoid token overflow
    .map((p, i) => {
      const top5 = p.labels.slice(0, 5).map((l, j) => `${l}: ${p.values[j]}`).join(', ');
      return `Panel ${i + 1} "${p.title}" (${p.chartType}): ${top5}${p.labels.length > 5 ? ` ...and ${p.labels.length - 5} more` : ''}`;
    })
    .join('\n');

  const summary = await aiService.chat(EXECUTIVE_SUMMARY_PROMPT, panelDescs, {
    max_tokens: 300,
  });

  return summary || generateBasicExecutiveSummary(panels);
}

// ========== Smart Suggestions ==========

const SMART_SUGGEST_PROMPT = `You are a data analytics advisor helping a business executive explore their data.
Given the schema of a dataset (table names, column names, column types), suggest 5 insightful questions the executive should ask.

Rules:
- Questions should be practical and actionable for decision-making
- Mix different analysis types: trends, comparisons, anomalies, rankings
- Use natural language a non-technical person would use
- Each question should be 1 sentence
- Return a JSON array of 5 strings

Example output: ["What is the monthly trend of revenue?", "Which department has the highest ticket backlog?"]`;

/**
 * Generate smart prompt suggestions based on data schema.
 * @param {object} schemaInfo - { tables: [{ name, columns: [{ name, type, role }] }] }
 * @returns {string[]} Array of suggested prompts
 */
async function generateSmartSuggestions(schemaInfo) {
  if (!aiService.isAvailable() || !schemaInfo) return [];

  const schemaDesc = (schemaInfo.tables || [])
    .map(t => `Table "${t.name}": ${(t.columns || []).map(c => `${c.name} (${c.type})`).join(', ')}`)
    .join('\n');

  const result = await aiService.chatJSON(SMART_SUGGEST_PROMPT, schemaDesc, {
    max_tokens: 400,
  });

  if (Array.isArray(result)) return result.slice(0, 5);
  if (result && Array.isArray(result.suggestions)) return result.suggestions.slice(0, 5);
  if (result && Array.isArray(result.questions)) return result.questions.slice(0, 5);
  return [];
}

// ========== Fallback Helpers ==========

function generateBasicInsight(title, labels, values) {
  if (!labels || !values || labels.length === 0) {
    return 'No data available for analysis.';
  }

  const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
  const maxIdx = values.indexOf(Math.max(...values.map(Number)));
  const minIdx = values.indexOf(Math.min(...values.map(Number)));

  const parts = [];
  if (labels.length > 1) {
    parts.push(`"${labels[maxIdx]}" leads with ${values[maxIdx]} (${total > 0 ? Math.round((values[maxIdx] / total) * 100) : 0}% of total).`);
    if (maxIdx !== minIdx) {
      parts.push(`"${labels[minIdx]}" is lowest at ${values[minIdx]}.`);
    }
    parts.push(`Total across ${labels.length} categories: ${total.toLocaleString()}.`);
  } else {
    parts.push(`${labels[0]}: ${values[0]}.`);
  }

  return parts.join(' ');
}

function generateBasicExecutiveSummary(panels) {
  if (!panels || panels.length === 0) return 'No dashboard data to summarize.';
  return `Dashboard contains ${panels.length} panel${panels.length > 1 ? 's' : ''} analyzing your data. Review individual panels for detailed findings.`;
}

// ========== Cross-panel anomaly detector ===================================
/**
 * Walk all panels, profile each, and surface the top-N risk findings as
 * structured insights. AI-free; safe to call inside the wizard fast path.
 */
function detectAnomalies(panels, opts) {
  const limit = (opts && opts.limit) || 5;
  if (!Array.isArray(panels) || !panels.length) return [];
  const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const ranked = panels
    .map(p => ({ panel: p, profile: stats.profilePanel(p) }))
    .filter(x => x.profile && x.profile.flags && x.profile.flags.length)
    .sort((a, b) => (RANK[b.profile.riskLevel] || 0) - (RANK[a.profile.riskLevel] || 0))
    .slice(0, limit);

  return ranked.map(({ panel, profile }) => _ruleBasedStructured(panel, profile));
}

module.exports = {
  generateInsight,
  generateStructuredInsight,
  generateExecutiveSummary,
  generateSmartSuggestions,
  detectAnomalies,
  // Re-exports for callers that want the raw stats
  stats,
};
