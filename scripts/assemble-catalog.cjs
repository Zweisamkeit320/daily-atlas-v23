const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require(path.resolve(__dirname, "..", "engine.js"));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RAW = path.join(DATA, "raw");
const OUT = path.join(DATA, "catalog.source.json");
const RAW_FILES = Object.freeze({
  books: "books500.json",
  movies: "movies500.json",
  cities: "cities200.json",
  german: "german500.json",
  medical: "medical500.json"
});

function loadMedicalVisuals() {
  const manifestPath = path.join(ROOT, "assets", "medical", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.items) || manifest.items.length !== 24) {
    throw new Error("Medical illustration manifest must use schemaVersion 1 and contain exactly 24 items");
  }
  const visuals = new Map();
  const files = new Set();
  for (const item of manifest.items) {
    if (!/^[a-z0-9-]+$/.test(item.key || "") || visuals.has(item.key)) {
      throw new Error(`Invalid or duplicate medical illustration key: ${item.key}`);
    }
    if (!/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || "") || files.has(item.file)) {
      throw new Error(`${item.key}: invalid or duplicate medical illustration file`);
    }
    if (!fs.existsSync(path.join(ROOT, item.file))) throw new Error(`${item.key}: medical illustration file is missing`);
    visuals.set(item.key, item);
    files.add(item.file);
  }
  return visuals;
}

const MEDICAL_VISUALS = loadMedicalVisuals();

const THEME_PATTERNS = Object.freeze({
  memory: /记忆|遗忘|历史|遗产|传统|过去|回忆|memory|history|heritage|archive|tradition|past/i,
  evidence: /证据|线索|推理|悬疑|谜|研究|检查|筛查|数据|evidence|clue|mystery|detect|research|screening|data/i,
  future: /未来|技术|人工智能|太空|科幻|future|technology|robot|space|science fiction|sci-fi/i,
  journey: /旅行|旅程|迁徙|道路|航海|城市|港|铁路|journey|travel|migration|road|voyage|city|harbou?r|train/i,
  choice: /选择|决定|伦理|代价|风险|choice|decision|ethic|cost|risk/i,
  resilience: /韧性|恢复|适应|生存|危机|resilien|recover|adapt|surviv|crisis/i,
  community: /社会|共同体|公共|家庭|关系|文化|交流|社区|society|community|public|family|relationship|culture/i,
  nature: /自然|环境|身体|营养|睡眠|运动|山|海|河|森林|nature|environment|body|health|sleep|nutrition|mountain|ocean|river|forest/i,
  perception: /感知|语言|表达|视觉|听力|艺术|叙事|心理|大脑|perception|language|expression|vision|hearing|art|narrative|brain/i,
  time: /时间|年代|世纪|时态|昼夜|年龄|古代|现代|time|century|tense|circadian|ageing|aging|ancient|modern/i
});

// These overrides remove generic category words that otherwise make a theme
// indistinguishable within one pool. A city is not tagged as a journey merely
// because its copy says "city", and a medical item is not tagged as nature
// merely because it says "body" or "health". City evidence requires an
// explicit trace, collection or observation practice in the item copy.
const TYPE_THEME_PATTERN_OVERRIDES = Object.freeze({
  book: Object.freeze({
    time: /时间(?:旅行|循环|悖论|跨度)|时空|跨时代|多代人|世纪变迁|time travel|time loop|temporal|across generations/i
  }),
  movie: Object.freeze({
    time: /时间(?:旅行|循环|悖论|跨度)|时空|跨时代|多代人|世纪变迁|time travel|time loop|temporal|across generations/i
  }),
  city: Object.freeze({
    evidence: /证据|线索|考古|博物馆|档案|遗址|观察|研究|evidence|clue|archaeolog|museum|archive|ruins?|research|observation/i,
    journey: /旅行|旅程|迁徙|道路|航海|漫游|步行|徒步|慢行|港|铁路|journey|travel|migration|road|voyage|walk|hik|harbou?r|train/i
  }),
  medical: Object.freeze({
    nature: /自然界|环境|营养|睡眠|运动|昼夜|空气|高温|紫外线|山|海|河|森林|nature|environment|sleep|nutrition|exercise|circadian|air quality|heat|ultraviolet|mountain|ocean|river|forest/i,
    choice: /选择|决定|权衡|共同决策|知情同意|个人偏好|choice|decision|trade-?off|shared decision|informed consent/i
  })
});

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(RAW, name), "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function rawHash(name) {
  return sha256File(path.join(RAW, name));
}

