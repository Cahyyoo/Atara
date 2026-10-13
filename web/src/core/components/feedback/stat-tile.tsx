/** A small labelled number: a count in a summary row. */
export function StatTile({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2 text-left">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "error" ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{value}</p>
    </div>
  );
}
