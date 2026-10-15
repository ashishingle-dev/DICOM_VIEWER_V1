using System.Threading.RateLimiting;
using DicomViewer.Api.Auth;
using DicomViewer.Api.Endpoints;
using DicomViewer.Application.Contracts;
using DicomViewer.Application.Services;
using DicomViewer.Domain.Entities;
using DicomViewer.Infrastructure;
using DicomViewer.Infrastructure.Auth;
using FellowOakDicom;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = (builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .Select(origin => origin.TrimEnd('/'))
    .Where(origin => origin.Length > 0)
    .ToArray();

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<StudyService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddSingleton(new TrustedOrigins(allowedOrigins));
builder.Services.AddSingleton(new RefreshCookieWriter(RefreshCookieWriter.ParseSameSite(builder.Configuration["Auth:Cookie:SameSite"])));
builder.Services.AddHostedService<RefreshTokenCleanupService>();

// Authentication: JWT bearer access tokens. Refresh tokens are validated by AuthService, not by this handler.
var jwt = JwtSettings.FromConfiguration(builder.Configuration);
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // keep the raw "sub", "role" and "name" claim names
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.AccessAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwt.CreateKey(),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Secure by default: any endpoint without an explicit [AllowAnonymous] requires a valid access token.
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPolicy(AuthPolicies.Admin, policy => policy.RequireRole(AppRoles.Admin));
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthPolicies.AuthRateLimit, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        // Credentials are needed for the HttpOnly refresh cookie. Origins must be explicit (never "*").
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    });
});

var app = builder.Build();
DicomSetupBuilder.UseServiceProvider(app.Services);

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/error");
}
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    if (context.Request.Path.StartsWithSegments("/api/auth"))
        context.Response.Headers["Cache-Control"] = "no-store"; // tokens must never be cached by browsers or proxies
    await next();
});

app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/error", () => Results.Problem("An unexpected error occurred.")).AllowAnonymous();
app.MapHealthChecks("/health").AllowAnonymous();

app.MapOpenApi().AllowAnonymous();
app.MapScalarApiReference(options =>
{
    options.Title = "DICOM Viewer API";
    options.Theme = ScalarTheme.Kepler;
}).AllowAnonymous();

app.MapAuthEndpoints();

var api = app.MapGroup("/api").WithTags("API");

api.MapGet("/studies", async (
    string? patientId,
    string? patientName,
    DateOnly? studyDateFrom,
    DateOnly? studyDateTo,
    string? modality,
    int? page,
    int? pageSize,
    StudyService service,
    CancellationToken ct) =>
{
    var result = await service.SearchAsync(new StudySearchRequest(patientId, patientName, studyDateFrom, studyDateTo, modality, page.GetValueOrDefault(1), pageSize.GetValueOrDefault(50)), ct);
    return Results.Ok(result);
}).WithName("SearchStudies").WithSummary("Search studies with pagination and filters.");

api.MapGet("/studies/{studyUid}", async (string studyUid, StudyService service, CancellationToken ct) =>
{
    var study = await service.GetAsync(studyUid, ct);
    return study is null ? Results.NotFound() : Results.Ok(study);
}).WithName("GetStudy");

api.MapGet("/studies/{studyUid}/series", async (string studyUid, StudyService service, CancellationToken ct) =>
    Results.Ok(await service.GetSeriesAsync(studyUid, ct))).WithName("GetStudySeries");

api.MapGet("/studies/{studyUid}/series/{seriesUid}/instances", async (string studyUid, string seriesUid, StudyService service, CancellationToken ct) =>
    Results.Ok(await service.GetInstancesAsync(studyUid, seriesUid, ct))).WithName("GetSeriesInstances");

api.MapGet("/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}", async (string studyUid, string seriesUid, string sopUid, StudyService service, CancellationToken ct) =>
{
    var instance = await service.GetInstanceAsync(studyUid, seriesUid, sopUid, ct);
    return instance is null ? Results.NotFound() : Results.Ok(instance);
}).WithName("GetInstanceMetadata");

api.MapDelete("/studies/{studyUid}", async (string studyUid, StudyService service, IDicomObjectStore store, CancellationToken ct) =>
{
    var keys = await service.DeleteStudyAsync(studyUid, ct);
    foreach (var key in keys)
        await store.DeleteAsync(key, ct);
    return Results.NoContent();
}).WithName("DeleteStudy").RequireAuthorization(AuthPolicies.Admin);

var dicom = app.MapGroup("/dicomweb").WithTags("DICOMweb");

dicom.MapGet("/studies", async (StudyService service, string? PatientID, string? PatientName, string? StudyInstanceUID, int? limit, CancellationToken ct) =>
{
    var result = await service.SearchAsync(new StudySearchRequest(
        PatientId: PatientID,
        PatientName: PatientName,
        Page: 1,
        PageSize: Math.Clamp(limit ?? 100, 1, 500)), ct);

    var items = string.IsNullOrWhiteSpace(StudyInstanceUID)
        ? result.Items
        : result.Items.Where(x => string.Equals(x.StudyInstanceUid, StudyInstanceUID, StringComparison.Ordinal));

    var qido = items.Select(x => new Dictionary<string, object?>
    {
        ["0020000D"] = Data("UI", x.StudyInstanceUid),
        ["00100020"] = Data("LO", x.PatientIdValue),
        ["00100010"] = Data("PN", x.PatientName),
        ["00080050"] = Data("SH", x.AccessionNumber),
        ["00081030"] = Data("LO", x.StudyDescription),
        ["00080020"] = Data("DA", x.StudyDate?.ToString("yyyyMMdd"))
    });

    return Results.Json(qido);
}).WithName("QidoStudies").WithSummary("QIDO-RS style study query.");

