import type {
  AlertFilters,
  AlertResponse,
  AnalysisJobAcceptedResponse,
  AnalysisJobResponse,
  AnalysisRunResponse,
  UploadFormValues,
} from "@/lib/types";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String(payload.detail)
        : `Request failed with status ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

export async function checkHealth() {
  const response = await fetch("/api/health");
  await parseResponse<{ status: string }>(response);
}

export async function fetchDemoFile(): Promise<File> {
  const response = await fetch("/api/sample/demo-transactions.csv");
  if (!response.ok) {
    throw new Error("Unable to fetch bundled demo data.");
  }

  const blob = await response.blob();
  return new File([blob], "demo_transactions.csv", { type: "text/csv" });
}

export async function submitAnalysisJob(
  values: UploadFormValues,
): Promise<AnalysisJobAcceptedResponse> {
  if (!values.file) {
    throw new Error("Select a CSV file before running analysis.");
  }

  const formData = new FormData();
  formData.append("file", values.file);

  if (values.sourcePartition.trim()) {
    formData.append("source_partition", values.sourcePartition.trim());
  }
  if (values.batchSize.trim()) {
    formData.append("batch_size", values.batchSize.trim());
  }
  if (values.maxRetries.trim()) {
    formData.append("max_retries", values.maxRetries.trim());
  }
  if (values.timeWindows.trim()) {
    formData.append("time_windows", values.timeWindows.trim());
  }

  const response = await fetch("/api/analyze/upload", {
    method: "POST",
    body: formData,
  });

  return parseResponse<AnalysisJobAcceptedResponse>(response);
}

export async function fetchJob(jobId: string): Promise<AnalysisJobResponse> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  return parseResponse<AnalysisJobResponse>(response);
}

export async function fetchRuns(limit = 5): Promise<AnalysisRunResponse[]> {
  const response = await fetch(`/api/runs?limit=${limit}`);
  return parseResponse<AnalysisRunResponse[]>(response);
}

export async function fetchAlerts(filters: AlertFilters): Promise<AlertResponse[]> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (String(value).trim()) {
      params.set(key, value.trim());
    }
  }

  const response = await fetch(`/api/alerts?${params.toString()}`);
  return parseResponse<AlertResponse[]>(response);
}

export async function patchAlertStatus(
  alertId: number,
  analystStatus: string,
): Promise<AlertResponse> {
  const response = await fetch(`/api/alerts/${alertId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ analyst_status: analystStatus }),
  });

  return parseResponse<AlertResponse>(response);
}
