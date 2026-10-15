using DicomViewer.Application.Contracts;
using Microsoft.Extensions.Configuration;

namespace DicomViewer.Infrastructure.Storage;

public sealed class LocalFileDicomObjectStore(IConfiguration configuration) : IDicomObjectStore
{
    private readonly string _rootPath = Path.GetFullPath(
        configuration["Storage:RootPath"]
        ?? throw new InvalidOperationException("Storage:RootPath is not configured."));

    public string RootPath => _rootPath;

    public string ResolveAbsolutePath(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey))
            throw new ArgumentException("Storage key is required.", nameof(storageKey));

        var normalized = storageKey.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, normalized));

        if (!fullPath.StartsWith(_rootPath.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(fullPath, _rootPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Storage key escapes the configured storage root.");
        }

        return fullPath;
    }

    public Task<Stream> OpenReadAsync(string storageKey, CancellationToken ct)
    {
        var path = ResolveAbsolutePath(storageKey);
        Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Task.FromResult(stream);
    }

    public async Task<string> StoreAsync(Stream source, string storageKey, CancellationToken ct)
    {
        var path = ResolveAbsolutePath(storageKey);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 128 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        await source.CopyToAsync(target, ct);
        return storageKey;
    }

    public async Task DeleteAsync(string storageKey, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var path = ResolveAbsolutePath(storageKey);
        if (File.Exists(path))
            File.Delete(path);
        await Task.CompletedTask;
    }

    public bool Exists(string storageKey) => File.Exists(ResolveAbsolutePath(storageKey));
}
