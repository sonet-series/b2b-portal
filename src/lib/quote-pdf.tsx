import path from "node:path";
import { existsSync } from "node:fs";
import React from "react";
import {
  Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer,
} from "@react-pdf/renderer";
import { formatMinor } from "./money";
import { withGst, formatBps } from "./settings-shared";
import { formatDateDisplay } from "./dates";
import { buildItineraryDocument } from "./itinerary-document";
import type { ItineraryDay, QuoteOption } from "./quote-types";

/**
 * A real PDF of the quote, generated on the server.
 *
 * This exists because browser printing cannot be made clean. Browsers stamp
 * the document title and the PAGE URL into the header and footer, and no CSS
 * reaches them — the only control is a tick box in the print dialogue. Sonet's
 * objection was exactly right: he can untick it, and his agents will not know
 * to, and he cannot brief every agency. So the document the customer sees must
 * not be produced by a print dialogue at all.
 *
 * Rendered with @react-pdf/renderer rather than a headless browser on purpose.
 * The box has 4GB of RAM, no swap, and runs the ERP as well; launching Chrome
 * per download would be the least welcome thing we could put on it.
 */

/*
 * The bundled font is not decoration.
 *
 * The built-in PDF fonts are WinAnsi and have no rupee sign. They do not fail
 * on one either — "₹" came out as "¹" and "→" as a quote mark, silently, so
 * the document would have looked subtly wrong rather than obviously broken.
 * Noto Sans carries both.
 */
