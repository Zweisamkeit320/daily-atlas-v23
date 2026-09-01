# 今日万象 v2.4.2 可靠性与维护收口记录

## 版本定位

v2.4.2 不改变 2,200 项候选池、推荐算法、用户数据 schema 或页面信息架构。它只收口诊断、首次安装竞争、错误可定位性、运行时版本和维护证据，作为 v2.4.3 性能改造前的独立回退点。

## 已实现范围

- 诊断文件探测使用一个覆盖响应头与响应体的端到端时限；仅 `NETWORK`／`TIMEOUT` 顺序重试一次。
- 关键文件的持续网络失败记为 `degraded`；404、错误 MIME、损坏 WebP 等确定性错误记为 `fail`。
- 城市图同时校验 `image/webp` MIME 与 RIFF／WEBP 文件签名。
- 诊断摘要分开显示本轮错误和历史错误，模块与详情加载只写入有限错误码。
- Service Worker 首次安装的壳、内容、医学、搜索、音频和视觉包共用四路请求队列。
- Node 运行时固定为 24.x，并提供 `.node-version`；依赖审计显式使用 npm 官方 registry。
- 医学 caution／urgent 自动筛查绑定当前 `data/raw/medical500.json` 的 SHA-256；边界仍为一般科普，不宣称医生签字。

## 可复验入口

```powershell
npm ci
npm run deps:audit
npm test
```

打包后还必须对精确 ZIP 执行 `release:verify`／`deploy:verify`，并从干净目录解压完整审计包后重新执行 `npm ci` 与 `npm test`。本文件不把尚未执行的部署或真机步骤写成通过。

## 冻结前执行结果（2026-09-01）

- `npm run deps:audit`：PASS，npm 官方 registry 报告 0 个已知漏洞。
- `npm test`：PASS；其中单元／契约 291/291，通过诊断、分片目录、锁与导入竞争、存储逐写点故障、PWA、离线、双 Origin、Chromium／Firefox／WebKit 与 WCAG 门禁。
- Microsoft Edge 现场版本为 152；存储故障门禁接受 151 及以上，不再因浏览器安全更新误报。
- Playwright 1.57 默认 Firefox 144 缓存在本机无法启动；最终总入口使用测试脚本支持的 `DAILY_ATLAS_FIREFOX_EXECUTABLE` 指向同机可启动的 Firefox 153。Firefox、WebKit 与 Chromium 的实际页面测试均执行并通过，这一环境替代不等于实体手机证据。

## 人工边界

- v2.4.2 尚未部署时，Origin、安全响应头和在线资源一致性为 `NOT_RUN`。
- v2.4.2 尚未在实体手机重新执行时，夸克、vivo、微信、运营商移动数据与 PWA A→B 为 `NOT_RUN`。
- 历史 v2.4.1 的手机结果只能作为问题背景，不能替代 v2.4.2 证据。
