import type { Metadata } from "next";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Series Tours B2B Portal",
  description: "Instant quotes for approved travel agents.",
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Series Tours</h1>
        <p className="mt-1 text-slate-600">B2B agent portal</p>
        <p className="mt-4 text-sm text-slate-500">
          Instant quotes on vehicles, houseboats, hotels, and packages — for approved travel agents.
        </p>

        <div className="mt-8 flex justify-center gap-3">
          <LinkButton href="/login" tone="primary">
            Sign in
          </LinkButton>
          <LinkButton href="/register">Register your agency</LinkButton>
        </div>
      </div>
    </main>
  );
}
