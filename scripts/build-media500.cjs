const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RAW = path.join(DATA, "raw");
const LEGACY_BOOKS_PATH = path.join(RAW, "books200.json");
const LEGACY_MOVIES_PATH = path.join(RAW, "movies200.json");
const BOOKS_PATH = path.join(RAW, "books500.json");
const MOVIES_PATH = path.join(RAW, "movies500.json");
const BASE_POINTER_PATH = path.join(DATA, "upstream", "latest.json");
const EXPANSION_POINTER_PATH = path.join(DATA, "upstream", "media500", "latest.json");
const AUDIT_PATH = path.join(DATA, "MEDIA500_AUDIT.md");
const SERIES_OVERRIDES_PATH = path.join(DATA, "editorial", "series-overrides.json");

const GENRES = Object.freeze(["history", "mystery", "scifi"]);
const GENRE_LABEL = Object.freeze({ history: "历史", mystery: "悬疑", scifi: "科幻" });
const BOOK_RATING_MIN = 4;
const BOOK_COUNT_MIN = 20;
const MOVIE_RATING_MIN = 7.5;
const MOVIE_COUNT_MIN = 30000;
const BOOK_CREATOR_MAX = 11;
const MOVIE_CREATOR_MAX = 10;
const LEGACY_COUNT = 200;
const EXPANSION_COUNT = 300;
const FINAL_COUNT = 500;
const EXPANSION_EVIDENCE_COUNT = 119;
const BOOK_REJECT_IDS = new Set([
  "/works/OL84920W", // Vixen 03: political-adventure metadata, not a history-primary work.
  "/works/OL804979W", // Rosencrantz & Guildenstern Are Dead: noisy politics membership.
  "/works/OL18941W", // Fight Club: noisy science-fiction subject assignment.
  "/works/OL19870W", // The Jungle Book: a generic biography tag does not make the animal stories history-primary.
  "/works/OL16465449W", // The One and Only Ivan: one noisy historical-fiction tag conflicts with the animal-fiction subjects.
  "/works/OL9170454W", // Hamlet: its Work row is polluted with unrelated WWII and Jewish-history subjects.
  "/works/OL86707W", // Stellaluna: its animal-picture-book Work row is polluted with Holocaust subjects.
  "/works/OL498434W", // The Castle: biography-query and alienation substring pollution do not support a history-primary admission.
  "/works/OL498556W", // Metamorphosis: alienation is not evidence of extraterrestrial science fiction.
  "/works/OL59448W", // The Price of Salt: broad catalog taxonomy does not support a mystery-primary admission.
  "/works/OL257939W", // A Clash of Kings is epic fantasy, outside the allowed science-fiction scope.
  "/works/OL5734773W", // Memories of Ice is high fantasy with a polluted space-opera subject.
  "/works/OL5734770W", // Deadhouse Gates is fantasy with a polluted space-opera subject.
  "/works/OL257948W", // A Feast for Crows is epic fantasy, not mystery-primary because its subjects include murderers.
  "/works/OL20808172W" // Punk 57 is contemporary romance; one generic suspense taxonomy is not mystery-primary evidence.
]);
const BOOK_YEAR_WITHHOLD_IDS = new Set([
  "/works/OL46302W" // Foundation's Edge: the edition-aggregated 1977 value conflicts with the Work's 1983 award marker.
]);
const BOOK_PRIMARY_GENRE_OVERRIDES = Object.freeze({
  "/works/OL46760W": "history", // The Glass Castle is memoir/biography evidence, not science fiction.
  "/works/OL13826369W": "history", // The New Jim Crow is social/legal history, not a mystery narrative.
  "/works/OL98487W": "history", // Mother Night is grounded in WWII, Nazism, espionage and war-crime trials.
  "/works/OL19324556W": "scifi", // Star Wars: Thrawn belongs to its explicit space-warfare and other-planets evidence, not history.
  "/works/OL17356883W": "scifi", // Red Queen is retained only as a dystopian/science-fantasy crossover, not history.
  "/works/OL20867W": "history", // Middlemarch is retained for 19th-century English social life, not mystery.
  "/works/OL157040W": "history", // Forbidden Knowledge is retained as intellectual/civilizational history, not detective fiction.
  "/works/OL81601W": "history", // On Writing is memoir and writing-craft history, not science fiction.
  "/works/OL26492W": "history" // Benjamin Franklin's autobiography stays history despite an unrelated aggregated murder subject.
});
const MOVIE_REJECT_IDS = new Set([
  "tt0815241", // Religulous: a frozen War label conflicts with the source description and does not support history-primary admission.
  "tt11337862" // Friends: The Reunion is a cast reunion special rather than a history-primary recommendation.
]);

const BOOK_SOURCE_KEYS = Object.freeze({
  history: Object.freeze(["history", "history-general", "history-biography", "history-world", "history-social", "history-military", "history-holocaust", "history-revolution", "history-memoir", "history-autobiography", "history-war", "history-politics", "history-classic-historical", "history-classic-biography", "history-classic-american", "history-classic-political"]),
  mystery: Object.freeze(["mystery", "mystery-general", "mystery-crime", "mystery-thriller", "mystery-detective", "mystery-investigation", "mystery-murder", "mystery-crime-general", "mystery-suspense", "mystery-detectives", "mystery-classic-detective", "mystery-classic-crime", "mystery-classic-legal", "mystery-classic-police"]),
  scifi: Object.freeze(["scifi", "scifi-time", "scifi-dystopia", "scifi-space", "scifi-ai", "scifi-classic", "scifi-classic-dystopia", "scifi-classic-robots", "scifi-classic-cyberpunk"])
});
const BOOK_TIER_TARGETS = Object.freeze({
  history: Object.freeze({ underseen: 45, mid: 35, classic: 40 }),
  mystery: Object.freeze({ underseen: 58, mid: 18, classic: 19 }),
  scifi: Object.freeze({ underseen: 42, mid: 25, classic: 18 })
});

const PRIMARY_MOVIE_SKIPS = Object.freeze([0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950]);
const SUPPLEMENTAL_MOVIE_SKIPS = Object.freeze([0, 50, 100, 150, 200, 250, 300, 350, 400, 450]);
const MOVIE_SOURCE_KEYS = Object.freeze({
  history: Object.freeze([
    Object.freeze({ key: "history", skips: PRIMARY_MOVIE_SKIPS }),
    Object.freeze({ key: "history-biography", skips: SUPPLEMENTAL_MOVIE_SKIPS }),
    Object.freeze({ key: "history-war", skips: SUPPLEMENTAL_MOVIE_SKIPS })
  ]),
  mystery: Object.freeze([
    Object.freeze({ key: "mystery", skips: PRIMARY_MOVIE_SKIPS }),
    Object.freeze({ key: "mystery-thriller", skips: SUPPLEMENTAL_MOVIE_SKIPS }),
    Object.freeze({ key: "mystery-crime", skips: SUPPLEMENTAL_MOVIE_SKIPS }),
    Object.freeze({ key: "mystery-film-noir", skips: SUPPLEMENTAL_MOVIE_SKIPS })
  ]),
  scifi: Object.freeze([
    Object.freeze({ key: "scifi", skips: PRIMARY_MOVIE_SKIPS })
  ])
});
const MOVIE_TIER_TARGETS = Object.freeze({
  history: Object.freeze({ underseen: 47, mid: 55, classic: 25 }),
  mystery: Object.freeze({ underseen: 30, mid: 75, classic: 50 }),
  scifi: Object.freeze({ underseen: 4, mid: 0, classic: 14 })
});

const BOOK_SUMMARY_PATTERNS = Object.freeze([
  ({ title, author, topics, focus }) => `《${title}》把${topics}放进同一叙事视野；${author}由此从${focus}展开人物与环境之间的关系。`,
  ({ title, author, topics, focus }) => `${author}的《${title}》以${topics}构成具体情境，阅读入口落在${focus}如何改变人物选择。`,
  ({ title, author, topics, focus }) => `在《${title}》中，${topics}不是抽象标签，而是推动冲突的环境；作品可从${focus}这一交叉点进入。`,
  ({ title, author, topics, focus }) => `《${title}》围绕${topics}建立故事坐标，${author}让${focus}成为理解人物处境的一条线索。`,
  ({ title, author, topics, focus }) => `从冻结主题记录可确认，《${title}》涉及${topics}；这些要素共同指向${focus}，比单看${author}的作者标签更具体。`,
  ({ title, author, topics, focus }) => `《${title}》的内容入口由${topics}组成：它们把${focus}落到可辨认的人物、制度或想象情境中。`,
  ({ title, author, topics, focus }) => `若从${focus}进入，${author}的《${title}》具体触及${topics}，适合先据这些议题判断阅读兴趣。`,
  ({ title, author, topics, focus }) => `《${title}》将${topics}彼此连接，使${focus}不只是类型口号，而成为作品情境中的实际张力。`,
  ({ title, author, topics, focus }) => `${author}在《${title}》所处理的主题包括${topics}；它们为${focus}提供了作品特定而不泄露结局的概括。`,
  ({ title, author, topics, focus }) => `围绕${topics}，《${title}》呈现${focus}怎样进入日常经验、危机或想象世界，构成一条清晰的无剧透入口。`,
  ({ title, author, topics, focus }) => `《${title}》的可核内容信号是${topics}；${author}借这些要素展开${focus}，而非只依赖宽泛类型名称。`,
  ({ title, author, topics, focus }) => `冻结记录显示《${title}》特别关联${topics}。把它们并置来看，可以从${focus}理解这部作品的核心情境。`
]);

const BOOK_REASON_PATTERNS = Object.freeze([
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}；《${title}》另有 Open Library ${rating}/5（${count} 人）的冻结评价依据，当前属于${tierText}层。`,
  ({ title, valueClaim, rating, count, tierText }) => `值得关注的是：${valueClaim}。《${title}》同时以 ${rating}/5、${count} 人越过准入线，${tierText}仅说明样本规模。`,
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}，这构成《${title}》的内容价值；${rating}/5 与 ${count} 人评分负责证明口碑门槛，而不是替代阅读判断。`,
  ({ title, valueClaim, rating, count, tierText }) => `《${title}》的推荐重点在于${valueClaim}。固定评分为 ${rating}/5（${count} 人），以${tierText}层参与轮换。`,
  ({ title, valueClaim, rating, count, tierText }) => `如果你关注作品如何处理命题，《${title}》提供的切口是${valueClaim}；其来源评分 ${rating}/5、${count} 人满足证据底线。`,
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}，因此《${title}》不只是一个高分条目；${rating}/5、${count} 人和${tierText}层只是可追溯的筛选背景。`,
  ({ title, valueClaim, rating, count, tierText }) => `《${title}》把推荐价值落在${valueClaim}。它以 ${rating}/5、${count} 人进入候选池，未把平台热度混成综合分。`,
  ({ title, valueClaim, rating, count, tierText }) => `这里真正值得读的是${valueClaim}；《${title}》的 ${rating}/5、${count} 人只负责确认评价并非过少，现处${tierText}层。`,
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}，让《${title}》在同类作品中拥有明确议题入口。其固定口碑证据为 ${rating}/5、${count} 人。`,
  ({ title, valueClaim, rating, count, tierText }) => `推荐《${title}》主要因为${valueClaim}；${rating}/5、${count} 人以及${tierText}层共同提供大众反馈背景。`,
  ({ title, valueClaim, rating, count, tierText }) => `从内容上看，${valueClaim}；从证据上看，《${title}》为 ${rating}/5、${count} 人，二者承担不同职责。`,
  ({ title, valueClaim, rating, count, tierText }) => `《${title}》的阅读角度是：${valueClaim}。固定快照给出 ${rating}/5 和 ${count} 人，评分没有被夸大成作品结论。`
]);

const MOVIE_SUMMARY_PATTERNS = Object.freeze([
  ({ title, premise, focuses }) => `《${title}》把${premise}置于同一情境，冲突由${focuses}逐步展开。`,
  ({ title, premise, focuses }) => `在《${title}》中，${premise}构成具体剧情前提；${focuses}则决定人物面对的压力。`,
  ({ title, premise, focuses }) => `《${title}》围绕${premise}建立无剧透入口，并把矛盾落在${focuses}上。`,
  ({ title, premise, focuses }) => `从来源简介可确认，《${title}》涉及${premise}；这些要素共同推动${focuses}。`,
  ({ title, premise, focuses }) => `《${title}》的故事坐标由${premise}组成，观看时可留意${focuses}如何改变人物的选择。`,
  ({ title, premise, focuses }) => `围绕${premise}，《${title}》让${focuses}成为行动而非宽泛类型标签。`,
  ({ title, premise, focuses }) => `若从${focuses}进入，《${title}》具体处理的是${premise}，没有必要先知道结局。`,
  ({ title, premise, focuses }) => `《${title}》将${premise}彼此连接，使${focuses}在明确事件和人物关系中发生。`,
  ({ title, premise, focuses }) => `来源简介把《${title}》的情境指向${premise}；它们为${focuses}提供作品特定的支点。`,
  ({ title, premise, focuses }) => `《${title}》不是只靠类型气氛推进：${premise}构成事件核心，${focuses}构成内在张力。`,
  ({ title, premise, focuses }) => `对《${title}》的无剧透概括可以落在${premise}；影片借此展开${focuses}。`,
  ({ title, premise, focuses }) => `《${title}》特别关联${premise}。把这些线索并置来看，${focuses}就是主要观看入口。`
]);

