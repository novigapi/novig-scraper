# Novig Exchange Odds API & Scraper

An Apify actor that saves Novig exchange markets to an Apify dataset (JSON, CSV, Excel) on a schedule or on demand: one row per outcome, for game lines (moneyline, spread, total, team total) and player props, with the best bid, the ask a taker gets, the last trade, the taker price as American and decimal odds, the no-vig fair price, volume, open interest and the time it was captured.

It does not scrape Novig pages and needs no Novig account. It reads the documented, read-only [novigapi.com](https://novigapi.com/?utm_source=apify&utm_medium=actor&utm_campaign=novig-scraper) API with your own key, so runs are fast, rows have a stable schema and nothing breaks when the Novig app changes. A key is required: novigapi.com has no keyless market endpoint, and a run without one stops at once with a link to the free sign-up.

Independent; not affiliated with Novig. novigapi.com is an independent data service operated by Stunning Couches LLC. It is not affiliated with, endorsed by or sponsored by Novig. For placing orders or reading a Novig account, use Novig's official trading API. The data is prices, not betting advice.

## Quick start

1. Get a free key (100 credits a month, no card): https://novigapi.com/sign-up?utm_source=apify&utm_medium=actor&utm_campaign=novig-scraper
2. Run the actor with `apiKey` set, a `league` and a `market`.
3. Download the dataset or connect it to Sheets, Zapier, Make or a webhook.

## What it can read

| `market` | Novig market types |
| --- | --- |
| `game-lines` | `MONEY`, `SPREAD`, `TOTAL`, `TEAM_TOTAL` |
| `moneyline` | `MONEY` |
| `spread` | `SPREAD` |
| `total` | `TOTAL` |
| `team-total` | `TEAM_TOTAL` |
| `player-props` | Every market with a player, such as `POINTS`, `REBOUNDS`, `PASSING_YARDS` |
| `all` | Everything Novig lists for the league |

Set `marketTypeCode` to read one raw Novig market type instead, for example `POINTS`.

## Input

| Field | Default | Notes |
| --- | --- | --- |
| `apiKey` | empty | Required. Stored as a secret. You can also set `NOVIGAPI_KEY` in the actor environment. |
| `league` | `NBA` | Novig league code: `NBA`, `NFL`, `NHL`, `MLB`, `NCAAF`, `NCAAB`, `WNBA`, `MLS`, `EPL`, `UFC`, `ATP`, `WTA` and others. |
| `market` | `game-lines` | See the table above. |
| `marketTypeCode` | empty | One raw Novig market type; overrides `market`. |
| `includeFair` | `true` | Adds `fair_probability`, `fair_american` and `fair_decimal`. |
| `player` | empty | Player slug, for example `lebron-james`. |
| `team` | empty | Team slug, for example `phoenix-suns`. |
| `status` | `open` | `open`, `suspended`, `closed`, `settled` or `all`. |
| `maxItems` | 1000 | Stop after this many outcome rows. |

## Output

One row per outcome:

```json
{
  "book": "novig",
  "league": "NBA",
  "event": "Dallas Mavericks @ Minnesota Timberwolves",
  "event_id": "01a1cac7-5c83-7e41-ba84-afe1af0c1ca6",
  "event_status": "OPEN_PREGAME",
  "starts_at": "2026-11-13T01:05:00.000Z",
  "market_id": "01a1d00f-ec01-71c0-9776-0facc97e44a7",
  "market_type": "STEALS",
  "market": "player_prop",
  "description": "Cooper Flagg 1.5 STEALS",
  "player": "cooper-flagg",
  "team": null,
  "stat": "steals",
  "line": 1.5,
  "outcome_id": "01a1d00f-ec01-71c0-9776-0fb0230cbd18",
  "outcome": "Over 1.5",
  "side": "over",
  "bid": 0.39,
  "ask": 0.43,
  "last": 0.415,
  "price_american": 133,
  "price_decimal": 2.3256,
  "bid_qty": 18938,
  "spread_pp": 4,
  "volume": 198265,
  "open_interest": 146324,
  "status": "OPEN",
  "captured_at": "2026-11-12T17:23:56.000Z",
  "fair_probability": 0.41,
  "fair_american": 144,
  "fair_decimal": 2.439
}
```

Novig prices are probabilities from 0 to 1, and Novig's book holds bids only: the ask is 1 minus the best bid on the other side, and `price_american` / `price_decimal` are that ask as odds (what a taker gets now). The fair price is the two-sided mid, (bid + ask) / 2, and is null unless both sides have a bid. One contract pays $0.01 if it wins.

## Costs

Apify compute for a run is a few seconds. API usage is billed by novigapi.com on your own plan: one credit per page of 100 markets. The free plan (100 credits a month, prices delayed up to 5 minutes) covers small scheduled runs; [paid plans](https://novigapi.com/pricing?utm_source=apify&utm_medium=actor&utm_campaign=novig-scraper) give live prices and more credits, and 1,000-credit top-ups never expire.

## Prefer code?

The same data is in the official packages: [Python](https://github.com/novigapi/novigapi-python) (`pip install novigapi`), [JavaScript](https://github.com/novigapi/novigapi-js) and an [MCP server](https://github.com/novigapi/novigapi-mcp) for AI agents. Full reference: https://novigapi.com/docs?utm_source=apify&utm_medium=actor&utm_campaign=novig-scraper

## Develop

```bash
npm install
npm test                      # no network
APIFY_LOCAL_STORAGE_DIR=./storage NOVIGAPI_KEY=nv_... npm start
```

MIT License.
