namespace DicomViewer.Domain.Entities;

/// <summary>Authorization roles. Keep in sync with the CHECK constraint in database/004_auth.sql.</summary>
public static class AppRoles
{
    /// <summary>Full access: browse, view, upload, delete and manage users.</summary>
    public const string Admin = "Admin";

    /// <summary>Read-only access: browse and view studies.</summary>
    public const string Viewer = "Viewer";

    public static bool IsValid(string? role) => role is Admin or Viewer;
}

public sealed record AppUser(
    long UserId,
    string Username,
    string PasswordHash,
    string Role,
    bool IsActive,
    int FailedLoginCount,
    DateTime? LockedUntilUtc);

/// <summary>A persisted refresh token. Only the SHA-256 hash of the token is stored.</summary>
public sealed record RefreshTokenRecord(
    long RefreshTokenId,
    long UserId,
    string TokenHash,
    Guid FamilyId,
    DateTime ExpiresAtUtc,
    DateTime? RevokedAtUtc);
