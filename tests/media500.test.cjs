const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const SERIES_OVERRIDES_PATH = path.join(ROOT, "data", "editorial", "series-overrides.json");
const GENRES = new Set(["history", "mystery", "scifi"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function assertLatinSignalsDelimited(item) {
  const copy = `${item.summary}\n${item.reason}`;
  const safeLeft = /[\s，、；：。！？（《【]/u;
  const safeRight = /[\s，、；：。！？）》】]/u;
  for (const signal of item.metadataAudit.specificitySignals || []) {
    let from = 0;
    let index = copy.indexOf(signal, from);
    while (index !== -1) {
      const before = copy[index - 1] || "";
      const after = copy[index + signal.length] || "";
      if (/^[\p{Script=Latin}\p{Number}]/u.test(signal) && before) {
        assert.match(before, safeLeft, `${item.id} must delimit the left edge of ${signal}`);
      }
      if (/[\p{Script=Latin}\p{Number})]$/u.test(signal) && after) {
        assert.match(after, safeRight, `${item.id} must delimit the right edge of ${signal}`);
      }
      from = index + signal.length;
      index = copy.indexOf(signal, from);
    }
  }
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function maximumSharedNgram(items, field, length = 18) {
  const counts = new Map();
  for (const item of items) {
    const text = normalized(item[field]);
    const seen = new Set();
    for (let index = 0; index <= text.length - length; index += 1) seen.add(text.slice(index, index + length));
    for (const ngram of seen) counts.set(ngram, (counts.get(ngram) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function payload(type) {
  const plural = type === "book" ? "books" : "movies";
  return {
    expanded: readJson(path.join(RAW, `${plural}500.json`)),
    legacy: readJson(path.join(RAW, `${plural}200.json`)),
    plural
  };
}

for (const type of ["book", "movie"]) {
  test(`${type} 500 pool preserves the complete legacy prefix and uses an honest expansion tier`, () => {
    const { expanded, legacy, plural } = payload(type);
    const items = expanded[plural];
    const oldItems = legacy[plural];
    const additions = items.slice(200);
    assert.equal(items.length, 500);
    assert.equal(oldItems.length, 200);
    assert.deepEqual(items.slice(0, 200), oldItems);
    assert.equal(new Set(items.map((item) => item.id)).size, 500);
    assert.deepEqual(countBy(items, (item) => item.curationLevel), {
      "editorial-curated": 50,
      "editorial-reviewed": 150,
      "evidence-reviewed": 300
    });
    assert.ok(additions.every((item) => item.curationLevel === "evidence-reviewed"));
    assert.ok(additions.every((item) => item.evidenceReview && /^[A-F0-9]{64}$/.test(item.evidenceReview.sourceSha256)));
    assert.ok(additions.every((item) => !Object.hasOwn(item, "editorialReview")));
  });

  test(`${type} additions meet source thresholds, genre boundaries and complete-copy requirements`, () => {
    const { expanded, plural } = payload(type);
    const additions = expanded[plural].slice(200);
    const idPattern = type === "book" ? /^\/works\/OL\d+W$/ : /^tt\d{7,10}$/;
    for (const item of additions) {
      assert.match(item.id, idPattern);
      assert.ok(GENRES.has(item.genre));
      assert.ok(item.genres.includes(item.genre));
      for (const field of ["title", "titleZh", "creator", "summary", "reason", "audience", "genreRationale", "evidenceNote"]) {
        assert.ok(String(item[field] || "").trim(), `${item.id} ${field}`);
      }
      assert.ok(Array.isArray(item.contentNotes) && item.contentNotes.length > 0, item.id);
      assert.ok(Array.isArray(item.metadataAudit.specificitySignals) && item.metadataAudit.specificitySignals.length >= 2, item.id);
      assert.ok(item.metadataAudit.specificitySignals.some((signal) => item.summary.includes(signal)), item.id);
      assert.ok(item.reason.includes(item.metadataAudit.valueClaim), item.id);
      assert.doesNotMatch(`${item.summary}${item.reason}`, /undefined|null|高样本样本|[“”]/);
      assert.equal(item.metadataAudit.specificityFallbackUsed || false, false, item.id);
      if (type === "book") {
        assert.equal(item.rating.source, "Open Library");
        assert.ok(item.rating.value >= 4 && item.rating.count >= 20, item.id);
        assert.ok(item.year === 0 || item.year >= 1800, item.id);
      } else {
        assert.equal(item.rating.source, "IMDb");
        assert.ok(item.rating.value >= 7.5 && item.rating.count >= 30000, item.id);
        assert.equal(item.metadataAudit.imdbRatingRecord, `${item.id}\t${item.rating.value.toFixed(1)}\t${item.rating.count}`);
        const cutoff = Date.parse(`${item.metadataAudit.sourceReleaseCutoffDate}T23:59:59.999Z`);
        assert.ok(Date.parse(item.metadataAudit.sourceReleasedAt) <= cutoff, item.id);
      }
    }
  });

  test(`${type} expansion copy and display titles stay diverse and distinguishable`, () => {
    const { expanded, plural } = payload(type);
    const items = expanded[plural];
    const additions = items.slice(200);
    assert.equal(new Set(additions.map((item) => item.summary)).size, 300);
    assert.equal(new Set(additions.map((item) => item.reason)).size, 300);
    const variants = countBy(additions, (item) => item.metadataAudit.copyVariant);
    assert.equal(Object.keys(variants).length, 12);
    assert.ok(Math.max(...Object.values(variants)) <= 40);
    assert.ok(maximumSharedNgram(additions, "summary") <= 40);
    assert.ok(maximumSharedNgram(additions, "reason") <= 40);
    const displayTitles = new Set();
    const titleCreators = new Set();
    for (const item of items) {
      const display = normalized(item.title);
      if (item.curationLevel === "evidence-reviewed") assert.ok(!displayTitles.has(display), item.id);
      displayTitles.add(display);
      const pair = `${normalized(item.originalTitle || item.title)}|${normalized(item.creatorOriginal || item.author?.common || item.creator)}`;
      if (item.curationLevel === "evidence-reviewed") assert.ok(!titleCreators.has(pair), item.id);
      titleCreators.add(pair);
    }
  });
}

test("stable-ID series reviews resolve sequence metadata and reject bare-title-number false positives", () => {
  const overrideBytes = fs.readFileSync(SERIES_OVERRIDES_PATH);
  const overrides = JSON.parse(overrideBytes.toString("utf8"));
  assert.equal(overrides.schemaVersion, 1);
  assert.match(overrides.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Set(overrides.items.map((item) => item.id)).size, overrides.items.length);

  const booksPayload = payload("book").expanded;
  const moviesPayload = payload("movie").expanded;
  const byId = new Map([...booksPayload.books, ...moviesPayload.movies].map((item) => [item.id, item]));
  const overrideHash = sha256(overrideBytes);
  assert.equal(booksPayload.source.seriesOverrides, "data/editorial/series-overrides.json");
  assert.equal(moviesPayload.source.seriesOverrides, "data/editorial/series-overrides.json");
  assert.equal(booksPayload.source.seriesOverridesSha256, overrideHash);
  assert.equal(moviesPayload.source.seriesOverridesSha256, overrideHash);

  for (const override of overrides.items) {
    const item = byId.get(override.id);
    assert.ok(item, `missing series override target ${override.id}`);
    for (const field of ["series", "installment", "standaloneFriendly", "prerequisite"]) {
      assert.deepEqual(item[field], override[field], `${override.id} ${field}`);
    }
    assert.deepEqual(item.metadataAudit.seriesReview, {
      status: override.status,
      checkedAt: overrides.checkedAt,
      orderScheme: override.orderScheme,
      reviewNote: override.reviewNote,
      evidence: override.evidence
    });
    if (override.status === "verified-series") {
      assert.ok(String(item.series).trim(), override.id);
      assert.notEqual(item.series, "系列关系待核", override.id);
      if (!item.standaloneFriendly) assert.ok(String(item.prerequisite).trim(), override.id);
    } else {
      assert.equal(item.series, null, override.id);
      assert.equal(item.installment, null, override.id);
      assert.equal(item.standaloneFriendly, true, override.id);
      assert.equal(item.prerequisite, null, override.id);
    }
  }

  const millennium = byId.get("/works/OL5784621W");
  assert.equal(millennium.series, "千禧年（Millennium）");
  assert.equal(millennium.installment, 2);
  assert.equal(millennium.standaloneFriendly, false);
  assert.match(millennium.prerequisite, /龙文身的女孩/);

  for (const id of ["tt1070874", "tt0104797", "tt0120586"]) {
    const item = byId.get(id);
    assert.equal(item.series, null, `${id} title suffix is not a sequel marker`);
    assert.equal(item.standaloneFriendly, true, id);
    assert.equal(item.metadataAudit.seriesReview.status, "verified-non-series", id);
  }
  assert.equal([...byId.values()].some((item) => item.series === "系列关系待核"), false,
    "all current title-number series candidates must be resolved by stable-ID review");
});

test("known content-quality regressions remain fixed", () => {
  const books = payload("book").expanded.books.slice(200);
  const movies = payload("movie").expanded.movies.slice(200);
  for (const item of [...books, ...movies]) {
    assertLatinSignalsDelimited(item);
    assert.doesNotMatch(
      `${item.summary}${item.reason}`,
      /[A-Za-z0-9](?:等线索|把|检验|观察|落实|建立|比较)|是[A-Za-z]/,
      `${item.id} must not paste an English entity directly onto a Chinese predicate`
    );
  }
  for (const item of books) {
    for (const subject of item.metadataAudit.sourceSubjects || []) {
      assert.doesNotMatch(subject, /^(?:age|grade):(min|max):undefined$/i, `${item.id} contains an unresolved metadata sentinel`);
    }
  }
  const justMercy = books.find((item) => item.id === "/works/OL17231441W");
  assert.equal(justMercy.metadataAudit.openLibraryFirstPublishYear, 1600);
  assert.equal(justMercy.year, 0);
  assert.doesNotMatch(justMercy.summary, /1600|与\s*[“”]/);
  assert.equal(books.some((item) => item.id === "/works/OL19870W"), false, "The Jungle Book must not re-enter through a noisy biography tag");
  assert.equal(books.some((item) => item.id === "/works/OL16465449W"), false, "The One and Only Ivan must not enter history through one noisy subject");
  for (const rejectedId of [
    "/works/OL9170454W", // Hamlet: edition aggregation is polluted with WWII and Jewish-history subjects.
    "/works/OL86707W", // Stellaluna: an animal picture book is polluted with Holocaust subjects.
    "/works/OL498434W", // The Castle: biography-query and alienation substring pollution.
    "/works/OL498556W", // Metamorphosis: alienation must not admit the work as alien science fiction.
    "/works/OL59448W", // The Price of Salt: broad taxonomy does not make the romance a mystery-primary selection.
    "/works/OL257939W", // A Clash of Kings is epic fantasy, not science fiction.
    "/works/OL5734773W", // Memories of Ice is high fantasy despite a polluted space-opera subject.
    "/works/OL5734770W", // Deadhouse Gates is fantasy despite a polluted space-opera subject.
    "/works/OL257948W", // A Feast for Crows is epic fantasy, not a mystery-primary work because it mentions murderers.
    "/works/OL20808172W" // Punk 57 is contemporary romance, not mystery-primary because of one generic suspense taxonomy.
  ]) {
    assert.equal(books.some((item) => item.id === rejectedId), false, `${rejectedId} must not remain in the selected pool`);
  }
  for (const item of books.filter((candidate) => candidate.curationLevel === "evidence-reviewed" && candidate.genre === "mystery")) {
    const subjects = item.metadataAudit.sourceSubjects.map((subject) => String(subject).trim());
    const joinedSubjects = subjects.join(" | ");
    const romanceDominant = /(contemporary romance|romance|new adult)/i.test(joinedSubjects);
    const directMysteryEvidence = /(detective|crime fiction|criminal investigation|private investigator|police procedural|murder|homicide|noir|espionage|missing persons?|conspirac)/i.test(joinedSubjects) ||
      subjects.some((subject) => /^(?:mystery|mystery fiction|mystery (?:&|and) detective|detective and mystery stories?)$/i.test(subject));
    const substantiveSuspense = subjects.some((subject) => /^(?:(?:(?:romantic|psychological|legal|political|medical|technological|techno)-?\s*)?(?:suspense|thrillers?)|thrillers?\s*&\s*suspense)$/i.test(subject));
    assert.equal(romanceDominant && !directMysteryEvidence && !substantiveSuspense, false, `${item.id} cannot become mystery-primary from broad suspense taxonomy alone`);
  }
  const franklin = books.find((item) => item.id === "/works/OL26492W");
  assert.equal(franklin.genre, "history");
  assert.equal(franklin.metadataAudit.primaryGenreOverrideApplied, true);
  const foundationEdge = books.find((item) => item.id === "/works/OL46302W");
  assert.ok(foundationEdge);
  assert.equal(foundationEdge.metadataAudit.openLibraryFirstPublishYear, 1977);
  assert.equal(foundationEdge.year, 0, "a disputed edition-aggregated year must be withheld");
  assert.equal(foundationEdge.metadataAudit.displayFirstPublishYear, null);
  assert.ok(foundationEdge.metadataFlags.some((flag) => /conflict|withheld/i.test(flag)));
  assert.doesNotMatch(foundationEdge.tags.join(" "), /1970年代/);
  assert.equal(books.filter((item) => normalized(item.originalTitle) === normalized("Dog Man")).length, 1);
  const saga = books.filter((item) => /^Saga, Volume /i.test(item.originalTitle));
  assert.ok(saga.length > 0 && saga.every((item) => /Volume\s+(?:\d+|[A-Za-z]+)/i.test(item.title)));
  const mariupol = movies.find((item) => item.id === "tt24082438");
  assert.match(mariupol.summary, /马里乌波尔.*记者|记者.*马里乌波尔/);
  const future = movies.find((item) => item.id === "tt0099088");
  assert.match(future.summary, /时间旅行.*Marty McFly/);
  assert.match(future.reason, /因果悖论/);
  const movieText = (id) => {
    const item = movies.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    return `${item.summary}${item.reason}${item.metadataAudit.specificitySignals.join(" ")}`;
  };
  assert.doesNotMatch(movieText("tt1313104"), /王权|帝国/); // The Cove: "making" must not match "king".
  assert.doesNotMatch(movieText("tt0389557"), /第一次世界大战/); // Black Book: WWI must not match the prefix of WWII.
  assert.match(movieText("tt0037884"), /成瘾|戒断/);
  assert.doesNotMatch(movieText("tt0037884"), /王权|帝国/);
  assert.doesNotMatch(movieText("tt0106489"), /王权|帝国/); // A Bronx Tale: "working" must not match "king".
  assert.doesNotMatch(movieText("tt0936501"), /生命技术|遗传|DNA/); // Taken must not inherit a substring DNA match.
  assert.doesNotMatch(movieText("tt1318514"), /宇宙空间|陌生文明|宇宙条件/); // "Planet" in the title is not space evidence.
  const semanticText = (id) => {
    const item = movies.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    return `${item.metadataAudit.specificitySignals.join(" ")} ${item.metadataAudit.valueClaim}`;
  };
  const bookSemanticText = (id) => {
    const item = books.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    return `${item.metadataAudit.specificitySignals.join(" ")} ${item.metadataAudit.valueClaim}`;
  };
  for (const id of ["/works/OL16085155W", "/works/OL17184556W"]) {
    assert.match(bookSemanticText(id), /企业|创业|技术|商业/);
    assert.doesNotMatch(bookSemanticText(id), /精灵|超自然/);
  }
  assert.match(bookSemanticText("/works/OL3348011W"), /厨房|厨师|餐厅|餐饮/);
  assert.doesNotMatch(bookSemanticText("/works/OL3348011W"), /宇宙|天文/);
  assert.match(bookSemanticText("/works/OL7944812W"), /投资|债券|华尔街|金融/);
  assert.doesNotMatch(bookSemanticText("/works/OL7944812W"), /手足|兄弟关系/);
  assert.match(bookSemanticText("/works/OL17082485W"), /侦探|巧克力|工厂|破坏/);
  assert.doesNotMatch(bookSemanticText("/works/OL17082485W"), /表演者/);
  assert.match(bookSemanticText("/works/OL298031W"), /印度|非暴力|民族|政治/);
  assert.doesNotMatch(bookSemanticText("/works/OL298031W"), /原住民/);
  assert.doesNotMatch(bookSemanticText("/works/OL267174W"), /亲密关系|爱情|婚姻/);
  for (const id of ["/works/OL38128674W", "/works/OL24847149W"]) {
    assert.doesNotMatch(bookSemanticText(id), /英雄身份|公共责任/);
  }
  assert.match(bookSemanticText("/works/OL2636675W"), /第二次世界大战|V-2|火箭/);
  assert.doesNotMatch(bookSemanticText("/works/OL2636675W"), /第一次世界大战/);
  assert.match(bookSemanticText("/works/OL3126628W"), /Freddie Mercury|Queen|音乐|伴侣|艾滋病/);
  assert.doesNotMatch(bookSemanticText("/works/OL3126628W"), /制度力量与人物行动/);
  const bookById = (id) => {
    const item = books.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    return item;
  };
  assert.equal(bookById("/works/OL13826369W").genre, "history");
  assert.equal(bookById("/works/OL98487W").genre, "history");
  assert.equal(bookById("/works/OL19324556W").genre, "scifi");
  assert.equal(bookById("/works/OL17356883W").genre, "scifi");
  assert.equal(bookById("/works/OL20867W").genre, "history");
  assert.equal(bookById("/works/OL157040W").genre, "history");
  const bookSemanticCases = [
    ["/works/OL19324556W", /星战|银河战争|异星生命|帝国权力/, /战争与军事历史|后代记忆|历史读物/],
    ["/works/OL17356883W", /反乌托邦|社会阶层|特殊能力|身份选择/, /时代结构.*理解历史|历史读物/],
    ["/works/OL20867W", /19世纪|英格兰|城镇生活|婚姻|社会风俗/, /谜案|侦探|线索与诱导|控制已知与未知/],
    ["/works/OL157040W", /禁忌知识|文学伦理|知识论|科学与文明/, /侦探调查|谜案|线索与诱导/],
    ["/works/OL13826369W", /刑事司法|大规模监禁|种族歧视|公民权利/, /控制已知与未知|悬疑|谜案|线索与诱导/],
    ["/works/OL98487W", /第二次世界大战|纳粹|间谍|战犯审判/, /陌生规则|新条件下|科学想象|未来社会/],
    ["/works/OL14921145W", /计算机科学家|癌症|告别|生命态度|家庭/, /神经外科/],
    ["/works/OL17876096W", /青少年|学徒|死亡|生命伦理|科学想象/, /神经外科|癌症患者/],
    ["/works/OL18819818W", /FBI|人质谈判|谈判技巧|商业沟通/, /军事策略|军事行动/]
  ];
  for (const [id, include, exclude] of bookSemanticCases) {
    const text = bookSemanticText(id);
    assert.match(text, include, `${id} must retain its supported book topics`);
    assert.doesNotMatch(text, exclude, `${id} must not retain a polluted subject interpretation`);
  }
  const onWriting = books.find((item) => item.id === "/works/OL81601W");
  if (onWriting) {
    assert.equal(onWriting.genre, "history");
    assert.match(bookSemanticText(onWriting.id), /Stephen King|写作|创作技巧|作家/);
    assert.doesNotMatch(bookSemanticText(onWriting.id), /陌生规则|想象设定|未来社会/);
  }

  assert.match(semanticText("tt1028532"), /秋田犬|人与犬|陪伴|忠诚/);
  assert.doesNotMatch(semanticText("tt1028532"), /科学实践|工程选择|科学发现|科研|发明/);
  assert.match(semanticText("tt0074896"), /先知|穆罕默德|伊斯兰|一神|启示|宗教共同体/);
  assert.doesNotMatch(semanticText("tt0074896"), /盗窃|抢劫|偷窃|劫案/);
  assert.match(semanticText("tt0106469"), /继兄弟|手足|表亲|双族裔|族裔身份|犯罪/);
  assert.doesNotMatch(semanticText("tt0106469"), /诗歌如何进入|普通劳动者的表达|诗歌作为核心/);
  assert.match(semanticText("tt0427309"), /辩论|公共表达/);
  assert.doesNotMatch(semanticText("tt0427309"), /拳击竞技|竞技逆袭/);
  assert.match(semanticText("tt0240772"), /赌场劫案|抢劫|精密分工/);
  assert.doesNotMatch(semanticText("tt0240772"), /竞技逆袭|公众英雄/);
  assert.match(semanticText("tt1727824"), /Queen 乐队|音乐创作|Freddie Mercury/);
  assert.doesNotMatch(semanticText("tt1727824"), /王权|帝国|继承秩序/);
  assert.match(semanticText("tt1091191"), /军事|战场|阿富汗|塔利班/);
  assert.doesNotMatch(semanticText("tt1091191"), /竞技生涯|体育/);
  assert.match(semanticText("tt0057012"), /核威慑|核毁灭|核战争|全球毁灭/);
  assert.doesNotMatch(semanticText("tt0057012"), /纳粹统治|大屠杀记忆/);
  assert.match(semanticText("tt0045555"), /犯罪集团|腐败权力|警探/);
  assert.doesNotMatch(semanticText("tt0045555"), /珍贵资源|走私者/);
  assert.match(semanticText("tt0047296"), /码头工人|腐败工会|告发/);
  assert.doesNotMatch(semanticText("tt0047296"), /珍贵资源|走私者/);
  assert.match(semanticText("tt1924396"), /艺术拍卖|收藏|鉴定|欺骗/);
  assert.doesNotMatch(semanticText("tt1924396"), /小提琴|声音.*跨时代/);
  assert.match(semanticText("tt1950186"), /赛车|勒芒|汽车|工程/);
  assert.doesNotMatch(semanticText("tt1950186"), /军队|战场|革命行动/);
  assert.match(semanticText("tt0758742"), /死亡笔记|Light|道德|正义/);
  assert.doesNotMatch(semanticText("tt0758742"), /军队|战场/);
  assert.match(semanticText("tt1899353"), /警察|突袭|公寓|求生/);
  assert.doesNotMatch(semanticText("tt1899353"), /军队|战场/);
  assert.match(semanticText("tt0381849"), /押送|亡命徒|火车|道德/);
  assert.doesNotMatch(semanticText("tt0381849"), /军队|战场/);
  assert.match(semanticText("tt3397884"), /毒品|缉毒|边境|执法/);
  assert.doesNotMatch(semanticText("tt3397884"), /军队|战场/);
  assert.match(semanticText("tt0097441"), /南北战争|黑人军团|非裔士兵/);
  assert.doesNotMatch(semanticText("tt0097441"), /学校融合|校园|球队/);
  assert.match(semanticText("tt1220719"), /咏春|武术|日占|佛山/);
  assert.doesNotMatch(semanticText("tt1220719"), /创作者生涯/);
  assert.match(semanticText("tt0758758"), /荒野|旅行|自我|自然/);
  assert.doesNotMatch(semanticText("tt0758758"), /竞技生涯|体育/);
  assert.equal(movies.some((item) => item.id === "tt0815241"), false, "Religulous must not enter history through an erroneous War genre");
  assert.equal(movies.some((item) => item.id === "tt11337862"), false, "Friends: The Reunion is not a history-primary recommendation");
  for (const id of [
    "tt1152758", "tt1424432", "tt2125608", "tt1185616", "tt2870648", "tt1155592", "tt2431286",
    "tt0043338", "tt0073582", "tt1132620", "tt1855199", "tt0317248", "tt1568346"
  ]) {
    assert.doesNotMatch(semanticText(id), /危险中保存公共证据|影像见证应承担什么责任/);
  }
  assert.match(semanticText("tt24082438"), /马里乌波尔.*(?:记者|公共证据)|(?:记者|公共证据).*马里乌波尔/);
  assert.match(semanticText("tt4044364"), /Snowden|斯诺登/);
  assert.match(semanticText("tt4044364"), /监控.*公共证据|公共证据.*监控/);
  assert.match(semanticText("tt1313104"), /海豚|太地町|环保行动/);
  const semanticCases = [
    ["tt0361862", /失眠|睡眠|理智|罪疚/, /审判|证词|举证责任/],
    ["tt1132620", /记者|失踪|调查/, /工业家.*审判|举证责任/],
    ["tt0119396", /走私|线人|告密|ATF/, /飞行器研发|试飞|航空行动/],
    ["tt0039689", /旧案|背叛|腐败|过去/, /替身身份|替身何时/],
    ["tt0042208", /劫案|背叛|计划/, /替身身份|替身何时/],
    ["tt0109707", /电影创作|导演|片场|低成本/, /梦境|不可靠叙述|记忆与事实/],
    ["tt1074638", /MI6|忠诚|旧事|过去/, /幽灵威胁|逝者形象/],
    ["tt0087843", /禁酒时期|犯罪|悔恨|记忆/, /幽灵威胁|逝者形象/],
    ["tt0101507", /洛杉矶|族裔|青年|成长|暴力/, /技术、科学与未来社会|科技未来/],
    ["tt0024184", /隐形|科学家|失控/, /死亡案件及其追查|案件调查/],
    ["tt0266697", /复仇|刺客|背叛/, /昏迷、照护|照护伦理/],
    ["tt0080455", /乐队|音乐|孤儿院|兄弟/, /线索与证词|推理过程|谜底/],
    ["tt0109424", /香港|爱情|关系|警察/, /线索与证词|不完整证据|谜底/],
    ["tt1855199", /警察|搭档|日常执法/, /线索与证词|不完整证据|谜底/],
    ["tt0073195", /鲨鱼|海滩|海洋|社区/, /死亡案件及其追查|推理过程|谜底/],
    ["tt0315733", /事故|悲伤|三个人物|生命/, /犯罪网络|证词|谜底/],
    ["tt2334649", /Oscar Grant|最后一天|家庭|社区/, /犯罪网络|证词|谜底/],
    ["tt0375679", /种族|洛杉矶|交织/, /犯罪网络|证词|谜底/],
    ["tt0088680", /夜晚|Soho|连锁|遭遇/, /犯罪网络|证词|谜底/],
    ["tt0264464", /伪造|冒充|FBI|追捕/, /审判|举证责任|法律事实/],
    ["tt0083987", /非暴力|印度|殖民|独立/, /审判|举证责任|法律事实/],
    ["tt0055824", /跟踪|威胁|家庭|旧案/, /审判|举证责任|法律事实/],
    ["tt0043338", /记者|新闻|洞穴|媒体/, /表演产业|公众奇观/],
    ["tt2404461", /婚姻|离婚|家庭|关系|丈夫|妻子/, /记忆、身份与现实边界|不可靠叙述|记忆与事实/],
    ["tt0056592", /偏见|种族|辩护|阿拉巴马|父亲|教育/, /记忆、身份与现实边界|不可靠叙述|记忆与事实/],
    ["tt0043014", /编剧|电影明星|关系|复出|好莱坞/, /生存、逃脱|营救抉择|不完整证据|真相如何/],
    ["tt0026138", /科学家|怪物|伴侣|实验|创造/, /生存、逃脱|营救抉择/],
    ["tt3901826", /阿富汗|塔利班|女孩|男孩|养家|父亲/, /替身身份|替身何时|个人忠诚.*权力结构/],
    ["tt0168629", /移民|音乐剧|视力|失明|家庭/, /亲密关系与环境冲突|爱情主线|浪漫关系/],
    ["tt2431286", /记者|寻找|儿子|修道院|母亲/, /政治权力|政治处境|政府权力|公共抉择/],
    ["tt0051036", /专栏|公关|妹妹|爵士|拆散|胁迫/, /创作者生涯|艺术家生涯|音乐创作生涯/],
    ["tt0069762", /连环|杀戮|青年|南达科他|暴力/, /案件及其追查|调查、线索与真相|证词|谜底/],
    ["tt0110413", /复仇|杀手|女孩|家人|腐败警员/, /案件及其追查|调查、线索与真相|证词|谜底/],
    ["tt0077651", /Michael Myers|精神病院|小镇|追杀|万圣节/, /案件及其追查|调查、线索与真相|证词|谜底/],
    ["tt0099088", /时间旅行|1885|Marty|Doc|救援|拯救/, /死亡、哀伤|哀伤与重建|丧亲/]
  ];
  for (const [id, include, exclude] of semanticCases) {
    const text = semanticText(id);
    assert.match(text, include, `${id} must retain its supported story core`);
    assert.doesNotMatch(text, exclude, `${id} must not retain a weak substring or role-based overclaim`);
  }
  const room = movies.find((item) => item.id === "tt3170832");
  assert.equal(new Set(room.metadataAudit.specificitySignals).size, room.metadataAudit.specificitySignals.length);
  assert.match(room.reason, /囚禁.*创伤/);
  assert.doesNotMatch(room.reason, /推理|谜底|不完整证据/);
});

test("the supplementary source manifest is frozen and internally hash-complete", () => {
  const pointerPath = path.join(ROOT, "data", "upstream", "media500", "latest.json");
  const pointer = readJson(pointerPath);
  const manifestPath = path.join(ROOT, ...pointer.manifest.split("/"));
  const manifestBytes = fs.readFileSync(manifestPath);
  assert.equal(sha256(manifestBytes), pointer.sha256);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.entries.length, 119);
  for (const entry of manifest.entries) {
    const evidencePath = path.join(ROOT, ...entry.file.split("/"));
    const bytes = fs.readFileSync(evidencePath);
    assert.equal(bytes.length, entry.bytes, entry.id);
    assert.equal(sha256(bytes), entry.sha256, entry.id);
  }
});
