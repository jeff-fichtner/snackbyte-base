using System.Globalization;
using System.Net;
using System.Text.Json;

namespace Api.Tests;

public sealed class EndpointTests
{
    [Fact]
    public async Task Health_AnswersOkWithUptimeAndTimestamp()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ok", body.RootElement.GetProperty("status").GetString());
        Assert.True(body.RootElement.GetProperty("uptime").GetDouble() >= 0);
        var timestamp = body.RootElement.GetProperty("timestamp").GetString();
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", timestamp);
        Assert.True(DateTime.TryParse(timestamp, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _));
    }

    [Fact]
    public async Task Version_InDevelopment_ReportsTheDevNumberAndTheBakedEnvironment()
    {
        using var factory = new ApiFactory(new AppEnvironment("staging", IsPublicFace: false, Noindex: true));
        using var client = factory.CreateClient();

        var body = await client.GetStringAsync("/api/version");

        using var json = JsonDocument.Parse(body);
        Assert.Equal("0.0.0-dev", json.RootElement.GetProperty("number").GetString());
        Assert.Equal("staging", json.RootElement.GetProperty("environment").GetString());
        Assert.Equal(
            ["number", "commit", "buildDate", "environment"],
            json.RootElement.EnumerateObject().Select(property => property.Name));
    }

    [Fact]
    public void Version_InProduction_ReportsTheDeployedNumberCommitAndDate()
    {
        var variables = new Dictionary<string, string>
        {
            ["APP_VERSION"] = "1.2.3",
            ["BUILD_GIT_COMMIT"] = "abc1234",
            ["BUILD_DATE"] = "2026-11-16T00:00:00Z",
        };
        var production = new AppEnvironment("production", IsPublicFace: true, Noindex: false);

        var version = VersionInfo.Read(production, new FakeHost("Production"), name => variables.GetValueOrDefault(name));

        Assert.Equal(new VersionInfo("1.2.3", "abc1234", "2026-11-16T00:00:00Z", "production"), version);
    }

    [Fact]
    public void Version_WithNothingSet_FallsBackToPlaceholders()
    {
        var version = VersionInfo.Read(AppEnvironment.Local, new FakeHost("Production"), _ => null);

        Assert.Equal(new VersionInfo("0.0.0", "dev", "dev", "local"), version);
    }

    [Theory]
    [InlineData("/api/health")]
    [InlineData("/api/version")]
    public async Task Noindex_IsSentForAnEnvironmentThatAsksForIt(string path)
    {
        using var factory = new ApiFactory(new AppEnvironment("staging", IsPublicFace: false, Noindex: true));
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal("noindex", Assert.Single(response.Headers.GetValues("X-Robots-Tag")));
    }

    [Fact]
    public async Task Noindex_IsNotSentForThePublicFace()
    {
        using var factory = new ApiFactory(new AppEnvironment("production", IsPublicFace: true, Noindex: false));
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.False(response.Headers.Contains("X-Robots-Tag"));
    }

    private sealed class FakeHost(string environmentName) : Microsoft.Extensions.Hosting.IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;

        public string ApplicationName { get; set; } = "Api";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
