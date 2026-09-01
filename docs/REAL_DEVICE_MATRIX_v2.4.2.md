# 今日万象 v2.4.2 真机验收矩阵

本矩阵只接收实体设备结果。桌面浏览器、响应式视口、Playwright 和网络限速模拟不能代填实体手机或运营商网络。

## 当前状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 候选版本 | `v2.4.2` | 可靠性与维护收口版 |
| 最终 Origin | `NOT_RUN` | 生成并验证精确静态包后再填写 |
| Android 夸克／Wi-Fi | `NOT_RUN` | 不继承 v2.4.1 结果 |
| Android 夸克／移动数据 | `NOT_RUN` | 不继承 v2.4.1 结果 |
| Android vivo／Wi-Fi | `NOT_RUN` | 不继承 v2.4.1 结果 |
| Android vivo／移动数据 | `NOT_RUN` | 不继承 v2.4.1 结果 |
| Android 微信／Wi-Fi | `NOT_RUN` | 不继承 v2.4.1 结果 |
| Android 微信／移动数据 | `NOT_RUN` | 不继承 v2.4.1 结果 |
| iPhone Safari／Wi-Fi | `BLOCKED` | 当前用户没有 iPhone 设备 |
| iPhone Safari／移动数据 | `BLOCKED` | 当前用户没有 iPhone 设备 |
| Android 同源 A→B | `NOT_RUN` | 需先部署同一 Origin 的 A 与 B |
| iPhone 同源 A→B | `BLOCKED` | 当前用户没有 iPhone 设备 |

## 每格最低步骤

1. 打开最终 HTTPS 首页和同源诊断页；记录浏览器版本、网络、完整 URL 和时间。
2. 确认诊断页应用版本、Service Worker 控制状态和关键文件结果；外部图源检测保持用户主动触发。
3. 图书、电影、城市各换五次，核对文字与图片身份一致、页面无横向裁切且可滚动到德语与医学。
4. 收藏一项、修改一个偏好、完成轻量离线，完全关闭浏览器后重开，确认数据保留。
5. 飞行模式重开，确认轻量壳与已缓存内容可用；恢复网络后再次换项。
6. 遇到异常时先复制诊断摘要，不先清除网站数据。

跨 Origin 的收藏和缓存不会自动互通；迁移必须使用应用内 JSON 导出／导入。
