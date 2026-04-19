import { getAlertDetailSummary, getAlertExplanation } from "@/lib/format";
import type {
  AlertFilters,
  AlertResponse,
  AnalysisRunResponse,
  PartitionSummaryResponse,
  UploadAnalysisResponse,
} from "@/lib/types";

import InsightList from "@/components/InsightList";
import MetricCard from "@/components/MetricCard";
import WorkbenchPanel from "@/components/WorkbenchPanel";

interface ResultsPanelProps {
  result: UploadAnalysisResponse | null;
  resultMessage: string | null;
  previousRun: AnalysisRunResponse | null;
  alerts: AlertResponse[];
  filters: AlertFilters;
  workbenchMessage: string | null;
  isLoadingAlerts: boolean;
  onFilterChange: WorkbenchPanelProps["onFilterChange"];
  onFilterSubmit: WorkbenchPanelProps["onSubmit"];
  onFilterClear: WorkbenchPanelProps["onClear"];
  onStatusChange: WorkbenchPanelProps["onStatusChange"];
  onExportJson: () => void;
  onExportCsv: () => void;
}

type WorkbenchPanelProps = React.ComponentProps<typeof WorkbenchPanel>;

function aggregateEntities(alerts: AlertResponse[], key: "account_id" | "merchant_id") {
  const counts = new Map<string, { label: string; alerts: number; score: number }>();

  for (const alert of alerts) {
    const label = alert[key];
    const current = counts.get(label) || { label, alerts: 0, score: 0 };
    current.alerts += 1;
    current.score += Number(alert.score || 0);
    counts.set(label, current);
  }

  return [...counts.values()].sort((left, right) => right.score - left.score).slice(0, 5);
}

function renderPartition(partition: PartitionSummaryResponse) {
  const ruleEntries = Object.entries(partition.rules_triggered || {});

  return (
    <article className="partition-card" key={partition.source_partition}>
      <header>
        <div>
          <span className="section-tag">{partition.source_partition}</span>
          <h3>{partition.source_partition}</h3>
        </div>
        <div className="partition-meta">
          <span className="detail-pill">Processed {partition.processed_records}</span>
          <span className="detail-pill">Transactions {partition.transaction_count}</span>
          <span className="detail-pill">Alerts {partition.alert_count}</span>
        </div>
      </header>

      <div className="partition-meta">
        {ruleEntries.length > 0 ? (
          ruleEntries.map(([rule, count]) => (
            <span className="rule-chip" key={`${partition.source_partition}-${rule}`}>
              {rule}: {count}
            </span>
          ))
        ) : (
          <span className="detail-pill">No rules triggered</span>
        )}
      </div>

      {partition.alerts.length === 0 ? (
        <p className="empty-state">
          No alerts were generated for this partition using the current thresholds.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Account</th>
                <th>Rule</th>
                <th>Severity</th>
                <th>Score</th>
                <th>Window</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {partition.alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <code>{alert.transaction_id}</code>
                  </td>
                  <td>
                    <code>{alert.account_id}</code>
                  </td>
                  <td>{alert.rule_name}</td>
                  <td>
                    <span className="severity-chip">{alert.severity}</span>
                  </td>
                  <td>{Number(alert.score).toFixed(2)}</td>
                  <td>{alert.window_hours}</td>
                  <td>
                    <strong>{getAlertExplanation(alert.details)}</strong>
                    <br />
                    <span>{getAlertDetailSummary(alert.details)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function ResultsPanel({
  result,
  resultMessage,
  previousRun,
  alerts,
  filters,
  workbenchMessage,
  isLoadingAlerts,
  onFilterChange,
  onFilterSubmit,
  onFilterClear,
  onStatusChange,
  onExportJson,
  onExportCsv,
}: ResultsPanelProps) {
  if (!result && !resultMessage) {
    return null;
  }

  const partitionAlerts = result?.partitions.flatMap((partition) => partition.alerts) || [];
  const partitionEntries =
    result?.partitions
      .map((partition) => ({
        label: partition.source_partition,
        alerts: partition.alert_count,
        score: partition.alerts.reduce((sum, alert) => sum + Number(alert.score || 0), 0),
      }))
      .sort((left, right) => right.score - left.score) || [];

  return (
    <section className="panel results-panel">
      <div className="panel-heading">
        <span className="section-tag">Analysis Output</span>
        <h2>Flagged Fraud Patterns</h2>
      </div>

      <div className="button-row export-row">
        <button type="button" onClick={onExportJson}>
          Download JSON
        </button>
        <button type="button" className="secondary-button" onClick={onExportCsv}>
          Download CSV
        </button>
      </div>

      {resultMessage && !result ? (
        <article className="partition-card">
          <p className="empty-state">{resultMessage}</p>
        </article>
      ) : null}

      {result ? (
        <>
          <section className="workbench-panel">
            <div className="panel-heading">
              <span className="section-tag">Risk Dashboard</span>
              <h3>Partition trends and high-risk entities</h3>
            </div>

            <div className="summary-cards">
              <MetricCard
                label="Alert Trend"
                value={result.total_alerts}
                deltaLabel={
                  previousRun?.total_alerts === null || previousRun?.total_alerts === undefined
                    ? "No prior run"
                    : `${result.total_alerts - previousRun.total_alerts >= 0 ? "+" : ""}${
                        result.total_alerts - previousRun.total_alerts
                      }`
                }
              />
              <MetricCard
                label="Record Trend"
                value={result.processed_records}
                deltaLabel={
                  previousRun?.processed_records === null ||
                  previousRun?.processed_records === undefined
                    ? "No prior run"
                    : `${result.processed_records - previousRun.processed_records >= 0 ? "+" : ""}${
                        result.processed_records - previousRun.processed_records
                      }`
                }
              />
              <MetricCard
                label="Partition Trend"
                value={result.processed_partitions}
                deltaLabel={
                  previousRun?.processed_partitions === null ||
                  previousRun?.processed_partitions === undefined
                    ? "No prior run"
                    : `${
                        result.processed_partitions - previousRun.processed_partitions >= 0 ? "+" : ""
                      }${result.processed_partitions - previousRun.processed_partitions}`
                }
              />
            </div>

            <div className="dashboard-grid">
              <article className="partition-card">
                <h3>Top Risky Accounts</h3>
                <InsightList
                  entries={aggregateEntities(partitionAlerts, "account_id")}
                  emptyLabel="No risky accounts yet."
                />
              </article>

              <article className="partition-card">
                <h3>Top Risky Merchants</h3>
                <InsightList
                  entries={aggregateEntities(partitionAlerts, "merchant_id")}
                  emptyLabel="No risky merchants yet."
                />
              </article>

              <article className="partition-card">
                <h3>Partition Spotlight</h3>
                <InsightList entries={partitionEntries} emptyLabel="No risky partitions yet." />
              </article>
            </div>
          </section>

          <WorkbenchPanel
            filters={filters}
            alerts={alerts}
            message={workbenchMessage}
            isLoading={isLoadingAlerts}
            onFilterChange={onFilterChange}
            onSubmit={onFilterSubmit}
            onClear={onFilterClear}
            onStatusChange={onStatusChange}
          />

          <div className="summary-cards">
            <MetricCard label="Partitions Processed" value={result.processed_partitions} />
            <MetricCard label="Records Processed" value={result.processed_records} />
            <MetricCard label="Total Alerts" value={result.total_alerts} />
          </div>

          <div className="partition-results">{result.partitions.map(renderPartition)}</div>
        </>
      ) : null}
    </section>
  );
}
