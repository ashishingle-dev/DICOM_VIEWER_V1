using DicomViewer.Application.Contracts;
using DicomViewer.Domain.Entities;

namespace DicomViewer.Application.Services;

public sealed class StudyService(IStudyRepository repository)
{
    public Task<PagedResult<StudyRecord>> SearchAsync(StudySearchRequest request, CancellationToken ct)
    {
        var normalized = request with
        {
            Page = Math.Max(1, request.Page),
            PageSize = Math.Clamp(request.PageSize, 1, 200)
        };
        return repository.SearchAsync(normalized, ct);
    }

    public Task<StudyRecord?> GetAsync(string uid, CancellationToken ct) => repository.GetAsync(uid, ct);
    public Task<IReadOnlyList<SeriesRecord>> GetSeriesAsync(string uid, CancellationToken ct) => repository.GetSeriesAsync(uid, ct);
    public Task<IReadOnlyList<InstanceRecord>> GetInstancesAsync(string studyUid, string seriesUid, CancellationToken ct) => repository.GetInstancesAsync(studyUid, seriesUid, ct);
    public Task<InstanceRecord?> GetInstanceAsync(string studyUid, string seriesUid, string sopUid, CancellationToken ct) => repository.GetInstanceAsync(studyUid, seriesUid, sopUid, ct);
    public Task<IReadOnlyList<string>> DeleteStudyAsync(string studyUid, CancellationToken ct) => repository.DeleteStudyAsync(studyUid, ct);
}
