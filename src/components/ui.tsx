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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
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

const buttonBase =
  "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const buttonTones = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50",
};

export function Button({
  tone = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: keyof typeof buttonTones }) {
  return <button className={cx(buttonBase, buttonTones[tone], className)} {...props} />;
}

export function LinkButton({
  tone = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: keyof typeof buttonTones }) {
  return <Link className={cx(buttonBase, buttonTones[tone], className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const controlBase =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset " +
  "placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600";

function Wrapper({
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
    <Wrapper label={label} name={name} hint={hint} error={error} required={required}>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        className={cx(controlBase, error ? "ring-red-400" : "ring-slate-300")}
        {...props}
      />
    </Wrapper>
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

export function TextArea({
  label,
  name,
  hint,
  error,
  required,
  ...props
}: ComponentProps<"textarea"> & { label: string; name: string; hint?: string; error?: string }) {
  return (
    <Wrapper label={label} name={name} hint={hint} error={error} required={required}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={cx(controlBase, error ? "ring-red-400" : "ring-slate-300")}
        {...props}
      />
    </Wrapper>
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
    <Wrapper label={label} name={name} hint={hint} error={error} required={required}>
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
    </Wrapper>
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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
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
  return <td className={cx("px-4 py-2.5 align-top text-slate-700", className)}>{children}</td>;
}
