'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('pricing_configs');

    if (tableDescription.basePricePHP && !tableDescription.basePriceUSD) {
      await queryInterface.renameColumn('pricing_configs', 'basePricePHP', 'basePriceUSD');
      console.log('[Migration] Renamed basePricePHP → basePriceUSD');
    }

    if (tableDescription.finalPricePHP && !tableDescription.finalPriceUSD) {
      await queryInterface.renameColumn('pricing_configs', 'finalPricePHP', 'finalPriceUSD');
      console.log('[Migration] Renamed finalPricePHP → finalPriceUSD');
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('pricing_configs');

    if (tableDescription.basePriceUSD && !tableDescription.basePricePHP) {
      await queryInterface.renameColumn('pricing_configs', 'basePriceUSD', 'basePricePHP');
    }

    if (tableDescription.finalPriceUSD && !tableDescription.finalPricePHP) {
      await queryInterface.renameColumn('pricing_configs', 'finalPriceUSD', 'finalPricePHP');
    }
  },
};