const MOVIE_REASON_PATTERNS = Object.freeze([
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}；《${title}》另有 IMDb ${rating}/10（${count} 票）的冻结依据，当前属于${tierText}层。`,
  ({ title, valueClaim, rating, count, tierText }) => `值得关注的是：${valueClaim}。《${title}》同时以 ${rating}/10、${count} 票通过门槛，${tierText}只描述样本规模。`,
  ({ title, valueClaim, rating, count }) => `${valueClaim}，这构成《${title}》的观看价值；${rating}/10 与 ${count} 票负责提供公共评价背景。`,
  ({ title, valueClaim, rating, count, tierText }) => `《${title}》的推荐重点在于${valueClaim}。固定评分为 ${rating}/10（${count} 票），以${tierText}层参与轮换。`,
  ({ title, valueClaim, rating, count }) => `如果你关注叙事如何处理命题，《${title}》提供的切口是${valueClaim}；其 IMDb ${rating}/10、${count} 票满足证据底线。`,
  ({ title, valueClaim, rating, count, tierText }) => `${valueClaim}，因此《${title}》不只是一个高分片名；${rating}/10、${count} 票和${tierText}层只是筛选背景。`,
  ({ title, valueClaim, rating, count }) => `《${title}》把推荐价值落在${valueClaim}。它以 ${rating}/10、${count} 票进入候选池，未混入豆瓣或虚构综合分。`,
  ({ title, valueClaim, rating, count, tierText }) => `这里真正值得看的是${valueClaim}；《${title}》的 ${rating}/10、${count} 票只确认公共评价并非过少，现处${tierText}层。`,
  ({ title, valueClaim, rating, count }) => `${valueClaim}，让《${title}》在同类影片中拥有明确的思想或形式入口。其固定口碑证据为 ${rating}/10、${count} 票。`,
  ({ title, valueClaim, rating, count }) => `推荐《${title}》主要因为${valueClaim}；IMDb ${rating}/10、${count} 票承担的是门槛验证。`,
  ({ title, valueClaim, rating, count }) => `从内容上看，${valueClaim}；从证据上看，《${title}》为 ${rating}/10、${count} 票，二者职责不同。`,
  ({ title, valueClaim, rating, count }) => `《${title}》的观看角度是：${valueClaim}。固定快照给出 ${rating}/10 和 ${count} 票，但评分没有被夸大成艺术结论。`
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function loadSeriesOverrides() {
  assert(fs.existsSync(SERIES_OVERRIDES_PATH), `missing series override file: ${relative(SERIES_OVERRIDES_PATH)}`);
  const payload = readJson(SERIES_OVERRIDES_PATH);
  assert(payload.schemaVersion === 1, "series override schemaVersion must be 1");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.checkedAt), "series override checkedAt must be YYYY-MM-DD");
  assert(hasText(payload.boundary), "series override boundary is required");
  assert(Array.isArray(payload.items) && payload.items.length > 0, "series override items must be a non-empty array");

  const validStatuses = new Set(["verified-series", "verified-non-series"]);
  const validOrderSchemes = new Set(["original-publication", "original-release", "volume-number", "episode-number"]);
  const byType = { book: new Map(), movie: new Map() };
  for (const entry of payload.items) {
    assert(entry && typeof entry === "object" && !Array.isArray(entry), "series override entries must be objects");
    assert(entry.mediaType === "book" || entry.mediaType === "movie", `invalid series override mediaType: ${entry.id}`);
    const idPattern = entry.mediaType === "book" ? /^\/works\/OL\d+W$/ : /^tt\d{7,10}$/;
    assert(idPattern.test(entry.id), `invalid series override ID: ${entry.id}`);
    assert(validStatuses.has(entry.status), `invalid series override status: ${entry.id}`);
    assert(typeof entry.standaloneFriendly === "boolean", `series override needs standaloneFriendly: ${entry.id}`);
    assert(hasText(entry.reviewNote), `series override needs reviewNote: ${entry.id}`);
    assert(Array.isArray(entry.evidence) && entry.evidence.length > 0, `series override needs evidence: ${entry.id}`);
    for (const evidence of entry.evidence) {
      assert(hasText(evidence?.sourceName), `series override evidence needs sourceName: ${entry.id}`);
      assert(/^https:\/\//.test(String(evidence?.sourceUrl || "")), `series override evidence must use HTTPS: ${entry.id}`);
    }

    if (entry.status === "verified-series") {
      assert(hasText(entry.series) && entry.series !== "系列关系待核", `verified series needs a resolved name: ${entry.id}`);
      assert((Number.isInteger(entry.installment) && entry.installment > 0) || hasText(entry.installment), `verified series needs a positive or named installment: ${entry.id}`);
      assert(validOrderSchemes.has(entry.orderScheme), `verified series has invalid orderScheme: ${entry.id}`);
      if (!entry.standaloneFriendly) assert(hasText(entry.prerequisite), `non-standalone series item needs prerequisite: ${entry.id}`);
    } else {
      assert(entry.series === null && entry.installment === null && entry.orderScheme === null,
        `verified non-series item must clear series, installment and orderScheme: ${entry.id}`);
      assert(entry.standaloneFriendly === true && entry.prerequisite === null,
        `verified non-series item must be standalone with no prerequisite: ${entry.id}`);
    }

    const target = byType[entry.mediaType];
    assert(!target.has(entry.id), `duplicate series override ID: ${entry.id}`);
    target.set(entry.id, entry);
  }
  return { checkedAt: payload.checkedAt, byType };
}

const SERIES_OVERRIDES = loadSeriesOverrides();

function applySeriesOverrides(items, mediaType) {
  const overrides = SERIES_OVERRIDES.byType[mediaType];
  const ids = new Set(items.map((item) => item.id));
  for (const id of overrides.keys()) assert(ids.has(id), `series override target is absent from selected ${mediaType} pool: ${id}`);
  return items.map((item) => {
    const override = overrides.get(item.id);
    if (!override) return item;
    return {
      ...item,
      series: override.series,
      installment: override.installment,
      standaloneFriendly: override.standaloneFriendly,
      prerequisite: override.prerequisite,
      metadataAudit: {
        ...(item.metadataAudit || {}),
        seriesReview: {
          status: override.status,
          checkedAt: SERIES_OVERRIDES.checkedAt,
          orderScheme: override.orderScheme,
          reviewNote: override.reviewNote,
          evidence: override.evidence
        }
      }
    };
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

function resolveInsideData(relativePath) {
  const resolved = path.resolve(ROOT, relativePath);
  assert(resolved === DATA || resolved.startsWith(`${DATA}${path.sep}`), `source path leaves data directory: ${relativePath}`);
  return resolved;
}

function verifyPointer(pointerPath) {
  assert(fs.existsSync(pointerPath), `missing pointer: ${relative(pointerPath)}`);
  const pointer = readJson(pointerPath);
  const manifestPath = resolveInsideData(pointer.manifest);
  assert(fs.existsSync(manifestPath), `missing manifest: ${pointer.manifest}`);
  assert(fileSha256(manifestPath) === pointer.sha256, `manifest SHA-256 mismatch: ${pointer.manifest}`);
  const manifest = readJson(manifestPath);
  const byId = new Map();
  for (const entry of manifest.entries || []) {
    const filePath = resolveInsideData(entry.file);
    assert(fs.existsSync(filePath), `missing evidence file: ${entry.file}`);
    const bytes = fs.readFileSync(filePath);
    assert(bytes.length === entry.bytes, `evidence size mismatch: ${entry.id}`);
    assert(sha256(bytes) === entry.sha256, `evidence SHA-256 mismatch: ${entry.id}`);
    assert(!byId.has(entry.id), `duplicate evidence ID: ${entry.id}`);
    byId.set(entry.id, { ...entry, filePath });
  }
  return { pointer, manifest, manifestPath, byId };
}

function stableHashNumber(value) {
  return crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(0);
}

function stableColor(value) {
  const digest = crypto.createHash("sha256").update(String(value)).digest();
  const channels = [digest[0], digest[1], digest[2]].map((channel) => 38 + (channel % 72));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function normalizedText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function assertUnique(items, field, label) {
  const seen = new Map();
  for (const item of items) {
    const key = normalizedText(item[field]);
    assert(key, `${label} has empty ${field}: ${item.id}`);
    assert(!seen.has(key), `${label} has duplicate ${field}: ${seen.get(key)} and ${item.id}`);
    seen.set(key, item.id);
  }
}

function disambiguateAdditionTitles(legacy, additions) {
  const originalCounts = countBy([...legacy, ...additions], (item) => normalizedText(item.originalTitle || item.title));
  const occupied = new Set(legacy.map((item) => normalizedText(item.title)));
  return additions.map((item) => {
    const originalTitle = String(item.originalTitle || item.title);
    const originalKey = normalizedText(originalTitle);
    let displayTitle = String(item.title);
    if ((originalCounts[originalKey] || 0) > 1 || occupied.has(normalizedText(displayTitle))) {
      const creator = String(item.creatorOriginal || item.creator || "创作者待核").split("/")[0].trim();
      const qualifier = `${item.year > 0 ? item.year : "年份待核"}·${creator}版`;
      displayTitle = `${originalTitle}（${qualifier}）`;
      if (occupied.has(normalizedText(displayTitle))) displayTitle = `${displayTitle}·${String(item.id).replace(/\W/g, "").slice(-6)}`;
    }
    occupied.add(normalizedText(displayTitle));
    if (displayTitle === item.title) return item;
    return {
      ...item,
      title: displayTitle,
      titleZh: /[\p{Script=Han}]/u.test(originalTitle) ? displayTitle : `${displayTitle}（原名）`,
      metadataAudit: { ...item.metadataAudit, displayTitleDisambiguatedFrom: originalTitle }
    };
  });
}

function bookTier(count) {
  if (count >= 80) return "classic";
  if (count >= 40) return "mid";
  return "underseen";
}

function movieTier(count) {
  if (count > 500000) return "classic";
  if (count > 100000) return "mid";
  return "underseen";
}

function tierText(tier) {
  return { classic: "高样本", mid: "中等样本", underseen: "相对少评" }[tier];
}

function decadeTag(year) {
  return Number.isInteger(year) && year > 0 ? `${Math.floor(year / 10) * 10}年代` : "年代待核";
}

function displayBookYear(rawYear, snapshotYear) {
  const year = Number(rawYear);
  return Number.isInteger(year) && year >= 1800 && year <= snapshotYear ? year : 0;
}

function bookSubjects(row) {
  return Array.isArray(row.subject)
    ? row.subject.map(String).filter((subject) => subject && !/^(?:age|grade):(?:min|max):undefined$/i.test(subject.trim()))
    : [];
}

function subjectEvidenceSupports(row, genre, sourceKey) {
  const subjects = bookSubjects(row);
  const cleaned = subjects.filter((subject) => !/history and criticism|science fiction, fantasy, horror|long now manual for civilization/i.test(subject));
  const joined = cleaned.join(" | ");
  const fantasy = cleaned.some((subject) => /fantasy/i.test(subject));
  if (genre === "history") {
    const positive = /(historical fiction|historical novel|world history|world war|military history|social history|economic history|politics and government|political history|biograph|memoir|revolution|holocaust|warfare|medieval history|history of (?:a country|a people|war|politics|society)|tyranny|despotism|democracy|political ethics)/i.test(joined);
    const strong = /(historical fiction|historical novel|biograph|memoir|world war|holocaust|warfare|world history|military history|social history|revolution)/i.test(joined);
    const broadHistoricalHumor = /historical fiction/i.test(joined) && /humorous|humor \(fiction\)/i.test(joined) && !/(world war|holocaust|warfare|revolution)/i.test(joined);
    const focusedSource = sourceKey !== "history-general";
    return (positive || focusedSource) && !broadHistoricalHumor && (!fantasy || strong || sourceKey === "history-biography");
  }
  if (genre === "mystery") {
    const strong = /(detective|crime fiction|criminal investigation|private investigator|police procedural|murder|homicide|noir|espionage|missing persons?|conspirac)/i.test(joined);
    const romanceDominant = /(contemporary romance|romance|new adult)/i.test(joined);
    const explicitMystery = cleaned.some((subject) => /^(?:mystery|mystery fiction|mystery (?:&|and) detective|detective and mystery stories?)$/i.test(subject.trim()));
    const substantiveSuspense = cleaned.some((subject) => /^(?:(?:(?:romantic|psychological|legal|political|medical|technological|techno)-?\s*)?(?:suspense|thrillers?)|thrillers?\s*&\s*suspense)$/i.test(subject.trim()));
    const genericRomanceOnly = romanceDominant && !strong && !explicitMystery && !substantiveSuspense;
    const broad = /(mystery|thriller|suspense)/i.test(joined);
    return strong || (broad && !genericRomanceOnly && !/(fantasy|magic|wizard|witch|vampire|fairy|faeries|supernatural romance)/i.test(joined));
  }
  const exactScienceFiction = cleaned.some((subject) => /^science fiction$/i.test(subject));
  const strong = /(dystop|space opera|time travel|cyberpunk|robot|\baliens?\b|interplanetary|extraterrestrial|future societ|artificial intelligence|post-apocalyptic)/i.test(joined);
  return (exactScienceFiction || strong) && (!fantasy || strong);
}

const SUBJECT_TRANSLATIONS = Object.freeze([
  [/holocaust/i, "犹太人大屠杀与幸存者"],
  [/world war ii|world war, 1939-1945/i, "第二次世界大战"],
  [/world war i|world war, 1914-1918/i, "第一次世界大战"],
  [/computer crime|internet.*security|cyber/i, "计算机犯罪与网络安全"],
  [/soviet.*espionage|espionage/i, "间谍活动与秘密情报"],
  [/murder/i, "谋杀案件"],
  [/detective/i, "侦探调查"],
  [/mystery/i, "谜案与未知信息"],
  [/crime fiction|criminal/i, "犯罪与司法秩序"],
  [/time travel/i, "时间旅行"],
  [/artificial intelligence/i, "人工智能"],
  [/robot/i, "机器人与人类关系"],
  [/\baliens?\b|extraterrestrial/i, "外星生命"],
  [/space opera|interplanetary|space flight|outer space/i, "星际空间与宇宙社会"],
  [/dystop/i, "反乌托邦制度"],
  [/post-apocalyptic/i, "灾后世界"],
  [/historical fiction|historical novel/i, "历史环境中的虚构命运"],
  [/biograph|memoir|autobiograph/i, "人物生涯与记忆"],
  [/revolution/i, "革命与社会变迁"],
  [/politics and government/i, "政治制度与权力"],
  [/social conditions/i, "社会生活与制度环境"],
  [/warfare|military history/i, "战争与军事历史"],
  [/jews/i, "犹太人经历"],
  [/african american/i, "非裔美国人经验"],
  [/women/i, "女性处境"],
  [/parents of exceptional children/i, "特殊儿童与父母责任"],
  [/interracial marriage/i, "跨族群婚姻与家庭"],
  [/military deserters/i, "逃离军队的个人处境"],
  [/imaginary wars and battles/i, "虚构战争与跨星球冲突"],
  [/police/i, "警察制度与执法"],
  [/friendship/i, "友谊与忠诚"],
  [/forgiveness|redemption/i, "宽恕与救赎"],
  [/superhero/i, "超级英雄与公共责任"],
  [/survival/i, "生存与韧性"],
  [/young adult|juvenile|teenager/i, "青少年成长"],
  [/mount everest|mountaineer|mountain climbing/i, "珠峰攀登、探险与事故"],
  [/amazon\.com|electronic commerce|internet bookstores/i, "亚马逊、电商与零售转型"],
  [/computer games|video games|computer programmers/i, "电子游戏、程序员与技术文化"],
  [/snowden|whistle.?blow|electronic surveillance|national security agency/i, "斯诺登、吹哨与电子监控"],
  [/\bneurosurgeons?\b/i, "神经外科职业与医疗经验"],
  [/\bcancer\b|\bneoplasms?\b/i, "癌症、疾病与生命经验"],
  [/death & dying|attitude to death|terminally ill/i, "死亡、告别与生命议题"],
  [/yogi|yoga|spiritual biography/i, "瑜伽修行与精神生涯"],
  [/\bmotion picture actors?\b|\bactors?\b|\bactresses?\b/i, "表演者生涯与公共形象"],
  [/businesspeople|businessmen|businesswomen|entrepreneurs?|gens d'affaires|hommes d'affaires/i, "企业家、商业生涯与组织选择"],
  [/gastronomy|restaurants?|restaurateurs?|\bcooks?\b|\bchefs?\b/i, "厨师、餐厅与餐饮行业"],
  [/salomon brothers|investment banking|bond markets?|\bbonds\b|wall street/i, "投资银行、债券与华尔街文化"],
  [/chocolate factor(?:y|ies)|chocolaterie|\bchocolate\b/i, "巧克力工厂与生产经营"],
  [/east indians?/i, "印度人经历与印度社会"],
  [/warren buffe|investments?|capitalistes et financiers/i, "投资、企业家与资本决策"],
  [/philippines/i, "菲律宾历史、政治与地方经验"],
  [/global financial crisis|mortgage|economic recession/i, "全球金融危机与住房债务"],
  [/intelligence service|secret service/i, "情报机构与隐秘行动"],
  [/manuscript|labyrinth|documentary films/i, "手稿、影像与迷宫式叙事"],
  [/treasure|alexandrian library/i, "失落宝藏与历史遗迹"],
  [/resistance to government|dictatorship|totalitarian/i, "反抗、独裁与制度压力"],
  [/han solo|luke skywalker|princess leia|star wars/i, "星战人物、银河战争与政治秩序"],
  [/vorkosigan/i, "沃科西根宇宙与星际社会"],
  [/psychohistory|prophec/i, "心理史学、预言与文明走向"],
  [/life on other planets/i, "异星生命与跨星球社会"],
  [/revenge/i, "复仇、正义与行为后果"],
  [/fugitives? from justice/i, "逃亡者与司法追捕"],
  [/assassin/i, "刺杀行动与隐秘职业"],
  [/mediums?|psychic ability/i, "通灵能力与现实判断"],
  [/terrorism/i, "恐怖主义与政治暴力"],
  [/family|families/i, "家庭关系"],
  [/science fiction/i, "科学想象与未来社会"],
  [/\bastronom|\bcosmolog|\bplanetary science\b|\bouter space\b/i, "宇宙、天文学与科学认识"],
  [/science and civilization|technology and civilization/i, "科学技术与文明变迁"],
  [/financial crises|capitalism|economics|economic history|corporate power/i, "经济制度、危机与资本力量"],
  [/eviction|poverty|low-income housing|urban sociology/i, "住房、贫困与城市制度"],
  [/anatom|dissection/i, "人体结构与解剖实践"],
  [/forecast|future|twenty-first century/i, "未来预测与社会变化"],
  [/\bindigenous\b|\bnative americans?\b|\bamerican indians?\b/i, "原住民历史与社会经验"],
  [/cartoon|sequential art|illustration/i, "图像叙事与漫画形式"],
  [/paradigm|philosophy.*history|science.*history/i, "科学思想与知识范式"],
  [/tyranny|despotism|democracy|political ethics/i, "暴政、民主与政治伦理"],
  [/\bgenetic|\bheredity\b|\bgenes?\b/i, "遗传科学、家庭与伦理"],
  [/united states.*history|american history/i, "美国社会与历史变迁"],
  [/cryptograph|data encryption|cipher|coding theory/i, "密码、加密与信息安全"],
  [/world politics|social history/i, "世界政治与社会变迁"],
  [/world history|historical chronology/i, "世界历史与长期变迁"],
  [/black hole|schwarzes loch|space-time|universe/i, "宇宙、黑洞与时空观念"],
  [/FBI negotiation tactics|hostage negotiations?|negotiation tactics/i, "谈判策略、沟通与风险判断"],
  [/military art|military strategy|military tactics/i, "军事策略与组织行动"],
  [/trojan war|greek epic|achilles|odysseus/i, "特洛伊战争与希腊史诗"],
  [/president|scientist/i, "公共人物与专业生涯"],
  [/thriller|suspense/i, "悬念压力与信息控制"],
  [/vampire/i, "吸血鬼、欲望与危险"],
  [/ghost|haunted/i, "幽灵、空间与超自然威胁"],
  [/orphan/i, "孤儿处境与成长风险"],
  [/hospital|medical fiction/i, "医院空间与医疗处境"],
  [/private investigator/i, "私人调查者与案件追索"],
  [/cold war/i, "冷战、阴谋与国际对抗"],
  [/secret/i, "秘密、隐瞒与信任"],
  [/\bmagic\b|\bmagia\b|\bmagos?\b|\bwizards?\b|\bwitch(?:es)?\b/i, "魔法规则与权力选择"],
  [/\bfair(?:y|ies)\b|\bfées?\b|\belves?\b/i, "精灵世界与超自然秩序"],
  [/^(?:brothers?|sisters?|siblings?|hermanos)(?:\b|$)|\brelationship between (?:brothers?|sisters?|siblings?)\b/i, "手足关系与共同处境"],
  [/fluch/i, "诅咒与命运压力"],
  [/junge/i, "少年成长与社会规训"],
  [/ahnen/i, "祖辈记忆与家族因果"],
  [/trial|prisoner/i, "审判、囚禁与制度责任"],
  [/supervillain/i, "超级反派与权力失控"],
  [/\bheroes?\b/i, "英雄身份与公共责任"],
  [/school/i, "学校秩序与成长冲突"],
  [/\blove (?:story|stories|relationships?)\b|\bromantic (?:fiction|relationships?)\b|\bmarriage\b|^romance$|romance novel/i, "亲密关系与社会压力"],
  [/loss|grief/i, "失去、哀伤与记忆"],
  [/\bart\b|music|literature/i, "艺术表达与文化经验"]
]);

const BOOK_TOPIC_OVERRIDES = Object.freeze({
  "/works/OL16085155W": Object.freeze(["商业领袖与个人生涯", "苹果公司、计算机产业与产品创新", "领导力、企业文化与技术转型"]),
  "/works/OL17184556W": Object.freeze(["企业家与个人生涯", "SpaceX、Tesla 与技术创新", "航天、电动车与创业选择"]),
  "/works/OL3348011W": Object.freeze(["厨师与餐饮职业生涯", "餐厅后厨与行业文化", "烹饪劳动、经营与职业代价"]),
  "/works/OL7944812W": Object.freeze(["华尔街、债券与经纪业务", "Salomon Brothers 与投资银行文化", "金融激励、投机与职业伦理"]),
  "/works/OL17082485W": Object.freeze(["侦探调查与破坏事件", "巧克力工厂与厄瓜多尔背景", "友谊、记者身份与协作"]),
  "/works/OL298031W": Object.freeze(["甘地的自传与政治生涯", "印度民族独立与非暴力抵抗", "真理、信仰与公共行动"]),
  "/works/OL267174W": Object.freeze(["疾病、死亡与自我审视", "法官的社会身份与家庭生活", "俄罗斯社会礼俗与生命意义"]),
  "/works/OL2636675W": Object.freeze(["第二次世界大战与 V-2 火箭", "火箭技术、战争体系与个人处境", "制度控制、偏执与战争记忆"]),
  "/works/OL16592184W": Object.freeze(["犹太人大屠杀与幸存者", "Jack Gruener 的囚禁与求生经历", "见证、记忆与青少年处境"]),
  "/works/OL3126628W": Object.freeze(["音乐人 Freddie Mercury 与伴侣 Jim Hutton 的私人记忆", "Queen 乐队、音乐生涯与公众形象", "艾滋病、照护与私人记忆"]),
  "/works/OL13805586W": Object.freeze(["塔拉乌马拉跑者与长跑文化", "调查写作、耐力与奔跑经历", "身体、运动社群与生活选择"]),
  "/works/OL19737574W": Object.freeze(["独裁制度与反抗行动", "特殊能力、士兵与权力秩序", "亲密关系与个人选择"]),
  "/works/OL13061121W": Object.freeze(["恐龙、游乐园与失控风险", "青少年处境与求生选择", "科学想象与技术后果"]),
  "/works/OL8368435W": Object.freeze(["超智能体与 Culture 文明", "外部情境问题与文明干预"]),
  "/works/OL19324556W": Object.freeze(["星战人物、银河战争与政治秩序", "异星生命与跨星球社会", "军事忠诚、帝国权力与个人选择"]),
  "/works/OL17356883W": Object.freeze(["反乌托邦制度与社会阶层", "特殊能力、王权与反抗", "青少年成长与身份选择"]),
  "/works/OL20867W": Object.freeze(["十九世纪英格兰城镇生活", "婚姻、女性与社会风俗", "社会改革、阶层与家庭关系"]),
  "/works/OL157040W": Object.freeze(["禁忌知识与文学伦理", "知识论、道德与宗教边界", "文学、科学与文明关系"]),
  "/works/OL81601W": Object.freeze(["作家 Stephen King 的写作生涯与回忆", "小说创作技巧、语言与修订", "作家身份、阅读与职业经验"]),
  "/works/OL13826369W": Object.freeze(["美国刑事司法与大规模监禁", "种族歧视、隔离与公民权利", "法律制度、社会条件与历史延续"]),
  "/works/OL98487W": Object.freeze(["第二次世界大战与纳粹主义", "间谍身份、战犯审判与囚禁", "黑色幽默、责任与自我叙述"]),
  "/works/OL14921145W": Object.freeze(["计算机科学家 Randy Pausch 的个人生涯", "癌症、告别与生命态度", "家庭关系、自我实现与最后岁月"]),
  "/works/OL17876096W": Object.freeze(["青少年学徒与竞争", "死亡、谋杀与生命伦理", "科学想象中的社会制度"]),
  "/works/OL18819818W": Object.freeze(["美国联邦调查局（FBI）人质谈判与职业生涯", "谈判技巧、说服与情绪识别", "商业沟通、影响与决策"])
});

const BOOK_VALUE_CLAIM_OVERRIDES = Object.freeze({
  "/works/OL16085155W": "作品以 Steve Jobs 的职业生涯连接产品判断、企业文化与个人领导方式，观察技术创新如何在具体组织中被推动",
  "/works/OL17184556W": "作品把 Elon Musk 的创业经历放回航天、电动车与资本组织过程，呈现技术愿景、执行压力和个人选择之间的关系",
  "/works/OL3348011W": "作品从 Anthony Bourdain 的厨房经历进入餐饮行业，揭示后厨劳动、职业文化与经营压力如何共同塑造厨师生涯",
  "/works/OL7944812W": "作品以 Salomon Brothers 的债券业务为入口，观察华尔街激励、交易文化与职业伦理怎样相互作用",
  "/works/OL17082485W": "作品把侦探调查放进巧克力工厂遭到破坏的情境，让线索追索同时关联生产经营、友谊与协作",
  "/works/OL298031W": "作品以甘地的自传经验连接非暴力抵抗、印度民族独立与信仰实践，呈现公共行动如何由个人伦理支撑",
  "/works/OL267174W": "作品通过一名法官面对疾病与死亡的过程，审视社会身份、家庭生活和生命意义之间的落差",
  "/works/OL2636675W": "作品把第二次世界大战、V-2 火箭与制度控制并置，观察战争技术如何进入个人处境、欲望和记忆",
  "/works/OL16592184W": "作品从 Jack Gruener 的囚禁与求生经历出发，讨论大屠杀见证、青少年处境与记忆责任",
  "/works/OL3126628W": "作品由伴侣 Jim Hutton 的私人记忆进入 Freddie Mercury 与 Queen 的音乐生涯，并触及艾滋病、照护和公众形象",
  "/works/OL13805586W": "作品沿着塔拉乌马拉跑者与长跑文化展开调查，把耐力、身体经验和运动社群放进对现代生活方式的重新审视",
  "/works/OL19737574W": "作品把特殊能力者置于独裁制度和反抗行动之间，观察亲密关系、士兵身份与权力秩序如何改变个人选择",
  "/works/OL13061121W": "作品以恐龙和游乐园的失控风险为情境，通过青少年求生过程追问科学想象、技术后果与责任",
  "/works/OL8368435W": "作品借超智能体与 Culture 文明的接触难题，检验能力悬殊的行动者如何承担干预、克制与责任",
  "/works/OL19324556W": "作品以星战人物、太空战争和异星社会为明确入口，观察军事忠诚、帝国秩序与个人选择之间的张力",
  "/works/OL17356883W": "作品把特殊能力与社会阶层放进反乌托邦王权结构，观察一名青年如何在身份限制和反抗行动之间作出选择",
  "/works/OL20867W": "作品以十九世纪英格兰城镇中的婚姻、女性处境和社会改革为入口，呈现家庭选择如何与阶层和公共生活相互作用",
  "/works/OL157040W": "作品围绕禁忌知识在文学、科学与文明中的伦理位置，连接知识论、道德判断和宗教边界",
  "/works/OL81601W": "作品由 Stephen King 的个人回忆进入小说创作实践，把写作技巧、语言修订和作家职业经验放在同一视野",
  "/works/OL13826369W": "作品从美国刑事司法与大规模监禁切入，追踪种族歧视、法律制度和公民权利之间长期延续的结构关系",
  "/works/OL98487W": "作品把第二次世界大战中的间谍身份、纳粹主义与战犯审判并置，借黑色幽默追问个人如何理解自身责任",
  "/works/OL14921145W": "作品由计算机科学家 Randy Pausch 面对癌症与告别的个人经历出发，连接家庭关系、生命态度和自我实现",
  "/works/OL17876096W": "作品让青少年学徒在围绕死亡与谋杀的科学想象制度中接受竞争与选择，追问生命伦理如何被社会规则重新定义",
  "/works/OL18819818W": "作品以 FBI 人质谈判经历为入口，把谈判技巧、情绪识别和商业沟通转化为可理解的说服与决策方法"
});

function translateSubject(subject) {
  const match = SUBJECT_TRANSLATIONS.find(([pattern]) => pattern.test(subject));
  if (match) return match[1];
  if (/^\d{4}-\d{4}$/.test(subject)) return `${subject.replace("-", "至")}年的人物生涯`;
  if (/^[A-Z][A-Za-z'’-]+,\s*[A-Z][A-Za-z'’-]+$/.test(subject) &&
      !/\b(?:apes?|monkeys?|animals?|elephants?|gorillas?|dogs?|cats?|birds?|plants?|insects?)\b/i.test(subject)) {
    const [family, given] = subject.split(",").map((value) => value.trim());
    return `人物经历（${given} ${family}）`;
  }
  return null;
}

function meaningfulBookTopics(row, genre) {
  const subjects = bookSubjects(row);
  const excluded = /^(fiction|juvenile fiction|english fiction|american fiction|children's fiction|children's literature|history|mystery|science fiction|humou?rs?(?: stories)?|ethnicity|adventure|graphic novels?|comic books?(?:, strips)?(?:, etc\.)?|comics & graphic novels, science fiction|new york times bestseller|open library staff picks|translations|large type books|audiobooks?|electronic books?)$/i;
  const genrePattern = genre === "history"
    ? /(historical|history|war|holocaust|biograph|memoir|revolution|politic|social conditions|civilization|jews|african american|women)/i
    : genre === "mystery"
      ? /(mystery|detective|crime|murder|thriller|suspense|noir|espionage|secret|investigat|computer)/i
      : /(science fiction|dystop|space|time travel|robot|\baliens?\b|artificial intelligence|cyber|future|post-apocalyptic)/i;
  const ranked = subjects
    .filter((subject) => subject.length <= 80 && !excluded.test(subject.trim()) && !/^nyt:|^#|history and criticism|science fiction, fantasy, horror/i.test(subject))
    .sort((left, right) => Number(genrePattern.test(right)) - Number(genrePattern.test(left)) || left.length - right.length);
  const translated = [...(BOOK_TOPIC_OVERRIDES[row.key] || [])];
  for (const subject of ranked) {
    if (translated.length >= 3) break;
    const label = translateSubject(subject);
    if (label && !translated.includes(label)) translated.push(label);
  }
  while (translated.length < 2) {
    const fallback = { history: ["历史环境", "人物命运"], mystery: ["线索追索", "信息差"], scifi: ["科学想象", "未来社会"] }[genre][translated.length];
    translated.push(fallback);
  }
  return translated.slice(0, 3);
}

function usesGenericTopicFallback(labels) {
  return labels.some((label) => ["历史环境", "人物命运", "线索追索", "信息差", "科学想象", "未来社会"].includes(label));
}

function chooseCopyVariant(values, seed) {
  return values[stableHashNumber(seed) % values.length];
}

function bookValueClaim(topics, genre, seed) {
  if (BOOK_VALUE_CLAIM_OVERRIDES[seed]) return BOOK_VALUE_CLAIM_OVERRIDES[seed];
  const joined = topics.join("、");
  if (/大屠杀|战争/.test(joined)) return chooseCopyVariant([
    `作品把${joined}落实到个人选择与记忆伦理，而不是只保留宏大事件名称`,
    `作品从${joined}中的普通人处境出发，观察暴力制度如何进入生活与回忆`,
    `作品让${joined}同时承担事件背景和道德压力，突出人在极端环境中的责任`,
    `作品沿着${joined}追索幸存、见证与后代记忆之间并不简单的关系`
  ], seed);
  if (/计算机犯罪|间谍/.test(joined)) return chooseCopyVariant([
    `作品让${joined}成为调查过程的一部分，读者可以观察证据、技术与信任怎样互相制约`,
    `作品借${joined}比较技术线索、制度秘密与调查者判断之间的落差`,
    `作品从${joined}切入信息安全问题，呈现看不见的行动如何留下可追踪证据`,
    `作品把${joined}组织成认识论难题：谁掌握信息，谁又能证明自己的推断`
  ], seed);
  if (/时间旅行/.test(joined)) return chooseCopyVariant([
    `作品借${joined}检验因果、责任与改变过去的代价`,
    `作品通过${joined}追问个人愿望能否承担改写历史后的连锁后果`,
    `作品让${joined}成为因果实验，观察选择怎样反过来改变行动者自身`,
    `作品以${joined}制造时间秩序的裂缝，并由此讨论记忆与责任`
  ], seed);
  if (/人工智能|机器人/.test(joined)) return chooseCopyVariant([
    `作品通过${joined}追问技术边界、主体资格与人的责任`,
    `作品借${joined}检验智能、服从和道德主体之间是否存在清晰界线`,
    `作品把${joined}转化为责任问题：创造者如何面对技术产生的自主后果`,
    `作品沿着${joined}观察人的定义怎样被非人主体重新逼问`
  ], seed);
  if (/反乌托邦|未来社会|政治制度/.test(joined)) return chooseCopyVariant([
    `作品用${joined}检视制度如何塑造个人自由与服从`,
    `作品通过${joined}比较秩序承诺与个体代价之间的距离`,
    `作品让${joined}暴露权力如何借规则、习惯或技术进入日常选择`,
    `作品从${joined}出发，观察理想制度何时转化为控制人的结构`
  ], seed);
  const generic = {
    history: [
      `作品通过${joined}，把时代结构与个人命运并置，适合从具体处境理解历史`,
      `作品从${joined}出发，观察公共事件怎样进入家庭、身份和个人选择`,
      `作品借${joined}连接宏观变迁与微观经验，使历史不只剩年代与结论`,
      `作品沿着${joined}比较制度力量与人物行动，理解两者如何互相塑造`
    ],
    mystery: [
      `作品围绕${joined}组织信息差，适合关注证据顺序、误导与判断如何形成`,
      `作品通过${joined}检验叙述可信度，让读者参与区分线索与诱导`,
      `作品把${joined}编排成认识过程，重点不只是谁做的，也包括为何相信`,
      `作品借${joined}控制已知与未知的边界，呈现判断偏差怎样累积`
    ],
    scifi: [
      `作品借${joined}建立陌生规则，适合观察想象设定如何反照现实选择`,
      `作品通过${joined}推演规则变化后的社会后果，使设定服务于现实追问`,
      `作品把${joined}当作思想实验，检验人在新条件下仍需承担什么责任`,
      `作品沿着${joined}扩展现实尺度，并以陌生世界重新衡量熟悉价值`
    ]
  };
  return chooseCopyVariant(generic[genre], seed);
}

function bookSeriesSignal(title) {
  return /\b(?:book|volume|vol\.?|part)\s*(?:[2-9]|ii|iii|iv|v|vi|vii|viii|ix|x)\b|(?:#|第)\s*[2-9一二三四五六七八九十]+\s*(?:卷|部|册)?/iu.test(String(title));
}

function makeBook(record, genre, expansionAudit) {
  const row = record.row;
  const title = String(row.title).trim();
  const author = String(row.author_name[0]).trim();
  const snapshotDate = String(expansionAudit.manifest.completedAt).slice(0, 10);
  const snapshotYear = Number(snapshotDate.slice(0, 4));
  const yearWithheldForConflict = BOOK_YEAR_WITHHOLD_IDS.has(row.key);
  const year = yearWithheldForConflict ? 0 : displayBookYear(row.first_publish_year, snapshotYear);
  const ratingValue = Number(Number(row.ratings_average).toFixed(6));
  const ratingCount = Number(row.ratings_count);
  const tier = bookTier(ratingCount);
  const pages = Number.isInteger(Number(row.number_of_pages_median)) ? Number(row.number_of_pages_median) : null;
  const topicLabels = meaningfulBookTopics(row, genre);
  const topics = topicLabels.join("、");
  const focus = topicLabels.slice(0, 2).join("、");
  const valueClaim = bookValueClaim(topicLabels, genre, row.key);
  const genreOverride = BOOK_PRIMARY_GENRE_OVERRIDES[row.key] || null;
  const variant = stableHashNumber(row.key) % BOOK_SUMMARY_PATTERNS.length;
  const context = {
    title,
    author,
    topics,
    focus,
    valueClaim,
    rating: ratingValue.toFixed(2),
    count: ratingCount,
    tierText: tierText(tier)
  };
  const seriesSignal = bookSeriesSignal(title);
  const sourceFiles = record.evidenceEntries.map((entry) => entry.file);
  const sourceHashes = record.evidenceEntries.map((entry) => entry.sha256);
  return {
    id: row.key,
    type: "book",
    genre,
    genreLabel: `${GENRE_LABEL[genre]}·证据复核`,
    title,
    titleZh: /[\p{Script=Han}]/u.test(title) ? title : `${title}（原名）`,
    originalTitle: title,
    year,
    creator: author,
    detail: pages ? `约 ${pages} 页` : "页数因版本而异",
    summary: BOOK_SUMMARY_PATTERNS[variant](context),
    reason: BOOK_REASON_PATTERNS[(variant + 5) % BOOK_REASON_PATTERNS.length](context),
    image: `https://covers.openlibrary.org/b/id/${Number(row.cover_i)}-L.jpg`,
    sourceUrl: `https://openlibrary.org${row.key}`,
    genres: [...new Set([genre, ...record.primaryGenres])],
    author: { zh: author, common: author },
    pagesEstimate: pages,
    coverId: Number(row.cover_i),
    palette: stableColor(row.key),
    visual: stableColor(row.key),
    tags: [GENRE_LABEL[genre], decadeTag(year), tierText(tier), "证据复核"],
    audience: `适合希望从${focus}进入${GENRE_LABEL[genre]}阅读、同时愿意在选购前核对译本和版本的读者`,
    genreRationale: genreOverride
      ? `该 Work ID 的冻结查询成员关系为${record.sourceMembership.map((key) => `“${key}”`).join("、")}，主题字段包含${topics}；逐项语义复核后将主类修正为${GENRE_LABEL[genre]}，不把查询桶名直接当作最终题材。`
      : `该 Work ID 出现在冻结的${record.sourceMembership.map((key) => `“${key}”`).join("、")}响应中，且主题字段包含${topics}；主类据此登记为${GENRE_LABEL[genre]}。`,
    series: seriesSignal ? "系列关系待核" : null,
    installment: null,
    standaloneFriendly: !seriesSignal,
    prerequisite: seriesSignal ? "标题含卷次信号；开始阅读前请在作品页核对系列顺序。" : null,
    contentNotes: ["具体分级与敏感内容需按所选版本核对", ...(seriesSignal ? ["可能存在系列前置阅读"] : [])],
    evidenceNote: `Open Library Work ID ${row.key} 已绑定冻结评分行、作者、封面和主题成员关系；证据文件 ${sourceFiles.join("、")}，不据此宣称已通读作品。`,
    status: "keep",
    recommendedGenre: genre,
    metadataFlags: [
      "item-level evidence review; not represented as fully read",
      "display title preserves the source title when no verified Chinese edition title is available",
      ...(year ? [] : [yearWithheldForConflict
        ? "first-publication year withheld because the edition-aggregated source value conflicts with the Work's award chronology"
        : "first-publication year withheld because the source value is outside the conservative display range"])
    ],
    rating: {
      source: "Open Library",
      value: ratingValue,
      max: 5,
      count: ratingCount,
      snapshot: snapshotDate,
      endpoint: record.evidenceEntries[0].effectiveUrl || record.evidenceEntries[0].requestedUrl
    },
    popularityTier: tier,
    metadataAudit: {
      checkedAt: expansionAudit.manifest.completedAt,
      evidenceFiles: sourceFiles,
      evidenceSha256: sourceHashes,
      evidenceRecordType: "Open Library Search API Work row",
      openLibraryTitle: title,
      openLibraryFirstPublishYear: Number.isInteger(Number(row.first_publish_year)) ? Number(row.first_publish_year) : null,
      displayFirstPublishYear: year || null,
      firstPublicationYearDecision: yearWithheldForConflict ? "withheld-source-conflict" : (year ? "source-value-displayed" : "withheld-outside-conservative-range"),
      sourceQueryMembership: record.sourceMembership,
      sourceSubjects: bookSubjects(row),
      primaryGenreOverrideApplied: Boolean(genreOverride),
      specificitySignals: topicLabels,
      specificityFallbackUsed: usesGenericTopicFallback(topicLabels),
      valueClaim,
      copyVariant: variant,
      coverIdPresentInSearchRow: true
    },
    pagesEstimateSource: "Open Library Search API number_of_pages_median; edition-aggregated and approximate",
    curationLevel: "evidence-reviewed",
    evidenceReview: {
      sourceFile: relative(expansionAudit.manifestPath),
      sourceSha256: expansionAudit.pointer.sha256,
      sourceGenre: genre,
      status: "keep",
      recommendedGenre: genre,
      boundary: "Frozen metadata, threshold, genre and copy evidence review; not a claim of full reading or the same editorial depth as the original 200."
    }
  };
}

