/** Verbose logs, enabled with DRAFTPAD_DEBUG=1. */
export const DEBUG = /^(1|true|yes)$/i.test(process.env.DRAFTPAD_DEBUG ?? "");

export function debug(...args: unknown[]): void {
  if (DEBUG) console.log("[debug]", ...args);
}
