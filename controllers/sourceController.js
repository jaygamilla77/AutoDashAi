const db = require('../models');
const sourceIngestionService = require('../services/sourceIngestionService');
const { safeJsonParse } = require('../utils/helpers');
const { SOURCE_TYPES } = require('../utils/constants');

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

exports.create = async (req, res) => {
  try {
    const { name, sourceType, apiUrl, apiHeaders, apiParams } = req.body;

    if (!name || !sourceType) {
      req.flash('error', 'Source name and type are required.');
      return res.redirect('/sources/new');
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
      sourceData.configJson = JSON.stringify({
        url: apiUrl.trim(),
        headers: safeJsonParse(apiHeaders) || {},
        params: safeJsonParse(apiParams) || {},
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

    // Build per-sheet datasets for the view
    const datasets = schemas.map((s) => ({
      datasetName: s.datasetName,
      schemaData: safeJsonParse(s.schemaJson),
      profileData: safeJsonParse(s.profileJson),
      previewData: safeJsonParse(s.previewJson),
    }));

    // Backwards-compat: first dataset exposed as flat vars for non-multi views
    const first = datasets[0] || {};

    res.render('source-detail', {
      title: `Source: ${source.name}`,
      source,
      datasets,                          // all sheets / datasets
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

    req.flash('success', 'Data source tested and refreshed successfully.');
    res.redirect(`/sources/${source.id}`);
  } catch (err) {
    console.error('Source test error:', err);
    req.flash('error', `Source test failed: ${err.message}`);
    res.redirect(`/sources/${req.params.id}`);
  }
};
