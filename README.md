# 今日万象 v2.5.0 LTS：最终功能版

这是一个无后端、无账号的静态网页应用。它每天在同一页面给出一本书、一部电影、一座城市、一条德语知识和一则医学科普；每张卡都可以单独更换、标记已了解、喜欢、收藏或“不适合我”。同一本机、同一浏览器在同一天会得到稳定结果。

## v2.5.0 LTS 内容库与最终范围

| 类型 | 精确数量 | 主要范围 |
|---|---:|---|
| 图书 | 500 | 历史／悬疑／科幻；编辑精选、编辑复核与证据复核三级候选 |
| 电影 | 500 | 历史／悬疑／科幻；编辑精选、编辑复核与证据复核三级候选 |
| 城市 | 200 | 世界 7 个区域，含静态导览与按需天气所需坐标、时区 |
| 德语 | 500 | A1、A2、B1、B2 各 125 条；词汇／表达／语法 170／170／160 |
| 医学 | 500 | 12 个主题组；一般科普、行动建议、适用边界或警示、官方来源、24 张本地主题插图 |

当前五池总计 2,200 条。数量、唯一 ID、字段、来源、评分门槛、主题覆盖和本地素材都由构建脚本校验；机器可读的详细记录见 `data/CATALOG_AUDIT.md` 和 `data/catalog.source.json`。

v2.5.0 LTS 继承 v2.4.4 已完成的弱网、移动视觉和长期稳定路径，不改变候选池、推荐逻辑、用户数据结构或备份格式。公开版的书与电影在主卡、详情预览和探索结果中使用明确标注的本地编辑视觉，不请求第三方书封或海报；城市继续显示逐项复核、同源发布的开放许可风貌图。城市图片只有在完成解码且仍属于当前条目后才显示，失败会回到当前条目的本地编辑视觉。诊断页同时显示 `LTS 最终功能版` 和“功能冻结，仅维护修复”。

本版本是每日五项推荐功能的最终功能基线。发布后只处理可复现核心故障、安全／兼容性、来源许可、危险内容与可访问性阻断，不再持续扩充功能或内容规模。完整范围见 [`docs/LTS_POLICY_v2.5.0.md`](docs/LTS_POLICY_v2.5.0.md)，发布与维护证据见 [`docs/RELEASE_v2.5.0.md`](docs/RELEASE_v2.5.0.md) 和 [`docs/MAINTENANCE_v2.5.0.md`](docs/MAINTENANCE_v2.5.0.md)。项目自身使用许可和第三方通知见 [`LICENSE.txt`](LICENSE.txt) 与 [`NOTICE.txt`](NOTICE.txt)。

这里需要先说明一个重要边界：图书和电影各 500 条并不等于开发者逐本通读或逐部完整观看。每类保留原有 50 条 `editorial-curated` 编辑精选和 150 条 `editorial-reviewed` 编辑复核条目；再增加 300 条 `evidence-reviewed`，根据归档来源核对稳定 ID、题材、评分、评价人数和元数据，并形成作品特异的简介、推荐价值、适读／适看边界、题材依据和内容提示。构建会拒绝重复项、明显题材越界、证据不足或创作者／系列过度集中的候选。成品池没有默认可见的 `source-screened` 残留；推荐引擎先守住原 200 条编辑层的优先级，在排除或耗尽后仍可无重复遍历全部 500 本书和 500 部电影。上述层级都不是亲自通读／完整观看的声明，也不能把平台评分变成适合所有人的价值结论。

### v2.4 目录与加载结构

| 数据层 | 当前规模 | 何时加载 |
|---|---:|---|
| 稳定 manifest | 约 6.9 KiB gzip | 启动时 |
| HTTP／PWA 的 2,200 项紧凑选择 JSON | 78,826 B gzip（约 77.0 KiB） | 启动时；经字节数、SHA-256 与 SRI 校验后重建选择目录 |
| `file://` 的紧凑选择脚本回退 | 79,926 B gzip（约 78.1 KiB） | 仅双击打开时使用；HTTP／PWA 不下载 |
| 当日五项详情分片 | 每块 raw 不超过 82,634 B | 五个 ID 选出后，并发上限 2–4 |
| 延迟搜索索引 | 394,990 B gzip（约 385.7 KiB） | 用户进入探索并实际查询时，由 Worker 加载 |
| 44 个详情分片 | 每块最多 50 条 | 按今日卡片／搜索结果按需加载；完整离线时补齐 |

`catalog-data/` 当前精确包含 49 个生成文件：44 个详情分片、两个 manifest、一个延迟搜索索引、一个 HTTP／PWA 选择 JSON 和一个 `file://` 选择脚本回退。旧 `catalog.js` 只作为同源安全模式兼容文件存在，不能进入固定 CDN 路由，正常启动也不会下载它。内容哈希目录文件使用不可变 URL；HTTP／PWA 只传输并复用 `selection-data.<hash>.json`，只有 `file://` 因本地 JSON 获取边界才使用 `selection.<hash>.js`。GitHub Pages 首开先请求同源分片，只有同源失败或超时才尝试固定 40 位 commit 的 CDN；两个候选都有独立时限、字节和 SHA-256 校验。完整接口与生成合同见 [`docs/CATALOG_SPLIT_API.md`](docs/CATALOG_SPLIT_API.md)。

## 直接使用

核心浏览、每日推荐、全库搜索、替换、记录、偏好、周报、JSON 备份、程序化音乐、本地医学插图和随包德语朗读可以直接双击 `index.html` 使用。`file://` 模式不能注册 Service Worker，Web Crypto、通知和部分浏览器存储能力也可能受限，因此不能用它验收 PWA 或加密备份。开发时在项目目录启动 HTTP 服务：

```powershell
python -m http.server 8080
```

然后访问 `http://localhost:8080`。生产部署时应使用 HTTPS。

`localhost` 只代表运行服务的那台设备。手机访问电脑的 `http://<局域网地址>:8080` 可以检查普通页面，但局域网 HTTP 通常不是浏览器安全上下文，不能代替 HTTPS 下的安装、Service Worker、通知和加密能力验收。

