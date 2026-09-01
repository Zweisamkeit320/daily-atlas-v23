const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  CITY_EXTENSION_ROWS,
  MEDICAL_EXTENSION_ROWS,
  MEDICAL_SOURCE_OVERRIDES,
  MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES
} = require("./v3-extras-data.cjs");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const MEDICAL_VISUAL_MANIFEST_PATH = path.join(ROOT, "assets", "medical", "manifest.json");
const TARGET_FILES = ["cities200.json", "german500.json", "medical500.json"];

const read = (name) => JSON.parse(fs.readFileSync(path.join(RAW, name), "utf8"));
const hash = (name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(RAW, name))).digest("hex");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const failures = [];
const warnings = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const warn = (condition, message) => { if (!condition) warnings.push(message); };
const countBy = (items, field) => Object.fromEntries(
  [...items.reduce((map, item) => map.set(item[field], (map.get(item[field]) || 0) + 1), new Map())]
    .sort(([left], [right]) => String(left).localeCompare(String(right), "zh-CN"))
);

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-DE")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function assertUnique(items, key, label) {
  const seen = new Map();
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    const normalized = normalize(value);
    if (!normalized) failures.push(`${item.id}: ${label} is empty after normalization`);
    else if (seen.has(normalized)) failures.push(`${label} duplicate: ${seen.get(normalized)} and ${item.id}`);
    else seen.set(normalized, item.id);
  }
}

function ngrams(value, size = 4) {
  const text = normalize(value);
  const result = new Set();
  for (let index = 0; index <= text.length - size; index += 1) result.add(text.slice(index, index + size));
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function nearDuplicatePairs(items, selector, threshold) {
  const grams = items.map((item) => ngrams(selector(item)));
  const pairs = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const score = jaccard(grams[left], grams[right]);
      if (score >= threshold) pairs.push({ left: items[left].id, right: items[right].id, score });
    }
  }
  return pairs;
}

function requireFields(items, fields, type) {
  for (const item of items) {
    check(item.type === type, `${item.id}: expected type=${type}`);
    for (const field of fields) {
      const value = item[field];
      check(value !== undefined && value !== null && value !== "", `${item.id}: missing ${field}`);
    }
    try {
      const url = new URL(item.sourceUrl);
      check(url.protocol === "https:", `${item.id}: sourceUrl must use HTTPS`);
    } catch {
      failures.push(`${item.id}: invalid sourceUrl`);
    }
  }
}

function checkLegacyIds(legacy, expanded, label) {
  const expandedIds = new Set(expanded.map((item) => item.id));
  check(legacy.every((item) => expandedIds.has(item.id)), `${label}: at least one legacy ID was lost`);
}

function checkLegacyPrefix(legacy, expanded, label) {
  check(expanded.length >= legacy.length, `${label}: expanded pool is shorter than its retained pool`);
  for (let index = 0; index < legacy.length; index += 1) {
    check(
      JSON.stringify(expanded[index]) === JSON.stringify(legacy[index]),
      `${label}: retained item changed or moved at index ${index} (${legacy[index]?.id})`
    );
  }
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...expected].every((value) => actual.has(value));
}

// The generator itself is the auditable source. Its --check mode computes the
// expected bytes in memory and compares them with the checked-in targets
// without rewriting data/raw.
const beforeHashes = Object.fromEntries(TARGET_FILES.map((name) => [name, hash(name)]));
const buildOutput = execFileSync(process.execPath, [path.join(__dirname, "build-v2-extras.cjs"), "--check"], { encoding: "utf8" });
for (const name of TARGET_FILES) check(hash(name) === beforeHashes[name], `${name}: --check changed a target file`);
check(/PASS: checked/.test(buildOutput), "build-v2-extras.cjs --check did not report PASS");

const legacyCities = read("cities70.json");
const legacyGerman = read("german200.json");
const legacyMedical = read("medical200.json");
const cities = read("cities200.json");
const german = read("german500.json");
const medical = read("medical500.json");
const medicalVisualManifest = JSON.parse(fs.readFileSync(MEDICAL_VISUAL_MANIFEST_PATH, "utf8"));

// Cities ---------------------------------------------------------------------
check(cities.length === 200, `cities: expected exactly 200, got ${cities.length}`);
checkLegacyIds(legacyCities, cities, "cities");
const reviewedLegacyCities = legacyCities.map((item) => item.id === "city-kigali"
  ? { ...item, sourceUrl: "https://en.wikivoyage.org/wiki/Kigali" }
  : item);
