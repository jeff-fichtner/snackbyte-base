using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Tests;

/// <summary>
/// Starts the app in memory as a given environment identity, optionally with a web root holding a
/// built web app, so tests can stand in for any environment the build could bake.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly AppEnvironment _environment;
    private readonly string? _contentRoot;
    private readonly string _hostEnvironment;

    public ApiFactory(AppEnvironment? environment = null, string? contentRoot = null, string hostEnvironment = "Development")
    {
        _environment = environment ?? AppEnvironment.Local;
        _contentRoot = contentRoot;
        _hostEnvironment = hostEnvironment;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_hostEnvironment);
        if (_contentRoot is not null)
        {
            builder.UseContentRoot(_contentRoot);
        }

        builder.ConfigureServices(services => services.AddSingleton(_environment));
    }
}
