using DicomViewer.Application.Contracts;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace DicomViewer.Infrastructure.Dicom;

public sealed class FolderImportService(
    IConfiguration configuration,
    IDicomMetadataReader metadataReader,
    IStudyRepository repository,
    ILogger<FolderImportService> logger) : IDicomImportService
{
    public async Task<ImportResult> ImportFolderAsync(CancellationToken ct)
    {
        var root = Path.GetFullPath(configuration["Storage:RootPath"] ?? throw new InvalidOperationException("Storage:RootPath is not configured."));
        if (!Directory.Exists(root)) throw new DirectoryNotFoundException($"DICOM storage folder does not exist: {root}");

        var scanned = 0; var imported = 0; var skipped = 0; var errors = new List<string>();
        foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
        {
            ct.ThrowIfCancellationRequested();
            scanned++;
            try
            {
                var relative = Path.GetRelativePath(root, file).Replace(Path.DirectorySeparatorChar, '/');
                if (Path.GetFileName(file).Equals("thumbs.db", StringComparison.OrdinalIgnoreCase)) { skipped++; continue; }
                var metadata = await metadataReader.ReadAsync(file, relative, ct);
                await repository.UpsertDicomMetadataAsync(metadata, ct);
                imported++;
            }
            catch (Exception ex) when (ex is InvalidDataException or IOException)
            {
                skipped++;
                errors.Add($"{file}: {ex.Message}");
                logger.LogWarning(ex, "Skipping DICOM file {File}", file);
            }
        }
        return new ImportResult(scanned, imported, skipped, errors);
    }
}
