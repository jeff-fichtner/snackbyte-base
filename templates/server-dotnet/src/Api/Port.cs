using System.Globalization;
using System.Text.Json;

namespace Api;

/// <summary>The port the server listens on.</summary>
public static class Port
{
    /// <summary>The port used when PORT is unset.</summary>
    public const int Default = 8080;

    /// <summary>
    /// Reads PORT. Unset, it is 8080. That default cannot cause wrong behaviour: in production it never
    /// applies, because Cloud Run always injects PORT and the image also sets PORT=8080, and a server
    /// listening anywhere but the injected port fails Cloud Run's startup probe, so the deploy fails
    /// instead of serving. Locally 8080 is the value the app's .env and the web dev proxy use.
    /// </summary>
    /// <remarks>
    /// Set, it must be a whole number from 1 to 65535, and anything else stops startup with an error
    /// naming PORT. A blank value is the case this guards: it would otherwise bind a random port while
    /// the dev proxy pointed at another.
    /// </remarks>
    public static int Read(string? raw)
    {
        if (raw is null)
        {
            return Default;
        }

        const NumberStyles Whole = NumberStyles.AllowLeadingWhite | NumberStyles.AllowTrailingWhite;
        if (!int.TryParse(raw, Whole, CultureInfo.InvariantCulture, out var port) || port < 1 || port > 65535)
        {
            throw new InvalidOperationException(
                $"PORT must be a whole number from 1 to 65535, got {JsonSerializer.Serialize(raw)}.");
        }

        return port;
    }
}
