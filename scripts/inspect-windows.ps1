<#
.SYNOPSIS
Read native window state for explicitly selected process IDs.
.EXAMPLE
.\scripts\inspect-windows.ps1 -ProcessId 1234,5678 -Json
.NOTES
Does not launch processes, change windows, or enumerate process command lines.
Display affinity 0x11 is a configured capture-exclusion flag, not proof that
every screen recorder honors it. A failed affinity query remains an error.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [ValidateScript({ $_ -gt 0 })]
    [int[]] $ProcessId,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'
if (-not ('PluelyWindowInspector' -as [type])) {
    # Keep Add-Type's compiler scratch files within the repository.
    $inspectionTemp = Join-Path (Split-Path $PSScriptRoot -Parent) '_research\temp'
    [void][System.IO.Directory]::CreateDirectory($inspectionTemp)
    $previousTemp = $env:TEMP
    $previousTmp = $env:TMP
    try {
        $env:TEMP = $inspectionTemp
        $env:TMP = $inspectionTemp
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class PluelyWindowInspector {
    public delegate bool EnumWindowCallback(IntPtr hwnd, IntPtr state);
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    public class WindowRecord {
        public int ProcessId;
        public string Handle;
        public string Title;
        public string ClassName;
        public bool Visible;
        public bool IsForeground;
        public Rect Rectangle;
        public bool RectangleQuerySucceeded;
        public int RectangleQueryError;
        public uint ExtendedStyles;
        public string ExtendedStylesHex;
        public int ExtendedStylesQueryError;
        public string[] DecodedStyles;
        public bool AffinityQuerySucceeded;
        public uint? DisplayAffinity;
        public string DisplayAffinityHex;
        public int AffinityQueryError;
        public string AffinityAssessment;
    }
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumWindows(EnumWindowCallback callback, IntPtr state);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maximum);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int maximum);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hwnd, int index);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowDisplayAffinity(IntPtr hwnd, out uint affinity);
    [DllImport("kernel32.dll")]
    private static extern void SetLastError(uint error);

    public static WindowRecord[] Inspect(int[] processIds) {
        var selected = new HashSet<int>(processIds);
        var result = new List<WindowRecord>();
        IntPtr foreground = GetForegroundWindow();
        EnumWindowCallback callback = delegate(IntPtr hwnd, IntPtr unused) {
            uint pid;
            if (GetWindowThreadProcessId(hwnd, out pid) == 0 || !selected.Contains(unchecked((int)pid))) return true;
            // Filter before reading any title, class, rectangle, or affinity.
            var title = new StringBuilder(32768);
            var className = new StringBuilder(256);
            GetWindowText(hwnd, title, title.Capacity);
            GetClassName(hwnd, className, className.Capacity);
            Rect rectangle;
            bool rectangleOk = GetWindowRect(hwnd, out rectangle);
            int rectangleError = rectangleOk ? 0 : Marshal.GetLastWin32Error();
            SetLastError(0);
            long styleValue = IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, -20).ToInt64() : GetWindowLong32(hwnd, -20);
            int styleError = Marshal.GetLastWin32Error();
            uint styles = unchecked((uint)styleValue);
            var decoded = new List<string>();
            if ((styles & 0x00000008) != 0) decoded.Add("TOPMOST");
            if ((styles & 0x00000080) != 0) decoded.Add("TOOLWINDOW");
            if ((styles & 0x08000000) != 0) decoded.Add("NOACTIVATE");
            if ((styles & 0x00080000) != 0) decoded.Add("LAYERED");
            if ((styles & 0x00000020) != 0) decoded.Add("TRANSPARENT");
            uint affinity;
            bool affinityOk = GetWindowDisplayAffinity(hwnd, out affinity);
            int affinityError = affinityOk ? 0 : Marshal.GetLastWin32Error();
            string assessment = !affinityOk ? "QUERY_FAILED"
                : affinity == 0x11 ? "WDA_EXCLUDEFROMCAPTURE configured; capture test still required"
                : affinity == 1 ? "WDA_MONITOR configured; not 0x11 exclusion"
                : affinity == 0 ? "WDA_NONE; capture exclusion not configured"
                : "UNKNOWN_AFFINITY";
            result.Add(new WindowRecord {
                ProcessId = unchecked((int)pid), Handle = "0x" + hwnd.ToInt64().ToString("x"),
                Title = title.ToString(), ClassName = className.ToString(),
                Visible = IsWindowVisible(hwnd), IsForeground = hwnd == foreground,
                Rectangle = rectangle, RectangleQuerySucceeded = rectangleOk,
                RectangleQueryError = rectangleError, ExtendedStyles = styles,
                ExtendedStylesHex = "0x" + styles.ToString("x8"), ExtendedStylesQueryError = styleError,
                DecodedStyles = decoded.ToArray(), AffinityQuerySucceeded = affinityOk,
                DisplayAffinity = affinityOk ? (uint?)affinity : null,
                DisplayAffinityHex = affinityOk ? "0x" + affinity.ToString("x8") : null,
                AffinityQueryError = affinityError, AffinityAssessment = assessment
            });
            return true;
        };
        SetLastError(0);
        if (!EnumWindows(callback, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "EnumWindows failed");
        GC.KeepAlive(callback);
        return result.ToArray();
    }
}
'@
    } finally {
        $env:TEMP = $previousTemp
        $env:TMP = $previousTmp
    }
}

$selectedProcessIds = @($ProcessId | Sort-Object -Unique)
$targetStatus = @(foreach ($selectedId in $selectedProcessIds) {
    try {
        $target = Get-Process -Id $selectedId -ErrorAction Stop
        [pscustomobject]@{ ProcessId = $selectedId; Name = $target.ProcessName; Running = $true }
    } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
        [pscustomobject]@{ ProcessId = $selectedId; Name = $null; Running = $false }
    }
})
$foregroundHandle = [PluelyWindowInspector]::GetForegroundWindow()
$foregroundProcessId = [uint32]0
if ($foregroundHandle -ne [IntPtr]::Zero) {
    [void][PluelyWindowInspector]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId)
}
$windows = @([PluelyWindowInspector]::Inspect($selectedProcessIds))
$report = [pscustomobject]@{
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    SelectedProcesses = $targetStatus
    ForegroundProcessId = $foregroundProcessId
    ForegroundIsSelected = $selectedProcessIds -contains [int]$foregroundProcessId
    Windows = $windows
    Note = 'Native state only. 0x11 confirms configured affinity; recorder/screenshot tests remain separate.'
}
if ($Json) {
    $report | ConvertTo-Json -Depth 8
} else {
    $report | Select-Object TimestampUtc, ForegroundProcessId, ForegroundIsSelected, Note | Format-List
    $targetStatus | Format-Table -AutoSize
    $windows | Select-Object ProcessId, Handle, Title, ClassName, Visible, IsForeground,
        @{Name='Rect';Expression={ if ($_.RectangleQuerySucceeded) { '{0},{1} - {2},{3}' -f $_.Rectangle.Left,$_.Rectangle.Top,$_.Rectangle.Right,$_.Rectangle.Bottom } else { 'QUERY_FAILED: ' + $_.RectangleQueryError } }},
        ExtendedStylesHex, @{Name='Styles';Expression={$_.DecodedStyles -join '|'}},
        DisplayAffinityHex, AffinityQueryError, AffinityAssessment | Format-Table -AutoSize -Wrap
}