function gatherBookCandidates(expansionAudit, legacyIds) {
  const byId = new Map();
  for (const genre of GENRES) {
    for (const sourceKey of BOOK_SOURCE_KEYS[genre]) {
      const entry = expansionAudit.byId.get(`open-library-qualified-${sourceKey}`);
      assert(entry, `missing Open Library expansion evidence: ${sourceKey}`);
      const payload = readJson(entry.filePath);
      assert(Array.isArray(payload.docs), `Open Library expansion response has no docs: ${sourceKey}`);
      for (const row of payload.docs) {
        const id = String(row.key || "");
        if (!/^\/works\/OL\d+W$/.test(id) || legacyIds.has(id) || BOOK_REJECT_IDS.has(id)) continue;
        if (Number(row.ratings_average) < BOOK_RATING_MIN || Number(row.ratings_count) < BOOK_COUNT_MIN) continue;
        if (!(Number(row.cover_i) > 0) || !Array.isArray(row.author_name) || !row.author_name.length || !String(row.title || "").trim()) continue;
        if (!subjectEvidenceSupports(row, genre, sourceKey)) continue;
        if (!byId.has(id)) byId.set(id, { row, primaryGenres: [], sourceMembership: [], evidenceEntries: [] });
        const record = byId.get(id);
        if (!record.primaryGenres.includes(genre)) record.primaryGenres.push(genre);
        if (!record.sourceMembership.includes(sourceKey)) record.sourceMembership.push(sourceKey);
        if (!record.evidenceEntries.some((candidate) => candidate.id === entry.id)) record.evidenceEntries.push(entry);
      }
    }
  }
  for (const [id, genre] of Object.entries(BOOK_PRIMARY_GENRE_OVERRIDES)) {
    const record = byId.get(id);
    assert(GENRES.includes(genre), `invalid primary-genre override for ${id}: ${genre}`);
    if (record) record.primaryGenres = [genre];
  }
  return byId;
}

