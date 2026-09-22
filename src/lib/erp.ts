import "server-only";
import { prisma } from "./db";
import { toMajor } from "./money";
import { bookingMoney } from "./booking-shared";
import { formatDateOnly } from "./dates";

/**
 * Handing a confirmed, deposit-paid booking to the ERP.
 *
 * Sonet asked for this on 21 Sept 2026, reversing the first rule in CLAUDE.md.
 * That rule says the reversal is his to make explicitly, and he made it.
 *
 * ## The mechanism, and why this one
 *
 * The isolation was never really "the ERP is secret" — it is that the two
 * systems must not share a database, and that this portal must not be able to
 * reach into the ERP's internals. So this calls the ERP's **public REST API
 * over HTTPS**, exactly as any third party integrating with it would:
 *
 *  - **Outbound only.** The portal speaks to the ERP; the ERP never speaks to
 *    the portal, and has no credentials here.
 *  - **No Docker network change.** The portal stays on `edge` with no route to
 *    `frappe_default`. It resolves the ERP by its public hostname and is
 *    refused by the same authentication as anyone else on the internet.
 *  - **No shared database.** It posts a document and reads back a name. It
 *    never queries the ERP, and nothing here imports ERP data.
 *
 * That keeps every clause of the original rule intact except the one Sonet
 * deliberately changed. Moving this container onto `frappe_default` would have
 * been simpler and would have thrown the isolation away; it is still forbidden.
 *
 * ## Three rules
 *
 *  1. **It never throws at the caller.** The booking is confirmed and the
 *     money is in. An ERP that is down must not turn that into an error page
 *     or a lost payment — the failure is recorded on the booking and retried.
 *  2. **It is idempotent.** `Booking.erpReference` is set once. A booking that
 *     has one is never sent again, so a retry after an ambiguous timeout
 *     cannot create a second sales order.
 *  3. **No configuration, no feature.** Absent settings mean it stays off and
 *     says so on the admin screen, rather than failing quietly on every push.
 */

export type ErpConfig = {
  /** e.g. https://erp.seriestours.com — the ERP's own public address. */
  url: string;
  apiKey: string;
  apiSecret: string;
  /** The ERPNext Company the order belongs to. */
  company: string;
  /** The Item code every booking line uses. */
  itemCode: string;
  /** Fallback Customer when an agency has no explicit mapping. */
  defaultCustomer?: string;
};

export function readErpConfig(): ErpConfig | null {
  const url = process.env.ERP_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.ERP_API_KEY?.trim();
  const apiSecret = process.env.ERP_API_SECRET?.trim();
  const company = process.env.ERP_COMPANY?.trim();
  const itemCode = process.env.ERP_ITEM_CODE?.trim();

  if (!url || !apiKey || !apiSecret || !company || !itemCode) return null;
  return {
    url,
    apiKey,
    apiSecret,
    company,
    itemCode,
    defaultCustomer: process.env.ERP_DEFAULT_CUSTOMER?.trim() || undefined,
  };
}

/** What the admin screen shows. Never returns the secret, only whether it is set. */
export function erpStatus(): {
  configured: boolean;
  url?: string;
  company?: string;
  itemCode?: string;
  defaultCustomer?: string;
  hasSecret: boolean;
} {
  const config = readErpConfig();
  if (!config) return { configured: false, hasSecret: Boolean(process.env.ERP_API_SECRET) };
  return {
    configured: true,
    url: config.url,
    company: config.company,
    itemCode: config.itemCode,
    defaultCustomer: config.defaultCustomer,
    hasSecret: true,
  };
}

export type PushResult =
  | { ok: true; reference: string; alreadySent?: boolean }
  | { ok: false; reason: string; skipped?: boolean };

/**
 * Is this booking ready to go across?
 *
 * "Confirmed and 25% paid" — and PAID means Sonet approved the payment, not
 * that the agent filed one. `bookingMoney` only counts APPROVED rows, which is
 * what makes that distinction hold here for free.
 */
function readyReason(booking: {
  status: string;
  agreedTotalMinor: number;
  gstBps: number;
  depositBps: number;
  payments: { amountMinor: number; status: string }[];
}): string | null {
  if (booking.status !== "CONFIRMED") return "the booking is not confirmed";
  const money = bookingMoney(
    booking.agreedTotalMinor,
    booking.gstBps,
    booking.depositBps,
    booking.payments
  );
  if (!money.depositSettled) return "the deposit has not been approved yet";
  return null;
}

