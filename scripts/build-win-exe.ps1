[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DistDir = Join-Path $RepoRoot "dist"
$DesktopDist = Join-Path $DistDir "desktop"
$UnpackedDir = Join-Path $DistDir "win-unpacked"
$ResourcesDir = Join-Path $UnpackedDir "resources"
$ClientBundleDir = Join-Path $ResourcesDir "client"
$RuntimeDir = Join-Path $UnpackedDir "runtime"

$CscExe = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $CscExe)) {
  throw "Built-in .NET C# compiler not found at $CscExe."
}

$ClientBuildDir = Join-Path $RepoRoot "packages\client\dist"
$ServerLauncherJs = Join-Path $RepoRoot "packages\server\dist\desktop-launcher.js"
if (-not (Test-Path -LiteralPath (Join-Path $ClientBuildDir "index.html")) -or -not (Test-Path -LiteralPath $ServerLauncherJs)) {
  throw "Built packages missing. Run 'pnpm build' before 'pnpm desktop:exe'."
}

$EsbuildObj = Get-ChildItem -Path (Join-Path $RepoRoot "node_modules") -Recurse -Filter "esbuild.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $EsbuildObj) {
  throw "Could not locate esbuild.exe under node_modules."
}
$EsbuildExe = $EsbuildObj.FullName
$NodeExe = (Get-Command node).Source

# Ensure desktop packaging + custom 256x256 .ico exist
node (Join-Path $RepoRoot "packages\server\dist\desktop-package.js") | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$IcoSrc = Join-Path $DesktopDist "TeXPulse-Studio.ico"
if (-not (Test-Path -LiteralPath $IcoSrc)) {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "install-windows-integration.ps1") | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 1. Assemble clean self-contained dist/win-unpacked/
if (Test-Path -LiteralPath $UnpackedDir) {
  Remove-Item -LiteralPath $UnpackedDir -Recurse -Force
}
New-Item -ItemType Directory -Path $ClientBundleDir -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

$ServerBundleCjs = Join-Path $ResourcesDir "server.cjs"
& $EsbuildExe $ServerLauncherJs --bundle --platform=node --target=node24 --format=cjs "--outfile=$ServerBundleCjs"
if ($LASTEXITCODE -ne 0) {
  throw "esbuild bundling of desktop-launcher.js failed with exit code $LASTEXITCODE"
}

Copy-Item -Path (Join-Path $ClientBuildDir "*") -Destination $ClientBundleDir -Recurse -Force
Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $RuntimeDir "node.exe") -Force
$UnpackedIco = Join-Path $UnpackedDir "TeXPulse-Studio.ico"
Copy-Item -LiteralPath $IcoSrc -Destination $UnpackedIco -Force

