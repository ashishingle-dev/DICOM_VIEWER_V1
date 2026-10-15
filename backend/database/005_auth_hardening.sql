-- Run after 004_auth.sql. Adds account lockout and the procedures for password change and token cleanup.
USE DicomViewer;
GO

IF COL_LENGTH('dbo.AppUser', 'FailedLoginCount') IS NULL
    ALTER TABLE dbo.AppUser ADD FailedLoginCount INT NOT NULL CONSTRAINT DF_AppUser_FailedLoginCount DEFAULT 0;
GO

IF COL_LENGTH('dbo.AppUser', 'LockedUntilUtc') IS NULL
    ALTER TABLE dbo.AppUser ADD LockedUntilUtc DATETIME2(3) NULL;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserByUsername @Username NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) UserId, Username, PasswordHash, Role, IsActive, FailedLoginCount, LockedUntilUtc
    FROM dbo.AppUser
    WHERE Username = @Username;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserById @UserId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) UserId, Username, PasswordHash, Role, IsActive, FailedLoginCount, LockedUntilUtc
    FROM dbo.AppUser
    WHERE UserId = @UserId;
END
GO

-- Counts a failed attempt; locks the account (and resets the counter) when the limit is reached.
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RecordFailedLogin
    @UserId BIGINT,
    @MaxFailures INT,
    @LockedUntilUtc DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.AppUser SET FailedLoginCount = FailedLoginCount + 1 WHERE UserId = @UserId;
    UPDATE dbo.AppUser
    SET FailedLoginCount = 0, LockedUntilUtc = @LockedUntilUtc
    WHERE UserId = @UserId AND FailedLoginCount >= @MaxFailures;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_RecordSuccessfulLogin @UserId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.AppUser SET FailedLoginCount = 0, LockedUntilUtc = NULL WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_SetPasswordHash @UserId BIGINT, @PasswordHash NVARCHAR(512)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.AppUser SET PasswordHash = @PasswordHash WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_RevokeAllUserRefreshTokens @UserId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshToken
    SET RevokedAt = COALESCE(RevokedAt, SYSUTCDATETIME())
    WHERE UserId = @UserId;
END
GO

-- Returns the number of rows deleted.
CREATE OR ALTER PROCEDURE dbo.usp_Auth_PurgeExpiredRefreshTokens @CutoffUtc DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.RefreshToken WHERE ExpiresAt < @CutoffUtc;
    SELECT CAST(@@ROWCOUNT AS BIGINT);
END
GO
