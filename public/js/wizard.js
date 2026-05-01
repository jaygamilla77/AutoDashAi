/**
 * Dashboard Wizard Frontend
 * Handles all 6 steps of guided dashboard creation
 */

// Wizard State
const wizardState = {
  currentStep: 1,
  totalSteps: 6,
  sourceType: null,
  selectedSourceId: null,
  analysisData: null,
  recommendations: null,
  selectedTheme: 'modern-corporate',
  selectedLayout: 'standard',
  dashboardTitle: '',
  dashboardConfig: null,
  selectedKpis: [],
  selectedCharts: [],
};

// DOM Elements
let currentStepEl = null;
let nextBtnEl = null;
let prevBtnEl = null;
let alertBoxEl = null;
let stepperEl = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
  currentStepEl = document.getElementById('currentStep');
  nextBtnEl = document.getElementById('nextBtn');
  prevBtnEl = document.getElementById('prevBtn');
  alertBoxEl = document.getElementById('alertBox');
  stepperEl = document.getElementById('wizardStepper');

  setupStep1();
  setupStep4();
  updateStepperUI();
});

// ===== STEP 1: Data Source Selection =====

function setupStep1() {
  const fileUploadSection = document.getElementById('fileUploadSection');
  const databaseSection = document.getElementById('databaseSection');
  const apiSection = document.getElementById('apiSection');
  const dataFileInput = document.getElementById('dataFileInput');
  const uploadArea = document.querySelector('.upload-area');
  const sourceOptions = document.querySelectorAll('.source-option');
  const dbSourceSelect = document.getElementById('dbSourceSelect');
  const newDbForm = document.getElementById('newDbForm');

  console.log('[Wizard] setupStep1() - checking elements:', {
    fileUploadSection: !!fileUploadSection,
    dataFileInput: !!dataFileInput,
    uploadArea: !!uploadArea,
    sourceOptions: sourceOptions.length,
  });

  if (!dataFileInput) {
    console.error('[Wizard] CRITICAL: dataFileInput element not found in DOM!');
  }

  // Source type selection
  sourceOptions.forEach((option) => {
    option.addEventListener('click', function () {
      sourceOptions.forEach((o) => o.classList.remove('selected'));
      this.classList.add('selected');

      const sourceType = this.dataset.source;
      console.log('[Wizard] Source type selected:', {
        source: sourceType,
        element: this,
        dataAttribute: this.dataset.source,
      });
      
      wizardState.sourceType = sourceType;
      console.log('[Wizard] wizardState.sourceType set to:', wizardState.sourceType);
      
      fileUploadSection.classList.toggle('hidden', wizardState.sourceType !== 'file');
      databaseSection.classList.toggle('hidden', wizardState.sourceType !== 'database');
      apiSection.classList.toggle('hidden', wizardState.sourceType !== 'api');

      if (wizardState.sourceType === 'file') {
        dataFileInput.focus();
        console.log('[Wizard] File upload section shown, input focused');
      }
    });
  });

  // File upload handling
  if (uploadArea) {
    uploadArea.addEventListener('click', () => {
      console.log('[Wizard] Upload area clicked, element check:', {
        inputExists: !!dataFileInput,
        inputId: dataFileInput?.id,
        inputType: dataFileInput?.type,
      });
      if (dataFileInput) {
        console.log('[Wizard] Triggering file input dialog...');
        dataFileInput.click();
        console.log('[Wizard] File input click() called');
      } else {
        console.error('[Wizard] ERROR: dataFileInput not found when clicking upload area!');
      }
    });
  } else {
    console.error('[Wizard] uploadArea not found!');
  }

  uploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      console.log('[Wizard] File dropped:', e.dataTransfer.files[0].name);
      dataFileInput.files = e.dataTransfer.files;
      dataFileInput.dispatchEvent(new Event('change'));
    }
  });

  dataFileInput?.addEventListener('change', function () {
    const file = this.files[0];
    console.log('[Wizard] File input changed:', {
      fileCount: this.files.length,
      fileName: file ? file.name : 'none',
      sourceType: wizardState.sourceType,
    });
    if (file) {
      const status = document.getElementById('fileUploadStatus');
      status.textContent = `✓ Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      status.style.color = '#10b981';
      console.log('[Wizard] File status updated for:', file.name);
    }
  });

  // Database source selection
  dbSourceSelect.addEventListener('change', function () {
    if (this.value) {
      wizardState.selectedSourceId = parseInt(this.value);
      newDbForm.classList.add('hidden');
    } else {
      newDbForm.classList.remove('hidden');
    }
  });
}

function testDatabaseConnection() {
  const config = {
    type: document.getElementById('dbType').value,
    host: document.getElementById('dbHost').value,
    port: document.getElementById('dbPort').value,
    database: document.getElementById('dbName').value,
    user: document.getElementById('dbUser').value,
    password: document.getElementById('dbPassword').value,
  };

  showAlert('Testing database connection…', 'info');

  fetch('/wizard/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceType: 'database', config }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        showAlert('✓ Database connection successful!', 'success');
      } else {
        showAlert('✗ Connection failed: ' + data.error, 'error');
      }
    })
    .catch((e) => showAlert('Error testing connection: ' + e.message, 'error'));
}

function testApiConnection() {
  const config = {
    url: document.getElementById('apiUrl').value,
    token: document.getElementById('apiToken').value,
  };

  if (!config.url) {
    showAlert('Please enter an API endpoint', 'error');
    return;
  }

  showAlert('Testing API connection…', 'info');

  fetch('/wizard/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceType: 'api', config }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        showAlert('✓ API connection successful!', 'success');
      } else {
        showAlert('✗ Connection failed: ' + data.error, 'error');
      }
    })
    .catch((e) => showAlert('Error testing connection: ' + e.message, 'error'));
}

// ===== STEP 2: Data Analysis =====

async function analyzeDataSource() {
  console.log('[Wizard] analyzeDataSource() called');
  
  const dataFileInput = document.getElementById('dataFileInput');
  const analysisContent = document.getElementById('analysisContent');
  const analysisResults = document.getElementById('analysisResults');
  const fileUploadStatus = document.getElementById('fileUploadStatus');
  const fileUploadSection = document.getElementById('fileUploadSection');

  console.log('[Wizard] Current state:', {
    sourceType: wizardState.sourceType,
    fileInputExists: !!dataFileInput,
    fileInputFiles: dataFileInput?.files?.length || 0,
  });

  if (wizardState.sourceType === 'file' && !dataFileInput.files.length) {
    const msg = 'Please select a file to analyze';
    console.error('[Wizard]', msg);
    showAlert(msg, 'error');
    return false;
  }

  // Verify file still exists before proceeding
  if (wizardState.sourceType === 'file') {
    const file = dataFileInput.files[0];
    if (!file) {
      const msg = 'File was lost. Please select the file again.';
      console.error('[Wizard]', msg);
      showAlert(msg, 'error');
      return false;
    }
    console.log('[Wizard] File verified:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Show loading state but keep file upload visible for retry
  analysisContent.classList.remove('hidden');
  analysisResults.classList.add('hidden');
  fileUploadSection.classList.add('hidden'); // Hide upload area while loading

  const formData = new FormData();
  if (wizardState.sourceType === 'file') {
    const file = dataFileInput.files[0];
    const fileType = getFileType(file.name);
    console.log('[Wizard] Uploading file:', file.name, 'Type detected:', fileType);
    
    // Verify form data construction
    formData.append('dataFile', file);
    formData.append('fileType', fileType);
    formData.append('sourceType', 'file');
    console.log('[Wizard] FormData prepared with:', file.name, fileType);
  } else {
    formData.append('sourceType', wizardState.sourceType);
    if (wizardState.selectedSourceId) {
      formData.append('sourceId', wizardState.selectedSourceId);
    }
  }

  try {
    console.log('[Wizard] Sending analysis request to /wizard/analyze...');
    const response = await fetch('/wizard/analyze', {
      method: 'POST',
      body: formData,
    });

    console.log('[Wizard] Response received, status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Wizard] Response not OK:', errorText);
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Wizard] Analysis response parsed:', data);

    if (!data.success) {
      const errorMsg = data.error || 'Analysis failed';
      console.error('[Wizard] Analysis failed:', errorMsg);
      throw new Error(errorMsg);
    }

    if (!data.analysis) {
      throw new Error('No analysis data received from server');
    }

    wizardState.analysisData = data.analysis;
    console.log('[Wizard] Analysis data stored successfully');

    // Capture the DataSourceId if the file was ingested
    if (data.analysis.dataSourceId) {
      wizardState.selectedSourceId = data.analysis.dataSourceId;
      console.log('[Wizard] DataSourceId captured:', wizardState.selectedSourceId);
    }

    // Display analysis results
    displayAnalysisResults(data.analysis);
    analysisContent.classList.add('hidden');
    analysisResults.classList.remove('hidden');

    // If Excel with multiple sheets, analyze each one sequentially
    const meta = data.analysis.sourceMeta;
    if (meta && meta.fileType === 'excel' && Array.isArray(meta.sheets) && meta.sheets.length > 1) {
      await analyzeAllSheets(meta);
    }

    console.log('[Wizard] Analysis results displayed successfully');
    return true;
  } catch (e) {
    console.error('[Wizard] Analysis error:', e);
    console.error('[Wizard] Error stack:', e.stack);
    showAlert('Analysis error: ' + e.message, 'error');
    analysisContent.classList.add('hidden');
    fileUploadSection.classList.remove('hidden'); // Show upload area again for retry
    return false;
  }
}

/**
 * Analyze every sheet in the workbook one by one with visible progress.
 * Disables Continue until all sheets are processed.
 */
async function analyzeAllSheets(meta) {
  if (!meta || !meta.filePath || !Array.isArray(meta.sheets)) return;

  // Initialize cache with the already-analyzed active sheet
  wizardState.sheetAnalyses = wizardState.sheetAnalyses || {};
  if (wizardState.analysisData && meta.activeSheet) {
    wizardState.sheetAnalyses[meta.activeSheet] = wizardState.analysisData;
  }

  setNavButtonsDisabled(true);
  const sel = document.getElementById('sheetSelect');
  if (sel) sel.disabled = true;

  const total = meta.sheets.length;
  let i = 0;
  for (const s of meta.sheets) {
    i += 1;
    if (wizardState.sheetAnalyses[s.name]) {
      updateSheetStatus(s.name, i, total, 'cached');
      continue;
    }
    updateSheetStatus(s.name, i, total, 'analyzing');
    try {
      const response = await fetch('/wizard/analyze-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: meta.filePath,
          sheetName: s.name,
          fileType: meta.fileType,
        }),
      });
      const data = await response.json();
      if (data.success) {
        wizardState.sheetAnalyses[s.name] = data.analysis;
      } else {
        console.warn('[Wizard] Sheet failed:', s.name, data.error);
        wizardState.sheetAnalyses[s.name] = { error: data.error };
      }
    } catch (err) {
      console.error('[Wizard] Sheet analyze error:', s.name, err);
      wizardState.sheetAnalyses[s.name] = { error: err.message };
    }
  }

  updateSheetStatus(null, total, total, 'done');
  if (sel) sel.disabled = false;
  setNavButtonsDisabled(false);
}

function updateSheetStatus(sheetName, current, total, state) {
  const status = document.getElementById('sheetProgress');
  if (!status) return;
  if (state === 'analyzing') {
    status.innerHTML = `<span class="spinner" style="border-color:rgba(102,126,234,0.3); border-top-color:#667eea;"></span> Analyzing sheet ${current} of ${total}: <strong>${escapeHtml(sheetName)}</strong>`;
    status.style.color = '#374151';
  } else if (state === 'cached') {
    status.innerHTML = `Sheet ${current} of ${total}: <strong>${escapeHtml(sheetName)}</strong> (already analyzed)`;
    status.style.color = '#6b7280';
  } else if (state === 'done') {
    status.innerHTML = `<i class="bi bi-check-circle-fill" style="color:#10b981;"></i> All ${total} sheet${total === 1 ? '' : 's'} analyzed`;
    status.style.color = '#065f46';
  }
}

async function reanalyzeSheet(sheetName) {
  const meta = wizardState.analysisData && wizardState.analysisData.sourceMeta;
  if (!meta || !meta.filePath) {
    showAlert('Cannot switch sheets: file path missing. Please re-upload.', 'error');
    return;
  }

  // Use cached analysis if we already have it
  wizardState.sheetAnalyses = wizardState.sheetAnalyses || {};
  const cached = wizardState.sheetAnalyses[sheetName];
  if (cached && !cached.error) {
    wizardState.analysisData = cached;
    displayAnalysisResults(cached);
    clearAlert();
    return;
  }

  const sel = document.getElementById('sheetSelect');
  if (sel) sel.disabled = true;
  setNavButtonsDisabled(true);
  showAlert(`Analyzing sheet "${sheetName}"…`, 'info');

  try {
    const response = await fetch('/wizard/analyze-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: meta.filePath,
        sheetName,
        fileType: meta.fileType,
      }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Sheet analysis failed');

    wizardState.sheetAnalyses[sheetName] = data.analysis;
    wizardState.analysisData = data.analysis;
    displayAnalysisResults(data.analysis);
    clearAlert();
  } catch (e) {
    console.error('[Wizard] Re-analyze error:', e);
    showAlert('Sheet analysis error: ' + e.message, 'error');
  } finally {
    if (sel) sel.disabled = false;
    setNavButtonsDisabled(false);
  }
}

function displayAnalysisResults(analysis) {
  document.getElementById('stat-rows').textContent = analysis.totalRows.toLocaleString();
  document.getElementById('stat-cols').textContent = analysis.totalColumns;
  document.getElementById('stat-quality').textContent = analysis.qualityScore + '%';
  document.getElementById('stat-complete').textContent = analysis.analysis.dataCompleteness + '%';

  // Show Excel sheet info if available
  const sheetsInfo = document.getElementById('sheetsInfo');
  if (sheetsInfo) {
    const meta = analysis.sourceMeta;
    if (meta && meta.fileType === 'excel' && Array.isArray(meta.sheets) && meta.sheets.length) {
      const options = meta.sheets
        .map((s) => {
          const label = `${s.name} — ${s.rowCount.toLocaleString()} rows × ${s.columnCount} cols`;
          const selected = s.name === meta.activeSheet ? ' selected' : '';
          return `<option value="${escapeHtml(s.name)}"${selected}>${escapeHtml(label)}</option>`;
        })
        .join('');
      sheetsInfo.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="font-weight:600;">
            <i class="bi bi-file-earmark-spreadsheet"></i> Excel workbook: ${meta.sheetCount} sheet${meta.sheetCount === 1 ? '' : 's'}
          </div>
          <label style="font-size:13px; color:#374151;">
            Analyzing:
            <select id="sheetSelect" style="margin-left:6px; padding:4px 8px; border:1px solid #d1d5db; border-radius:6px; background:#fff;">
              ${options}
            </select>
          </label>
        </div>
        <div id="sheetProgress" style="margin-top:8px; font-size:13px; color:#374151;"></div>
      `;
      sheetsInfo.classList.remove('hidden');

      const sel = document.getElementById('sheetSelect');
      if (sel) {
        sel.addEventListener('change', () => reanalyzeSheet(sel.value));
      }
    } else {
      sheetsInfo.classList.add('hidden');
    }
  }

  const kpiList = document.getElementById('kpiList');
  kpiList.innerHTML = '';
  if (analysis.potentialKpis.length > 0) {
    analysis.potentialKpis.forEach((kpi) => {
      const pill = document.createElement('div');
      pill.className = 'analysis-card';
      pill.innerHTML = `
        <strong style="color: #1f2937;">${kpi.label}</strong>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
          Column: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${kpi.column}</code>
        </div>
      `;
      kpiList.appendChild(pill);
    });
  } else {
    kpiList.innerHTML =
      '<div style="color: #9ca3af; font-size: 13px;">No specific KPIs detected. You can set custom KPIs in the next step.</div>';
  }
}