# 2. Compile native windowless TeXPulseStudio.exe via csc.exe /target:winexe
$TempSrcDir = Join-Path $DistDir "_build-tmp"
if (Test-Path -LiteralPath $TempSrcDir) {
  Remove-Item -LiteralPath $TempSrcDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempSrcDir -Force | Out-Null

$WrapperCsPath = Join-Path $TempSrcDir "TeXPulseStudio.cs"
$WrapperExePath = Join-Path $UnpackedDir "TeXPulseStudio.exe"

$wrapperSource = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class NativeJob {
    [StructLayout(LayoutKind.Sequential)]
    internal struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool SetInformationJobObject(
        IntPtr hJob,
        int JobObjectInfoClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpJobObjectInfo,
        int cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseHandle(IntPtr hObject);

    internal static IntPtr AttachKillOnCloseJob(Process proc) {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return IntPtr.Zero;

        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        if (!SetInformationJobObject(job, 9, ref info, size) ||
            !AssignProcessToJobObject(job, proc.Handle)) {
            CloseHandle(job);
            return IntPtr.Zero;
        }
        return job;
    }
}

internal static class Program {
    private static string QuoteWinArg(string arg) {
        if (string.IsNullOrEmpty(arg)) return "\"\"";
        var sb = new StringBuilder();
        sb.Append('"');
        int backslashes = 0;
        for (int i = 0; i < arg.Length; i++) {
            char c = arg[i];
            if (c == '\\') {
                backslashes++;
            } else if (c == '"') {
                sb.Append('\\', backslashes * 2 + 1);
                sb.Append('"');
                backslashes = 0;
            } else {
                if (backslashes > 0) {
                    sb.Append('\\', backslashes);
                    backslashes = 0;
                }
                sb.Append(c);
            }
        }
        if (backslashes > 0) {
            sb.Append('\\', backslashes * 2);
        }
        sb.Append('"');
        return sb.ToString();
    }

    private static string FindSystemNode() {
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in pathEnv.Split(';')) {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            string candidate = Path.Combine(dir.Trim(), "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        string progNode = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "nodejs",
            "node.exe");
        return File.Exists(progNode) ? progNode : "node.exe";
    }

    [STAThread]
    private static int Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string portableNode = Path.Combine(baseDir, "runtime", "node.exe");
        string nodeExe = File.Exists(portableNode) ? portableNode : FindSystemNode();

        string serverBundle = Path.Combine(baseDir, "resources", "server.cjs");
        string desktopLauncherJs = Path.Combine(baseDir, "packages", "server", "dist", "desktop-launcher.js");
        string entryScript = File.Exists(serverBundle) ? serverBundle : desktopLauncherJs;

        bool isSmokeTest = false;
        var nodeArgs = new List<string>();
        nodeArgs.Add(QuoteWinArg(entryScript));
        foreach (string arg in args) {
            if (string.Equals(arg, "--smoke-test", StringComparison.OrdinalIgnoreCase)) {
                isSmokeTest = true;
            }
            string normalized = arg;
            if (!normalized.StartsWith("-") && normalized.EndsWith("\\") && normalized.Length > 3) {
                normalized = normalized.TrimEnd('\\');
            }
            nodeArgs.Add(QuoteWinArg(normalized));
        }

        var psi = new ProcessStartInfo();
        psi.FileName = nodeExe;
        psi.Arguments = string.Join(" ", nodeArgs.ToArray());
        psi.WorkingDirectory = baseDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = isSmokeTest;
        psi.RedirectStandardError = isSmokeTest;

        string bundledClient = Path.Combine(baseDir, "resources", "client");
        if (Directory.Exists(bundledClient)) {
            psi.EnvironmentVariables["TEXPULSE_CLIENT_DIST"] = bundledClient;
        }

        IntPtr jobHandle = IntPtr.Zero;
        try {
            using (var proc = Process.Start(psi)) {
                if (proc == null) return 1;
                jobHandle = NativeJob.AttachKillOnCloseJob(proc);
                if (isSmokeTest) {
                    string stdoutText = proc.StandardOutput.ReadToEnd();
                    string stderrText = proc.StandardError.ReadToEnd();
                    proc.WaitForExit();
                    if (!string.IsNullOrEmpty(stdoutText)) Console.Out.Write(stdoutText);
                    if (!string.IsNullOrEmpty(stderrText)) Console.Error.Write(stderrText);
                } else {
                    proc.WaitForExit();
                }
                return proc.ExitCode;
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("TeXPulseStudio.exe failed: " + ex.Message);
            return 1;
        } finally {
            if (jobHandle != IntPtr.Zero) {
                NativeJob.CloseHandle(jobHandle);
            }
        }
    }
}
'@

[System.IO.File]::WriteAllText($WrapperCsPath, $wrapperSource, [System.Text.Encoding]::UTF8)
& $CscExe /nologo /target:winexe /optimize+ "/out:$WrapperExePath" "/win32icon:$UnpackedIco" $WrapperCsPath
if ($LASTEXITCODE -ne 0) {
  throw "csc.exe failed compiling TeXPulseStudio.exe with exit code $LASTEXITCODE"
}

# 3. Generate Windows Setup Installer (ISCC.exe if installed, otherwise native C# GUI/Silent Setup.exe)
$SetupExePath = Join-Path $DistDir "TeXPulse-Studio-2.0.0-Setup.exe"
$IsccCmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
$IsccPath = if ($IsccCmd) { $IsccCmd.Source } else {
  @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if ($IsccPath) {
  & $IsccPath (Join-Path $PSScriptRoot "installer.iss")
  if ($LASTEXITCODE -ne 0) {
    throw "ISCC.exe failed with exit code $LASTEXITCODE"
  }
} else {
  $PayloadZipPath = Join-Path $TempSrcDir "payload.zip"
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $PayloadZipPath) { Remove-Item -LiteralPath $PayloadZipPath -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $UnpackedDir,
    $PayloadZipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  $SetupCsPath = Join-Path $TempSrcDir "TeXPulseSetup.cs"
  $setupSource = @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class InstallerCore {
    internal static string GetInstallDir() {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "TeXPulseStudio");
    }

    private static void SetShortcut(string lnkPath, string targetExe, string workDir, string iconPath) {
        string dir = Path.GetDirectoryName(lnkPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember(
            "CreateShortcut",
            BindingFlags.InvokeMethod,
            null,
            shell,
            new object[] { lnkPath });
        Type scType = shortcut.GetType();
        scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetExe });
        scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workDir });
        scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconPath + ",0" });
        scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "TeXPulse Studio 2.0 Local LaTeX IDE" });
        scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
    }

    private static void SetRegistryDefault(string subkey, string val) {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(subkey)) {
            if (key != null) key.SetValue("", val);
        }
    }

    private static void SetRegistryValue(string subkey, string name, string val) {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(subkey)) {
            if (key != null) key.SetValue(name, val);
        }
    }

    internal static void Install(string installDir, bool silent) {
        Directory.CreateDirectory(installDir);

        string tempZip = Path.Combine(Path.GetTempPath(), "texpulse-setup-" + Guid.NewGuid().ToString("N") + ".zip");
        try {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream res = asm.GetManifestResourceStream("TeXPulse.Payload.zip")) {
                if (res == null) throw new InvalidOperationException("Missing embedded TeXPulse.Payload.zip resource.");
                using (var fs = File.Create(tempZip)) {
                    res.CopyTo(fs);
                }
            }
            string normalizedRoot = Path.GetFullPath(installDir).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            using (ZipArchive archive = ZipFile.OpenRead(tempZip)) {
                foreach (ZipArchiveEntry entry in archive.Entries) {
                    string destPath = Path.GetFullPath(Path.Combine(installDir, entry.FullName));
                    if (!destPath.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.IsNullOrEmpty(entry.Name)) {
                        Directory.CreateDirectory(destPath);
                    } else {
                        Directory.CreateDirectory(Path.GetDirectoryName(destPath));
                        entry.ExtractToFile(destPath, true);
                    }
                }
            }
        } finally {
            if (File.Exists(tempZip)) File.Delete(tempZip);
        }

        string exePath = Path.Combine(installDir, "TeXPulseStudio.exe");
        string icoPath = Path.Combine(installDir, "TeXPulse-Studio.ico");
        string uninstallCopy = Path.Combine(installDir, "Uninstall-TeXPulseStudio.exe");
        string selfExe = Assembly.GetExecutingAssembly().Location;
        if (!string.IsNullOrEmpty(selfExe) &&
            !string.Equals(Path.GetFullPath(selfExe), Path.GetFullPath(uninstallCopy), StringComparison.OrdinalIgnoreCase)) {
            File.Copy(selfExe, uninstallCopy, true);
        }

        string desktopLnk = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            "TeXPulse Studio 2.0.lnk");
        string startMenuLnk = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            "TeXPulse Studio 2.0.lnk");

        SetShortcut(desktopLnk, exePath, installDir, icoPath);
        SetShortcut(startMenuLnk, exePath, installDir, icoPath);

        string openFileCmd = "\"" + exePath + "\" \"%1\"";
        string openBgCmd = "\"" + exePath + "\" \"%V\"";

        SetRegistryDefault(@"Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio", "Open with TeXPulse Studio 2.0");
        SetRegistryValue(@"Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio", "Icon", icoPath + ",0");
        SetRegistryDefault(@"Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio\command", openFileCmd);

        SetRegistryDefault(@"Software\Classes\TeXPulseStudio.tex", "LaTeX Source Document");
        SetRegistryDefault(@"Software\Classes\TeXPulseStudio.tex\DefaultIcon", icoPath + ",0");
        SetRegistryDefault(@"Software\Classes\TeXPulseStudio.tex\shell\open\command", openFileCmd);
        SetRegistryValue(@"Software\Classes\.tex\OpenWithProgids", "TeXPulseStudio.tex", "");

        SetRegistryDefault(@"Software\Classes\Directory\shell\TeXPulseStudio", "Open Folder as TeXPulse Project");
        SetRegistryValue(@"Software\Classes\Directory\shell\TeXPulseStudio", "Icon", icoPath + ",0");
        SetRegistryDefault(@"Software\Classes\Directory\shell\TeXPulseStudio\command", openFileCmd);

        SetRegistryDefault(@"Software\Classes\Directory\Background\shell\TeXPulseStudio", "Open Folder as TeXPulse Project");
        SetRegistryValue(@"Software\Classes\Directory\Background\shell\TeXPulseStudio", "Icon", icoPath + ",0");
        SetRegistryDefault(@"Software\Classes\Directory\Background\shell\TeXPulseStudio\command", openBgCmd);

        const string uninstSubkey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TeXPulseStudio";
        SetRegistryValue(uninstSubkey, "DisplayName", "TeXPulse Studio 2.0");
        SetRegistryValue(uninstSubkey, "DisplayVersion", "2.0.0");
        SetRegistryValue(uninstSubkey, "Publisher", "TeXPulse Research Group");
        SetRegistryValue(uninstSubkey, "DisplayIcon", icoPath + ",0");
        SetRegistryValue(uninstSubkey, "InstallLocation", installDir);
        SetRegistryValue(uninstSubkey, "UninstallString", "\"" + uninstallCopy + "\" --uninstall");
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(uninstSubkey)) {
            if (k != null) {
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        if (silent) {
            Console.Out.WriteLine(
                "{\"ok\":true,\"installed\":true,\"installDir\":\"" +
                installDir.Replace("\\", "\\\\") +
                "\",\"exe\":\"" +
                exePath.Replace("\\", "\\\\") +
                "\"}");
        }
    }

    internal static void Uninstall(string installDir, bool silent) {
        foreach (string subkey in new[] {
            @"Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio",
            @"Software\Classes\TeXPulseStudio.tex",
            @"Software\Classes\Directory\shell\TeXPulseStudio",
            @"Software\Classes\Directory\Background\shell\TeXPulseStudio",
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TeXPulseStudio"
        }) {
            Registry.CurrentUser.DeleteSubKeyTree(subkey, false);
        }
        using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Classes\.tex\OpenWithProgids", true)) {
            if (k != null) k.DeleteValue("TeXPulseStudio.tex", false);
        }
        foreach (string lnk in new[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "TeXPulse Studio 2.0.lnk"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TeXPulse Studio 2.0.lnk")
        }) {
            if (File.Exists(lnk)) File.Delete(lnk);
        }
        if (Directory.Exists(installDir)) {
            foreach (string sub in new[] { "resources", "runtime" }) {
                string p = Path.Combine(installDir, sub);
                if (Directory.Exists(p)) {
                    try { Directory.Delete(p, true); } catch { }
                }
            }
            foreach (string file in new[] { "TeXPulseStudio.exe", "TeXPulse-Studio.ico" }) {
                string p = Path.Combine(installDir, file);
                if (File.Exists(p)) {
                    try { File.Delete(p); } catch { }
                }
            }
        }
        if (silent) {
            Console.Out.WriteLine("{\"ok\":true,\"uninstalled\":true}");
        }
    }
}

