/**
 * Date Filter Service
 *
 * Interprets natural language date phrases into date ranges.
 */

const DATE_PHRASES = [
  'today', 'yesterday', 'this week', 'last week',
  'this month', 'last month', 'this quarter', 'this year',
];

/**
 * Detect a date phrase in text and return structured date range.
 */
function detectDatePhrase(text) {
  const lower = (text || '').toLowerCase();

  for (const phrase of DATE_PHRASES) {
    if (lower.includes(phrase)) {
      const range = resolveDateRange(phrase);
      return { phrase, ...range };
    }
  }
  return null;
}

/**
 * Resolve a phrase to { start: Date, end: Date }
 */
function resolveDateRange(phrase) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (phrase) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 86400000 - 1),
      };

    case 'yesterday': {
      const yd = new Date(today);
      yd.setDate(yd.getDate() - 1);
      return {
        start: yd,
        end: new Date(yd.getTime() + 86400000 - 1),
      };
    }

    case 'this week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
      return {
        start: monday,
        end: new Date(today.getTime() + 86400000 - 1),
      };
    }

    case 'last week': {
      const dow = today.getDay();
      const thisMonday = new Date(today);
      thisMonday.setDate(thisMonday.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(lastSunday.getDate() - 1);
      return {
        start: lastMonday,
        end: new Date(lastSunday.getTime() + 86400000 - 1),
      };
    }

    case 'this month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(today.getTime() + 86400000 - 1),
      };

    case 'last month': {
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: firstLastMonth,
        end: new Date(lastDayLastMonth.getTime() + 86400000 - 1),
      };
    }

    case 'this quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), q * 3, 1),
        end: new Date(today.getTime() + 86400000 - 1),
      };
    }

    case 'this year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(today.getTime() + 86400000 - 1),
      };

    default:
      return { start: null, end: null };
  }
}

module.exports = { detectDatePhrase, resolveDateRange };
