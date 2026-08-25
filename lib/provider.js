/**
 * The degoog-backed search provider. Calls any degoog instance's native
 * `/api/search` endpoint and maps its merged, scored, deduplicated results
 * into the harness's normalized search shape. Authentication uses the
 * instance's API key as a bearer token; instances with search-route
 * protection off need no key at all.
 *
 * @module dsh-web-degoog/provider
 */
import { WebError } from '@deepseek-ai/dsh-web';

/** Stable id this provider registers under. */
export const DEGOOG_PROVIDER_ID = 'degoog';

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-degoog';

/** Throw the provider's stable cancellation error. */
function abortedError(signal) {
  return new WebError('degoog search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : undefined,
  });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Map one degoog response to the normalized search result.
 * degoog already merges, scores, and deduplicates across engines; we still
 * dedupe by URL defensively and skip rows without a usable URL.
 */
export function mapDegoogResponse(payload) {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.results)) {
    // A 200 body without a results array means instance/version skew (or an
    // in-band error); failing loud beats silently returning zero sources.
    const detail = typeof payload?.error === 'string' && payload.error.length > 0
      ? payload.error
      : undefined;
    const keys = payload !== null && typeof payload === 'object'
      ? Object.keys(payload).join(', ') || '(empty object)'
      : String(payload);
    throw new WebError(
      detail !== undefined
        ? `degoog instance reported a search error: ${detail}`
        : `degoog response has no "results" array (top-level keys: ${keys}); the instance may be running an incompatible degoog version`,
      'DEGOOG_UNEXPECTED_RESPONSE',
    );
  }
  const seen = new Set();
  const sources = [];
  for (const result of payload?.results ?? []) {
    const url = typeof result?.url === 'string' ? result.url : '';
    if (url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    const snippet = typeof result.snippet === 'string' && result.snippet.length > 0
      ? result.snippet
      : typeof result.content === 'string' && result.content.length > 0
        ? result.content
        : undefined;
    sources.push({
      url,
      ...(typeof result.title === 'string' && result.title.length > 0 ? { title: result.title } : {}),
      ...(snippet !== undefined ? { snippet } : {}),
    });
  }
  // The web seam owns final maxResults truncation.
  return { sources, truncated: false };
}

/** The degoog-backed search provider; selection config lives in ctx.web. */
export class DegoogSearchProvider {
  #resolveOptions;

  id = DEGOOG_PROVIDER_ID;

  /**
   * @param resolveOptions - options for the NEXT operation, snapshotted at
   * each operation's entry so settings changes apply without re-registering.
   */
  constructor(resolveOptions) {
    this.#resolveOptions = resolveOptions;
  }

  /** Cheap local usability check: needs an http(s) serverUrl. */
  available() {
    const options = this.#resolveOptions();
    if (options.serverUrl.length === 0 || !URL.canParse(options.serverUrl)) return false;
    try {
      const protocol = new URL(options.serverUrl).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  async search(request, signal) {
    const options = this.#resolveOptions();
    if (!this.available()) {
      throw new WebError(
        'degoog search has no server URL configured yet. Set "serverUrl" to your degoog instance '
          + '(for example https://degoog.example.com) in Settings -> web-search-degoog, or in the '
          + 'web-search-degoog entry of your profile patch.',
        'DEGOOG_SERVER_URL_MISSING',
      );
    }
    if (signal?.aborted === true) throw abortedError(signal);

    const base = options.serverUrl.replace(/\/+$/u, '');
    const endpoint = new URL(`${base}/api/search`);
    endpoint.searchParams.set('q', request.query);
    if (options.searchType.length > 0) endpoint.searchParams.set('type', options.searchType);
    if (options.lang.length > 0) endpoint.searchParams.set('lang', options.lang);

    const apiKey = await this.apiKey(options, signal);
    if (signal?.aborted === true) throw abortedError(signal);

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }),
        },
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw abortedError(signal);
      throw new WebError(`degoog search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
    }

    if (!response.ok) {
      let message = `degoog instance returned HTTP ${response.status}`;
      try {
        const parsed = await response.json();
        const detail = typeof parsed?.error === 'string' ? parsed.error : undefined;
        if (detail !== undefined && detail.length > 0) message = detail;
      } catch {
        // keep the status-only message
      }
      if ((response.status === 401 || response.status === 403) && apiKey === undefined) {
        const envName = options.apiKeyEnvName ?? 'DEGOOG_API_KEY';
        const hint = `${envName} credential (credentials service or launching environment) or a literal "apiKey" in the web-search-degoog config`;
        throw new WebError(
          `${message}: this degoog instance protects its search routes. Provide the instance API key via the ${hint}`,
          'WEB_PROVIDER_CREDENTIAL_MISSING',
        );
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR');
    }

    try {
      return mapDegoogResponse(await response.json());
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw abortedError(signal);
      if (error instanceof WebError) throw error;
      throw new WebError(`degoog returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
    }
  }

  /**
   * Resolve one operation's credential without retaining it. The key is
   * OPTIONAL: only protected instances require one, so absence is not an
   * error here (a later 401 surfaces the actionable message).
   */
  async apiKey(options, signal) {
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey;
    if (signal?.aborted === true) throw abortedError(signal);
    try {
      const resolved = await options.resolveApiKey();
      return resolved !== undefined && resolved.length > 0 ? resolved : undefined;
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw abortedError(signal);
      throw new WebError(`degoog search credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_CREDENTIAL_MISSING', { cause: error });
    }
  }
}
