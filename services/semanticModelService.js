/**
 * Semantic Model Service
 *
 * A semantic model is the business-friendly metadata layer between a raw
 * data source and the LLM/parser. It is auto-built once on ingest from the
 * column profile, can be hand-edited via the UI, and is loaded by the
 * prompt parser so the LLM speaks in business language.
 *
 * Shape (stored as DataSource.semanticModelJson):
 * {
 *   version: 1,
 *   dataSourceId: number,
 *   generatedAt: ISO string,
 *   editedAt: ISO string | null,
 *   tables: [{
 *     name, displayName, role: 'fact'|'dimension'|'mixed', grain, description,
 *     columns: [{
 *       name, displayName, dataType, role: 'measure'|'dimension'|'time'|'identifier',
 *       unit: '$'|'%'|'count'|'days'|null,
 *       defaultAggregation: 'sum'|'avg'|'count'|'max'|'min'|'distinct'|null,
 *       synonyms: string[],
 *       sampleValues: any[],
 *       cardinality: number,
 *       nullRatio: number,
 *       description: string
 *     }]
 *   }],
 *   relationships: [{ from, to, fromColumn, toColumn, type }],
 *   facts: { rowCount, qualityScore }
 * }
 */

'use strict';

const { DataSource } = require('../models');

// ─── Heuristic helpers ─────────────────────────────────────────────────────
const MEASURE_HINTS = [
  'amount', 'amt', 'total', 'qty', 'quantity', 'count', 'sum',
  'revenue', 'sales', 'cost', 'price', 'profit', 'margin', 'value',
  'score', 'rate', 'pct', 'percent', 'percentage', 'days', 'hours',
  'duration', 'budget', 'spend', 'paid', 'due', 'balance',
];
const TIME_HINTS = [
  'date', 'day', 'month', 'year', 'qtr', 'quarter', 'week',
  'created', 'updated', 'closed', 'opened', 'resolved', 'started', 'ended',
  'time', 'timestamp', '_at', '_on',
];
const ID_HINTS = ['id', '_id', 'uuid', 'guid', 'code', 'key'];
const CURRENCY_HINTS = ['amount', 'amt', 'cost', 'price', 'revenue', 'sales', 'profit', 'budget', 'spend', 'paid', 'due', 'balance', 'value'];
const PCT_HINTS = ['pct', 'percent', 'percentage', 'rate', 'ratio'];
const COUNT_HINTS = ['count', 'qty', 'quantity', 'num', 'number'];

function hint(name, list) {
  const n = String(name || '').toLowerCase();
  return list.some(h => n.includes(h));
}
function humanize(name) {
  return String(name || '')
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}
function inferColumnRole(name, dataType) {
  const n = String(name || '').toLowerCase();
  if (hint(n, ID_HINTS) && (n === 'id' || n.endsWith('_id') || n.endsWith('id'))) return 'identifier';
  if (hint(n, TIME_HINTS) || dataType === 'date') return 'time';
  if (dataType === 'number' || hint(n, MEASURE_HINTS)) return 'measure';
  return 'dimension';
}
function inferUnit(name) {
  const n = String(name || '').toLowerCase();
  if (hint(n, CURRENCY_HINTS)) return '$';
  if (hint(n, PCT_HINTS))      return '%';
  if (hint(n, COUNT_HINTS))    return 'count';
  if (/(days|hours|minutes|seconds)/.test(n)) return n.match(/(days|hours|minutes|seconds)/)[1];
  return null;
}
function inferDefaultAgg(role, name) {
  if (role !== 'measure') return null;
  const n = String(name || '').toLowerCase();
  if (hint(n, PCT_HINTS) || /(rate|ratio|score|avg|average|mean)/.test(n)) return 'avg';
  if (hint(n, COUNT_HINTS)) return 'sum';
  return 'sum';
}
function inferSynonyms(name, role) {
  const n = String(name || '').toLowerCase();
  const out = new Set();
  // Common alias map
  const aliases = {
    revenue: ['sales', 'income', 'earnings'],
    sales:   ['revenue', 'turnover'],
    cost:    ['expense', 'spend', 'spending'],
    profit:  ['margin', 'earnings'],
    customer:['client', 'account'],
    employee:['staff', 'headcount', 'fte'],
    ticket:  ['issue', 'incident', 'case'],
    project: ['initiative', 'engagement'],
    department: ['team', 'unit', 'division'],
    qty:     ['quantity', 'count', 'volume'],
    amount:  ['value', 'total'],
  };
  Object.keys(aliases).forEach(k => { if (n.includes(k)) aliases[k].forEach(a => out.add(a)); });
  if (role === 'time') ['date', 'period', 'when'].forEach(a => out.add(a));
  return Array.from(out).slice(0, 6);
}

