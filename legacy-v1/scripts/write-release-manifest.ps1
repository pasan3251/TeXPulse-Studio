param(
  [Parameter()]
  [string]$ArtifactPath = "",
  [Parameter()]
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($PSVersionTable.PSEdition -eq "Desktop") {
  $env:PSModulePath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\Modules"
  Import-Module Microsoft.PowerShell.Utility
  Import-Module Microsoft.PowerShell.Security
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $repositoryRoot "output\release-candidate"
$package = Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw |
  ConvertFrom-Json

Push-Location $repositoryRoot
try {
  $dirty = & git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect Git status."
  }
  if ($dirty) {
    throw "Release manifest generation requires a clean Git worktree."
  }

  $commit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the release commit."
  }
  if ([string]::IsNullOrWhiteSpace($Tag)) {
    $Tag = "v$($package.version)"
  }
  & git rev-parse --verify "refs/tags/$Tag" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Release tag $Tag does not exist."
  }
  $tagCommit = (& git rev-list -n 1 $Tag).Trim()
  if ($tagCommit -ne $commit) {
    throw "Release tag $Tag does not point to HEAD."
  }

  if ([string]::IsNullOrWhiteSpace($ArtifactPath)) {
    $ArtifactPath = Join-Path $repositoryRoot (
      "output\package\TeXPulse Studio-Setup-$($package.version)-x64.exe"
    )
  }
  $artifact = Get-Item -LiteralPath $ArtifactPath
  $artifactHash = Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256
  $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $sourceArchive = Join-Path $outputDirectory "$Tag-source.zip"
  & git archive --format=zip --output=$sourceArchive $Tag
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to create the tagged source archive."
  }
  $sourceHash = Get-FileHash -LiteralPath $sourceArchive -Algorithm SHA256
  $asarPath = Join-Path $repositoryRoot "output\package\win-unpacked\resources\app.asar"
  $asar = if (Test-Path -LiteralPath $asarPath -PathType Leaf) {
    $asarHash = Get-FileHash -LiteralPath $asarPath -Algorithm SHA256
    @{
      bytes = (Get-Item -LiteralPath $asarPath).Length
      path = "output/package/win-unpacked/resources/app.asar"
      sha256 = $asarHash.Hash
    }
  }
  else {
    $null
  }
  $latexmkVersion = (
    & latexmk --version 2>&1 |
      ForEach-Object { $_.ToString().Trim() } |
      Where-Object { $_ -match "^Latexmk,.+Version\s+\S+$" } |
      Select-Object -First 1
  )
  if ([string]::IsNullOrWhiteSpace($latexmkVersion)) {
    throw "Unable to parse the latexmk version."
  }

  $manifest = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTime]::UtcNow.ToString("o")
    product = $package.name
    version = $package.version
    tag = $Tag
    commit = $commit
    environment = [ordered]@{
      node = (& node --version).Trim()
      pnpm = (& pnpm --version).Trim()
      latexmk = $latexmkVersion
      os = [System.Environment]::OSVersion.VersionString
      architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    }
    installer = [ordered]@{
      name = $artifact.Name
      bytes = $artifact.Length
      sha256 = $artifactHash.Hash
      authenticode = $signature.Status.ToString()
    }
    applicationArchive = $asar
    sourceArchive = [ordered]@{
      name = (Split-Path -Leaf $sourceArchive)
      bytes = (Get-Item -LiteralPath $sourceArchive).Length
      sha256 = $sourceHash.Hash
    }
  }
  $manifestPath = Join-Path $outputDirectory "release-manifest.json"
  $manifest | ConvertTo-Json -Depth 6 |
    Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Output $manifestPath
}
finally {
  Pop-Location
}
