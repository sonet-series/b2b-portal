"use client";

import { Fragment, useActionState, type ReactNode } from "react";
import { formatMinor } from "@/lib/money";
import { withGst, formatBps } from "@/lib/settings-shared";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Badge, Button, Card, EmptyState, FormError } from "@/components/ui";
import { useTripCart } from "@/components/trip-cart";
import type { AnyQuoteInput, QuoteOption, QuoteResult } from "@/lib/quote-types";
import { VehiclePhoto } from "@/components/vehicle-photo";

/**
 * What the price covers, as one sentence.
 *
 * Each clause is pushed only when the pricing actually charged for it, then
 * they are joined — so no combination of absent clauses can produce a stray
 * separator.
 */
function TermsLine({ terms }: { terms: QuoteOption["terms"] }) {
  if (!terms) return null;

  const parts: ReactNode[] = [];
  if (terms.includedKm != null) {
    parts.push(
      <>
        <strong className="text-slate-900">{terms.includedKm.toLocaleString("en-IN")} km</strong>{" "}
        included
      </>
    );
  }
  if (terms.extraKmRateMinor != null) {
    parts.push(
      <>
        extra km at{" "}
        <strong className="text-slate-900">{formatMinor(terms.extraKmRateMinor)}</strong> per km
      </>
    );
  }
  if (terms.includesTollParking) parts.push(<>toll and parking included</>);
  if ((terms.permitStates?.length ?? 0) > 0) {
    parts.push(<>{terms.permitStates!.join(" and ")} permit included</>);
  }
  if (parts.length === 0) return null;

  return (
    <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

function SaveButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState) => action(prev),
    EMPTY_FORM_STATE
  );

  return (
    <form action={formAction}>
      <FormError message={state.message} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save this quote"}
      </Button>
    </form>
  );
}

/**
 * The instant quote. Every option is a concrete price the agent can act on —
 * there is deliberately no "pricing mode" control anywhere here. A product sold
 * whole-boat and per-person simply appears twice, priced both ways.
 */
export function QuoteResults({
  result,
  saveActions,
  input,
  gstBps,
}: {
  result: QuoteResult;
  /** Passed in rather than read here — this is a client component, and a
      defaulted tax rate rendered to an agent would be worse than none. */
  gstBps: number;
  /** One bound save action per option key. */
  saveActions: Record<string, (prev: FormState) => Promise<FormState>>;
  /**
   * The inputs behind this result. Needed so an option can be added to a trip
   * — the cart stores inputs, never prices, so it can be re-priced on save.
   */
  input?: AnyQuoteInput;
}) {
  const cart = useTripCart();
  if (result.options.length === 0 && result.unavailable.length === 0) {
    return (
      <EmptyState
        title="No rates loaded for those dates"
        hint="Series Tours has not published pricing covering this period yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      {result.options.map((option) => (
        <Card key={option.key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-slate-900">{option.title}</h3>
              <p className="text-sm text-slate-500">{option.detail}</p>
              {/* Which vehicle this price is for — `title` is how it is
                  PRICED, which is no answer to that question. */}
              {option.subject && (
                <div className="mt-2 flex items-center gap-3">
                  <VehiclePhoto
                    vehicleId={option.subject.vehicleId}
                    alt={option.subject.name}
                    className="h-16 w-24 shrink-0 rounded-md object-cover ring-1 ring-inset ring-slate-200"
                  />
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{option.subject.name}</span>
                    {option.subject.detail && (
                      <span className="block text-slate-500">{option.subject.detail}</span>
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold text-slate-900">
                {formatMinor(withGst(option.totalMinor, gstBps).grossMinor)}
              </p>
              <p className="text-xs text-slate-500">including GST</p>
              {option.usedOverride && (
                <span className="mt-1 inline-block">
                  <Badge tone="green">Your agency rate</Badge>
                </span>
              )}
            </div>
          </div>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <Row label="Total" value={formatMinor(option.totalMinor)} />
            <Row
              label={`GST ${formatBps(gstBps)}`}
              value={formatMinor(withGst(option.totalMinor, gstBps).gstMinor)}
            />
            <Row
              strong
              label="Grand total"
              value={formatMinor(withGst(option.totalMinor, gstBps).grossMinor)}
            />
          </dl>

          {/*
            The same sentence the saved quote and the PDF state. It used to
            stop at the kilometres, so a hire whose price already covered toll,
            parking and a state permit said nothing about them here and claimed
            them two screens later.

            Assembled as a LIST and joined, never as conditional separators.
            Hand-placed bullets left a flat transfer — which has no kilometre
            allowance — reading "· toll and parking included", starting on a
            separator with nothing before it.
          */}
          <TermsLine terms={option.terms} />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {saveActions[option.key] && <SaveButton action={saveActions[option.key]} />}
            {input && (
              <Button
                type="button"
                tone="secondary"
                onClick={() =>
                  cart.add({
                    input,
                    optionKey: option.key,
                    label: `${option.title} · ${option.detail}`,
                  })
                }
              >
                Add to trip
              </Button>
            )}
          </div>
        </Card>
      ))}

      {result.unavailable.length > 0 && (
        <Card className="border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Not available for this request</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {result.unavailable.map((u, i) => (
              <li key={i}>
                <span className="font-medium">{u.title}</span> — {u.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}


function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className={strong ? "font-semibold text-slate-900" : "text-slate-600"}>{label}</dt>
      <dd
        className={
          strong
            ? "text-lg font-semibold tabular-nums text-slate-900"
            : "tabular-nums text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
