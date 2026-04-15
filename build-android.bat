@echo off
chcp 65001 >nul
echo ==========================================
echo ReadMate Android 一键拉取与打包脚本
echo ==========================================

echo.
echo [1/4] 正在从 GitHub 拉取最新代码...
git pull

echo.
echo [2/4] 正在安装依赖 (npm install)...
call npm install

echo.
echo [3/4] 正在编译前端静态文件 (npm run static-build)...
call npm run static-build

echo.
echo [4/5] 正在同步到 Android 工程 (npm run android-sync)...
call npm run android-sync

echo.
echo [5/5] 正在打开 Android Studio (npm run android-open)...
call npm run android-open

echo.
echo ==========================================
echo 所有准备工作已完成！Android Studio 正在启动...
echo.
echo 接下来，你只需要在 Android Studio 中：
echo 点击 Build -^> Build Bundle(s) / APK(s) -^> Build APK(s)
echo ==========================================
pause
