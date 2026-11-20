using System.Reflection;
using System.Text.Json;

namespace Api;

/// <summary>
/// The environment this server was built for, for server code that varies by environment
/// (<c>if (environment.Is("staging"))</c>) without a feature-flag system.
/// </summary>
/// <remarks>
/// The name is baked into the assembly at build from APP_ENV_NAME, and its facets come from the
/// environments.json copied beside the build, so the server reports the environment its image was
/// built for and agrees with the web build, which bakes the same entry. With no name baked (a local
/// build), it is the <c>local</c> identity.
/// </remarks>
public sealed record AppEnvironment(string Name, bool IsPublicFace, bool Noindex)
{
    /// <summary>The identity of a build made for no environment: local development and tests.</summary>
    public static AppEnvironment Local { get; } = new("local", IsPublicFace: false, Noindex: true);

    /// <summary>True when this is the named environment.</summary>
    public bool Is(string name)
    {
        return Name == name;
    }

    /// <summary>The identity this build was made for.</summary>
    public static AppEnvironment FromBuild()
    {
        var baked = typeof(AppEnvironment).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(attribute => attribute.Key == "AppEnvName")
            ?.Value;
        return Resolve(baked, Path.Combine(AppContext.BaseDirectory, "environments.json"));
    }

    /// <summary>
    /// The named environment's identity from the manifest at <paramref name="manifestPath"/>, or
    /// <see cref="Local"/> when no name is given. A name the manifest does not list is an error.
    /// </summary>
    public static AppEnvironment Resolve(string? name, string manifestPath)
    {
        if (string.IsNullOrEmpty(name))
        {
            return Local;
        }

        using var manifest = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var entries = manifest.RootElement.GetProperty("environments").EnumerateArray().ToList();
        foreach (var entry in entries)
        {
            if (entry.GetProperty("name").GetString() == name)
            {
                return new AppEnvironment(
                    name,
                    entry.GetProperty("isPublicFace").GetBoolean(),
                    entry.GetProperty("noindex").GetBoolean());
            }
        }

        var known = string.Join(", ", entries.Select(entry => entry.GetProperty("name").GetString()));
        throw new InvalidOperationException(
            $"APP_ENV_NAME='{name}' is not an environment in environments.json (have: {known}).");
    }
}
