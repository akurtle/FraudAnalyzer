export const POLL_INTERVAL_MS = 1200;

export function formatStage(stage?: string | null): string {
  return String(stage || "queued").replaceAll("_", " ");
}

export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) {
    return "No prior run";
  }

  return `${delta >= 0 ? "+" : ""}${delta}`;
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

export function getAlertExplanation(details: Record<string, unknown>): string {
  const explanation = details.explanation;
  return typeof explanation === "string" && explanation.trim()
    ? explanation
    : "No explanation provided";
}

export function getAlertDetailSummary(details: Record<string, unknown>): string {
  const entries = Object.entries(details)
    .filter(([key]) => key !== "explanation")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0 ? entries.join(" | ") : "No details";
}
