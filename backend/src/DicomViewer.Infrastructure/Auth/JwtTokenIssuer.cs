using System.Security.Claims;
using DicomViewer.Application.Contracts;
using DicomViewer.Domain.Entities;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace DicomViewer.Infrastructure.Auth;

/// <summary>
/// Issues and validates HS256 JWTs. Access and refresh tokens use different audiences, so a refresh token
/// is rejected by the API's bearer authentication and an access token is rejected by the refresh endpoint.
/// </summary>
public sealed class JwtTokenIssuer : ITokenIssuer
{
    // JsonWebTokenHandler is thread-safe and intended to be shared.
    private static readonly JsonWebTokenHandler Handler = new();

    private readonly JwtSettings _settings;
    private readonly SymmetricSecurityKey _key;
    private readonly TokenValidationParameters _refreshValidation;

    public JwtTokenIssuer(JwtSettings settings)
    {
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _key = settings.CreateKey();

        _refreshValidation = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = settings.Issuer,
            ValidateAudience = true,
            ValidAudience = settings.RefreshAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = _key,
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    }

    public IssuedToken IssueAccessToken(AppUser user, DateTime nowUtc)
    {
        var expires = nowUtc.Add(_settings.AccessTokenLifetime);
        var claims = new[]
        {
            new Claim("sub", user.UserId.ToString()),
            new Claim("name", user.Username),
            new Claim("role", user.Role),
            new Claim("jti", Guid.NewGuid().ToString("N")),
        };
        return Create(claims, _settings.AccessAudience, nowUtc, expires);
    }

    public IssuedToken IssueRefreshToken(AppUser user, bool rememberMe, DateTime nowUtc)
    {
        var lifetime = rememberMe ? _settings.RememberMeRefreshLifetime : _settings.SessionRefreshLifetime;
        var expires = nowUtc.Add(lifetime);
        var claims = new[]
        {
            new Claim("sub", user.UserId.ToString()),
            new Claim("jti", Guid.NewGuid().ToString("N")),
            new Claim("rem", rememberMe ? "true" : "false"),
        };
        return Create(claims, _settings.RefreshAudience, nowUtc, expires);
    }

    public async Task<RefreshTokenClaims?> ValidateRefreshTokenAsync(string token)
    {
        var result = await Handler.ValidateTokenAsync(token, _refreshValidation);
        if (!result.IsValid)
            return null;

        var identity = result.ClaimsIdentity;
        if (!long.TryParse(identity.FindFirst("sub")?.Value, out var userId))
            return null;

        return new RefreshTokenClaims(userId, identity.FindFirst("rem")?.Value == "true");
    }

    private IssuedToken Create(Claim[] claims, string audience, DateTime issuedAtUtc, DateTime expiresUtc)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _settings.Issuer,
            Audience = audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = issuedAtUtc,
            NotBefore = issuedAtUtc,
            Expires = expiresUtc,
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
        };

        return new IssuedToken(Handler.CreateToken(descriptor), expiresUtc);
    }
}
