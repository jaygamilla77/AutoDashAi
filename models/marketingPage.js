'use strict';

module.exports = (sequelize, DataTypes) => {
  const MarketingPage = sequelize.define('MarketingPage', {
    // URL-style identifier: 'features', 'about', 'faq', 'pricing', 'contact'
    slug: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    // Display label in the admin list
    label: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    // Page <title>
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    metaDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    metaKeywords: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    // Hero block
    heroEyebrow: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    },
    heroTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    heroSubtitle: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    // Main page body (raw HTML — admin-managed)
    bodyHtml: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    // Whether the public route should render DB content (vs. static fallback)
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    tableName: 'marketing_pages',
    timestamps: true,
  });

  return MarketingPage;
};
