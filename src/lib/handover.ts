import type { AgentStatus } from "./enums";

/**
 * The message Sonet copies out of the admin and pastes into WhatsApp.
 *
 * v1 sends nothing automatically — approval notification is a deliberate
 * manual step (see CLAUDE.md). This function exists so the wording is
 * consistent whether he is handing over a fresh approval or a reissued
 * temporary password.
 */

export function portalUrl(): string {
  return process.env.PORTAL_URL?.replace(/\/$/, "") ?? "https://b2b.seriestours.com";
}

export function approvalMessage(opts: {
  contactName: string;
  agencyName: string;
  email: string;
  /** Only set when a temporary password was issued. */
  tempPassword?: string;
}): string {
  const url = `${portalUrl()}/login`;
  const lines = [
    `Hi ${opts.contactName},`,
    ``,
    `Your Series Tours agent account for ${opts.agencyName} has been approved.`,
    ``,
    `Portal: ${url}`,
    `Sign in with: ${opts.email}`,
  ];

  if (opts.tempPassword) {
    lines.push(
      `Temporary password: ${opts.tempPassword}`,
      ``,
      `You'll be asked to set your own password when you first sign in.`
    );
  } else {
    lines.push(``, `Use the password you chose when you registered.`);
  }

  lines.push(``, `You can now get instant quotes on vehicles, houseboats, hotels and packages.`);
  return lines.join("\n");
}

export function tempPasswordMessage(opts: {
  contactName: string;
  email: string;
  tempPassword: string;
}): string {
  return [
    `Hi ${opts.contactName},`,
    ``,
    `Here is a temporary password for the Series Tours agent portal.`,
    ``,
    `Portal: ${portalUrl()}/login`,
    `Sign in with: ${opts.email}`,
    `Temporary password: ${opts.tempPassword}`,
    ``,
    `You'll be asked to set your own password when you sign in.`,
  ].join("\n");
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  pending: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};
