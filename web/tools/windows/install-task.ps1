# Registers a Windows scheduled task that starts the MetaDeck server (run-server.cmd) when the PC boots,
# whether or not anyone is signed in, and keeps it running. Run once from an administrator PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File tools\windows\install-task.ps1
#
# Remove it again with:  Unregister-ScheduledTask -TaskName MetaDeck -Confirm:$false
# See HOSTING.md.

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-server.cmd'
if (-not (Test-Path (Join-Path $PSScriptRoot 'server-env.cmd'))) {
  Write-Warning 'server-env.cmd is missing: copy server-env.example.cmd to server-env.cmd and edit it first.'
  exit 1
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$runner`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U: runs as this user without storing a password; the server needs no network shares.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName 'MetaDeck' -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'MetaDeck game server (tools/windows/run-server.cmd)' -Force | Out-Null
Write-Host 'Registered the MetaDeck task. Start it now with:  Start-ScheduledTask -TaskName MetaDeck'
