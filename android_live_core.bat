@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "LOG_DIR=%PROJECT_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

set "LOG_FILE=%LOG_DIR%\android-live-debug.log"
echo.>"%LOG_FILE%"
set "DEBUG_LOG=%LOG_DIR%\debug-349aa7.log"

set "RUN_ID=%date%_%time%"
set "RUN_ID=%RUN_ID: =0%"
set "RUN_ID=%RUN_ID:/=-%"
set "RUN_ID=%RUN_ID::=-%"
set "RUN_ID=%RUN_ID:.=-%"

set "DEV_LOG=%LOG_DIR%\dev-%RUN_ID%.log"
set "ANDROID_LOG=%LOG_DIR%\android-%RUN_ID%.log"

echo __RUN__%RUN_ID%__ENTER__ projectDir=%PROJECT_DIR%>>"%DEBUG_LOG%"

echo ==========================================
echo ReadMate Android Live Launcher
echo ==========================================
echo [%date% %time%] start>>"%LOG_FILE%"
echo PROJECT_DIR=%PROJECT_DIR%>>"%LOG_FILE%"
if not exist "%PROJECT_DIR%\package.json" (
  echo.
  echo ERROR: package.json not found. Please run this script from repo root.
  echo PROJECT_DIR=%PROJECT_DIR%
  echo.
  echo Log file:
  echo %LOG_FILE%
  echo __RUN__%RUN_ID%__ABORT__MISSING_PACKAGE_JSON__>>"%DEBUG_LOG%"
  pause
  exit /b 3
)

echo [1/3] Collect env info...
where adb>>"%LOG_FILE%" 2>&1
echo __RUN__%RUN_ID%__AFTER_WHERE_ADB__ errorLevel=%ERRORLEVEL%>>"%DEBUG_LOG%"
adb devices>>"%LOG_FILE%" 2>&1
echo __RUN__%RUN_ID%__AFTER_ADB_DEVICES__ errorLevel=%ERRORLEVEL%>>"%DEBUG_LOG%"
echo __CHECKPOINT__AFTER_ADB_DEVICES__>>"%DEBUG_LOG%"
where node>>"%LOG_FILE%" 2>&1
where npm>>"%LOG_FILE%" 2>&1
node -v>>"%LOG_FILE%" 2>&1
npm -v>>"%LOG_FILE%" 2>&1
echo __RUN__%RUN_ID%__AFTER_NPM_V__ errorLevel=%ERRORLEVEL%>>"%DEBUG_LOG%"
echo __CHECKPOINT__AFTER_NPM_V__>>"%DEBUG_LOG%"

echo [1.5/3] Resolve adb...
set "ADB_EXE="
where adb >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  set "ADB_EXE=adb"
) else (
  if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platform-tools\adb.exe" set "ADB_EXE=%ANDROID_SDK_ROOT%\platform-tools\adb.exe"
  if not defined ADB_EXE if defined ANDROID_HOME if exist "%ANDROID_HOME%\platform-tools\adb.exe" set "ADB_EXE=%ANDROID_HOME%\platform-tools\adb.exe"
  if not defined ADB_EXE if exist "D:\Tools\SDK\platform-tools\adb.exe" set "ADB_EXE=D:\Tools\SDK\platform-tools\adb.exe"
)
echo __RUN__%RUN_ID%__ADB_RESOLVED__ adbExe=%ADB_EXE% sdkRoot=%ANDROID_SDK_ROOT% home=%ANDROID_HOME%>>"%DEBUG_LOG%"

if not defined ADB_EXE (
  echo.
  echo ERROR: adb not found in PATH.
  echo - Set ANDROID_SDK_ROOT or ANDROID_HOME, or add platform-tools to PATH.
  echo.
  echo See log file for details:
  echo %LOG_FILE%
  echo __RUN__%RUN_ID%__ABORT__MISSING_ADB__>>"%DEBUG_LOG%"
  pause
  exit /b 2
)

echo [2/3] Start web dev window...
echo DEV_LOG=%DEV_LOG%>>"%LOG_FILE%"
start "ReadMate Dev Server" cmd /v:on /k ^
  "cd /d ""%PROJECT_DIR%"" ^&^& (echo ===== [%date% %time%] dev server start =====) ^&^& ^
   (npm run dev -- --host 0.0.0.0 --port 3000 2^>^&1 ^| powershell -NoProfile -Command ""Tee-Object -FilePath '%DEV_LOG%' -Append"")"
echo __RUN__%RUN_ID%__START_DEV_WINDOW__ errorLevel=%ERRORLEVEL%>>"%DEBUG_LOG%"

echo [3/3] Start android live window...
echo ANDROID_LOG=%ANDROID_LOG%>>"%LOG_FILE%"
start "ReadMate Android Live" cmd /v:on /k ^
  "cd /d ""%PROJECT_DIR%"" ^&^& (echo ===== [%date% %time%] android live start =====) ^&^& ^
   (""%ADB_EXE%"" reverse tcp:3000 tcp:3000 2^>^&1 ^| powershell -NoProfile -Command ""Tee-Object -FilePath '%ANDROID_LOG%' -Append"") ^&^& ^
   (npm exec -- cap run android -l --host localhost --port 3000 2^>^&1 ^| powershell -NoProfile -Command ""Tee-Object -FilePath '%ANDROID_LOG%' -Append"")"
echo __RUN__%RUN_ID%__START_ANDROID_WINDOW__ errorLevel=%ERRORLEVEL%>>"%DEBUG_LOG%"

echo.
echo Opened windows:
echo - ReadMate Dev Server
echo - ReadMate Android Live
echo.
echo Log file:
echo %LOG_FILE%
echo Dev log:
echo %DEV_LOG%
echo Android log:
echo %ANDROID_LOG%
echo __RUN__%RUN_ID%__BEFORE_PAUSE__>>"%DEBUG_LOG%"

pause
exit /b 0
