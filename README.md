# dsh-web-degoog

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle that
backs the harness's native `web_search` and `web_fetch` tools with any
[self-hosted degoog](https://github.com/degoog-org/degoog) instance. The
instance URL and API key are configuration - one published package serves
every deployment.

This release targets **DSH 0.2.2-rc.1** (the current `next` release) and its
volatile-config / Plugins-page configuration model. For the older 0.1.x
settings model, use the 0.3.1 release of this package.

## What it provides

| Provider id | Capability | Backing |
|---|---|---|
| `degoog` | `web_search` | Your degoog instance's native `GET /api/search` (merged, scored, deduplicated results across its engines). Optional bearer-token auth for protected instances. |
| `degoog` | `web_fetch` | **Direct** retrieval from the harness machine under an SSRF guard (below). degoog core has no scrape endpoint, so this side never contacts your instance. HTML returns as `kind: 'html'`; dsh-tool-web converts it to Markdown. |

Installing the bundle registers both providers **and selects them**. Set the
instance URL on the plugin's own Plugins page. `web_fetch` is enabled by the
shipped Standard, PTC, and Cordis agent presets; a custom preset that disables
it will not offer the tool.

## Install

```sh
dsh plugin --profile web add dsh-web-degoog
```

Then set the instance URL. Either:

1. **Plugins page** - open **Plugins** in the sidebar, expand
   **dsh-web-degoog** under **Installed plugins**, open the
   **web-search-degoog** row, and choose **Configure**. The page edits the live
   profile entry; **Save** applies to the next search or fetch without a
   restart.
2. **Launch environment** - zero files to edit. The harness reads
   `DEGOOG_SERVER_URL` at boot (the API key already rides `DEGOOG_API_KEY`):

   ```sh
   DEGOOG_SERVER_URL=https://degoog.example.com dsh --profile web
   ```

3. **Patch file** - survives restarts and hot-reloads on the running web
   profile. In `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - id: web-search-degoog
     config:
       serverUrl: https://degoog.example.com
   ```

Because the package declares `dsh.bundle.patch`, the CLI reconciles the
profile's bundle stack automatically: the bundle joins the layer list on add
and leaves it on remove. The bundled patch inserts this plugin and sets
`web.searchProvider` / `web.fetchProvider` to `degoog`.

`@deepseek-ai/dsh-web` has no configuration page of its own for third-party
providers, so selecting degoog in the bundle patch is the supported
zero-file-edit path. A later user patch or `$DSH_WEB_SEARCH_PROVIDER` still
wins if you need to switch back without uninstalling.

### Configure the instance URL

Value precedence, highest first:

1. The profile entry written by the **Configure** page (the active profile's
   patch layer)
2. The bundle patch entry in this package
3. Launch environment (`DEGOOG_SERVER_URL`, `DEGOOG_API_KEY`)
4. Built-in defaults (blank URL keeps search unconfigured)

The configuration fields are **volatile** on DSH 0.2.x: the provider reads them
at operation time, so a saved change applies without reloading or re-registering
the provider. Writes are revision-fenced by the settings service, and each field
shows an override marker with one-click reset to its downstream value.

### `web_fetch` and agent presets

On web profiles the host `tool-web` row is disabled; each session takes
`web_search` / `web_fetch` from its **agent preset**. The shipped Standard,
PTC, and Cordis presets already set `fetch: true`. A custom preset or the
Minimal preset may not include the web tools at all. If you duplicate a preset
that disables fetch, set:

```yaml
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: true
    searchTimeoutMs: 60000
```

Sessions that already ran stay on the preset they started with. A bundle cannot
patch a shipped preset, so edit a copy you own.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `serverUrl` | `''` | Base URL of any degoog instance. Blank = search unconfigured; a selected degoog search then fails with `DEGOOG_SERVER_URL_MISSING`. |
| `apiKey` | - | Literal instance API key. Prefer `apiKeyEnv` so no secret lands in config files. Not shown on the Configure page; put it in the patch only when necessary. |
| `apiKeyEnv` | `DEGOOG_API_KEY` | Credential reference resolved per search from the credentials service or the launching environment. Sent as `Authorization: Bearer ...` only when resolvable. |
| `searchType` | `web` | Passed as degoog's `type` parameter (`web`, `images`, ... depending on installed engines). |
| `lang` | `''` | Optional language code passed as degoog's `lang` parameter. |
| `allowPrivateAddresses` | `false` | Fetch-side escape hatch for LAN deployments: when `true`, the guard dials private/loopback addresses so a homelab instance next to internal sites can scrape them. Not shown on the Configure page; set it in the patch. |

Search errors use stable codes: `DEGOOG_SERVER_URL_MISSING`,
`WEB_PROVIDER_CREDENTIAL_MISSING` (401/403 without a key),
`WEB_PROVIDER_ERROR`, `WEB_ABORTED`. While `serverUrl` is blank the
provider reports unavailable, so an unselected deployment can keep using
another search provider; if this bundle's patch still selects `degoog`, the
tool is offered and the first search fails with `DEGOOG_SERVER_URL_MISSING`.

## Security notes

- The fetch guard allows only `http`/`https`, rejects embedded credentials
  and over-long URLs, resolves DNS before dialing, rejects hosts resolving to
  loopback/private/link-local/CGNAT/multicast/NAT64/IPv4-compatible/6to4
  addresses (including IP-literal URLs), pins each connection to a validated
  address while keeping TLS SNI and the Host header bound to the hostname,
  re-checks every redirect hop (max 5), caps decoded bodies at 2 MB
  (`truncated` flag set), refuses binary content types, applies a 30 s stall
  timeout per hop, and a 60 s overall backstop.
- `web_fetch` lets the model choose request targets by design. The shipped
  Standard, PTC, and Cordis presets enable it; if your policy does not allow
  that, use or author a preset with `fetch: false`.
- Search requests go to whatever instance you configure; send its API key
  only over HTTPS.

## Uninstall / switch back

```sh
dsh plugin --profile web remove dsh-web-degoog
```

The bundle layer leaves the stack automatically, including the degoog
provider selection, so DeepSeek official search is selectable again.

This package does not write agent presets or delete leftover files. If an
older release created `~/.dsh/.agent-presets/degoog-standard`, switch the
default preset away from it (**Settings -> Agent presets**) and delete that
folder. You can also drop a leftover `web-search-degoog:` section from
`~/.dsh/settings.yaml` if you no longer want the saved instance URL; DSH
0.2.x imports and renames that legacy file on first start.

## Development

```sh
pnpm install
pnpm test          # guard, search, fetch, and volatile-config integration
pnpm test:client   # browser factory + Plugins-page slot registration
```

The tests run against local HTTP servers and need no internet access. Set
`DEGOOG_LIVE=1` to add the opt-in checks that reach example.com and the
author's degoog instance.

## License

MIT
