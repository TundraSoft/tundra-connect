#!/usr/bin/env node
/**
 * Cloudflare Workers smoke test.
 *
 * Every connect's README says it is Web-APIs-only and so runs on Cloudflare
 * Workers. The unit suites cannot prove that — `@tundralibs/compat/test` has
 * no Workers backend yet — so this script checks the claim directly:
 *
 * 1. Bundle each connect's `mod.ts` with esbuild (browser platform, resolving
 *    the workspace import aliases through `tsconfig.json`).
 * 2. Load the bundle inside real workerd via Miniflare, WITHOUT the
 *    `nodejs_compat` flag — the strict form of "Web-APIs-only".
 * 3. Construct a client and push one request through the whole pipeline
 *    (option validation, auth injection, request signing, send, response
 *    handling) against a stubbed `_fetch` that answers 429. The specs pick
 *    the calls that exercise each connect's riskiest runtime surface: SigV4,
 *    Azure Shared Key, the GCS RS256 JWT, Kalshi's RSA-PSS, Polymarket's
 *    secp256k1/EIP-712 signing, and Ed25519/ECDSA webhook verification.
 *
 * A spec passes when the call reaches `fetch` (so everything before the wire
 * ran in workerd) and then rejects with the connect's own error class — or,
 * for a webhook spec, rejects with the expected code without any fetch.
 *
 * Usage: node .github/scripts/workers-smoke.mjs [connect ...]
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const COMPATIBILITY_DATE = '2025-09-01';

// Throwaway keys, generated per run, for the connects that sign with them.
const rsaPem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' });
const ed25519Hex = generateKeyPairSync('ed25519').publicKey
  .export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
// A genuine DER signature, but over different bytes: it parses, so ECDSA
// verification really runs in workerd — and then (correctly) fails.
const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const p256Spki = p256.publicKey.export({ format: 'der', type: 'spki' })
  .toString('base64');
const p256WrongSig = sign('sha256', Buffer.from('not the payload'), p256.privateKey)
  .toString('base64');

const q = (value) => JSON.stringify(value);

/**
 * One entry per request/verification to smoke-test. `make` and `call` are
 * JavaScript source run inside the worker (`lib` is the bundle's namespace,
 * `c` the client); `webhook` specs expect a rejection with `code` and no
 * network access at all.
 */
