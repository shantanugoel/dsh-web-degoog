// Smoke tests for dsh-web-degoog. Run: bun scripts/smoke.mjs
import { isPrivateAddress, parseIp } from '../lib/ip.js';
import { DegoogSearchProvider, mapDegoogResponse } from '../lib/provider.js';
import { DegoogFetchProvider } from '../lib/fetch-provider.js';

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

// --- search provider ------------------------------------------------------
const blankOptions = () => ({ serverUrl: '', apiKeyEnvName: 'DEGOOG_API_KEY', resolveApiKey: async () => undefined, searchType: 'web', lang: '' });
const provider = new DegoogSearchProvider(blankOptions);
check('blank serverUrl unavailable', provider.available() === false);
await expectCode('search without serverUrl -> DEGOOG_SERVER_URL_MISSING', provider.search({ query: 'x' }), 'DEGOOG_SERVER_URL_MISSING');

const liveProvider = new DegoogSearchProvider(() => ({ ...blankOptions(), serverUrl: process.env.DEGOOG_URL ?? 'https://degoog.shaanlab.com' }));
check('live serverUrl available', liveProvider.available() === true);
const result = await liveProvider.search({ query: 'ripgrep tutorial' });
check('live search returns sources', Array.isArray(result.sources) && result.sources.length > 0, JSON.stringify(result).slice(0, 200));
const first = result.sources[0];
check('source has url', typeof first?.url === 'string' && first.url.startsWith('http'));
check('source has title', typeof first?.title === 'string' && first.title.length > 0);
console.log('     sample source:', JSON.stringify(first));

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

// --- fetch provider guard + live ------------------------------------------
const fetcher = new DegoogFetchProvider(blankOptions);
check('fetch always available', fetcher.available() === true);
await expectCode('fetch 127.0.0.1 blocked', fetcher.fetch({ url: 'http://127.0.0.1:9/x' }), 'DEGOOG_FETCH_BLOCKED_HOST');
await expectCode('fetch [::1] blocked', fetcher.fetch({ url: 'http://[::1]/x' }), 'DEGOOG_FETCH_BLOCKED_HOST');
await expectCode('fetch metadata IP blocked', fetcher.fetch({ url: 'http://169.254.169.254/latest/meta-data/' }), 'DEGOOG_FETCH_BLOCKED_HOST');
await expectCode('fetch ftp scheme rejected', fetcher.fetch({ url: 'ftp://example.com/x' }), 'DEGOOG_FETCH_INVALID_URL');

const ok = await fetcher.fetch({ url: 'https://example.com/' });
check('live https fetch status 200', ok.statusCode === 200, String(ok.statusCode));
check('live fetch classified html', ok.body.kind === 'html');
check('live fetch body contains Example Domain', ok.body.content.includes('Example Domain'));
check('live fetch final url', ok.url === 'https://example.com/');

// The instance resolves to a LAN IP from inside its home network, so the
// default guard must refuse it and the escape hatch must admit it.
await expectCode('LAN-hosted instance blocked by default', fetcher.fetch({ url: 'https://degoog.shaanlab.com/opensearch.xml' }), 'DEGOOG_FETCH_BLOCKED_HOST');
const lanOptions = () => ({ ...blankOptions(), allowPrivateAddresses: true });
const lanFetcher = new DegoogFetchProvider(lanOptions);
const textish = await lanFetcher.fetch({ url: 'https://degoog.shaanlab.com/opensearch.xml' });
check('LAN instance fetch with flag', textish.statusCode === 200 && textish.body.kind === 'text', JSON.stringify(textish).slice(0, 120));

// Redirect re-validation through a local hop that leaves to a public host.
const { createServer } = await import('node:http');
const server = createServer((req, res) => {
  res.writeHead(302, { location: 'https://example.com/' });
  res.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
try {
  const viaRedirect = await lanFetcher.fetch({ url: 'http://127.0.0.1:' + port + '/' });
  check('local->public redirect followed', viaRedirect.url.startsWith('https://example.com') && viaRedirect.statusCode === 200, viaRedirect.url);
} finally {
  server.close();
}

console.log(failures === 0 ? '\nALL PASS' : String(failures) + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
