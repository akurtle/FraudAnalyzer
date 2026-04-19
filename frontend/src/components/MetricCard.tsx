interface MetricCardProps {
  label: string;
  value: number | string;
  delta?: number | null;
  deltaLabel?: string;
}

export default function MetricCard({ label, value, delta, deltaLabel }: MetricCardProps) {
  const computedDeltaLabel =
    deltaLabel !== undefined
      ? deltaLabel
      : delta !== null && delta !== undefined
        ? delta >= 0
          ? `+${delta}`
          : `${delta}`
        : null;

  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {computedDeltaLabel ? <small>{computedDeltaLabel}</small> : null}
    </article>
  );
}
