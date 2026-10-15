USE DicomViewer;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Instance_StorageKey' AND object_id = OBJECT_ID(N'dbo.Instance'))
BEGIN
    DROP INDEX IX_Instance_StorageKey ON dbo.Instance;
END
GO
