@rem Settings for run-server.cmd. Copy this file to server-env.cmd (which git ignores) and edit it.
@rem See HOSTING.md for what each one does.

@rem Where the database, logs and admin token live. Keep it OUTSIDE OneDrive.
set DATA_DIR=C:\MetaDeckData

@rem Nightly copies of the database. Inside OneDrive is fine (and gives you an offsite copy).
set BACKUP_DIR=%USERPROFILE%\OneDrive\MetaDeck backups
set BACKUP_DAYS=14

@rem The game is reached through Cloudflare Tunnel, so trust its headers for each player's address.
set TRUST_PROXY=1

set PORT=5173
