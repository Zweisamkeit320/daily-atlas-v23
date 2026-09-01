# Daily Duet V2 扩展候选池审计

> 历史说明：本文件记录 2026-08-12 的 V2 扩展批次，不代表当前 v2.4.x 候选池规模、医学图片数量或发布状态；当前口径以 `CATALOG_AUDIT.md` 和 `V3_EXTRAS_AUDIT.md` 为准。

审计日期：2026-08-12（Asia/Shanghai）

## 范围与可复现入口

本次扩展只生成三个规范化候选池，不修改页面、推荐算法或构建汇总逻辑：

- `data/raw/cities70.json`：保留 `cities50.json` 的全部 50 个 ID，再新增 20 个城市，共 70 个；
- `data/raw/german200.json`：保留 `german50.json` 的全部 50 个 ID，再新增 150 项，共 200 项；
- `data/raw/medical200.json`：保留 `medical50.json` 的全部 50 个 ID，再新增 150 项，共 200 项。

在项目根目录运行：

```powershell
node scripts/build-v2-extras.cjs
node scripts/validate-v2-extras.cjs
```

生成器从三个原始 50 项池读取基线，并以固定顺序写出格式化 JSON。校验器调用生成器的 `--check` 模式，在内存中计算预期字节并与现有文件逐字节比较，同时确认检查前后的三个目标哈希不变；因此 `npm run check:extras` 是只读检查，不会为了验证可重现性而重写 `data/raw`。

`work/build-v2-extras.cjs` 与项目内的 `scripts/build-v2-extras.cjs` 内容相同；后者是交付后应使用的便携入口。

## 字段

城市条目：

```text
id, type, cityZh, cityEn, countryZh, countryEn, region,
summary, highlights, bestFor, seasonNote, culturalTip, sourceUrl,
visual, countryCode, latitude, longitude, timezone, themeTags
```

德语条目：

```text
id, type, kind, german, chinese, explanation,
exampleGerman, exampleChinese, level, pronunciationHint,
sourceUrl, themeTags
```

医学条目：

```text
id, type, topic, title, summary, action, limitsOrRedFlags,
sourceName, sourceUrl, alt, topicGroup, riskLevel,
sourceAccessedAt, imageTheme, themeTags
```

## 数量与分布

### 城市

共 70 项。地区分布为：亚洲 15、欧洲 14、欧洲与西亚 1、非洲 12、北美洲 10、南美洲 9、大洋洲 9。

新增 20 个城市为 Tallinn、Ljubljana、Sarajevo、Busan、George Town、Ulaanbaatar、Accra、Kigali、Windhoek、Maputo、Montréal、Mérida、Chicago、Montevideo、La Paz、Salvador、Perth、Adelaide、Christchurch、Suva。所有 70 项均有数值型纬度、经度以及有效的 IANA 时区标识。坐标是城市中心近似值，不是景点导航点；时区标识也不代表应用已提供实时当地规则、天气、签证或安全信息。

### 德语

共 200 项，CEFR 难度为 A1/A2/B1/B2 各 50 项；类型为词汇 70、表达 70、语法 60。

每项都含一条完整的 `exampleGerman` 原创例句及对应 `exampleChinese` 中文翻译。校验器检查例句的句末标点、基本句子形态、德中字段非重复、ID/例句唯一性及跨条目的四元词组近似重复。`german` 字段在词汇或语法项中可能是词、固定表达或语法标签；朗读按钮应读 `exampleGerman`，而不是假定 `german` 始终是完整句子。

Goethe、IDS Grammis 与 Duden 链接是词汇、语法或级别参考入口。例句和中文解释为本项目编写，并非这些网站的逐字引文；CEFR 标注属于编辑性分级，不代表官方考试机构逐项认证。

### 医学

共 200 项，覆盖 12 个显式主题组：

| `topicGroup` | 数量 | `imageTheme` |
|---|---:|---|
| 运动、肌肉与骨骼 | 17 | `activity` |
| 睡眠与昼夜节律 | 16 | `sleep` |
| 营养、消化与口腔 | 17 | `nutrition` |
| 心血管、代谢与肾脏 | 17 | `cardiometabolic` |
| 感染预防与免疫 | 17 | `immunity` |
| 心理、脑健康与成瘾 | 17 | `brain` |
| 感官与皮肤 | 16 | `senses-skin` |
| 用药、检查与健康素养 | 16 | `medicines-tests` |
| 急救与紧急警示 | 17 | `emergency` |
| 环境、旅行与职业健康 | 16 | `environment-travel` |
| 预防、癌症与筛查 | 17 | `prevention-screening` |
| 生命周期、生殖与老龄健康 | 17 | `lifespan` |

