param([ValidateSet('msi','nsis')][string]$Kind,[switch]$UpgradeExisting,[ValidatePattern('^[a-z0-9-]*$')][string]$RunSuffix='')
$ErrorActionPreference='Stop'
$repo=(Get-Location).Path
$version=(Get-Content package.json -Raw|ConvertFrom-Json).version
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run this acceptance check without an administrator token'}
$existing=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')|ForEach-Object{Get-ItemProperty $_ -ErrorAction SilentlyContinue}|Where-Object DisplayName -EQ 'Fluely'
$existingNsis=@($existing|Where-Object {$_.PSChildName -eq 'Fluely' -and $_.UninstallString -like '*uninstall.exe*'})
if($existing -and ($existingNsis.Count -ne 1 -or @($existing).Count -ne 1)){throw 'Unsupported existing installation; preserve it'}
if($existing -and $Kind -eq 'nsis' -and !$UpgradeExisting){throw 'An existing NSIS installation requires explicit upgrade mode'}
if($UpgradeExisting -and ($Kind -ne 'nsis' -or $existingNsis.Count -ne 1)){throw 'Upgrade mode requires one existing NSIS installation'}
if(Get-Process fluely -ErrorAction SilentlyContinue){throw 'Stop the explicitly owned native acceptance instance before installer checks'}
$root=[IO.Path]::GetFullPath((Join-Path $repo "_research\temp\installer-$Kind-$version$RunSuffix"))
$temporary=[IO.Path]::GetFullPath((Join-Path $repo '_research\temp'))
if(!$root.StartsWith($temporary+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installer fixture outside workspace temporary root'}
$destination=Join-Path $root 'installed'
if($UpgradeExisting){$destination=[IO.Path]::GetFullPath($existingNsis[0].InstallLocation.Trim('"'));if($destination -ne (Join-Path $env:LOCALAPPDATA 'Fluely')){throw 'Unexpected existing installation destination'}}
$profile=Join-Path $root 'profile'
if(Test-Path -LiteralPath (Join-Path $profile 'pluely.db')){throw 'Choose a fresh installer fixture; preserve previous acceptance data'}
node scripts/create-upgrade-fixture.mjs $profile
if($LASTEXITCODE -ne 0){throw 'Could not create the owned upgrade fixture'}
& icacls.exe $root /setintegritylevel '(OI)(CI)M'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not normalize the owned installer test directory'}
$oldDebug=$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;$oldAlias=$env:FLUELY_DISABLE_ALIAS
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9227';$env:FLUELY_DISABLE_ALIAS='1'
$installed=$false;$started=$null;$productCode=$null
$registryBackup=Join-Path $root 'previous-installer-settings.reg'
if($Kind -eq 'msi' -and $existing){& reg.exe export 'HKCU\Software\clawz1n1n\Fluely' $registryBackup /y|Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not preserve existing installer settings'};Set-ItemProperty 'HKCU:\Software\clawz1n1n\Fluely' -Name '(default)' -Value $destination;Set-ItemProperty 'HKCU:\Software\clawz1n1n\Fluely' -Name InstallDir -Value $destination}
function Stop-OwnedFluely($process){
 if(!$process){return}
 $current=Get-Process -Id $process.Id -ErrorAction SilentlyContinue
 if(!$current){return}
 if($current.Path -ne $process.Path -or $current.StartTime.ToUniversalTime().Ticks -ne $process.StartTime.ToUniversalTime().Ticks){throw 'Installer acceptance process identity changed'}
 & "$PSScriptRoot\stop-session.ps1" -Action Stop -RootProcessId $process.Id -StartedUtc $process.StartTime.ToUniversalTime().ToString('o')|Out-Null
 if($LASTEXITCODE -ne 0){throw 'Owned installer app cleanup failed'}
}
function Find-StartedFluely {
 $deadline=[datetime]::UtcNow.AddSeconds(30)
 do{
  $candidate=Get-CimInstance Win32_Process -Filter 'Name="fluely.exe" OR Name="my program.exe"'|Where-Object{$_.ExecutablePath -and ($_.ExecutablePath.StartsWith($destination+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)-or $_.ExecutablePath.StartsWith($profile+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))}|Select-Object -First 1
  if($candidate){$p=Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue;if($p){return $p}}
  Start-Sleep -Milliseconds 100
 }while([datetime]::UtcNow -lt $deadline)
 throw 'Installed automatic launch did not create the owned application process'
}
function Assert-StartupReady([ref]$ownedProcess){
 $deadline=[datetime]::UtcNow.AddSeconds(25)
 do{
  if(!(Get-Process -Id $ownedProcess.Value.Id -ErrorAction SilentlyContinue)){$ownedProcess.Value=Find-StartedFluely}
  $process=$ownedProcess.Value
  $report=& "$PSScriptRoot\inspect-windows.ps1" -ProcessId $process.Id -Json|ConvertFrom-Json
  if($report.Windows|Where-Object ClassName -EQ '#32770'){throw 'Installed Fluely showed a startup error dialog'}
  if(@($report.Windows).Count -ge 3 -and (Test-Path -LiteralPath (Join-Path $profile 'chat_preferences.json'))){return}
  Start-Sleep -Milliseconds 200
 }while([datetime]::UtcNow -lt $deadline)
 throw 'Installed Fluely did not initialize its service and shell windows'
}
try{
 if($Kind -eq 'msi'){
  $package=Join-Path $repo "src-tauri\target\release\bundle\msi\Fluely_${version}_x64_en-US.msi"
  $installer=New-Object -ComObject WindowsInstaller.Installer;$db=$installer.OpenDatabase($package,0)
  $view=$db.OpenView('SELECT `Value` FROM `Property` WHERE `Property`=''ProductCode''');$view.Execute();$productCode=$view.Fetch().StringData(1);$view.Close()
  $log=Join-Path $repo "_research\logs\installer-$Kind-$version.log"
  $result=Start-Process msiexec.exe -ArgumentList "/i `"$package`" /qn /norestart ADDLOCAL=MainProgram,Environment INSTALLDIR=`"$destination`" AUTOLAUNCHAPP=1 LAUNCHAPPARGS=`"--fluely-profile $profile`" /L*v `"$log`"" -WindowStyle Hidden -PassThru -Wait
  $installed=$result.ExitCode -eq 0;if(!$installed){throw "MSI install exit $($result.ExitCode)"}
  if(Select-String -LiteralPath $log -Pattern 'Error 2502|Error 2503' -Quiet){throw 'MSI reproduced a Windows Installer permission error'}
 }else{
  $package=Join-Path $repo "src-tauri\target\release\bundle\nsis\Fluely_${version}_x64-setup.exe"
  & icacls.exe $package /setintegritylevel M|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Could not normalize the owned NSIS artifact'}
  $result=Start-Process $package -ArgumentList "/S /NS /R /ARGS --fluely-profile $profile /D=$destination" -WindowStyle Hidden -PassThru -Wait
  $installed=$result.ExitCode -eq 0;if(!$installed){throw "NSIS install exit $($result.ExitCode)"}
 }
 if((Get-Content -LiteralPath (Join-Path $destination 'installed-profile.flag') -Raw).Trim() -ne 'com.clawz1n1n.fluely'){throw 'Installed marker missing'}
 $started=Find-StartedFluely;Assert-StartupReady ([ref]$started)
 Write-Output "$Kind normal-user install and automatic launch passed with an existing migration-3 database"
 Stop-OwnedFluely $started;$started=$null
 # Exercise Windows Shell shortcut launch against the installed executable,
 # while adding only the acceptance profile argument to this private shortcut.
 $shortcutPath=Join-Path $root 'Fluely acceptance.lnk';$shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($shortcutPath)
 $shortcut.TargetPath=Join-Path $destination 'fluely.exe';$shortcut.WorkingDirectory=$destination;$shortcut.Arguments="--fluely-profile $profile";$shortcut.Save()
 Start-Process $shortcutPath -WindowStyle Hidden
 $started=Find-StartedFluely;Assert-StartupReady ([ref]$started)
 Write-Output "$Kind installed Windows Shell shortcut launch passed"
}finally{
 Stop-OwnedFluely $started
 if($installed -and !$UpgradeExisting){
  if($Kind -eq 'msi'){$removed=Start-Process msiexec.exe -ArgumentList "/x $productCode /qn /norestart" -WindowStyle Hidden -PassThru -Wait}
  else{$uninstaller=Join-Path $destination 'uninstall.exe'; & icacls.exe $uninstaller /setintegritylevel M|Out-Null;$removed=Start-Process $uninstaller -ArgumentList "/S _?=$destination" -WindowStyle Hidden -PassThru -Wait}
  if($removed.ExitCode -ne 0){throw "Owned $Kind uninstall exit $($removed.ExitCode)"}
  if(Test-Path -LiteralPath (Join-Path $destination 'fluely.exe')){throw 'Owned installed executable remained after cleanup'}
  Write-Output "$Kind acceptance uninstall passed"
 }
 if(Test-Path -LiteralPath $registryBackup){Remove-ItemProperty 'HKCU:\Software\clawz1n1n\Fluely' -Name InstallDir -ErrorAction SilentlyContinue;& reg.exe import $registryBackup|Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not restore existing installer settings'}}
 if($installed -and $UpgradeExisting){Write-Output 'Existing NSIS installation upgraded; application data preserved; no acceptance uninstall'}
 $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldDebug;$env:FLUELY_DISABLE_ALIAS=$oldAlias
}
