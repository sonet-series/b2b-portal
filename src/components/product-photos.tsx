"use client";

import { useState } from "react";

/**
 * Catalogue photographs, for agents.
 *
 * Two components, both of which render NOTHING when there are no photographs —
 * most of the catalogue has none until Sonet works through it, and an empty
 * frame reads as a fault rather than as an absence.
 *
 * Both hide a picture that fails to load. The route handler 404s for a photo
 * whose file has gone, and a bare <img> on a 404 draws the browser's
 * broken-image icon on a page an agent is about to quote from.
 */

const BASE = "/agent/photos";

/** One picture — the cover — for the places a single thumbnail fits. */
export function ProductThumbnail({
  photoIds,
  alt,
  className,
}: {
  photoIds: readonly string[];
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const cover = photoIds[0];
  if (!cover || failed === cover) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by a session-checked route handler, not a static asset next/image can optimise
    <img
      key={cover}
      src={`${BASE}/${cover}`}
      alt={alt}
      onError={() => setFailed(cover)}
      className={className}
    />
  );
}

/**
 * The full set: one large picture with the rest as thumbnails beneath it.
 *
 * Selection is by INDEX rather than by id so that a set which changes
 * underneath — a photograph removed in the admin while an agent has the page
 * open — cannot leave the gallery pointing at nothing.
 */
export function ProductGallery({
  photoIds,
  alt,
  className,
  /**
   * When given, the gallery offers downloads: this one picture, or all of them
   * as a zip. Agents pass these to their own customers.
   */
  download,
}: {
  photoIds: readonly string[];
  alt: string;
  className?: string;
  download?: { kind: "vehicle" | "hotel" | "houseboat"; id: string };
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const usable = photoIds.filter((id) => !failed.has(id));
  if (usable.length === 0) return null;

  const current = usable[Math.min(index, usable.length - 1)];
  const markFailed = (id: string) => setFailed((prev) => new Set(prev).add(id));

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- session-checked route handler, not a static asset */}
      <img
        key={current}
        src={`${BASE}/${current}`}
        alt={alt}
        onError={() => markFailed(current)}
        className="h-56 w-full rounded-md object-cover ring-1 ring-inset ring-slate-200"
      />

      {download && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a
            href={`${BASE}/${current}?download=1`}
            download
            className="text-blue-700 hover:underline"
          >
            Download this photo
          </a>
          {usable.length > 1 && (
            <a
              href={`/agent/photos/bundle/${download.kind}/${download.id}`}
              download
              className="text-blue-700 hover:underline"
            >
              Download all {usable.length} (.zip)
            </a>
          )}
        </div>
      )}

      {usable.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {usable.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${alt}, photograph ${i + 1} of ${usable.length}`}
              aria-current={id === current}
              className={
                "overflow-hidden rounded ring-1 ring-inset transition-opacity " +
                (id === current
                  ? "ring-2 ring-blue-600"
                  : "opacity-70 ring-slate-200 hover:opacity-100")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- session-checked route handler, not a static asset */}
              <img
                src={`${BASE}/${id}`}
                alt=""
                onError={() => markFailed(id)}
                className="h-12 w-16 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
