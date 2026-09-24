@echo off
cd /d "%~dp0"
call yarn dev --host 127.0.0.1 --open
if errorlevel 1 pause
