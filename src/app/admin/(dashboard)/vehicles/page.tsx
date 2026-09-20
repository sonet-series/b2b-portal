import { prisma } from "@/lib/db";
import { reorderVehicle } from "./actions";
import { PageHeader, LinkButton, Table, Td, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * One arrow, as its own form.
 *
 * A form per button rather than a client component: this is a server page, the
 * whole interaction is one POST and a re-render, and nothing here needs to be
 * interactive before the server answers.
 */
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

export default async function VehiclesPage() {
  const vehicles = await prisma.vehicle.findMany({
    // The fleet order, exactly as agents see it. NOT active-first: the arrows
    // move a row within this list, so the list has to be the thing being
    // ordered — sorting archived rows to the bottom would make them jump.
    orderBy: [{ sortOrder: "asc" }, { capacity: "asc" }, { type: "asc" }],
    include: { _count: { select: { rates: { where: { active: true } } } } },
  });

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Vehicle types and their default rates."
        action={<LinkButton href="/admin/vehicles/new" tone="primary">Add vehicle</LinkButton>}
      />

      {/*
        The order here IS the order agents see — on /agent/fleet and in the
        quote picker. Said on the page, because a list of arrows with no stated
        consequence is a list nobody dares press.
      */}
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        This order is what agents see on their fleet page and in the vehicle
        picker. Use the arrows to rearrange it.
      </p>

      {vehicles.length === 0 ? (
        <EmptyState title="No vehicles yet" hint="Add your first vehicle type to start the catalogue." />
      ) : (
        <Table head={["", "Vehicle", "Capacity", "Active rates", ""]}>
          {vehicles.map((v, i) => (
            <tr key={v.id} className={v.active ? undefined : "bg-slate-50"}>
              <Td className="w-16 whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <MoveButton
                    action={reorderVehicle.bind(null, v.id, "up")}
                    disabled={i === 0}
                    label={`Move ${v.type} up`}
                    glyph="↑"
                  />
                  <MoveButton
                    action={reorderVehicle.bind(null, v.id, "down")}
                    disabled={i === vehicles.length - 1}
                    label={`Move ${v.type} down`}
                    glyph="↓"
                  />
                </div>
              </Td>
              <Td>
                <span className="font-medium text-slate-900">{v.type}</span>
                {!v.active && (
                  <span className="ml-2">
                    <Badge tone="slate">Inactive</Badge>
                  </span>
                )}
              </Td>
              <Td>up to {v.capacity} pax</Td>
              <Td>{v._count.rates === 0 ? <Badge tone="amber">No rates</Badge> : v._count.rates}</Td>
              <Td className="text-right">
                <a href={`/admin/vehicles/${v.id}`} className="text-sm text-blue-700 hover:underline">
                  Edit
                </a>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
