@echo off
chcp 65001 >nul
cd /d "%~dp0"
PowerShell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_windows.ps1"
echo.
echo [SkillForge] The program ended. Check any error messages above.
pause
