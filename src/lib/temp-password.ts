import "server-only";
import { randomInt } from "node:crypto";

/**
 * Temporary passwords Sonet hands over by WhatsApp or reads down a phone line.
 *
 * There is no email provider (see CLAUDE.md), so this is the only account
 * recovery path. That shapes the alphabet: no 0/O, no 1/l/I — characters that
 * get misheard or mistyped turn a recovery into a support call.
 *
 * Uses randomInt (CSPRNG), not Math.random.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Four groups of four, e.g. "Kf7m-Rq2X-vTb9-Hn4P". 16 chars of entropy. */
export function generateTempPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}
