// Application-wide constants

// All supported chart types (flat list for DB/prompt-parser compatibility)
const CHART_TYPES = [
  // core
  'auto','bar','line','pie','doughnut','table','cards',
  // basic
  'hbar','area','stackedbar','stackedarea','multiline',
  // analytical
  'scatter','bubble','histogram','radar','polarArea',
  'waterfall','funnel','treemap','heatmap',
  // kpi/executive
  'gauge','gauge_ring','bullet',
  // time
  'timeline',
  // ai-powered
  'forecast',
];

// Grouped structure for dropdown UI
const CHART_TYPE_GROUPS = [
  {
    group: '✨ Smart',
    types: [{ value:'auto', label:'Auto (AI Picks Best)', icon:'bi-stars' }],
  },
  {
    group: '📊 Basic Charts',
    types: [
      { value:'bar',        label:'Bar Chart',         icon:'bi-bar-chart' },
      { value:'hbar',       label:'Horizontal Bar',    icon:'bi-bar-chart-horizontal' },
      { value:'line',       label:'Line Chart',        icon:'bi-graph-up' },
      { value:'area',       label:'Area Chart',        icon:'bi-graph-up-arrow' },
      { value:'stackedbar', label:'Stacked Bar',       icon:'bi-bar-chart-steps' },
      { value:'stackedarea',label:'Stacked Area',      icon:'bi-layers' },
      { value:'multiline',  label:'Multi-Line Chart',  icon:'bi-activity' },
      { value:'pie',        label:'Pie Chart',         icon:'bi-pie-chart' },
      { value:'doughnut',   label:'Doughnut Chart',    icon:'bi-pie-chart-fill' },
    ],
  },
  {
    group: '🔬 Analytical Charts',
    types: [
      { value:'scatter',   label:'Scatter Plot',      icon:'bi-diagram-3' },
      { value:'bubble',    label:'Bubble Chart',      icon:'bi-record-circle' },
      { value:'histogram', label:'Histogram',         icon:'bi-bar-chart-fill' },
      { value:'radar',     label:'Radar Chart',       icon:'bi-pentagon' },
      { value:'polarArea', label:'Polar Area Chart',  icon:'bi-bullseye' },
      { value:'heatmap',   label:'Heatmap',           icon:'bi-grid-3x3' },
      { value:'treemap',   label:'Treemap',           icon:'bi-grid-1x2' },
      { value:'waterfall', label:'Waterfall Chart',   icon:'bi-reception-4' },
      { value:'funnel',    label:'Funnel Chart',      icon:'bi-funnel' },
    ],
  },
  {
    group: '🎯 KPI & Executive',
    types: [
      { value:'gauge',      label:'Gauge Chart',      icon:'bi-speedometer' },
      { value:'gauge_ring', label:'Progress Ring',    icon:'bi-arrow-repeat' },
      { value:'bullet',     label:'Bullet Chart',     icon:'bi-chevron-bar-right' },
      { value:'cards',      label:'KPI Cards',        icon:'bi-card-heading' },
    ],
  },
  {
    group: '⏱️ Time-Based',
    types: [
      { value:'timeline',  label:'Timeline Chart',    icon:'bi-clock-history' },
    ],
  },
  {
    group: '🤖 AI-Powered',
    types: [
      { value:'forecast',  label:'Forecast Trend',    icon:'bi-magic' },
    ],
  },
  {
    group: '📋 Data Views',
    types: [
      { value:'table',     label:'Data Table',        icon:'bi-table' },
    ],
  },
];

module.exports = {
  SOURCE_TYPES: ['database', 'excel', 'csv', 'json', 'api'],
  CHART_TYPES,
  CHART_TYPE_GROUPS,
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
