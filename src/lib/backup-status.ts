import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "./uploads";

/**
 * Whether last night's backup actually left the box.
 *
 * `deploy/offsite.sh` runs on the HOST, not in this container — it needs docker
 * and ssh and has no business being in the application. But a backup system
 * nobody can see is a backup system nobody can trust: this project has already
 * been burnt by me telling Sonet that silence in the logs meant SMTP was
 * working. So the script drops a one-line status file into the data directory
 * and this reads it.
 *
 * `data/` is the container's bind mount, which is the whole reason that works —
 * the same mount the database and the uploads live in. There is no network
 * path, no new table, and nothing for the app to run.
 *
 * READ-ONLY, and defensive about everything. This file is written by a shell
 * script outside the app's control, so a missing, truncated or hand-edited one
 * must render as "unknown" rather than break the Settings page.
 */

export type OffsiteState = "ok" | "error" | "unconfigured" | "unknown";

export type OffsiteStatus = {
  state: OffsiteState;
  /** When the script last ran, ISO. Null when it never has. */
  at: Date | null;
  detail: string;
  /** The archive it last wrote, e.g. "b2b-20261006T021500Z.tar.cms". */
  archive: string;
  bytes: number;
  /** Where copies go, with everything after the login cut off. */
  remote: string;
  keepDays: number;
  /**
   * True when the last successful copy is more than 48 hours old.
   *
   * The gap that matters is not "did it fail" — a failure emails and sets
   * `error`. It is the job that stopped being run at all, which leaves a
   * perfectly happy "ok" sitting there from three weeks ago. Two nights,
   * because one missed night is a reboot and two is a pattern.
   */
  stale: boolean;
};

function statusPath(): string {
  // Beside uploads/, in the same bind mount. Derived from UPLOAD_DIR so it
  // follows the data directory wherever that is pointed.
  return path.join(path.dirname(uploadDir()), "offsite-status.json");
}

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export async function offsiteStatus(): Promise<OffsiteStatus> {
  const unknown: OffsiteStatus = {
    state: "unknown",
    at: null,
    detail: "",
    archive: "",
    bytes: 0,
    remote: "",
    keepDays: 0,
    stale: false,
  };

  let raw: string;
  try {
    raw = await readFile(statusPath(), "utf8");
  } catch {
    // Never run, or this is a dev machine with no host script. Not an error.
    return unknown;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...unknown, detail: "The status file could not be read." };
  }
  if (typeof parsed !== "object" || parsed === null) return unknown;

  const o = parsed as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const stateRaw = str(o.state);
  const state: OffsiteState =
    stateRaw === "ok" || stateRaw === "error" || stateRaw === "unconfigured"
      ? stateRaw
      : "unknown";

  const atRaw = str(o.at);
  const at = atRaw !== "" && !Number.isNaN(Date.parse(atRaw)) ? new Date(atRaw) : null;

  return {
    state,
    at,
    detail: str(o.detail),
    archive: str(o.archive),
    bytes: num(o.bytes),
    remote: str(o.remote),
    keepDays: num(o.keepDays),
    stale: state === "ok" && at !== null && Date.now() - at.getTime() > STALE_AFTER_MS,
  };
}

/** "1.4 MB" — an archive size, where a byte count tells nobody anything. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What is actually running on this box, and when it got there.
 *
 * Written by `deploy/deploy.sh`, read here — the same mechanism as the
 * off-box backup status, and for the same reason.
 *
 * CI stopped deploying on 6 Oct 2026 and it went unnoticed for a day: every
 * push reached GitHub and stopped there, and the only symptom was a change
 * that never appeared. A green build somewhere else is not evidence. This
 * makes "the server is behind" visible on a screen instead of being something
 * you find out by missing it.
 */
export type DeployStatus = {
  /** Short SHA, e.g. "060babd". Empty when never recorded. */
  commit: string;
  subject: string;
  at: Date | null;
  /** "manual", or "ci" when the workflow sets DEPLOYED_BY. */
  by: string;
  /**
   * True when the last deploy is more than 7 days old.
   *
   * Not a failure on its own — a quiet week is a quiet week. It is a prompt to
   * check whether nothing shipped, or whether shipping stopped working.
   */
  stale: boolean;
};

const DEPLOY_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export async function deployStatus(): Promise<DeployStatus> {
  const empty: DeployStatus = { commit: "", subject: "", at: null, by: "", stale: false };
  let raw: string;
  try {
    raw = await readFile(path.join(path.dirname(uploadDir()), "deploy-status.json"), "utf8");
  } catch {
    return empty;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const o = parsed as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const atRaw = str(o.at);
  const at = atRaw !== "" && !Number.isNaN(Date.parse(atRaw)) ? new Date(atRaw) : null;
  return {
    commit: str(o.commit),
    subject: str(o.subject),
    at,
    by: str(o.by),
    stale: at !== null && Date.now() - at.getTime() > DEPLOY_STALE_AFTER_MS,
  };
}
