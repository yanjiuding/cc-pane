# CC-Panes Mobile

CC-Panes 的 Flutter 移动客户端（Android 先行，iOS 二期）——远程连接桌面端 `cc-panes-web` 服务器，查看和操作运行中的 Claude Code 终端会话。

## 架构

移动端是纯客户端，复用桌面端 `cc-panes-web`（axum）暴露的 REST + WebSocket 契约：

- REST：`/api/auth/*`（Cookie 会话登录）、`/api/sessions`（会话 CRUD、write/submit/resize/snapshot）
- WS：`/ws/{sessionId}` 文本 JSON 帧（`output`/`exit` 下行，`input`/`resize` 上行）
- 鉴权：`ccp_web_session` HttpOnly Cookie，由 `cookie_jar` 持久化，WS 握手复用

```
lib/
├── core/     Result<T,ApiFailure>（对齐后端 AppResult 风格）、常量
├── api/      dio + PersistCookieJar 客户端、auth/sessions API 封装
├── models/   ServerProfile / AuthStatus / SessionInfo（手写 fromJson）
├── state/    riverpod：server_store（secure storage 持久化）、auth_controller（静默重登）、sessions_controller（5s 轮询）
└── ui/       connect / session_list 屏幕（Phase 2 加 terminal）
```

## 开发

前置：Flutter SDK（≥3.5）、Android SDK + adb、真机或模拟器。

```bash
flutter pub get
flutter analyze
flutter test
flutter run              # 连接的设备/模拟器
```

## 连接桌面端

1. 桌面端 CC-Panes 设置 → Web 访问：启用「账号密码登录」+ 设置密码 + 「允许局域网访问」；
   若开了「远程只读模式」，还需开子开关「允许已登录的远程会话写入」才能在手机上操作终端。
2. 放行 Windows 防火墙 18080 入站。
3. 手机连同一局域网，App 中填 `http://<Windows IP>:18080` + 账号密码。
4. Tailscale 路径：桌面端 `tailscale serve --bg --https=443 http://127.0.0.1:18080`，App 填 `https://<host>.ts.net`。

调试捷径（仅 UI 迭代，来源判 Local 会掩盖只读问题）：
- 模拟器：`http://10.0.2.2:18080`
- 真机 USB：`adb reverse tcp:18080 tcp:18080` 后连 `http://127.0.0.1:18080`

## 分期

- [x] Phase 1：登录 + 会话列表（新建/关闭/状态轮询）
- [ ] Phase 2：xterm 终端渲染 + WS 输入 + 快捷键条
- [ ] Phase 3：断线重连 / 401 静默重登打磨 / 多服务器 UI / 设置页
- [ ] Phase 4：iOS 适配 + TestFlight