function sortedCandidates(candidates, tierFunction) {
  return [...candidates].sort((left, right) => {
    const leftRating = Number(left.row ? left.row.ratings_average : left.rating.value);
    const rightRating = Number(right.row ? right.row.ratings_average : right.rating.value);
    const leftCount = Number(left.row ? left.row.ratings_count : left.rating.count);
    const rightCount = Number(right.row ? right.row.ratings_count : right.rating.count);
    const tierOrder = { underseen: 0, mid: 1, classic: 2 };
    const tierDifference = tierOrder[tierFunction(leftCount)] - tierOrder[tierFunction(rightCount)];
    return tierDifference || rightRating - leftRating || rightCount - leftCount || String(left.row ? left.row.key : left.meta.id).localeCompare(String(right.row ? right.row.key : right.meta.id));
  });
}

function selectByTier(options) {
  const {
    byId, genreOrder, targets, tierFunction, creatorOf, idOf, creatorCounts, creatorMaximum,
    flexibleTiers = false, tierOrder = ["underseen", "mid", "classic"],
    secondaryKeyOf = null, secondaryCounts = {}, secondaryMaximum = Infinity
  } = options;
  const used = new Set();
  const selected = Object.fromEntries(genreOrder.map((genre) => [genre, []]));
  const canSelect = (record) => {
    const id = idOf(record);
    const creator = creatorOf(record);
    const secondaryKey = secondaryKeyOf ? secondaryKeyOf(record) : null;
    return !used.has(id) && (creatorCounts[creator] || 0) < creatorMaximum &&
      (secondaryKey === null || (secondaryCounts[secondaryKey] || 0) < secondaryMaximum);
  };
  const take = (record, genre) => {
    const id = idOf(record);
    const creator = creatorOf(record);
    const secondaryKey = secondaryKeyOf ? secondaryKeyOf(record) : null;
    selected[genre].push(record);
    used.add(id);
    creatorCounts[creator] = (creatorCounts[creator] || 0) + 1;
    if (secondaryKey !== null) secondaryCounts[secondaryKey] = (secondaryCounts[secondaryKey] || 0) + 1;
  };
  for (const genre of genreOrder) {
    const candidates = sortedCandidates([...byId.values()].filter((record) => record.primaryGenres.includes(genre)), tierFunction);
    for (const tier of tierOrder) {
      const target = targets[genre][tier];
      for (const record of candidates) {
        if (selected[genre].filter((candidate) => tierFunction(candidate.row ? candidate.row.ratings_count : candidate.rating.count) === tier).length >= target) break;
        if (tierFunction(record.row ? record.row.ratings_count : record.rating.count) !== tier || !canSelect(record)) continue;
        take(record, genre);
      }
      const actual = selected[genre].filter((candidate) => tierFunction(candidate.row ? candidate.row.ratings_count : candidate.rating.count) === tier).length;
      if (!flexibleTiers) assert(actual === target, `could not satisfy ${genre} ${tier} target: ${actual}/${target}`);
    }
    const genreTarget = Object.values(targets[genre]).reduce((sum, value) => sum + value, 0);
    if (flexibleTiers) {
      for (const record of candidates) {
        if (selected[genre].length >= genreTarget) break;
        if (canSelect(record)) take(record, genre);
      }
    }
    assert(selected[genre].length === genreTarget, `could not satisfy ${genre} total target: ${selected[genre].length}/${genreTarget}`);
  }
  assert(used.size === EXPANSION_COUNT, `selection must contain exactly ${EXPANSION_COUNT} unique additions; got ${used.size}`);
  return selected;
}

function buildBooks(expansionAudit) {
  const legacy = readJson(LEGACY_BOOKS_PATH);
  assert(Array.isArray(legacy.books) && legacy.books.length === LEGACY_COUNT, "books200.json must contain exactly 200 books");
  const legacyIds = new Set(legacy.books.map((item) => item.id));
  assert(legacyIds.size === LEGACY_COUNT, "books200.json contains duplicate IDs");
  const candidates = gatherBookCandidates(expansionAudit, legacyIds);
  const creatorCounts = countBy(legacy.books, (item) => item.author?.common || item.creator);
  const titleCreatorCounts = countBy(legacy.books, (item) => `${normalizedText(item.originalTitle || item.title)}|${normalizedText(item.author?.common || item.creator)}`);
  const selected = selectByTier({
    byId: candidates,
    genreOrder: ["scifi", "mystery", "history"],
    targets: BOOK_TIER_TARGETS,
    tierFunction: bookTier,
    creatorOf: (record) => String(record.row.author_name[0]),
    idOf: (record) => record.row.key,
    creatorCounts,
    creatorMaximum: BOOK_CREATOR_MAX,
    flexibleTiers: true,
    tierOrder: ["classic", "mid", "underseen"],
    secondaryKeyOf: (record) => `${normalizedText(record.row.title)}|${normalizedText(record.row.author_name[0])}`,
    secondaryCounts: titleCreatorCounts,
    secondaryMaximum: 1
  });
  const additions = disambiguateAdditionTitles(
    legacy.books,
    GENRES.flatMap((genre) => selected[genre].map((record) => makeBook(record, genre, expansionAudit)))
  );
  const combinedBooks = [...legacy.books, ...additions];
  assert(JSON.stringify(combinedBooks.slice(0, LEGACY_COUNT)) === JSON.stringify(legacy.books), "the original 200 books changed");
  const books = applySeriesOverrides(combinedBooks, "book");
  validatePool(books, books.slice(LEGACY_COUNT), "book");
  const authorCounts = countBy(books, (item) => item.author?.common || item.creator);
  return {
    schemaVersion: 4,
    snapshotDate: legacy.snapshotDate,
    expansionSnapshotDate: String(expansionAudit.manifest.completedAt).slice(0, 10),
    retrievedAt: expansionAudit.manifest.completedAt,
    source: {
      legacyPool: relative(LEGACY_BOOKS_PATH),
      expansionManifest: relative(expansionAudit.manifestPath),
      expansionManifestSha256: expansionAudit.pointer.sha256,
      seriesOverrides: relative(SERIES_OVERRIDES_PATH),
      seriesOverridesSha256: fileSha256(SERIES_OVERRIDES_PATH),
      licensing: "https://openlibrary.org/developers/licensing",
      boundary: "Expansion ratings are frozen Open Library Work-level fields; cover reuse has a separate rights boundary. No Douban data is collected or displayed."
    },
    selectionRules: {
      finalCount: FINAL_COUNT,
      preservedPrefixCount: LEGACY_COUNT,
      addedCount: EXPANSION_COUNT,
      ratingMinimum: BOOK_RATING_MIN,
      ratingCountMinimum: BOOK_COUNT_MIN,
      primaryGenreTierTargets: BOOK_TIER_TARGETS,
      creatorMaximum: BOOK_CREATOR_MAX,
      curationBoundary: "The original 200 objects remain byte-for-byte equivalent after JSON parsing. The 300 additions are evidence-reviewed for source, threshold, genre metadata and copy completeness; they are not promoted to the original editorial tiers or represented as fully read."
    },
    counts: {
      total: books.length,
      preservedPrefix: LEGACY_COUNT,
      additions: additions.length,
      primaryGenre: countBy(books, (item) => item.genre),
      additionPrimaryGenre: countBy(additions, (item) => item.genre),
      popularityTier: countBy(books, (item) => item.popularityTier),
      curationLevel: countBy(books, (item) => item.curationLevel),
      distinctAuthorLabels: Object.keys(authorCounts).length,
      maximumBooksByOneAuthorLabel: Math.max(...Object.values(authorCounts))
    },
    books
  };
}

async function readImdbRatings(filePath, wantedIds) {
  const ratings = new Map();
  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headerSeen = false;
  for await (const line of lines) {
    if (!headerSeen) {
      assert(line === "tconst\taverageRating\tnumVotes", "unexpected IMDb ratings header");
      headerSeen = true;
      continue;
    }
    const [id, ratingRaw, countRaw] = line.split("\t");
    if (!wantedIds.has(id)) continue;
    ratings.set(id, { value: Number(ratingRaw), count: Number(countRaw), rawLine: line });
  }
  assert(headerSeen, "IMDb ratings snapshot is empty");
  return ratings;
}

function gatherMovieMetadata(baseAudit, expansionAudit, legacyIds) {
  const combinedEntries = new Map([...baseAudit.byId, ...expansionAudit.byId]);
  const byId = new Map();
  for (const genre of GENRES) {
    for (const source of MOVIE_SOURCE_KEYS[genre]) {
      for (const skip of source.skips) {
        const entry = combinedEntries.get(`cinemeta-${source.key}-${skip}`);
        assert(entry, `missing Cinemeta evidence: ${source.key}-${skip}`);
        const payload = readJson(entry.filePath);
        assert(Array.isArray(payload.metas), `Cinemeta response has no metas: ${source.key}-${skip}`);
        for (const meta of payload.metas) {
          const id = String(meta.id || meta.imdb_id || "");
          if (!/^tt\d{7,10}$/.test(id) || legacyIds.has(id) || MOVIE_REJECT_IDS.has(id)) continue;
          if (!byId.has(id)) byId.set(id, { meta, primaryGenres: [], sourceMembership: [], evidenceEntries: [] });
          const record = byId.get(id);
          if (!record.primaryGenres.includes(genre)) record.primaryGenres.push(genre);
          if (!record.sourceMembership.includes(source.key)) record.sourceMembership.push(source.key);
          if (!record.evidenceEntries.some((candidate) => candidate.id === entry.id)) record.evidenceEntries.push(entry);
        }
      }
    }
  }
  return byId;
}

function parseReleaseTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function validMovieRecord(record, rating, cutoffTimestamp) {
  const meta = record.meta;
  if (!rating || rating.value < MOVIE_RATING_MIN || rating.count < MOVIE_COUNT_MIN) return false;
  if (meta.type !== "movie" || !String(meta.name || "").trim()) return false;
  if (!Array.isArray(meta.director) || !meta.director.length || !String(meta.description || "").trim()) return false;
  if (!(parseReleaseTimestamp(meta.released) <= cutoffTimestamp)) return false;
  const sourceGenres = Array.isArray(meta.genres) ? meta.genres.map(String) : [];
  const allowed = {
    history: ["History", "Biography", "War"],
    mystery: ["Mystery", "Thriller", "Crime", "Film-Noir"],
    scifi: ["Sci-Fi"]
  };
  record.primaryGenres = record.primaryGenres.filter((genre) => allowed[genre].some((label) => sourceGenres.includes(label)));
  return record.primaryGenres.length > 0;
}

