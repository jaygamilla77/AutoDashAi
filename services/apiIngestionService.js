/**
 * API Ingestion Service
 *
 * Fetches data from external REST APIs and normalizes the response.
 */

const axios = require('axios');
const { extractArray, flattenRows } = require('../utils/dataFlattener');
const appConfig = require('../config/app');

/**
 * Fetch data from an API source config.
 * @param {object} config - { url, headers, params, method }
 * @returns {{ columns, rows, totalRows }}
 */
async function fetchAndParse(config) {
  if (!config || !config.url) {
    throw new Error('API URL is required.');
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(config.url);
  } catch {
    throw new Error('Invalid API URL format.');
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS protocols are supported.');
  }

  const response = await axios({
    method: (config.method || 'GET').toUpperCase(),
    url: config.url,
    headers: config.headers || {},
    params: config.params || {},
    timeout: 15000,
    maxContentLength: 10 * 1024 * 1024,
  });

  const data = response.data;
  if (!data) {
    throw new Error('API returned empty response.');
  }

  let records = extractArray(data);
  if (!records || records.length === 0) {
    throw new Error('API response does not contain a recognizable array of objects.');
  }

  const flattened = flattenRows(records);
  const columns = [...new Set(flattened.flatMap((r) => Object.keys(r)))];
  const rows = flattened.slice(0, appConfig.previewRowLimit);

  return { columns, rows, totalRows: flattened.length };
}

module.exports = { fetchAndParse };
