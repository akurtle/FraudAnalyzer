const form = document.getElementById("upload-form");
const submitButton = document.getElementById("submit-button");
const resultsPanel = document.getElementById("results-panel");
const summaryCards = document.getElementById("summary-cards");
const partitionResults = document.getElementById("partition-results");
const workbenchResults = document.getElementById("workbench-results");
const apiStatus = document.getElementById("api-status");
const filterForm = document.getElementById("filter-form");
const clearFiltersButton = document.getElementById("clear-filters");
const progressCard = document.getElementById("job-progress-card");
const progressLabel = document.getElementById("job-progress-label");
const progressMeta = document.getElementById("job-progress-meta");
const progressFill = document.getElementById("job-progress-fill");
const pollIntervalMs = 1200;
let currentResult = null;

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
    submitButton.textContent = "Polling...";
    renderMessage(`Job ${payload.job_id} accepted. Waiting for analysis to finish...`);
    const result = await pollJob(payload.job_id);
    renderResults(result);
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

checkHealth();
loadAlerts().catch(() => {
  workbenchResults.innerHTML = `<p class="empty-state">Upload a batch to start triaging alerts.</p>`;
});
