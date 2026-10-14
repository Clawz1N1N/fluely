param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$version=(Get-Content -Raw (Join-Path $repo 'package.json') | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'A stable semantic version is required'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$sources=@{
  'fluely.exe'=Join-Path $repo 'src-tauri\target\release\fluely.exe'
  "Fluely_${version}_x64_en-US.msi"=Join-Path $repo "src-tauri\target\release\bundle\msi\Fluely_${version}_x64_en-US.msi"
  "Fluely_${version}_x64-setup.exe"=Join-Path $repo "src-tauri\target\release\bundle\nsis\Fluely_${version}_x64-setup.exe"
}
foreach($source in $sources.Values){if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw "Missing release artifact: $source"}}
$previous=Join-Path $output 'fluely.exe'
if(Test-Path -LiteralPath $previous){
  $oldVersion=([string](Get-Item -LiteralPath $previous).VersionInfo.FileVersion) -replace '^(\d+\.\d+\.\d+)\.\d+$','$1'
  if($oldVersion -match '^\d+\.\d+\.\d+$' -and $oldVersion -ne $version){
    $archive=Join-Path $output "previous-$oldVersion"
    New-Item -ItemType Directory -Path $archive -Force | Out-Null
    $names=@('fluely.exe',"Fluely_${oldVersion}_x64_en-US.msi", "Fluely_${oldVersion}_x64-setup.exe",'START_FLUELY.cmd','SHA256.txt','README_FORK.md','README.md','RELEASE_NOTES.md','FINAL_REPORT.md','COMPLETION_CHECKLIST.md','MANUAL_TESTS.md','THIRD_PARTY_NOTICES.md','LICENSE.txt')
    foreach($name in $names){
      $existing=Join-Path $output $name;$saved=Join-Path $archive $name
      if(!(Test-Path -LiteralPath $existing -PathType Leaf)){continue}
      if(Test-Path -LiteralPath $saved){
        if((Get-FileHash -LiteralPath $existing).Hash -ne (Get-FileHash -LiteralPath $saved).Hash){throw "Different archive already exists: $saved"}
      }else{Move-Item -LiteralPath $existing -Destination $saved}
    }
  }
}
foreach($name in $sources.Keys){
  $destination=Join-Path $output $name
  Copy-Item -LiteralPath $sources[$name] -Destination $destination -Force
  # A development sandbox may stamp generated artifacts as low integrity.
  # Normalize only these owned release files before a normal desktop launch.
  & icacls.exe $destination /setintegritylevel M | Out-Null
  if($LASTEXITCODE -ne 0){throw "Could not set normal integrity on $name"}
}
Copy-Item -LiteralPath (Join-Path $repo 'README.md') -Destination (Join-Path $output 'README.md') -Force
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination (Join-Path $output 'LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $repo 'THIRD_PARTY_NOTICES.md') -Destination (Join-Path $output 'THIRD_PARTY_NOTICES.md') -Force
Copy-Item -LiteralPath (Join-Path $repo 'scripts\start-portable.cmd') -Destination (Join-Path $output 'START_FLUELY.cmd') -Force
Copy-Item -LiteralPath (Join-Path $repo "docs\release-$version.md") -Destination (Join-Path $output 'RELEASE_NOTES.md') -Force
$docs=Join-Path $output 'docs';New-Item -ItemType Directory -Path $docs -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'src-tauri\icons\128x128.png') -Destination (Join-Path $docs 'fluely-icon.png') -Force
$readmePath=Join-Path $output 'README.md'
$readme=(Get-Content -Raw -LiteralPath $readmePath).Replace('src-tauri/icons/128x128.png','docs/fluely-icon.png')
[IO.File]::WriteAllText($readmePath,$readme,[Text.UTF8Encoding]::new($false))
$guides=@('provider-models.md','vision-methods.md','sleep-mode.md','whisper-cpu-options.md')
foreach($guide in $guides){Copy-Item -LiteralPath (Join-Path $repo "docs\$guide") -Destination (Join-Path $docs $guide) -Force}
$licenses=Join-Path $docs 'licenses';New-Item -ItemType Directory -Path $licenses -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $repo 'docs\licenses') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $licenses $_.Name) -Force}
$stage=Join-Path $repo "_research\temp\portable-$version"
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$portableFiles=@('fluely.exe','README.md','RELEASE_NOTES.md','LICENSE.txt','THIRD_PARTY_NOTICES.md','START_FLUELY.cmd')
foreach($name in $portableFiles){Copy-Item -LiteralPath (Join-Path $output $name) -Destination (Join-Path $stage $name) -Force}
$stageDocs=Join-Path $stage 'docs';New-Item -ItemType Directory -Path $stageDocs -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $docs 'fluely-icon.png') -Destination (Join-Path $stageDocs 'fluely-icon.png') -Force
foreach($guide in $guides){Copy-Item -LiteralPath (Join-Path $docs $guide) -Destination (Join-Path $stageDocs $guide) -Force}
$stageLicenses=Join-Path $stageDocs 'licenses';New-Item -ItemType Directory -Path $stageLicenses -Force | Out-Null
Get-ChildItem -LiteralPath $licenses -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stageLicenses $_.Name) -Force}
$exeHash=(Get-FileHash -LiteralPath (Join-Path $stage 'fluely.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $stage 'SHA256.txt') -Encoding ascii -Value "$exeHash  fluely.exe"
$zipName="Fluely_${version}_windows-x64-portable.zip"
# Explicit inputs exclude the real profile and any stale scratch-stage files.
$zipInputs=@($portableFiles | ForEach-Object {Join-Path $stage $_}) + @((Join-Path $stage 'SHA256.txt'),$stageDocs)
Compress-Archive -LiteralPath $zipInputs -DestinationPath (Join-Path $output $zipName) -Force
$hashes=@(@($sources.Keys)+@($zipName) | Sort-Object | ForEach-Object {"$((Get-FileHash -LiteralPath (Join-Path $output $_) -Algorithm SHA256).Hash.ToLowerInvariant())  $_"})
Set-Content -LiteralPath (Join-Path $output 'SHA256.txt') -Encoding ascii -Value $hashes
Write-Output "Packaged Fluely $version in $output; preserved the existing profile directory."
Write-Output $hashes
