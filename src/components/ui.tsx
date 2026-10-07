import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Small, deliberately plain form and layout primitives.
 *
 * This admin is used by one person entering catalogue data. It optimises for
 * dense, legible, keyboard-friendly forms over visual polish.
 */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-slate-200 pb-5">
      <div className="min-w-0">
        {/* tracking-tight: at this size the default letter-spacing reads loose
            and makes a two-word title look like two separate things. */}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2.5">{action}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        // ring rather than border: it does not take part in layout, so a card
        // never shifts its contents by a pixel when one is added or removed.
        "rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/*
 * One base, three tones, three sizes.
 *
 * `active:` states matter more here than hover does: most of this app is used
 * on a laptop trackpad where a click is a press, and a control that does not
 * visibly depress leaves people clicking twice. Half of the double-submitted
 * forms in any admin are this.
 *
 * `select-none` because a button whose label highlights blue on a slightly
 * dragged click looks broken, and a drag is what a trackpad produces.
 */
const buttonBase =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-medium " +
  "transition-[background-color,box-shadow,border-color,color] duration-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "disabled:pointer-events-none disabled:opacity-45";

const buttonSizes = {
  /** Row actions inside a table, where a full-size button would crowd it. */
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
  /** The one thing a page is for — Get quote, Save, Confirm. */
  lg: "px-5 py-2.5 text-sm",
};

const buttonTones = {
  /*
   * A shadow, not just a fill. On a page that is mostly white cards, a flat
   * blue rectangle reads as a coloured div; the lift is what says "press me".
   * It deepens on hover and collapses on press.
   */
  primary:
    "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700 hover:shadow " +
    "active:bg-blue-800 active:shadow-none",
  secondary:
    "bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 " +
    "hover:bg-slate-50 hover:ring-slate-400 active:bg-slate-100 active:shadow-none",
  danger:
    "bg-white text-red-700 shadow-sm ring-1 ring-inset ring-red-300 " +
    "hover:bg-red-50 hover:ring-red-400 active:bg-red-100 active:shadow-none",
  /*
   * SOLID red, for the one button that destroys something after it has
   * already been confirmed. Deliberately not the default `danger`: if every
   * delete link were solid red the page would look like a warning, and the
   * colour would stop meaning anything on the one that matters.
   */
  destructive:
    "bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700 hover:shadow " +
    "active:bg-red-800 active:shadow-none",
  /** No chrome at all — for a third action that must not compete. */
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
};

export function Button({
  tone = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  tone?: keyof typeof buttonTones;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <button className={cx(buttonBase, buttonSizes[size], buttonTones[tone], className)} {...props} />
  );
}

export function LinkButton({
  tone = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  tone?: keyof typeof buttonTones;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <Link className={cx(buttonBase, buttonSizes[size], buttonTones[tone], className)} {...props} />
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

/*
 * `hover:ring-slate-400` is the point of this: a field that reacts to the
 * cursor tells you it is editable before you click it, which matters on
 * screens like the itinerary builder where read-only chained values ("from
 * Munnar, carried over from day 1") sit directly beside fields you type in.
 * Sonet reported exactly that confusion on 21 Sept.
 */
const controlBase =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset " +
  "transition-shadow placeholder:text-slate-400 hover:ring-slate-400 " +
  "focus:ring-2 focus:ring-inset focus:ring-blue-600 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function FieldShell({
  label,
  name,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  error,
  required,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; hint?: string; error?: string }) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required}>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        className={cx(controlBase, error ? "ring-red-400" : "ring-slate-300")}
        {...props}
      />
    </FieldShell>
  );
}

/** Money input. Admin types rupees; the action converts to paise. */
export function MoneyField(props: ComponentProps<typeof Field>) {
  return (
    <Field
      inputMode="decimal"
      placeholder="0"
      {...props}
      label={`${props.label} (₹)`}
    />
  );
}

export function FileField({
  label,
  name,
  hint,
  error,
  required,
  accept,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  required?: boolean;
  accept?: string;
}) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required}>
      <input
        id={name}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cx(
          "block w-full cursor-pointer rounded-md text-sm text-slate-700",
          "file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100",
          "file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700",
          "hover:file:bg-slate-200",
          error && "ring-1 ring-red-400"
        )}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  name,
  hint,
  error,
  required,
  ...props
}: ComponentProps<"textarea"> & { label: string; name: string; hint?: string; error?: string }) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={cx(controlBase, error ? "ring-red-400" : "ring-slate-300")}
        {...props}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  name,
  hint,
  error,
  required,
  options,
  ...props
}: Omit<ComponentProps<"select">, "children"> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required}>
      <select
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        className={cx(controlBase, "bg-white", error ? "ring-red-400" : "ring-slate-300")}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({
  label,
  name,
  hint,
  defaultChecked,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      {/*
        Row hover is an INSET SHADOW, not a background colour.
        Callers already paint rows to mean something — red for a line selling
        below cost, slate for an archived vehicle — and a hover background
        would replace that colour, hiding the very thing the row is flagging.
        An inset shadow darkens whatever is underneath instead of displacing
        it, so the meaning survives the cursor.
      */}
      <table className="min-w-full divide-y divide-slate-200 text-sm [&_tbody_tr]:transition-shadow [&_tbody_tr:hover]:shadow-[inset_0_0_0_9999px_rgba(15,23,42,0.025)]">
        <thead className="bg-slate-50/80">
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-top text-slate-700", className)}>{children}</td>;
}