function textOf(item, type) {
  return [
    item.title, item.originalTitle, item.summary, item.reason, item.audience,
    item.explanation, item.action, item.limitsOrRedFlags,
    item.topic, item.topicGroup,
    // "表达" is a lesson format, not proof that every expression concerns
    // perception. The actual German prompt, explanation and examples remain.
    ...(type === "german" ? [] : [item.kind]),
    item.german, item.chinese,
    item.exampleGerman, item.exampleChinese, item.region, item.bestFor,
    item.seasonNote, item.culturalTip,
    ...(Array.isArray(item.tags) ? item.tags : []),
    ...(Array.isArray(item.highlights) ? item.highlights : [])
  ].filter(Boolean).join(" ");
}

function inferThemeTags(item, type) {
  const tags = new Set(Array.isArray(item.themeTags) ? item.themeTags : []);
  const text = textOf(item, type);
  for (const [theme, pattern] of Object.entries(THEME_PATTERNS)) {
    const effectivePattern = TYPE_THEME_PATTERN_OVERRIDES[type]?.[theme] || pattern;
    if (effectivePattern.test(text)) tags.add(theme);
  }
  if (type === "book" || type === "movie") {
    if (item.genres?.includes("history")) ["memory", "time", "community"].forEach((tag) => tags.add(tag));
    if (item.genres?.includes("mystery")) ["evidence", "perception"].forEach((tag) => tags.add(tag));
    if (item.genres?.includes("scifi")) ["future", "perception"].forEach((tag) => tags.add(tag));
  }
  const allowed = new Set(Engine.THEMES.map((theme) => theme.id));
  return [...tags].filter((tag) => allowed.has(tag)).sort();
}

function addThemes(items, type) {
  return items.map((item) => ({ ...item, themeTags: inferThemeTags(item, type) }));
}

function compactRating(rating) {
  return {
    source: rating.source,
    value: rating.value,
    max: rating.max,
    count: rating.count,
    snapshot: rating.snapshot
  };
}

// Keep the browser payload focused on fields used by the renderer, engine and
// local preference model. Full evidence rows, hashes and review records remain
// in data/raw/books500.json and data/raw/movies500.json, whose hashes are
// carried by sourceAudit. Shipping those audit-only objects in catalog.js would
// add well over a megabyte of parse work on every mobile device.
function compactMedia(item) {
  return {
    id: item.id,
    type: item.type,
    genre: item.genre,
    genres: item.genres,
    genreLabel: item.genreLabel,
    title: item.title,
    originalTitle: item.originalTitle,
    year: item.year,
    creator: item.creator,
    detail: item.detail,
    summary: item.summary,
    reason: item.reason,
    image: item.image,
    sourceUrl: item.sourceUrl,
    visual: item.visual,
    tags: item.tags,
    audience: item.audience,
    rating: compactRating(item.rating),
    popularityTier: item.popularityTier,
    curationLevel: item.curationLevel,
    series: item.series,
    installment: item.installment,
    standaloneFriendly: item.standaloneFriendly,
    prerequisite: item.prerequisite,
    contentNotes: item.contentNotes,
    region: item.region,
    language: item.language
  };
}

function compactCity(item) {
  return {
    id: item.id,
    type: item.type,
    cityZh: item.cityZh,
    cityEn: item.cityEn,
    countryZh: item.countryZh,
    countryEn: item.countryEn,
    countryCode: item.countryCode,
    region: item.region,
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone,
    summary: item.summary,
    highlights: item.highlights,
    bestFor: item.bestFor,
    seasonNote: item.seasonNote,
    culturalTip: item.culturalTip,
    sourceUrl: item.sourceUrl,
    visual: item.visual,
    themeTags: item.themeTags
  };
}

function compactGerman(item) {
  return {
    id: item.id,
    type: item.type,
    kind: item.kind,
    german: item.german,
    chinese: item.chinese,
    explanation: item.explanation,
    exampleGerman: item.exampleGerman,
    exampleChinese: item.exampleChinese,
    level: item.level,
    pronunciationHint: item.pronunciationHint,
    sourceUrl: item.sourceUrl,
    themeTags: item.themeTags,
    narration: item.narration
  };
}

