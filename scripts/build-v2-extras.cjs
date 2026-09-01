const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.basename(__dirname).toLowerCase() === "scripts"
  ? ROOT
  : path.join(ROOT, "outputs", "daily-duet");
const RAW = path.join(APP_ROOT, "data", "raw");
const MEDICAL_VISUAL_MANIFEST_PATH = path.join(APP_ROOT, "assets", "medical", "manifest.json");
const CHECK_ONLY = process.argv.includes("--check");
const {
  CITY_EXTENSION_ROWS,
  GERMAN_EXTENSION_ROWS,
  MEDICAL_EXTENSION_ROWS,
  MEDICAL_SOURCES,
  MEDICAL_SOURCE_OVERRIDES,
  MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES,
  MEDICAL_RISK_OVERRIDES,
  MEDICAL_SERVICE_URGENT_SLUGS,
  MEDICAL_CONTENT_OVERRIDES
} = require("./v3-extras-data.cjs");
const MEDICAL_SERVICE_URGENT_SET = new Set(MEDICAL_SERVICE_URGENT_SLUGS);

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(RAW, name), "utf8"));
}

function writeJson(name, value) {
  const target = path.join(RAW, name);
  const expected = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (CHECK_ONLY) {
    assert(fs.existsSync(target), `${name} is missing; run npm run build:extras`);
    assert(fs.readFileSync(target).equals(expected), `${name} is stale; run npm run build:extras`);
    return;
  }
  fs.writeFileSync(target, expected);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadMedicalVisuals() {
  const manifest = JSON.parse(fs.readFileSync(MEDICAL_VISUAL_MANIFEST_PATH, "utf8"));
  assert(manifest.schemaVersion === 1, "medical illustration manifest must use schemaVersion 1");
  assert(Array.isArray(manifest.items) && manifest.items.length === 24, "medical illustration manifest must contain exactly 24 items");
  const visuals = new Map();
  const files = new Set();
  for (const item of manifest.items) {
    assert(/^[a-z0-9-]+$/.test(item.key || ""), "medical illustration key is invalid");
    assert(!visuals.has(item.key), `duplicate medical illustration key: ${item.key}`);
    assert(/^assets\/medical\/[a-z0-9-]+\.webp$/.test(item.file || ""), `${item.key}: invalid medical illustration file`);
    assert(!files.has(item.file), `duplicate medical illustration file: ${item.file}`);
    assert(typeof item.topicGroup === "string" && item.topicGroup.length > 0, `${item.key}: topicGroup is missing`);
    assert(typeof item.imageTheme === "string" && item.imageTheme.length > 0, `${item.key}: imageTheme is missing`);
    assert(typeof item.alt === "string" && item.alt.length >= 16, `${item.key}: alt is missing or too short`);
    assert(fs.existsSync(path.join(APP_ROOT, item.file)), `${item.key}: illustration file is missing`);
    visuals.set(item.key, item);
    files.add(item.file);
  }
  return visuals;
}

const MEDICAL_VISUALS = loadMedicalVisuals();

const legacyCities = readJson("cities50.json");
const legacyGerman = readJson("german50.json");
const legacyMedical = readJson("medical50.json");

assert(legacyCities.length === 50, "cities50.json must contain exactly 50 items");
assert(legacyGerman.length === 50, "german50.json must contain exactly 50 items");
assert(legacyMedical.length === 50, "medical50.json must contain exactly 50 items");

// Coordinates are approximate city-centre coordinates. Time zones are IANA identifiers.
const LEGACY_CITY_GEO = Object.freeze({
  "city-paris": [48.8566, 2.3522, "Europe/Paris"],
  "city-rome": [41.9028, 12.4964, "Europe/Rome"],
  "city-florence": [43.7696, 11.2558, "Europe/Rome"],
  "city-venice": [45.4408, 12.3155, "Europe/Rome"],
  "city-prague": [50.0755, 14.4378, "Europe/Prague"],
  "city-vienna": [48.2082, 16.3738, "Europe/Vienna"],
  "city-berlin": [52.52, 13.405, "Europe/Berlin"],
  "city-lisbon": [38.7223, -9.1393, "Europe/Lisbon"],
  "city-barcelona": [41.3874, 2.1686, "Europe/Madrid"],
  "city-edinburgh": [55.9533, -3.1883, "Europe/London"],
  "city-istanbul": [41.0082, 28.9784, "Europe/Istanbul"],
  "city-athens": [37.9838, 23.7275, "Europe/Athens"],
  "city-kyoto": [35.0116, 135.7681, "Asia/Tokyo"],
  "city-tokyo": [35.6762, 139.6503, "Asia/Tokyo"],
  "city-seoul": [37.5665, 126.978, "Asia/Seoul"],
  "city-beijing": [39.9042, 116.4074, "Asia/Shanghai"],
  "city-xian": [34.3416, 108.9398, "Asia/Shanghai"],
  "city-shanghai": [31.2304, 121.4737, "Asia/Shanghai"],
  "city-singapore": [1.3521, 103.8198, "Asia/Singapore"],
  "city-bangkok": [13.7563, 100.5018, "Asia/Bangkok"],
  "city-hanoi": [21.0278, 105.8342, "Asia/Ho_Chi_Minh"],
  "city-luang-prabang": [19.8834, 102.1347, "Asia/Vientiane"],
  "city-jaipur": [26.9124, 75.7873, "Asia/Kolkata"],
  "city-samarkand": [39.6542, 66.9597, "Asia/Samarkand"],
  "city-marrakech": [31.6295, -7.9811, "Africa/Casablanca"],
  "city-fez": [34.0181, -5.0078, "Africa/Casablanca"],
  "city-cairo": [30.0444, 31.2357, "Africa/Cairo"],
  "city-cape-town": [-33.9249, 18.4241, "Africa/Johannesburg"],
  "city-zanzibar-city": [-6.1659, 39.2026, "Africa/Dar_es_Salaam"],
  "city-lalibela": [12.0317, 39.0476, "Africa/Addis_Ababa"],
  "city-tunis": [36.8065, 10.1815, "Africa/Tunis"],
  "city-dakar": [14.7167, -17.4677, "Africa/Dakar"],
  "city-new-york": [40.7128, -74.006, "America/New_York"],
  "city-mexico-city": [19.4326, -99.1332, "America/Mexico_City"],
  "city-quebec-city": [46.8139, -71.208, "America/Toronto"],
  "city-new-orleans": [29.9511, -90.0715, "America/Chicago"],
  "city-havana": [23.1136, -82.3666, "America/Havana"],
  "city-vancouver": [49.2827, -123.1207, "America/Vancouver"],
  "city-oaxaca": [17.0732, -96.7266, "America/Mexico_City"],
  "city-buenos-aires": [-34.6037, -58.3816, "America/Argentina/Buenos_Aires"],
  "city-rio-de-janeiro": [-22.9068, -43.1729, "America/Sao_Paulo"],
  "city-cusco": [-13.5319, -71.9675, "America/Lima"],
  "city-cartagena": [10.391, -75.4794, "America/Bogota"],
  "city-quito": [-0.1807, -78.4678, "America/Guayaquil"],
  "city-valparaiso": [-33.0472, -71.6127, "America/Santiago"],
  "city-sydney": [-33.8688, 151.2093, "Australia/Sydney"],
  "city-melbourne": [-37.8136, 144.9631, "Australia/Melbourne"],
  "city-wellington": [-41.2866, 174.7756, "Pacific/Auckland"],
  "city-hobart": [-42.8821, 147.3272, "Australia/Hobart"],
  "city-auckland": [-36.8509, 174.7645, "Pacific/Auckland"]
});

function city(slug, cityZh, cityEn, countryZh, countryEn, countryCode, region, latitude, longitude, timezone, summary, highlights, bestFor, seasonNote, culturalTip, sourceUrl, palette, motif, themeTags) {
  return {
    id: `city-${slug}`,
    type: "city",
    cityZh,
    cityEn,
    countryZh,
    countryEn,
    countryCode,
    region,
    latitude,
    longitude,
    timezone,
    summary,
    highlights,
    bestFor,
    seasonNote,
    culturalTip,
    sourceUrl,
    themeTags,
    visual: { type: "procedural-svg", palette, motif }
  };
}

const newCities = [
  city("tallinn", "塔林", "Tallinn", "爱沙尼亚", "Estonia", "EE", "欧洲", 59.437, 24.7536, "Europe/Tallinn", "塔林以保存完整的中世纪城墙和尖塔闻名，但创意园区、木屋街区与数字社会也让它不止是一座古城。步行尺度紧凑，海湾、旧城和当代生活可以在一天中自然衔接。", ["中世纪旧城", "波罗的海海湾", "创意园区与木屋街区"], "中世纪城市、设计与安静步行", "五月至九月日照较长；冬季寒冷且白昼短，但旧城氛围浓。", "旧城仍是居民日常空间；狭窄街巷停留拍照时给行人留出通道。", "https://visittallinn.ee/eng", ["#385d67", "#c98e59"], "城塔与海湾", ["历史层积", "海港", "数字社会"]),
  city("ljubljana", "卢布尔雅那", "Ljubljana", "斯洛文尼亚", "Slovenia", "SI", "欧洲", 46.0569, 14.5058, "Europe/Ljubljana", "卢布尔雅那沿卢布尔雅尼察河展开，桥梁、市场、巴洛克街区与二十世纪建筑共同形成温和的人行城市。它体量不大，却适合作为理解斯洛文尼亚文化与周边山地的起点。", ["河岸与桥梁", "中央市场", "人行旧城与现代建筑"], "慢旅行、建筑与咖啡馆生活", "四至六月和九月宜步行；夏季活动多，午后也可能有阵雨。", "市中心自行车很多，过道和车道不要停留；市场购物尊重摊主节奏。", "https://www.visitljubljana.com/en/", ["#39756d", "#d2a15f"], "河桥与龙", ["河流", "宜居城市", "建筑"]),
  city("sarajevo", "萨拉热窝", "Sarajevo", "波斯尼亚和黑塞哥维那", "Bosnia and Herzegovina", "BA", "欧洲", 43.8563, 18.4131, "Europe/Sarajevo", "萨拉热窝坐落在群山之间，奥斯曼老城、奥匈建筑、宗教场所与二十世纪战争记忆距离很近。咖啡、工艺和社区生活使这里既适合历史反思，也能看见城市恢复力。", ["巴什察尔希亚老城", "多宗教建筑", "近现代历史记忆"], "欧洲边缘史、社区文化与山城步行", "五月至十月较适合户外；冬季寒冷，盆地空气状况需关注。", "战争遗址和墓园不是布景；涉及居民经历时先倾听并避免替他人下结论。", "https://www.visitsarajevo.ba/", ["#5b6656", "#b7784e"], "铜器与山谷", ["记忆", "多元文化", "恢复力"]),
  city("busan", "釜山", "Busan", "韩国", "South Korea", "KR", "亚洲", 35.1796, 129.0756, "Asia/Seoul", "釜山由山地、港口和海滩共同塑造，海鲜市场、山坡社区、寺院与电影文化呈现出不同于首尔的开放气质。地铁与步道相结合，能从港湾尺度读懂这座城市。", ["港湾与海滩", "山坡社区", "海鲜市场与电影文化"], "海岸城市、徒步与饮食", "四至六月和九至十月舒适；夏季潮湿并可能受台风影响。", "市场拍摄摊主前先征得同意；山坡住宅区注意音量和居民通行。", "https://www.visitbusan.net/en/index.do", ["#287487", "#d78e51"], "港桥与山坡", ["海洋", "电影", "社区"]),
  city("george-town", "乔治市", "George Town", "马来西亚", "Malaysia", "MY", "亚洲", 5.4141, 100.3288, "Asia/Kuala_Lumpur", "乔治市以海峡贸易留下的店屋、宗教建筑、宗族空间和多语言饮食著称。街头艺术很醒目，但真正的层次来自马来、华人、印度及其他社群长期共处的城市纹理。", ["历史店屋", "多元宗教街区", "娘惹与街头饮食"], "港口史、建筑与多文化饮食", "十二月至三月通常较干；全年炎热，午后安排室内参观更从容。", "宗教场所遵守着装和拍摄规则；店屋不少仍有人居住和经营。", "https://whc.unesco.org/en/list/1223/", ["#32736f", "#d98554"], "店屋与香料", ["迁徙", "贸易", "多元文化"]),
  city("ulaanbaatar", "乌兰巴托", "Ulaanbaatar", "蒙古国", "Mongolia", "MN", "亚洲", 47.8864, 106.9057, "Asia/Ulaanbaatar", "乌兰巴托聚集了蒙古国的大部分城市文化，寺院、博物馆、剧场与快速扩张的街区并置。它既是理解草原传统如何进入现代生活的窗口，也是前往更广阔地区的交通起点。", ["甘丹寺", "蒙古历史博物馆", "草原文化与当代城市"], "游牧文明、博物馆与区域旅行起点", "六月至九月相对温和；冬季极寒，春季风沙较多。", "进入寺院遵守现场规则；城外访问牧户应通过负责任渠道并尊重私人空间。", "https://www.mongolia.travel/", ["#53695f", "#c6904d"], "草原与寺顶", ["游牧传统", "现代化", "草原"]),
  city("accra", "阿克拉", "Accra", "加纳", "Ghana", "GH", "非洲", 5.6037, -0.187, "Africa/Accra", "阿克拉面向几内亚湾，独立历史、活跃音乐、当代艺术、市场与海岸社区构成鲜明节奏。它没有单一古城核心，更适合通过不同街区理解加纳的政治记忆和创造力。", ["独立广场与历史", "当代艺术与音乐", "市场和海岸社区"], "西非当代文化、音乐与社会历史", "十一月至三月较干燥；全年湿热，强日照下需放慢节奏。", "人物和市场拍摄先询问；纪念地与社区参访避免只追求猎奇画面。", "https://visitghana.com/attractions/accra/", ["#3f745d", "#d8a144"], "海岸与织纹", ["独立", "音乐", "当代非洲"]),
  city("kigali", "基加利", "Kigali", "卢旺达", "Rwanda", "RW", "非洲", -1.9441, 30.0619, "Africa/Kigali", "基加利分布在连绵丘陵上，以整洁公共空间、设计产业和迅速变化的城市面貌受到关注。大屠杀纪念馆则要求旅行者正视历史创伤，使城市经验兼具克制反思与面向未来的活力。", ["丘陵城市景观", "基加利大屠杀纪念馆", "设计与咖啡文化"], "历史反思、城市治理与东非文化", "六月至九月通常较干；雨季道路和户外安排要留弹性。", "纪念场所保持安静并遵守影像规则；不要向幸存者索取私人创伤叙述。", "https://en.wikivoyage.org/wiki/Kigali", ["#47745c", "#c98655"], "丘陵与编织", ["记忆", "城市治理", "恢复力"]),
  city("windhoek", "温得和克", "Windhoek", "纳米比亚", "Namibia", "NA", "非洲", -22.5609, 17.0658, "Africa/Windhoek", "温得和克位于纳米比亚高原，是理解德国殖民遗产、独立历史和多语言社会的入口。城市尺度不大，却能通过博物馆、市场和当代公共空间为荒漠旅行提供必要背景。", ["独立历史", "多语言市场", "高原与荒漠门户"], "南部非洲历史与自然旅行衔接", "五月至九月干爽且昼夜温差大；夏季可能有雷雨。", "讨论殖民历史时使用当地机构的表述；前往偏远地区前准备水和通信方案。", "https://visitnamibia.com.na/", ["#756247", "#d39555"], "高原与羚羊角", ["殖民记忆", "荒漠", "多语言"]),
  city("maputo", "马普托", "Maputo", "莫桑比克", "Mozambique", "MZ", "非洲", -25.9692, 32.5732, "Africa/Maputo", "马普托临印度洋而建，葡语建筑、非洲现代主义、市场、海鲜和音乐共同构成松弛而复杂的城市气质。火车站和公共建筑值得看，社区日常也提醒人们不要只从殖民视角阅读城市。", ["非洲现代主义建筑", "印度洋海岸", "市场与音乐"], "建筑、葡语非洲文化与海滨生活", "五月至十月较干爽；夏季湿热并可能有强降雨。", "公共建筑和人物拍摄先询问；夜间与跨区交通听取当地可靠建议。", "https://www.visitmozambique.gov.mz/", ["#386f76", "#d98d5c"], "拱廊与印度洋", ["现代主义", "音乐", "印度洋"]),
  city("montreal", "蒙特利尔", "Montréal", "加拿大", "Canada", "CA", "北美洲", 45.5019, -73.5674, "America/Toronto", "蒙特利尔把法语城市传统、移民社区、工业遗产与实验艺术结合起来。旧港只是起点，街区市场、骑行网络、音乐节和冬季公共生活更能体现它的创造力。", ["法语街区与旧港", "市场和移民饮食", "音乐、设计与骑行"], "语言文化、艺术节与街区漫游", "五月至十月适合骑行；冬季严寒但地下与室内文化活跃。", "尊重本地法语使用习惯；自行车道和冬季清雪通道不要停留。", "https://www.mtl.org/en", ["#3f6278", "#c75d5b"], "穹顶与枫叶", ["语言", "移民", "创意城市"]),
  city("merida", "梅里达", "Mérida", "墨西哥", "Mexico", "MX", "北美洲", 20.9674, -89.5926, "America/Merida", "梅里达位于尤卡坦半岛，殖民时期街区、玛雅文化、市场饮食和庭院住宅构成鲜明层次。它适合作为了解半岛历史与天然井、考古遗址之间联系的城市基地。", ["玛雅文化", "殖民街区", "尤卡坦市场与饮食"], "考古、地方饮食与慢节奏街区", "十一月至二月较凉爽；春末和夏季炎热，午间宜减少暴晒。", "玛雅文化不是过去式；购买工艺和参加社区活动时尊重当代创作者。", "https://yucatan.travel/en/merida/", ["#3c7874", "#d59855"], "拱门与木棉", ["玛雅文化", "手工艺", "半岛"]),
  city("chicago", "芝加哥", "Chicago", "美国", "United States", "US", "北美洲", 41.8781, -87.6298, "America/Chicago", "芝加哥在密歇根湖畔形成大胆天际线，现代建筑史、蓝调与爵士、移民街区和公共艺术彼此交织。沿河步行与乘高架列车观察城市，是理解其工业与规划遗产的好方法。", ["现代建筑与河道", "蓝调和爵士", "湖滨与移民街区"], "建筑、音乐与美国城市史", "五月至十月适合湖滨活动；冬季风寒明显，天气变化要留余量。", "不同街区并非主题公园；参加社区文化活动时支持本地经营并尊重居民。", "https://www.choosechicago.com/", ["#375b73", "#c98b4f"], "高架列车与湖岸", ["建筑", "音乐", "工业城市"]),
  city("montevideo", "蒙得维的亚", "Montevideo", "乌拉圭", "Uruguay", "UY", "南美洲", -34.9011, -56.1645, "America/Montevideo", "蒙得维的亚沿拉普拉塔河口展开，海滨大道、旧城、市场和坎东贝音乐构成从容节奏。它的魅力不靠密集地标，而在公共海岸、社区生活与南锥体历史。", ["海滨大道", "旧城与市场", "坎东贝音乐"], "慢旅行、海岸生活与音乐文化", "十月至四月适合户外；海风强，天气转凉时需备外套。", "坎东贝来自具体社区传统；观看或拍摄排练时先征得参与者同意。", "https://www.descubrimontevideo.uy/en/", ["#3d7180", "#d49a55"], "海滨与鼓", ["公共空间", "音乐", "南锥体"]),
  city("la-paz", "拉巴斯", "La Paz", "玻利维亚", "Bolivia", "BO", "南美洲", -16.4897, -68.1193, "America/La_Paz", "拉巴斯深嵌安第斯峡谷，缆车网络把不同海拔和社区连接起来，艾马拉文化、市场与高山景观同时可见。城市体验的第一原则是适应海拔，而不是急于打卡。", ["城市缆车", "艾马拉文化与市场", "安第斯山谷景观"], "高原城市、社会观察与区域文化", "五月至十月较干但早晚寒冷；初到高海拔应减慢活动。", "未经同意不要拍摄市场人物和仪式；高原不适严重时应停止行程并求助。", "https://www.lapaz.bo/", ["#596678", "#c6814f"], "缆车与雪峰", ["高原", "原住民文化", "城市交通"]),
  city("salvador", "萨尔瓦多", "Salvador", "巴西", "Brazil", "BR", "南美洲", -12.9777, -38.5016, "America/Bahia", "萨尔瓦多曾是殖民时期重要港口，彩色老城、非裔巴西宗教、音乐、舞蹈与海湾生活形成强烈文化密度。理解奴隶制历史和当代黑人文化，是观看建筑之外不可缺少的一层。", ["佩洛里尼奥老城", "非裔巴西音乐与宗教", "海湾与地方饮食"], "大西洋史、音乐与非裔文化", "九月至三月适合海岸活动；全年温暖，强降雨时街巷可能湿滑。", "宗教仪式不是随意拍摄的演出；历史街区活动时听从本地安全建议。", "https://www.salvadordabahia.com/en/", ["#2d7480", "#e08a4f"], "彩色立面与鼓", ["非洲离散", "音乐", "殖民历史"]),
  city("perth", "珀斯", "Perth", "澳大利亚", "Australia", "AU", "大洋洲", -31.9523, 115.8613, "Australia/Perth", "珀斯位于澳大利亚西海岸，天鹅河、印度洋海滩、城市公园与原住民文化共同定义它。与东海岸城市相比，它更能让旅行者体会距离、光线和西部生态。", ["天鹅河与国王公园", "印度洋海滩", "努加尔文化"], "城市自然、海岸与西澳旅行起点", "九月至十一月野花季宜户外；夏季炎热干燥并有高紫外线。", "了解并尊重努加尔传统地名与文化说明；海滩遵守救生旗和防晒提示。", "https://visitperth.com/", ["#2f7186", "#d7a44f"], "河湾与野花", ["海洋", "原住民文化", "生态"]),
  city("adelaide", "阿德莱德", "Adelaide", "澳大利亚", "Australia", "AU", "大洋洲", -34.9285, 138.6007, "Australia/Adelaide", "阿德莱德以环绕市中心的公园带、中央市场、节庆和邻近葡萄酒产区闻名。规则清晰的城市格网与原住民文化、移民饮食结合，适合慢下来观察南澳生活。", ["城市公园带", "中央市场", "节庆与葡萄酒地区"], "饮食、节庆与轻松城市生活", "三至五月和九至十一月温和；盛夏可能出现极端高温。", "节庆期间提前规划交通；介绍原住民文化时使用当地机构提供的名称和资料。", "https://southaustralia.com/destinations/adelaide", ["#4c7562", "#ca8e52"], "公园环与葡萄藤", ["节庆", "饮食", "公园城市"]),
  city("christchurch", "基督城", "Christchurch", "新西兰", "New Zealand", "NZ", "大洋洲", -43.5321, 172.6362, "Pacific/Auckland", "基督城在地震重建中重新思考公共空间、建筑和社区韧性，雅芳河、花园、街头艺术与南岛自然门户角色并存。旅行者可以从新旧建筑的并置理解城市如何恢复。", ["地震重建建筑", "雅芳河与花园", "南岛自然门户"], "城市重建、设计与轻户外", "十二月至三月温暖；春秋天气变化快，山区行程需单独准备。", "地震纪念地保持克制；使用毛利地名和文化资料时尊重当地说明。", "https://www.christchurchnz.com/", ["#44756f", "#c69b58"], "河舟与重建网格", ["重建", "社区韧性", "自然"]),
  city("suva", "苏瓦", "Suva", "斐济", "Fiji", "FJ", "大洋洲", -18.1248, 178.4501, "Pacific/Fiji", "苏瓦是南太平洋重要的行政与文化中心，殖民时期建筑、博物馆、市场、大学和多族群社区形成不同于度假岛屿的城市经验。这里适合把斐济放回太平洋历史与当代社会中理解。", ["斐济博物馆", "中央市场", "太平洋多元文化"], "太平洋历史、市场与城市文化", "五月至十月相对凉爽；全年降雨较多，热带天气需保持行程弹性。", "进入村落或宗教场所前了解着装与访问礼仪；人物拍摄先询问。", "https://www.fiji.travel/places-to-go/suva-and-surrounds", ["#287a7a", "#d69a4d"], "海湾与塔帕纹", ["太平洋", "多元文化", "海岛城市"])
];

const cities70 = legacyCities.map((item) => {
  const geo = LEGACY_CITY_GEO[item.id];
  assert(geo, `missing geo metadata for ${item.id}`);
  return {
    ...item,
    countryCode: item.countryCode || ({
      France: "FR", Italy: "IT", Czechia: "CZ", Austria: "AT", Germany: "DE", Portugal: "PT", Spain: "ES",
      "United Kingdom": "GB", Türkiye: "TR", Greece: "GR", Japan: "JP", "South Korea": "KR", China: "CN",
      Singapore: "SG", Thailand: "TH", Vietnam: "VN", Laos: "LA", India: "IN", Uzbekistan: "UZ", Morocco: "MA",
      Egypt: "EG", "South Africa": "ZA", Tanzania: "TZ", Ethiopia: "ET", Tunisia: "TN", Senegal: "SN",
      "United States": "US", Mexico: "MX", Canada: "CA", Cuba: "CU", Argentina: "AR", Brazil: "BR", Peru: "PE",
      Colombia: "CO", Ecuador: "EC", Chile: "CL", Australia: "AU", "New Zealand": "NZ"
    })[item.countryEn],
    latitude: geo[0],
    longitude: geo[1],
    timezone: geo[2],
    themeTags: item.themeTags || [item.region, item.visual?.motif || "城市文化"]
  };
}).concat(newCities);

const CITY_PALETTES = Object.freeze([
  ["#355f68", "#c48651"], ["#496b5d", "#d09a55"], ["#425d78", "#c97858"],
  ["#68614d", "#d1a05b"], ["#39736d", "#c87355"], ["#5b6176", "#c89154"]
]);
const CITY_SEASON_FRAMES = Object.freeze({
  "欧洲": [
    (row, highlights) => `在${row.cityZh}安排${highlights[0]}与步行街区时，应按旅行月份核对日照、降水和季节性开放时间。`,
    (row, highlights) => `${row.cityZh}的冬夏日照与户外节奏可能不同；若重点参观${highlights[1]}，出发前请查当地预报和开放安排。`,
    (row, highlights) => `把${highlights[2]}纳入${row.cityZh}行程前，按具体月份确认温度、降水和公共交通的季节变化。`,
    (row, highlights) => `${row.cityZh}适合步行，但舒适时段随季节而变；围绕${highlights[0]}安排时请以当地近期信息为准。`
  ],
  "亚洲": [
    (row, highlights) => `${row.cityZh}的气候不能用统一“亚洲季节”概括；前往${highlights[0]}前应核对当地雨季、温度和天气风险。`,
    (row, highlights) => `围绕${highlights[1]}安排${row.cityZh}行程时，先查具体月份的降水、高温或寒冷情况，再搭配室内外活动。`,
    (row, highlights) => `${row.cityZh}的季节体验受纬度、海拔或季风影响；计划${highlights[2]}时请使用当地近期预报。`,
    (row, highlights) => `到${row.cityZh}体验${highlights[0]}，应按当地季节准备衣物并为降水或高温留出行程弹性。`
  ],
  "非洲": [
    (row, highlights) => `${row.cityZh}的季节条件受纬度、海拔与海陆位置共同影响；参观${highlights[0]}前请核对当地降水和温度。`,
    (row, highlights) => `计划${row.cityZh}的${highlights[1]}时，不宜套用统一旱雨季印象；请按目的地和月份准备防晒、饮水与雨具。`,
    (row, highlights) => `${row.cityZh}的户外节奏会随降水、热度和昼夜温差变化；前往${highlights[2]}前以当地近期信息为准。`,
    (row, highlights) => `把${highlights[0]}纳入${row.cityZh}行程时，先查具体月份的气候与交通条件，再决定清晨、午后或室内安排。`
  ],
  "北美洲": [
    (row, highlights) => `${row.cityZh}不能套用同一套北美风雪或高温预期；前往${highlights[0]}前请按当地月份核对天气。`,
    (row, highlights) => `安排${row.cityZh}的${highlights[1]}时，需分别考虑当地冬季、炎热期或降水变化，并以近期预报为准。`,
    (row, highlights) => `${row.cityZh}的步行条件随季节和天气系统变化；体验${highlights[2]}前应核对温度、降水与空气质量。`,
    (row, highlights) => `到${row.cityZh}围绕${highlights[0]}活动，应按具体月份准备衣物，并给突发天气保留替代安排。`
  ],
  "南美洲": [
    (row, highlights) => `${row.cityZh}的季节感受取决于半球、海拔和海陆位置；前往${highlights[0]}前请核对当地月份与天气。`,
    (row, highlights) => `围绕${highlights[1]}安排${row.cityZh}行程时，应单独确认当地雨季、风力或高原条件，不套用洲际概括。`,
    (row, highlights) => `${row.cityZh}的户外节奏可能受海岸、山地或热带降水影响；体验${highlights[2]}前以近期预报为准。`,
    (row, highlights) => `在${row.cityZh}参观${highlights[0]}，请按具体月份准备防晒、雨具或保暖层，并保留室内备选。`
  ],
  "大洋洲": [
    (row, highlights) => `${row.cityZh}可能属于热带、温带或山地环境；前往${highlights[0]}前应按当地月份核对紫外线、降水和温度。`,
    (row, highlights) => `安排${row.cityZh}的${highlights[1]}时，请确认当地季节与天气风险，不只按“南半球”作统一判断。`,
    (row, highlights) => `${row.cityZh}的户外体验会受海风、热带降水或山区变化影响；体验${highlights[2]}前请查近期预报。`,
    (row, highlights) => `到${row.cityZh}围绕${highlights[0]}活动，应按具体月份准备防晒、雨具或保暖层，并留出天气备选。`
  ]
});

const CITY_CONTENT_OVERRIDES = Object.freeze({
  brussels: {
    culturalTip: "大广场是开放的城市空间；参观市政建筑或欧洲机构时，再分别核对相应场所的开放、安检与预约规则。"
  },
  copenhagen: {
    culturalTip: "设计博物馆按场馆规则参观；城市骑行道不要停留拍照，在港湾公共空间也应给游泳者、骑行者和通勤者留出通道。"
  },
  dubrovnik: {
    culturalTip: "旧城与城墙承受集中客流，宜错峰步行并遵守单向或限流安排；住宅巷道内放低音量，不把居民门前当作布景。"
  },
  taipei: {
    culturalTip: "大稻埕是持续经营的开放街区；拍摄店家、庙宇仪式或居民前先询问，并给骑楼通行留出空间。"
  },
  "victoria-falls": {
    seasonNote: "瀑布水量、喷雾强度与能见度会随赞比西河水文季节变化；观景和峡谷活动前请查公园及运营方的当期安全信息。",
    culturalTip: "在瀑布和峡谷范围遵守步道、护栏与野生动物距离要求；跨境或参加高风险活动前核对证件、保险和持证运营方。"
  },
  guanajuato: {
    seasonNote: "高原昼夜温差与雨季会影响陡坡山城步行；强日照或雨后石路湿滑时应放慢，并在出发前核对当地预报。"
  },
  boston: {
    seasonNote: "波士顿四季差异明显：冬季可能有雪冰，夏季可炎热潮湿，春秋天气也会快速变化；港湾步行前请查当地预报。"
  },
  lima: {
    seasonNote: "利马位于太平洋海岸沙漠，少雨不等于始终晴朗干爽；凉季常见低云与湿冷感，海崖活动前应核对雾和风。"
  },
  paramaribo: {
    seasonNote: "帕拉马里博全年偏湿热，降雨旺季会影响河岸、道路和户外安排；行程应预留避雨与积水交通弹性。"
  },
  alexandria: {
    seasonNote: "亚历山大受地中海影响，夏季偏热干，冬季较凉且更可能有风雨；海滨步行前请核对风浪与当地预报。"
  },
  abidjan: {
    seasonNote: "阿比让全年湿热，强降雨时段可能影响潟湖交通与城市道路；户外行程宜准备防雨并保留室内替代。"
  },
  mendoza: {
    seasonNote: "门多萨处于干旱山麓环境，日照、昼夜温差与安第斯山天气都需分别准备；山地行程应另查高海拔预报。",
    culturalTip: "林荫街道旁的灌溉水渠是仍在运作的城市水利系统；步行时留意开放渠口，不踩踏，也不要向渠内投入杂物。"
  },
  brisbane: {
    seasonNote: "布里斯班为亚热带河城，暖季可能炎热潮湿并伴强降雨或雷暴，凉季通常更温和；河岸活动前查当地预报。",
    culturalTip: "南岸是公共文化与休闲空间；使用步道、泳区和活动场地时遵守现场规则，并为通勤者留路。"
  },
  apia: {
    seasonNote: "阿皮亚属热带海洋环境，湿季的强降雨与热带气旋风险会影响航班和户外活动；出发前应查萨摩亚官方天气信息。"
  }
});

function expandedCity(row, index) {
  const highlights = row.highlights.split("；");
  const override = CITY_CONTENT_OVERRIDES[row.slug] || {};
  const summaryVariants = [
    `${row.cityZh}以${row.identity}。${highlights[0]}、${highlights[1]}与${highlights[2]}提供三条互补线索，适合从${row.bestFor}展开。`,
    `理解${row.cityZh}，可以从${row.identity}这条主线开始。由${highlights[0]}走向${highlights[1]}，再观察${highlights[2]}，会看到地标之外的日常结构。`,
    `${row.identity}，这是${row.cityZh}最鲜明的城市性格。旅行不妨围绕${highlights.join("、")}组织，从而把${row.bestFor}连成一条可感知的路径。`,
    `${row.cityZh}的吸引力来自${row.identity}。${highlights[0]}呈现历史背景，${highlights[1]}连接当代生活，${highlights[2]}则补足空间或文化尺度。`,
    `在${row.cityZh}，${row.identity}。与其只追逐单一地标，更值得把${highlights[0]}、${highlights[1]}和${highlights[2]}放在同一段城市观察中。`,
    `${row.cityZh}把${row.identity}。以${highlights[0]}为入口，再到${highlights[1]}和${highlights[2]}，能较完整地理解其为何适合${row.bestFor}。`
  ];
  const tipVariants = [
    `参访${highlights[0]}时遵守现场拍摄与通行规则；若路线经过生活街区，也应给居民和行人留出空间。`,
    `先核对${highlights[0]}的开放与礼仪要求；体验${highlights[2]}时优先支持当地经营者。`,
    `拍摄人物、宗教仪式或居民空间前先征得同意；在${highlights[1]}则遵守对应场地规则。`,
    `涉及${highlights[0]}的历史与社群叙事时，优先采用当地机构和当事人的表述。`,
    `使用公共交通或步行连接${highlights[0]}与${highlights[2]}，并给通勤者和居民保留通道。`,
    `在${highlights[2]}参加活动或消费时尊重当地节奏，不把宗教、创伤或社区生活当作猎奇素材。`
  ];
  return city(
    row.slug, row.cityZh, row.cityEn, row.countryZh, row.countryEn, override.countryCode || row.countryCode, row.region,
    Number(row.latitude), Number(row.longitude), row.timezone, summaryVariants[index % summaryVariants.length],
    highlights, row.bestFor,
    override.seasonNote || CITY_SEASON_FRAMES[row.region][index % CITY_SEASON_FRAMES[row.region].length](row, highlights),
    override.culturalTip || tipVariants[index % tipVariants.length],
    override.sourceUrl || `https://en.wikivoyage.org/wiki/${encodeURIComponent(override.sourcePage || row.sourcePage)}`,
    CITY_PALETTES[index % CITY_PALETTES.length], row.motif, row.themeTags.split("；")
  );
}

const cities200 = cities70.concat(CITY_EXTENSION_ROWS.map(expandedCity));

const GOETHE_SOURCE = "https://www.goethe.de/en/spr/ueb.html";
const IDS_SOURCE = "https://grammis.ids-mannheim.de/systematische-grammatik";

function de(slug, kind, german, chinese, explanation, exampleGerman, exampleChinese, level, themeTags, sourceUrl = kind === "语法" ? IDS_SOURCE : GOETHE_SOURCE) {
  // Grammar rows use a concise rule as their Chinese gloss; normalize that
  // compact authoring form into the same public schema as vocabulary rows.
  if (kind === "语法" && Array.isArray(level) && /^(A1|A2|B1|B2)$/.test(exampleChinese)) {
    themeTags = level;
    level = exampleChinese;
    exampleChinese = exampleGerman;
    exampleGerman = explanation;
    explanation = `下面的完整例句展示“${german}”在真实句子中的词序和词形。`;
  }
  return {
    id: `de-${slug}`,
    type: "german",
    kind,
    german,
    chinese,
    explanation,
    exampleGerman,
    exampleChinese,
    level,
    themeTags,
    sourceUrl
  };
}

const newGerman = [
  // A1: 15 vocabulary, 10 expressions, 7 grammar items.
  de("termin", "词汇", "der Termin", "约定的时间；预约", "Termin 指已经安排好的会面或时间点，常用于看医生、办事和工作约见。", "Ich habe morgen um zehn Uhr einen Termin.", "我明天十点有一个预约。", "A1", ["时间", "日常办事"]),
  de("wohnung", "词汇", "die Wohnung", "住宅；公寓", "Wohnung 是一套供人居住的房屋空间，注意阴性冠词 die。", "Unsere Wohnung hat zwei Zimmer und einen Balkon.", "我们的公寓有两个房间和一个阳台。", "A1", ["居住", "日常生活"]),
  de("fahrplan", "词汇", "der Fahrplan", "时刻表；运行计划", "Fahrplan 可指公交、火车等交通工具公布的班次时间。", "Der Fahrplan hängt neben dem Eingang.", "时刻表贴在入口旁边。", "A1", ["旅行", "交通"]),
  de("quittung", "词汇", "die Quittung", "收据；付款凭证", "Quittung 是确认已经付款的凭证，与尚待支付的 Rechnung 不同。", "Kann ich bitte eine Quittung bekommen?", "请问我可以拿一张收据吗？", "A1", ["购物", "日常办事"]),
  de("schluessel", "词汇", "der Schlüssel", "钥匙", "复数是 die Schlüssel，元音不再变化。", "Der Schlüssel liegt auf dem kleinen Tisch.", "钥匙放在小桌子上。", "A1", ["居住", "物品"]),
  de("wetter", "词汇", "das Wetter", "天气", "Wetter 通常使用单数，用形容词描述当天或一段时间的天气状况。", "Heute ist das Wetter sonnig, aber kühl.", "今天天气晴朗，但有点凉。", "A1", ["自然", "日常交流"]),
  de("nachbar", "词汇", "der Nachbar / die Nachbarin", "男邻居／女邻居", "德语职业和人物称谓常有阳性与阴性形式。", "Meine Nachbarin gießt im Urlaub die Blumen.", "我休假时，女邻居帮我给花浇水。", "A1", ["社区", "人物"]),
  de("pause", "词汇", "die Pause", "休息时间；间歇", "Pause 可用于工作、课程或演出中间的休息。", "Nach der ersten Stunde machen wir eine kurze Pause.", "第一节课后我们短暂休息一下。", "A1", ["学习", "工作"]),
  de("fruehstueck", "词汇", "das Frühstück", "早餐", "Frühstück 既可指早餐这顿饭，也可用于 frühstücken 表示吃早餐。", "Zum Frühstück esse ich Brot und Obst.", "早餐我吃面包和水果。", "A1", ["饮食", "日常生活"]),
  de("einkauf", "词汇", "der Einkauf", "采购；买来的东西", "Einkauf 强调购物这件事或采购结果，动词是 einkaufen。", "Den Einkauf trage ich in einer Stofftasche nach Hause.", "我用布袋把买的东西带回家。", "A1", ["购物", "环保"]),
  de("haltestelle", "词汇", "die Haltestelle", "公交车站；停靠站", "Haltestelle 是公共汽车、有轨电车等停靠的站点。", "Die nächste Haltestelle ist nur fünf Minuten entfernt.", "下一站只离这里五分钟。", "A1", ["交通", "城市"]),
  de("eingang", "词汇", "der Eingang", "入口", "对应词 Ausgang 表示出口，公共场所常同时标出。", "Der Eingang zum Museum ist auf der anderen Seite.", "博物馆入口在另一边。", "A1", ["城市", "方位"]),
  de("geschenk", "词汇", "das Geschenk", "礼物", "动词 schenken 表示赠送，常搭配第三格接受者和第四格礼物。", "Wir bringen unserer Freundin ein kleines Geschenk mit.", "我们给朋友带一份小礼物。", "A1", ["关系", "节日"]),
  de("geburtstag", "词汇", "der Geburtstag", "生日", "表达某人生日使用 Geburtstag haben，祝福可说 Alles Gute zum Geburtstag。", "Mein Bruder hat heute Geburtstag.", "我哥哥今天过生日。", "A1", ["时间", "家庭"]),
  de("rechnung-basic", "词汇", "die Rechnung", "账单；发票", "在餐馆请求结账常说 die Rechnung, bitte；它表示应付金额，而非付款收据。", "Die Rechnung kommt zusammen auf dreißig Euro.", "账单合计三十欧元。", "A1", ["饮食", "购物"]),
  de("wo-ist-toilette", "表达", "Wo ist die Toilette?", "洗手间在哪里？", "这是询问公共场所设施位置的直接、礼貌表达。", "Entschuldigung, wo ist hier die Toilette?", "打扰一下，这里的洗手间在哪里？", "A1", ["旅行", "方位"]),
  de("wie-spaet", "表达", "Wie spät ist es?", "现在几点？", "询问钟点用 wie spät，回答常以 Es ist 开头。", "Wie spät ist es jetzt in Berlin?", "柏林现在几点？", "A1", ["时间", "旅行"]),
  de("ich-brauche", "表达", "Ich brauche …", "我需要……", "brauchen 后通常直接接第四格宾语。", "Ich brauche eine Fahrkarte nach Köln.", "我需要一张去科隆的车票。", "A1", ["交通", "需求"]),
  de("darf-ich", "表达", "Darf ich …?", "我可以……吗？", "用情态动词 dürfen 询问许可，比直接行动更礼貌。", "Darf ich dieses Fenster öffnen?", "我可以打开这扇窗户吗？", "A1", ["礼貌", "日常交流"]),
  de("koennen-wir", "表达", "Können wir …?", "我们能……吗？", "可用于协商共同安排，也可以礼貌提出请求。", "Können wir uns morgen im Café treffen?", "我们明天可以在咖啡馆见面吗？", "A1", ["计划", "关系"]),
  de("einen-moment", "表达", "Einen Moment, bitte.", "请稍等一下。", "这是一句简洁的请求，用于需要一点时间处理事情。", "Einen Moment, bitte, ich suche die Adresse.", "请稍等，我找一下地址。", "A1", ["礼貌", "日常办事"]),
  de("weiss-nicht", "表达", "Ich weiß es nicht.", "我不知道。", "weiß 是 wissen 的第一人称单数形式，es 代指正在讨论的事情。", "Ich weiß es nicht, aber ich kann nachfragen.", "我不知道，但我可以问一下。", "A1", ["沟通", "学习"]),
  de("bitte-langsam", "表达", "Bitte sprechen Sie langsam.", "请您说慢一点。", "向陌生人或工作人员请求放慢语速时使用 Sie 形式。", "Bitte sprechen Sie langsam, denn ich lerne noch Deutsch.", "请您说慢一点，因为我还在学德语。", "A1", ["语言学习", "礼貌"]),
  de("was-kostet", "表达", "Was kostet das?", "这个多少钱？", "询问单件商品价格时可用 kosten 的第三人称单数 kostet。", "Was kostet das Buch mit dem blauen Umschlag?", "那本蓝色封面的书多少钱？", "A1", ["购物", "数字"]),
  de("gleich-da", "表达", "Ich bin gleich da.", "我马上到。", "gleich 在这里表示很快、马上，并不承诺精确分钟数。", "Warte bitte kurz, ich bin gleich da.", "请稍等一下，我马上到。", "A1", ["时间", "约会"]),
  de("grammar-plural", "语法", "名词复数形式", "德语名词有多种复数词尾，最好把复数与单数一起记。", "Die Stadt hat einen Park, aber viele Museen.", "这座城市有一个公园，但有许多博物馆。", "A1", ["语法基础", "数量"]),
  de("grammar-acc-pronouns", "语法", "第四格人称代词", "人称代词作直接宾语时会变化，例如 ich 变成 mich、du 变成 dich。", "Kannst du mich am Bahnhof abholen?", "你能到车站接我吗？", "A1", ["语法基础", "人物"]),
  de("grammar-possessive", "语法", "物主冠词 mein / dein", "物主冠词像不定冠词一样随名词性、数和格变化。", "Meine Schwester sucht ihren Schlüssel.", "我妹妹在找她的钥匙。", "A1", ["语法基础", "家庭"]),
  de("grammar-imperative-sie", "语法", "Sie 命令式", "正式命令或请求使用动词原形加 Sie，语气可用 bitte 缓和。", "Nehmen Sie bitte im Wartezimmer Platz.", "请您在候诊室就座。", "A1", ["礼貌", "日常办事"]),
  de("grammar-es-gibt", "语法", "es gibt + 第四格", "es gibt 表示某处存在某物，后面的名词使用第四格。", "In unserer Straße gibt es einen kleinen Markt.", "我们这条街上有一个小市场。", "A1", ["城市", "语法基础"]),
  de("grammar-gern", "语法", "gern 表示乐意或喜欢", "gern 修饰动作，表达喜欢做某事；比较级 lieber 表示更喜欢。", "Am Wochenende koche ich gern mit Freunden.", "周末我喜欢和朋友一起做饭。", "A1", ["偏好", "日常生活"]),
  de("grammar-inversion", "语法", "时间成分置于句首后的倒装", "时间或地点放在第一位时，变位动词仍在第二位，主语移到动词后。", "Nach der Arbeit gehe ich zu Fuß nach Hause.", "下班后我步行回家。", "A1", ["词序", "时间"]),

  // A2: 14 vocabulary, 12 expressions, 7 grammar items.
  de("gewohnheit", "词汇", "die Gewohnheit", "习惯", "Gewohnheit 指重复形成的行为或思维方式，可好可坏。", "Ein kurzer Spaziergang nach dem Essen ist meine neue Gewohnheit.", "饭后短暂散步是我的新习惯。", "A2", ["习惯", "健康"]),
  de("verspaetung", "词汇", "die Verspätung", "晚点；迟到", "交通工具或人的延迟都可用 Verspätung 表达。", "Wegen des starken Regens hat der Zug Verspätung.", "因为大雨，火车晚点了。", "A2", ["交通", "时间"]),
  de("erfahrung", "词汇", "die Erfahrung", "经验；经历", "可数时指一次经历，不可数或复数时常指积累的经验。", "Bei diesem Projekt habe ich viel Erfahrung gesammelt.", "我在这个项目中积累了很多经验。", "A2", ["工作", "成长"]),
  de("umweg", "词汇", "der Umweg", "绕路", "einen Umweg machen 表示没有走最直接的路线。", "Die Brücke ist gesperrt, deshalb machen wir einen Umweg.", "桥封了，所以我们得绕路。", "A2", ["交通", "变化"]),
  de("aussicht", "词汇", "die Aussicht", "景色；前景", "Aussicht 既可指从某处看到的景观，也可指事情的可能前景。", "Vom Turm hat man eine weite Aussicht über die Stadt.", "从塔上可以远眺整座城市。", "A2", ["旅行", "城市"]),
  de("nachricht", "词汇", "die Nachricht", "消息；短讯", "Nachricht 可指私人消息，也可指新闻节目中的一则信息。", "Ich schicke dir eine Nachricht, sobald ich angekommen bin.", "我一到就给你发消息。", "A2", ["沟通", "旅行"]),
  de("vorschlag", "词汇", "der Vorschlag", "建议；提议", "einen Vorschlag machen 表示提出一个可供讨论的办法。", "Dein Vorschlag spart uns viel Zeit.", "你的建议为我们节省了很多时间。", "A2", ["协作", "决策"]),
  de("unterkunft", "词汇", "die Unterkunft", "住宿地点", "Unterkunft 是旅馆、公寓、宿舍等临时或长期住处的总称。", "Unsere Unterkunft liegt direkt an einer U-Bahn-Station.", "我们的住处就在一个地铁站旁。", "A2", ["旅行", "居住"]),
  de("abfahrt", "词汇", "die Abfahrt", "出发；发车", "时刻表中的 Abfahrt 与到达 Ankunft 相对。", "Die Abfahrt des Busses verschiebt sich um zehn Minuten.", "公交车的发车时间推迟十分钟。", "A2", ["交通", "时间"]),
  de("rueckfahrt", "词汇", "die Rückfahrt", "返程", "Rückfahrt 指从目的地返回的旅程，常与 Hinfahrt 对照。", "Für die Rückfahrt reservieren wir zwei Plätze.", "我们为返程预订两个座位。", "A2", ["旅行", "计划"]),
  de("unterschied", "词汇", "der Unterschied", "差别；不同", "der Unterschied zwischen A und B 用来明确比较两个对象。", "Zwischen den beiden Tarifen gibt es einen wichtigen Unterschied.", "这两种资费之间有一个重要区别。", "A2", ["比较", "决策"]),
  de("gelegenheit", "词汇", "die Gelegenheit", "机会；合适的时机", "Gelegenheit 强调可以做某事的具体时机。", "Auf der Reise hatte ich Gelegenheit, viel Deutsch zu sprechen.", "旅行中我有机会说了很多德语。", "A2", ["学习", "旅行"]),
  de("umgebung", "词汇", "die Umgebung", "周边；环境", "Umgebung 指一个地点附近的区域，不等同于更广义的 Umwelt。", "In der Umgebung des Sees gibt es mehrere Wanderwege.", "湖周围有几条徒步路线。", "A2", ["自然", "方位"]),
  de("verantwortung", "词汇", "die Verantwortung", "责任", "Verantwortung übernehmen 表示主动承担对任务或结果的责任。", "Jeder im Team übernimmt Verantwortung für einen Teil der Arbeit.", "团队中的每个人都对一部分工作负责。", "A2", ["工作", "协作"]),
  de("melde-mich", "表达", "Ich melde mich später.", "我晚些时候联系你。", "sich melden 可表示主动联系或报到，具体方式由语境决定。", "Ich melde mich später, wenn ich den Termin bestätigt habe.", "我确认预约后再联系你。", "A2", ["沟通", "计划"]),
  de("passt-gut", "表达", "Das passt mir gut.", "这个时间／安排很适合我。", "passen 搭配第三格，说明某事对某人合适。", "Der Termin am Freitag passt mir gut.", "周五的时间很适合我。", "A2", ["时间", "协商"]),
  de("schaffe-nicht", "表达", "Leider schaffe ich es nicht.", "很遗憾，我来不及／做不到。", "es schaffen 强调成功完成或及时赶上，加入 leider 可缓和拒绝。", "Leider schaffe ich es heute nicht vor sechs Uhr.", "很遗憾，我今天六点前赶不到。", "A2", ["时间", "礼貌拒绝"]),
  de("termin-verschieben", "表达", "Könnten wir den Termin verschieben?", "我们可以改一下预约时间吗？", "Konjunktiv II 形式 könnten 使请求更礼貌。", "Könnten wir den Termin auf nächste Woche verschieben?", "我们能把预约改到下周吗？", "A2", ["计划", "礼貌"]),
  de("unterwegs", "表达", "Ich bin unterwegs.", "我已经在路上了。", "unterwegs 表示正处于从一个地点到另一个地点的途中。", "Ich bin schon unterwegs und komme in zwanzig Minuten an.", "我已经在路上了，二十分钟后到。", "A2", ["交通", "沟通"]),
  de("tut-mir-leid", "表达", "Es tut mir leid.", "对不起；我很遗憾。", "既可用于道歉，也可用于对不幸消息表达遗憾，语气由后文说明。", "Es tut mir leid, dass ich deine Nachricht so spät beantwortet habe.", "很抱歉，我这么晚才回复你的消息。", "A2", ["礼貌", "关系"]),
  de("kuemmere-darum", "表达", "Ich kümmere mich darum.", "我来处理这件事。", "sich um etwas kümmern 表示照料或负责处理，um 后接第四格。", "Ich kümmere mich morgen um die Reservierung.", "我明天来处理预订。", "A2", ["责任", "计划"]),
  de("bekannt-vor", "表达", "Das kommt mir bekannt vor.", "这让我觉得似曾相识。", "jemandem bekannt vorkommen 用第三格表示某人觉得熟悉。", "Der Name kommt mir bekannt vor, aber ich erinnere mich nicht genau.", "这个名字我觉得耳熟，但记不清了。", "A2", ["记忆", "沟通"]),
  de("geirrt", "表达", "Ich habe mich geirrt.", "我弄错了。", "sich irren 表示判断或记忆出错，是承认错误的直接表达。", "Ich habe mich in der Hausnummer geirrt.", "我把门牌号记错了。", "A2", ["纠错", "日常办事"]),
  de("wie-waere", "表达", "Wie wäre es mit …?", "……怎么样？", "用来提出建议，mit 后接第三格名词。", "Wie wäre es mit einem Spaziergang am Fluss?", "去河边散步怎么样？", "A2", ["建议", "休闲"]),
  de("so-weit-gut", "表达", "So weit, so gut.", "到目前为止还不错。", "用于阶段性评价，表示目前没有明显问题，但事情尚未结束。", "Der Plan funktioniert so weit ganz gut.", "这个计划到目前为止运行得很好。", "A2", ["评价", "进度"]),
  de("bin-dafuer", "表达", "Ich bin dafür.", "我赞成。", "dafür 指代前面提到的方案或观点，反义表达是 dagegen sein。", "Ich bin dafür, dass wir öfter mit dem Fahrrad fahren.", "我赞成我们多骑自行车。", "A2", ["观点", "环保"]),
  de("grammar-reflexive", "语法", "反身动词与反身代词", "主语的动作返回自身时使用反身代词，例如 ich freue mich。", "Am Abend entspanne ich mich mit einem Buch.", "晚上我读书放松。", "A2", ["语法", "日常生活"]),
  de("grammar-weil", "语法", "weil 原因从句", "weil 引导原因从句，变位动词通常放在从句末尾。", "Ich nehme den Bus, weil es stark regnet.", "因为雨下得很大，我坐公交车。", "A2", ["原因", "词序"]),
  de("grammar-wenn", "语法", "wenn 条件或重复时间从句", "wenn 可表示条件，也可表示现在或过去反复发生的时间关系。", "Wenn ich Zeit habe, koche ich selbst.", "如果我有时间，我就自己做饭。", "A2", ["条件", "时间"]),
  de("grammar-infinitiv-zu", "语法", "zu + 不定式", "同一主语下表达计划、尝试或必要性时，常用 zu 加不定式结构。", "Ich versuche, jeden Tag zwanzig Minuten zu lesen.", "我尽量每天读二十分钟。", "A2", ["计划", "学习"]),
  de("grammar-adjective-indefinite", "语法", "不定冠词后的形容词词尾", "形容词词尾补充不定冠词未明确表达的性、数和格信息。", "Wir suchen ein ruhiges Zimmer mit großem Fenster.", "我们在找一间带大窗户的安静房间。", "A2", ["形容词", "居住"]),
  de("grammar-verbs-prepositions", "语法", "动词与固定介词", "许多动词要求固定介词和格，应作为整体学习。", "Sie wartet vor dem Kino auf ihre Freundin.", "她在电影院前等朋友。", "A2", ["介词", "词汇搭配"]),
  de("grammar-past-modal", "语法", "情态动词的过去时", "口语叙述过去时，情态动词常直接使用 Präteritum，例如 musste、konnte。", "Gestern musste ich länger im Büro bleiben.", "昨天我不得不在办公室多待一会儿。", "A2", ["过去", "工作"]),

  // B1: 12 vocabulary, 13 expressions, 11 grammar items.
  de("herausforderung", "词汇", "die Herausforderung", "挑战", "指需要投入能力和努力才能处理的任务，不一定含负面意味。", "Die größte Herausforderung war die knappe Vorbereitungszeit.", "最大的挑战是准备时间很紧。", "B1", ["工作", "成长"]),
  de("voraussetzung", "词汇", "die Voraussetzung", "前提；必要条件", "Voraussetzung 表示某事发生或成功之前必须满足的条件。", "Regelmäßiges Üben ist eine wichtige Voraussetzung für Fortschritt.", "规律练习是取得进步的重要前提。", "B1", ["学习", "条件"]),
  de("ruecksicht", "词汇", "die Rücksicht", "体谅；顾及", "Rücksicht auf jemanden oder etwas nehmen 表示考虑他人或环境。", "Im Zug sollten alle Reisenden Rücksicht aufeinander nehmen.", "在火车上，所有乘客都应彼此体谅。", "B1", ["公共空间", "关系"]),
  de("erkenntnis", "词汇", "die Erkenntnis", "认识；领悟", "指经过观察或思考获得的新理解。", "Aus dem Gespräch gewann sie eine wichtige Erkenntnis.", "她从那次谈话中获得了一个重要认识。", "B1", ["思考", "学习"]),
  de("zusammenhang", "词汇", "der Zusammenhang", "关联；上下文", "既可表示事物之间的联系，也可表示一句话所处的语境。", "Ohne den historischen Zusammenhang bleibt die Entscheidung schwer verständlich.", "脱离历史背景，这项决定很难理解。", "B1", ["历史", "分析"]),
  de("auswirkung", "词汇", "die Auswirkung", "影响；后果", "常用 Auswirkungen auf 加第四格，说明某事带来的结果。", "Die neue Buslinie hat positive Auswirkungen auf den Stadtteil.", "新公交线路对这个城区产生了积极影响。", "B1", ["城市", "因果"]),
  de("schwerpunkt", "词汇", "der Schwerpunkt", "重点；重心", "Schwerpunkt 指内容、工作或研究中特别集中的部分。", "Der Schwerpunkt des Kurses liegt auf dem freien Sprechen.", "这门课的重点是自由表达。", "B1", ["学习", "计划"]),
  de("fortschritt", "词汇", "der Fortschritt", "进步；进展", "Fortschritt 可数时指具体进展，作为总体进步时常用单数。", "Kleine tägliche Schritte führen oft zu sichtbarem Fortschritt.", "每天的小进步往往会带来可见的成长。", "B1", ["成长", "习惯"]),
  de("aufwand", "词汇", "der Aufwand", "投入；花费的精力或资源", "Aufwand 不只指金钱，也包括时间、组织和劳动。", "Der organisatorische Aufwand war größer als erwartet.", "组织工作所需的投入比预期更大。", "B1", ["工作", "资源"]),
  de("zweifel", "词汇", "der Zweifel", "怀疑；疑虑", "Zweifel an etwas haben 使用 an 加第三格。", "Nach dem Test hatte er keinen Zweifel mehr an der Lösung.", "测试之后，他对这个方案不再有疑问。", "B1", ["判断", "证据"]),
  de("beitrag", "词汇", "der Beitrag", "贡献；文章；费用", "含义依语境而变，可指贡献、媒体内容或需缴纳的款项。", "Jede Person kann einen kleinen Beitrag zum Projekt leisten.", "每个人都可以为项目作出一点贡献。", "B1", ["协作", "责任"]),
  de("eindruck", "词汇", "der Eindruck", "印象", "einen Eindruck von etwas bekommen 表示对某事形成初步认识。", "Die Ausstellung vermittelt einen lebendigen Eindruck vom damaligen Alltag.", "展览生动呈现了当时的日常生活。", "B1", ["历史", "感受"]),
  de("meiner-erfahrung", "表达", "Meiner Erfahrung nach …", "根据我的经验……", "用于明确观点来自个人经验，而不是普遍事实。", "Meiner Erfahrung nach lernt man Wörter besser im Zusammenhang.", "根据我的经验，在语境中学单词效果更好。", "B1", ["观点", "学习"]),
  de("einerseits-andererseits", "表达", "einerseits …, andererseits …", "一方面……，另一方面……", "成对连接两个需要同时权衡的方面。", "Einerseits spart die App Zeit, andererseits sammelt sie viele Daten.", "一方面这款应用节省时间，另一方面它收集很多数据。", "B1", ["权衡", "科技"]),
  de("gehe-davon-aus", "表达", "Ich gehe davon aus, dass …", "我认为／假定……", "说明一个当前采用但仍可能修正的假设。", "Ich gehe davon aus, dass der Zug pünktlich abfährt.", "我暂且认为火车会准点出发。", "B1", ["推测", "计划"]),
  de("ueberzeugt-nicht", "表达", "Das überzeugt mich nicht ganz.", "这并没有完全说服我。", "比直接说 falsch 更缓和，适合在讨论中表达保留意见。", "Das Argument überzeugt mich nicht ganz, weil ein Beleg fehlt.", "这个论点没有完全说服我，因为缺少证据。", "B1", ["讨论", "证据"]),
  de("darauf-hinaus", "表达", "Darauf wollte ich hinaus.", "这正是我想表达的重点。", "用于确认对方抓住了自己论述的核心。", "Genau, darauf wollte ich mit meinem Beispiel hinaus.", "没错，我举这个例子正是想说明这一点。", "B1", ["讨论", "沟通"]),
  de("grossen-ganzen", "表达", "Im Großen und Ganzen …", "总的来说……", "概括总体判断，同时允许存在少量例外。", "Im Großen und Ganzen hat die Zusammenarbeit gut funktioniert.", "总的来说，这次合作进行得很顺利。", "B1", ["总结", "工作"]),
  de("lohnt-sich", "表达", "Es lohnt sich, …", "……是值得的。", "后接 zu 不定式，说明投入与收获之间值得。", "Es lohnt sich, vor der Reise einige Sätze zu üben.", "旅行前练习几个句子是值得的。", "B1", ["评价", "旅行"]),
  de("unter-umstaenden", "表达", "Unter diesen Umständen …", "在这些情况下……", "用于说明结论依赖当前条件。", "Unter diesen Umständen sollten wir den Plan noch einmal prüfen.", "在这种情况下，我们应再检查一次计划。", "B1", ["条件", "决策"]),
  de("soweit-weiss", "表达", "Soweit ich weiß, …", "据我所知……", "限制自己陈述的确定范围，避免把未核实信息说成绝对事实。", "Soweit ich weiß, bleibt das Museum montags geschlossen.", "据我所知，博物馆周一闭馆。", "B1", ["信息边界", "旅行"]),
  de("haengt-zusammen", "表达", "Das hängt damit zusammen, dass …", "这与……有关。", "用于引出原因或关联，但并不自动证明因果关系。", "Das hängt damit zusammen, dass viele Menschen von zu Hause arbeiten.", "这与许多人居家办公有关。", "B1", ["因果", "分析"]),
  de("etwas-anders", "表达", "Ich sehe das etwas anders.", "我对此看法略有不同。", "礼貌表达异议，并为进一步说明理由留出空间。", "Ich sehe das etwas anders und möchte einen zweiten Aspekt nennen.", "我的看法略有不同，想再提出一个方面。", "B1", ["讨论", "礼貌"]),
  de("ehrlich-sein", "表达", "Um ehrlich zu sein, …", "坦率地说……", "用来引出较直接的个人评价，仍应注意后文语气。", "Um ehrlich zu sein, war mir das Programm zu voll.", "坦率地说，我觉得行程安排得太满。", "B1", ["观点", "旅行"]),
  de("laesst-aendern", "表达", "Das lässt sich ändern.", "这可以改变。", "lassen sich 加不定式常表达某事具有可实现性。", "Die Reihenfolge lässt sich ohne großen Aufwand ändern.", "这个顺序不费太大力气就可以调整。", "B1", ["解决问题", "计划"]),
  de("grammar-obwohl", "语法", "obwohl 让步从句", "obwohl 引出与主句结果相反或形成反差的事实，动词在从句末。", "Obwohl es regnete, gingen wir zu Fuß weiter.", "尽管下雨了，我们还是继续步行。", "B1", ["让步", "词序"]),
  de("grammar-waehrend", "语法", "während 表示同时或对比", "während 可连接同时发生的动作，也可对照两种情况。", "Während ich koche, deckt mein Bruder den Tisch.", "我做饭时，哥哥在摆餐具。", "B1", ["时间", "对比"]),
  de("grammar-nachdem", "语法", "nachdem 与先后关系", "nachdem 引导先发生的动作，主句描述其后发生的事情。", "Nachdem sie den Bericht gelesen hatte, stellte sie zwei Fragen.", "她读完报告后提出了两个问题。", "B1", ["时间", "过去"]),
  de("grammar-passive-present", "语法", "现在时被动态", "werden 加第二分词把注意力放在过程或受事，而非执行者。", "Die alten Fenster werden im Sommer repariert.", "旧窗户将在夏天维修。", "B1", ["被动态", "城市"]),
  de("grammar-relative-dative", "语法", "第三格关系代词", "关系代词的格由它在关系从句中的作用决定。", "Die Kollegin, mit der ich arbeite, spricht drei Sprachen.", "和我一起工作的那位同事会说三种语言。", "B1", ["关系从句", "工作"]),
  de("grammar-konjunktiv-polite", "语法", "Konjunktiv II 的礼貌请求", "würden、könnten、hätten 等形式能让请求和愿望更委婉。", "Könnten Sie mir sagen, wann der Kurs beginnt?", "您能告诉我课程什么时候开始吗？", "B1", ["礼貌", "语气"]),
  de("grammar-damit-umzu", "语法", "damit 与 um … zu", "主从句主语相同时常用 um zu；主语不同时使用 damit 从句。", "Ich schreibe alles auf, damit niemand die Aufgabe vergisst.", "我把一切写下来，以免有人忘记任务。", "B1", ["目的", "协作"]),
  de("grammar-da-compounds", "语法", "da(r)- 代副词", "谈论事物时，可用 daran、darauf、darüber 等代替介词加 es。", "Wir sprechen morgen darüber, wie das Problem gelöst werden kann.", "我们明天讨论这个问题该如何解决。", "B1", ["代词", "讨论"]),
  de("grammar-adjective-definite", "语法", "定冠词后的形容词词尾", "定冠词已明确性数格时，形容词多采用弱变化词尾。", "Die neue Bibliothek steht neben dem alten Rathaus.", "新图书馆在老市政厅旁边。", "B1", ["形容词", "城市"]),
  de("grammar-genitive-prepositions", "语法", "部分介词支配第二格", "trotz、während、wegen 等在正式标准语中常与第二格搭配。", "Trotz des kalten Windes blieb die Gruppe am See.", "尽管风很冷，这群人仍留在湖边。", "B1", ["介词", "书面语"]),
  de("grammar-indirect-question", "语法", "间接疑问句", "间接疑问用疑问词或 ob 引导，变位动词位于从句末。", "Weißt du, ob der Laden heute länger geöffnet ist?", "你知道那家店今天是否延长营业吗？", "B1", ["疑问", "词序"]),

  // B2: 19 vocabulary, 15 expressions, 15 grammar items.
  de("nachvollziehbar", "词汇", "nachvollziehbar", "可以理解的；可追溯的", "既可评价推理容易理解，也可表示过程能够被核查。", "Die Entscheidung ist nur nachvollziehbar, wenn die Kriterien offenliegen.", "只有公开标准，这项决定才容易理解和核查。", "B2", ["透明度", "判断"]),
  de("zwiespaeltig", "词汇", "zwiespältig", "矛盾的；心情复杂的", "描述对同一对象同时持有正反两种感受或评价。", "Viele Bewohner sehen das Bauprojekt zwiespältig.", "许多居民对这个建设项目心情复杂。", "B2", ["权衡", "城市"]),
  de("ausschlaggebend", "词汇", "ausschlaggebend", "起决定作用的", "指出在多个因素中最终改变结果的关键因素。", "Für unsere Wahl war die gute Zugverbindung ausschlaggebend.", "良好的铁路连接是我们作出选择的决定性因素。", "B2", ["决策", "交通"]),
  de("verlaesslich", "词汇", "verlässlich", "可靠的", "可形容人、数据、方法或安排值得依赖。", "Für den Vergleich brauchen wir verlässliche und aktuelle Daten.", "为了比较，我们需要可靠且最新的数据。", "B2", ["证据", "研究"]),
  de("angemessen", "词汇", "angemessen", "适当的；相称的", "评价反应、成本或行为是否符合具体情境和尺度。", "Die Maßnahme sollte dem tatsächlichen Risiko angemessen sein.", "措施应与实际风险相称。", "B2", ["风险", "判断"]),
  de("unerlaesslich", "词汇", "unerlässlich", "不可或缺的", "比 wichtig 语气更强，表示没有该条件就难以实现目标。", "Eine klare Quellenangabe ist für die Überprüfung unerlässlich.", "清楚标明来源对核查而言不可或缺。", "B2", ["来源", "研究"]),
  de("vielschichtig", "词汇", "vielschichtig", "多层面的；复杂的", "强调问题由多种相互作用的层次构成，不能单一解释。", "Die Geschichte der Stadt ist vielschichtiger, als der kurze Text vermuten lässt.", "这座城市的历史比短文呈现的更为多层。", "B2", ["历史", "复杂性"]),
  de("umstritten", "词汇", "umstritten", "有争议的", "表示专家、公众或群体对某事存在持续分歧，而非简单等同于错误。", "Die vorgeschlagene Regelung bleibt politisch umstritten.", "拟议中的规定在政治上仍有争议。", "B2", ["公共讨论", "政策"]),
  de("langfristig", "词汇", "langfristig", "长期来看；长期的", "强调超出眼前效果的较长时间尺度。", "Langfristig ist regelmäßige Wartung günstiger als ständige Reparaturen.", "从长期看，定期维护比不断维修更省钱。", "B2", ["时间", "规划"]),
  de("gegenwaertig", "词汇", "gegenwärtig", "目前的；当前", "书面语中常用于限定信息只适用于当前时点。", "Gegenwärtig liegen noch nicht genügend Ergebnisse vor.", "目前还没有足够的结果。", "B2", ["信息边界", "时间"]),
  de("spielraum", "词汇", "der Spielraum", "余地；操作空间", "既可指实际空间，也常比喻可调整和决策的范围。", "Der enge Zeitplan lässt kaum Spielraum für zusätzliche Aufgaben.", "紧凑的时间表几乎不给额外任务留下余地。", "B2", ["计划", "资源"]),
  de("stellenwert", "词汇", "der Stellenwert", "重要程度；地位", "用于比较某个因素在整体中的重要性。", "Öffentliche Bibliotheken haben in diesem Viertel einen hohen Stellenwert.", "公共图书馆在这个城区具有很高的重要性。", "B2", ["公共空间", "价值"]),
  de("wechselwirkung", "词汇", "die Wechselwirkung", "相互作用", "强调两个或多个因素彼此影响，不是单向因果。", "Die Studie untersucht die Wechselwirkung zwischen Schlaf und Stress.", "这项研究考察睡眠与压力之间的相互作用。", "B2", ["科学", "因果"]),
  de("tragweite", "词汇", "die Tragweite", "影响范围；深远意义", "指决定或事件可能带来的广泛和长期后果。", "Die Tragweite der Änderung wurde anfangs unterschätzt.", "这项变化的深远影响起初被低估了。", "B2", ["后果", "决策"]),
  de("einwand", "词汇", "der Einwand", "反对意见；异议", "Einwand 针对论点或方案提出具体问题，应与一般不满区分。", "Gegen den Vorschlag wurde ein sachlicher Einwand erhoben.", "有人针对这个建议提出了一项实质性异议。", "B2", ["讨论", "论证"]),
  de("abwaegung", "词汇", "die Abwägung", "权衡", "表示根据多个目标、收益和风险作出比较判断。", "Die Entscheidung erfordert eine sorgfältige Abwägung von Nutzen und Kosten.", "这项决定需要仔细权衡收益与成本。", "B2", ["决策", "风险"]),
  de("herangehensweise", "词汇", "die Herangehensweise", "处理方式；方法路径", "指面对问题时采用的总体思路和步骤。", "Eine schrittweise Herangehensweise erleichtert die Fehlersuche.", "循序渐进的处理方式有助于排查错误。", "B2", ["方法", "解决问题"]),
  de("rahmenbedingung", "词汇", "die Rahmenbedingung", "外部条件；框架条件", "通常用复数，指个人难以立即改变但会影响行动的制度或环境条件。", "Gute Ideen scheitern manchmal an ungünstigen Rahmenbedingungen.", "好想法有时会因为不利的外部条件而失败。", "B2", ["制度", "环境"]),
  de("schlussfolgerung", "词汇", "die Schlussfolgerung", "结论；推论", "指从事实或论证中推导出的判断，仍需检查前提是否充分。", "Aus einer einzelnen Beobachtung lässt sich keine sichere Schlussfolgerung ziehen.", "不能从单次观察中得出可靠结论。", "B2", ["推理", "证据"]),
  de("spricht-dafuer", "表达", "Es spricht vieles dafür, dass …", "有许多理由表明……", "表达证据倾向某个结论，但保留不确定性。", "Es spricht vieles dafür, dass kleine Änderungen dauerhaft wirksamer sind.", "有许多理由表明，小幅改变更容易长期奏效。", "B2", ["论证", "不确定性"]),
  de("nichtsdestotrotz", "表达", "Nichtsdestotrotz …", "尽管如此……", "正式连接词，用于承认前述事实后引出仍然成立的判断。", "Die Daten sind unvollständig; nichtsdestotrotz zeigen sie einen klaren Trend.", "数据并不完整；尽管如此，它们显示出清晰趋势。", "B2", ["让步", "证据"]),
  de("greift-zu-kurz", "表达", "Das greift zu kurz.", "这种解释过于片面。", "指出解释忽视了重要层面，最好随后说明缺失之处。", "Die Kosten allein zu betrachten, greift bei dieser Entscheidung zu kurz.", "在这项决定中只考虑成本过于片面。", "B2", ["批判思考", "讨论"]),
  de("ausser-acht", "表达", "Man darf nicht außer Acht lassen, dass …", "不能忽视……", "用于把容易被遗漏但对结论重要的因素重新纳入讨论。", "Man darf nicht außer Acht lassen, dass die Gruppen unterschiedlich groß waren.", "不能忽视各组规模不同这一点。", "B2", ["研究", "论证"]),
  de("unter-vorbehalt", "表达", "Das gilt nur unter Vorbehalt.", "这一点只能保留地成立。", "说明结论受数据、条件或后续核实限制。", "Die erste Schätzung gilt bis zur vollständigen Prüfung nur unter Vorbehalt.", "在完成全面核查之前，初步估计只能保留地采用。", "B2", ["信息边界", "核查"]),
  de("inwiefern", "表达", "Inwiefern …?", "在何种程度上……？", "比简单询问是否更开放，要求说明范围、机制或限制。", "Inwiefern verändert die neue Route den Alltag der Anwohner?", "新线路在何种程度上改变居民的日常生活？", "B2", ["提问", "城市"]),
  de("daraus-ableiten", "表达", "Daraus lässt sich ableiten, dass …", "由此可以推导出……", "用于明确结论来自前述依据，同时应检查推导是否超过证据。", "Daraus lässt sich ableiten, dass weitere Messungen nötig sind.", "由此可以推断，还需要进一步测量。", "B2", ["推理", "科学"]),
  de("im-hinblick", "表达", "im Hinblick auf …", "就……而言；着眼于……", "正式表达，用于限定评价的具体方面。", "Im Hinblick auf die Barrierefreiheit muss der Entwurf verbessert werden.", "就无障碍而言，这个设计仍需改进。", "B2", ["评价", "无障碍"]),
  de("im-gegensatz", "表达", "Im Gegensatz dazu …", "与此相反……", "用于清楚建立两个事实或观点的对比。", "Die Innenstadt ist dicht bebaut; im Gegensatz dazu wirkt das Flussufer offen.", "市中心建筑密集；相比之下，河岸显得开阔。", "B2", ["对比", "城市"]),
  de("ausser-frage", "表达", "Es steht außer Frage, dass …", "毫无疑问……", "语气很强，只适合真正没有争议或已有充分依据的前提。", "Es steht außer Frage, dass Quellen transparent angegeben werden müssen.", "来源必须透明标明，这一点毫无疑问。", "B2", ["强调", "来源"]),
  de("insofern-relevant", "表达", "Das ist insofern relevant, als …", "这一点之所以重要，是因为……", "正式地限定某事在哪个具体方面与论点有关。", "Die Jahreszahl ist insofern relevant, als sich danach die Regel änderte.", "这个年份之所以重要，是因为此后规则发生了变化。", "B2", ["论证", "历史"]),
  de("entgegenzuhalten", "表达", "Dem ist entgegenzuhalten, dass …", "对此可以反驳说……", "正式讨论中引出针对前述论点的具体反证或限制。", "Dem ist entgegenzuhalten, dass die Stichprobe sehr klein war.", "对此可以反驳说，样本非常小。", "B2", ["反驳", "研究"]),
  de("naeherer-betrachtung", "表达", "Bei näherer Betrachtung …", "仔细考察后……", "表示初步印象在更细致观察后得到修正或分化。", "Bei näherer Betrachtung unterscheiden sich die beiden Modelle deutlich.", "仔细考察后，这两个模型差异明显。", "B2", ["分析", "比较"]),
  de("zeichnet-sich-ab", "表达", "Es zeichnet sich ab, dass …", "逐渐显现出……", "说明趋势已有迹象但尚未完全确定。", "Es zeichnet sich ab, dass die Nachfrage langsamer wächst.", "逐渐显现出需求增速放缓的趋势。", "B2", ["趋势", "不确定性"]),
  de("sofern", "表达", "sofern …", "只要；如果……", "较正式的条件连接词，强调结论只在条件满足时成立。", "Die Änderung ist sinnvoll, sofern alle Beteiligten informiert werden.", "只要通知所有参与者，这项修改就是合理的。", "B2", ["条件", "协作"]),
  de("grammar-passive-alternatives", "语法", "被动态的替代表达", "sein + zu、不定代词 man 或 sich lassen 可按语义替代 werden 被动态。", "Der Fehler lässt sich mit einem zusätzlichen Test vermeiden.", "通过增加一项测试可以避免这个错误。", "B2", ["被动态", "写作"]),
  de("grammar-modal-particles", "语法", "语气词 doch、ja、eben", "语气词不改变事实内容，却表达共同知识、提醒或说话态度，不能机械直译。", "Du weißt ja, dass der letzte Bus früh abfährt.", "你也知道，末班车开得很早。", "B2", ["语用", "口语"]),
  de("grammar-nominalization", "语法", "动词与形容词名词化", "名词化适合压缩正式信息，但过多会使句子沉重。", "Die sorgfältige Prüfung der Quellen erhöht die Verlässlichkeit.", "仔细核查来源可以提高可靠性。", "B2", ["书面语", "来源"]),
  de("grammar-participial-attribute", "语法", "分词作扩展定语", "第一或第二分词可带补足语放在名词前，常见于正式文本。", "Die gestern veröffentlichten Zahlen werden noch geprüft.", "昨天公布的数据仍在核查。", "B2", ["书面语", "数据"]),
  de("grammar-obgleich", "语法", "obgleich / obschon 让步", "obgleich 和 obschon 比 obwohl 更书面，词序同样为动词后置。", "Obgleich die Zeit knapp war, wurde jeder Einwand diskutiert.", "尽管时间紧张，每项异议仍得到讨论。", "B2", ["让步", "书面语"]),
  de("grammar-indem", "语法", "indem 表示方式或手段", "indem 从句说明主句行动通过何种方式实现。", "Die Stadt spart Energie, indem sie alte Gebäude besser dämmt.", "这座城市通过改善旧建筑保温来节能。", "B2", ["方式", "城市"]),
  de("grammar-ohne-dass", "语法", "ohne dass 与 ohne … zu", "主语相同时可用 ohne zu；主语不同时通常使用 ohne dass。", "Er änderte den Text, ohne dass die Autorin davon wusste.", "他修改了文本，而作者并不知情。", "B2", ["方式", "信息伦理"]),
  de("grammar-falls", "语法", "falls 的条件语气", "falls 通常表示条件是否发生尚不确定，语气比 wenn 更明确地假设。", "Falls die Verbindung ausfällt, speichern wir die Daten lokal.", "如果连接中断，我们就把数据保存在本地。", "B2", ["条件", "技术"]),
  de("grammar-konjunktiv-one", "语法", "Konjunktiv I 转述", "新闻和正式写作常用 Konjunktiv I 标记内容来自他人陈述。", "Die Sprecherin erklärte, das Verfahren sei vollständig dokumentiert.", "发言人表示，该流程已经完整记录。", "B2", ["转述", "新闻"]),
  de("grammar-konjunktiv-past", "语法", "过去时 Konjunktiv II", "hätte 或 wäre 加第二分词，表达未发生的过去条件或遗憾。", "Mit mehr Zeit hätten wir die Ergebnisse erneut überprüft.", "如果时间更多，我们本可以再次核查结果。", "B2", ["假设", "过去"]),
  de("grammar-je-desto", "语法", "je …, desto / umso …", "成对结构表示两个变量按一定方向共同变化。", "Je klarer die Frage ist, desto gezielter fällt die Antwort aus.", "问题越清楚，回答就越有针对性。", "B2", ["比较", "逻辑"]),
  de("grammar-n-declension", "语法", "阳性弱变化名词", "部分阳性名词除主格单数外通常加 -n 或 -en。", "Wir haben mit einem erfahrenen Experten gesprochen.", "我们同一位经验丰富的专家交谈过。", "B2", ["名词变化", "人物"]),
  de("grammar-infinitive-comma", "语法", "扩展不定式组的逗号", "由 um、ohne、statt 引导或依附名词时，zu 不定式组通常用逗号分隔。", "Sie nahm sich Zeit, um den Bericht gründlich zu lesen.", "她留出时间仔细阅读报告。", "B2", ["标点", "书面语"]),
  de("grammar-placeholder-es", "语法", "形式主语和形式宾语 es", "es 可占据句法位置，真正内容由后面的从句或不定式说明。", "Es überrascht mich, wie schnell sich die Lage verändert hat.", "情况变化如此之快，让我很惊讶。", "B2", ["句法", "变化"]),
  de("grammar-verb-prefixes", "语法", "前缀改变动词意义", "可分与不可分前缀不仅影响词序，也会改变基本动词的方向和抽象含义。", "Die Redaktion überarbeitet den Artikel, bevor sie ihn veröffentlicht.", "编辑部在发布文章前会对其进行修订。", "B2", ["构词", "媒体"])
];

const german200 = legacyGerman.map((item) => ({
  ...item,
  ...(item.id === "de-grammar-gender" ? {
    exampleGerman: "Auf dem Tisch stehen eine Lampe und ein kleines Modellhaus.",
    exampleChinese: "桌上放着一盏灯和一个小模型屋；三个名词分别展示不同冠词。"
  } : {}),
  themeTags: item.themeTags || [item.kind, item.level]
})).concat(newGerman).map((item) => ({
  ...item,
  narration: {
    kind: "bundled-synthetic-female",
    voice: "de_DE-eva_k-x_low",
    src: `./assets/audio/german/${item.id}.mp3`,
    manifest: "./assets/audio/german/manifest.json"
  }
}));

const GERMAN_SOURCES = Object.freeze({
  goethe: GOETHE_SOURCE,
  grammis: IDS_SOURCE,
  duden: "https://www.duden.de/woerterbuch"
});
const GERMAN_EXPLANATIONS = Object.freeze({
  "表达": [
    (row) => `“${row.german}”用于${row.themeTags.split("；").join("、")}相关交流；例句展示了完整语境和自然语气。`,
    (row) => `这是一种${row.level}级常用表达，中文核心意思是“${row.chinese}”；使用时注意称呼和场合。`,
    (row) => `该表达把“${row.chinese}”组织成可直接使用的德语句块，例句可整体跟读并替换关键词。`,
    (row) => `在真实对话中，“${row.german}”承担${row.themeTags.split("；")[0]}功能；不要只逐词直译。`,
    (row) => `掌握这句话的重点是语用而非单词相加；它在例句中表达“${row.chinese}”。`
  ],
  "词汇": [
    (row) => `“${row.german}”表示“${row.chinese}”；连同冠词或基本形式记忆，能减少后续格变化错误。`,
    (row) => `该${row.level}词汇用于${row.themeTags.split("；").join("、")}语境，例句展示了常见搭配而非孤立翻译。`,
    (row) => `学习“${row.german}”时同时记住中文义“${row.chinese}”和例句中的动词搭配。`,
    (row) => `这个词的核心意思是“${row.chinese}”；朗读完整例句可一起巩固重音、冠词与词序。`,
    (row) => `“${row.german}”在本句中承担${row.themeTags.split("；")[0]}信息，适合用替换法扩展自己的句子。`
  ],
  "语法": [
    (row) => `${row.chinese}；例句用一个完整场景展示该规则在真实德语中的位置。`,
    (row) => `本条聚焦“${row.german}”：${row.chinese}。先跟读例句，再标出变位动词和相关成分。`,
    (row) => `${row.german}属于${row.level}级结构；关键不是背名称，而是从例句观察${row.chinese}。`,
    (row) => `理解这一结构时，应同时看形式和功能：${row.chinese}。例句提供可复用句型。`,
    (row) => `该语法点说明${row.chinese}；朗读后可替换名词或时间成分检查词序是否保持。`
  ]
});

// These entries need more than a rotating template: four expose a concrete
// register/collocation/word-order lesson, while six specialist B2 entries state
// their B2+ learning boundary without changing the four-level pool quota.
const GERMAN_EXPLANATION_OVERRIDES = Object.freeze({
  "guten-tag-formell": "Guten Tag 是白天中性偏正式的问候，可与姓氏或称谓连用，如 Guten Tag, Frau Keller；与较随意的 Hallo 相比，它保留了更多社交距离。",
  "auf-wiedersehen-formell": "Auf Wiedersehen 是中性偏正式的告别语，通常暗含以后还会见面；Tschüss 更随意。例句逗号后的 bis nächste Woche 补充了下次见面的时间。",
  "platz-stadt": "der Platz 可指广场、位置或座位；本句 auf dem Platz 表示静态地点，因此用第三格。可分动词 stattfinden 构成 findet … statt，statt 位于句末。",
  "die-einschaetzung": "die Einschätzung 指基于信息作出的评估或判断，常见搭配有 eine Einschätzung abgeben／ändern。它可保留暂定性，不等同于固定评分；例句把 erste Einschätzung 与 sich ändern 连用。",
  "die-pflicht": "B2+／公共政策或学术扩展词：die Rechenschaftspflicht 指制度性的问责责任，不等于日常 Pflicht。重点识别 der Rechenschaftspflicht unterliegen 这一正式搭配，用于公共管理或治理文本；无需把它当作日常口语主动词。",
  "die-daseinsvorsorge": "B2+／公共政策或学术扩展词：die Daseinsvorsorge 是德国公共政策中保障基本公共服务的术语。重点用于行政与城市政策阅读，并记住 zur Daseinsvorsorge gehören；不要求按普通日常词汇使用。",
  "die-pfadabhaengigkeit": "B2+／公共政策或学术扩展词：die Pfadabhängigkeit 是解释早期选择如何约束后续选项的社会科学概念。先用于识别历史与制度分析；主动使用主要属于学术讨论，不必硬塞进日常对话。",
  "die-verhaeltnismaessigkeit": "B2+／公共政策或学术扩展词：die Verhältnismäßigkeit 常见于法律和政策论证。重点掌握 die Verhältnismäßigkeit eines Eingriffs prüfen；它不能简单替代日常形容词 angemessen。",
  "die-zweckmaessigkeit": "B2+／公共政策或学术扩展词：die Zweckmäßigkeit 询问措施是否合乎目的，主要用于正式评估和政策文本。可与 Wirksamkeit 对比：后者更关注措施是否实际产生预期效果。",
  "der-erkenntnisgewinn": "B2+／公共政策或学术扩展词：der Erkenntnisgewinn 指研究或分析带来的新认识。重点掌握 der Erkenntnisgewinn liegt in … 这一学术搭配；日常表达常可用 neue Einsichten。"
});

function expandedGerman(row, index) {
  const explanations = GERMAN_EXPLANATIONS[row.kind];
  return de(
    `v3-${row.slug}`, row.kind, row.german, row.chinese,
    GERMAN_EXPLANATION_OVERRIDES[row.slug] || explanations[index % explanations.length](row),
    row.exampleGerman, row.exampleChinese, row.level, row.themeTags.split("；"), GERMAN_SOURCES[row.sourceKey]
  );
}

const german500 = german200.concat(GERMAN_EXTENSION_ROWS.map(expandedGerman)).map((item) => ({
  ...item,
  narration: {
    kind: "bundled-synthetic-female",
    voice: "de_DE-eva_k-x_low",
    src: `./assets/audio/german/${item.id}.mp3`,
    manifest: "./assets/audio/german/manifest.json"
  }
}));

// Medical data are appended below. Keeping this file as the auditable source makes
// the generated JSON reproducible without altering the application build pipeline.
const GROUP = Object.freeze({
  movement: "运动、肌肉与骨骼",
  sleep: "睡眠与昼夜节律",
  nutrition: "营养、消化与口腔",
  cardio: "心血管、代谢与肾脏",
  infection: "感染预防与免疫",
  mental: "心理、脑健康与成瘾",
  senses: "感官与皮肤",
  medicines: "用药、检查与健康素养",
  urgent: "急救与紧急警示",
  environment: "环境、旅行与职业健康",
  prevention: "预防、癌症与筛查",
  lifespan: "生命周期、生殖与老龄健康"
});

const GROUP_THEME = Object.freeze({
  [GROUP.movement]: "activity",
  [GROUP.sleep]: "sleep",
  [GROUP.nutrition]: "nutrition",
  [GROUP.cardio]: "cardiometabolic",
  [GROUP.infection]: "immunity",
  [GROUP.mental]: "brain",
  [GROUP.senses]: "senses-skin",
  [GROUP.medicines]: "medicines-tests",
  [GROUP.urgent]: "emergency",
  [GROUP.environment]: "environment-travel",
  [GROUP.prevention]: "prevention-screening",
  [GROUP.lifespan]: "lifespan"
});

function medicalIllustrationKey(item) {
  const text = [item.topic, item.title, item.summary, ...(item.themeTags || [])].join(" ");
  switch (item.topicGroup) {
    case GROUP.movement:
      return /骨|肌|关节|腰|背|颈|骨折|骨质|搬举|姿势|工效|疼痛|损伤|扭伤|拉伤|肌腱|柔韧|平衡/i.test(text)
        ? "movement-musculoskeletal" : "movement-daily";
    case GROUP.sleep:
      return /呼吸暂停|失眠|打鼾|不宁腿|嗜睡|疲劳|睡眠障碍|轮班|倒班|驾驶|道路安全/i.test(text)
        ? "sleep-disorders" : "sleep-rhythm";
    case GROUP.nutrition:
      return /消化|肠|胃|口腔|牙|龋|食品安全|食物中毒|腹泻|便秘|FODMAP|微生物/i.test(text)
        ? "digestion-oral" : "nutrition-hydration";
    case GROUP.cardio:
      return /代谢|糖尿|血糖|胰岛|肾|尿|甲状腺|脂肪肝|痛风|电解质/i.test(text)
        ? "metabolic-renal" : "cardiovascular";
    case GROUP.infection:
      return /疫苗|接种|免疫|抗体/i.test(text)
        ? "vaccination-immunity" : "infection-hygiene";
    case GROUP.mental:
      return /成瘾|烟|酒|大麻|赌博|物质|认知|脑|痴呆|阿尔茨海默/i.test(text)
        ? "brain-addiction" : "mental-wellbeing";
    case GROUP.senses:
      return /皮肤|防晒|紫外|黑色素|痤疮|湿疹|皮疹|伤口/i.test(text)
        ? "skin-sun" : "vision-hearing";
    case GROUP.medicines:
      return /用药|药物|药品|剂量|止痛|抗凝|抗生素|处方|非处方|药盒|药师|服药|保健品|补充剂/i.test(text)
        ? "medication-safety" : "tests-literacy";
    case GROUP.urgent:
      return /气道|窒息|异物|过敏|哮喘|呼吸|创伤|骨折|烧伤|烫伤|中毒|过量|一氧化碳|出血|牙脱落/i.test(text)
        ? "emergency-airway-trauma" : "emergency-heart-brain";
    case GROUP.environment:
      return /旅行|出行|职业|工作|工效|保险|高原|时差|航空|旅行者/i.test(text)
        ? "environment-travel-work" : "environment-climate-air";
    case GROUP.prevention:
      return /筛查|癌|肿瘤|结直肠|宫颈|乳腺|肺癌|过度诊断|基因检测/i.test(text)
        ? "screening-cancer" : "prevention-risk";
    case GROUP.lifespan:
      return /老年|老龄|跌倒|更年期|多重用药|骨质疏松|衰弱|照护者|认知/i.test(text)
        ? "lifespan-ageing-falls" : "lifespan-reproductive-child";
    default:
      throw new Error(`unknown medical group: ${item.topicGroup}`);
  }
}

function withMedicalIllustration(item) {
  const illustrationKey = medicalIllustrationKey(item);
  const visual = MEDICAL_VISUALS.get(illustrationKey);
  assert(visual, `${item.id}: unknown medical illustration key ${illustrationKey}`);
  assert(visual.topicGroup === item.topicGroup, `${item.id}: illustration topicGroup mismatch`);
  assert(visual.imageTheme === item.imageTheme, `${item.id}: illustration imageTheme mismatch`);
  return { ...item, illustrationKey, alt: visual.alt };
}

const THEME_ALT = Object.freeze({
  activity: "插画：步行者、关节与肌肉，象征安全活动和身体功能",
  sleep: "插画：熟睡的人、月亮与昼夜时钟，象征睡眠和生物节律",
  nutrition: "插画：蔬菜谷物、牙齿与肠道，象征营养、口腔和消化健康",
  cardiometabolic: "插画：心脏、血管、肾脏与测量仪，象征心血管和代谢健康",
  immunity: "插画：盾牌、疫苗与抗体，象征感染预防和免疫保护",
  brain: "插画：平静的人物侧脸与大脑，象征神经、心理健康和成瘾支持",
  "senses-skin": "插画：眼睛、耳朵与皮肤屏障，象征感官和皮肤健康",
  "medicines-tests": "插画：药盒、检查清单与检验管，象征安全用药和健康决策",
  emergency: "插画：急救箱、警示标记与求助电话，象征急救和紧急警示",
  "environment-travel": "插画：地球、太阳、防护帽与旅行包，象征环境和旅行健康",
  "prevention-screening": "插画：日历、放大镜与防护盾，象征预防和筛查决策",
  lifespan: "插画：不同年龄人物与生命树，象征生命周期和生殖健康"
});

const LEGACY_GROUP_IDS = Object.freeze({
  [GROUP.movement]: ["medical-move-breaks", "medical-weekly-activity", "medical-strength-training", "medical-back-pain", "medical-osteoporosis"],
  [GROUP.sleep]: ["medical-sleep-duration", "medical-sleep-habits", "medical-sleep-apnea"],
  [GROUP.nutrition]: ["medical-diet-variety", "medical-salt", "medical-free-sugars", "medical-dietary-fat", "medical-hydration", "medical-food-safety", "medical-fiber", "medical-oral-health", "medical-constipation", "medical-diarrhea"],
  [GROUP.cardio]: ["medical-blood-pressure", "medical-cholesterol", "medical-diabetes"],
  [GROUP.infection]: ["medical-vaccination", "medical-antimicrobial-resistance", "medical-antibiotics-viruses", "medical-handwashing"],
  [GROUP.mental]: ["medical-tobacco", "medical-secondhand-smoke", "medical-alcohol", "medical-mental-health", "medical-social-connection", "medical-depression", "medical-suicide-warning", "medical-anxiety"],
  [GROUP.senses]: ["medical-uv", "medical-hearing-loss", "medical-safe-listening", "medical-vision-loss", "medical-melanoma"],
  [GROUP.medicines]: ["medical-drug-interactions"],
  [GROUP.urgent]: ["medical-stroke-fast", "medical-heart-attack", "medical-anaphylaxis", "medical-asthma-attack", "medical-heat-illness", "medical-cold-weather", "medical-carbon-monoxide", "medical-headache-red-flags"],
  [GROUP.environment]: ["medical-air-quality", "medical-emergency-kit"],
  [GROUP.prevention]: [],
  [GROUP.lifespan]: ["medical-falls"]
});

const LEGACY_GROUP_BY_ID = new Map(
  Object.entries(LEGACY_GROUP_IDS).flatMap(([group, ids]) => ids.map((id) => [id, group]))
);

const LEGACY_URGENT = new Set([
  "medical-stroke-fast", "medical-heart-attack", "medical-anaphylaxis", "medical-asthma-attack",
  "medical-heat-illness", "medical-carbon-monoxide", "medical-suicide-warning", "medical-vision-loss"
]);

const LEGACY_CAUTION = new Set([
  "medical-cold-weather", "medical-headache-red-flags", "medical-drug-interactions", "medical-diarrhea",
  "medical-melanoma", "medical-sleep-apnea", "medical-depression", "medical-anxiety"
]);
const V24_REVIEWED_V2_MEDICAL_IDS = new Set([
  "medical-burnout", "medical-choking-adult", "medical-major-bleeding", "medical-chemical-label"
]);

function med(slug, topicGroup, topic, title, summary, action, limitsOrRedFlags, sourceName, sourceUrl, riskLevel = "general", themeTags = []) {
  const imageTheme = GROUP_THEME[topicGroup];
  assert(imageTheme, `unknown medical group: ${topicGroup}`);
  return {
    id: `medical-${slug}`,
    type: "medical",
    topicGroup,
    topic,
    title,
    summary,
    action,
    limitsOrRedFlags,
    riskLevel,
    sourceName,
    sourceUrl,
    sourceAccessedAt: "2026-08-12",
    imageTheme,
    alt: THEME_ALT[imageTheme],
    themeTags: themeTags.length ? themeTags : [topicGroup, topic]
  };
}

const newMedical = [
  // 运动、肌肉与骨骼：新增 12 条，最终 17 条。
  med("activity-types", GROUP.movement, "身体活动", "有氧、肌力和平衡训练解决的是不同问题", "有氧活动主要训练心肺耐力，肌力训练帮助维持肌肉与日常功能，平衡活动则减少失去稳定的机会。只做其中一种，不能完全替代另外两种。", "按自身能力把步行或骑行、每周肌力练习和平衡动作组合起来，并从可持续的小剂量开始。", "慢性病、近期手术、胸痛、晕厥或明显活动受限者应先获得专业建议；运动中出现危险症状要停止并求助。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/physical-activity", "general", ["运动结构", "功能"]),
  med("talk-test", GROUP.movement, "运动强度", "说话测试能粗略帮助判断活动强度", "中等强度活动时通常仍能说话但不易连续唱歌；高强度时往往只能说短句。它不需要设备，适合用来感受相对强度。", "在熟悉且安全的活动中留意呼吸和说话能力，并根据体能逐步调整，而不是直接追求他人的速度。", "说话测试不是心脏评估工具；服用影响心率药物、患心肺疾病或出现胸痛、异常气短、头晕时应停止活动并就医。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/physical-activity-basics/measuring/index.html", "caution", ["运动强度", "自我观察"]),
  med("start-small", GROUP.movement, "行为改变", "从很少开始，也能建立活动习惯", "身体活动收益并不要求第一天就达到完整目标。对久未活动的人而言，短时间、低门槛和固定触发点更容易形成连续性，再逐渐增加时长或强度。", "选择今天最容易完成的一段活动，例如饭后走十分钟，并连续记录一周实际完成情况。", "疼痛明显加重、关节红肿、晕厥或呼吸困难不是“必须坚持”的信号；特殊疾病或孕产期活动需个体化建议。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/physical-activity/php/about/index.html", "general", ["习惯", "渐进"]),
  med("balance-practice", GROUP.movement, "平衡能力", "平衡能力需要练习，不只是天生稳定", "随着年龄、疾病、药物或活动减少，平衡可能下降。规律练习站立控制和下肢力量，能帮助维持转身、上下台阶等实际功能。", "在稳固支撑物旁练习安全的重心转移或脚跟脚尖行走，并清理家中绊倒物。", "近期跌倒、反复头晕、单侧无力或无法安全站立者不要独自练习，应先评估原因并接受指导。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/falls/about/index.html", "caution", ["平衡", "防跌"]),
  med("doms", GROUP.movement, "运动恢复", "延迟性肌肉酸痛与急性损伤不是一回事", "新的或更强的活动后，肌肉酸痛可在数小时后出现并逐渐缓解；突然锐痛、明显肿胀、关节不稳或功能快速下降更像需要评估的损伤。", "新训练先减少总量，给同一肌群恢复时间，并记录疼痛出现时点和是否影响日常功能。", "无法负重、肢体变形、持续剧痛、大片肿胀，或剧烈运动后出现深色尿和明显无力，应尽快就医。", "美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/sportsinjuries.html", "caution", ["恢复", "损伤识别"]),
  med("joint-friendly", GROUP.movement, "关节健康", "有关节炎并不等于必须避免所有运动", "适合能力的低冲击有氧、肌力和活动度练习可帮助维持关节周围肌肉和日常功能。关键是选择可耐受方式并调整负荷，而不是完全不动。", "从平地步行、水中活动或轻阻力练习中选择一种，比较活动前后疼痛和功能变化。", "急性红肿热痛、发热、关节锁住或活动后症状持续明显恶化需评估；确诊关节病应遵循个体计划。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/arthritis/prevention/index.html", "caution", ["关节", "活动适配"]),
  med("recovery-days", GROUP.movement, "运动恢复", "恢复是训练的一部分，不是偷懒", "肌肉、肌腱和神经系统需要时间适应负荷。连续堆叠同一种高强度刺激，可能让技术下降、疲劳累积和损伤风险增加。", "在较重训练之间安排轻松活动或不同肌群训练，同时保证睡眠、饮食和逐步增加负荷。", "持续疲劳、睡眠显著恶化、静息时也疼痛或运动表现长期下降，应减少负荷并寻找专业评估。", "美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/ency/patientinstructions/000807.htm", "general", ["恢复", "负荷管理"]),
  med("desk-ergonomics", GROUP.movement, "职业健康", "人体工学设置不能抵消整天不动", "合适的椅桌和屏幕位置能减少局部不适，但再理想的姿势也不宜长时间固定。姿势变化、任务轮换和短暂活动同样重要。", "把常用物品放在无需扭转的位置，并用日程或任务节点提醒自己定期改变姿势和走动。", "手臂持续麻木无力、夜间痛醒、外伤后颈背痛或大小便控制改变需要医疗评估。", "美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/ergonomics/about/index.html", "general", ["工作", "人体工学"]),
  med("bone-loading", GROUP.movement, "骨骼健康", "骨骼会对负重刺激作出适应", "步行、爬楼、跳跃和阻力训练等让骨骼承受适当机械负荷；游泳和骑行有心肺价值，但对骨骼负重刺激不同。", "在安全范围内把负重活动与肌力、平衡练习结合，而不是只依赖一种运动。", "已有骨质疏松、脆性骨折、严重平衡问题或长期用激素者需要专业设计，避免高冲击和危险扭转。", "美国国家关节炎、肌肉骨骼和皮肤病研究所（NIAMS）", "https://www.niams.nih.gov/health-topics/exercise-your-bone-health", "caution", ["骨骼", "负重"]),
  med("muscle-function", GROUP.movement, "肌力", "肌力关系到起身、提物和稳定，而不只是外观", "足够的肌力帮助完成从椅子站起、搬运日用品和在失衡时恢复等任务。随着年龄增长，维持功能比单纯追求围度更有现实意义。", "选择覆盖主要肌群的动作，从能保持稳定技术的阻力开始，逐步增加次数或负荷。", "不应憋气硬撑；近期心血管事件、未控制血压、疝气或术后恢复期应先确认安全范围。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/physical-activity/php/about/index.html", "caution", ["肌力", "日常功能"]),
  med("flexibility-limits", GROUP.movement, "柔韧性", "拉伸的目标是活动范围，不是越痛越有效", "温和拉伸可以维持或改善活动范围，但疼痛并不是有效的必要条件。强行压到极限可能刺激肌肉、肌腱或关节。", "身体稍微热起来后缓慢进入可控范围，保持正常呼吸，不弹震也不与别人比较幅度。", "急性损伤、关节不稳、明显麻木或锐痛时不要强拉；长期活动受限应确认原因。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/live-well/exercise/flexibility-exercises/", "general", ["柔韧性", "安全"]),
  med("pacing-pain", GROUP.movement, "疼痛管理", "活动节奏能减少“做太多—躺很久”的循环", "慢性疼痛者若在好一点时一次做完所有事，随后可能因症状加重而长时间停止。把任务拆小、交替轻重活动，有助于维持更稳定的功能。", "记录一项活动在症状明显上升前可持续多久，再把任务分成略短的段落并安排计划性休息。", "新出现的进行性无力、会阴麻木、发热、体重下降或创伤后剧痛不应归为普通慢性疼痛。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/live-well/pain/ways-to-manage-chronic-pain/", "caution", ["慢性疼痛", "节奏"]),

  // 睡眠与昼夜节律：新增 13 条，最终 16 条。
  med("morning-light", GROUP.sleep, "昼夜节律", "早晨光线是生物钟的重要时间线索", "眼睛接收到的明暗变化会帮助大脑调整清醒与睡眠时机。白天尤其早晨接触自然光、夜间减少强光，有助于让节律信号更清楚。", "起床后在安全条件下到户外或明亮窗边活动，并让晚间照明逐渐变暗。", "光疗并非人人适用；双相障碍、眼病或使用光敏药物者采用强光设备前应咨询专业人员。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits", "general", ["光线", "生物钟"]),
  med("caffeine-timing", GROUP.sleep, "睡眠习惯", "咖啡因的影响可能延续到你准备睡觉时", "咖啡因通过削弱睡意信号提高警觉，不同人的代谢速度差异很大。午后或晚间摄入可能延迟入睡或减少深睡，即使本人不总能察觉。", "记录一周咖啡、茶、能量饮料和部分药品的时间，尝试把最后一次摄入前移并比较睡眠。", "孕产期、心律问题、焦虑或正在用药者对咖啡因的适宜量不同；不要用高剂量咖啡因长期掩盖过度嗜睡。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits", "general", ["咖啡因", "睡眠习惯"]),
  med("alcohol-sleep", GROUP.sleep, "睡眠习惯", "酒精让人犯困，不等于改善睡眠", "酒精可能缩短入睡时间，却会扰乱后半夜睡眠结构、增加觉醒，并可能加重打鼾和睡眠呼吸问题。", "不要把饮酒当作助眠方法；若发现睡前饮酒与夜醒相关，记录并寻求更安全的睡眠策略。", "酒精依赖者突然停酒可能危险；出现震颤、幻觉、抽搐或严重自主神经症状应紧急就医。", "美国国家酒精滥用与酒精中毒研究所（NIAAA）", "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/hangovers", "caution", ["酒精", "睡眠结构"]),
  med("nap-strategy", GROUP.sleep, "午睡", "午睡的时长和时机会影响夜间睡意", "短暂午睡可暂时提升警觉，但傍晚或过长睡眠可能削弱夜间睡眠压力。是否适合午睡取决于夜间睡眠、工作安排和个人反应。", "若夜间难入睡，尝试把午睡提前并缩短，连续观察几天而不是只看一次感受。", "无法控制的白天入睡、驾驶时犯困或充足睡眠后仍极度嗜睡，可能需要评估睡眠障碍或其他疾病。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits", "general", ["午睡", "睡眠压力"]),
  med("bed-association", GROUP.sleep, "失眠", "长期清醒地躺在床上，可能让床与焦虑建立联系", "当床反复成为工作、刷手机和担心睡不着的场所，大脑更难把它视为睡眠提示。失眠行为治疗会重建床与睡意之间的联系。", "困倦时再上床；长时间清醒可暂时到昏暗安全处做安静活动，困了再返回。", "这不是要求严重行动不便者反复起床；持续失眠、躁狂迹象、抑郁或药物影响需专业评估。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/insomnia/treatment", "caution", ["失眠", "行为治疗"]),
  med("sleep-diary", GROUP.sleep, "健康记录", "睡眠日记比单晚印象更能显示模式", "人们常高估或低估某一晚的睡眠。连续记录上床、估计入睡、醒来、起床、午睡、咖啡因和困倦程度，更容易发现稳定关联。", "连续两周用简单表格记录，不必追求分钟级精确，再把模式带给专业人员讨论。", "消费级手环不能诊断睡眠疾病；数据让你更焦虑时应减少查看，危险嗜睡或呼吸暂停仍要就医。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/resources/sleep-diary", "general", ["记录", "模式"]),
  med("drowsy-driving", GROUP.sleep, "道路安全", "困倦驾驶可能在你意识到之前削弱反应", "睡眠不足会降低注意、判断和反应速度；开窗、调大音乐或靠意志坚持不能可靠恢复警觉。微睡眠可能只有几秒，却足以造成事故。", "感到眼皮沉、频繁打哈欠、错过路口或记不清刚驶过路段时，尽快到安全地点停车休息并更换驾驶者。", "不要在困倦时继续驾驶；酒精、镇静药物和睡眠不足叠加会更危险，无法安全停车时联系道路救援或当地急救。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/niosh/motor-vehicle/driver-fatigue/index.html", "urgent", ["驾驶", "困倦"]),
  med("shift-work", GROUP.sleep, "轮班工作", "夜班让工作时间与生物钟发生冲突", "夜间工作和白天睡眠会同时受到光线、家庭节奏和生物钟影响。长期轮班并不是简单靠意志就能完全适应。", "尽量固定班次模式，回家路上控制强光暴露，睡眠空间遮光降噪，并与家人约定不被打扰时段。", "持续失眠、工作中不可控入睡或驾驶风险需要职业健康或睡眠专业评估；不要自行长期使用镇静药。", "美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod9/05.html", "caution", ["轮班", "职业健康"]),
  med("teen-sleep", GROUP.sleep, "青少年健康", "青春期的生物钟常自然后移", "青少年较晚产生睡意并不总是懒惰，同时仍需要充足睡眠。过早起床、作业、社交和屏幕使用可能共同压缩睡眠。", "固定起床时间，早晨接触光线，晚间提前收尾，并把持续白天困倦与家人或学校讨论。", "严重情绪变化、自伤想法、鼾声伴停呼吸或上课时不可控入睡需专业评估。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/physical-activity-education/staying-healthy/sleep.html", "caution", ["青少年", "生物钟"]),
  med("older-sleep", GROUP.sleep, "老年健康", "年龄增长不意味着只需要很少睡眠", "老年人可能更早入睡醒来、夜间觉醒增多或白天小睡，但明显睡眠不足和过度困倦仍会影响功能。疾病、疼痛和药物常比年龄本身更重要。", "记录睡眠变化并复核晚间液体、疼痛、活动、光线和药物时间，而不是把所有问题归为年纪。", "突然嗜睡、夜间呼吸暂停、频繁跌倒或新出现意识混乱需就医；不要自行加用助眠药。", "美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/sleep/good-nights-sleep", "caution", ["老年", "睡眠变化"]),
  med("restless-legs", GROUP.sleep, "不宁腿", "夜间腿部不适不一定只是肌肉疲劳", "不宁腿常表现为休息时难以描述的不适和强烈活动冲动，移动后暂时缓解，夜间更明显，并可能破坏睡眠。", "记录发生时间、咖啡因、药物和睡眠影响，持续困扰时向医生说明“休息时加重、活动后缓解”的模式。", "单侧肿痛发热、突然气短或外伤后疼痛不是典型不宁腿，应及时排除血栓或损伤；不要自行大剂量补铁。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/restless-legs-syndrome/", "caution", ["不宁腿", "睡眠"]),
  med("jet-lag", GROUP.sleep, "旅行健康", "时差反应来自生物钟与目的地时间不一致", "跨越多个时区后，睡意、食欲和警觉仍按原来的时间运行。向东和向西旅行的适应难度可能不同，个体差异也很大。", "出发前逐步移动作息，到达后按目的地白天接触光线、按当地时间进食和睡觉，并避免困倦驾驶。", "褪黑素和睡眠药并非人人适用，会与疾病和药物相互作用；飞行后单侧腿肿痛或突发气短应急诊评估。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/jet-lag", "caution", ["时差", "旅行"]),
  med("screen-wind-down", GROUP.sleep, "睡前习惯", "屏幕影响睡眠不只因为蓝光", "明亮光线会影响节律，内容带来的兴奋、工作延续和时间失控同样可能推迟入睡。把问题简化成滤蓝光，可能忽略真正的行为触发。", "睡前设置固定收尾点，降低亮度，把工作和高刺激内容移出床，并观察哪种改变最有效。", "若必须夜间使用设备工作，应优先保证总体睡眠机会；长期失眠不能只靠屏幕设置解决。", "美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits", "general", ["屏幕", "睡前习惯"]),

  // 营养、消化与口腔：新增 7 条，最终 17 条。
  med("whole-fruit", GROUP.nutrition, "营养", "完整水果与果汁带来的饱腹和糖暴露不同", "榨汁会减少或破坏部分食物结构，也更容易在短时间摄入多份水果。即使是百分百果汁，也不能完全替代完整水果。", "日常优先选择可咀嚼的完整水果，把果汁视为有限的一部分而非无限量饮品。", "糖尿病、肾病、吞咽困难或特殊饮食者需要个体建议；不要因“天然”忽略总摄入。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/healthy-diet", "general", ["水果", "食物结构"]),
  med("serving-label", GROUP.nutrition, "食品标签", "营养标签上的一份不一定等于你吃的一包", "包装标出的能量、糖、钠和脂肪常按每份计算，而一个容器可能包含多份。只看正面宣传词，容易低估实际摄入。", "先看每容器份数，再把每份数值乘以实际食用份数，并比较同类产品。", "标签不能判断个人是否适合某食物；食物过敏、肾病、代谢病或进食障碍者应遵循个体方案。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label", "general", ["食品标签", "数量"]),
  med("gluten-free", GROUP.nutrition, "消化健康", "无麸质饮食不是面向所有人的通用健康升级", "乳糜泻患者需要严格避免麸质，但一般人自行长期排除小麦、黑麦和大麦，可能增加饮食成本并减少纤维和某些营养来源。", "持续腹泻、贫血、体重下降或家族史者先接受正规评估，再决定是否需要无麸质饮食。", "检测前自行停吃麸质可能影响结果；对小麦过敏与乳糜泻处理不同，严重过敏反应应急救。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/digestive-diseases/celiac-disease/eating-diet-nutrition", "caution", ["麸质", "乳糜泻"]),
  med("lactose-tolerance", GROUP.nutrition, "消化健康", "乳糖不耐受不一定要求完全放弃所有乳制品", "不同人可耐受的乳糖量不同，酸奶、硬奶酪和与正餐同吃的少量乳制品可能反应不同。完全排除还需考虑钙和维生素D来源。", "记录具体食物、份量和症状，逐步寻找个人可耐受范围，并安排替代营养来源。", "血便、持续体重下降、夜间腹泻或严重腹痛不能只归因于乳糖；婴幼儿饮食调整应由专业人员指导。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance/eating-diet-nutrition", "caution", ["乳糖", "个体差异"]),
  med("reflux-habits", GROUP.nutrition, "消化健康", "反流管理要找个人触发，而不是永久禁掉长名单", "进食过饱、餐后很快躺下、体重和某些食物可影响胃食管反流，但每个人触发因素不同。过度限制可能让饮食单调。", "记录餐量、进食时间、姿势和症状，优先调整有重复关联的因素，睡前留出消化时间。", "吞咽困难、呕血、黑便、贫血、持续呕吐或非预期体重下降需要就医；胸痛不能自行认定为反流。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition", "caution", ["反流", "饮食记录"]),
  med("food-date-labels", GROUP.nutrition, "食品安全", "日期标签不总是等同于食物在那天突然变危险", "不同地区的最佳赏味期、销售期和安全期限含义不同。感官判断也不能发现所有病原体，因此需要同时理解标签类型和冷藏条件。", "按当地标签说明储存，开封后记录日期，易腐食物离开安全温度过久时不要只靠闻味判断。", "孕妇、幼儿、老年人和免疫低下者对食源性疾病风险更高；罐头鼓胀、泄漏或食物保存失控时应丢弃。", "美国农业部食品安全检验局（USDA FSIS）", "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/food-product-dating", "general", ["日期标签", "食品安全"]),
  med("gum-bleeding", GROUP.nutrition, "口腔健康", "刷牙出血不是应该长期忽略的正常现象", "牙龈出血常与菌斑和牙龈炎有关，也可能受刷牙方式、药物或全身状况影响。因为怕出血而完全避开该处，往往会让菌斑继续积累。", "使用软毛牙刷轻柔清洁牙龈边缘和牙缝，持续出血时预约牙科检查并说明用药。", "大量自发出血、面部肿胀、发热、吞咽或呼吸困难需及时就医；服抗凝药者不要自行停药。", "美国国家牙科与颅面研究所（NIDCR）", "https://www.nidcr.nih.gov/health-info/gum-disease", "caution", ["牙龈", "口腔清洁"]),

  // 心血管、代谢与肾脏：新增 14 条，最终 17 条。
  med("home-bp-technique", GROUP.cardio, "血压", "家庭血压测量的姿势和流程会改变读数", "刚运动、吸烟、摄入咖啡因、说话、双脚悬空或袖带尺寸不合适，都可能让单次读数偏离真实水平。趋势比一次数字更有意义。", "按设备说明使用合适袖带，安静坐几分钟，背部和手臂有支撑，固定时段测量并记录。", "家庭设备不能替代诊断；极高读数伴胸痛、气短、神经症状或意识变化时联系当地急救。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/high-blood-pressure/about/index.html", "caution", ["血压", "测量"]),
  med("orthostatic", GROUP.cardio, "血压", "起身头晕可能与体位性血压下降有关", "从躺或坐突然站起时，血压调节若跟不上，可能出现头晕、视物发黑或跌倒。脱水、药物和多种疾病都可能参与。", "起身分阶段放慢动作，扶稳后再走，并记录症状与药物时间供就诊讨论。", "晕厥、胸痛、心悸、单侧无力、持续呕吐或外伤后头晕应及时评估；不要自行停降压药。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/low-blood-pressure-hypotension/", "caution", ["体位", "防跌"]),
  med("atrial-fibrillation", GROUP.cardio, "心律", "房颤可以没有明显心悸", "房颤使心房电活动紊乱，有些人只感到疲劳、气短或没有症状。它与卒中风险有关，不能只靠自己摸脉确诊。", "若设备反复提示心律不齐或脉搏长期不规则，记录时间和症状并接受心电图评估。", "胸痛、晕厥、严重气短或中风征象需要急救；不要自行服用或停用抗凝药。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/atrial-fibrillation/", "caution", ["心律", "卒中风险"]),
  med("heart-failure-changes", GROUP.cardio, "心力衰竭", "体重和呼吸变化可比单次水肿更早提示液体潴留", "心力衰竭患者的体液变化可能表现为短期体重增加、脚踝肿、夜间呼吸困难或活动耐力下降。连续趋势便于按既定计划及早联系团队。", "按医疗团队建议在相似条件下记录体重、肿胀和呼吸变化，并清楚保存联系阈值。", "突然严重气短、粉红泡沫痰、胸痛、意识改变或无法平卧应紧急求助；不要自行加倍利尿剂。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/heart-failure/", "urgent", ["心力衰竭", "体液"]),
  med("dvt-signs", GROUP.cardio, "血栓", "单侧腿肿痛比双腿对称肿胀更需要警惕血栓", "深静脉血栓常发生在一侧腿部，可有肿胀、疼痛、发热或颜色变化；久坐、手术、妊娠和既往血栓会增加风险。", "出现新的单侧症状时减少延误，记录开始时间并尽快接受医疗评估。", "伴突发气短、胸痛、咳血、心跳很快或晕厥可能提示肺栓塞，应立即联系当地急救；不要按摩可疑患肢。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/deep-vein-thrombosis-dvt/", "urgent", ["血栓", "久坐"]),
  med("kidney-silent", GROUP.cardio, "肾脏健康", "慢性肾病早期常没有明显感觉", "肾功能可在没有疼痛的情况下逐渐下降。糖尿病、高血压、心血管病和家族史人群，通常需要通过血液和尿液检查了解风险。", "有风险因素时询问是否需要估算肾小球滤过率和尿白蛋白检查，并控制已知危险因素。", "泡沫尿本身不能诊断肾病；尿量骤减、明显水肿、呼吸困难或意识变化需尽快就医。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd", "caution", ["肾脏", "无症状疾病"]),
  med("albuminuria", GROUP.cardio, "肾脏检查", "尿白蛋白能提供不同于血肌酐的信息", "受损的肾小球可能让白蛋白漏入尿中，而血液肾功能指标尚未明显异常。感染、剧烈运动等也会暂时影响结果，所以异常常需复查。", "看检验单时同时关注尿白蛋白与血液肾功能，并询问是否需要在稳定状态下重复检测。", "一次异常不能自行诊断慢性肾病；肉眼血尿、腰痛伴发热、尿量骤减或妊娠期高血压需及时就医。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/tests-diagnosis", "caution", ["检验", "肾脏"]),
  med("a1c-window", GROUP.cardio, "糖尿病检查", "糖化血红蛋白反映的是一段时间的平均血糖", "A1C 利用红细胞中的糖化血红蛋白估计过去数月平均水平，不等于此刻血糖。贫血、血红蛋白变异、妊娠和肾病等可影响解释。", "将 A1C 与症状、家庭血糖和其他检查一起讨论，不用单个数字独立调整药物。", "明显高血糖伴呕吐、腹痛、深快呼吸或意识变化需急诊；结果与实际情况不符时应告知医生相关疾病。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test", "caution", ["A1C", "检验解释"]),
  med("prediabetes", GROUP.cardio, "代谢健康", "糖尿病前期是风险状态，不是注定会发展", "血糖高于正常范围但未达到糖尿病诊断水平时，未来风险增加。体重、活动、睡眠、药物和遗传等因素共同作用，生活方式支持可以改变风险轨迹。", "确认检测方法和复查计划，选择一个可持续的饮食或活动改变，而不是采取极端短期方案。", "不要自行停用影响血糖的药物；口渴多尿、体重下降或视物模糊需尽快评估是否已出现糖尿病。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/diabetes/awareness-campaigns/prediabetes-awareness-campaign.html", "general", ["风险", "预防"]),
  med("hypoglycemia", GROUP.cardio, "低血糖", "低血糖可能先表现为出汗、发抖或行为变化", "使用胰岛素或某些降糖药的人更容易低血糖。症状可包括饥饿、心慌、出汗、注意困难，严重时会抽搐或失去意识。", "与医疗团队制定个人低血糖处理计划，随身携带计划允许的快速糖源，并让亲近的人知道如何协助。", "意识不清者不要喂食饮水；抽搐或无法吞咽时按既定胰高血糖素计划并立即联系急救。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia", "urgent", ["低血糖", "急救计划"]),
  med("thyroid-symptoms", GROUP.cardio, "甲状腺", "甲状腺症状常与其他问题重叠", "疲劳、体重变化、怕冷怕热、心率和情绪变化都可能出现在甲状腺疾病中，也可能来自睡眠、贫血、药物或其他原因。症状不能替代检测。", "持续变化时记录时间线、药物和家族史，由专业人员判断是否需要甲状腺功能检查。", "明显心悸伴胸痛、意识改变、严重嗜睡或高热需紧急评估；不要自行补充高剂量碘。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/endocrine-diseases", "caution", ["甲状腺", "症状重叠"]),
  med("fatty-liver", GROUP.cardio, "肝脏与代谢", "脂肪肝可能在没有症状时被发现", "代谢相关脂肪性肝病常与胰岛素抵抗、体重、血脂和血压因素共存。肝酶正常也不能完全排除，单纯影像也不能判断全部严重程度。", "若检查提示脂肪肝，讨论代谢风险、酒精、药物和是否需要进一步评估，采用渐进而可持续的改变。", "黄疸、腹水、呕血、黑便或意识变化需急诊；不要自行使用号称“排毒护肝”的产品。", "美国国家糖尿病、消化与肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/liver-disease/nafld-nash", "caution", ["肝脏", "代谢"]),
  med("familial-cholesterol", GROUP.cardio, "血脂", "年轻时胆固醇很高也可能与遗传有关", "家族性高胆固醇血症使低密度脂蛋白从出生起就偏高，早发心血管病家族史是重要线索。生活方式有价值，但往往不足以单独控制。", "整理近亲的早发心脏病和血脂史，异常明显时询问是否需要进一步评估家族风险。", "不要因为年轻或无症状忽略极高血脂，也不要自行停用降脂药；胸痛或中风征象应急救。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/heart-disease-family-history/about/index.html", "caution", ["遗传", "血脂"]),
  med("waist-risk", GROUP.cardio, "代谢风险", "腰围提供的是风险线索，不是个人价值判断", "腹部脂肪与代谢风险相关，但腰围阈值会随人群和指南而异。单个身体尺寸不能概括健康，也不应用来污名化个人。", "把腰围与血压、血脂、血糖、活动和家族史一起看，关注可改变的行为和长期趋势。", "不应以腰围自行诊断或采用极端减重；非预期快速体重变化、进食障碍迹象或妊娠期变化需专业支持。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight", "general", ["体重污名", "代谢风险"]),

  // 感染预防与免疫：新增 13 条，最终 17 条。
  med("vaccine-series", GROUP.infection, "疫苗", "有些疫苗需要多剂次才能建立和维持保护", "首剂可能启动免疫反应，后续剂次用于加强或延长保护。不同疫苗、年龄、健康状态和地区计划不同，漏一剂不一定要从头开始。", "查看当地免疫记录和官方日程，漏种时向接种机构询问补种方案。", "不要自行按网络日程混打或重复接种；严重过敏史、妊娠和免疫抑制需要个体评估，接种后呼吸困难应急救。", "世界卫生组织（WHO）", "https://www.who.int/news-room/questions-and-answers/item/vaccines-and-immunization-what-is-vaccination", "general", ["疫苗", "免疫记忆"]),
  med("vaccine-reactions", GROUP.infection, "疫苗", "接种后短暂不适不等于感染了目标疾病", "注射部位疼痛、低热或疲劳常来自免疫反应，通常短暂。没有这些反应也不意味着疫苗无效，反应强弱不能直接代表保护程度。", "接种前了解常见反应和当地随访渠道，接种后按官方说明休息、补液并观察。", "持续高热、呼吸困难、面舌肿胀、广泛皮疹或意识改变需紧急评估；个别不良事件不能自行证明因果。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/vaccine-safety/about/index.html", "caution", ["疫苗安全", "免疫反应"]),
  med("ventilation", GROUP.infection, "呼吸道感染", "通风能减少室内积聚的呼吸道颗粒", "感染者呼吸、说话和咳嗽可释放含病原体的颗粒，拥挤、通风差的室内更容易积聚。开窗、机械通风和过滤可与其他措施组合使用。", "在天气和安全允许时增加新风，维护通风系统，并把高风险聚会移到更宽敞或室外空间。", "通风不能替代生病时居家、疫苗或必要的个人防护；一氧化碳和室外污染严重时不能盲目开窗。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/respiratory-viruses/prevention/air-quality.html", "general", ["通风", "呼吸道"]),
  med("respiratory-etiquette", GROUP.infection, "呼吸道感染", "咳嗽礼仪的目标是减少颗粒落到手和周围表面", "用纸巾或肘部遮挡咳嗽喷嚏、及时处理纸巾并清洁双手，可减少把分泌物带到门把手和他人手上。", "在伸手可及处准备纸巾，咳嗽后清洁双手；有症状时与他人保持距离并改善通风。", "明显呼吸困难、口唇发青、胸痛或意识变化需要急救；礼仪措施不能替代必要的医疗评估。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/hygiene/about/coughing-and-sneezing.html", "general", ["咳嗽礼仪", "手卫生"]),
  med("sanitizer-limits", GROUP.infection, "手卫生", "免洗手消毒剂不是所有场景下洗手的等价替代", "含足够酒精的手消毒剂可在许多场景减少微生物，但手明显脏污、油腻或接触某些病原体和化学物后，肥皂流水更合适。", "无法洗手时按标签取足量消毒剂揉搓至干；进食前和如厕后优先寻找肥皂流水。", "手消毒剂不可饮用，要远离儿童和火源；误食、眼部暴露或严重皮肤反应应联系当地毒物或急救服务。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/clean-hands/about/hand-sanitizer.html", "caution", ["手消毒", "适用边界"]),
  med("influenza-vaccine", GROUP.infection, "流感", "流感疫苗会随季节更新，因为病毒也在变化", "流感病毒持续演化，疫苗组分会依据监测结果调整。保护效果因季节和人群而异，但可降低重症和并发症风险。", "每个流感季按当地建议确认接种时间，尤其是高风险本人及其照护者。", "疫苗不能治疗已经发生的流感；呼吸困难、胸痛、意识变化或高风险人群迅速恶化需及时就医。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/influenza-(seasonal)", "general", ["流感", "季节性疫苗"]),
  med("measles-contagious", GROUP.infection, "麻疹", "麻疹的传染性很强，暴露后不能只等皮疹", "麻疹病毒可通过空气传播，感染者在典型皮疹出现前就可能具有传染性。未免疫人群中，一例病例可迅速造成聚集传播。", "确认麻疹疫苗记录；疑似暴露后先电话联系医疗或公共卫生机构，按指引避免直接进入公共候诊区。", "高热、呼吸困难、意识改变、抽搐或婴幼儿快速恶化需紧急评估；不要自行用维生素A替代医疗处理。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/measles", "urgent", ["麻疹", "暴露管理"]),
  med("hpv-vaccine", GROUP.infection, "HPV", "HPV 疫苗的主要价值是预防未来感染及相关癌症", "人乳头瘤病毒很常见，持续感染某些高危型别可导致宫颈癌和其他癌症。疫苗在暴露前效果最好，但适用年龄和补种范围依当地政策。", "查看当地接种计划，并继续参加适龄筛查，因为疫苗不覆盖所有致癌型别。", "疫苗不能清除已经存在的感染或替代异常结果随访；接种后严重过敏反应应立即急救。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/cervical-cancer", "general", ["HPV", "癌症预防"]),
  med("hepatitis-b-prevention", GROUP.infection, "肝炎", "乙肝可以通过疫苗和围产期措施预防", "乙型肝炎病毒可经血液、性接触和分娩传播，慢性感染会增加肝硬化和肝癌风险。新生儿及时接种及必要的母婴阻断非常重要。", "确认疫苗记录；孕期按当地方案筛查乙肝，并让医疗团队提前制定新生儿预防计划。", "黄疸、意识变化、严重呕吐或出血倾向需尽快就医；不要因感染状态受到污名或自行停药。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b", "caution", ["乙肝", "母婴预防"]),
  med("rabies-exposure", GROUP.infection, "狂犬病", "疑似狂犬病暴露后，伤口处理和及时接种不能等待症状", "狂犬病一旦出现临床症状几乎总是致命，但暴露后及时彻底清洗伤口并接受规范预防可以阻止发病。抓伤和唾液接触黏膜也可能构成风险。", "立即用大量肥皂水彻底冲洗伤口，并尽快联系当地狂犬病暴露处置机构评估疫苗和免疫球蛋白。", "不要等待动物或人出现症状，也不要自行缝合、仅涂草药或因伤口小而忽略；出现神经症状应紧急就医。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/rabies", "urgent", ["狂犬病", "暴露后预防"]),
  med("mosquito-prevention", GROUP.infection, "媒介传播", "防蚊不仅是避免发痒，也是在减少多种感染风险", "不同蚊种在不同时间活动，可传播登革热、疟疾、寨卡等疾病。驱避剂、衣物、纱窗和清除积水需要组合使用。", "按标签使用经过监管的驱避剂，覆盖裸露皮肤和衣物，并检查住处纱窗与积水容器。", "婴幼儿、孕妇和特定地区用药需遵循当地建议；旅行后发热、出血、严重头痛或意识变化应及时告知旅行史。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/mosquitoes/prevention/index.html", "caution", ["蚊媒", "旅行"]),
  med("tick-check", GROUP.infection, "媒介传播", "蜱虫暴露后尽早检查身体，有助于及时发现附着", "蜱常藏在腋下、腹股沟、头皮和膝后等不易看到部位。不同地区传播的病原体和附着时间相关风险不同。", "户外回来后检查身体、衣物和宠物；发现附着蜱用尖头镊子贴近皮肤平稳向上拔出并记录日期。", "不要用火、油或挤压方式刺激蜱；随后出现扩散皮疹、发热、面瘫、剧烈头痛或关节症状应就医并说明暴露。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/ticks/after-a-tick-bite/index.html", "caution", ["蜱虫", "户外"]),
  med("antibiotic-instructions", GROUP.infection, "抗生素", "抗生素应按本次处方使用，不能把剩药留给下次", "不同感染需要不同药物、剂量和疗程。提前停用、加倍补服、分享或使用旧处方，可能导致无效、伤害和耐药选择压力。", "按标签和医嘱完成本次用药，漏服或出现副作用时联系药师或开药者，不自行改变方案。", "呼吸困难、面舌肿胀或严重皮疹需急救；严重水样或血性腹泻需就医，不能把所有不适都当作普通副作用。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/antibiotic-use/about/index.html", "caution", ["抗生素", "处方安全"]),

  // 心理、脑健康与成瘾：新增 9 条，最终 17 条。
  med("panic-attack", GROUP.mental, "焦虑", "惊恐发作的感觉很危险，但症状仍需区分其他急症", "惊恐发作可突然出现心悸、气短、胸闷、发抖和强烈濒死感，通常会达到高峰后缓解。首次发作或表现异常时，不能自行排除心脏、呼吸或代谢问题。", "在安全地点放慢呼吸、观察症状时间线，并在反复发作或开始回避生活时寻求循证治疗。", "首次严重胸痛、晕厥、单侧无力、持续呼吸困难或自伤想法应立即求助，不能都归因于焦虑。", "美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/panic-disorder-when-fear-overwhelms", "caution", ["惊恐", "鉴别"]),
  med("ptsd", GROUP.mental, "创伤后应激", "创伤后的强烈反应不代表个人软弱", "噩梦、回避、警觉过高和反复侵入记忆可能在创伤后出现；许多人会逐渐恢复，但症状持续并影响生活时可能符合创伤后应激障碍。", "建立安全和稳定作息，减少强迫复述创伤的压力，并向受过创伤治疗训练的专业人员求助。", "持续无法保证安全、自伤想法、严重解离或使用大量酒精药物应紧急求助；不要强迫当事人详细讲述。", "美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/post-traumatic-stress-disorder-ptsd", "caution", ["创伤", "恢复"]),
  med("bipolar", GROUP.mental, "双相障碍", "双相障碍不等于普通的情绪起伏", "躁狂或轻躁狂涉及持续的情绪、精力、睡眠需求、言语和行为改变，可能伴冲动和功能受损；抑郁发作则有另一组持续症状。", "记录睡眠、精力、冲动行为和用药，出现明显周期变化时接受正规评估。", "数日几乎不睡仍异常兴奋、危险行为、精神病性症状或自伤想法需紧急帮助；不要自行停用情绪稳定药。", "美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/bipolar-disorder", "urgent", ["双相", "情绪周期"]),
  med("psychosis-early", GROUP.mental, "精神健康", "现实感改变越早被认真对待，越有机会减少长期影响", "幻听、妄想、思维紊乱、社交退缩和功能快速下降可能出现在精神病性发作前后，也可能与物质、药物或身体疾病有关。", "平静倾听，不与体验激烈争辩，记录变化并尽快连接精神卫生和身体评估。", "当事人有伤害自己或他人风险、无法照顾基本需要、严重激越或意识改变时联系当地急救服务。", "美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/understanding-psychosis", "urgent", ["精神病性症状", "早期支持"]),
  med("grief", GROUP.mental, "哀伤", "哀伤没有人人相同的固定阶段顺序", "失去重要的人或生活角色后，悲伤、麻木、愤怒和短暂缓解可能交替出现。把阶段模型当作必须依次完成的任务，反而会给人增加压力。", "允许反应有波动，维持基本睡眠和饮食，并接受具体帮助；功能长期受损时寻求支持。", "持续自责绝望、自伤想法、无法照顾自己或使用物质逃避到危险程度时，应尽快获得专业和危机支持。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/grief-bereavement-loss/", "caution", ["哀伤", "个体差异"]),
  med("burnout", GROUP.mental, "职业健康", "职业倦怠是工作情境现象，不应包揽所有疲惫", "职业倦怠与长期未被管理的工作压力相关，表现为耗竭、对工作疏离和效能下降。贫血、睡眠障碍、抑郁等也会疲惫，需要区分。", "记录哪些工作条件持续消耗精力，与管理者讨论工作量、控制感、休息和支持，而不只要求个人更坚强。", "若有自伤或自杀想法，或无法保证安全，应立即联系当地急救或危机服务；胸痛或晕厥也应立即急救，其他持续抑郁或基本生活受损应尽快求助。", "世界卫生组织（WHO）", "https://www.who.int/standards/classifications/frequently-asked-questions/burn-out-an-occupational-phenomenon", "caution", ["工作压力", "组织条件"]),
  med("gambling-harm", GROUP.mental, "行为成瘾", "赌博伤害可以在债务失控之前已经发生", "赌博问题会影响时间、睡眠、关系、工作和情绪，追损和隐瞒常使损失扩大。产品设计和环境也会影响风险，不只是意志薄弱。", "设置无法轻易绕过的资金和时间限制，向可信任者公开情况，并使用当地自我排除和专业支持。", "因债务绝望、自伤想法、家庭暴力或非法借贷威胁而无法保证安全时，应立即联系危机和急救支持。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/gambling", "caution", ["赌博", "公共健康"]),
  med("nicotine-withdrawal", GROUP.mental, "戒烟", "戒烟后的烦躁和注意困难通常是戒断，不是戒烟有害", "尼古丁戒断可带来强烈渴求、烦躁、焦虑、睡眠和注意变化，往往在早期更明显并逐渐减轻。提前计划能降低复吸风险。", "识别高风险场景，准备短暂替代活动，并咨询正规戒烟服务和适合自己的药物支持。", "抑郁显著加重、自伤想法、胸痛或严重药物反应需及时求助；孕产期和慢性病用药需专业建议。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/tobacco/campaign/tips/quit-smoking/", "caution", ["尼古丁", "戒断"]),
  med("alcohol-medicines", GROUP.mental, "酒精", "酒精会改变多种药物的镇静、出血和肝脏风险", "酒精可能与助眠药、抗焦虑药、止痛药、抗凝药和一些慢病药相互作用，同一药物在不同人身上的风险也不同。", "开始新药时主动询问能否饮酒，并把非处方药和保健品一起告诉药师。", "意识变慢、呼吸抑制、呕血、黑便或服药后异常嗜睡需急救；酒精依赖者不要在无支持下突然停酒。", "美国国家酒精滥用与酒精中毒研究所（NIAAA）", "https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/harmful-interactions-mixing-alcohol-with-medicines", "urgent", ["酒精", "药物相互作用"]),

  // 感官与皮肤：新增 11 条，最终 16 条。
  med("comprehensive-eye-exam", GROUP.senses, "眼健康", "一些眼病在视力明显下降前没有症状", "青光眼、糖尿病眼病和部分视网膜问题早期可能没有明显感觉。检查频率取决于年龄、疾病、家族史和既往结果。", "有糖尿病、高度近视、眼病家族史或视力变化时，询问是否需要散瞳眼底等全面检查。", "突然失明、帘幕样遮挡、眼外伤或剧烈眼痛属于急症；普通视力表不能替代完整眼科评估。", "美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/learn-about-eye-health/healthy-vision/get-dilated-eye-exam", "caution", ["眼科检查", "无症状疾病"]),
  med("retinal-detachment", GROUP.senses, "眼急症", "突然增多的飞蚊、闪光和帘幕感可能提示视网膜脱离", "玻璃体变化常见，但新出现大量飞蚊、闪光或视野缺损需要迅速排除视网膜裂孔和脱离，因为延误可能损害视力。", "记住症状开始时间和受影响眼睛，停止驾驶并立即联系眼科急诊。", "不要等待症状自行消失，也不要揉眼；近期眼外伤、手术或高度近视会增加风险。", "美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/retinal-detachment", "urgent", ["视网膜", "闪光飞蚊"]),
  med("glaucoma", GROUP.senses, "眼健康", "青光眼损伤的周边视野可能在不知不觉中丢失", "最常见类型通常进展缓慢且早期无痛。眼压是风险因素之一，但单次眼压正常也不能排除所有青光眼。", "按风险接受眼科检查，并按处方持续使用降眼压治疗，不因没有症状自行停药。", "突然剧烈眼痛、红眼、恶心和视力模糊可能是急性闭角，应立即就医。", "美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/glaucoma", "caution", ["青光眼", "视野"]),
  med("hearing-protection", GROUP.senses, "听力", "听力防护要同时考虑噪声强度、时间和佩戴方式", "耳塞或耳罩标称的降噪值只有在正确密合时才能发挥作用。极高噪声环境可能需要组合防护和缩短暴露。", "在进入噪声区前正确佩戴并做密合检查，避免为了沟通反复取下，按职业规范安排安静休息。", "爆炸声后突然听力下降、眩晕、耳痛或流液需及时就医；防护用品不能让任何噪声暴露变得无限安全。", "美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/noise/prevent/ppe.html", "caution", ["噪声", "职业防护"]),
  med("tinnitus", GROUP.senses, "听力", "耳鸣是症状，不是单一疾病", "耳鸣可与噪声暴露、听力下降、耳部问题和药物有关，安静时常更明显。对声音的焦虑和持续关注也会放大困扰。", "记录单侧或双侧、是否随脉搏、伴随听力和用药变化，并减少进一步噪声暴露。", "突然单侧听力下降、搏动性耳鸣、神经症状、眩晕或头部外伤后耳鸣需尽快评估。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/tinnitus/", "caution", ["耳鸣", "听力"]),
  med("earwax", GROUP.senses, "耳健康", "棉签可能把耳垢推得更深", "耳道通常会自行把耳垢向外移动。把棉签、发卡或其他物品伸入耳道，可能压实耳垢、损伤皮肤或鼓膜。", "只清洁外耳可见部分；持续堵塞、听力下降或助听器受影响时寻求安全清除建议。", "耳痛、流血流液、突然听力下降、既往鼓膜穿孔或耳部手术者不要自行滴液或冲洗。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/earwax-build-up/", "caution", ["耳垢", "自我护理"]),
  med("contact-lens-hygiene", GROUP.senses, "眼健康", "隐形眼镜接触自来水会增加严重角膜感染风险", "自来水和游泳水并非无菌，某些微生物可附着镜片和镜盒。戴镜睡觉、超期佩戴和重复使用护理液也会增加感染风险。", "接触镜片前洗净并擦干双手，只用规定护理液，定期更换镜盒，游泳和淋浴前摘镜。", "戴镜时眼痛、畏光、红眼、分泌物或视力下降应立即摘镜并紧急联系眼科，不要自行继续佩戴。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/contact-lenses/prevention/index.html", "urgent", ["隐形眼镜", "角膜感染"]),
  med("sunscreen-use", GROUP.senses, "皮肤健康", "防晒霜需要足量、补涂，并与遮挡措施配合", "防晒系数主要描述对晒伤相关紫外线的防护，实际效果受涂抹量、漏涂、出汗、游泳和时间影响。防晒霜不是延长暴晒的许可。", "选择广谱且适合活动的产品，出门前覆盖暴露皮肤，并按标签和出汗游泳情况补涂，同时利用衣物和阴影。", "婴儿、皮肤病或过敏者按当地建议选择；严重晒伤伴大片水疱、发热、脱水或意识变化需医疗帮助。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/understanding-over-counter-medicines/sunscreen-how-help-protect-your-skin-sun", "general", ["防晒", "紫外线"]),
  med("eczema-barrier", GROUP.senses, "皮肤健康", "湿疹护理的核心之一是修复皮肤屏障", "湿疹皮肤更容易失水和受刺激，抓挠又会加重炎症。规律使用无香保湿剂、减少刺激物和按医嘱控制炎症比频繁换偏方更可靠。", "洗浴后轻拍干并及时保湿，记录真正重复出现的刺激因素，药膏按处方部位和疗程使用。", "皮肤迅速红肿疼痛、渗脓、发热或眼周严重病变可能感染；不要因担心激素而自行突然停用处方。", "美国国家关节炎、肌肉骨骼和皮肤病研究所（NIAMS）", "https://www.niams.nih.gov/health-topics/atopic-dermatitis", "caution", ["湿疹", "皮肤屏障"]),
  med("burn-cooling", GROUP.senses, "皮肤损伤", "新鲜热烧伤应先持续用凉流动水降温", "尽快移开热源并用凉而非冰冷的流动水降温，可限制余热继续损伤。冰、牙膏和油脂可能进一步伤害或妨碍评估。", "移除附近不粘连的衣物和首饰，用凉流动水充分降温后松散覆盖清洁材料。", "大面积、深度、面颈手足会阴、电击、化学烧伤或呼吸道受累需急救；粘住皮肤的衣物不要强扯。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/burns-and-scalds/treatment/", "urgent", ["烧伤", "急救"]),
  med("skin-change-photo", GROUP.senses, "皮肤观察", "同一光线和尺度的照片更有助于比较皮损变化", "记忆对颜色和大小的判断并不稳定。使用日期、同一光线、参照尺度和部位记录，可以帮助专业人员理解变化速度，但照片不能诊断。", "对持续变化的皮损按相同条件拍照并预约检查，不要反复抠抓或自行腐蚀处理。", "快速增大、反复出血、久不愈、颜色明显改变或伴全身症状应尽快就医；应用识图结果不能排除癌症。", "美国国家癌症研究所（NCI）", "https://www.cancer.gov/types/skin", "caution", ["皮肤记录", "变化"]),

  // 用药、检查与健康素养：新增 15 条，最终 16 条。
  med("medicine-list", GROUP.medicines, "用药安全", "一份更新的用药清单能减少重复和相互作用", "处方药、非处方药、维生素、草药、滴眼液和外用药都可能影响治疗。只记得“白色小药片”不足以安全核对。", "记录药名、剂量、用途、用法和过敏反应，每次就诊、住院和购药时主动出示并更新。", "不要因清单与旧医嘱不一致自行停药；发现重复、严重嗜睡、出血或呼吸困难时及时联系专业人员。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/media/73856/download", "general", ["药物清单", "信息交接"]),
  med("generic-drugs", GROUP.medicines, "药物知识", "合格仿制药需要达到与原研药相应的质量和生物等效要求", "仿制药的有效成分、强度、剂型和给药途径应与参照药一致，外观和非活性成分可能不同。价格不同不等于有效成分更弱。", "换药时核对有效成分和剂量，对辅料过敏、窄治疗窗药物或症状变化主动咨询药师。", "不要把同成分不同品牌当作两种药重复服用，也不要自行切换特殊释放剂型。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/generic-drugs/generic-drug-facts", "general", ["仿制药", "有效成分"]),
  med("medicine-disposal", GROUP.medicines, "用药安全", "不用的药留在家中，也可能变成误服和滥用风险", "过期或不再需要的药物可能被儿童、宠物或他人误用。部分药物有专门回收或冲厕清单，不能一概处理。", "优先使用当地药品回收点；没有回收渠道时严格按标签和监管机构说明处理，并遮去个人信息。", "针具、吸入器、化疗药和少数高风险药有特殊要求；不要擅自焚烧，也不要把所有药都冲入下水道。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/consumers/consumer-updates/where-and-how-dispose-unused-medicines", "general", ["药物处置", "家庭安全"]),
  med("otc-duplicate", GROUP.medicines, "非处方药", "复方感冒药可能让同一成分被重复服用", "不同品牌可同时含对乙酰氨基酚、抗组胺药、减充血剂或镇咳成分。只看品牌名而不看有效成分，容易无意超量。", "每次同时用药前比较有效成分栏，并把处方药一并告诉药师。", "误服超量、异常嗜睡、心悸、肝病或儿童用药应尽快联系当地毒物或医疗服务；不要等待症状才求助。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/buying-using-medicine-safely/understanding-over-counter-medicines", "urgent", ["非处方药", "重复成分"]),
  med("supplement-risk", GROUP.medicines, "保健品", "天然来源不等于无相互作用或无污染风险", "草药和膳食补充剂可能影响凝血、肝脏代谢、血压或处方药效果，部分产品还可能含未标示成分。上市监管强度也因地区而异。", "把所有补充剂加入用药清单，手术、妊娠或开始新药前主动询问是否需要停用。", "黄疸、严重皮疹、出血、心悸或意识变化需就医；不要用补充剂替代癌症、感染或慢病正规治疗。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/consumers/consumer-updates/fda-101-dietary-supplements", "caution", ["保健品", "相互作用"]),
  med("reference-range", GROUP.medicines, "检验解读", "检验参考范围不是健康与疾病之间的绝对边界", "参考范围来自特定实验室、方法和参照人群。健康者可能偶尔超界，患病者也可能落在范围内，趋势和临床背景同样重要。", "比较结果时确认单位、实验室和采样条件，把异常程度、趋势和症状一起询问。", "不要自行根据单个箭头停药或补充营养；危急值通知、胸痛、出血或意识变化应按医疗指示立即处理。", "美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/", "general", ["检验", "参考范围"]),
  med("screening-diagnostic", GROUP.medicines, "健康检查", "筛查阳性不等于已经确诊", "筛查用于在无症状人群中发现较高风险，阳性结果通常需要更具体的诊断检查。筛查的敏感度和特异度决定漏检与误报可能。", "接受筛查前了解下一步是什么、阳性后如何确认，以及阴性是否仍需按风险随访。", "出现症状时不要等待下一次常规筛查；高风险结果需要按计划完成诊断，不能只重复家用测试。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/about-uspstf/methods-and-processes", "general", ["筛查", "诊断"]),
  med("false-results", GROUP.medicines, "检验解读", "任何检测都可能出现假阳性和假阴性", "结果准确性受检测性能、疾病在该人群中的常见程度、采样时点和操作影响。低风险人群中，即使检测很好，阳性也可能需要谨慎确认。", "询问结果改变什么决策、是否需重复或换一种方法，并避免只凭单项家用检测作重大决定。", "症状与阴性结果冲突时应继续就医；可疑急症不能因一次阴性检测而延误处理。", "美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/lab-tests/", "caution", ["假阳性", "假阴性"]),
  med("ask-questions", GROUP.medicines, "就医沟通", "复述医嘱能发现“听懂了”与“能做到”之间的差距", "人在焦虑或信息很多时容易遗漏关键步骤。用自己的话复述诊断、用药和下一步，让专业人员纠正误解，比只问“明白了吗”更有效。", "就诊前写下三项最重要问题，结束前复述你将做什么、何时复诊以及哪些症状需要求助。", "复述不能替代书面处方或紧急处理；语言障碍时应请求合格翻译，不依赖儿童解释复杂医疗信息。", "美国医疗研究与质量署（AHRQ）", "https://www.ahrq.gov/health-literacy/patient-education/ask-three-questions.html", "general", ["健康素养", "沟通"]),
  med("imaging-radiation", GROUP.medicines, "医学影像", "不同影像检查使用的能量和目的并不相同", "超声和磁共振不使用电离辐射，X线和CT会使用。是否值得做取决于临床问题、替代方案和预期收益，不能只按“有没有辐射”判断。", "检查前说明妊娠可能和近期重复检查，询问结果将怎样改变处理，并保留影像记录。", "不要因担心辐射拒绝时间敏感的必要检查，也不要自行要求无指征重复CT；植入物需在MRI前核对。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/radiation-emitting-products/medical-imaging/medical-x-ray-imaging", "general", ["医学影像", "风险收益"]),
  med("drug-allergy-record", GROUP.medicines, "药物过敏", "“药物过敏”应尽量记录具体反应，而不只写药名", "恶心、腹泻等副作用与立即型过敏不同。模糊标签可能让人避开首选药，漏记严重反应又可能导致再次暴露。", "记录药名、出现时间、具体症状、是否需要急救和之后是否复评，并在每次就医时核对。", "呼吸困难、面舌肿胀、广泛起疱皮疹或循环不稳需急救；不要自行再次试药来验证过敏。", "美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/drugreactions.html", "urgent", ["药物过敏", "记录"]),
  med("missed-dose", GROUP.medicines, "用药安全", "漏服后直接加倍并不是通用规则", "不同药物的作用时间和安全窗不同，漏服处理可能是补服、跳过或联系专业人员。加倍可能造成出血、低血糖、低血压等伤害。", "先查看药品说明和个人用药计划；不确定时联系药师，不凭记忆套用另一种药的规则。", "胰岛素、抗凝药、抗癫痫药、免疫抑制剂等漏服应尽快获得专业建议；出现急症按症状求助。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/medicines/", "caution", ["漏服", "剂量"]),
  med("pill-splitting", GROUP.medicines, "用药安全", "有刻痕不总意味着任何人都适合掰开药片", "缓释、肠溶、胶囊和窄治疗窗药物掰开后可能改变释放或剂量。即使可分，手部功能和工具也会影响两半是否均匀。", "只有标签、药师或开药者明确允许时才分片，并使用合适切药器，不预先切太多。", "不要碾碎或掰开不明剂型；吞咽困难应寻求替代剂型，儿童和宠物远离碎屑。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/buying-using-medicine-safely/tablet-splitting", "general", ["药片分割", "剂型"]),
  med("online-pharmacy", GROUP.medicines, "用药安全", "异常便宜且无需处方的网店可能出售假药或错误成分", "非法网络药店可能隐瞒所在地、无持证药师，也可能出售剂量不准、受污染或未批准的产品。网站外观专业并不能证明合法。", "核对当地监管机构许可、实体地址、处方要求和药师联系方式，不通过社交媒体私信购买处方药。", "疑似假药、异常反应或产品召回应停止使用并联系药师和监管机构；严重症状立即就医。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/besaferx-your-source-online-pharmacy-information/about-besaferx", "caution", ["假药", "网络药店"]),
  med("home-test", GROUP.medicines, "家庭检测", "家庭检测的采样时间和操作会影响结果", "家用检测把部分信息带到家庭，但过早采样、样本不足、储存不当和读数超时都可能造成错误。结果还需结合症状和流行情况。", "使用未过期且获当地监管许可的产品，逐步按说明操作，记录采样时间并按要求确认结果。", "严重症状不应等待家用结果；阳性需确认或治疗时按当地流程，阴性但持续高风险也应复评。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/medical-devices/in-vitro-diagnostics/home-use-tests", "caution", ["家庭检测", "采样"]),

  // 急救与紧急警示：新增 9 条，最终 17 条。
  med("sepsis-signs", GROUP.urgent, "急症识别", "感染伴意识、呼吸或循环异常时要警惕脓毒症", "脓毒症是机体对感染反应失调造成的危及生命器官功能障碍。症状可包括意识变化、呼吸急促、皮肤斑驳、尿量减少或极度不适，并非总有高热。", "严重感染或近期手术者出现快速恶化时，记录开始时间并立即联系当地急救服务。", "不要等待所有症状集齐，也不要仅靠退烧观察；婴幼儿、老年人、孕产妇和免疫低下者可能表现不典型。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/sepsis", "urgent", ["脓毒症", "感染急症"]),
  med("choking-adult", GROUP.urgent, "急救", "完全气道梗阻时，患者可能无法说话或咳嗽", "轻度梗阻还能有力咳嗽时应鼓励咳嗽；严重梗阻会无法发声、呼吸困难或发绀，并可能迅速失去意识。急救动作需按当地认证指南学习。", "能有力咳嗽时鼓励咳嗽；若无法呼吸、说话或咳嗽，立即求助并按受训流程实施背部拍击和腹部冲击；若失去反应，开始受训的心肺复苏流程。", "婴儿、孕妇和体型特殊者方法不同；只移除口中明显可见的异物，不要盲目伸手探取。", "St John Ambulance", "https://www.sja.org.uk/first-aid-advice/choking/", "urgent", ["窒息", "急救"]),
  med("seizure-first-aid", GROUP.urgent, "急救", "癫痫发作时保护头部和计时，比按住肢体更重要", "全身抽搐时强行限制动作或往口中塞东西可能造成伤害。多数发作会自行停止，周围安全、呼吸观察和持续时间是关键信息。", "移开危险物、垫护头部、松开颈部衣物并计时；抽搐停止后在安全情况下侧卧并陪伴。", "首次发作、持续超过当地急救指南时限、连续发作、受伤、妊娠、在水中或呼吸未恢复，应立即联系急救。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/what-to-do-if-someone-has-a-seizure-fit/", "urgent", ["癫痫", "急救"]),
  med("fainting", GROUP.urgent, "急症识别", "短暂晕厥也需要结合诱因和恢复情况判断", "疼痛、久站或脱水可导致常见反射性晕厥，但心律问题、出血和神经疾病也可能引起意识丧失。恢复快并不自动排除危险原因。", "让患者平躺并抬高双腿，检查呼吸，记录持续时间、诱因、抽搐样动作和恢复过程。", "运动中晕厥、胸痛、心悸、重伤、妊娠、反复发生、恢复不完全或无正常呼吸时联系急救。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/fainting/", "urgent", ["晕厥", "急救"]),
  med("poisoning", GROUP.urgent, "中毒", "疑似中毒时不要自行催吐", "清洁剂、药物、气体、植物和未知物都可能中毒。催吐可能让腐蚀物再次损伤食管，或使患者吸入呕吐物。包装和暴露时间对处置很重要。", "移离持续暴露，在安全前提下保留包装或照片，并立即联系当地毒物中心或急救服务。", "呼吸困难、意识异常、抽搐或腐蚀性暴露需急救；不要给昏迷者进食饮水，也不要用家庭偏方中和。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/poisoning/", "urgent", ["中毒", "家庭安全"]),
  med("major-bleeding", GROUP.urgent, "急救", "严重外出血的首要任务是持续直接压迫", "大量出血会迅速导致休克。用干净敷料或布对伤口持续有力压迫，并尽快呼叫急救，比反复掀开查看更重要。", "戴手套或建立屏障，持续压迫并在渗透时加盖材料；让患者平卧保暖并等待急救。", "嵌入物不要拔除，应在周围压迫；喷射性、无法控制、截肢或出现苍白意识变化时立即急救。", "St John Ambulance", "https://www.sja.org.uk/first-aid-advice/severe-bleeding/", "urgent", ["出血", "急救"]),
  med("head-injury", GROUP.urgent, "头部外伤", "头部受伤后看似清醒，也可能随后恶化", "脑震荡和颅内出血症状可延迟出现。反复呕吐、加重头痛、嗜睡、意识或行为变化、抽搐和局灶神经症状是重要警示。", "停止运动，安排可靠成人观察，记录受伤机制、意识丧失和症状变化，不自行驾车。", "使用抗凝药、高能量损伤、无法唤醒、耳鼻流清液或神经症状应立即急救；不要让运动员当天重返赛场。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/severe-head-injury/", "urgent", ["头部外伤", "延迟恶化"]),
  med("appendicitis", GROUP.urgent, "腹痛", "阑尾炎疼痛可能从腹部中央移向右下方", "典型阑尾炎可先在肚脐周围不适，随后转至右下腹并随活动加重，也可能伴恶心、食欲下降或发热；儿童、孕妇和老年人表现可不典型。", "持续加重或位置改变的腹痛应尽快接受评估，记录症状和最后进食时间。", "剧烈腹痛、腹部僵硬、反复呕吐、昏厥或疼痛短暂缓解后全腹恶化应急诊；不要自行服泻药延误。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/appendicitis/", "urgent", ["腹痛", "阑尾炎"]),
  med("meningitis", GROUP.urgent, "感染急症", "脑膜炎不一定等到出现典型皮疹才危险", "发热、剧烈头痛、颈部僵硬、畏光、意识改变和迅速恶化可能提示脑膜炎或败血症。婴儿可能表现为喂养差、异常哭声或前囟膨隆。", "出现组合性警示症状或患者迅速变差时立即联系当地急救服务。", "无皮疹不能排除，按压不褪色皮疹只是警示之一；不要等待家庭测试或自行驾车长途求医。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/meningitis/", "urgent", ["脑膜炎", "感染急症"]),

  // 环境、旅行与职业健康：新增 14 条，最终 16 条。
  med("heat-acclimatization", GROUP.environment, "高温健康", "人体适应高温需要时间，首个炎热工作周风险更高", "逐步增加热环境中的活动能促进出汗和循环适应。突然在高温下长时间高强度工作，尤其穿防护服时，更易发生热病。", "新进入高温环境时分阶段增加工作量，安排阴凉休息、同伴观察和按计划补液。", "意识改变、昏厥、抽搐或极高体温提示热射病，应立即降温并联系急救；适应不能消除极端高温风险。", "美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/heat-stress/recommendations/acclimatization.html", "urgent", ["高温", "职业健康"]),
  med("uv-index", GROUP.environment, "紫外线", "紫外线指数比气温更能提示晒伤风险", "凉爽、有风或多云时仍可能有较强紫外线。紫外线指数综合太阳高度、臭氧和云等因素，帮助安排遮阴、衣物和防晒。", "外出前查看当地紫外线指数，在较高时段缩短暴露并组合帽子、衣物、阴影和防晒。", "反射性雪地、水面和高海拔会增加暴露；严重晒伤、眼痛或热病症状需医疗帮助。", "世界卫生组织（WHO）", "https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-(uv)-index", "general", ["紫外线", "天气风险"]),
  med("wildfire-smoke", GROUP.environment, "空气质量", "野火烟雾中的细颗粒能进入肺深部", "烟雾可能在距离火场很远处影响空气质量，哮喘、心肺疾病、孕妇、儿童和老年人风险更高。普通布口罩和空气清新剂不能有效控制颗粒。", "关注官方空气质量和疏散信息，减少高强度户外活动，关闭漏烟口并使用合适过滤设备。", "胸痛、严重气短、发绀或意识变化应急救；撤离命令优先于留在室内过滤，呼吸器需正确密合。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/wildfires/about/index.html", "caution", ["野火", "空气质量"]),
  med("mold-moisture", GROUP.environment, "室内环境", "处理霉菌的关键是控制潮湿来源", "霉菌可在漏水、冷凝和高湿表面生长，可能诱发过敏和哮喘症状。只喷香味剂或在潮湿未解决时反复刷墙，问题会回来。", "修复漏水、通风除湿并清除受损材料；大面积或污水污染时使用专业处理。", "呼吸困难、严重哮喘发作或免疫低下者暴露后症状需就医；不要把所有不明症状都归因于霉菌毒素。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/mold-health/about/index.html", "caution", ["霉菌", "室内环境"]),
  med("lead-exposure", GROUP.environment, "环境健康", "铅暴露可能没有明显症状，却会伤害儿童发育", "老旧油漆粉尘、受污染土壤、水管和部分传统产品可能含铅。儿童通过手口行为摄入，孕期暴露也值得重视。", "了解房屋年代和当地风险，对可疑尘屑使用湿式清洁，并按公共卫生建议检测儿童或环境。", "不要自行打磨未知旧漆；疑似急性高剂量摄入、腹痛、神经症状或儿童暴露应联系毒物和医疗服务。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/lead-poisoning-and-health", "caution", ["铅", "儿童环境"]),
  med("radon", GROUP.environment, "环境健康", "氡无色无味，家中是否偏高只能靠检测", "氡来自土壤和岩石，可在建筑内积聚，是肺癌风险因素。邻居家结果不能代表自己家，通风感受也不能判断浓度。", "使用符合当地标准的检测方法，在高结果时通过专业评估采取减排措施。", "氡风险是长期累积，不能靠一次开窗解决；吸烟与氡共同增加肺癌风险，呼吸症状仍需正常就医。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/radon-and-health", "general", ["氡", "室内空气"]),
  med("food-water-travel", GROUP.environment, "旅行健康", "旅行腹泻风险取决于食物、水源和卫生链条", "看起来高档的食物也可能在储存或处理环节被污染。彻底加热、密封水、手卫生和避免不洁冰块可降低风险，但不能完全消除。", "在风险地区选择刚熟且热食，使用安全饮水刷牙，随身携带口服补液用品并了解当地医疗点。", "血便、高热、严重脱水、持续呕吐或高风险人群应就医；不要预防性自行长期服抗生素。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/food-water-safety", "caution", ["旅行", "食品和水"]),
  med("altitude-illness", GROUP.environment, "高原健康", "体能好并不能避免急性高原病", "海拔快速上升后，头痛、恶心、乏力和睡眠差可提示急性高原病。上升速度和个人易感性比平地运动能力更重要。", "分阶段上升，首日减少强度，不带病硬赶行程；出现症状时停止继续升高。", "静息气短、步态不稳、意识变化或咳粉红痰提示高原脑水肿或肺水肿，应立即下降并急救。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/travel-to-high-altitudes", "urgent", ["高原", "旅行"]),
  med("long-flight-movement", GROUP.environment, "旅行健康", "长途旅行中的久坐会增加静脉血栓风险", "长时间不动、近期手术、妊娠、癌症、既往血栓和激素用药等会提高风险。大多数旅客风险仍低，但高风险者需提前规划。", "旅途中定期活动脚踝和小腿，在安全时起身走动，高风险者出发前咨询是否需额外措施。", "不要自行服阿司匹林预防旅行血栓；出现单侧腿肿痛、突发胸痛或气短应急诊。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/dvt", "caution", ["长途旅行", "血栓"]),
  med("traveler-vaccines", GROUP.environment, "旅行健康", "旅行疫苗要按目的地、行程和时间提前规划", "所需疫苗取决于国家、城市或乡村、季节、停留方式和个人健康。有些疫苗需要多剂或数周建立保护。", "出发前数周查看目的地官方建议，带上免疫记录，到正规旅行门诊制定计划。", "临时接种不能替代蚊虫、饮食和动物暴露防护；孕妇、免疫低下者和婴幼儿需个体评估。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/travel-vaccines", "general", ["旅行疫苗", "规划"]),
  med("noise-work", GROUP.environment, "职业健康", "听不见同事近距离正常说话，可能提示工作噪声过高", "长期噪声暴露可造成不可逆听力损失和耳鸣。听力损失通常逐渐发生，等到明显感觉时可能已有损伤。", "优先采用降低声源和隔离噪声的工程措施，再配合合适听力保护和定期检测。", "防护用品不能替代雇主控制噪声；爆炸后突发听力下降、眩晕或耳流液需急诊评估。", "美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/noise/about/index.html", "caution", ["职业噪声", "听力"]),
  med("chemical-label", GROUP.environment, "职业健康", "化学品标签和安全数据表描述的是不同层级的信息", "标签提供现场快速警示，安全数据表说明危害、个人防护、储存、泄漏和急救。把产品转入无标签饮料瓶会制造严重误用风险。", "保留原包装和标签，使用前查看安全数据表，按培训配戴防护并确认洗眼和泄漏流程。", "未知化学品暴露、呼吸困难、眼灼伤或意识变化应移离暴露并急救；不要混合清洁剂。", "美国环境保护署（EPA）", "https://www.epa.gov/sites/default/files/2016-01/documents/hazard_communication_standard-safety_data_sheets_epa_dec_2015.pdf", "urgent", ["化学品", "标签"]),
  med("hand-arm-vibration", GROUP.environment, "职业健康", "长期手臂振动暴露会影响血管、神经和手部功能", "频繁使用振动工具可能出现手指发白、麻木、刺痛和握力下降，寒冷会加重血管反应。症状早期报告有助于调整暴露。", "维护工具、减少连续使用、保持手部温暖并轮换任务，记录症状与具体工具和时长。", "持续麻木无力、手指颜色明显变化或无法完成精细动作需职业健康评估；手套不能完全消除振动。", "英国健康与安全执行局（HSE）", "https://www.hse.gov.uk/vibration/hav/", "caution", ["振动", "职业健康"]),
  med("travel-insurance-medical", GROUP.environment, "旅行准备", "境外医疗和后送费用可能远高于普通旅行预算", "常规保险未必覆盖既往疾病、危险活动、偏远地区后送或全部医疗费用。只有保单明确写出的保障才可依赖。", "出发前核对医疗、紧急转运、既往疾病和活动除外条款，保存保单与紧急联系电话的离线副本。", "保险不是延误急救的理由；慢病患者应携带药物清单、处方证明和足量合法药品。", "美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/insurance", "general", ["旅行保险", "应急准备"]),

  // 预防、癌症与筛查：新增 17 条，最终 17 条。
  med("screening-balance", GROUP.prevention, "筛查原则", "筛查既可能带来早期发现，也可能产生误报和过度诊断", "筛查并非越多越好。获益取决于疾病风险、检测性能、后续治疗能否改善结局，也要考虑假阳性、侵入性检查和发现不会造成伤害的病变。", "参加筛查前了解适用年龄和风险、可能结果以及阳性后的确认步骤。", "已有症状时需要诊断评估而非等待筛查；不同国家建议会更新，不能套用过期资料。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/about-uspstf/methods-and-processes", "general", ["筛查", "风险收益"]),
  med("cervical-screening", GROUP.prevention, "宫颈癌筛查", "接种 HPV 疫苗后仍需要按当地建议筛查", "疫苗不能覆盖所有高危 HPV 类型，也不能清除既往感染。HPV 检测和宫颈细胞学的适用年龄与间隔依地区和个人史而异。", "保存既往筛查和治疗结果，按所在地指南安排下一次检查，而不是只记每年一次。", "异常出血、性交后出血或持续盆腔症状应就医，不等待常规筛查；异常结果需完成随访。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/cervical-cancer", "caution", ["宫颈癌", "HPV"]),
  med("colorectal-screening", GROUP.prevention, "结直肠癌筛查", "结直肠癌筛查有多种方法，频率和后续步骤不同", "粪便检测、结肠镜和其他方法在侵入性、频率和发现能力上不同。粪便筛查阳性通常需要结肠镜确认。", "根据年龄、家族史、既往息肉和所在地方案讨论合适方法，并提前确认阳性后的检查能力。", "便血、黑便、贫血、排便习惯持续改变或体重下降属于症状评估，不应只做家用筛查。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening", "caution", ["结直肠癌", "筛查选择"]),
  med("breast-screening", GROUP.prevention, "乳腺癌筛查", "乳腺筛查建议要结合年龄、风险和当地资源", "乳房X线筛查可降低特定年龄人群的死亡风险，也会出现假阳性、额外检查和过度诊断。高风险基因或家族史可能需要不同方案。", "整理家族史和既往影像，按所在地指南与专业人员共同决定开始年龄、间隔和方法。", "新肿块、乳头血性分泌、皮肤凹陷或单侧持续变化需诊断评估，不要等下一轮筛查。", "美国国家癌症研究所（NCI）", "https://www.cancer.gov/types/breast/patient/breast-screening-pdq", "caution", ["乳腺癌", "筛查"]),
  med("lung-screening", GROUP.prevention, "肺癌筛查", "低剂量 CT 肺癌筛查只面向符合高风险条件的人群", "其获益证据来自特定年龄和吸烟史人群，普通胸片不能替代，低风险人群滥做会增加假阳性、偶然发现和辐射。", "有长期吸烟史者用准确包年数与医生核对是否符合当地筛查标准，并同时获得戒烟支持。", "咳血、持续胸痛、体重下降或呼吸困难是诊断问题；筛查阴性也不能忽略症状。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/lung-cancer-screening", "caution", ["肺癌", "吸烟史"]),
  med("prostate-decision", GROUP.prevention, "前列腺癌筛查", "PSA 筛查需要在获益与假阳性、过度诊断之间共同决策", "PSA 可因良性增生、炎症和癌症升高。筛查可能发现需要治疗的癌症，也可能发现终生不会造成伤害的病变。", "了解个人年龄、家族史和价值偏好，再与专业人员讨论是否检测及异常后的路径。", "排尿困难、血尿、骨痛等症状需诊断评估；一次 PSA 不能自行确诊，也不要跳过确认直接治疗。", "美国国家癌症研究所（NCI）", "https://www.cancer.gov/types/prostate/psa-fact-sheet", "general", ["前列腺", "共同决策"]),
  med("skin-screening", GROUP.prevention, "皮肤癌", "全人群皮肤癌筛查的证据边界不同于观察变化", "关注新发和持续演变皮损有现实价值，但对无症状普通风险成人进行常规全身筛查的净获益证据可能不足。高风险者方案不同。", "了解日晒、肤色、家族史和既往皮肤癌风险，对可疑变化及时就医并共同决定检查频率。", "证据不足不等于筛查无效，也不等于忽略症状；出血、快速变化或久不愈需评估。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/skin-cancer-screening", "general", ["皮肤癌", "证据边界"]),
  med("diabetes-screening", GROUP.prevention, "糖尿病筛查", "糖尿病筛查时点取决于年龄、体重和其他风险", "2型糖尿病可多年无症状。家族史、妊娠糖尿病、某些族群背景、血压和体重等会改变风险，建议也会随地区更新。", "在常规就诊中核对个人风险和上次检测时间，并确认异常结果是否需要重复或另一方法。", "口渴多尿、体重下降、呕吐或深快呼吸需及时诊断，不能等待常规筛查日期。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-for-prediabetes-and-type-2-diabetes", "general", ["糖尿病", "无症状筛查"]),
  med("aaa-screening", GROUP.prevention, "血管筛查", "腹主动脉瘤筛查只对部分高风险人群有明确证据", "腹主动脉瘤破裂可致命，但超声筛查的净获益取决于年龄、性别、吸烟史和家族史。不是所有成人都需要重复检查。", "有吸烟史或一级亲属患病者，按所在地指南询问是否适合一次超声筛查。", "突发剧烈腹背痛、晕厥或休克征象应立即急救；正常筛查不能解释之后出现的急症。", "美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/abdominal-aortic-aneurysm-screening", "urgent", ["腹主动脉瘤", "高风险筛查"]),
  med("hepatitis-c-screening", GROUP.prevention, "肝炎筛查", "丙肝可多年无症状，检测后还有可治愈的治疗路径", "丙型肝炎主要经血液传播，慢性感染可能进展为肝硬化和肝癌。抗体阳性表示曾经暴露，通常还需核酸确认当前感染。", "按当地建议及个人暴露风险接受检测，阳性后完成确认和治疗评估。", "不要因抗体阳性自行判断仍有传染性；黄疸、腹水、呕血或意识变化需紧急就医。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c", "caution", ["丙肝", "可治愈感染"]),
  med("hiv-testing", GROUP.prevention, "HIV 检测", "HIV 检测有窗口期，检测时点影响解释", "感染后到不同检测可可靠发现之间需要时间。阴性结果只有结合暴露时间和检测类型才能解释，高风险暴露后还有时间敏感的暴露后预防。", "发生可能暴露时尽快联系专业机构评估暴露后预防，并按检测类型安排初检和复查。", "不要等待症状判断 HIV；暴露后预防需尽早启动，阳性筛查要确认并连接治疗，避免污名。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/hiv/testing/index.html", "caution", ["HIV", "窗口期"]),
  med("dental-check", GROUP.prevention, "口腔预防", "牙科复查间隔应按个人风险，而不是人人固定半年", "龋齿、牙周病、口干、吸烟、糖尿病和既往治疗会影响复查和影像需要。低风险者与高风险者不必使用同一频率。", "与牙科人员确认自己复查间隔的依据，并持续日常含氟牙膏刷牙和牙缝清洁。", "面部肿胀、发热、吞咽呼吸困难或牙外伤是及时处理问题，不应等待例行复查。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/live-well/healthy-teeth-and-gums/dental-check-ups/", "general", ["牙科", "风险分层"]),
  med("vaccination-record", GROUP.prevention, "免疫记录", "完整接种记录能避免漏种，也能减少不必要的重复", "仅凭记忆很难还原疫苗种类、日期和剂次。跨地区就医时，纸质或数字记录有助于按当地方案判断补种。", "把接种证、电子记录和特殊反应统一备份，旅行、入学、妊娠计划或换医生时带上。", "记录缺失不代表必须自行重打全部疫苗；严重过敏史和免疫抑制需由接种专业人员判断。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/vaccines-adults/recommended-vaccines/keeping-vaccine-records-up-to-date.html", "general", ["疫苗记录", "备份"]),
  med("family-history", GROUP.prevention, "风险识别", "家族史有价值，因为它同时携带遗传和共同环境线索", "近亲患病种类、确诊年龄和多个同侧亲属聚集，比笼统说家里有人得过癌症更有信息量。它不能决定命运，却能改变筛查和预防讨论。", "询问一级亲属的重要疾病和确诊年龄，定期更新并带到就诊中。", "不要凭家族史自行购买全套基因检测或提前治疗；早发、多发或罕见组合应接受遗传咨询。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/family-health-history/about/index.html", "general", ["家族史", "遗传咨询"]),
  med("genetic-test", GROUP.prevention, "基因检测", "消费级基因检测的阴性结果不能排除全部遗传风险", "不同产品只检测有限变异，风险估计还受族群参考数据、家族史和环境影响。医学决策需要经过验证的临床检测与解释。", "重大结果先保存原始报告，带给遗传咨询或相关专业人员确认是否需临床复检。", "不要仅凭消费级结果停药、手术或排除筛查；可能影响亲属的结果应先讨论隐私和知情。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/medical-devices/in-vitro-diagnostics/direct-consumer-tests", "caution", ["基因检测", "证据边界"]),
  med("sun-prevention", GROUP.prevention, "癌症预防", "减少紫外线暴露比依赖一次皮肤检查更主动", "紫外线会造成累积皮肤损伤并增加多种皮肤癌风险。防晒策略包括时间、阴影、衣物、帽子、太阳镜和防晒霜的组合。", "把防晒用品放在出门动线上，并根据紫外线指数和活动方式选择组合措施。", "防晒不能完全消除风险；变化皮损需就医，避免日光浴和人工晒黑设备。", "世界卫生组织（WHO）", "https://www.who.int/news-room/questions-and-answers/item/radiation-protecting-against-skin-cancer", "general", ["紫外线", "癌症预防"]),
  med("tobacco-cancer", GROUP.prevention, "癌症预防", "戒烟会降低多种癌症和心肺疾病风险，任何年龄开始都有价值", "烟草烟雾含多种致癌物，伤害不只限于肺。风险下降需要时间，但不存在抽太久所以戒了也没用的年龄界限。", "设定戒烟日期，结合行为支持和适合的药物方案，并清理家中烟草触发物。", "戒断不适可以治疗；胸痛、咯血、呼吸困难或体重下降需医疗评估，不能只等待戒烟后改善。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/tobacco", "general", ["戒烟", "癌症预防"]),

  // 生命周期、生殖与老龄健康：新增 16 条，最终 17 条。
  med("preconception-folic", GROUP.lifespan, "孕前健康", "叶酸预防神经管缺陷需要在怀孕很早期就已充足", "神经管在许多人尚未确认怀孕时已经形成，因此有怀孕可能的人群应按当地建议提前获得叶酸。个人剂量会因既往史和药物不同。", "有怀孕计划或可能时，提前与专业人员讨论叶酸、疫苗、慢病和全部用药。", "不要自行使用超高剂量叶酸掩盖其他缺乏；抗癫痫药等不能因备孕自行停用。", "世界卫生组织（WHO）", "https://www.who.int/tools/elena/interventions/folate-periconceptional", "general", ["孕前", "叶酸"]),
  med("pregnancy-medicines", GROUP.lifespan, "孕产健康", "怀孕后不能把所有药都停掉，也不能把非处方药当作天然安全", "药物风险取决于药物、剂量、孕周和未治疗疾病的风险。突然停用抗癫痫、精神或慢病药可能同时伤害孕妇和胎儿。", "备孕或确认怀孕后尽快把处方药、非处方药和补充剂交给专业人员逐项核对。", "不要自行停药、换药或用草药替代；严重出血、剧烈腹痛、抽搐或呼吸困难应急救。", "美国食品药品监督管理局（FDA）", "https://www.fda.gov/consumers/womens-health-topics/medicine-and-pregnancy", "caution", ["妊娠", "用药"]),
  med("pregnancy-warning", GROUP.lifespan, "孕产急症", "妊娠期严重头痛、视物异常和上腹痛可能是高血压疾病警示", "子痫前期可在妊娠后半期或产后出现，血压升高可能伴严重头痛、视觉变化、上腹痛、呼吸困难或突然肿胀。", "出现警示症状时立即联系产科急诊，记录孕周、血压和症状开始时间。", "不要仅靠休息等待，也不要自行加减降压药；抽搐、呼吸困难、意识变化或大出血应立即急救。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/pre-eclampsia", "urgent", ["子痫前期", "孕产急症"]),
  med("postpartum-depression", GROUP.lifespan, "产后心理", "产后抑郁比短暂的情绪波动更持久、更影响功能", "分娩后短期情绪敏感常见，但持续低落、失去兴趣、强烈内疚、睡眠和功能严重受损可能提示围产期抑郁，父母双方都可能受到影响。", "主动告诉家人和医疗人员具体症状与持续时间，安排实际照护支持并接受循证治疗。", "伤害自己或婴儿的想法、幻觉、妄想、极度混乱或几乎不睡仍异常兴奋应立即急救。", "美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/perinatal-depression", "urgent", ["产后抑郁", "家庭支持"]),
  med("breastfeeding-support", GROUP.lifespan, "婴儿喂养", "母乳喂养是可学习的过程，疼痛不应被简单要求忍耐", "含接、姿势、泌乳、婴儿口腔和母体健康都会影响喂养。及时、无责备的专业支持比坚持单一姿势更重要。", "观察婴儿吞咽、尿量和体重趋势，乳头持续疼痛或含接困难时尽早寻求哺乳支持。", "婴儿嗜睡难唤、尿量少、体重下降过多、母亲高热乳房红痛或脓肿迹象需及时医疗评估。", "世界卫生组织（WHO）", "https://www.who.int/health-topics/breastfeeding", "caution", ["母乳喂养", "支持"]),
  med("infant-safe-sleep", GROUP.lifespan, "婴儿安全", "婴儿睡眠环境应减少柔软物和窒息风险", "仰卧、坚实平坦且无倾斜的独立睡眠面，避免枕头、厚被、床围和软玩具，可降低睡眠相关死亡风险。成人床和沙发的缝隙也有危险。", "每次睡眠都把婴儿仰卧放在合规睡眠面，房间同室但保持独立睡眠空间。", "婴儿呼吸困难、发绀或无法唤醒立即急救；早产或疾病婴儿出院计划应听从专科指导。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/sudden-infant-death/about/index.html", "urgent", ["婴儿", "安全睡眠"]),
  med("child-fever", GROUP.lifespan, "儿童健康", "儿童发热的危险程度不能只由温度高低判断", "精神状态、呼吸、饮水、尿量、年龄和基础疾病同样重要。幼小婴儿即使温度不很高，也可能需要快速评估。", "使用可靠温度计，记录测量方式和时间，提供适当液体并观察互动和呼吸。", "三个月以下婴儿发热、呼吸困难、皮疹按压不褪色、抽搐、嗜睡难唤或严重脱水应立即就医。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/fever-in-children/", "urgent", ["儿童发热", "分层判断"]),
  med("development-variation", GROUP.lifespan, "儿童发育", "发育里程碑用于观察趋势，不是给孩子排队打分", "儿童在动作、语言、社交和认知上存在个体差异。持续缺失技能、已获得技能倒退或多个领域共同落后，比与某一天龄精确比较更值得关注。", "在日常游戏中记录孩子能做什么，有担忧时尽早与儿科或发育服务讨论，不必等待自然会好。", "技能倒退、抽搐、明显肌张力异常或听视力担忧需及时评估；筛查工具不能自行确诊。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/act-early/milestones/index.html", "caution", ["儿童发育", "早期干预"]),
  med("adolescent-confidentiality", GROUP.lifespan, "青少年健康", "青少年拥有一部分私密就医时间，有助于讨论真实风险", "在符合当地法律和安全边界的前提下，让青少年与专业人员单独交流，有助于谈论心理、性健康、物质和暴力等敏感问题。", "照护者可在就诊前支持青少年列问题，并询问机构的保密范围和必须披露的安全例外。", "自伤、虐待、剥削或无法保证安全时，保密有明确边界，应启动保护和急救流程。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/std/treatment-guidelines/adolescents.htm", "general", ["青少年", "医疗隐私"]),
  med("menstrual-health", GROUP.lifespan, "月经健康", "月经疼痛常见，但影响生活的疼痛不应被一概正常化", "原发痛经可以常见，子宫内膜异位症、腺肌症和其他疾病也会导致进行性疼痛、大量出血或性交痛。疼痛程度需要结合功能影响。", "记录周期、出血量、疼痛、缺勤和药物反应，持续影响生活时寻求妇科评估。", "一小时内反复浸透卫生用品、晕厥、妊娠可能伴疼痛出血或突然剧痛应紧急就医。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/endometriosis", "caution", ["月经", "疼痛"]),
  med("contraception-choice", GROUP.lifespan, "生殖健康", "避孕方法的合适性取决于健康、偏好和可持续使用", "避孕方法在有效性、激素、隐私、可逆性、出血变化和性传播感染防护上不同。理论有效率与实际能否持续正确使用并不相同。", "比较自己最重视的因素，向专业人员说明吸烟、偏头痛先兆、血栓史和全部用药。", "突发胸痛、单侧腿肿、严重头痛或神经症状需急救；只有安全套同时帮助预防性传播感染。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/family-planning-contraception", "caution", ["避孕", "共同决策"]),
  med("sti-testing", GROUP.lifespan, "性健康", "许多性传播感染没有症状", "没有疼痛、分泌物或皮疹并不能排除衣原体、淋病、HIV 等感染。检测部位、窗口期和频率要依据行为和当地建议。", "与专业人员坦诚讨论暴露部位和时间，按建议进行相应采样，并与伴侣讨论检测和防护。", "暴露后预防有时间窗；孕期、盆腔痛发热、睾丸剧痛或神经症状需及时就医，阳性结果应完成治疗和伴侣管理。", "美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/sti/about/index.html", "caution", ["性传播感染", "无症状"]),
  med("menopause", GROUP.lifespan, "更年期", "更年期症状不只限于潮热", "激素变化可影响月经、睡眠、情绪、泌尿生殖症状和骨骼健康，持续时间和严重程度差异很大。治疗选择需结合个人风险和偏好。", "记录症状与功能影响，复核睡眠和药物，向专业人员讨论生活方式、非激素和激素方案。", "绝经后出血必须评估；胸痛、神经症状或严重抑郁不是普通更年期表现。", "世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/menopause", "caution", ["更年期", "生命周期"]),
  med("frailty", GROUP.lifespan, "老年健康", "衰弱不是年龄本身，而是应对压力事件的储备下降", "体重下降、疲劳、活动减少、步速和肌力下降可提示衰弱风险。它可受营养、疾病、药物和社会因素影响，并非必然不可逆。", "关注近期体重、步行、起身和日常功能变化，结合渐进活动、营养和药物复核接受综合评估。", "快速功能下降、反复跌倒、谵妄或无法进食可能是急性疾病，不应只归为老化。", "英格兰国民医疗服务体系（NHS England）", "https://www.england.nhs.uk/ourwork/clinical-policy/older-people/frailty/", "caution", ["衰弱", "功能储备"]),
  med("delirium", GROUP.lifespan, "老年急症", "突然出现的意识混乱与缓慢发展的痴呆不同", "谵妄通常在数小时至数天内波动，表现为注意困难、思维混乱、嗜睡或激越，常由感染、药物、脱水或器官疾病触发。", "记录最后正常时间和变化，带上用药清单，尽快接受医疗评估并提供眼镜助听器等熟悉支持。", "突然混乱属于急症，尤其伴发热、单侧无力、呼吸困难或跌倒时立即求助；不要只用镇静药压制。", "英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/confusion/", "urgent", ["谵妄", "意识变化"]),
  med("polypharmacy", GROUP.lifespan, "老年用药", "药越多，核对适应证和相互作用越重要", "多重用药可能是合理治疗多个疾病的结果，也会增加跌倒、低血压、肾功能影响和服药错误。目标不是机械减少数量，而是逐项确认净获益。", "定期把全部药物和补充剂带给同一专业人员复核用途、重复、服用困难和停药计划。", "不要自行突然停药；新出现跌倒、谵妄、严重嗜睡、出血或低血糖应及时评估药物因素。", "美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/safe-use-medicines-older-adults", "caution", ["多重用药", "老年安全"])
];

const medical200 = legacyMedical.map((item) => {
  const topicGroup = LEGACY_GROUP_BY_ID.get(item.id);
  assert(topicGroup, `missing legacy medical topicGroup for ${item.id}`);
  const imageTheme = GROUP_THEME[topicGroup];
  return {
    ...item,
    topicGroup,
    riskLevel: LEGACY_URGENT.has(item.id) ? "urgent" : LEGACY_CAUTION.has(item.id) ? "caution" : "general",
    sourceAccessedAt: V24_REVIEWED_V2_MEDICAL_IDS.has(item.id) ? "2026-08-30" : "2026-08-12",
    imageTheme,
    alt: THEME_ALT[imageTheme],
    themeTags: item.themeTags || [topicGroup, item.topic]
  };
}).concat(newMedical).map((item) => V24_REVIEWED_V2_MEDICAL_IDS.has(item.id)
  ? { ...item, sourceAccessedAt: "2026-08-30" }
  : item).map((item) => item.id === "medical-development-variation"
  ? { ...item, sourceAccessedAt: "2026-08-25" }
  : item).map(withMedicalIllustration);

const MEDICAL_GROUP_BY_KEY = Object.freeze({
  movement: GROUP.movement,
  sleep: GROUP.sleep,
  nutrition: GROUP.nutrition,
  cardio: GROUP.cardio,
  infection: GROUP.infection,
  mental: GROUP.mental,
  senses: GROUP.senses,
  medicines: GROUP.medicines,
  urgent: GROUP.urgent,
  environment: GROUP.environment,
  prevention: GROUP.prevention,
  lifespan: GROUP.lifespan
});
const MEDICAL_SUMMARY_ENDINGS = Object.freeze([
  "这条知识强调可观察的机制和边界，不能替代针对个人症状的诊断。",
  "把这一事实放回具体时间、风险和功能变化中，才能避免只凭单一线索判断。",
  "它适合帮助理解一般规律，个人处理仍需结合病史、药物和当地医疗条件。",
  "理解这个区别，可以减少过度恐慌，也能避免把真正的警示信号普通化。",
  "这说明健康判断往往需要趋势与情境，而不是追逐一个绝对数字或万能做法。"
]);
const MEDICAL_ACTION_PREFIXES = Object.freeze([
  "可以先做一项可执行的小步骤：",
  "日常处理可从这里开始：",
  "为了让信息可复核，建议",
  "较稳妥的行动顺序是",
  "在一般情况下，"
]);

function expandedMedical(row, index) {
  const content = { ...row, ...(MEDICAL_CONTENT_OVERRIDES[row.slug] || {}) };
  const topicGroup = MEDICAL_GROUP_BY_KEY[content.groupKey];
  const source = MEDICAL_SOURCE_OVERRIDES[content.slug] || MEDICAL_SOURCES[content.sourceKey];
  assert(topicGroup, `unknown medical extension group ${content.groupKey}`);
  assert(source, `unknown medical extension source ${content.sourceKey}`);
  const riskLevel = MEDICAL_RISK_OVERRIDES[content.slug] || content.riskLevel;
  const urgent = riskLevel === "urgent";
  const summary = `${content.fact}。${MEDICAL_SUMMARY_ENDINGS[index % MEDICAL_SUMMARY_ENDINGS.length]}`;
  const actionFocus = content.completeAction === true
    ? content.actionFocus
    : /急救|急诊/.test(content.actionFocus) && !/(?:当|若|出现)[^。；]*(?:急救|急诊)/.test(content.actionFocus)
    ? `若出现${content.redFlagFocus}，${content.actionFocus}`
    : content.actionFocus;
  const redFlagFocus = /急救|急诊/.test(content.redFlagFocus) && !/(?:当|若|出现)[^。；]*(?:急救|急诊)/.test(content.redFlagFocus)
    ? `若出现以下情况：${content.redFlagFocus}`
    : content.redFlagFocus;
  const action = urgent
    ? content.completeAction === true ? `${actionFocus}。` : `${actionFocus}；在不延误求助的前提下记录开始时间和变化。`
    : content.completeAction === true
      ? `${actionFocus}。`
      : `${MEDICAL_ACTION_PREFIXES[index % MEDICAL_ACTION_PREFIXES.length]}${actionFocus}；记录变化后再按个人风险向合格专业人员核对。`;
  const limits = content.completeLimits === true
    ? `${redFlagFocus}。`
    : urgent
    ? MEDICAL_SERVICE_URGENT_SET.has(content.slug)
      ? `${redFlagFocus}。不要因症状暂时缓解而取消上述专科或服务评估。`
      : `${redFlagFocus}。若出现这些信号，不要等待自行缓解，应立即按当地急救流程求助。`
    : `${redFlagFocus}。若出现这些情况或功能迅速恶化，应及时就医；不要仅凭本条科普自行诊断、停用处方药或延误治疗。`;
  return {
    ...med(
      `v3-${content.slug}`, topicGroup, content.topic, content.title, summary, action, limits,
      source[0], source[1], riskLevel, content.themeTags.split("；")
    ),
    sourceAccessedAt: MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES[content.slug]
      || (MEDICAL_SOURCE_OVERRIDES[content.slug]
      || content.riskLevel === "urgent"
      || MEDICAL_CONTENT_OVERRIDES[content.slug]
      ? "2026-08-25"
      : "2026-08-24")
  };
}

const medical500 = medical200.concat(MEDICAL_EXTENSION_ROWS.map(expandedMedical).map(withMedicalIllustration));
const medicalIllustrationCounts = medical500.reduce((counts, item) => {
  counts.set(item.illustrationKey, (counts.get(item.illustrationKey) || 0) + 1);
  return counts;
}, new Map());

assert(cities70.length === 70, `expected 70 cities, got ${cities70.length}`);
assert(german200.length === 200, `expected 200 German items, got ${german200.length}`);
assert(medical200.length === 200, `expected 200 medical items, got ${medical200.length}`);
assert(CITY_EXTENSION_ROWS.length === 130, `expected 130 city extensions, got ${CITY_EXTENSION_ROWS.length}`);
assert(GERMAN_EXTENSION_ROWS.length === 300, `expected 300 German extensions, got ${GERMAN_EXTENSION_ROWS.length}`);
assert(MEDICAL_EXTENSION_ROWS.length === 300, `expected 300 medical extensions, got ${MEDICAL_EXTENSION_ROWS.length}`);
assert(cities200.length === 200, `expected 200 cities, got ${cities200.length}`);
assert(german500.length === 500, `expected 500 German items, got ${german500.length}`);
assert(medical500.length === 500, `expected 500 medical items, got ${medical500.length}`);
assert(medicalIllustrationCounts.size === 24, `expected all 24 medical illustration keys, got ${medicalIllustrationCounts.size}`);
for (const [key, count] of medicalIllustrationCounts) {
  assert(count >= 5 && count <= 40, `${key}: expected 5-40 medical items, got ${count}`);
}

writeJson("cities70.json", cities70);
writeJson("german200.json", german200);
writeJson("medical200.json", medical200);
writeJson("cities200.json", cities200);
writeJson("german500.json", german500);
writeJson("medical500.json", medical500);

console.log(`PASS: ${CHECK_ONLY ? "checked" : "generated"} cities200.json=200, german500.json=500, medical500.json=500 (legacy 70/200/200 retained)`);
