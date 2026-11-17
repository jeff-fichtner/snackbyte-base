using System.Diagnostics;
using System.Globalization;

namespace Api;

/// <summary>The body of <c>/api/health</c>.</summary>
public sealed record HealthStatus(string Status, double Uptime, string Timestamp);

/// <summary>
/// Liveness: answers while the server is running, which is what an uptime check or a platform health
/// probe expects. Extend it with real readiness signals as the app grows (database connectivity,
/// dependency checks).
/// </summary>
public static class Health
{
    /// <summary>Handles <c>GET /api/health</c>.</summary>
    public static HealthStatus Get()
    {
        var started = Process.GetCurrentProcess().StartTime.ToUniversalTime();
        var now = DateTime.UtcNow;
        return new HealthStatus(
            "ok",
            (now - started).TotalSeconds,
            now.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
    }
}
