using Api;

var builder = WebApplication.CreateBuilder(args);

// The platform says which port to listen on (Cloud Run injects PORT); see Port for the rule.
builder.WebHost.UseUrls($"http://0.0.0.0:{Port.Read(Environment.GetEnvironmentVariable("PORT"))}");

// Resolved now, not on first use, so a build for an environment the manifest does not list stops
// the server at startup instead of on its first request.
builder.Services.AddSingleton(AppEnvironment.FromBuild());

var app = builder.Build();

// A non-public environment (e.g. staging) serves exactly like production but must not be indexed
// by search engines, or it competes with production as duplicate content. Registered ahead of the
// static files and the endpoints, so it covers every response.
app.Use(async (context, next) =>
{
    if (context.RequestServices.GetRequiredService<AppEnvironment>().Noindex)
    {
        context.Response.Headers["X-Robots-Tag"] = "noindex";
    }

    await next(context);
});

app.MapGet("/api/health", Health.Get);
app.MapGet("/api/version", (AppEnvironment environment, IHostEnvironment host) =>
    VersionInfo.Read(environment, host, Environment.GetEnvironmentVariable));

// The built web app, placed in wwwroot beside the published server. Any path that is not a file or
// a route gets index.html, so client-side routing works.
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Lets the test project start the app with WebApplicationFactory&lt;Program&gt;.</summary>
public partial class Program
{
}
