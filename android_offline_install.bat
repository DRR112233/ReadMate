@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
set "SDK_DIR=%ANDROID_SDK_ROOT%"
if "%SDK_DIR%"=="" set "SDK_DIR=%ANDROID_HOME%"
if "%SDK_DIR%"=="" set "SDK_DIR=D:\Tools\SDK"

set "JAVA_HOME_LOCAL=%JAVA_HOME%"
if "%JAVA_HOME_LOCAL%"=="" if exist "D:\Tools\Android Studio\jbr\bin\java.exe" set "JAVA_HOME_LOCAL=D:\Tools\Android Studio\jbr"
if "%JAVA_HOME_LOCAL%"=="" if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME_LOCAL=C:\Program Files\Android\Android Studio\jbr"

echo ==========================================
echo ReadMate Android Offline Install
echo ==========================================
echo Project: %PROJECT_DIR%
echo SDK: %SDK_DIR%
echo JAVA_HOME: %JAVA_HOME_LOCAL%
echo.

if not exist "%SDK_DIR%\platform-tools\adb.exe" (
  echo [ERROR] adb not found: "%SDK_DIR%\platform-tools\adb.exe"
  pause
  exit /b 1
)

set "PATH=%SDK_DIR%\platform-tools;%SDK_DIR%\emulator;%SDK_DIR%\cmdline-tools\latest\bin;%PATH%"
set "ANDROID_SDK_ROOT=%SDK_DIR%"
set "ANDROID_HOME=%SDK_DIR%"
if not "%JAVA_HOME_LOCAL%"=="" set "JAVA_HOME=%JAVA_HOME_LOCAL%"
if not "%JAVA_HOME_LOCAL%"=="" set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%PROJECT_DIR%"

echo [1/4] Build web assets...
call npm run build
if errorlevel 1 (
  echo [ERROR] npm run build failed.
  pause
  exit /b 1
)

echo [2/4] Sync Android project...
call npx cap sync android
if errorlevel 1 (
  echo [ERROR] npx cap sync android failed.
  pause
  exit /b 1
)

echo [3/4] Check device...
adb devices
echo.

echo [4/4] Install and run offline app...
call npx cap run android
if errorlevel 1 (
  echo [ERROR] npx cap run android failed.
  pause
  exit /b 1
)

echo.
echo Done. This installed build can run without computer connection.
pause
endlocal
