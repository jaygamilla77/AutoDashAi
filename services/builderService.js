'use strict';

/**
 * Builder Service
 *
 * Provides schema introspection and manual query execution for the
 * Manual Dashboard Builder. Unlike dashboardService (which uses AI),
 * this accepts explicit table / dimension / measure / aggregation params.
 */

const db = require('../models');
const chartService = require('./chartService');
const { safeJsonParse } = require('../utils/helpers');

// ─── Internal DB schema definition ────────────────────────────────────────────
const INTERNAL_SCHEMA = {
  tables: [
    {
      key: 'employees',
      displayName: 'Employees',
      dbTable: 'employees',
      icon: 'bi-people-fill',
      columns: [
        { key: 'id',           displayName: 'Count (rows)',       dbCol: 'id',           type: 'integer', role: 'measure'   },
        { key: 'fullName',     displayName: 'Full Name',          dbCol: 'fullName',     type: 'string',  role: 'dimension' },
        { key: 'email',        displayName: 'Email',              dbCol: 'email',        type: 'string',  role: 'dimension' },
        { key: 'isActive',     displayName: 'Active Status',      dbCol: 'isActive',     type: 'boolean', role: 'dimension' },
        { key: 'hiredDate',    displayName: 'Hired Date',         dbCol: 'hiredDate',    type: 'date',    role: 'dimension' },
        { key: 'departmentId', displayName: 'Department (ID)',    dbCol: 'departmentId', type: 'integer', role: 'dimension' },
      ],
    },
    {
      key: 'departments',
      displayName: 'Departments',
      dbTable: 'departments',
      icon: 'bi-building',
      columns: [
        { key: 'id',   displayName: 'Count (rows)',       dbCol: 'id',   type: 'integer', role: 'measure'   },
        { key: 'name', displayName: 'Department Name',   dbCol: 'name', type: 'string',  role: 'dimension' },
        { key: 'code', displayName: 'Code',              dbCol: 'code', type: 'string',  role: 'dimension' },
      ],
    },
    {
      key: 'projects',
      displayName: 'Projects',
      dbTable: 'projects',
      icon: 'bi-kanban-fill',
      columns: [
        { key: 'id',           displayName: 'Count (rows)',   dbCol: 'id',           type: 'integer', role: 'measure'   },
        { key: 'name',         displayName: 'Project Name',  dbCol: 'name',         type: 'string',  role: 'dimension' },
        { key: 'code',         displayName: 'Code',          dbCol: 'code',         type: 'string',  role: 'dimension' },
        { key: 'status',       displayName: 'Status',        dbCol: 'status',       type: 'string',  role: 'dimension' },
        { key: 'budget',       displayName: 'Budget',        dbCol: 'budget',       type: 'float',   role: 'measure'   },
        { key: 'startDate',    displayName: 'Start Date',    dbCol: 'startDate',    type: 'date',    role: 'dimension' },
        { key: 'endDate',      displayName: 'End Date',      dbCol: 'endDate',      type: 'date',    role: 'dimension' },
        { key: 'departmentId', displayName: 'Department ID', dbCol: 'departmentId', type: 'integer', role: 'dimension' },
      ],
    },
    {
      key: 'tickets',
      displayName: 'Tickets',
      dbTable: 'tickets',
      icon: 'bi-ticket-detailed-fill',
      columns: [
        { key: 'id',       displayName: 'Count (rows)', dbCol: 'id',       type: 'integer', role: 'measure'   },
        { key: 'title',    displayName: 'Title',        dbCol: 'title',    type: 'string',  role: 'dimension' },
        { key: 'category', displayName: 'Category',     dbCol: 'category', type: 'string',  role: 'dimension' },
        { key: 'priority', displayName: 'Priority',     dbCol: 'priority', type: 'string',  role: 'dimension' },
        { key: 'status',   displayName: 'Status',       dbCol: 'status',   type: 'string',  role: 'dimension' },
      ],
    },
    {
      key: 'productivity_records',
      displayName: 'Productivity Records',
      dbTable: 'productivity_records',
      icon: 'bi-graph-up-arrow',
      columns: [
        { key: 'id',                displayName: 'Count (rows)',        dbCol: 'id',                type: 'integer', role: 'measure'   },
        { key: 'workDate',          displayName: 'Work Date',           dbCol: 'workDate',          type: 'date',    role: 'dimension' },
        { key: 'tasksCompleted',    displayName: 'Tasks Completed',     dbCol: 'tasksCompleted',    type: 'integer', role: 'measure'   },
        { key: 'hoursLogged',       displayName: 'Hours Logged',        dbCol: 'hoursLogged',       type: 'float',   role: 'measure'   },
        { key: 'productivityScore', displayName: 'Productivity Score',  dbCol: 'productivityScore', type: 'float',   role: 'measure'   },
      ],
    },
  ],
  relationships: [
    { from: 'employees',            fromCol: 'departmentId', to: 'departments',          toCol: 'id',         label: 'Employees → Departments'         },
    { from: 'employees',            fromCol: 'id',           to: 'productivity_records', toCol: 'employeeId', label: 'Employees → Productivity Records' },
    { from: 'employees',            fromCol: 'id',           to: 'tickets',              toCol: 'employeeId', label: 'Employees → Tickets'              },
    { from: 'projects',             fromCol: 'departmentId', to: 'departments',          toCol: 'id',         label: 'Projects → Departments'           },
    { from: 'projects',             fromCol: 'id',           to: 'productivity_records', toCol: 'projectId',  label: 'Projects → Productivity Records'  },
    { from: 'projects',             fromCol: 'id',           to: 'tickets',              toCol: 'projectId',  label: 'Projects → Tickets'               },
    { from: 'tickets',              fromCol: 'departmentId', to: 'departments',          toCol: 'id',         label: 'Tickets → Departments'            },
    { from: 'productivity_records', fromCol: 'employeeId',   to: 'employees',            toCol: 'id',         label: 'Productivity → Employees'         },
    { from: 'productivity_records', fromCol: 'projectId',    to: 'projects',             toCol: 'id',         label: 'Productivity → Projects'          },
  ],
};

