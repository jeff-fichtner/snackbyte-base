using System.Net;

namespace Api.Tests;

/// <summary>
/// The server serves a built web app from wwwroot, with index.html for any path that is not a file
/// or a route, except under /api, where an unknown path is a 404. Each test gets its own content
/// root holding a small stand-in web build.
/// </summary>
public sealed class WebAppTests : IDisposable
{
    private readonly string _contentRoot = Directory.CreateTempSubdirectory("api-webapp-").FullName;

    public WebAppTests()
    {
        var webRoot = Directory.CreateDirectory(Path.Combine(_contentRoot, "wwwroot")).FullName;
        File.WriteAllText(Path.Combine(webRoot, "index.html"), "<!doctype html><div id=\"root\"></div>");
        File.WriteAllText(Path.Combine(webRoot, "app.js"), "console.log('app');");
    }

    public void Dispose()
    {
        Directory.Delete(_contentRoot, recursive: true);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/some/client/route")]
    [InlineData("/apiary")]
    public async Task AnyPathThatIsNotAFileOrRoute_GetsTheWebApp(string path)
    {
        using var factory = new ApiFactory(contentRoot: _contentRoot);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("<div id=\"root\">", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("GET", "/api/not-a-route")]
    [InlineData("GET", "/api")]
    [InlineData("GET", "/api/a/b")]
    [InlineData("POST", "/api/not-a-route")]
    public async Task AnUnknownApiPath_IsNotFound_NotTheWebApp(string method, string path)
    {
        using var factory = new ApiFactory(contentRoot: _contentRoot);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("{\"error\":\"Not found\"}", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AFileInTheWebBuild_IsServedAsItself()
    {
        using var factory = new ApiFactory(contentRoot: _contentRoot);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/app.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("console.log('app');", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task TheApi_StillAnswersBesideTheWebApp()
    {
        using var factory = new ApiFactory(contentRoot: _contentRoot);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task TheWebApp_CarriesNoindexForAnEnvironmentThatAsksForIt()
    {
        var staging = new AppEnvironment("staging", IsPublicFace: false, Noindex: true);
        using var factory = new ApiFactory(staging, _contentRoot);
        using var client = factory.CreateClient();

        var page = await client.GetAsync("/");
        var file = await client.GetAsync("/app.js");

        Assert.Equal("noindex", Assert.Single(page.Headers.GetValues("X-Robots-Tag")));
        Assert.Equal("noindex", Assert.Single(file.Headers.GetValues("X-Robots-Tag")));
    }

    [Fact]
    public async Task WithNoWebBuild_TheFallbackIsNotFound()
    {
        var empty = Directory.CreateTempSubdirectory("api-empty-").FullName;
        try
        {
            using var factory = new ApiFactory(contentRoot: empty);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        finally
        {
            Directory.Delete(empty, recursive: true);
        }
    }
}
