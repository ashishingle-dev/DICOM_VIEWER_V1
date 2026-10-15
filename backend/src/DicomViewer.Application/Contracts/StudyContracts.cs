using DicomViewer.Domain.Entities;

namespace DicomViewer.Application.Contracts;

public sealed record StudySearchRequest(
    string? PatientId = null,
    string? PatientName = null,
    DateOnly? StudyDateFrom = null,
    DateOnly? StudyDateTo = null,
    string? Modality = null,
    int Page = 1,
    int PageSize = 50);

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    long TotalCount);

public interface IStudyRepository
{
    Task<PagedResult<StudyRecord>> SearchAsync(StudySearchRequest request, CancellationToken ct);
    Task<StudyRecord?> GetAsync(string studyInstanceUid, CancellationToken ct);
    Task<IReadOnlyList<SeriesRecord>> GetSeriesAsync(string studyInstanceUid, CancellationToken ct);
    Task<IReadOnlyList<InstanceRecord>> GetInstancesAsync(string studyInstanceUid, string seriesInstanceUid, CancellationToken ct);
    Task<InstanceRecord?> GetInstanceAsync(string studyInstanceUid, string seriesInstanceUid, string sopInstanceUid, CancellationToken ct);
    Task<IReadOnlyList<string>> DeleteStudyAsync(string studyInstanceUid, CancellationToken ct);
    Task UpsertDicomMetadataAsync(DicomMetadata metadata, CancellationToken ct);
}

public sealed record DicomMetadata(
    string StorageKey,
    long FileSizeBytes,
    string StudyInstanceUid,
    string? PatientId,
    string PatientName,
    DateOnly? StudyDate,
    TimeOnly? StudyTime,
    string? AccessionNumber,
    string? StudyDescription,
    string? InstitutionName,
    string SeriesInstanceUid,
    string? Modality,
    string? SeriesNumber,
    string? SeriesDescription,
    string? BodyPartExamined,
    string SopInstanceUid,
    string? SopClassUid,
    int? InstanceNumber,
    int? Rows,
    int? Columns,
    string? TransferSyntaxUid);

public interface IDicomObjectStore
{
    string RootPath { get; }
    string ResolveAbsolutePath(string storageKey);
    Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct);
    Task<string> StoreAsync(Stream source, string storageKey, CancellationToken ct);
    Task DeleteAsync(string storageKey, CancellationToken ct);
    bool Exists(string storageKey);
}

public interface IDicomMetadataReader
{
    Task<DicomMetadata> ReadAsync(string absolutePath, string storageKey, CancellationToken ct);
}

public interface IDicomImportService
{
    Task<ImportResult> ImportFolderAsync(CancellationToken ct);
}

public sealed record ImportResult(int FilesScanned, int FilesImported, int FilesSkipped, IReadOnlyList<string> Errors);