checkLegacyPrefix(reviewedLegacyCities, cities, "cities");
requireFields(cities, ["id", "cityZh", "cityEn", "countryZh", "countryEn", "countryCode", "region", "latitude", "longitude", "timezone", "summary", "highlights", "bestFor", "seasonNote", "culturalTip", "sourceUrl", "visual", "themeTags"], "city");
assertUnique(cities, "id", "city ID");
assertUnique(cities, (item) => `${item.cityEn}:${item.countryCode}`, "English city/country key");
assertUnique(cities, (item) => `${item.cityZh}:${item.countryCode}`, "Chinese city/country key");

const expectedRegions = { "亚洲": 40, "欧洲": 40, "欧洲与西亚": 1, "非洲": 35, "北美洲": 30, "南美洲": 30, "大洋洲": 24 };
check(JSON.stringify(countBy(cities, "region")) === JSON.stringify(countBy(Object.entries(expectedRegions).flatMap(([region, count]) => Array.from({ length: count }, () => ({ region }))), "region")), "cities: region quotas differ from the declared 200-city plan");
const cityById = new Map(cities.map((item) => [item.id, item]));
const expectedCitySources = new Map(Object.entries({
  "city-victoria-falls": "https://en.wikivoyage.org/wiki/Victoria_Falls",
  "city-savannah": "https://en.wikivoyage.org/wiki/Savannah",
  "city-halifax": "https://en.wikivoyage.org/wiki/Halifax",
  "city-victoria-bc": "https://en.wikivoyage.org/wiki/Victoria_(British_Columbia)",
  "city-banff": "https://en.wikivoyage.org/wiki/Banff",
  "city-trujillo-peru": "https://en.wikivoyage.org/wiki/Trujillo_(Peru)",
  "city-cordoba-argentina": "https://en.wikivoyage.org/wiki/C%C3%B3rdoba_(city%2C_Argentina)",
  "city-mendoza": "https://en.wikivoyage.org/wiki/Mendoza",
  "city-darwin": "https://en.wikivoyage.org/wiki/Darwin",
  "city-gold-coast": "https://en.wikivoyage.org/wiki/Gold_Coast",
  "city-queenstown": "https://en.wikivoyage.org/wiki/Queenstown_(New_Zealand)",
  "city-napier": "https://en.wikivoyage.org/wiki/Napier",
  "city-kigali": "https://en.wikivoyage.org/wiki/Kigali"
}));
for (const [id, expectedSource] of expectedCitySources) {
  check(cityById.get(id)?.sourceUrl === expectedSource, `${id}: expected reviewed city source ${expectedSource}`);
}
const forbiddenCitySources = new Set([
  "https://www.visitrwanda.com/destinations/kigali/",
  "https://en.wikivoyage.org/wiki/Victoria_Falls%2C_Zimbabwe",
  "https://en.wikivoyage.org/wiki/Savannah%2C_Georgia",
  "https://en.wikivoyage.org/wiki/Halifax%2C_Nova_Scotia",
  "https://en.wikivoyage.org/wiki/Victoria%2C_British_Columbia",
  "https://en.wikivoyage.org/wiki/Banff%2C_Alberta",
  "https://en.wikivoyage.org/wiki/Trujillo%2C_Peru",
  "https://en.wikivoyage.org/wiki/Cordoba%2C_Argentina",
  "https://en.wikivoyage.org/wiki/Mendoza%2C_Argentina",
  "https://en.wikivoyage.org/wiki/Darwin%2C_Northern_Territory",
  "https://en.wikivoyage.org/wiki/Gold_Coast%2C_Queensland",
  "https://en.wikivoyage.org/wiki/Queenstown%2C_New_Zealand",
  "https://en.wikivoyage.org/wiki/Napier%2C_New_Zealand"
]);
for (const item of cities) check(!forbiddenCitySources.has(item.sourceUrl), `${item.id}: retained a reviewed obsolete or broken city source URL`);
for (const [id, countryCode] of Object.entries({
  "city-hong-kong": "HK", "city-macau": "MO", "city-taipei": "TW", "city-tainan": "TW"
})) {
  check(cityById.get(id)?.countryCode === countryCode, `${id}: countryCode must be ISO alpha-2 ${countryCode}`);
}
const extensionCityIds = new Set(CITY_EXTENSION_ROWS.map((row) => `city-${row.slug}`));
const extensionCities = cities.filter((item) => extensionCityIds.has(item.id));
check(extensionCities.length === 130, `cities: expected 130 extension cities, got ${extensionCities.length}`);
check(new Set(extensionCities.map((item) => item.seasonNote)).size === 130,
  "cities: all 130 extension season notes must be city-specific instead of six repeated regional templates");
