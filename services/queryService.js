/**
 * Query Service
 *
 * Takes a structured request and queries the appropriate data source safely.
 * For app DB: uses Sequelize ORM.
 * For file/API sources: uses safe in-memory JavaScript aggregation.
 */

const { Op } = require('sequelize');
const db = require('../models');
const { safeJsonParse, groupBy, aggregate } = require('../utils/helpers');

// Allowed entities for internal DB queries
const ALLOWED_ENTITIES = ['employee', 'department', 'project', 'ticket', 'productivity'];

/**
 * Execute a structured request against the appropriate data source.
 * @param {object} structuredRequest - parsed prompt output
 * @param {object|null} dataSource - DataSource model instance
 * @returns {{ labels, values, rows, columns, summary }}
 */
async function execute(structuredRequest, dataSource) {
  const { focusArea } = structuredRequest;

  // If data source is file/API-based, query from stored preview data
  if (dataSource && ['csv', 'excel', 'json', 'api'].includes(dataSource.sourceType)) {
    return executeOnPreviewData(structuredRequest, dataSource);
  }

  // Internal database query
  if (!ALLOWED_ENTITIES.includes(focusArea)) {
    return executeGenericCount(structuredRequest);
  }

  switch (focusArea) {
    case 'employee':
      return queryEmployees(structuredRequest);
    case 'productivity':
      return queryProductivity(structuredRequest);
    case 'ticket':
      return queryTickets(structuredRequest);
    case 'project':
      return queryProjects(structuredRequest);
    case 'department':
      return queryDepartments(structuredRequest);
    default:
      return executeGenericCount(structuredRequest);
  }
}

// ========== Internal DB Queries ==========

async function queryEmployees(req) {
  const where = {};
  if (req.filters.isActive === false) where.isActive = false;
  else if (req.filters.isActive === true) where.isActive = true;

  const employees = await db.Employee.findAll({
    where,
    include: [{ model: db.Department, attributes: ['name'] }],
    raw: true,
    nest: true,
  });

  // Group by dimension
  const dim = req.dimensions[0] || 'department';
  let labels, values, rows;

  if (dim === 'department') {
    const grouped = groupBy(employees, 'Department.name');
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ department: l, count: values[i] }));
  } else {
    labels = employees.map((e) => e.fullName);
    values = employees.map(() => 1);
    rows = employees.map((e) => ({
      name: e.fullName,
      department: e['Department.name'] || e.Department?.name,
      isActive: e.isActive,
    }));
  }

  if (req.limit) {
    labels = labels.slice(0, req.limit);
    values = values.slice(0, req.limit);
    rows = rows.slice(0, req.limit);
  }

  return {
    labels,
    values,
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    summary: { total: employees.length },
  };
}

