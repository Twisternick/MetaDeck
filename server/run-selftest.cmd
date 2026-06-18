@echo off
REM Runs the in-process self-test (lobby + match + deck checks). Stop the live server first
REM (it binds the same port). Window stays open so you can read the results.
cd /d "%~dp0MetaDeck.Server"
dotnet run -c Debug -- selftest
echo.
pause
