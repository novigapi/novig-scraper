import { Actor, log } from 'apify';
import { ApiError, fetchRows, normalizeInput } from './client.js';
import config from './config.js';

await Actor.init();
const input = normalizeInput((await Actor.getInput()) ?? {});
const apiKey = String(input.apiKey || process.env[config.env] || '').trim();

if (!apiKey) {
  await Actor.fail(
    `This actor needs a Novig API key: novigapi.com has no keyless market endpoint. ` +
      `Get a free key (${config.free}) at ${config.signupUrl} and paste it into the apiKey field.`,
  );
}

const what = input.marketTypeCode || input.market;
log.info(`Reading Novig ${input.league} ${what} markets (${input.status}) from ${config.base}`);
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
  if (e instanceof ApiError && e.status === 429) {
    const err = e.body?.error ?? {};
    const where = err.upgrade_url || err.topup_url || config.pricingUrl;
    await Actor.fail(`novigapi.com limit reached (${e.code || 'RATE_LIMITED'}): ${e.message}. Plans and top-ups: ${where}`);
  }
  await Actor.fail(`novigapi.com request failed: ${e.message}`);
}
if (batch.length) await Actor.pushData(batch);
log.info(`Saved ${count} outcome rows to the dataset.`);
if (!count) log.warning(`No ${input.league} ${what} markets matched. Check the league code (GET /api/v1/leagues) or remove filters.`);
await Actor.exit(`Saved ${count} Novig ${input.league} ${what} outcome rows.`);
