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

module.exports = { parseFile, parseCSV, parseExcel, parseJSON };