// ===== STEP 3: AI Recommendations =====

async function getRecommendations() {
  if (!wizardState.analysisData) {
    showAlert('No analysis data available', 'error');
    return false;
  }

  const recommendationsContent = document.getElementById('recommendationsContent');
  const recommendationsResults = document.getElementById('recommendationsResults');

  recommendationsContent.classList.remove('hidden');
  recommendationsResults.classList.add('hidden');

  try {
    const response = await fetch('/wizard/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: wizardState.analysisData }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get recommendations');
    }

    wizardState.recommendations = data.recommendations;

    // Display recommendations
    displayRecommendations(data.recommendations);
    recommendationsContent.classList.add('hidden');
    recommendationsResults.classList.remove('hidden');

    return true;
  } catch (e) {
    showAlert('Recommendations error: ' + e.message, 'error');
    return false;
  }
}

function displayRecommendations(recommendations) {
  const { dashboardType, kpis, charts } = recommendations;

  // Dashboard type
  const typeEl = document.getElementById('dashboardTypeRecommendation');
  document.getElementById('typeIcon').innerHTML = `<i class="bi ${dashboardType.icon}"></i>`;
  document.getElementById('typeName').textContent = dashboardType.type;
  document.getElementById('typeReason').textContent = dashboardType.description;
  typeEl.style.borderColor = dashboardType.color;
  typeEl.style.background = dashboardType.color + '15';

  // KPIs
  const kpiGrid = document.getElementById('kpiRecommendations');
  kpiGrid.innerHTML = '';
  kpis.forEach((kpi) => {
    const card = document.createElement('div');
    card.className = 'recommendation-card';
    card.dataset.kpi = JSON.stringify(kpi);
    card.innerHTML = `
      <div class="recommendation-icon">📊</div>
      <div class="recommendation-title">${kpi.label || kpi.column}</div>
      <div class="recommendation-desc">Type: ${kpi.type || 'metric'}</div>
    `;
    card.addEventListener('click', function () {
      this.classList.toggle('selected');
      updateSelectedItems('kpi', this.dataset.kpi, this.classList.contains('selected'));
    });
    kpiGrid.appendChild(card);
  });

  // Charts
  const chartGrid = document.getElementById('chartRecommendations');
  chartGrid.innerHTML = '';
  charts.forEach((chart) => {
    const card = document.createElement('div');
    card.className = 'recommendation-card';
    card.dataset.chart = chart.type;
    card.innerHTML = `
      <div class="recommendation-icon"><i class="bi bi-graph-up"></i></div>
      <div class="recommendation-title">${chart.label}</div>
      <div class="recommendation-desc">${chart.description}</div>
    `;
    card.addEventListener('click', function () {
      this.classList.toggle('selected');
      updateSelectedItems('chart', chart.type, this.classList.contains('selected'));
    });
    chartGrid.appendChild(card);
  });
}

