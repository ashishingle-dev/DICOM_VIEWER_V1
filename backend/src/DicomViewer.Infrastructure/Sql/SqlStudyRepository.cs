using System.Data;
using DicomViewer.Application.Contracts;
using DicomViewer.Domain.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace DicomViewer.Infrastructure.Sql;

public sealed class SqlStudyRepository : IStudyRepository
{
    private const string SearchStudiesProcedure = "dbo.usp_SearchStudies";
    private const string GetStudyProcedure = "dbo.usp_GetStudy";
    private const string GetSeriesProcedure = "dbo.usp_GetSeriesByStudy";
    private const string GetInstancesProcedure = "dbo.usp_GetInstancesBySeries";
    private const string GetInstanceProcedure = "dbo.usp_GetInstance";
    private const string UpsertDicomProcedure = "dbo.usp_UpsertDicomInstance";

    private readonly string _connectionString;
    private readonly int _commandTimeoutSeconds;

    public SqlStudyRepository(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        _connectionString =
            configuration.GetConnectionString("SqlServer")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:SqlServer is not configured.");

        _commandTimeoutSeconds =
            configuration.GetValue<int?>("Database:CommandTimeoutSeconds")
            ?? 30;

        if (_commandTimeoutSeconds <= 0)
        {
            throw new InvalidOperationException(
                "Database:CommandTimeoutSeconds must be greater than zero.");
        }
    }

    public async Task<PagedResult<StudyRecord>> SearchAsync(
    StudySearchRequest request,
    CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(request);

        await using var connection = await OpenConnectionAsync(ct);

        await using var command = CreateStoredProcedureCommand(
            connection,
            SearchStudiesProcedure);

        AddNullableParameter(
            command,
            "@PatientId",
            SqlDbType.NVarChar,
            request.PatientId);

        AddNullableParameter(
            command,
            "@PatientName",
            SqlDbType.NVarChar,
            request.PatientName);

        AddNullableParameter(
            command,
            "@StudyDateFrom",
            SqlDbType.DateTime2,
            request.StudyDateFrom?.ToDateTime(TimeOnly.MinValue));

        AddNullableParameter(
            command,
            "@StudyDateTo",
            SqlDbType.DateTime2,
            request.StudyDateTo?.ToDateTime(TimeOnly.MaxValue));

        AddNullableParameter(
            command,
            "@Modality",
            SqlDbType.NVarChar,
            request.Modality);

        AddRequiredParameter(
            command,
            "@Page",
            SqlDbType.Int,
            request.Page);

        AddRequiredParameter(
            command,
            "@PageSize",
            SqlDbType.Int,
            request.PageSize);

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        var items = new List<StudyRecord>(request.PageSize);
        long totalCount = 0;

        while (await reader.ReadAsync(ct))
        {
            totalCount = GetInt64(reader, "TotalCount");
            items.Add(ReadStudy(reader));
        }

        return new PagedResult<StudyRecord>(
            items,
            request.Page,
            request.PageSize,
            totalCount);
    }

    public async Task<StudyRecord?> GetAsync(
        string studyInstanceUid,
        CancellationToken ct)
    {
        EnsureUid(studyInstanceUid, nameof(studyInstanceUid));

        await using var connection = await OpenConnectionAsync(ct);
        await using var command = CreateStoredProcedureCommand(
            connection,
            GetStudyProcedure);

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        return await reader.ReadAsync(ct)
            ? ReadStudy(reader)
            : null;
    }

    public async Task<IReadOnlyList<SeriesRecord>> GetSeriesAsync(
        string studyInstanceUid,
        CancellationToken ct)
    {
        EnsureUid(studyInstanceUid, nameof(studyInstanceUid));

        await using var connection = await OpenConnectionAsync(ct);
        await using var command = CreateStoredProcedureCommand(
            connection,
            GetSeriesProcedure);

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        var result = new List<SeriesRecord>();

        while (await reader.ReadAsync(ct))
        {
            result.Add(ReadSeries(reader));
        }

        return result;
    }

