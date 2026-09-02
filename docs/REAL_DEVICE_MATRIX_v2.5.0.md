# 今日万象 v2.5.0 LTS 实体设备验收

状态：`PENDING`。桌面自动化不替代实体手机证据。

主入口：`https://zweisamkeit320.github.io/daily-atlas-v23/`  
备用入口：`https://daily-atlas-mobile-cn.pages.dev/`

## v2.4.4 → v2.5.0 同源 A→B

部署前在 GitHub Pages 主入口保留一项收藏、一个偏好和已安装的轻量离线；不要清除网站数据。部署后用同一浏览器、同一 Origin 验证：

1. 诊断页显示 v2.5.0、`LTS 最终功能版`、Service Worker 已接管；
2. 原收藏、偏好和轻量离线状态仍在；
3. 飞行模式完全关闭浏览器后重开，五项可见；
4. 图书、电影、城市各换 5 次，图文最终一致且不是机械顺序；
5. 页面无横向裁切，可滚动到德语和医学；
6. 德语女声按钮实际可听见。

## 安卓六格

| 浏览器 | Wi-Fi | 移动数据 |
|---|---|---|
| 夸克 | `PENDING` | `PENDING` |
| vivo 系统浏览器 | `PENDING` | `PENDING` |
| 微信内置浏览器 | `PENDING` | `PENDING` |

每格记录首页、诊断版本／SW、三类换项、滚动、德语听声、持久化和断网重开。遇到异常先保存浏览器名称和版本、网络、完整网址、诊断摘要与截图，不先清除站点数据。

Android Chrome：`BLOCKED — 当前设备未安装 Chrome`  
iPhone Safari：`BLOCKED — 当前没有 iPhone`

Cloudflare 是不同 Origin，本地收藏不会与 GitHub 自动互通；该差异不是数据丢失。备用入口至少完成夸克 Wi-Fi／移动数据的核心、音频和离线检查。
