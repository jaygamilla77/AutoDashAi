'use strict';

/**
 * SiteContent — a single-row CMS store keyed by section name with a JSON value.
 * Flexible schema so admins can add/remove items in arrays without migrations.
 *
 * Rows:
 *   - section (PK)  e.g. "hero", "nav", "features", "faq", "pricing", "footer",
 *                       "branding", "seo", "stats", "trustBadges"
 *   - data (JSON)   arbitrary per-section payload
 *   - draft (JSON)  optional unpublished draft payload
 *   - updatedAt
 */
module.exports = (sequelize, DataTypes) => {
  const SiteContent = sequelize.define('SiteContent', {
    section: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      get() {
        const v = this.getDataValue('data');
        if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return {}; } }
        return v == null ? {} : v;
      },
    },
    draft: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const v = this.getDataValue('draft');
        if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } }
        return v == null ? null : v;
      },
    },
  }, {
    tableName: 'site_content',
    timestamps: true,
  });

  return SiteContent;
};
