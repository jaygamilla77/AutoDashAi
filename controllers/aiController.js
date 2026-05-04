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
 * GET /ai/settings — Show AI settings page (system vs custom workspace endpoint).
 */
exports.settingsPage = (req, res) => {
  const appConfig = require('../config/app');
  const ws = req.workspace || {};
  const provider = ws.aiProvider || 'system';
  const effectiveMode = aiService.getEffectiveMode();

  res.render('ai-settings', {
    title: 'AI Settings',
    aiEnabled: aiService.isAvailable(),
    effectiveMode: effectiveMode,           // 'system' | 'custom' | null
    provider: provider,                      // current saved choice on workspace
    workspace: req.workspace || null,
    query: req.query || {},
    // System credentials (read-only, masked)
    systemConfig: {
      endpoint: appConfig.azureOpenAI.endpoint ? maskString(appConfig.azureOpenAI.endpoint) : '',
      deploymentName: appConfig.azureOpenAI.deploymentName || '',
      apiVersion: appConfig.azureOpenAI.apiVersion || '',
      hasApiKey: !!appConfig.azureOpenAI.apiKey,
    },
    // Workspace's own custom credentials (only non-secret fields shown back)
    customConfig: {
      endpoint: ws.aiEndpoint || '',
      deployment: ws.aiDeployment || '',
      apiVersion: ws.aiApiVersion || '',
      hasApiKey: !!ws.aiApiKey,
    },
  });
};

/**
 * POST /ai/settings — Save the workspace's AI provider choice + custom config.
 *
 * Body:
 *   provider: 'system' | 'custom'
 *   endpoint, deployment, apiVersion: strings (custom only)
 *   apiKey: optional — only updated if a non-empty value is sent. If left
 *           blank when provider='custom' AND a key already exists, the
 *           previous encrypted key is kept.
 */
exports.saveSettings = async (req, res, next) => {
  try {
    const ws = req.workspace;
    if (!ws) return res.redirect('/ai-settings?error=' + encodeURIComponent('No workspace context.'));

    const provider = (req.body.provider === 'custom') ? 'custom' : 'system';
    const secretCipher = require('../utils/secretCipher');

    if (provider === 'system') {
      ws.aiProvider = 'system';
      // Keep custom values on the row so the user can flip back without re-entering,
      // but mark provider as system. (Comment out next 4 lines to wipe instead.)
    } else {
      const endpoint   = String(req.body.endpoint   || '').trim();
      const deployment = String(req.body.deployment || '').trim();
      const apiVersion = String(req.body.apiVersion || '').trim() || '2024-02-15-preview';
      const apiKeyRaw  = String(req.body.apiKey || '').trim();

      if (!endpoint || !deployment) {
        return res.redirect('/ai-settings?error=' + encodeURIComponent('Endpoint and deployment are required for a custom configuration.'));
      }
      if (!apiKeyRaw && !ws.aiApiKey) {
        return res.redirect('/ai-settings?error=' + encodeURIComponent('API key is required the first time you configure a custom endpoint.'));
      }

      ws.aiProvider   = 'custom';
      ws.aiEndpoint   = endpoint;
      ws.aiDeployment = deployment;
      ws.aiApiVersion = apiVersion;
      if (apiKeyRaw) ws.aiApiKey = secretCipher.encrypt(apiKeyRaw);
    }

    await ws.save();
    aiService.invalidateForWorkspace(ws.id);
    return res.redirect('/ai-settings?saved=1');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /ai/test — Test the AI connection.
 *
 * Body (optional): { endpoint, apiKey, deployment, apiVersion } — if all
 * present, tests THOSE credentials without touching the saved workspace.
 * Otherwise tests the workspace's currently effective config.
 */
exports.testConnection = async (req, res) => {
  try {
    const body = req.body || {};
    const wantsCustomTest = body.endpoint && body.deployment && (body.apiKey || body.useStoredKey === '1');

    if (wantsCustomTest) {
      let apiKey = body.apiKey;
      if (!apiKey && body.useStoredKey === '1' && req.workspace && req.workspace.aiApiKey) {
        const secretCipher = require('../utils/secretCipher');
        apiKey = secretCipher.decrypt(req.workspace.aiApiKey);
      }
      const result = await aiService.testCredentials({
        endpoint: body.endpoint,
        apiKey: apiKey,
        deployment: body.deployment,
        apiVersion: body.apiVersion,
      });
      return res.json(result);
    }

    // Default: test currently effective client for this workspace
    if (!aiService.isAvailable()) {
      return res.json({ success: false, message: 'AI is not configured for this workspace.' });
    }
    const reply = await aiService.chat(
      'You are a helpful assistant.',
      'Respond with exactly: "Connection successful" and nothing else.',
      { max_tokens: 20 }
    );
    if (reply) {
      return res.json({
        success: true,
        message: 'Connection successful',
        mode: aiService.getEffectiveMode(),
        reply,
      });
    }
    return res.json({ success: false, message: 'No response received from Azure OpenAI.' });
  } catch (err) {
    console.error('[Test Connection] Error:', err.message);
    res.json({ success: false, message: 'Connection test failed: ' + (err && err.message ? err.message : 'Unknown error') });
  }
};

function maskString(str) {
  if (!str || str.length < 20) return '***';
  return str.substring(0, 15) + '...' + str.substring(str.length - 10);
}
