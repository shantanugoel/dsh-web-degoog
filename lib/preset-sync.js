/**
 * Best-effort self-installation of the bundled "degoog-standard" agent
 * preset into the harness home's user preset root. Sessions pick their tool
 * set from agent presets, and the shipped ones pin web_fetch off; syncing
 * this preset gives every deployment a ready-made composition with fetch
 * enabled, selectable in the UI without any file editing.
 *
 * The sync is conservative: it writes only when the destination is absent
 * or still byte-identical to what a previous run of THIS module wrote (the
 * marker file records that content's hash). A preset the user has edited,
 * or any foreign directory occupying the id, is left untouched.
 *
 * @module dsh-web-degoog/preset-sync
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';

/** Preset id = directory name under the user root. Must match [a-z0-9][a-z0-9-]*. */
export const PRESET_ID = 'degoog-standard';

/** Marker file recording the hash of the content we last wrote. */
const MARKER = '.dsh-web-degoog-managed';

function bundledText(name) {
  return readFileSync(new URL(`../agent-presets/${PRESET_ID}/${name}`, import.meta.url), 'utf8');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Sync one bundled file into the preset directory under the managed-marker
 * policy. Returns true when anything was written.
 */
function syncFile(dir, name, bundled) {
  const dest = join(dir, name);
  const markerPath = join(dir, MARKER);
  let lastWrittenHash = null;
  try {
    lastWrittenHash = readFileSync(markerPath, 'utf8').trim();
  } catch {
    // no marker yet
  }
  let current = null;
  try {
    current = readFileSync(dest, 'utf8');
  } catch {
    // absent
  }
  if (current !== null && current === bundled) {
    // Already up to date; keep the marker fresh anyway.
    const fresh = sha256(bundled);
    if (lastWrittenHash !== fresh) writeFileSync(markerPath, fresh + String.fromCharCode(10));
    return false;
  }
  if (current !== null && !(lastWrittenHash !== null && lastWrittenHash === sha256(current))) {
    // Present but not ours-last: user-edited or foreign. Never clobber.
    return false;
  }
  writeFileSync(dest, bundled);
  writeFileSync(markerPath, sha256(bundled) + String.fromCharCode(10));
  return current === null ? 'created' : 'updated';
}

/**
 * Sync both preset files. Never throws: preset installation must not break
 * plugin activation, so failures land on stderr as warnings.
 * @returns {'created' | 'updated' | 'current' | 'skipped' | 'failed'} outcome.
 */
export function syncBundledPreset() {
  try {
    const dir = join(dshHomePath('.agent-presets'), PRESET_ID);
    mkdirSync(dir, { recursive: true });
    const composition = bundledText('agent.cordis.yml');
    const meta = bundledText('preset.yml');
    let touched = false;
    let created = false;
    for (const [name, text] of [['agent.cordis.yml', composition], ['preset.yml', meta]]) {
      const outcome = syncFile(dir, name, text);
      if (outcome === 'created') created = true;
      if (outcome !== false) touched = true;
    }
    return created ? 'created' : touched ? 'updated' : 'current';
  } catch (error) {
    console.error('[dsh-web-degoog] preset sync failed (continuing):', String(error));
    return 'failed';
  }
}
