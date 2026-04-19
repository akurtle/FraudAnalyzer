const form = document.getElementById("upload-form");
const submitButton = document.getElementById("submit-button");
const resultsPanel = document.getElementById("results-panel");
const summaryCards = document.getElementById("summary-cards");
const partitionResults = document.getElementById("partition-results");
const apiStatus = document.getElementById("api-status");
const pollIntervalMs = 1200;

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

async function pollJob(jobId) {
  while (true) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Unable to fetch analysis job status.");
    }

    if (payload.status === "completed") {
      return payload.result;
    }
    if (payload.status === "failed") {
      throw new Error(payload.error_message || "Analysis job failed.");
    }

    renderMessage(`Job ${payload.job_id} is ${payload.status}. Refreshing results...`);
    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  submitButton.textContent = "Queueing...";

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
  } catch (error) {
    renderMessage(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Run Fraud Analysis";
  }
});

checkHealth();
