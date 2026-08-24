/**
 * dsh-web-degoog: register a degoog-backed search provider and an
 * SSRF-guarded direct fetch provider in `ctx.web`. Works with any degoog
 * instance; the instance URL (and optional API key) are configuration, so a
 * single published bundle serves every deployment.
 *
 * The search side calls the instance's native `/api/search`; the fetch side
 * never contacts the instance — it retrieves URLs directly from the harness
 * machine under the guard in ./fetch-provider.js.
 *
 * @module dsh-web-degoog
 */
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { DegoogSearchProvider } from './provider.js';
import { DegoogFetchProvider } from './fetch-provider.js';
import { syncBundledPreset } from './preset-sync.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-degoog';

/** The web seam this plugin's providers register into. */
export const inject = ['web'];

/** Default credential reference naming the instance API key. */
const DEFAULT_API_KEY_ENV = 'DEGOOG_API_KEY';

/** Settings namespace carrying this plugin's server, key, and query defaults. */
export const DEGOOG_SETTINGS_NAMESPACE = settingsNamespace('web-search-degoog');

/**
 * Plugin config (all optional — `apply` fills defaults).
 *
 * `serverUrl` is deliberately blank by default: the instance is a deployment
 * choice. Until it is set the search provider reports unavailable and
 * `web_search` fails with `DEGOOG_SERVER_URL_MISSING` pointing at this
 * setting; the fetch provider needs no configuration at all.
 */
export const Config = z.object({
  serverUrl: z.string().default(''),
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  searchType: z.string().default('web'),
  lang: z.string().default(''),
  // Fetch-side SSRF escape hatch for LAN deployments: when true, the fetch
  // guard dials private/loopback addresses (e.g. scraping a self-hosted
  // internal wiki). Default false matches degoog-mcp's own behavior.
  allowPrivateAddresses: z.boolean().default(false),
});

/**
 * Project one resolved config section into the options both providers serve
 * their next operation with. Environment fallbacks stay here rather than in
 * the providers: every value they read is fully defaulted.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {Partial<Config>} config - currently authoritative section.
 */
function resolveOptions(ctx, config) {
  const apiKeyEnvName = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const apiKeyEnv = credentialRef(apiKeyEnvName);
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined;
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
    serverUrl: typeof config.serverUrl === 'string' ? config.serverUrl.trim() : '',
    searchType: config.searchType ?? 'web',
    lang: config.lang ?? '',
    allowPrivateAddresses: config.allowPrivateAddresses === true,
  };
}

/** Register the degoog search and fetch providers with `ctx.web`. */
export function apply(ctx, config) {
  let current = () => config;
  installSettingsSection(ctx, DEGOOG_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {},
  });
  ctx.web.registerSearchProvider(new DegoogSearchProvider(() => resolveOptions(ctx, current())));
  ctx.web.registerFetchProvider(new DegoogFetchProvider(() => resolveOptions(ctx, current())));
  // Best-effort: land the fetch-enabled agent preset where sessions can pick
  // it. Must never break plugin activation.
  syncBundledPreset();
}