const SPECS = [
  { dir: 'algolia', error: 'AlgoliaError', make: `new lib.Algolia({ auth: { type: 'CUSTOM', applicationId: 'TESTAPPID', apiKey: 'test-api-key' } })`, call: `c.getObject('products', '1')` },
  { dir: 'azure-blob', error: 'AzureBlobError', label: 'Shared Key', make: `new lib.AzureBlob({ auth: { type: 'CUSTOM', account: 'devstoreaccount1', accountKey: 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==' } })`, call: `c.listObjects({ bucket: 'my-container' })` },
  { dir: 'azure-blob', error: 'AzureBlobError', label: 'streamed download', make: `new lib.AzureBlob({ auth: { type: 'CUSTOM', account: 'devstoreaccount1', accountKey: 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==' } })`, call: `c.getObjectStream({ bucket: 'my-container', key: 'k' })` },
  { dir: 'cloudflare-email', error: 'CloudflareEmailError', make: `new lib.CloudflareEmail({ accountId: 'acct-123', auth: { type: 'BEARER', token: 'cf-token' } })`, call: `c.send({ from: 'a@b.com', to: 'c@d.com', subject: 'S', text: 'hi' })` },
  { dir: 'coingecko', error: 'CoinGeckoError', make: `new lib.CoinGecko({})`, call: `c.getPrice({ ids: 'bitcoin', vsCurrencies: 'usd' })` },
  { dir: 'discord', error: 'DiscordError', make: `new lib.Discord({ botToken: 'a-bot-token' })`, call: `c.sendChannelMessage('234567890123456789', { content: 'hi' })` },
  { dir: 'discord', error: 'DiscordError', label: 'Ed25519 interaction', webhook: 'WEBHOOK_SIGNATURE_INVALID', make: `new lib.Discord({ botToken: 'a-bot-token' })`, call: `c.verifyWebhook({ payload: '{"type":1}', headers: { 'x-signature-ed25519': 'ab'.repeat(64), 'x-signature-timestamp': String(Math.floor(Date.now() / 1000)) }, publicKey: ${q(ed25519Hex)} })` },
  { dir: 'dodo-payments', error: 'DodoPaymentsError', make: `new lib.DodoPayments({ auth: { type: 'BEARER', token: 'dodo-key', prefix: 'Bearer' } })`, call: `c.getPayment('pay_1')` },
  { dir: 'gcs', error: 'GCSError', label: 'bearer', make: `new lib.GCS({ auth: { type: 'BEARER', token: 't' } })`, call: `c.listObjects({ bucket: 'my-bucket' })` },
  { dir: 'gcs', error: 'GCSError', label: 'service-account RS256 JWT', make: `new lib.GCS({ auth: { type: 'CUSTOM', clientEmail: 'svc@x.iam.gserviceaccount.com', privateKey: ${q(rsaPem)} } })`, call: `c.headObject({ bucket: 'b', key: 'a' })` },
  { dir: 'kalshi', error: 'KalshiError', label: 'RSA-PSS signed', make: `new lib.Kalshi({ auth: { type: 'CUSTOM', accessKey: 'key-id', privateKeyPem: ${q(rsaPem)} } })`, call: `c.getBalance()` },
  { dir: 'ntfy', error: 'NtfyError', make: `new lib.Ntfy({})`, call: `c.publish({ topic: 'mytopic', message: 'hi' })` },
  { dir: 'openexchange', error: 'OpenExchangeError', make: `new lib.OpenExchange({ auth: { type: 'CUSTOM', appId: 'test-app-id' } })`, call: `c.getRates()` },
  { dir: 'openweathermap', error: 'OpenWeatherMapError', make: `new lib.OpenWeatherMap({ auth: { type: 'CUSTOM', apiKey: 'test-api-key' } })`, call: `c.getCurrentWeather({ lat: 51.51, lon: -0.13 })` },
  { dir: 'paypal', error: 'PayPalError', label: 'OAuth2 token exchange', make: `new lib.PayPal({ auth: { type: 'CUSTOM', clientId: 'test-client-id', clientSecret: 'test-client-secret-value', environment: 'sandbox' } })`, call: `c.getOrder('5O190127TN364715T')` },
  { dir: 'polymarket', error: 'PolymarketError', label: 'secp256k1 EIP-712 (L1)', make: `new lib.Polymarket({ auth: { type: 'CUSTOM', privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' } })`, call: `c.deriveApiCredentials()` },
  { dir: 'razorpay', error: 'RazorpayError', make: `new lib.Razorpay({ auth: { type: 'BASIC', username: 'rzp_test_abc123', password: 'secretkeyvalue' } })`, call: `c.getPayment('pay_29QQoUBi66xm2f')` },
  { dir: 's3', error: 'S3Error', label: 'SigV4', make: `new lib.S3({ auth: { type: 'CUSTOM', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' } })`, call: `c.listObjects({ bucket: 'examplebucket' })` },
  { dir: 's3', error: 'S3Error', label: 'SigV4 streamed download', make: `new lib.S3({ auth: { type: 'CUSTOM', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' } })`, call: `c.getObjectStream({ bucket: 'examplebucket', key: 'k' })` },
  { dir: 'sendgrid', error: 'SendGridError', make: `new lib.SendGrid({ auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' } })`, call: `c.sendMail({ personalizations: [{ to: [{ email: 'dest@example.com' }] }], from: { email: 'sender@example.com' }, subject: 'Hello', content: [{ type: 'text/plain', value: 'Hi there!' }] })` },
  { dir: 'sendgrid', error: 'SendGridError', label: 'ECDSA P-256 event webhook', webhook: 'WEBHOOK_SIGNATURE_INVALID', make: `new lib.SendGrid({ auth: { type: 'BEARER', token: 'SG.test-key', prefix: 'Bearer' } })`, call: `c.verifyWebhook({ payload: '[]', headers: { 'x-twilio-email-event-webhook-signature': ${q(p256WrongSig)}, 'x-twilio-email-event-webhook-timestamp': String(Math.floor(Date.now() / 1000)) }, publicKey: ${q(p256Spki)} })` },
  { dir: 'sentry', error: 'SentryError', make: `new lib.Sentry({ auth: { type: 'BEARER', token: 'sntrys_test' }, organization: 'my-org' })`, call: `c.getIssue('PUMP-STATION-1')` },
  { dir: 'slack', error: 'SlackError', make: `new lib.Slack({ auth: { type: 'BEARER', token: 'xoxb-test-token' } })`, call: `c.postMessage({ channel: 'C1', text: 'hi' })` },
  { dir: 'stripe', error: 'StripeError', make: `new lib.Stripe({ auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' } })`, call: `c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g')` },
  { dir: 'telegram', error: 'TelegramError', make: `new lib.Telegram({ botToken: '123456789:AAExampleTokenAABBCCDDEEFFGGHHIIJJKKLLMM' })`, call: `c.sendMessage({ chat_id: 1, text: 'hi' })` },
  { dir: 'twilio', error: 'TwilioError', make: `new lib.Twilio({ accountSid: 'AC' + '1'.repeat(32), authToken: 'token' })`, call: `c.getCall('CA' + '0'.repeat(32))` },
  { dir: 'upstash-redis', error: 'UpstashRedisError', make: `new lib.UpstashRedis({ auth: { type: 'BEARER', token: 'test-token', prefix: 'Bearer' }, baseURL: 'https://us1-merry-cat-32748.upstash.io' })`, call: `c.get('foo')` },
];

