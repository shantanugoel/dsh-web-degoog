/**
 * dsh-web-degoog: register a degoog-backed search provider and an
 * SSRF-guarded direct fetch provider in `ctx.web`. Works with any degoog
 * instance; the instance URL (and optional API key) are configuration, so a
 * single published bundle serves every deployment.
 *
 * The search side calls the instance's native `/api/search`; the fetch side
 * never contacts the instance - it retrieves URLs directly from the harness
 * machine under the guard in ./fetch-provider.js.
 *
 * Configuration uses DSH's volatile Config references: every user-editable
 * field is read through `.get()` at operation time, so edits made on the
 * Plugins page apply without reloading or re-registering the providers.
 *
 * @module dsh-web-degoog
 */
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { DegoogSearchProvider } from './provider.js';
import { DegoogFetchProvider } from './fetch-provider.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-degoog';

/** The web seam this plugin's providers register into. */
export const inject = ['web'];

/** Default credential reference naming the instance API key. */
const DEFAULT_API_KEY_ENV = 'DEGOOG_API_KEY';

/** Environment variable naming the instance URL (launch-time fallback). */
const SERVER_URL_ENV = 'DEGOOG_SERVER_URL';

/**
 * Plugin config.
 *
 * Fields marked `.volatile()` are live configuration references on DSH 0.2.x:
 * the settings service projects them into a form, writes persist to the active
 * profile patch, and readers see the new value on the next operation without
 * restarting the plugin. `allowPrivateAddresses` is deliberately not volatile:
 * it is an operator escape hatch that belongs in the patch/launch environment,
 * not on the configuration page.
 *
 * `serverUrl` is deliberately blank by default: the instance is a deployment
 * choice. Until it is set the search provider reports unavailable so the web
 * seam can keep using another usable search provider; if this provider is
 * explicitly selected, a search fails with `DEGOOG_SERVER_URL_MISSING`.
 */
export const Config = z.object({
  serverUrl: z.string().default('').volatile(),
  apiKey: z.string().role('secret').volatile(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
  searchType: z.string().default('web').volatile(),
  lang: z.string().default('').volatile(),
  // Fetch-side SSRF escape hatch for LAN deployments: when true, the fetch
  // guard dials private/loopback addresses (e.g. scraping a self-hosted
  // internal wiki). Default false matches degoog-mcp's own behavior.
  allowPrivateAddresses: z.boolean().default(false),
});

/**
 * Read one Config field across DSH versions. DSH 0.2.x hands volatile fields
 * to `apply` as references carrying `.get()`; ordinary fields (and the plain
 * objects tests build) are read directly. Keeping the helper here means the
 * providers never care which shape the composition supplied.
 * @param config - the plugin's Config object.
 * @param key - field name.
 * @returns the current value, or undefined when the field is absent.
 */
function fieldValue(config, key) {
  const value = config?.[key];
  return value !== undefined && value !== null && typeof value.get === 'function'
    ? value.get()
    : value;
}

/**
 * Project a resolved config section into the options both providers serve
 * their next operation with. Environment fallbacks stay here rather than in
 * the providers: every value they read is fully defaulted.
 * @param ctx - plugin context.
 * @param config - currently authoritative section.
 */
function resolveOptions(ctx, config) {
  const apiKeyEnvName = fieldValue(config, 'apiKeyEnv') ?? DEFAULT_API_KEY_ENV;
  const apiKeyEnv = credentialRef(apiKeyEnvName);
  const rawApiKey = fieldValue(config, 'apiKey');
  const literalApiKey = typeof rawApiKey === 'string' && rawApiKey.length > 0 ? rawApiKey : undefined;
  const rawServerUrl = fieldValue(config, 'serverUrl');
  return {
    ...(literalApiKey === undefined ? {} : { apiKey: literalApiKey }),
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials');
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value;
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined;
    },
    apiKeyEnv,
    apiKeyEnvName,
    // Composition config wins, then the launch environment, then blank.
    serverUrl:
      (typeof rawServerUrl === 'string' && rawServerUrl.trim())
      || launchEnvironmentOf(ctx).get(SERVER_URL_ENV)?.value
      || '',
    searchType: fieldValue(config, 'searchType') ?? 'web',
    lang: fieldValue(config, 'lang') ?? '',
    allowPrivateAddresses: fieldValue(config, 'allowPrivateAddresses') === true,
  };
}

/** Register the degoog search and fetch providers with `ctx.web`. */
export function apply(ctx, config) {
  const options = () => resolveOptions(ctx, config);
  ctx.web.registerSearchProvider(new DegoogSearchProvider(options));
  ctx.web.registerFetchProvider(new DegoogFetchProvider(options));

  // This bundle ships its own Plugins-page row configuration, so tell the
  // settings service not to synthesize an automatic form for the same entry.
  // The child is optional: a composition without Settings keeps the providers.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