const ALLOWED_AGGS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const ALLOWED_OPS  = new Set(['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']);

// ─── Schema retrieval ──────────────────────────────────────────────────────────
async function getSchema(sourceId) {
  if (!sourceId) {
    return { source: 'internal', ...INTERNAL_SCHEMA };
  }

  const src = await db.DataSource.findByPk(sourceId);
  if (!src) return { source: 'internal', ...INTERNAL_SCHEMA };

  const schemas = await db.DataSourceSchema.findAll({ where: { dataSourceId: sourceId } });

  // Build a map of datasetName → schemaId for relationship labels
  const nameToKey = {};
  schemas.forEach((s) => { if (s.datasetName) nameToKey[s.datasetName] = String(s.id); });

  const tables = schemas.map((s) => {
    // schemaJson is a direct array: [{name, type, role, ...}, ...]
    const rawCols = safeJsonParse(s.schemaJson) || [];
    const colArray = Array.isArray(rawCols) ? rawCols : (rawCols.columns || rawCols.fields || []);
    const columns = colArray.map((c) => {
      const typeLc = String(c.type || c.dataType || '').toLowerCase();
      const profilerRole = String(c.role || '').toLowerCase();
      // profiler emits: 'measure' | 'category' | 'date' | 'identifier'
      const isNumeric = ['integer', 'float', 'number', 'decimal', 'int', 'double', 'numeric', 'bigint'].includes(typeLc)
        || profilerRole === 'measure';
      const role = isNumeric ? 'measure' : 'dimension';
      return {
        key: c.name,
        displayName: c.name,
        dbCol: c.name,
        type: typeLc || 'string',
        role,
      };
    });
    return {
      key: String(s.id),
      displayName: s.datasetName || `Dataset ${s.id}`,
      dbTable: null,
      icon: 'bi-table',
      previewRows: safeJsonParse(s.previewJson) || [],
      columns,
      schemaId: s.id,
    };
  });

  const analysis = safeJsonParse(src.analysisJson) || {};
  // analysisJson.relationships use {sheetA, sheetB, sharedColumns} format from fileParserService
  const relationships = (analysis.relationships || []).map((r) => {
    if (r.from && r.to) {
      // Legacy format or internal
      return {
        from: String(r.from),
        fromCol: r.fromCol || r.fromKey || '',
        to: String(r.to),
        toCol: r.toCol || r.toKey || '',
        label: r.label || `${r.from} → ${r.to}`,
      };
    }
    // fileParserService format: {sheetA, sheetB, sharedColumns}
    const fromKey = nameToKey[r.sheetA] || r.sheetA || '';
    const toKey   = nameToKey[r.sheetB] || r.sheetB || '';
    const shared  = (r.sharedColumns || [])[0] || '';
    return {
      from: fromKey,
      fromCol: shared,
      to: toKey,
      toCol: shared,
      label: `${r.sheetA || fromKey} ↔ ${r.sheetB || toKey}` + (shared ? ` (${shared})` : ''),
    };
  });

  return {
    source: 'external',
    sourceId,
    sourceName: src.name,
    tables,
    relationships,
  };
}

