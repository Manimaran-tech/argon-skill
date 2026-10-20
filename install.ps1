# Argon Skill Installer for Windows
# Copies this skill into ~/.gemini/config/skills/argon

$ErrorActionPreference = "Stop"

$targetDir = Join-Path $env:USERPROFILE ".gemini\config\skills\argon"

Write-Host "Installing Argon Skill into: $targetDir" -ForegroundColor Cyan

if (Test-Path $targetDir) {
    Write-Host "Updating existing installation..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $targetDir
}

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

Copy-Item -Path "$PSScriptRoot\SKILL.md" -Destination $targetDir -Force
Copy-Item -Path "$PSScriptRoot\scripts" -Destination $targetDir -Recurse -Force

Write-Host "`n Argon Skill installed successfully!" -ForegroundColor Green
Write-Host "You can now use 'argon' in any Antigravity conversation or workspace." -ForegroundColor White
