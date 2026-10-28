import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

export type AuthResult = "ok" | "invalid" | "locked";

/** PIN check with a per-address lockout to prevent brute forcing from the LAN. */
export class PinAuth {
  readonly pin: string;
  private readonly digest: Buffer;
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(pin: string | null) {
    this.pin = pin ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.digest = sha256(this.pin);
  }

  check(candidate: unknown, ip: string): AuthResult {
    // A missing PIN is not an attempt and must not count towards the lockout.
    if (typeof candidate !== "string" || candidate === "") return "invalid";

    const now = Date.now();
    const entry = this.failures.get(ip);
    if (entry && entry.lockedUntil > now) return "locked";

    if (timingSafeEqual(sha256(candidate), this.digest)) {
      this.failures.delete(ip);
      return "ok";
    }

    const count = (entry && entry.lockedUntil === 0 ? entry.count : 0) + 1;
    this.failures.set(ip, {
      count: count >= MAX_FAILURES ? 0 : count,
      lockedUntil: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0,
    });
    return count >= MAX_FAILURES ? "locked" : "invalid";
  }
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
