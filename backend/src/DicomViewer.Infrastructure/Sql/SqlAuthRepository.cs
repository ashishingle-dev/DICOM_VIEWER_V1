using System.Data;
using DicomViewer.Application.Contracts;
using DicomViewer.Application.Services;
using DicomViewer.Domain.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace DicomViewer.Infrastructure.Sql;

public sealed class SqlAuthRepository : IAuthRepository
{
    private const int SqlErrorDuplicateKey = 2627;   // unique constraint violation
    private const int SqlErrorDuplicateIndex = 2601; // unique index violation

    private readonly string _connectionString;
    private readonly int _commandTimeoutSeconds;

    public SqlAuthRepository(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        _connectionString =
            configuration.GetConnectionString("SqlServer")
            ?? throw new InvalidOperationException("ConnectionStrings:SqlServer is not configured.");

        _commandTimeoutSeconds = configuration.GetValue<int?>("Database:CommandTimeoutSeconds") ?? 30;
    }

    public async Task<AppUser?> FindUserByUsernameAsync(string username, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_GetUserByUsername");
        command.Parameters.Add(new SqlParameter("@Username", SqlDbType.NVarChar, 64) { Value = username });

        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? ReadUser(reader) : null;
    }

    public async Task<AppUser?> FindUserByIdAsync(long userId, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_GetUserById");
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });

        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? ReadUser(reader) : null;
    }

    public async Task<long> CountUsersAsync(CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_CountUsers");
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct));
    }

    public async Task<AppUser> CreateUserAsync(string username, string passwordHash, string role, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_CreateUser");
        command.Parameters.Add(new SqlParameter("@Username", SqlDbType.NVarChar, 64) { Value = username });
        command.Parameters.Add(new SqlParameter("@PasswordHash", SqlDbType.NVarChar, 512) { Value = passwordHash });
        command.Parameters.Add(new SqlParameter("@Role", SqlDbType.NVarChar, 32) { Value = role });

        try
        {
            var userId = Convert.ToInt64(await command.ExecuteScalarAsync(ct));
            return new AppUser(userId, username, passwordHash, role, IsActive: true, FailedLoginCount: 0, LockedUntilUtc: null);
        }
        catch (SqlException ex) when (ex.Number is SqlErrorDuplicateKey or SqlErrorDuplicateIndex)
        {
            throw new UsernameTakenException(username);
        }
    }

    public async Task RecordFailedLoginAsync(long userId, int maxFailures, DateTime lockedUntilUtc, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RecordFailedLogin");
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });
        command.Parameters.Add(new SqlParameter("@MaxFailures", SqlDbType.Int) { Value = maxFailures });
        command.Parameters.Add(new SqlParameter("@LockedUntilUtc", SqlDbType.DateTime2) { Value = lockedUntilUtc });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task RecordSuccessfulLoginAsync(long userId, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RecordSuccessfulLogin");
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task SetPasswordHashAsync(long userId, string passwordHash, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_SetPasswordHash");
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });
        command.Parameters.Add(new SqlParameter("@PasswordHash", SqlDbType.NVarChar, 512) { Value = passwordHash });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task InsertRefreshTokenAsync(RefreshTokenInsert token, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_InsertRefreshToken");
        AddRefreshTokenParameters(command, token.UserId, token.TokenHash, token.FamilyId, token.ExpiresAtUtc);
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<RefreshTokenRecord?> FindRefreshTokenAsync(string tokenHash, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_GetRefreshToken");
        command.Parameters.Add(new SqlParameter("@TokenHash", SqlDbType.Char, 64) { Value = tokenHash });

        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return null;

        var revokedOrdinal = reader.GetOrdinal("RevokedAt");
        return new RefreshTokenRecord(
            RefreshTokenId: reader.GetInt64(reader.GetOrdinal("RefreshTokenId")),
            UserId: reader.GetInt64(reader.GetOrdinal("UserId")),
            TokenHash: reader.GetString(reader.GetOrdinal("TokenHash")),
            FamilyId: reader.GetGuid(reader.GetOrdinal("FamilyId")),
            ExpiresAtUtc: reader.GetDateTime(reader.GetOrdinal("ExpiresAt")),
            RevokedAtUtc: reader.IsDBNull(revokedOrdinal) ? null : reader.GetDateTime(revokedOrdinal));
    }

    public async Task<bool> RotateRefreshTokenAsync(string currentTokenHash, RefreshTokenInsert successor, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RotateRefreshToken");
        command.Parameters.Add(new SqlParameter("@CurrentTokenHash", SqlDbType.Char, 64) { Value = currentTokenHash });
        AddRefreshTokenParameters(command, successor.UserId, successor.TokenHash, successor.FamilyId, successor.ExpiresAtUtc, "@NewTokenHash");

        var rotated = Convert.ToInt32(await command.ExecuteScalarAsync(ct));
        return rotated == 1;
    }

    public async Task RevokeRefreshTokenAsync(string tokenHash, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RevokeRefreshToken");
        command.Parameters.Add(new SqlParameter("@TokenHash", SqlDbType.Char, 64) { Value = tokenHash });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task RevokeRefreshTokenFamilyAsync(Guid familyId, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RevokeRefreshTokenFamily");
        command.Parameters.Add(new SqlParameter("@FamilyId", SqlDbType.UniqueIdentifier) { Value = familyId });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task RevokeAllRefreshTokensAsync(long userId, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_RevokeAllUserRefreshTokens");
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<long> PurgeExpiredRefreshTokensAsync(DateTime cutoffUtc, CancellationToken ct)
    {
        await using var connection = await OpenAsync(ct);
        await using var command = Procedure(connection, "dbo.usp_Auth_PurgeExpiredRefreshTokens");
        command.Parameters.Add(new SqlParameter("@CutoffUtc", SqlDbType.DateTime2) { Value = cutoffUtc });
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct));
    }

    private async Task<SqlConnection> OpenAsync(CancellationToken ct)
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

    private SqlCommand Procedure(SqlConnection connection, string name) => new(name, connection)
    {
        CommandType = CommandType.StoredProcedure,
        CommandTimeout = _commandTimeoutSeconds,
    };

    private static void AddRefreshTokenParameters(
        SqlCommand command, long userId, string tokenHash, Guid familyId, DateTime expiresUtc, string hashParameterName = "@TokenHash")
    {
        command.Parameters.Add(new SqlParameter("@UserId", SqlDbType.BigInt) { Value = userId });
        command.Parameters.Add(new SqlParameter(hashParameterName, SqlDbType.Char, 64) { Value = tokenHash });
        command.Parameters.Add(new SqlParameter("@FamilyId", SqlDbType.UniqueIdentifier) { Value = familyId });
        command.Parameters.Add(new SqlParameter("@ExpiresAt", SqlDbType.DateTime2) { Value = expiresUtc });
    }

    private static AppUser ReadUser(SqlDataReader reader)
    {
        var lockedOrdinal = reader.GetOrdinal("LockedUntilUtc");
        return new AppUser(
            UserId: reader.GetInt64(reader.GetOrdinal("UserId")),
            Username: reader.GetString(reader.GetOrdinal("Username")),
            PasswordHash: reader.GetString(reader.GetOrdinal("PasswordHash")),
            Role: reader.GetString(reader.GetOrdinal("Role")),
            IsActive: reader.GetBoolean(reader.GetOrdinal("IsActive")),
            FailedLoginCount: reader.GetInt32(reader.GetOrdinal("FailedLoginCount")),
            LockedUntilUtc: reader.IsDBNull(lockedOrdinal) ? null : reader.GetDateTime(lockedOrdinal));
    }
}