const awkwardCityPhrases = /先确认(?:大广场|大稻埕|城市水渠|南岸)的预约和礼仪要求|体验海上共和国史时优先支持当地经营者并控制音量|在(?:维多利亚瀑布|设计博物馆)拍摄人物或私人空间前先征得同意/;
for (const item of cities) {
  check(!awkwardCityPhrases.test(`${item.culturalTip}${item.seasonNote}`), `${item.id}: retained a reviewed awkward city template phrase`);
  if (item.sourceUrl.includes("en.wikivoyage.org")) {
    check(!/(官方来源|官方实时|实时来源)/.test(JSON.stringify(item)), `${item.id}: Wikivoyage must remain an unlabeled community reference, not an official/live source claim`);
  }
}
for (const item of cities) {
  check(/^[A-Z]{2}$/.test(item.countryCode), `${item.id}: invalid ISO alpha-2 countryCode`);
  check(Number.isFinite(item.latitude) && item.latitude >= -90 && item.latitude <= 90, `${item.id}: invalid latitude`);
  check(Number.isFinite(item.longitude) && item.longitude >= -180 && item.longitude <= 180, `${item.id}: invalid longitude`);
  try { new Intl.DateTimeFormat("en", { timeZone: item.timezone }).format(new Date()); } catch { failures.push(`${item.id}: invalid IANA timezone ${item.timezone}`); }
  check(item.summary.length >= 50, `${item.id}: summary is too short`);
  check(Array.isArray(item.highlights) && item.highlights.length === 3 && new Set(item.highlights.map(normalize)).size === 3, `${item.id}: highlights must be three distinct entries`);
  check(Array.isArray(item.themeTags) && item.themeTags.length >= 2, `${item.id}: needs at least two themeTags`);
  check(item.visual?.type === "procedural-svg", `${item.id}: visual must remain procedural-svg`);
  check(Array.isArray(item.visual?.palette) && item.visual.palette.length === 2 && item.visual.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color)), `${item.id}: invalid two-color palette`);
  check(typeof item.visual?.motif === "string" && item.visual.motif.length >= 2, `${item.id}: missing visual motif`);
}
check(nearDuplicatePairs(cities, (item) => item.summary, 0.72).length === 0, "cities: near-duplicate summaries detected (4-gram Jaccard >= 0.72)");

