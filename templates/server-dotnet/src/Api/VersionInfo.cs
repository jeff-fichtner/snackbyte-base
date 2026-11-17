namespace Api;

/// <summary>
/// The running build's version, for <c>/api/version</c>: useful for confirming what is deployed.
/// </summary>
/// <remarks>
/// The number, commit and date arrive as environment variables set by the deploy (APP_VERSION,
/// BUILD_GIT_COMMIT, BUILD_DATE). Outside a production host (local development, tests) the number
/// is <c>0.0.0-dev</c>. The environment is the baked identity, not a runtime variable.
/// </remarks>
public sealed record VersionInfo(string Number, string Commit, string BuildDate, string Environment)
{
    /// <summary>Reads the version from <paramref name="variable"/> (normally the process environment).</summary>
    public static VersionInfo Read(AppEnvironment environment, IHostEnvironment host, Func<string, string?> variable)
    {
        return new VersionInfo(
            host.IsProduction() ? variable("APP_VERSION") ?? "0.0.0" : "0.0.0-dev",
            variable("BUILD_GIT_COMMIT") ?? "dev",
            variable("BUILD_DATE") ?? "dev",
            environment.Name);
    }
}
