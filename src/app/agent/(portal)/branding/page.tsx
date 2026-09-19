import { requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Button } from "@/components/ui";
import { LogoForm } from "./logo-form";
import { uploadLogo, removeLogo } from "./actions";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const agent = await requireAgent();
  // The session carries only what auth needs; the letterhead details come
  // from the row.
  const row = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { logoStoredName: true, address: true, phone: true },
  });
  const hasLogo = Boolean(row?.logoStoredName);

  return (
    <>
      <PageHeader
        title="Your branding"
        description="What appears on the quotes you print for your customers."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold text-slate-900">Logo</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">
            Printed at the top of every quote, above your address.
          </p>

          {hasLogo && (
            <div className="mb-4 flex items-center gap-4 rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              {/* Served by our own route, never from public/ — one agency must
                  not be able to fetch another's by guessing a filename. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/agent/branding/logo" alt="Your logo" className="max-h-16 max-w-[12rem] object-contain" />
              <form action={removeLogo} className="ml-auto">
                <Button type="submit" tone="secondary">
                  Remove
                </Button>
              </form>
            </div>
          )}

          <LogoForm action={uploadLogo} hasLogo={hasLogo} />
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">Your details</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">
            Printed beneath your logo. These come from your registration — contact Series Tours to
            change them.
          </p>

          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-400">Agency</dt>
              <dd className="text-slate-900">{agent.agencyName}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Address</dt>
              <dd className="whitespace-pre-line text-slate-900">{row?.address || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Phone</dt>
              <dd className="text-slate-900">{row?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="text-slate-900">{agent.email}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        A printed quote carries your branding only. Series Tours does not appear on it, so you can
        hand it straight to your customer.
      </p>
    </>
  );
}
