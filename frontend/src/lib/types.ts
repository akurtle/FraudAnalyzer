export type ApiStatus = "checking" | "online" | "offline";

export interface AlertResponse {
  id: number;
  source_partition: string;
  transaction_id: string;
  account_id: string;
  merchant_id: string;
  rule_name: string;
  severity: string;
  analyst_status: string;
  score: number;
  window_hours: number;
  details: Record<string, unknown>;
  created_at: string;
}

export interface PartitionSummaryResponse {
  source_partition: string;
  processed_records: number;
  transaction_count: number;
  alert_count: number;
  rules_triggered: Record<string, number>;
  alerts: AlertResponse[];
}

export interface UploadAnalysisResponse {
  processed_partitions: number;
  processed_records: number;
  total_alerts: number;
  partitions: PartitionSummaryResponse[];
}

export interface AnalysisJobAcceptedResponse {
  job_id: string;
  run_id: string;
  status: string;
  submitted_at: string;
}

export interface AnalysisJobResponse {
  job_id: string;
  run_id: string | null;
  status: string;
  current_stage: string | null;
  progress_percentage: number | null;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result: UploadAnalysisResponse | null;
}

export interface AnalysisRunResponse {
  run_id: string;
  job_id: string | null;
  source_file_name: string | null;
  status: string;
  parameters: Record<string, unknown>;
  processed_partitions: number | null;
  processed_records: number | null;
  total_alerts: number | null;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface UploadFormValues {
  sourcePartition: string;
  batchSize: string;
  timeWindows: string;
  maxRetries: string;
  file: File | null;
}

export interface AlertFilters {
  source_partition: string;
  severity: string;
  rule_name: string;
  account_id: string;
  merchant_id: string;
  window_hours: string;
  analyst_status: string;
}

export interface InsightEntry {
  label: string;
  alerts: number;
  score: number;
}
