# ReadMate 安卓一键热更新调试

本文档用于记录本项目在 Windows + 安卓真机环境下的稳定调试流程，避免环境问题反复踩坑。

## 一键启动（推荐）

在项目根目录执行：

```bat
npm run android:live
```

该命令会调用 `run-android-live.bat`，自动完成：

- 设置 `ANDROID_SDK_ROOT` / `ANDROID_HOME`（默认优先用已有环境变量，否则回退到 `D:\Tools\SDK`）
- 自动尝试使用 Android Studio 自带 JBR 作为 `JAVA_HOME`（需要 JDK 21）
- 检查 `adb` 并输出设备列表
- 强制使用 `localhost:3000`（通过 USB `adb reverse`），避免命中 `169.254.*` 不可达地址
- 打开两个窗口：
  - `ReadMate Dev Server`：运行前端开发服务
  - `ReadMate Android Live`：执行 `adb reverse` + `npx cap run android -l --host localhost --port 3000`

## 手动流程（故障排查用）

### 1) 设备连接

```bat
adb devices
```

- 设备状态应为 `device`
- 若为 `unauthorized`，在手机上允许 USB 调试

### 2) 启动开发服务

```bat
npm run dev -- --host 0.0.0.0 --port 3000
```

### 3) 启动安卓 Live Reload

```bat
adb reverse tcp:3000 tcp:3000
npx cap run android -l --host localhost --port 3000
```

### 4) 看到 `App running with live reload listing for: http://localhost:3000`

这是正确状态。如果出现 `169.254.*` 之类地址，请改用上面的强制参数命令。

## 常见问题

### A. `ERR_SDK_NOT_FOUND`

说明没有识别到 Android SDK，检查：

- `ANDROID_SDK_ROOT` 是否有效
- `D:\Tools\SDK\platform-tools\adb.exe` 是否存在

### B. `Cannot find a Java installation ... languageVersion=21`

Gradle 需要 JDK 21。建议使用 Android Studio 自带 JBR：

- `D:\Tools\Android Studio\jbr`

验证：

```bat
java -version
```

### C. `adb devices` 为空

- 检查 USB 线是否支持数据传输（不是仅充电线）
- 手机 USB 模式切换为“文件传输”
- 重新插拔并允许调试授权

## 本地环境建议

- SDK 路径：`D:\Tools\SDK`
- ADB 路径：`D:\Tools\SDK\platform-tools\adb.exe`
- Android Studio：`D:\Tools\Android Studio`
- JDK（推荐）：`D:\Tools\Android Studio\jbr`
