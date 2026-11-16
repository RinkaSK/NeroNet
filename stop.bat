@echo off
rem Stop NeroNet normally.
setlocal
set "NERONET_LAUNCHER=1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-NeroNet.ps1" %*
set "NERONET_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %NERONET_EXIT%
