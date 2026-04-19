using System.Text;
using System.Text.Json;
using FraudAnalyzer.App.Models;

namespace FraudAnalyzer.App.Services;

public sealed class ExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    public string BuildJson<T>(T payload)
    {
        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public object ExportAlerts(IReadOnlyList<AlertResponse> alerts)
    {
        return new
        {
            alerts,
        };
    }

    public string BuildCsv(IReadOnlyList<AlertResponse> alerts)
    {
        var builder = new StringBuilder();
        builder.AppendLine("id,source_partition,transaction_id,account_id,merchant_id,rule_name,severity,analyst_status,score,window_hours,explanation");

        foreach (var alert in alerts)
        {
            builder.AppendLine(string.Join(",",
                Escape(alert.Id),
                Escape(alert.SourcePartition),
                Escape(alert.TransactionId),
                Escape(alert.AccountId),
                Escape(alert.MerchantId),
                Escape(alert.RuleName),
                Escape(alert.Severity),
                Escape(alert.AnalystStatus),
                Escape(alert.Score),
                Escape(alert.WindowHours),
                Escape(GetExplanation(alert))));
        }

        return builder.ToString();
    }

    private static string GetExplanation(AlertResponse alert)
    {
        if (alert.Details.TryGetValue("explanation", out var explanation))
        {
            return explanation.ValueKind == JsonValueKind.String
                ? explanation.GetString() ?? string.Empty
                : explanation.ToString();
        }

        return string.Empty;
    }

    private static string Escape(object? value)
    {
        var text = Convert.ToString(value) ?? string.Empty;
        return $"\"{text.Replace("\"", "\"\"")}\"";
    }
}
