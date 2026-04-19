namespace FraudAnalyzer.App.Models;

public sealed class UploadFormState
{
    public string? SourcePartition { get; set; }

    public int BatchSize { get; set; } = 250;

    public string TimeWindows { get; set; } = "1,24,72";

    public int MaxRetries { get; set; } = 3;
}

public sealed class AlertFilterState
{
    public string? SourcePartition { get; set; }

    public string? Severity { get; set; }

    public string? RuleName { get; set; }

    public string? AccountId { get; set; }

    public string? MerchantId { get; set; }

    public int? WindowHours { get; set; }

    public string? AnalystStatus { get; set; }
}

public sealed record MetricCard(string Label, string Value);

public sealed record TrendMetric(string Label, string Value, string DeltaLabel);

public sealed record InsightEntry(string Label, int AlertCount, double Score);
