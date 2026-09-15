export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="container mx-auto px-4 py-16">
      <div className="h-1 w-full overflow-hidden rounded bg-secondary">
        <div className="h-full w-1/3 animate-pulse bg-primary" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Loading page…</p>
    </div>
  );
}