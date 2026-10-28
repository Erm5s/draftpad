import { networkInterfaces } from "node:os";

export function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** True for loopback, RFC 1918, link-local and IPv6 unique-local addresses. */
export function isPrivateAddress(rawIp: string): boolean {
  const ip = normalizeIp(rawIp).toLowerCase();

  if (ip.includes(":")) {
    return ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
  }

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Private IPv4 addresses of this machine, used to print the phone URL. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface!.address)
    .filter((address) => isPrivateAddress(address) && !address.startsWith("169.254."))
    // Home routers almost always use 192.168.x.x; virtual adapters often use 172.x.
    .sort((a, b) => rank(a) - rank(b));
}

function rank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  return 2;
}