const MOVIE_CONTENT_OVERRIDES = Object.freeze({
  tt24082438: Object.freeze({
    signals: Object.freeze(["马里乌波尔围城与记者现场", "战争影像、平民处境与公共证据"]),
    focus: "战争现场、记者见证与平民处境",
    valueClaim: "影片由记者在马里乌波尔围城期间保存现场影像，呈现平民处境，并追问战争见证如何转化为可核验的公共证据"
  }),
  tt4044364: Object.freeze({
    signals: Object.freeze(["斯诺登 Edward Snowden、香港会面与监控披露", "记者记录、数字权利与公共证据"]),
    focus: "大规模监控、泄密判断与记者见证",
    valueClaim: "影片记录 Edward Snowden 在香港披露大规模监控的过程，观察泄密判断、数字权利与记者保存公共证据之间的责任"
  }),
  tt0074896: Object.freeze({
    signals: Object.freeze(["先知穆罕默德与一神启示", "伊斯兰共同体的形成与时代处境"]),
    focus: "宗教史、信仰传播与共同体形成",
    valueClaim: "影片从先知穆罕默德与一神启示出发，观察伊斯兰共同体如何在具体时代处境中形成"
  }),
  tt0106469: Object.freeze({
    signals: Object.freeze(["继兄弟、表亲与双族裔身份", "犯罪环境与人生分岔"]),
    focus: "族裔身份、亲属关系与犯罪选择",
    valueClaim: "影片围绕继兄弟和双族裔表亲在犯罪环境中的人生分岔，观察亲属关系、族裔身份与选择如何改变彼此命运"
  }),
  tt0077928: Object.freeze({
    signals: Object.freeze(["毒品走私与跨境后果", "监禁、求生与制度压力"]),
    focus: "跨境犯罪后果、监禁与自由代价",
    valueClaim: "影片以毒品走私导致的跨境监禁为起点，呈现制度暴力、求生意志与自由代价"
  }),
  tt0427309: Object.freeze({
    signals: Object.freeze(["大学辩论队与公共表达", "种族制度、教育与集体成长"]),
    focus: "公共表达、教育机会与种族制度",
    valueClaim: "影片围绕1930年代黑人大学辩论队的训练与竞赛，呈现公共表达、教育机会与种族制度之间的关系"
  }),
  tt0103939: Object.freeze({
    signals: Object.freeze(["卓别林的喜剧创作与银幕人物", "艺术家生涯与电影工业"]),
    focus: "电影创作、公众形象与时代压力",
    valueClaim: "影片把卓别林的银幕创作与私人生活并置，观察艺术家如何在电影工业和时代压力中塑造公众形象"
  }),
  tt1028532: Object.freeze({
    signals: Object.freeze(["秋田犬、陪伴与忠诚", "人与犬的长期关系"]),
    focus: "陪伴、忠诚与面对失去",
    valueClaim: "影片通过教授与秋田犬长期相伴的关系，讨论忠诚、等待与日常陪伴如何沉淀为面对失去的情感记忆"
  }),
  tt0099077: Object.freeze({
    signals: Object.freeze(["神经疾病、治疗试验与病患尊严", "医患关系与短暂苏醒"]),
    focus: "治疗边界、病患尊严与医疗责任",
    valueClaim: "影片围绕神经科医生、长期失去反应的病人与治疗试验，讨论短暂苏醒、病患尊严和医疗责任"
  }),
  tt0455590: Object.freeze({
    signals: Object.freeze(["乌干达独裁者 Idi Amin 与私人医生视角", "权力诱惑、恐惧与道德责任"]),
    focus: "独裁权力、共谋风险与个人责任",
    valueClaim: "影片从私人医生接近 Idi Amin 政权的视角，呈现权力诱惑如何转化为恐惧、共谋与道德责任"
  }),
  tt1091191: Object.freeze({
    signals: Object.freeze(["阿富汗军事行动与小队求生", "战场判断、伙伴忠诚与牺牲"]),
    focus: "战争行动、求生与伙伴责任",
    valueClaim: "影片以阿富汗军事行动和小队求生为中心，讨论战场判断、伙伴忠诚与牺牲的代价"
  }),
  tt0057012: Object.freeze({
    signals: Object.freeze(["核威慑、误判与全球毁灭风险", "军事官僚、政治荒诞与失控机制"]),
    focus: "核战争风险、制度误判与黑色讽刺",
    valueClaim: "影片用核威慑链条中的误判和官僚失控制造黑色喜剧，追问制度如何把一次命令扩大为全球毁灭风险"
  }),
  tt1727824: Object.freeze({
    signals: Object.freeze(["摇滚乐队 Queen 与 Freddie Mercury 的生涯", "音乐创作、名望与私人代价"]),
    focus: "音乐创作、公众成功与私人生活",
    valueClaim: "影片围绕 Freddie Mercury 与 Queen 乐队的创作、名望和关系变化，观察公众成功与私人代价如何相互拉扯"
  }),
  tt0045555: Object.freeze({
    signals: Object.freeze(["警探与犯罪集团", "腐败权力、复仇与执法边界"]),
    focus: "犯罪集团、制度腐败与执法选择",
    valueClaim: "影片沿着警探对犯罪集团的追查，揭示腐败权力、私人复仇与执法边界如何彼此纠缠"
  }),
  tt0047296: Object.freeze({
    signals: Object.freeze(["码头工人、腐败工会与告发选择", "劳动尊严、亲情与制度压力"]),
    focus: "工会腐败、个人良知与劳动尊严",
    valueClaim: "影片让码头工人在腐败工会、亲情与告发之间作出选择，讨论劳动尊严与个人良知的代价"
  }),
  tt1924396: Object.freeze({
    signals: Object.freeze(["艺术拍卖、收藏与关系操控", "鉴定眼光、孤独与欺骗"]),
    focus: "专业判断、亲密操控与认知盲点",
    valueClaim: "影片把艺术拍卖、收藏鉴定与亲密关系中的操控并置，观察专业判断为何会在孤独和欲望中失效"
  }),
  tt0240772: Object.freeze({
    signals: Object.freeze(["赌场劫案与精密分工", "计划、伪装与团队协作"]),
    focus: "劫案设计、信息控制与团队执行",
    valueClaim: "影片以同时抢劫三家赌场的计划为核心，观看价值在精密分工、伪装、时间控制与团队执行如何咬合"
  }),
  tt1950186: Object.freeze({
    signals: Object.freeze(["福特车队、赛车工程与企业目标", "Carroll Shelby、Ken Miles 与勒芒竞赛"]),
    focus: "赛车工程、车手判断与企业压力",
    valueClaim: "影片围绕福特挑战法拉利的勒芒计划，把赛车工程、车手判断与企业干预放进同一竞速目标"
  }),
  tt0758742: Object.freeze({
    signals: Object.freeze(["死亡笔记、Light Yagami 与连环死亡", "侦探追索、私刑正义与道德边界"]),
    focus: "致命规则、智力对决与正义边界",
    valueClaim: "影片以死亡笔记的致命规则连接 Light Yagami 与调查者的智力对决，追问私刑正义如何转化为权力失控"
  }),
  tt1899353: Object.freeze({
    signals: Object.freeze(["特警突袭与封闭公寓", "犯罪首脑、伏击与小队求生"]),
    focus: "封闭空间、警察行动与求生压力",
    valueClaim: "影片把一次特警突袭困在被犯罪集团控制的公寓中，以封闭空间、连续伏击和小队求生推进动作压力"
  }),
  tt0381849: Object.freeze({
    signals: Object.freeze(["押送亡命徒前往火车站", "农场主、承诺与道德选择"]),
    focus: "押送任务、心理较量与个人承诺",
    valueClaim: "影片围绕农场主押送亡命徒赶上火车的任务，观察心理较量、利益诱惑和个人承诺如何改变双方判断"
  }),
  tt3397884: Object.freeze({
    signals: Object.freeze(["美墨边境缉毒行动", "执法机构、毒品网络与道德边界"]),
    focus: "边境缉毒、制度手段与执法伦理",
    valueClaim: "影片从美墨边境缉毒行动进入执法灰区，观察机构目标、毒品网络与个人道德界限如何彼此冲突"
  }),
  tt0097441: Object.freeze({
    signals: Object.freeze(["美国南北战争中的非裔士兵", "第54马萨诸塞志愿步兵团与军队制度"]),
    focus: "南北战争、黑人军团与种族制度",
    valueClaim: "影片围绕美国南北战争中的非裔士兵和第54马萨诸塞志愿步兵团，呈现军队制度、种族偏见与战场责任"
  }),
  tt1220719: Object.freeze({
    signals: Object.freeze(["日占时期的佛山与咏春武术", "尊严、武术传承与殖民压迫"]),
    focus: "日占佛山、咏春武术与个人尊严",
    valueClaim: "影片把咏春武术置于日占时期的佛山，借叶问的选择讨论武术传承、个人尊严与殖民压迫"
  }),
  tt0758758: Object.freeze({
    signals: Object.freeze(["离开既定生活的长途旅行", "荒野生存、自我追寻与关系代价"]),
    focus: "远行、荒野生存与自我选择",
    valueClaim: "影片沿着主人公放下财产并走向荒野的旅程，观察自我追寻、自然风险与关系代价如何彼此牵连"
  }),
  tt1424432: Object.freeze({
    signals: Object.freeze(["车手 Ayrton Senna 与一级方程式赛车", "竞技天赋、风险与车手生涯"]),
    focus: "一级方程式、车手判断与竞技风险",
    valueClaim: "影片以 Ayrton Senna 的一级方程式生涯为轴，观察竞技天赋、车手判断、制度竞争与赛道风险"
  }),
  tt1313104: Object.freeze({
    signals: Object.freeze(["日本太地町的海豚捕猎", "影像取证、环保行动与公共争议"]),
    focus: "海豚捕猎、隐蔽记录与环保行动",
    valueClaim: "影片围绕日本太地町的海豚捕猎展开隐蔽记录，连接动物伤害、环保行动、公共健康与影像取证伦理"
  }),
  tt2125608: Object.freeze({
    signals: Object.freeze(["音乐人 Rodriguez 的失踪传说", "南非乐迷的追寻与音乐影响"]),
    focus: "音乐传播、寻访过程与被遗忘的生涯",
    valueClaim: "影片跟随南非乐迷寻找音乐人 Rodriguez，观察作品传播、失踪传说与一段被忽视的音乐生涯如何重新相遇"
  }),
  tt2870648: Object.freeze({
    signals: Object.freeze(["歌手 Amy Winehouse 的音乐生涯", "创作、名望、成瘾与媒体凝视"]),
    focus: "音乐创作、公众名望与私人困境",
    valueClaim: "影片沿着 Amy Winehouse 的创作与演唱生涯，观察名望、成瘾、亲密关系和媒体凝视怎样共同挤压私人生活"
  }),
  tt1398426: Object.freeze({
    signals: Object.freeze(["说唱组合 N.W.A. 与康普顿音乐现场", "音乐表达、城市经验与公共争议"]),
    focus: "嘻哈创作、城市处境与群体生涯",
    valueClaim: "影片围绕 N.W.A. 在1980年代康普顿形成的音乐生涯，观察嘻哈表达如何连接城市经验、群体关系与公共争议"
  }),
  tt0361862: Object.freeze({
    signals: Object.freeze(["长期失眠与逐渐动摇的理智", "工业工人的日常、罪疚与现实判断"]),
    focus: "失眠、罪疚与不可靠的现实感",
    valueClaim: "影片从一名工业工人持续一年的失眠切入，让身体耗竭、罪疚和逐渐动摇的现实判断彼此强化"
  }),
  tt1132620: Object.freeze({
    signals: Object.freeze(["失踪四十年的 Harriet Vanger", "调查记者 Mikael Blomkvist 与家族秘密"]),
    focus: "失踪案、调查报道与家族隐秘",
    valueClaim: "影片围绕 Harriet Vanger 的长期失踪案展开，让调查记者重组家族关系、旧记录与相互矛盾的信息"
  }),
  tt0119396: Object.freeze({
    signals: Object.freeze(["空乘 Jackie Brown、走私与 ATF 压力", "线人选择、犯罪交易与自保计划"]),
    focus: "走私指控、线人压力与自保布局",
    valueClaim: "影片把空乘 Jackie Brown 置于 ATF、军火交易者和自身生存之间，观看重点在她如何利用信息差重排各方计划"
  }),
  tt0039689: Object.freeze({
    signals: Object.freeze(["私家侦探试图逃离旧日身份", "腐败、背叛与无法摆脱的过去"]),
    focus: "旧案回返、背叛与黑色电影宿命",
    valueClaim: "影片让一名隐居小镇的前私家侦探重新面对旧日关系，在腐败、背叛和自我选择之间形成黑色电影式压力"
  }),
  tt0042208: Object.freeze({
    signals: Object.freeze(["珠宝劫案与执行计划", "背叛、坏运气与警方追捕"]),
    focus: "劫案执行、团队裂缝与行动后果",
    valueClaim: "影片从一场按计划推进的珠宝劫案出发，观察背叛、偶然和警方行动如何使精密分工逐步瓦解"
  }),
  tt0109707: Object.freeze({
    signals: Object.freeze(["导演 Edward D. Wood Jr. 的电影创作", "低成本片场、抱负与能力落差"]),
    focus: "电影创作、个人抱负与边缘片场",
    valueClaim: "影片围绕 Edward D. Wood Jr. 坚持拍片的经历，观察创作抱负、能力局限和边缘电影社群如何共同维持行动"
  }),
  tt1074638: Object.freeze({
    signals: Object.freeze(["James Bond、M 与 MI6 遭袭", "旧事回返、忠诚考验与个人代价"]),
    focus: "情报机构危机、忠诚与旧事后果",
    valueClaim: "影片以 MI6 遭袭和 M 的旧事回返为核心，检验 James Bond 的忠诚如何在机构责任与私人代价之间承压"
  }),
  tt0087843: Object.freeze({
    signals: Object.freeze(["禁酒时期黑帮与三十五年后的回望", "旧日犯罪、悔恨与记忆"]),
    focus: "犯罪往事、时间回望与悔恨",
    valueClaim: "影片让一名旧日黑帮成员在三十五年后回望禁酒时期的关系与犯罪，观察记忆如何被悔恨和自我辩解重新组织"
  }),
  tt0101507: Object.freeze({
    signals: Object.freeze(["洛杉矶 Crenshaw 社区的三名青年", "族裔、关系、暴力与人生前景"]),
    focus: "社区环境、青年成长与暴力压力",
    valueClaim: "影片跟随洛杉矶 Crenshaw 社区三名青年的成长，把族裔处境、家庭关系、暴力和人生前景放进日常选择"
  }),
  tt0024184: Object.freeze({
    signals: Object.freeze(["科学家获得隐形能力", "技术突破、理智失控与责任"]),
    focus: "隐形技术、理智变化与科学责任",
    valueClaim: "影片把隐形能力从科学突破转化为人格与责任的压力测试，观察失去外部约束后理智和权力如何失控"
  }),
  tt0266697: Object.freeze({
    signals: Object.freeze(["刺客从四年昏迷中醒来", "背叛、复仇名单与暴力循环"]),
    focus: "复仇行动、刺客关系与暴力代价",
    valueClaim: "影片从一名刺客苏醒后的复仇名单展开，以连续行动呈现背叛、身体训练和暴力循环如何推动选择"
  }),
  tt0080455: Object.freeze({
    signals: Object.freeze(["Blues 兄弟重组 R&B 乐队", "拯救孤儿院、追逐与音乐行动"]),
    focus: "乐队重组、音乐表演与荒诞追逐",
    valueClaim: "影片让 Blues 兄弟在限期内重组 R&B 乐队并筹款拯救孤儿院，以音乐表演和荒诞追逐连接团队行动"
  }),
  tt0109424: Object.freeze({
    signals: Object.freeze(["两名香港警察的两段爱情", "失恋、偶遇与城市节奏"]),
    focus: "都市孤独、亲密关系与偶遇",
    valueClaim: "影片以两名香港警察的两段爱情为轴，通过失恋、偶遇和重复日常捕捉城市生活中的孤独与亲近"
  }),
  tt1855199: Object.freeze({
    signals: Object.freeze(["洛杉矶两名巡警的日常执法", "搭档友谊、职业风险与纪实风格"]),
    focus: "巡警日常、伙伴关系与职业风险",
    valueClaim: "影片以纪实风格跟随洛杉矶两名巡警的日常工作，把搭档友谊、街头判断和职业风险放在同一视角"
  }),
  tt0073195: Object.freeze({
    signals: Object.freeze(["巨型鲨鱼袭击海滩社区", "警察局长、海洋生物学家与猎鲨行动"]),
    focus: "鲨鱼威胁、公共安全与猎捕协作",
    valueClaim: "影片围绕巨型鲨鱼对海滩社区的威胁展开，让警察局长、海洋生物学家和船员在公共安全与风险判断中协作"
  }),
  tt0315733: Object.freeze({
    signals: Object.freeze(["一场事故连接三个人物", "疾病、丧亲、前科与生命重量"]),
    focus: "事故后果、哀伤与相互牵连的人生",
    valueClaim: "影片用一场事故连接重病数学家、丧亲母亲和重新生活的前科者，以交错结构讨论失去、责任与生命重量"
  }),
  tt2334649: Object.freeze({
    signals: Object.freeze(["Oscar Grant 在2008年的最后一天", "家庭、朋友与湾区社区生活"]),
    focus: "日常生活、家庭关系与社会处境",
    valueClaim: "影片跟随 Oscar Grant 在2008年最后一天与家人、朋友和陌生人的相遇，让普通日常承载人物与社区处境"
  }),
  tt0375679: Object.freeze({
    signals: Object.freeze(["洛杉矶多线人物与种族张力", "偏见、误解与相互碰撞的生活"]),
    focus: "种族偏见、多线叙事与城市关系",
    valueClaim: "影片让洛杉矶多组人物的生活彼此碰撞，通过偏见、误解和权力差异观察种族张力如何进入日常关系"
  }),
  tt0088680: Object.freeze({
    signals: Object.freeze(["Paul Hackett 在 Soho 的荒诞夜晚", "偶遇、误会与不断升级的连锁事件"]),
    focus: "都市夜行、偶然与失控喜剧",
    valueClaim: "影片跟随 Paul Hackett 在 Soho 的一夜遭遇，让偶遇、误会和错误决定逐步累积成难以脱身的荒诞连锁"
  }),
  tt0264464: Object.freeze({
    signals: Object.freeze(["少年伪造者 Frank Abagnale", "冒充身份、FBI 追捕与信任博弈"]),
    focus: "身份伪造、追捕关系与信任操控",
    valueClaim: "影片围绕 Frank Abagnale 的身份伪造和 FBI 追捕展开，观察魅力、制度信任与追逐关系如何彼此推动"
  }),
  tt0083987: Object.freeze({
    signals: Object.freeze(["甘地与印度非暴力独立运动", "殖民统治、群众行动与政治伦理"]),
    focus: "印度独立、非暴力抗争与公共领导",
    valueClaim: "影片沿着甘地从律师到印度独立运动领袖的生涯，呈现非暴力抗争如何连接群众行动、殖民统治与政治伦理"
  }),
  tt0055824: Object.freeze({
    signals: Object.freeze(["律师一家遭到出狱者跟踪", "旧案、家庭安全与持续威胁"]),
    focus: "跟踪威胁、家庭保护与旧事后果",
    valueClaim: "影片以一名出狱者持续跟踪律师一家为前提，把旧事后果、家庭安全和不断逼近的威胁压缩到有限空间"
  }),
  tt0043338: Object.freeze({
    signals: Object.freeze(["记者 Chuck Tatum 操纵洞穴救援报道", "新闻伦理、受困者权益与媒体狂热"]),
    focus: "新闻操控、职业野心与当事人权益",
    valueClaim: "影片让记者 Chuck Tatum 利用洞穴救援报道重振事业，揭示职业野心如何把受困者处境转化为媒体狂热"
  }),
  tt2404461: Object.freeze({
    signals: Object.freeze(["伊朗丈夫返回法国处理离婚", "妻子的新关系与家庭处境"]),
    focus: "婚姻解体、家庭关系与当下选择",
    valueClaim: "影片让一名应离婚请求返回法国的伊朗男子面对妻子的新关系，观察婚姻解体如何改变家庭成员的处境与责任"
  }),
  tt0056592: Object.freeze({
    signals: Object.freeze(["大萧条时期阿拉巴马的种族偏见", "寡居律师为受诬黑人辩护并教育子女"]),
    focus: "种族偏见、法律辩护与家庭教育",
    valueClaim: "影片通过一名律师为遭虚假指控的黑人辩护，并把大萧条时期阿拉巴马的种族偏见带入他对子女的教育"
  }),
  tt0043014: Object.freeze({
    signals: Object.freeze(["编剧与过气电影明星的危险关系", "重返银幕的执念与好莱坞名望"]),
    focus: "电影工业、名望执念与关系操控",
    valueClaim: "影片让一名编剧卷入过气电影明星重返银幕的执念，观察好莱坞名望、依赖关系与个人判断如何彼此牵制"
  }),
  tt0026138: Object.freeze({
    signals: Object.freeze(["Frankenstein 与另一名科学家的造物计划", "为怪物创造伴侣"]),
    focus: "科学造物、伦理责任与怪物的伴侣需求",
    valueClaim: "影片让 Frankenstein 在另一名科学家的推动下为怪物创造伴侣，把科学野心、造物责任与被创造者的需求置于同一实验"
  }),
  tt3901826: Object.freeze({
    signals: Object.freeze(["塔利班控制下的2001年阿富汗", "女孩乔装男孩以养家并应对父亲被捕"]),
    focus: "战争处境、性别限制与家庭生计",
    valueClaim: "影片让一名阿富汗女孩在父亲被捕后乔装成男孩维持家庭生计，呈现塔利班统治下性别限制如何进入日常生存"
  }),
  tt0168629: Object.freeze({
    signals: Object.freeze(["东欧移民对音乐剧的热爱", "视力逐渐丧失与日常应对"]),
    focus: "移民生活、音乐想象与视力变化",
    valueClaim: "影片跟随一名热爱音乐剧的东欧移民应对视力逐渐丧失，让音乐想象与现实生活压力形成鲜明对照"
  }),
  tt2431286: Object.freeze({
    signals: Object.freeze(["记者协助女性寻找失散多年的儿子", "被迫入住修道院与被带走的孩子"]),
    focus: "寻亲、当事人叙述与长期失散",
    valueClaim: "影片跟随一名记者协助女性寻找多年前被带走的儿子，观察长期失散、修道院经历与当事人叙述如何重新连接"
  }),
  tt0051036: Object.freeze({
    signals: Object.freeze(["百老汇专栏作家胁迫公关人员", "拆散妹妹与爵士乐手的恋情"]),
    focus: "媒体权力、胁迫与亲密关系",
    valueClaim: "影片围绕一名百老汇专栏作家胁迫公关人员拆散妹妹恋情的计划，揭示媒体影响力如何进入私人关系与道德选择"
  }),
  tt0069762: Object.freeze({
    signals: Object.freeze(["南达科他荒地中的年轻情侣", "连续杀戮、逃亡与暴力后果"]),
    focus: "青年关系、暴力失控与逃亡",
    valueClaim: "影片跟随一对年轻情侣在南达科他展开连续杀戮与逃亡，观察亲密关系如何与暴力冲动和行动后果相互强化"
  }),
  tt0110413: Object.freeze({
    signals: Object.freeze(["女孩的家人遭腐败警员杀害", "意大利裔杀手协助复仇"]),
    focus: "复仇行动、师徒关系与暴力边界",
    valueClaim: "影片让失去家人的女孩向一名意大利裔杀手求助复仇，观察保护、训练与惩罚欲如何共同把关系推向暴力边界"
  }),
  tt0077651: Object.freeze({
    signals: Object.freeze(["Michael Myers 逃离精神病院", "万圣节返回 Haddonfield 小镇继续杀人"]),
    focus: "追逃、持续威胁与小镇恐惧",
    valueClaim: "影片让 Michael Myers 在逃离精神病院后于万圣节返回 Haddonfield，以持续逼近的追杀塑造小镇空间中的恐惧"
  }),
  tt0099088: Object.freeze({
    signals: Object.freeze(["时间旅行者 Marty McFly 前往1885年营救 Doc Brown", "燃料困境、旧西部与返程计划"]),
    focus: "时间旅行、营救行动与返程限制",
    valueClaim: "影片让 Marty McFly 穿越到1885年营救 Doc Brown，并用燃料困境和旧西部条件检验时间旅行的因果悖论与返程代价"
  })
});

