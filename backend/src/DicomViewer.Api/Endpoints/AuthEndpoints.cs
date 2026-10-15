using System.Security.Claims;
using DicomViewer.Api.Auth;
using DicomViewer.Application.Contracts;
using DicomViewer.Application.Services;
using DicomViewer.Domain.Entities;

namespace DicomViewer.Api.Endpoints;

public static class AuthEndpoints
{
    public sealed record LoginRequest(string? Username, string? Password, bool RememberMe);
    public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
    public sealed record CreateUserRequest(string? Username, string? Password, string? Role);

    public sealed record CurrentUserResponse(long Id, string Username, string Role);

    /// <summary>The refresh token is never in the body; it travels only in the HttpOnly cookie.</summary>
    public sealed record SessionResponse(string AccessToken, DateTime AccessTokenExpiresAtUtc, CurrentUserResponse User);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth").WithTags("Authentication");

        auth.MapPost("/login", async Task<IResult> (
            LoginRequest request,
            HttpContext http,
            AuthService service,
            RefreshCookieWriter cookies,
            TrustedOrigins trusted,
            CancellationToken ct) =>
        {
            if (!BrowserRequestGuard.IsTrusted(http.Request, trusted))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var session = await service.LoginAsync(request.Username ?? string.Empty, request.Password ?? string.Empty, request.RememberMe, ct);
            if (session is null)
                return Results.Unauthorized();

            cookies.Write(http.Response, session.RefreshToken, session.RememberMe);
            return Results.Ok(ToResponse(session));
        })
        .AllowAnonymous()
        .RequireRateLimiting(AuthPolicies.AuthRateLimit)
        .WithName("Login")
        .WithSummary("Sign in. Returns an access token; sets the refresh-token cookie.");

        auth.MapPost("/refresh", async Task<IResult> (
            HttpContext http,
            AuthService service,
            RefreshCookieWriter cookies,
            TrustedOrigins trusted,
            CancellationToken ct) =>
        {
            if (!BrowserRequestGuard.IsTrusted(http.Request, trusted))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var token = cookies.Read(http.Request);
            var session = token is null ? null : await service.RefreshAsync(token, ct);
            if (session is null)
            {
                cookies.Clear(http.Response);
                return Results.Unauthorized();
            }

            cookies.Write(http.Response, session.RefreshToken, session.RememberMe);
            return Results.Ok(ToResponse(session));
        })
        .AllowAnonymous()
        .WithName("Refresh")
        .WithSummary("Rotate the refresh-token cookie and return a new access token.");

        auth.MapPost("/logout", async Task<IResult> (
            HttpContext http,
            AuthService service,
            RefreshCookieWriter cookies,
            TrustedOrigins trusted,
            CancellationToken ct) =>
        {
            if (!BrowserRequestGuard.IsTrusted(http.Request, trusted))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var token = cookies.Read(http.Request);
            if (token is not null)
                await service.LogoutAsync(token, ct);

            cookies.Clear(http.Response);
            return Results.NoContent();
        })
        .AllowAnonymous()
        .WithName("Logout")
        .WithSummary("Revoke the refresh-token cookie and clear it.");

        auth.MapGet("/me", (ClaimsPrincipal user) =>
        {
            var id = user.FindFirst("sub")?.Value;
            var name = user.FindFirst("name")?.Value;
            var role = user.FindFirst("role")?.Value;
            if (!long.TryParse(id, out var userId) || name is null || role is null)
                return Results.Unauthorized();

            return Results.Ok(new CurrentUserResponse(userId, name, role));
        })
        .WithName("CurrentUser")
        .WithSummary("Return the authenticated caller.");

        auth.MapPost("/change-password", async Task<IResult> (
            ChangePasswordRequest request,
            ClaimsPrincipal principal,
            HttpContext http,
            AuthService service,
            RefreshCookieWriter cookies,
            CancellationToken ct) =>
        {
            if (!long.TryParse(principal.FindFirst("sub")?.Value, out var userId))
                return Results.Unauthorized();

            try
            {
                var session = await service.ChangePasswordAsync(
                    userId,
                    request.CurrentPassword ?? string.Empty,
                    request.NewPassword ?? string.Empty,
                    cookies.Read(http.Request),
                    ct);

                if (session is null)
                    return Results.Unauthorized();

                // Every other session of this account was revoked; this browser gets a fresh one.
                cookies.Write(http.Response, session.RefreshToken, session.RememberMe);
                return Results.Ok(ToResponse(session));
            }
            catch (IncorrectPasswordException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (AccountLockedException)
            {
                return Results.Problem(detail: "Too many failed attempts. Try again later.", statusCode: StatusCodes.Status429TooManyRequests);
            }
            catch (AuthValidationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        })
        .RequireRateLimiting(AuthPolicies.AuthRateLimit)
        .WithName("ChangePassword")
        .WithSummary("Change the caller's password. Signs out all other sessions of the account.");

        var admin = app.MapGroup("/api/admin").WithTags("Administration").RequireAuthorization(AuthPolicies.Admin);

        admin.MapPost("/users", async Task<IResult> (CreateUserRequest request, AuthService service, CancellationToken ct) =>
        {
            try
            {
                var created = await service.CreateUserAsync(
                    request.Username ?? string.Empty,
                    request.Password ?? string.Empty,
                    request.Role ?? string.Empty,
                    ct);
                return Results.Ok(new CurrentUserResponse(created.UserId, created.Username, created.Role));
            }
            catch (AuthValidationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (UsernameTakenException ex)
            {
                return Results.Conflict(ex.Message);
            }
        })
        .WithName("CreateUser")
        .WithSummary("Create a user with the Admin or Viewer role.");
    }

    private static SessionResponse ToResponse(AuthSession session) => new(
        AccessToken: session.AccessToken.Token,
        AccessTokenExpiresAtUtc: session.AccessToken.ExpiresAtUtc,
        User: new CurrentUserResponse(session.User.UserId, session.User.Username, session.User.Role));
}
