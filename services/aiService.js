/**
 * AI Service — Azure OpenAI Client (workspace-aware)
 *
 * Picks credentials per request:
 *   - If the active workspace has aiProvider='custom' AND has a complete
 *     custom config, builds (and caches) a dedicated AzureOpenAI client.
 *     This gives that workspace a private, dedicated endpoint for better
 *     privacy and processing speed (no shared queue with other tenants).
 *   - Otherwise falls back to the system / shared client built from
 *     env vars (AZURE_OPENAI_*).
 *
 * Existing call sites (chat / chatJSON) keep the same signature.
 */

const { AzureOpenAI } = require('openai');
const appConfig = require('../config/app');
const tenantCtx = require('../utils/tenantContext');
const secretCipher = require('../utils/secretCipher');

let systemClient = null;
let systemConfigured = false;

// Per-workspace client cache keyed by workspace.id.
const workspaceClients = new Map();

/* ───────────────────────── System (env) ───────────────────────── */

function initSystem() {
  const { endpoint, apiKey, deploymentName, apiVersion } = appConfig.azureOpenAI;
  if (!endpoint || !apiKey || !deploymentName) {
    console.warn('[AI Service] System Azure OpenAI not configured — system AI features disabled.');
    systemConfigured = false;
    systemClient = null;
    return;
  }
  try {
    systemClient = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment: deploymentName,
    });
    systemConfigured = true;
    console.log('[AI Service] System Azure OpenAI connected — deployment:', deploymentName);
  } catch (err) {
    console.error('[AI Service] System init failed:', err.message);
    systemConfigured = false;
    systemClient = null;
  }
}

/* ───────────────────── Workspace-custom client ───────────────────── */

function buildWorkspaceClient(ws) {
  if (!ws || ws.aiProvider !== 'custom') return null;
  const endpoint   = ws.aiEndpoint;
  const deployment = ws.aiDeployment;
  const apiVersion = ws.aiApiVersion || '2024-02-15-preview';
  const apiKey     = secretCipher.decrypt(ws.aiApiKey);
  if (!endpoint || !apiKey || !deployment) return null;
  try {
    return {
      client: new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment }),
      deployment,
      mode: 'custom',
    };
  } catch (err) {
    console.error('[AI Service] Workspace client build failed for ws', ws.id, err.message);
    return null;
  }
}

function getWorkspaceClient(ws) {
  if (!ws || ws.aiProvider !== 'custom') return null;
  const fp = [ws.aiEndpoint, ws.aiDeployment, ws.aiApiVersion, (ws.aiApiKey || '').slice(0, 24)].join('|');
  const cached = workspaceClients.get(ws.id);
  if (cached && cached.fp === fp) return cached.entry;
  const entry = buildWorkspaceClient(ws);
  if (entry) workspaceClients.set(ws.id, { fp, entry });
  else workspaceClients.delete(ws.id);
  return entry;
}

function invalidateForWorkspace(workspaceId) {
  if (workspaceId != null) workspaceClients.delete(workspaceId);
}

/* ───────────────────── Effective resolver ───────────────────── */

function resolveClient(explicitWorkspace) {
  const ws = explicitWorkspace || (tenantCtx.get() && tenantCtx.get().workspace) || null;
  if (ws && ws.aiProvider === 'custom') {
    const entry = getWorkspaceClient(ws);
    if (entry) return entry;
    // Custom configured but invalid — do NOT silently fall back to system.
    return null;
  }
  if (systemConfigured && systemClient) {
    return { client: systemClient, deployment: appConfig.azureOpenAI.deploymentName, mode: 'system' };
  }
  return null;
}

/* ───────────────────────── Public API ───────────────────────── */

function isAvailable(explicitWorkspace) {
  return !!resolveClient(explicitWorkspace);
}

function getEffectiveMode(explicitWorkspace) {
  const r = resolveClient(explicitWorkspace);
  return r ? r.mode : null;
}

async function chat(systemPrompt, userMessage, options = {}) {
  const r = resolveClient(options.workspace);
  if (!r) return null;
  try {
    // Wrap with timeout (30s default) to prevent Passenger worker starvation
    const timeoutMs = options.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await r.client.chat.completions.create({
        model: r.deployment,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: options.max_completion_tokens ?? options.max_tokens ?? 1024,
      }, {
        signal: controller.signal,
        timeout: timeoutMs,
      });
      clearTimeout(timeoutId);
      return response.choices?.[0]?.message?.content?.trim() || null;
    } catch (timeoutErr) {
      clearTimeout(timeoutId);
      if (timeoutErr.name === 'AbortError' || timeoutErr.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
        console.error('[AI Service] chat timeout after', timeoutMs, 'ms');
        return null;
      }
      throw timeoutErr;
    }
  } catch (err) {
    console.error('[AI Service] chat error (', r.mode, '):', err.message);
    return null;
  }
}

async function chatJSON(systemPrompt, userMessage, options = {}) {
  const r = resolveClient(options.workspace);
  if (!r) return null;
  try {
    // Wrap with timeout (30s default) to prevent Passenger worker starvation
    const timeoutMs = options.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await r.client.chat.completions.create({
        model: r.deployment,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: options.max_completion_tokens ?? options.max_tokens ?? 1024,
        response_format: { type: 'json_object' },
      }, {
        signal: controller.signal,
        timeout: timeoutMs,
      });
      clearTimeout(timeoutId);
      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) return null;
      return JSON.parse(text);
    } catch (timeoutErr) {
      clearTimeout(timeoutId);
      if (timeoutErr.name === 'AbortError' || timeoutErr.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
        console.error('[AI Service] chatJSON timeout after', timeoutMs, 'ms');
        return null;
      }
      throw timeoutErr;
    }
  } catch (err) {
    console.error('[AI Service] chatJSON error (', r.mode, '):', err.message);
    return null;
  }
}

/**
 * Test arbitrary credentials WITHOUT persisting them.
 */
async function testCredentials({ endpoint, apiKey, deployment, apiVersion }) {
  if (!endpoint || !apiKey || !deployment) {
    return { success: false, message: 'Endpoint, API key and deployment are all required.' };
  }
  try {
    const c = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: apiVersion || '2024-02-15-preview',
      deployment,
    });
    // Timeout after 20s to prevent hanging the test endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    
    try {
      const resp = await c.chat.completions.create({
        model: deployment,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Reply with exactly: "Connection successful"' },
        ],
        max_completion_tokens: 20,
      }, {
        signal: controller.signal,
        timeout: 20000,
      });
      clearTimeout(timeoutId);
      const reply = resp.choices?.[0]?.message?.content?.trim();
      if (reply) return { success: true, message: 'Connection successful', reply };
      return { success: false, message: 'No response received from Azure OpenAI.' };
    } catch (timeoutErr) {
      clearTimeout(timeoutId);
      if (timeoutErr.name === 'AbortError' || timeoutErr.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
        return { success: false, message: 'Connection test timed out after 20s. The endpoint may be offline or overloaded.' };
      }
      throw timeoutErr;
    }
  } catch (err) {
    return { success: false, message: 'Connection failed: ' + err.message };
  }
}

initSystem();

module.exports = {
  isAvailable,
  getEffectiveMode,
  chat,
  chatJSON,
  init: initSystem,
  testCredentials,
  invalidateForWorkspace,
};
