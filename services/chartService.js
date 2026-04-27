/**
 * Chart Service
 *
 * Converts normalized query output into chart configs.
 * Returns { engine: 'chartjs'|'echarts', config: {...} }
 * so callers know which library to instantiate.
 */

// Default color palette for charts
const DEFAULT_COLORS = [
  '#3b82f6','#ef4444','#f59e0b','#22c55e',
  '#8b5cf6','#f97316','#06b6d4','#e11d48',
  '#10b981','#a78bfa','#fbbf24','#14b8a6',
];

function toRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolveColors(labels, template) {
  let base = DEFAULT_COLORS;
  if (template && template.colorPalette) {
    try {
      const p = typeof template.colorPalette === 'string'
        ? JSON.parse(template.colorPalette) : template.colorPalette;
      if (Array.isArray(p) && p.length) base = p;
    } catch { /* fallback */ }
  }
  return labels.map((_, i) => base[i % base.length]);
}

// ─── ECharts-native types ──────────────────────────────────────────────────
const ECHARTS_TYPES = new Set([
  'gauge','gauge_ring','funnel','treemap','heatmap',
  'waterfall','histogram','bubble','multiline','stackedarea',
  'bullet','timeline','forecast','scatter',
]);

/**
 * Build an ECharts option object from labels, values, chartType, title.
 */
