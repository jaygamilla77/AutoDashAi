// Application-wide constants

module.exports = {
  SOURCE_TYPES: ['database', 'excel', 'csv', 'json', 'api'],
  CHART_TYPES: ['auto', 'bar', 'line', 'pie', 'doughnut', 'table'],
  SOURCE_STATUSES: ['active', 'inactive', 'error'],

  // Entities the prompt parser recognizes
  KNOWN_ENTITIES: ['employee', 'department', 'project', 'ticket', 'productivity'],

  // Supported metrics
  KNOWN_METRICS: ['count', 'sum', 'avg', 'min', 'max'],

  // Recognized date phrases
  DATE_PHRASES: [
    'today', 'yesterday', 'this week', 'last week',
    'this month', 'last month', 'this quarter', 'this year',
  ],

  TICKET_STATUSES: ['open', 'in_progress', 'resolved', 'closed'],
  PROJECT_STATUSES: ['active', 'completed', 'on_hold'],
  PRIORITIES: ['low', 'medium', 'high', 'critical'],

  SAMPLE_PROMPTS: [
    'Show me employees with low productivity this month',
    'Compare productivity by department',
    'Show unresolved tickets by priority',
    'Top 10 projects by budget',
    'Show average hours logged by department',
    'Show active projects by department',
    'Show monthly ticket trend',
    'Show inactive employees by department',
    'Project count by status',
    'Show highest budget projects',
  ],
};