// ─── Builder ────────────────────────────────────────────────────────────────
/**
 * Build a semantic model from a single-table profile (the shape returned by
 * dataAnalysisService.analyzeDataQuality).
 *
 * @param {object} profile  - { columns, columnAnalysis, totalRows, qualityScore, measures, dimensions, ... }
 * @param {object} ctx      - { dataSourceId, sourceName }
 * @returns {object} semantic model
 */
function buildFromProfile(profile, ctx = {}) {
  if (!profile) {
    return _emptyModel(ctx);
  }

  // Adapter: schemaProfilerService returns { fields:[{name,type,role,sampleValues,nullCount,distinctCount}], totalRows, ... }
  // dataAnalysisService returns         { columns:[name], columnAnalysis:{name:{type,nullCount,uniqueValues,sampleValues}}, totalRows, ... }
  let unifiedFields = [];
  let totalRows = profile.totalRows || 0;

  if (Array.isArray(profile.fields) && profile.fields.length) {
    unifiedFields = profile.fields.map(f => ({
      name: f.name,
      dataType: _normaliseType(f.type),
      sampleValues: Array.isArray(f.sampleValues) ? f.sampleValues : [],
      uniqueValues: f.distinctCount || 0,
      nullCount: f.nullCount || 0,
      schemaRole: f.role, // 'measure'|'category'|'date'|'identifier'
    }));
  } else if (Array.isArray(profile.columns)) {
    unifiedFields = profile.columns.map(name => {
      const ca = (profile.columnAnalysis && profile.columnAnalysis[name]) || {};
      return {
        name,
        dataType: _normaliseType(ca.type),
        sampleValues: Array.isArray(ca.sampleValues) ? ca.sampleValues : [],
        uniqueValues: ca.uniqueValues || 0,
        nullCount: ca.nullCount || 0,
        schemaRole: null,
      };
    });
  } else {
    return _emptyModel(ctx);
  }

  const cols = unifiedFields.map(f => {
    let role;
    if      (f.schemaRole === 'measure')    role = 'measure';
    else if (f.schemaRole === 'date')       role = 'time';
    else if (f.schemaRole === 'identifier') role = 'identifier';
    else if (f.schemaRole === 'category')   role = 'dimension';
    else                                    role = inferColumnRole(f.name, f.dataType);

    const unit = role === 'measure' ? inferUnit(f.name) : null;
    const defaultAggregation = inferDefaultAgg(role, f.name);
    const nullRatio = totalRows ? Number(((f.nullCount || 0) / totalRows).toFixed(3)) : 0;
    return {
      name: f.name,
      displayName: humanize(f.name),
      dataType: f.dataType,
      role,
      unit,
      defaultAggregation,
      synonyms: inferSynonyms(f.name, role),
      sampleValues: f.sampleValues.slice(0, 5),
      cardinality: f.uniqueValues || 0,
      nullRatio,
      description: '',
    };
  });

  const measureCount   = cols.filter(c => c.role === 'measure').length;
  const dimensionCount = cols.filter(c => c.role !== 'measure').length;
  const tableRole = measureCount && dimensionCount
    ? 'mixed'
    : (measureCount ? 'fact' : 'dimension');

  const timeCol = cols.find(c => c.role === 'time');
  const grain = timeCol ? timeCol.displayName : 'row';

  const tableName = (ctx.sourceName || 'data').replace(/\.[^.]+$/, '');
  return {
    version: 1,
    dataSourceId: ctx.dataSourceId || null,
    generatedAt: new Date().toISOString(),
    editedAt: null,
    tables: [{
      name: tableName,
      displayName: humanize(tableName),
      role: tableRole,
      grain,
      description: '',
      columns: cols,
    }],
    relationships: [],
    facts: {
      rowCount:     totalRows,
      qualityScore: Number(profile.qualityScore) || 0,
    },
  };
}