    public async Task<IReadOnlyList<InstanceRecord>> GetInstancesAsync(
        string studyInstanceUid,
        string seriesInstanceUid,
        CancellationToken ct)
    {
        EnsureUid(studyInstanceUid, nameof(studyInstanceUid));
        EnsureUid(seriesInstanceUid, nameof(seriesInstanceUid));

        await using var connection = await OpenConnectionAsync(ct);
        await using var command = CreateStoredProcedureCommand(
            connection,
            GetInstancesProcedure);

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        AddRequiredParameter(
            command,
            "@SeriesInstanceUid",
            SqlDbType.NVarChar,
            seriesInstanceUid);

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        var result = new List<InstanceRecord>();

        while (await reader.ReadAsync(ct))
        {
            result.Add(ReadInstance(reader));
        }

        return result;
    }

    public async Task<InstanceRecord?> GetInstanceAsync(
        string studyInstanceUid,
        string seriesInstanceUid,
        string sopInstanceUid,
        CancellationToken ct)
    {
        EnsureUid(studyInstanceUid, nameof(studyInstanceUid));
        EnsureUid(seriesInstanceUid, nameof(seriesInstanceUid));
        EnsureUid(sopInstanceUid, nameof(sopInstanceUid));

        await using var connection = await OpenConnectionAsync(ct);
        await using var command = CreateStoredProcedureCommand(
            connection,
            GetInstanceProcedure);

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        AddRequiredParameter(
            command,
            "@SeriesInstanceUid",
            SqlDbType.NVarChar,
            seriesInstanceUid);

        AddRequiredParameter(
            command,
            "@SopInstanceUid",
            SqlDbType.NVarChar,
            sopInstanceUid);

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        return await reader.ReadAsync(ct)
            ? ReadInstance(reader)
            : null;
    }

    public async Task<IReadOnlyList<string>> DeleteStudyAsync(
        string studyInstanceUid,
        CancellationToken ct)
    {
        EnsureUid(studyInstanceUid, nameof(studyInstanceUid));

        await using var connection = await OpenConnectionAsync(ct);

        await using var transaction =
            (SqlTransaction)await connection.BeginTransactionAsync(ct);

        try
        {
            var storageKeys = await GetStorageKeysForStudyAsync(
                connection,
                transaction,
                studyInstanceUid,
                ct);

            await DeleteStudyMetadataAsync(
                connection,
                transaction,
                studyInstanceUid,
                ct);

            await transaction.CommitAsync(ct);

            return storageKeys;
        }
        catch
        {
            try
            {
                await transaction.RollbackAsync(ct);
            }
            catch
            {
                // Preserve the original exception.
            }

            throw;
        }
    }

    public async Task UpsertDicomMetadataAsync(
        DicomMetadata metadata,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(metadata);

        await using var connection = await OpenConnectionAsync(ct);
        await using var command = CreateStoredProcedureCommand(
            connection,
            UpsertDicomProcedure);

        AddRequiredParameter(
            command,
            "@StorageKey",
            SqlDbType.NVarChar,
            metadata.StorageKey);

        AddRequiredParameter(
            command,
            "@FileSizeBytes",
            SqlDbType.BigInt,
            metadata.FileSizeBytes);

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            metadata.StudyInstanceUid);

        AddNullableParameter(
            command,
            "@PatientId",
            SqlDbType.NVarChar,
            metadata.PatientId);

        AddRequiredParameter(
            command,
            "@PatientName",
            SqlDbType.NVarChar,
            metadata.PatientName);

        AddNullableParameter(
            command,
            "@StudyDate",
            SqlDbType.DateTime2,
            metadata.StudyDate?.ToDateTime(TimeOnly.MinValue));

        AddNullableParameter(
            command,
            "@StudyTime",
            SqlDbType.Time,
            metadata.StudyTime?.ToTimeSpan());

        AddNullableParameter(
            command,
            "@AccessionNumber",
            SqlDbType.NVarChar,
            metadata.AccessionNumber);

        AddNullableParameter(
            command,
            "@StudyDescription",
            SqlDbType.NVarChar,
            metadata.StudyDescription);

        AddNullableParameter(
            command,
            "@InstitutionName",
            SqlDbType.NVarChar,
            metadata.InstitutionName);

