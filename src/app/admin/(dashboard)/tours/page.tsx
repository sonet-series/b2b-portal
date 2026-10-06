import { listTours, routeSummary, dayCount } from "@/lib/tours";
import { moveTour } from "./actions";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** One arrow, as its own form. Same pattern as the fleet list. */
function MoveButton({
  action,
  disabled,
  label,
  glyph,
}: {
  action: () => Promise<void>;
  disabled: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className="rounded px-1.5 py-0.5 text-sm text-slate-500 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {glyph}
      </button>
    </form>
  );
}

export default async function ToursPage() {
  const tours = await listTours();

  return (
    <>
      <PageHeader
        title="Standard tours"
        description="The circuits agents can pick instead of planning a trip day by day."
        action={
          <LinkButton href="/admin/tours/new" tone="primary">
            Add tour
          </LinkButton>
        }
      />

      <p className="-mt-2 mb-4 text-sm text-slate-500">
        Picking a tour fills in the agent&rsquo;s day-by-day plan and sets the kilometre allowance
        the hire is priced on. They can still change any of it afterwards. This order is the one
        agents see.
      </p>

      {tours.length === 0 ? (
        <EmptyState
          title="No standard tours yet"
          hint="Add the circuits you actually sell — route, nights, and the kilometre allowance you quote for it."
        />
      ) : (
        <Table head={["", "Tour", "Route", "Nights", "Allowance", ""]}>
          {tours.map((t, i) => {
            const planned = t.days.filter((d) => d.to.trim() !== "").length;
            const complete = planned === dayCount(t.nights);
            return (
              <tr key={t.id} className={t.active ? undefined : "bg-slate-50"}>
                <Td className="w-16 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <MoveButton
                      action={moveTour.bind(null, t.id, "up")}
                      disabled={i === 0}
                      label={`Move ${t.name} up`}
                      glyph="↑"
                    />
                    <MoveButton
                      action={moveTour.bind(null, t.id, "down")}
                      disabled={i === tours.length - 1}
                      label={`Move ${t.name} down`}
                      glyph="↓"
                    />
                  </div>
                </Td>
                <Td>
                  <span className="font-medium text-slate-900">{t.name}</span>
                  {!t.active && (
                    <span className="ml-2">
                      <Badge tone="slate">Inactive</Badge>
                    </span>
                  )}
                  {/*
                    An incomplete plan is flagged here rather than only on the
                    edit screen: a tour with blank days is hidden from agents,
                    and a tour that is silently invisible is one nobody knows
                    to finish.
                  */}
                  {!complete && (
                    <span className="ml-2">
                      <Badge tone="amber">
                        {planned} of {dayCount(t.nights)} days planned
                      </Badge>
                    </span>
                  )}
                </Td>
                <Td className="text-slate-600">{routeSummary(t) || "—"}</Td>
                <Td>{t.nights}</Td>
                <Td className="tabular-nums">{t.allowanceKm.toLocaleString("en-IN")} km</Td>
                <Td className="text-right">
                  <a href={`/admin/tours/${t.id}`} className="text-sm text-blue-700 hover:underline">
                    Edit
                  </a>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
