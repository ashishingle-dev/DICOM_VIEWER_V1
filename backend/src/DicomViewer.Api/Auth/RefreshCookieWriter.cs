using DicomViewer.Application.Contracts;
using Microsoft.AspNetCore.Http;

namespace DicomViewer.Api.Auth;

/// <summary>
/// Reads and writes the refresh-token cookie. The cookie is HttpOnly (invisible to JavaScript), Secure, scoped to
/// the whole origin with the <c>__Host-</c> prefix (so it cannot be overridden from a subdomain), and SameSite.
/// "Remember me" sessions get a persistent cookie; otherwise it is a browser-session cookie.
/// </summary>
public sealed class RefreshCookieWriter(SameSiteMode sameSite)
{
    public const string Name = "__Host-dv_rt";

    public static SameSiteMode ParseSameSite(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        null or "" or "lax" => SameSiteMode.Lax,
        "strict" => SameSiteMode.Strict,
        "none" => SameSiteMode.None,
        _ => throw new InvalidOperationException("Auth:Cookie:SameSite must be Lax, Strict or None."),
    };

    public string? Read(HttpRequest request) =>
        request.Cookies.TryGetValue(Name, out var value) && !string.IsNullOrEmpty(value) ? value : null;

    public void Write(HttpResponse response, IssuedToken token, bool persistent)
    {
        DateTimeOffset? expires = persistent ? new DateTimeOffset(token.ExpiresAtUtc, TimeSpan.Zero) : null;
        response.Cookies.Append(Name, token.Token, Options(expires));
    }

    public void Clear(HttpResponse response) => response.Cookies.Delete(Name, Options(null));

    private CookieOptions Options(DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = sameSite,
        Path = "/",
        Expires = expires,
        IsEssential = true,
    };
}