// German ---------------------------------------------------------------------
check(german.length === 500, `German: expected exactly 500, got ${german.length}`);
checkLegacyIds(legacyGerman, german, "German");
checkLegacyPrefix(legacyGerman, german, "German");
requireFields(german, ["id", "kind", "german", "chinese", "explanation", "exampleGerman", "exampleChinese", "level", "sourceUrl", "themeTags", "narration"], "german");
assertUnique(german, "id", "German ID");
assertUnique(german, "german", "German learning title");
assertUnique(german, "exampleGerman", "German example sentence");
check(JSON.stringify(countBy(german, "level")) === JSON.stringify({ A1: 125, A2: 125, B1: 125, B2: 125 }), "German: expected 125 items at each A1-B2 level");
check(JSON.stringify(countBy(german, "kind")) === JSON.stringify({ "表达": 170, "词汇": 170, "语法": 160 }), "German: expected 170 expressions, 170 vocabulary items and 160 grammar items");
const germanHosts = new Set(["www.goethe.de", "grammis.ids-mannheim.de", "www.duden.de"]);
for (const item of german) {
  check(["A1", "A2", "B1", "B2"].includes(item.level), `${item.id}: invalid CEFR level`);
  check(["词汇", "表达", "语法"].includes(item.kind), `${item.id}: invalid kind`);
  check(/[A-Za-zÄÖÜäöüß]/.test(item.exampleGerman), `${item.id}: German example lacks German/Latin text`);
  check(/[.!?]$/.test(item.exampleGerman), `${item.id}: German example must be a complete punctuated sentence`);
  check(!/[.…]{2,}/.test(item.exampleGerman), `${item.id}: German example contains a placeholder/ellipsis`);
  check(item.exampleGerman.length >= 8 && item.exampleGerman.length <= 180, `${item.id}: German example length out of range`);
  check(item.narration && item.narration.kind === "bundled-synthetic-female", `${item.id}: bundled narration kind is missing`);
  check(item.narration.voice === "de_DE-eva_k-x_low", `${item.id}: bundled narration voice is invalid`);
  check(item.narration.src === `./assets/audio/german/${item.id}.mp3`, `${item.id}: bundled narration path is invalid`);
  check(item.narration.manifest === "./assets/audio/german/manifest.json", `${item.id}: narration manifest path is invalid`);
  check(/[\u3400-\u9fff]/u.test(item.exampleChinese), `${item.id}: Chinese translation lacks Chinese text`);
  check(item.exampleChinese.length >= 4 && item.exampleChinese.length <= 160, `${item.id}: Chinese translation length out of range`);
  check(Array.isArray(item.themeTags) && item.themeTags.length >= 2, `${item.id}: needs at least two themeTags`);
  check(germanHosts.has(new URL(item.sourceUrl).hostname), `${item.id}: German source is outside Goethe, IDS Grammis or Duden`);
}
const germanById = new Map(german.map((item) => [item.id, item]));
const specialistB2Ids = [
  "de-v3-die-pflicht", "de-v3-die-daseinsvorsorge", "de-v3-die-pfadabhaengigkeit",
  "de-v3-die-verhaeltnismaessigkeit", "de-v3-die-zweckmaessigkeit", "de-v3-der-erkenntnisgewinn"
];
for (const id of specialistB2Ids) {
  const item = germanById.get(id);
  check(item?.level === "B2", `${id}: specialist entry must remain level=B2`);
  check(/B2\+／公共政策或学术扩展词/.test(item?.explanation || ""), `${id}: B2+ specialist learning boundary is missing`);
  check(/不等于|不要求|不必|不能|主要|日常/.test(item?.explanation || ""), `${id}: specialist entry lacks an explicit productive-use boundary`);
}
const explanationChecks = new Map([
  ["de-v3-guten-tag-formell", [/中性偏正式/, /Hallo/, /称谓/]],
  ["de-v3-auf-wiedersehen-formell", [/中性偏正式/, /Tschüss/, /bis nächste Woche/]],
  ["de-v3-platz-stadt", [/第三格/, /findet .* statt/, /位置或座位/]],
  ["de-v3-die-einschaetzung", [/搭配/, /abgeben/, /ändern/, /暂定/]]
]);
for (const [id, patterns] of explanationChecks) {
  const explanation = germanById.get(id)?.explanation || "";
  for (const pattern of patterns) check(pattern.test(explanation), `${id}: improved register/collocation/contrast/word-order explanation is missing ${pattern}`);
}
const extensionGerman = german.filter((item) => item.id.startsWith("de-v3-"));
const referenceRoots = new Set([
  "https://www.goethe.de/en/spr/ueb.html",
  "https://grammis.ids-mannheim.de/systematische-grammatik",
  "https://www.duden.de/woerterbuch"
]);
check(extensionGerman.every((item) => referenceRoots.has(item.sourceUrl)),
  "German: v3 source URLs must remain the three declared language reference resources, not item-level evidence claims");
check(nearDuplicatePairs(german, (item) => item.exampleGerman, 0.8).length === 0, "German: near-duplicate examples detected (4-gram Jaccard >= 0.80)");

const audioManifestPath = path.join(ROOT, "assets", "audio", "german", "manifest.json");
if (!fs.existsSync(audioManifestPath)) {
  failures.push("German: bundled narration manifest is missing");
} else {
  const manifest = JSON.parse(fs.readFileSync(audioManifestPath, "utf8"));
  check(manifest.count === 500 && Array.isArray(manifest.items) && manifest.items.length === 500,
    "German: narration manifest must contain exactly 500 items");
  check(manifest.source?.lessons === "../../../data/raw/german500.json",
    "German: narration manifest must identify german500.json as its source");
  check(manifest.source?.lessonsSha256 === sha256(fs.readFileSync(path.join(RAW, "german500.json"))),
    "German: narration manifest lesson hash does not match german500.json");
  if (Array.isArray(manifest.items)) {
    for (let index = 0; index < Math.min(german.length, manifest.items.length); index += 1) {
      const lesson = german[index];
      const entry = manifest.items[index];
      const expectedPath = `assets/audio/german/${lesson.id}.mp3`;
      check(entry.id === lesson.id, `${lesson.id}: narration manifest order/ID mismatch`);
      check(entry.path === expectedPath, `${lesson.id}: narration manifest path mismatch`);
      check(entry.textSha256 === sha256(lesson.exampleGerman.trim()), `${lesson.id}: narration text hash mismatch`);
      const file = path.join(ROOT, ...expectedPath.split("/"));
      check(fs.existsSync(file), `${lesson.id}: bundled narration file is missing`);
      if (fs.existsSync(file)) {
        const bytes = fs.readFileSync(file);
        check(entry.bytes === bytes.length, `${lesson.id}: bundled narration byte count mismatch`);
        check(entry.sha256 === sha256(bytes), `${lesson.id}: bundled narration SHA-256 mismatch`);
      }
    }
  }
}

