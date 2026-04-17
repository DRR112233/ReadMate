# Android（手动命令备忘）

> 目的：不依赖任何脚本，手动完成 **Re-link 手机** + **热更新（Live Reload）** + **打包前同步**。

## 0. 一次性环境（建议）

### SDK / adb（任选其一）

- 方式 A：设置系统环境变量
  - `ANDROID_SDK_ROOT=D:\Tools\SDK`
  - `ANDROID_HOME=D:\Tools\SDK`

- 方式 B：在 `android/local.properties` 写入（本文件不要提交 git）

```
sdk.dir=D\:\\Tools\\SDK
```

### JDK（Gradle/AGP 需要）

（如果你用 Android Studio 自带 JDK）

- `org.gradle.java.home=D:\\Tools\\Android Studio\\jbr`
  - 文件位置：`android/gradle.properties`

## 1) Re-link this phone（重新授权/重新连接）

在 **cmd** 里执行：

```bat
adb kill-server
adb start-server
adb devices
```

目标：设备状态为 `device`（不是 `unauthorized`）。

## 2) 热更新（Live Reload）

### 终端 A：启动 dev server（3000）

在仓库根目录：

```bat
npm run dev -- --host 0.0.0.0 --port 3000
```

### 终端 B：端口反向映射 + 跑 Android

```bat
adb reverse --remove-all
adb reverse tcp:3000 tcp:3000
adb reverse --list
```

然后：

```bat
npx cap run android -l --host localhost --port 3000
```

## 3) 打包/发版前（同步 Android 工程）

```bat
npm run static-build
npx cap sync android
```

