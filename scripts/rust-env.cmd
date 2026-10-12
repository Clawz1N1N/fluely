@echo off
set VSLANG=1033
if defined VSCMD_VER goto run
if exist "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" (
  call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" 10.0.22621.0
) else (
  echo Visual Studio developer environment is unavailable.
  exit /b 1
)
if errorlevel 1 exit /b %errorlevel%
:run
%*
exit /b %errorlevel%
