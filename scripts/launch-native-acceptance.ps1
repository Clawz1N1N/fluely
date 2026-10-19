param([string]$TestName='fluely-023-acceptance',[int]$Port=9225)
$ErrorActionPreference='Stop'
if($TestName -notmatch '^fluely-[a-z0-9-]+$'){throw 'Use an owned acceptance directory name'}
$repo=(Get-Location).Path
$root=[IO.Path]::GetFullPath((Join-Path $repo "_research\temp\$TestName"))
$temporary=[IO.Path]::GetFullPath((Join-Path $repo '_research\temp'))
if(!$root.StartsWith($temporary+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Acceptance directory outside workspace temporary root'}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$executable=Join-Path $root 'fluely.exe'
Copy-Item -LiteralPath (Join-Path $repo 'src-tauri\target\release\fluely.exe') -Destination $executable -Force
& icacls.exe $executable /setintegritylevel M | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not normalize the owned executable'}
$saved=@{}
foreach($name in @('FLUELY_DISABLE_ALIAS','FLUELY_DATA_DIR','PLUELY_DATA_DIR','WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:FLUELY_DISABLE_ALIAS='1'
 Remove-Item -LiteralPath Env:FLUELY_DATA_DIR,Env:PLUELY_DATA_DIR -ErrorAction SilentlyContinue
 $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=$Port"
 $process=Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
 @{pid=$process.Id;start_utc=$process.StartTime.ToUniversalTime().ToString('o');executable=$executable;profile=(Join-Path $root 'profile')} | ConvertTo-Json | Set-Content -LiteralPath '_research\temp\fluely-native-process.json'
 Write-Output "Owned Fluely acceptance process $($process.Id); CDP $Port; isolated profile"
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
