const db = require('../models');
const sourceIngestionService = require('../services/sourceIngestionService');
const semanticModelService = require('../services/semanticModelService');
const { safeJsonParse } = require('../utils/helpers');
const { SOURCE_TYPES } = require('../utils/constants');

function parseOptionalJsonObject(input, fieldLabel) {
  const raw = (input == null ? '' : String(input)).trim();
  if (!raw) return {};
  // Common UX: users paste JSON wrapped in single quotes like '{"a":1}'
  const unwrapped = ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')))
    ? raw.slice(1, -1).trim()
    : raw;
  let parsed;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    throw new Error(`${fieldLabel} must be a valid JSON object (example: {"key":"value"}).`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel} must be a JSON object (not an array or value).`);
  }
  return parsed;
}

exports.list = async (req, res) => {
  try {
    const sources = await db.DataSource.findAll({ order: [['createdAt', 'DESC']] });
    res.render('sources', { title: 'Data Sources', sources });
  } catch (err) {
    console.error('Source list error:', err);
    req.flash('error', 'Failed to load data sources.');
    res.render('sources', { title: 'Data Sources', sources: [] });
  }
};

exports.showForm = (req, res) => {
  res.render('source-form', { title: 'Add Data Source', sourceTypes: SOURCE_TYPES });
};

exports.create = async (req, res, next) => {
  try {
    const { name, sourceType, apiUrl, apiHeaders, apiParams } = req.body;

    if (!name || !sourceType) {
      req.flash('error', 'Source name and type are required.');
      return res.redirect('/sources/new');
    }

    // Plan limit enforcement (multi-tenant SaaS Phase 2)
    if (req.workspace) {
      const workspaceService = require('../services/workspaceService');
      const currentCount = await db.DataSource.count();
      try {
        workspaceService.enforceLimit(req.workspace, 'dataSources', currentCount);
      } catch (limitErr) { return next(limitErr); }
    }

    if (!SOURCE_TYPES.includes(sourceType)) {
      req.flash('error', 'Invalid source type.');
      return res.redirect('/sources/new');
    }

    const sourceData = {
      name: name.trim(),
      sourceType,
      status: 'active',
    };

    // Handle file-based sources
    if (['excel', 'csv', 'json'].includes(sourceType)) {
      if (!req.file) {
        req.flash('error', 'Please upload a file for this source type.');
        return res.redirect('/sources/new');
      }
      sourceData.filePath = req.file.path;
      sourceData.originalFileName = req.file.originalname;
      sourceData.mimeType = req.file.mimetype;
    }

    // Handle API source
    if (sourceType === 'api') {
      if (!apiUrl || !apiUrl.trim()) {
        req.flash('error', 'API URL is required for API sources.');
        return res.redirect('/sources/new');
      }
      let headersObj = {};
      let paramsObj = {};
      try {
        headersObj = parseOptionalJsonObject(apiHeaders, 'Headers');
        paramsObj = parseOptionalJsonObject(apiParams, 'Query Params');
      } catch (e) {
        req.flash('error', e.message);
        return res.redirect('/sources/new');
      }
      sourceData.configJson = JSON.stringify({
        url: apiUrl.trim(),
        headers: headersObj,
        params: paramsObj,
        method: 'GET',
      });
    }

    // Handle database source
    if (sourceType === 'database') {
      sourceData.configJson = JSON.stringify({
        type: 'internal',
        description: 'Internal application database',
      });
    }

    const source = await db.DataSource.create(sourceData);

    // Ingest and profile the source
    try {
      await sourceIngestionService.ingest(source);
      source.lastSyncedAt = new Date();
      await source.save();
      req.flash('success', `Data source "${source.name}" created and profiled successfully.`);
    } catch (ingErr) {
      console.error('Ingestion error:', ingErr);
      source.status = 'error';
      await source.save();
      req.flash('warning', `Source created but ingestion failed: ${ingErr.message}`);
    }

    res.redirect(`/sources/${source.id}`);
  } catch (err) {
    console.error('Source create error:', err);
    req.flash('error', `Failed to create data source: ${err.message}`);
    res.redirect('/sources/new');
  }
};

exports.detail = async (req, res) => {
  try {
    const source = await db.DataSource.findByPk(req.params.id, {
      include: [{ model: db.DataSourceSchema }],
    });

    if (!source) {
      req.flash('error', 'Data source not found.');
      return res.redirect('/sources');
    }

    const schemas = source.DataSourceSchemas || [];
    const config = safeJsonParse(source.configJson);
    const analysis = safeJsonParse(source.analysisJson);

    // Build per-sheet datasets for the view (exclude the __unified__ virtual sheet)
    const datasets = schemas
      .filter((s) => s.datasetName !== '__unified__')
      .map((s) => ({
        datasetName: s.datasetName,
        schemaData: safeJsonParse(s.schemaJson),
        profileData: safeJsonParse(s.profileJson),
        previewData: safeJsonParse(s.previewJson),
      }));

    // Unified dataset (all sheets merged)
    const unifiedSchema = schemas.find((s) => s.datasetName === '__unified__');
    const unifiedDataset = unifiedSchema ? {
      previewData: safeJsonParse(unifiedSchema.previewJson),
      schemaData: safeJsonParse(unifiedSchema.schemaJson),
      profileData: safeJsonParse(unifiedSchema.profileJson),
    } : null;

    // Backwards-compat: first dataset exposed as flat vars for non-multi views
    const first = datasets[0] || {};

    res.render('source-detail', {
      title: `Source: ${source.name}`,
      source,
      datasets,                          // all sheets / datasets
      unifiedDataset,                    // merged all-sheets table
      analysis,                          // relationships + suggestedPrompts
      schemaData: first.schemaData,      // single-dataset compat
      profileData: first.profileData,
      previewData: first.previewData,
      config,
    });
  } catch (err) {
    console.error('Source detail error:', err);
    req.flash('error', 'Failed to load source details.');
    res.redirect('/sources');
  }
};

exports.test = async (req, res) => {
  try {
    const source = await db.DataSource.findByPk(req.params.id);
    if (!source) {
      req.flash('error', 'Data source not found.');
      return res.redirect('/sources');
    }

    await sourceIngestionService.ingest(source);
    source.lastSyncedAt = new Date();
    source.status = 'active';
    await source.save();

    req.flash('success', 'Data source refreshed and re-analyzed successfully.');
    res.redirect(`/sources/${source.id}`);
  } catch (err) {
    console.error('Source test error:', err);
    req.flash('error', `Source refresh failed: ${err.message}`);
    res.redirect(`/sources/${req.params.id}`);
  }
};

/**
 * Re-run analysis only (relationships + prompt suggestions) without re-ingesting data.
 */
exports.analyze = async (req, res) => {
  try {
    const source = await db.DataSource.findByPk(req.params.id, {
      include: [{ model: db.DataSourceSchema }],
    });
    if (!source) {
      req.flash('error', 'Data source not found.');
      return res.redirect('/sources');
    }

    const { analyzeSheets, buildUnifiedTable } = require('../services/fileParserService');
    const schemas = (source.DataSourceSchemas || []).filter((s) => s.datasetName !== '__unified__');

    if (schemas.length === 0) {
      req.flash('warning', 'No schema data found. Please refresh the source first.');
      return res.redirect(`/sources/${source.id}`);
    }

    // Reconstruct sheet-like objects from stored schemas
    const sheets = schemas.map((s) => ({
      sheetName: s.datasetName,
      columns: (() => { try { const sc = JSON.parse(s.schemaJson); return sc.map((f) => f.name); } catch { return []; } })(),
      rows: (() => { try { return JSON.parse(s.previewJson); } catch { return []; } })(),
    }));

    const { relationships, suggestedPrompts } = analyzeSheets(sheets, source.name);
    const unified = buildUnifiedTable(sheets);

    await source.update({
      analysisJson: JSON.stringify({
        relationships,
        suggestedPrompts,
        unifiedColumns: unified.columns,
        unifiedTotalRows: unified.totalRows,
      }),
    });

    req.flash('success', `Analysis complete — ${suggestedPrompts.length} prompt suggestions generated.`);
    res.redirect(`/sources/${source.id}`);
  } catch (err) {
    console.error('Source analyze error:', err);
    req.flash('error', `Analysis failed: ${err.message}`);
    res.redirect(`/sources/${req.params.id}`);
  }
};

// ── Semantic model endpoints ────────────────────────────────────────────────

exports.semanticModelGet = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ds = await db.DataSource.findByPk(id);
    if (!ds) return res.status(404).json({ ok: false, error: 'Data source not found.' });
    let model = await semanticModelService.getById(id);
    if (!model) {
      const schemas = await db.DataSourceSchema.findAll({ where: { dataSourceId: id }, raw: true });
      const unified = schemas.find(s => s.datasetName === '__unified__') || schemas[0];
      if (unified) {
        const profile = JSON.parse(unified.profileJson || '{}');
        model = semanticModelService.buildFromProfile(profile, { dataSourceId: id, sourceName: ds.name });
        await semanticModelService.save(id, model);
      } else {
        model = { version: 1, dataSourceId: id, generatedAt: new Date().toISOString(), tables: [], relationships: [], facts: {} };
      }
    }
    res.json({ ok: true, model });
  } catch (err) {
    console.error('semanticModelGet error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.semanticModelUpdate = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const incoming = req.body && req.body.model;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ ok: false, error: 'Missing model payload.' });
    }
    if (!Array.isArray(incoming.tables)) {
      return res.status(400).json({ ok: false, error: 'model.tables[] is required.' });
    }
    const saved = await semanticModelService.save(id, incoming);
    res.json({ ok: true, model: saved });
  } catch (err) {
    console.error('semanticModelUpdate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.semanticModelRebuild = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ds = await db.DataSource.findByPk(id);
    if (!ds) return res.status(404).json({ ok: false, error: 'Data source not found.' });
    const schemas = await db.DataSourceSchema.findAll({ where: { dataSourceId: id }, raw: true });
    const unified = schemas.find(s => s.datasetName === '__unified__') || schemas[0];
    if (!unified) return res.status(400).json({ ok: false, error: 'No schema available — re-ingest first.' });
    const profile = JSON.parse(unified.profileJson || '{}');
    const model = semanticModelService.buildFromProfile(profile, { dataSourceId: id, sourceName: ds.name });
    const saved = await semanticModelService.save(id, model);
    res.json({ ok: true, model: saved });
  } catch (err) {
    console.error('semanticModelRebuild error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

exports.destroy = async (req, res) => {
  try {
    const source = await db.DataSource.findByPk(req.params.id);
    if (!source) {
      req.flash('error', 'Data source not found.');
      return res.redirect('/sources');
    }
    const id = source.id;
    const name = source.name;
    // Use raw SQL in explicit order to avoid SQLite FK constraint failures
    await db.sequelize.query('DELETE FROM `data_source_schemas` WHERE `dataSourceId` = ?', { replacements: [id] });
    await db.sequelize.query('DELETE FROM `prompt_history` WHERE `dataSourceId` = ?', { replacements: [id] });
    await db.sequelize.query('DELETE FROM `saved_dashboards` WHERE `dataSourceId` = ?', { replacements: [id] });
    await db.sequelize.query('DELETE FROM `data_sources` WHERE `id` = ?', { replacements: [id] });
    req.flash('success', `"${name}" deleted successfully.`);
    res.redirect('/sources');
  } catch (err) {
    console.error('Source delete error:', err);
    req.flash('error', 'Failed to delete source: ' + err.message);
    res.redirect('/sources');
  }
};
