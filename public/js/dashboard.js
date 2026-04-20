/**
 * Dashboard client-side JavaScript
 * Renders Chart.js charts from server-passed config.
 */

document.addEventListener('DOMContentLoaded', function () {
  // Render chart if config is available (may be null if a view-level script already handled rendering)
  if (window.__chartConfig) {
    renderChart(window.__chartConfig);
  }
});

/**
 * Render a Chart.js chart from a config object.
 */
function renderChart(config) {
  const canvas = document.getElementById('dashboardChart');
  if (!canvas) return;

  try {
    const ctx = canvas.getContext('2d');
    new Chart(ctx, config);
  } catch (err) {
    console.error('Chart rendering error:', err);
    canvas.parentElement.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-exclamation-triangle fs-3"></i>
        <p class="mt-2">Could not render chart. Check console for details.</p>
      </div>
    `;
  }
}
