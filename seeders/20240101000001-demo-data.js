'use strict';

/**
 * Seed demo data for the AI Auto-Dashboard Builder.
 * Uses @faker-js/faker to generate realistic data.
 */
module.exports = {
  async up(queryInterface) {
    let faker;
    try {
      const fakerModule = require('@faker-js/faker');
      faker = fakerModule.faker;
    } catch {
      // Inline minimal faker if package not available
      faker = null;
    }

    const now = new Date();
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randFloat = (min, max, dec = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(dec));
    const daysBefore = (d, n) => { const r = new Date(d); r.setDate(r.getDate() - n); return r; };
    const dateOnly = (d) => d.toISOString().split('T')[0];

    // ---------- Departments ----------
    const departments = [
      { id: 1, name: 'Engineering', code: 'ENG', createdAt: now, updatedAt: now },
      { id: 2, name: 'Marketing', code: 'MKT', createdAt: now, updatedAt: now },
      { id: 3, name: 'Sales', code: 'SAL', createdAt: now, updatedAt: now },
      { id: 4, name: 'Human Resources', code: 'HR', createdAt: now, updatedAt: now },
      { id: 5, name: 'Finance', code: 'FIN', createdAt: now, updatedAt: now },
    ];
    await queryInterface.bulkInsert('departments', departments);

    // ---------- Employees ----------
    const firstNames = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Ivy','Jack',
      'Karen','Leo','Mia','Nathan','Olivia','Paul','Quinn','Rachel','Sam','Tina',
      'Uma','Victor','Wendy','Xavier','Yara','Zane','Aria','Ben','Cora','Derek',
      'Elena','Finn','Gina','Hugo','Isla','Jake','Kira','Liam','Maya','Noah',
      'Oscar','Petra','Reid','Sara','Tom','Ursula','Vince','Willa','Xena','Yuri'];
    const lastNames = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
      'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
      'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
      'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
      'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];

    const employees = [];
    for (let i = 1; i <= 50; i++) {
      const fn = firstNames[i - 1];
      const ln = lastNames[i - 1];
      employees.push({
        id: i,
        employeeId: `EMP${String(i).padStart(4, '0')}`,
        fullName: `${fn} ${ln}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@company.com`,
        departmentId: ((i - 1) % 5) + 1,
        isActive: i <= 45 ? 1 : 0,
        hiredDate: dateOnly(daysBefore(now, randInt(60, 1800))),
        createdAt: now,
        updatedAt: now,
      });
    }
    await queryInterface.bulkInsert('employees', employees);

    // ---------- Projects ----------
    const projectNames = [
      'Project Alpha','Project Beta','Project Gamma','Project Delta','Project Epsilon',
      'Project Zeta','Project Eta','Project Theta','Project Iota','Project Kappa',
      'Project Lambda','Project Mu','Project Nu','Project Xi','Project Omicron',
      'Project Pi','Project Rho','Project Sigma','Project Tau','Project Upsilon',
    ];
    const projectStatuses = ['active','active','active','active','completed','completed','on_hold','active','active','completed',
      'active','active','completed','on_hold','active','active','completed','active','active','on_hold'];
    const projects = [];
    for (let i = 1; i <= 20; i++) {
      projects.push({
        id: i,
        code: `PRJ${String(i).padStart(3, '0')}`,
        name: projectNames[i - 1],
        departmentId: ((i - 1) % 5) + 1,
        startDate: dateOnly(daysBefore(now, randInt(30, 365))),
        endDate: dateOnly(daysBefore(now, -randInt(30, 180))),
        status: projectStatuses[i - 1],
        budget: randFloat(10000, 500000, 0),
        createdAt: now,
        updatedAt: now,
      });
    }
    await queryInterface.bulkInsert('projects', projects);

    // ---------- Productivity Records ----------
    const remarks = ['Good progress','Needs improvement','Excellent','Average','Outstanding',
      'Below expectations','Meeting targets','Ahead of schedule','Slightly behind',null];
    const productivityRecords = [];
    for (let i = 1; i <= 500; i++) {
      productivityRecords.push({
        id: i,
        employeeId: randInt(1, 50),
        projectId: randInt(1, 20),
        workDate: dateOnly(daysBefore(now, randInt(0, 90))),
        tasksCompleted: randInt(1, 15),
        hoursLogged: randFloat(2, 10, 1),
        productivityScore: randFloat(30, 100, 1),
        remarks: pick(remarks),
        createdAt: now,
        updatedAt: now,
      });
    }
    // Bulk insert in batches for safety
    const batchSize = 100;
    for (let b = 0; b < productivityRecords.length; b += batchSize) {
      await queryInterface.bulkInsert('productivity_records', productivityRecords.slice(b, b + batchSize));
    }

    // ---------- Tickets ----------
    const categories = ['Bug','Feature','Support','Improvement','Task'];
    const priorities = ['low','medium','high','critical'];
    const ticketStatuses = ['open','in_progress','resolved','closed'];
    const ticketTitles = [
      'Login page not loading','Add export to PDF','Dashboard slow','Update user roles','Fix email notifications',
      'API timeout issue','Dark mode support','Mobile responsiveness','Search not working','Add bulk import',
    ];
    const tickets = [];
    for (let i = 1; i <= 200; i++) {
      const tStatus = pick(ticketStatuses);
      tickets.push({
        id: i,
        ticketNo: `TKT${String(i).padStart(4, '0')}`,
        title: `${pick(ticketTitles)} #${i}`,
        category: pick(categories),
        priority: pick(priorities),
        status: tStatus,
        employeeId: randInt(1, 50),
        departmentId: ((i - 1) % 5) + 1,
        projectId: randInt(1, 20),
        resolvedAt: (tStatus === 'resolved' || tStatus === 'closed') ? daysBefore(now, randInt(0, 30)) : null,
        createdAt: daysBefore(now, randInt(0, 90)),
        updatedAt: now,
      });
    }
    for (let b = 0; b < tickets.length; b += batchSize) {
      await queryInterface.bulkInsert('tickets', tickets.slice(b, b + batchSize));
    }

    // ---------- Data Source (demo) ----------
    await queryInterface.bulkInsert('data_sources', [{
      id: 1,
      name: 'Internal App Database',
      sourceType: 'database',
      status: 'active',
      configJson: JSON.stringify({ type: 'internal', description: 'Built-in demo data (employees, projects, tickets, productivity)' }),
      filePath: null,
      originalFileName: null,
      mimeType: null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    }]);

    // ---------- Prompt History ----------
    const prompts = [
      { promptText: 'Show me employees with low productivity this month', chartType: 'bar', intent: 'employee_productivity', title: 'Low Productivity Employees This Month' },
      { promptText: 'Show unresolved tickets by priority', chartType: 'pie', intent: 'ticket_analysis', title: 'Unresolved Tickets by Priority' },
      { promptText: 'Compare productivity by department', chartType: 'bar', intent: 'department_productivity', title: 'Department Productivity Comparison' },
      { promptText: 'Top 10 projects by budget', chartType: 'bar', intent: 'project_budget', title: 'Top 10 Projects by Budget' },
      { promptText: 'Show active projects by department', chartType: 'bar', intent: 'project_status', title: 'Active Projects by Department' },
    ];
    const promptRecords = prompts.map((p, idx) => ({
      id: idx + 1,
      promptText: p.promptText,
      selectedChartType: p.chartType,
      interpretedIntent: p.intent,
      generatedTitle: p.title,
      structuredRequestJson: JSON.stringify({ intent: p.intent }),
      dataSourceId: 1,
      createdAt: daysBefore(now, prompts.length - idx),
      updatedAt: now,
    }));
    await queryInterface.bulkInsert('prompt_history', promptRecords);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('prompt_history', null, {});
    await queryInterface.bulkDelete('data_sources', null, {});
    await queryInterface.bulkDelete('tickets', null, {});
    await queryInterface.bulkDelete('productivity_records', null, {});
    await queryInterface.bulkDelete('projects', null, {});
    await queryInterface.bulkDelete('employees', null, {});
    await queryInterface.bulkDelete('departments', null, {});
  },
};