// ─── Panel builder ─────────────────────────────────────────────────────────────
async function buildPanel({ sourceId, tableKey, joinTableKey, dimension, measure, aggregation, chartType, limit, filters, title }) {
  const schema = await getSchema(sourceId ? parseInt(sourceId, 10) : null);

  const agg = ALLOWED_AGGS.has((aggregation || '').toUpperCase())
    ? aggregation.toUpperCase()
    : 'COUNT';
  const lim  = Math.min(Math.max(parseInt(limit) || 20, 1), 500);
  const type = chartType || 'bar';

  const mainTable = schema.tables.find((t) => t.key === tableKey);
  if (!mainTable) throw new Error(`Table "${tableKey}" not found in schema.`);

  if (!mainTable.dbTable) {
    // External source — in-memory aggregation on previewRows
    return buildExternalPanel({ mainTable, dimension, measure, agg, type, lim, filters, title });
  }

  return buildInternalPanel({ schema, mainTable, joinTableKey, dimension, measure, agg, type, lim, filters, title });
}

// ─── Internal DB query ─────────────────────────────────────────────────────────
async function buildInternalPanel({ schema, mainTable, joinTableKey, dimension, measure, agg, type, lim, filters, title }) {
  // Resolve optional join table + relationship
  let joinTable = null;
  let joinRel   = null;
  if (joinTableKey && joinTableKey !== mainTable.key) {
    joinTable = schema.tables.find((t) => t.key === joinTableKey);
    if (joinTable) {
      joinRel = schema.relationships.find((r) =>
        (r.from === mainTable.key && r.to === joinTableKey) ||
        (r.from === joinTableKey && r.to === mainTable.key)
      );
    }
  }

  // Helper: parse "tableKey.colKey" → { tKey, cKey }
  function parseRef(ref, defaultTKey) {
    const parts = String(ref || '').split('.');
    return parts.length === 2
      ? { tKey: parts[0], cKey: parts[1] }
      : { tKey: defaultTKey, cKey: parts[0] };
  }

  // Pick sensible defaults if nothing supplied
  const defaultDim = mainTable.columns.find((c) => c.role === 'dimension') || mainTable.columns[0];
  const defaultMes = mainTable.columns.find((c) => c.role === 'measure')   || mainTable.columns[0];
  const dimRef = parseRef(dimension || defaultDim.key, mainTable.key);
  const mesRef = parseRef(measure   || defaultMes.key, mainTable.key);

  // Validate table + column references against schema (whitelist only)
  const dimTableInfo = schema.tables.find((t) => t.key === dimRef.tKey);
  const mesTableInfo = schema.tables.find((t) => t.key === mesRef.tKey);
  const dimColInfo   = dimTableInfo && dimTableInfo.columns.find((c) => c.key === dimRef.cKey);
  const mesColInfo   = mesTableInfo && mesTableInfo.columns.find((c) => c.key === mesRef.cKey);
  if (!dimColInfo) throw new Error(`Invalid dimension column: ${dimRef.tKey}.${dimRef.cKey}`);
  if (!mesColInfo) throw new Error(`Invalid measure column: ${mesRef.tKey}.${mesRef.cKey}`);

  // Track which tables are already in the FROM + JOINs
  const involvedTables = new Set([mainTable.key]);

  // Build FROM clause
  let sql = `SELECT "${dimTableInfo.dbTable}"."${dimColInfo.dbCol}" AS label, ${agg}("${mesTableInfo.dbTable}"."${mesColInfo.dbCol}") AS value FROM "${mainTable.dbTable}"`;

  // Primary JOIN (user-selected)
  if (joinTable && joinRel) {
    const [mFk, jPk] = joinRel.from === mainTable.key
      ? [joinRel.fromCol, joinRel.toCol]
      : [joinRel.toCol,   joinRel.fromCol];
    sql += ` LEFT JOIN "${joinTable.dbTable}" ON "${mainTable.dbTable}"."${mFk}" = "${joinTable.dbTable}"."${jPk}"`;
    involvedTables.add(joinTable.key);
  }

  // Auto-join for dim/mes tables not yet joined
  for (const tKey of [dimRef.tKey, mesRef.tKey]) {
    if (involvedTables.has(tKey)) continue;
    const extraTable = schema.tables.find((t) => t.key === tKey);
    const rel = schema.relationships.find((r) =>
      (r.from === mainTable.key && r.to === tKey) ||
      (r.from === tKey && r.to === mainTable.key)
    );
    if (extraTable && rel) {
      const [mFk, ePk] = rel.from === mainTable.key
        ? [rel.fromCol, rel.toCol]
        : [rel.toCol,   rel.fromCol];
      sql += ` LEFT JOIN "${extraTable.dbTable}" ON "${mainTable.dbTable}"."${mFk}" = "${extraTable.dbTable}"."${ePk}"`;
      involvedTables.add(tKey);
    }
  }

  // Filters (parameterised — no user input interpolated directly)
  const replacements = [];
  const conditions   = [];
  if (Array.isArray(filters)) {
    for (const f of filters) {
      if (!f || !f.column || !f.operator || f.value == null) continue;
      const fRef   = parseRef(f.column, mainTable.key);
      const fTable = schema.tables.find((t) => t.key === fRef.tKey);
      const fCol   = fTable && fTable.columns.find((c) => c.key === fRef.cKey);
      if (!fTable || !fCol)               continue; // unknown column — skip
      if (!ALLOWED_OPS.has(f.operator))   continue; // disallowed operator — skip
      if (!involvedTables.has(fRef.tKey)) continue; // table not in query — skip
      conditions.push(`"${fTable.dbTable}"."${fCol.dbCol}" ${f.operator} ?`);
      replacements.push(f.value);
    }
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

  sql += ` GROUP BY "${dimTableInfo.dbTable}"."${dimColInfo.dbCol}" ORDER BY value DESC LIMIT ?`;
  replacements.push(lim);

  const rows = await db.sequelize.query(sql, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
  });

  const labels = rows.map((r) => (r.label != null ? String(r.label) : '(null)'));
  const values = rows.map((r) => parseFloat(r.value) || 0);

  const autoTitle = title || `${agg} of ${mesColInfo.displayName} by ${dimColInfo.displayName}`;
  const effectiveChartType = (type === 'table' || type === 'cards') ? 'bar' : type;
  const chartConfig = (values.length > 0 && type !== 'table' && type !== 'cards')
    ? chartService.buildChartConfig(labels, values, effectiveChartType, autoTitle, null)
    : null;

  const tableData = {
    columns: [dimColInfo.displayName, `${agg}(${mesColInfo.displayName})`],
    rows: rows.map((r) => ({
      [dimColInfo.displayName]: r.label != null ? r.label : '(null)',
      [`${agg}(${mesColInfo.displayName})`]: parseFloat(r.value) || 0,
    })),
  };

  const ds = chartConfig && chartConfig.data && chartConfig.data.datasets && chartConfig.data.datasets[0];
  return {
    title: autoTitle,
    originalPrompt: `Manual: ${agg}(${mesColInfo.displayName}) by ${dimColInfo.displayName}`,
    chartType: type,
    hasData: labels.length > 0,
    chartConfig: type === 'table' ? null : chartConfig,
    labels,
    values,
    bgColors:      ds ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor]) : [],
    borderColors:  ds ? (Array.isArray(ds.borderColor)     ? ds.borderColor     : [ds.borderColor])     : [],
    tableData,
  };
}

