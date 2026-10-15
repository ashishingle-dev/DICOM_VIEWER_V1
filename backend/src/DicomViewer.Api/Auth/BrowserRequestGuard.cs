using Microsoft.AspNetCore.Http;

namespace DicomViewer.Api.Auth;

/// <summary>The origins the browser frontend may run on (from <c>Cors:AllowedOrigins</c>).</summary>
public sealed record TrustedOrigins(IReadOnlyCollection<string> Origins);

/// <summary>
/// Cross-site request forgery defence for endpoints that act on the refresh cookie. A cross-site page cannot
/// add a custom header to a request without a CORS preflight, and the preflight only succeeds for allowed
/// origins. The Origin check is a second layer for browsers that send it.
/// </summary>
public static class BrowserRequestGuard
{
    public const string HeaderName = "X-Requested-With";
    public const string HeaderValue = "dicom-viewer";

    public static bool IsTrusted(HttpRequest request, TrustedOrigins trusted)
    {
        if (!string.Equals(request.Headers[HeaderName].ToString(), HeaderValue, StringComparison.Ordinal))
            return false;

        var origin = request.Headers["Origin"].ToString();
        return origin.Length > 0 && trusted.Origins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
