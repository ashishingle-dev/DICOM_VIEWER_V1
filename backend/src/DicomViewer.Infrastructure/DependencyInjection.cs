using DicomViewer.Application.Contracts;
using DicomViewer.Infrastructure.Auth;
using DicomViewer.Infrastructure.Dicom;
using DicomViewer.Infrastructure.Sql;
using DicomViewer.Infrastructure.Storage;
using FellowOakDicom;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DicomViewer.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IStudyRepository, SqlStudyRepository>();
        services.AddSingleton<IDicomObjectStore, LocalFileDicomObjectStore>();
        services.AddSingleton<IDicomMetadataReader, FellowOakDicomMetadataReader>();
        services.AddScoped<IDicomImportService, FolderImportService>();
        services.AddFellowOakDicom();

        // Authentication
        services.AddSingleton(JwtSettings.FromConfiguration(configuration));
        services.AddSingleton<IAuthRepository, SqlAuthRepository>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
        services.TryAddSingleton(TimeProvider.System);

        return services;
    }
}
