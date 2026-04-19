/**
 * File Parser Service
 *
 * Parses CSV, Excel, and JSON files into normalized tabular structures.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parse: csvParse } = require('csv-parse/sync');
const appConfig = require('../config/app');

/**
 * Parse a file by type and return { columns, rows }
 */
async function parseFile(filePath, sourceType) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  switch (sourceType) {
    case 'csv':
      return parseCSV(filePath);
    case 'excel':
      return parseExcel(filePath);
    case 'json':
      return parseJSON(filePath);
    default:
      throw new Error(`Unsupported file source type: ${sourceType}`);
  }
}

/**
 * Parse CSV file
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (!records || records.length === 0) {
    return { columns: [], rows: [] };
  }

  const columns = Object.keys(records[0]);
  const rows = records.slice(0, appConfig.previewRowLimit);
  return { columns, rows, totalRows: records.length };
}

/**
 * Parse Excel file — reads ALL sheets and returns one dataset per sheet.
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel file contains no sheets.');
  }

  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (!records || records.length === 0) {
      return { sheetName, columns: [], rows: [], totalRows: 0 };
    }

    const columns = Object.keys(records[0]);
    const rows = records.slice(0, appConfig.previewRowLimit);
    return { sheetName, columns, rows, totalRows: records.length };
  });

  return { multiSheet: true, sheets };
}

/**
 * Parse JSON file (expects array of objects or object with array property)
 */
function parseJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON format. Could not parse the file.');
  }

  const { extractArray } = require('../utils/dataFlattener');
  let records = extractArray(data);

  if (!records || !Array.isArray(records) || records.length === 0) {
    throw new Error('JSON file must contain an array of objects for tabular view.');
  }

  // Flatten nested objects
  const { flattenRows } = require('../utils/dataFlattener');
  const flattened = flattenRows(records);

  const columns = [...new Set(flattened.flatMap((r) => Object.keys(r)))];
  const rows = flattened.slice(0, appConfig.previewRowLimit);
  return { columns, rows, totalRows: flattened.length };
}

module.exports = { parseFile, parseCSV, parseExcel, parseJSON, buildUnifiedTable, analyzeSheets };

/**
 * Merge all sheets into one unified table.
 * Adds a `_sheet` column indicating the origin sheet for every row.
 * All columns across all sheets are unioned (missing cols → null).
 */
function buildUnifiedTable(sheets) {
  const nonEmpty = sheets.filter((s) => s.columns && s.columns.length > 0);
  if (nonEmpty.length === 0) return { columns: [], rows: [], totalRows: 0 };

  // Union of all column names (preserve order, _sheet first)
  const allCols = ['_sheet'];
  nonEmpty.forEach((s) => {
    s.columns.forEach((c) => {
      if (!allCols.includes(c)) allCols.push(c);
    });
  });

  const allRows = [];
  nonEmpty.forEach((s) => {
    s.rows.forEach((row) => {
      const unified = { _sheet: s.sheetName };
      allCols.forEach((col) => {
        if (col !== '_sheet') unified[col] = row[col] != null ? row[col] : null;
      });
      allRows.push(unified);
    });
  });

  return { columns: allCols, rows: allRows, totalRows: allRows.length };
}

/**
 * Detect relationships between sheets (shared column names) and
 * generate suggested dashboard prompts based on column names and data types.
 */
