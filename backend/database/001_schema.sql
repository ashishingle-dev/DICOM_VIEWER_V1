IF DB_ID(N'DicomViewer') IS NULL CREATE DATABASE DicomViewer;
GO
USE DicomViewer;
GO

IF OBJECT_ID('dbo.Patient','U') IS NULL
BEGIN
    CREATE TABLE dbo.Patient (
        PatientId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Patient PRIMARY KEY,
        PatientIdentifier NVARCHAR(64) NULL,
        PatientName NVARCHAR(256) NOT NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Patient_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('dbo.Study','U') IS NULL
BEGIN
    CREATE TABLE dbo.Study (
        StudyId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Study PRIMARY KEY,
        PatientId BIGINT NOT NULL CONSTRAINT FK_Study_Patient REFERENCES dbo.Patient(PatientId),
        StudyInstanceUid NVARCHAR(128) NOT NULL,
        StudyDate DATE NULL,
        StudyTime TIME(0) NULL,
        AccessionNumber NVARCHAR(64) NULL,
        StudyDescription NVARCHAR(512) NULL,
        InstitutionName NVARCHAR(256) NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Study_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Study_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Study_StudyInstanceUid UNIQUE (StudyInstanceUid)
    );
END
GO

IF OBJECT_ID('dbo.Series','U') IS NULL
BEGIN
    CREATE TABLE dbo.Series (
        SeriesId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Series PRIMARY KEY,
        StudyId BIGINT NOT NULL CONSTRAINT FK_Series_Study REFERENCES dbo.Study(StudyId),
        SeriesInstanceUid NVARCHAR(128) NOT NULL,
        Modality NVARCHAR(32) NULL,
        SeriesNumber NVARCHAR(32) NULL,
        SeriesDescription NVARCHAR(512) NULL,
        BodyPartExamined NVARCHAR(128) NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Series_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Series_SeriesInstanceUid UNIQUE (SeriesInstanceUid)
    );
END
GO

IF OBJECT_ID('dbo.Instance','U') IS NULL
BEGIN
    CREATE TABLE dbo.Instance (
        InstanceId BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Instance PRIMARY KEY,
        SeriesId BIGINT NOT NULL CONSTRAINT FK_Instance_Series REFERENCES dbo.Series(SeriesId),
        SopInstanceUid NVARCHAR(128) NOT NULL,
        SopClassUid NVARCHAR(128) NULL,
        InstanceNumber INT NULL,
        Rows INT NULL,
        Columns INT NULL,
        TransferSyntaxUid NVARCHAR(128) NULL,
        StorageKey NVARCHAR(1024) NOT NULL,
        FileSizeBytes BIGINT NOT NULL,
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Instance_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Instance_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Instance_SopInstanceUid UNIQUE (SopInstanceUid)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Study_PatientDate' AND object_id = OBJECT_ID('dbo.Study'))
    CREATE INDEX IX_Study_PatientDate ON dbo.Study(PatientId, StudyDate DESC, StudyId DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Study_Accession' AND object_id = OBJECT_ID('dbo.Study'))
    CREATE INDEX IX_Study_Accession ON dbo.Study(AccessionNumber) INCLUDE (StudyInstanceUid, PatientId, StudyDate, StudyDescription);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Series_Study' AND object_id = OBJECT_ID('dbo.Series'))
    CREATE INDEX IX_Series_Study ON dbo.Series(StudyId, SeriesId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Instance_SeriesNumber' AND object_id = OBJECT_ID('dbo.Instance'))
    CREATE INDEX IX_Instance_SeriesNumber ON dbo.Instance(SeriesId, InstanceNumber, InstanceId);
-- StorageKey is intentionally not indexed: NVARCHAR(1024) exceeds the 1700-byte nonclustered key limit.
-- Instance retrieval is already addressed by the unique SOP Instance UID and SeriesId indexes.
GO
