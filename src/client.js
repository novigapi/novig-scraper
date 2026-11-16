// Thin client: calls the documented novigapi.com REST API with the user's own key and
// yields one flat row per outcome. Read-only; no Novig account, no order placement.
import config from './config.js';

export class ApiError extends Error {
  constructor(status, code, message, body) {
    super(`${status}${code ? ` ${code}` : ''}: ${message}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const round = (n, p = 4) => (n === null || n === undefined ? null : Math.round(n * 10 ** p) / 10 ** p);

// Novig prices are probabilities from 0 to 1.
export function probToDecimal(p) {
  return p > 0 && p < 1 ? round(1 / p) : null;
}

export function probToAmerican(p) {
  if (!(p > 0 && p < 1)) return null;
  return Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
}

export function normalizeInput(raw = {}) {
  const input = { ...raw };
  input.league = String(input.league ?? 'NBA').trim().toUpperCase();
  input.market = config.markets[input.market] ? input.market : 'game-lines';
  input.marketTypeCode = String(input.marketTypeCode ?? '').trim().toUpperCase();
  input.includeFair = input.includeFair !== false;
  input.player = String(input.player ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  input.team = String(input.team ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  input.status = ['open', 'closed', 'settled', 'suspended', 'all'].includes(input.status) ? input.status : 'open';
  input.maxItems = Math.max(1, Number(input.maxItems) || 1000);
  return input;
}

export function marketKind(code = '', playerSlug = null) {
  if (playerSlug) return 'player_prop';
  const c = String(code).toUpperCase();
  if (c === 'MONEY') return 'moneyline';
  if (c === 'SPREAD') return 'spread';
  if (c === 'TOTAL') return 'total';
  if (c === 'TEAM_TOTAL') return 'team_total';
  return c.toLowerCase() || null;
}

export function sideOf(name = '') {
  const n = String(name).trim();
  const m = n.match(/^(Over|Under|Yes|No)\b/i);
  if (m) return m[1].toLowerCase();
  return n.replace(/\s*[+-]?\d+(\.\d+)?$/, '') || null;
}

export function outcomeRows(m, { includeFair = true } = {}) {
  return (m.outcomes ?? []).map((o) => {
    const r = {
      book: 'novig',
      league: m.league ?? null,
      event: m.event_description ?? null,
      event_id: m.event_id ?? null,
      event_status: m.event_status ?? null,
      starts_at: m.starts_at ?? null,
      market_id: m.market_id ?? null,
      market_type: m.market_type ?? null,
      market: marketKind(m.market_type, m.player_slug),
      description: m.description ?? null,
      player: m.player_slug ?? null,
      team: m.team_slug ?? null,
      stat: m.stat_slug ?? null,
      line: m.strike ?? null,
      outcome_id: o.outcome_id ?? null,
      outcome: o.name ?? null,
      side: sideOf(o.name),
      bid: o.bid ?? null,
      ask: o.ask ?? null,
      last: o.last ?? null,
      // What a taker pays now: the ask, as odds.
      price_american: probToAmerican(o.ask),
      price_decimal: probToDecimal(o.ask),
      bid_qty: o.bid_qty ?? null,
      spread_pp: o.spread_pp ?? null,
      volume: m.volume ?? null,
      open_interest: m.open_interest ?? null,
      status: m.status ?? null,
      captured_at: m.observed_at ?? null,
    };
    if (includeFair) {
      r.fair_probability = o.fair ?? null;
      r.fair_american = probToAmerican(o.fair);
      r.fair_decimal = probToDecimal(o.fair);
    }
    return r;
  });
}

export async function getJson(url, { apiKey, fetchImpl = fetch, log = () => {}, userRequest } = {}) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': `apify-actor/${config.name}`,
  };
  if (userRequest) headers['X-User-Request'] = userRequest;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { headers });
    const body = await res.json().catch(() => null);
    if (res.status === 429 && body?.error?.code !== 'MONTHLY_QUOTA_EXCEEDED' && attempt < 3) {
      const wait = Math.min(Number(res.headers?.get?.('retry-after')) || 2 ** (attempt + 1), 60);
      log(`Rate limited, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const e = body?.error ?? {};
      throw new ApiError(res.status, e.code ?? '', e.user_message ?? e.message ?? `HTTP ${res.status}`, body);
    }
    return body;
  }
}

export async function* fetchRows(input, { apiKey, fetchImpl = fetch, log = () => {} } = {}) {
  if (!apiKey) throw new ApiError(401, 'NO_API_KEY', 'An API key is required');
  const codes = input.marketTypeCode ? [input.marketTypeCode] : config.markets[input.market];
  const userRequest = `Apify actor: export Novig ${input.league} ${input.marketTypeCode || input.market} prices to a dataset`;
  let emitted = 0;
  for (const code of codes) {
    const params = {
      league: input.league,
      market_type: code ?? undefined,
      player: input.player || undefined,
      team: input.team || undefined,
      status: input.status,
      limit: config.pageSize,
    };
    for (let page = 0; page < 1000; page++) {
      const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
      const body = await getJson(`${config.base}/api/v1/markets?${q}`, { apiKey, fetchImpl, log, userRequest });
      for (const m of body?.data ?? []) {
        if (input.market === 'player-props' && !input.marketTypeCode && !m.player_slug) continue;
        for (const r of outcomeRows(m, input)) {
          yield r;
          if (++emitted >= input.maxItems) return;
        }
      }
      const next = body?.meta?.next_cursor;
      if (!next) break;
      params.cursor = next;
    }
  }
}
