'use strict';

/**
 * Layout Manager Service
 * Handles dashboard layout state, persistence, and restoration
 */

class LayoutManager {
  /**
   * Generate unique widget IDs and initialize layout from config
   * @param {Object} config - Dashboard config from DB
   * @returns {Object} { widgets, layout, defaultLayout }
   */
  static initializeLayout(config) {
    if (!config) config = {};

    // Extract or initialize layout config
    const layoutConfig = config.layoutConfig || {};
    const widgets = this.generateWidgetIds(config);
    const layout = layoutConfig.widgets || [];
    const defaultLayout = this.generateDefaultLayout(widgets);

    return {
      widgets,
      layout,
      defaultLayout,
      isLocked: layoutConfig.isLocked !== false,
    };
  }

  /**
   * Generate unique widget IDs for all panels and KPI cards
   * @param {Object} config - Dashboard config
   * @returns {Array} Array of widget objects with unique IDs
   */
  static generateWidgetIds(config) {
    const widgets = [];

    // Add KPI cards
    if (config.kpiData && Array.isArray(config.kpiData)) {
      config.kpiData.forEach((kpi, idx) => {
        widgets.push({
          id: `kpi-${idx}`,
          type: 'kpi',
          title: kpi.label || `KPI ${idx + 1}`,
          index: idx,
          section: 'kpi-strip',
        });
      });
    }

    // Add chart panels
    if (config.panels && Array.isArray(config.panels)) {
      config.panels.forEach((panel, idx) => {
        widgets.push({
          id: `panel-${idx}`,
          type: 'panel',
          title: panel.title || `Panel ${idx + 1}`,
          index: idx,
          section: panel._section || 'Uncategorized',
          chartType: panel.chartType || 'bar',
        });
      });
    }

    // Add summary if present
    if (config.anomalyAlert) {
      widgets.push({
        id: 'summary-alert',
        type: 'summary',
        title: 'Executive Summary',
        section: 'summary',
      });
    }

    return widgets;
  }

  /**
   * Generate default (AI-generated) layout
   * This is used for "Reset to AI Layout"
   * @param {Array} widgets - Widget array
   * @returns {Array} Default GridStack layout
   */
  static generateDefaultLayout(widgets) {
    const layout = [];
    let x = 0, y = 0;

    widgets.forEach((widget) => {
      if (widget.section === 'kpi-strip') {
        // KPI cards: 2 height, responsive width
        layout.push({
          x: (layout.filter((w) => w.section === 'kpi-strip').length % 4) * 3,
          y: 0,
          w: 3,
          h: 2,
          id: widget.id,
          noResize: false,
          noMove: false,
        });
      } else if (widget.section === 'summary') {
        // Summary: full width at top
        layout.push({
          x: 0,
          y: 2,
          w: 12,
          h: 2,
          id: widget.id,
          noResize: true,
          noMove: true,
        });
      } else {
        // Chart panels: 2x3 (2h x 3w in 12-col grid)
        const panelIndex = layout.filter((w) => w.section !== 'kpi-strip' && w.section !== 'summary').length;
        const row = Math.floor(panelIndex / (12 / 6)); // 2 panels per row
        const col = (panelIndex % (12 / 6)) * 6;

        layout.push({
          x: col,
          y: 4 + row * 3,
          w: 6,
          h: 3,
          id: widget.id,
          noResize: false,
          noMove: false,
        });
      }
    });

    return layout;
  }

  /**
   * Create layout config for saving to DB
   * @param {Array} gsItems - GridStack items
   * @param {boolean} isLocked - Is layout locked
   * @returns {Object} Layout config to save
   */
  static createLayoutConfig(gsItems, isLocked = false) {
    return {
      widgets: (gsItems || []).map((item) => ({
        id: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
      isLocked,
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Merge layout config into dashboard config
   * @param {Object} dashboardConfig - Current dashboard config
   * @param {Object} layoutConfig - New layout config
   * @returns {Object} Merged config
   */
  static mergeLayoutConfig(dashboardConfig, layoutConfig) {
    return {
      ...dashboardConfig,
      layoutConfig,
    };
  }

  /**
   * Validate layout data
   * @param {Object} layoutConfig - Layout config to validate
   * @returns {boolean} True if valid
   */
  static validateLayout(layoutConfig) {
    if (!layoutConfig || !Array.isArray(layoutConfig.widgets)) return false;
    return layoutConfig.widgets.every((w) => w.id && typeof w.x === 'number' && typeof w.y === 'number' && typeof w.w === 'number' && typeof w.h === 'number');
  }

  /**
   * Get GridStack configuration options
   * @param {boolean} isLocked - Should grid be locked
   * @returns {Object} GridStack options
   */
  static getGridStackOptions(isLocked = false) {
    return {
      cellHeight: '70px',
      margin: 10,
      float: false,
      staticGrid: false,
      disableDrag: isLocked,
      disableResize: isLocked,
      animate: true,
      alwaysShowResizeHandle: false,
      resizable: {
        handles: 'se',
        autoHide: true,
      },
      draggable: {
        handle: '.gs-drag-handle',
      },
      column: 12,
      minRow: 1,
    };
  }
}

module.exports = LayoutManager;
