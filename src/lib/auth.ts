import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { verifyPassword, hashPassword } from "./password";

/**
 * Session handling for the two audiences this portal has: the single admin
 * (Sonet) and approved agents.
 *
 * They are deliberately separate cookies with a separate `aud` claim, so an
 * agent token can never satisfy an admin check even if something downstream
 * forgets to look at the role.
 */

const ADMIN_COOKIE = "st_admin_session";
const AGENT_COOKIE = "st_agent_session";
const SESSION_HOURS = 12;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters — see .env.example");
  }
  return new TextEncoder().encode(s);
}

type Audience = "admin" | "agent";

export type SessionPayload = { sub: string; aud: Audience; email: string };

async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setAudience(payload.aud)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

async function read(audience: Audience): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(audience === "admin" ? ADMIN_COOKIE : AGENT_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { audience });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { sub: payload.sub, aud: audience, email: payload.email };
  } catch {
    // Expired, tampered, or signed with a rotated secret — all mean "logged out".
    return null;
  }
}

async function setCookie(audience: Audience, token: string) {
  const jar = await cookies();
  jar.set(audience === "admin" ? ADMIN_COOKIE : AGENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function clearSession(audience: Audience) {
  const jar = await cookies();
  jar.delete(audience === "admin" ? ADMIN_COOKIE : AGENT_COOKIE);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Deliberately vague on failure — never reveal whether the email exists. */
const BAD_CREDENTIALS = "Email or password is incorrect.";

export async function loginAdmin(email: string, password: string): Promise<LoginResult> {
  const admin = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!admin) return { ok: false, error: BAD_CREDENTIALS };

  if (!(await verifyPassword(password, admin.passwordHash))) {
    return { ok: false, error: BAD_CREDENTIALS };
  }

  await setCookie("admin", await sign({ sub: admin.id, aud: "admin", email: admin.email }));
  return { ok: true };
}

export function getAdminSession() {
  return read("admin");
}

/**
 * Loads the admin row, confirming the session still corresponds to a real user.
 * Returns null rather than throwing so callers can redirect.
 */
export async function getAdminUser() {
  const session = await read("admin");
  if (!session) return null;
  return prisma.adminUser.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, mustChangePassword: true },
  });
}

// ---------------------------------------------------------------------------
// Agent (used from Phase 3 onward)
// ---------------------------------------------------------------------------

export async function loginAgent(email: string, password: string): Promise<LoginResult> {
  const agent = await prisma.agent.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!agent) return { ok: false, error: BAD_CREDENTIALS };

  if (!(await verifyPassword(password, agent.passwordHash))) {
    return { ok: false, error: BAD_CREDENTIALS };
  }

  // The approval gate. Checked after the password so a wrong password on a
  // pending account still reports a credentials failure, not account status.
  if (agent.status === "pending") {
    return { ok: false, error: "Your registration is still awaiting approval." };
  }
  if (agent.status === "rejected") {
    return { ok: false, error: "This registration was not approved. Please contact Series Tours." };
  }

  await prisma.agent.update({ where: { id: agent.id }, data: { lastLoginAt: new Date() } });
  await setCookie("agent", await sign({ sub: agent.id, aud: "agent", email: agent.email }));
  return { ok: true };
}

export async function getAgent() {
  const session = await read("agent");
  if (!session) return null;

  const agent = await prisma.agent.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      agencyName: true,
      contactName: true,
      status: true,
      mustChangePassword: true,
    },
  });

  // Re-check status on every request: Sonet may have revoked an agent after
  // their cookie was issued, and a 12h session should not outlive that.
  return agent?.status === "approved" ? agent : null;
}

/**
 * Changes an agent's own password and clears any forced-change flag.
 * Verifies the current password first — a stolen session must not be enough to
 * lock the real agent out.
 */
export async function changeAgentPassword(
  agentId: string,
  currentPassword: string,
  newPassword: string
): Promise<LoginResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { passwordHash: true },
  });
  if (!agent) return { ok: false, error: "Account not found." };

  if (!(await verifyPassword(currentPassword, agent.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    },
  });
  return { ok: true };
}

/**
 * The agent's id straight from the session cookie, without the status re-check
 * that `getAgent` does. Used by the forced password change, which must work
 * for an agent who cannot yet reach the rest of the portal.
 */
export async function getAgentSessionId(): Promise<string | null> {
  const session = await read("agent");
  return session?.sub ?? null;
}

/**
 * The admin's id straight from the session cookie, skipping the user lookup.
 * Used by the forced password change, which must work for an admin who cannot
 * yet reach the rest of the dashboard.
 */
export async function getAdminSessionId(): Promise<string | null> {
  const session = await read("admin");
  return session?.sub ?? null;
}

/**
 * Changes the admin's own password and clears the forced-change flag.
 *
 * The seeded password arrives via an env file on the server, so it is known to
 * anyone who can read that file. Forcing a change on first login means the
 * credential that travels is never the credential that persists.
 */
export async function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string
): Promise<LoginResult> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { passwordHash: true },
  });
  if (!admin) return { ok: false, error: "Account not found." };

  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  await prisma.adminUser.update({
    where: { id: adminId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    },
  });
  return { ok: true };
}
