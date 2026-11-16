import { Actor, log } from 'apify';
import { ApiError, fetchRows, normalizeInput } from './client.js';
import config from './config.js';

await Actor.init();
const input = normalizeInput((await Actor.getInput()) ?? {});
const apiKey = String(input.apiKey || process.env[config.env] || '').trim();

const what = input.marketTypeCode || input.market;
if (apiKey) log.info(`Reading Novig ${input.league} ${what} markets (${input.status}) from ${config.base}, live`);
else {
  log.warning(
    `No API key: reading the free delayed tier (${config.base}${config.freePath}): real Novig markets a few minutes ` +
      `delayed, the 40 most traded upcoming markets per league only, at most ${config.freePageSize} per market type. ` +
      `For live prices, every market and paging, add a free key (${config.free}): ${config.signupUrl}`,
  );
  if (input.status !== 'open') log.warning(`The free tier has open markets only; status "${input.status}" needs a key.`);
}
let count = 0;
const batch = [];
try {
  for await (const row of fetchRows(input, { apiKey, log: log.info.bind(log) })) {
    batch.push(row);
    count++;
    if (batch.length >= 500) await Actor.pushData(batch.splice(0));
  }
} catch (e) {
  if (batch.length) await Actor.pushData(batch);
  if (e instanceof ApiError && e.status === 401) {
    await Actor.fail(`novigapi.com rejected the API key. Check it, or create a free key (${config.free}) at ${config.signupUrl}`);
  }
  if (e instanceof ApiError && e.status === 429 && !apiKey) {
    await Actor.fail(`The keyless free tier is busy (${e.code || 'RATE_LIMITED'}): ${e.message}. A free key (${config.free}) lifts this: ${config.signupUrl}`);
  }
  if (e instanceof ApiError && e.status === 429) {
    const err = e.body?.error ?? {};
    const where = err.upgrade_url || err.topup_url || config.pricingUrl;
    await Actor.fail(`novigapi.com limit reached (${e.code || 'RATE_LIMITED'}): ${e.message}. Plans and top-ups: ${where}`);
  }
  await Actor.fail(`novigapi.com request failed: ${e.message}`);
}
if (batch.length) await Actor.pushData(batch);
log.info(`Saved ${count} ${apiKey ? 'live' : 'free delayed'} outcome rows to the dataset.`);
if (!apiKey && count) log.info(`Want live prices and every market? Free key, ${config.free}: ${config.signupUrl}`);
if (!count) log.warning(`No ${input.league} ${what} markets matched. Check the league code (GET /api/v1/leagues) or remove filters.`);
await Actor.exit(`Saved ${count} Novig ${input.league} ${what} outcome rows.`);
