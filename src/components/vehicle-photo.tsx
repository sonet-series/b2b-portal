"use client";

import { useState } from "react";

/**
 * The vehicle an agent is quoting, as a picture.
 *
 * A client component, and deliberately so: it hides itself when the photo
 * cannot be fetched. The route handler 404s for a vehicle nobody has uploaded
 * a photo for — which is most of them until Sonet works through the
 * catalogue — and a bare <img> on a 404 renders the browser's broken-image
 * icon. An empty space is honest; a broken icon looks like a fault.
 *
 * Keeping the check here rather than passing a `hasPhoto` flag from the server
 * means the picture is always current: uploading one in the admin shows up on
 * a saved quote priced before it existed, and no page has to remember to ask.
 */
export function VehiclePhoto({
  vehicleId,
  alt,
  className,
}: {
  vehicleId: string | undefined;
  alt: string;
  /** Sizing and cropping belong to the caller — this appears at three sizes. */
  className?: string;
}) {
  /*
   * WHICH vehicle failed, not merely that one did.
   *
   * On the quote builder this same component instance is reused as the agent
   * changes vehicle in the dropdown. A plain boolean would remember the last
   * failure and hide the next vehicle's photograph even though it exists —
   * and recording the id instead needs no effect to reset it.
   */
  const [failedFor, setFailedFor] = useState<string | null>(null);

  if (!vehicleId || failedFor === vehicleId) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by a session-checked route handler, not a static asset next/image can optimise
    <img
      key={vehicleId}
      src={`/agent/vehicles/${vehicleId}/photo`}
      alt={alt}
      onError={() => setFailedFor(vehicleId)}
      className={className}
    />
  );
}
