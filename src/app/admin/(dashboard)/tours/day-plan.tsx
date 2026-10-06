"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";
import type { TourDay } from "@/lib/tours";

/**
 * The tour's day plan, in the same shape the agent's itinerary builder uses.
 *
 * Deliberately the same three questions — where the day ends, and anywhere it
 * stops on the way — because this IS that itinerary, filled in once by Sonet
 * instead of every time by an agent. A different shape here would be a second
 * description of the same thing, free to drift from it.
 *
 * There is no "from" field, for the reason the builder has none: day 1 starts
 * at the tour's start place and every later day starts where the previous one
 * ended. Letting both ends be typed allows an invisible gap, and that gap is
 * unbilled distance the operator still pays for.
 *
 * Repeated rows use raw inputs rather than <Field>, which sets id={name} —
 * that would put every row under one id and point every label at the first.
 */
export function DayPlan({
  action,
  startPlace,
  days,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  startPlace: string;
  days: TourDay[];
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const err = state.errors ?? {};

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Day plan</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each day starts where the last one ended. For a day spent at one place, put that place in
        &ldquo;Ends at&rdquo; again and the excursion in &ldquo;Via&rdquo;.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <FormError message={state.ok ? undefined : state.message} />
        <FormSuccess message={state.ok ? state.message : undefined} />

        <div className="hidden gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[4rem_1fr_1fr]">
          <div>Day</div>
          <div>Ends at</div>
          <div>Via (optional)</div>
        </div>

        {days.map((day, i) => {
          const previous = i === 0 ? startPlace : days[i - 1].to;
          return (
            <div key={day.dayIndex} className="grid gap-3 sm:grid-cols-[4rem_1fr_1fr]">
              <div className="pt-2 text-sm">
                <span className="font-medium text-slate-900">Day {i + 1}</span>
                {/*
                  Where the day starts, stated rather than left to be inferred.
                  The agent-facing builder had a bare "—" here and people read
                  it as broken; the same confusion would apply to Sonet.
                */}
                <p className="text-xs text-slate-400">
                  from {previous.trim() === "" ? "the day before" : previous}
                </p>
              </div>
              <div>
                <input
                  type="text"
                  name="dayTo"
                  defaultValue={day.to}
                  placeholder={i === days.length - 1 ? "e.g. Cochin International Airport" : "e.g. Munnar"}
                  className="w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
                {err[`day${i}`] && (
                  <p className="mt-1 text-xs text-red-600">{err[`day${i}`]}</p>
                )}
              </div>
              <input
                type="text"
                name="dayVia"
                defaultValue={day.via.join(", ")}
                placeholder="e.g. Mattupetty Dam, Echo Point"
                className="w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
          );
        })}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save day plan"}
        </Button>
      </form>
    </Card>
  );
}
