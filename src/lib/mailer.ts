import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./db";
import { formatMinor } from "./money";
import { formatDateDisplay } from "./dates";
import { withGst } from "./settings-shared";

/**
 * Telling Sonet a booking has come in.
 *
 * CLAUDE.md said not to add a mail provider without him asking. He asked, on
 * 20 Sept 2026: *"whenever a booking has come in let the admin get a mail
 * saying got a booking"*. That is the only thing this sends — it is NOT a
 * general mail layer, and agent approval and temporary passwords are still
 * handed over by WhatsApp exactly as before.
 *
 * Three rules, and the first two are the important ones:
 *
 *  1. **It never throws.** The booking is committed before this is called. A
 *     mail server that is down, misconfigured, or has no credentials yet must
 *     not cost an agent their booking — the admin queue is the source of
 *     truth and this is a convenience on top of it.
 *  2. **It never blocks for long.** Short timeouts, because a request handler
 *     holding open a TCP connection to a slow SMTP host is an agent watching a
 *     spinner for something that does not concern them.
 *  3. **No credentials, no feature.** Absent configuration logs once and does
 *     nothing. It does not fall back to some other transport, and it does not
 *     pretend to have sent anything.
 */

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
};

function readConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const to = process.env.BOOKING_NOTIFY_TO?.trim() || process.env.ADMIN_EMAIL?.trim();
  if (!host || !to) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Derived rather than
    // configured, because getting these two out of step is the classic way to
    // spend an evening on "connection timed out".
    secure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465,
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || `no-reply@${host}`,
    to,
  };
}

let transport: Transporter | null = null;
let warned = false;

function getTransport(config: MailConfig): Transporter {
  transport ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    // Bounded, per rule 2 above.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  return transport;
}

/**
 * Sends the "a booking has come in" note. Resolves either way.
 *
 * Takes a reference rather than an object so the caller cannot accidentally
 * pass something half-built, and so the mail describes what is actually in the
 * database at the moment it is sent.
 */
export async function notifyBookingRequested(reference: string): Promise<void> {
  try {
    const config = readConfig();
    if (!config) {
      if (!warned) {
        warned = true;
        console.warn(
          "[mailer] SMTP_HOST or a recipient is not set — booking notifications are OFF. " +
            "Bookings still arrive in /admin/bookings."
        );
      }
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { reference },
      include: {
        agent: { select: { agencyName: true, email: true, phone: true } },
        quote: {
          select: { reference: true, productType: true, travelStart: true, travelEnd: true },
        },
      },
    });
    if (!booking) return;

    const totals = withGst(booking.agreedTotalMinor, booking.gstBps);
    const travel =
      formatDateDisplay(booking.quote.travelStart) === formatDateDisplay(booking.quote.travelEnd)
        ? formatDateDisplay(booking.quote.travelStart)
        : `${formatDateDisplay(booking.quote.travelStart)} to ${formatDateDisplay(booking.quote.travelEnd)}`;

    const portal = process.env.PORTAL_URL ?? "";
    const lines = [
      `${booking.agent.agencyName} has requested a booking.`,
      "",
      `Booking:  ${booking.reference}`,
      `Quote:    ${booking.quote.reference} (${booking.quote.productType})`,
      `Travel:   ${travel}`,
      `Quoted:   ${formatMinor(totals.grossMinor)} including GST`,
      `Agency:   ${booking.agent.agencyName}`,
      `Contact:  ${[booking.agent.phone, booking.agent.email].filter(Boolean).join("  ")}`,
      ...(booking.agentNote ? ["", `Their note: ${booking.agentNote}`] : []),
      "",
      portal ? `Approve or decline: ${portal}/admin/bookings/${booking.reference}` : "",
      "",
      "Nothing is confirmed until you approve it, and no payment has been taken.",
    ].filter((l) => l !== undefined);

    await getTransport(config).sendMail({
      from: config.from,
      to: config.to,
      subject: `Booking request ${booking.reference} — ${booking.agent.agencyName}`,
      text: lines.join("\n"),
    });
  } catch (e) {
    /*
     * Swallowed ON PURPOSE, and logged loudly.
     *
     * By the time this runs the booking exists and the agent has been told it
     * does. Throwing here would turn a delivered booking into an error page
     * and leave them re-submitting a request that had already worked.
     */
    console.error("[mailer] could not send the booking notification:", e);
  }
}
