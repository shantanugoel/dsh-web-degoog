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

The search provider stays unavailable until `serverUrl` is set, and
`web_search` fails with a pointed error until then; the fetch provider works
out of the box.

## Install

One command, no manual editing:

```sh
dsh plugin --profile web add dsh-web-degoog
```

Because the package declares `dsh.bundle.patch`, the CLI reconciles the
profile's bundle stack automatically: the bundle joins the layer list on
add and leaves it on remove. The bundled patch selects `degoog` for both
web capabilities and turns `web_fetch` on (`fetch: true`).

### Configuring the instance URL

There is no auto-generated settings form for third-party bundles (the
Plugins page renders only cards a bundle explicitly ships), so pick one of
these:

1. **Launch environment** - zero files to edit. The harness reads
   `DEGOOG_SERVER_URL` at boot (the API key already rides `DEGOOG_API_KEY`):

   ```sh
   DEGOOG_SERVER_URL=https://degoog.example.com dsh --profile web
   ```

2. **Patch file** - survives restarts, hot-reloads on the running web
   profile. In `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - id: web-search-degoog
     config:
       serverUrl: https://degoog.example.com
   ```

### Configuring from the Web UI

The bundle ships a browser half: a **degoog search & fetch** card under
**Settings -> Plugins** (the configurable tab), with fields for the
instance URL, API-key credential name, search type, and language. Edits
stage locally and commit through the revision-fenced settings write path;
each field shows an override marker with one-click reset to its
downstream default.

Value precedence, highest first:

1. Settings-page card (the user settings document)
2. Profile patch entry config (`cordis.patch.yml`)
3. Launch environment (`DEGOOG_SERVER_URL`, `DEGOOG_API_KEY`)
4. Built-in defaults (blank URL keeps search unconfigured)

### Configuring without the UI

Both non-UI paths remain fully supported:

### Sessions on web profiles: one-time preset pick

On web profiles the per-session tool set comes from **agent presets**, and
the shipped ones pin `web_fetch` off. On activation this bundle
self-installs a ready-made preset, id `degoog-standard`, into
`~/.agent-presets/` - the upstream `standard` composition with exactly one
diff (`tool-web.fetch: true`). Pick it once in the UI's preset picker (or
make it your default there). The sync never overwrites a preset you have
edited, and headless-style profiles that mount the host-level `tool-web`
entry need nothing extra.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `serverUrl` | `''` | Base URL of any degoog instance. Blank = search unconfigured. |
| `apiKey` | - | Literal instance API key. Prefer `apiKeyEnv` so no secret lands in config files. |
| `apiKeyEnv` | `DEGOOG_API_KEY` | Credential reference resolved per search from the credentials service or launching environment. Sent as `Authorization: Bearer ...` only when resolvable. |
| `searchType` | `web` | Passed as degoog's `type` parameter (`web`, `images`, ... depending on installed engines). |
| `lang` | `''` | Optional language code passed as degoog's `lang` parameter. |
| `allowPrivateAddresses` | `false` | Fetch-side escape hatch for LAN deployments: when `true`, the guard dials private/loopback addresses so a homelab instance next to internal sites can scrape them. Default `false` matches degoog-mcp. |

Search errors use stable codes: `DEGOOG_SERVER_URL_MISSING`,
`WEB_PROVIDER_CREDENTIAL_MISSING` (401/403 without a key),
`WEB_PROVIDER_ERROR`, `WEB_ABORTED`.

## Security notes

- The fetch guard allows only `http`/`https`, resolves DNS before dialing,
  rejects hosts resolving to loopback/private/link-local/CGNAT/multicast/
  NAT64 addresses (including IP-literal URLs), pins each connection to a
  validated address while keeping TLS SNI and the Host header bound to the
  hostname, re-checks every redirect hop (max 5), caps decoded bodies at
  2 MB (`truncated` flag set), refuses binary content types, and applies a
  30 s stall timeout per hop.
- Enabling `fetch: true` means the model chooses request targets by design.
  That is exactly what DSH's shipped config declines to do for you;
  installing this bundle is the explicit opt-in.
- Search requests go to whatever instance you configure; send its API key
  only over HTTPS.

## Uninstall / switch back

```sh
dsh plugin --profile web remove dsh-web-degoog
```

The bundle layer leaves the stack automatically; DeepSeek's official search
provider stays registered and becomes selectable again via
`DSH_WEB_SEARCH_PROVIDER=deepseek-official` or a `web.searchProvider`
override in your user patch layer.

## License

MIT
