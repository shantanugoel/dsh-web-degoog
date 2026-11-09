// Smoke and integration tests for dsh-web-degoog.
// Run: node scripts/smoke.mjs
// Add DEGOOG_LIVE=1 to include the opt-in tests that reach the public
// internet and the author's degoog instance.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { isPrivateAddress, parseIp } from '../lib/ip.js';
import { DegoogSearchProvider, mapDegoogResponse } from '../lib/provider.js';
import { DegoogFetchProvider } from '../lib/fetch-provider.js';
import { Config, apply } from '../lib/index.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) console.log('ok   -', name);
  else { failures += 1; console.log('FAIL -', name, detail); }
}
async function expectCode(name, promise, code) {
  try { await promise; failures += 1; console.log('FAIL -', name, '(no error thrown)'); }
  catch (error) { check(name, error?.code === code, 'got: ' + error?.code + ' / ' + error?.message); }
}

// --- IP guard units -------------------------------------------------------
const v4Cases = [
  ['127.0.0.1', true], ['127.255.255.255', true], ['10.1.2.3', true],
  ['172.16.0.1', true], ['172.31.255.255', true], ['172.32.0.1', false],
  ['192.168.1.1', true], ['169.254.169.254', true], ['0.0.0.0', true],
  ['100.64.0.1', true], ['100.127.255.255', true], ['100.128.0.1', false],
  ['198.18.0.1', true], ['198.19.255.255', true], ['198.20.0.1', false],
  ['224.0.0.1', true], ['240.0.0.1', true], ['255.255.255.255', true],
  ['8.8.8.8', false], ['1.1.1.1', false], ['93.184.216.34', false],
];
for (const [ip, expected] of v4Cases) {
  check('ipv4 ' + ip + ' -> ' + expected, isPrivateAddress(ip) === expected);
}
const v6Cases = [
  ['::1', true], ['::', true], ['::ffff:127.0.0.1', true], ['::ffff:8.8.8.8', false],
  ['::127.0.0.1', true], ['::7f00:1', true], ['::808:808', false],
  ['2002:7f00:1::', true], ['2002:0808:0808::', false],
  ['fe80::1', true], ['fec0::1', false], ['fc00::1', true], ['fd12:3456::1', true],
  ['ff02::1', true], ['64:ff9b::7f00:1', true], ['64:ff9b::808:808', false],
  ['2001:4860:4860::8888', false], ['2606:4700:4700::1111', false],
];
for (const [ip, expected] of v6Cases) {
  check('ipv6 ' + ip + ' -> ' + expected, isPrivateAddress(ip) === expected);
}
check('garbage ip refuses', isPrivateAddress('not-an-ip') === true);
check('mapped-v4 byte fold', JSON.stringify(parseIp('::ffff:1.2.3.4')?.bytes) === '[0,0,0,0,0,0,0,0,0,0,255,255,1,2,3,4]');
check('v6 compression head', JSON.stringify(parseIp('2001:db8::')?.bytes.slice(0, 4)) === '[32,1,13,184]');

// --- mapping units --------------------------------------------------------
const mapped = mapDegoogResponse({ results: [
  { url: 'https://a.example/', title: 'A', snippet: 'sa', content: 'ca' },
  { url: 'https://a.example/', title: 'dup' },
  { title: 'no-url' },
  { url: 'https://b.example/', content: 'content-only snippet' },
] });
check('mapping dedupes and skips', mapped.sources.length === 2 && mapped.truncated === false);
check('snippet falls back to content', mapped.sources[1].snippet === 'content-only snippet');
check('empty results stay valid', mapDegoogResponse({ results: [] }).sources.length === 0);
function shapeError(payload) {
  try { mapDegoogResponse(payload); return null; } catch (error) { return error; }
}
check('missing results array throws', shapeError({}).code === 'DEGOOG_UNEXPECTED_RESPONSE');
check('non-array results throws', shapeError({ results: 'nope' }).code === 'DEGOOG_UNEXPECTED_RESPONSE');
check('in-band error surfaces detail', (shapeError({ error: 'rate limited' })?.message ?? '').includes('rate limited'));

// --- shared Config + apply ------------------------------------------------
/** Write one volatile Config reference the way a live settings write does. */
function writeVolatile(ref, value) {
  ref[Symbol.for('cosmokit.volatile.write')](value);
}

function makeContext() {
  const registered = { search: [], fetch: [], presentations: [] };
  const ctx = {
    fiber: {},
    get: () => undefined,
    web: {
      registerSearchProvider: (provider) => { registered.search.push(provider); },
      registerFetchProvider: (provider) => { registered.fetch.push(provider); },
    },
    inject: (services, callback) => {
      if (!services.includes('settings')) return;
      callback({
        fiber: {},
        effect: (factory) => factory(),
        settings: {
          configure: (presentation, owner) => {
            registered.presentations.push({ presentation, owner });
            return () => {};
          },
        },
      });
    },
  };
  return { ctx, registered };
}

