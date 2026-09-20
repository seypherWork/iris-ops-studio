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
    param([Parameter(Mandatory = $true)][string]$Url)

    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -ne 200) {
        throw "$Url returned HTTP $($response.StatusCode)"
    }
    "PASS HTTP $($response.StatusCode) $Url" | Tee-Object -FilePath $ReportPath -Append
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

    $ready = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            Test-HttpResource -Url $PortalUrl
            $ready = $true
            break
        }
        catch {
            "Waiting for IRIS web gateway ($attempt/60): $($_.Exception.Message)" |
                Tee-Object -FilePath $ReportPath -Append
            Start-Sleep -Seconds 5
        }
    }

    if (-not $ready) {
        throw "IRIS Ops Studio did not become reachable within five minutes"
    }

    Test-HttpResource -Url "${PortalBaseUrl}assets/styles.css"
    Test-HttpResource -Url "${PortalBaseUrl}assets/api.js"
    Test-HttpResource -Url "${PortalBaseUrl}assets/app.js"

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
