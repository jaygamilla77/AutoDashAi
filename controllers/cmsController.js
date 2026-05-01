'use strict';

/**
 * cmsController — Admin CMS for the public marketing site (landing page).
 *
 * Routes:
 *   GET  /admin/content              → redirect to first section
 *   GET  /admin/content/:section     → 3-pane editor (sidebar | form | preview)
 *   POST /admin/content/:section     → save (form submit, publish or draft)
 *   POST /admin/content/:section/json→ JSON autosave endpoint (returns success)
 *   POST /admin/content/publish      → publish all drafts
 *   POST /admin/content/revert       → discard all drafts
 *   POST /admin/content/:section/reset → reset section to defaults
 */

const cms = require('../services/cmsService');

// Parse multi-row form payloads. Form fields use bracket notation, e.g.
//   features[0][title], faq[2][question], pricing[1][features][3]
// Express's url-encoded parser with extended:true builds nested objects/arrays.
// We accept whatever shape it produces and pass through.

async function index(req, res) {
  res.redirect('/admin/content/hero');
}

async function editSection(req, res, next) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(cms.DEFAULTS, section)) {
      return res.redirect('/admin/content/hero');
    }
    const data    = await cms.getSection(section);
    const draft   = await cms.getSection(section, { draft: true });
    const allDraft = await cms.getAll({ draft: true });
    res.render('admin/cms', {
      title: 'Content Management — AutoDash AI Admin',
      hideSidebar: true,
      activeSection: section,
      sections: cms.SECTION_META,
      data,
      draft,
      cmsDraft: allDraft,
      jsonValue: JSON.stringify(data, null, 2),
    });
  } catch (err) { next(err); }
}

function coerce(value) {
  if (value === 'on' || value === 'true')  return true;
  if (value === 'false') return false;
  return value;
}

function normalizeArrays(obj) {
  // Express extended parser turns "items[0][title]" into { items: { '0': { title } } }
  // when keys are non-contiguous. Walk the tree and convert numeric-keyed objects
  // to arrays so the saved JSON is clean. Also coerce 'true'/'false' booleans.
  if (Array.isArray(obj)) return obj.map(normalizeArrays);
  if (obj && typeof obj === 'object') {
    const keys = Object.keys(obj);
    const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    if (allNumeric) {
      const arr = keys
        .map(k => ({ i: parseInt(k, 10), v: normalizeArrays(obj[k]) }))
        .sort((a, b) => a.i - b.i)
        .map(x => x.v);
      return arr;
    }
    const out = {};
    keys.forEach(k => { out[k] = normalizeArrays(obj[k]); });
    return out;
  }
  if (Array.isArray(obj)) return obj.map(normalizeArrays);
  return coerce(obj);
}

// Helper: split a multi-line textarea into array of trimmed non-empty lines
function linesOf(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

// Section-specific post-processing: turn textarea fields into structured arrays.
function postProcessSection(section, payload) {
  if (!payload || typeof payload !== 'object') return payload;

  if (section === 'pricing' && Array.isArray(payload.plans)) {
    payload.plans = payload.plans.map(p => {
      if (p && typeof p === 'object') {
        if (typeof p.features_text === 'string') {
          p.features = linesOf(p.features_text);
          delete p.features_text;
        }
        if (typeof p.recommended === 'string') p.recommended = (p.recommended === 'true');
        if (Array.isArray(p.recommended)) p.recommended = p.recommended.includes('true');
      }
      return p;
    });
  }

  if (section === 'footer' && Array.isArray(payload.columns)) {
    payload.columns = payload.columns.map(col => {
      if (col && typeof col.links_text === 'string') {
        col.links = linesOf(col.links_text).map(line => {
          const parts = line.split('|').map(s => s.trim());
          return { label: parts[0] || '', href: parts[1] || '#' };
        });
        delete col.links_text;
      }
      return col;
    });
  }

  if (section === 'nav') {
    // Convert checkbox dual-values: when both hidden+checkbox are sent, body becomes ['false','true']
    ['showSignIn','showGetStarted'].forEach(k => {
      if (Array.isArray(payload[k])) payload[k] = payload[k].includes('true');
      else if (typeof payload[k] === 'string') payload[k] = payload[k] === 'true';
    });
  }

  if (section === 'seo' && payload.sitemap && typeof payload.sitemap === 'object') {
    if (Array.isArray(payload.sitemap.enabled)) payload.sitemap.enabled = payload.sitemap.enabled.includes('true');
    else if (typeof payload.sitemap.enabled === 'string') payload.sitemap.enabled = payload.sitemap.enabled === 'true';
  }

  return payload;
}

async function saveSection(req, res, next) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(cms.DEFAULTS, section)) {
      req.flash('error', 'Unknown section: ' + section);
      return res.redirect('/admin/content');
    }

    let payload;
    if (req.body && typeof req.body.__json === 'string' && req.body.__json.trim()) {
      try { payload = JSON.parse(req.body.__json); }
      catch (e) {
        req.flash('error', 'Invalid JSON: ' + e.message);
        return res.redirect('/admin/content/' + section);
      }
    } else {
      // strip control fields
      const body = Object.assign({}, req.body);
      delete body.__action;
      delete body.__json;
      payload = normalizeArrays(body);
      // unwrap if single 'data' key (some forms wrap)
      if (payload && payload.data && Object.keys(payload).length === 1) {
        payload = payload.data;
      }
    }

    payload = postProcessSection(section, payload);

    const action = (req.body && req.body.__action) || 'publish';
    await cms.updateSection(section, payload, { draft: action === 'draft' });

    req.flash('success', action === 'draft'
      ? 'Draft saved.'
      : 'Changes published. The landing page is now updated.');
    res.redirect('/admin/content/' + section);
  } catch (err) { next(err); }
}

async function saveSectionJson(req, res, next) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(cms.DEFAULTS, section)) {
      return res.status(400).json({ success: false, error: 'Unknown section' });
    }
    const payload = req.body && req.body.data;
    const draft = !!(req.body && req.body.draft);
    if (payload == null) {
      return res.status(400).json({ success: false, error: 'Missing data' });
    }
    await cms.updateSection(section, payload, { draft });
    res.json({ success: true, draft });
  } catch (err) { next(err); }
}

async function publishAll(req, res, next) {
  try {
    const n = await cms.publishAll();
    req.flash('success', n ? `Published ${n} draft section${n === 1 ? '' : 's'}.` : 'No drafts to publish.');
    res.redirect('back');
  } catch (err) { next(err); }
}

async function revertAll(req, res, next) {
  try {
    const n = await cms.revertAll();
    req.flash('success', n ? `Reverted ${n} draft${n === 1 ? '' : 's'}.` : 'No drafts to revert.');
    res.redirect('back');
  } catch (err) { next(err); }
}

async function resetSection(req, res, next) {
  try {
    const section = String(req.params.section || '').toLowerCase();
    await cms.resetSection(section);
    req.flash('success', 'Section reset to defaults.');
    res.redirect('/admin/content/' + section);
  } catch (err) { next(err); }
}

module.exports = {
  index,
  editSection,
  saveSection,
  saveSectionJson,
  publishAll,
  revertAll,
  resetSection,
};
