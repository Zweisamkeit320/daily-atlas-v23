(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasMusic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const STORAGE_KEY = "dailyAtlas.audio.v2";
  const LEGACY_STORAGE_KEY = "dailyAtlas.audio.v1";
  const SCALES = Object.freeze({
    majorPentatonic: Object.freeze([0, 2, 4, 7, 9]),
    minorPentatonic: Object.freeze([0, 3, 5, 7, 10]),
    major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
    dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
    mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
    chromatic: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  });

  function track(definition) {
    const sourceKind = definition.sourceKind || "original-procedural";
    const isPublicDomainArrangement = sourceKind === "public-domain-arrangement";
    const composer = definition.composer || "今日万象程序化音乐";
    const disclosure = definition.disclosure || (isPublicDomainArrangement
      ? "作品谱面属公版范畴；本项目依据主题素材重新编配并由浏览器实时合成，不含、也不复刻任何第三方录音。"
      : "今日万象原创参数化小品，由浏览器实时合成，不使用外部录音或采样。");
    return Object.freeze({
      ...definition,
      sourceKind,
      composer,
      compositionPublicDomain: isPublicDomainArrangement,
      performanceType: "in-browser-procedural-synthesis",
      recordingSource: "none",
      disclosure,
      menuLabel: definition.menuLabel || definition.title,
      melody: Object.freeze(definition.melody.slice()),
      bass: Object.freeze(definition.bass.slice())
    });
  }

  function originalTrack(definition) {
    return track({ sourceKind: "original-procedural", ...definition });
  }

  function publicDomainTrack(definition) {
    return track({
      sourceKind: "public-domain-arrangement",
      menuLabel: `${definition.composer}《${definition.title}》｜公版·本项目合成`,
      ...definition
    });
  }

  // The original twenty IDs stay stable so existing saved preferences continue
  // to resolve after the library expansion.
  const CORE_ORIGINAL_TRACKS = Object.freeze([
    originalTrack({ id: "morning-harbor", title: "晨雾港湾", bpm: 72, rootMidi: 50, scale: "majorPentatonic", melody: [0, 2, 4, 2, 1, 3, 2, 0], bass: [0, 3, 1, 4], harmony: 2, wave: "sine", filter: 2100, delay: 0.38, feedback: 0.22 }),
    originalTrack({ id: "rainy-study", title: "雨后书房", bpm: 68, rootMidi: 48, scale: "dorian", melody: [0, 1, 3, 4, 2, 1, -1, 0, 2, 4], bass: [0, 4, 3, 1], harmony: 3, wave: "triangle", filter: 1850, delay: 0.44, feedback: 0.2 }),
    originalTrack({ id: "moonlit-walk", title: "月下慢行", bpm: 76, rootMidi: 45, scale: "minorPentatonic", melody: [0, 3, 2, 4, 3, 1, 2, 0], bass: [0, 2, 4, 1], harmony: 2, wave: "sine", filter: 1950, delay: 0.52, feedback: 0.24 }),
    originalTrack({ id: "moss-garden", title: "苔庭回声", bpm: 64, rootMidi: 53, scale: "majorPentatonic", melody: [0, null, 1, 3, 4, 2, null, 1, 2, 0], bass: [0, 1, 3, 2], harmony: 3, wave: "triangle", filter: 1700, delay: 0.6, feedback: 0.27 }),
    originalTrack({ id: "valley-glow", title: "山谷微光", bpm: 80, rootMidi: 47, scale: "major", melody: [0, 2, 4, 5, 4, 2, 1, 3, 2, 0], bass: [0, 3, 4, 2], harmony: 2, wave: "sine", filter: 2300, delay: 0.34, feedback: 0.18 }),
    originalTrack({ id: "paper-afternoon", title: "午后纸页", bpm: 70, rootMidi: 52, scale: "mixolydian", melody: [0, 1, 3, 2, 4, 3, 5, 3, 1, 0], bass: [0, 4, 1, 3], harmony: 2, wave: "triangle", filter: 2050, delay: 0.41, feedback: 0.21 }),
    originalTrack({ id: "north-window-snow", title: "北窗细雪", bpm: 66, rootMidi: 49, scale: "minorPentatonic", melody: [0, 1, null, 3, 2, 4, 2, null, 1, -1], bass: [0, 3, 1, 2], harmony: 3, wave: "sine", filter: 1600, delay: 0.58, feedback: 0.26 }),
    originalTrack({ id: "forest-tea", title: "林间茶席", bpm: 78, rootMidi: 55, scale: "majorPentatonic", melody: [0, 1, 2, 4, 3, 2, 4, 5, 3, 1], bass: [0, 2, 3, 1], harmony: 2, wave: "triangle", filter: 2350, delay: 0.32, feedback: 0.17 }),
    originalTrack({ id: "far-lighthouse", title: "远岸灯塔", bpm: 74, rootMidi: 43, scale: "dorian", melody: [0, 4, 3, 1, 2, 5, 4, 2, 1, 0], bass: [0, 3, 4, 1], harmony: 4, wave: "sine", filter: 1900, delay: 0.47, feedback: 0.23 }),
    originalTrack({ id: "cloud-train", title: "云端列车", bpm: 88, rootMidi: 51, scale: "major", melody: [0, 2, 3, 5, 4, 6, 5, 3, 4, 2, 1, 0], bass: [0, 4, 3, 5], harmony: 2, wave: "triangle", filter: 2500, delay: 0.29, feedback: 0.16 }),
    originalTrack({ id: "still-water", title: "静水浮舟", bpm: 62, rootMidi: 46, scale: "majorPentatonic", melody: [0, null, 3, 2, null, 1, 4, 2, null, 0], bass: [0, 1, 4, 2], harmony: 3, wave: "sine", filter: 1550, delay: 0.66, feedback: 0.28 }),
    originalTrack({ id: "autumn-arcade", title: "秋日回廊", bpm: 82, rootMidi: 50, scale: "mixolydian", melody: [0, 3, 4, 2, 1, 5, 4, 3, 1, 2, 0, -1], bass: [0, 4, 2, 3], harmony: 2, wave: "triangle", filter: 2200, delay: 0.36, feedback: 0.19 }),
    originalTrack({ id: "sleepy-star-map", title: "星图睡意", bpm: 60, rootMidi: 45, scale: "minorPentatonic", melody: [0, null, 2, 4, null, 3, 1, null, 2, -1], bass: [0, 2, 1, 4], harmony: 3, wave: "sine", filter: 1450, delay: 0.72, feedback: 0.3 }),
    originalTrack({ id: "evening-garden", title: "晚风花园", bpm: 75, rootMidi: 54, scale: "major", melody: [0, 1, 4, 3, 2, 5, 3, 1, 2, 4, 2, 0], bass: [0, 3, 5, 2], harmony: 2, wave: "triangle", filter: 2250, delay: 0.4, feedback: 0.2 }),
    originalTrack({ id: "pine-and-moon", title: "松针与月", bpm: 69, rootMidi: 47, scale: "dorian", melody: [0, 2, 1, 4, 2, 5, 3, 1, 3, 0], bass: [0, 4, 1, 3], harmony: 4, wave: "sine", filter: 1750, delay: 0.55, feedback: 0.25 }),
    originalTrack({ id: "blue-hour-river", title: "河畔蓝时", bpm: 84, rootMidi: 49, scale: "minorPentatonic", melody: [0, 2, 3, 5, 4, 2, 1, 3, 4, 1, 0, -1], bass: [0, 3, 2, 4], harmony: 2, wave: "triangle", filter: 2150, delay: 0.35, feedback: 0.18 }),
    originalTrack({ id: "dune-whisper", title: "沙丘夜语", bpm: 67, rootMidi: 44, scale: "mixolydian", melody: [0, 4, 2, null, 3, 5, 1, null, 2, 0], bass: [0, 2, 5, 3], harmony: 3, wave: "sine", filter: 1650, delay: 0.62, feedback: 0.29 }),
    originalTrack({ id: "morning-eaves", title: "清晨雨檐", bpm: 79, rootMidi: 52, scale: "majorPentatonic", melody: [0, 2, 1, 3, 5, 4, 2, 3, 1, 0], bass: [0, 4, 2, 1], harmony: 2, wave: "triangle", filter: 2400, delay: 0.31, feedback: 0.17 }),
    originalTrack({ id: "old-town-dusk", title: "旧城黄昏", bpm: 71, rootMidi: 48, scale: "dorian", melody: [0, 3, 1, 2, 4, 6, 4, 2, 5, 3, 1, 0], bass: [0, 5, 3, 1], harmony: 3, wave: "sine", filter: 1800, delay: 0.49, feedback: 0.24 }),
    originalTrack({ id: "sea-salt-breeze", title: "海盐微风", bpm: 86, rootMidi: 53, scale: "mixolydian", melody: [0, 1, 4, 5, 3, 6, 4, 2, 3, 5, 1, 0], bass: [0, 3, 4, 1], harmony: 2, wave: "triangle", filter: 2450, delay: 0.3, feedback: 0.16 })
  ]);

  const GENERATED_ORIGINAL_NAMES = Object.freeze([
    ["dawn-library", "曙光书库"], ["bamboo-rain", "竹窗听雨"], ["amber-window", "琥珀窗棂"], ["quiet-orbit", "静谧轨道"],
    ["meadow-letter", "草甸来信"], ["porcelain-sky", "瓷蓝天光"], ["hidden-courtyard", "深巷小院"], ["lake-at-five", "五点湖面"],
    ["cedar-path", "雪松小径"], ["lantern-tide", "灯潮微澜"], ["silk-road-dawn", "丝路晨光"], ["stone-bridge-rain", "石桥疏雨"],
    ["winter-library", "冬日藏书阁"], ["peach-cloud", "桃云缓行"], ["lighthouse-notes", "灯塔手记"], ["reed-marsh", "风过芦苇"],
    ["starlit-platform", "星夜站台"], ["garden-after-rain", "雨后庭园"], ["quiet-museum", "静默博物馆"], ["apricot-evening", "杏色黄昏"],
    ["glacier-breath", "冰川呼吸"], ["maple-window", "枫影窗前"], ["harbor-postcard", "港湾明信片"], ["mountain-ink", "山色入墨"],
    ["warm-porch", "温暖廊下"], ["blue-porcelain", "青花微光"], ["island-clock", "岛屿慢钟"], ["cloud-observatory", "云上观星台"],
    ["linen-curtain", "亚麻窗帘"], ["river-stones", "河岸卵石"], ["tea-steam", "茶烟轻起"], ["midnight-archive", "午夜档案馆"],
    ["coast-journal", "海岸札记"], ["violet-hour", "紫罗兰时刻"], ["moon-over-tiles", "月照青瓦"], ["pale-gold-field", "淡金原野"],
    ["pine-library", "松林书屋"], ["silent-canal", "静水运河"], ["windmill-dusk", "风车暮色"], ["olive-grove", "橄榄林风"],
    ["aurora-letter", "极光来信"], ["old-map", "旧地图边缘"], ["summer-eaves", "夏日檐影"], ["night-ferry", "夜渡微灯"],
    ["snowbound-cabin", "雪夜木屋"], ["misty-orchard", "雾中果园"], ["copper-moon", "铜色月亮"], ["slow-compass", "缓慢罗盘"],
    ["quiet-greenhouse", "安静温室"], ["seaside-reading", "海边阅读"], ["birch-sunrise", "白桦日出"], ["ink-and-rain", "墨色微雨"],
    ["terrace-wind", "露台晚风"], ["constellation-lake", "星座湖面"], ["orchard-noon", "果园正午"], ["distant-bell", "远处钟声"],
    ["pearl-morning", "珍珠清晨"], ["paper-kite", "纸鸢轻行"], ["willow-reflection", "柳影倒映"], ["sunday-window", "周日窗边"]
  ]);

  const GENERATED_MELODIES = Object.freeze([
    Object.freeze([0, 1, 3, 2, 4, 3, 1, 2, 0, -1]),
    Object.freeze([0, 2, 4, 3, 5, 2, 4, 1, 3, 0]),
    Object.freeze([0, null, 2, 3, 5, 4, null, 2, 1, 0]),
    Object.freeze([0, 3, 1, 4, 2, 5, 3, 2, 1, 0]),
    Object.freeze([0, 1, 4, 2, 5, 3, 6, 4, 2, 0]),
    Object.freeze([0, 4, 2, 1, 3, 5, 4, 2, 3, 0]),
    Object.freeze([0, 2, 1, null, 4, 5, 3, null, 2, 0]),
    Object.freeze([0, 1, 2, 5, 4, 2, 3, 6, 3, 1, 0]),
    Object.freeze([0, 3, 5, 4, 2, 1, 4, 3, 1, -1]),
    Object.freeze([0, 2, 4, 6, 5, 3, 1, 2, 4, 2, 0])
  ]);

  const GENERATED_BASS = Object.freeze([
    Object.freeze([0, 3, 1, 4]), Object.freeze([0, 4, 2, 1]),
    Object.freeze([0, 2, 4, 3]), Object.freeze([0, 5, 3, 1]),
    Object.freeze([0, 1, 3, 2]), Object.freeze([0, 4, 1, 3])
  ]);

  function generatedOriginalTrack(name, index) {
    const [id, title] = name;
    return originalTrack({
      id,
      title,
      bpm: 61 + (index % 30),
      rootMidi: 43 + Math.floor(index / 30),
      scale: ["majorPentatonic", "minorPentatonic", "major", "dorian", "mixolydian"][index % 5],
      melody: GENERATED_MELODIES[index % GENERATED_MELODIES.length],
      bass: GENERATED_BASS[index % GENERATED_BASS.length],
      harmony: 2 + (index % 3),
      wave: index % 2 ? "triangle" : "sine",
      filter: 1550 + (index % 10) * 95,
      delay: Number((0.3 + (index % 8) * 0.045).toFixed(3)),
      feedback: Number((0.16 + (index % 7) * 0.018).toFixed(3))
    });
  }

  const GENERATED_ORIGINAL_TRACKS = Object.freeze(GENERATED_ORIGINAL_NAMES.map(generatedOriginalTrack));

  // These are short original synth arrangements based on themes from public-domain
  // scores. No commercial recording, performance capture, or audio sample ships
  // with the app. The metadata keeps composition rights separate from this render.
  const PUBLIC_DOMAIN_TRACKS = Object.freeze([
    publicDomainTrack({ id: "pd-bach-air", title: "G弦上的咏叹调", composer: "J. S. 巴赫", work: "BWV 1068 第二乐章", bpm: 64, rootMidi: 50, scale: "chromatic", melody: [12, 11, 12, 7, 5, 4, 2, 4, 0, 2, 4, 7], bass: [0, 7, 9, 5], harmony: 4, wave: "sine", filter: 1750, delay: 0.58, feedback: 0.24 }),
    publicDomainTrack({ id: "pd-bach-prelude-c", title: "C大调前奏曲", composer: "J. S. 巴赫", work: "BWV 846", bpm: 72, rootMidi: 48, scale: "chromatic", melody: [0, 4, 7, 12, 4, 7, 12, 16, 0, 5, 9, 12, 5, 9, 12, 17], bass: [0, 5, 7, 0], harmony: 7, wave: "triangle", filter: 2050, delay: 0.42, feedback: 0.18 }),
    publicDomainTrack({ id: "pd-pachelbel-canon", title: "D大调卡农", composer: "帕赫贝尔", work: "P. 37", bpm: 66, rootMidi: 50, scale: "chromatic", melody: [14, 12, 11, 9, 7, 5, 7, 9, 11, 9, 7, 5], bass: [0, 7, 9, 4], harmony: 4, wave: "sine", filter: 1900, delay: 0.5, feedback: 0.22 }),
    publicDomainTrack({ id: "pd-vivaldi-spring", title: "四季·春", composer: "维瓦尔第", work: "RV 269", bpm: 84, rootMidi: 52, scale: "chromatic", melody: [0, 0, 0, 2, 4, 4, 4, 2, 0, 0, 0, 2, 4, 7, 7], bass: [0, 7, 5, 7], harmony: 4, wave: "triangle", filter: 2350, delay: 0.3, feedback: 0.16 }),
    publicDomainTrack({ id: "pd-vivaldi-winter", title: "四季·冬", composer: "维瓦尔第", work: "RV 297", bpm: 82, rootMidi: 53, scale: "chromatic", melody: [0, 0, 0, 1, 0, -1, 0, 3, 2, 1, 0, -1], bass: [0, 5, 3, 7], harmony: 3, wave: "triangle", filter: 2050, delay: 0.34, feedback: 0.17 }),
    publicDomainTrack({ id: "pd-mozart-eine-kleine", title: "G大调弦乐小夜曲", composer: "莫扎特", work: "K. 525", bpm: 88, rootMidi: 55, scale: "chromatic", melody: [0, 7, 0, 4, 7, 4, 0, 7, 0, 4, 7, 4, 11, 9, 7], bass: [0, 7, 5, 2], harmony: 4, wave: "triangle", filter: 2450, delay: 0.28, feedback: 0.15 }),
    publicDomainTrack({ id: "pd-mozart-turkish-march", title: "土耳其进行曲", composer: "莫扎特", work: "K. 331 第三乐章", bpm: 90, rootMidi: 57, scale: "chromatic", melody: [0, 2, 3, 5, 3, 2, 0, 8, 7, 5, 3, 2, 0], bass: [0, 7, 5, 4], harmony: 4, wave: "triangle", filter: 2500, delay: 0.26, feedback: 0.14 }),
    publicDomainTrack({ id: "pd-beethoven-fur-elise", title: "致爱丽丝", composer: "贝多芬", work: "WoO 59", bpm: 76, rootMidi: 57, scale: "chromatic", melody: [7, 6, 7, 6, 7, 2, 5, 3, 0, null, 0, 2, 3, 5], bass: [0, 7, 0, 7], harmony: 3, wave: "sine", filter: 2100, delay: 0.44, feedback: 0.2 }),
    publicDomainTrack({ id: "pd-beethoven-moonlight", title: "月光奏鸣曲", composer: "贝多芬", work: "Op. 27 No. 2 第一乐章", bpm: 60, rootMidi: 49, scale: "chromatic", melody: [0, 7, 12, 3, 7, 12, 4, 7, 12, 3, 7, 12], bass: [0, 7, 5, 7], harmony: 3, wave: "sine", filter: 1500, delay: 0.68, feedback: 0.29 }),
    publicDomainTrack({ id: "pd-beethoven-fifth", title: "第五交响曲·命运动机", composer: "贝多芬", work: "Op. 67 第一乐章", bpm: 78, rootMidi: 48, scale: "chromatic", melody: [7, 7, 7, 3, null, 5, 5, 5, 2, null, 7, 7, 8, 7], bass: [0, 7, 3, 5], harmony: 3, wave: "triangle", filter: 2200, delay: 0.36, feedback: 0.19 }),
    publicDomainTrack({ id: "pd-mendelssohn-spring-song", title: "春之歌", composer: "门德尔松", work: "Op. 62 No. 6", bpm: 74, rootMidi: 57, scale: "chromatic", melody: [4, 5, 7, 9, 7, 5, 4, 2, 4, 5, 7, 12], bass: [0, 5, 7, 4], harmony: 4, wave: "sine", filter: 2150, delay: 0.46, feedback: 0.2 }),
    publicDomainTrack({ id: "pd-chopin-nocturne-9-2", title: "降E大调夜曲", composer: "肖邦", work: "Op. 9 No. 2", bpm: 64, rootMidi: 51, scale: "chromatic", melody: [7, 5, 3, 2, 0, 2, 3, 7, 10, 8, 7, 5], bass: [0, 7, 5, 7], harmony: 4, wave: "sine", filter: 1700, delay: 0.6, feedback: 0.26 }),
    publicDomainTrack({ id: "pd-schumann-traumerei", title: "梦幻曲", composer: "舒曼", work: "Op. 15 No. 7", bpm: 62, rootMidi: 53, scale: "chromatic", melody: [0, 4, 7, 12, 11, 9, 7, 5, 4, 2, 0], bass: [0, 7, 5, 4], harmony: 4, wave: "sine", filter: 1650, delay: 0.62, feedback: 0.27 }),
    publicDomainTrack({ id: "pd-brahms-hungarian-dance-5", title: "匈牙利舞曲第五号", composer: "勃拉姆斯", work: "WoO 1 No. 5", bpm: 86, rootMidi: 54, scale: "chromatic", melody: [0, 3, 7, 6, 7, 10, 7, 6, 3, 0, 3, 6], bass: [0, 7, 3, 5], harmony: 3, wave: "triangle", filter: 2350, delay: 0.31, feedback: 0.16 }),
    publicDomainTrack({ id: "pd-tchaikovsky-swan-lake", title: "天鹅湖主题", composer: "柴可夫斯基", work: "Op. 20", bpm: 68, rootMidi: 47, scale: "chromatic", melody: [0, 2, 3, 5, 7, 10, 8, 7, 5, 3, 2, 0], bass: [0, 7, 8, 5], harmony: 3, wave: "sine", filter: 1800, delay: 0.54, feedback: 0.24 }),
    publicDomainTrack({ id: "pd-grieg-morning-mood", title: "晨景", composer: "格里格", work: "Op. 46 No. 1", bpm: 72, rootMidi: 52, scale: "chromatic", melody: [0, 2, 4, 7, 4, 2, 0, 4, 7, 9, 7, 4], bass: [0, 7, 5, 7], harmony: 4, wave: "triangle", filter: 2250, delay: 0.4, feedback: 0.18 }),
    publicDomainTrack({ id: "pd-debussy-clair-de-lune", title: "月光", composer: "德彪西", work: "L. 75 No. 3", bpm: 60, rootMidi: 49, scale: "chromatic", melody: [0, 7, 12, 14, 15, 12, 10, 7, 5, 3, 2, 0], bass: [0, 7, 5, 3], harmony: 4, wave: "sine", filter: 1450, delay: 0.72, feedback: 0.3 }),
    publicDomainTrack({ id: "pd-satie-gymnopedie-1", title: "第一号吉诺佩蒂", composer: "萨蒂", work: "Gymnopédie No. 1", bpm: 60, rootMidi: 50, scale: "chromatic", melody: [0, 4, 7, 11, 7, 4, 2, 5, 9, 12, 9, 5], bass: [0, 5, 2, 7], harmony: 4, wave: "sine", filter: 1500, delay: 0.7, feedback: 0.29 }),
    publicDomainTrack({ id: "pd-dvorak-new-world-largo", title: "新世界交响曲·广板", composer: "德沃夏克", work: "Op. 95 第二乐章", bpm: 66, rootMidi: 49, scale: "chromatic", melody: [0, 2, 4, 7, 4, 2, 0, -1, 0, 2, 4, 2], bass: [0, 7, 5, 4], harmony: 4, wave: "sine", filter: 1750, delay: 0.56, feedback: 0.25 }),
    publicDomainTrack({ id: "pd-saint-saens-swan", title: "天鹅", composer: "圣-桑", work: "《动物狂欢节》第十三曲", bpm: 64, rootMidi: 55, scale: "chromatic", melody: [0, 2, 4, 7, 11, 9, 7, 5, 4, 2, 0], bass: [0, 7, 5, 2], harmony: 4, wave: "sine", filter: 1650, delay: 0.64, feedback: 0.27 })
  ]);

  // 80 original procedural presets + 20 public-domain-theme synth arrangements.
  const TRACKS = Object.freeze([
    ...CORE_ORIGINAL_TRACKS,
    ...GENERATED_ORIGINAL_TRACKS,
    ...PUBLIC_DOMAIN_TRACKS
  ]);

  const document = root.document || null;
  const AudioContextClass = root.AudioContext || root.webkitAudioContext || null;
  const elements = {
    toggle: document?.querySelector("#musicToggle") || null,
    status: document?.querySelector("#musicStatus") || null,
    volume: document?.querySelector("#musicVolume") || null,
    track: document?.querySelector("#musicTrack") || null
  };
  const state = {
    context: null,
    bus: null,
    master: null,
    filter: null,
    delay: null,
    feedback: null,
    timer: null,
    playing: false,
    starting: false,
    startToken: 0,
    nextNoteTime: 0,
    step: 0,
    activeNodes: new Set(),
    duckReasons: new Set(),
    volume: 0.18,
    trackId: TRACKS[0].id,
    persistence: Promise.resolve(),
    initialized: false
  };

  function safeStorageGet(key, storage) {
    try { return (storage || root.localStorage)?.getItem(key) || null; } catch (_error) { return null; }
  }

  function transactionStorage(lease) {
    const storage = lease?.storage;
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
    if (!root.DailyAtlasLock?.constants && !document && root.localStorage) return root.localStorage;
    throw new Error("Canonical audio transaction storage is unavailable");
  }

  function runPersistenceTask(task) {
    if (root.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false) return Promise.resolve(false);
    if (root.DAILY_ATLAS_IMPORT_RECOVERY?.ok === false) return Promise.reject(new Error("Import recovery is incomplete"));
    if (typeof root.DailyAtlasLock?.transaction === "function") return root.DailyAtlasLock.transaction(task);
    if (document) return Promise.reject(new Error("The shared persistence transaction coordinator is unavailable"));
    return Promise.resolve().then(() => task({ storage: root.localStorage }));
  }

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch (_error) { return null; }
  }

  function clampVolume(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.18;
  }

  function isTrackId(value) {
    return TRACKS.some((entry) => entry.id === value);
  }

  function loadPreferences(storage) {
    const current = parseJson(safeStorageGet(STORAGE_KEY, storage));
    const legacy = parseJson(safeStorageGet(LEGACY_STORAGE_KEY, storage));
    return {
      volume: clampVolume(current?.volume ?? legacy?.volume ?? 0.18),
      trackId: isTrackId(current?.trackId) ? current.trackId : TRACKS[0].id
    };
  }

  function preferencePatch(value) {
    const input = value && typeof value === "object" ? value : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(input, "volume")) patch.volume = clampVolume(input.volume);
    if (Object.prototype.hasOwnProperty.call(input, "trackId") && isTrackId(input.trackId)) patch.trackId = input.trackId;
    return patch;
  }

  function savePreferences(value) {
    const patch = preferencePatch(value);
    state.persistence = runPersistenceTask((lease) => {
      const storage = transactionStorage(lease);
      const next = { ...loadPreferences(storage), ...patch };
      const current = JSON.stringify(next);
      const legacy = JSON.stringify({ volume: next.volume });
      storage.setItem(STORAGE_KEY, current);
      // Keep the v1 volume mirror so older builds can still read a safe preference.
      storage.setItem(LEGACY_STORAGE_KEY, legacy);
      if (storage.getItem(STORAGE_KEY) !== current || storage.getItem(LEGACY_STORAGE_KEY) !== legacy) {
        throw new Error("Audio preference write verification failed");
      }
      return next;
    }).then(() => true).catch((error) => error?.committed === true);
    return state.persistence;
  }

  function currentTrack() {
    return TRACKS.find((entry) => entry.id === state.trackId) || TRACKS[0];
  }

  function initialize() {
    if (state.initialized) return api;
    const saved = loadPreferences();
    state.volume = saved.volume;
    state.trackId = saved.trackId;
    state.initialized = true;
    if (elements.volume) {
      elements.volume.value = String(Math.round(state.volume * 100));
      elements.volume.addEventListener("input", () => setVolume(Number(elements.volume.value) / 100));
    }
    if (elements.toggle) {
      elements.toggle.addEventListener("click", () => {
        if (state.playing || state.starting) pause("已暂停");
        else void play();
      });
    }
    if (elements.track) {
      populateTrackSelect();
      elements.track.value = state.trackId;
      elements.track.addEventListener("change", () => setTrack(elements.track.value));
    }
    document?.addEventListener("visibilitychange", () => {
      if (document.hidden && (state.playing || state.starting)) pause("已暂停 · 点击继续", true);
    });
    root.addEventListener?.("pagehide", () => pause("已暂停", true));
    updateUi(false, AudioContextClass ? "点击播放" : "浏览器不支持");
    if (!AudioContextClass) {
      if (elements.toggle) elements.toggle.disabled = true;
      if (elements.volume) elements.volume.disabled = true;
      if (elements.track) elements.track.disabled = true;
    }
    return api;
  }

  function populateTrackSelect() {
    if (!elements.track || !document) return;
    elements.track.replaceChildren(...TRACKS.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.menuLabel;
      option.title = entry.disclosure;
      return option;
    }));
  }

  function createGraph() {
    if (!AudioContextClass) throw new Error("unsupported");
    const context = new AudioContextClass();
    const bus = context.createGain();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const delay = context.createDelay(2.2);
    const feedback = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    bus.gain.value = 1;
    master.gain.value = 0;
    filter.type = "lowpass";
    filter.Q.value = 0.55;
    dry.gain.value = 1;
    wet.gain.value = 0.16;
    bus.connect(filter);
    filter.connect(dry);
    dry.connect(master);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    master.connect(context.destination);
    state.context = context;
    state.bus = bus;
    state.master = master;
    state.filter = filter;
    state.delay = delay;
    state.feedback = feedback;
    applyTrackGraph();
  }

  function applyTrackGraph() {
    if (!state.context) return;
    const preset = currentTrack();
    const now = state.context.currentTime;
    state.filter.frequency.cancelScheduledValues(now);
    state.filter.frequency.setTargetAtTime(preset.filter, now, 0.08);
    state.delay.delayTime.cancelScheduledValues(now);
    state.delay.delayTime.setTargetAtTime(preset.delay, now, 0.08);
    state.feedback.gain.cancelScheduledValues(now);
    state.feedback.gain.setTargetAtTime(preset.feedback, now, 0.08);
  }

  function effectiveVolume() {
    return state.duckReasons.size ? state.volume * 0.12 : state.volume;
  }

  function setMasterGain(value, immediate) {
    if (!state.master || !state.context) return;
    const now = state.context.currentTime;
    const target = Math.max(0, Number(value) || 0);
    state.master.gain.cancelScheduledValues(now);
    if (immediate || target === 0) state.master.gain.setValueAtTime(target, now);
    else state.master.gain.setTargetAtTime(target, now, 0.06);
  }

  function setVolume(value) {
    state.volume = clampVolume(value);
    if (elements.volume) elements.volume.value = String(Math.round(state.volume * 100));
    savePreferences({ volume: state.volume });
    if (state.playing) setMasterGain(effectiveVolume(), state.volume === 0);
    if (state.playing) updateUi(true, state.volume === 0 ? "播放中 · 音量为零" : "柔和播放中");
    return state.volume;
  }

  function setTrack(trackId) {
    if (!isTrackId(trackId)) return false;
    if (state.trackId === trackId) return true;
    state.trackId = trackId;
    savePreferences({ trackId });
    if (elements.track) elements.track.value = trackId;
    if (state.context) applyTrackGraph();
    if (state.playing) {
      stopActiveNodes(true);
      state.step = 0;
      state.nextNoteTime = state.context.currentTime + 0.08;
      scheduler();
    }
    updateUi(state.playing, state.playing ? "柔和播放中" : "点击播放");
    return true;
  }

  function nextTrack(offset) {
    const current = TRACKS.findIndex((entry) => entry.id === state.trackId);
    const amount = Number.isInteger(offset) ? offset : 1;
    const index = ((current + amount) % TRACKS.length + TRACKS.length) % TRACKS.length;
    setTrack(TRACKS[index].id);
    return TRACKS[index];
  }

  async function play() {
    if (state.playing || state.starting) return false;
    const token = ++state.startToken;
    state.starting = true;
    try {
      if (!state.context) createGraph();
      await state.context.resume();
      if (token !== state.startToken) {
        if (!state.playing && !state.starting && state.context.state === "running") await state.context.suspend();
        return false;
      }
      if (document?.hidden) {
        state.starting = false;
        state.playing = false;
        if (state.context.state === "running") await state.context.suspend();
        updateUi(false, "已暂停 · 点击继续");
        return false;
      }
      state.playing = true;
      state.starting = false;
      state.step = 0;
      state.nextNoteTime = state.context.currentTime + 0.08;
      const target = effectiveVolume();
      const now = state.context.currentTime;
      state.master.gain.cancelScheduledValues(now);
      if (target === 0) state.master.gain.setValueAtTime(0, now);
      else {
        state.master.gain.setValueAtTime(Math.max(0.0001, state.master.gain.value), now);
        state.master.gain.exponentialRampToValueAtTime(target, now + 0.65);
      }
      scheduler();
      if (state.timer) root.clearInterval(state.timer);
      state.timer = root.setInterval(scheduler, 100);
      updateUi(true, state.volume === 0 ? "播放中 · 音量为零" : "柔和播放中");
      return true;
    } catch (_error) {
      if (token === state.startToken) {
        state.playing = false;
        state.starting = false;
        updateUi(false, "当前浏览器无法播放");
      }
      return false;
    } finally {
      if (token === state.startToken && !state.playing) state.starting = false;
    }
  }

  function pause(label, immediate) {
    state.startToken += 1;
    state.starting = false;
    if (state.timer) root.clearInterval(state.timer);
    state.timer = null;
    state.playing = false;
    if (state.context && state.master) {
      setMasterGain(0, true);
      stopActiveNodes(Boolean(immediate));
      root.setTimeout(() => {
        if (!state.playing && !state.starting && state.context?.state === "running") state.context.suspend().catch(() => {});
      }, immediate ? 40 : 420);
    }
    updateUi(false, label || "已暂停");
    return true;
  }

  function stopActiveNodes(immediate) {
    if (!state.context) return;
    const when = state.context.currentTime + (immediate ? 0.02 : 0.22);
    for (const oscillator of state.activeNodes) {
      try { oscillator.stop(when); } catch (_error) {}
    }
    state.activeNodes.clear();
  }

  function duck(reason) {
    state.duckReasons.add(String(reason || "external"));
    if (state.playing) setMasterGain(effectiveVolume(), false);
    dispatchState(state.playing ? "朗读时已降低背景音乐" : "背景音乐已准备降低");
    return state.duckReasons.size;
  }

  function unduck(reason) {
    state.duckReasons.delete(String(reason || "external"));
    if (state.playing) setMasterGain(effectiveVolume(), false);
    dispatchState(state.playing ? "柔和播放中" : "已暂停");
    return state.duckReasons.size;
  }

  function scheduler() {
    if (!state.playing || !state.context) return;
    const secondsPerBeat = 60 / currentTrack().bpm;
    while (state.nextNoteTime < state.context.currentTime + 0.32) {
      scheduleStep(state.step, state.nextNoteTime, secondsPerBeat);
      state.nextNoteTime += secondsPerBeat;
      state.step += 1;
    }
  }

  function degreeFrequency(rootMidi, scaleName, degree) {
    const scale = SCALES[scaleName] || SCALES.majorPentatonic;
    const octave = Math.floor(degree / scale.length);
    const index = ((degree % scale.length) + scale.length) % scale.length;
    const midi = rootMidi + scale[index] + octave * 12;
    return 440 * (2 ** ((midi - 69) / 12));
  }

  function scheduleStep(step, time, beat) {
    const preset = currentTrack();
    const degree = preset.melody[step % preset.melody.length];
    if (Number.isInteger(degree)) {
      scheduleTone(degreeFrequency(preset.rootMidi, preset.scale, degree), time, beat * 1.72, 0.09, preset.wave, 0.27);
      if (step % 2 === 0) {
        scheduleTone(degreeFrequency(preset.rootMidi - 12, preset.scale, degree + preset.harmony), time + beat * 0.18, beat * 2.15, 0.046, preset.wave === "sine" ? "triangle" : "sine", -0.24);
      }
    }
    if (step % 4 === 0) {
      const bassDegree = preset.bass[Math.floor(step / 4) % preset.bass.length];
      const rootFrequency = degreeFrequency(preset.rootMidi - 12, preset.scale, bassDegree);
      scheduleTone(rootFrequency, time, beat * 4.1, 0.062, "sine", 0);
      scheduleTone(rootFrequency * 1.5, time + beat * 0.06, beat * 3.5, 0.022, "triangle", 0.14);
    }
  }

  function scheduleTone(frequency, time, duration, loudness, waveform, panValue) {
    const context = state.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(loudness, time + Math.min(0.18, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    if (panner) {
      panner.pan.value = panValue;
      envelope.connect(panner);
      panner.connect(state.bus);
    } else envelope.connect(state.bus);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
    state.activeNodes.add(oscillator);
    oscillator.addEventListener("ended", () => state.activeNodes.delete(oscillator), { once: true });
  }

  function snapshot() {
    return Object.freeze({
      supported: Boolean(AudioContextClass),
      playing: state.playing,
      starting: state.starting,
      volume: state.volume,
      trackId: state.trackId,
      trackTitle: currentTrack().title,
      trackComposer: currentTrack().composer,
      trackSourceKind: currentTrack().sourceKind,
      trackDisclosure: currentTrack().disclosure,
      ducked: state.duckReasons.size > 0
    });
  }

  function dispatchState(label) {
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("dailyatlasmusicstate", {
      detail: { ...snapshot(), label }
    }));
  }

  function updateUi(isPlaying, label) {
    if (elements.toggle) {
      elements.toggle.setAttribute("aria-pressed", String(isPlaying));
      elements.toggle.setAttribute("aria-label", isPlaying ? "暂停背景轻音乐" : "播放背景轻音乐");
    }
    if (elements.status) elements.status.textContent = label;
    dispatchState(label);
  }

  const api = Object.freeze({
    tracks: TRACKS,
    TRACKS,
    initialize,
    play,
    pause,
    setVolume,
    selectTrack: setTrack,
    setTrack,
    next: () => nextTrack(1),
    previous: () => nextTrack(-1),
    nextTrack,
    duck,
    restore: unduck,
    unduck,
    getState: snapshot,
    degreeFrequency
  });

  if (root.DAILY_ATLAS_DEFER_PLATFORM_INIT !== true) initialize();
  return api;
});
