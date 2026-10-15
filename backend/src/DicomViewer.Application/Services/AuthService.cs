using System.Text.RegularExpressions;
using DicomViewer.Application.Contracts;
using DicomViewer.Domain.Entities;

namespace DicomViewer.Application.Services;

/// <summary>
/// Login, refresh-token rotation, password change, lockout and user administration.
///
/// Refresh tokens rotate on every use. Presenting a token that was already rotated is treated as theft:
/// the whole token family (every token issued from the same login) is revoked, forcing a new login.
/// </summary>
public sealed partial class AuthService(
    IAuthRepository repository,
    IPasswordHasher passwordHasher,
    ITokenIssuer tokens,
    TimeProvider clock)
{
    // A valid PBKDF2 hash of a throwaway value. Verifying against it when the username is unknown keeps
    // response timing the same whether or not the account exists.
    private const string DummyPasswordHash = "v1$600000$QZ7TiHEutGGe1zq7u8wCjQ==$Ddm9SaHSaa53tb0ypT4CvqJ3tIUk0XPK7IlcH0KP4gg=";

    public const int MaxFailedLoginAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    private const int MinPasswordLength = 12;
    private const int MaxPasswordLength = 256;

    [GeneratedRegex("^[A-Za-z0-9._-]{3,64}$")]
    private static partial Regex UsernamePattern();

    public async Task<AuthSession?> LoginAsync(string username, string password, bool rememberMe, CancellationToken ct)
    {
        var normalized = (username ?? string.Empty).Trim();
        var user = normalized.Length == 0 ? null : await repository.FindUserByUsernameAsync(normalized, ct);
        var now = clock.GetUtcNow().UtcDateTime;

        // Always run one verification so response time does not reveal whether the account exists or is locked.
        var passwordMatches = passwordHasher.Verify(password ?? string.Empty, user?.PasswordHash ?? DummyPasswordHash);
        if (user is null || !user.IsActive || IsLocked(user, now))
            return null;

        if (!passwordMatches)
        {
            await repository.RecordFailedLoginAsync(user.UserId, MaxFailedLoginAttempts, now.Add(LockoutDuration), ct);
            return null;
        }

        await repository.RecordSuccessfulLoginAsync(user.UserId, ct);
        return await IssueSessionAsync(user, rememberMe, Guid.NewGuid(), now, ct);
    }

    public async Task<AuthSession?> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return null;

        // Signature, issuer, audience and expiry are checked first so random strings never reach the database.
        var claims = await tokens.ValidateRefreshTokenAsync(refreshToken);
        if (claims is null)
            return null;

        var currentHash = TokenHash.Of(refreshToken);
        var stored = await repository.FindRefreshTokenAsync(currentHash, ct);
        if (stored is null || stored.UserId != claims.UserId)
            return null;

        var now = clock.GetUtcNow().UtcDateTime;

        if (stored.RevokedAtUtc is not null)
        {
            // An already-rotated token came back: assume it leaked and kill every session from this login.
            await repository.RevokeRefreshTokenFamilyAsync(stored.FamilyId, ct);
            return null;
        }

        if (stored.ExpiresAtUtc <= now)
            return null;

        var user = await repository.FindUserByIdAsync(stored.UserId, ct);
        if (user is null || !user.IsActive)
            return null;

        var access = tokens.IssueAccessToken(user, now);
        var refresh = tokens.IssueRefreshToken(user, claims.RememberMe, now);

        var rotated = await repository.RotateRefreshTokenAsync(
            currentHash,
            new RefreshTokenInsert(user.UserId, TokenHash.Of(refresh.Token), stored.FamilyId, refresh.ExpiresAtUtc),
            ct);

        if (!rotated)
        {
            // Lost a race with a concurrent refresh of the same token: treat it as reuse.
            await repository.RevokeRefreshTokenFamilyAsync(stored.FamilyId, ct);
            return null;
        }

        return new AuthSession(access, refresh, user, claims.RememberMe);
    }

    /// <summary>Revokes the presented refresh token. Unknown or invalid tokens are ignored.</summary>
    public async Task LogoutAsync(string refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return;

        await repository.RevokeRefreshTokenAsync(TokenHash.Of(refreshToken), ct);
    }

    /// <summary>
    /// Changes the caller's password. Verifies the current password (failures count toward lockout), revokes every
    /// refresh token of the account, and issues a fresh session for this browser, keeping its "remember me" choice.
    /// </summary>
    public async Task<AuthSession?> ChangePasswordAsync(
        long userId, string currentPassword, string newPassword, string? currentRefreshToken, CancellationToken ct)
    {
        ValidatePassword(newPassword);

        var user = await repository.FindUserByIdAsync(userId, ct);
        if (user is null || !user.IsActive)
            return null;

        var now = clock.GetUtcNow().UtcDateTime;
        if (IsLocked(user, now))
            throw new AccountLockedException();

        if (!passwordHasher.Verify(currentPassword ?? string.Empty, user.PasswordHash))
        {
            await repository.RecordFailedLoginAsync(user.UserId, MaxFailedLoginAttempts, now.Add(LockoutDuration), ct);
            throw new IncorrectPasswordException();
        }

        if (passwordHasher.Verify(newPassword, user.PasswordHash))
            throw new AuthValidationException("The new password must be different from the current password.");

        var rememberMe = false;
        if (!string.IsNullOrWhiteSpace(currentRefreshToken))
            rememberMe = (await tokens.ValidateRefreshTokenAsync(currentRefreshToken))?.RememberMe ?? false;

        await repository.SetPasswordHashAsync(user.UserId, passwordHasher.Hash(newPassword), ct);
        await repository.RecordSuccessfulLoginAsync(user.UserId, ct);
        await repository.RevokeAllRefreshTokensAsync(user.UserId, ct);

        return await IssueSessionAsync(user, rememberMe, Guid.NewGuid(), now, ct);
    }

    public async Task<AppUser> CreateUserAsync(string username, string password, string role, CancellationToken ct)
    {
        var normalizedName = (username ?? string.Empty).Trim();
        if (!UsernamePattern().IsMatch(normalizedName))
            throw new AuthValidationException("Username must be 3-64 characters: letters, digits, '.', '_' or '-'.");

        ValidatePassword(password);

        if (!AppRoles.IsValid(role))
            throw new AuthValidationException($"Role must be '{AppRoles.Admin}' or '{AppRoles.Viewer}'.");

        return await repository.CreateUserAsync(normalizedName, passwordHasher.Hash(password), role, ct);
    }

    /// <summary>
    /// Creates the first administrator from configuration when the user table is empty.
    /// Does nothing once any user exists, so the bootstrap credentials are only used on a fresh install.
    /// </summary>
    public async Task<bool> EnsureBootstrapAdminAsync(string? username, string? password, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
            return false;

        if (await repository.CountUsersAsync(ct) > 0)
            return false;

        await CreateUserAsync(username, password, AppRoles.Admin, ct);
        return true;
    }

    /// <summary>Removes refresh-token rows whose lifetime has ended. Safe: such tokens fail validation anyway.</summary>
    public Task<long> PurgeExpiredSessionsAsync(CancellationToken ct) =>
        repository.PurgeExpiredRefreshTokensAsync(clock.GetUtcNow().UtcDateTime, ct);

    private static bool IsLocked(AppUser user, DateTime nowUtc) =>
        user.LockedUntilUtc is { } until && until > nowUtc;

    private static void ValidatePassword(string? password)
    {
        if (password is null || password.Length < MinPasswordLength || password.Length > MaxPasswordLength)
            throw new AuthValidationException($"Password must be between {MinPasswordLength} and {MaxPasswordLength} characters.");
    }

    private async Task<AuthSession> IssueSessionAsync(AppUser user, bool rememberMe, Guid familyId, DateTime now, CancellationToken ct)
    {
        var access = tokens.IssueAccessToken(user, now);
        var refresh = tokens.IssueRefreshToken(user, rememberMe, now);

        await repository.InsertRefreshTokenAsync(
            new RefreshTokenInsert(user.UserId, TokenHash.Of(refresh.Token), familyId, refresh.ExpiresAtUtc),
            ct);

        return new AuthSession(access, refresh, user, rememberMe);
    }
}