function updateSelectedItems(type, item, isSelected) {
  if (type === 'kpi') {
    const kpi = JSON.parse(item);
    if (isSelected) {
      wizardState.selectedKpis.push(kpi);
    } else {
      wizardState.selectedKpis = wizardState.selectedKpis.filter((k) => k.column !== kpi.column);
    }
  } else if (type === 'chart') {
    if (isSelected) {
      wizardState.selectedCharts.push(item);
    } else {
      wizardState.selectedCharts = wizardState.selectedCharts.filter((c) => c !== item);
    }
  }
}

// ===== STEP 4: Style Selection =====

function setupStep4() {
  const themeGrid = document.getElementById('themeGrid');
  const layoutGrid = document.getElementById('layoutGrid');
  const dashboardTitleInput = document.getElementById('dashboardTitle');

  // This would be populated from the server data, but for now we'll create themes dynamically
  // In production, themes would come from the controller

  // Update title on input
  dashboardTitleInput.addEventListener('input', function () {
    wizardState.dashboardTitle = this.value.trim();
  });
}

// ===== STEP 5: Generate Dashboard =====

async function generateDashboard() {
  if (!wizardState.dashboardTitle.trim()) {
    showAlert('Please enter a dashboard title', 'error');
    return false;
  }

  const generationProgress = document.getElementById('generationProgress');
  const generationSuccess = document.getElementById('generationSuccess');

  generationProgress.classList.remove('hidden');
  generationSuccess.classList.add('hidden');

  try {
    const response = await fetch('/wizard/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: wizardState.dashboardTitle,
        dataSourceId: wizardState.selectedSourceId,
        dashboardType: 'executive',
        selectedKpis: wizardState.selectedKpis,
        selectedCharts: wizardState.selectedCharts,
        theme: wizardState.selectedTheme,
        layout: wizardState.selectedLayout,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Generation failed');
    }

    wizardState.dashboardConfig = data.dashboard;
    generationProgress.classList.add('hidden');
    generationSuccess.classList.remove('hidden');

    return true;
  } catch (e) {
    showAlert('Generation error: ' + e.message, 'error');
    generationProgress.classList.add('hidden');
    return false;
  }
}

