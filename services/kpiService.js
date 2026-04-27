/**
 * KPI Service
 *
 * Generates KPI cards from query results and context.
 */

const db = require('../models');
const { fn, col } = require('sequelize');

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
    { _kpiKey: 'employee.total',    label: 'Total Employees',  value: total,           icon: 'bi-people' },
    { _kpiKey: 'employee.active',   label: 'Active Employees', value: active,          icon: 'bi-person-check' },
    { _kpiKey: 'employee.inactive', label: 'Inactive',         value: total - active,  icon: 'bi-person-x' },
    { _kpiKey: 'employee.depts',    label: 'Departments',      value: deptCount,       icon: 'bi-building' },
  ];
}

async function productivityKPIs() {
  const [total, avgRow] = await Promise.all([
    db.ProductivityRecord.count(),
    db.ProductivityRecord.findOne({
      attributes: [
        [fn('AVG', col('productivityScore')), 'avgScore'],
        [fn('AVG', col('hoursLogged')), 'avgHours'],
      ],
      raw: true,
    }),
  ]);

  const avgScore = avgRow && avgRow.avgScore != null ? Number(avgRow.avgScore).toFixed(1) : 0;
  const avgHours = avgRow && avgRow.avgHours != null ? Number(avgRow.avgHours).toFixed(1) : 0;
  return [
    { _kpiKey: 'productivity.total',    label: 'Total Records',          value: total,    icon: 'bi-clipboard-data' },
    { _kpiKey: 'productivity.avgScore', label: 'Avg Productivity Score', value: avgScore, icon: 'bi-speedometer2' },
    { _kpiKey: 'productivity.avgHours', label: 'Avg Hours Logged',       value: avgHours, icon: 'bi-clock' },
    { _kpiKey: 'productivity.active',   label: 'Active Employees',       value: await db.Employee.count({ where: { isActive: true } }), icon: 'bi-person-check' },
  ];
}

async function ticketKPIs() {
  const total = await db.Ticket.count();
  const { Op } = require('sequelize');
  const open = await db.Ticket.count({ where: { status: { [Op.in]: ['open', 'in_progress'] } } });
  const high = await db.Ticket.count({ where: { priority: { [Op.in]: ['high', 'critical'] } } });
  const resolved = await db.Ticket.count({ where: { status: { [Op.in]: ['resolved', 'closed'] } } });
  return [
    { _kpiKey: 'ticket.total',    label: 'Total Tickets', value: total,    icon: 'bi-ticket-detailed' },
    { _kpiKey: 'ticket.open',     label: 'Open Tickets',  value: open,     icon: 'bi-exclamation-circle' },
    { _kpiKey: 'ticket.high',     label: 'High Priority', value: high,     icon: 'bi-exclamation-triangle' },
    { _kpiKey: 'ticket.resolved', label: 'Resolved',      value: resolved, icon: 'bi-check-circle' },
  ];
}

async function projectKPIs() {
  const total = await db.Project.count();
  const active = await db.Project.count({ where: { status: 'active' } });
  const projects = await db.Project.findAll({ attributes: ['budget'], raw: true });
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
  return [
    { _kpiKey: 'project.total',       label: 'Total Projects',  value: total,  icon: 'bi-kanban' },
    { _kpiKey: 'project.active',      label: 'Active Projects', value: active, icon: 'bi-play-circle' },
    { _kpiKey: 'project.totalBudget', label: 'Total Budget',    value: `$${totalBudget.toLocaleString()}`,                                        icon: 'bi-currency-dollar' },
    { _kpiKey: 'project.avgBudget',   label: 'Avg Budget',      value: `$${total > 0 ? Math.round(totalBudget / total).toLocaleString() : 0}`,   icon: 'bi-graph-up' },
  ];
}

async function departmentKPIs() {
  const depts = await db.Department.count();
  const emps = await db.Employee.count();
  const projs = await db.Project.count();
  return [
    { _kpiKey: 'dept.count',   label: 'Departments',    value: depts,                                      icon: 'bi-building' },
    { _kpiKey: 'dept.emps',    label: 'Total Employees', value: emps,                                      icon: 'bi-people' },
    { _kpiKey: 'dept.projs',   label: 'Total Projects',  value: projs,                                     icon: 'bi-kanban' },
    { _kpiKey: 'dept.avgTeam', label: 'Avg Team Size',   value: depts > 0 ? Math.round(emps / depts) : 0, icon: 'bi-person-lines-fill' },
  ];
}

