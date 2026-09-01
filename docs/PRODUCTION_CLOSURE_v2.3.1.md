# 今日万象 v2.3.1 上线收口执行单

> 历史记录：本文件只描述 v2.3.1 的发布候选、回退和人工步骤，不是当前 v2.4.x 的部署说明。

本文件把已经由代码和自动测试完成的事项，与必须在 Cloudflare 账号或实体手机上完成的事项分开。只有真实结果可以写成 PASS；截图、桌面模拟和计划不能替代真机。

## 1. 发布边界

- `v2.3.0-r5` 保持冻结，只作为同源更新测试的 A 版本；不要覆盖它的 ZIP、清单或 SHA-256 sidecar。当前重新计算的静态 ZIP SHA-256 为 `2E8D818A8266AB670454C928348D7BA13907336C9E711FF9FD5C9280DA4391EE`，与 sidecar 一致。
- `v2.3.1-r3` 在真实 Pages 的 Service Worker 激活后重开测试中失败，已经回退且不得再次上线。`v2.3.1-r4` 是修复同源 308 导航响应缓存问题的新候选，静态 ZIP SHA-256 为 `80162CCAB505CE9BF31CCE00877AF6BC238BE2133AD080E5A1BAB136C908F9EB`；只有非生产 A→r4 与独立严格审查通过后才能上线。`r1`、`r2`、`r3` 均已被取代。
- 当前候选定位为个人／非商业公开测试。IMDb 非商业数据集不能据此自动获得商业授权；正式商业运营前应取得许可或替换相关评分数据。
- 医学自动复核覆盖全部 caution／urgent 条目，但不是医生签名。正式医学专业签署仍需合格医学编辑逐条核对 74 条 urgent 队列及对应来源。

## 2. Cloudflare 最终 Origin（需要账号持有人操作）

### 方案 A：沿用控制台上传

1. 解压通过审查的 `daily-atlas-static-v2.3.1-r4-*.zip`。进入解压后的 `daily-atlas-static` 文件夹，确认它的第一层直接包含 `index.html`、`_headers`、`sw.js`、`public-config.js`、`privacy.html` 和 `sources-and-licenses.html`；不要上传外层父文件夹造成路径多套一层。
2. 登录 Cloudflare，进入 **Workers & Pages → daily-atlas-mobile-cn → Deployments（部署） → New deployment（新部署）**。
3. 选择静态素材上传，把上一步的 `daily-atlas-static` 文件夹整体拖入。确认文件列表中能看到无扩展名的 `_headers`；若看不到，停止上传，改用下方 Wrangler 方案。
4. 提交部署，保持 Pages 项目和 `pages.dev` Origin 不变。不要新建另一个生产项目，否则 A→B 将不再是同源测试。
5. 部署完成后不要立刻清手机站点数据；先按第 4 节核验在线版本与响应头。

### 方案 B：Wrangler（控制台未带上 `_headers` 时使用）

在发布目录新建 `wrangler.jsonc`，其中 `assets.directory` 指向刚解压的静态目录：

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "daily-atlas",
  "compatibility_date": "2026-08-29",
  "workers_dev": true,
  "assets": {
    "directory": "./daily-atlas-static"
  }
}
```

然后在该发布目录运行：

```powershell
npx wrangler login
npx wrangler deploy --config .\wrangler.jsonc
```

浏览器会打开 Cloudflare 授权页。只需授权自己的账号，不要把 API Token、Cookie 或 Claim URL 发给任何人。官方说明：Workers Static Assets 会读取静态目录中的 `_headers`；若使用 Worker 脚本生成响应，则 `_headers` 不会自动作用于脚本响应。本项目应保持纯静态素材路径。参考：[Workers Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/) 与 [Static Assets get started](https://developers.cloudflare.com/workers/static-assets/get-started/)。

## 3. A→B 的部署顺序

必须使用同一个 `https://…pages.dev` 或同一个自定义域名。

1. A 阶段：部署冻结的 `daily-atlas-static-v2.3.0-r5-*.zip`；在 Android Chrome 和 iPhone Safari 打开，收藏一个条目、设置一个偏好、准备轻量离线，记录 A 的 ZIP SHA-256、在线 `sw.js` SHA-256 和截图。
2. B 阶段：不清除手机站点数据，将同一 Pages Origin 更新为通过审查的 `daily-atlas-static-v2.3.1-r4-*.zip`。
3. 两台手机都关闭该 Origin 的其他标签页后重开，等待更新提示；由用户点击切换。
4. 核对 B 的公开安全横幅、隐私页、来源页和诊断摘要；确认 A 的收藏与偏好仍在。
5. 打开飞行模式，关闭并重开主屏入口，确认 B 轻量壳可用。若 B 安装失败，A 仍应可打开。
6. 把 Android 与 iPhone 的结果分别写入 `REAL_DEVICE_MATRIX.md`，不要合并成一个“手机通过”。

