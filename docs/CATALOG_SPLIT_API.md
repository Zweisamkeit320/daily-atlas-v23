# v2.3 分层目录集成接口

`catalog.js` 仍由构建脚本生成，作为旧版回归基线；v2.3 浏览器启动路径应改用下列文件：

- `catalog-loader.js`：稳定、无数据的 UMD 加载 API；全局名 `DailyAtlasCatalogData`。
- `catalog-data/manifest.js`：稳定入口；全局名 `DAILY_ATLAS_SPLIT_MANIFEST`。
- `catalog-data/selection-data.<hash>.json`：HTTP／PWA 首屏使用的 2,200 条紧凑选择记录；当前为 369,803 B，gzip 79,148 B。加载器先通过 `assetFetcher` 完成字节数、SHA-256 与 SRI 校验，再重建全局选择目录。
- `catalog-data/selection.<hash>.js`：仅供 `file://` 使用的同内容脚本回退；全局名 `DAILY_ATLAS_SELECTION_CATALOG`。正常 HTTP／PWA 启动不会同时下载它。
- `catalog-data/search.<hash>.js`：延迟搜索索引；全局名 `DAILY_ATLAS_SEARCH_INDEX`。
- `catalog-data/details/*.<hash>.js`：50 条一块的完整详情；注册到 `DAILY_ATLAS_DETAIL_CHUNKS`。
- `search-worker.js`：HTTP(S) 下执行筛选和排序；`file://` 自动退回主线程查询。

当前 `catalog-data/` 精确包含 49 个生成文件：44 个详情分片、`manifest.js`、`manifest.json`、一个搜索索引、一个 HTTP／PWA 选择 JSON 和一个 `file://` 选择脚本。两种选择载荷共享同一 `selectionVersion`；它们是协议适配，不是两份会在正常启动中重复下载的数据。

## 最小启动

```html
<script src="./engine.js"></script>
<script src="./profile.js"></script>
<script src="./catalog-loader.js"></script>
<script>
  (async () => {
    const store = DailyAtlasCatalogData.createStore({ baseUrl: document.baseURI });
    const selection = await store.loadSelection();
    const picks = ["book", "movie", "city", "german", "medical"].map((type) => {
      const collection = { book: "books", movie: "movies", city: "cities", german: "german", medical: "medical" }[type];
      return DailyAtlasEngine.chooseInitial(selection[collection], { dateKey: "2026-08-28", type });
    });
    const fiveCompleteItems = await store.loadDetails(picks);
  })();
</script>
```

紧凑记录带有 `selectionOnly: true` 和 `detailChunk`。它们保留 Engine 与 Profile 会读取的全部选择字段，也继续通过现有 `Engine.qualifiedItems`，但其中详情资格字段是内部占位值，不能直接用于卡片、来源链接或备份展示。调用方必须等待 `loadDetails` 后再渲染。

## API

```text
await store.loadManifest()
  -> 版本、数量、SHA-256、SRI、字节数、selection、selectionData、search 与 44 个分片记录

await store.loadSelection()
  -> compact catalog；五个集合数量为 500/500/200/500/500

await store.loadDetails(refs)
  refs: [{type,id}]、compact items、"type:id" 或全局唯一稳定 ID
  -> 与 refs 同顺序的完整 item 数组；未知 ID 或分片不一致会抛错

await store.getDetail(ref)
  -> 一个完整 item

await store.loadAllDetails()
  -> 兼容旧版集合形态的完整 2,200 项 catalog

await store.query(filters, { hydrate: true })
  -> Promise<{total,page,pageSize,pageCount,filters,items}>
  -> 每个 entry.item 是完整详情，可交给现有探索卡片渲染

await store.query(filters, { hydrate: false })
await store.queryReferences(filters)
  -> items 只有 id/type/title/facet/detailChunk 等轻量字段

await store.hydrateResult(lightweightResult)
  -> 把一页轻量结果补成完整详情

store.close()
  -> 终止搜索 Worker；不删除缓存或个人数据
```

## Worker 与降级

- `http:`／`https:` 且存在 Worker 时，第一次探索查询会创建 `search-worker.js`，Worker 自行延迟加载搜索索引。
- Worker 初始化、加载、崩溃或查询超时后，本次 store 会停止重试 Worker，改为在主线程动态加载同一搜索索引。
- `file://` 不创建 Worker，使用 `<script>` 动态加载，因此不依赖 `fetch(file://...)`。
- 默认请求超时为 10 秒，可通过 `requestTimeoutMs` 覆盖。

### 资产路由与校验合同

manifest 的所有内容资产记录至少包含：

```js
{
  path: "selection-data.<hash>.json",
  bytes: 369803,
  sha256: "...64 位大写十六进制...",
  integrity: "sha384-...",
  version: "349866d2a3ef59e8",
  count: 2200
}
```

详情分片记录还包含 `id`、`type`、`firstId` 和 `lastId`。`assetResolver(record, kind)` 是同步路由钩子，不负责取数；当前 `DailyAtlasAssets.catalogAssetRequest(record, kind, location)` 返回：

```js
{
  path: "catalog-data/selection-data.<hash>.json",
  url: "https://.../catalog-data/selection-data.<hash>.json",
  fallbackUrl: "https://.../catalog-data/selection-data.<hash>.json", // 或 null
  integrity: "sha384-...",
  bytes: 369803,
  sha256: "...64 位大写十六进制..."
}
```

未受 Service Worker 控制的 HTTP(S) 页面可以把固定 commit CDN 作为 `url`、同源作为 `fallbackUrl`；受控页面只返回同源 URL。JSON 数据另由异步 `assetFetcher(record, kind, request)` 获取并校验；它应返回 `Response` 或 `{ response }`。当前启动器把该调用交给统一的 `DailyAtlasAssets.assetResolver(path, { bytes, sha256, integrity, timeoutMs })`，因此 HTTP／PWA 的选择 JSON 在解析和重建目录前完成字节数、SHA-256 与 SRI 校验。若没有自定义 `assetFetcher`，加载器仍可按 `url`／`fallbackUrl` 使用浏览器 `fetch`，但生产集成应保留上述统一校验钩子。

最小的生产集成形态为：

```js
const store = DailyAtlasCatalogData.createStore({
  baseUrl: document.baseURI,
  assetResolver: (record, kind) =>
    DailyAtlasAssets.catalogAssetRequest(record, kind, location),
  assetFetcher: (record, kind, request) =>
    DailyAtlasAssets.assetResolver(request.path, {
      bytes: request.bytes,
      sha256: request.sha256,
      integrity: request.integrity,
      preferTransfer: false
    })
});
```

## 版本边界

manifest 分别暴露：

- `contentVersion`：主题、策略和全部 2,200 项内容；
- `selectionVersion`：紧凑选择载荷；
- `searchVersion`：搜索载荷；
- `detailsVersion`：44 个详情分片集合。

这些版本不包含应用壳版本。Service Worker 应再独立维护 `shellVersion`、医学图 manifest 版本和德语音频 manifest 版本。
`appVersion` 只存在于稳定 manifest 指针和 loader 返回的内存视图中，不写入内容哈希选择文件；仅升级应用壳时，可以继续复用相同的 selection/search/details URL。
