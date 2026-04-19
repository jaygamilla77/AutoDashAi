/**
 * Chart Service
 *
 * Converts normalized query output into Chart.js configuration.
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

/**
 * Build a Chart.js config from labels, values, chart type, title, and optional template.
 */
function buildChartConfig(labels, values, chartType, title, template) {
  if (!labels || labels.length === 0) return null;

  const type = chartType === 'table' ? null : (chartType || 'bar');
  if (!type) return null;

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

  // Font family from template
  const fontFamily = (template && template.fontFamily) ? template.fontFamily : 'Inter';

  const config = {
    type,
    data: {
      labels,
      datasets: [{
        label: title || 'Value',
        data: values,
        backgroundColor: type === 'line' ? colors[0] : colors,
        borderColor: type === 'line' ? borderColors[0] : borderColors,
        borderWidth: type === 'line' ? 2 : 1,
        fill: type === 'line' ? false : undefined,
        tension: type === 'line' ? 0.3 : undefined,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!title,
          text: title || '',
          font: { size: 16, family: fontFamily },
        },
        legend: {
          display: ['pie', 'doughnut'].includes(type),
          position: 'bottom',
          labels: { font: { family: fontFamily } },
        },
      },
      scales: ['bar', 'line'].includes(type)
        ? {
            x: { ticks: { font: { family: fontFamily } } },
            y: { beginAtZero: true, ticks: { precision: 0, font: { family: fontFamily } } },
          }
        : undefined,
    },
  };

  return config;
}

module.exports = { buildChartConfig };
