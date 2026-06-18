@echo off
REM Starts the MetaDeck authoritative server (ws://localhost:8123/). Press Ctrl+C to stop.
cd /d "%~dp0MetaDeck.Server"
dotnet run -c Debug
