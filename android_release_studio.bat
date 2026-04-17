@echo off
setlocal
chcp 65001 >nul

echo ==========================================
echo ReadMate Android Release (Android Studio)
echo ==========================================

echo.
echo [1/5] Pull latest code...
git pull

echo.
echo [2/5] Install dependencies...
call npm install

echo.
echo [3/5] Build web assets...
call npm run static-build

echo.
echo [4/5] Sync Android project...
call npm run android-sync

echo.
echo [5/5] Open Android Studio...
call npm run android-open

echo.
echo ==========================================
echo Done. Build your release APK/AAB in Android Studio.
echo ==========================================
pause
endlocal
