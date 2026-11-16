// node --test: checks the client against a fake fetch (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, fetchRows, marketKind, normalizeInput, outcomeRows, probToAmerican, probToDecimal, sideOf } from '../src/client.js';

const market = (over = {}) => ({
  market_id: 'm1',
  event_id: 'e1',
  league: 'NBA',
  market_type: 'STEALS',
  description: 'Cooper Flagg 1.5 STEALS',
  strike: 1.5,
  status: 'OPEN',
  player_slug: 'cooper-flagg',
  team_slug: null,
  stat_slug: 'steals',
  starts_at: '2026-11-13T01:05:00.000Z',
  volume: 198265,
  open_interest: 146324,
  event_description: 'Dallas Mavericks @ Minnesota Timberwolves',
  event_status: 'OPEN_PREGAME',
  outcomes: [
    { outcome_id: 'o1', name: 'Over 1.5', bid: 0.39, bid_qty: 18938, ask: 0.43, fair: 0.41, last: 0.415, spread_pp: 4 },
    { outcome_id: 'o2', name: 'Under 1.5', bid: 0.57, bid_qty: 7500, ask: 0.61, fair: 0.59, last: 0.585, spread_pp: 4 },
  ],
  observed_at: '2026-11-12T17:23:56.000Z',
  ...over,
});

const res = (body, status = 200) => ({ ok: status < 400, status, headers: new Map(), json: async () => body });
const fake = (handler) => {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, calls.length - 1);
  };
  f.calls = calls;
  return f;
};
const collect = async (gen) => {
  const out = [];
  for await (const r of gen) out.push(r);
  return out;
};

test('probability to odds', () => {
  assert.equal(probToAmerican(0.41), 144);
  assert.equal(probToAmerican(0.59), -144);
  assert.equal(probToAmerican(0.5), -100);
  assert.equal(probToDecimal(0.5), 2);
  assert.equal(probToAmerican(null), null);
  assert.equal(probToDecimal(1), null);
});

test('marketKind and sideOf', () => {
  assert.equal(marketKind('MONEY'), 'moneyline');
  assert.equal(marketKind('TEAM_TOTAL'), 'team_total');
  assert.equal(marketKind('POINTS', 'lebron-james'), 'player_prop');
  assert.equal(sideOf('Over 1.5'), 'over');
  assert.equal(sideOf('PHX +13.5'), 'PHX');
  assert.equal(sideOf('BOS'), 'BOS');
});

test('normalizeInput defaults', () => {
  const i = normalizeInput({ league: 'nba', player: 'LeBron James' });
  assert.equal(i.league, 'NBA');
  assert.equal(i.market, 'game-lines');
  assert.equal(i.includeFair, true);
  assert.equal(i.player, 'lebron-james');
  assert.equal(i.status, 'open');
});

test('outcomeRows: one row per outcome, taker odds from the ask, fair optional', () => {
  const rows = outcomeRows(market());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].side, 'over');
  assert.equal(rows[0].line, 1.5);
  assert.equal(rows[0].price_american, 133);
  assert.equal(rows[0].price_decimal, 2.3256);
  assert.equal(rows[0].fair_probability, 0.41);
  assert.equal(rows[0].fair_american, 144);
  assert.equal(rows[0].market, 'player_prop');
  assert.equal(rows[0].player, 'cooper-flagg');
  assert.equal(rows[0].captured_at, '2026-11-12T17:23:56.000Z');
  const noFair = outcomeRows(market(), { includeFair: false });
  assert.equal('fair_probability' in noFair[0], false);
});

test('game lines: one call per market type, cursor paging, key and X-User-Request sent', async () => {
  const f = fake((url) => {
    const u = new URL(url);
    const type = u.searchParams.get('market_type');
    if (type === 'MONEY' && !u.searchParams.get('cursor')) return res({ data: [market({ market_type: 'MONEY', player_slug: null })], meta: { next_cursor: 'c1' } });
    if (type === 'MONEY') return res({ data: [market({ market_id: 'm2', market_type: 'MONEY', player_slug: null })], meta: { next_cursor: null } });
    return res({ data: [], meta: { next_cursor: null } });
  });
  const rows = await collect(fetchRows(normalizeInput({ league: 'NBA' }), { apiKey: 'nv_k', fetchImpl: f }));
  assert.equal(rows.length, 4);
  assert.equal(f.calls.length, 5);
  assert.match(f.calls[0].url, /\/api\/v1\/markets\?league=NBA&market_type=MONEY&status=open&limit=100/);
  assert.match(f.calls[1].url, /cursor=c1/);
  assert.equal(f.calls[0].opts.headers.Authorization, 'Bearer nv_k');
  assert.match(f.calls[0].opts.headers['X-User-Request'], /Novig NBA game-lines/);
  assert.equal(rows[0].market, 'moneyline');
});

test('player props keep only player markets; maxItems stops early', async () => {
  const f = fake(() => res({ data: [market({ player_slug: null, market_type: 'SPREAD' }), market(), market({ market_id: 'm3' })], meta: { next_cursor: 'more' } }));
  const rows = await collect(fetchRows(normalizeInput({ market: 'player-props', maxItems: 3 }), { apiKey: 'k', fetchImpl: f }));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.market === 'player_prop'));
  assert.equal(new URL(f.calls[0].url).searchParams.has('market_type'), false);
});

test('marketTypeCode overrides market', async () => {
  const f = fake(() => res({ data: [], meta: {} }));
  await collect(fetchRows(normalizeInput({ marketTypeCode: 'points' }), { apiKey: 'k', fetchImpl: f }));
  assert.equal(f.calls.length, 1);
  assert.equal(new URL(f.calls[0].url).searchParams.get('market_type'), 'POINTS');
});

test('no key and bad key surface as ApiError 401; monthly quota is not retried', async () => {
  await assert.rejects(collect(fetchRows(normalizeInput({}), { apiKey: '' })), (e) => e instanceof ApiError && e.status === 401);
  const bad = fake(() => res({ error: { code: 'INVALID_API_KEY', message: 'Send a valid key' } }, 401));
  await assert.rejects(collect(fetchRows(normalizeInput({}), { apiKey: 'x', fetchImpl: bad })), (e) => e.status === 401);
  const quota = fake(() => res({ error: { code: 'MONTHLY_QUOTA_EXCEEDED', message: 'Monthly credits used', upgrade_url: 'u' } }, 429));
  await assert.rejects(collect(fetchRows(normalizeInput({}), { apiKey: 'x', fetchImpl: quota })), (e) => e.code === 'MONTHLY_QUOTA_EXCEEDED');
  assert.equal(quota.calls.length, 1);
});
