using DicomViewer.Application.Services;

namespace DicomViewer.Api.Auth;

/// <summary>Deletes expired refresh-token rows at startup and then hourly.</summary>
public sealed class RefreshTokenCleanupService(
    IServiceScopeFactory scopes,
    ILogger<RefreshTokenCleanupService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await PurgeOnceAsync(stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await PurgeOnceAsync(stoppingToken);
    }

    private async Task PurgeOnceAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var purged = await scope.ServiceProvider.GetRequiredService<AuthService>().PurgeExpiredSessionsAsync(ct);
            if (purged > 0)
                logger.LogInformation("Removed {Count} expired refresh tokens.", purged);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // shutting down
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Refresh token cleanup failed; it will retry on the next run.");
        }
    }
}
