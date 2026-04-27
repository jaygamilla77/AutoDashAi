/**
 * Layout Manager Frontend
 * Handles GridStack initialization, drag-drop events, and layout persistence
 */

var LayoutManagerFrontend = (function () {
  var grid = null;
  var isLocked = false;
  var hasChanges = false;
  var currentLayout = null;
  var defaultLayout = null;
  var resizeObserver = null;
  var chartContainers = [];

  /**
   * Initialize GridStack layout manager
   */
  function init(layoutData, defaultLayoutData, isLockedInitial) {
    if (!layoutData || typeof GridStack === 'undefined') {
      console.warn('[Layout Manager] GridStack not available or no layout data');
      return false;
    }

    isLocked = isLockedInitial || false;
    defaultLayout = defaultLayoutData || [];
    currentLayout = layoutData.length > 0 ? layoutData : defaultLayoutData;

    // Initialize GridStack
    var options = {
      cellHeight: '70px',
      margin: 10,
      column: 12,
      float: false,
      staticGrid: false,
      disableDrag: isLocked,
      disableResize: isLocked,
      animate: true,
      resizable: {
        handles: 'se',
        autoHide: true,
      },
      draggable: {
        handle: '.gs-drag-handle, .exec-panel-hdr',
      },
    };

    var gridEl = document.getElementById('panelGrid');
    if (!gridEl) {
      console.warn('[Layout Manager] No panelGrid element found');
      return false;
    }

    grid = GridStack.init(options, gridEl);

    // Disable GridStack default styling conflicts
    gridEl.classList.add('gs-grid-layout');

    // Set up ResizeObserver for automatic chart resizing
    setupResizeObserver();

    // Load layout
    loadLayout(currentLayout);

    // Bind events
    grid.on('change', onGridChange);
    grid.on('resizestop', onWidgetResized);
    grid.on('dragstop', onWidgetMoved);

    // Expose functions globally
    window.aiLayoutLock = toggleLock;
    window.aiLayoutReset = resetToAiLayout;
    window.aiLayoutSave = saveLayout;
    window.aiLayoutToggleDragHandle = toggleDragHandle;

    updateLockButton();
    console.log('[Layout Manager] Initialized with', currentLayout.length, 'widgets');

    return true;
  }

  /**
   * Setup ResizeObserver to auto-resize charts when containers change size
   */
  function setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') {
      console.warn('[Layout Manager] ResizeObserver not supported');
      return;
    }

    try {
      resizeObserver = new ResizeObserver(function(entries) {
        entries.forEach(function(entry) {
          var panelWrapper = entry.target;
          if (!panelWrapper) return;
          
          // Find the chart canvas inside this wrapper
          var canvas = panelWrapper.querySelector('canvas[id^="chart-"]');
          if (canvas && canvas.chart && typeof canvas.chart.resize === 'function') {
            try {
              canvas.chart.resize();
            } catch (e) {
              console.error('[Layout Manager] Chart resize error:', e);
            }
          }
          
          // Also check for ECharts instances
          var echartsWrapper = panelWrapper.querySelector('[data-echarts-id]');
          if (echartsWrapper && typeof echarts !== 'undefined') {
            try {
              var instance = echarts.getInstanceByDom(echartsWrapper);
              if (instance) instance.resize();
            } catch (e) {}
          }
        });
      });

      // Observe all panel wrappers
      var allWrappers = document.querySelectorAll('.gs-panel-wrapper');
      allWrappers.forEach(function(wrapper) {
        resizeObserver.observe(wrapper);
        chartContainers.push(wrapper);
      });

      console.log('[Layout Manager] ResizeObserver attached to', allWrappers.length, 'containers');
    } catch (e) {
      console.error('[Layout Manager] ResizeObserver setup failed:', e);
    }
  }

  /**
   * Load layout into GridStack
   */
  function loadLayout(layoutItems) {
    if (!grid || !layoutItems) return;

    try {
      grid.removeAll();
      layoutItems.forEach(function (item) {
        var el = document.getElementById(item.id);
        if (el) {
          grid.addWidget(el, {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            id: item.id,
          });
        }
      });

      hasChanges = false;
      
      // Re-attach resize observers after layout change
      setTimeout(setupResizeObserver, 200);
      
      console.log('[Layout Manager] Loaded layout:', layoutItems.length, 'widgets');
    } catch (e) {
      console.error('[Layout Manager] Error loading layout:', e);
    }
  }

  /**
   * Save layout to server
   */
  function saveLayout() {
    if (!grid || !hasChanges) {
      alert('No layout changes to save.');
      return;
    }

    var layoutConfig = {
      widgets: grid.engine.nodes.map(function (node) {
        return {
          id: node.id,
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
        };
      }),
      isLocked: isLocked,
      savedAt: new Date().toISOString(),
    };

    // Get dashboard ID from current URL or button
    var dashboardId = extractDashboardId();
    if (!dashboardId) {
      alert('Could not determine dashboard ID. Please save the dashboard first.');
      return;
    }

    fetch('/dashboard/' + dashboardId + '/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutConfig),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          alert('Error saving layout: ' + data.error);
          return;
        }
        hasChanges = false;
        showLayoutToast('Layout saved successfully!', 'success');
      })
      .catch(function (e) {
        console.error('Layout save error:', e);
        showLayoutToast('Failed to save layout: ' + e.message, 'error');
      });
  }

  /**
   * Reset layout to AI-generated default
   */
  function resetToAiLayout() {
    if (!confirm('Reset layout to AI-generated default?\nThis cannot be undone.')) return;

    if (!grid || !defaultLayout) {
      console.error('[Layout Manager] No default layout available');
      return;
    }

    loadLayout(defaultLayout);
    hasChanges = true;

    // Trigger chart resizes
    setTimeout(function () {
      resizeAllCharts();
      saveLayout();
    }, 300);
  }

  /**
   * Toggle layout lock/unlock
   */
  function toggleLock() {
    isLocked = !isLocked;

    if (grid) {
      grid.engine.nodes.forEach(function (node) {
        node.noMove = isLocked;
        node.noResize = isLocked;
      });

      // Update GridStack options
      if (isLocked) {
        grid.disable();
      } else {
        grid.enable();
      }
    }

    updateLockButton();
    showLayoutToast(isLocked ? 'Layout locked' : 'Layout unlocked', 'info');

    // Save lock state
    if (grid) {
      var layoutConfig = {
        widgets: grid.engine.nodes.map(function (node) {
          return {
            id: node.id,
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
          };
        }),
        isLocked: isLocked,
      };
      saveLayoutToServer(layoutConfig);
    }
  }

  /**
   * Toggle drag handle visibility
   */
  function toggleDragHandle() {
    var handles = document.querySelectorAll('.gs-drag-handle');
    handles.forEach(function (h) {
      h.style.opacity = h.style.opacity === '0.3' ? '1' : '0.3';
    });
  }

  /**
   * Update lock button UI
   */
  function updateLockButton() {
    var lockBtn = document.getElementById('layoutLockBtn');
    if (lockBtn) {
      lockBtn.innerHTML = isLocked
        ? '<i class="bi bi-lock-fill"></i> Unlock Layout'
        : '<i class="bi bi-unlock-fill"></i> Lock Layout';
      lockBtn.classList.toggle('btn-danger', isLocked);
      lockBtn.classList.toggle('btn-outline-secondary', !isLocked);
    }
  }

  /**
   * Handle grid changes (drag/resize)
   */
  function onGridChange(event, items) {
    hasChanges = true;
    resizeAffectedCharts(event);
  }

  /**
   * Handle widget resize
   */
  function onWidgetResized(event, el) {
    hasChanges = true;
    resizeAllCharts();
  }

  /**
   * Handle widget moved
   */
  function onWidgetMoved(event, el) {
    hasChanges = true;
  }

  /**
   * Resize all chart in dashboard
   */
  function resizeAllCharts() {
    // Chart.js charts
    document.querySelectorAll('canvas[id^="chart-"]').forEach(function (canvas) {
      if (canvas.chart && typeof canvas.chart.resize === 'function') {
        try {
          canvas.chart.resize();
        } catch (e) {
          console.error('[Layout Manager] Chart.js resize error:', e);
        }
      }
    });

    // ECharts instances
    if (typeof echarts !== 'undefined') {
      try {
        document.querySelectorAll('[data-echarts-id]').forEach(function(el) {
          var instance = echarts.getInstanceByDom(el);
          if (instance && typeof instance.resize === 'function') {
            instance.resize();
          }
        });
      } catch (e) {
        console.error('[Layout Manager] ECharts resize error:', e);
      }
    }
  }

  /**
   * Resize affected charts after grid change
   */
  function resizeAffectedCharts(event) {
    if (!event || !event.type) return;

    // Debounce chart resizes
    clearTimeout(window._chartResizeTimeout);
    window._chartResizeTimeout = setTimeout(function () {
      resizeAllCharts();
    }, 150);
  }

  /**
   * Schedule a single chart resize with debounce
   */
  function scheduleChartResize(panelIdx) {
    clearTimeout(window._chartResizeTimeout);
    window._chartResizeTimeout = setTimeout(function () {
      var canvas = document.getElementById('chart-' + panelIdx);
      if (canvas && canvas.chart && typeof canvas.chart.resize === 'function') {
        try {
          canvas.chart.resize();
        } catch (e) {
          console.error('Chart resize failed for panel', panelIdx, e);
        }
      }
    }, 150);
  }

  /**
   * Extract dashboard ID from URL
   */
  function extractDashboardId() {
    var m = window.location.pathname.match(/\/dashboard\/(\d+)/);
    return m ? m[1] : null;
  }

  /**
   * Save layout config to server (without full save)
   */
  function saveLayoutToServer(layoutConfig) {
    var dashboardId = extractDashboardId();
    if (!dashboardId) return;

    fetch('/dashboard/' + dashboardId + '/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutConfig),
    }).catch(function (e) {
      console.error('Layout state save failed:', e);
    });
  }

  /**
   * Show toast notification
   */
  function showLayoutToast(msg, type) {
    var icon = type === 'success' ? 'bi-check-circle-fill' : type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill';
    var color = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';

    var toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;bottom:20px;right:20px;background:#1f2937;color:#fff;padding:12px 16px;border-radius:8px;font-size:0.85rem;z-index:9999;box-shadow:0 6px 18px rgba(0,0,0,0.25);display:flex;align-items:center;gap:8px;animation:fadeIn 0.2s';
    toast.innerHTML = '<i class="bi ' + icon + '" style="color:' + color + '"></i><span>' + msg + '</span>';

    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity 0.4s';
      toast.style.opacity = '0';
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 3000);
  }

  /**
   * Destroy layout manager
   */
  function destroy() {
    if (grid) {
      grid.destroy();
      grid = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    window.aiLayoutLock = null;
    window.aiLayoutReset = null;
    window.aiLayoutSave = null;
  }

  return {
    init: init,
    toggleLock: toggleLock,
    resetToAiLayout: resetToAiLayout,
    saveLayout: saveLayout,
    resizeAllCharts: resizeAllCharts,
    destroy: destroy,
  };
})();

// Auto-initialize when page loads
window.addEventListener('load', function () {
  if (window.__LAYOUT_DATA__ && window.__DEFAULT_LAYOUT__ !== undefined) {
    LayoutManagerFrontend.init(
      window.__LAYOUT_DATA__,
      window.__DEFAULT_LAYOUT__,
      window.__LAYOUT_LOCKED__ || false
    );
  }
});
