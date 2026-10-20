<#
.SYNOPSIS
    Launches Google Chrome with Chrome DevTools Protocol (CDP) enabled on port 9222.
.DESCRIPTION
    Starts Chrome with a dedicated, isolated debug profile so it runs concurrently
    alongside your existing browsing sessions without conflicts.
.PARAMETER Port
    The remote debugging port (default: 9222).
.PARAMETER Url
    The initial URL to open (default: https://gemini.google.com/app).
#>
param(
    [int]$Port = 9222,
    [string]$Url = "https://gemini.google.com/app",
    [string]$ProfileDir = ""
)

if (-not $ProfileDir) {
    $ProfileDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data Debug"
}

if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

# Check if port is already active
$active = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($active) {
    Write-Host "[CDP Launcher] Chrome is already running and listening on port $Port."
    exit 0
}

# Find Chrome binary across standard Windows paths
$candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromePath) {
    Write-Error "[CDP Launcher] Google Chrome executable not found in standard paths!"
    exit 1
}

$cmd = "`"$chromePath`" --remote-debugging-port=$Port --user-data-dir=`"$ProfileDir`" `"$Url`""
Write-Host "[CDP Launcher] Launching Chrome on port $Port..."

# Spawn independently from terminal job object
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = $cmd} | Out-Null

Start-Sleep -Seconds 3

try {
    $ver = Invoke-RestMethod -Uri "http://localhost:$Port/json/version" -TimeoutSec 5
    Write-Host "[CDP Launcher] Connected successfully! Browser: $($ver.Browser)"
} catch {
    Write-Warning "[CDP Launcher] Chrome started. Waiting for DevTools endpoint on port $Port to initialize..."
}
