$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
# Enumerating recognizers does not initialize a microphone or an audio input.
$recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
$catalog = @($recognizers | ForEach-Object {
    @{ id = $_.Culture.Name; name = $_.Name }
})
[Console]::Write((ConvertTo-Json -InputObject $catalog -Compress))