// ─── External source (in-memory) ──────────────────────────────────────────────
function buildExternalPanel({ mainTable, dimension, measure, agg, type, lim, filters, title }) {
  const previewRows = mainTable.previewRows || [];

  // Strip "tableKey." prefix if present (UI sends "18.WBSCode" format)
  const stripPrefix = (ref) => {
    if (!ref) return ref;
    const dot = ref.indexOf('.');
    return dot >= 0 ? ref.substring(dot + 1) : ref;
  };

  const dimCol = (type === 'cards') ? null : (stripPrefix(dimension) || (mainTable.columns.find((c) => c.role === 'dimension') || mainTable.columns[0] || {}).key);
  const mesCol = (type === 'cards' && !measure) ? null : (stripPrefix(measure) || (mainTable.columns.find((c) => c.role === 'measure') || mainTable.columns[0] || {}).key);

  // For cards: aggregate ALL columns, each becomes its own card
  if (type === 'cards' && previewRows.length > 0) {
    let rows = previewRows;
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (!f || !f.column || !f.operator || f.value == null) continue;
        if (!ALLOWED_OPS.has(f.operator)) continue;
        const filterCol = stripPrefix(f.column);
        rows = rows.filter((r) => {
          const v = r[filterCol];
          if (v == null) return false;
          const fv = f.value;
          switch (f.operator) {
            case '=':        return String(v) === String(fv);
            case '!=':       return String(v) !== String(fv);
            case '>':        return parseFloat(v) > parseFloat(fv);
            case '<':        return parseFloat(v) < parseFloat(fv);
            case '>=':       return parseFloat(v) >= parseFloat(fv);
            case '<=':       return parseFloat(v) <= parseFloat(fv);
            case 'LIKE':     return String(v).toLowerCase().includes(String(fv).toLowerCase());
            case 'NOT LIKE': return !String(v).toLowerCase().includes(String(fv).toLowerCase());
            default:         return true;
          }
        });
      }
    }

    // If a specific measure was chosen, only aggregate that column
    const colsToAggregate = mesCol
      ? [mainTable.columns.find((c) => c.key === mesCol) || { key: mesCol, displayName: mesCol, type: 'number' }]
      : mainTable.columns;

    const labels = [];
    const values = [];
    for (const col of colsToAggregate) {
      const isNumeric = col.type === 'number' || col.type === 'float' || col.type === 'integer';
      const colVals = rows.map((r) => r[col.key]).filter((v) => v != null);
      let value = 0;
      if (agg === 'COUNT') {
        value = colVals.length;
      } else if (isNumeric || agg === 'SUM' || agg === 'AVG' || agg === 'MIN' || agg === 'MAX') {
        const nums = colVals.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
        if (nums.length === 0) { value = 0; }
        else switch (agg) {
          case 'SUM': value = nums.reduce((a, b) => a + b, 0);               break;
          case 'AVG': value = nums.reduce((a, b) => a + b, 0) / nums.length; break;
          case 'MIN': value = Math.min(...nums);                              break;
          case 'MAX': value = Math.max(...nums);                              break;
          default:    value = colVals.length;
        }
      } else {
        value = colVals.length;
      }
      labels.push(col.displayName || col.key);
      values.push(parseFloat(Number(value).toFixed(4)));
    }

    const autoTitle = title || `${agg} — ${mainTable.displayName || 'All Columns'}`;
    return {
      title: autoTitle,
      originalPrompt: `Manual: ${agg} cards`,
      chartType: type,
      hasData: labels.length > 0,
      chartConfig: null,
      labels,
      values,
      bgColors: labels.map(() => '#3b82f6'),
      borderColors: labels.map(() => '#2563eb'),
      tableData: {
        columns: labels,
        rows: [labels.reduce((obj, l, i) => { obj[l] = values[i]; return obj; }, {})],
      },
    };
  }

  if (previewRows.length === 0 || (!dimCol && type !== 'cards')) {
    return emptyPanel(title || mainTable.displayName, type);
  }

  // Apply filters
  let rows = previewRows;
  if (Array.isArray(filters)) {
    for (const f of filters) {
      if (!f || !f.column || !f.operator || f.value == null) continue;
      if (!ALLOWED_OPS.has(f.operator)) continue;
      const filterCol = stripPrefix(f.column);
      rows = rows.filter((r) => {
        const v = r[filterCol];
        if (v == null) return false;
        const fv = f.value;
        switch (f.operator) {
          case '=':        return String(v) === String(fv);
          case '!=':       return String(v) !== String(fv);
          case '>':        return parseFloat(v) > parseFloat(fv);
          case '<':        return parseFloat(v) < parseFloat(fv);
          case '>=':       return parseFloat(v) >= parseFloat(fv);
          case '<=':       return parseFloat(v) <= parseFloat(fv);
          case 'LIKE':     return String(v).toLowerCase().includes(String(fv).toLowerCase());
          case 'NOT LIKE': return !String(v).toLowerCase().includes(String(fv).toLowerCase());
          default:         return true;
        }
      });
    }
  }

  // Group and aggregate
  const grouped = {};
  rows.forEach((row) => {
    const key = row[dimCol] != null ? String(row[dimCol]) : '(null)';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(parseFloat(row[mesCol]) || 0);
  });

  let pairs = Object.entries(grouped).map(([label, vals]) => {
    let value = 0;
    switch (agg) {
      case 'COUNT': value = vals.length;                                              break;
      case 'SUM':   value = vals.reduce((a, b) => a + b, 0);                         break;
      case 'AVG':   value = vals.reduce((a, b) => a + b, 0) / vals.length;           break;
      case 'MIN':   value = Math.min(...vals);                                        break;
      case 'MAX':   value = Math.max(...vals);                                        break;
      default:      value = vals.length;
    }
    return { label, value };
  });
  pairs.sort((a, b) => b.value - a.value);
  pairs = pairs.slice(0, lim);

  const labels = pairs.map((p) => p.label);
  const values = pairs.map((p) => parseFloat(p.value.toFixed(4)));
  const autoTitle = title || `${agg} of ${mesCol} by ${dimCol}`;
  const effectiveChartType = (type === 'table' || type === 'cards') ? 'bar' : type;
  const chartConfig = (values.length > 0 && type !== 'table' && type !== 'cards')
    ? chartService.buildChartConfig(labels, values, effectiveChartType, autoTitle, null)
    : null;

  const ds = chartConfig && chartConfig.data && chartConfig.data.datasets && chartConfig.data.datasets[0];
  return {
    title: autoTitle,
    originalPrompt: `Manual: ${agg}(${mesCol}) by ${dimCol}`,
    chartType: type,
    hasData: labels.length > 0,
    chartConfig: type === 'table' ? null : chartConfig,
    labels,
    values,
    bgColors:     ds ? (Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [ds.backgroundColor]) : [],
    borderColors: ds ? (Array.isArray(ds.borderColor)     ? ds.borderColor     : [ds.borderColor])     : [],
    tableData: {
      columns: [dimCol, `${agg}(${mesCol})`],
      rows: pairs.map((p) => ({ [dimCol]: p.label, [`${agg}(${mesCol})`]: p.value })),
    },
  };
}

function emptyPanel(title, type) {
  return {
    title,
    originalPrompt: 'Manual: no data',
    chartType: type,
    hasData: false,
    chartConfig: null,
    labels: [],
    values: [],
    bgColors: [],
    borderColors: [],
    tableData: { columns: [], rows: [] },
  };
}

module.exports = { getSchema, buildPanel, INTERNAL_SCHEMA };
