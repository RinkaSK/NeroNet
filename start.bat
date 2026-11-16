@echo off
rem Start NeroNet. Log in to the bot QQ first. Data is kept in the data folder beside this file.
setlocal
set "NERONET_LAUNCHER=1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-NeroNet.ps1" %*
set "NERONET_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %NERONET_EXIT%
