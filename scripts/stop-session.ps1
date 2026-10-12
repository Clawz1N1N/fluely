<#
.SYNOPSIS
Describe or stop one explicitly owned process tree using native Windows APIs.
.NOTES
Capture Describe.startedUtc immediately after launching the root. Stop requires
that exact timestamp, including all seven fractional digits; session Date.now()
is not a substitute. No WMI, process-name matching, or permission changes.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Describe','Stop')][string] $Action,
    [Parameter(Mandatory = $true)][ValidateRange(1,2147483647)][int] $RootProcessId,
    [string] $StartedUtc
)
$ErrorActionPreference = 'Stop'
try {
    if (-not ('PluelyOwnedSession' -as [type])) {
        $sessionTemp = Join-Path (Split-Path $PSScriptRoot -Parent) '_research\temp'
        [void][System.IO.Directory]::CreateDirectory($sessionTemp)
        $oldTemp = $env:TEMP; $oldTmp = $env:TMP
        try {
            $env:TEMP = $sessionTemp; $env:TMP = $sessionTemp
            Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;

public static class PluelyOwnedSession {
    const uint QUERY = 0x1000, TERMINATE = 1, SYNCHRONIZE = 0x100000;
    const uint SNAP_PROCESS = 2, STILL_ACTIVE = 259;
    [StructLayout(LayoutKind.Sequential)]
    struct FileTime { public uint Low, High; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ProcessEntry {
        public uint Size, Usage, Pid;
        public UIntPtr Heap;
        public uint Module, Threads, Parent;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
    }
    public class Identity {
        public uint rootProcessId;
        public string startedUtc;
        public string creationTimeFileTime;
    }
    public class StopResult {
        public uint rootProcessId;
        public string startedUtc;
        public uint[] terminatedProcessIds;
        public uint[] alreadyExitedProcessIds;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out FileTime created, out FileTime exited, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();

    static IntPtr Open(uint pid, uint access) {
        IntPtr handle = OpenProcess(access, false, pid);
        if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot query owned PID " + pid);
        return handle;
    }
    static long Created(IntPtr handle) {
        FileTime created, exited, kernel, user;
        if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetProcessTimes failed");
        return unchecked((long)(((ulong)created.High << 32) | created.Low));
    }
    static bool Running(IntPtr handle) {
        uint code;
        if (!GetExitCodeProcess(handle, out code)) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetExitCodeProcess failed");
        return code == STILL_ACTIVE;
    }
    public static Identity Describe(uint pid) {
        IntPtr handle = Open(pid, QUERY);
        try {
            long time = Created(handle);
            if (!Running(handle)) throw new InvalidOperationException("Owned root has already exited");
            return new Identity { rootProcessId = pid, startedUtc = DateTime.FromFileTimeUtc(time).ToString("o", CultureInfo.InvariantCulture), creationTimeFileTime = time.ToString(CultureInfo.InvariantCulture) };
        } finally { CloseHandle(handle); }
    }
    // Enumeration metadata stays internal; only chosen owned PIDs are returned.
    static Dictionary<uint,uint> Parents() {
        IntPtr snapshot = CreateToolhelp32Snapshot(SNAP_PROCESS, 0);
        if (snapshot == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Process snapshot failed; no processes terminated");
        try {
            var parents = new Dictionary<uint,uint>();
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
            if (!Process32FirstW(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Process snapshot first entry failed");
            do { parents[entry.Pid] = entry.Parent; } while (Process32NextW(snapshot, ref entry));
            int error = Marshal.GetLastWin32Error();
            if (error != 18) throw new Win32Exception(error, "Process snapshot enumeration failed");
            return parents;
        } finally { CloseHandle(snapshot); }
    }
    static void Select(uint pid, Dictionary<uint,uint> parents, HashSet<uint> visited, List<uint> bottomFirst) {
        if (!visited.Add(pid)) throw new InvalidOperationException("Cyclic process ancestry; cleanup refused");
        foreach (var item in parents) if (item.Value == pid && item.Key != pid) Select(item.Key, parents, visited, bottomFirst);
        bottomFirst.Add(pid);
    }
    public static StopResult Stop(uint root, string startedUtc) {
        if (root == GetCurrentProcessId()) throw new InvalidOperationException("Cleanup cannot target its own process");
        DateTime expected = DateTime.ParseExact(startedUtc, "o", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        if (expected.Kind != DateTimeKind.Utc) throw new ArgumentException("StartedUtc must be an exact UTC Describe timestamp");
        var handles = new Dictionary<uint,IntPtr>();
        try {
            IntPtr rootHandle = Open(root, QUERY | TERMINATE | SYNCHRONIZE);
            handles[root] = rootHandle;
            long actual = Created(rootHandle);
            if (actual != expected.ToFileTimeUtc()) throw new InvalidOperationException("Root creation-time mismatch; no processes terminated");
            if (!Running(rootHandle)) throw new InvalidOperationException("Owned root has exited; cleanup refused");
            var parents = Parents();
            if (!parents.ContainsKey(root)) throw new InvalidOperationException("Owned root is absent from snapshot; cleanup refused");
            var order = new List<uint>();
            var selected = new HashSet<uint>();
            Select(root, parents, selected, order);
            if (selected.Contains(GetCurrentProcessId())) throw new InvalidOperationException("Cleanup helper is inside the selected tree; cleanup refused");
            var creation = new Dictionary<uint,long> { { root, actual } };
            // Open every selected process before terminating any. A query/access
            // failure aborts this preflight and never causes a broader kill.
            foreach (uint pid in order) {
                if (pid == root) continue;
                IntPtr handle = Open(pid, QUERY | TERMINATE | SYNCHRONIZE);
                handles[pid] = handle;
                creation[pid] = Created(handle);
            }
            foreach (uint pid in order) {
                if (pid != root && creation[pid] < creation[parents[pid]]) throw new InvalidOperationException("Reused process ancestry detected; no processes terminated");
            }
            // A PID can be reused between the first snapshot and OpenProcess.
            // Recheck ancestry after retaining handles; termination uses these
            // handles, so later PID reuse can never redirect a kill.
            var verifiedParents = Parents();
            foreach (uint pid in order) {
                if (!Running(handles[pid])) continue;
                uint verifiedParent;
                if (!verifiedParents.TryGetValue(pid, out verifiedParent) ||
                    (pid != root && verifiedParent != parents[pid])) {
                    throw new InvalidOperationException("Process ancestry changed during preflight; no processes terminated");
                }
            }
            var stopped = new List<uint>();
            var exited = new List<uint>();
            foreach (uint pid in order) {
                IntPtr handle = handles[pid];
                if (!Running(handle)) { exited.Add(pid); continue; }
                if (!TerminateProcess(handle, 1)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot terminate owned PID " + pid);
                uint wait = WaitForSingleObject(handle, 5000);
                if (wait != 0) throw new InvalidOperationException("Owned PID " + pid + " did not terminate; wait result " + wait);
                stopped.Add(pid);
            }
            return new StopResult { rootProcessId = root, startedUtc = expected.ToString("o", CultureInfo.InvariantCulture), terminatedProcessIds = stopped.ToArray(), alreadyExitedProcessIds = exited.ToArray() };
        } finally { foreach (IntPtr handle in handles.Values) CloseHandle(handle); }
    }
}
'@
        } finally { $env:TEMP = $oldTemp; $env:TMP = $oldTmp }
    }
    if ($Action -eq 'Describe') {
        [PluelyOwnedSession]::Describe([uint32]$RootProcessId) | ConvertTo-Json -Depth 4 -Compress
    } else {
        if ([string]::IsNullOrWhiteSpace($StartedUtc)) { throw 'Stop requires the exact Describe.startedUtc timestamp.' }
        [PluelyOwnedSession]::Stop([uint32]$RootProcessId, $StartedUtc) | ConvertTo-Json -Depth 4 -Compress
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
