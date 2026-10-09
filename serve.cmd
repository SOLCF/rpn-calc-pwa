@echo off
rem Starts the dev server (http://localhost:8765/). Close this window to stop it.
cd /d "%~dp0"
py tools\devserver.py
pause