        AddRequiredParameter(
            command,
            "@SeriesInstanceUid",
            SqlDbType.NVarChar,
            metadata.SeriesInstanceUid);

        AddNullableParameter(
            command,
            "@Modality",
            SqlDbType.NVarChar,
            metadata.Modality);

        AddNullableParameter(
            command,
            "@SeriesNumber",
            SqlDbType.NVarChar,
            metadata.SeriesNumber);

        AddNullableParameter(
            command,
            "@SeriesDescription",
            SqlDbType.NVarChar,
            metadata.SeriesDescription);

        AddNullableParameter(
            command,
            "@BodyPartExamined",
            SqlDbType.NVarChar,
            metadata.BodyPartExamined);

        AddRequiredParameter(
            command,
            "@SopInstanceUid",
            SqlDbType.NVarChar,
            metadata.SopInstanceUid);

        AddNullableParameter(
            command,
            "@SopClassUid",
            SqlDbType.NVarChar,
            metadata.SopClassUid);

        AddNullableParameter(
            command,
            "@InstanceNumber",
            SqlDbType.Int,
            metadata.InstanceNumber);

        AddNullableParameter(
            command,
            "@Rows",
            SqlDbType.Int,
            metadata.Rows);

        AddNullableParameter(
            command,
            "@Columns",
            SqlDbType.Int,
            metadata.Columns);

        AddNullableParameter(
            command,
            "@TransferSyntaxUid",
            SqlDbType.NVarChar,
            metadata.TransferSyntaxUid);

