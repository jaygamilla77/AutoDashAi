require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'change_me_in_production',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB, 10) || 10,
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Supported source types
  sourceTypes: ['database', 'excel', 'csv', 'json', 'api'],

  // Supported chart types
  chartTypes: ['auto', 'bar', 'line', 'pie', 'doughnut', 'table'],

  // Allowed upload extensions
  allowedExtensions: ['.csv', '.xlsx', '.json'],

  // Allowed MIME types
  allowedMimeTypes: [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain',
  ],

  // Preview row limit
  previewRowLimit: 50,
};
