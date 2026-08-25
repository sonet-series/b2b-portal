import type { ReactNode } from "react";
import { Button, Card } from "@/components/ui";

/**
 * Quote inputs live in the query string (method="get"), not component state,
 * so a priced result can be refreshed, bookmarked, and shared with a colleague.
 */
export function SearchForm({ children }: { children: ReactNode }) {
  return (
    <Card className="mb-6">
      <form method="get" className="space-y-4">
        {children}
        <Button type="submit">Get quote</Button>
      </form>
    </Card>
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
