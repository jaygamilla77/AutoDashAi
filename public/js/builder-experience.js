/**
 * Builder Experience — additive enhancements for the AI Builder.
 * --------------------------------------------------------------
 * NO standalone side panel. Everything lives inside the existing
 * right-side Properties panel (Data tab).
 *
 * This module:
 *   1. Loads & caches table schemas from /dashboard/schema.
 *   2. Replaces window.aiPropRenderData with a richer, dropdown-driven
 *      Data tab (sections: Data Source, Fields, Current Calculation,
 *      Current Result, Validation) — single source of truth.
 *   3. Patches aiPropMarkDirty for debounced live preview.
 *
 * The original aiPropApply / showPanelProperties / state object
 * remain authoritative — we only override aiPropRenderData and
 * wrap aiPropMarkDirty.
 */
(function () {
  'use strict';

  // ─── Tiny utils ───────────────────────────────────────────────
  function $(s, r) { return (r || document).querySelector(s); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtNumber(n) {
    if (n == null || n === '') return '-';
    var num = Number(n);
    if (!isFinite(num)) return String(n);
    if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(num) >= 1e3) return num.toLocaleString();
    return num.toLocaleString();
  }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, c = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms);
    };
  }

  // ─── Field role inference ─────────────────────────────────────
  function inferRole(col) {
    if (!col) return 'dimension';
    var role = (col.role || '').toLowerCase();
    if (role === 'measure' || role === 'dimension' || role === 'date') return role;
    var t = (col.type || '').toLowerCase();
    if (t === 'date' || t === 'datetime' || t === 'timestamp') return 'date';
    if (t === 'integer' || t === 'float' || t === 'number' || t === 'decimal' || t === 'numeric' || t === 'bigint') return 'measure';
    if (t === 'boolean' || t === 'bool') return 'boolean';
    return 'dimension';
  }
  function roleIcon(role) {
    switch (role) {
      case 'measure':  return { icon: 'bi-123',         color: '#0EA5E9', bg: '#E0F2FE', label: 'number' };
      case 'date':     return { icon: 'bi-calendar3',   color: '#7C3AED', bg: '#F3E8FF', label: 'date' };
      case 'boolean':  return { icon: 'bi-toggle-on',   color: '#F59E0B', bg: '#FEF3C7', label: 'bool' };
      default:         return { icon: 'bi-type',        color: '#10B981', bg: '#D1FAE5', label: 'text' };
    }
  }

  // ─── Schema cache ─────────────────────────────────────────────
  var _schemaCache = {};       // { sourceKey: schema }
  var _schemaPending = {};     // { sourceKey: Promise }

  function sourceKey(id) { return id || '_internal'; }

  function fetchSchema(sourceId) {
    var key = sourceKey(sourceId);
    if (_schemaCache[key]) return Promise.resolve(_schemaCache[key]);
    if (_schemaPending[key]) return _schemaPending[key];
    var url = '/dashboard/schema' + (sourceId ? '?sourceId=' + encodeURIComponent(sourceId) : '');
    var p = fetch(url).then(function (r) { return r.json(); }).then(function (s) {
      var n = normaliseSchema(s);
      _schemaCache[key] = n;
      delete _schemaPending[key];
      return n;
    }).catch(function () {
      _schemaCache[key] = {};
      delete _schemaPending[key];
      return {};
    });
    _schemaPending[key] = p;
    return p;
  }

  function normaliseSchema(s) {
    var out = {};
    if (!s) return out;
    if (Array.isArray(s)) {
      s.forEach(function (t) { if (t && (t.key || t.name)) out[t.key || t.name] = t; });
      return out;
    }
    if (typeof s === 'object') {
      Object.keys(s).forEach(function (k) {
        var t = s[k];
        if (Array.isArray(t)) out[k] = { displayName: k, columns: t };
        else if (t && t.columns) out[k] = t;
        else if (t && typeof t === 'object') {
          var cols = Object.keys(t).map(function (cKey) {
            var c = t[cKey] || {};
            return { key: cKey, displayName: c.displayName || cKey, type: c.type || 'string', role: c.role };
          });
          out[k] = { displayName: k, columns: cols };
        }
      });
    }
    return out;
  }

  function getCachedSchema(sourceId) { return _schemaCache[sourceKey(sourceId)] || null; }
  function getColumns(sourceId, tableKey) {
    var s = getCachedSchema(sourceId);
    if (!s || !tableKey) return [];
    var t = s[tableKey];
    if (!t) {
      // try case-insensitive
      var lk = String(tableKey).toLowerCase();
      var found = Object.keys(s).filter(function (k) { return k.toLowerCase() === lk; })[0];
      if (found) t = s[found];
    }
    return (t && t.columns) || [];
  }

  /** Best-guess pick of the active table for a structuredRequest. */
  function resolveTable(sourceId, sr) {
    var schema = getCachedSchema(sourceId);
    if (!schema) return '';
    var tables = Object.keys(schema);
    if (!tables.length) return '';
    var focus = (sr && sr.focusArea) ? String(sr.focusArea).trim() : '';
    if (focus) {
      // exact
      if (schema[focus]) return focus;
      var lf = focus.toLowerCase();
      var match = tables.filter(function (t) { return t.toLowerCase() === lf || (schema[t].displayName || '').toLowerCase() === lf; })[0];
      if (match) return match;
    }
    // Heuristic: first table that contains all referenced columns
    var refs = [].concat(sr && sr.dimensions || [], sr && sr.metrics || []).map(String).filter(Boolean);
    if (refs.length) {
      var candidates = tables.filter(function (t) {
        var cols = (schema[t].columns || []).map(function (c) { return (c.key || c.dbCol || c.name); });
        return refs.every(function (r) { return cols.indexOf(r) !== -1; });
      });
      if (candidates.length) return candidates[0];
    }
    return tables[0];
  }

  // ─── Calculation formula + result helpers ─────────────────────
  function buildFormula(panel, sr, tableName) {
    var agg = ((sr && sr.aggregation) || (panel && panel.chartType === 'kpi' ? 'count' : 'sum')).toLowerCase();
    var aggLabel = agg.charAt(0).toUpperCase() + agg.slice(1);
    var metric = (sr && sr.metrics && sr.metrics[0]) || '';
    var dim = (sr && sr.dimensions && sr.dimensions[0]) || '';
    var t = tableName || (sr && sr.focusArea) || '';
    var qualMetric = metric ? (t ? t + '.' + metric : metric) : '*';
    var qualDim = dim ? (t ? t + '.' + dim : dim) : '';
    var formula = aggLabel + '(' + qualMetric + ')';
    if (qualDim) formula += ' grouped by ' + qualDim;
    return formula;
  }

  function buildResultPreview(panel) {
    if (!panel) return '<div style="color:#9ca3af;font-size:0.7rem;font-style:italic">No result yet — apply changes to compute.</div>';
    if (panel.chartType === 'kpi' || (panel.values && panel.values.length === 1 && (!panel.labels || panel.labels.length <= 1))) {
      var v = (panel.values && panel.values[0]) != null ? panel.values[0] : (panel.kpiValue != null ? panel.kpiValue : null);
      if (v == null && panel.values && panel.values[0] != null) v = panel.values[0];
      if (v == null) return '<div style="color:#9ca3af;font-size:0.7rem;font-style:italic">No data.</div>';
      return '<div style="text-align:center;padding:14px 8px;background:linear-gradient(135deg,#eef2ff,#fdf4ff);border-radius:8px">'
           +   '<div style="font-size:1.6rem;font-weight:800;color:#4338ca;line-height:1.1">' + escapeHtml(fmtNumber(v)) + '</div>'
           +   '<div style="font-size:0.62rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px">Current Value</div>'
           + '</div>';
    }
    var labels = panel.labels || [];
    var values = panel.values || [];
    if (!labels.length) return '<div style="color:#9ca3af;font-size:0.7rem;font-style:italic">No rows returned.</div>';
    var max = Math.min(8, labels.length);
    var h = '<div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#fff">'
          + '<table style="width:100%;border-collapse:collapse;font-size:0.68rem">'
          + '<thead><tr style="background:#f8fafc">'
          +   '<th style="padding:4px 8px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e5e7eb">Group</th>'
          +   '<th style="padding:4px 8px;text-align:right;color:#475569;font-weight:600;border-bottom:1px solid #e5e7eb">Value</th>'
          + '</tr></thead><tbody>';
    for (var i = 0; i < max; i++) {
      h += '<tr style="border-bottom:1px solid #f1f5f9">'
         +   '<td style="padding:3px 8px;color:#1f2937">' + escapeHtml(String(labels[i] == null ? '-' : labels[i])) + '</td>'
         +   '<td style="padding:3px 8px;text-align:right;color:#0f172a;font-weight:600">' + escapeHtml(fmtNumber(values[i])) + '</td>'
         + '</tr>';
    }
    h += '</tbody></table>';
    if (labels.length > max) h += '<div style="padding:4px 8px;font-size:0.62rem;color:#9ca3af;background:#fafafa;text-align:center">+' + (labels.length - max) + ' more rows</div>';
    h += '</div>';
    return h;
  }

  // ─── SQL generation + explanations (from dataConfig) ───────────────────────
  function quoteSqlIdent(s) {
    // display-only quoting (do not execute this SQL string directly)
    if (!s) return '';
    var str = String(s);
    if (/^[A-Za-z_][A-Za-z0-9_\\.]*$/.test(str)) return str;
    return '"' + str.replace(/"/g, '""') + '"';
  }
  function sqlLiteral(v) {
    if (v == null) return 'NULL';
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    var s = String(v);
    return "'" + s.replace(/'/g, "''") + "'";
  }
  function buildSqlFromDataConfig(dc) {
    if (!dc) return '';
    var table = dc.table || '';
    var groupBy = dc.groupByField || '';
    var agg = (dc.aggregation || '').toLowerCase() || 'count';
    var metric = dc.valueField || dc.metricField || '';
    var topN = dc.topN || null;
    var sortDir = (dc.sortDirection || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    var aggSql = agg.toUpperCase();
    if (aggSql === 'AVG') aggSql = 'AVG';
    if (aggSql === 'COUNT') aggSql = 'COUNT';
    if (aggSql === 'SUM') aggSql = 'SUM';
    if (aggSql === 'MIN') aggSql = 'MIN';
    if (aggSql === 'MAX') aggSql = 'MAX';

    var metricExpr = (aggSql === 'COUNT' && (!metric || metric === '*' )) ? '*' : quoteSqlIdent(metric || '*');
    var alias = (aggSql === 'COUNT') ? 'count_value' : ('metric_value');

    var selectCols = [];
    if (groupBy) selectCols.push(quoteSqlIdent(groupBy));
    selectCols.push(aggSql + '(' + metricExpr + ') AS ' + alias);

    var whereParts = [];
    (dc.filters || []).forEach(function (f) {
      if (!f) return;
      var col = f.column || f.field;
      var op = (f.operator || f.condition || '=').toUpperCase();
      var val = ('value' in f) ? f.value : null;
      if (!col || !op) return;
      if (op === 'IS NULL' || op === 'IS NOT NULL') whereParts.push(quoteSqlIdent(col) + ' ' + op);
      else whereParts.push(quoteSqlIdent(col) + ' ' + op + ' ' + sqlLiteral(val));
    });

    var sql = 'SELECT ' + selectCols.join(', ') + '\n'
            + 'FROM ' + quoteSqlIdent(table);
    if (whereParts.length) sql += '\nWHERE ' + whereParts.join(' AND ');
    if (groupBy) sql += '\nGROUP BY ' + quoteSqlIdent(groupBy);
    sql += '\nORDER BY ' + alias + ' ' + sortDir;
    if (topN) sql += '\nLIMIT ' + String(topN) + ';';
    else sql += ';';
    return sql;
  }

  function explainFromDataConfig(dc) {
    if (!dc) return '';
    var agg = (dc.aggregation || 'count').toLowerCase();
    var aggWord = agg === 'sum' ? 'sums'
      : agg === 'avg' ? 'averages'
      : agg === 'min' ? 'finds the minimum of'
      : agg === 'max' ? 'finds the maximum of'
      : 'counts';
    var table = dc.table || 'records';
    var metric = dc.valueField || dc.metricField || (agg === 'count' ? 'records' : 'values');
    var groupBy = dc.groupByField || '';
    var topN = dc.topN || null;
    if (groupBy) {
      return 'This query ' + aggWord + ' ' + metric + ' by ' + groupBy + ' from ' + table
        + (topN ? (' and shows the top ' + topN + ' results.') : '.');
    }
    return 'This query ' + aggWord + ' ' + metric + ' from ' + table + '.';
  }

  function advValidation(panel, dc, sr, sourceId, tableKey) {
    var issues = [];
    if (!dc || !dc.table) issues.push({ kind: 'error', text: 'Missing table.' });
    var agg = ((dc && dc.aggregation) || (sr && sr.aggregation) || '').toLowerCase();
    if (!agg) issues.push({ kind: 'warn', text: 'Missing aggregation.' });
    if (agg && agg !== 'count' && !(dc.valueField || dc.metricField || (sr && sr.metrics && sr.metrics[0]))) {
      issues.push({ kind: 'warn', text: 'Aggregation requires a value/metric field.' });
    }
    // If schema is loaded, validate fields exist
    var cols = getColumns(sourceId, tableKey);
    if (cols && cols.length) {
      var names = cols.map(function (c) { return c.key || c.dbCol || c.name; });
      if (dc.groupByField && names.indexOf(dc.groupByField) === -1) issues.push({ kind: 'warn', text: 'Field "' + dc.groupByField + '" does not exist in the selected table.' });
      var mf = dc.valueField || dc.metricField;
      if (mf && mf !== '*' && names.indexOf(mf) === -1) issues.push({ kind: 'warn', text: 'Field "' + mf + '" does not exist in the selected table.' });
    }
    if (panel && panel.hasData === false) issues.push({ kind: 'info', text: 'Query returns no data.' });
    return issues;
  }

  // ─── Advanced tab renderer ────────────────────────────────────────────────
  function renderAdvancedTab(uid, panel, state) {
    var dc = panel.dataConfig || null;
    var sr = state.editSR || {};
    var sourceId = panel.dataSourceId || (dc && dc.sourceId) || '';
    var tableKey = (dc && dc.table) || sr.focusArea || '';

    // Ensure schema fetch (for validation + dropdowns)
    if (!getCachedSchema(sourceId)) {
      fetchSchema(sourceId).then(function () {
        if ($('#aiPropertiesContent') && state.tab === 'advanced' && window.__bxSelectedUid === uid) window.showPanelProperties(uid);
      });
    }

    // Ensure we have a dataConfig snapshot if possible
    if (!dc && typeof rebuildDataConfig === 'function' && panel.structuredRequest) {
      dc = rebuildDataConfig(panel) || panel.dataConfig || null;
    }

    var sql = dc ? buildSqlFromDataConfig(dc) : '';
    var explanation = dc ? explainFromDataConfig(dc) : '';

    // Query history (per panel)
    state.queryHistory = state.queryHistory || [];
    state.adv = state.adv || { sqlMode: false, sqlText: '', sqlMsg: null, sqlErr: null };

    var schema = getCachedSchema(sourceId);
    var tables = schema ? Object.keys(schema) : [];
    var activeTable = tableKey || (tables[0] || '');
    var cols = getColumns(sourceId, activeTable);

    var dim = (sr.dimensions && sr.dimensions[0]) || (dc && dc.groupByField) || '';
    var met = (sr.metrics && sr.metrics[0]) || (dc && (dc.valueField || dc.metricField)) || '';
    var curAgg = ((sr.aggregation || (dc && dc.aggregation) || (panel.chartType === 'kpi' ? 'count' : 'sum'))).toLowerCase();
    var lim = sr.limit || (dc && dc.topN) || 10;
    var sortField = (sr.sort && sr.sort.field) || (dc && dc.sortBy) || '';
    var sortDir = (sr.sort && sr.sort.direction) || (dc && dc.sortDirection) || 'desc';

    var issues = advValidation(panel, dc || {}, sr, sourceId, activeTable);

    function banner(kind, text) {
      var color = kind === 'error' ? '#dc2626' : kind === 'warn' ? '#d97706' : '#0369a1';
      var bg = kind === 'error' ? '#fef2f2' : kind === 'warn' ? '#fffbeb' : '#f0f9ff';
      var icon = kind === 'error' ? 'bi-x-circle-fill' : kind === 'warn' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill';
      return '<div style="background:' + bg + ';border-left:3px solid ' + color + ';padding:6px 8px;border-radius:4px;font-size:0.68rem;color:' + color + ';margin-bottom:6px;display:flex;gap:6px;align-items:flex-start"><i class="bi ' + icon + '" style="margin-top:1px"></i><span>' + escapeHtml(text) + '</span></div>';
    }

    var h = '';

    // 1) Current Query
    h += section('bxAdvSql', 'bi-braces', 'Current Query', ''
      + (dc ? '' : banner('warn', 'This panel has no saved data configuration. Use the Visual Query Builder below, then click Refresh.'))
      + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
      +   '<div style="flex:1;font-size:0.66rem;color:#64748b">Generated from this panel’s dataConfig</div>'
      +   '<button class="btn btn-sm" onclick="window.BX.copySql(\'' + uid + '\')" style="font-size:0.7rem;background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca"><i class="bi bi-clipboard me-1"></i>Copy</button>'
      + '</div>'
      + '<pre id="bxSqlBox-' + uid + '" style="margin:0;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:10px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.7rem;line-height:1.5;max-height:170px;overflow:auto;white-space:pre-wrap">'
      + escapeHtml(sql || '—') + '</pre>'
    );

    // 2) Explanation
    h += section('bxAdvExplain', 'bi-chat-left-text-fill', 'Query Explanation',
      '<div style="font-size:0.74rem;color:#334155;line-height:1.5">' + escapeHtml(explanation || '—') + '</div>'
    );

    // 3) Visual Query Builder
    var tableOpts = !schema ? '<option>Loading…</option>'
      : (tables.length ? tables.map(function (t) {
        var name = (schema[t].displayName || t);
        return '<option value="' + escapeHtml(t) + '"' + (t === activeTable ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
      }).join('') : '<option value="">— no tables —</option>');

    var builderBody = '';
    builderBody += issues.map(function (i) { return banner(i.kind, i.text); }).join('');

    builderBody += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-table me-1"></i>Table</label>'
                +  '<select id="bxAdvTable-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem" onchange="window.BX.advOnTableChange(\'' + uid + '\')">' + tableOpts + '</select>'
                +  '</div>';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-sigma me-1"></i>Aggregation</label>'
                +  '<select id="bxAdvAgg-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem" onchange="window.BX.advMarkDirty(\'' + uid + '\')">'
                +    ['count','sum','avg','min','max'].map(function (a) {
                       var label = a === 'count' ? 'Count' : (a === 'sum' ? 'Sum' : a === 'avg' ? 'Average' : a === 'min' ? 'Min' : 'Max');
                       return '<option value="' + a + '"' + (curAgg === a ? ' selected' : '') + '>' + label + '</option>';
                     }).join('')
                +  '</select></div>';
    builderBody += '</div>';

    builderBody += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-layout-three-columns me-1"></i>Group by</label>'
                +  buildFieldDropdown({ id: 'bxAdvGroup-' + uid, uid: uid, value: dim, columns: cols, allowEmpty: true, emptyLabel: '— none (KPI) —', filterRole: 'group-pref' })
                +  '</div>';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-calculator me-1"></i>Value / Metric</label>'
                +  buildFieldDropdown({ id: 'bxAdvMetric-' + uid, uid: uid, value: met, columns: cols, allowEmpty: true, emptyLabel: curAgg === 'count' ? '— count records —' : '— none —', filterRole: 'measure-pref' })
                +  '</div>';
    builderBody += '</div>';

    builderBody += '<div style="display:grid;grid-template-columns:1fr 120px;gap:8px;margin-top:8px">';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-sort-down me-1"></i>Sort by</label>'
                +  buildFieldDropdown({ id: 'bxAdvSortField-' + uid, uid: uid, value: sortField, columns: cols, allowEmpty: true, emptyLabel: '— metric —' })
                +  '</div>';
    builderBody += '<div><label class="bx-lbl"><i class="bi bi-arrow-down-up me-1"></i>Direction</label>'
                +  '<select id="bxAdvSortDir-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem" onchange="window.BX.advMarkDirty(\'' + uid + '\')">'
                +    '<option value="desc"' + (String(sortDir) === 'desc' ? ' selected' : '') + '>DESC</option>'
                +    '<option value="asc"' + (String(sortDir) === 'asc' ? ' selected' : '') + '>ASC</option>'
                +  '</select></div>';
    builderBody += '</div>';

    builderBody += '<div style="margin-top:8px"><label class="bx-lbl"><i class="bi bi-list-ol me-1"></i>Limit / Top N</label>'
                +  '<input type="range" id="bxAdvLim-' + uid + '" class="form-range" min="1" max="100" value="' + escapeHtml(String(lim)) + '" style="accent-color:#6366f1" oninput="document.getElementById(\'bxAdvLimLabel-' + uid + '\').textContent=this.value;window.BX.advMarkDirty(\'' + uid + '\')">'
                +  '<div style="display:flex;justify-content:space-between;margin-top:-6px"><span style="font-size:0.64rem;color:#64748b">1</span><span id="bxAdvLimLabel-' + uid + '" style="font-size:0.66rem;color:#334155;font-weight:700">' + escapeHtml(String(lim)) + '</span><span style="font-size:0.64rem;color:#64748b">100</span></div>'
                +  '</div>';

    builderBody += '<div style="display:flex;gap:6px;margin-top:10px">'
                +    '<button class="btn btn-sm" onclick="window.BX.advAddFilter(\'' + uid + '\')" style="flex:1;font-size:0.72rem;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1"><i class="bi bi-funnel-fill me-1"></i>Add Filter</button>'
                +    '<button class="btn btn-sm" onclick="aiPropRefresh(\'' + uid + '\')" style="flex:1;font-size:0.72rem;background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>'
                +  '</div>';

    h += section('bxAdvBuilder', 'bi-sliders', 'Visual Query Builder', builderBody);

    // 4) Preview Output
    var prevCols = (panel.tableData && panel.tableData.columns) || [];
    var prevRows = (panel.tableData && panel.tableData.rows) || [];
    var previewHtml = '';
    if (prevCols.length && prevRows.length) {
      previewHtml += '<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:auto;max-height:180px;background:#fff">'
                  +  '<table style="width:100%;border-collapse:collapse;font-size:0.68rem">'
                  +  '<thead><tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb">'
                  +    prevCols.slice(0, 6).map(function (c) { return '<th style="padding:5px 8px;text-align:left;color:#475569;font-weight:700;position:sticky;top:0;background:#f8fafc">' + escapeHtml(c) + '</th>'; }).join('')
                  +  '</tr></thead><tbody>'
                  +  prevRows.slice(0, 12).map(function (r) {
                       return '<tr style="border-bottom:1px solid #f1f5f9">' + prevCols.slice(0, 6).map(function (c) {
                         return '<td style="padding:4px 8px;color:#0f172a;white-space:nowrap">' + escapeHtml(String(r[c] == null ? '' : r[c])) + '</td>';
                       }).join('') + '</tr>';
                     }).join('')
                  +  '</tbody></table></div>';
    } else if (dc && dc.resultPreview && dc.resultPreview.length) {
      previewHtml += '<div style="font-size:0.68rem;color:#64748b;margin-bottom:6px">Preview from last calculation</div>';
      previewHtml += '<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:auto;max-height:180px;background:#fff">'
                  +  '<table style="width:100%;border-collapse:collapse;font-size:0.68rem">';
      var keys = Object.keys(dc.resultPreview[0] || {}).slice(0, 6);
      previewHtml += '<thead><tr style="background:#f8fafc;border-bottom:1px solid #e5e7eb">'
                  + keys.map(function (k) { return '<th style="padding:5px 8px;text-align:left;color:#475569;font-weight:700;position:sticky;top:0;background:#f8fafc">' + escapeHtml(k) + '</th>'; }).join('')
                  + '</tr></thead><tbody>';
      previewHtml += dc.resultPreview.slice(0, 12).map(function (row) {
        return '<tr style="border-bottom:1px solid #f1f5f9">' + keys.map(function (k) {
          return '<td style="padding:4px 8px;color:#0f172a;white-space:nowrap">' + escapeHtml(String(row[k] == null ? '' : row[k])) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      previewHtml += '</tbody></table></div>';
    } else {
      previewHtml = '<div style="color:#9ca3af;font-size:0.7rem;font-style:italic">No preview available yet — click Refresh.</div>';
    }
    h += section('bxAdvPreview', 'bi-table', 'Preview Output', previewHtml);

    // 5) Advanced SQL Mode
    var sqlModeBody = '';
    sqlModeBody += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
                +  '<label style="display:flex;align-items:center;gap:8px;font-size:0.72rem;color:#334155;cursor:pointer;flex:1">'
                +    '<input type="checkbox" ' + (state.adv.sqlMode ? 'checked' : '') + ' style="accent-color:#6366f1" onchange="window.BX.toggleSqlMode(\'' + uid + '\', this.checked)">'
                +    '<span style="font-weight:700">Enable Advanced SQL Mode</span>'
                +    '<span style="font-size:0.66rem;color:#64748b;font-weight:600">(SELECT only)</span>'
                +  '</label>'
                + '</div>';
    if (state.adv.sqlMode) {
      var initial = state.adv.sqlText || sql || '';
      sqlModeBody += (sourceId ? banner('warn', 'Advanced SQL Mode is only available for the Internal Database.') : '');
      sqlModeBody += '<textarea id="bxAdvSqlText-' + uid + '" class="form-control form-control-sm" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.7rem;min-height:120px" spellcheck="false">' + escapeHtml(initial) + '</textarea>';
      if (state.adv.sqlErr) sqlModeBody += banner('error', state.adv.sqlErr);
      else if (state.adv.sqlMsg) sqlModeBody += banner('info', state.adv.sqlMsg);
      sqlModeBody += '<div style="display:flex;gap:6px;margin-top:8px">'
                  +   '<button class="btn btn-sm" onclick="window.BX.validateSql(\'' + uid + '\')" style="flex:1;font-size:0.72rem;background:#f9fafb;border:1px solid #e5e7eb;color:#475569"><i class="bi bi-shield-check me-1"></i>Validate</button>'
                  +   '<button class="btn btn-sm btn-primary" onclick="window.BX.applySql(\'' + uid + '\')" style="flex:1;font-size:0.72rem"><i class="bi bi-play-fill me-1"></i>Apply SQL</button>'
                  + '</div>';
      sqlModeBody += '<div style="margin-top:6px;font-size:0.64rem;color:#64748b;line-height:1.4">'
                  +  'Blocked keywords: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, REPLACE…'
                  + '</div>';
    }
    h += section('bxAdvSqlMode', 'bi-terminal', 'Advanced SQL Mode', sqlModeBody, { open: false });

    // 6) Query history
    var qh = state.queryHistory || [];
    var histBody = '';
    if (!qh.length) {
      histBody = '<div style="font-size:0.72rem;color:#9ca3af;background:#f9fafb;border:1px dashed #e5e7eb;border-radius:6px;padding:9px;text-align:center">No query changes yet.</div>';
    } else {
      histBody = qh.slice().reverse().map(function (it, idx) {
        var realIdx = qh.length - 1 - idx;
        return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:7px 8px;margin-bottom:6px;display:flex;gap:8px;align-items:flex-start">'
          + '<div style="flex:1">'
          +   '<div style="font-size:0.7rem;font-weight:700;color:#334155">' + escapeHtml(it.desc || ('Change #' + (realIdx + 1))) + '</div>'
          +   '<div style="font-size:0.62rem;color:#94a3b8;margin-top:1px">' + escapeHtml(it.ts || '') + '</div>'
          + '</div>'
          + '<button class="btn btn-sm" onclick="window.BX.undoQuery(\'' + uid + '\',' + realIdx + ')" style="font-size:0.62rem;padding:2px 6px;background:#fff;border:1px solid #d1d5db;color:#6b7280">Undo</button>'
          + '</div>';
      }).join('');
    }
    h += section('bxAdvHist', 'bi-clock-history', 'Query History', histBody, { open: false });

    return h;
  }

  function validate(panel, sr, sourceId, tableName) {
    var issues = [];
    if (!sourceId && !panel.dataSourceId) {
      // internal DB is OK; only warn if no tables resolved
      var sch = getCachedSchema(sourceId);
      if (sch && !Object.keys(sch).length) issues.push({ kind: 'error', text: 'No tables available in this source.' });
    }
    var cols = getColumns(sourceId, tableName);
    var colNames = cols.map(function (c) { return c.key || c.dbCol || c.name; });
    if (cols.length) {
      (sr.dimensions || []).forEach(function (d) {
        if (d && colNames.indexOf(d) === -1) issues.push({ kind: 'warn', text: 'Group field "' + d + '" not found in ' + tableName + '.' });
      });
      (sr.metrics || []).forEach(function (m) {
        if (m && colNames.indexOf(m) === -1) issues.push({ kind: 'warn', text: 'Value field "' + m + '" not found in ' + tableName + '.' });
      });
    }
    var agg = (sr.aggregation || '').toLowerCase();
    if (agg && agg !== 'count' && (!sr.metrics || !sr.metrics.length)) {
      issues.push({ kind: 'warn', text: 'Aggregation "' + agg + '" needs a numeric value field.' });
    }
    if (panel.hasData === false || (panel.labels && !panel.labels.length && panel.chartType !== 'kpi')) {
      issues.push({ kind: 'info', text: 'Empty result — try widening filters or changing the table.' });
    }
    return issues;
  }

  // ─── UI building blocks ───────────────────────────────────────
  function section(id, icon, title, bodyHtml, opts) {
    opts = opts || {};
    var open = opts.open !== false;
    return '<details ' + (open ? 'open' : '') + ' class="bx-section" style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:7px;background:#fff;overflow:hidden">'
         +   '<summary style="list-style:none;cursor:pointer;padding:7px 10px;display:flex;align-items:center;gap:6px;background:#f8fafc;border-bottom:1px solid #e5e7eb;user-select:none">'
         +     '<i class="bi ' + icon + '" style="color:#6366f1;font-size:0.78rem"></i>'
         +     '<span style="flex:1;font-size:0.66rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.4px">' + title + '</span>'
         +     '<i class="bi bi-chevron-down" style="color:#94a3b8;font-size:0.7rem;transition:transform 0.15s"></i>'
         +   '</summary>'
         +   '<div style="padding:9px 10px">' + bodyHtml + '</div>'
         + '</details>';
  }

  function fieldOption(col, selected, role) {
    var key = col.key || col.dbCol || col.name;
    var label = col.displayName || key;
    var r = role || inferRole(col);
    var meta = roleIcon(r);
    // icon as unicode prefix in option text (option doesn't render html)
    var prefix = r === 'measure' ? '# ' : r === 'date' ? '◷ ' : r === 'boolean' ? '⊙ ' : '⛚ ';
    return '<option value="' + escapeHtml(key) + '"' + (selected ? ' selected' : '') + ' data-role="' + r + '" data-type="' + escapeHtml(col.type || '') + '">' + escapeHtml(prefix + label) + '</option>';
  }

  function buildFieldDropdown(opts) {
    // opts: { id, value, columns, allowEmpty, emptyLabel, filterRole }
    var cols = opts.columns || [];
    if (opts.filterRole === 'measure-pref') {
      // Recommended numeric first, then everything else
      var measures = cols.filter(function (c) { return inferRole(c) === 'measure'; });
      var others = cols.filter(function (c) { return inferRole(c) !== 'measure'; });
      cols = measures.concat(others);
    } else if (opts.filterRole === 'group-pref') {
      var dims = cols.filter(function (c) { var r = inferRole(c); return r === 'dimension' || r === 'date' || r === 'boolean'; });
      var rest = cols.filter(function (c) { return inferRole(c) === 'measure'; });
      cols = dims.concat(rest);
    }
    var html = '<select id="' + opts.id + '" class="form-select form-select-sm bx-field-select" style="font-size:0.74rem" onchange="aiPropMarkDirty(\'' + opts.uid + '\')">';
    if (opts.allowEmpty) html += '<option value=""' + (!opts.value ? ' selected' : '') + '>' + escapeHtml(opts.emptyLabel || '— none —') + '</option>';
    // Recommended group
    if (opts.filterRole === 'measure-pref' || opts.filterRole === 'group-pref') {
      var recCols = opts.filterRole === 'measure-pref'
        ? cols.filter(function (c) { return inferRole(c) === 'measure'; }).slice(0, 4)
        : cols.filter(function (c) { var r = inferRole(c); return r === 'dimension' || r === 'date'; }).slice(0, 4);
      if (recCols.length) {
        html += '<optgroup label="★ Recommended">';
        recCols.forEach(function (c) {
          var k = c.key || c.dbCol || c.name;
          html += fieldOption(c, k === opts.value);
        });
        html += '</optgroup>';
        html += '<optgroup label="All fields">';
      }
    }
    cols.forEach(function (c) {
      var k = c.key || c.dbCol || c.name;
      html += fieldOption(c, k === opts.value);
    });
    if (opts.filterRole === 'measure-pref' || opts.filterRole === 'group-pref') html += '</optgroup>';
    // If current value is not in cols (stale), add as a dangling option so it stays selected
    if (opts.value && !cols.some(function (c) { return (c.key || c.dbCol || c.name) === opts.value; })) {
      html += '<option value="' + escapeHtml(opts.value) + '" selected style="color:#dc2626">' + escapeHtml(opts.value) + ' (not in table)</option>';
    }
    html += '</select>';
    return html;
  }

  // ─── Legacy / dataConfig hydration ────────────────────────────
  /** Build a structuredRequest from a panel.dataConfig snapshot (server-saved). */
  function srFromDataConfig(dc) {
    if (!dc) return null;
    var dim = dc.groupByField || dc.xField || null;
    var met = dc.valueField || dc.yField || dc.metricField || null;
    return {
      focusArea: dc.table || null,
      dimensions: dim ? [dim] : [],
      metrics: met ? [met] : [],
      aggregation: (dc.aggregation || 'sum').toLowerCase(),
      filters: dc.filters || [],
      sort: dc.sortBy ? { field: dc.sortBy, direction: dc.sortDirection || 'desc' } : null,
      limit: dc.topN || null,
      chartPreference: null,
    };
  }
  /** Best-effort SR for an old panel that has neither structuredRequest nor dataConfig. */
  function inferDataConfigForLegacyPanel(panel) {
    if (!panel) return null;
    // Try kpi-style fields the front-end stashed
    var hint = panel.kpiSource || '';
    var byMatch = /(\w+)\s+by\s+(\w+)/i.exec(panel.title || '');
    var legacy = {
      focusArea: panel.tableName || panel.table || (panel.kpiSource && panel.kpiSource.table) || '',
      dimensions: byMatch ? [byMatch[2]] : [],
      metrics: byMatch ? [byMatch[1]] : [],
      aggregation: panel.chartType === 'kpi' ? 'count' : 'sum',
      filters: [],
      sort: null,
      limit: (panel.labels && panel.labels.length) || null,
    };
    return legacy;
  }
  function hasUsableSR(sr) {
    return !!(sr && (sr.focusArea || (sr.dimensions && sr.dimensions.length) || (sr.metrics && sr.metrics.length)));
  }
  /** Ensure the panel has a structuredRequest before the Data tab renders. */
  function ensurePanelSR(panel) {
    if (!panel) return null;
    if (hasUsableSR(panel.structuredRequest)) return panel.structuredRequest;
    var fromDc = srFromDataConfig(panel.dataConfig);
    if (hasUsableSR(fromDc)) {
      panel.structuredRequest = fromDc;
      return fromDc;
    }
    var legacy = inferDataConfigForLegacyPanel(panel);
    if (hasUsableSR(legacy)) {
      panel.structuredRequest = legacy;
      panel._legacyInferred = true;
      return legacy;
    }
    return null;
  }

  function buildCalculationLabel(dc) {
    if (!dc) return '';
    var agg = (dc.aggregation || 'sum').toLowerCase();
    var aggLabel = agg.charAt(0).toUpperCase() + agg.slice(1);
    var t = dc.table || '';
    var metric = dc.valueField || dc.metricField || '';
    var dim = dc.groupByField || '';
    var qm = metric ? (t ? t + '.' + metric : metric) : '*';
    var qd = dim ? (t ? t + '.' + dim : dim) : '';
    var s = aggLabel + '(' + qm + ')';
    if (qd) s += ' grouped by ' + qd;
    return s;
  }

  // ─── Override aiPropRenderData ────────────────────────────────
  function renderDataTab(uid, panel, state) {
    // Ensure the panel has a structuredRequest (falling back to dataConfig or
    // inferring from legacy fields). If the editSR clone in state is empty
    // because it was made before hydration, replace it now.
    var hydrated = ensurePanelSR(panel);
    if (!hasUsableSR(state.editSR) && hydrated) {
      state.editSR = JSON.parse(JSON.stringify(hydrated));
      state.origSR = state.origSR && hasUsableSR(state.origSR) ? state.origSR : JSON.parse(JSON.stringify(hydrated));
    }
    var sr = state.editSR || {};
    var srcSel = $('#aiSourceSel');
    var sourceId = panel.dataSourceId || (srcSel ? srcSel.value : '') || '';
    var schema = getCachedSchema(sourceId);

    // If we still have no usable SR after hydration attempts, show a
    // "rebind" warning instead of empty fields.
    var noConfig = !hasUsableSR(sr) && !panel.dataConfig;

    // Kick off fetch if not yet loaded; re-render when ready.
    if (!schema) {
      fetchSchema(sourceId).then(function () {
        if ($('#aiPropertiesContent') && state.tab === 'data' && window.__bxSelectedUid === uid) {
          window.showPanelProperties(uid);
        }
      });
    }
    var loading = !schema;
    var tables = schema ? Object.keys(schema) : [];
    var activeTable = resolveTable(sourceId, sr);
    if (sr.focusArea && schema && !schema[sr.focusArea] && activeTable) {
      // surface a soft warning later in validation
    }
    var cols = getColumns(sourceId, activeTable);

    var dim = (sr.dimensions && sr.dimensions[0]) || '';
    var metric = (sr.metrics && sr.metrics[0]) || '';
    var sortField = (sr.sort && sr.sort.field) || '';
    var sortDir = (sr.sort && sr.sort.direction) || 'desc';
    var lim = sr.limit || 10;
    var curAgg = ((sr.aggregation || (panel.chartType === 'kpi' ? 'count' : 'sum'))).toLowerCase();
    var isKpi = panel.chartType === 'kpi';

    // ── 1. Data Source section
    var srcOpts = '<option value="">Internal Database</option>';
    if (srcSel) {
      for (var si = 0; si < srcSel.options.length; si++) {
        var opt = srcSel.options[si];
        if (opt.value) srcOpts += '<option value="' + escapeHtml(opt.value) + '"' + (String(opt.value) === String(sourceId) ? ' selected' : '') + '>' + escapeHtml(opt.text) + '</option>';
      }
    }
    var srcBody = '';
    // When a full dashboard has been generated, the source database is bound
    // and locked everywhere — including this Properties → Data tab — so the
    // user can't accidentally repoint a single panel at a different source.
    var sourceLocked = !!(window.__aiExecutiveMeta);
    var lockedSrcName = sourceLocked
      ? ((window.__aiExecutiveMeta && window.__aiExecutiveMeta.sourceName) ||
         (function(){ var s = document.getElementById('aiSourceSel'); return (s && s.options[s.selectedIndex]) ? s.options[s.selectedIndex].text : 'Internal Database'; })())
      : '';
    srcBody += '<div style="margin-bottom:8px"><label class="bx-lbl"><i class="bi bi-database me-1"></i>Source Database</label>'
            +    '<select id="aiPropSource-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem' + (sourceLocked ? ';opacity:0.7;cursor:not-allowed;background:#f8fafc' : '') + '"'
            +      (sourceLocked ? ' disabled title="Source is locked because a dashboard has been generated against it. Click Reset on the left sidebar to change it."' : '')
            +      ' onchange="window.BX.onSourceChange(\'' + uid + '\', this.value)">' + srcOpts + '</select>'
            +    (sourceLocked
                  ? '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:0.66rem;color:#64748b">'
                    +   '<i class="bi bi-lock-fill" style="color:#6366f1"></i>'
                    +   '<span>Locked &middot; ' + escapeHtml(lockedSrcName) + '</span>'
                    + '</div>'
                  : '')
            + '</div>';
    var tableOpts = '';
    if (loading) {
      tableOpts = '<option>Loading…</option>';
    } else if (!tables.length) {
      tableOpts = '<option value="">— no tables found —</option>';
    } else {
      tableOpts = tables.map(function (t) {
        var name = (schema[t].displayName || t);
        var n = (schema[t].columns || []).length;
        return '<option value="' + escapeHtml(t) + '"' + (t === activeTable ? ' selected' : '') + '>' + escapeHtml(name) + ' (' + n + ' fields)</option>';
      }).join('');
      // dangling original focusArea
      if (sr.focusArea && tables.indexOf(sr.focusArea) === -1 && sr.focusArea !== activeTable) {
        tableOpts += '<option value="' + escapeHtml(sr.focusArea) + '" selected style="color:#dc2626">' + escapeHtml(sr.focusArea) + ' (not in source)</option>';
      }
    }
    srcBody += '<div><label class="bx-lbl"><i class="bi bi-table me-1"></i>Table / Topic</label>'
            +    '<select id="aiPropFocus-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem" onchange="window.BX.onTableChange(\'' + uid + '\')">' + tableOpts + '</select>'
            + '</div>';

    // ── 2. Fields section
    var fieldsBody = '';
    if (!isKpi) {
      fieldsBody += '<div style="margin-bottom:8px"><label class="bx-lbl"><i class="bi bi-layout-three-columns me-1"></i>Group By <span style="color:#9ca3af;font-weight:500;text-transform:none">(X-axis)</span></label>'
        + buildFieldDropdown({ id: 'aiPropDim-' + uid, uid: uid, value: dim, columns: cols, allowEmpty: true, emptyLabel: '— none —', filterRole: 'group-pref' })
        + '</div>';
    }
    fieldsBody += '<div style="margin-bottom:8px"><label class="bx-lbl"><i class="bi bi-calculator me-1"></i>Value / Measure ' + (isKpi ? '' : '<span style="color:#9ca3af;font-weight:500;text-transform:none">(Y-axis)</span>') + '</label>'
      + buildFieldDropdown({ id: 'aiPropMetric-' + uid, uid: uid, value: metric, columns: cols, allowEmpty: !isKpi || curAgg === 'count', emptyLabel: curAgg === 'count' ? '— count records —' : '— none —', filterRole: 'measure-pref' })
      + '</div>';

    fieldsBody += '<div style="margin-bottom:8px"><label class="bx-lbl"><i class="bi bi-sigma me-1"></i>Aggregation Method</label>'
      + '<select id="aiPropAgg-' + uid + '" class="form-select form-select-sm" style="font-size:0.74rem" onchange="aiPropMarkDirty(\'' + uid + '\')">';
    [{ v: 'count', l: 'Count — how many records' },
     { v: 'sum',   l: 'Sum — add all values' },
     { v: 'avg',   l: 'Average — typical value' },
     { v: 'max',   l: 'Maximum — highest value' },
     { v: 'min',   l: 'Minimum — lowest value' }].forEach(function (a) {
      fieldsBody += '<option value="' + a.v + '"' + (curAgg === a.v ? ' selected' : '') + '>' + a.l + '</option>';
    });
    fieldsBody += '</select></div>';

    if (!isKpi) {
      fieldsBody += '<div style="margin-bottom:8px"><label class="bx-lbl"><i class="bi bi-sort-down me-1"></i>Sort By</label>'
        + '<div style="display:flex;gap:4px">'
        +   '<div style="flex:1">'
        +     buildFieldDropdown({ id: 'aiPropSortField-' + uid, uid: uid, value: sortField, columns: cols, allowEmpty: true, emptyLabel: '— default —' })
        +   '</div>'
        +   '<select id="aiPropSortDir-' + uid + '" class="form-select form-select-sm" style="font-size:0.72rem;width:80px" onchange="aiPropMarkDirty(\'' + uid + '\')">'
        +     '<option value="desc"' + (sortDir === 'desc' ? ' selected' : '') + '>↓ High</option>'
        +     '<option value="asc"' + (sortDir === 'asc' ? ' selected' : '') + '>↑ Low</option>'
        +   '</select>'
        + '</div></div>';

      fieldsBody += '<div style="margin-bottom:2px"><label class="bx-lbl"><i class="bi bi-list-ol me-1"></i>Top <span id="aiPropLimLabel-' + uid + '">' + lim + '</span> Results</label>'
        + '<input type="range" id="aiPropLim-' + uid + '" class="form-range" min="1" max="100" value="' + lim + '" style="accent-color:#6366f1" oninput="document.getElementById(\'aiPropLimLabel-' + uid + '\').textContent=this.value;aiPropMarkDirty(\'' + uid + '\')">'
        + '</div>';
    }

    // ── 3. Current Calculation
    var calcText = (panel.dataConfig && panel.dataConfig.calculationLabel)
      || buildFormula(panel, sr, activeTable);
    var calcBody = '<div style="background:#0f172a;color:#e2e8f0;border-radius:6px;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.72rem;line-height:1.45;word-break:break-word">'
                 +   '<span style="color:#94a3b8">ƒ</span> ' + escapeHtml(calcText)
                 + '</div>';
    if ((sr.filters || []).length) {
      calcBody += '<div style="margin-top:5px;font-size:0.65rem;color:#6b7280"><i class="bi bi-funnel-fill me-1" style="color:#3b82f6"></i>'
               + (sr.filters.length) + ' filter' + (sr.filters.length > 1 ? 's' : '') + ' applied — see Filters tab</div>';
    } else {
      calcBody += '<div style="margin-top:5px;font-size:0.65rem;color:#9ca3af"><i class="bi bi-funnel me-1"></i>No filters applied</div>';
    }

    // ── 4. Current Result
    var resultBody = buildResultPreview(panel);

    // ── 5. Validation
    var issues = validate(panel, sr, sourceId, activeTable);
    var validationBody;
    if (!issues.length) {
      validationBody = '<div style="display:flex;align-items:center;gap:6px;color:#16a34a;font-size:0.7rem;font-weight:600"><i class="bi bi-check-circle-fill"></i> Configuration looks good.</div>';
    } else {
      validationBody = issues.map(function (i) {
        var color = i.kind === 'error' ? '#dc2626' : i.kind === 'warn' ? '#d97706' : '#0369a1';
        var bg    = i.kind === 'error' ? '#fef2f2' : i.kind === 'warn' ? '#fffbeb' : '#f0f9ff';
        var icon  = i.kind === 'error' ? 'bi-x-circle-fill' : i.kind === 'warn' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill';
        return '<div style="background:' + bg + ';border-left:3px solid ' + color + ';padding:5px 8px;border-radius:3px;font-size:0.68rem;color:' + color + ';margin-bottom:4px;display:flex;gap:6px;align-items:flex-start"><i class="bi ' + icon + '" style="margin-top:1px"></i><span>' + escapeHtml(i.text) + '</span></div>';
      }).join('');
    }

    // ── Live preview indicator + Reset
    var liveBar = '<div id="aiPropApplyBar-' + uid + '" style="margin-top:6px">'
                +   '<div style="display:flex;align-items:center;gap:6px;font-size:0.66rem;color:#16a34a;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:5px 8px;font-weight:600">'
                +     '<i class="bi bi-broadcast-pin"></i>'
                +     '<span style="flex:1">Live preview — changes apply automatically</span>'
                +     '<span id="bxApplyState-' + uid + '" style="font-size:0.62rem;color:#15803d"></span>'
                +   '</div>'
                +   '<div style="display:flex;gap:4px;margin-top:5px">'
                +     '<button onclick="aiPropReset(\'' + uid + '\')" class="btn btn-sm" style="flex:1;font-size:0.7rem;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280"><i class="bi bi-x-circle me-1"></i>Reset</button>'
                +     '<button onclick="aiPropRefresh(\'' + uid + '\')" class="btn btn-sm" style="flex:1;font-size:0.7rem;background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>'
                +   '</div>'
                + '</div>';

    var styleTag = '<style>'
                 + '.bx-lbl{font-size:0.62rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:3px}'
                 + '.bx-section[open] > summary > .bi-chevron-down{transform:rotate(180deg)}'
                 + '.bx-field-select{background-image:none}'
                 + '</style>';

    var noConfigBanner = '';
    if (noConfig) {
      noConfigBanner = '<div style="background:#fff7ed;border:1px solid #fed7aa;border-left:3px solid #f97316;border-radius:6px;padding:8px 10px;margin-bottom:8px">'
                     + '<div style="display:flex;align-items:flex-start;gap:6px"><i class="bi bi-exclamation-triangle-fill" style="color:#f97316;margin-top:1px"></i>'
                     + '<div style="flex:1"><div style="font-size:0.72rem;font-weight:600;color:#9a3412">This panel has no saved data configuration.</div>'
                     + '<div style="font-size:0.66rem;color:#9a3412;line-height:1.4;margin-top:2px">Pick a table and fields below to rebind it, then click Refresh.</div></div></div>'
                     + '<button onclick="window.BX.rebindPanel(\'' + uid + '\')" class="btn btn-sm w-100 mt-2" style="font-size:0.7rem;background:#f97316;color:#fff;border:none;font-weight:600"><i class="bi bi-link-45deg me-1"></i>Rebind Data</button>'
                     + '</div>';
    } else if (panel._legacyInferred) {
      noConfigBanner = '<div style="background:#fef3c7;border:1px solid #fde68a;border-left:3px solid #d97706;border-radius:6px;padding:6px 9px;margin-bottom:8px;font-size:0.66rem;color:#78350f">'
                     + '<i class="bi bi-info-circle-fill me-1" style="color:#d97706"></i>Configuration inferred from panel title — verify the table and fields below.'
                     + '</div>';
    }

    return styleTag
         + noConfigBanner
         + section('bxSecSource', 'bi-database-fill', 'Data Source', srcBody)
         + section('bxSecFields', 'bi-funnel-fill', 'Fields', fieldsBody)
         + section('bxSecCalc',   'bi-calculator-fill', 'Current Calculation', calcBody)
         + section('bxSecResult', 'bi-bar-chart-line-fill', 'Current Result', resultBody)
         + section('bxSecValid',  'bi-shield-check', 'Validation', validationBody, { open: issues.length > 0 })
         + liveBar;
  }

  // ─── Source / table change handlers ───────────────────────────
  function onSourceChange(uid, newSourceId) {
    var state = window.__propState && window.__propState[uid];
    var panel = window.__aiPanelData && window.__aiPanelData[uid];
    if (!state || !panel) return;
    panel.dataSourceId = newSourceId || null;
    state.dirty = true;
    fetchSchema(newSourceId).then(function (schema) {
      // If old table or fields don't exist in new source, surface warning via validation (auto-shown).
      var oldTable = state.editSR.focusArea;
      if (oldTable && !schema[oldTable]) {
        // pick first table
        var t = Object.keys(schema)[0] || '';
        state.editSR.focusArea = t;
        state.editSR.dimensions = [];
        state.editSR.metrics = [];
        state.editSR.sort = { field: '', direction: 'desc' };
      }
      window.showPanelProperties(uid);
      scheduleApply(uid);
    });
  }
  function onTableChange(uid) {
    var sel = $('#aiPropFocus-' + uid);
    if (!sel) return;
    var state = window.__propState && window.__propState[uid];
    if (!state) return;
    var newTable = sel.value;
    var sourceId = (window.__aiPanelData[uid] && window.__aiPanelData[uid].dataSourceId) || '';
    var cols = getColumns(sourceId, newTable).map(function (c) { return c.key || c.dbCol || c.name; });
    state.editSR.focusArea = newTable;
    // Drop fields that don't exist in new table
    state.editSR.dimensions = (state.editSR.dimensions || []).filter(function (d) { return cols.indexOf(d) !== -1; });
    state.editSR.metrics = (state.editSR.metrics || []).filter(function (m) { return cols.indexOf(m) !== -1; });
    if (state.editSR.sort && state.editSR.sort.field && cols.indexOf(state.editSR.sort.field) === -1) {
      state.editSR.sort.field = '';
    }
    state.dirty = true;
    window.showPanelProperties(uid);
    scheduleApply(uid);
  }

  // ─── Live preview / debounced auto-apply ──────────────────────
  var _scheduledApply = {};
  function scheduleApply(uid) {
    if (!uid) return;
    if (_scheduledApply[uid]) clearTimeout(_scheduledApply[uid]);
    var indicator = $('#bxApplyState-' + uid);
    if (indicator) indicator.textContent = '⏳ pending…';
    _scheduledApply[uid] = setTimeout(function () {
      delete _scheduledApply[uid];
      if (typeof window.aiPropApply === 'function') {
        if (indicator) indicator.textContent = 'applying…';
        window.aiPropApply(uid);
      }
    }, 600);
  }
  function syncInputsToState(uid) {
    var state = window.__propState && window.__propState[uid];
    if (!state || !state.editSR) return;
    var sr = state.editSR;
    var v = function (id) { var e = $('#' + id); return e ? e.value : null; };
    var src   = v('aiPropSource-' + uid);
    var focus = v('aiPropFocus-' + uid);
    var dim   = v('aiPropDim-' + uid);
    var met   = v('aiPropMetric-' + uid);
    var agg   = v('aiPropAgg-' + uid);
    var lim   = v('aiPropLim-' + uid);
    var sf    = v('aiPropSortField-' + uid);
    var sd    = v('aiPropSortDir-' + uid);
    if (focus !== null) sr.focusArea = focus.trim();
    if (dim !== null)   sr.dimensions = dim.trim() ? [dim.trim()] : [];
    if (met !== null)   sr.metrics = met.trim() ? [met.trim()] : [];
    if (agg !== null)   sr.aggregation = agg;
    if (lim !== null)   sr.limit = parseInt(lim, 10) || sr.limit;
    if (sf !== null || sd !== null) sr.sort = { field: (sf || '').trim(), direction: sd || 'desc' };
    var panel = window.__aiPanelData && window.__aiPanelData[uid];
    if (panel && src !== null) panel.dataSourceId = src || null;
  }

  function patchMarkDirty() {
    if (typeof window.aiPropMarkDirty !== 'function' || window.aiPropMarkDirty.__bxPatched) return;
    var orig = window.aiPropMarkDirty;
    var patched = function (uid) {
      orig(uid);
      window.__bxSelectedUid = uid;
      syncInputsToState(uid);
      scheduleApply(uid);
    };
    patched.__bxPatched = true;
    window.aiPropMarkDirty = patched;
  }

  // Track selected uid for re-render after async schema load
  function patchShowPanelProperties() {
    if (typeof window.showPanelProperties !== 'function' || window.showPanelProperties.__bxPatched) return;
    var orig = window.showPanelProperties;
    var patched = function (uid) {
      window.__bxSelectedUid = uid;
      orig(uid);
    };
    patched.__bxPatched = true;
    window.showPanelProperties = patched;
  }

  // Wrap aiPropApply / aiPropRefresh so panel.dataConfig is rebuilt after a
  // successful recalculation. This keeps the Data tab and saved JSON in sync.
  function patchApplyRefresh() {
    ['aiPropApply', 'aiPropRefresh'].forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function' || fn.__bxPatched) return;
      var patched = function (uid) {
        var ret = fn.apply(this, arguments);
        // Both functions are async (fetch). Rebuild dataConfig on the next
        // microtask cycles — give the network call time to mutate the panel.
        var attempts = 0;
        var prevTs = (window.__aiPanelData && window.__aiPanelData[uid] && window.__aiPanelData[uid].dataConfig && window.__aiPanelData[uid].dataConfig.lastCalculatedAt) || null;
        var iv = setInterval(function () {
          attempts++;
          var p = window.__aiPanelData && window.__aiPanelData[uid];
          if (p && p.structuredRequest) {
            // Rebuild every poll while the labels/values are present; harmless if repeated.
            rebuildDataConfig(p);
          }
          if (attempts >= 6) clearInterval(iv);
        }, 250);
        return ret;
      };
      patched.__bxPatched = true;
      window[name] = patched;
    });
  }

  // ─── Boot ─────────────────────────────────────────────────────
  function boot() {
    if (!$('#aiWorkspace')) return; // only on /ai-builder

    // Override Data tab renderer
    window.aiPropRenderData = renderDataTab;
    // Override Advanced tab renderer
    window.aiPropRenderAdvanced = renderAdvancedTab;

    patchMarkDirty();
    patchShowPanelProperties();
    patchApplyRefresh();

    // Pre-warm schema for the currently selected source
    var srcSel = $('#aiSourceSel');
    if (srcSel) {
      fetchSchema(srcSel.value || '');
      srcSel.addEventListener('change', function () { fetchSchema(srcSel.value || ''); });
    } else {
      fetchSchema('');
    }

    // Re-patch if scripts re-define (defensive)
    var observer = new MutationObserver(debounce(function () {
      patchMarkDirty();
      patchShowPanelProperties();
      patchApplyRefresh();
    }, 200));
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // ─── Public API ───────────────────────────────────────────────
  function updateSelectedPanelDataConfig(uid, partial) {
    var panel = window.__aiPanelData && window.__aiPanelData[uid];
    if (!panel) return;
    panel.dataConfig = Object.assign({}, panel.dataConfig || {}, partial || {});
  }

  /** Rebuild panel.dataConfig from its current structuredRequest + result so the
   *  Data tab and the saved dashboard JSON stay in sync after edits.            */
  function rebuildDataConfig(panel) {
    if (!panel) return;
    var sr = panel.structuredRequest || {};
    var dim = (sr.dimensions || [])[0] || null;
    var met = (sr.metrics || [])[0] || null;
    var table = sr.focusArea || (panel.dataConfig && panel.dataConfig.table) || null;
    var preview = [];
    var labels = panel.labels || [];
    var values = panel.values || [];
    for (var i = 0; i < Math.min(labels.length, values.length, 10); i++) {
      var row = {};
      if (dim) row[dim] = labels[i];
      if (met) row[met] = values[i];
      preview.push(row);
    }
    var prevSrc = panel.dataConfig || {};
    // Resolve sourceName from the UI selector when possible
    var sourceName = prevSrc.sourceName || null;
    try {
      var sel = document.getElementById('aiSourceSel');
      var sid = panel.dataSourceId || prevSrc.sourceId || null;
      if (sel && sid != null) {
        for (var i = 0; i < sel.options.length; i++) {
          if (String(sel.options[i].value) === String(sid)) { sourceName = sel.options[i].text; break; }
        }
      }
      if (!sourceName) sourceName = (sid ? ('Source #' + sid) : 'Internal Database');
    } catch (e) {}
    var dc = {
      sourceId: panel.dataSourceId || prevSrc.sourceId || null,
      sourceName: sourceName,
      table: table,
      xField: dim,
      yField: met,
      groupByField: dim,
      valueField: met,
      metricField: met || (String((sr.aggregation || '')).toLowerCase() === 'count' ? '*' : null),
      aggregation: (sr.aggregation || 'sum').toLowerCase(),
      filters: sr.filters || [],
      sortBy: sr.sort && sr.sort.field || null,
      sortDirection: sr.sort && sr.sort.direction || 'desc',
      topN: sr.limit || null,
      resultPreview: preview,
      currentValue: panel.kpiValue != null ? panel.kpiValue : (values.length === 1 ? values[0] : null),
      lastCalculatedAt: new Date().toISOString(),
    };
    dc.calculationLabel = buildCalculationLabel(dc);
    panel.dataConfig = dc;
    return dc;
  }

  function rebindPanel(uid) {
    var panel = window.__aiPanelData && window.__aiPanelData[uid];
    if (!panel) return;
    var state = window.__propState && window.__propState[uid];
    if (!state) return;
    // Pick the first available table for the source so the user has a starting point.
    var srcSel = $('#aiSourceSel');
    var sourceId = panel.dataSourceId || (srcSel ? srcSel.value : '') || '';
    fetchSchema(sourceId).then(function (schema) {
      var first = Object.keys(schema || {})[0];
      if (!first) { alert('No tables found in this source. Add a data source first.'); return; }
      state.editSR = { focusArea: first, dimensions: [], metrics: [], aggregation: panel.chartType === 'kpi' ? 'count' : 'sum', filters: [], sort: null, limit: 10 };
      state.dirty = true;
      panel._legacyInferred = false;
      window.showPanelProperties(uid);
    });
  }

  window.BX = {
    fetchSchema: fetchSchema,
    getCachedSchema: getCachedSchema,
    getColumns: getColumns,
    inferRole: inferRole,
    roleIcon: roleIcon,
    onSourceChange: onSourceChange,
    onTableChange: onTableChange,
    renderDataTab: renderDataTab,
    inferDataConfigForLegacyPanel: inferDataConfigForLegacyPanel,
    buildCalculationLabel: buildCalculationLabel,
    updateSelectedPanelDataConfig: updateSelectedPanelDataConfig,
    rebindPanel: rebindPanel,
    rebuildDataConfig: rebuildDataConfig,
    ensurePanelSR: ensurePanelSR,
    copySql: function (uid) {
      try {
        var box = document.getElementById('bxSqlBox-' + uid);
        var txt = box ? box.textContent : '';
        if (navigator.clipboard && txt) navigator.clipboard.writeText(txt);
      } catch (e) {}
    },
    advMarkDirty: function (uid) {
      var state = window.__propState && window.__propState[uid];
      if (!state) return;
      // Sync advanced builder inputs → state.editSR + panel.dataConfig, then apply
      var panel = window.__aiPanelData && window.__aiPanelData[uid];
      if (!panel) return;
      var v = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
      var t  = v('bxAdvTable-' + uid);
      var a  = v('bxAdvAgg-' + uid);
      var g  = v('bxAdvGroup-' + uid);
      var m  = v('bxAdvMetric-' + uid);
      var sf = v('bxAdvSortField-' + uid);
      var sd = v('bxAdvSortDir-' + uid);
      var lim = v('bxAdvLim-' + uid);

      state.dirty = true;
      state.tab = 'advanced';
      state.editSR = state.editSR || {};
      if (t != null) state.editSR.focusArea = String(t || '').trim();
      if (g != null) state.editSR.dimensions = String(g || '').trim() ? [String(g).trim()] : [];
      if (m != null) state.editSR.metrics = String(m || '').trim() ? [String(m).trim()] : [];
      if (a != null) state.editSR.aggregation = String(a || '').trim();
      if (lim != null) state.editSR.limit = parseInt(lim, 10) || state.editSR.limit;
      state.editSR.sort = { field: String(sf || '').trim(), direction: sd || 'desc' };

      updateSelectedPanelDataConfig(uid, {
        table: state.editSR.focusArea || null,
        groupByField: (state.editSR.dimensions && state.editSR.dimensions[0]) || null,
        valueField: (state.editSR.metrics && state.editSR.metrics[0]) || null,
        metricField: (state.editSR.metrics && state.editSR.metrics[0]) || null,
        aggregation: (state.editSR.aggregation || '').toLowerCase(),
        sortBy: state.editSR.sort && state.editSR.sort.field || null,
        sortDirection: state.editSR.sort && state.editSR.sort.direction || 'desc',
        topN: state.editSR.limit || null,
      });
      // Capture history snapshot
      state.queryHistory = state.queryHistory || [];
      state.queryHistory.push({ ts: new Date().toLocaleTimeString(), desc: 'Updated query builder settings', sr: JSON.parse(JSON.stringify(state.editSR)) });
      if (state.queryHistory.length > 8) state.queryHistory.shift();

      // Apply using existing pipeline (recalculate-panel)
      if (typeof window.aiPropApply === 'function') window.aiPropApply(uid);
    },
    advOnTableChange: function (uid) {
      // Re-render so fields dropdowns refresh to new table
      var state = window.__propState && window.__propState[uid];
      if (!state) return;
      state.dirty = true;
      window.showPanelProperties(uid);
      // schedule apply via advMarkDirty (reads current inputs)
      setTimeout(function () { window.BX.advMarkDirty(uid); }, 0);
    },
    advAddFilter: function (uid) {
      var state = window.__propState && window.__propState[uid];
      if (!state) return;
      state.editSR = state.editSR || {};
      state.editSR.filters = (state.editSR.filters || []).concat([{ column: '', operator: '=', value: '' }]);
      state.dirty = true;
      // Keep user in Advanced tab
      state.tab = 'advanced';
      window.showPanelProperties(uid);
    },
    undoQuery: function (uid, idx) {
      var state = window.__propState && window.__propState[uid];
      if (!state || !state.queryHistory || !state.queryHistory[idx]) return;
      var snap = state.queryHistory[idx];
      state.editSR = JSON.parse(JSON.stringify(snap.sr || {}));
      state.dirty = true;
      state.tab = 'advanced';
      // Apply undo
      if (typeof window.aiPropApply === 'function') window.aiPropApply(uid);
    },
    toggleSqlMode: function (uid, on) {
      var state = window.__propState && window.__propState[uid];
      if (!state) return;
      state.adv = state.adv || {};
      state.adv.sqlMode = !!on;
      state.adv.sqlErr = null;
      state.adv.sqlMsg = null;
      state.tab = 'advanced';
      window.showPanelProperties(uid);
    },
    validateSql: function (uid) {
      var state = window.__propState && window.__propState[uid];
      var panel = window.__aiPanelData && window.__aiPanelData[uid];
      if (!state || !panel) return;
      state.adv = state.adv || {};
      var ta = document.getElementById('bxAdvSqlText-' + uid);
      var sql = ta ? ta.value : '';
      state.adv.sqlText = sql;
      state.adv.sqlErr = null;
      state.adv.sqlMsg = null;

      var forbidden = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|REPLACE|ATTACH|DETACH|PRAGMA)\b/i;
      if (forbidden.test(sql)) { state.adv.sqlErr = 'Blocked: destructive SQL keywords detected.'; window.showPanelProperties(uid); return; }
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) { state.adv.sqlErr = 'Only SELECT queries are allowed.'; window.showPanelProperties(uid); return; }
      if (panel.dataSourceId) { state.adv.sqlErr = 'Advanced SQL Mode is only available for the Internal Database.'; window.showPanelProperties(uid); return; }
      state.adv.sqlMsg = 'Looks safe. Click Apply SQL to run it.';
      window.showPanelProperties(uid);
    },
    applySql: function (uid) {
      var state = window.__propState && window.__propState[uid];
      var panel = window.__aiPanelData && window.__aiPanelData[uid];
      if (!state || !panel) return;
      state.adv = state.adv || {};
      var ta = document.getElementById('bxAdvSqlText-' + uid);
      var sql = ta ? ta.value : '';
      state.adv.sqlText = sql;
      state.adv.sqlErr = null;
      state.adv.sqlMsg = null;
      if (panel.dataSourceId) { state.adv.sqlErr = 'Advanced SQL Mode is only available for the Internal Database.'; window.showPanelProperties(uid); return; }
      fetch('/dashboard/recalculate-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql, dataSourceId: null, structuredRequest: Object.assign({}, state.editSR || {}, { chartPreference: (panel.chartType || 'bar') }) })
      }).then(function (r) { return r.json(); }).then(function (updated) {
        if (updated && updated.error) { state.adv.sqlErr = updated.error; window.showPanelProperties(uid); return; }
        // Apply result to panel (mirror aiPropApply behavior)
        try { if (window.__aiCharts && window.__aiCharts[uid]) { window.__aiCharts[uid].destroy(); delete window.__aiCharts[uid]; } } catch (e) {}
        try { if (window.__aiECharts && window.__aiECharts[uid]) { window.__aiECharts[uid].dispose(); delete window.__aiECharts[uid]; } } catch (e) {}
        panel.chartConfig = updated.chartConfig;
        panel.chartEngine = updated.chartEngine || 'chartjs';
        panel.labels = updated.labels || [];
        panel.values = updated.values || [];
        panel.tableData = updated.tableData || panel.tableData;
        panel.hasData = updated.hasData;
        panel.aiInsight = updated.aiInsight || panel.aiInsight;
        // Keep structuredRequest as-is; dataConfig rebuild comes from result
        rebuildDataConfig(panel);

        var card = document.getElementById('aiCard-' + uid);
        if (card && panel.hasData) {
          var bodyEl = card.querySelector('[data-ai-panel-body]');
          if (bodyEl) {
            if (panel.chartEngine === 'echarts' && panel.chartConfig && panel.chartType !== 'table') {
              bodyEl.innerHTML = '<div id="aiEChart-' + uid + '" style="width:100%;height:100%;min-height:220px"></div>';
              requestAnimationFrame(function () { if (typeof window.aiRenderEChart === 'function') window.aiRenderEChart(uid, panel); });
            } else if (panel.chartType === 'table') {
              bodyEl.innerHTML = (typeof window.aiBuildTableHTML === 'function') ? window.aiBuildTableHTML(panel) : bodyEl.innerHTML;
            } else if (panel.chartType === 'cards') {
              bodyEl.innerHTML = '<div id="aiCardBody-' + uid + '" style="display:flex;flex-wrap:wrap;gap:7px;padding:4px"></div>';
              if (typeof window.aiRenderCardsInPanel === 'function') window.aiRenderCardsInPanel(uid, panel);
            } else if (panel.chartConfig && typeof Chart !== 'undefined') {
              bodyEl.innerHTML = '<div style="position:relative;flex:1;min-height:0"><canvas id="aiChartCanvas-' + uid + '"></canvas></div>';
              requestAnimationFrame(function () {
                var cv = document.getElementById('aiChartCanvas-' + uid); if (!cv) return;
                var cfg = JSON.parse(JSON.stringify(panel.chartConfig));
                cfg.options = cfg.options || {}; cfg.options.animation = false; cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
                window.__aiCharts[uid] = new Chart(cv.getContext('2d'), cfg);
              });
            }
          }
        }
        // History
        state.queryHistory = state.queryHistory || [];
        state.queryHistory.push({ ts: new Date().toLocaleTimeString(), desc: 'Applied custom SQL', sr: JSON.parse(JSON.stringify(state.editSR || {})) });
        if (state.queryHistory.length > 8) state.queryHistory.shift();
        state.adv.sqlMsg = 'SQL applied successfully.';
        window.showPanelProperties(uid);
      }).catch(function (e) {
        state.adv.sqlErr = e.message || String(e);
        window.showPanelProperties(uid);
      });
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
