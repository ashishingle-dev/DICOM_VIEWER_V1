USE DicomViewer;
GO

-- Users. Roles must match DicomViewer.Domain.Entities.AppRoles.
IF OBJECT_ID('dbo.AppUser','U') IS NULL
BEGIN
    CREATE TABLE dbo.AppUser (
        UserId       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppUser PRIMARY KEY,
        Username     NVARCHAR(64)  NOT NULL,
        PasswordHash NVARCHAR(512) NOT NULL,
        Role         NVARCHAR(32)  NOT NULL,
        IsActive     BIT           NOT NULL CONSTRAINT DF_AppUser_IsActive DEFAULT 1,
        CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_AppUser_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_AppUser_Username UNIQUE (Username),
        CONSTRAINT CK_AppUser_Role CHECK (Role IN (N'Admin', N'Viewer'))
    );
END
GO

-- Refresh tokens. Only SHA-256 hashes (hex, 64 chars) are stored. Tokens of one login share a FamilyId.
IF OBJECT_ID('dbo.RefreshToken','U') IS NULL
BEGIN
    CREATE TABLE dbo.RefreshToken (
        RefreshTokenId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RefreshToken PRIMARY KEY,
        UserId         BIGINT           NOT NULL CONSTRAINT FK_RefreshToken_AppUser REFERENCES dbo.AppUser(UserId),
        TokenHash      CHAR(64)         NOT NULL,
        FamilyId       UNIQUEIDENTIFIER NOT NULL,
        CreatedAt      DATETIME2(3)     NOT NULL CONSTRAINT DF_RefreshToken_CreatedAt DEFAULT SYSUTCDATETIME(),
        ExpiresAt      DATETIME2(3)     NOT NULL,
        RevokedAt      DATETIME2(3)     NULL,
        CONSTRAINT UQ_RefreshToken_TokenHash UNIQUE (TokenHash)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RefreshToken_Family' AND object_id = OBJECT_ID('dbo.RefreshToken'))
    CREATE INDEX IX_RefreshToken_Family ON dbo.RefreshToken(FamilyId) WHERE RevokedAt IS NULL;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserByUsername @Username NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) UserId, Username, PasswordHash, Role, IsActive
    FROM dbo.AppUser
    WHERE Username = @Username;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserById @UserId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) UserId, Username, PasswordHash, Role, IsActive
    FROM dbo.AppUser
    WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_CountUsers
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT_BIG(*) FROM dbo.AppUser;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_CreateUser
    @Username NVARCHAR(64),
    @PasswordHash NVARCHAR(512),
    @Role NVARCHAR(32)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.AppUser (Username, PasswordHash, Role)
    VALUES (@Username, @PasswordHash, @Role);
    SELECT CAST(SCOPE_IDENTITY() AS BIGINT);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_InsertRefreshToken
    @UserId BIGINT,
    @TokenHash CHAR(64),
    @FamilyId UNIQUEIDENTIFIER,
    @ExpiresAt DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.RefreshToken (UserId, TokenHash, FamilyId, ExpiresAt)
    VALUES (@UserId, @TokenHash, @FamilyId, @ExpiresAt);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetRefreshToken @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) RefreshTokenId, UserId, TokenHash, FamilyId, ExpiresAt, RevokedAt
    FROM dbo.RefreshToken
    WHERE TokenHash = @TokenHash;
END
GO

-- Revokes the current token and inserts its successor in one transaction.
-- Returns 1 when rotated, 0 when the current token was no longer active (concurrent reuse).
CREATE OR ALTER PROCEDURE dbo.usp_Auth_RotateRefreshToken
    @CurrentTokenHash CHAR(64),
    @UserId BIGINT,
    @NewTokenHash CHAR(64),
    @FamilyId UNIQUEIDENTIFIER,
    @ExpiresAt DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Rotated INT = 0;

    BEGIN TRANSACTION;

    UPDATE dbo.RefreshToken
    SET RevokedAt = SYSUTCDATETIME()
    WHERE TokenHash = @CurrentTokenHash AND RevokedAt IS NULL;

    IF @@ROWCOUNT = 1
    BEGIN
        INSERT INTO dbo.RefreshToken (UserId, TokenHash, FamilyId, ExpiresAt)
        VALUES (@UserId, @NewTokenHash, @FamilyId, @ExpiresAt);
        SET @Rotated = 1;
    END

    COMMIT TRANSACTION;

    SELECT @Rotated AS Rotated;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_RevokeRefreshToken @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshToken
    SET RevokedAt = SYSUTCDATETIME()
    WHERE TokenHash = @TokenHash AND RevokedAt IS NULL;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_RevokeRefreshTokenFamily @FamilyId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.RefreshToken
    SET RevokedAt = SYSUTCDATETIME()
    WHERE FamilyId = @FamilyId AND RevokedAt IS NULL;
END
GO
