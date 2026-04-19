/**
 * General utility helpers
 */

/**
 * Safely parse JSON, return null on failure
 */
function safeJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Format a number for display (e.g. 12345 -> "12,345")
 */
function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Truncate a string to maxLen and append '...'
 */
function truncate(str, maxLen = 80) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/**
 * Pick first N items from array
 */
function take(arr, n) {
  return (arr || []).slice(0, n);
}

/**
 * Get distinct values from an array of objects for a given key
 */
function distinctValues(rows, key) {
  const set = new Set();
  for (const row of rows) {
    if (row[key] != null) set.add(row[key]);
  }
  return [...set];
}

/**
 * Group rows by a key, returning { [keyVal]: [rows] }
 */
function groupBy(rows, key) {
  const groups = {};
  for (const row of rows) {
    const k = row[key] != null ? String(row[key]) : 'Unknown';
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  }
  return groups;
}

/**
 * Aggregate array values
 */
function aggregate(values, metric) {
  const nums = values.map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return 0;
  switch (metric) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    case 'count': return nums.length;
    default: return nums.length;
  }
}

/**
 * Sanitize string for safe display (strip HTML)
 */
function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, (c) => {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

module.exports = {
  safeJsonParse,
  formatNumber,
  truncate,
  take,
  distinctValues,
  groupBy,
  aggregate,
  sanitize,
};
