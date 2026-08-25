import bcrypt from "bcryptjs";

/**
 * Cost 12: ~250ms per hash on this class of hardware. Slow enough to make an
 * offline attack on a leaked hash expensive, fast enough that a login does not
 * feel broken.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  if (plain.length < 10) throw new Error("Password must be at least 10 characters");
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
