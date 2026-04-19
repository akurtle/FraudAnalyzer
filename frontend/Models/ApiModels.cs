using System.Text.Json;
using System.Text.Json.Serialization;

namespace FraudAnalyzer.App.Models;

public sealed record HealthResponse(
    [property: JsonPropertyName("status")] string Status);

public sealed record AnalysisJobAcceptedResponse(
    [property: JsonPropertyName("job_id")] string JobId,
    [property: JsonPropertyName("run_id")] string RunId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("submitted_at")] DateTimeOffset SubmittedAt);

public sealed class AnalysisJobResponse
{
    [JsonPropertyName("job_id")]
    public string JobId { get; init; } = string.Empty;

    [JsonPropertyName("run_id")]
    public string? RunId { get; init; }

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("current_stage")]
    public string? CurrentStage { get; init; }

    [JsonPropertyName("progress_percentage")]
    public int? ProgressPercentage { get; init; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; init; }

    [JsonPropertyName("result")]
    public UploadAnalysisResponse? Result { get; init; }
}

public sealed class UploadAnalysisResponse
{
    [JsonPropertyName("processed_partitions")]
    public int ProcessedPartitions { get; init; }

    [JsonPropertyName("processed_records")]
    public int ProcessedRecords { get; init; }

    [JsonPropertyName("total_alerts")]
    public int TotalAlerts { get; init; }

    [JsonPropertyName("partitions")]
    public List<PartitionSummaryResponse> Partitions { get; init; } = [];
}

public sealed class PartitionSummaryResponse
{
    [JsonPropertyName("source_partition")]
    public string SourcePartition { get; init; } = string.Empty;

    [JsonPropertyName("processed_records")]
    public int ProcessedRecords { get; init; }

    [JsonPropertyName("transaction_count")]
    public int TransactionCount { get; init; }

    [JsonPropertyName("alert_count")]
    public int AlertCount { get; init; }

    [JsonPropertyName("rules_triggered")]
    public Dictionary<string, int> RulesTriggered { get; init; } = [];

    [JsonPropertyName("alerts")]
    public List<AlertResponse> Alerts { get; init; } = [];
}

public sealed class AlertResponse
{
    [JsonPropertyName("id")]
    public int Id { get; init; }

    [JsonPropertyName("source_partition")]
    public string SourcePartition { get; init; } = string.Empty;

    [JsonPropertyName("transaction_id")]
    public string TransactionId { get; init; } = string.Empty;

    [JsonPropertyName("account_id")]
    public string AccountId { get; init; } = string.Empty;

    [JsonPropertyName("merchant_id")]
    public string MerchantId { get; init; } = string.Empty;

    [JsonPropertyName("rule_name")]
    public string RuleName { get; init; } = string.Empty;

    [JsonPropertyName("severity")]
    public string Severity { get; init; } = string.Empty;

    [JsonPropertyName("analyst_status")]
    public string AnalystStatus { get; set; } = "open";

    [JsonPropertyName("score")]
    public double Score { get; init; }

    [JsonPropertyName("window_hours")]
    public int WindowHours { get; init; }

    [JsonPropertyName("details")]
    public Dictionary<string, JsonElement> Details { get; init; } = [];

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; init; }
}

public sealed class AnalysisRunResponse
{
    [JsonPropertyName("run_id")]
    public string RunId { get; init; } = string.Empty;

    [JsonPropertyName("job_id")]
    public string? JobId { get; init; }

    [JsonPropertyName("source_file_name")]
    public string? SourceFileName { get; init; }

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("parameters")]
    public Dictionary<string, object?> Parameters { get; init; } = [];

    [JsonPropertyName("processed_partitions")]
    public int? ProcessedPartitions { get; init; }

    [JsonPropertyName("processed_records")]
    public int? ProcessedRecords { get; init; }

    [JsonPropertyName("total_alerts")]
    public int? TotalAlerts { get; init; }

    [JsonPropertyName("duration_ms")]
    public int? DurationMs { get; init; }

    [JsonPropertyName("summary")]
    public Dictionary<string, object?>? Summary { get; init; }
}

public sealed record AlertStatusUpdateRequest(
    [property: JsonPropertyName("analyst_status")] string AnalystStatus);

public sealed record ApiErrorResponse(
    [property: JsonPropertyName("detail")] string? Detail);
