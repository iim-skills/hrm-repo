@echo off
echo Starting Weekly HRM Database Backup...
cd /d "%~dp0..\..\"
call npx tsx src/scripts/backup_db.ts
echo Backup process finished.