function compactMedical(item) {
  return {
    id: item.id,
    type: item.type,
    topicGroup: item.topicGroup,
    topic: item.topic,
    title: item.title,
    summary: item.summary,
    action: item.action,
    limitsOrRedFlags: item.limitsOrRedFlags,
    riskLevel: item.riskLevel,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceAccessedAt: item.sourceAccessedAt,
    imageTheme: item.imageTheme,
    illustrationKey: item.illustrationKey,
    alt: item.alt,
    themeTags: item.themeTags
  };
}

const bookSource = read(RAW_FILES.books);
const movieSource = read(RAW_FILES.movies);
const citySource = read(RAW_FILES.cities);
const germanSource = read(RAW_FILES.german);
const medicalSource = read(RAW_FILES.medical);

const books = addThemes(bookSource.books.map((item) => {
  const compact = compactMedia(item);
  return { ...compact, ratings: [compact.rating] };
}), "book");
const movies = addThemes(movieSource.movies.map((item) => {
  const compact = compactMedia(item);
  return { ...compact, ratings: [compact.rating] };
}), "movie");
const cities = addThemes(citySource.map((item) => ({
  ...compactCity(item),
  title: item.cityZh,
  originalTitle: `${item.cityEn}, ${item.countryEn}`
})), "city");
const german = addThemes(germanSource.map((item) => ({ ...compactGerman(item), title: item.german })), "german");
const medical = addThemes(medicalSource.map((sourceItem) => {
  const item = compactMedical(sourceItem);
  const visual = MEDICAL_VISUALS.get(item.illustrationKey);
  if (!visual) throw new Error(`Unknown medical illustrationKey: ${item.illustrationKey}`);
  if (visual.topicGroup !== item.topicGroup || visual.imageTheme !== item.imageTheme || visual.alt !== item.alt) {
    throw new Error(`${item.id}: medical illustration metadata differs from the manifest`);
  }
  return {
    ...item,
    image: `./${visual.file}`,
    alt: visual.alt
  };
}), "medical");

const upstreamPointerPath = path.join(DATA, "upstream", "latest.json");
const upstreamPointer = JSON.parse(fs.readFileSync(upstreamPointerPath, "utf8"));
const mediaExpansionPointerPath = path.join(DATA, "upstream", "media500", "latest.json");
const mediaExpansionPointer = JSON.parse(fs.readFileSync(mediaExpansionPointerPath, "utf8"));
const catalog = {
  schemaVersion: 4,
  appVersion: "2.4.1",
  snapshotDate: "2026-08-25",
  themes: Engine.THEMES,
  dailyThemeIds: Engine.DAILY_THEME_IDS,
  selectionPolicy: {
    mediaGenres: ["history", "mystery", "scifi"],
    explorationCadence: "Every fourth local day ignores soft preference scores while keeping editorial qualification and exclusions.",
    popularityMeaning: "Popularity tiers describe source rating-count bands, not artistic value.",
    curationLevels: {
      "editorial-curated": "The original 50 entries retain individually edited Chinese summaries and reasons.",
      "editorial-reviewed": "All 150 expansion entries have item-level Chinese summaries, reasons, genre rationale, suitability and evidence notes; explicit rejects are absent.",
      "evidence-reviewed": "The 300-item scale expansion has item-level stable-source, threshold, genre and metadata review. It follows the editorial tier under matching recommendation conditions and is not represented as a full reading or viewing.",
      "source-screened": "Reserved boundary for an incomplete future refresh; source-screened entries are excluded from the published pool and default recommendations."
    },
    douban: "No Douban data is embedded without written authorization; ratings arrays support a future authorized side-by-side source."
  },
  sourceAudit: Object.fromEntries(Object.entries(RAW_FILES).map(([key, file]) => [key, { file: `raw/${file}`, sha256: rawHash(file) }])),
  upstreamAudit: {
    pointerFile: "upstream/latest.json",
    pointerSha256: sha256File(upstreamPointerPath),
    manifest: upstreamPointer.manifest,
    manifestSha256: upstreamPointer.sha256,
    mediaExpansion: {
      pointerFile: "upstream/media500/latest.json",
      pointerSha256: sha256File(mediaExpansionPointerPath),
      manifest: mediaExpansionPointer.manifest,
      manifestSha256: mediaExpansionPointer.sha256
    }
  },
  books,
  movies,
  cities,
  german,
  medical
};

fs.writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`PASS: assembled ${OUT}`);
console.log(`counts books=${books.length}, movies=${movies.length}, cities=${cities.length}, german=${german.length}, medical=${medical.length}`);