function movieFocus(meta, genre) {
  const override = MOVIE_CONTENT_OVERRIDES[meta.id];
  if (override) return override.focus;
  const title = String(meta.name || "");
  const text = `${meta.description || ""} ${(meta.genres || []).join(" ")}${/back to the future/i.test(title) ? " time travel" : ""}`.toLocaleLowerCase("en-US");
  const sourceGenres = new Set((meta.genres || []).map(String));
  const rules = [
    [/time travel|time machine|travels? (?:back|through) time/, "时间旅行、因果与责任"],
    [/\bjournalists?\b|\breporters?\b|\bphotojournalists?\b|\bwar correspondents?\b/, "记录现场与见证伦理"],
    [/\bcourts?\b|\btrials?\b|\bjudges?\b|\bjuries?\b|\btestimony\b/, "司法程序、证词与判断"],
    [/\baircraft\b|\bairplanes?\b|\baviation\b|\btest pilots?\b/, "飞行技术、试验与风险"],
    [/\b(?:boxer|boxing|heavyweight)\b|boxing championship/, "身份尊严、逆境与公众期待"],
    [/pollution|environmental|chemical company|corporate/, "企业权力、健康风险与公共责任"],
    [/sled dog|serum run|dog who/, "极端环境中的信任与责任"],
    [/\bpoetry\b|\bpoems?\b/, "日常劳动、语言与情感转变"],
    [/\bimpersonat(?:e|es|ed|ing|ion)\b|\bresemblance\b|\blook-alikes?\b|\bdoppelg(?:a|ä)ngers?\b/, "替代身份、忠诚与权力风险"],
    [/\bdisguis(?:e|es|ed|ing)\b|\bmasquerad(?:e|es|ed|ing)\b|\bposes? as\b/, "身份伪装、社会限制与行动选择"],
    [/show business|public spectacle|(?:traveling|stage) circus/, "创作野心、商业伦理与公众目光"],
    [/\bcaregivers?\b|care for/, "照护伦理、亲密关系与沉默"],
    [/\bgrief\b|\bbereav(?:e|ed|ement)\b|\bafter (?:the )?death\b|\bmourn(?:s|ed|ing)?\b|\bwidow(?:ed)?\b/, "死亡、哀伤与重建生活"],
    [/revenge|vengeance/, "复仇冲动与正义边界"],
    [/diamond|smuggl|syndicate/, "资源利益、暴力结构与个人选择"],
    [/alcohol|addict|drinking|drunk/, "成瘾、戒断与自我欺骗"],
    [/captiv|imprison|confined|held (?:hostage|captive)/, "自由、亲子关系与创伤恢复"],
    [/invasion|siege|occupation/, "入侵、围困与平民处境"],
    [/\bdetectives?\b|\binvestigat(?:e|es|ed|ing|ion|ions|or|ors)\b|\bdisappear(?:s|ed|ing|ance|ances)?\b/, "调查、线索与真相"],
    [/\bcrimes?\b|\bcriminals?\b|\bheists?\b|\bgangs?\b|\bmafia\b|\bcartels?\b|\borganized crime\b/, "犯罪、秩序与选择"],
    [/\bspace\b|\baliens?\b|\bplanet\b|astronaut/, "宇宙探索与未知文明"],
    [/\btechnolog(?:y|ies|ical)\b|\brobots?\b|\bandroids?\b|\bartificial intelligence\b|\bscientists?\b/, "技术、科学与未来社会"],
    [/\bpolitics?\b|\bgovernments?\b|\bpresidents?\b|\belections?\b|\bparliaments?\b|political (?:power|campaign|party|system|crisis|movement|conflict|leader|opposition|corruption)|\broyal\b|\bking\b|\bqueen\b|monarch|\bempire\b/, "权力结构与政治处境"],
    [/grip on reality|reality (?:slips|fractures|blurs|distorts)|distinguish reality|what is real|waking nightmare|hallucinat|delusion|paranoi/, "心理压力、感知与现实判断"],
    [/\bmemories?\b|\bidentity\b|\bmind\b/, "记忆、身份与现实边界"],
    [/\b(?:family|father|mother|daughter|son|child|children|marriage|husband|wife|spouse)\b/, "家庭关系与个人责任"],
    [/\bsurvival\b|\bsurvivors?\b|\bstranded\b|\btrapped\b|escape (?:from|captivity|prison)|\brescu(?:e|es|ed|ing)\b|\bhostages?\b|fight(?:s|ing)? (?:to|for) survive/, "生存压力与艰难抉择"],
    [/biograph|true story|based on/, "人物生涯与真实事件改编"],
    [/\bromance\b|\bromantic\b|\blove (?:affair|story|relationship|interest)\b|\blovers?\b|\bcouples?\b/, "亲密关系与环境冲突"]
  ];
  const focuses = rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  if (sourceGenres.has("War")) focuses.unshift("战争与集体命运");
  if (!focuses.length) focuses.push({ history: "时代环境与人物选择", mystery: "信息差与悬念推进", scifi: "现实规则与想象世界" }[genre]);
  return [...new Set(focuses)].slice(0, 2).join("、");
}

