import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { DOCUMENT_KIND, type DocumentKind } from "./enums";

/**
 * Storage for the documents agents upload at registration.
 *
 * Files go on disk, not into SQLite. Blobs in the database would bloat every
 * backup and every `.backup` copy, and the whole point of a single-file
 * database is that copying it stays cheap.
 *
 * They live under UPLOAD_DIR, which in production is /app/data/uploads —
 * inside the SAME bind mount as prod.db, so documents survive a container
 * rebuild exactly like the database does. A path anywhere else would be lost
 * on the next deploy.
 *
 * They are NOT under public/ and are never served statically. A PAN card is
 * sensitive personal data; the only read path is the admin-authenticated route.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/** What we accept, and the extension each is stored with. */
const ACCEPTED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,application/pdf";
export const ACCEPTED_LABEL = "JPG, PNG, WEBP or PDF, up to 5MB";

export class UploadError extends Error {}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
}

/**
 * Identifies a file from its leading bytes rather than the Content-Type the
 * browser sent, which is supplied by the client and trivially wrong — by
 * accident or on purpose. Returns null for anything unrecognised.
 */
/** Cheap heuristic: mostly printable ASCII in the first kilobyte. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 1024);
  if (sample.length === 0) return false;
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++;
    else if (b === 0) return false; // a NUL byte means binary
  }
  return printable / sample.length > 0.9;
}

function sniffMimeType(bytes: Uint8Array): string | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  // RIFF....WEBP
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type StoredUpload = {
  storedName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Validates and writes one uploaded file.
 *
 * The stored name is generated. The browser-supplied filename is kept only as
 * a label — using it on disk would let a crafted name escape the upload
 * directory.
 */
export async function storeUpload(
  file: File,
  label: string,
  opts?: { extraTypes?: readonly string[] }
): Promise<StoredUpload> {
  if (!file || file.size === 0) {
    throw new UploadError(`${label} is required`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new UploadError(`${label} is ${mb}MB — the limit is 5MB`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let mimeType = sniffMimeType(bytes);

  // Text formats have no magic number to sniff. They are allowed only where
  // the caller opts in (rate sheets), never for identity documents, and only
  // after confirming the bytes really are text rather than something binary
  // wearing a .csv name.
  if (!mimeType && opts?.extraTypes?.length && looksLikeText(bytes)) {
    const declared = file.type || "text/plain";
    if (opts.extraTypes.includes(declared)) mimeType = declared;
    else if (opts.extraTypes.includes("text/plain")) mimeType = "text/plain";
  }

  const allowed = mimeType && (mimeType in ACCEPTED || opts?.extraTypes?.includes(mimeType));
  if (!mimeType || !allowed) {
    throw new UploadError(`${label} must be a ${ACCEPTED_LABEL}`);
  }

  const storedName = `${randomUUID()}${ACCEPTED[mimeType] ?? ".txt"}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), bytes, { mode: 0o600 });

  return {
    storedName,
    // Trimmed and capped — it is rendered in the admin and can be anything.
    originalName: (file.name || "document").slice(0, 160),
    mimeType,
    sizeBytes: file.size,
  };
}

/**
 * Reads a stored document back.
 *
 * `storedName` comes from our own database, but it is still validated against
 * the generated-name shape and resolved inside the upload directory — a path
 * check is cheap, and this function serves files to a browser.
 */
export async function readUpload(storedName: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt)$/.test(storedName)) {
    throw new UploadError("Not a valid document reference.");
  }

  const dir = path.resolve(uploadDir());
  const full = path.resolve(dir, storedName);
  if (path.dirname(full) !== dir) {
    throw new UploadError("Not a valid document reference.");
  }

  return readFile(full);
}

/** Best-effort cleanup. Used when a registration fails after files were written. */
export async function discardUploads(storedNames: readonly string[]): Promise<void> {
  await Promise.all(
    storedNames.map(async (name) => {
      try {
        await unlink(path.join(uploadDir(), name));
      } catch {
        // Already gone, or never written. Nothing useful to do here.
      }
    })
  );
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  PAN_CARD: "PAN card",
  BUSINESS_PROOF: "Business proof",
  VISITING_CARD: "Visiting card",
};

export const DOCUMENT_HINT: Record<DocumentKind, string> = {
  PAN_CARD: "The agency's PAN card.",
  BUSINESS_PROOF: "Whatever registration or licence the agency holds.",
  VISITING_CARD: "A current visiting card.",
};

export { DOCUMENT_KIND };
export type { DocumentKind };