async function queryProductivity(req) {
  const where = {};
  if (req.filters.dateStart && req.filters.dateEnd) {
    where.workDate = { [Op.between]: [req.filters.dateStart, req.filters.dateEnd] };
  }

  const records = await db.ProductivityRecord.findAll({
    where,
    include: [
      { model: db.Employee, attributes: ['fullName', 'departmentId'], include: [{ model: db.Department, attributes: ['name'] }] },
      { model: db.Project, attributes: ['name'] },
    ],
    raw: true,
    nest: true,
  });

  const dim = req.dimensions[0] || 'department';
  let labels, values, rows;
  const metricKey = req.metrics[0] || 'avg_productivity_score';

  if (dim === 'department') {
    const grouped = {};
    for (const r of records) {
      const deptName = r.Employee?.Department?.name || 'Unknown';
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(r);
    }
    labels = Object.keys(grouped);
    values = labels.map((k) => {
      const g = grouped[k];
      if (metricKey.includes('hours')) return aggregate(g.map((r) => r.hoursLogged), 'avg');
      if (metricKey.includes('tasks')) return aggregate(g.map((r) => r.tasksCompleted), 'avg');
      return aggregate(g.map((r) => r.productivityScore), 'avg');
    });
    rows = labels.map((l, i) => ({ department: l, [metricKey]: parseFloat(values[i].toFixed(2)) }));
  } else if (dim === 'employee') {
    const grouped = {};
    for (const r of records) {
      const name = r.Employee?.fullName || 'Unknown';
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(r);
    }
    labels = Object.keys(grouped);
    values = labels.map((k) => {
      const g = grouped[k];
      return aggregate(g.map((r) => r.productivityScore), 'avg');
    });
    rows = labels.map((l, i) => ({ employee: l, avgScore: parseFloat(values[i].toFixed(2)) }));
  } else if (dim === 'month') {
    const grouped = {};
    for (const r of records) {
      const month = r.workDate ? r.workDate.substring(0, 7) : 'Unknown';
      if (!grouped[month]) grouped[month] = [];
      grouped[month].push(r);
    }
    labels = Object.keys(grouped).sort();
    values = labels.map((k) => aggregate(grouped[k].map((r) => r.productivityScore), 'avg'));
    rows = labels.map((l, i) => ({ month: l, avgScore: parseFloat(values[i].toFixed(2)) }));
  } else {
    labels = records.map((r) => r.Employee?.fullName || 'Unknown');
    values = records.map((r) => r.productivityScore);
    rows = records.map((r) => ({
      employee: r.Employee?.fullName,
      project: r.Project?.name,
      score: r.productivityScore,
      hours: r.hoursLogged,
      date: r.workDate,
    }));
  }

  // Apply low performance filter
  if (req.filters.lowPerformance) {
    const avgScore = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const threshold = avgScore * 0.7;
    const filtered = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] < threshold) filtered.push(i);
    }
    if (filtered.length > 0) {
      labels = filtered.map((i) => labels[i]);
      values = filtered.map((i) => values[i]);
      rows = filtered.map((i) => rows[i]);
    }
  }

  // Sort and limit
  if (req.sort) {
    const pairs = labels.map((l, i) => ({ l, v: values[i], r: rows[i] }));
    pairs.sort((a, b) => req.sort.direction === 'desc' ? b.v - a.v : a.v - b.v);
    labels = pairs.map((p) => p.l);
    values = pairs.map((p) => p.v);
    rows = pairs.map((p) => p.r);
  }
  if (req.limit) {
    labels = labels.slice(0, req.limit);
    values = values.slice(0, req.limit);
    rows = rows.slice(0, req.limit);
  }

  return {
    labels,
    values,
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    summary: { totalRecords: records.length },
  };
}

async function queryTickets(req) {
  const where = {};
  if (req.filters.status === 'open') {
    where.status = { [Op.in]: ['open', 'in_progress'] };
  } else if (req.filters.status === 'resolved') {
    where.status = { [Op.in]: ['resolved', 'closed'] };
  }
  if (req.filters.priority) {
    where.priority = req.filters.priority;
  }
  if (req.filters.dateStart && req.filters.dateEnd) {
    where.createdAt = { [Op.between]: [req.filters.dateStart, req.filters.dateEnd] };
  }

  const tickets = await db.Ticket.findAll({
    where,
    include: [
      { model: db.Department, attributes: ['name'] },
      { model: db.Employee, attributes: ['fullName'] },
    ],
    raw: true,
    nest: true,
  });

  const dim = req.dimensions[0] || 'priority';
  let labels, values, rows;

  if (dim === 'priority') {
    const grouped = groupBy(tickets, 'priority');
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ priority: l, count: values[i] }));
  } else if (dim === 'status') {
    const grouped = groupBy(tickets, 'status');
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ status: l, count: values[i] }));
  } else if (dim === 'category') {
    const grouped = groupBy(tickets, 'category');
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ category: l, count: values[i] }));
  } else if (dim === 'department') {
    const grouped = {};
    for (const t of tickets) {
      const deptName = t.Department?.name || 'Unknown';
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(t);
    }
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ department: l, count: values[i] }));
  } else if (dim === 'month') {
    const grouped = {};
    for (const t of tickets) {
      const month = t.createdAt ? new Date(t.createdAt).toISOString().substring(0, 7) : 'Unknown';
      if (!grouped[month]) grouped[month] = [];
      grouped[month].push(t);
    }
    labels = Object.keys(grouped).sort();
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ month: l, count: values[i] }));
  } else {
    const grouped = groupBy(tickets, 'priority');
    labels = Object.keys(grouped);
    values = labels.map((k) => grouped[k].length);
    rows = labels.map((l, i) => ({ priority: l, count: values[i] }));
  }

  if (req.sort) {
    const pairs = labels.map((l, i) => ({ l, v: values[i], r: rows[i] }));
    pairs.sort((a, b) => req.sort.direction === 'desc' ? b.v - a.v : a.v - b.v);
    labels = pairs.map((p) => p.l);
    values = pairs.map((p) => p.v);
    rows = pairs.map((p) => p.r);
  }
  if (req.limit) {
    labels = labels.slice(0, req.limit);
    values = values.slice(0, req.limit);
    rows = rows.slice(0, req.limit);
  }

  return {
    labels,
    values,
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    summary: { totalTickets: tickets.length },
  };
}

