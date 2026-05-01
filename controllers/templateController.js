const db = require('../models');
const { safeJsonParse } = require('../utils/helpers');

exports.list = async (req, res) => {
  try {
    // Fetch dashboard layout templates
    const dashboardLayoutTemplates = await db.DashboardLayoutTemplate.findAll({ 
      order: [['sortOrder', 'ASC'], ['name', 'ASC']] 
    });

    // Fetch color themes (using DashboardTemplate model)
    const colorThemes = await db.DashboardTemplate.findAll({ 
      order: [['isBuiltIn', 'DESC'], ['name', 'ASC']] 
    });

    res.render('templates', { 
      title: 'Templates & Themes', 
      dashboardLayoutTemplates,
      colorThemes 
    });
  } catch (err) {
    console.error('Template list error:', err);
    req.flash('error', 'Failed to load templates.');
    res.render('templates', { 
      title: 'Templates & Themes', 
      dashboardLayoutTemplates: [], 
      colorThemes: [] 
    });
  }
};

exports.showForm = async (req, res) => {
  try {
    let template = null;
    if (req.params.id) {
      template = await db.DashboardTemplate.findByPk(req.params.id);
      if (!template) {
        req.flash('error', 'Template not found.');
        return res.redirect('/templates');
      }
    }
    res.render('template-form', { title: template ? 'Edit Template' : 'New Template', template });
  } catch (err) {
    console.error('Template form error:', err);
    req.flash('error', 'Failed to load form.');
    res.redirect('/templates');
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, fontFamily, accentColor } = req.body;
    const colors = [
      req.body.c0, req.body.c1, req.body.c2, req.body.c3,
      req.body.c4, req.body.c5, req.body.c6, req.body.c7,
    ].filter(Boolean);

    if (!name || !name.trim()) {
      req.flash('error', 'Template name is required.');
      return res.redirect('/templates/new');
    }

    if (colors.length < 2) {
      req.flash('error', 'Please provide at least 2 colors.');
      return res.redirect('/templates/new');
    }

    const chartTypesRaw = Array.isArray(req.body.chartTypes)
      ? req.body.chartTypes
      : req.body.chartTypes ? [req.body.chartTypes] : [];

    await db.DashboardTemplate.create({
      name: name.trim(),
      description: description ? description.trim() : null,
      fontFamily: fontFamily || 'Inter',
      colorPalette: JSON.stringify(colors),
      accentColor: accentColor || colors[0] || '#111827',
      preferredChartTypes: chartTypesRaw.length ? JSON.stringify(chartTypesRaw) : null,
      isBuiltIn: false,
    });

    req.flash('success', `Template "${name}" created successfully.`);
    res.redirect('/templates');
  } catch (err) {
    console.error('Template create error:', err);
    req.flash('error', `Failed to create template: ${err.message}`);
    res.redirect('/templates/new');
  }
};

exports.update = async (req, res) => {
  try {
    const template = await db.DashboardTemplate.findByPk(req.params.id);
    if (!template) {
      req.flash('error', 'Template not found.');
      return res.redirect('/templates');
    }

    if (template.isBuiltIn) {
      req.flash('error', 'Built-in templates cannot be edited.');
      return res.redirect('/templates');
    }

    const { name, description, fontFamily, accentColor } = req.body;
    const colors = [
      req.body.c0, req.body.c1, req.body.c2, req.body.c3,
      req.body.c4, req.body.c5, req.body.c6, req.body.c7,
    ].filter(Boolean);

    const chartTypesRaw = Array.isArray(req.body.chartTypes)
      ? req.body.chartTypes
      : req.body.chartTypes ? [req.body.chartTypes] : [];

    await template.update({
      name: name ? name.trim() : template.name,
      description: description ? description.trim() : template.description,
      fontFamily: fontFamily || template.fontFamily,
      colorPalette: colors.length >= 2 ? JSON.stringify(colors) : template.colorPalette,
      accentColor: accentColor || template.accentColor,
      preferredChartTypes: chartTypesRaw.length ? JSON.stringify(chartTypesRaw) : template.preferredChartTypes,
    });

    req.flash('success', 'Template updated.');
    res.redirect('/templates');
  } catch (err) {
    console.error('Template update error:', err);
    req.flash('error', `Failed to update template: ${err.message}`);
    res.redirect(`/templates/${req.params.id}/edit`);
  }
};

exports.destroy = async (req, res) => {
  try {
    const template = await db.DashboardTemplate.findByPk(req.params.id);
    if (!template) {
      req.flash('error', 'Template not found.');
      return res.redirect('/templates');
    }
    if (template.isBuiltIn) {
      req.flash('error', 'Built-in templates cannot be deleted.');
      return res.redirect('/templates');
    }
    await template.destroy();
    req.flash('success', 'Template deleted.');
    res.redirect('/templates');
  } catch (err) {
    console.error('Template delete error:', err);
    req.flash('error', 'Failed to delete template.');
    res.redirect('/templates');
  }
};

// API: Get dashboard layout template by ID
exports.getLayoutTemplate = async (req, res) => {
  try {
    console.log('[TemplateController] getLayoutTemplate called with ID:', req.params.id);
    const template = await db.DashboardLayoutTemplate.findByPk(req.params.id);
    console.log('[TemplateController] Template result:', template ? template.name : 'NOT FOUND');
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Parse JSON fields
    const kpis = safeJsonParse(template.kpis, []);
    const chartTypes = safeJsonParse(template.chartTypes, []);
    const sections = safeJsonParse(template.sections, []);

    res.json({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      kpis,
      chartTypes,
      sections,
      defaultTitle: template.defaultTitle,
      promptStarter: template.promptStarter,
      dashboardRole: template.dashboardRole,
      isBuiltIn: template.isBuiltIn,
      sortOrder: template.sortOrder,
    });
  } catch (err) {
    console.error('[TemplateController] getLayoutTemplate error:', err.message);
    console.error('[TemplateController] Stack:', err.stack);
    res.status(500).json({ error: 'Failed to fetch template: ' + err.message });
  }
};

// API: List all dashboard layout templates
exports.listLayoutTemplates = async (req, res) => {
  try {
    const templates = await db.DashboardLayoutTemplate.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });

    const result = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      kpis: safeJsonParse(t.kpis, []),
      chartTypes: safeJsonParse(t.chartTypes, []),
      sections: safeJsonParse(t.sections, []),
      defaultTitle: t.defaultTitle,
      promptStarter: t.promptStarter,
      dashboardRole: t.dashboardRole,
      isBuiltIn: t.isBuiltIn,
      sortOrder: t.sortOrder,
    }));

    res.json(result);
  } catch (err) {
    console.error('List layout templates error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};
