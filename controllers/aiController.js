/**
 * AI Controller
 *
 * Handles AI-related API endpoints: status check, smart suggestions,
 * executive summary generation, and settings.
 */

const aiService = require('../services/aiService');
const aiInsightService = require('../services/aiInsightService');
const db = require('../models');

/**
 * GET /ai/status — Check if AI is enabled and connected.
 */
exports.status = (req, res) => {
  res.json({
    enabled: aiService.isAvailable(),
    provider: aiService.isAvailable() ? 'Azure OpenAI' : 'none',
  });
};

/**
 * POST /ai/suggestions — Generate smart prompt suggestions for a data source.
 */
exports.suggestions = async (req, res) => {
  try {
    const { dataSourceId } = req.body;
    if (!dataSourceId) return res.json({ suggestions: [] });

    const schemas = await db.DataSourceSchema.findAll({
      where: { dataSourceId: parseInt(dataSourceId, 10) },
      raw: true,
    });

    if (!schemas.length) return res.json({ suggestions: [] });

    const schemaInfo = {
      tables: schemas.map(s => {
        const cols = JSON.parse(s.schemaJson || '[]');
        return {
          name: s.datasetName,
          columns: cols.map(c => ({ name: c.name, type: c.type, role: c.role })),
        };
      }),
    };

    const suggestions = await aiInsightService.generateSmartSuggestions(schemaInfo);
    res.json({ suggestions });
  } catch (err) {
    console.error('[AI] Suggestions error:', err);
    res.json({ suggestions: [], error: err.message });
  }
};

/**
 * POST /ai/executive-summary — Generate executive summary from multiple panels.
 */
exports.executiveSummary = async (req, res) => {
  try {
    const { panels } = req.body;
    const panelArray = JSON.parse(panels || '[]');
    const summary = await aiInsightService.generateExecutiveSummary(panelArray);
    res.json({ summary });
  } catch (err) {
    console.error('[AI] Executive summary error:', err);
    res.json({ summary: 'Failed to generate summary.', error: err.message });
  }
};

/**
 * GET /ai/settings — Show AI settings page.
 */
exports.settingsPage = (req, res) => {
  const appConfig = require('../config/app');
  res.render('ai-settings', {
    title: 'AI Settings',
    aiEnabled: aiService.isAvailable(),
    config: {
      endpoint: appConfig.azureOpenAI.endpoint ? maskString(appConfig.azureOpenAI.endpoint) : '',
      deploymentName: appConfig.azureOpenAI.deploymentName || '',
      apiVersion: appConfig.azureOpenAI.apiVersion || '',
      hasApiKey: !!appConfig.azureOpenAI.apiKey,
    },
  });
};

/**
 * POST /ai/test — Test the AI connection.
 */
exports.testConnection = async (req, res) => {
  try {
    if (!aiService.isAvailable()) {
      return res.json({ success: false, message: 'Azure OpenAI is not configured. Check your .env file.' });
    }

    const reply = await aiService.chat(
      'You are a helpful assistant.',
      'Respond with exactly: "Connection successful" and nothing else.',
      { max_tokens: 20 }
    );

    if (reply) {
      res.json({ success: true, message: 'Azure OpenAI connected successfully!', reply });
    } else {
      res.json({ success: false, message: 'No response received from Azure OpenAI.' });
    }
  } catch (err) {
    res.json({ success: false, message: 'Connection failed: ' + err.message });
  }
};

function maskString(str) {
  if (!str || str.length < 20) return '***';
  return str.substring(0, 15) + '...' + str.substring(str.length - 10);
}
