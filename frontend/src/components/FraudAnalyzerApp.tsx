import { startTransition, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEventHandler } from "react";

import ArchitecturePanel from "@/components/ArchitecturePanel";
import HeroSection from "@/components/HeroSection";
import ResultsPanel from "@/components/ResultsPanel";
import UploadPanel from "@/components/UploadPanel";
import {
  checkHealth,
  fetchAlerts,
  fetchDemoFile,
  fetchJob,
  fetchRuns,
  patchAlertStatus,
  submitAnalysisJob,
} from "@/lib/api";
import { buildCsv, flattenAlerts, triggerDownload } from "@/lib/export";
import { normalizeError, POLL_INTERVAL_MS } from "@/lib/format";
import type {
  AlertFilters,
  AlertResponse,
  AnalysisJobResponse,
  AnalysisRunResponse,
  ApiStatus,
  UploadAnalysisResponse,
  UploadFormValues,
} from "@/lib/types";

const defaultUploadForm: UploadFormValues = {
  sourcePartition: "",
  batchSize: "250",
  timeWindows: "1,24,72",
  maxRetries: "3",
  file: null,
};

const defaultFilters: AlertFilters = {
  source_partition: "",
  severity: "",
  rule_name: "",
  account_id: "",
  merchant_id: "",
  window_hours: "",
  analyst_status: "",
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function updateAlertsWithStatus(alerts: AlertResponse[], alertId: number, analystStatus: string) {
  return alerts.map((alert) =>
    alert.id === alertId
      ? {
          ...alert,
          analyst_status: analystStatus,
          details: {
            ...alert.details,
            analyst_status: analystStatus,
          },
        }
      : alert,
  );
}

function updateResultWithStatus(
  result: UploadAnalysisResponse | null,
  alertId: number,
  analystStatus: string,
) {
  if (!result) {
    return result;
  }

  return {
    ...result,
    partitions: result.partitions.map((partition) => ({
      ...partition,
      alerts: updateAlertsWithStatus(partition.alerts, alertId, analystStatus),
    })),
  };
}

export default function FraudAnalyzerApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [uploadForm, setUploadForm] = useState<UploadFormValues>(defaultUploadForm);
  const [filters, setFilters] = useState<AlertFilters>(defaultFilters);
  const [jobProgress, setJobProgress] = useState<AnalysisJobResponse | null>(null);
  const [currentResult, setCurrentResult] = useState<UploadAnalysisResponse | null>(null);
  const [previousRun, setPreviousRun] = useState<AnalysisRunResponse | null>(null);
  const [currentWorkbenchAlerts, setCurrentWorkbenchAlerts] = useState<AlertResponse[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [workbenchMessage, setWorkbenchMessage] = useState<string | null>(
    "Upload a batch to start triaging alerts.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    try {
      await checkHealth();
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }

    await loadAlerts(defaultFilters);
  }

  async function loadAlerts(activeFilters: AlertFilters) {
    setIsLoadingAlerts(true);

    try {
      const alerts = await fetchAlerts(activeFilters);
      setCurrentWorkbenchAlerts(alerts);
      setWorkbenchMessage(alerts.length === 0 ? "No alerts matched the current filters." : null);
    } catch (error) {
      setCurrentWorkbenchAlerts([]);
      setWorkbenchMessage(normalizeError(error));
    } finally {
      setIsLoadingAlerts(false);
    }
  }

  async function loadPreviousRun(currentRunId: string) {
    try {
      const runs = await fetchRuns(5);
      const previousCompletedRun =
        runs.find((run) => run.run_id !== currentRunId && run.status === "completed") || null;
      setPreviousRun(previousCompletedRun);
    } catch {
      setPreviousRun(null);
    }
  }

  async function pollJob(jobId: string) {
    while (true) {
      const payload = await fetchJob(jobId);
      setJobProgress(payload);

      if (payload.status === "completed") {
        if (!payload.result) {
          throw new Error("Analysis job completed without a result payload.");
        }
        return payload.result;
      }

      if (payload.status === "failed") {
        throw new Error(payload.error_message || "Analysis job failed.");
      }

      setResultMessage(`Job ${payload.job_id} is ${payload.status}. Refreshing results...`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  function handleUploadFieldChange(event: ChangeEvent<HTMLInputElement>) {
    const field = event.target.name as keyof Omit<UploadFormValues, "file">;
    const value = event.target.value;

    setUploadForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setUploadForm((current) => ({
      ...current,
      file,
    }));
  }

  async function handleLoadDemo() {
    try {
      const file = await fetchDemoFile();
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
      }

      setUploadForm((current) => ({
        ...current,
        file,
      }));
      setResultMessage("Demo CSV loaded into the form. Run fraud analysis when you're ready.");
    } catch (error) {
      setResultMessage(normalizeError(error));
    }
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (!uploadForm.file) {
      setResultMessage("Select a CSV file before running analysis.");
      return;
    }

    setIsSubmitting(true);
    setJobProgress(null);
    setResultMessage("Submitting analysis job...");

    try {
      const accepted = await submitAnalysisJob(uploadForm);
      setResultMessage(`Job ${accepted.job_id} accepted. Waiting for analysis to finish...`);

      const result = await pollJob(accepted.job_id);

      startTransition(() => {
        setCurrentResult(result);
        setResultMessage(null);
      });

      await loadPreviousRun(accepted.run_id);
      await loadAlerts(filters);
    } catch (error) {
      setResultMessage(normalizeError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  function handleFilterChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const field = event.target.name as keyof AlertFilters;
    const value = event.target.value;

    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const handleFilterSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    await loadAlerts(filters);
  };

  async function handleClearFilters() {
    setFilters(defaultFilters);
    await loadAlerts(defaultFilters);
  }

  async function handleStatusChange(alertId: number, analystStatus: string) {
    try {
      await patchAlertStatus(alertId, analystStatus);
      setCurrentWorkbenchAlerts((current) => updateAlertsWithStatus(current, alertId, analystStatus));
      setCurrentResult((current) => updateResultWithStatus(current, alertId, analystStatus));
      await loadAlerts(filters);
    } catch (error) {
      setResultMessage(normalizeError(error));
    }
  }

  function handleExportJson() {
    const payload = currentResult || { alerts: flattenAlerts(currentResult, currentWorkbenchAlerts) };
    triggerDownload(
      "fraud-analysis-results.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function handleExportCsv() {
    const alerts = flattenAlerts(currentResult, currentWorkbenchAlerts);
    if (alerts.length === 0) {
      setWorkbenchMessage("No alerts available to export.");
      return;
    }

    triggerDownload("fraud-alerts.csv", buildCsv(alerts), "text/csv;charset=utf-8");
  }

  return (
    <main className="page-shell">
      <HeroSection apiStatus={apiStatus} />

      <section className="grid-layout">
        <UploadPanel
          fileInputRef={fileInputRef}
          values={uploadForm}
          isSubmitting={isSubmitting}
          progress={jobProgress}
          onFieldChange={handleUploadFieldChange}
          onFileChange={handleFileChange}
          onSubmit={handleSubmit}
          onLoadDemo={handleLoadDemo}
        />
        <ArchitecturePanel />
      </section>

      <ResultsPanel
        result={currentResult}
        resultMessage={resultMessage}
        previousRun={previousRun}
        alerts={currentWorkbenchAlerts}
        filters={filters}
        workbenchMessage={workbenchMessage}
        isLoadingAlerts={isLoadingAlerts}
        onFilterChange={handleFilterChange}
        onFilterSubmit={handleFilterSubmit}
        onFilterClear={handleClearFilters}
        onStatusChange={handleStatusChange}
        onExportJson={handleExportJson}
        onExportCsv={handleExportCsv}
      />

      <section className="footer-note">
        <p>
          Backend API: <code>uvicorn app.main:app --reload</code> from{" "}
          <code>C:\Projects\FraudAnalyzer\backend</code>. Frontend source:{" "}
          <code>C:\Projects\FraudAnalyzer\frontend</code>.
        </p>
      </section>
    </main>
  );
}
