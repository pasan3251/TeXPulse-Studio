[CmdletBinding()]
param(
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopDist = Join-Path $RepoRoot "dist\desktop"
$CmdPath = Join-Path $DesktopDist "Launch-TeXPulse-Studio.cmd"
$IconPath = Join-Path $DesktopDist "TeXPulse-Studio.ico"
$VbsPath = Join-Path $DesktopDist "Launch-TeXPulse-Silent.vbs"
$WscriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"

$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "TeXPulse Studio 2.0.lnk"
$StartMenuShortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "TeXPulse Studio 2.0.lnk"

$RegTexShell = "HKCU:\Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio"
$RegProgId = "HKCU:\Software\Classes\TeXPulseStudio.tex"
$RegOpenWithProgids = "HKCU:\Software\Classes\.tex\OpenWithProgids"
$RegDirShell = "HKCU:\Software\Classes\Directory\shell\TeXPulseStudio"
$RegDirBgShell = "HKCU:\Software\Classes\Directory\Background\shell\TeXPulseStudio"

function Set-RegistryStringValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -Path $Path -Force | Out-Null
  }
  Set-ItemProperty -LiteralPath $Path -Name $Name -Value $Value
}

function Remove-RegistryTreeIfPresent {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function New-TeXPulseIconFile {
  param([Parameter(Mandatory = $true)][string]$OutIcoPath)

  Add-Type -AssemblyName System.Drawing

  $bmp = $null
  $graphics = $null
  $bgPath = $null
  $bgBrush = $null
  $borderPen = $null
  $dotBrush = $null
  $font = $null
  $textBrush = $null
  $stringFormat = $null
  $pngStream = $null
  $fs = $null
  $writer = $null

  try {
    $size = 256
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $margin = 12.0
    $boxSize = [float]($size - ($margin * 2))
    $radius = 44.0
    $diam = $radius * 2.0

    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc($margin, $margin, $diam, $diam, 180, 90)
    $bgPath.AddArc($margin + $boxSize - $diam, $margin, $diam, $diam, 270, 90)
    $bgPath.AddArc($margin + $boxSize - $diam, $margin + $boxSize - $diam, $diam, $diam, 0, 90)
    $bgPath.AddArc($margin, $margin + $boxSize - $diam, $diam, $diam, 90, 90)
    $bgPath.CloseFigure()

    # #18181B dark card background + #0A84FF Apple accent border
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 24, 27))
    $graphics.FillPath($bgBrush, $bgPath)

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 10, 132, 255), 8.0)
    $graphics.DrawPath($borderPen, $bgPath)

    # #34C759 pulse status dot in upper right corner
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 199, 89))
    $graphics.FillEllipse($dotBrush, 186.0, 40.0, 30.0, 30.0)

    # Bold white TeX monogram
    $font = New-Object System.Drawing.Font("Segoe UI", 86, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 245, 247))
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textRect = New-Object System.Drawing.RectangleF(12.0, 26.0, 232.0, 214.0)
    $graphics.DrawString("TeX", $font, $textBrush, $textRect, $stringFormat)

    $pngStream = New-Object System.IO.MemoryStream
    $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()

    $fs = [System.IO.File]::Open($OutIcoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    $writer = New-Object System.IO.BinaryWriter($fs)

    # ICONDIR (6 bytes)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)

    # ICONDIRENTRY (16 bytes; width=0 & height=0 encode 256px)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)

    $writer.Write($pngBytes)
  }
  finally {
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $fs) { $fs.Dispose() }
    if ($null -ne $pngStream) { $pngStream.Dispose() }
    if ($null -ne $stringFormat) { $stringFormat.Dispose() }
    if ($null -ne $textBrush) { $textBrush.Dispose() }
    if ($null -ne $font) { $font.Dispose() }
    if ($null -ne $dotBrush) { $dotBrush.Dispose() }
    if ($null -ne $borderPen) { $borderPen.Dispose() }
    if ($null -ne $bgBrush) { $bgBrush.Dispose() }
    if ($null -ne $bgPath) { $bgPath.Dispose() }
    if ($null -ne $graphics) { $graphics.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
  }
}