// ===== STEP 6: Save & Share =====

function saveDashboard() {
  if (!wizardState.dashboardConfig) {
    showAlert('No dashboard to save', 'error');
    return;
  }

  fetch('/wizard/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: wizardState.dashboardTitle,
      dashboardConfig: wizardState.dashboardConfig,
      dataSourceId: wizardState.selectedSourceId,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success) {
        showAlert('✓ Dashboard saved successfully!', 'success');
        setTimeout(() => {
          window.location.href = data.redirectUrl || '/dashboard/history';
        }, 1500);
      } else {
        showAlert('Failed to save: ' + data.error, 'error');
      }
    })
    .catch((e) => showAlert('Save error: ' + e.message, 'error'));
}

function editInCanvas() {
  if (!wizardState.dashboardConfig) {
    showAlert('No dashboard to edit', 'error');
    return;
  }

  showAlert('Saving dashboard and opening canvas editor…', 'info');

  fetch('/wizard/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: wizardState.dashboardTitle || 'Untitled Dashboard',
      dashboardConfig: wizardState.dashboardConfig,
      dataSourceId: wizardState.selectedSourceId,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success && data.dashboard && data.dashboard.id) {
        window.location.href = `/dashboard/${data.dashboard.id}/edit-canvas`;
      } else {
        showAlert('Failed to open in canvas: ' + (data.error || 'unknown error'), 'error');
      }
    })
    .catch((e) => showAlert('Edit in canvas error: ' + e.message, 'error'));
}