// Medical --------------------------------------------------------------------
check(medical.length === 500, `medical: expected exactly 500, got ${medical.length}`);
checkLegacyIds(legacyMedical, medical, "medical");
checkLegacyPrefix(legacyMedical, medical, "medical");
requireFields(medical, ["id", "topicGroup", "topic", "title", "summary", "action", "limitsOrRedFlags", "riskLevel", "sourceName", "sourceUrl", "sourceAccessedAt", "imageTheme", "illustrationKey", "alt", "themeTags"], "medical");
assertUnique(medical, "id", "medical ID");
assertUnique(medical, "title", "medical title");
assertUnique(medical, "summary", "medical summary");
check(!medical.some((item) => /这是时间敏感情形，应立即联系当地急救或急诊服务/.test(item.action)),
  "medical: generic emergency wording must not be appended unconditionally to every urgent-tagged item");

const trueEmergencySlugs = new Set([
  "sepsis-recognition", "stroke-last-known-well", "heart-attack-varied", "cardiac-arrest-aed",
  "adult-choking", "anaphylaxis-epinephrine", "severe-asthma", "sepsis-deterioration",
  "massive-bleeding-pressure", "major-burn", "carbon-monoxide", "heat-stroke",
  "hypothermia-gentle", "drowning-aftercare", "spinal-precaution", "severe-hypoglycemia",
  "opioid-overdose", "suicide-immediate", "ectopic-pregnancy", "postpartum-hemorrhage",
  "child-breathing", "delirium-acute"
]);
const serviceUrgentSlugs = new Set([
  "rabies-exposure", "hiv-pep-time", "psychosis-early", "suicide-direct-question",
  "sudden-vision-loss", "flashes-floaters", "poison-exposure", "seizure-first-aid",
  "chemical-eye", "tooth-avulsion", "pregnancy-warning", "newborn-fever"
]);
const downgradedGeneralSlugs = new Set([
  "swimming-buddy", "allergy-intolerance", "fever-signal", "alcohol-standard",
  "trauma-control", "glaucoma-silent", "heat-plan", "flight-mobility", "shift-fatigue",
  "chemical-sds", "indoor-co", "wildfire-smoke", "infant-safe-sleep"
]);
const downgradedCautionSlugs = new Set([
  "fracture-clues", "snoring-apnea", "parasomnia-safety", "drowsy-driving",
  "irregular-pulse", "hypoglycemia-rule", "edema-pattern", "kidney-stone-fluid",
  "foodborne-clusters", "tetanus-wound", "conjunctivitis-hygiene",
  "immunosuppressed-plan", "panic-wave", "depression-function", "mania-warning",
  "substance-coping", "gambling-chasing", "vertigo-pattern", "burn-cool-water",
  "insect-bite", "otc-overlap", "nsaid-risk", "acetaminophen-total",
  "allergy-vs-side-effect", "contrast-agent", "head-injury-observe", "altitude-ascent",
  "child-fever-comfort", "menopause-bleeding", "postpartum-mental"
]);
const reviewedOriginalUrgentSlugs = new Set([
  ...trueEmergencySlugs,
  ...serviceUrgentSlugs,
  ...downgradedGeneralSlugs,
  ...downgradedCautionSlugs
]);
const sourceOriginalUrgentSlugs = new Set(
  MEDICAL_EXTENSION_ROWS.filter((item) => item.riskLevel === "urgent").map((item) => item.slug)
);
check(trueEmergencySlugs.size === 22, `medical: expected 22 true-emergency slugs, got ${trueEmergencySlugs.size}`);
check(serviceUrgentSlugs.size === 12, `medical: expected 12 service-urgent slugs, got ${serviceUrgentSlugs.size}`);
check(downgradedGeneralSlugs.size === 13, `medical: expected 13 general downgrades, got ${downgradedGeneralSlugs.size}`);
check(downgradedCautionSlugs.size === 30, `medical: expected 30 caution downgrades, got ${downgradedCautionSlugs.size}`);
check(reviewedOriginalUrgentSlugs.size === 77, `medical: triage partition must contain 77 unique slugs, got ${reviewedOriginalUrgentSlugs.size}`);
check(sameSet(sourceOriginalUrgentSlugs, reviewedOriginalUrgentSlugs),
  "medical: the 77-item triage partition no longer exactly matches the source rows originally marked urgent");

