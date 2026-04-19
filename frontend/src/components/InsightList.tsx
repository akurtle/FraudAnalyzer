import type { InsightEntry } from "@/lib/types";

interface InsightListProps {
  entries: InsightEntry[];
  emptyLabel: string;
}

export default function InsightList({ entries, emptyLabel }: InsightListProps) {
  if (entries.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="insight-list">
      {entries.map((entry) => (
        <div className="insight-row" key={entry.label}>
          <div>
            <strong>{entry.label}</strong>
            <span>{entry.alerts} alerts</span>
          </div>
          <span>{entry.score.toFixed(2)} risk score</span>
        </div>
      ))}
    </div>
  );
}
