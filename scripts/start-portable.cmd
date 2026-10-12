@echo off
setlocal
set "PLUELY_DATA_DIR=%~dp0profile"
if /i "%~1"=="--wait" goto wait
start "" "%~dp0pluely.exe"
exit /b 0
:wait
"%~dp0pluely.exe"
exit /b %errorlevel%