const MOVIE_CUE_RULES = Object.freeze([
  [/mariupol|ukrain/i, "马里乌波尔与乌克兰战争现场"],
  [/back to the future|time travel|time machine|travels? (?:back|through) time/i, "时间旅行与因果改写"],
  [/\bjournalists?\b|\breporters?\b|\bphotojournalists?\b|\bwar correspondents?\b/i, "记者或影像工作者的现场记录"],
  [/\baircraft\b|\bairplanes?\b|\baviation\b|\btest pilots?\b/i, "飞行器研发、试飞或航空行动"],
  [/space race|nasa|apollo|astronaut|moon mission/i, "航天任务与太空竞赛"],
  [/nuclear (?:war|attack|weapon|bomb|holocaust)|hydrogen bomb|atomic bomb/i, "核威慑、误判与全球毁灭风险"],
  [/the holocaust|concentration camp|\bnazi(?:s|sm|-occupied)?\b/i, "纳粹统治与大屠杀记忆"],
  [/world war ii|second world war|\bwwii\b/i, "第二次世界大战"],
  [/world war i(?!i)\b|first world war|\bwwi\b/i, "第一次世界大战"],
  [/invasion|siege|occupation/i, "入侵、围困或占领"],
  [/alcohol|addict|drinking|drunk/i, "成瘾、戒断与自我欺骗"],
  [/captiv|imprison|confined|held (?:hostage|captive)/i, "囚禁、逃脱与创伤"],
  [/\bcourts?\b|\btrials?\b|\bjudges?\b|\bjuries?\b|\btestimony\b/i, "审判、证词与司法判断"],
  [/\blawsuits?\b|\blegal action\b|\battorneys? (?:takes|files|defends|represents|investigates|pursues)\b/i, "律师行动、诉讼与举证责任"],
  [/pollution|environmental|chemical company|corporate contamination/i, "环境污染、企业责任与公共健康"],
  [/\b(?:heist|robbery|theft|stolen)\b/i, "劫案计划与行动后果"],
  [/\b(?:boxer|boxing|heavyweight)\b|boxing championship/i, "拳击竞技、尊严与公众期待"],
  [/sled dog|serum run|dog who/i, "雪橇犬、血清运输与极端环境"],
  [/\bpoetry\b|\bpoems?\b/i, "诗歌、劳动与情感表达"],
  [/debate team|debater|public debate/i, "辩论训练、公共表达与教育机会"],
  [/akita|abandoned dog|loyal companion/i, "人与犬的陪伴、等待与忠诚"],
  [/neurolog|catatonic|encephalitis|treatment trial/i, "神经疾病、治疗边界与病患尊严"],
  [/\bimpersonat(?:e|es|ed|ing|ion)\b|\bresemblance\b|\blook-alikes?\b|\bdoppelg(?:a|ä)ngers?\b/i, "替身身份、表演与权力风险"],
  [/\bdisguis(?:e|es|ed|ing)\b|\bmasquerad(?:e|es|ed|ing)\b|\bposes? as\b/i, "身份伪装、社会限制与行动选择"],
  [/show business|public spectacle|(?:traveling|stage) circus/i, "表演产业、野心与公众目光"],
  [/short stor|anthology|six stories/i, "多段式故事与并置结构"],
  [/extremit(?:y|ies) of human behavior|people in distress/i, "困境中的行为极限与道德选择"],
  [/\bcaregivers?\b|care for/i, "照护关系与责任"],
  [/\bgrief\b|\bbereav(?:e|ed|ement)\b|\bafter (?:the )?death\b|\bmourn(?:s|ed|ing)?\b|\bwidow(?:ed)?\b/i, "死亡、哀伤与重建生活"],
  [/redemption|atonement|guilt/i, "赎罪、内疚与行动后果"],
  [/fateful secret|hidden past|keeps? a secret/i, "隐秘往事与道德责任"],
  [/revenge|vengeance|exact[s]? revenge/i, "复仇行动与正义边界"],
  [/\bdiamond\b|precious gem/i, "钻石资源、占有欲与暴力代价"],
  [/\b(?:smuggl(?:e|er|ing|ed)?|contraband)\b/i, "走私网络、跨境风险与行动后果"],
  [/\b(?:syndicate|organized crime)\b/i, "犯罪集团、腐败权力与制度压力"],
  [/violin|musical instrument/i, "小提琴的流转、声音与情感投射"],
  [/auction|three centuries|several owners and countries/i, "跨越数百年的物件履历与拍卖归宿"],
  [/four-day|drinking bout/i, "四日失控过程与自我消耗"],
  [/jigsaw|dead body|trapped (?:in|inside)|deadly game/i, "密室困局、致命规则与生存选择"],
  [/\bmurder(?:s|ed|ing|ers?)?\b|\bkillings?\b|\bserial killers?\b|\bhomicides?\b/i, "致命暴力及其后果"],
  [/\bdetectives?\b|\binvestigat(?:e|es|ed|ing|ion|ions|or|ors)\b|\binspectors?\b|\bpolice investigations?\b|\bpolice detectives?\b/i, "调查者对线索与证词的重组"],
  [/missing|disappear|kidnap|abduct/i, "失踪或绑架事件"],
  [/\bgangs?\b|\bmafia\b|\bcartels?\b|\borganized crime\b/i, "犯罪网络与秩序边界"],
  [/\bcrimes?\b|\bcriminals?\b/i, "犯罪类型中的行动与后果"],
  [/conspir|cover-up|secret plot/i, "阴谋、隐瞒与权力关系"],
  [/spy|espionage|intelligence agent/i, "间谍行动与情报博弈"],
  [/\bpresidents?\b|\bgovernments?\b|\bpolitics?\b|\belections?\b|\bparliaments?\b|political (?:power|campaign|party|system|crisis|movement|conflict|leader|opposition|corruption)/i, "政治权力与公共抉择"],
  [/royal (?:family|court)|monarch|monarchy|throne|emperor|empress|\bkingdom\b|\bking of\b|\bthe king\b|\bqueen of\b|\bthe queen\b/i, "王权、帝国与继承秩序"],
  [/slaver|civil rights|racial|segregat/i, "种族制度与权利抗争"],
  [/\brevolutions?\b|\buprisings?\b|\brebellions?\b/i, "革命行动与社会转折"],
  [/\baliens?\b|extraterrestrial|\bufo\b/i, "外星生命与人类回应"],
  [/robot|android|artificial intelligence|\bai\b/i, "人工智能或机器主体"],
  [/\bspace\b|\bplanet\b|interstellar|galaxy/i, "宇宙空间与陌生文明"],
  [/dystop|totalitarian|surveillance/i, "反乌托邦制度与监控"],
  [/apocalyp|extinction|end of the world/i, "灾变后的生存秩序"],
  [/\bclone|\bgenetic|\bdna\b|\bexperiment/i, "生命技术、实验与伦理边界"],
  [/\bmemories?\b|\bidentity\b/i, "记忆、身份与现实边界"],
  [/grip on reality|reality (?:slips|fractures|blurs|distorts)|distinguish reality|what is real|waking nightmare|hallucinat|delusion|paranoi/i, "心理压力、感知与现实判断"],
  [/\b(?:family|father|mother|daughter|son|child|children|marriage|husband|wife|spouse)\b/i, "家庭关系与个人责任"],
  [/\bsurvival\b|\bsurvivors?\b|\bstranded\b|\btrapped\b|escape (?:from|captivity|prison)|\brescu(?:e|es|ed|ing)\b|\bhostages?\b|fight(?:s|ing)? (?:to|for) survive/i, "生存、逃脱或营救抉择"],
  [/(?<!martial )\b(?:artist|writer|musician|singer|composer)(?:'s)? (?:career|life|rise|work|struggle|journey|legacy)\b|\b(?:aspiring|iconic|famous|renowned|legendary|struggling)[^.!?]{0,40}\b(?:artist|writer|musician|singer|composer)\b/i, "创作者生涯与时代环境"],
  [/\b(?:athlete|sports?|coach|football|baseball|basketball|hockey|racing|olympic)\b|formula one/i, "竞技生涯与公共身份"],
  [/\b(?:scientists?|engineers?|inventors?|inventions?|scientific|engineering)\b/i, "科学实践、工程选择与后果"]
]);

function movieNamedSignals(meta) {
  const description = String(meta.description || "");
  const stop = new Set(["the", "this", "that", "when", "while", "after", "before", "with", "from", "into", "based", "during", "through", "against", "their", "they", "film", "story", "movie", "stranded", "following", "having", "years"]);
  const candidates = description.match(/\b[A-Z][A-Za-z'’-]{2,}(?:\s+[A-Z][A-Za-z'’-]{2,}){0,2}\b/g) || [];
  const titleKey = normalizedText(meta.name);
  const result = [];
  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.replace(/[’']s$/i, "");
    const lower = candidate.toLocaleLowerCase("en-US");
    const firstWord = lower.split(/\s+/)[0];
    if (!candidate.includes(" ") || stop.has(firstWord) || normalizedText(candidate) === titleKey) continue;
    if (/\b(?:world war|civil war|korean war|vietnam war|irish war)\b|\b(?:operation|special forces|maroon berets|narcotics bureau|boston globe|disease)\b/i.test(candidate)) continue;
    if (!result.some((value) => normalizedText(value) === normalizedText(candidate))) result.push(candidate);
    if (result.length === 2) break;
  }
  return result.map((name) => `人物或地点（${name}）`);
}

function movieStructuredCue(meta, genre) {
  const genres = new Set((meta.genres || []).map(String));
  if (genre === "history") {
    if (genres.has("War")) return "战争与集体命运";
    if (genres.has("Biography")) return "人物生涯与真实事件改编";
    return "时代环境与人物选择";
  }
  if (genre === "mystery") {
    if (genres.has("Mystery")) return "信息差、动机与叙事悬念";
    if (genres.has("Crime") || genres.has("Film-Noir")) return "犯罪、秩序与选择";
    return "信息差与悬念推进";
  }
  return "技术设定、陌生规则与社会后果";
}

function semanticCueTokens(value) {
  return String(value || "").split(/[、，；与或]/u).map((part) => normalizedText(part)).filter((part) => part.length >= 4);
}

function semanticCuesOverlap(left, right) {
  const leftTokens = semanticCueTokens(left);
  const rightTokens = semanticCueTokens(right);
  return leftTokens.some((leftToken) => rightTokens.some((rightToken) =>
    leftToken === rightToken || leftToken.includes(rightToken) || rightToken.includes(leftToken)));
}

function movieSpecificCues(meta, genre) {
  const override = MOVIE_CONTENT_OVERRIDES[meta.id];
  if (override) {
    return {
      signals: [...override.signals],
      semanticSignals: [...override.signals],
      specificityFallbackUsed: false,
      contentOverrideApplied: true
    };
  }
  const title = String(meta.name || "");
  const text = `${meta.description || ""} ${(meta.genres || []).join(" ")}${/back to the future/i.test(title) ? " time travel" : ""}`;
  const sourceGenres = new Set((meta.genres || []).map(String));
  const ruleCues = MOVIE_CUE_RULES.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  if (sourceGenres.has("War")) ruleCues.unshift("军队、战场与个人命运");
  if (/(?:integrat(?:e|ed|ion)|all-black|all-white)/i.test(text) && /(?:school|college|university|team|football|basketball|athlet)/i.test(text)) {
    ruleCues.push("学校融合、种族制度与共同体");
  }
  if (sourceGenres.has("Horror") && /\bghosts?\b|\bspectral (?:apparition|presence|entity)\b|\bhaunted (?:house|hotel|room|place|mansion|home)\b/i.test(text)) {
    ruleCues.push("幽灵威胁、记忆与空间压力");
  }
  if (/\bpolice officers?\b|\bpolicemen\b|\bpatrol officers?\b/i.test(text)) {
    ruleCues.push("警察职业、日常执法与伙伴关系");
  }
  if (/\bdouble crosses?\b/i.test(text)) ruleCues.push("背叛与行动后果");
  if (/\bfuture prospects?\b/i.test(text)) ruleCues.push("青年处境与人生前景");
  if (/\b(?:film|movie) directors?\b/i.test(text)) ruleCues.push("电影创作、片场与个人抱负");
  if (/\b(?:killer )?sharks?\b/i.test(text)) ruleCues.push("鲨鱼威胁、海滩社区与猎捕行动");
  const namedCues = movieNamedSignals(meta);
  const semanticSignals = [];
  const pushSemantic = (value) => {
    if (value && !semanticSignals.some((existing) => semanticCuesOverlap(existing, value))) semanticSignals.push(value);
  };
  for (const cue of ruleCues) pushSemantic(cue);
  const focus = movieFocus(meta, genre);
  pushSemantic(focus);
  const structuredCue = movieStructuredCue(meta, genre);
  pushSemantic(structuredCue);
  const unique = [...new Set([...semanticSignals.slice(0, 2), ...namedCues.slice(0, 1)])];
  const pushUnique = (value) => {
    if (value && !unique.includes(value)) unique.push(value);
  };
  if (unique.length < 2) pushUnique(structuredCue);
  const specificityFallbackUsed = unique.length < 2;
  if (specificityFallbackUsed) pushUnique({ history: "具体历史事件中的个人抉择", mystery: "案件中的证据次序与判断", scifi: "陌生规则对现实选择的映照" }[genre]);
  return {
    signals: unique.slice(0, 3),
    semanticSignals: semanticSignals.slice(0, 2),
    specificityFallbackUsed,
    contentOverrideApplied: false
  };
}

function movieValueClaim(cues, genre, meta) {
  const override = MOVIE_CONTENT_OVERRIDES[meta.id];
  if (override) return override.valueClaim;
  const joined = cues.join("、");
  if (/记者或影像工作者/.test(joined)) return `影片借${joined}，观察采访、记录与图像如何改变信息流向，并检验职业判断、当事人权益和公开责任的边界`;
  if (/时间旅行与因果改写/.test(joined)) return `影片通过${joined}，检验改变过去时的因果悖论、情感选择与责任代价`;
  if (/审判|律师行动|司法判断|举证责任/.test(joined)) return `影片围绕${joined}，比较法律事实、举证责任与道德判断之间的缝隙`;
  if (/飞行器研发|航天任务/.test(joined)) return `影片把${joined}并置，观察技术理想、制度任务与个体风险怎样互相牵制`;
  if (/囚禁、逃脱与创伤/.test(joined)) return `影片借${joined}，呈现被剥夺自由后的求生策略、关系变化与创伤恢复，而不把囚禁只当作悬念装置`;
  if (/成瘾、戒断/.test(joined)) return `影片沿着${joined}，观察成瘾怎样扭曲时间、自我叙述和关系，并让戒断成为对尊严与责任的考验`;
  if (/环境污染/.test(joined)) return `影片通过${joined}，追踪污染证据怎样挑战企业权力，并把公共健康责任落实到长期诉讼与个人坚持`;
  if (/核威慑/.test(joined)) return `影片围绕${joined}，追问制度误判如何把局部命令放大成无法收回的全球风险`;
  if (/劫案计划/.test(joined)) return `影片围绕${joined}，展示计划、伪装、时间控制与团队执行如何彼此咬合`;
  if (/拳击竞技/.test(joined)) return `影片借${joined}，把竞技处境放回经济压力与身份尊严之中，观察公众英雄如何由制度环境共同塑造`;
  if (/雪橇犬/.test(joined)) return `影片围绕${joined}，检验信任、耐力与领导资格，让极端运输任务反照人如何评价被低估的伙伴`;
  if (/诗歌、劳动/.test(joined)) return `影片通过${joined}，观察诗歌如何进入日常表达，并改变人物理解爱情、友谊与自身位置的方式`;
  if (/替身身份/.test(joined)) return `影片借${joined}，追问替身何时从表演变成身份责任，以及个人忠诚怎样被权力结构征用`;
  if (/身份伪装、社会限制/.test(joined)) return `影片通过${joined}，观察人物为何需要改变外在身份，以及这种选择怎样回应具体环境中的限制与风险`;
  if (/表演产业/.test(joined)) return `影片沿着${joined}，比较创造公众奇观的抱负、商业扩张与被展示者尊严之间的张力`;
  if (/昏迷、照护/.test(joined)) return `影片让${joined}承载沉默中的照护伦理，审视亲密关系何时越过理解、投射与控制的边界`;
  if (/死亡、哀伤/.test(joined)) return `影片通过${joined}，把哀伤写成重新组织生活与身份的过程，而不是只把死亡当作情节起点`;
  if (/赎罪|隐秘往事/.test(joined)) return `影片借${joined}，追问赎罪能否由单方面牺牲完成，以及秘密、责任和他人自主之间如何冲突`;
  if (/复仇行动/.test(joined)) return `影片围绕${joined}，揭示惩罚欲如何制造新的暴力循环，并逼问复仇与正义是否仍有清晰边界`;
  if (/钻石资源/.test(joined)) return `影片通过${joined}，把珍贵资源、暴力成本与个人选择连成一条因果链`;
  if (/走私网络/.test(joined)) return `影片沿着${joined}，追踪非法交易、制度缝隙与个人选择如何共同制造风险`;
  if (/犯罪集团/.test(joined)) return `影片通过${joined}，观察组织化犯罪如何侵入制度与日常关系，并逼迫人物重新选择立场`;
  if (/多段式故事|行为极限/.test(joined)) return `影片借${joined}的并置结构比较人在受辱、失控和压力下的反应，让黑色幽默成为行为观察工具`;
  if (/幽灵威胁/.test(joined)) return `影片让${joined}同时承担心理压力与空间记忆，观察逝者形象如何支配仍在生活的人`;
  if (/学校融合/.test(joined)) return `影片通过${joined}，呈现制度性隔离进入校园和球队后的具体摩擦，并检验共同目标能否重塑群体关系`;
  if (/小提琴的流转/.test(joined)) return `影片沿着${joined}，把一个物件的声音、所有权与跨时代流转并置，让形式结构本身承担历史记忆`;
  if (/拍卖归宿/.test(joined)) return `影片围绕${joined}，观察专业判断、所有权和欲望如何改变人物对真实价值的理解`;
  if (/记忆、身份/.test(joined)) return `影片借${joined}，动摇可靠叙述，让观众重新判断身份、记忆与事实的边界`;
  if (/犯罪类型中的行动与后果|犯罪、秩序与选择|警察职业、日常执法与伙伴关系|致命暴力及其后果/.test(joined)) return chooseCopyVariant([
    `影片围绕${joined}，观察人物行动、关系与社会环境如何共同形成后果，并把类型张力落到具体选择`,
    `影片借${joined}，把类型冲突落在具体关系与选择上，呈现行动如何在社会环境中产生连锁后果`,
    `影片通过${joined}，连接个人动机、群体关系与制度处境，观察决定如何改变彼此命运`,
    `影片沿着${joined}，呈现人物在压力下作出的选择，并追踪这些选择对关系和处境的影响`,
    `影片把${joined}置于日常关系与社会条件中，关注类型事件之外的责任、代价与人性反应`,
    `影片围绕${joined}，比较不同人物面对风险时的行动逻辑，让类型张力指向真实处境`
  ], meta.id);
  if (/背叛与行动后果/.test(joined)) return `影片借${joined}，观察承诺、利益与求生压力怎样改变人物之间的信任`;
  if (/青年处境与人生前景/.test(joined)) return `影片通过${joined}，呈现成长环境、同伴关系与现实机会如何塑造年轻人的选择`;
  if (/电影创作、片场/.test(joined)) return `影片围绕${joined}，观察创作抱负怎样在有限资源、协作关系与公众评价之间落地`;
  if (/鲨鱼威胁/.test(joined)) return `影片通过${joined}，呈现公共安全、地方利益与猎捕行动之间的冲突`;
  if (/信息差、动机与叙事悬念|信息差与悬念推进/.test(joined)) return chooseCopyVariant([
    `影片围绕${joined}逐步调整人物与观众掌握的信息，让悬念落在动机、关系与选择后果上`,
    `影片通过${joined}制造认知落差，观看重点在人物关系和行动解释怎样随叙事推进而变化`,
    `影片借${joined}控制已知与未知的比例，使悬念服务于人物动机和处境判断`,
    `影片沿着${joined}改变事件视角，让观众在不预设案件结构的前提下理解人物选择`
  ], meta.id);
  if (genre === "history") return chooseCopyVariant([
    `影片围绕${joined}，把时代环境落到人物选择，呈现制度与生活如何彼此影响`,
    `影片沿着${joined}，连接时代结构与个人行动，观察宏观变化怎样转化为具体代价`,
    `影片借${joined}，把历史从结论还原为抉择现场，突出人在制度压力下的能动性`,
    `影片让${joined}共同承载历史环境，比较公共叙事与个人经验之间的距离`
  ], meta.id);
  if (genre === "mystery") return chooseCopyVariant([
    `影片以${joined}控制信息释放，使观众能观察证据顺序、误导和判断偏差如何共同塑造真相`,
    `影片围绕${joined}，重排已知与未知，检验观众为何相信某种证词或解释`,
    `影片借${joined}，制造认知落差，让悬念服务于对证据、动机和判断责任的追问`,
    `影片把${joined}编织成推理过程，重点既在谜底，也在错误判断如何形成`,
    `影片通过${joined}，逐层改变事件解释，促使观众审视直觉与事实之间的偏差`,
    `影片让${joined}互相校验，呈现真相如何在不完整证据和利益冲突中浮现`
  ], meta.id);
  return chooseCopyVariant([
    `影片借${joined}，建立一套陌生规则，并用规则带来的后果反照现实中的技术、权力与责任`,
    `影片通过${joined}，扩大现实尺度，把想象设定转化为关于制度与选择的思想实验`,
    `影片让${joined}改变熟悉世界的条件，再观察人类价值在新规则下是否仍然成立`,
    `影片沿着${joined}，推演陌生条件的后果，使奇观最终回到人的责任问题`
  ], meta.id);
}

function movieContentNotes(meta, focus) {
  const text = `${focus} ${(meta.genres || []).join(" ")} ${meta.description || ""}`.toLocaleLowerCase("en-US");
  const notes = [];
  if (/war|battle|soldier|military|violence/.test(text)) notes.push("战争或暴力场面");
  if (/murder|crime|killer|death|dead/.test(text)) notes.push("犯罪、死亡或伤害议题");
  if (/horror|terror|disturb/.test(text)) notes.push("惊悚或恐怖内容");
  if (/suicide|abuse|assault|trauma/.test(text)) notes.push("心理创伤或敏感伤害议题");
  if (!notes.length) notes.push("分级与敏感内容请在观看前按地区版本核对");
  return [...new Set(notes)].slice(0, 3);
}

function movieSeriesSignal(title) {
  return /\b(?:part|chapter|episode|volume|vol\.?)\s*(?:[2-9]|ii|iii|iv|v|vi|vii|viii|ix|x)\b/iu.test(String(title));
}

function makeMovie(record, genre, rating, cutoffDate, expansionAudit, imdbEntry) {
  const meta = record.meta;
  const title = String(meta.name).trim();
  const director = meta.director.map(String).join(" / ");
  const releaseTimestamp = parseReleaseTimestamp(meta.released);
  const releaseYear = new Date(releaseTimestamp).getUTCFullYear();
  const sourceYear = Number.parseInt(String(meta.year || meta.releaseInfo || ""), 10);
  const year = Number.isInteger(sourceYear) && sourceYear > 0 ? sourceYear : releaseYear;
  const tier = movieTier(rating.count);
  const focus = movieFocus(meta, genre);
  const cueAudit = movieSpecificCues(meta, genre);
  const specificitySignals = cueAudit.signals;
  const semanticSignals = cueAudit.semanticSignals;
  const premiseSignals = specificitySignals.map((signal) => {
    const value = String(signal);
    const left = /^[\p{Script=Latin}\p{Number}]/u.test(value) ? " " : "";
    const right = /[\p{Script=Latin}\p{Number})]$/u.test(value) ? " " : "";
    return `${left}${value}${right}`;
  });
  const premise = `${premiseSignals.join("、")}等线索`;
  const valueClaim = movieValueClaim(semanticSignals, genre, meta);
  const runtime = String(meta.runtime || "片长待核");
  const variant = stableHashNumber(meta.id) % MOVIE_SUMMARY_PATTERNS.length;
  const context = {
    title,
    premise,
    focuses: focus,
    valueClaim,
    rating: rating.value.toFixed(1),
    count: rating.count,
    tierText: tierText(tier)
  };
  const sourceGenres = Array.isArray(meta.genres) ? meta.genres.map(String).filter(Boolean) : [];
  const seriesSignal = movieSeriesSignal(title);
  return {
    id: meta.id,
    type: "movie",
    genre,
    genreLabel: `${GENRE_LABEL[genre]}·证据复核`,
    title,
    titleZh: /[\p{Script=Han}]/u.test(title) ? title : `${title}（原名）`,
    originalTitle: title,
    year,
    creator: director,
    creatorOriginal: director,
    detail: runtime,
    summary: MOVIE_SUMMARY_PATTERNS[variant](context),
    reason: MOVIE_REASON_PATTERNS[(variant + 7) % MOVIE_REASON_PATTERNS.length](context),
    rating: { source: "IMDb", value: rating.value, max: 10, count: rating.count, snapshot: cutoffDate },
    image: `https://images.metahub.space/poster/medium/${meta.id}/img`,
    visual: stableColor(meta.id),
    sourceUrl: `https://www.imdb.com/title/${meta.id}/`,
    genres: [...new Set([genre, ...record.primaryGenres])],
    tags: [GENRE_LABEL[genre], decadeTag(year), ...sourceGenres.slice(0, 2), tierText(tier), "证据复核"],
    audience: `适合希望从${focus}进入${GENRE_LABEL[genre]}电影、并愿意在观看前核对地区分级与版本的观众`,
    genreRationale: `该 IMDb ID 出现在冻结的${record.sourceMembership.map((key) => `“${key}”`).join("、")}目录中，且来源类型字段含 ${sourceGenres.join("、")}；主类据此登记为${GENRE_LABEL[genre]}。`,
    series: seriesSignal ? "系列关系待核" : null,
    installment: null,
    standaloneFriendly: !seriesSignal,
    prerequisite: seriesSignal ? "标题含续作信号；观看前请核对系列顺序与前作关系。" : null,
    contentNotes: movieContentNotes(meta, focus),
    region: String(meta.country || "地区待核"),
    language: null,
    evidenceNote: `IMDb ID ${meta.id} 已绑定官方评分行以及 Cinemeta 导演／类型／片长／上映字段和简介哈希；第三方简介未逐字再发布，也不据此宣称已完整观看。`,
    status: "keep",
    recommendedGenre: genre,
    popularityTier: tier,
    metadataAudit: {
      checkedAt: expansionAudit.manifest.completedAt,
      cinemetaEvidenceFiles: record.evidenceEntries.map((entry) => entry.file),
      cinemetaEvidenceSha256: record.evidenceEntries.map((entry) => entry.sha256),
      cinemetaDescriptionSha256: sha256(String(meta.description)),
      cinemetaDescriptionUsedForScreening: true,
      cinemetaDescriptionRepublished: false,
      imdbEvidenceFile: imdbEntry.file,
      imdbEvidenceSha256: imdbEntry.sha256,
      imdbRatingRecord: rating.rawLine,
      sourceCatalogMembership: record.sourceMembership,
      sourceMetadataGenres: sourceGenres,
      sourceCountry: String(meta.country || ""),
      sourceReleasedAt: String(meta.released),
      sourceReleaseCutoffDate: cutoffDate,
      specificitySignals,
      semanticSignals,
      specificityFallbackUsed: cueAudit.specificityFallbackUsed,
      contentOverrideApplied: cueAudit.contentOverrideApplied,
      valueClaim,
      copyVariant: variant
    },
    evidenceReview: {
      sourceFile: relative(expansionAudit.manifestPath),
      sourceSha256: expansionAudit.pointer.sha256,
      sourceGenre: genre,
      status: "keep",
      recommendedGenre: genre,
      boundary: "Frozen metadata, threshold, genre and copy evidence review; not a claim of full viewing or the same editorial depth as the original 200."
    },
    curationLevel: "evidence-reviewed"
  };
}

async function buildMovies(baseAudit, expansionAudit) {
  const legacy = readJson(LEGACY_MOVIES_PATH);
  assert(Array.isArray(legacy.movies) && legacy.movies.length === LEGACY_COUNT, "movies200.json must contain exactly 200 movies");
  const legacyIds = new Set(legacy.movies.map((item) => item.id));
  assert(legacyIds.size === LEGACY_COUNT, "movies200.json contains duplicate IDs");
  const candidates = gatherMovieMetadata(baseAudit, expansionAudit, legacyIds);
  const imdbEntry = baseAudit.byId.get("imdb-title-ratings");
  assert(imdbEntry, "base upstream manifest has no IMDb ratings dataset");
  const ratings = await readImdbRatings(imdbEntry.filePath, new Set(candidates.keys()));
  const cutoffDate = String(legacy.snapshotDate);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate), `invalid legacy movie snapshot date: ${cutoffDate}`);
  const cutoffTimestamp = Date.parse(`${cutoffDate}T23:59:59.999Z`);
  for (const [id, record] of [...candidates]) {
    const rating = ratings.get(id);
    if (!validMovieRecord(record, rating, cutoffTimestamp)) candidates.delete(id);
    else record.rating = rating;
  }
  const creatorCounts = countBy(legacy.movies, (item) => item.creatorOriginal || item.creator);
  const selected = selectByTier({
    byId: candidates,
    genreOrder: ["scifi", "history", "mystery"],
    targets: MOVIE_TIER_TARGETS,
    tierFunction: movieTier,
    creatorOf: (record) => record.meta.director.map(String).join(" / "),
    idOf: (record) => record.meta.id,
    creatorCounts,
    creatorMaximum: MOVIE_CREATOR_MAX
  });
  const additions = disambiguateAdditionTitles(
    legacy.movies,
    GENRES.flatMap((genre) => selected[genre].map((record) => makeMovie(record, genre, record.rating, cutoffDate, expansionAudit, imdbEntry)))
  );
  const combinedMovies = [...legacy.movies, ...additions];
  assert(JSON.stringify(combinedMovies.slice(0, LEGACY_COUNT)) === JSON.stringify(legacy.movies), "the original 200 movies changed");
  const movies = applySeriesOverrides(combinedMovies, "movie");
  validatePool(movies, movies.slice(LEGACY_COUNT), "movie");
  const directorCounts = countBy(movies, (item) => item.creatorOriginal || item.creator);
  return {
    schemaVersion: 4,
    snapshotDate: cutoffDate,
    expansionMetadataRetrievedAt: expansionAudit.manifest.completedAt,
    retrievedAt: expansionAudit.manifest.completedAt,
    source: {
      legacyPool: relative(LEGACY_MOVIES_PATH),
      expansionManifest: relative(expansionAudit.manifestPath),
      expansionManifestSha256: expansionAudit.pointer.sha256,
      seriesOverrides: relative(SERIES_OVERRIDES_PATH),
      seriesOverridesSha256: fileSha256(SERIES_OVERRIDES_PATH),
      imdbDataset: imdbEntry.file,
      imdbDatasetSha256: imdbEntry.sha256,
      imdbLicense: "https://developer.imdb.com/non-commercial-datasets/",
      imdbAcknowledgement: "Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
      boundary: "Cinemeta supplies frozen metadata and genre-screening evidence only. IMDb ratings remain the threshold truth. No Douban data is collected or displayed."
    },
    threshold: { source: "IMDb", minRating: MOVIE_RATING_MIN, minVotes: MOVIE_COUNT_MIN },
    selectionRules: {
      finalCount: FINAL_COUNT,
      preservedPrefixCount: LEGACY_COUNT,
      addedCount: EXPANSION_COUNT,
      releaseCutoffInclusive: cutoffDate,
      primaryGenreTierTargets: MOVIE_TIER_TARGETS,
      directorMaximum: 10,
      curationBoundary: "The original 200 objects remain byte-for-byte equivalent after JSON parsing. The 300 additions are evidence-reviewed for official rating rows, frozen metadata, genre and copy completeness; they are not promoted to the original editorial tiers or represented as fully viewed."
    },
    counts: {
      total: movies.length,
      preservedPrefix: LEGACY_COUNT,
      additions: additions.length,
      primaryGenre: countBy(movies, (item) => item.genre),
      additionPrimaryGenre: countBy(additions, (item) => item.genre),
      popularityTier: countBy(movies, (item) => item.popularityTier),
      curationLevel: countBy(movies, (item) => item.curationLevel),
      distinctDirectorLabels: Object.keys(directorCounts).length,
      maximumMoviesByOneDirectorLabel: Math.max(...Object.values(directorCounts))
    },
    movies
  };
}

