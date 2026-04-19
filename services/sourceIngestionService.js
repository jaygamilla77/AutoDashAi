/**
 * Source Ingestion Service
 *
 * Coordinates data ingestion by source type:
 * calls the correct parser/fetcher, normalizes output,
 * profiles schema, and persists DataSourceSchema.
 */

const db = require('../models');
const fileParserService = require('./fileParserService');
const apiIngestionService = require('./apiIngestionService');
const schemaProfilerService = require('./schemaProfilerService');
const { safeJsonParse } = require('../utils/helpers');

/**
 * Ingest a data source: parse, profile, and store schema/preview.
 */
async function ingest(source) {
  let parsed;

  switch (source.sourceType) {
    case 'csv':
    case 'excel':
    case 'json':
      if (!source.filePath) throw new Error('No file path for file-based source.');
      parsed = await fileParserService.parseFile(source.filePath, source.sourceType);
      break;

    case 'api': {
      const config = safeJsonParse(source.configJson);
      if (!config) throw new Error('Invalid API configuration.');
      parsed = await apiIngestionService.fetchAndParse(config);
      break;
    }

    case 'database':
      // Internal database — profile built-in models
      parsed = await profileInternalDatabase();
      break;

    default:
      throw new Error(`Unsupported source type: ${source.sourceType}`);
  }

  const { columns, rows } = parsed;

  // Profile the data
  const { schema, profile } = schemaProfilerService.profileData(columns, rows);

  // Upsert DataSourceSchema
  const existing = await db.DataSourceSchema.findOne({
    where: { dataSourceId: source.id },
  });

  const schemaPayload = {
    dataSourceId: source.id,
    datasetName: source.name,
    schemaJson: JSON.stringify(schema),
    profileJson: JSON.stringify(profile),
    previewJson: JSON.stringify(rows.slice(0, 50)),
  };

  if (existing) {
    await existing.update(schemaPayload);
  } else {
    await db.DataSourceSchema.create(schemaPayload);
  }

  return { schema, profile, preview: rows.slice(0, 50) };
}

/**
 * Build profile for internal database (demo models).
 */
async function profileInternalDatabase() {
  const columns = [
    'employees', 'departments', 'projects',
    'productivity_records', 'tickets',
  ];

  const counts = {};
  try {
    counts.employees = await db.Employee.count();
    counts.departments = await db.Department.count();
    counts.projects = await db.Project.count();
    counts.productivity_records = await db.ProductivityRecord.count();
    counts.tickets = await db.Ticket.count();
  } catch {
    // Tables may not exist yet
  }

  const rows = columns.map((table) => ({
    table,
    recordCount: counts[table] || 0,
  }));

  return { columns: ['table', 'recordCount'], rows };
}

module.exports = { ingest };
