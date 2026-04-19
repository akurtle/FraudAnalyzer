export default function ArchitecturePanel() {
  return (
    <article className="panel architecture-panel">
      <div className="panel-heading">
        <span className="section-tag">Architecture Snapshot</span>
        <h2>How The System Flows</h2>
      </div>

      <ol className="architecture-list">
        <li>Frontend uploads a CSV batch with optional batch-size and retry overrides.</li>
        <li>
          FastAPI validates schema, applies partition assignment, and processes records in
          configurable chunks.
        </li>
        <li>
          PostgreSQL stores partitioned transactions and persisted alert records for downstream
          review.
        </li>
        <li>
          Pandas computes rolling amount spikes and velocity spikes within each tenant partition
          only.
        </li>
        <li>The UI renders alert counts, triggered rules, and the top suspicious events.</li>
      </ol>

      <div className="partition-badge-row">
        <span>tenant-a</span>
        <span>tenant-b</span>
        <span>tenant-c</span>
      </div>
    </article>
  );
}
