/**
 * AI Insight Service
 *
 * Generates narrative insights, executive summaries, and smart suggestions
 * using Azure OpenAI. Falls back to basic statistical summaries when AI is unavailable.
 */

const aiService = require('./aiService');

// ========== Narrative Insights ==========

const INSIGHT_SYSTEM_PROMPT = `You are a senior data analyst writing for busy executives.
Given chart data (labels, values, chart type, title), produce a concise narrative insight.

Rules:
- Write 2-3 sentences maximum
- Lead with the most important finding
- Include specific numbers and percentages
- Highlight anomalies, trends, or standout values
- Use professional business language
- Do NOT describe the chart — interpret the data
- End with a brief actionable implication if appropriate

Return ONLY the insight text, no markdown or formatting.`;

/**
 * Generate a narrative insight for a dashboard panel.
 * @param {object} panel - { title, chartType, labels, values, kpis }
 * @returns {string} Insight text
 */
async function generateInsight(panel) {
  const { title, chartType, labels, values, kpis } = panel;

  // Try AI first
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

const EXECUTIVE_SUMMARY_PROMPT = `You are a chief data analyst writing a brief executive summary.
Given multiple dashboard panels with their data, write a concise executive overview.

Rules:
- Maximum 4-5 sentences
- Synthesize across all panels — don't just list them
- Highlight the most critical findings and trends
- Note any concerning patterns or opportunities
- Use a confident, professional tone
- Include specific numbers

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

module.exports = {
  generateInsight,
  generateExecutiveSummary,
  generateSmartSuggestions,
};
