/**
 * Chart Service
 *
 * Converts normalized query output into Chart.js configuration.
 */

// Color palette for charts
const COLORS = [
  'rgba(54, 162, 235, 0.8)',
  'rgba(255, 99, 132, 0.8)',
  'rgba(255, 206, 86, 0.8)',
  'rgba(75, 192, 192, 0.8)',
  'rgba(153, 102, 255, 0.8)',
  'rgba(255, 159, 64, 0.8)',
  'rgba(46, 204, 113, 0.8)',
  'rgba(231, 76, 60, 0.8)',
  'rgba(52, 152, 219, 0.8)',
  'rgba(155, 89, 182, 0.8)',
  'rgba(241, 196, 15, 0.8)',
  'rgba(26, 188, 156, 0.8)',
];

const BORDER_COLORS = COLORS.map((c) => c.replace('0.8', '1'));

/**
 * Build a Chart.js config from labels, values, and chart type.
 */
function buildChartConfig(labels, values, chartType, title) {
  if (!labels || labels.length === 0) return null;

  const type = chartType === 'table' ? null : (chartType || 'bar');
  if (!type) return null;

  const colors = labels.map((_, i) => COLORS[i % COLORS.length]);
  const borderColors = labels.map((_, i) => BORDER_COLORS[i % BORDER_COLORS.length]);

  const config = {
    type,
    data: {
      labels,
      datasets: [{
        label: title || 'Value',
        data: values,
        backgroundColor: type === 'line' ? COLORS[0] : colors,
        borderColor: type === 'line' ? BORDER_COLORS[0] : borderColors,
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
          font: { size: 16 },
        },
        legend: {
          display: ['pie', 'doughnut'].includes(type),
          position: 'bottom',
        },
      },
      scales: ['bar', 'line'].includes(type)
        ? {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 },
            },
          }
        : undefined,
    },
  };

  return config;
}

module.exports = { buildChartConfig };
