[Setup]
AppId={{8D6B5A30-5F3C-4E1C-9E2E-7D4C3A120001}
AppName=TeXPulse Studio 2.0
AppVersion=2.0.0
AppPublisher=TeXPulse Research Group
DefaultDirName={localappdata}\Programs\TeXPulseStudio
DefaultGroupName=TeXPulse Studio 2.0
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=TeXPulse-Studio-2.0.0-Setup
SetupIconFile=..\dist\desktop\TeXPulse-Studio.ico
UninstallDisplayIcon={app}\TeXPulseStudio.exe
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\TeXPulse Studio 2.0"; Filename: "{app}\TeXPulseStudio.exe"; IconFilename: "{app}\TeXPulse-Studio.ico"
Name: "{userprograms}\TeXPulse Studio 2.0"; Filename: "{app}\TeXPulseStudio.exe"; IconFilename: "{app}\TeXPulse-Studio.ico"

[Registry]
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio"; ValueType: string; ValueData: "Open with TeXPulse Studio 2.0"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\TeXPulse-Studio.ico,0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.tex\shell\TeXPulseStudio\command"; ValueType: string; ValueData: """{app}\TeXPulseStudio.exe"" ""%1"""

Root: HKCU; Subkey: "Software\Classes\TeXPulseStudio.tex"; ValueType: string; ValueData: "LaTeX Source Document"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\TeXPulseStudio.tex\DefaultIcon"; ValueType: string; ValueData: "{app}\TeXPulse-Studio.ico,0"
Root: HKCU; Subkey: "Software\Classes\TeXPulseStudio.tex\shell\open\command"; ValueType: string; ValueData: """{app}\TeXPulseStudio.exe"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.tex\OpenWithProgids"; ValueType: string; ValueName: "TeXPulseStudio.tex"; ValueData: ""; Flags: uninsdeletevalue

Root: HKCU; Subkey: "Software\Classes\Directory\shell\TeXPulseStudio"; ValueType: string; ValueData: "Open Folder as TeXPulse Project"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\TeXPulseStudio"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\TeXPulse-Studio.ico,0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\TeXPulseStudio\command"; ValueType: string; ValueData: """{app}\TeXPulseStudio.exe"" ""%1"""

Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\TeXPulseStudio"; ValueType: string; ValueData: "Open Folder as TeXPulse Project"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\TeXPulseStudio"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\TeXPulse-Studio.ico,0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\TeXPulseStudio\command"; ValueType: string; ValueData: """{app}\TeXPulseStudio.exe"" ""%V"""
