[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReportDirectory = Join-Path $ProjectRoot "artifacts"
$ReportPath = Join-Path $ReportDirectory "windows-validation.txt"
$PortalBaseUrl = "http://127.0.0.1:52773/csp/ops/"
$PortalUrl = "${PortalBaseUrl}index.html"

New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
# Tee-Object writes UTF-16LE in Windows PowerShell 5.1. Initialize the report
# with the same encoding so the artifact remains a single readable text stream.
"IRIS Ops Studio Windows validation - $(Get-Date -Format o)" |
    Out-File -FilePath $ReportPath -Encoding Unicode

function Invoke-RecordedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    "`n> $Executable $($Arguments -join ' ')" | Tee-Object -FilePath $ReportPath -Append
    # Windows PowerShell 5.1 wraps native stderr as ErrorRecord objects. With
    # ErrorActionPreference=Stop, normal progress written to stderr (for
    # example, Docker Compose build status) aborts before the exit code can be
    # checked. Record both streams, then decide from the native exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = 0
    try {
        $ErrorActionPreference = "Continue"
        & $Executable @Arguments 2>&1 |
            ForEach-Object { $_.ToString() } |
            Tee-Object -FilePath $ReportPath -Append
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "$Executable exited with code $exitCode"
    }
}

function Test-HttpResource {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [string]$SourcePath
    )

    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -ne 200) {
        throw "$Url returned HTTP $($response.StatusCode)"
    }
    if ($SourcePath) {
        $expected = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
        $hash = [System.Security.Cryptography.SHA256]::Create()
        try {
            $actual = [System.BitConverter]::ToString(
                $hash.ComputeHash($response.RawContentStream.ToArray())
            ).Replace("-", "")
        }
        finally {
            $hash.Dispose()
        }
        if ($actual -ne $expected) {
            throw "Deployed bytes do not match source: $Url"
        }
        "PASS SHA-256 $expected $Url" | Tee-Object -FilePath $ReportPath -Append
    }
    "PASS HTTP $($response.StatusCode) $Url" | Tee-Object -FilePath $ReportPath -Append
}

function Get-ContainerState {
    param([Parameter(Mandatory = $true)][string]$ContainerId)

    $state = & docker inspect `
        --format "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" `
        $ContainerId 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect IRIS container: $($state -join ' ')"
    }
    return ($state | Select-Object -Last 1).ToString().Trim()
}

function Assert-ContainerHealthy {
    param([Parameter(Mandatory = $true)][string]$ContainerId)

    $state = Get-ContainerState -ContainerId $ContainerId
    if ($state -ne "running|healthy") {
        throw "IRIS container is not stably healthy: $state"
    }
    "PASS container state $state" | Tee-Object -FilePath $ReportPath -Append
}

Push-Location $ProjectRoot
try {
    Invoke-RecordedCommand -Executable "docker" -Arguments @("version")
    Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "version")
    Invoke-RecordedCommand -Executable "node" -Arguments @("--version")
    Invoke-RecordedCommand -Executable "npm" -Arguments @("run", "check")

    Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "build", "--pull")
    Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "up", "-d")
    Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "ps")

    $containerId = (& docker compose ps -q iris 2>&1 | Select-Object -Last 1).ToString().Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
        throw "Docker Compose did not return the IRIS container identifier"
    }

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $state = Get-ContainerState -ContainerId $containerId
            if ($state -eq "running|healthy") {
                Test-HttpResource -Url $PortalUrl
                $ready = $true
                break
            }
            "Waiting for healthy IRIS container ($attempt/60): $state" |
                Tee-Object -FilePath $ReportPath -Append
        }
        catch {
            "Waiting for IRIS readiness ($attempt/60): $($_.Exception.Message)" |
                Tee-Object -FilePath $ReportPath -Append
        }
        Start-Sleep -Seconds 5
    }

    if (-not $ready) {
        throw "IRIS Ops Studio did not become reachable within five minutes"
    }

    $webRoot = Join-Path $ProjectRoot "web"
    Get-ChildItem -LiteralPath $webRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($webRoot.Length + 1).Replace("\", "/")
        Test-HttpResource -Url "${PortalBaseUrl}${relative}" -SourcePath $_.FullName
    }

    # Reject a transient HTTP success from a container that exits immediately
    # after its post-start work.
    Start-Sleep -Seconds 5
    Assert-ContainerHealthy -ContainerId $containerId

    "`nVALIDATION RESULT: PASS" | Tee-Object -FilePath $ReportPath -Append
    Write-Host "`nValidation passed. Open $PortalUrl"
    Write-Host "Report: $ReportPath"
}
catch {
    "`nVALIDATION RESULT: FAIL`n$($_.Exception.Message)" |
        Tee-Object -FilePath $ReportPath -Append
    try {
        Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "ps")
        Invoke-RecordedCommand -Executable "docker" -Arguments @("compose", "logs", "--no-color", "--tail", "250")
    }
    catch {
        "Unable to collect Docker diagnostics: $($_.Exception.Message)" |
            Tee-Object -FilePath $ReportPath -Append
    }
    Write-Error "Validation failed. Send this file for review: $ReportPath"
    exit 1
}
finally {
    Pop-Location
}
