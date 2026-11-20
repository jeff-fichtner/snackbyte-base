namespace Api.Tests;

public sealed class PortTests
{
    [Fact]
    public void Unset_Is8080()
    {
        Assert.Equal(8080, Port.Read(null));
    }

    [Theory]
    [InlineData("1", 1)]
    [InlineData("3000", 3000)]
    [InlineData("65535", 65535)]
    [InlineData(" 8081 ", 8081)]
    public void AWholeNumberInRange_IsThePort(string raw, int expected)
    {
        Assert.Equal(expected, Port.Read(raw));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("0")]
    [InlineData("65536")]
    [InlineData("-1")]
    [InlineData("80.5")]
    [InlineData("http")]
    public void AnythingElse_StopsStartupNamingPort(string raw)
    {
        var error = Assert.Throws<InvalidOperationException>(() => Port.Read(raw));

        Assert.StartsWith("PORT must be a whole number from 1 to 65535", error.Message);
    }
}

public sealed class AppEnvironmentTests : IDisposable
{
    private readonly string _manifest = Path.Combine(Path.GetTempPath(), $"environments-{Guid.NewGuid():N}.json");

    public AppEnvironmentTests()
    {
        File.WriteAllText(
            _manifest,
            """
            {
              "environments": [
                { "name": "production", "branch": "main", "isPublicFace": true, "noindex": false, "tagSuffix": "" },
                { "name": "staging", "branch": "dev", "isPublicFace": false, "noindex": true, "tagSuffix": "-dev" }
              ]
            }
            """);
    }

    public void Dispose()
    {
        File.Delete(_manifest);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void NoName_IsTheLocalIdentity(string? name)
    {
        Assert.Equal(AppEnvironment.Local, AppEnvironment.Resolve(name, _manifest));
        Assert.Equal(new AppEnvironment("local", IsPublicFace: false, Noindex: true), AppEnvironment.Local);
    }

    [Fact]
    public void AListedName_TakesItsFacetsFromTheManifest()
    {
        Assert.Equal(new AppEnvironment("production", true, false), AppEnvironment.Resolve("production", _manifest));
        Assert.Equal(new AppEnvironment("staging", false, true), AppEnvironment.Resolve("staging", _manifest));
    }

    [Fact]
    public void AnUnlistedName_IsAnErrorNamingTheKnownEnvironments()
    {
        var error = Assert.Throws<InvalidOperationException>(() => AppEnvironment.Resolve("qa", _manifest));

        Assert.Equal("APP_ENV_NAME='qa' is not an environment in environments.json (have: production, staging).", error.Message);
    }

    [Fact]
    public void Is_ComparesTheName()
    {
        var staging = new AppEnvironment("staging", false, true);

        Assert.True(staging.Is("staging"));
        Assert.False(staging.Is("production"));
    }

    [Fact]
    public void ATestBuild_BakesNoEnvironment_SoItIsLocal()
    {
        Assert.Equal(AppEnvironment.Local, AppEnvironment.FromBuild());
    }
}