/**
 * Pushes one booking, or explains why it did not.
 *
 * Returns rather than throws. Every caller is either a request handler that
 * has already committed something, or an admin retry button — neither wants
 * an exception, both want the reason.
 */
export async function pushBookingToErp(reference: string): Promise<PushResult> {
  const config = readErpConfig();
  if (!config) return { ok: false, reason: "The ERP connection is not configured.", skipped: true };

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      payments: { select: { amountMinor: true, status: true } },
      agent: { select: { agencyName: true, email: true } },
      quote: { select: { reference: true, travelStart: true, travelEnd: true } },
    },
  });
  if (!booking) return { ok: false, reason: "That booking no longer exists." };

  // Idempotent: already across, so say so and do nothing.
  if (booking.erpReference) {
    return { ok: true, reference: booking.erpReference, alreadySent: true };
  }

  const notReady = readyReason(booking);
  if (notReady) return { ok: false, reason: `Not sent — ${notReady}.`, skipped: true };

  const money = bookingMoney(
    booking.agreedTotalMinor,
    booking.gstBps,
    booking.depositBps,
    booking.payments
  );

  /*
   * A Sales Order, priced NET of GST.
   *
   * ERPNext applies its own tax template; posting the gross would tax the tax.
   * `rate` is in RUPEES because that is the unit every ERP field uses — this
   * is the one boundary where paise stop, and `toMajor` is the only crossing.
   */
  const payload = {
    doctype: "Sales Order",
    company: config.company,
    customer: config.defaultCustomer ?? booking.agent.agencyName,
    transaction_date: formatDateOnly(new Date()),
    delivery_date: formatDateOnly(booking.quote.travelStart),
    // Our reference, on their document — so a row in the ERP can be traced
    // back here without anyone guessing.
    po_no: booking.reference,
    items: [
      {
        item_code: config.itemCode,
        item_name: `Tour ${booking.reference}`,
        description:
          `${booking.agent.agencyName} — quote ${booking.quote.reference}, ` +
          `travel ${formatDateOnly(booking.quote.travelStart)} to ${formatDateOnly(booking.quote.travelEnd)}`,
        qty: 1,
        rate: toMajor(money.totals.netMinor),
        delivery_date: formatDateOnly(booking.quote.travelStart),
      },
    ],
  };

  let erpName = "";
  try {
    const response = await fetch(`${config.url}/api/resource/Sales%20Order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Frappe's own token scheme. Never a session cookie: this is a
        // machine talking to a machine.
        Authorization: `token ${config.apiKey}:${config.apiSecret}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      // Bounded. A hanging ERP must not hold a request handler open while an
      // agent watches a spinner for something that does not concern them.
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    if (!response.ok) {
      // Frappe returns its real complaint in the body; the status alone says
      // almost nothing useful.
      const detail = text.slice(0, 500).replace(/\s+/g, " ").trim();
      throw new Error(`${response.status} ${response.statusText} — ${detail}`);
    }

    const body = JSON.parse(text) as { data?: { name?: string } };
    erpName = body.data?.name ?? "";
    if (!erpName) throw new Error("The ERP accepted it but returned no document name.");
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { erpError: reason.slice(0, 1000), erpAttempts: { increment: 1 } },
    });
    return { ok: false, reason };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      erpReference: erpName,
      erpPushedAt: new Date(),
      erpError: null,
      erpAttempts: { increment: 1 },
    },
  });

  return { ok: true, reference: erpName };
}

/**
 * Fire-and-forget, for the moment a payment is approved.
 *
 * Swallows everything: by the time this runs Sonet has approved real money,
 * and an unreachable ERP must not turn that into a failed action he then
 * repeats. The failure lands on the booking, where the admin screen shows it
 * with a retry.
 */
export async function pushBookingToErpQuietly(reference: string): Promise<void> {
  try {
    const result = await pushBookingToErp(reference);
    if (!result.ok && !result.skipped) {
      console.error(`[erp] ${reference} could not be sent: ${result.reason}`);
    }
  } catch (e) {
    console.error(`[erp] ${reference} push threw unexpectedly:`, e);
  }
}
