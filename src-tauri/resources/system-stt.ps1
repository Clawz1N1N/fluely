param([string]$Audio, [string]$Language = 'default', [switch]$List)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
if ($List) {
    ConvertTo-Json -InputObject @($recognizers | ForEach-Object { $_.Culture.Name }) -Compress
    exit 0
}
if ($recognizers.Count -eq 0) { throw 'No offline Windows speech recognizer is installed. Use a local Whisper server or install a Windows speech language.' }
if ($Language -eq 'default') { $selectedRecognizer = $recognizers[0] }
else { $selectedRecognizer = $recognizers | Where-Object { $_.Culture.Name -eq $Language -or $_.Culture.TwoLetterISOLanguageName -eq $Language } | Select-Object -First 1 }
if (-not $selectedRecognizer) { throw 'The selected language has no installed offline Windows recognizer. Select an available language or use local Whisper.' }
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($selectedRecognizer)
try {
    $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
    $engine.SetInputToWaveFile($Audio)
    $segments = New-Object System.Collections.Generic.List[string]
    for ($index = 0; $index -lt 64; $index++) {
        $result = $engine.Recognize([TimeSpan]::FromSeconds(5))
        if ($null -eq $result) { break }
        if ($result.Text) { $segments.Add($result.Text) }
    }
    [Console]::Write(($segments -join ' '))
} finally { $engine.Dispose() }