async function overviewKPIs() {
  return [
    { _kpiKey: 'overview.emps',    label: 'Employees',   value: await db.Employee.count(),   icon: 'bi-people' },
    { _kpiKey: 'overview.projs',   label: 'Projects',    value: await db.Project.count(),    icon: 'bi-kanban' },
    { _kpiKey: 'overview.tickets', label: 'Tickets',     value: await db.Ticket.count(),     icon: 'bi-ticket-detailed' },
    { _kpiKey: 'overview.depts',   label: 'Departments', value: await db.Department.count(), icon: 'bi-building' },
  ];
}

/**
 * Recalculate a single KPI value by its key.
 * Returns { value } or throws.
 */
async function refreshKpiValue(kpiKey) {
  const { Op } = require('sequelize');
  switch (kpiKey) {
    case 'employee.total':    return { value: await db.Employee.count() };
    case 'employee.active':   return { value: await db.Employee.count({ where: { isActive: true } }) };
    case 'employee.inactive': { const t = await db.Employee.count(); const a = await db.Employee.count({ where: { isActive: true } }); return { value: t - a }; }
    case 'employee.depts':    return { value: await db.Department.count() };

    case 'productivity.total':    return { value: await db.ProductivityRecord.count() };
    case 'productivity.avgScore': {
      const row = await db.ProductivityRecord.findOne({
        attributes: [[fn('AVG', col('productivityScore')), 'avg']],
        raw: true,
      });
      return { value: row && row.avg != null ? Number(row.avg).toFixed(1) : 0 };
    }
    case 'productivity.avgHours': {
      const row = await db.ProductivityRecord.findOne({
        attributes: [[fn('AVG', col('hoursLogged')), 'avg']],
        raw: true,
      });
      return { value: row && row.avg != null ? Number(row.avg).toFixed(1) : 0 };
    }
    case 'productivity.active':   return { value: await db.Employee.count({ where: { isActive: true } }) };

    case 'ticket.total':    return { value: await db.Ticket.count() };
    case 'ticket.open':     return { value: await db.Ticket.count({ where: { status: { [Op.in]: ['open', 'in_progress'] } } }) };
    case 'ticket.high':     return { value: await db.Ticket.count({ where: { priority: { [Op.in]: ['high', 'critical'] } } }) };
    case 'ticket.resolved': return { value: await db.Ticket.count({ where: { status: { [Op.in]: ['resolved', 'closed'] } } }) };

    case 'project.total':  return { value: await db.Project.count() };
    case 'project.active': return { value: await db.Project.count({ where: { status: 'active' } }) };
    case 'project.totalBudget': {
      const projs = await db.Project.findAll({ attributes: ['budget'], raw: true });
      const sum = projs.reduce((s, p) => s + (p.budget || 0), 0);
      return { value: `$${sum.toLocaleString()}` };
    }
    case 'project.avgBudget': {
      const projs = await db.Project.findAll({ attributes: ['budget'], raw: true });
      const sum = projs.reduce((s, p) => s + (p.budget || 0), 0);
      return { value: `$${projs.length > 0 ? Math.round(sum / projs.length).toLocaleString() : 0}` };
    }

    case 'dept.count':   return { value: await db.Department.count() };
    case 'dept.emps':    return { value: await db.Employee.count() };
    case 'dept.projs':   return { value: await db.Project.count() };
    case 'dept.avgTeam': {
      const d = await db.Department.count(); const e = await db.Employee.count();
      return { value: d > 0 ? Math.round(e / d) : 0 };
    }

    case 'overview.emps':    return { value: await db.Employee.count() };
    case 'overview.projs':   return { value: await db.Project.count() };
    case 'overview.tickets': return { value: await db.Ticket.count() };
    case 'overview.depts':   return { value: await db.Department.count() };

    default: throw new Error(`Unknown KPI key: ${kpiKey}`);
  }
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

module.exports = { generateKPIs, refreshKpiValue };