dicom.MapGet("/studies/{studyUid}/series/{seriesUid}/instances/{sopUid}", async (string studyUid, string seriesUid, string sopUid, StudyService service, IDicomObjectStore store, CancellationToken ct) =>
{
    var instance = await service.GetInstanceAsync(studyUid, seriesUid, sopUid, ct);
    if (instance is null || !store.Exists(instance.StorageKey)) return Results.NotFound();
    var stream = await store.OpenReadAsync(instance.StorageKey, ct);
    return Results.File(stream, "application/dicom", enableRangeProcessing: true);
}).WithName("WadoInstance").WithSummary("WADO-RS style DICOM instance retrieval.");



dicom.MapGet("/wado", async (
    string requestType,
    string studyUID,
    string seriesUID,
    string objectUID,
    IDicomObjectStore store,
    StudyService service,
    CancellationToken ct) =>
{
    if (!string.Equals(requestType, "WADO", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest("Only WADO requestType is supported.");

    var instance = await service.GetInstanceAsync(studyUID, seriesUID, objectUID, ct);
    if (instance is null || !store.Exists(instance.StorageKey))
        return Results.NotFound();

    var stream = await store.OpenReadAsync(instance.StorageKey, ct);
    return Results.File(stream, "application/dicom", enableRangeProcessing: true);
}).WithName("WadoUriInstance").WithSummary("WADO-URI compatible DICOM instance retrieval for Cornerstone.");

dicom.MapPost("/studies", async (HttpRequest request, IDicomObjectStore store, IDicomMetadataReader reader, IStudyRepository repository, CancellationToken ct) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest("STOW requires multipart/form-data.");

    var form = await request.ReadFormAsync(ct);
    if (form.Files.Count == 0)
        return Results.BadRequest("No DICOM files were supplied.");

    var imported = 0;
    var failed = new List<string>();
    var tempRoot = Path.Combine(Path.GetTempPath(), "DicomViewer", Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(tempRoot);

    try
    {
        foreach (var file in form.Files)
        {
            var tempPath = Path.Combine(tempRoot, Guid.NewGuid().ToString("N") + ".dcm");
            try
            {
                await using (var input = file.OpenReadStream())
                await using (var output = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan))
                {
                    await input.CopyToAsync(output, ct);
                }

                var metadata = await reader.ReadAsync(tempPath, Path.GetFileName(tempPath), ct);
                var storageKey = $"{metadata.StudyInstanceUid}/{metadata.SeriesInstanceUid}/{metadata.SopInstanceUid}.dcm";

                if (!store.Exists(storageKey))
                {
                    await using var source = new FileStream(tempPath, FileMode.Open, FileAccess.Read, FileShare.Read, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                    await store.StoreAsync(source, storageKey, ct);
                }

                await repository.UpsertDicomMetadataAsync(metadata with { StorageKey = storageKey }, ct);
                imported++;
            }
            catch (Exception ex) when (ex is InvalidDataException or IOException)
            {
                failed.Add($"{file.FileName}: {ex.Message}");
            }
            finally
            {
                try { File.Delete(tempPath); } catch { }
            }
        }
    }
    finally
    {
        try { Directory.Delete(tempRoot, recursive: true); } catch { }
    }

    return Results.Ok(new { imported, failedCount = failed.Count, failures = failed });
}).WithName("StowStudies").WithSummary("STOW-RS style multipart DICOM upload.").RequireAuthorization(AuthPolicies.Admin);

var admin = app.MapGroup("/api/admin").WithTags("Administration").RequireAuthorization(AuthPolicies.Admin);
admin.MapPost("/import-local-folder", async (IDicomImportService importer, CancellationToken ct) => Results.Ok(await importer.ImportFolderAsync(ct)))
    .WithName("ImportLocalFolder").WithSummary("Scan the configured local DICOM folder and index its metadata.");

// First-run bootstrap: creates the initial Admin from Auth:BootstrapAdmin when the user table is empty.
await using (var scope = app.Services.CreateAsyncScope())
{
    var bootstrap = builder.Configuration.GetSection("Auth:BootstrapAdmin");
    await scope.ServiceProvider.GetRequiredService<AuthService>()
        .EnsureBootstrapAdminAsync(bootstrap["Username"], bootstrap["Password"], CancellationToken.None);
}

app.Run();

static object Data(string vr, object? value) => vr == "PN"
    ? new { vr, Value = value is null ? Array.Empty<object>() : new object[] { new { Alphabetic = value } } }
    : new { vr, Value = value is null ? Array.Empty<object>() : new[] { value } };
