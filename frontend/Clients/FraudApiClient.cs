using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FraudAnalyzer.App.Models;
using Microsoft.AspNetCore.WebUtilities;

namespace FraudAnalyzer.App.Clients;

public sealed class FraudApiClient(HttpClient httpClient)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<HealthResponse> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        return await ReadRequiredAsync<HealthResponse>("api/health", cancellationToken);
    }

    public async Task<byte[]> GetDemoSampleAsync(CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync("api/sample/demo-transactions.csv", cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw await CreateApiException(response, cancellationToken);
        }

        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    public async Task<AnalysisJobAcceptedResponse> SubmitAnalysisAsync(
        byte[] fileContent,
        string fileName,
        UploadFormState upload,
        CancellationToken cancellationToken = default)
    {
        using var content = new MultipartFormDataContent();
        var filePart = new ByteArrayContent(fileContent);
        filePart.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/csv");
        content.Add(filePart, "file", fileName);

        AddIfPresent(content, "source_partition", upload.SourcePartition);
        AddIfPresent(content, "batch_size", upload.BatchSize.ToString());
        AddIfPresent(content, "time_windows", upload.TimeWindows);
        AddIfPresent(content, "max_retries", upload.MaxRetries.ToString());

        using var response = await httpClient.PostAsync("api/analyze/upload", content, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw await CreateApiException(response, cancellationToken);
        }

        return (await response.Content.ReadFromJsonAsync<AnalysisJobAcceptedResponse>(JsonOptions, cancellationToken))
            ?? throw new InvalidOperationException("Backend returned an empty job response.");
    }

    public async Task<AnalysisJobResponse> GetJobAsync(string jobId, CancellationToken cancellationToken = default)
    {
        return await ReadRequiredAsync<AnalysisJobResponse>($"api/jobs/{Uri.EscapeDataString(jobId)}", cancellationToken);
    }

    public async Task<IReadOnlyList<AnalysisRunResponse>> GetRunsAsync(int limit = 5, CancellationToken cancellationToken = default)
    {
        return await ReadRequiredAsync<List<AnalysisRunResponse>>($"api/runs?limit={limit}", cancellationToken);
    }

    public async Task<IReadOnlyList<AlertResponse>> GetAlertsAsync(AlertFilterState filter, CancellationToken cancellationToken = default)
    {
        var query = new Dictionary<string, string?>
        {
            ["source_partition"] = filter.SourcePartition,
            ["severity"] = filter.Severity,
            ["rule_name"] = filter.RuleName,
            ["account_id"] = filter.AccountId,
            ["merchant_id"] = filter.MerchantId,
            ["window_hours"] = filter.WindowHours?.ToString(),
            ["analyst_status"] = filter.AnalystStatus,
        };

        var path = QueryHelpers.AddQueryString("api/alerts", query.Where(pair => !string.IsNullOrWhiteSpace(pair.Value)));
        return await ReadRequiredAsync<List<AlertResponse>>(path, cancellationToken);
    }

    public async Task<AlertResponse> UpdateAlertStatusAsync(
        int alertId,
        string analystStatus,
        CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PatchAsJsonAsync(
            $"api/alerts/{alertId}",
            new AlertStatusUpdateRequest(analystStatus),
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw await CreateApiException(response, cancellationToken);
        }

        return (await response.Content.ReadFromJsonAsync<AlertResponse>(JsonOptions, cancellationToken))
            ?? throw new InvalidOperationException("Backend returned an empty alert response.");
    }

    private async Task<T> ReadRequiredAsync<T>(string path, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(path, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw await CreateApiException(response, cancellationToken);
        }

        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken))
            ?? throw new InvalidOperationException($"Backend returned an empty payload for {path}.");
    }

    private static void AddIfPresent(MultipartFormDataContent content, string key, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            content.Add(new StringContent(value, Encoding.UTF8), key);
        }
    }

    private static async Task<Exception> CreateApiException(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var payload = await response.Content.ReadFromJsonAsync<ApiErrorResponse>(JsonOptions, cancellationToken);
            if (!string.IsNullOrWhiteSpace(payload?.Detail))
            {
                return new InvalidOperationException(payload.Detail);
            }
        }
        catch
        {
            // Ignore JSON parsing errors and fall back to status text.
        }

        return new InvalidOperationException($"API request failed with {(int)response.StatusCode} {response.ReasonPhrase}.");
    }
}
