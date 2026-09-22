"use client";

import { useActionState, useState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, Field, FormError, FormSuccess } from "@/components/ui";

import { DateField } from "@/components/date-field";

/*
 * Repeated rows use raw inputs, not <Field>.
 *
 * Field sets id={name}, and these names repeat once per guest and per night —
 * which would put several elements on the page under one id and point every
 * label at the first of them. An aria-label per input is the honest version.
 */
const control =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 " +
  "ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset " +
  "focus:ring-blue-600";

/**
 * Who is travelling, how they arrive, and where they sleep.
 *
 * Asked for by Sonet, 21 Sept 2026. Three separate forms rather than one, so
 * an agent who has the flight number but not the hotels can save what they
 * have — these details arrive over days, from different people, and a single
 * Save button would mean holding all of it until the last piece turns up.
 */

export function GuestDetails({
  action,
  leadName,
  leadPhone,
  leadEmail,
  arrival,
  departure,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  arrival: { date: string; time: string; flight: string; from: string };
  departure: { date: string; time: string; flight: string; to: string };
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Guest and travel details</h2>
      <p className="mt-1 text-sm text-slate-500">
        Series Tours needs these to plan the driver. Add what you have — you can come back and
        fill in the rest.
      </p>

      <form action={formAction} className="mt-4 space-y-5">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Lead guest" name="leadGuestName" defaultValue={leadName} placeholder="Mr Varghese" />
          <Field label="Phone" name="leadGuestPhone" defaultValue={leadPhone} placeholder="+91 …" />
          <Field label="Email" name="leadGuestEmail" type="email" defaultValue={leadEmail} />
        </div>

        <fieldset className="rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Arrival
          </legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <DateField label="Date" name="arrivalDate" defaultValue={arrival.date} />
            <Field
              label="Time"
              name="arrivalTime"
              defaultValue={arrival.time}
              placeholder="06:40"
              hint="24-hour"
            />
            <Field
              label="Flight / train"
              name="arrivalFlight"
              defaultValue={arrival.flight}
              placeholder="AI 503"
            />
            <Field label="Coming from" name="arrivalFrom" defaultValue={arrival.from} placeholder="Delhi" />
          </div>
        </fieldset>

        <fieldset className="rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Departure
          </legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <DateField label="Date" name="departureDate" defaultValue={departure.date} />
            <Field
              label="Time"
              name="departureTime"
              defaultValue={departure.time}
              placeholder="18:15"
              hint="24-hour"
            />
            <Field
              label="Flight / train"
              name="departureFlight"
              defaultValue={departure.flight}
              placeholder="6E 204"
            />
            <Field label="Going to" name="departureTo" defaultValue={departure.to} placeholder="Mumbai" />
          </div>
        </fieldset>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      </form>
    </Card>
  );
}

/**
 * The party.
 *
 * Rows rather than one text box, because hotels ask for names one at a time.
 * The whole list posts on every save and replaces what was there — simpler
 * than tracking which row is new, and the list is never long enough for that
 * to cost anything.
 */
export function GuestList({
  action,
  guests,
  expected,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  guests: { name: string; age: number | null }[];
  /** Party size from the quote, so the agent can see when the list is short. */
  expected: number;
}) {
  const [rows, setRows] = useState<{ name: string; age: string }[]>(
    guests.length > 0
      ? guests.map((g) => ({ name: g.name, age: g.age == null ? "" : String(g.age) }))
      : [{ name: "", age: "" }]
  );
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  const named = rows.filter((r) => r.name.trim() !== "").length;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Guests</h2>
        {expected > 0 && (
          <p className="text-xs text-slate-500">
            {named} of {expected} named
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Names as they appear on ID — hotels ask for them, and a correction on the day is the
        hardest kind to make.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        {rows.map((row, i) => (
          <div key={i} className="grid items-center gap-3 sm:grid-cols-[1fr_6rem_5rem]">
            <input
              name="guestName"
              value={row.name}
              onChange={(e) =>
                setRows((prev) => prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
              }
              placeholder={i === 0 ? "Lead guest, as on ID" : "Full name"}
              aria-label={`Guest ${i + 1} name`}
              className={control}
            />
            <input
              name="guestAge"
              value={row.age}
              onChange={(e) =>
                setRows((prev) => prev.map((r, j) => (j === i ? { ...r, age: e.target.value } : r)))
              }
              inputMode="numeric"
              placeholder="Age"
              aria-label={`Guest ${i + 1} age`}
              className={`${control} tabular-nums`}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              className="text-left text-xs text-red-700 hover:underline"
              aria-label={`Remove guest ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setRows((prev) => [...prev, { name: "", age: "" }])}>
            Add guest
          </Button>
          <Button type="submit" tone="primary" disabled={pending}>
            {pending ? "Saving…" : "Save guests"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** One night's accommodation — its own tiny form, saved on its own. */
export function StayRow({
  action,
  stay,
  formatted,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  stay: { dayIndex: number; place: string; property: string; confirmationRef: string; notes: string };
  formatted: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="border-t border-slate-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="text-sm font-medium text-slate-900">Night {stay.dayIndex + 1}</p>
        <p className="text-xs text-slate-500">
          {formatted} · at {stay.place}
        </p>
        {state.message && (
          <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
            {state.message}
          </p>
        )}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1.5fr_1fr_1.5fr_auto]">
        <input
          name="property"
          defaultValue={stay.property}
          placeholder="Hotel or resort"
          aria-label={`Night ${stay.dayIndex + 1} property`}
          className={control}
        />
        <input
          name="confirmationRef"
          defaultValue={stay.confirmationRef}
          placeholder="Confirmation no."
          aria-label={`Night ${stay.dayIndex + 1} confirmation number`}
          className={control}
        />
        <input
          name="notes"
          defaultValue={stay.notes}
          placeholder="Room type, meal plan…"
          aria-label={`Night ${stay.dayIndex + 1} notes`}
          className={control}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
