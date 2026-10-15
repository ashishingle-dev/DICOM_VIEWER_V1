namespace DicomViewer.Api.Auth;

public static class AuthPolicies
{
    /// <summary>Requires the Admin role. Every other endpoint only requires an authenticated caller (fallback policy).</summary>
    public const string Admin = "Admin";

    /// <summary>Rate limit for credential-checking endpoints (login, change password), per client IP.</summary>
    public const string AuthRateLimit = "auth";
}
