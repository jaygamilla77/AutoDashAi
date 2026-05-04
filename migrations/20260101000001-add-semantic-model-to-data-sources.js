'use strict';

/**
 * Add semanticModelJson (LONGTEXT) to data_sources.
 *
 * The semantic model captures business-friendly metadata for an LLM:
 *  {
 *    tables: [{
 *      name, displayName, role: 'fact'|'dimension'|'mixed',
 *      grain, description,
 *      columns: [{
 *        name, displayName, dataType, role: 'measure'|'dimension'|'time'|'identifier',
 *        unit, format, defaultAggregation, synonyms: [], description,
 *        sampleValues: [], cardinality, nullRatio
 *      }],
 *      relationships: [{ to, fromColumn, toColumn, type }]
 *    }],
 *    dataSourceId, generatedAt, version
 *  }
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists to avoid duplicate column error
    const tableDescription = await queryInterface.describeTable('data_sources');
    if (!tableDescription.semanticModelJson) {
      await queryInterface.addColumn('data_sources', 'semanticModelJson', {
        type: 'LONGTEXT',
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('data_sources', 'semanticModelJson');
  },
};
