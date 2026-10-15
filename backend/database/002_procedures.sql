USE DicomViewer;
GO

CREATE OR ALTER PROCEDURE dbo.usp_SearchStudies
    @PatientId NVARCHAR(64) = NULL,
    @PatientName NVARCHAR(256) = NULL,
    @StudyDateFrom DATE = NULL,
    @StudyDateTo DATE = NULL,
    @Modality NVARCHAR(32) = NULL,
    @Page INT = 1,
    @PageSize INT = 50
AS
BEGIN
    SET NOCOUNT ON;
    SET @Page = CASE WHEN @Page < 1 THEN 1 ELSE @Page END;
    SET @PageSize = CASE WHEN @PageSize < 1 THEN 50 WHEN @PageSize > 200 THEN 200 ELSE @PageSize END;

    WITH StudyQuery AS
    (
        SELECT
            s.StudyId,
            s.PatientId,
            s.StudyInstanceUid,
            p.PatientIdentifier AS PatientIdValue,
            p.PatientName,
            s.StudyDate,
            s.StudyTime,
            s.AccessionNumber,
            s.StudyDescription,
            s.InstitutionName,
            COUNT(DISTINCT se.SeriesId) AS SeriesCount,
            COUNT(i.InstanceId) AS InstanceCount,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.Study s
        INNER JOIN dbo.Patient p ON p.PatientId = s.PatientId
        LEFT JOIN dbo.Series se ON se.StudyId = s.StudyId
        LEFT JOIN dbo.Instance i ON i.SeriesId = se.SeriesId
        WHERE (@PatientId IS NULL OR p.PatientIdentifier LIKE '%' + @PatientId + '%')
          AND (@PatientName IS NULL OR p.PatientName LIKE '%' + @PatientName + '%')
          AND (@StudyDateFrom IS NULL OR s.StudyDate >= @StudyDateFrom)
          AND (@StudyDateTo IS NULL OR s.StudyDate <= @StudyDateTo)
          AND (@Modality IS NULL OR EXISTS (SELECT 1 FROM dbo.Series sm WHERE sm.StudyId = s.StudyId AND sm.Modality = @Modality))
        GROUP BY s.StudyId, s.PatientId, s.StudyInstanceUid, p.PatientIdentifier, p.PatientName,
                 s.StudyDate, s.StudyTime, s.AccessionNumber, s.StudyDescription, s.InstitutionName
    )
    SELECT * FROM StudyQuery
    ORDER BY StudyDate DESC, StudyId DESC
    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetStudy @StudyInstanceUid NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1)
        s.StudyId, s.PatientId, s.StudyInstanceUid, p.PatientIdentifier AS PatientIdValue, p.PatientName,
        s.StudyDate, s.StudyTime, s.AccessionNumber, s.StudyDescription, s.InstitutionName,
        COUNT(DISTINCT se.SeriesId) AS SeriesCount,
        COUNT(i.InstanceId) AS InstanceCount,
        CAST(0 AS BIGINT) AS TotalCount
    FROM dbo.Study s
    INNER JOIN dbo.Patient p ON p.PatientId = s.PatientId
    LEFT JOIN dbo.Series se ON se.StudyId = s.StudyId
    LEFT JOIN dbo.Instance i ON i.SeriesId = se.SeriesId
    WHERE s.StudyInstanceUid = @StudyInstanceUid
    GROUP BY s.StudyId, s.PatientId, s.StudyInstanceUid, p.PatientIdentifier, p.PatientName,
             s.StudyDate, s.StudyTime, s.AccessionNumber, s.StudyDescription, s.InstitutionName;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetSeriesByStudy @StudyInstanceUid NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT se.SeriesId, se.StudyId, se.SeriesInstanceUid, se.Modality, se.SeriesNumber, se.SeriesDescription,
           se.BodyPartExamined, COUNT(i.InstanceId) AS InstanceCount
    FROM dbo.Series se
    INNER JOIN dbo.Study s ON s.StudyId = se.StudyId
    LEFT JOIN dbo.Instance i ON i.SeriesId = se.SeriesId
    WHERE s.StudyInstanceUid = @StudyInstanceUid
    GROUP BY se.SeriesId, se.StudyId, se.SeriesInstanceUid, se.Modality, se.SeriesNumber, se.SeriesDescription, se.BodyPartExamined
    ORDER BY TRY_CONVERT(INT, se.SeriesNumber), se.SeriesId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetInstancesBySeries
    @StudyInstanceUid NVARCHAR(128),
    @SeriesInstanceUid NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT i.InstanceId, i.SeriesId, i.SopInstanceUid, i.SopClassUid, i.InstanceNumber, i.Rows, i.Columns,
           i.TransferSyntaxUid, i.StorageKey, i.FileSizeBytes
    FROM dbo.Instance i
    INNER JOIN dbo.Series se ON se.SeriesId = i.SeriesId
    INNER JOIN dbo.Study s ON s.StudyId = se.StudyId
    WHERE s.StudyInstanceUid = @StudyInstanceUid
      AND se.SeriesInstanceUid = @SeriesInstanceUid
    ORDER BY i.InstanceNumber, i.InstanceId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetInstance
    @StudyInstanceUid NVARCHAR(128),
    @SeriesInstanceUid NVARCHAR(128),
    @SopInstanceUid NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (1) i.InstanceId, i.SeriesId, i.SopInstanceUid, i.SopClassUid, i.InstanceNumber, i.Rows, i.Columns,
           i.TransferSyntaxUid, i.StorageKey, i.FileSizeBytes
    FROM dbo.Instance i
    INNER JOIN dbo.Series se ON se.SeriesId = i.SeriesId
    INNER JOIN dbo.Study s ON s.StudyId = se.StudyId
    WHERE s.StudyInstanceUid = @StudyInstanceUid
      AND se.SeriesInstanceUid = @SeriesInstanceUid
      AND i.SopInstanceUid = @SopInstanceUid;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_UpsertDicomInstance
    @StorageKey NVARCHAR(1024),
    @FileSizeBytes BIGINT,
    @StudyInstanceUid NVARCHAR(128),
    @PatientId NVARCHAR(64) = NULL,
    @PatientName NVARCHAR(256),
    @StudyDate DATE = NULL,
    @StudyTime TIME(0) = NULL,
    @AccessionNumber NVARCHAR(64) = NULL,
    @StudyDescription NVARCHAR(512) = NULL,
    @InstitutionName NVARCHAR(256) = NULL,
    @SeriesInstanceUid NVARCHAR(128),
    @Modality NVARCHAR(32) = NULL,
    @SeriesNumber NVARCHAR(32) = NULL,
    @SeriesDescription NVARCHAR(512) = NULL,
    @BodyPartExamined NVARCHAR(128) = NULL,
    @SopInstanceUid NVARCHAR(128),
    @SopClassUid NVARCHAR(128) = NULL,
    @InstanceNumber INT = NULL,
    @Rows INT = NULL,
    @Columns INT = NULL,
    @TransferSyntaxUid NVARCHAR(128) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    DECLARE @PatientPk BIGINT, @StudyPk BIGINT, @SeriesPk BIGINT;

    SELECT @PatientPk = PatientId FROM dbo.Patient WHERE ISNULL(PatientIdentifier, '') = ISNULL(@PatientId, '') AND PatientName = @PatientName;
    IF @PatientPk IS NULL
    BEGIN
        INSERT dbo.Patient(PatientIdentifier, PatientName) VALUES (@PatientId, @PatientName);
        SET @PatientPk = SCOPE_IDENTITY();
    END
    ELSE
        UPDATE dbo.Patient SET PatientIdentifier = @PatientId WHERE PatientId = @PatientPk;

    SELECT @StudyPk = StudyId FROM dbo.Study WHERE StudyInstanceUid = @StudyInstanceUid;
    IF @StudyPk IS NULL
    BEGIN
        INSERT dbo.Study(PatientId, StudyInstanceUid, StudyDate, StudyTime, AccessionNumber, StudyDescription, InstitutionName)
        VALUES (@PatientPk, @StudyInstanceUid, @StudyDate, @StudyTime, @AccessionNumber, @StudyDescription, @InstitutionName);
        SET @StudyPk = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Study SET PatientId = @PatientPk, StudyDate = @StudyDate, StudyTime = @StudyTime,
            AccessionNumber = @AccessionNumber, StudyDescription = @StudyDescription, InstitutionName = @InstitutionName,
            UpdatedAt = SYSUTCDATETIME()
        WHERE StudyId = @StudyPk;
    END

    SELECT @SeriesPk = SeriesId FROM dbo.Series WHERE SeriesInstanceUid = @SeriesInstanceUid;
    IF @SeriesPk IS NULL
    BEGIN
        INSERT dbo.Series(StudyId, SeriesInstanceUid, Modality, SeriesNumber, SeriesDescription, BodyPartExamined)
        VALUES (@StudyPk, @SeriesInstanceUid, @Modality, @SeriesNumber, @SeriesDescription, @BodyPartExamined);
        SET @SeriesPk = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.Series SET StudyId = @StudyPk, Modality = @Modality, SeriesNumber = @SeriesNumber,
            SeriesDescription = @SeriesDescription, BodyPartExamined = @BodyPartExamined
        WHERE SeriesId = @SeriesPk;
    END

    IF EXISTS (SELECT 1 FROM dbo.Instance WHERE SopInstanceUid = @SopInstanceUid)
    BEGIN
        UPDATE dbo.Instance SET SeriesId = @SeriesPk, SopClassUid = @SopClassUid, InstanceNumber = @InstanceNumber,
            Rows = @Rows, Columns = @Columns, TransferSyntaxUid = @TransferSyntaxUid,
            StorageKey = @StorageKey, FileSizeBytes = @FileSizeBytes, UpdatedAt = SYSUTCDATETIME()
        WHERE SopInstanceUid = @SopInstanceUid;
    END
    ELSE
    BEGIN
        INSERT dbo.Instance(SeriesId, SopInstanceUid, SopClassUid, InstanceNumber, Rows, Columns, TransferSyntaxUid, StorageKey, FileSizeBytes)
        VALUES (@SeriesPk, @SopInstanceUid, @SopClassUid, @InstanceNumber, @Rows, @Columns, @TransferSyntaxUid, @StorageKey, @FileSizeBytes);
    END

    COMMIT;
END
GO
