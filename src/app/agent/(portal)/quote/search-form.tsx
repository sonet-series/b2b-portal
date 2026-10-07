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
        {/*
          The one thing this page exists to do, so it is sized like it.
          At the default size it sat in a form of a dozen identically-sized
          controls and read as one more of them.
        */}
        <Button type="submit" size="lg">
          Get quote
        </Button>
      </form>
    </Card>
  );
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