function buildEChartsConfig(labels, values, chartType, title, template) {
  const colors = resolveColors(labels, template);
  const fontFamily = (template && template.fontFamily) ? template.fontFamily : 'Inter';
  const nums = (values || []).map(v => Number(v) || 0);
  const maxVal = nums.length ? Math.max(...nums) : 100;

  const textStyle = { fontFamily, fontSize: 11 };

  switch (chartType) {

    case 'funnel': {
      const sorted = labels.map((l,i) => ({ value: nums[i], name: l }))
        .sort((a,b) => b.value - a.value);
      return {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c}' },
        legend: { data: sorted.map(s=>s.name), bottom: 0, textStyle },
        series: [{
          name: title, type: 'funnel',
          left: '10%', width: '80%', top: 10, bottom: 40,
          sort: 'descending', gap: 3,
          label: { show: true, position: 'inside', color: '#fff', fontFamily },
          data: sorted.map((s,i) => ({ ...s, itemStyle: { color: colors[i % colors.length] } })),
        }],
      };
    }

    case 'treemap': {
      return {
        tooltip: { formatter: '{b}: {c}' },
        series: [{
          type: 'treemap', name: title,
          top: 10, bottom: 10, left: 10, right: 10,
          label: { show: true, formatter: '{b}\n{c}', fontFamily },
          data: labels.map((l,i) => ({
            name: l, value: nums[i],
            itemStyle: { color: colors[i % colors.length] },
          })),
        }],
      };
    }

    case 'gauge': {
      const val = nums[0] || 0;
      const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
      return {
        tooltip: { formatter: '{b}: {c}' },
        series: [{
          type: 'gauge',
          startAngle: 200, endAngle: -20,
          min: 0, max: maxVal,
          radius: '80%', center: ['50%', '58%'],
          axisLine: { lineStyle: { width: 18,
            color: [[pct/100, colors[0]], [1, '#e5e7eb']] } },
          pointer: { itemStyle: { color: colors[0] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: true, distance: 20, textStyle },
          detail: { valueAnimation: true, fontSize: 24, fontFamily,
            fontWeight: 700, color: colors[0], offsetCenter: [0, '30%'],
            formatter: function(v) { return v.toLocaleString(); } },
          title: { offsetCenter: [0, '-15%'], fontSize: 12, fontFamily, color: '#6b7280' },
          data: [{ value: val, name: labels[0] || title }],
        }],
      };
    }

    case 'gauge_ring': {
      const val = nums[0] || 0;
      const pct = maxVal > 0 ? Math.min(100, Math.round((val / maxVal) * 100)) : 0;
      return {
        tooltip: { formatter: '{b}: {c}' },
        series: [{
          type: 'gauge',
          startAngle: 90, endAngle: -270,
          radius: '80%', center: ['50%', '50%'],
          pointer: { show: false },
          progress: { show: true, overlap: false, roundCap: true,
            itemStyle: { color: colors[0] } },
          axisLine: { lineStyle: { width: 18, color: [[1, '#e5e7eb']] } },
          splitLine: { show: false }, axisTick: { show: false },
          axisLabel: { show: false },
          detail: { valueAnimation: true, fontSize: 22, fontFamily,
            fontWeight: 700, color: colors[0], offsetCenter: [0, 0],
            formatter: '{value}%' },
          title: { fontSize: 11, fontFamily, color: '#6b7280', offsetCenter: [0, '30%'] },
          data: [{ value: pct, name: labels[0] || title }],
        }],
      };
    }

    case 'bullet': {
      const series = labels.map((l, i) => {
        const actual = nums[i] || 0;
        const target = actual * 1.2;
        const max = actual * 1.5;
        return {
          type: 'bar', name: l, barWidth: 20,
          data: [actual],
          itemStyle: { color: colors[i % colors.length] },
          markLine: {
            symbol: ['none','none'],
            data: [{ xAxis: target, lineStyle: { color: '#374151', width: 2 } }],
          },
          z: 2,
        };
      });
      return {
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'value', max: maxVal * 1.5, splitLine: { show: true } },
        yAxis: { type: 'category', data: labels, axisLabel: textStyle },
        series,
      };
    }

    case 'histogram': {
      // Group values into bins
      const min = Math.min(...nums);
      const max2 = Math.max(...nums);
      const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(nums.length))));
      const binSize = (max2 - min) / binCount || 1;
      const bins = Array.from({ length: binCount }, (_, i) => ({
        label: `${(min + i * binSize).toFixed(1)}-${(min + (i+1)*binSize).toFixed(1)}`,
        count: 0,
      }));
      nums.forEach(v => {
        const idx = Math.min(binCount-1, Math.floor((v - min) / binSize));
        if (bins[idx]) bins[idx].count++;
      });
      return {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: bins.map(b=>b.label), axisLabel: { rotate: 30, textStyle } },
        yAxis: { type: 'value', name: 'Frequency', axisLabel: textStyle },
        series: [{
          type: 'bar', name: 'Frequency',
          data: bins.map((b,i) => ({ value: b.count, itemStyle: { color: colors[i % colors.length] } })),
          barCategoryGap: '2%',
        }],
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'heatmap': {
      // Treat labels as rows, build matrix with a single series (y=0)
      const gridData = labels.map((l, i) => [i, 0, nums[i]]);
      return {
        tooltip: { position: 'top', formatter: (p) => `${labels[p.data[0]]}: ${p.data[2]}` },
        grid: { height: '50%', top: '15%' },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 30, textStyle } },
        yAxis: { type: 'category', data: [title || 'Value'], axisLabel: textStyle },
        visualMap: { min: Math.min(...nums), max: maxVal, calculable: true,
          orient: 'horizontal', left: 'center', bottom: '15%',
          inRange: { color: ['#f3f4f6', colors[0]] } },
        series: [{ name: title, type: 'heatmap', data: gridData,
          label: { show: true, color: '#333', fontSize: 10 } }],
      };
    }

    case 'waterfall': {
      let cum = 0;
      const barData = nums.map((v, i) => {
        const prev = cum;
        cum += v;
        const isLast = i === nums.length - 1;
        return {
          value: isLast ? cum : v,
          itemStyle: { color: isLast ? colors[3] : (v >= 0 ? colors[0] : colors[1]) },
          offset: isLast ? 0 : prev,
        };
      });
      // ECharts waterfall via custom series
      return {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: labels, axisLabel: textStyle },
        yAxis: { type: 'value', axisLabel: textStyle },
        series: [
          { type: 'bar', stack: 'waterfall', silent: true,
            itemStyle: { color: 'transparent', borderColor: 'transparent' },
            data: barData.map(b => b.offset || 0) },
          { type: 'bar', stack: 'waterfall', name: title,
            label: { show: true, position: 'top', fontFamily },
            data: barData.map((b,i) => ({ value: b.value, itemStyle: b.itemStyle })) },
        ],
      };
    }

    case 'bubble': {
      return {
        tooltip: { formatter: (p) => `${labels[p.dataIndex] || ''}: (${p.data[0]}, ${p.data[1]}) size: ${p.data[2]}` },
        xAxis: { type: 'value', name: 'Index', axisLabel: textStyle },
        yAxis: { type: 'value', name: title, axisLabel: textStyle },
        series: [{
          name: title, type: 'scatter', symbolSize: (d) => Math.max(10, Math.min(60, d[2] / maxVal * 60)),
          data: labels.map((l,i) => [i, nums[i], nums[i]]),
          itemStyle: { color: (p) => colors[p.dataIndex % colors.length], opacity: 0.7 },
          label: { show: labels.length <= 12, formatter: (p) => labels[p.dataIndex] || '', fontFamily },
        }],
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'scatter': {
      return {
        tooltip: { formatter: (p) => `${labels[p.dataIndex]||''}: ${p.data[1]}` },
        xAxis: { type: 'value', name: 'Index', axisLabel: textStyle, splitLine: { show: true } },
        yAxis: { type: 'value', name: title, axisLabel: textStyle },
        series: [{
          name: title, type: 'scatter',
          data: labels.map((l,i) => [i, nums[i]]),
          itemStyle: { color: (p) => colors[p.dataIndex % colors.length], opacity: 0.8 },
          symbolSize: 10,
          label: { show: labels.length <= 12, formatter: (p) => labels[p.dataIndex]||'', position: 'top', fontFamily },
        }],
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'multiline': {
      // Treat each label as a separate series with a single point — makes more sense as multiple series
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: labels, bottom: 0, textStyle },
        xAxis: { type: 'category', data: ['Value'], axisLabel: textStyle },
        yAxis: { type: 'value', axisLabel: textStyle },
        series: labels.map((l, i) => ({
          name: l, type: 'line', smooth: true,
          data: [nums[i]],
          itemStyle: { color: colors[i % colors.length] },
          lineStyle: { color: colors[i % colors.length], width: 2 },
          symbol: 'circle', symbolSize: 8,
        })),
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'stackedarea': {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: labels.length > 8 ? 30 : 0, ...textStyle } },
        yAxis: { type: 'value', axisLabel: textStyle },
        series: [{
          name: title, type: 'line', smooth: true, stack: 'total',
          areaStyle: { opacity: 0.4 },
          data: nums,
          itemStyle: { color: colors[0] },
          lineStyle: { color: colors[0], width: 2 },
        }],
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'timeline': {
      return {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 30, ...textStyle }, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: textStyle },
        dataZoom: [{ type: 'slider', bottom: 20 }],
        series: [{
          name: title, type: 'line', smooth: false,
          symbol: 'circle', symbolSize: 6,
          data: nums,
          itemStyle: { color: colors[0] },
          lineStyle: { color: colors[0], width: 2 },
          areaStyle: { opacity: 0.1, color: colors[0] },
          markPoint: {
            data: [{ type: 'max', name: 'Max' }, { type: 'min', name: 'Min' }],
            label: { fontFamily },
          },
        }],
        title: { text: title, textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 } },
      };
    }

    case 'forecast': {
      // Render existing data + simple linear extrapolation for 3 future points
      const n = nums.length;
      let slope = 0, intercept = 0;
      if (n >= 2) {
        const sumX = nums.reduce((_,__,i) => _ + i, 0);
        const sumY = nums.reduce((a,b) => a+b, 0);
        const sumXY = nums.reduce((a,v,i) => a + i*v, 0);
        const sumX2 = nums.reduce((a,__,i) => a + i*i, 0);
        slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX) || 0;
        intercept = (sumY - slope*sumX) / n;
      }
      const futureLabels = [1,2,3].map(d => `+${d}`);
      const futureVals = [1,2,3].map(d => parseFloat((intercept + slope*(n+d-1)).toFixed(2)));
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: ['Actual', 'Forecast'], bottom: 0, textStyle },
        xAxis: { type: 'category', data: [...labels, ...futureLabels], axisLabel: { rotate: labels.length > 6 ? 30 : 0, ...textStyle }, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: textStyle },
        series: [
          { name: 'Actual', type: 'line', smooth: true,
            data: [...nums, ...futureVals.map(() => null)],
            itemStyle: { color: colors[0] }, lineStyle: { color: colors[0], width: 2 },
            symbol: 'circle', symbolSize: 5 },
          { name: 'Forecast', type: 'line', smooth: true,
            data: [...nums.map(()=>null), ...futureVals],
            lineStyle: { type: 'dashed', color: colors[4]||'#f97316', width: 2 },
            itemStyle: { color: colors[4]||'#f97316' },
            symbol: 'diamond', symbolSize: 7,
            markArea: { silent: true, itemStyle: { opacity: 0.05, color: colors[4]||'#f97316' },
              data: [[{ xAxis: labels[labels.length-1] }, { xAxis: futureLabels[2] }]] } },
        ],
        title: { text: title + ' (with Forecast)', subtext: 'Linear trend projection',
          textStyle: { ...textStyle, fontSize: 13, fontWeight: 600 },
          subtextStyle: { fontSize: 10, color: '#9ca3af' } },
      };
    }

    default:
      return null;
  }
}