async function queryProjects(req) {
  const where = {};
  if (req.filters.status === 'open' || req.filters.isActive) {
    where.status = 'active';
  }
  if (req.filters.status === 'resolved') {
    where.status = 'completed';
  }

  const projects = await db.Project.findAll({
    where,
    include: [{ model: db.Department, attributes: ['name'] }],
    raw: true,
    nest: true,
  });

  const dim = req.dimensions[0] || 'department';
  const metricKey = req.metrics[0] || 'count';
  let labels, values, rows;

  if (metricKey === 'budget' || req.metrics.includes('budget')) {
    // Budget-based query
    if (dim === 'department') {
      const grouped = {};
      for (const p of projects) {
        const name = p.Department?.name || p['Department.name'] || 'Unknown';
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(p);
      }
      labels = Object.keys(grouped);
      values = labels.map((k) => aggregate(grouped[k].map((p) => p.budget), 'sum'));
      rows = labels.map((l, i) => ({ department: l, totalBudget: parseFloat(values[i].toFixed(2)) }));
    } else {
      // By project
      const sorted = [...projects].sort((a, b) => b.budget - a.budget);
      const limited = req.limit ? sorted.slice(0, req.limit) : sorted;
      labels = limited.map((p) => p.name);
      values = limited.map((p) => p.budget);
      rows = limited.map((p) => ({ project: p.name, budget: p.budget, status: p.status }));
    }
  } else {
    // Count-based
    if (dim === 'status') {
      const grouped = groupBy(projects, 'status');
      labels = Object.keys(grouped);
      values = labels.map((k) => grouped[k].length);
      rows = labels.map((l, i) => ({ status: l, count: values[i] }));
    } else {
      const grouped = {};
      for (const p of projects) {
        const name = p.Department?.name || p['Department.name'] || 'Unknown';
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(p);
      }
      labels = Object.keys(grouped);
      values = labels.map((k) => grouped[k].length);
      rows = labels.map((l, i) => ({ department: l, count: values[i] }));
    }
  }

  if (req.sort) {
    const pairs = labels.map((l, i) => ({ l, v: values[i], r: rows[i] }));
    pairs.sort((a, b) => req.sort.direction === 'desc' ? b.v - a.v : a.v - b.v);
    labels = pairs.map((p) => p.l);
    values = pairs.map((p) => p.v);
    rows = pairs.map((p) => p.r);
  }
  if (req.limit) {
    labels = labels.slice(0, req.limit);
    values = values.slice(0, req.limit);
    rows = rows.slice(0, req.limit);
  }

  return {
    labels,
    values,
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    summary: { totalProjects: projects.length },
  };
}