if ($Uninstall) {
  foreach ($shortcut in @($DesktopShortcut, $StartMenuShortcut)) {
    if (Test-Path -LiteralPath $shortcut) {
      Remove-Item -LiteralPath $shortcut -Force
    }
  }
  foreach ($artifact in @($IconPath, $VbsPath)) {
    if (Test-Path -LiteralPath $artifact) {
      Remove-Item -LiteralPath $artifact -Force
    }
  }
  foreach ($regKey in @($RegTexShell, $RegProgId, $RegDirShell, $RegDirBgShell)) {
    Remove-RegistryTreeIfPresent -Path $regKey
  }
  if (Test-Path -LiteralPath $RegOpenWithProgids) {
    Remove-ItemProperty -LiteralPath $RegOpenWithProgids -Name "TeXPulseStudio.tex" -ErrorAction SilentlyContinue
  }

  Write-Output '{"ok":true,"action":"uninstall-windows-integration"}'
  exit 0
}

if (-not (Test-Path -LiteralPath $CmdPath)) {
  throw "Missing packaged launcher at $CmdPath. Run 'pnpm build' and 'pnpm desktop:package' first."
}

New-Item -ItemType Directory -Path $DesktopDist -Force | Out-Null

# 1. Programmatic 256x256 PNG-compressed .ico
New-TeXPulseIconFile -OutIcoPath $IconPath

# 2. Windowless VBScript launcher wrapper
$vbsContent = @"
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = fso.BuildPath(scriptDir, "Launch-TeXPulse-Studio.cmd")
If WScript.Arguments.Count > 0 Then
  targetArg = WScript.Arguments(0)
  If Right(targetArg, 1) = "\" Then targetArg = targetArg & "."
  shell.Run """" & cmdPath & """ """ & targetArg & """", 0, False
Else
  shell.Run """" & cmdPath & """", 0, False
End If
"@
[System.IO.File]::WriteAllText($VbsPath, $vbsContent, [System.Text.Encoding]::ASCII)

# 3. Desktop & Start Menu shortcuts
$WshShell = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @($DesktopShortcut, $StartMenuShortcut)) {
  $shortcutDir = Split-Path -Parent $shortcutPath
  if (-not (Test-Path -LiteralPath $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
  }
  $shortcut = $WshShell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $WscriptExe
  $shortcut.Arguments = """$VbsPath"""
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.IconLocation = "$IconPath,0"
  $shortcut.Description = "TeXPulse Studio 2.0 Local LaTeX IDE"
  $shortcut.Save()
}

# 4. Per-User HKCU Explorer context menus & .tex file associations
$CmdWithFileArg = """$WscriptExe"" ""$VbsPath"" ""%1"""
$CmdWithBgArg = """$WscriptExe"" ""$VbsPath"" ""%V"""

Set-RegistryStringValue -Path $RegTexShell -Name "(Default)" -Value "Open with TeXPulse Studio 2.0"
Set-RegistryStringValue -Path $RegTexShell -Name "Icon" -Value "$IconPath,0"
Set-RegistryStringValue -Path "$RegTexShell\command" -Name "(Default)" -Value $CmdWithFileArg

Set-RegistryStringValue -Path $RegProgId -Name "(Default)" -Value "LaTeX Source Document"
Set-RegistryStringValue -Path "$RegProgId\DefaultIcon" -Name "(Default)" -Value "$IconPath,0"
Set-RegistryStringValue -Path "$RegProgId\shell\open\command" -Name "(Default)" -Value $CmdWithFileArg
Set-RegistryStringValue -Path $RegOpenWithProgids -Name "TeXPulseStudio.tex" -Value ""

Set-RegistryStringValue -Path $RegDirShell -Name "(Default)" -Value "Open Folder as TeXPulse Project"
Set-RegistryStringValue -Path $RegDirShell -Name "Icon" -Value "$IconPath,0"
Set-RegistryStringValue -Path "$RegDirShell\command" -Name "(Default)" -Value $CmdWithFileArg

Set-RegistryStringValue -Path $RegDirBgShell -Name "(Default)" -Value "Open Folder as TeXPulse Project"
Set-RegistryStringValue -Path $RegDirBgShell -Name "Icon" -Value "$IconPath,0"
Set-RegistryStringValue -Path "$RegDirBgShell\command" -Name "(Default)" -Value $CmdWithBgArg

@{
  ok = $true
  action = "install-windows-integration"
  icon = $IconPath
  silentWrapper = $VbsPath
  desktopShortcut = $DesktopShortcut
  startMenuShortcut = $StartMenuShortcut
  registry = @{
    texShell = $RegTexShell
    progId = $RegProgId
    openWithProgids = $RegOpenWithProgids
    directoryShell = $RegDirShell
    directoryBackgroundShell = $RegDirBgShell
  }
} | ConvertTo-Json -Depth 4