        await command.ExecuteNonQueryAsync(ct);
    }

    private async Task<SqlConnection> OpenConnectionAsync(
        CancellationToken ct)
    {
        var connection = new SqlConnection(_connectionString);

        try
        {
            await connection.OpenAsync(ct);
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    private SqlCommand CreateStoredProcedureCommand(
        SqlConnection connection,
        string procedureName,
        SqlTransaction? transaction = null)
    {
        return new SqlCommand(
            procedureName,
            connection,
            transaction)
        {
            CommandType = CommandType.StoredProcedure,
            CommandTimeout = _commandTimeoutSeconds,
        };
    }

    private static void AddRequiredParameter(
        SqlCommand command,
        string name,
        SqlDbType type,
        object value)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(value);

        command.Parameters.Add(
            new SqlParameter(name, type)
            {
                Value = value,
            });
    }

    private static void AddNullableParameter(
        SqlCommand command,
        string name,
        SqlDbType type,
        object? value)
    {
        ArgumentNullException.ThrowIfNull(command);

        command.Parameters.Add(
            new SqlParameter(name, type)
            {
                Value = value ?? DBNull.Value,
            });
    }

    private static async Task<List<string>> GetStorageKeysForStudyAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string studyInstanceUid,
        CancellationToken ct)
    {
        const string sql = """
            SELECT i.StorageKey
            FROM dbo.Instance AS i
            INNER JOIN dbo.Series AS se
                ON se.SeriesId = i.SeriesId
            INNER JOIN dbo.Study AS s
                ON s.StudyId = se.StudyId
            WHERE s.StudyInstanceUid = @StudyInstanceUid;
            """;

        await using var command = new SqlCommand(
            sql,
            connection,
            transaction)
        {
            CommandType = CommandType.Text,
        };

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        var keys = new List<string>();

        await using var reader =
            await command.ExecuteReaderAsync(ct);

        while (await reader.ReadAsync(ct))
        {
            if (!reader.IsDBNull(0))
            {
                keys.Add(reader.GetString(0));
            }
        }

        return keys;
    }

    private static async Task DeleteStudyMetadataAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string studyInstanceUid,
        CancellationToken ct)
    {
        const string sql = """
            DECLARE @StudyId BIGINT;

            SELECT @StudyId = StudyId
            FROM dbo.Study
            WHERE StudyInstanceUid = @StudyInstanceUid;

            IF @StudyId IS NOT NULL
            BEGIN
                DELETE i
                FROM dbo.Instance AS i
                INNER JOIN dbo.Series AS se
                    ON se.SeriesId = i.SeriesId
                WHERE se.StudyId = @StudyId;

                DELETE FROM dbo.Series
                WHERE StudyId = @StudyId;

                DELETE FROM dbo.Study
                WHERE StudyId = @StudyId;
            END;
            """;

        await using var command = new SqlCommand(
            sql,
            connection,
            transaction)
        {
            CommandType = CommandType.Text,
        };

        AddRequiredParameter(
            command,
            "@StudyInstanceUid",
            SqlDbType.NVarChar,
            studyInstanceUid);

        await command.ExecuteNonQueryAsync(ct);
    }

    private static StudyRecord ReadStudy(
        SqlDataReader reader)
    {
        return new StudyRecord(
            GetInt64(reader, "StudyId"),
            GetInt64(reader, "PatientId"),
            GetRequiredString(reader, "StudyInstanceUid"),
            GetString(reader, "PatientIdValue"),
            GetRequiredString(reader, "PatientName"),
            GetDate(reader, "StudyDate"),
            GetTime(reader, "StudyTime"),
            GetString(reader, "AccessionNumber"),
            GetString(reader, "StudyDescription"),
            GetString(reader, "InstitutionName"),
            GetInt32(reader, "SeriesCount"),
            GetInt32(reader, "InstanceCount"));
    }

    private static SeriesRecord ReadSeries(
        SqlDataReader reader)
    {
        return new SeriesRecord(
            GetInt64(reader, "SeriesId"),
            GetInt64(reader, "StudyId"),
            GetRequiredString(reader, "SeriesInstanceUid"),
            GetString(reader, "Modality"),
            GetString(reader, "SeriesNumber"),
            GetString(reader, "SeriesDescription"),
            GetString(reader, "BodyPartExamined"),
            GetInt32(reader, "InstanceCount"));
    }

    private static InstanceRecord ReadInstance(
        SqlDataReader reader)
    {
        return new InstanceRecord(
            GetInt64(reader, "InstanceId"),
            GetInt64(reader, "SeriesId"),
            GetRequiredString(reader, "SopInstanceUid"),
            GetString(reader, "SopClassUid"),
            GetNullableInt32(reader, "InstanceNumber"),
            GetNullableInt32(reader, "Rows"),
            GetNullableInt32(reader, "Columns"),
            GetString(reader, "TransferSyntaxUid"),
            GetRequiredString(reader, "StorageKey"),
            GetInt64(reader, "FileSizeBytes"));
    }

    private static string GetRequiredString(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            throw new DataException(
                $"Required database column '{columnName}' returned NULL.");
        }

        return Convert.ToString(
                   reader.GetValue(ordinal))
               ?? throw new DataException(
                   $"Required database column '{columnName}' could not be converted to string.");
    }

    private static string? GetString(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        return Convert.ToString(reader.GetValue(ordinal));
    }

    private static int GetInt32(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return 0;
        }

        return Convert.ToInt32(reader.GetValue(ordinal));
    }

    private static int? GetNullableInt32(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        return Convert.ToInt32(reader.GetValue(ordinal));
    }

    private static long GetInt64(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return 0L;
        }

        return Convert.ToInt64(reader.GetValue(ordinal));
    }

    private static DateOnly? GetDate(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetValue(ordinal);

        return value switch
        {
            DateTime dateTime => DateOnly.FromDateTime(dateTime),

            DateOnly dateOnly => dateOnly,

            _ => throw new DataException(
                $"Database column '{columnName}' contains unsupported date type '{value.GetType().Name}'."),
        };
    }

    private static TimeOnly? GetTime(
        SqlDataReader reader,
        string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);

        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetValue(ordinal);

        return value switch
        {
            TimeSpan timeSpan => TimeOnly.FromTimeSpan(timeSpan),

            TimeOnly timeOnly => timeOnly,

            _ => throw new DataException(
                $"Database column '{columnName}' contains unsupported time type '{value.GetType().Name}'."),
        };
    }

    private static void EnsureUid(
        string value,
        string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException(
                "A DICOM UID is required.",
                parameterName);
        }
    }
}