[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$archive = [System.IO.Path]::GetFullPath($OutputPath)
$manifest = "$archive.manifest.json"
$parent = Split-Path -Parent $archive
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    throw "Output directory does not exist: $parent"
}
if ((Test-Path -LiteralPath $archive) -or (Test-Path -LiteralPath $manifest)) {
    throw "Candidate or manifest already exists; refusing to overwrite: $archive"
}
if ($archive.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar,
        [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Put release artifacts outside the source tree so they cannot enter the package"
}

$names = @(& git -C $root -c core.quotepath=false ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0 -or $names.Count -eq 0) {
    throw "Cannot enumerate source files from Git"
}
$names = @($names | Sort-Object -Unique)
$records = New-Object System.Collections.Generic.List[object]
$sources = New-Object System.Collections.Generic.List[object]
foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace($name) -or $name.Contains('"') -or
        $name.Contains([char]10) -or $name.Contains([char]13)) {
        throw "Unsupported source path from Git: $name"
    }
    $source = [System.IO.Path]::GetFullPath((Join-Path $root $name))
    if (-not $source.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Source path escaped the project: $name"
    }
    $item = Get-Item -LiteralPath $source -ErrorAction Stop
    if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "Refusing nonregular or linked source: $name"
    }
    $sources.Add(@{ Name = $name.Replace('\', '/'); Path = $source })
    $records.Add(@{
        path = $name.Replace('\', '/')
        bytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    })
}

Add-Type -AssemblyName System.IO.Compression
$stream = New-Object System.IO.FileStream(
    $archive, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None)
try {
    $zip = New-Object System.IO.Compression.ZipArchive(
        $stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($item in $sources) {
            $entry = $zip.CreateEntry($item.Name,
                [System.IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = [System.DateTimeOffset]::new(
                2026, 9, 25, 0, 0, 0, [System.TimeSpan]::Zero)
            $input = [System.IO.File]::OpenRead($item.Path)
            try {
                $output = $entry.Open()
                try { $input.CopyTo($output) }
                finally { $output.Dispose() }
            }
            finally { $input.Dispose() }
        }
    }
    finally { $zip.Dispose() }
}
finally { $stream.Dispose() }

$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
@{
    version = "1.2.1"
    sourceRoot = $root
    archive = $archive
    archiveSha256 = $archiveHash
    fileCount = $records.Count
    files = $records.ToArray()
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifest -Encoding UTF8

Write-Output "CANDIDATE $archive"
Write-Output "SHA-256 $archiveHash"
Write-Output "FILES $($records.Count)"
Write-Output "MANIFEST $manifest"
