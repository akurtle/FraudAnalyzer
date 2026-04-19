import type { ChangeEvent, FormEventHandler, RefObject } from "react";

import { formatStage } from "@/lib/format";
import type { AnalysisJobResponse, UploadFormValues } from "@/lib/types";

interface UploadPanelProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  values: UploadFormValues;
  isSubmitting: boolean;
  progress: AnalysisJobResponse | null;
  onFieldChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onLoadDemo: () => void;
}

export default function UploadPanel({
  fileInputRef,
  values,
  isSubmitting,
  progress,
  onFieldChange,
  onFileChange,
  onSubmit,
  onLoadDemo,
}: UploadPanelProps) {
  const progressPercentage = Number(progress?.progress_percentage || 0);
  const submitLabel = isSubmitting ? "Polling..." : "Run Fraud Analysis";

  return (
    <article className="panel upload-panel">
      <div className="panel-heading">
        <span className="section-tag">Pipeline Input</span>
        <h2>Upload Transaction Batch</h2>
      </div>

      <form className="upload-form" onSubmit={onSubmit}>
        <label>
          <span>CSV File</span>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".csv"
            required
            onChange={onFileChange}
          />
          <small className="input-note">
            {values.file ? `Selected: ${values.file.name}` : "Select a CSV transaction batch."}
          </small>
        </label>

        <div className="two-column">
          <label>
            <span>Source Partition</span>
            <input
              type="text"
              name="sourcePartition"
              value={values.sourcePartition}
              placeholder="tenant-a"
              onChange={onFieldChange}
            />
          </label>

          <label>
            <span>Batch Size</span>
            <input
              type="number"
              name="batchSize"
              min="1"
              value={values.batchSize}
              onChange={onFieldChange}
            />
          </label>
        </div>

        <div className="two-column">
          <label>
            <span>Time Windows (hours)</span>
            <input
              type="text"
              name="timeWindows"
              value={values.timeWindows}
              onChange={onFieldChange}
            />
          </label>

          <label>
            <span>Max Retries</span>
            <input
              type="number"
              name="maxRetries"
              min="1"
              value={values.maxRetries}
              onChange={onFieldChange}
            />
          </label>
        </div>

        <div className="button-row">
          <button type="submit" disabled={isSubmitting}>
            {submitLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSubmitting}
            onClick={onLoadDemo}
          >
            Use Demo Sample
          </button>
        </div>
      </form>

      {progress ? (
        <div className="progress-card">
          <div className="progress-copy">
            <strong>Stage: {formatStage(progress.current_stage)}</strong>
            <span>{progressPercentage}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }} />
          </div>
        </div>
      ) : null}

      <div className="help-card">
        <h3>Expected CSV columns</h3>
        <p>
          Required: <code>transaction_id</code>, <code>account_id</code>, <code>merchant_id</code>,{" "}
          <code>amount</code>, <code>event_ts</code>.
        </p>
        <p>
          Optional: <code>source_partition</code>, <code>country_code</code>, <code>device_id</code>,{" "}
          <code>status</code>.
        </p>
        <p className="muted">
          If the CSV omits <code>source_partition</code>, the form value is applied to every
          record so analysis remains partition-isolated.
        </p>
      </div>
    </article>
  );
}
