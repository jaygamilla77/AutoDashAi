/**
 * AI Service — Azure OpenAI Client
 *
 * Provides a configured Azure OpenAI client and helper methods
 * for chat completions. Falls back gracefully when not configured.
 */

const { AzureOpenAI } = require('openai');
const appConfig = require('../config/app');

let client = null;
let isConfigured = false;

/**
 * Initialize the Azure OpenAI client from environment config.
 */
function init() {
  const { endpoint, apiKey, deploymentName, apiVersion } = appConfig.azureOpenAI;

  if (!endpoint || !apiKey || !deploymentName) {
    console.warn('[AI Service] Azure OpenAI not configured — AI features disabled.');
    isConfigured = false;
    return;
  }

  try {
    client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment: deploymentName,
    });
    isConfigured = true;
    console.log('[AI Service] Azure OpenAI connected — deployment:', deploymentName);
  } catch (err) {
    console.error('[AI Service] Failed to initialize Azure OpenAI:', err.message);
    isConfigured = false;
  }
}

/**
 * Check if the AI service is available.
 */
function isAvailable() {
  return isConfigured && client !== null;
}

/**
 * Send a chat completion request.
 * @param {string} systemPrompt - System message describing the role/task
 * @param {string} userMessage  - User message / prompt
 * @param {object} [options]    - Optional overrides (temperature, max_completion_tokens)
 * @returns {string|null} The assistant's reply text, or null on failure
 */
async function chat(systemPrompt, userMessage, options = {}) {
  if (!isAvailable()) return null;

  try {
    const response = await client.chat.completions.create({
      model: appConfig.azureOpenAI.deploymentName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: options.max_completion_tokens ?? options.max_tokens ?? 1024,
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[AI Service] Chat completion error:', err.message);
    return null;
  }
}

/**
 * Send a chat completion request expecting JSON output.
 * @param {string} systemPrompt - System message
 * @param {string} userMessage  - User message
 * @param {object} [options]    - Optional overrides
 * @returns {object|null} Parsed JSON object, or null on failure
 */
async function chatJSON(systemPrompt, userMessage, options = {}) {
  if (!isAvailable()) return null;

  try {
    const response = await client.chat.completions.create({
      model: appConfig.azureOpenAI.deploymentName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: options.max_completion_tokens ?? options.max_tokens ?? 1024,
      response_format: { type: 'json_object' },
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.error('[AI Service] Chat JSON error:', err.message);
    return null;
  }
}

// Initialize on module load
init();

module.exports = { isAvailable, chat, chatJSON, init };
