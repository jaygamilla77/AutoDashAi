/* eslint-disable */
/**
 * Executive Dashboard — Shared Renderer
 *
 * A self-contained, read-only port of the Edit Canvas's
 * `_aiExecutiveDashboardRender` (views/ai-builder.ejs ~line 2276) so that
 * Shared Link / Print / PDF / PNG views render with the same visual structure
 * as the canvas.
 *
 * Exposes:
 *   window.AutoDashRender.renderExecutiveDashboard(data, gridEl, opts?)
 *
 * Visual parity rules (do NOT diverge without updating the canvas as well):
 *   • Light premium hero header (white card, slate text, calm accent pills)
 *   • Boardroom executive summary with right-side snapshot pills (≥1100px)
 *   • Subtle anomaly alert (warm orange, dismissible)
 *   • Calm KPI strip (muted blues / slates, no loud gradients)
 *   • Sectioned chart grid with the same ordering, accents and panel heights
 *   • Top-N insight strip (CRITICAL=red, HIGH=amber, others calm)
 *   • Collapsible data tables footer
 */
(function() {
  'use strict';

  // ── Module-local state (one renderer per page) ────────────────────────────
  var ECHARTS = {};
  var CHARTS  = {};
  var PANEL_DATA = {};
  var PANEL_CTR = 0;

  // ── Utility helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function fmtNum(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return String(v);
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return n % 1 !== 0 ? n.toFixed(2) : String(n);
  }

  // ── Panel renderer (read-only) ────────────────────────────────────────────
  function buildTableHTML(panel) {
    if (!panel.tableData || !panel.tableData.rows || !panel.tableData.rows.length) {
      return '<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:0.8rem">' +
             '<i class="bi bi-inbox" style="font-size:1.5rem;display:block;opacity:0.3;margin-bottom:6px"></i>No data</div>';
    }
    var cols = panel.tableData.columns || [];
    var rows = panel.tableData.rows || [];
    return '<div style="height:100%;overflow:auto"><table class="table table-sm table-striped mb-0">' +
      '<thead class="table-light" style="position:sticky;top:0;z-index:1"><tr>' +
      cols.map(function(c) { return '<th style="font-size:0.68rem;white-space:nowrap">' + esc(String(c)) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.slice(0, 100).map(function(r) {
        return '<tr>' + cols.map(function(c) {
          return '<td style="font-size:0.68rem">' + esc(String(r[c] != null ? r[c] : '-')) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderCardsBody(uid, panel, palette) {
    var el = document.getElementById('shCardBody-' + uid);
    if (!el || !panel.labels) return;
    var pal = (palette && palette.length) ? palette : ['#0ea5e9','#6366f1','#0891b2','#475569','#334155','#1e40af'];
    el.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;padding:8px;justify-content:center;align-content:flex-start';
    el.innerHTML = (panel.labels || []).slice(0, 20).map(function(lbl, i) {
      var val = panel.values && panel.values[i] != null ? panel.values[i] : '-';
      var color = pal[i % pal.length];
      return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 12px;min-width:110px;flex:1;text-align:center;border-top:3px solid ' + color + ';box-shadow:0 1px 4px rgba(0,0,0,0.04)">' +
             '<div style="font-size:1.2rem;font-weight:800;color:' + color + ';line-height:1">' + esc(fmtNum(val)) + '</div>' +
             '<div style="font-size:0.66rem;color:#6b7280;margin-top:6px;text-transform:uppercase;letter-spacing:0.3px">' + esc(lbl) + '</div>' +
             '</div>';
    }).join('');
  }

  /** Render a single panel (chart/card/table) into a wrapper div. */
  function renderPanel(panel, wrapper, palette) {
    var uid = 'sh' + (++PANEL_CTR);
    panel._uid = uid;
    PANEL_DATA[uid] = panel;

    var card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#fff;overflow:hidden';

    // Panel header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#f8fafc;padding:8px 10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:6px;flex-shrink:0';
    hdr.innerHTML =
      '<span style="font-size:0.56rem;background:#0ea5e9;color:#fff;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0">AI</span>' +
      '<span style="font-size:0.78rem;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(panel.title || 'Panel') + '</span>';
    card.appendChild(hdr);

    // Body
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;padding:8px;overflow:hidden;display:flex;flex-direction:column';

    var isECharts = panel.chartEngine === 'echarts' ||
      (!panel.chartEngine && panel.chartConfig &&
       (panel.chartConfig.series !== undefined ||
        panel.chartConfig.xAxis  !== undefined ||
        panel.chartConfig.tooltip !== undefined));

    if (!panel.hasData) {
      body.innerHTML = '<div style="text-align:center;padding:2rem;color:#9ca3af;font-size:0.82rem">' +
                      '<i class="bi bi-inbox" style="font-size:1.8rem;display:block;opacity:0.3;margin-bottom:6px"></i>No data</div>';
    } else if (panel.chartType === 'cards') {
      body.innerHTML = '<div id="shCardBody-' + uid + '"></div>';
    } else if (panel.chartType === 'table' || !panel.chartConfig) {
      body.innerHTML = buildTableHTML(panel);
    } else if (isECharts) {
      body.innerHTML = '<div id="shEChart-' + uid + '" style="width:100%;height:100%;min-height:220px"></div>';
    } else {
      body.innerHTML = '<div style="position:relative;flex:1;min-height:0"><canvas id="shChartCanvas-' + uid + '"></canvas></div>';
    }
    card.appendChild(body);

    // Per-panel insight overlay (matches canvas)
    if (panel.aiInsight) {
      var insightOverlay = document.createElement('div');
      insightOverlay.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:7px 10px;background:linear-gradient(0deg,rgba(15,23,42,0.82) 0%,rgba(15,23,42,0) 100%);font-size:0.62rem;color:rgba(255,255,255,0.92);line-height:1.45;pointer-events:none;border-radius:0 0 12px 12px';
      insightOverlay.innerHTML = '<i class="bi bi-stars" style="color:#a5b4fc;margin-right:3px"></i>' + esc(panel.aiInsight);
      wrapper.appendChild(card);
      wrapper.appendChild(insightOverlay);
    } else {
      wrapper.appendChild(card);
    }

    // Defer chart construction so layout settles first
    setTimeout(function() {
      try {
        if (panel.chartType === 'cards') {
          renderCardsBody(uid, panel, palette);
        } else if (isECharts && panel.chartConfig && panel.chartType !== 'table') {
          var el = document.getElementById('shEChart-' + uid);
          if (el && typeof echarts !== 'undefined') {
            var inst = echarts.init(el);
            // Disable echarts animation for stable html2canvas / print snapshot
            var opt = JSON.parse(JSON.stringify(panel.chartConfig));
            opt.animation = false;
            inst.setOption(opt);
            ECHARTS[uid] = inst;
          }
        } else if (panel.chartConfig && panel.chartType !== 'table') {
          var cv = document.getElementById('shChartCanvas-' + uid);
          if (cv && typeof Chart !== 'undefined') {
            var cfg = JSON.parse(JSON.stringify(panel.chartConfig));
            cfg.options = cfg.options || {};
            cfg.options.animation = false;
            cfg.options.responsive = true;
            cfg.options.maintainAspectRatio = false;
            CHARTS[uid] = new Chart(cv.getContext('2d'), cfg);
            setTimeout(function() { try { CHARTS[uid].resize(); } catch (e) {} }, 80);
          }
        }
      } catch (e) {
        console.error('[shared-renderer] panel render failed:', panel.title, e);
      }
    }, 30);
  }

  // ── Insights strip (calm-first, port of injectInsightsStrip) ──────────────
  function injectInsightsStrip(insights, gridEl) {
    var old = document.getElementById('aiInsightsStrip');
    if (old) old.remove();
    if (!insights || !insights.length || !gridEl) return null;

    var RISK_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    var sorted = insights.slice().sort(function(a, b) {
      var r = (RISK_RANK[b.riskLevel] || 0) - (RISK_RANK[a.riskLevel] || 0);
      if (r !== 0) return r;
      return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
    });

    var palette = {
      critical: { bg:'#fef2f2', border:'#fecaca', text:'#991b1b', accent:'#ef4444', label:'Strategic Risk' },
      high:     { bg:'#fff7ed', border:'#fed7aa', text:'#9a3412', accent:'#f97316', label:'Needs Attention' },
      medium:   { bg:'#f8fafc', border:'#e2e8f0', text:'#334155', accent:'#64748b', label:'Observation' },
      low:      { bg:'#f0f9ff', border:'#bae6fd', text:'#0c4a6e', accent:'#0ea5e9', label:'Recommendation' },
      success:  { bg:'#f0fdf4', border:'#bbf7d0', text:'#14532d', accent:'#22c55e', label:'Positive Trend' },
    };
    function paletteFor(ins) {
      if (ins.riskLevel === 'CRITICAL') return palette.critical;
      if (ins.riskLevel === 'HIGH')     return palette.high;
      if (ins.level === 'success')      return palette.success;
      if (ins.riskLevel === 'MEDIUM')   return palette.medium;
      return palette.low;
    }
    function riskBadge(risk) {
      if (risk === 'CRITICAL') return { bg:'#fee2e2', fg:'#991b1b' };
      if (risk === 'HIGH')     return { bg:'#ffedd5', fg:'#9a3412' };
      if (risk === 'MEDIUM')   return { bg:'#f1f5f9', fg:'#475569' };
      return { bg:'#e0f2fe', fg:'#075985' };
    }

    function renderCard(ins) {
      var p = paletteFor(ins);
      var risk = ins.riskLevel || 'LOW';
      var rb = riskBadge(risk);
      var conf = Number.isFinite(Number(ins.confidence)) ? Math.round(Number(ins.confidence)) : null;
      var observation = ins.observation || ins.text || '';
      var impact = ins.businessImpact || '';
      var rec = ins.recommendation || '';
      return '<div style="flex:1 1 280px;min-width:240px;max-width:520px;background:' + p.bg + ';border:1px solid ' + p.border + ';' +
        'border-left:3px solid ' + p.accent + ';border-radius:10px;padding:10px 13px;display:flex;flex-direction:column;gap:6px;box-shadow:0 1px 2px rgba(15,23,42,0.03)">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:0.85rem;line-height:1;opacity:0.85">' + (ins.icon || '◆') + '</span>' +
          '<span style="font-size:0.8rem;font-weight:700;color:' + p.text + ';flex:1;letter-spacing:-0.01em;line-height:1.25">' + esc(ins.title || p.label) + '</span>' +
          '<span style="background:' + rb.bg + ';color:' + rb.fg + ';font-size:0.55rem;font-weight:700;letter-spacing:0.5px;padding:1px 6px;border-radius:999px;text-transform:uppercase">' + esc(risk) + '</span>' +
        '</div>' +
        (observation ? ('<div style="font-size:0.74rem;color:#1e293b;line-height:1.45">' + esc(observation) + '</div>') : '') +
        (impact ? ('<div style="font-size:0.7rem;color:#475569;line-height:1.45"><span style="font-size:0.55rem;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:#64748b;margin-right:4px">Impact:</span>' + esc(impact) + '</div>') : '') +
        (rec ? ('<div style="border-top:1px solid ' + p.border + ';padding-top:5px;font-size:0.72rem;color:#1e293b;line-height:1.45;font-weight:500">' +
          '<span style="font-size:0.55rem;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:' + p.text + ';margin-right:4px">Action:</span>' + esc(rec) + '</div>') : '') +
        (conf != null ? ('<div style="display:flex;align-items:center;gap:6px">' +
          '<div style="flex:1;height:3px;background:#e5e7eb;border-radius:999px;overflow:hidden">' +
            '<div style="width:' + conf + '%;height:100%;background:' + p.accent + ';opacity:0.85"></div>' +
          '</div>' +
          '<span style="font-size:0.62rem;font-weight:700;color:' + p.text + '">' + conf + '%</span>' +
        '</div>') : '') +
      '</div>';
    }

    var TOP_N = 3;
    var top = sorted.slice(0, TOP_N);
    var more = sorted.slice(TOP_N);

    var strip = document.createElement('div');
    strip.id = 'aiInsightsStrip';
    strip.style.cssText = 'position:relative;z-index:1;padding:10px 14px 12px;background:#ffffff;border:1px solid #f1f5f9;border-radius:14px';
    strip.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<i class="bi bi-lightbulb" style="color:#0ea5e9;font-size:0.8rem"></i>' +
        '<span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.7px;font-weight:700;color:#0f172a">Key Insights</span>' +
        '<span style="font-size:0.66rem;color:#94a3b8">' + insights.length + ' detected · showing top ' + Math.min(TOP_N, insights.length) + '</span>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px">' + top.map(renderCard).join('') + '</div>' +
      (more.length ? (
        '<div id="aiInsightsMoreWrap" style="display:none;flex-wrap:wrap;gap:10px;margin-top:10px">' + more.map(renderCard).join('') + '</div>' +
        '<button type="button" id="aiInsightsToggle" style="margin-top:10px;background:transparent;border:1px solid #e2e8f0;color:#475569;font-size:0.7rem;font-weight:600;padding:5px 11px;border-radius:7px;cursor:pointer">' +
          '<i class="bi bi-chevron-down me-1"></i>Show all ' + insights.length + ' insights' +
        '</button>'
      ) : '');

    return strip;
  }

  // ── Main renderer (mirrors _aiExecutiveDashboardRender) ───────────────────
  function renderExecutiveDashboard(data, gridEl, opts) {
    opts = opts || {};
    if (!gridEl) return;

    // Reset module state for re-renders
    PANEL_CTR = 0;
    PANEL_DATA = {};
    Object.keys(ECHARTS).forEach(function(k) { try { ECHARTS[k].dispose(); } catch (e) {} });
    Object.keys(CHARTS).forEach(function(k)  { try { CHARTS[k].destroy();  } catch (e) {} });
    ECHARTS = {}; CHARTS = {};

    gridEl.innerHTML = '';

    var panels = data.panels || [];
    var palette = data.palette || ['#0ea5e9','#6366f1','#0891b2','#475569','#334155','#1e40af'];
    var canvasW = gridEl.clientWidth || (gridEl.parentNode ? gridEl.parentNode.clientWidth : 960) || 960;
    var gap = 12;
    var pageX = 14;

    // 1. Premium light header
    var headerDiv = document.createElement('div');
    headerDiv.id = 'aiFullDashHeader';
    headerDiv.style.cssText = 'background:#ffffff;padding:14px 18px 12px;border-bottom:1px solid #f1f5f9;border-radius:10px';
    var roleText = esc(data.dashboardRole || 'Executive Dashboard');
    var subtitleText = esc(data.dashboardSubtitle || 'AI-Generated Overview');
    headerDiv.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:0.58rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1.1px;margin-bottom:3px">Executive Briefing</div>' +
          '<div style="font-size:1.25rem;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.1">' + roleText + '</div>' +
          '<div style="font-size:0.72rem;color:#64748b;margin-top:2px">' + subtitleText + ' · ' +
            new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<span style="font-size:0.66rem;padding:4px 10px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:600;letter-spacing:0.3px"><i class="bi bi-stars me-1"></i>AI-Curated</span>' +
          '<span style="font-size:0.66rem;padding:4px 10px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:600;letter-spacing:0.3px">' +
            panels.filter(function(p) { return p.chartType !== 'table'; }).length + ' visuals</span>' +
        '</div>' +
      '</div>';
    gridEl.appendChild(headerDiv);

    // 2. Executive summary (boardroom briefing + snapshot pills)
    var summary = data.executiveSummary || '';
    if (summary && summary.length > 20) {
      var sumDiv = document.createElement('div');
      sumDiv.id = 'aiFullDashSummary';
      sumDiv.style.cssText = 'margin:' + gap + 'px ' + pageX + 'px 0;padding:14px 18px;background:#fafafa;border:1px solid #f1f5f9;border-radius:10px';

      var labelTokens = ['Primary Risk','Business Impact','Recommended Focus','Recommendation','Risk','Impact','Focus','Opportunity','Action','Headline','Bottom Line'];
      var formatted = esc(summary);
      labelTokens.forEach(function(tok) {
        var re = new RegExp('(^|[\\.\\s])(' + tok + ')\\s*:', 'g');
        formatted = formatted.replace(re, function(_, pre, label) {
          return (pre === '^' ? '' : pre) +
            '<span style="display:inline-block;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.7px;font-weight:700;color:#4338ca;margin-right:6px">' + label + '</span>';
        });
      });

      var conf = (data.confidence != null) ? Math.round(Number(data.confidence)) :
                 (data.aiConfidence != null ? Math.round(Number(data.aiConfidence)) : null);
      var kpiCount = (data.kpiData || []).length;
      var visualCount = panels.filter(function(p) { return p.chartType !== 'table'; }).length;
      var dominantTrend = null;
      try {
        var ups = 0, downs = 0;
        (data.kpiData || []).forEach(function(k) {
          if (k.trendDirection === 'up') ups++;
          else if (k.trendDirection === 'down') downs++;
        });
        if (ups > downs) dominantTrend = { label:'Net Trend', value:'Improving', color:'#16a34a', icon:'bi-arrow-up-right' };
        else if (downs > ups) dominantTrend = { label:'Net Trend', value:'Declining', color:'#dc2626', icon:'bi-arrow-down-right' };
        else if (ups || downs) dominantTrend = { label:'Net Trend', value:'Mixed', color:'#64748b', icon:'bi-dash' };
      } catch (e) {}
      var hasCritical = (data.insights || []).some(function(i) { return i.riskLevel === 'CRITICAL'; });
      var riskPill = hasCritical
        ? { label:'Risk Level', value:'Critical', color:'#dc2626', icon:'bi-shield-exclamation' }
        : { label:'Risk Level', value:'Stable',   color:'#0ea5e9', icon:'bi-shield-check' };

      var snapshotItems = [];
      snapshotItems.push(riskPill);
      if (dominantTrend) snapshotItems.push(dominantTrend);
      if (conf != null) snapshotItems.push({ label:'AI Confidence', value: conf + '%', color:'#6366f1', icon:'bi-cpu' });
      snapshotItems.push({ label:'Coverage', value: kpiCount + ' KPIs · ' + visualCount + ' charts', color:'#475569', icon:'bi-layout-text-window' });

      var snapshotHtml = snapshotItems.map(function(it) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #e5e7eb">' +
          '<i class="bi ' + it.icon + '" style="font-size:0.78rem;color:' + it.color + ';flex-shrink:0;width:14px"></i>' +
          '<span style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.6px;font-weight:600;color:#94a3b8;flex:1">' + it.label + '</span>' +
          '<span style="font-size:0.74rem;font-weight:700;color:' + it.color + '">' + it.value + '</span>' +
        '</div>';
      }).join('');

      var sideBySide = canvasW >= 1100;
      sumDiv.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
          '<i class="bi bi-robot" style="color:#6366f1;font-size:0.8rem"></i>' +
          '<span style="font-size:0.58rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.9px">Executive Briefing</span>' +
          '<span style="margin-left:auto;font-size:0.62rem;color:#94a3b8">' +
            new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:' + (sideBySide ? 'minmax(0,1fr) 240px' : '1fr') + ';gap:' + (sideBySide ? '22px' : '12px') + ';align-items:start">' +
          '<div style="font-size:0.82rem;color:#1e293b;line-height:1.55">' + formatted + '</div>' +
          (sideBySide
            ? '<div style="border-left:1px solid #e5e7eb;padding-left:18px">' +
                '<div style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.7px;font-weight:700;color:#475569;margin-bottom:4px">Executive Snapshot</div>' +
                snapshotHtml +
              '</div>'
            : '') +
        '</div>';
      gridEl.appendChild(sumDiv);
    }

    // 3. AI Insights strip — placed right after summary (matches canvas)
    try {
      var insightsArr = (data.insights || []).slice();
      if (Array.isArray(data.topAnomalies) && data.topAnomalies.length) {
        var seen = {};
        insightsArr.forEach(function(i) { if (i && i.title) seen[i.title.toLowerCase()] = 1; });
        data.topAnomalies.forEach(function(a) {
          if (!a || !a.title) return;
          if (seen[a.title.toLowerCase()]) return;
          insightsArr.push({
            title: a.title, observation: a.observation, businessImpact: a.businessImpact,
            recommendation: a.recommendation, riskLevel: a.riskLevel, confidence: a.confidence,
            level: a.riskLevel === 'CRITICAL' || a.riskLevel === 'HIGH' ? 'warning'
                 : a.riskLevel === 'MEDIUM' ? 'info' : 'success',
          });
        });
      }
      var strip = injectInsightsStrip(insightsArr, gridEl);
      if (strip) {
        strip.style.margin = gap + 'px ' + pageX + 'px 0';
        gridEl.appendChild(strip);
        // Wire up "show more" toggle
        var btn = strip.querySelector('#aiInsightsToggle');
        var moreWrap = strip.querySelector('#aiInsightsMoreWrap');
        if (btn && moreWrap) {
          btn.addEventListener('click', function() {
            var open = moreWrap.style.display !== 'none';
            moreWrap.style.display = open ? 'none' : 'flex';
            btn.innerHTML = (open
              ? '<i class="bi bi-chevron-down me-1"></i>Show all ' + insightsArr.length + ' insights'
              : '<i class="bi bi-chevron-up me-1"></i>Show fewer');
          });
        }
      }
    } catch (e) { console.warn('[shared-renderer] insights strip failed', e); }

    // 4. Subtle anomaly alert
    if (data.anomalyAlert) {
      var alertDiv = document.createElement('div');
      alertDiv.id = 'aiFullDashAlert';
      alertDiv.style.cssText = 'margin:' + gap + 'px ' + pageX + 'px 0;display:flex;align-items:center;gap:10px;padding:8px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:0.74rem;color:#9a3412';
      alertDiv.innerHTML =
        '<i class="bi bi-exclamation-triangle" style="color:#f97316;font-size:1rem;flex-shrink:0"></i>' +
        '<div style="flex:1"><strong style="color:#7c2d12">Heads up — </strong>' + esc(data.anomalyAlert) + '</div>';
      gridEl.appendChild(alertDiv);
    }

    // 5. KPI strip (calm muted blues / slates)
    var kpiData = data.kpiData || [];
    if (kpiData.length > 0) {
      var kpiSectionWrap = document.createElement('div');
      kpiSectionWrap.id = 'aiFullDashKpiStrip';
      kpiSectionWrap.style.cssText = 'margin:' + gap + 'px ' + pageX + 'px 0';
      kpiSectionWrap.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">' +
          '<div style="width:3px;height:12px;border-radius:2px;background:#0ea5e9"></div>' +
          '<span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.7px;font-weight:700;color:#0f172a">Key Metrics</span>' +
        '</div>';
      var kpiGrid = document.createElement('div');
      kpiGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px';
      kpiData.forEach(function(kpi, ki) {
        var calmColors = ['#0ea5e9','#6366f1','#0891b2','#475569','#334155','#1e40af'];
        var color = kpi.color || calmColors[ki % calmColors.length];
        if (kpi.status === 'danger')  color = '#ef4444';
        if (kpi.status === 'warning') color = '#f97316';
        var trendColor = kpi.trendDirection === 'up' ? '#16a34a' : kpi.trendDirection === 'down' ? '#dc2626' : '#94a3b8';
        var trendIcon  = kpi.trendDirection === 'up' ? 'bi-arrow-up-short' : kpi.trendDirection === 'down' ? 'bi-arrow-down-short' : 'bi-dash';
        var kpiCard = document.createElement('div');
        kpiCard.style.cssText = 'background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;animation:aiSlideIn 0.3s ease ' + (ki * 0.04) + 's both';
        kpiCard.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<div style="font-size:0.56rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;display:flex;align-items:center;gap:5px">' +
              '<i class="bi ' + (kpi.icon || 'bi-bar-chart-fill') + '" style="font-size:0.72rem;color:' + color + '"></i>' +
              esc(kpi.label || '') +
            '</div>' +
            (kpi.trend ? '<div style="font-size:0.66rem;font-weight:600;color:' + trendColor + ';display:flex;align-items:center;gap:1px"><i class="bi ' + trendIcon + '"></i>' + esc(kpi.trend) + '</div>' : '') +
          '</div>' +
          '<div style="font-size:1.45rem;font-weight:700;color:#0f172a;line-height:1.1;letter-spacing:-0.02em">' + esc(kpi.value || '—') + '</div>' +
          (kpi.subtitle ? '<div style="font-size:0.66rem;color:#94a3af;margin-top:2px">' + esc(kpi.subtitle) + '</div>' : '');
        kpiGrid.appendChild(kpiCard);
      });
      kpiSectionWrap.appendChild(kpiGrid);
      gridEl.appendChild(kpiSectionWrap);
    }

    // 6. Sectioned chart grid
    var chartPanels = panels.filter(function(p) {
      if (p.chartType === 'table') return false;
      var sec = (p._section || p.section || '').toLowerCase();
      var isKpi = p.chartType === 'cards' || p.type === 'kpi';
      if (isKpi && sec.indexOf('key performance') === 0) return false;
      return true;
    });
    var tablePanels = panels.filter(function(p) { return p.chartType === 'table'; });

    var sectionOrder = ['Executive Summary','Performance Overview','Performance Trends','Trend Analysis','Top Performers','Distribution & Breakdown','Strategic Breakdown','Operational Detail','Operational Snapshot','Risk & Alerts'];
    var sectionStyles = {
      'Executive Summary':        { accent:'#312e81', icon:'bi-graph-up-arrow' },
      'Performance Overview':     { accent:'#0ea5e9', icon:'bi-speedometer2' },
      'Performance Trends':       { accent:'#0ea5e9', icon:'bi-activity' },
      'Trend Analysis':           { accent:'#6366f1', icon:'bi-activity' },
      'Top Performers':           { accent:'#0891b2', icon:'bi-trophy' },
      'Distribution & Breakdown': { accent:'#8b5cf6', icon:'bi-pie-chart-fill' },
      'Strategic Breakdown':      { accent:'#8b5cf6', icon:'bi-pie-chart-fill' },
      'Operational Detail':       { accent:'#475569', icon:'bi-kanban-fill' },
      'Operational Snapshot':     { accent:'#475569', icon:'bi-kanban-fill' },
      'Risk & Alerts':            { accent:'#dc2626', icon:'bi-exclamation-diamond-fill' },
    };
    var sectionGroups = {};
    chartPanels.forEach(function(p) {
      var sec = p._section || p.section || 'Performance Overview';
      if (!sectionGroups[sec]) sectionGroups[sec] = [];
      sectionGroups[sec].push(p);
    });

    var chartContainer = document.createElement('div');
    chartContainer.id = 'aiFullDashSections';
    chartContainer.style.cssText = 'padding:0 ' + pageX + 'px ' + pageX + 'px;margin-top:' + gap + 'px;display:flex;flex-direction:column;gap:14px';

    var orderedSections = sectionOrder.filter(function(s) {
      return Object.keys(sectionGroups).some(function(k) {
        return k.toLowerCase().indexOf(s.toLowerCase()) === 0 || s === k;
      }) && sectionGroups[s] && sectionGroups[s].length;
    });
    Object.keys(sectionGroups).forEach(function(s) { if (orderedSections.indexOf(s) === -1) orderedSections.push(s); });

    var colW = Math.max(260, Math.floor((canvasW - gap * 3) / 2));
    var panelH = 280;

    orderedSections.forEach(function(secName, secIdx) {
      var secPanels = sectionGroups[secName];
      var style = sectionStyles[secName] || { accent:'#475569', icon:'bi-grid' };

      var secHeader = document.createElement('div');
      secHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 0 0';
      secHeader.innerHTML =
        '<div style="width:3px;height:13px;border-radius:2px;background:' + style.accent + ';flex-shrink:0"></div>' +
        '<span style="font-size:0.64rem;font-weight:700;color:#0f172a;letter-spacing:0.5px;text-transform:uppercase">' + secName.replace(/^Strategic\s+/i, '') + '</span>';
      chartContainer.appendChild(secHeader);

      var allKpi = secPanels.length > 0 && secPanels.every(function(p) {
        return p.chartType === 'cards' || p.type === 'kpi';
      });
      var rowDiv = document.createElement('div');
      if (allKpi) {
        rowDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:' + gap + 'px';
      } else {
        rowDiv.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(' + Math.max(280, colW - 20) + 'px,1fr));gap:' + gap + 'px';
      }
      var rowPanelH = allKpi ? 120 : panelH;

      secPanels.forEach(function(panel, pi) {
        var wrapperDiv = document.createElement('div');
        wrapperDiv.style.cssText = 'height:' + rowPanelH + 'px;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);border:1px solid #e5e7eb;background:#fff;animation:aiSlideIn 0.35s ease ' + ((secIdx * 0.1) + (pi * 0.06)) + 's both;position:relative';
        renderPanel(panel, wrapperDiv, palette);
        rowDiv.appendChild(wrapperDiv);
      });
      chartContainer.appendChild(rowDiv);
    });

    gridEl.appendChild(chartContainer);

    // 7. Collapsible data tables
    if (tablePanels.length > 0) {
      var tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'padding:0 ' + pageX + 'px ' + pageX + 'px';
      var tableToggle = document.createElement('div');
      tableToggle.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;user-select:none';
      tableToggle.innerHTML =
        '<div style="width:3px;height:18px;border-radius:2px;background:#6b7280;flex-shrink:0"></div>' +
        '<i class="bi bi-table" style="font-size:0.85rem;color:#6b7280"></i>' +
        '<span style="font-size:0.78rem;font-weight:700;color:#6b7280">Data Tables (' + tablePanels.length + ')</span>' +
        '<i class="bi bi-chevron-down" style="color:#9ca3af;font-size:0.75rem;margin-left:auto"></i>';
      var tableBody = document.createElement('div');
      tableBody.style.display = opts.expandTables ? 'block' : 'none';
      var tableGrid = document.createElement('div');
      tableGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:' + gap + 'px';
      tablePanels.forEach(function(panel) {
        var tWrap = document.createElement('div');
        tWrap.style.cssText = 'height:260px;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);border:1px solid #e5e7eb;background:#fff;position:relative';
        renderPanel(panel, tWrap, palette);
        tableGrid.appendChild(tWrap);
      });
      tableToggle.addEventListener('click', function() {
        tableBody.style.display = tableBody.style.display === 'none' ? 'block' : 'none';
      });
      tableBody.appendChild(tableGrid);
      tableWrap.appendChild(tableToggle);
      tableWrap.appendChild(tableBody);
      gridEl.appendChild(tableWrap);
    }

    // 8. Finalise — resize charts after layout
    gridEl.style.minHeight = '600px';
    setTimeout(function() {
      Object.values(ECHARTS).forEach(function(ec) { try { ec.resize(); } catch (e) {} });
      Object.values(CHARTS).forEach(function(ch)  { try { ch.resize();  } catch (e) {} });
    }, 800);

    // Re-resize on window changes (for shared / print)
    if (!window.__autoDashResizeBound) {
      window.__autoDashResizeBound = true;
      window.addEventListener('resize', function() {
        Object.values(ECHARTS).forEach(function(ec) { try { ec.resize(); } catch (e) {} });
        Object.values(CHARTS).forEach(function(ch)  { try { ch.resize();  } catch (e) {} });
      });
      // Trigger an explicit resize before/after print
      if (typeof window.matchMedia === 'function') {
        try {
          window.matchMedia('print').addEventListener('change', function() {
            setTimeout(function() {
              Object.values(ECHARTS).forEach(function(ec) { try { ec.resize(); } catch (e) {} });
              Object.values(CHARTS).forEach(function(ch)  { try { ch.resize();  } catch (e) {} });
            }, 50);
          });
        } catch (e) {}
      }
    }
  }

  // Public API
  window.AutoDashRender = {
    renderExecutiveDashboard: renderExecutiveDashboard,
    injectInsightsStrip: injectInsightsStrip,
  };
})();
