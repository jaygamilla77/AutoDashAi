/**
 * Flatten nested JSON objects into a flat key-value structure.
 * Supports arrays of objects and nested objects at a single level for V1.
 */

/**
 * Flatten a single object's nested keys.
 * { a: { b: 1, c: 2 }, d: 3 } -> { "a.b": 1, "a.c": 2, d: 3 }
 */
function flattenObject(obj, prefix = '', result = {}) {
  if (obj == null || typeof obj !== 'object') {
    result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    result[prefix] = JSON.stringify(obj);
    return result;
  }
  for (const key of Object.keys(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      flattenObject(val, newKey, result);
    } else if (Array.isArray(val)) {
      // Store array as JSON string for V1
      result[newKey] = JSON.stringify(val);
    } else {
      result[newKey] = val;
    }
  }
  return result;
}

/**
 * Flatten an array of objects into tabular rows.
 */
function flattenRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((item) => flattenObject(item));
}

/**
 * Extract data array from a JSON payload.
 * If the payload is already an array, use it.
 * If it's an object, look for the first array-like property.
 */
function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    // Look for first key that contains an array
    for (const key of Object.keys(payload)) {
      if (Array.isArray(payload[key]) && payload[key].length > 0) {
        return payload[key];
      }
    }
  }
  return null;
}

module.exports = {
  flattenObject,
  flattenRows,
  extractArray,
};