风险层级为 `general` 78、`caution` 82、`urgent` 40。共有 130 个具体 `topic`、183 个不同的官方直达页面。每项都把一般知识、可执行行动与限制或危险信号分别放入 `summary`、`action`、`limitsOrRedFlags`，并用 `riskLevel` 明确风险语境。所有 `urgent` 项都必须通过校验器的紧急行动措辞检查。

医学来源限于 WHO、CDC、NHS 与 NHS England、NIH 相关研究所、MedlinePlus、FDA、AHRQ、USPSTF、USDA 和 HSE 等政府或公共卫生机构；每项记录 `sourceName`、HTTPS `sourceUrl` 和 `sourceAccessedAt`。这证明了来源归属与链接结构，不等于自动化脚本完成了临床同行评审。公开发布前仍应由具备医学编辑能力的人复核高风险措辞；应用只应定位为一般科普，不应用少量用户输入作诊断或个体化治疗。

当前素材将 12 个语义 `imageTheme` 映射到 6 张原创概念插图，详见 `assets/medical/README.md`。这是可审计的主题视觉，不应被描述成每条医学知识的精确解剖图或诊断图。

## 本地校验结果

2026-08-12 实际运行 `node scripts/build-v2-extras.cjs` 后输出：

```text
PASS: generated cities70.json=70, german200.json=200, medical200.json=200
```

随后实际运行 `node scripts/validate-v2-extras.cjs`：

```text
PASS: v2 extras validation
```

最终文件摘要：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `cities70.json` | 79,995 | `D189753912BBDB5EA55C475715F6CE3946174CFEDEFEBC17648ABD94DDAC6FE1` |
| `german200.json` | 155,688 | `07E55E7814EA296363825193AA7CA974F551662A6CB9CB4B28CDC4837EBA81FF` |
| `medical200.json` | 213,336 | `E6068550D27E65283E9A92D3514C3B387A347503AA463B3C7A30B6C54B52E901` |

校验范围包括：精确数量、旧 ID 全保留、必填字段、ID/核心文本唯一性、近似重复、城市坐标与 IANA 时区、地区配额、德语难度和类型配额、德语完整例句与中译、官方域名白名单、医学主题—图片显式映射、风险层级、紧急行动提示、来源多样性、内存重建结果与现有文件的逐字节一致性，以及只读检查前后目标哈希不变。

## 在线链接抽查

2026-08-12 使用带 20 秒超时、自动跟随跳转的 GET 请求检查三个池的 265 个不同来源 URL，结果为：HTTP 200 共 233、HTTP 403 共 25、HTTP 405 共 2、HTTP 500 共 1、网络或 TLS 错误 4、HTTP 404/410 为 0。

医学池单独检查 183 个不同来源：HTTP 200 共 180、HTTP 403 共 1、HTTP 405 共 2、HTTP 404/410 与网络错误均为 0。此前识别并替换的 18 个医学失效链接均在定向复查中返回 HTTP 200。

403、405、500 或网络错误通常可能来自反自动化、服务器方法策略或瞬时网络条件，不能据此断言页面缺失，也不能当作内容已验证成功。本次仅保存规范化 URL、访问日期与最终 JSON 哈希，没有保存每个上游 HTTP 响应正文，因此这不是完整的离线上游响应归档包；后续若建设“候选池定期刷新管线”，应另存原始响应、响应时间、许可说明和响应 SHA-256。

## 德语朗读边界

数据为 200 项逐项提供完整德语例句及随包 MP3。默认播放固定 Piper `de_DE-eva_k-x_low` 合成女声；公开论文将 Eva K 明确描述为 female speaker，模型与 config 哈希、每句文本哈希、MP3 哈希、字节数和时长均记录在 `assets/audio/german/manifest.json`。M-AILABS 数据许可通知随包保存在 `assets/audio/german/LICENSE-M-AILABS.txt`。

设备 Web Speech API 现在只作为固定文件缺失或播放失败时的后备。标准 `SpeechSynthesisVoice` 仍没有可靠的性别字段，因此后备音色不承诺性别，也不靠名称猜测。固定 MP3 是合成语音，并不表示数据贡献者或原说话人对本项目背书。

Service Worker 会把朗读清单和全部 200 个 MP3 纳入同一内容哈希版本的离线缓存。首次完整缓存后可离线播放；远程封面、海报和设备 Web Speech 语音包不因此进入缓存。

随包交付的是固定 MP3、清单、许可通知和生成脚本，不包含 Piper 推理运行时或模型权重。重建音频需要先安装 `requirements-assets.txt` 中固定的 `piper-tts==1.6.0` 与 `lameenc==1.8.1`，再另行下载与清单冻结 SHA-256 匹配的模型和配置；普通播放及 Node.js 构建校验不需要这些外部重建依赖。