function maximumSharedNgram(items, field, length = 18) {
  const counts = new Map();
  for (const item of items) {
    const value = normalizedText(item[field]);
    const seen = new Set();
    for (let index = 0; index <= value.length - length; index += 1) seen.add(value.slice(index, index + length));
    for (const ngram of seen) counts.set(ngram, (counts.get(ngram) || 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || ["", 0];
}

function copyQualityStats(additions) {
  const variantCounts = countBy(additions, (item) => item.metadataAudit.copyVariant);
  const summaryNgram = maximumSharedNgram(additions, "summary");
  const reasonNgram = maximumSharedNgram(additions, "reason");
  return {
    variantCounts,
    maximumVariantCount: Math.max(...Object.values(variantCounts)),
    summaryNgram: { value: summaryNgram[0], count: summaryNgram[1], length: 18 },
    reasonNgram: { value: reasonNgram[0], count: reasonNgram[1], length: 18 }
  };
}

function assertDisplayTitlesDistinguishable(items, additions, type) {
  const additionIds = new Set(additions.map((item) => item.id));
  const occupied = new Map();
  for (const item of items) {
    const key = normalizedText(item.title);
    if (additionIds.has(item.id)) assert(!occupied.has(key), `${type} addition has an ambiguous display title: ${occupied.get(key)} and ${item.id}`);
    if (!occupied.has(key)) occupied.set(key, item.id);
  }
  const titleCreator = new Map();
  for (const item of items) {
    const key = `${normalizedText(item.originalTitle || item.title)}|${normalizedText(item.creatorOriginal || item.author?.common || item.creator)}`;
    if (additionIds.has(item.id)) assert(!titleCreator.has(key), `${type} addition repeats the same work title and creator: ${titleCreator.get(key)} and ${item.id}`);
    if (!titleCreator.has(key)) titleCreator.set(key, item.id);
  }
}

function validatePool(items, additions, type) {
  assert(items.length === FINAL_COUNT, `${type} pool must contain exactly ${FINAL_COUNT} items`);
  assert(additions.length === EXPANSION_COUNT, `${type} expansion must contain exactly ${EXPANSION_COUNT} items`);
  assert(new Set(items.map((item) => item.id)).size === FINAL_COUNT, `${type} pool contains duplicate IDs`);
  const fallbackIds = additions
    .filter((item) => item.metadataAudit.specificityFallbackUsed)
    .map((item) => item.id);
  assert(fallbackIds.length === 0, `${type} copy relies on a generic topic fallback: ${fallbackIds.join(", ")}`);
  const idPattern = type === "book" ? /^\/works\/OL\d+W$/ : /^tt\d{7,10}$/;
  for (const item of additions) {
    assert(item.type === type, `${type} item has the wrong type: ${item.id}`);
    assert(idPattern.test(item.id), `${type} item has an invalid stable ID: ${item.id}`);
    assert(GENRES.includes(item.genre) && item.genres.includes(item.genre), `${type} item has an invalid genre: ${item.id}`);
    for (const field of ["title", "titleZh", "creator", "summary", "reason", "audience", "genreRationale", "evidenceNote"]) {
      assert(String(item[field] || "").trim(), `${type} item is missing ${field}: ${item.id}`);
    }
    assert(Array.isArray(item.contentNotes) && item.contentNotes.length > 0, `${type} item has no content notes: ${item.id}`);
    assert(item.curationLevel === "evidence-reviewed" && item.status === "keep" && item.recommendedGenre === item.genre,
      `${type} item has an incomplete review boundary: ${item.id}`);
    assert(item.evidenceReview && /^[A-F0-9]{64}$/.test(item.evidenceReview.sourceSha256), `${type} item has no frozen review hash: ${item.id}`);
    assert(Array.isArray(item.metadataAudit.specificitySignals) && item.metadataAudit.specificitySignals.length >= 2,
      `${type} item has fewer than two content-specific signals: ${item.id}`);
    assert(new Set(item.metadataAudit.specificitySignals).size === item.metadataAudit.specificitySignals.length,
      `${type} item repeats a content-specific signal: ${item.id}`);
    assert(String(item.metadataAudit.valueClaim || "").length >= 20 && item.reason.includes(item.metadataAudit.valueClaim),
      `${type} item has no work-linked value claim: ${item.id}`);
    assert(item.metadataAudit.specificitySignals.some((signal) => item.summary.includes(signal)),
      `${type} summary does not expose a work-linked content signal: ${item.id}`);
    assert(!/undefined|null|高样本样本/.test(`${item.summary}${item.reason}`), `${type} item has broken generated copy: ${item.id}`);
    assert(!/[“”]/.test(`${item.summary}${item.reason}`), `${type} item mixes raw quoted topic labels into Chinese copy: ${item.id}`);
    assert(!/[A-Za-z0-9)](?:把|检验|观察)/.test(`${item.summary}${item.reason}`),
      `${type} item pastes an English entity directly onto a Chinese predicate: ${item.id}`);
    for (let index = 1; index < item.metadataAudit.specificitySignals.length; index += 1) {
      const previous = item.metadataAudit.specificitySignals[index - 1];
      const current = item.metadataAudit.specificitySignals[index];
      assert(!item.summary.includes(`${previous}与${current}`), `${type} item mechanically joins content signals with repeated conjunctions: ${item.id}`);
    }
    assert(/^https:\/\//.test(item.sourceUrl), `${type} item has an invalid source URL: ${item.id}`);
    if (type === "book") {
      assert(item.rating.source === "Open Library" && item.rating.max === 5, `invalid book rating source: ${item.id}`);
      assert(item.rating.value >= BOOK_RATING_MIN && item.rating.count >= BOOK_COUNT_MIN, `book threshold failed: ${item.id}`);
      assert(item.year === 0 || item.year >= 1800, `book has an implausible displayed first-publication year: ${item.id}`);
      assert(item.metadataAudit.specificityFallbackUsed === false, `book copy relies on a generic topic fallback: ${item.id}`);
    } else {
      assert(item.rating.source === "IMDb" && item.rating.max === 10, `invalid movie rating source: ${item.id}`);
      assert(item.rating.value >= MOVIE_RATING_MIN && item.rating.count >= MOVIE_COUNT_MIN, `movie threshold failed: ${item.id}`);
      const cutoff = Date.parse(`${item.metadataAudit.sourceReleaseCutoffDate}T23:59:59.999Z`);
      assert(parseReleaseTimestamp(item.metadataAudit.sourceReleasedAt) <= cutoff, `movie release cutoff failed: ${item.id}`);
      assert(item.metadataAudit.imdbRatingRecord === `${item.id}\t${item.rating.value.toFixed(1)}\t${item.rating.count}`,
        `movie official rating row mismatch: ${item.id}`);
    }
  }
  assertUnique(additions, "summary", `${type} additions`);
  assertUnique(additions, "reason", `${type} additions`);
  assertDisplayTitlesDistinguishable(items, additions, type);
  assert(new Set(additions.map((item) => item.metadataAudit.copyVariant)).size === 12, `${type} additions must exercise all 12 copy variants`);
  const quality = copyQualityStats(additions);
  assert(quality.maximumVariantCount <= 40, `${type} copy template concentration is too high: ${quality.maximumVariantCount}/300`);
  assert(quality.summaryNgram.count <= 40, `${type} summary 18-character template fragment is too frequent: ${quality.summaryNgram.count}/300 (${quality.summaryNgram.value})`);
  assert(quality.reasonNgram.count <= 40, `${type} reason 18-character template fragment is too frequent: ${quality.reasonNgram.count}/300 (${quality.reasonNgram.value})`);
}

const SERIES_PATTERNS = Object.freeze([
  [/dresden files/i, "Dresden Files"],
  [/hitchhiker|hitch hiker/i, "Hitchhiker's Guide"],
  [/harry potter/i, "Harry Potter"],
  [/star wars|thrawn/i, "Star Wars"],
  [/\bsaga\b/i, "Saga"],
  [/foundation/i, "Foundation"],
  [/vorkosigan/i, "Vorkosigan Saga"],
  [/dog man/i, "Dog Man"],
  [/captain underpants/i, "Captain Underpants"],
  [/sherlock holmes|hercule poirot/i, "classic detective franchise"],
  [/dirk pitt/i, "Dirk Pitt"],
  [/shatter me/i, "Shatter Me"],
  [/lunar chronicles|\bcinder\b|\bcress\b/i, "Lunar Chronicles"],
  [/dark tower|torre negra/i, "Dark Tower"],
  [/batman|dark knight/i, "Batman"],
  [/avengers|captain america/i, "Marvel films"],
  [/star trek/i, "Star Trek"],
  [/bourne/i, "Bourne"],
  [/kill bill/i, "Kill Bill"]
]);

function detectedSeriesKey(item) {
  if (item.series && item.series !== "系列关系待核") return String(item.series);
  const subjects = item.metadataAudit?.sourceSubjects || [];
  const explicitSubject = subjects.find((subject) => /^series:/i.test(subject));
  if (explicitSubject) return explicitSubject.replace(/^series:/i, "");
  const text = `${item.originalTitle || item.title} ${subjects.join(" ")}`;
  const known = SERIES_PATTERNS.find(([pattern]) => pattern.test(text));
  if (known) return known[1];
  const volume = String(item.originalTitle || item.title).match(/^(.*?)\s*[,.:—-]?\s*(?:part|chapter|episode|book|volume|vol\.?)\s*(?:\d+|[ivx]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu);
  return volume && volume[1].trim() ? volume[1].trim() : null;
}

function seriesConcentration(items) {
  const counts = new Map();
  for (const item of items) {
    const key = detectedSeriesKey(item);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ranked = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return { maximum: ranked[0]?.[1] || 1, top: ranked.slice(0, 5) };
}

function markdownAudit(baseAudit, expansionAudit, booksPayload, moviesPayload) {
  const books = booksPayload.books;
  const movies = moviesPayload.movies;
  const bookAdditions = books.slice(LEGACY_COUNT);
  const movieAdditions = movies.slice(LEGACY_COUNT);
  const bookQuality = copyQualityStats(bookAdditions);
  const movieQuality = copyQualityStats(movieAdditions);
  const bookSeries = seriesConcentration(books);
  const movieSeries = seriesConcentration(movies);
  const unknownBookYears = bookAdditions.filter((item) => item.year === 0);
  const sampleIds = ["/works/OL16592184W", "/works/OL17231441W", "/works/OL8368435W", "tt24082438", "tt0099088", "tt1132620"];
  const samples = [...books, ...movies].filter((item) => sampleIds.includes(item.id));
  return `# 书影音 500 条扩池证据说明\n\n` +
    `生成时间（采用补充证据清单完成时间）：${expansionAudit.manifest.completedAt}  \n` +
    `基础上游清单：\`${relative(baseAudit.manifestPath)}\`，SHA-256 \`${baseAudit.pointer.sha256}\`  \n` +
    `补充上游清单：\`${relative(expansionAudit.manifestPath)}\`，SHA-256 \`${expansionAudit.pointer.sha256}\`\n\n` +
    `## 已确认结果\n\n` +
    `- 图书严格 ${books.length} 本；电影严格 ${movies.length} 部。\n` +
    `- 原 200 本图书与 200 部电影均作为新数组的前 200 项原样保留；ID 顺序与逐对象 JSON 等价检查通过，因此既有浏览器状态仍按同一稳定 ID 命中。\n` +
    `- 新增图书 ${bookAdditions.length} 本，主类 ${JSON.stringify(booksPayload.counts.additionPrimaryGenre)}；新增电影 ${movieAdditions.length} 部，主类 ${JSON.stringify(moviesPayload.counts.additionPrimaryGenre)}。\n` +
    `- 新增图书全部满足 Open Library 不低于 ${BOOK_RATING_MIN}/5 且不少于 ${BOOK_COUNT_MIN} 个评分；新增电影全部逐 ID 匹配随包 IMDb 官方非商业评分行，不低于 ${MOVIE_RATING_MIN}/10 且不少于 ${MOVIE_COUNT_MIN} 票。\n` +
    `- 新增电影的冻结上映字段均可解析且不晚于 ${moviesPayload.selectionRules.releaseCutoffInclusive}。\n` +
    `- 没有抓取、推断、复制或显示豆瓣评分，也没有把不同来源分数混成综合分。\n\n` +
    `## 策展层级\n\n` +
    `- 两池均保留原有 50 条 \`editorial-curated\` 与 150 条 \`editorial-reviewed\`；新增 300 条明确标为 \`evidence-reviewed\`。新增层只表示来源、评分门槛、题材元数据、字段完整性与文案信号通过检查，不声称与原 200 条拥有同等深读／深看编辑强度。\n` +
    `- 运行时应先使用同筛选条件下的原编辑层，耗尽后才进入扩展层；本生成器只建立数据层级，不把来源筛选伪装成人工精读。\n\n` +
    `## 内容与集中度审计\n\n` +
    `- 新增图书与电影的 summary 精确重复均为 0，reason 精确重复均为 0；两类均覆盖 12 种文案结构。单一结构最多分别 ${bookQuality.maximumVariantCount}/300 与 ${movieQuality.maximumVariantCount}/300。\n` +
    `- 18 字符高频片段审计：图书 summary 最高 ${bookQuality.summaryNgram.count}/300、reason 最高 ${bookQuality.reasonNgram.count}/300；电影 summary 最高 ${movieQuality.summaryNgram.count}/300、reason 最高 ${movieQuality.reasonNgram.count}/300，均低于 40/300 门禁。\n` +
    `- 新增 600 条均至少包含 2 个冻结内容信号，reason 必须逐字包含与这些信号绑定的思想／叙事／形式价值句；通用主题回退 0，未翻译主题的中英混合引号 0，机械用“与”拼接相邻信号 0。\n` +
    `- 新增条目均有 titleZh、summary、reason、audience、genreRationale、contentNotes、evidenceNote、系列前置判断和证据引用；没有把来源筛选描述成开发者已通读或完整观看。\n` +
    `- 新增图书有 ${unknownBookYears.length} 条首发年因来源缺失或异常而显示“年份待核”；所有正数显示年均在 1800—${String(expansionAudit.manifest.completedAt).slice(0, 4)}。例如 \`/works/OL17231441W\` 的来源聚合值 1600 未被展示为真实年份。\n` +
    `- 新增条目与既有池之间的“归一化标题+创作者”重复为 0；同名不同改编会显示年份与导演版本。Dog Man 仅保留一个同名 Work，Saga 保留的卷次均在标题中明确。\n` +
    `- 图书作者标签 ${booksPayload.counts.distinctAuthorLabels} 个，单一作者最多 ${booksPayload.counts.maximumBooksByOneAuthorLabel} 本；电影导演标签 ${moviesPayload.counts.distinctDirectorLabels} 个，单一导演最多 ${moviesPayload.counts.maximumMoviesByOneDirectorLabel} 部。\n` +
    `- 基于既有 series 字段、来源 \`series:\` 主题、明确卷次与常见系列名的可识别系列审计：图书最高 ${bookSeries.maximum} 条（前五 ${JSON.stringify(bookSeries.top)}），电影最高 ${movieSeries.maximum} 条（前五 ${JSON.stringify(movieSeries.top)}）。无法从冻结元数据确认的系列关系仍标“待核”，不冒充完整书目学结论。\n` +
    `- 稳定 ID 系列覆盖表 \`${relative(SERIES_OVERRIDES_PATH)}\` 共 ${SERIES_OVERRIDES.byType.book.size + SERIES_OVERRIDES.byType.movie.size} 项，SHA-256 \`${fileSha256(SERIES_OVERRIDES_PATH)}\`；它将标题信号与人工复核分离，裸数字或裸罗马数字不会单独证明续作关系。\n` +
    `- 热度层只表示评分人数。图书总池 ${JSON.stringify(booksPayload.counts.popularityTier)}，其中 classic ${booksPayload.counts.popularityTier.classic}/${books.length}（${(booksPayload.counts.popularityTier.classic / books.length * 100).toFixed(1)}%）；电影总池 ${JSON.stringify(moviesPayload.counts.popularityTier)}，其中 classic ${moviesPayload.counts.popularityTier.classic}/${movies.length}（${(moviesPayload.counts.popularityTier.classic / movies.length * 100).toFixed(1)}%）。组成测试允许 20%—35% classic；图书评分不低于 4.0、图书 classic 的 ratings 不少于 80、题材证据与单一作者最多 ${BOOK_CREATOR_MAX} 本的边界均未放宽。\n\n` +
    `## 抽审样本\n\n` +
    samples.map((item) => `- \`${item.id}\` ${item.title}：${item.metadataAudit.specificitySignals.join("；")}。价值句：${item.metadataAudit.valueClaim}\n`).join("") + `\n` +
    `## 证据边界\n\n` +
    `Open Library 响应提供稳定 Work ID、题材查询成员关系、作者、封面、评分与评分人数。Cinemeta 响应提供电影类型、导演、片长、国家、简介存在性与上映字段；第三方简介只用于关键词筛查并保存 SHA-256，不逐字再发布。电影评分真值只使用 IMDb 官方非商业数据集 \`${baseAudit.byId.get("imdb-title-ratings").file}\`（SHA-256 \`${baseAudit.byId.get("imdb-title-ratings").sha256}\`）。\n\n` +
    `“证据复核”表示每项字段和文案均与冻结记录绑定，不等同于声称开发者亲自通读 500 本书或完整观看 500 部电影。未核实的中文出版／发行名不臆译，保留原名并明确标注。IMDb 数据限个人、非商业使用；远程封面和海报仍有独立许可及可用性边界。\n\n` +
    `## 文件\n\n` +
    `- \`data/raw/books500.json\`：${fs.statSync(BOOKS_PATH).size} bytes，SHA-256 \`${fileSha256(BOOKS_PATH)}\`\n` +
    `- \`data/raw/movies500.json\`：${fs.statSync(MOVIES_PATH).size} bytes，SHA-256 \`${fileSha256(MOVIES_PATH)}\`\n` +
    `- 补充清单含 ${expansionAudit.manifest.entries.length} 个逐文件哈希校验的冻结响应。\n\n` +
    `## 离线重放\n\n` +
    `\`\`\`powershell\nnode scripts/build-media500.cjs --check\n\`\`\`\n\n` +
    `检查模式不联网：它验证基础与补充清单、每个证据文件的长度和 SHA-256，重新选择新增 300+300 条，核对门槛、上映截止、字段、异常年份、内容信号、通用回退、混合引号、模板频率、标题／创作者重复、原 200 前缀兼容，并把重建结果与两个 500 条 JSON 及本文逐字节比较。\n`;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const baseAudit = verifyPointer(BASE_POINTER_PATH);
  const expansionAudit = verifyPointer(EXPANSION_POINTER_PATH);
  assert(expansionAudit.manifest.entries.length === EXPANSION_EVIDENCE_COUNT, `supplementary manifest must contain exactly ${EXPANSION_EVIDENCE_COUNT} evidence files; got ${expansionAudit.manifest.entries.length}`);
  const booksPayload = buildBooks(expansionAudit);
  const moviesPayload = await buildMovies(baseAudit, expansionAudit);
  const booksText = `${JSON.stringify(booksPayload, null, 2)}\n`;
  const moviesText = `${JSON.stringify(moviesPayload, null, 2)}\n`;

  if (checkOnly) {
    assert(fs.existsSync(BOOKS_PATH) && fs.readFileSync(BOOKS_PATH, "utf8") === booksText, "books500.json is out of date");
    assert(fs.existsSync(MOVIES_PATH) && fs.readFileSync(MOVIES_PATH, "utf8") === moviesText, "movies500.json is out of date");
    const auditText = markdownAudit(baseAudit, expansionAudit, booksPayload, moviesPayload);
    assert(fs.existsSync(AUDIT_PATH) && fs.readFileSync(AUDIT_PATH, "utf8") === auditText, "MEDIA500_AUDIT.md is out of date");
  } else {
    fs.writeFileSync(BOOKS_PATH, booksText, "utf8");
    fs.writeFileSync(MOVIES_PATH, moviesText, "utf8");
    fs.writeFileSync(AUDIT_PATH, markdownAudit(baseAudit, expansionAudit, booksPayload, moviesPayload), "utf8");
  }

  console.log(`PASS: books=${booksPayload.books.length} ${JSON.stringify(booksPayload.counts.primaryGenre)}; legacy prefix=${LEGACY_COUNT}`);
  console.log(`PASS: movies=${moviesPayload.movies.length} ${JSON.stringify(moviesPayload.counts.primaryGenre)}; legacy prefix=${LEGACY_COUNT}`);
  console.log(`PASS: additions=${EXPANSION_COUNT}+${EXPANSION_COUNT}; evidence files=${expansionAudit.manifest.entries.length}${checkOnly ? "; generated files are current" : ""}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