同一地址下的 `diagnostics.html` 是独立诊断页，例如 `http://localhost:8080/diagnostics.html`。它不加载 2,200 项内容库，也不读取收藏、偏好、搜索词或医学关注方向，只检查 Origin、安全上下文、浏览器能力、可用存储、今日万象缓存、关键同源文件、固定 CDN 探测和页面计时。所有网络探测都有时限，即使旧 WebView 没有 `AbortController` 也会返回超时结果；“修复应用缓存”只删除名称受限的 `daily-atlas-*` Cache，不删除本地收藏与偏好。

首页启动依次显示资源路线、选择器、紧凑目录、功能模块和今日五项五个阶段。脚本、目录与应用就绪分别设有超时；失败时可以重试，或进入 `?safe=1` 安全模式。安全模式只加载同源旧完整目录，停止可选 CDN、远程封面和 Service Worker 更新，主要用于网络路径或缓存异常时先恢复今日五项，并不替代后续诊断与缓存修复。

v2.5.0 的公开安全素材模式默认关闭第三方书封与电影海报，书影使用本地编辑视觉；因此首页、搜索和换项不会把作品 ID 发送给外部图片服务。城市图均有 Commons 文件页、作者、开放许可和本地 SHA-256，完整署名见 [`city-credits.html`](city-credits.html)。城市图片失败、数据节省或安全模式下会回到明确标注的本地编辑视觉。移动端优先请求 480×270 衍生图，宽屏优先使用 960×540 原发布图；两者均来自同一已复核文件。完整离线仍以 200 张原发布城市图为核验包，移动衍生图按需缓存，离线时可立即回退到已核验原图。

## 手机与国产浏览器

页面以 320 px 为最低布局宽度，手机底部提供图书、电影、城市、德语和医学五项快速跳转。核心交互面向持续更新的 Edge、Chrome、Safari、Firefox，以及现代 Chromium 内核的国产浏览器。安装入口不是跨浏览器统一标准：

- Android Chrome 通常可以使用页面安装提示或浏览器菜单中的“安装应用／添加到主屏幕”；入口仍受版本、浏览历史、站点策略和存储状态影响。
- 夸克的内核、菜单名称和主屏行为随版本与系统渠道变化；应寻找“添加到桌面／主屏幕”，但不能预先承诺一定以独立 PWA 窗口启动。
- 微信内置浏览器首先按普通网页验收。它可能不提供可用的添加主屏入口；需要安装时，应使用右上角菜单转到系统 Chrome／Safari 后再操作。
- iPhone 与 iPad 不依赖页面内安装提示；使用 Safari 的“分享 → 添加到主屏幕”。

没有出现安装按钮不等于核心网页不可用。声音、通知、安装和加密都应由用户手势触发；浏览器拒绝或缺少能力时，页面必须保留文字浏览和诚实降级提示。

本项目的自动移动验证使用桌面 Edge/Chromium 和 320、360、390、428、768 px 视口；它能验证响应式布局、弹窗和一部分 Web 平台降级，但不能冒充实体 Android、iPhone、夸克或微信内置浏览器，也不能证明某个运营商网络可达。v2.5.0 的待执行真机矩阵、逐步操作和通过标准见 [`docs/REAL_DEVICE_MATRIX_v2.5.0.md`](docs/REAL_DEVICE_MATRIX_v2.5.0.md)。在实体设备记录结果前，状态必须保持 `PENDING` 或 `BLOCKED`。

轻量离线是默认选项：安装阶段不批量下载 44 个详情分片、延迟搜索索引、500 个 MP3 或 200 张城市图，只缓存紧凑索引、24 张医学图和必要应用壳，并按需保留已访问内容。用户明确选择“完整离线”后，才以 `0–700` 进度下载完整目录、500 条固定德语朗读和 200 张同源城市 WebP；当前这三类资源合计约 36 MB（约 35.76 MiB），另需预留应用壳和浏览器缓存开销。可暂停、关闭页面后继续或取消；网络、配额或单文件失败不会写入虚假完成标记，已验证暂存可以继续，轻量应用壳不受损。`workers.dev`、`pages.dev`、自定义域名或境内托管的网络可达性属于部署层问题：浏览器在收到任何 HTTP 响应之前超时，不能通过改 CSS 或页面脚本解决。

## v2.5.0 对外部署与验收（HTTPS）

v2.5.0 将“文件已经上传”与“最终 Origin 已通过安全响应头、完整性和实体设备核对”严格分开。静态包根目录的 `_headers` 面向支持该规则的 Cloudflare Pages，要求首页与诊断页实际响应包含 CSP、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、frame 防护、权限策略、COOP 和 HSTS；HTML、Service Worker 与稳定 manifest 必须重新验证，内容哈希分片、医学图、音频和城市图才可长期 immutable。GitHub Pages 不读取项目 `_headers`，因此即使 GitHub HTTPS 站点可用，也只能作为 QA 入口，不能据此宣称自定义安全响应头已经在生产生效。

部署后至少执行以下响应头核对；把 `$origin` 替换为最终地址且不要在末尾重复斜杠：

