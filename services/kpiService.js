/**
 * KPI Service
 *
 * Generates KPI cards from query results and context.
 */

const db = require('../models');

/**
 * Generate KPIs based on focus area and query result.
 */
async function generateKPIs(focusArea, queryResult, dataSource) {
  const kpis = [];

  // For external data sources, generate from result summary
  if (dataSource && ['csv', 'excel', 'json', 'api'].includes(dataSource.sourceType)) {
    return generateExternalKPIs(queryResult);
  }

  // For internal database, generate entity-specific KPIs
  try {
    switch (focusArea) {
      case 'employee':
        kpis.push(...await employeeKPIs());
        break;
      case 'productivity':
        kpis.push(...await productivityKPIs());
        break;
      case 'ticket':
        kpis.push(...await ticketKPIs());
        break;
      case 'project':
        kpis.push(...await projectKPIs());
        break;
      case 'department':
        kpis.push(...await departmentKPIs());
        break;
      default:
        kpis.push(...await overviewKPIs());
    }
  } catch (err) {
    console.error('KPI generation error:', err);
    kpis.push({ label: 'Data Points', value: queryResult.rows?.length || 0, icon: 'bi-bar-chart' });
  }

  return kpis;
}

async function employeeKPIs() {
  const total = await db.Employee.count();
  const active = await db.Employee.count({ where: { isActive: true } });
  const deptCount = await db.Department.count();
  return [
    { label: 'Total Employees', value: total, icon: 'bi-people' },
    { label: 'Active Employees', value: active, icon: 'bi-person-check' },
    { label: 'Inactive', value: total - active, icon: 'bi-person-x' },
    { label: 'Departments', value: deptCount, icon: 'bi-building' },
  ];
}

async function productivityKPIs() {
  const total = await db.ProductivityRecord.count();
  const records = await db.ProductivityRecord.findAll({ attributes: ['productivityScore', 'hoursLogged'], raw: true });
  const avgScore = records.length > 0
    ? (records.reduce((sum, r) => sum + (r.productivityScore || 0), 0) / records.length).toFixed(1)
    : 0;
  const avgHours = records.length > 0
    ? (records.reduce((sum, r) => sum + (r.hoursLogged || 0), 0) / records.length).toFixed(1)
    : 0;
  return [
    { label: 'Total Records', value: total, icon: 'bi-clipboard-data' },
    { label: 'Avg Productivity Score', value: avgScore, icon: 'bi-speedometer2' },
    { label: 'Avg Hours Logged', value: avgHours, icon: 'bi-clock' },
    { label: 'Active Employees', value: await db.Employee.count({ where: { isActive: true } }), icon: 'bi-person-check' },
  ];
}

async function ticketKPIs() {
  const total = await db.Ticket.count();
  const { Op } = require('sequelize');
  const open = await db.Ticket.count({ where: { status: { [Op.in]: ['open', 'in_progress'] } } });
  const high = await db.Ticket.count({ where: { priority: { [Op.in]: ['high', 'critical'] } } });
  const resolved = await db.Ticket.count({ where: { status: { [Op.in]: ['resolved', 'closed'] } } });
  return [
    { label: 'Total Tickets', value: total, icon: 'bi-ticket-detailed' },
    { label: 'Open Tickets', value: open, icon: 'bi-exclamation-circle' },
    { label: 'High Priority', value: high, icon: 'bi-exclamation-triangle' },
    { label: 'Resolved', value: resolved, icon: 'bi-check-circle' },
  ];
}

async function projectKPIs() {
  const total = await db.Project.count();
  const active = await db.Project.count({ where: { status: 'active' } });
  const projects = await db.Project.findAll({ attributes: ['budget'], raw: true });
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  return [
    { label: 'Total Projects', value: total, icon: 'bi-kanban' },
    { label: 'Active Projects', value: active, icon: 'bi-play-circle' },
    { label: 'Total Budget', value: `$${totalBudget.toLocaleString()}`, icon: 'bi-currency-dollar' },
    { label: 'Avg Budget', value: `$${total > 0 ? Math.round(totalBudget / total).toLocaleString() : 0}`, icon: 'bi-graph-up' },
  ];
}

async function departmentKPIs() {
  const depts = await db.Department.count();
  const emps = await db.Employee.count();
  const projs = await db.Project.count();
  return [
    { label: 'Departments', value: depts, icon: 'bi-building' },
    { label: 'Total Employees', value: emps, icon: 'bi-people' },
    { label: 'Total Projects', value: projs, icon: 'bi-kanban' },
    { label: 'Avg Team Size', value: depts > 0 ? Math.round(emps / depts) : 0, icon: 'bi-person-lines-fill' },
  ];
}

async function overviewKPIs() {
  return [
    { label: 'Employees', value: await db.Employee.count(), icon: 'bi-people' },
    { label: 'Projects', value: await db.Project.count(), icon: 'bi-kanban' },
    { label: 'Tickets', value: await db.Ticket.count(), icon: 'bi-ticket-detailed' },
    { label: 'Departments', value: await db.Department.count(), icon: 'bi-building' },
  ];
}

function generateExternalKPIs(queryResult) {
  const kpis = [];
  const { rows, summary } = queryResult;

  kpis.push({
    label: 'Record Count',
    value: summary?.totalRows || rows?.length || 0,
    icon: 'bi-collection',
  });

  if (summary?.dimension) {
    kpis.push({
      label: 'Grouped By',
      value: summary.dimension,
      icon: 'bi-diagram-3',
    });
  }

  if (summary?.metric) {
    kpis.push({
      label: 'Metric',
      value: summary.metric,
      icon: 'bi-calculator',
    });
  }

  if (queryResult.labels) {
    kpis.push({
      label: 'Distinct Categories',
      value: queryResult.labels.length,
      icon: 'bi-tags',
    });
  }

  return kpis;
}

module.exports = { generateKPIs };
