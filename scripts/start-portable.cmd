@echo off
setlocal
set "FLUELY_DATA_DIR=%~dp0profile"
if /i "%~1"=="--wait" goto wait
start "" "%~dp0fluely.exe" --fluely-profile "%~dp0profile"
exit /b 0
:wait
"%~dp0fluely.exe" --fluely-profile "%~dp0profile"
exit /b %errorlevel%
