"use client";

import { useActionState } from "react";
import { formatMinor } from "@/lib/money";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/validation";
import { Badge, Button, Card, EmptyState, FormError } from "@/components/ui";
import type { QuoteResult } from "@/lib/quote-types";

function SaveButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState) => action(prev),
    EMPTY_FORM_STATE
  );

  return (
    <form action={formAction} className="mt-4">
      <FormError message={state.message} />
      <Button type="submit" disabled={pending} className="mt-2">
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
}: {
  result: QuoteResult;
  /** One bound save action per option key. */
  saveActions: Record<string, (prev: FormState) => Promise<FormState>>;
}) {
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
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold text-slate-900">
                {formatMinor(option.totalMinor)}
              </p>
              {option.usedOverride && (
                <span className="mt-1 inline-block">
                  <Badge tone="green">Your agency rate</Badge>
                </span>
              )}
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {option.lines.map((line, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3 text-slate-600">{line.description}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-slate-500">
                    {line.quantity} × {formatMinor(line.unitMinor)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-medium text-slate-900">
                    {formatMinor(line.totalMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {saveActions[option.key] && (
            <SaveButton action={saveActions[option.key]} />
          )}
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
