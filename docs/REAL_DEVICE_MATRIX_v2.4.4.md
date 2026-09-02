# v2.4.4 实体设备与同源 A→B 验收矩阵

当前状态：`NOT_RUN`。本表只记录 v2.4.4 部署后的真实结果；桌面 Playwright、已有 v2.4.3 结论和其他 Origin 的状态不能填入 PASS。

## Android 六格

| 浏览器 | GitHub Pages Wi-Fi | GitHub Pages 移动数据 | 证据 |
|---|---|---|---|
| 夸克 | NOT_RUN | NOT_RUN | 待部署后执行 |
| vivo 系统浏览器 | NOT_RUN | NOT_RUN | 待部署后执行 |
| 微信内置浏览器 | NOT_RUN | NOT_RUN | 待部署后执行 |

Cloudflare Pages 作为备用 Origin，至少在夸克 Wi-Fi 与移动数据各执行一次完整路径；若网络无法到达但 GitHub 主入口正常，记录 `BLOCKED — CLOUDFLARE_ORIGIN_NETWORK`。

Android Chrome：`BLOCKED — 当前设备没有 Chrome`。  
iPhone Safari：`BLOCKED — 当前没有 iPhone`。

## 每格步骤

1. 打开首页和诊断页，确认版本 v2.4.4、Service Worker 已接管、关键同源文件通过。
2. 图书、电影、城市各换 5 次；图文最终一致，不保留上一项目图片，不机械顺序递增。
3. 确认卡片显示“同源开放许可图片”“第三方渐进图片”或“本地编辑视觉”之一，且状态与实际呈现一致。
4. 页面无横向裁切，可滚到德语和医学；德语女声按钮实际有声音。
5. 收藏一项、修改偏好、启用轻量离线，完全关闭浏览器并从后台划掉后重开，确认数据保留。
6. 开启飞行模式并重开，确认五项页面可见；恢复网络后仍可继续换项。

## v2.4.3 → v2.4.4 同源 A→B

部署前在同一 GitHub Origin 保存：一个收藏、一个偏好、轻量离线状态、离线重开截图或文字记录。部署 v2.4.4 后：

- 完全关闭浏览器并重开同一 Origin；
- 确认 v2.4.4 与 Service Worker 已接管；
- 确认原收藏、偏好和轻量离线状态保留；
- 飞行模式重开后仍能看到五项；
- 不清除站点数据，不切换 Origin。

Cloudflare Pages 使用自己的 Origin 单独执行 A→B；不同 Origin 之间的数据差异不算丢失。

