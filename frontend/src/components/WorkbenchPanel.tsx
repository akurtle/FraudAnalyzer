import type { ChangeEvent, FormEventHandler } from "react";

import type { AlertFilters, AlertResponse } from "@/lib/types";

interface WorkbenchPanelProps {
  filters: AlertFilters;
  alerts: AlertResponse[];
  message: string | null;
  isLoading: boolean;
  onFilterChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClear: () => void;
  onStatusChange: (alertId: number, analystStatus: string) => void;
}

export default function WorkbenchPanel({
  filters,
  alerts,
  message,
  isLoading,
  onFilterChange,
  onSubmit,
  onClear,
  onStatusChange,
}: WorkbenchPanelProps) {
  return (
    <section className="workbench-panel">
      <div className="panel-heading">
        <span className="section-tag">Analyst Workbench</span>
        <h3>Filter and triage alerts</h3>
      </div>

      <form className="upload-form compact-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <label>
            <span>Partition</span>
            <input
              type="text"
              name="source_partition"
              value={filters.source_partition}
              placeholder="tenant-a"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Severity</span>
            <input
              type="text"
              name="severity"
              value={filters.severity}
              placeholder="high"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Rule</span>
            <input
              type="text"
              name="rule_name"
              value={filters.rule_name}
              placeholder="amount_spike"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Account</span>
            <input
              type="text"
              name="account_id"
              value={filters.account_id}
              placeholder="acct-1"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Merchant</span>
            <input
              type="text"
              name="merchant_id"
              value={filters.merchant_id}
              placeholder="merchant-10"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Window</span>
            <input
              type="number"
              name="window_hours"
              min="1"
              value={filters.window_hours}
              placeholder="24"
              onChange={onFilterChange}
            />
          </label>

          <label>
            <span>Analyst Status</span>
            <select
              name="analyst_status"
              value={filters.analyst_status}
              onChange={onFilterChange}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
        </div>

        <div className="button-row">
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Loading..." : "Apply Filters"}
          </button>
          <button type="button" className="secondary-button" disabled={isLoading} onClick={onClear}>
            Clear
          </button>
        </div>
      </form>

      {message ? (
        <p className="empty-state">{message}</p>
      ) : alerts.length === 0 ? (
        <p className="empty-state">No alerts matched the current filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Partition</th>
                <th>Transaction</th>
                <th>Account</th>
                <th>Merchant</th>
                <th>Rule</th>
                <th>Severity</th>
                <th>Explanation</th>
                <th>Triage</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <code>{alert.source_partition}</code>
                  </td>
                  <td>
                    <code>{alert.transaction_id}</code>
                  </td>
                  <td>
                    <code>{alert.account_id}</code>
                  </td>
                  <td>
                    <code>{alert.merchant_id}</code>
                  </td>
                  <td>{alert.rule_name}</td>
                  <td>
                    <span className="severity-chip">{alert.severity}</span>
                  </td>
                  <td>{String(alert.details.explanation || "No explanation")}</td>
                  <td>
                    <select
                      className="status-select"
                      value={alert.analyst_status}
                      onChange={(event) => onStatusChange(alert.id, event.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