/**
 * Build a Chart.js config from labels, values, chart type, title, and optional template.
 * Returns { engine: 'chartjs'|'echarts', config } or { engine: 'echarts', config } for ECharts-native types.
 */
function buildChartConfig(labels, values, chartType, title, template) {
  if (!labels || labels.length === 0) return null;
  const safeValues = Array.isArray(values) ? values : [];

  // Route ECharts-native types
  if (ECHARTS_TYPES.has(chartType)) {
    const cfg = buildEChartsConfig(labels, safeValues, chartType, title, template);
    return cfg ? { engine: 'echarts', config: cfg } : null;
  }

  // Map virtual types to Chart.js base types + option overrides
  const virtualType = chartType || 'bar';
  let type = virtualType === 'table' ? null : virtualType;
  if (!type) return null;

  let indexAxis;
  let fillArea    = false;
  let stackedAxes = false;
  if (virtualType === 'hbar')        { type = 'bar';       indexAxis = 'y'; }
  if (virtualType === 'area')        { type = 'line';      fillArea = true; }
  if (virtualType === 'radar')       { type = 'radar'; }
  if (virtualType === 'polarArea')   { type = 'polarArea'; }
  if (virtualType === 'stackedbar')  { type = 'bar';       stackedAxes = true; }
  if (virtualType === 'stackedhbar') { type = 'bar';       indexAxis = 'y'; stackedAxes = true; }

  // Use template palette if provided, else default
  let baseColors = DEFAULT_COLORS;
  if (template && template.colorPalette) {
    try {
      const parsed = typeof template.colorPalette === 'string'
        ? JSON.parse(template.colorPalette)
        : template.colorPalette;
      if (Array.isArray(parsed) && parsed.length > 0) baseColors = parsed;
    } catch { /* fall back to default */ }
  }

  const colors = labels.map((_, i) => toRgba(baseColors[i % baseColors.length], 0.82));
  const borderColors = labels.map((_, i) => toRgba(baseColors[i % baseColors.length], 1));

  const fontFamily = (template && template.fontFamily) ? template.fontFamily : 'Inter';

  const scatterData = type === 'scatter'
    ? safeValues.map((v, i) => ({ x: i, y: Number(v) || 0 })) : null;

  const config = {
    type,
    data: {
      labels: type === 'scatter' ? undefined : labels,
      datasets: [{
        label: title || 'Value',
        data: scatterData || safeValues,
        backgroundColor: (type === 'line' && !fillArea) ? colors[0]
          : (type === 'radar' ? toRgba(baseColors[0], 0.25)
          : colors),
        borderColor: (type === 'line' || type === 'radar') ? borderColors[0] : borderColors,
        borderWidth: ['line', 'radar', 'area'].includes(virtualType) ? 2 : 1,
        borderRadius: ['bar', 'stackedbar', 'stackedhbar', 'hbar'].includes(virtualType) ? 4 : undefined,
        fill: fillArea ? true : (type === 'radar' ? true : undefined),
        tension: ['line', 'area'].includes(virtualType) ? 0.3 : undefined,
        pointRadius: type === 'scatter' ? 4 : undefined,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...(indexAxis ? { indexAxis } : {}),
      plugins: {
        title: {
          display: !!title,
          text: title || '',
          font: { size: 14, family: fontFamily },
        },
        legend: {
          display: ['pie', 'doughnut', 'radar', 'polarArea'].includes(type),
          position: 'bottom',
          labels: { font: { family: fontFamily } },
        },
      },
      scales: ['bar', 'line', 'scatter'].includes(type) || ['hbar', 'area', 'stackedbar', 'stackedhbar'].includes(virtualType)
        ? {
            x: { stacked: stackedAxes || undefined, ticks: { font: { family: fontFamily } } },
            y: { stacked: stackedAxes || undefined, beginAtZero: true, ticks: { precision: 0, font: { family: fontFamily } } },
          }
        : undefined,
    },
  };

  return { engine: 'chartjs', config };
}

module.exports = { buildChartConfig, buildEChartsConfig, ECHARTS_TYPES };
