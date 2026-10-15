using DicomViewer.Domain.Entities;

namespace DicomViewer.Application.Contracts;

public interface IAuthRepository
{
    Task<AppUser?> FindUserByUsernameAsync(string username, CancellationToken ct);
    Task<AppUser?> FindUserByIdAsync(long userId, CancellationToken ct);
    Task<long> CountUsersAsync(CancellationToken ct);

    /// <summary>Creates a user. Throws <see cref="Services.UsernameTakenException"/> on a duplicate username.</summary>
    Task<AppUser> CreateUserAsync(string username, string passwordHash, string role, CancellationToken ct);

    /// <summary>Increments the failure counter and locks the account once it reaches <paramref name="maxFailures"/>.</summary>
    Task RecordFailedLoginAsync(long userId, int maxFailures, DateTime lockedUntilUtc, CancellationToken ct);
    Task RecordSuccessfulLoginAsync(long userId, CancellationToken ct);
    Task SetPasswordHashAsync(long userId, string passwordHash, CancellationToken ct);

    Task InsertRefreshTokenAsync(RefreshTokenInsert token, CancellationToken ct);
    Task<RefreshTokenRecord?> FindRefreshTokenAsync(string tokenHash, CancellationToken ct);

    /// <summary>
    /// Atomically revokes <paramref name="currentTokenHash"/> and stores its successor.
    /// Returns false when the current token was not active any more (already rotated or revoked).
    /// </summary>
    Task<bool> RotateRefreshTokenAsync(string currentTokenHash, RefreshTokenInsert successor, CancellationToken ct);

    Task RevokeRefreshTokenAsync(string tokenHash, CancellationToken ct);
    Task RevokeRefreshTokenFamilyAsync(Guid familyId, CancellationToken ct);
    Task RevokeAllRefreshTokensAsync(long userId, CancellationToken ct);

    /// <summary>Deletes refresh-token rows that expired before the cutoff. Returns the number removed.</summary>
    Task<long> PurgeExpiredRefreshTokensAsync(DateTime cutoffUtc, CancellationToken ct);
}

public sealed record RefreshTokenInsert(long UserId, string TokenHash, Guid FamilyId, DateTime ExpiresAtUtc);

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string passwordHash);
}

public sealed record IssuedToken(string Token, DateTime ExpiresAtUtc);

/// <summary>Claims recovered from a validated refresh token.</summary>
public sealed record RefreshTokenClaims(long UserId, bool RememberMe);

public interface ITokenIssuer
{
    IssuedToken IssueAccessToken(AppUser user, DateTime nowUtc);

    /// <summary>"Remember me" tokens get the longer lifetime; otherwise the shorter session lifetime applies.</summary>
    IssuedToken IssueRefreshToken(AppUser user, bool rememberMe, DateTime nowUtc);

    /// <summary>Validates signature, issuer, audience and lifetime of a refresh token. Returns null when invalid.</summary>
    Task<RefreshTokenClaims?> ValidateRefreshTokenAsync(string token);
}

/// <summary>The result of a successful login, refresh or password change.</summary>
public sealed record AuthSession(
    IssuedToken AccessToken,
    IssuedToken RefreshToken,
    AppUser User,
    bool RememberMe);