internal static class SetupProgram {
    [STAThread]
    private static int Main(string[] args) {
        bool silent = false;
        bool uninstall = false;
        foreach (string arg in args) {
            if (string.Equals(arg, "--silent", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(arg, "/S", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(arg, "--verify", StringComparison.OrdinalIgnoreCase)) {
                silent = true;
            }
            if (string.Equals(arg, "--uninstall", StringComparison.OrdinalIgnoreCase)) {
                uninstall = true;
            }
        }

        string installDir = InstallerCore.GetInstallDir();
        if (silent) {
            try {
                if (uninstall) {
                    InstallerCore.Uninstall(installDir, true);
                } else {
                    InstallerCore.Install(installDir, true);
                }
                return 0;
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var form = new Form();
        form.Text = "TeXPulse Studio 2.0 Setup";
        form.ClientSize = new Size(460, 210);
        form.FormBorderStyle = FormBorderStyle.FixedDialog;
        form.MaximizeBox = false;
        form.StartPosition = FormStartPosition.CenterScreen;
        form.BackColor = Color.FromArgb(245, 245, 247);

        var title = new Label();
        title.Text = uninstall ? "Uninstall TeXPulse Studio 2.0" : "Install TeXPulse Studio 2.0";
        title.Font = new Font("Segoe UI", 13, FontStyle.Bold);
        title.Location = new Point(20, 20);
        title.AutoSize = true;

        var desc = new Label();
        desc.Text = "Target folder:\n" + installDir;
        desc.Font = new Font("Segoe UI", 9.5f);
        desc.Location = new Point(20, 56);
        desc.Size = new Size(420, 48);

        var installBtn = new Button();
        installBtn.Text = uninstall ? "Uninstall" : "Install TeXPulse Studio 2.0";
        installBtn.Location = new Point(20, 145);
        installBtn.Size = new Size(210, 32);
        installBtn.Click += (s, e) => {
            installBtn.Enabled = false;
            try {
                if (uninstall) {
                    InstallerCore.Uninstall(installDir, false);
                    MessageBox.Show("TeXPulse Studio 2.0 has been removed.", "TeXPulse Setup");
                } else {
                    InstallerCore.Install(installDir, false);
                    MessageBox.Show("TeXPulse Studio 2.0 installed cleanly.", "TeXPulse Setup");
                }
                form.Close();
            } catch (Exception ex) {
                MessageBox.Show("Setup failed: " + ex.Message, "TeXPulse Setup");
                installBtn.Enabled = true;
            }
        };

        var cancelBtn = new Button();
        cancelBtn.Text = "Close";
        cancelBtn.Location = new Point(340, 145);
        cancelBtn.Size = new Size(100, 32);
        cancelBtn.Click += (s, e) => form.Close();

        form.Controls.Add(title);
        form.Controls.Add(desc);
        form.Controls.Add(installBtn);
        form.Controls.Add(cancelBtn);
        Application.Run(form);
        return 0;
    }
}
'@

  [System.IO.File]::WriteAllText($SetupCsPath, $setupSource, [System.Text.Encoding]::UTF8)
  & $CscExe /nologo /target:winexe /optimize+ "/out:$SetupExePath" "/win32icon:$UnpackedIco" "/resource:$PayloadZipPath,TeXPulse.Payload.zip" /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll $SetupCsPath
  if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed compiling TeXPulse-Studio-2.0.0-Setup.exe with exit code $LASTEXITCODE"
  }
}

Remove-Item -LiteralPath $TempSrcDir -Recurse -Force -ErrorAction SilentlyContinue

@{
  ok = $true
  action = "desktop:exe"
  unpackedDir = $UnpackedDir
  executable = $WrapperExePath
  serverBundle = $ServerBundleCjs
  setupInstaller = $SetupExePath
  setupEngine = if ($IsccPath) { "inno-setup-6" } else { "native-winexe-setup" }
} | ConvertTo-Json -Depth 3
