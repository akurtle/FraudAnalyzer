const form = document.getElementById("upload-form");
const submitButton = document.getElementById("submit-button");
const resultsPanel = document.getElementById("results-panel");
const summaryCards = document.getElementById("summary-cards");
const partitionResults = document.getElementById("partition-results");
const workbenchResults = document.getElementById("workbench-results");
const dashboardCards = document.getElementById("dashboard-cards");
const topAccounts = document.getElementById("top-accounts");
const topMerchants = document.getElementById("top-merchants");
const topPartitions = document.getElementById("top-partitions");
const apiStatus = document.getElementById("api-status");
const filterForm = document.getElementById("filter-form");
const clearFiltersButton = document.getElementById("clear-filters");
const exportJsonButton = document.getElementById("export-json");
const exportCsvButton = document.getElementById("export-csv");
const progressCard = document.getElementById("job-progress-card");
const progressLabel = document.getElementById("job-progress-label");
const progressMeta = document.getElementById("job-progress-meta");
const progressFill = document.getElementById("job-progress-fill");
const pollIntervalMs = 1200;
let currentResult = null;
let currentWorkbenchAlerts = [];
let currentRunId = null;

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error("API unavailable");
    }
    apiStatus.textContent = "API online";
    apiStatus.classList.add("online");
  } catch (error) {
    apiStatus.textContent = "API offline";
    apiStatus.classList.add("offline");
  }
}