async function queryDepartments(req) {
  const departments = await db.Department.findAll({
    include: [
      { model: db.Employee, attributes: ['id'] },
      { model: db.Project, attributes: ['id'] },
    ],
  });

  const labels = departments.map((d) => d.name);
  const values = departments.map((d) => d.Employees ? d.Employees.length : 0);
  const rows = departments.map((d) => ({
    department: d.name,
    code: d.code,
    employees: d.Employees ? d.Employees.length : 0,
    projects: d.Projects ? d.Projects.length : 0,
  }));

  return {
    labels,
    values,
    rows,
    columns: ['department', 'code', 'employees', 'projects'],
    summary: { totalDepartments: departments.length },
  };
}

async function executeGenericCount(req) {
  return {
    labels: ['No data'],
    values: [0],
    rows: [],
    columns: [],
    summary: { message: 'Could not interpret the query. Please try a different prompt.' },
  };
}

// ========== File/API Preview Data Queries ==========

async function executeOnPreviewData(req, dataSource) {
  const schema = await db.DataSourceSchema.findOne({
    where: { dataSourceId: dataSource.id },
  });

  if (!schema || !schema.previewJson) {
    return { labels: [], values: [], rows: [], columns: [], summary: { message: 'No preview data available.' } };
  }

  let rows = safeJsonParse(schema.previewJson) || [];
  if (rows.length === 0) {
    return { labels: [], values: [], rows: [], columns: [], summary: { message: 'No data in source.' } };
  }

  const columns = Object.keys(rows[0]);
  const profileInfo = safeJsonParse(schema.profileJson);

  // Detect best dimension and measure from profile
  let dimension = req.dimensions[0] || null;
  let metricField = null;

  if (profileInfo) {
    if (!dimension && profileInfo.dimensions && profileInfo.dimensions.length > 0) {
      dimension = profileInfo.dimensions[0];
    }
    if (profileInfo.measures && profileInfo.measures.length > 0) {
      metricField = profileInfo.measures[0];
    }
  }

  // Fallback: use first string column as dimension
  if (!dimension) dimension = columns.find((c) => typeof rows[0][c] === 'string') || columns[0];
  if (!metricField) metricField = columns.find((c) => !isNaN(Number(rows[0][c])));

  // Apply filters
  if (req.filters.status) {
    const statusCol = columns.find((c) => /status/i.test(c));
    if (statusCol) {
      rows = rows.filter((r) => String(r[statusCol]).toLowerCase().includes(req.filters.status.toLowerCase()));
    }
  }

  // Group by dimension
  const grouped = groupBy(rows, dimension);
  let labels = Object.keys(grouped);
  let values;

  if (metricField) {
    const metricType = req.metrics[0] || 'sum';
    values = labels.map((k) => {
      const fieldValues = grouped[k].map((r) => r[metricField]);
      return parseFloat(aggregate(fieldValues, metricType === 'count' ? 'count' : metricType).toFixed(2));
    });
  } else {
    values = labels.map((k) => grouped[k].length);
  }

  const resultRows = labels.map((l, i) => ({
    [dimension]: l,
    value: values[i],
  }));

  // Sort and limit
  if (req.sort) {
    const pairs = labels.map((l, i) => ({ l, v: values[i], r: resultRows[i] }));
    pairs.sort((a, b) => req.sort.direction === 'desc' ? b.v - a.v : a.v - b.v);
    labels = pairs.map((p) => p.l);
    values = pairs.map((p) => p.v);
  }
  if (req.limit) {
    labels = labels.slice(0, req.limit);
    values = values.slice(0, req.limit);
  }

  return {
    labels,
    values,
    rows: resultRows.slice(0, req.limit || resultRows.length),
    columns: resultRows.length > 0 ? Object.keys(resultRows[0]) : [],
    summary: { totalRows: rows.length, dimension, metric: metricField || 'count' },
  };
}

module.exports = { execute };
