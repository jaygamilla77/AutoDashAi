/**
 * Schema Profiler Service
 *
 * Analyzes data columns to infer types, detect measures, dates,
 * categories, and identifiers. Builds schema and profile summaries.
 */

/**
 * Profile columns from sample rows.
 * @param {string[]} columns
 * @param {object[]} rows
 * @returns {{ schema: object[], profile: object }}
 */
function profileData(columns, rows) {
  if (!columns || columns.length === 0) {
    return { schema: [], profile: { totalRows: 0, totalColumns: 0, fields: [] } };
  }

  const schema = columns.map((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v != null && v !== '');
    const inferred = inferType(col, values);
    return {
      name: col,
      type: inferred.type,
      role: inferred.role,
      sampleValues: values.slice(0, 5),
      nullCount: rows.length - values.length,
      distinctCount: new Set(values.map(String)).size,
    };
  });

  const profile = {
    totalRows: rows.length,
    totalColumns: columns.length,
    fields: schema,
    measures: schema.filter((s) => s.role === 'measure').map((s) => s.name),
    dimensions: schema.filter((s) => s.role === 'category').map((s) => s.name),
    dateFields: schema.filter((s) => s.role === 'date').map((s) => s.name),
    identifiers: schema.filter((s) => s.role === 'identifier').map((s) => s.name),
  };

  return { schema, profile };
}

/**
 * Infer the data type and role of a column.
 */
function inferType(columnName, values) {
  const name = columnName.toLowerCase();

  // Check for ID/identifier patterns
  if (/^id$|_id$|Id$|\.id$|^pk$|^key$/i.test(columnName)) {
    return { type: 'integer', role: 'identifier' };
  }

  // Check for date patterns — broad match including Week/Month/Year/Period/Start/End
  if (/date|week|month|year|period|quarter|created|updated|time|_at$|At$|timestamp|start|end/i.test(name)) {
    return { type: 'date', role: 'date' };
  }

  // Check for boolean patterns
  if (/^is_|^is[A-Z]|^has_|^has[A-Z]|active|enabled|disabled/i.test(name)) {
    return { type: 'boolean', role: 'category' };
  }

  // Check for email
  if (/email|mail/i.test(name)) {
    return { type: 'string', role: 'identifier' };
  }

  // Analyze values
  if (values.length === 0) {
    return { type: 'string', role: 'category' };
  }

  const numericCount = values.filter((v) => !isNaN(Number(v))).length;
  const numericRatio = numericCount / values.length;

  // Mostly numeric -> measure
  if (numericRatio > 0.8) {
    // Check if it's likely an ID (all integers, many distinct values)
    const allIntegers = values.every((v) => Number.isInteger(Number(v)));
    const distinctRatio = new Set(values.map(String)).size / values.length;
    if (allIntegers && distinctRatio > 0.9 && /id|code|no|number/i.test(name)) {
      return { type: 'integer', role: 'identifier' };
    }

    // Check for known measure names
    if (/score|amount|budget|price|cost|total|hours|salary|rate|count|quantity|revenue|profit/i.test(name)) {
      return { type: 'number', role: 'measure' };
    }

    // Default numeric -> measure
    return { type: 'number', role: 'measure' };
  }

  // Check for date values
  const dateCount = values.filter((v) => !isNaN(Date.parse(v))).length;
  if (dateCount / values.length > 0.7) {
    return { type: 'date', role: 'date' };
  }

  // Check distinct ratio for category vs identifier
  const distinctCount = new Set(values.map(String)).size;
  if (distinctCount <= 20 || distinctCount / values.length < 0.3) {
    return { type: 'string', role: 'category' };
  }

  // Name/title fields
  if (/name|title|label|description/i.test(name)) {
    return { type: 'string', role: 'identifier' };
  }

  return { type: 'string', role: 'category' };
}

module.exports = { profileData, inferType };
