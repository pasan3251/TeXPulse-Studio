$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageOutput = Join-Path $repositoryRoot "output\package"
$evidenceOutput = Join-Path $repositoryRoot "output\playwright"
$testRoot = Join-Path $env:TEMP ("TeXPulse Sprint 12 " + [guid]::NewGuid().ToString("N"))
$installDirectory = Join-Path $testRoot "Installed App With Spaces"
$userDataDirectory = Join-Path $testRoot "Clean User Profile"
$upgradeUserDataDirectory = Join-Path $testRoot "Previous Beta Profile"
$installedExecutable = Join-Path $installDirectory "TeXPulse Studio.exe"
$uninstaller = Join-Path $installDirectory "Uninstall TeXPulse Studio.exe"
$completed = $false

function Invoke-CheckedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter()]
    [string[]]$Arguments = @()
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  $startInfo.Arguments = (
    $Arguments |
      ForEach-Object {
        if ($_ -match '[\s"]') {
          '"' + $_.Replace('"', '\"') + '"'
        }
        else {
          $_
        }
      }
  ) -join " "
  $process = [System.Diagnostics.Process]::Start($startInfo)
  if ($null -eq $process) {
    throw "Failed to start $FilePath."
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "$FilePath exited with code $($process.ExitCode)."
  }
}

function Test-FilePresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    return Test-Path -LiteralPath $Path -PathType Leaf
  }
  catch [System.UnauthorizedAccessException] {
    return $true
  }
}

Push-Location $repositoryRoot
try {
  & pnpm package:win
  if ($LASTEXITCODE -ne 0) {
    throw "Windows installer packaging failed with code $LASTEXITCODE."
  }

  $installer = Get-ChildItem -Path $packageOutput -Filter "TeXPulse Studio-Setup-*.exe" |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($null -eq $installer) {
    throw "The packaged installer was not found."
  }

  New-Item -ItemType Directory -Path $testRoot, $userDataDirectory, $upgradeUserDataDirectory -Force | Out-Null
  $previousBetaSettings = @{
    schemaVersion = 1
    theme = "system"
    autosave = $false
    autoBuild = $false
    debounceMs = 1200
    compileTimeoutMs = 120000
    customBinDirectory = $null
    editorFontSize = 18
    pdfZoomMode = "fit-page"
    setupCompleted = $true
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText(
    (Join-Path $upgradeUserDataDirectory "settings.json"),
    $previousBetaSettings,
    [System.Text.UTF8Encoding]::new($false)
  )
  Invoke-CheckedProcess -FilePath $installer.FullName -Arguments @(
    "/S",
    "/D=$installDirectory"
  )
  if (-not (Test-Path -LiteralPath $installedExecutable -PathType Leaf)) {
    throw "The installed executable was not found at $installedExecutable."
  }

  $env:TEXPULSE_PACKAGED_EXECUTABLE = $installedExecutable
  $env:TEXPULSE_PACKAGED_USER_DATA = $userDataDirectory
  $env:TEXPULSE_PACKAGED_UPGRADE_USER_DATA = $upgradeUserDataDirectory
  $env:TEXPULSE_PACKAGED_OUTPUT = $evidenceOutput
  & pnpm exec playwright test --config playwright.packaged.config.ts
  if ($LASTEXITCODE -ne 0) {
    throw "Packaged Playwright verification failed with code $LASTEXITCODE."
  }

  $settingsPath = Join-Path $userDataDirectory "settings.json"
  $samplePath = Join-Path $userDataDirectory "sample-project\main.tex"
  if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) {
    throw "The clean-profile settings file was not persisted."
  }
  if (-not (Test-Path -LiteralPath $samplePath -PathType Leaf)) {
    throw "The editable sample project was not persisted."
  }
  $completed = $true
}
finally {
  Remove-Item Env:TEXPULSE_PACKAGED_EXECUTABLE -ErrorAction SilentlyContinue
  Remove-Item Env:TEXPULSE_PACKAGED_USER_DATA -ErrorAction SilentlyContinue
  Remove-Item Env:TEXPULSE_PACKAGED_UPGRADE_USER_DATA -ErrorAction SilentlyContinue
  Remove-Item Env:TEXPULSE_PACKAGED_OUTPUT -ErrorAction SilentlyContinue

  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    Invoke-CheckedProcess -FilePath $uninstaller -Arguments @("/S")
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (
      (Test-FilePresent -Path $installedExecutable) -and
      [DateTime]::UtcNow -lt $deadline
    ) {
      Start-Sleep -Milliseconds 250
    }
    if (Test-FilePresent -Path $installedExecutable) {
      throw "The uninstaller did not remove the installed executable."
    }
    if (-not (Test-Path -LiteralPath $userDataDirectory -PathType Container)) {
      throw "The uninstaller unexpectedly removed preserved application data."
    }
  }

  if ($completed) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  else {
    Write-Warning "Packaged-test data was retained at $testRoot."
  }
  Pop-Location
}
