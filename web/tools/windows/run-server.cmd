@echo off
rem Keeps the MetaDeck server running: starts it, and starts it again whenever it exits (a crash, or
rem `npm run maintenance` after an update). Settings come from server-env.cmd next to this file.
rem Run it by hand, or at startup with install-task.ps1 (see HOSTING.md).

setlocal
cd /d "%~dp0..\.."
if exist "%~dp0server-env.cmd" call "%~dp0server-env.cmd"

:loop
echo [%date% %time%] Starting MetaDeck
node serve.mjs
echo [%date% %time%] MetaDeck exited with code %errorlevel%; restarting in 5 seconds
timeout /t 5 /nobreak >nul
goto loop
