/**
 * The degoog bundle's fetch provider: a direct, SSRF-guarded retriever that
 * feeds dsh-tool-web's web_fetch tool. degoog core has no scrape endpoint, so
 * retrieval happens from the harness machine; this module therefore owns the
 * protections DSH deliberately leaves to fetch providers: scheme allowlist,
 * pre-dial DNS resolution with private-range rejection (re-checked on every
 * redirect hop, pinned to the validated address), decompression-bomb-safe
 * streaming size caps, and content-type classification. HTML bodies are
 * returned as `kind: 'html'` — dsh-tool-web converts them to Markdown.
 *
 * @module dsh-web-degoog/fetch-provider
 */
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { WebError } from '@deepseek-ai/dsh-web';
import { isPrivateAddress, parseIp } from './ip.js';

/** Stable id this provider registers under. */
export const DEGOOG_FETCH_PROVIDER_ID = 'degoog';

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-degoog';

/** Decoded-body cap; further bytes are discarded and `truncated` is set. */
const MAX_BYTES = 2_000_000;

/** Redirect hops allowed before failing. */
const MAX_REDIRECTS = 5;

/** Idle time between bytes (or to first byte) before a hop gives up (ms). */
const STALL_TIMEOUT_MS = 30_000;

/** Distinct resolved addresses tried per hop before giving up. */
const MAX_ADDRESSES_TRIED = 3;

/** Internal marker: one validated address failed; another may be tried. */
class RetryAddressError extends Error {}

/** Build the provider's stable cancellation error. */
function abortedError(signal) {
  return new WebError('degoog fetch aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : undefined,
  });
}

/** Parse and scheme-check one hop's URL. */
function validateUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new WebError(`degoog fetch got an unparseable URL: ${raw}`, 'DEGOOG_FETCH_INVALID_URL', { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebError(`degoog fetch supports only http and https URLs, got ${url.protocol}`, 'DEGOOG_FETCH_INVALID_URL');
  }
  return url;
}

/** Throw the stable blocked-host error for one hostname. */
function blockedHost(hostname) {
  return new WebError(
    `degoog fetch refused ${hostname}: it resolves to a private, loopback, link-local, or otherwise non-public address`,
    'DEGOOG_FETCH_BLOCKED_HOST',
  );
}

/**
 * Resolve one hop to dialable, validated IP addresses. IP-literal hosts skip
 * DNS and are checked directly; names resolve through DNS and are rejected if
 * ANY resolved address is non-public (prevents mixed-record bypass).
 */
async function resolveAddresses(url, allowPrivate) {
  const bare = url.hostname.replace(/^\[/u, '').replace(/\]$/u, '');
  const literal = parseIp(bare);
  if (literal !== null) {
    if (!allowPrivate && isPrivateAddress(bare)) throw blockedHost(bare);
    return [{ address: bare, family: literal.family }];
  }
  let records;
  try {
    records = await dnsPromises.lookup(bare, { all: true, verbatim: true });
  } catch (error) {
    throw new WebError(`degoog fetch could not resolve ${bare}: ${String(error)}`, 'DEGOOG_FETCH_DNS_ERROR', { cause: error });
  }
  if (records.length === 0) {
    throw new WebError(`degoog fetch could not resolve ${bare}: no addresses returned`, 'DEGOOG_FETCH_DNS_ERROR');
  }
  if (!allowPrivate) {
    for (const record of records) {
      if (isPrivateAddress(record.address)) throw blockedHost(bare);
    }
  }
  return records.map((record) => ({ address: record.address, family: record.family }));
}

/**
 * Dial one hop pinned to a validated address and read the response head plus
 * a capped raw body. A custom `lookup` pins the connection to the validated
 * IP while Node keeps the Host header and TLS SNI bound to the hostname.
 */