function analyzeSheets(sheets, sourceName) {
  const nonEmpty = sheets.filter((s) => s.columns && s.columns.length > 0);

  // --- Relationship detection ---
  const relationships = [];
  for (let i = 0; i < nonEmpty.length; i++) {
    for (let j = i + 1; j < nonEmpty.length; j++) {
      const a = nonEmpty[i];
      const b = nonEmpty[j];
      const shared = a.columns.filter((c) => b.columns.includes(c));
      if (shared.length > 0) {
        relationships.push({
          sheetA: a.sheetName,
          sheetB: b.sheetName,
          sharedColumns: shared,
          type: shared.length >= 2 ? 'strong' : 'possible',
        });
      }
    }
  }

  // --- Prompt suggestion engine ---
  const prompts = [];
  const seen = new Set();

  const addPrompt = (text, category, sheet) => {
    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      prompts.push({ text, category, sheet: sheet || null });
    }
  };

  // Keywords that drive prompt generation
  const NUM_KEYWORDS = /total|amount|count|qty|quantity|revenue|sales|budget|cost|price|profit|score|rating|value|hours|days|rate/i;
  const DATE_KEYWORDS = /date|month|year|week|period|time|quarter|created|updated|start|end/i;
  const CAT_KEYWORDS = /name|type|category|group|status|region|department|team|product|brand|country|city|role/i;
  const ID_KEYWORDS = /^id$|_id$|code$/i;

  nonEmpty.forEach((sheet) => {
    const nums = sheet.columns.filter((c) => NUM_KEYWORDS.test(c));
    const dates = sheet.columns.filter((c) => DATE_KEYWORDS.test(c));
    const cats = sheet.columns.filter((c) => CAT_KEYWORDS.test(c) && !ID_KEYWORDS.test(c));
    const sn = sheet.sheetName;

    // Trend over time
    if (nums.length > 0 && dates.length > 0) {
      addPrompt(`Show ${nums[0]} trend over ${dates[0]} in ${sn}`, 'Trend', sn);
      if (nums.length > 1) {
        addPrompt(`Compare ${nums[0]} vs ${nums[1]} over time in ${sn}`, 'Comparison', sn);
      }
    }

    // Breakdown by category
    if (nums.length > 0 && cats.length > 0) {
      addPrompt(`Total ${nums[0]} by ${cats[0]} in ${sn}`, 'Breakdown', sn);
      if (cats.length > 1) {
        addPrompt(`${nums[0]} breakdown by ${cats[0]} and ${cats[1]} in ${sn}`, 'Breakdown', sn);
      }
    }

    // Top N
    if (nums.length > 0 && cats.length > 0) {
      addPrompt(`Top 10 ${cats[0]} by ${nums[0]} in ${sn}`, 'Ranking', sn);
      addPrompt(`Bottom 5 ${cats[0]} by ${nums[0]} in ${sn}`, 'Ranking', sn);
    }

    // Distribution
    if (cats.length > 0) {
      addPrompt(`Distribution of ${cats[0]} in ${sn}`, 'Distribution', sn);
    }

    // Summary stats
    if (nums.length > 0) {
      addPrompt(`Summary statistics for ${nums[0]} in ${sn}`, 'Summary', sn);
      addPrompt(`Average ${nums[0]} by ${cats[0] || 'category'} in ${sn}`, 'Summary', sn);
    }

    // If multiple numeric cols
    if (nums.length >= 3) {
      addPrompt(`KPI overview of ${sn}: total, average, and max ${nums[0]}`, 'KPI', sn);
    }
  });

  // Cross-sheet prompts based on relationships
  relationships.forEach((rel) => {
    const key = rel.sharedColumns[0];
    addPrompt(
      `Compare ${rel.sheetA} and ${rel.sheetB} data by ${key}`,
      'Cross-Sheet',
      null
    );
    addPrompt(
      `Show combined ${rel.sheetA} and ${rel.sheetB} breakdown by ${key}`,
      'Cross-Sheet',
      null
    );
  });

  // Generic fallbacks
  if (prompts.length < 3) {
    addPrompt(`Show all records from ${sourceName || 'data source'}`, 'General', null);
    addPrompt(`Count of records by category in ${sourceName || 'data'}`, 'General', null);
    addPrompt(`Top values by quantity in ${sourceName || 'data'}`, 'Ranking', null);
  }

  return { relationships, suggestedPrompts: prompts };
}