const extensionMedical = medical.filter((item) => item.id.startsWith("medical-v3-"));
const extensionBySlug = new Map(extensionMedical.map((item) => [item.id.slice("medical-v3-".length), item]));
const generatedUrgentSlugs = new Set(
  extensionMedical.filter((item) => item.riskLevel === "urgent").map((item) => item.id.slice("medical-v3-".length))
);
check(sameSet(generatedUrgentSlugs, new Set([...trueEmergencySlugs, ...serviceUrgentSlugs])),
  "medical: final extension urgent set must be exactly 22 true emergencies plus 12 service-urgent items");
for (const slug of trueEmergencySlugs) check(extensionBySlug.get(slug)?.riskLevel === "urgent", `medical-v3-${slug}: must remain true-emergency urgent`);
for (const slug of serviceUrgentSlugs) check(extensionBySlug.get(slug)?.riskLevel === "urgent", `medical-v3-${slug}: must remain service-path urgent`);
for (const slug of downgradedGeneralSlugs) check(extensionBySlug.get(slug)?.riskLevel === "general", `medical-v3-${slug}: must be downgraded to general`);
for (const slug of downgradedCautionSlugs) check(extensionBySlug.get(slug)?.riskLevel === "caution", `medical-v3-${slug}: must be downgraded to caution`);

const servicePathPatterns = new Map([
  ["rabies-exposure", /狂犬病暴露处置|公卫/],
  ["hiv-pep-time", /急诊、感染科或性健康服务/],
  ["psychosis-early", /精神健康服务/],
  ["suicide-direct-question", /危机或急救服务/],
  ["sudden-vision-loss", /急诊眼科/],
  ["flashes-floaters", /当天联系眼科/],
  ["poison-exposure", /毒物中心/],
  ["seizure-first-aid", /首次发作、持续超过五分钟、连续发作/],
  ["chemical-eye", /持续冲洗.*毒物中心或急诊眼科/],
  ["tooth-avulsion", /急诊牙科/],
  ["pregnancy-warning", /产科分诊或急诊/],
  ["newborn-fever", /儿科或急诊/]
]);
for (const [slug, pattern] of servicePathPatterns) {
  const item = extensionBySlug.get(slug);
  check(pattern.test(`${item?.action || ""}${item?.limitsOrRedFlags || ""}`), `medical-v3-${slug}: service-specific urgent path is missing`);
  check(!/若出现这些信号.*当地急救流程/.test(item?.limitsOrRedFlags || ""),
    `medical-v3-${slug}: service-path item must not receive the generic ambulance suffix`);
}

for (const item of extensionMedical) {
  for (const field of item.riskLevel === "urgent" ? [] : ["action", "limitsOrRedFlags"]) {
    const emergencyClauses = item[field].split(/[。；]/).filter((clause) => /急救|急诊/.test(clause));
    for (const clause of emergencyClauses) {
      check(/当|若|出现|时/.test(clause), `${item.id}: emergency clause lacks an explicit trigger: ${clause}`);
    }
  }
  if (item.riskLevel !== "urgent") {
    check(!/若出现这些信号.*当地急救流程/.test(item.limitsOrRedFlags),
      `${item.id}: general/caution item contains an unconditional generic emergency suffix`);
  }
}

const forbiddenMedicalUrls = new Set([
  "https://www.fda.gov/consumers/consumer-updates/think-it-through-managing-benefits-and-risks-medicines",
  "https://wwwnc.cdc.gov/travel/page/travelers-health",
  "https://www.cdc.gov/environmental-health/index.html",
  "https://www.cdc.gov/ncbddd/actearly/milestones/index.html",
  "https://www.nhs.uk/conditions/first-aid/"
]);
for (const item of medical) {
  check(!forbiddenMedicalUrls.has(item.sourceUrl), `${item.id}: retained a reviewed broken or misdirected source URL`);
}
for (const slug of Object.keys(MEDICAL_SOURCE_OVERRIDES)) {
  const expected = MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES[slug] || "2026-08-25";
  check(extensionBySlug.get(slug)?.sourceAccessedAt === expected, `medical-v3-${slug}: reviewed source must use sourceAccessedAt=${expected}`);
}
for (const slug of reviewedOriginalUrgentSlugs) {
  const expected = MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES[slug] || "2026-08-25";
  check(extensionBySlug.get(slug)?.sourceAccessedAt === expected, `medical-v3-${slug}: reviewed triage item must use sourceAccessedAt=${expected}`);
}
const developmentItem = medical.find((item) => item.id === "medical-development-variation");
check(developmentItem?.sourceUrl === "https://www.cdc.gov/act-early/milestones/index.html",
  "medical-development-variation: current CDC Act Early milestone URL is required");
