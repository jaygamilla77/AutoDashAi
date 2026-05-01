/**
 * Dashboard Mini Preview & Template Preview Card
 * --------------------------------------------------
 * Renders rich, layout-accurate thumbnails for every built-in dashboard
 * template. Used by both the Templates & Themes page and the
 * "Choose a starting point" picker modal so visuals stay consistent.
 *
 * Public API:
 *   window.DashboardMiniPreview(type, accent)         -> HTML string
 *   window.TemplatePreviewCard(opts)                  -> HTMLElement
 *   window.resolveTemplatePreviewType(idOrName)       -> string
 *   window.getTemplateAccentColor(idOrName)           -> string
 */
(function () {
  'use strict';

  // ---------- Color helpers ----------
  function hexToRgb(hex) {
    if (!hex) return { r: 99, g: 102, b: 241 };
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function mix(hex, withHex, t) {
    var a = hexToRgb(hex), b = hexToRgb(withHex);
    var r = Math.round(a.r + (b.r - a.r) * t);
    var g = Math.round(a.g + (b.g - a.g) * t);
    var bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function lighten(hex, t) { return mix(hex, '#FFFFFF', t); }
  function darken(hex, t) { return mix(hex, '#0F172A', t); }

  // ---------- Type & accent resolution ----------
  var TYPE_META = {
    executive:   { accent: '#0EA5E9', category: 'Business',         icon: 'bi-bar-chart-line-fill', tint: 'linear-gradient(135deg,#E0F2FE,#BAE6FD)' },
    hr:          { accent: '#10B981', category: 'People',           icon: 'bi-people-fill',         tint: 'linear-gradient(135deg,#D1FAE5,#A7F3D0)' },
    sales:       { accent: '#F59E0B', category: 'Revenue',          icon: 'bi-graph-up-arrow',      tint: 'linear-gradient(135deg,#FEF3C7,#FDE68A)' },
    finance:     { accent: '#059669', category: 'Finance',          icon: 'bi-cash-coin',           tint: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)' },
    operations:  { accent: '#0891B2', category: 'Operations',       icon: 'bi-gear-fill',           tint: 'linear-gradient(135deg,#CFFAFE,#A5F3FC)' },
    support:     { accent: '#EC4899', category: 'Support',          icon: 'bi-headset',             tint: 'linear-gradient(135deg,#FCE7F3,#FBCFE8)' },
    project:     { accent: '#7C3AED', category: 'Delivery',         icon: 'bi-kanban-fill',         tint: 'linear-gradient(135deg,#F5F3FF,#DDD6FE)' },
    marketing:   { accent: '#EF4444', category: 'Marketing',        icon: 'bi-megaphone-fill',      tint: 'linear-gradient(135deg,#FEE2E2,#FECACA)' },
    it:          { accent: '#6366F1', category: 'IT Operations',    icon: 'bi-cpu-fill',            tint: 'linear-gradient(135deg,#EEF2FF,#C7D2FE)' },
    recruitment: { accent: '#14B8A6', category: 'Recruitment',      icon: 'bi-person-plus-fill',    tint: 'linear-gradient(135deg,#CCFBF1,#99F6E4)' },
    blank:       { accent: '#94A3B8', category: 'Custom',           icon: 'bi-plus-square-dotted',  tint: 'linear-gradient(135deg,#F1F5F9,#E2E8F0)' }
  };

  function resolveTemplatePreviewType(idOrName) {
    var s = (idOrName || '').toString().toLowerCase();
    if (!s) return 'blank';
    if (s.includes('exec'))                              return 'executive';
    if (s.includes('recruit'))                           return 'recruitment';
    if (s === 'hr' || s.includes('human') || s.includes(' hr '))
                                                         return 'hr';
    if (s.includes('sales'))                             return 'sales';
    if (s.includes('finance') || s.includes('financial'))return 'finance';
    if (s.includes('operation'))                         return 'operations';
    if (s.includes('support') || s.includes('customer service') || s.includes('helpdesk'))
                                                         return 'support';
    if (s.includes('project'))                           return 'project';
    if (s.includes('market'))                            return 'marketing';
    if (s.includes('it-service') || s.includes('it service') || s.startsWith('it') || s.includes('itsm'))
                                                         return 'it';
    if (s.includes('blank') || s.includes('custom'))     return 'blank';
    return 'blank';
  }
  function getTemplateAccentColor(idOrName) {
    var t = resolveTemplatePreviewType(idOrName);
    return TYPE_META[t].accent;
  }
  function getTemplateMeta(type) {
    return TYPE_META[type] || TYPE_META.blank;
  }

  // ---------- Shared building blocks ----------
  // Tiny sparkline path generator
  function sparkPath(values, width, height, padding) {
    if (!values || !values.length) return '';
    padding = padding == null ? 2 : padding;
    var w = width - padding * 2, h = height - padding * 2;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var range = max - min || 1;
    return values.map(function (v, i) {
      var x = padding + (i * w) / (values.length - 1);
      var y = padding + h - ((v - min) / range) * h;
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }
  function lineChartSVG(values, accent, width, height, opts) {
    opts = opts || {};
    var path = sparkPath(values, width, height, 4);
    var areaPath = path + ' L' + (width - 4) + ',' + (height - 4) + ' L4,' + (height - 4) + ' Z';
    var grid = '';
    if (opts.grid) {
      for (var i = 1; i < 4; i++) {
        var y = (height / 4) * i;
        grid += '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="#F1F5F9" stroke-width="1"/>';
      }
    }
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="display:block;width:100%;height:100%">' +
      grid +
      '<path d="' + areaPath + '" fill="' + rgba(accent, 0.18) + '"/>' +
      '<path d="' + path + '" fill="none" stroke="' + accent + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }
  function barsHTML(values, accent, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, values);
    var color = opts.color || accent;
    return values.map(function (v, i) {
      var h = (v / max) * 100;
      var c = Array.isArray(color) ? color[i % color.length] : color;
      return '<div style="flex:1;background:' + c + ';height:' + h + '%;border-radius:2px 2px 0 0;opacity:' + (opts.opacity != null ? opts.opacity : 0.85) + '"></div>';
    }).join('');
  }
  function donutCSS(accent, segments) {
    // segments: array of [color, percentage]
    var stops = [];
    var pos = 0;
    segments.forEach(function (s) {
      var next = pos + s[1];
      stops.push(s[0] + ' ' + pos + '% ' + next + '%');
      pos = next;
    });
    return 'background:conic-gradient(' + stops.join(',') + ')';
  }
  function kpiCard(label, value, accent, trend) {
    return (
      '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 7px;min-width:0">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + label + '</div>' +
        '<div style="font-size:11px;font-weight:700;color:#0F172A;line-height:1.1;margin-top:1px">' + value + '</div>' +
        (trend ? '<div style="font-size:6px;color:' + accent + ';font-weight:700;margin-top:1px">▲ ' + trend + '</div>' : '') +
      '</div>'
    );
  }
  function pillKpi(label, value, color) {
    return (
      '<div style="flex:1;background:' + color + ';border-radius:6px;padding:5px 7px;color:#fff;min-width:0">' +
        '<div style="font-size:6px;opacity:0.8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">' + label + '</div>' +
        '<div style="font-size:11px;font-weight:800;line-height:1.1;margin-top:1px">' + value + '</div>' +
      '</div>'
    );
  }
  function chartFrame(title, body, opts) {
    opts = opts || {};
    return (
      '<div style="flex:' + (opts.flex || 1) + ';background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;min-width:0;min-height:0">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden">' + title + '</div>' +
        '<div style="flex:1;display:flex;align-items:flex-end;gap:2px;min-height:0">' + body + '</div>' +
      '</div>'
    );
  }

  // ---------- Per-type previews ----------
  function previewExecutive(accent) {
    var sec = lighten(accent, 0.4);
    var c1 = accent, c2 = lighten(accent, 0.25), c3 = darken(accent, 0.15), c4 = lighten(accent, 0.55);
    return (
      kpiRow([
        ['Revenue', '$4.8M', accent, '12%'],
        ['Margin', '38%', accent, '4%'],
        ['Projects', '24', accent, null],
        ['Risks', '7', accent, null]
      ]) +
      '<div style="display:flex;gap:4px;padding:0 6px 4px;height:46px">' +
        chartFrame('Revenue Trend', lineChartSVG([20,35,28,52,46,60,55,72,68,80], accent, 100, 36, { grid: true }), { flex: 2 }) +
        '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
          '<div style="width:30px;height:30px;border-radius:50%;' + donutCSS(accent, [[c1,32],[c2,26],[c3,22],[c4,20]]) + ';position:relative">' +
            '<div style="position:absolute;inset:8px;background:#fff;border-radius:50%"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      tableMini(['Dept', 'Risk', 'Status'], [
        ['Sales', 'Low', accent],
        ['Ops', 'Med', sec],
        ['IT', 'High', darken(accent, 0.2)]
      ])
    );
  }

  function previewHR(accent) {
    return (
      kpiRow([
        ['Headcount', '486', accent, '3%'],
        ['Attendance', '94%', accent, '1%'],
        ['Attrition', '8.2%', accent, null]
      ]) +
      '<div style="display:flex;gap:4px;padding:0 6px 4px;height:42px">' +
        chartFrame('Attendance', '<div style="flex:1;display:flex;align-items:flex-end;gap:2px;height:100%">' + barsHTML([60, 72, 68, 80, 85, 78, 82], accent) + '</div>', { flex: 2 }) +
        chartFrame('Attrition', '<div style="flex:1;display:flex;align-items:flex-end;justify-content:center;height:100%">' +
          '<div style="width:28px;height:28px;border-radius:50%;' + donutCSS(accent, [[accent, 18], [lighten(accent, 0.6), 82]]) + ';position:relative">' +
            '<div style="position:absolute;inset:7px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:' + accent + '">8%</div>' +
          '</div>' +
        '</div>', { flex: 1 }) +
      '</div>' +
      tableMini(['Employee', 'Score', ''], [
        ['Anna K.', '92', accent],
        ['Mike R.', '88', accent],
        ['Sara L.', '85', accent]
      ])
    );
  }

  function previewSales(accent) {
    var c2 = lighten(accent, 0.25), c3 = lighten(accent, 0.5), c4 = lighten(accent, 0.7);
    return (
      kpiRow([
        ['Revenue', '$1.2M', accent, '18%'],
        ['Pipeline', '$3.4M', accent, '7%'],
        ['Win Rate', '34%', accent, null]
      ]) +
      '<div style="display:flex;gap:4px;padding:0 6px 4px;height:46px">' +
        // Funnel
        '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;justify-content:center;gap:2px">' +
          '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Pipeline</div>' +
          [['100%', accent], ['72%', c2], ['48%', c3], ['28%', c4]].map(function(r){
            return '<div style="margin:0 auto;width:'+r[0]+';height:5px;background:'+r[1]+';border-radius:1px"></div>';
          }).join('') +
        '</div>' +
        chartFrame('Sales Trend', lineChartSVG([15, 28, 22, 40, 35, 55, 48, 68], accent, 100, 36, { grid: true }), { flex: 2 }) +
      '</div>' +
      tableMini(['Product', 'Sold', ''], [
        ['Pro Plan', '128', accent],
        ['Starter', '94', accent],
        ['Add-on', '52', accent]
      ])
    );
  }

  function previewFinance(accent) {
    var c2 = lighten(accent, 0.2), c3 = lighten(accent, 0.4), c4 = lighten(accent, 0.6);
    return (
      kpiRow([
        ['Budget', '$8.2M', accent, null],
        ['Spend', '$5.4M', accent, null],
        ['Cash', '$2.8M', accent, '5%']
      ]) +
      '<div style="display:flex;gap:4px;padding:0 6px 4px;height:46px">' +
        // Donut for expenses
        '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;align-items:center">' +
          '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;align-self:flex-start">Expenses</div>' +
          '<div style="flex:1;display:flex;align-items:center;justify-content:center">' +
            '<div style="width:32px;height:32px;border-radius:50%;' + donutCSS(accent, [[accent, 38], [c2, 28], [c3, 20], [c4, 14]]) + ';position:relative">' +
              '<div style="position:absolute;inset:9px;background:#fff;border-radius:50%"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // Cash flow
        chartFrame('Cash Flow', lineChartSVG([30, 38, 32, 50, 45, 58, 62, 55, 70], accent, 100, 36, { grid: true }), { flex: 2 }) +
      '</div>' +
      // Budget vs actual mini bars
      '<div style="padding:0 6px 6px;display:flex;gap:3px;height:18px;align-items:flex-end">' +
        [70, 82, 65, 90, 75, 88].map(function (h, i) {
          return '<div style="flex:1;display:flex;flex-direction:column;gap:1px;height:100%;justify-content:flex-end">' +
            '<div style="background:' + accent + ';height:' + h + '%;border-radius:1px"></div>' +
            '<div style="background:' + c4 + ';height:' + (h - 10) + '%;border-radius:1px"></div>' +
          '</div>';
        }).join('') +
      '</div>'
    );
  }

  function previewOperations(accent) {
    return (
      // Gauge-style pill row
      '<div style="display:flex;gap:4px;padding:6px 6px 4px">' +
        gaugePill('Efficiency', 86, accent) +
        gaugePill('Capacity', 72, accent) +
        gaugePill('Uptime', 99, accent) +
      '</div>' +
      // Capacity bars
      chartFrame('Capacity', '<div style="flex:1;display:flex;align-items:flex-end;gap:2px;height:100%">' +
        barsHTML([40, 65, 58, 80, 72, 88, 95, 78, 82, 90], accent) +
      '</div>', { flex: 1 }).replace(/^<div style="flex:1;/, '<div style="margin:0 6px 4px;flex:0 0 auto;height:36px;') +
      // Downtime sparkline
      '<div style="margin:0 6px 6px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:4px 6px;height:24px;display:flex;flex-direction:column">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Downtime</div>' +
        '<div style="flex:1;min-height:0">' + lineChartSVG([3, 1, 2, 5, 1, 0, 2, 1, 3, 1], accent, 100, 14) + '</div>' +
      '</div>'
    );
  }

  function previewSupport(accent) {
    return (
      kpiRow([
        ['Open', '142', accent, null],
        ['Resolved', '1.2K', accent, '6%'],
        ['CSAT', '4.6', accent, null]
      ]) +
      '<div style="display:flex;gap:4px;padding:0 6px 4px;height:42px">' +
        // SLA gauge
        '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">' +
          '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;align-self:flex-start">SLA</div>' +
          '<div style="width:34px;height:17px;border-radius:34px 34px 0 0;background:conic-gradient(from 270deg,' + accent + ' 0deg,' + accent + ' 162deg,#E2E8F0 162deg 180deg);overflow:hidden;position:relative;margin-top:2px">' +
            '<div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:24px;height:12px;background:#fff;border-radius:24px 24px 0 0"></div>' +
          '</div>' +
          '<div style="font-size:8px;font-weight:800;color:' + accent + ';margin-top:1px">90%</div>' +
        '</div>' +
        chartFrame('Tickets', '<div style="flex:1;min-height:0">' + lineChartSVG([45, 52, 48, 60, 55, 72, 68, 80, 75], accent, 100, 32, { grid: true }) + '</div>', { flex: 2 }) +
      '</div>' +
      // Stars
      '<div style="margin:0 6px 6px;display:flex;align-items:center;gap:2px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:4px 6px">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;flex:1">Satisfaction</div>' +
        [1,1,1,1,0.6].map(function (f) {
          return '<i class="bi bi-star-fill" style="color:' + accent + ';font-size:8px;opacity:' + f + '"></i>';
        }).join('') +
      '</div>'
    );
  }

  function previewProject(accent) {
    var lighter = lighten(accent, 0.4);
    var sec = lighten(accent, 0.2);
    return (
      // Status row
      '<div style="display:flex;gap:4px;padding:6px 6px 4px">' +
        pillKpi('On Time', '92%', accent) +
        pillKpi('At Risk', '6', lighten(accent, 0.2)) +
        pillKpi('Active', '14', darken(accent, 0.15)) +
      '</div>' +
      // Gantt-like timeline
      '<div style="margin:0 6px 4px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column;gap:3px">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Milestones</div>' +
        [[10, 60], [25, 50], [5, 80], [40, 35]].map(function (r) {
          return '<div style="position:relative;height:5px;background:#F1F5F9;border-radius:3px">' +
            '<div style="position:absolute;left:' + r[0] + '%;width:' + r[1] + '%;top:0;bottom:0;background:linear-gradient(90deg,' + accent + ',' + sec + ');border-radius:3px"></div>' +
          '</div>';
        }).join('') +
      '</div>' +
      // Resource utilization
      chartFrame('Resources', '<div style="flex:1;display:flex;align-items:flex-end;gap:2px;height:100%">' +
        barsHTML([55, 70, 88, 62, 78, 90, 68], [accent, sec, lighter]) +
      '</div>', { flex: 1 }).replace(/^<div style="flex:1;/, '<div style="margin:0 6px 6px;flex:0 0 auto;height:26px;')
    );
  }

  function previewMarketing(accent) {
    var c2 = lighten(accent, 0.25), c3 = lighten(accent, 0.5), c4 = lighten(accent, 0.7);
    return (
      kpiRow([
        ['ROI', '3.4x', accent, '15%'],
        ['Leads', '2,450', accent, '9%'],
        ['CAC', '$42', accent, null]
      ]) +
      // Acquisition line full width
      '<div style="margin:0 6px 4px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;height:34px;display:flex;flex-direction:column">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Acquisition</div>' +
        '<div style="flex:1;min-height:0">' + lineChartSVG([20, 32, 28, 45, 50, 65, 58, 78, 85], accent, 100, 22, { grid: true }) + '</div>' +
      '</div>' +
      // Conversion funnel (horizontal stacked)
      '<div style="margin:0 6px 6px;display:flex;flex-direction:column;gap:2px">' +
        [['Visit', '100%', accent], ['Click', '64%', c2], ['Sign-up', '32%', c3], ['Convert', '12%', c4]].map(function (r) {
          return '<div style="display:flex;align-items:center;gap:4px">' +
            '<div style="font-size:6px;color:#64748B;width:24px;font-weight:600">' + r[0] + '</div>' +
            '<div style="flex:1;height:5px;background:#F1F5F9;border-radius:3px;overflow:hidden">' +
              '<div style="width:' + r[1] + ';height:100%;background:' + r[2] + ';border-radius:3px"></div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>'
    );
  }

  function previewIT(accent) {
    var sev1 = '#10B981', sev2 = '#F59E0B', sev3 = '#EF4444';
    return (
      kpiRow([
        ['Incidents', '23', accent, null],
        ['Uptime', '99.8%', accent, null],
        ['MTTR', '42m', accent, null]
      ]) +
      // Uptime line
      '<div style="margin:0 6px 4px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;height:32px;display:flex;flex-direction:column">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Uptime (7d)</div>' +
        '<div style="flex:1;min-height:0">' + lineChartSVG([99, 100, 98, 100, 99, 100, 99.5, 100], accent, 100, 20, { grid: true }) + '</div>' +
      '</div>' +
      // Severity stacked
      '<div style="margin:0 6px 6px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 6px;display:flex;flex-direction:column">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:2px">Severity</div>' +
        '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden">' +
          '<div style="background:' + sev1 + ';width:55%"></div>' +
          '<div style="background:' + sev2 + ';width:30%"></div>' +
          '<div style="background:' + sev3 + ';width:15%"></div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:3px;font-size:6px;color:#64748B">' +
          '<span><span style="display:inline-block;width:5px;height:5px;background:' + sev1 + ';border-radius:50%;margin-right:2px"></span>Low</span>' +
          '<span><span style="display:inline-block;width:5px;height:5px;background:' + sev2 + ';border-radius:50%;margin-right:2px"></span>Med</span>' +
          '<span><span style="display:inline-block;width:5px;height:5px;background:' + sev3 + ';border-radius:50%;margin-right:2px"></span>High</span>' +
        '</div>' +
      '</div>'
    );
  }

  function previewRecruitment(accent) {
    var c2 = lighten(accent, 0.2), c3 = lighten(accent, 0.4), c4 = lighten(accent, 0.6), c5 = lighten(accent, 0.75);
    return (
      // Pipeline funnel (horizontal trapezoids)
      '<div style="padding:6px 6px 4px;display:flex;flex-direction:column;gap:2px;align-items:center">' +
        [['Applied', '100%', accent], ['Screened', '70%', c2], ['Interview', '45%', c3], ['Offer', '22%', c4], ['Hired', '12%', c5]].map(function (r) {
          return '<div style="width:' + r[1] + ';height:6px;background:' + r[2] + ';border-radius:2px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:5px;font-weight:700"></div>';
        }).join('') +
      '</div>' +
      '<div style="display:flex;gap:4px;padding:0 6px 4px">' +
        kpiCard('Open Roles', '18', accent, null) +
        kpiCard('Time to Hire', '24d', accent, null) +
      '</div>' +
      // Open roles bars
      chartFrame('Roles by Dept', '<div style="flex:1;display:flex;align-items:flex-end;gap:3px;height:100%">' +
        barsHTML([6, 4, 8, 3, 5], accent) +
      '</div>', { flex: 1 }).replace(/^<div style="flex:1;/, '<div style="margin:0 6px 6px;flex:0 0 auto;height:24px;')
    );
  }

  function previewBlank(accent) {
    return (
      '<div style="height:100%;display:flex;align-items:center;justify-content:center;' +
        'background:repeating-radial-gradient(circle at 1px 1px,#CBD5E1 0,#CBD5E1 1px,transparent 1.5px,transparent 12px),#F8FAFC;">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;color:#64748B;background:#fff;border:1.5px dashed #CBD5E1;border-radius:50%;width:42px;height:42px;align-items:center;justify-content:center">' +
          '<i class="bi bi-plus-lg" style="font-size:18px;color:#94A3B8"></i>' +
        '</div>' +
      '</div>'
    );
  }

  // Shared helpers used above
  function kpiRow(items) {
    return '<div style="display:flex;gap:4px;padding:6px 6px 4px">' +
      items.map(function (it) { return kpiCard(it[0], it[1], it[2], it[3]); }).join('') +
    '</div>';
  }
  function gaugePill(label, pct, accent) {
    return (
      '<div style="flex:1;background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:5px 7px">' +
        '<div style="font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">' + label + '</div>' +
        '<div style="font-size:11px;font-weight:700;color:#0F172A;line-height:1.1">' + pct + '%</div>' +
        '<div style="height:3px;background:#F1F5F9;border-radius:2px;margin-top:2px;overflow:hidden">' +
          '<div style="width:' + pct + '%;height:100%;background:' + accent + ';border-radius:2px"></div>' +
        '</div>' +
      '</div>'
    );
  }
  function tableMini(headers, rows) {
    return (
      '<div style="margin:0 6px 6px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;overflow:hidden">' +
        '<div style="display:flex;padding:3px 6px;background:#F8FAFC;border-bottom:1px solid #E2E8F0">' +
          headers.map(function (h) {
            return '<div style="flex:1;font-size:6px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.4px;font-weight:700">' + h + '</div>';
          }).join('') +
        '</div>' +
        rows.map(function (row, i) {
          return '<div style="display:flex;padding:3px 6px;' + (i < rows.length - 1 ? 'border-bottom:1px solid #F1F5F9' : '') + '">' +
            '<div style="flex:1;font-size:7px;color:#0F172A;font-weight:600">' + row[0] + '</div>' +
            '<div style="flex:1;font-size:7px;color:#475569">' + row[1] + '</div>' +
            '<div style="flex:1"><span style="display:inline-block;width:14px;height:4px;background:' + (row[2] || '#94A3B8') + ';border-radius:2px"></span></div>' +
          '</div>';
        }).join('') +
      '</div>'
    );
  }

  // ---------- Main entry: DashboardMiniPreview ----------
  var RENDERERS = {
    executive: previewExecutive,
    hr: previewHR,
    sales: previewSales,
    finance: previewFinance,
    operations: previewOperations,
    support: previewSupport,
    project: previewProject,
    marketing: previewMarketing,
    it: previewIT,
    recruitment: previewRecruitment,
    blank: previewBlank
  };

  function DashboardMiniPreview(type, accent) {
    var t = type && RENDERERS[type] ? type : 'blank';
    var meta = TYPE_META[t];
    var ac = accent || meta.accent;
    var inner = RENDERERS[t](ac);
    return (
      '<div class="dash-mini-preview" data-type="' + t + '" ' +
        'style="position:relative;width:100%;aspect-ratio:16/10;background:#F8FAFC;' +
        'border-bottom:1px solid #E2E8F0;display:flex;flex-direction:column;overflow:hidden">' +
        // Faux header bar
        '<div style="display:flex;align-items:center;gap:3px;padding:4px 8px;background:#fff;border-bottom:1px solid #E2E8F0;flex:0 0 auto">' +
          '<div style="width:5px;height:5px;border-radius:50%;background:#FCA5A5"></div>' +
          '<div style="width:5px;height:5px;border-radius:50%;background:#FDE68A"></div>' +
          '<div style="width:5px;height:5px;border-radius:50%;background:#86EFAC"></div>' +
          '<div style="flex:1;height:6px;background:#F1F5F9;border-radius:3px;margin-left:6px;max-width:80px"></div>' +
          '<div style="width:14px;height:6px;background:' + ac + ';border-radius:2px;opacity:0.85"></div>' +
        '</div>' +
        '<div style="flex:1;display:flex;flex-direction:column;min-height:0">' + inner + '</div>' +
      '</div>'
    );
  }

  // ---------- TemplatePreviewCard ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * opts: {
   *   templateId, title, description, category, accentColor,
   *   recommendedKpis: string[],
   *   previewLayoutType: string,
   *   selected: boolean,
   *   onUseTemplate: function(templateId, title)
   * }
   */
  function TemplatePreviewCard(opts) {
    opts = opts || {};
    var type = opts.previewLayoutType || resolveTemplatePreviewType(opts.templateId || opts.title);
    var meta = getTemplateMeta(type);
    var accent = opts.accentColor || meta.accent;
    var kpis = (opts.recommendedKpis || []).slice(0, 4);

    var card = document.createElement('div');
    card.className = 'tpc-card' + (opts.selected ? ' is-selected' : '');
    card.setAttribute('data-template-id', opts.templateId || '');
    card.style.setProperty('--tpc-accent', accent);
    card.style.setProperty('--tpc-accent-soft', rgba(accent, 0.12));
    card.style.setProperty('--tpc-accent-glow', rgba(accent, 0.28));
    card.innerHTML =
      '<div class="tpc-thumb">' + DashboardMiniPreview(type, accent) + '</div>' +
      '<div class="tpc-body">' +
        '<div class="tpc-head">' +
          '<div class="tpc-title">' + escapeHtml(opts.title || 'Untitled') + '</div>' +
          '<span class="tpc-category">' + escapeHtml(opts.category || meta.category) + '</span>' +
        '</div>' +
        '<div class="tpc-desc">' + escapeHtml(opts.description || '') + '</div>' +
        (kpis.length ? '<div class="tpc-kpis">' +
          kpis.map(function (k) { return '<span class="tpc-kpi">' + escapeHtml(k) + '</span>'; }).join('') +
        '</div>' : '') +
        '<button type="button" class="tpc-cta">' +
          '<i class="bi bi-magic"></i><span>Use Template</span>' +
          '<i class="bi bi-arrow-right tpc-cta-arrow"></i>' +
        '</button>' +
      '</div>';

    var btn = card.querySelector('.tpc-cta');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof opts.onUseTemplate === 'function') {
        opts.onUseTemplate(opts.templateId, opts.title);
      }
    });
    card.addEventListener('click', function () {
      if (typeof opts.onUseTemplate === 'function') {
        opts.onUseTemplate(opts.templateId, opts.title);
      }
    });

    return card;
  }

  // Inject card styles once
  function ensureStyles() {
    if (document.getElementById('tpc-styles')) return;
    var s = document.createElement('style');
    s.id = 'tpc-styles';
    s.textContent = [
      '.tpc-card{position:relative;background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:transform .18s ease,box-shadow .2s ease,border-color .2s ease;text-align:left}',
      '.tpc-card:hover{transform:translateY(-3px);border-color:var(--tpc-accent,#6366F1);box-shadow:0 14px 32px rgba(15,23,42,.10),0 2px 6px rgba(15,23,42,.04)}',
      '.tpc-card.is-selected{border-color:var(--tpc-accent,#6366F1);box-shadow:0 0 0 4px var(--tpc-accent-glow,rgba(99,102,241,.25)),0 14px 32px rgba(15,23,42,.10)}',
      '.tpc-thumb{background:#F8FAFC;border-bottom:1px solid #E2E8F0}',
      '.tpc-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}',
      '.tpc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '.tpc-title{font-weight:700;color:#0F172A;font-size:14px;letter-spacing:-.01em;line-height:1.3}',
      '.tpc-category{flex-shrink:0;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:var(--tpc-accent-soft);color:var(--tpc-accent);border:1px solid var(--tpc-accent-soft)}',
      '.tpc-desc{font-size:12px;color:#64748B;line-height:1.45;flex:1}',
      '.tpc-kpis{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}',
      '.tpc-kpi{font-size:10px;font-weight:600;color:#475569;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:5px;padding:2px 6px;white-space:nowrap}',
      '.tpc-cta{margin-top:6px;display:inline-flex;align-items:center;gap:6px;justify-content:center;border:none;background:var(--tpc-accent);color:#fff;font-weight:700;font-size:12px;border-radius:9px;padding:8px 12px;cursor:pointer;transition:filter .15s ease,gap .15s ease;letter-spacing:.01em}',
      '.tpc-cta:hover{filter:brightness(1.06)}',
      '.tpc-cta .tpc-cta-arrow{margin-left:auto;transition:transform .15s ease}',
      '.tpc-card:hover .tpc-cta-arrow{transform:translateX(3px)}',
      '.tpc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}',
      '@media (max-width: 600px){.tpc-grid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  if (document.readyState !== 'loading') ensureStyles();
  else document.addEventListener('DOMContentLoaded', ensureStyles);

  // Expose
  window.DashboardMiniPreview = DashboardMiniPreview;
  window.TemplatePreviewCard = TemplatePreviewCard;
  window.resolveTemplatePreviewType = resolveTemplatePreviewType;
  window.getTemplateAccentColor = getTemplateAccentColor;
  window.getTemplateMeta = getTemplateMeta;
})();
