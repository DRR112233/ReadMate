@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
set "SDK_DIR=%ANDROID_SDK_ROOT%"
if "%SDK_DIR%"=="" set "SDK_DIR=%ANDROID_HOME%"
if "%SDK_DIR%"=="" set "SDK_DIR=D:\Tools\SDK"

set "JAVA_HOME_LOCAL=%JAVA_HOME%"
if "%JAVA_HOME_LOCAL%"=="" if exist "D:\Tools\Android Studio\jbr\bin\java.exe" set "JAVA_HOME_LOCAL=D:\Tools\Android Studio\jbr"
if "%JAVA_HOME_LOCAL%"=="" if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME_LOCAL=C:\Program Files\Android\Android Studio\jbr"

echo ==========================================
echo ReadMate Android 一键热更新调试
echo ==========================================
echo 项目目录: %PROJECT_DIR%
echo Android SDK: %SDK_DIR%
echo JAVA_HOME: %JAVA_HOME_LOCAL%
echo.

if not exist "%SDK_DIR%\platform-tools\adb.exe" (
  echo [错误] 未找到 adb: "%SDK_DIR%\platform-tools\adb.exe"
  echo 请确认 SDK 路径后重试。
  pause
  exit /b 1
)

set "PATH=%SDK_DIR%\platform-tools;%SDK_DIR%\emulator;%SDK_DIR%\cmdline-tools\latest\bin;%PATH%"
set "ANDROID_SDK_ROOT=%SDK_DIR%"
set "ANDROID_HOME=%SDK_DIR%"

if not "%JAVA_HOME_LOCAL%"=="" (
  set "JAVA_HOME=%JAVA_HOME_LOCAL%"
  set "PATH=%JAVA_HOME%\bin;%PATH%"
)

echo [1/4] 检查 ADB...
adb version
echo.

echo [2/4] 当前设备列表...
adb devices
echo.

echo [3/4] 启动前端开发服务窗口（3000端口）...
start "ReadMate Dev Server" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev -- --host 0.0.0.0 --port 3000"

echo [4/4] 启动安卓 Live Reload 窗口（强制 localhost:3000）...
start "ReadMate Android Live" cmd /k "cd /d "%PROJECT_DIR%" && set ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT% && set ANDROID_HOME=%ANDROID_HOME% && set JAVA_HOME=%JAVA_HOME% && set PATH=%PATH% && adb reverse tcp:3000 tcp:3000 && npx cap run android -l --host localhost --port 3000"

echo.
echo 已打开两个窗口：
echo   A. ReadMate Dev Server（保持运行）
echo   B. ReadMate Android Live（构建并启动应用）
echo.
echo 如果设备显示 unauthorized，请先在手机上点“允许 USB 调试”。
echo ==========================================
endlocal