const config = Config({
  serverUrl: '',
  apiKeyEnv: 'DEGOOG_API_KEY',
  searchType: 'web',
  lang: '',
});
const { ctx, registered } = makeContext();
apply(ctx, config);
check('apply registers one search provider', registered.search.length === 1 && registered.search[0].id === 'degoog');
check('apply registers one fetch provider', registered.fetch.length === 1 && registered.fetch[0].id === 'degoog');
check('apply disables the synthesized settings page', registered.presentations.length === 1 && registered.presentations[0].presentation.auto === false);
const searchProvider = registered.search[0];
const fetchProvider = registered.fetch[0];
check('blank serverUrl unavailable', searchProvider.available() === false);
await expectCode('search without serverUrl -> DEGOOG_SERVER_URL_MISSING', searchProvider.search({ query: 'x' }), 'DEGOOG_SERVER_URL_MISSING');
check('fetch provider always available', fetchProvider.available() === true);

// --- local search/fetch servers ------------------------------------------
let searchRequests = [];
const searchServer = createServer((req, res) => {
  searchRequests.push({ url: req.url, headers: req.headers });
  const parsed = new URL(req.url, 'http://127.0.0.1');
  const query = parsed.searchParams.get('q') ?? '';
  if (query === 'unauthorized') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'authentication required' }));
    return;
  }
  if (query === 'boom') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'engine exploded' }));
    return;
  }
  if (query === 'bad-json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{not json');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ results: [
    { url: 'https://a.example/', title: 'A', snippet: 'sa' },
    { url: 'https://b.example/', title: 'B', content: 'cb' },
  ] }));
});
await new Promise((resolve) => searchServer.listen(0, '127.0.0.1', resolve));
const searchBase = 'http://127.0.0.1:' + searchServer.address().port;

let fetchRequests = [];
const fetchServer = createServer((req, res) => {
  fetchRequests.push({ url: req.url, headers: req.headers });
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (path === '/page') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><body><h1>Example Domain</h1></body></html>');
  } else if (path === '/text') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('plain text body');
  } else if (path === '/bin') {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(Buffer.from([0, 1, 2, 3]));
  } else if (path === '/redirect') {
    res.writeHead(302, { location: '/page' });
    res.end();
  } else if (path === '/loop') {
    res.writeHead(302, { location: '/loop' });
    res.end();
  } else if (path === '/gzip') {
    const body = gzipSync(Buffer.from('compressed body'));
    res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip', 'content-length': String(body.length) });
    res.end(body);
  } else if (path === '/big') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('x'.repeat(2_100_000));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});
await new Promise((resolve) => fetchServer.listen(0, '127.0.0.1', resolve));
const fetchBase = 'http://127.0.0.1:' + fetchServer.address().port;

