// What this actor reads from the Novig API (https://novigapi.com/openapi.json).
const utm = 'utm_source=apify&utm_medium=actor&utm_campaign=novig-scraper';

export default {
  name: 'novig-scraper',
  base: 'https://novigapi.com',
  env: 'NOVIGAPI_KEY',
  utm,
  signupUrl: `https://novigapi.com/sign-up?${utm}`,
  docsUrl: `https://novigapi.com/docs?${utm}`,
  pricingUrl: `https://novigapi.com/pricing?${utm}`,
  free: '100 credits a month, no card',
  // Free keys return at most 100 rows a page; one credit per 100 rows requested.
  pageSize: 100,
  // Input "market" -> Novig market_type codes. null means no market_type filter.
  markets: {
    all: [null],
    'game-lines': ['MONEY', 'SPREAD', 'TOTAL', 'TEAM_TOTAL'],
    moneyline: ['MONEY'],
    spread: ['SPREAD'],
    total: ['TOTAL'],
    'team-total': ['TEAM_TOTAL'],
    'player-props': [null],
  },
};
