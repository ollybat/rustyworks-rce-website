import net from "node:net";

const NON_PUBLIC_IPV4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4Number(address) {
  return address.split(".").reduce((value, part) => ((value * 256) + Number(part)) >>> 0, 0);
}

function inIpv4Range(address, network, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function ipv6Groups(address) {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.map((part) => parseInt(part, 16));
}

/**
 * Only globally routable unicast addresses are accepted for outbound RCON.
 * This deliberately rejects special-use and documentation ranges as well as
 * private, loopback, link-local, multicast and transition addresses.
 */
export function isPublicAddress(address) {
  const value = String(address || "").trim().toLowerCase();
  if (net.isIPv4(value)) {
    return !NON_PUBLIC_IPV4.some(([network, bits]) => inIpv4Range(value, network, bits));
  }
  if (!net.isIPv6(value) || value.includes(".")) return false;

  const groups = ipv6Groups(value);
  if (!groups) return false;
  const first = groups[0];
  const second = groups[1];

  // Global unicast is 2000::/3. This excludes unspecified, loopback,
  // unique-local, link-local, multicast and IPv4-mapped addresses.
  if (first < 0x2000 || first > 0x3fff) return false;

  // Documentation (2001:db8::/32), Teredo (2001:0::/32), and 6to4
  // (2002::/16) are not accepted as direct public RCON destinations.
  if (first === 0x2001 && (second === 0x0 || second === 0x0db8 || second === 0x10 || second === 0x20)) return false;
  if (first === 0x2002) return false;
  if (first === 0x3fff && second < 0x1000) return false;
  return true;
}

/** Validate the user-supplied host before DNS lookup. The resolved address is
 * checked separately with isPublicAddress and the socket connects to that exact IP. */
export function rconHostAllowed(host) {
  const value = String(host || "").trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 200) return false;
  if (value === "localhost" || value.endsWith(".local") || value.endsWith(".internal")) return false;
  if (net.isIP(value)) return isPublicAddress(value);
  if (/^\d+(?:\.\d+){3}$/.test(value)) return isPublicAddress(value);

  const labels = value.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return false;
  return true;
}
