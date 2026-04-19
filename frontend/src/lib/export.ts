import type { AlertResponse, UploadAnalysisResponse } from "@/lib/types";

export function flattenAlerts(
  result: UploadAnalysisResponse | null,
  workbenchAlerts: AlertResponse[],
): AlertResponse[] {
  if (workbenchAlerts.length > 0) {
    return workbenchAlerts;
  }

  if (!result) {
    return [];
  }

  return result.partitions.flatMap((partition) => partition.alerts);
}

export function buildCsv(alerts: AlertResponse[]): string {
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
      alert.analyst_status || "open",
      alert.score,
      alert.window_hours,
      String(alert.details.explanation || ""),
    ]
      .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