check(developmentItem?.sourceAccessedAt === "2026-08-25",
  "medical-development-variation: reviewed source must use sourceAccessedAt=2026-08-25");
const expectedGroups = {
  "运动、肌肉与骨骼": 42, "睡眠与昼夜节律": 41, "营养、消化与口腔": 42, "心血管、代谢与肾脏": 42,
  "感染预防与免疫": 42, "心理、脑健康与成瘾": 42, "感官与皮肤": 41, "用药、检查与健康素养": 41,
  "急救与紧急警示": 42, "环境、旅行与职业健康": 41, "预防、癌症与筛查": 42, "生命周期、生殖与老龄健康": 42
};
const expectedThemeByGroup = {
  "运动、肌肉与骨骼": "activity", "睡眠与昼夜节律": "sleep", "营养、消化与口腔": "nutrition", "心血管、代谢与肾脏": "cardiometabolic",
  "感染预防与免疫": "immunity", "心理、脑健康与成瘾": "brain", "感官与皮肤": "senses-skin", "用药、检查与健康素养": "medicines-tests",
  "急救与紧急警示": "emergency", "环境、旅行与职业健康": "environment-travel", "预防、癌症与筛查": "prevention-screening", "生命周期、生殖与老龄健康": "lifespan"
};
check(medicalVisualManifest.schemaVersion === 1, "medical illustrations: manifest must use schemaVersion 1");
check(Array.isArray(medicalVisualManifest.items) && medicalVisualManifest.items.length === 24,
  "medical illustrations: manifest must contain exactly 24 items");