```powershell
$origin = "https://<最终域名>"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/diagnostics.html"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/sw.js"
curl.exe -sS -L -D - -o NUL -w "FINAL=%{http_code} URL=%{url_effective}`n" "$origin/catalog-data/manifest.js"
```

Cloudflare Static Assets 可能把 `*.html` 同源 307 规范化到无扩展名地址；`-L` 用于跟随这种重定向。页面最终必须为 `FINAL=200`，最终 URL 必须仍在同一 Origin；跨 Origin 重定向不算通过。

正式验收请运行 `scripts/verify-origin.ps1`。它逐跳核对允许的重定向状态与每一跳的 scheme/authority，只读取最终 200 的安全响应头，并使用同一规则下载和比对 `sw.js`、`public-config.js`；对应的故障注入测试覆盖协议变化、authority 变化、A→B→A 绕行、重定向响应头遮蔽最终响应头和关键文件中途异源。

只有实际响应而不是仓库文件中出现上述策略，且在线 `index.html`、`sw.js`、manifest、一个详情分片、第一与第 500 个音频都与冻结静态包一致时，才把该地址写为最终 Origin。之后还要在同一 Origin 执行八格真机和 Android／iPhone A→B；更换域名会形成新 Origin，不能沿用旧 Cache 或真机结论。

本仓库不把任何历史 URL、平台控制台状态、候选 ZIP 或旧版本提交写成 v2.5.0 的上线结论。目标 Origin、实际响应头、资源逐项比对和实体设备矩阵必须在本版静态包生成后重新记录；在这些记录齐全前，状态仅为“待部署/待验收”。正式上传必须使用精简静态部署包，不要把包含 `data/upstream`、测试和构建脚本的完整审计包公开部署。

### 1. 生成并核对 v2.5.0 静态目录

在项目目录运行；每次发布都必须使用新的时间戳，脚本会拒绝覆盖已有包：

```powershell
npm run release:preflight
$releaseStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$publishRoot = "C:\Users\lenovo\Documents\今日万象发布\$releaseStamp"
$staticZip = "$publishRoot\daily-atlas-static-v2.5.0-r1-$releaseStamp.zip"
$unpackedRoot = "$publishRoot\unpacked"
New-Item -ItemType Directory -Force -Path $publishRoot
npm run deploy:package -- --zip $staticZip
npm run deploy:verify -- --zip $staticZip
Expand-Archive -LiteralPath $staticZip -DestinationPath $unpackedRoot
$staticDirectory = "$unpackedRoot\daily-atlas-static"
Get-Item "$staticDirectory\index.html"
```

真正上传的是内层 `$staticDirectory`，其顶层必须直接出现 `index.html`。静态包包含运行脚本、24 张医学图、图标和 500 个逐哈希核对的德语 MP3；不包含 `package.json`、`data/upstream`、构建脚本或测试。

### 2A. Cloudflare Pages Direct Upload

这是当前最少配置的图形界面路径。Cloudflare 官方的 [Pages Direct Upload 文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)说明，控制台可以接收文件夹或 ZIP，Wrangler 接收单个构建输出文件夹；Direct Upload 项目不能原地改成 Git 集成项目。

1. 打开 Cloudflare 控制台的 **Workers & Pages**。
2. 选择 **Create application → Get started → Drag and drop your files**；如果已经创建 Direct Upload 项目，则选 **Create a new deployment**。
3. 拖入 `$staticDirectory` 文件夹，确认上传列表的顶层直接看到 `index.html`，而不是再套一层 `daily-atlas-static`。
4. 选择 **Deploy site / Save and Deploy**。平台会提供 `https://<项目名>.pages.dev`，HTTPS 证书由平台处理。
5. 记录平台给出的全新 HTTPS 地址和部署时间，不要把控制台显示“成功”直接当作手机验收通过。

命令行路径需要先登录。当前会话未登录，因此这些命令尚未执行：

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler pages project create
npx wrangler pages deploy $staticDirectory --project-name daily-atlas
```

首次创建后，后续发布只需重新生成、核对并上传新的 `$staticDirectory`。如需自有域名，按照 Cloudflare 官方的 [Pages 自定义域名步骤](https://developers.cloudflare.com/pages/configuration/custom-domains/)在 Pages 项目的 **Custom domains** 中添加；根域名需要正确接入 Cloudflare nameserver。

### 2B. 临时真机 QA：未登录的 Workers Static Assets

如果只是先拿到一个 HTTPS 地址做实体手机验收，且暂时不想登录 Cloudflare，可使用 Wrangler 4.102.0 及以上提供的临时预览账号。当前现场使用的版本为 Wrangler 4.127.0；静态 Worker 上传还必须显式给出兼容日期：

```powershell
npx wrangler --version
npx wrangler deploy --temporary --assets $staticDirectory --name daily-atlas-qa --compatibility-date 2026-08-26
```

Wrangler 会输出一个临时 `workers.dev` HTTPS 地址和一个 **Claim URL**。Cloudflare 官方的 [Claim deployments（临时账号）](https://developers.cloudflare.com/workers/platform/claim-deployments/)与 [`wrangler deploy` 命令说明](https://developers.cloudflare.com/workers/wrangler/commands/workers/)注明：该流程要求 Wrangler 4.102.0 或更高版本，Claim 必须在 60 分钟内完成；未完成 Claim 时，临时账号及其资源会被删除。它适合在短时间内执行 Android／iPhone 真机矩阵，不是长期生产地址。

- 把临时站点 URL 交给测试设备；不要把 Claim URL 写入 README、截图、日志或公开聊天，它相当于可转移所有权的凭据。
- 在 60 分钟窗口内先完成 Wi-Fi 与移动数据的核心路径；需要保留该部署时，由预期所有者打开 Claim URL、登录并完成所有控制台步骤，仅仅打开链接不算完成。
- 不准备保留时，无需把临时地址包装成正式域名；过期后重新执行 `--temporary` 会得到新的临时账号／Claim URL。
- `--temporary` 只适用于当前没有 OAuth、API Token 或全局 API Key 凭据的会话；已登录后应改走下面的正式路径。

### 2C. 正式长期地址：已登录的 Workers Static Assets

若继续使用 Worker，Cloudflare 官方的 [Workers Static Assets 入门](https://developers.cloudflare.com/workers/static-assets/get-started/)和 [Wrangler assets 配置](https://developers.cloudflare.com/workers/wrangler/configuration/#assets)是当前依据。无现成 Wrangler 配置时，可让当前 Wrangler 对静态目录执行交互式部署；登录前不会实际上传：

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler deploy --assets $staticDirectory --name daily-atlas
```

