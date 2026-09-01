# Visual asset manifest

`visual-manifest.v1.json` is the pretty audit copy generated deterministically from the frozen 500-book, 500-movie and 200-city pools. The same build emits the compact browser payload `assets/visuals/manifest.js`, which assigns `DAILY_ATLAS_VISUAL_MANIFEST` without making a network request:

```powershell
node scripts/build-visual-manifest.cjs
node scripts/build-visual-manifest.cjs --check
node --test tests/visual-manifest.test.cjs
```

The manifest is a routing and rights-boundary document, not a blanket image licence.

`generatedAt` is the newest frozen upstream retrieval timestamp in the input data, not the wall-clock time of a rebuild. This preserves byte-for-byte deterministic output.

- Book covers are keyed by the catalog's Open Library Work ID and cover ID. The ordered route is a 480 px WebP delivery proxy, then the exact Open Library mobile and large origins. They remain remote references. Open Library metadata terms do not establish item-level cover-art redistribution rights.
- Movie posters are keyed by IMDb title ID. The ordered route is a 480 px WebP delivery proxy, then the catalog's MetaHub medium URL and same-ID small fallback. They remain remote references. No item-level poster redistribution permission is asserted.
- The proxy is a delivery fallback, not a licensor. It receives a normal third-party image request and does not make an image eligible for bundling or commercial reuse.
- City images start as `pending-open-license-curation`. A Commons search URL is only a discovery aid. It does not approve a search result.
- A city can become `approved-open-license-local` only through an entry in `city-commons-overrides.json` with an allow-listed licence, file page, author, attribution, source-metadata time and hash, subject review, exact local path, dimensions and local SHA-256.
- `city-commons-overrides.schema.json` documents that curation contract. The executable validator additionally opens the local file, verifies its RIFF/WEBP signature and compares its SHA-256 before an entry can be approved.
- Unknown, custom or non-commercial-only city licences fail closed. The application can continue to use its procedural visual.

The builder rejects absolute paths, `..` traversal, symlink escapes and the JSON keys `__proto__`, `prototype` and `constructor`. It never performs network requests and never downloads images.