## 4. 最终 Origin 在线核验

把地址替换为实际 Origin，尾部不要附加页面路径：

```powershell
$origin = "https://daily-atlas-mobile-cn.pages.dev"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/diagnostics.html"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/privacy.html"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/sources-and-licenses.html"
curl.exe -sS "$origin/public-config.js"
```

Cloudflare Static Assets 默认可能把 `*.html` 同源 307 重定向到无扩展名规范地址，例如 `/privacy.html` → `/privacy`。这是正常的 HTML 处理行为；`-L` 会跟随它。只接受同一 Origin 内的重定向，并核对 `FINAL=200` 和最终 URL；跨 Origin 重定向应停止验收并查明配置。

正式记录 PASS 时应运行随源码包提供的逐跳验证器，而不是只看 `curl -L` 的最终 URL：

```powershell
.\scripts\verify-origin.ps1 -Origin $origin -StaticDirectory "C:\完整路径\daily-atlas-static"
```

验证器禁用不透明的自动跟随，最多逐步处理 5 次 301／302／303／307／308；每一跳的 scheme 与 authority 都必须和初始 Origin 相同。安全响应头只从最终 200 的响应读取，在线 `sw.js` 和 `public-config.js` 的 SHA-256 下载也复用同一逐跳规则。任一检查失败时脚本 exit 非 0，不能把人工看到的最终页面替代为 PASS。

上线通过标准：

- 四个页面请求跟随允许的同源规范化重定向后均为 `FINAL=200`，`public-config.js` 直接 HTTP 200；
- 首页响应含 `Content-Security-Policy`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Strict-Transport-Security`；
- CSP 的 `img-src` 只能是 `'self' data:`，不能含 `https:`；
- `public-config.js` 显示 `appVersion: "2.3.1"`、`publicSafeMode: true`、`remoteBookMovieImages: false`；
- 浏览器访问 `diagnostics.html` 时，页面报告“公开安全素材模式：已启用”和“远程书封／海报：已禁用”；
- 在线 `sw.js`、`public-config.js` 和本地 B 静态目录对应文件的 SHA-256 一致。

如果安全响应头缺失，不能把“页面能打开”写成最终 Origin PASS。先确认 `_headers` 位于上传静态目录第一层，重新部署并复测。

## 5. 八格真机

按 `REAL_DEVICE_MATRIX.md` 对以下组合逐格执行：

| 实体环境 | Wi-Fi | 移动数据 |
|---|---|---|
| Android Chrome | 待实测 | 待实测 |
| Android 夸克 | 待实测 | 待实测 |
| 微信内置浏览器 | 待实测 | 待实测 |
| iPhone Safari | 待实测 | 待实测 |

每格至少保存：设备／系统／浏览器精确版本、网络、诊断摘要、首屏与五卡、搜索、声音手势、轻量与完整离线、备份、公开安全素材、添加主屏或平台边界、截图／录像文件名和失败最小复现。

## 6. 医学人工复核步骤

打开 `data/MEDICAL_HIGH_RISK_REVIEW_v2.3.1.md`，由合格医学编辑逐条处理 74 条 urgent 队列：

1. 打开卡片所列官方来源，记录复核日期和页面标题；若页面迁移，保存新的官方 URL，不使用博客或搜索摘要替代。
2. 对照标题、摘要、行动建议和警示边界，特别检查急救时机、用药措辞、儿童／孕产妇／老年人、毒物暴露和心理危机表达。
3. 确认没有把一般科普写成诊断，没有给出脱离情境的个体化剂量，也没有把国外电话号码冒充全球通用号码。
4. 在人工状态列填写 `PASS + 姓名/资质/日期` 或 `REVISION REQUIRED + 原因`。如需修改内容，修改后必须重跑 `npm run review:medical` 和完整测试，再重新冻结 B 包。

在这一列全部完成前，可写“自动专项复核通过、人工专业签署待完成”，不能写“医学专业复核全部通过”。