如果已有 Worker，先在控制台的 **Deployments** 核对目标项目，再创建新部署，避免把测试目录传到另一个 Worker。`workers.dev` 适合建立可访问入口；Cloudflare 官方明确建议关键生产 Worker 使用 Route 或 Custom Domain，而不是只依赖 `workers.dev`，见 [Workers 路由选择](https://developers.cloudflare.com/workers/configuration/routing/)和 [`workers.dev` 边界](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)。Worker 是本站的实际源站时，可在 **Settings → Domains & Routes → Add → Custom Domain** 添加精确主机名；官方说明该操作会为目标主机名生成证书，详见 [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

过去控制台里出现过的 `workers.dev` 页面只能证明当时有一个部署，不能证明它包含 v2.4.3 文件，也不能代替新地址的版本核对和实体手机测试。若 DNS 返回 Meta、Twitter 等非 Cloudflare 网段，应记录为 `BLOCKED — NETWORK`，不能反复刷新并归咎于页面代码。

### 2D. GitHub Pages + 固定版本 CDN（可选 QA 路径）

GitHub 官方的 [创建 Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)与 [HTTPS 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)是配置依据。v2.5.0 的 Pages 地址须先通过本节的 Origin、资源和真机核对，不能从历史仓库、分支、提交或域名继承通过结论。

为避免首开解析完整 `catalog.js`，GitHub Pages 对内容哈希分片始终先请求同源；只有同源请求失败或在短预算内挂起，才尝试 jsDelivr 的固定提交。HTTP／PWA 首屏使用当前 manifest 指定的 `selection-data.<hash>.json`；`selection.<hash>.js` 只用于 `file://` 回退，44 个详情分片按今日五项和探索结果按需加载，搜索索引延迟到首次搜索。完整离线的音频和城市图均须通过清单中的字节数与 SHA-256 核对后才写入缓存。本地、Cloudflare 和其他域名只使用同源路由。

固定的 40 位资产提交是发布合同的一部分，不能用移动分支替代或改写；下一版若内容改变，必须创建新锚点提交、重新计算完整性记录、重建 Service Worker、跑完整测试并发布新页面提交。CDN 优化减少首屏目录体积，但不是中国大陆网络可达性的承诺，最终仍以真机矩阵为准。

### 3. 部署后核对与缓存更新

先在桌面无痕窗口访问新地址，并逐项核对：

1. 根页面、`/catalog.js`、`/sw.js`、`/assets/medical/manifest.json` 和最后一个德语 MP3 都返回 `200`。
2. 页面显示“探索 2,200 项”，医学清单包含 24 张主题图；全库搜索能返回结果。
3. 设置中默认选择“轻量离线”，初次安装不批量下载 500 个 MP3 或 200 张城市图；明确选择“完整离线”后才出现 `0–700` 进度。
4. 导出一个加密备份，错误密码不能解锁，正确密码能进入差异预览；正式恢复前取消一次，确认数据不变。
5. 确认默认模式下书与电影显示“本地编辑视觉”、没有第三方书封／海报请求，城市显示同源开放许可实图；城市图片故障能恢复本地视觉，本周回顾仍只读本机记录。

每次发布前必须先运行 `npm run build:pwa` 和 `npm run check:pwa`。Service Worker 的壳、内容、医学图、搜索、音频和视觉六个版本由各自内容生成；公开包不缓存或请求第三方书封／电影海报，用户主动选择完整离线时，500 个固定音频和 200 张同源城市图须逐项通过字节／哈希验证后才计入完整离线包。若仍看到旧版：先关闭同一站点的其他标签页，再重新打开并刷新；不要一开始就清除站点数据，因为那会删除本机记录和偏好。确需清除前先导出备份，再优先使用设置页或诊断页的“修复应用缓存”。

域名或子域名改变会形成新的浏览器 Origin；旧地址的收藏、偏好、Cache 和安装状态不会自动迁移到新地址。应先从旧地址导出 JSON，再在新地址查看差异并选择“替换”或“合并”。不同浏览器和微信内置浏览器也各有独立站点存储。

最后按 [`docs/REAL_DEVICE_MATRIX_v2.5.0.md`](docs/REAL_DEVICE_MATRIX_v2.5.0.md) 用实体设备分别执行 Wi-Fi 与移动数据测试。若电脑能开而某个手机网络在收到任何 HTTP 响应前就超时，应检查该网络的 DNS、代理、运营商与域名可达性；`pages.dev`、`workers.dev` 和自定义域名在不同地区的实际连通性不能由应用代码保证。面向中国大陆稳定公开运营时，还需根据服务器所在地、域名备案和所选云厂商要求另行设计境内部署或镜像。

## 推荐、替换与记录

- 每日按本地日期生成，同一天刷新页面不会任意换条目。
- “换一个”只把当前条目加入当天跳过列表，不会写入长期“已了解”记录；候选池中还有项目时，会立即生成下一个推荐。
- “读过了／看过了／去过了／掌握了／了解了”会写入长期探索记录并换一个。
- 每张卡独立替换，其余四张卡保持不变；最近一次替换可以撤销。
- 候选耗尽时会明确提示，不会递归或悄悄重复。
- “不适合我”会进入长期排除并立刻换一个；撤销该次操作会同时恢复原条目和反馈状态。

## 个性化、收藏与编辑底线

五类内容都提供“喜欢”“收藏”“不适合我”。设置中还可以选择：

- 图书／电影：题材、年代和热度；
- 城市：世界区域；
- 德语：A1–B2 难度；
- 医学：12 个主题关注方向。

“喜欢”会根据条目的题材、年代、地区、难度、热度、主题标签等逐步形成软偏好；“收藏”是独立清单，不等同于喜欢，也不会因为重置偏好而删除。每四个本地自然日中有一天为广度探索日，会忽略软偏好分数，但仍保留来源与评分门槛、稳定 ID、题材范围、当天跳过、长期已了解和“不适合我”等硬约束，避免推荐越来越窄。

所有偏好和记录仅保存在当前浏览器，不上传，也没有分析 SDK。

## 每日五项主题联动

应用定义了 10 个策展主题，其中 7 个进入当前每日轮换：记忆与遗忘、线索与证据、迁徙与旅程、人与共同体、自然与身体、感知与表达、时间与层积。当天优先从同一主题中选择五项；文本没有足够语义证据时允许条目的主题标签为空，候选不足会诚实回退并显示“主题外延推荐”。

主题联动是策展线索，不是对五项之间存在事实因果关系的宣称。它用于把内容放到同一个思考入口中，而不是把宽泛标签伪装成精确语义模型。

## 全库搜索与本地周报

“探索 2,200 项”在同一页面提供延迟建立的本地索引和分页结果，默认每页 24 项，不会一次把全部内容写入手机 DOM。搜索支持中文、英文和德文归一化，并可按类型、书影题材／年代、图书公开评分比例、城市地区、德语等级、医学主题和排序方式组合筛选。公开电影条目不分发第三方数值评分，仍可按题材、年代、热度层和编辑精选状态探索。

记录页的“本周回顾”只读取当前浏览器中的探索、喜欢和收藏记录，汇总五类探索数量、喜欢的书影题材、德语等级和医学主题；不请求网络、不上传个人画像。清除站点数据、换浏览器或换域名后，本地周报不会自动迁移，应使用备份功能。

## 页面背景与阅读外观

设置页提供 6 种颜色与 4 种风格，共 24 种可组合背景：原纸米白、鼠尾草绿、薄雾天青、柔杏暖橙、浅雾丁香、日光沙金，可分别搭配杂志纸纹、纯净留白、植物光影或柔和极光。另有紧凑模式、数据节省、大字号、增强对比度和减少动画。选择会立即作用于当前页面并保存到本地；同源多标签页按各字段时间戳合并并收敛，外观设置也进入 JSON 导出、差异预览和恢复白名单。

v2.5.0 的主卡与搜索结果共用视觉路由：公开版书影固定使用本地编辑视觉，城市只使用同源开放许可文件；数据节省／安全模式与城市图片故障均回到明确标注的本地编辑视觉，本地医学图始终保留。紧凑索引仍独立降低首屏目录传输；“完整离线”下载全库详情、搜索索引、500 条朗读和 200 张原发布城市图。移动城市衍生图按需缓存，完整离线时可立即使用已核验原图回退。

## 背景轻音乐

音乐库包含 100 首轻音乐预设：80 首原创参数化小品，以及 20 首取材于公版古典乐谱主题的本项目短篇合成编配。它们不是 100 个录音文件，而是由旋律、低音、速度、音阶和合成参数组成的配方，通过 Web Audio API 在浏览器中实时演奏；应用不内置、不采样、也不播放任何第三方商业录音。

公版古典组包括巴赫、帕赫贝尔、维瓦尔第、莫扎特、贝多芬、门德尔松、肖邦、舒曼、勃拉姆斯、柴可夫斯基、格里格、德彪西、萨蒂、德沃夏克和圣-桑的作品主题。下拉列表明确显示“公版·本项目合成”，曲目元数据同时记录作品名、作曲家、作品编号、来源类型和演奏披露。这里的“公版”指所用作品谱面／主题素材层面；听到的是本项目重新编配的浏览器合成演奏，不是完整原作，也不是任何唱片、演奏家或平台录音的复制。具体司法辖区如有特殊规则，公开商业使用前仍应单独核对。

- 默认静音，必须由用户点击播放；
- 可切换上一首、下一首或从列表选择，并可调节音量；
- 记住曲目和音量，但下次打开不会自动发声；
- 页面进入后台时暂停；德语朗读期间会自动压低音乐，朗读结束后恢复。

## 德语例句朗读

每一条德语卡都有“朗读德语例句”按钮。用户点击后，应用优先播放与该条目绑定的随包 MP3；500 个文件均由固定 Piper `de_DE-eva_k-x_low` 模型合成，声音呈现为女声。模型与配置哈希、每句文本哈希、当前 MP3 哈希、字节数、编码前 PCM 样本时长、模型来源和许可说明记录在 `assets/audio/german/manifest.json` 与 `assets/audio/german/LICENSE-M-AILABS.txt`。固定输入支持审计和重建，但不宣称两次合成／编码必然得到字节相同的 MP3。

固定文件缺失或播放失败时，应用才尝试回退到设备 Web Speech API。标准 `SpeechSynthesisVoice` 没有可靠的性别字段，因此回退音色不能保证性别；设置中的设备德语音色选择只影响这一回退路径。若浏览器没有列出可验证的德语音色，应用会明确报告不可用，而不会把未知的系统默认音色误称为德语音色。固定 MP3 是合成语音，不是真人针对本项目录制，也不表示模型、数据集或说话人贡献者为本项目背书。

Goethe、Duden 与 IDS Grammis 链接在卡片中统一定位为“语言参考资源”，用于继续查词、语域和语法体系；500 个例句由本项目组织，它们不是从这三个入口逐句摘录，也不把站点首页冒充每句的直接出处。6 个较专门的公共政策或学术词保留在 B2 池中，但解释明确标记为 B2+ 扩展内容并给出使用边界。

## 城市按需实时层

200 条城市卡中的特色、亮点、季节与礼仪是静态策展内容，不是实时旅行建议。用户点击“查看当前天气”后，应用才会按城市坐标和 IANA 时区请求 Open-Meteo；结果显示获取时间，并在本地缓存 30 分钟。联网失败且存在旧缓存时，会明确标记为过期缓存。

主动查询会向 Open-Meteo 暴露网络地址和所选城市坐标。签证、安全、节庆、景点开放时间和交通变化仍应在出发前查阅目的地政府、使领馆或官方运营方；本版没有把这些易变信息混进静态候选池。

部分城市条目使用 Wikivoyage 作为社区编写的旅行参考；它不是政府或目的地官方来源，也不是实时安全、签证、天气或开放信息。页面只把它作为静态导览入口，不会将其标成官方或实时数据。

## JSON 导出、恢复与迁移

设置页可以导出和导入 JSON，并在任何写入前显示差异预览。用户可以选择“替换本机”或“与本机合并”：

- 包含五类当前／当天／长期探索状态、喜欢／收藏／不适合我、显式偏好、音乐、德语回退音色和提醒设置；
- 不包含任意其他 `localStorage` 项，不包含天气缓存，也不包含远程内容；
- 明文备份上限为 2 MiB；加密信封上限为 3 MiB，以容纳 Base64 增量；导入前检查格式、版本、内容 ID、重复项与字段 schema；
- “替换”恢复到备份内容，备份省略的白名单可选项会被删除；
- “合并”对长期已了解记录取并集，只在同一天合并跳过记录，并优先保留本机当前卡；Profile 按设置、偏好字段和每种反馈各自的时间戳合并；外观、音频、语音和提醒等设备设置已有本机值时优先保留；
- 预览显示已了解、跳过、喜欢、收藏、不适合、显式偏好和设备设置的增删／替换统计；关闭预览或解密失败不会写入数据；
- 每类字段都按 schema 白名单重建；未知键、未知字段、`secret` 和危险原型键不会被导出或写回；
- 导入先写入一份包含全部 11 个目标键逐字节 `before/after` 的可恢复日志，再按“高代 profile → 五类状态 → 其余设置”写入并逐键回读核对；
- 一旦高代 profile 已发布，故障恢复会单调补齐整份新备份；若业务键尚未改变则保留整份旧数据。持续存储故障时保留日志、禁用后续持久化操作，并在下次启动最早阶段继续恢复，不会把部分写入谎报成“已回滚”。

导出时可以选择本地密码加密。信封固定使用 PBKDF2-SHA-256 600,000 次派生和 AES-256-GCM；盐与 IV 每次随机生成，算法参数也进入认证数据。密码、密码字节和派生密钥不保存、不上传；忘记密码无法恢复。错误密码和被修改的密文都会以同一种认证失败关闭。旧版明文 JSON 仍可导入。浏览器加密依赖 Web Crypto，生产环境应使用 HTTPS；不支持 Web Crypto 的环境仍可使用明文备份。无论是否加密，备份都可能反映个人阅读、观看或健康关注偏好，应妥善保管。

## 跨标签页写入锁边界

所有持久化读改写与整份备份导入共用一个同源事务协调器：浏览器支持时优先使用 Web Locks API；否则使用 `daily-atlas-coordination` IndexedDB 中一个持续存活的 `readwrite` 事务作为互斥门。进入门后的业务回调必须短小且同步，不能返回 Promise。启动时的待恢复 journal 也先取得同一门，恢复完成后 profile、推荐状态、外观、音乐、语音和提醒模块才开始读取，避免新标签页消费另一个标签页尚未提交完的混合快照。profile 使用单调 generation 处理重置／替换的删除语义；同一 generation 内再按反馈动作和显式偏好字段各自的时间戳合并，显式复选框提交单值 delta，避免陈旧标签页复活旧反馈、覆盖不同字段或覆盖同字段中的其他值。

应用不再把 `localStorage` 租约当作互斥锁，因为浏览器标准不保证它能在不同 agent cluster 间原子取得所有权。若 Web Locks 与 IndexedDB 两者都不可用，或持久存储在运行中失效，新的持久操作会失败关闭并切换到当前页面的临时内存模式；页面会明确提示刷新或关闭后不会保留。协调只覆盖同一源、运行同一发布版本的标签页，不是跨浏览器或跨设备的分布式锁；更新应用后应点击“应用更新并重新载入”并关闭仍运行旧 JavaScript 的标签页。`file://` 的存储与 IndexedDB 能力由浏览器决定，不能作为多标签持久化保证。

## PWA、轻量离线与完整离线边界

通过 HTTPS 或同设备 `localhost` 打开后，应用可以注册 Service Worker，并在支持的浏览器中出现安装入口。默认“轻量离线”缓存 HTML、CSS、运行时 JavaScript、2,200 项紧凑选择索引、图标、医学清单及 24 张本地 WebP、朗读清单，并按访问缓存今日详情、当前德语 MP3 和当前城市图；安装阶段不会批量预取 44 个完整详情分片、搜索索引、全部 500 个 MP3 或 200 张城市 WebP。

用户明确选择“完整离线”后，Service Worker 才把 44 个详情分片、延迟搜索索引、500 个朗读和 200 张同源城市图下载到独立暂存 Cache；进度为 `0–700`（音频 `1–500`、城市图 `501–700`）。每项写入前核对字节数和 SHA-256；完整 marker 还会复核真实 Cache 项。暂停、页面刷新、Worker 更新、网络或配额故障会保留已经验证的暂存，继续时只补缺项；“取消”才删除可选暂存。轻量应用壳始终保留。公开版不请求远程书封／电影海报；实时天气、Web Speech 系统语音包和外部来源页面不缓存。

Service Worker 分别计算应用壳、内容、医学图、搜索、音频和视觉六个版本。新 worker 会先写入发生变化的必要包，并复用内容版本未变且 marker／实际条目都通过核对的旧包；200 张同源城市图在用户选择完整离线时进入逐项核验的视觉包。检测到等待中的完整更新后，设置页显示“应用更新并重新载入”，只有用户点击才切换。激活后清理不再属于当前版本的应用 Cache，避免新旧壳静默混用。

首次轻量安装仍需联网完成一次；用户选择完整离线后，500 个音频、200 张城市图和完整目录当前估算约需新增 36 MB（约 35.76 MiB），并需预留应用壳、医学图及浏览器缓存开销。设置页会显示浏览器估算的已用、配额、可用空间与持久存储状态；可由用户手势申请持久存储，也可在不删除个人数据的前提下核对／修复应用 Cache。安装提示是否出现由浏览器决定；`file://`、局域网普通 HTTP、隐私模式、企业策略或浏览器存储限制可能禁用 PWA。缓存应用壳不等于拥有第三方元数据的再分发权。

## 提醒与日历

通知权限只会在用户主动点击“启用提醒”后请求。页面或浏览器保留运行中的 PWA 可以尽力按用户选择的本地时间提醒，但普通网页不能保证在浏览器完全关闭后每天准点唤醒。

设置页可以导出含 `RRULE:FREQ=DAILY` 和显示提醒的 ICS 文件，把长期调度交给系统日历。导入后是否提醒、时区解释和后台可靠性由用户的日历应用决定。本项目没有在用户未选择时间和方式时创建系统或 Codex 定时任务。

## 评分、热度与来源边界

“高评分”是候选门槛，不是作品价值的客观真理，也不代表适合所有人。

### 图书

- Open Library Work 稳定 ID；评分至少 `4.0 / 5`，评分人数至少 `20`；
- 评分和人数来自条目声明日期对应的 Open Library 快照；页数是版本相关近似值；
- 热度层只表示该平台评分人数：`classic >= 80`、`mid = 40–79`、`underseen = 20–39`；
- 公开 LTS 包不请求或复制书封；书目与评分边界仍按来源单独披露。

### 电影

- 公开条目保留稳定 IMDb title ID、编辑简介、题材、年代与“编辑精选”门槛，但不分发 IMDb 数值评分、票数或远程海报；
- 构建侧的非公开冻结审计输入用于确认候选达到既定口碑与关注度底线，不进入公开运行目录、搜索分片或静态发布包；
- 公开热度层是编辑可见度标签，不向用户宣称为某个平台票数的实时映射；
- 页面只提供作品资料链接，不把链接可访问性解释成数据再发布许可。

IMDb 官方条款把免费数据集限定在个人／非商业用途，并限制把它重制为在线或离线电影信息数据库；因此 v2.5.0 将相关数值留在不发布的构建审计输入，不作为公开应用数据。若未来取得明确适用授权，应重新进行许可核对、构建和发布审查。

### 豆瓣

本版没有抓取、复制或显示豆瓣分数、评价人数或条目数据。只有取得书面许可和稳定接口后，才适合按“来源、分数、人数、快照日期”并列接入；不同平台分数不能简单平均成一个虚假的综合分。`ratings` 数组仅为这种合规接入预留结构。

## 医学边界

医学池覆盖睡眠、运动、营养、感染、心理、感官与皮肤、心血管与代谢、急救、旅行与职业健康、生命周期、用药与健康素养、预防与筛查等 12 个主题组。来源限定为 WHO、CDC、NHS、NIH 下属机构、FDA、MedlinePlus、USPSTF、美国其他公共机构，以及 St John Ambulance 等有明确急救教育职责的机构页面；来源名称、落地域名和访问日期由构建校验。

内容只做一般科普；它不会根据少量输入给出诊断或个体化治疗，也不替代医生、药师、当地急救或毒物咨询服务。出现警示症状时，应以卡片中的边界提示和所在地专业服务为准。

500 条内容使用 24 张本地主题插图，覆盖睡眠节律／障碍、日常运动／肌肉骨骼、营养补水／消化口腔、心血管／代谢肾脏、感染／免疫、心理／脑与成瘾、用药／检查素养、急救、环境、筛查和生命周期等语义组；映射与替代文本记录在 `assets/medical/manifest.json`。这些插图用于导航和识别主题，不是解剖图、诊断图或治疗步骤；医学准确性仍由文字、警示边界和来源承担。

## 当前没有实现的能力

- 经授权的豆瓣并列评分：等待书面许可与稳定接口；
- 账号与端到端云同步：没有后端、账号、跨设备冲突合并、隐私政策或删除机制；当前使用 JSON 备份迁移；
- 浏览器彻底关闭后的可靠网页通知：请使用导出的 ICS 与系统日历；
- 实时签证、安全、节庆和开放时间：本版仅有用户触发的 Open-Meteo 当前天气。

## 上游刷新与可审计构建

基础 200 条书影证据保存在 `data/upstream/snapshots/`，后续 300+300 扩池证据保存在 `data/upstream/media500/snapshots/`。每个不可变清单条目都记录请求 URL、最终 URL、获取时间、HTTP 状态、字节数、SHA-256、许可链接与许可说明；两个目录各自的 `latest.json` 只保存最新清单路径及其 SHA-256。局部刷新会先验证上一份清单，再携带未更新条目。原始响应不会自动替换策展池，仍需运行构建和人工复核。

需要联网刷新上游审计包时：

```powershell
npm run refresh:data
npm run refresh:media500
```

前一个命令刷新基础证据，后一个命令刷新 500 条扩池证据；两者都会产生新的时间戳快照，不应覆盖旧快照，也不会自动宣布新条目通过编辑审查。Open Library、Cinemeta 和 IMDb 的可用性、返回值和条款可能变化；刷新成功只证明当次响应被归档，不等于自动取得再分发或商业许可。

本地确定性构建链为：

```text
data/upstream/snapshots + 构建脚本
  -> data/raw/books500.json / movies500.json
  -> data/raw/cities200.json / german500.json / medical500.json
  -> data/catalog.source.json
  -> catalog.js
```

`data/catalog.source.json` 的 `sourceAudit` 保存五个规范化输入的哈希，`upstreamAudit` 保存最新指针和清单哈希。它们证明随包文件之间一致，但不能证明未来重新请求第三方服务会返回相同内容。

## 构建与测试

应用运行本身不要求 Node.js。重建候选池和运行审计需要 Node.js 18 或更高版本；Windows 下的上游下载回退使用 PowerShell。`package-lock.json` 当前固定 Playwright `1.57.0`。首次安装测试依赖：

```powershell
npm ci
# v2.5.0 跨引擎门禁需要三套 Playwright 浏览器
npx playwright install chromium firefox webkit
```

既有回归组默认查找 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，也可以用环境变量 `EDGE_PATH` 指向另一份 Edge 可执行文件。除存储故障组外，脚本在该路径不存在时会回退到 Playwright Chromium；`test:e2e:storage` 为真实 Edge 故障注入套件，要求指定文件存在且浏览器主版本符合测试合同，不满足时会明确失败，不能把 Chromium 回退结果冒充 Edge 结果。`test:e2e:v23` 和 `test:e2e:v24` 的跨引擎部分必须分别启动 Playwright Chromium、Firefox 和 WebKit，不允许用三个 Chromium 配置冒充三种引擎。

`requirements-assets.txt` 另外固定了资产重建依赖：`Pillow==10.4.0`、`piper-tts==1.6.0` 和 `lameenc==1.8.1`。普通使用和 Node.js 本地审计不需要 Python、Piper 推理运行时或语音模型；这些只在重新生成图片或德语 MP3 时使用。重建德语音频还必须另行下载与清单中 SHA-256 一致的 `de_DE-eva_k-x_low` 模型和配置，模型与推理运行时不会打进网页发布包。具体命令与许可边界见 `assets/audio/german/README.md`。

命令与 `package.json` 保持一致：

```powershell
# 从已经归档的上游快照重建／核对书影 500 条池
npm run build:media
npm run check:media

# 确定性生成／核对 200 城市、500 德语、500 医学
npm run build:extras
npm run check:extras

# 组装规范化目录，生成浏览器脚本并核对字节一致性
npm run assemble
npm run build
npm run check
npm run build:pwa
npm run check:pwa

# 单元、既有回归与 v2.5.0 三引擎验证
npm run test:unit
npm run test:e2e
npm run test:e2e:lock
npm run test:e2e:profile
npm run test:e2e:import
npm run test:e2e:exhaustion
npm run test:e2e:optional
npm run test:e2e:storage
npm run test:e2e:v2
npm run test:e2e:v22
npm run test:e2e:catalog
npm run test:e2e:v23
npm run test:e2e:v24
npm run test:e2e:v241
npm run test:e2e:v243

# 依次执行完整本地审计
npm test

# 正式打包前的同义发布预检；会执行完整 npm test
npm run release:preflight
```

浏览器命令与职责如下；它们都通过 Playwright 驱动，实际浏览器名称和版本必须记录在冻结审查 sidecar 中：

| 组别 | `package.json` 命令 | 主要验证范围 |
|---|---|---|
| smoke | `test:e2e` | 主页面、交互、对话框与基础回归 |
| lock | `test:e2e:lock` | Web Locks 与 IndexedDB `readwrite` 事务门（含 2 页 500 轮、4 页 100 轮互斥压力） |
| profile | `test:e2e:profile` | 多标签反馈、偏好、generation 与收敛 |
| import | `test:e2e:import` | 导入并发、替换语义与恢复 |
| exhaustion | `test:e2e:exhaustion` | 候选耗尽、跨日与原因提示 |
| optional | `test:e2e:optional` | profile、音频、语音、提醒等可选键事务 |
| storage | `test:e2e:storage` | Edge 151 存储写点故障、内存模式与原子性 |
| v2 | `test:e2e:v2` | PWA、离线、更新、天气、通知、ICS、音频与响应式界面 |
| v2.2 | `test:e2e:v22` | 全库探索、数据节省、周报、医学图与加密备份回归 |
| catalog | `test:e2e:catalog` | HTTP Worker、file 模式、按需详情与搜索降级 |
| v2.3 | `test:e2e:v23` | Chromium／Firefox／WebKit、启动分层、无重复目录传输、独立诊断、自动安全回退与 WCAG 2.2 A／AA 严重问题门禁 |
| v2.4.0 | `test:e2e:v24` | 双 Origin 的完整离线、城市图与音频进度、缓存版本和降级路径 |
| v2.4.1 兼容回归 | `test:e2e:v241` | 国产 Android UA、弱网先可操作、图片及时换代、并发上限与移动裁切 |
| v2.4.3 | `test:e2e:v243` | 两个运行包、受控弱网首屏、解码后原子显图、移动城市图、阶段耗时与移动裁切 |

WCAG 自动门禁使用 axe-core 检查 `wcag2a`、`wcag2aa`、`wcag21aa` 和 `wcag22aa` 标签下 impact 为 serious／critical 的问题，并保留现有键盘、焦点、对话框、触控目标与多宽度实跑。自动工具不能证明完整 WCAG 合规，也不能替代屏幕阅读器和真实低视力用户测试；这里的通过含义仅限上述机器可执行门禁没有发现对应级别问题。

`npm run check:extras` 会在内存中重建预期的三份扩展 JSON，并逐字节比较现有文件；检查前后的目标哈希必须相同，因此该命令不会重写 `data/raw`。`npm test` 不主动联网刷新上游数据；它使用随包快照和规范化输入。只有 `npm run refresh:data` 需要访问外部服务。

### 最终交付验证与 sidecar 规则

产品树内只固定验证方法，不提前写入最终通过结论。主线程在候选冻结前执行的预检只用于决定能否提交审查，不等于独立验收；最终状态必须由独立 Round 3 审查者在版本化 ZIP 的干净解压副本中，按需求完整性、逻辑正确性、边界情况、代码质量、测试覆盖和实际运行结果六方面复核后给出。

冻结脚本只在 ZIP 同目录生成四项可机械核验的产物：发布树清单、树清单 SHA-256、ZIP 和 ZIP SHA-256。主线程预检记录、独立审查报告及其 SHA-256 由对应执行者在冻结后另行生成，并记录实际环境、命令、退出码、测试数量、运行记录与截图索引；发布脚本不会伪造这些尚未执行的结论。所有审查材料都留在包外，不写回已经冻结或审查过的产品树，以区分“候选预检”与“独立最终结论”并避免自引用。缺少独立审查 sidecar 时，只能说明拿到了候选包，不能声称 Round 3 已通过。

完整审计／源码包必须写到项目目录之外，文件名中的版本必须与 `package.json` 完全一致；脚本拒绝覆盖已有文件：

```powershell
npm run release:preflight
npm run release:package -- --zip "C:\Users\lenovo\Documents\今日万象发布\daily-duet-v2.5.0-r1-YYYYMMDD-HHMMSS.zip"
npm run release:verify -- --zip "C:\Users\lenovo\Documents\今日万象发布\daily-duet-v2.5.0-r1-YYYYMMDD-HHMMSS.zip"
```

此完整包用于干净解压、`npm ci`、测试与审计，不应原样作为公共静态站点上传：其中包含构建脚本、测试和许可受限的上游证据。面向 Cloudflare 等平台的精简静态部署包只保留网页运行文件、图标、医学插图、500 个德语 MP3、200 张同源城市 WebP 及完整 `catalog-data` 目录；具体命令见上方部署说明。

## 主要文件

```text
daily-duet/
├─ index.html / styles.css / app.js   页面、样式与交互
├─ bootstrap.js / runtime-health.js   分阶段启动、超时、安全模式与诊断核心
├─ diagnostics.html / diagnostics.js  不依赖内容库的设备、网络、缓存与存储诊断
├─ asset-routing.js                   CDN／同源路由、超时与内容校验
├─ engine.js / state.js / lock.js     每日选择、版本化状态与跨标签页写入锁
├─ profile.js / backup.js             偏好、反馈、收藏、差异预览与恢复事务
├─ backup-crypto.js                   可选 PBKDF2 + AES-GCM 本地备份加密
├─ explore.js / weekly.js             查询语义与隐私友好周报
├─ catalog-loader.js / search-worker.js
│                                      分片目录加载、延迟 Worker 搜索与主线程回退
├─ music.js / speech.js               100 首程序化音乐与固定德语女声朗读
├─ city-live.js / reminders.js         按需天气、页面提醒与 ICS
├─ city-credits.html / city-credits.js 城市图署名、开放许可与来源页
├─ pwa.js / sw.js / manifest.webmanifest
│                                      六包版本、暂停／恢复完整离线与缓存修复
├─ catalog-data/                       manifest、紧凑索引、延迟搜索及 44 个详情分片
├─ catalog.js                          安全模式兼容的完整候选池
├─ data/
│  ├─ catalog.source.json              schema v4 规范化目录与审计字段
│  ├─ raw/                             五类构建输入及旧版保留输入
│  ├─ upstream/                        原始响应、清单、许可说明和哈希
│  ├─ CATALOG_AUDIT.md                 数量、阈值、质量与许可边界
│  ├─ MEDIA200_AUDIT.md                旧版书影 200 条历史构建摘要
│  └─ MEDIA500_AUDIT.md                当前书影 500 条构建摘要
├─ assets/medical/                     24 张本地医学主题图及映射清单
├─ assets/audio/german/                500 个固定女声 MP3、清单与许可通知
├─ assets/visuals/cities/              200 张同源城市 WebP；逐项 SHA-256 在视觉清单中
├─ scripts/                            刷新、生成、组装和校验脚本
└─ tests/                              单元、浏览器、PWA 与离线验证
```