const medicalVisualItems = Array.isArray(medicalVisualManifest.items) ? medicalVisualManifest.items : [];
const medicalVisuals = new Map();
const medicalVisualFiles = new Set();
for (const visual of medicalVisualItems) {
  check(/^[a-z0-9-]+$/.test(visual.key || ""), "medical illustrations: invalid key");
  check(!medicalVisuals.has(visual.key), `medical illustrations: duplicate key ${visual.key}`);
  check(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(visual.file || ""), `${visual.key}: invalid illustration file path`);
  check(!medicalVisualFiles.has(visual.file), `${visual.key}: duplicate illustration file path`);
  check(expectedThemeByGroup[visual.topicGroup] === visual.imageTheme, `${visual.key}: manifest topicGroup/imageTheme mismatch`);
  check(typeof visual.alt === "string" && visual.alt.length >= 16, `${visual.key}: manifest alt is missing or too short`);
  check(fs.existsSync(path.join(ROOT, visual.file || "")), `${visual.key}: illustration file is missing`);
  medicalVisuals.set(visual.key, visual);
  medicalVisualFiles.add(visual.file);
}
check(JSON.stringify(countBy(medical, "topicGroup")) === JSON.stringify(countBy(Object.entries(expectedGroups).flatMap(([topicGroup, count]) => Array.from({ length: count }, () => ({ topicGroup }))), "topicGroup")), "medical: topicGroup quotas differ from the declared 500-item plan");
const officialMedicalHosts = new Set([
  "www.who.int", "www.cdc.gov", "wwwnc.cdc.gov", "www.nccih.nih.gov", "www.nhs.uk", "www.niddk.nih.gov", "www.nhlbi.nih.gov",
  "www.nimh.nih.gov", "www.nia.nih.gov", "www.niaaa.nih.gov", "www.nidcr.nih.gov", "www.nei.nih.gov", "www.niams.nih.gov",
  "www.cancer.gov", "medlineplus.gov", "www.fda.gov", "www.ahrq.gov", "www.uspreventiveservicestaskforce.org",
  "www.fsis.usda.gov", "www.hse.gov.uk", "www.england.nhs.uk", "ods.od.nih.gov", "stacks.cdc.gov",
  "www.hhs.gov", "www.airnow.gov", "www.osha.gov", "www.epa.gov", "www.ready.gov", "www.sja.org.uk",
  "www.samhsa.gov"
]);
const sourceNameMarkers = new Map([
  ["www.sja.org.uk", /St John Ambulance/],
  ["www.samhsa.gov", /SAMHSA/],
  ["ods.od.nih.gov", /NIH ODS/],
  ["www.hhs.gov", /HHS/],
  ["www.airnow.gov", /AirNow/],
  ["www.osha.gov", /OSHA/],
  ["www.epa.gov", /EPA/],
  ["www.ready.gov", /Ready\.gov/],
  ["www.nhs.uk", /NHS/]
]);
for (const item of medical) {
  const visual = medicalVisuals.get(item.illustrationKey);
  check(["general", "caution", "urgent"].includes(item.riskLevel), `${item.id}: invalid riskLevel`);
  check(item.imageTheme === expectedThemeByGroup[item.topicGroup], `${item.id}: imageTheme does not explicitly match topicGroup`);
  check(Boolean(visual), `${item.id}: illustrationKey is absent from the manifest`);
  check(visual?.topicGroup === item.topicGroup, `${item.id}: illustration topicGroup does not match the item`);
  check(visual?.imageTheme === item.imageTheme, `${item.id}: illustration imageTheme does not match the item`);
  check(visual?.alt === item.alt, `${item.id}: alt does not match the illustration manifest`);
  check(item.alt.length >= 16, `${item.id}: image alt is too short`);
  check(item.summary.length >= 38, `${item.id}: summary is too short`);
  check(item.action.length >= 27, `${item.id}: action is too short`);
  check(item.limitsOrRedFlags.length >= 28, `${item.id}: limitsOrRedFlags is too short`);
  check(/^2026-08-(12|24|25|30)$/.test(item.sourceAccessedAt), `${item.id}: invalid sourceAccessedAt`);
  check(Array.isArray(item.themeTags) && item.themeTags.length >= 2, `${item.id}: needs at least two themeTags`);
  const sourceHost = new URL(item.sourceUrl).hostname;
  check(officialMedicalHosts.has(sourceHost), `${item.id}: source is outside the approved official/public-health host list`);
  if (sourceNameMarkers.has(sourceHost)) {
    check(sourceNameMarkers.get(sourceHost).test(item.sourceName), `${item.id}: sourceName does not match ${sourceHost}`);
  }
  if (item.riskLevel === "urgent") {
    check(/急救|急诊|立即|紧急|毒物|联系当地/.test(`${item.action}${item.limitsOrRedFlags}`), `${item.id}: urgent entry lacks an explicit urgent action`);
  }
  check(!/(保证治愈|绝对安全|适用于所有人|应自行加倍服用|应自行停用处方)/.test(item.action), `${item.id}: action contains unsafe universal/self-medication language`);
}
const medicalNearDuplicates = nearDuplicatePairs(medical, (item) => `${item.title}${item.summary}${item.action}`, 0.72);
check(medicalNearDuplicates.length === 0, `medical: near-duplicate multi-field entries detected: ${medicalNearDuplicates.slice(0, 3).map((pair) => `${pair.left}/${pair.right}`).join(", ")}`);
check(new Set(medical.map((item) => item.sourceUrl)).size >= 110, "medical: expected at least 110 distinct official source pages");
check(new Set(medical.map((item) => item.topic)).size >= 160, "medical: expected at least 160 concrete topics");
check(new Set(medical.map((item) => item.imageTheme)).size === 12, "medical: expected all 12 explicit image themes");
const medicalIllustrationCounts = countBy(medical, "illustrationKey");
check(Object.keys(medicalIllustrationCounts).length === 24, "medical: expected all 24 illustration keys to be used");
for (const [key, count] of Object.entries(medicalIllustrationCounts)) {
  check(count >= 5 && count <= 40, `medical: ${key} must be used by 5-40 items, got ${count}`);
}
warn(countBy(medical, "riskLevel").urgent <= 125, "medical: more than one quarter of entries are marked urgent");

if (warnings.length) {
  console.warn(`WARN (${warnings.length})`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: v2 extras validation");
  console.log(JSON.stringify({
    files: Object.fromEntries(TARGET_FILES.map((name) => [name, { sha256: hash(name).toUpperCase(), bytes: fs.statSync(path.join(RAW, name)).size }])),
    cities: { count: cities.length, regions: countBy(cities, "region") },
    german: { count: german.length, levels: countBy(german, "level"), kinds: countBy(german, "kind") },
    medical: { count: medical.length, topicGroups: countBy(medical, "topicGroup"), illustrations: medicalIllustrationCounts, risks: countBy(medical, "riskLevel"), topics: new Set(medical.map((item) => item.topic)).size, distinctSources: new Set(medical.map((item) => item.sourceUrl)).size }
  }, null, 2));
}
