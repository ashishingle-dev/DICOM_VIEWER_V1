$ErrorActionPreference = "Stop"

Write-Host "Restoring packages..." -ForegroundColor Cyan
dotnet restore

Write-Host "Starting DICOM Viewer API..." -ForegroundColor Cyan
dotnet run --project .\src\DicomViewer.Api\DicomViewer.Api.csproj