function workerSource(spec) {
  return `import * as lib from './lib.mjs';
export default {
  async fetch() {
    const out = { fetched: 0 };
    try {
      const c = ${spec.make};
      c._fetch = async () => {
        out.fetched++;
        return new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '1' },
        });
      };
      await ${spec.call};
      out.outcome = 'resolved';
    } catch (e) {
      out.outcome = 'rejected';
      out.error = e?.constructor?.name;
      out.code = e?.code;
      out.message = String(e?.message ?? e).slice(0, 400);
    }
    return Response.json(out);
  },
};`;
}

const bundles = new Map();
async function bundle(dir) {
  if (!bundles.has(dir)) {
    const result = await build({
      entryPoints: [`connectors/${dir}/mod.ts`],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      tsconfig: 'tsconfig.json',
      logLevel: 'silent',
    });
    bundles.set(dir, result.outputFiles[0].text);
  }
  return bundles.get(dir);
}

function verdict(spec, out) {
  if (spec.webhook) {
    return out.outcome === 'rejected' && out.code === spec.webhook &&
        out.fetched === 0
      ? null
      : `expected ${spec.webhook} with no fetch`;
  }
  if (out.fetched < 1) return 'never reached fetch';
  if (out.outcome !== 'rejected' || out.error !== spec.error) {
    return `expected a ${spec.error}`;
  }
  return null;
}

const only = new Set(process.argv.slice(2));
const specs = only.size ? SPECS.filter((s) => only.has(s.dir)) : SPECS;
let failures = 0;
for (const spec of specs) {
  const name = spec.label ? `${spec.dir} (${spec.label})` : spec.dir;
  let problem;
  let out = {};
  const mf = new Miniflare({
    modules: [
      { type: 'ESModule', path: 'worker.mjs', contents: workerSource(spec) },
      { type: 'ESModule', path: 'lib.mjs', contents: await bundle(spec.dir) },
    ],
    compatibilityDate: COMPATIBILITY_DATE,
  });
  try {
    const res = await mf.dispatchFetch('http://smoke.test/');
    out = await res.json();
    problem = verdict(spec, out);
  } catch (e) {
    problem = `worker failed to load or run: ${String(e?.message ?? e).slice(0, 400)}`;
  } finally {
    await mf.dispose();
  }
  if (problem) {
    failures++;
    console.log(`✗ ${name} — ${problem}`);
    console.log(`    ${JSON.stringify(out)}`);
  } else {
    const detail = spec.webhook
      ? `${out.code}, no fetch`
      : `fetch reached, ${out.error} ${out.code}`;
    console.log(`✓ ${name} — ${detail}`);
  }
}
console.log(
  `\n${specs.length - failures}/${specs.length} passed in workerd (no nodejs_compat)`,
);
process.exit(failures ? 1 : 0);