const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;

  // Checked explicitly so a missing font directory says so, rather than
  // surfacing as an unexplained 500 and a blank tab. This has already happened
  // once: the runtime image did not copy src/, the fonts are read at request
  // time rather than bundled, and the only symptom was a blank page.
  if (!existsSync(path.join(FONT_DIR, "NotoSans-Regular.ttf"))) {
    throw new Error(
      `PDF fonts are missing from ${FONT_DIR}. They are read at request time, ` +
        "so they must be copied into the runtime image — see the COPY of src/assets in the Dockerfile."
    );
  }

  Font.register({
    family: "Noto",
    fonts: [
      { src: path.join(FONT_DIR, "NotoSans-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // Noto Sans has no hyphenation dictionary here, and the default hyphenator
  // breaks Indian place names in odd spots. Whole words wrap instead.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const RULE = "#e2e8f0";

const s = StyleSheet.create({
  /*
   * paddingBottom reserves room for the FIXED footer below.
   *
   * It was 48 while the footer runs from 26pt off the bottom up through two
   * wrapped lines and the agency name — about 60pt. The gap only showed once
   * the itinerary grew: "Grand total" printed straight through the footer
   * text, and its amount went to page two on its own. Content must never be
   * laid out into the band the footer occupies.
   */
  page: { fontFamily: "Noto", fontSize: 9, color: INK, paddingTop: 34, paddingBottom: 74, paddingHorizontal: 38 },

  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { maxWidth: 150, maxHeight: 58, marginBottom: 8, objectFit: "contain" },
  agency: { fontSize: 17, fontWeight: "bold" },
  meta: { fontSize: 9, color: MUTED, marginTop: 3, lineHeight: 1.4 },
  quoteLabel: { fontSize: 7.5, letterSpacing: 1.4, color: FAINT, textAlign: "right", fontWeight: "bold" },
  quoteRef: { fontSize: 17, fontWeight: "bold", textAlign: "right", marginTop: 2 },
  quoteDate: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 2 },
  rule: { borderBottomWidth: 2.5, borderBottomColor: INK, marginTop: 12, marginBottom: 14 },

  facts: { flexDirection: "row", borderWidth: 1, borderColor: RULE, borderRadius: 3 },
  fact: { flex: 1, paddingVertical: 7, paddingHorizontal: 9, borderRightWidth: 1, borderRightColor: RULE },
  factLast: { borderRightWidth: 0 },
  factLabel: { fontSize: 6.5, letterSpacing: 0.9, color: FAINT, fontWeight: "bold" },
  factValue: { fontSize: 9, marginTop: 2 },

  section: { fontSize: 7.5, letterSpacing: 1.2, color: FAINT, fontWeight: "bold", marginTop: 15, marginBottom: 6 },

  tourTitle: { fontSize: 13, fontWeight: "bold", marginTop: 14 },
  tourSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  body: { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },

  day: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 5.5 },
  dayNum: { width: 46 },
  dayNumText: { fontSize: 6.5, letterSpacing: 0.7, color: FAINT, fontWeight: "bold" },
  dayDate: { fontSize: 8, color: MUTED, marginTop: 1 },
  dayBody: { flex: 1, paddingRight: 4 },
  dayRoute: { fontSize: 10, fontWeight: "bold" },
  dayDetail: { fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.45 },
  dayActivityLabel: { fontSize: 8.5, color: INK, fontWeight: "bold", marginTop: 3 },

  lists: { flexDirection: "row", marginTop: 4 },
  listCol: { flex: 1, paddingRight: 14 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  listMark: { width: 11, fontSize: 8.5 },
  listText: { flex: 1, fontSize: 8.5, color: MUTED, lineHeight: 1.45 },

  costRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 5 },
  costDesc: { flex: 1, paddingRight: 12, fontSize: 9 },
  costAmt: { width: 90, textAlign: "right", fontSize: 9 },
  grand: { flexDirection: "row", borderTopWidth: 2, borderTopColor: INK, paddingTop: 9, marginTop: 3 },
  grandLabel: { flex: 1, fontSize: 12, fontWeight: "bold" },
  grandAmt: { width: 120, textAlign: "right", fontSize: 14, fontWeight: "bold" },

  groupLabel: { fontSize: 7.5, letterSpacing: 0.8, color: MUTED, fontWeight: "bold", marginTop: 10, marginBottom: 2 },

  termsBox: { marginTop: 14, borderWidth: 1, borderColor: RULE, borderRadius: 3, padding: 9 },
  termsLabel: { fontSize: 6.5, letterSpacing: 0.9, color: FAINT, fontWeight: "bold", marginBottom: 3 },
  termsText: { fontSize: 8.5, color: MUTED, lineHeight: 1.45, marginTop: 1 },

  foot: { position: "absolute", left: 38, right: 38, bottom: 26, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 7 },
  footText: { fontSize: 7.5, color: MUTED, lineHeight: 1.45 },
  footAgency: { fontSize: 8, color: INK, fontWeight: "bold", marginTop: 4 },
});

export type QuotePdfInput = {
  reference: string;
  createdAt: Date;
  travelStart: Date;
  travelEnd: Date;
  agencyName: string;
  email: string;
  address: string | null;
  phone: string | null;
  /** Raw image bytes; absent when the agency has not uploaded one. */
  logo?: { data: Buffer; mime: string };
  party: string;
  days: ItineraryDay[];
  /** Which vehicle the hire is for. Absent on non-vehicle quotes. */
  subject?: QuoteOption["subject"];
  totalMinor: number;
  /** Basis points of GST to apply to `totalMinor`. */
  gstBps: number;
  /** What the price covers, stated rather than itemised. */
  terms?: QuoteOption["terms"];
};

function Fact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? [s.fact, s.factLast] : s.fact}>
      <Text style={s.factLabel}>{label.toUpperCase()}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

function ListItem({ mark, text, tone }: { mark: string; text: string; tone: string }) {
  return (
    // wrap={false}: a bullet and its text must land on the same page.
    <View style={s.listItem} wrap={false}>
      <Text style={[s.listMark, { color: tone }]}>{mark}</Text>
      <Text style={s.listText}>{text}</Text>
    </View>
  );
}

function QuoteDocument(q: QuotePdfInput) {
  const totals = withGst(q.totalMinor, q.gstBps);

  /*
   * The customer-facing itinerary, built by the SAME function the portal page
   * uses. Two renderers deriving the same prose separately is how a quote
   * comes to claim two different things.
   *
   * Note what is no longer passed in at all: the measured legs. Confirmed with
   * Sonet, 20 Sept 2026 — the road segments, the depot positioning runs and
   * the local-running allowance are operational figures that belong on the
   * admin screens. Leaving them out of the PDF's inputs, rather than merely
   * not rendering them, is what makes it impossible to leak them back onto a
   * customer's document later.
   */
  const doc = buildItineraryDocument({ days: q.days, subject: q.subject, terms: q.terms });

  const facts: { label: string; value: string }[] = [
    {
      label: "Travel dates",
      value:
        formatDateDisplay(q.travelStart) === formatDateDisplay(q.travelEnd)
          ? formatDateDisplay(q.travelStart)
          : `${formatDateDisplay(q.travelStart)} — ${formatDateDisplay(q.travelEnd)}`,
    },
  ];
  if (q.days.length > 0) {
    facts.push({
      label: "Duration",
      value: `${q.days.length} ${q.days.length === 1 ? "day" : "days"}${q.days.length > 1 ? ` / ${q.days.length - 1} nights` : ""}`,
    });
  }
  // Which vehicle the quote is FOR — the question a saved quote did not answer
  // anywhere until Sonet asked it of one.
  if (q.subject) facts.push({ label: "Vehicle", value: q.subject.name });
  if (q.party) facts.push({ label: "Travellers", value: q.party });

  return (
    <Document title={`${q.agencyName} — Quotation ${q.reference}`} author={q.agencyName}>
      <Page size="A4" style={s.page}>
        <View style={s.headRow}>
          <View>
            {q.logo && (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is not the DOM element and has no alt prop
              <Image style={s.logo} src={q.logo.data} />
            )}
            <Text style={s.agency}>{q.agencyName}</Text>
            {q.address ? <Text style={s.meta}>{q.address}</Text> : null}
            <Text style={s.meta}>
              {[q.phone, q.email].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
          <View>
            <Text style={s.quoteLabel}>QUOTATION</Text>
            <Text style={s.quoteRef}>{q.reference}</Text>
            <Text style={s.quoteDate}>{formatDateDisplay(q.createdAt)}</Text>
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.facts}>
          {facts.map((f, i) => (
            <Fact key={f.label} label={f.label} value={f.value} last={i === facts.length - 1} />
          ))}
        </View>

        {doc && (
          <>
            <Text style={s.tourTitle}>{doc.title}</Text>
            <Text style={s.tourSub}>{doc.subtitle}</Text>

            <Text style={s.section}>OVERVIEW</Text>
            <Text style={s.body}>{doc.overview}</Text>

            <Text style={s.section}>DAY-BY-DAY ITINERARY</Text>
            {doc.days.map((d) => (
              <View key={d.label} style={s.day} wrap={false}>
                <View style={s.dayNum}>
                  <Text style={s.dayNumText}>{d.label.toUpperCase()}</Text>
                  <Text style={s.dayDate}>
                    {formatDateDisplay(new Date(`${d.date}T00:00:00Z`)).slice(0, 5)}
                  </Text>
                </View>
                <View style={s.dayBody}>
                  {/*
                    "to", not an arrow. Noto Sans has no U+2192 — checked
                    against the font's own cmap table, not assumed — so an
                    arrow would render as a blank box on the customer's
                    document. Every other symbol used here (₹, ·, —) is
                    present. On a printed itinerary "Madurai Airport to
                    Rameswaram" also simply reads better.
                  */}
                  <Text style={s.dayRoute}>{d.heading}</Text>
                  <Text style={s.dayDetail}>{d.description}</Text>
                  {d.activities.length > 0 && (
                    <>
                      <Text style={s.dayActivityLabel}>Sightseeing</Text>
                      <Text style={s.dayDetail}>{d.activities.join("  ·  ")}</Text>
                    </>
                  )}
                </View>
              </View>
            ))}

            {/*
              Kept whole across a page break. Left to wrap, the two columns
              split mid-list and page one ended on a bullet with no text beside
              it — the list reads as a promise, and half a promise looks like a
              printing fault on a document a customer is handed.
            */}
            <View wrap={false}>
              <Text style={s.section}>WHAT&apos;S INCLUDED / NOT INCLUDED</Text>
              <View style={s.lists}>
                <View style={s.listCol}>
                  {doc.included.map((item) => (
                    <ListItem key={item} mark="+" text={item} tone="#15803d" />
                  ))}
                </View>
                <View style={s.listCol}>
                  {doc.excluded.map((item) => (
                    <ListItem key={item} mark="-" text={item} tone={FAINT} />
                  ))}
                </View>
              </View>
            </View>
          </>
        )}

        <View wrap={false}>
          <Text style={s.section}>COST</Text>
          {/*
            No itemisation, by decision: the agent quotes one number to their
            customer, and a line-by-line build-up only invites being negotiated
            line by line. What the customer genuinely needs is what the price
            covers and what happens past it, which is stated below.
          */}
          <View style={s.costRow}>
            <Text style={s.costDesc}>Total</Text>
            <Text style={s.costAmt}>{formatMinor(totals.netMinor)}</Text>
          </View>
          <View style={s.costRow}>
            <Text style={s.costDesc}>GST {formatBps(totals.gstBps)}</Text>
            <Text style={s.costAmt}>{formatMinor(totals.gstMinor)}</Text>
          </View>
          <View style={s.grand}>
            <Text style={s.grandLabel}>Grand total</Text>
            <Text style={s.grandAmt}>{formatMinor(totals.grossMinor)}</Text>
          </View>
        </View>

        {/*
          A fallback only. Where there is a day plan the same facts are stated
          in WHAT'S INCLUDED above, and repeating them on a one-page document
          is noise. Quotes saved before the itinerary builder have terms but no
          plan, and those must still say what the price covers.
        */}
        {!doc &&
          (q.terms?.includedKm != null ||
            q.terms?.extraKmRateMinor != null ||
            q.terms?.includesTollParking ||
            (q.terms?.permitStates?.length ?? 0) > 0) && (
            <View style={s.termsBox}>
              <Text style={s.termsLabel}>WHAT THIS INCLUDES</Text>
              {q.terms?.includedKm != null && (
                <Text style={s.termsText}>
                  {q.terms!.includedKm!.toLocaleString("en-IN")} km over the hire, depot to depot.
                </Text>
              )}
              {q.terms?.extraKmRateMinor != null && (
                <Text style={s.termsText}>
                  Beyond that, {formatMinor(q.terms!.extraKmRateMinor!)} per km.
                </Text>
              )}
              {q.terms?.includesTollParking && (
                <Text style={s.termsText}>Toll and parking are included.</Text>
              )}
              {(q.terms?.permitStates?.length ?? 0) > 0 && (
                <Text style={s.termsText}>
                  Interstate permits for {q.terms!.permitStates!.join(" and ")} are included.
                </Text>
              )}
            </View>
          )}

        <View style={s.foot} fixed>
          <Text style={s.footText}>
            This is a quotation and not a confirmed booking. Prices are held for the dates shown
            and remain subject to availability at the time of booking.
          </Text>
          <Text style={s.footAgency}>{q.agencyName}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<QuoteDocument {...input} />);
}