async function connectAndRead(url, addresses, signal) {
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const port = url.port !== '' ? Number(url.port) : isHttps ? 443 : 80;
  const hostname = url.hostname.replace(/^\[/u, '').replace(/\]$/u, '');

  const attempt = (index) => new Promise((resolveAttempt, rejectAttempt) => {
    const target = addresses[index];
    const request = transport.request({
      hostname,
      port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      // Pin the socket to the pre-validated address (SSRF guard). Node may
      // call back in either shape depending on happy-eyeballs mode.
      lookup: (host, options, callback) => {
        if (options?.all === true) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
      headers: {
        host: url.host,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': USER_AGENT,
        connection: 'close',
      },
    });

    let settled = false;
    let stalled = false;
    let timer = null;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error === null) resolveAttempt(value);
      else rejectAttempt(error);
    };
    const armTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        request.destroy();
      }, STALL_TIMEOUT_MS);
    };
    const onAbort = () => {
      request.destroy();
    };

    if (signal !== undefined) {
      if (signal.aborted) {
        settle(abortedError(signal));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    request.on('error', (error) => {
      // A destroyed socket surfaces here; classify why it was destroyed.
      if (signal?.aborted === true) settle(abortedError(signal));
      else if (stalled) settle(new WebError(`degoog fetch timed out talking to ${url.host}`, 'DEGOOG_FETCH_TIMEOUT'));
      else if (index + 1 < Math.min(addresses.length, MAX_ADDRESSES_TRIED)) settle(new RetryAddressError(String(error)));
      else settle(new WebError(`degoog fetch request failed: ${String(error)}`, 'DEGOOG_FETCH_ERROR', { cause: error }));
    });

    armTimer();
    request.end();
    request.once('response', (response) => {
      const chunks = [];
      let received = 0;
      let truncated = false;
      const encoding = String(response.headers['content-encoding'] ?? '').trim().toLowerCase();
      let decoder = null;
      try {
        if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip();
        else if (encoding === 'deflate') decoder = zlib.createInflate();
        else if (encoding === 'br') decoder = zlib.createBrotliDecompress();
      } catch (error) {
        response.destroy();
        settle(new WebError(`degoog fetch got an unusable content-encoding '${encoding}': ${String(error)}`, 'DEGOOG_FETCH_ERROR', { cause: error }));
        return;
      }
      const sink = decoder ?? response;
      const source = decoder === null ? response : response.pipe(decoder);

      armTimer();
      sink.on('data', (chunk) => {
        armTimer();
        if (truncated || settled) return;
        received += chunk.length;
        if (received > MAX_BYTES) {
          truncated = true;
          chunks.push(chunk.subarray(0, chunk.length - (received - MAX_BYTES)));
          response.destroy();
          sink.destroy();
          settle(null, {
            statusCode: response.statusCode,
            headers: response.headers,
            raw: Buffer.concat(chunks),
            truncated,
          });
          return;
        }
        chunks.push(chunk);
      });
      sink.on('error', (error) => {
        if (settled) return;
        if (signal?.aborted === true) settle(abortedError(signal));
        else if (stalled) settle(new WebError(`degoog fetch timed out reading ${url.host}`, 'DEGOOG_FETCH_TIMEOUT'));
        else settle(new WebError(`degoog fetch failed while reading the body: ${String(error)}`, 'DEGOOG_FETCH_ERROR', { cause: error }));
      });
      source.on('error', () => {
        // Pipeline failures surface through sink 'error'; nothing extra.
      });
      sink.on('end', () => {
        settle(null, {
          statusCode: response.statusCode,
          headers: response.headers,
          raw: Buffer.concat(chunks),
          truncated,
        });
      });
    });
  });

  let lastRetry = null;
  const tries = Math.min(addresses.length, MAX_ADDRESSES_TRIED);
  for (let index = 0; index < tries; index += 1) {
    try {
      return await attempt(index);
    } catch (error) {
      if (!(error instanceof RetryAddressError)) throw error;
      lastRetry = error;
    }
  }
  throw new WebError(`degoog fetch could not reach ${url.host}: ${String(lastRetry)}`, 'DEGOOG_FETCH_ERROR', { cause: lastRetry });
}

/** True when a body looks like markup despite a missing content-type. */
function looksLikeHtml(text) {
  const head = text.slice(0, 512).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || /<[a-z][\s\S]*>/.test(head.slice(0, 256));
}

/** The provider. Config-independent: the guard travels with the code. */
export class DegoogFetchProvider {
  /** Options thunk kept for symmetry with the search provider. */
  #resolveOptions;

  id = DEGOOG_FETCH_PROVIDER_ID;

  constructor(resolveOptions) {
    this.#resolveOptions = resolveOptions;
  }

  /** Always usable: the guard is self-contained and needs no configuration. */
  available() {
    return true;
  }

  async fetch(request, signal) {
    let current = validateUrl(request.url);
    let response = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const addresses = await resolveAddresses(current, this.#resolveOptions().allowPrivateAddresses === true);
      response = await connectAndRead(current, addresses, signal);
      if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
      const location = response.headers.location;
      if (location === undefined) break;
      if (hop === MAX_REDIRECTS) {
        throw new WebError(`degoog fetch exceeded ${MAX_REDIRECTS} redirects starting at ${request.url}`, 'DEGOOG_FETCH_TOO_MANY_REDIRECTS');
      }
      current = validateUrl(new URL(location, current).href);
      response = null;
    }
    if (response === null) {
      throw new WebError(`degoog fetch got no usable response for ${request.url}`, 'DEGOOG_FETCH_ERROR');
    }

    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    const content = response.raw.toString('utf-8');
    if (/^(image|audio|video)\//.test(contentType) || contentType === 'application/octet-stream' || contentType === 'application/pdf') {
      throw new WebError(
        `degoog fetch does not support binary content types ('${contentType || 'unknown'}') for ${current.href}`,
        'DEGOOG_FETCH_UNSUPPORTED_CONTENT_TYPE',
      );
    }
    const kind = contentType.includes('text/html')
      || contentType.includes('application/xhtml')
      || (contentType === '' && looksLikeHtml(content))
      ? 'html'
      : 'text';
    return {
      url: current.href,
      statusCode: response.statusCode,
      body: { kind, content },
      truncated: response.truncated,
    };
  }
}
