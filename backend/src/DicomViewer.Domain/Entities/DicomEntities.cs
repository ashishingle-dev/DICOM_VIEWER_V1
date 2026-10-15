namespace DicomViewer.Domain.Entities;

public sealed record StudyRecord(
    long Id,
    long PatientId,
    string StudyInstanceUid,
    string? PatientIdValue,
    string PatientName,
    DateOnly? StudyDate,
    TimeOnly? StudyTime,
    string? AccessionNumber,
    string? StudyDescription,
    string? InstitutionName,
    int SeriesCount,
    int InstanceCount);

public sealed record SeriesRecord(
    long Id,
    long StudyId,
    string SeriesInstanceUid,
    string? Modality,
    string? SeriesNumber,
    string? SeriesDescription,
    string? BodyPartExamined,
    int InstanceCount);

public sealed record InstanceRecord(
    long Id,
    long SeriesId,
    string SopInstanceUid,
    string? SopClassUid,
    int? InstanceNumber,
    int? Rows,
    int? Columns,
    string? TransferSyntaxUid,
    string StorageKey,
    long FileSizeBytes);
