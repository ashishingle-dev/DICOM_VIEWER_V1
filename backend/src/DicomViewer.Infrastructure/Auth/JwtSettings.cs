using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace DicomViewer.Infrastructure.Auth;

/// <summary>
/// JWT settings read from the <c>Auth:Jwt</c> configuration section. The signing key must come from a secret
/// (environment variable <c>Auth__Jwt__SigningKey</c> or user-secrets), never from source control.
/// </summary>
public sealed record JwtSettings(
    string Issuer,
    string AccessAudience,
    string RefreshAudience,
    byte[] SigningKey,
    TimeSpan AccessTokenLifetime,
    TimeSpan SessionRefreshLifetime,
    TimeSpan RememberMeRefreshLifetime)
{
    public const int MinimumKeyBytes = 32; // 256 bits for HMAC-SHA256

    public static JwtSettings FromConfiguration(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var section = configuration.GetSection("Auth:Jwt");

        var key = section["SigningKey"] ?? string.Empty;
        var keyBytes = Encoding.UTF8.GetBytes(key);
        if (keyBytes.Length < MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                $"Auth:Jwt:SigningKey must be at least {MinimumKeyBytes} bytes. " +
                "Set the Auth__Jwt__SigningKey environment variable (or user-secrets) to a random value.");
        }

        var accessMinutes = section.GetValue<int?>("AccessTokenMinutes") ?? 15;
        var sessionHours = section.GetValue<int?>("SessionRefreshHours") ?? 12;
        var rememberDays = section.GetValue<int?>("RememberMeRefreshDays") ?? 30;
        if (accessMinutes <= 0 || sessionHours <= 0 || rememberDays <= 0)
            throw new InvalidOperationException("Auth:Jwt lifetimes must be positive.");

        var issuer = section["Issuer"] ?? throw new InvalidOperationException("Auth:Jwt:Issuer is not configured.");
        var accessAudience = section["AccessAudience"] ?? throw new InvalidOperationException("Auth:Jwt:AccessAudience is not configured.");
        var refreshAudience = section["RefreshAudience"] ?? throw new InvalidOperationException("Auth:Jwt:RefreshAudience is not configured.");

        return new JwtSettings(
            issuer,
            accessAudience,
            refreshAudience,
            keyBytes,
            TimeSpan.FromMinutes(accessMinutes),
            TimeSpan.FromHours(sessionHours),
            TimeSpan.FromDays(rememberDays));
    }

    public SymmetricSecurityKey CreateKey() => new(SigningKey);
}
