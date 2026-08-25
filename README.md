# dsh-web-degoog

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle that
backs the harness's native `web_search` and `web_fetch` tools with any
[self-hosted degoog](https://github.com/degoog-org/degoog) instance. The
instance URL and API key are configuration - one published package serves
every deployment.

## What it provides

| Provider id | Capability | Backing |
|---|---|---|
| `degoog` | `web_search` | Your degoog instance's native `GET /api/search` (merged, scored, deduplicated results across its engines). Optional bearer-token auth for protected instances. |
| `degoog` | `web_fetch` | **Direct** retrieval from the harness machine under an SSRF guard (below). degoog core has no scrape endpoint, so this side never contacts your instance. HTML returns as `kind: 'html'`; dsh-tool-web converts it to Markdown. |

Installing the bundle **registers** both providers. It does **not** select them
and does **not** turn `web_fetch` on. Until you opt in (below), DeepSeek
official search keeps working: an unconfigured degoog search provider reports
unavailable, so the web seam auto-selects the remaining usable provider.

## Install

```sh
dsh plugin --profile web add dsh-web-degoog
```

Because the package declares `dsh.bundle.patch`, the CLI reconciles the
profile's bundle stack automatically: the bundle joins the layer list on
add and leaves it on remove. The bundled patch only inserts the
`web-search-degoog` plugin row.

### 1. Configure the instance URL

There is no auto-generated settings form for third-party bundles (the
Plugins page renders only cards a bundle explicitly ships), so pick one of
these:

1. **Settings UI** - **Settings -> Plugins -> Plugin configuration**, the
   **degoog search & fetch** card: instance URL, API-key credential name,
   search type, and language. Edits stage locally and commit through the
   revision-fenced settings write path; each field shows an override marker
   with one-click reset to its downstream default.

2. **Launch environment** - zero files to edit. The harness reads
   `DEGOOG_SERVER_URL` at boot (the API key already rides `DEGOOG_API_KEY`):

   ```sh
   DEGOOG_SERVER_URL=https://degoog.example.com dsh --profile web
   ```

3. **Patch file** - survives restarts, hot-reloads on the running web
   profile. In `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - id: web-search-degoog
     config:
       serverUrl: https://degoog.example.com
   ```

Value precedence, highest first:

1. Settings-page card (the user settings document)
2. Profile patch entry config (`cordis.patch.yml`)
3. Launch environment (`DEGOOG_SERVER_URL`, `DEGOOG_API_KEY`)
4. Built-in defaults (blank URL keeps search unconfigured)

### 2. Select degoog for search (and fetch, if more than one fetch provider)

The web seam auto-selects only when exactly one usable provider is registered.
After `serverUrl` is set, DeepSeek official search is still usable, so you
must pick degoog explicitly:

```sh
DSH_WEB_SEARCH_PROVIDER=degoog DSH_WEB_FETCH_PROVIDER=degoog dsh --profile web
```

Or in `~/.dsh/profiles/web/cordis.patch.yml` (this layer wins over the
bundle):

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: degoog
    fetchProvider: degoog
```

Stock dsh ships no fetch provider, so `fetchProvider` is optional until
another fetch plugin is installed.

### 3. Enable `web_fetch` in your agent preset

On web profiles the host `tool-web` row is disabled; each session takes
`web_search` / `web_fetch` from its **agent preset**. Shipped presets pin
`fetch: false`, and a bundle cannot patch a preset file. Duplicate a shipped
preset and flip the flag:

1. **Settings -> Agent presets -> Duplicate** Standard (or edit an existing
   custom preset).
2. In that copy's `agent.cordis.yml`, set:

   ```yaml
   - id: tool-web
     name: '@deepseek-ai/dsh-tool-web'
     config:
       fetch: true
       searchTimeoutMs: 60000
   ```

3. Pick that preset for new sessions (or make it the default). Sessions that
   already ran stay on the preset they started with.

Headless/TUI profiles that still mount host-plane `tool-web` can set the same
`fetch: true` on the host `tool-web` row in the profile patch instead.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `serverUrl` | `''` | Base URL of any degoog instance. Blank = search unconfigured. |
| `apiKey` | - | Literal instance API key. Prefer `apiKeyEnv` so no secret lands in config files. |
| `apiKeyEnv` | `DEGOOG_API_KEY` | Credential reference resolved per search from the credentials service or launching environment. Sent as `Authorization: Bearer ...` only when resolvable. |
| `searchType` | `web` | Passed as degoog's `type` parameter (`web`, `images`, ... depending on installed engines). |
| `lang` | `''` | Optional language code passed as degoog's `lang` parameter. |
| `allowPrivateAddresses` | `false` | Fetch-side escape hatch for LAN deployments: when `true`, the guard dials private/loopback addresses so a homelab instance next to internal sites can scrape them. Default `false` matches degoog-mcp. Not shown in the UI. |

Search errors use stable codes: `DEGOOG_SERVER_URL_MISSING`,
`WEB_PROVIDER_CREDENTIAL_MISSING` (401/403 without a key),
`WEB_PROVIDER_ERROR`, `WEB_ABORTED`.

## Security notes

- The fetch guard allows only `http`/`https`, rejects embedded credentials
  and over-long URLs, resolves DNS before dialing, rejects hosts resolving to
  loopback/private/link-local/CGNAT/multicast/NAT64/IPv4-compatible/6to4
  addresses (including IP-literal URLs), pins each connection to a validated
  address while keeping TLS SNI and the Host header bound to the hostname,
  re-checks every redirect hop (max 5), caps decoded bodies at 2 MB
  (`truncated` flag set), refuses binary content types, applies a 30 s stall
  timeout per hop, and a 60 s overall backstop.
- Enabling `fetch: true` means the model chooses request targets by design.
  That is exactly what DSH's shipped presets decline to do for you;
  flipping the flag in a preset you own is the explicit opt-in.
- Search requests go to whatever instance you configure; send its API key
  only over HTTPS.

## Uninstall / switch back

```sh
dsh plugin --profile web remove dsh-web-degoog
```

The bundle layer leaves the stack automatically. DeepSeek's official search
provider stays registered. If you opted in with `DSH_WEB_SEARCH_PROVIDER` or
a user-layer `web.searchProvider: degoog`, remove that override too.

This package does not write agent presets or delete leftover files. If an
older release created `~/.dsh/.agent-presets/degoog-standard`, switch the
default preset away from it (**Settings -> Agent presets**) and delete that
folder. You can also drop the `web-search-degoog:` section from
`~/.dsh/settings.yaml` if you no longer want the saved instance URL.

## License

MIT