try {
  // --- live config writes (the DSH 0.2.x volatile path) -------------------
  writeVolatile(config.serverUrl, searchBase);
  check('serverUrl write makes provider available', searchProvider.available() === true);

  searchRequests = [];
  const first = await searchProvider.search({ query: 'ripgrep tutorial' });
  check('local search returns sources', first.sources.length === 2 && first.sources[0].url === 'https://a.example/');
  check('local search maps snippet', first.sources[0].snippet === 'sa');
  check('local search maps content fallback', first.sources[1].snippet === 'cb');
  const firstUrl = new URL(searchRequests[0].url, searchBase);
  check('search uses /api/search', firstUrl.pathname === '/api/search');
  check('search sends q', firstUrl.searchParams.get('q') === 'ripgrep tutorial');
  check('search sends type', firstUrl.searchParams.get('type') === 'web');
  check('search omits blank lang', firstUrl.searchParams.get('lang') === null);
  check('search user-agent', searchRequests[0].headers['user-agent'] === 'dsh-web-degoog');

  writeVolatile(config.searchType, 'images');
  writeVolatile(config.lang, 'de');
  searchRequests = [];
  await searchProvider.search({ query: 'cats' });
  const typedUrl = new URL(searchRequests[0].url, searchBase);
  check('search type follows live write', typedUrl.searchParams.get('type') === 'images');
  check('search lang follows live write', typedUrl.searchParams.get('lang') === 'de');

  writeVolatile(config.apiKey, 'literal-secret');
  searchRequests = [];
  await searchProvider.search({ query: 'auth' });
  check('literal api key sent as bearer', searchRequests[0].headers.authorization === 'Bearer literal-secret');

  writeVolatile(config.apiKey, '');
  const previousEnv = process.env.DEGOOG_API_KEY;
  process.env.DEGOOG_API_KEY = 'env-secret';
  try {
    searchRequests = [];
    await searchProvider.search({ query: 'env-auth' });
    check('launch environment key sent as bearer', searchRequests[0].headers.authorization === 'Bearer env-secret');
  } finally {
    if (previousEnv === undefined) delete process.env.DEGOOG_API_KEY;
    else process.env.DEGOOG_API_KEY = previousEnv;
  }

  await expectCode('401 without a key -> credential missing', searchProvider.search({ query: 'unauthorized' }), 'WEB_PROVIDER_CREDENTIAL_MISSING');
  writeVolatile(config.apiKey, 'literal-secret');
  await expectCode('401 with a key -> provider error', searchProvider.search({ query: 'unauthorized' }), 'WEB_PROVIDER_ERROR');
  await expectCode('HTTP 500 -> provider error', searchProvider.search({ query: 'boom' }), 'WEB_PROVIDER_ERROR');
  await expectCode('invalid JSON -> provider error', searchProvider.search({ query: 'bad-json' }), 'WEB_PROVIDER_ERROR');
  writeVolatile(config.apiKey, '');

  // --- fetch guard + retrieval --------------------------------------------
  await expectCode('fetch 127.0.0.1 blocked by default', fetchProvider.fetch({ url: fetchBase + '/page' }), 'DEGOOG_FETCH_BLOCKED_HOST');
  await expectCode('fetch [::1] blocked', fetchProvider.fetch({ url: 'http://[::1]/x' }), 'DEGOOG_FETCH_BLOCKED_HOST');
  await expectCode('fetch ipv4-compatible ::127.0.0.1 blocked', fetchProvider.fetch({ url: 'http://[::127.0.0.1]/x' }), 'DEGOOG_FETCH_BLOCKED_HOST');
  await expectCode('fetch 6to4 loopback blocked', fetchProvider.fetch({ url: 'http://[2002:7f00:1::]/x' }), 'DEGOOG_FETCH_BLOCKED_HOST');
  await expectCode('fetch metadata IP blocked', fetchProvider.fetch({ url: 'http://169.254.169.254/latest/meta-data/' }), 'DEGOOG_FETCH_BLOCKED_HOST');
  await expectCode('fetch ftp scheme rejected', fetchProvider.fetch({ url: 'ftp://example.com/x' }), 'DEGOOG_FETCH_INVALID_URL');
  await expectCode('fetch embedded credentials rejected', fetchProvider.fetch({ url: 'https://user:pass@example.com/' }), 'DEGOOG_FETCH_INVALID_URL');
  await expectCode('fetch overlong URL rejected', fetchProvider.fetch({ url: 'https://example.com/' + 'a'.repeat(2100) }), 'DEGOOG_FETCH_INVALID_URL');

  config.allowPrivateAddresses = true;
  check('fetch still available with escape hatch', fetchProvider.available() === true);
  const page = await fetchProvider.fetch({ url: fetchBase + '/page' });
  check('local fetch status 200', page.statusCode === 200, String(page.statusCode));
  check('local fetch classified html', page.body.kind === 'html');
  check('local fetch body contains marker', page.body.content.includes('Example Domain'));
  check('local fetch final url', page.url === fetchBase + '/page');

  const text = await fetchProvider.fetch({ url: fetchBase + '/text' });
  check('plain text classified text', text.body.kind === 'text' && text.body.content === 'plain text body');

  const gzipped = await fetchProvider.fetch({ url: fetchBase + '/gzip' });
  check('gzip body decoded', gzipped.body.content === 'compressed body');

  const redirected = await fetchProvider.fetch({ url: fetchBase + '/redirect' });
  check('same-origin redirect followed', redirected.url === fetchBase + '/page' && redirected.statusCode === 200);
  await expectCode('redirect loop -> too many redirects', fetchProvider.fetch({ url: fetchBase + '/loop' }), 'DEGOOG_FETCH_TOO_MANY_REDIRECTS');
  await expectCode('binary content type refused', fetchProvider.fetch({ url: fetchBase + '/bin' }), 'DEGOOG_FETCH_UNSUPPORTED_CONTENT_TYPE');

  const big = await fetchProvider.fetch({ url: fetchBase + '/big' });
  check('oversized body truncated', big.truncated === true && big.body.content.length <= 2_000_000, String(big.body.content.length));

  // --- opt-in live checks -------------------------------------------------
  if (process.env.DEGOOG_LIVE === '1') {
    const liveProvider = new DegoogSearchProvider(() => ({
      serverUrl: process.env.DEGOOG_URL ?? 'https://degoog.shaanlab.com',
      apiKeyEnvName: 'DEGOOG_API_KEY',
      resolveApiKey: async () => undefined,
      searchType: 'web',
      lang: '',
    }));
    check('live serverUrl available', liveProvider.available() === true);
    const result = await liveProvider.search({ query: 'ripgrep tutorial' });
    check('live search returns sources', Array.isArray(result.sources) && result.sources.length > 0, JSON.stringify(result).slice(0, 200));
    const ok = await fetchProvider.fetch({ url: 'https://example.com/' });
    check('live https fetch status 200', ok.statusCode === 200, String(ok.statusCode));
    check('live fetch body contains Example Domain', ok.body.content.includes('Example Domain'));
  }
} finally {
  await new Promise((resolve) => searchServer.close(resolve));
  await new Promise((resolve) => fetchServer.close(resolve));
}

console.log(failures === 0 ? '\nALL PASS' : String(failures) + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
