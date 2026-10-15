using DicomViewer.Application.Contracts;
using FellowOakDicom;

namespace DicomViewer.Infrastructure.Dicom;

public sealed class FellowOakDicomMetadataReader : IDicomMetadataReader
{
    public async Task<DicomMetadata> ReadAsync(string absolutePath, string storageKey, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var file = await DicomFile.OpenAsync(absolutePath);
        var dataset = file.Dataset;

        var studyUid = GetRequired(dataset, DicomTag.StudyInstanceUID, "StudyInstanceUID");
        var seriesUid = GetRequired(dataset, DicomTag.SeriesInstanceUID, "SeriesInstanceUID");
        var sopUid = GetRequired(dataset, DicomTag.SOPInstanceUID, "SOPInstanceUID");

        return new DicomMetadata(
            StorageKey: storageKey,
            FileSizeBytes: new FileInfo(absolutePath).Length,
            StudyInstanceUid: studyUid,
            PatientId: GetOptional(dataset, DicomTag.PatientID),
            PatientName: GetOptional(dataset, DicomTag.PatientName) ?? "Unknown",
            StudyDate: GetDate(dataset, DicomTag.StudyDate),
            StudyTime: GetTime(dataset, DicomTag.StudyTime),
            AccessionNumber: GetOptional(dataset, DicomTag.AccessionNumber),
            StudyDescription: GetOptional(dataset, DicomTag.StudyDescription),
            InstitutionName: GetOptional(dataset, DicomTag.InstitutionName),
            SeriesInstanceUid: seriesUid,
            Modality: GetOptional(dataset, DicomTag.Modality),
            SeriesNumber: GetOptional(dataset, DicomTag.SeriesNumber),
            SeriesDescription: GetOptional(dataset, DicomTag.SeriesDescription),
            BodyPartExamined: GetOptional(dataset, DicomTag.BodyPartExamined),
            SopInstanceUid: sopUid,
            SopClassUid: GetOptional(dataset, DicomTag.SOPClassUID),
            InstanceNumber: GetInt(dataset, DicomTag.InstanceNumber),
            Rows: GetInt(dataset, DicomTag.Rows),
            Columns: GetInt(dataset, DicomTag.Columns),
            TransferSyntaxUid: file.FileMetaInfo?.TransferSyntax?.UID?.UID);
    }

    private static string GetRequired(DicomDataset dataset, DicomTag tag, string name)
        => GetOptional(dataset, tag) ?? throw new InvalidDataException($"Missing required DICOM tag {name}.");

    private static string? GetOptional(DicomDataset dataset, DicomTag tag)
        => dataset.TryGetSingleValue<string>(tag, out var value) ? value : null;

    private static int? GetInt(DicomDataset dataset, DicomTag tag)
        => dataset.TryGetSingleValue<int>(tag, out var value) ? value : null;

    private static DateOnly? GetDate(DicomDataset dataset, DicomTag tag)
    {
        var value = GetOptional(dataset, tag);
        return DateOnly.TryParseExact(value, "yyyyMMdd", out var parsed) ? parsed : null;
    }

    private static TimeOnly? GetTime(DicomDataset dataset, DicomTag tag)
    {
        var value = GetOptional(dataset, tag);
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = value!.Split('.')[0].PadRight(6, '0')[..6];
        return TimeOnly.TryParseExact(normalized, "HHmmss", out var parsed) ? parsed : null;
    }
}