function _normaliseType(t) {
  if (!t) return 'unknown';
  const s = String(t).toLowerCase();
  if (s.includes('int'))    return 'integer';
  if (s.includes('num') || s.includes('float') || s.includes('decimal')) return 'number';
  if (s.includes('date') || s.includes('time')) return 'date';
  if (s.includes('bool')) return 'boolean';
  return 'string';
}

function _emptyModel(ctx) {
  return {
    version: 1,
    dataSourceId: ctx.dataSourceId || null,
    generatedAt: new Date().toISOString(),
    editedAt: null,
    tables: [],
    relationships: [],
    facts: { rowCount: 0, qualityScore: 0 },
  };
}

// ─── Persistence ───────────────────────────────────────────────────────────
async function getById(dataSourceId) {
  const ds = await DataSource.findByPk(dataSourceId);
  if (!ds || !ds.semanticModelJson) return null;
  try { return JSON.parse(ds.semanticModelJson); }
  catch (e) { return null; }
}

async function save(dataSourceId, model) {
  const safe = { ...(model || {}), dataSourceId, editedAt: new Date().toISOString() };
  await DataSource.update(
    { semanticModelJson: JSON.stringify(safe) },
    { where: { id: dataSourceId } }
  );
  return safe;
}

async function ensureForSource(dataSourceId, profile, ctx = {}) {
  // If a model already exists, leave hand-edits intact.
  const existing = await getById(dataSourceId);
  if (existing) return existing;
  const model = buildFromProfile(profile, { ...ctx, dataSourceId });
  await DataSource.update(
    { semanticModelJson: JSON.stringify(model) },
    { where: { id: dataSourceId } }
  );
  return model;
}

// ─── Prompt-side helpers ────────────────────────────────────────────────────
/**
 * Convert the model into a compact bullet list the LLM can use as a glossary.
 */
function toPromptContext(model) {
  if (!model || !Array.isArray(model.tables) || !model.tables.length) return '';
  const lines = [];
  lines.push('SEMANTIC MODEL (use these business terms when interpreting prompts):');
  model.tables.forEach(t => {
    lines.push(`Table "${t.name}" (${t.role}, grain=${t.grain || 'row'}):`);
    (t.columns || []).forEach(c => {
      const parts = [`  - ${c.name}`];
      if (c.displayName && c.displayName !== c.name) parts.push(`("${c.displayName}")`);
      parts.push(`role=${c.role}`);
      if (c.dataType)            parts.push(`type=${c.dataType}`);
      if (c.unit)                parts.push(`unit=${c.unit}`);
      if (c.defaultAggregation)  parts.push(`agg=${c.defaultAggregation}`);
      if (c.synonyms && c.synonyms.length) parts.push(`aka=[${c.synonyms.join(', ')}]`);
      lines.push(parts.join(' '));
    });
  });
  return lines.join('\n');
}

/**
 * Find a column by name, displayName, or synonym (case-insensitive).
 */
function resolveColumn(model, term) {
  if (!model || !term) return null;
  const t = String(term).toLowerCase().replace(/\s+/g, '');
  for (const tbl of model.tables || []) {
    for (const c of tbl.columns || []) {
      const candidates = [c.name, c.displayName, ...(c.synonyms || [])];
      if (candidates.some(x => String(x || '').toLowerCase().replace(/\s+/g, '') === t)) {
        return { table: tbl.name, column: c };
      }
    }
  }
  return null;
}

module.exports = {
  buildFromProfile,
  ensureForSource,
  getById,
  save,
  toPromptContext,
  resolveColumn,
};