function metricCard(label, value) {
  return `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function metricCardWithDelta(label, value, delta) {
  const deltaLabel =
    delta === null || delta === undefined
      ? "No prior run"
      : `${delta >= 0 ? "+" : ""}${delta}`;
  return `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${escapeHtml(deltaLabel)}</small>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAlertRows(alerts) {
  return alerts
    .map((alert) => {
      const explanation = alert.details?.explanation || "No explanation provided";
      const details = Object.entries(alert.details || {})
        .filter(([key]) => key !== "explanation")
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");

      return `
        <tr>
          <td><code>${escapeHtml(alert.transaction_id)}</code></td>
          <td><code>${escapeHtml(alert.account_id)}</code></td>
          <td>${escapeHtml(alert.rule_name)}</td>
          <td><span class="severity-chip">${escapeHtml(alert.severity)}</span></td>
          <td>${Number(alert.score).toFixed(2)}</td>
          <td>${escapeHtml(String(alert.window_hours))}</td>
          <td>
            <strong>${escapeHtml(explanation)}</strong><br />
            <span>${escapeHtml(details || "No details")}</span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderWorkbenchRows(alerts) {
  return alerts
    .map(
      (alert) => `
        <tr>
          <td><code>${escapeHtml(alert.source_partition)}</code></td>
          <td><code>${escapeHtml(alert.transaction_id)}</code></td>
          <td><code>${escapeHtml(alert.account_id)}</code></td>
          <td><code>${escapeHtml(alert.merchant_id)}</code></td>
          <td>${escapeHtml(alert.rule_name)}</td>
          <td><span class="severity-chip">${escapeHtml(alert.severity)}</span></td>
          <td>${escapeHtml(alert.details?.explanation || "No explanation")}</td>
          <td>
            <select class="status-select" data-alert-id="${alert.id}">
              <option value="open" ${alert.analyst_status === "open" ? "selected" : ""}>Open</option>
              <option value="reviewed" ${alert.analyst_status === "reviewed" ? "selected" : ""}>Reviewed</option>
              <option value="dismissed" ${alert.analyst_status === "dismissed" ? "selected" : ""}>Dismissed</option>
            </select>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderPartition(partition) {
  const ruleSummary = Object.entries(partition.rules_triggered || {})
    .map(([rule, count]) => `<span class="rule-chip">${escapeHtml(rule)}: ${count}</span>`)
    .join("");

  const alertTable =
    partition.alerts.length === 0
      ? `<p class="empty-state">No alerts were generated for this partition using the current thresholds.</p>`
      : `
        <div class="table-wrap">
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
            <tbody>${renderAlertRows(partition.alerts)}</tbody>
          </table>
        </div>
      `;

  return `
    <article class="partition-card">
      <header>
        <div>
          <span class="section-tag">${escapeHtml(partition.source_partition)}</span>
          <h3>${escapeHtml(partition.source_partition)}</h3>
        </div>
        <div class="partition-meta">
          <span class="detail-pill">Processed ${partition.processed_records}</span>
          <span class="detail-pill">Transactions ${partition.transaction_count}</span>
          <span class="detail-pill">Alerts ${partition.alert_count}</span>
        </div>
      </header>
      <div class="partition-meta">${ruleSummary || '<span class="detail-pill">No rules triggered</span>'}</div>
      ${alertTable}
    </article>
  `;
}

function renderResults(data) {
  currentResult = data;
  resultsPanel.classList.remove("hidden");
  summaryCards.innerHTML = [
    metricCard("Partitions Processed", data.processed_partitions),
    metricCard("Records Processed", data.processed_records),
    metricCard("Total Alerts", data.total_alerts),
  ].join("");

  partitionResults.innerHTML = data.partitions.map(renderPartition).join("");
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function aggregateEntities(alerts, key) {
  const counts = new Map();
  alerts.forEach((alert) => {
    const entity = alert[key];
    const current = counts.get(entity) || { label: entity, alerts: 0, score: 0 };
    current.alerts += 1;
    current.score += Number(alert.score || 0);
    counts.set(entity, current);
  });
  return [...counts.values()].sort((left, right) => right.score - left.score).slice(0, 5);
}

function renderInsightList(target, entries, emptyLabel) {
  if (entries.length === 0) {
    target.innerHTML = `<p class="empty-state">${escapeHtml(emptyLabel)}</p>`;
    return;
  }

  target.innerHTML = entries
    .map(
      (entry) => `
        <div class="insight-row">
          <div>
            <strong>${escapeHtml(entry.label)}</strong>
            <span>${entry.alerts} alerts</span>
          </div>
          <span>${entry.score.toFixed(2)} risk score</span>
        </div>
      `,
    )
    .join("");
}

async function renderDashboard() {
  if (!currentResult) {
    dashboardCards.innerHTML = "";
    topAccounts.innerHTML = "";
    topMerchants.innerHTML = "";
    topPartitions.innerHTML = "";
    return;
  }

  const alerts = currentResult.partitions.flatMap((partition) => partition.alerts);
  const runsResponse = await fetch("/api/runs?limit=5");
  const runs = runsResponse.ok ? await runsResponse.json() : [];
  const previousRun = runs.find((run) => run.run_id !== currentRunId && run.status === "completed");
  const previousSummary = previousRun?.summary || null;

  dashboardCards.innerHTML = [
    metricCardWithDelta(
      "Alert Trend",
      currentResult.total_alerts,
      previousSummary ? currentResult.total_alerts - previousSummary.total_alerts : null,
    ),
    metricCardWithDelta(
      "Record Trend",
      currentResult.processed_records,
      previousSummary ? currentResult.processed_records - previousSummary.processed_records : null,
    ),
    metricCardWithDelta(
      "Partition Trend",
      currentResult.processed_partitions,
      previousSummary
        ? currentResult.processed_partitions - previousSummary.processed_partitions
        : null,
    ),
  ].join("");

  renderInsightList(topAccounts, aggregateEntities(alerts, "account_id"), "No risky accounts yet.");
  renderInsightList(topMerchants, aggregateEntities(alerts, "merchant_id"), "No risky merchants yet.");
  renderInsightList(
    topPartitions,
    currentResult.partitions
      .map((partition) => ({
        label: partition.source_partition,
        alerts: partition.alert_count,
        score: partition.alerts.reduce((sum, alert) => sum + Number(alert.score || 0), 0),
      }))
      .sort((left, right) => right.score - left.score),
    "No risky partitions yet.",
  );
}

function renderMessage(message) {
  resultsPanel.classList.remove("hidden");
  summaryCards.innerHTML = "";
  partitionResults.innerHTML = `<article class="partition-card"><p class="empty-state">${escapeHtml(message)}</p></article>`;
}

function formatStage(stage) {
  return String(stage || "queued").replaceAll("_", " ");
}

function renderProgress(job) {
  progressCard.classList.remove("hidden");
  const percentage = Number(job.progress_percentage || 0);
  progressLabel.textContent = `Stage: ${formatStage(job.current_stage)}`;
  progressMeta.textContent = `${percentage}%`;
  progressFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
}

function resetProgress() {
  progressLabel.textContent = "Waiting to start...";
  progressMeta.textContent = "0%";
  progressFill.style.width = "0%";
}

async function loadAlerts() {
  const formData = new FormData(filterForm);
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (String(value).trim()) {
      params.set(key, value);
    }
  }

  const response = await fetch(`/api/alerts?${params.toString()}`);
  const alerts = await response.json();
  if (!response.ok) {
    throw new Error(alerts.detail || "Unable to load alerts.");
  }
  currentWorkbenchAlerts = alerts;

  if (alerts.length === 0) {
    workbenchResults.innerHTML = `<p class="empty-state">No alerts matched the current filters.</p>`;
    return;
  }

  workbenchResults.innerHTML = `
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
      <tbody>${renderWorkbenchRows(alerts)}</tbody>
    </table>
  `;
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function flattenAlertsForExport() {
  if (currentWorkbenchAlerts.length > 0) {
    return currentWorkbenchAlerts;
  }
  if (!currentResult) {
    return [];
  }
  return currentResult.partitions.flatMap((partition) => partition.alerts);
}

function buildCsv(alerts) {
  const headers = [
    "id",
    "source_partition",
    "transaction_id",
    "account_id",
    "merchant_id",
    "rule_name",
    "severity",
    "analyst_status",
    "score",
    "window_hours",
    "explanation",
  ];
  const rows = alerts.map((alert) =>
    [
      alert.id,
      alert.source_partition,
      alert.transaction_id,
      alert.account_id,
      alert.merchant_id,
      alert.rule_name,
      alert.severity,
      alert.analyst_status || alert.details?.analyst_status || "open",
      alert.score,
      alert.window_hours,
      alert.details?.explanation || "",
    ]
      .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

async function updateAlertStatus(alertId, analystStatus) {
  const response = await fetch(`/api/alerts/${alertId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analyst_status: analystStatus }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || "Unable to update alert status.");
  }

  if (currentResult) {
    currentResult.partitions.forEach((partition) => {
      partition.alerts.forEach((alert) => {
        if (alert.id === Number(alertId)) {
          alert.analyst_status = analystStatus;
          alert.details.analyst_status = analystStatus;
        }
      });
    });
    partitionResults.innerHTML = currentResult.partitions.map(renderPartition).join("");
  }
}

async function pollJob(jobId) {
  while (true) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Unable to fetch analysis job status.");
    }

    if (payload.status === "completed") {
      renderProgress(payload);
      return payload.result;
    }
    if (payload.status === "failed") {
      renderProgress(payload);
      throw new Error(payload.error_message || "Analysis job failed.");
    }

    renderProgress(payload);
    renderMessage(`Job ${payload.job_id} is ${payload.status}. Refreshing results...`);
    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Queueing...";
  progressCard.classList.remove("hidden");
  resetProgress();

  const formData = new FormData(form);
  for (const [key, value] of [...formData.entries()]) {
    if (typeof value === "string" && value.trim() === "") {
      formData.delete(key);
    }
  }

  try {
    renderMessage("Submitting analysis job...");
    const response = await fetch("/api/analyze/upload", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Analysis failed.");
    }
    currentRunId = payload.run_id;
    submitButton.textContent = "Polling...";
    renderMessage(`Job ${payload.job_id} accepted. Waiting for analysis to finish...`);
    const result = await pollJob(payload.job_id);
    renderResults(result);
    await renderDashboard();
    await loadAlerts();
  } catch (error) {
    renderMessage(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run Fraud Analysis";
  }
});

filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadAlerts();
  } catch (error) {
    workbenchResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
});

clearFiltersButton.addEventListener("click", async () => {
  filterForm.reset();
  try {
    await loadAlerts();
  } catch (error) {
    workbenchResults.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
});

workbenchResults.addEventListener("change", async (event) => {
  if (!event.target.matches(".status-select")) {
    return;
  }
  const alertId = event.target.getAttribute("data-alert-id");
  try {
    await updateAlertStatus(alertId, event.target.value);
    await loadAlerts();
  } catch (error) {
    renderMessage(error.message);
  }
});

exportJsonButton.addEventListener("click", () => {
  const payload = currentResult || { alerts: flattenAlertsForExport() };
  triggerDownload(
    "fraud-analysis-results.json",
    JSON.stringify(payload, null, 2),
    "application/json",
  );
});

exportCsvButton.addEventListener("click", () => {
  const alerts = flattenAlertsForExport();
  if (alerts.length === 0) {
    workbenchResults.innerHTML = `<p class="empty-state">No alerts available to export.</p>`;
    return;
  }
  triggerDownload("fraud-alerts.csv", buildCsv(alerts), "text/csv;charset=utf-8");
});

checkHealth();
loadAlerts().catch(() => {
  workbenchResults.innerHTML = `<p class="empty-state">Upload a batch to start triaging alerts.</p>`;
});