function exportDashboard(format) {
  if (!wizardState.dashboardConfig) {
    showAlert('No dashboard to export', 'error');
    return;
  }

  showAlert('Export feature coming soon!', 'info');
  // Implementation would use html2canvas + jsPDF
}

// ===== Navigation & UI Control =====

async function nextStep() {
  if (wizardState.currentStep >= wizardState.totalSteps) return;

  // Validate current step before moving forward
  if (!validateStep(wizardState.currentStep)) {
    return;
  }

  // Determine status message for current step
  const stepMessages = {
    1: 'Uploading and analyzing your data…',
    2: 'Generating AI recommendations…',
    4: 'Building your dashboard…',
  };
  const message = stepMessages[wizardState.currentStep];
  const needsProcessing = !!message;

  // Disable nav buttons & show loading state on Continue
  const originalNextHtml = nextBtnEl.innerHTML;
  if (needsProcessing) {
    setNavButtonsDisabled(true);
    nextBtnEl.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${message}`;
    showAlert(message, 'info');
  }

  try {
    // Execute step-specific logic
    if (wizardState.currentStep === 1) {
      if (!(await analyzeDataSource())) return;
    } else if (wizardState.currentStep === 2) {
      if (!(await getRecommendations())) return;
    } else if (wizardState.currentStep === 4) {
      if (!(await generateDashboard())) return;
    }

    moveToStep(wizardState.currentStep + 1);
    if (needsProcessing) clearAlert();
  } finally {
    if (needsProcessing) {
      setNavButtonsDisabled(false);
      // Restore label (updateNavButtons will overwrite if step changed)
      nextBtnEl.innerHTML = originalNextHtml;
      updateNavButtons();
    }
  }
}

function setNavButtonsDisabled(disabled) {
  if (nextBtnEl) nextBtnEl.disabled = disabled;
  if (prevBtnEl) prevBtnEl.disabled = disabled || wizardState.currentStep <= 1;
}

function previousStep() {
  if (wizardState.currentStep <= 1) return;
  moveToStep(wizardState.currentStep - 1);
}

function moveToStep(stepNumber) {
  if (stepNumber < 1 || stepNumber > wizardState.totalSteps) return;

  // Hide all steps
  document.querySelectorAll('.wizard-step').forEach((step) => step.classList.remove('active'));

  // Show target step
  document.querySelector(`.wizard-step[data-step="${stepNumber}"]`).classList.add('active');

  wizardState.currentStep = stepNumber;
  updateStepperUI();
  updateNavButtons();

  // Scroll to top
  document.querySelector('.wizard-body').scrollTop = 0;
}

function updateStepperUI() {
  currentStepEl.textContent = wizardState.currentStep;

  document.querySelectorAll('.stepper-step').forEach((step, idx) => {
    const stepNum = idx + 1;
    step.classList.remove('active', 'completed');

    if (stepNum === wizardState.currentStep) {
      step.classList.add('active');
    } else if (stepNum < wizardState.currentStep) {
      step.classList.add('completed');
    }
  });
}

function updateNavButtons() {
  prevBtnEl.disabled = wizardState.currentStep <= 1;
  
  if (wizardState.currentStep === wizardState.totalSteps) {
    nextBtnEl.innerHTML = '<i class="bi bi-check-lg"></i> Complete';
  } else if (wizardState.currentStep === 5) {
    nextBtnEl.innerHTML = 'Next <i class="bi bi-chevron-right"></i>';
  } else {
    nextBtnEl.innerHTML = 'Continue <i class="bi bi-chevron-right"></i>';
  }
}

function validateStep(stepNumber) {
  console.log('[Wizard] Validating step', stepNumber, 'with state:', {
    sourceType: wizardState.sourceType,
    hasFile: document.getElementById('dataFileInput')?.files.length > 0,
    fileCount: document.getElementById('dataFileInput')?.files.length || 0,
  });

  switch (stepNumber) {
    case 1:
      if (!wizardState.sourceType) {
        console.error('[Wizard] Validation failed: No source type selected');
        showAlert('Please select a data source type', 'error');
        return false;
      }
      if (wizardState.sourceType === 'file') {
        const fileInput = document.getElementById('dataFileInput');
        const fileCount = fileInput?.files.length || 0;
        console.log('[Wizard] File validation:', {
          sourceType: wizardState.sourceType,
          fileInputElement: !!fileInput,
          fileCount: fileCount,
        });
        if (!fileCount) {
          console.error('[Wizard] Validation failed: No file selected. Files:', fileInput?.files);
          showAlert('Please select a file to analyze', 'error');
          return false;
        }
      }
      return true;
    case 3:
      if (wizardState.selectedKpis.length === 0 && wizardState.selectedCharts.length === 0) {
        showAlert('Please select at least one KPI or chart', 'info');
        // Don't block - this is optional
      }
      return true;
    case 4:
      if (!wizardState.dashboardTitle.trim()) {
        showAlert('Please enter a dashboard title', 'error');
        return false;
      }
      return true;
    default:
      return true;
  }
}

// ===== Utility Functions =====

function showAlert(message, type) {
  const typeClass = {
    success: 'alert-success',
    error: 'alert-error',
    info: 'alert-info',
  }[type] || 'alert-info';

  const icons = {
    success: 'bi-check-circle-fill',
    error: 'bi-exclamation-circle-fill',
    info: 'bi-info-circle-fill',
  };

  alertBoxEl.className = `alert ${typeClass}`;
  alertBoxEl.innerHTML = `
    <i class="bi ${icons[type]}"></i>
    <span>${message}</span>
  `;
  alertBoxEl.classList.remove('hidden');
  
  // Always log alerts for debugging
  console.log(`[Alert] ${type.toUpperCase()}: ${message}`);

  if (type === 'success') {
    setTimeout(() => alertBoxEl.classList.add('hidden'), 4000);
  }
}

function clearAlert() {
  if (alertBoxEl) alertBoxEl.classList.add('hidden');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['csv'].includes(ext)) return 'csv';
  if (['xlsx', 'xls'].includes(ext)) return 'excel';
  if (['json'].includes(ext)) return 'json';
  return 'csv';
}

// Save wizard progress (for resume functionality)
window.addEventListener('beforeunload', function () {
  if (wizardState.currentStep > 1 && wizardState.currentStep < wizardState.totalSteps) {
    // Optionally save progress to session
    fetch('/wizard/save-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wizardState }),
    }).catch(() => {}); // Ignore errors on unload
  }
});

// Check for saved wizard progress on load
document.addEventListener('DOMContentLoaded', async function () {
  try {
    const response = await fetch('/wizard/resume');
    const data = await response.json();

    if (data.success && data.wizardState) {
      // Could restore previous wizard state here
      console.log('[Wizard] Previous progress available for resume');
    }
  } catch (e) {
    // No saved progress
  }
});
