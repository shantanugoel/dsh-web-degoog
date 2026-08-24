/**
 * IP address parsing and private-network classification for the degoog fetch
 * provider's SSRF guard. Pure functions; no DNS or network access.
 * @module dsh-web-degoog/ip
 */

/**
 * Parse a dotted-quad IPv4 string into 4 bytes.
 * @param {string} ip
 * @returns {number[] | null} the 4 bytes, or null when not valid IPv4.
 */
export function parseIpv4(ip) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (match === null) return null;
  const bytes = [];
  for (let index = 1; index <= 4; index += 1) {
    const value = Number(match[index]);
    if (!Number.isInteger(value) || value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

/** Group token marking an embedded-IPv4 tail expanded to these bytes. */
class Ipv4Tail {
  constructor(bytes) {
    this.bytes = bytes;
  }
}

/**
 * Parse an IPv6 string into 16 bytes, handling '::' compression and
 * embedded IPv4 tails ('::ffff:1.2.3.4', '::1.2.3.4').
 * @param {string} ip
 * @returns {number[] | null} the 16 bytes, or null when not valid IPv6.
 */
export function parseIpv6(ip) {
  if (!ip.includes(':')) return null;
  let body = ip;
  let tailBytes = null;
  const lastColon = ip.lastIndexOf(':');
  const v4 = parseIpv4(ip.slice(lastColon + 1));
  if (v4 !== null) {
    tailBytes = v4;
    // Replace the dotted tail with one placeholder group occupying one slot.
    body = ip.slice(0, lastColon + 1) + 'tailgroup';
  }
  if ((body.match(/::/gu) ?? []).length > 1) return null;
  const parseGroups = (part) => part.split(':').map((group) => {
    if (group === 'tailgroup') return new Ipv4Tail(tailBytes);
    if (/^[0-9a-fA-F]{1,4}$/u.test(group)) return parseInt(group, 16);
    return Number.NaN;
  });
  let groups;
  if (body.includes('::')) {
    const [left, right] = body.split('::');
    const l = left === '' ? [] : parseGroups(left);
    const r = right === '' ? [] : parseGroups(right);
    const all = [...l, ...r];
    if (all.some((g) => typeof g === 'number' && Number.isNaN(g))) return null;
    // An embedded IPv4 tail occupies two 16-bit slots while staying one
    // element, so compression fills by slot budget, not element count.
    const tailCount = all.reduce((sum, g) => sum + (g instanceof Ipv4Tail ? 1 : 0), 0);
    const fill = 8 - all.length - tailCount;
    if (fill < 0) return null;
    groups = [...l, ...Array.from({ length: fill }, () => 0), ...r];
  } else {
    groups = parseGroups(body);
    if (groups.some((g) => typeof g === 'number' && Number.isNaN(g))) return null;
  }
  // The authoritative validity invariant: exactly 16 assembled bytes.
  const bytes = [];
  for (const group of groups) {
    if (group instanceof Ipv4Tail) bytes.push(...group.bytes);
    else bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  if (bytes.length !== 16) return null;
  return bytes;
}

/**
 * Parse an IPv4 or IPv6 string into bytes.
 * @param {string} ip
 * @returns {{ family: 4 | 6, bytes: number[] } | null}
 */
export function parseIp(ip) {
  if (ip.includes(':')) {
    const bytes = parseIpv6(ip);
    return bytes === null ? null : { family: 6, bytes };
  }
  const bytes = parseIpv4(ip);
  return bytes === null ? null : { family: 4, bytes };
}

/** True when the byte is inside a blocked IPv4 range. */
function isBlockedIpv4(bytes) {
  const [a, b] = bytes;
  return (
    a === 0 || // 0.0.0.0/8 "this network"
    a === 10 || // 10.0.0.0/8 private
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (+ cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 192 && b === 0 && bytes[2] === 0) || // 192.0.0.0/24
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    a >= 224 // multicast (224/4) and reserved/broadcast (240/4)
  );
}

/** True when the byte is inside a blocked IPv6 range. */
function isBlockedIpv6(bytes) {
  const prefixIs = (...prefix) => prefix.every((byte, index) => bytes[index] === byte);
  if (bytes.every((byte) => byte === 0)) return true; // :: unspecified
  if (prefixIs(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)) return true; // ::1 loopback
  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (bytes[0] === 0xff) return true; // ff00::/8 multicast
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isBlockedIpv4(bytes.slice(12)); // ::ffff:a.b.c.d mapped IPv4
  }
  if (prefixIs(0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0)) {
    // 64:ff9b::/96 NAT64 - judge the translated IPv4 address itself.
    return isBlockedIpv4(bytes.slice(12));
  }
  return false;
}

/**
 * True when the address must not be dialed by the fetch guard.
 * Accepts any textual IPv4/IPv6 address (no brackets).
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateAddress(ip) {
  const parsed = parseIp(ip);
  if (parsed === null) return true; // unparseable -> refuse
  return parsed.family === 4 ? isBlockedIpv4(parsed.bytes) : isBlockedIpv6(parsed.bytes);
}
