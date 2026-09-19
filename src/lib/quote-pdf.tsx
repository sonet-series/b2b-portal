import path from "node:path";
import { existsSync } from "node:fs";
import React from "react";
import {
  Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer,
} from "@react-pdf/renderer";
import { formatMinor } from "./money";
import { withGst, formatBps } from "./settings-shared";
import { formatDateDisplay } from "./dates";
import type { VehicleLeg, ItineraryDay } from "./quote-types";

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
  page: { fontFamily: "Noto", fontSize: 9, color: INK, paddingTop: 34, paddingBottom: 48, paddingHorizontal: 38 },

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

  section: { fontSize: 7.5, letterSpacing: 1.2, color: FAINT, fontWeight: "bold", marginTop: 20, marginBottom: 7 },

  day: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 7 },
  dayNum: { width: 46 },
  dayNumText: { fontSize: 6.5, letterSpacing: 0.7, color: FAINT, fontWeight: "bold" },
  dayDate: { fontSize: 8, color: MUTED, marginTop: 1 },
  dayBody: { flex: 1, paddingRight: 10 },
  dayRoute: { fontSize: 10, fontWeight: "bold" },
  dayDetail: { fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.45 },
  dayKm: { width: 58, textAlign: "right", fontSize: 9, color: MUTED },

  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  totalLabel: { fontSize: 9, color: MUTED },
  totalStrong: { fontSize: 9, fontWeight: "bold" },

  costRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 6 },
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
  legs: VehicleLeg[];
  totalMinor: number;
  /** Basis points of GST to apply to `totalMinor`. */
  gstBps: number;
  /** What the price covers, stated rather than itemised. */
  terms?: { includedKm?: number; extraKmRateMinor?: number };
};

function Fact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? [s.fact, s.factLast] : s.fact}>
      <Text style={s.factLabel}>{label.toUpperCase()}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

function QuoteDocument(q: QuotePdfInput) {
  const totals = withGst(q.totalMinor, q.gstBps);
  const kmFor = (i: number) =>
    q.legs.filter((l) => l.dayIndex === i).reduce((sum, l) => sum + l.km + l.bufferKm, 0);
  const positioningKm = q.legs
    .filter((l) => l.dayIndex === -1)
    .reduce((sum, l) => sum + l.km + l.bufferKm, 0);
  const totalKm = q.legs.reduce((sum, l) => sum + l.km + l.bufferKm, 0);
  const haveDayTotals = q.legs.some((l) => typeof l.dayIndex === "number");

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
  if (q.party) facts.push({ label: "Travellers", value: q.party });
  if (totalKm > 0) facts.push({ label: "Distance", value: `${totalKm.toLocaleString("en-IN")} km` });

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

        {q.days.length > 0 && (
          <>
            <Text style={s.section}>DETAILED ITINERARY</Text>
            {q.days.map((d, i) => {
              const local = d.from === d.to;
              const via = d.via.filter((v) => v.trim() !== "");
              const km = kmFor(i);
              return (
                <View key={i} style={s.day} wrap={false}>
                  <View style={s.dayNum}>
                    <Text style={s.dayNumText}>DAY {i + 1}</Text>
                    <Text style={s.dayDate}>{formatDateDisplay(new Date(`${d.date}T00:00:00Z`)).slice(0, 5)}</Text>
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
                    <Text style={s.dayRoute}>{local ? d.from : `${d.from} to ${d.to}`}</Text>
                    {via.length > 0 && (
                      <Text style={s.dayDetail}>
                        {local ? "Excursion to " : "Via "}
                        {via.join(", ")}
                      </Text>
                    )}
                    {d.notes ? <Text style={s.dayDetail}>{d.notes}</Text> : null}
                    {local && via.length === 0 && !d.notes ? (
                      <Text style={s.dayDetail}>At leisure</Text>
                    ) : null}
                    {d.bufferKm > 0 ? (
                      <Text style={s.dayDetail}>Includes {d.bufferKm} km local sightseeing</Text>
                    ) : null}
                  </View>
                  {haveDayTotals && (
                    <Text style={s.dayKm}>{km > 0 ? `${km.toLocaleString("en-IN")} km` : "—"}</Text>
                  )}
                </View>
              );
            })}

            {haveDayTotals && positioningKm > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Vehicle positioning to and from base</Text>
                <Text style={s.totalLabel}>{positioningKm.toLocaleString("en-IN")} km</Text>
              </View>
            )}
            {totalKm > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalStrong}>Total distance</Text>
                <Text style={s.totalStrong}>{totalKm.toLocaleString("en-IN")} km</Text>
              </View>
            )}
          </>
        )}

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

        {(q.terms?.includedKm != null || q.terms?.extraKmRateMinor != null) && (
          <View style={s.termsBox}>
            <Text style={s.termsLabel}>WHAT THIS INCLUDES</Text>
            {q.terms.includedKm != null && (
              <Text style={s.termsText}>
                {q.terms.includedKm.toLocaleString("en-IN")} km over the hire, depot to depot.
              </Text>
            )}
            {q.terms.extraKmRateMinor != null && (
              <Text style={s.termsText}>
                Beyond that, {formatMinor(q.terms.extraKmRateMinor)} per km.
              </Text>
            )}
            <Text style={s.termsText}>
              Toll, parking and interstate permits are charged at actuals unless stated otherwise.
            </Text>
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
