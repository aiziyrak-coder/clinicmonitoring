@echo off
REM ============================================================
REM Universal deploy — har doim Python orqali ishlaydi (boshqa
REM dastur .py ni ochmasin). Ishlatish:
REM   RUN_DEPLOY_ANY.bat --list
REM   RUN_DEPLOY_ANY.bat clinicmonitoring
REM   RUN_DEPLOY_ANY.bat onlinetest
REM
REM Parol: set DEPLOY_PASS=parolingiz  yoki  quyidagi qatorni yoqing:
REM ============================================================
chcp 65001 >nul 2>&1
cd /d "%~dp0"

if "%DEPLOY_PASS%"=="" (
  echo.
  echo DEPLOY_PASS bo'sh. SSH parolini kiriting ^(yoki CMD oldidan: set DEPLOY_PASS=...^):
  set /p "DEPLOY_PASS=Parol: "
)

set "PYEXE="
where py >nul 2>&1 && set "PYEXE=py -3"
if not defined PYEXE where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
  echo [XATO] Python topilmadi. Python 3 o'rnating yoki PATH ga qo'shing.
  pause
  exit /b 1
)

echo.
echo Ishlatilmoqda: %PYEXE% deploy_any.py %*
echo.

%PYEXE% "%~dp0deploy_any.py" %*
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo [XATO] chiqish kodi: %EC%
  pause
)
exit /b %EC%
