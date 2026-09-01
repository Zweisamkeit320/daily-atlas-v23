# 城市、德语与医学扩容审计（2026-08-25）

## 结果

- `cities200.json`：200 条；以当前 `cities70.json` 为前 70 项并扩展 130 项。
- `german500.json`：500 条；以当前 `german200.json` 为前 200 项并扩展 300 项。
- `medical500.json`：500 条；以当前 `medical200.json` 为前 200 项并扩展 300 项。
- 当前基线中的来源、安全边界和文字可被勘误；“前缀保留”指当前构建输入与当前 500 条输出一致，不等于历史版本对象永远不修订。
- `node scripts/build-v2-extras.cjs --check` 会在不写文件的情况下重建并逐字节比较三份目标 JSON；`node scripts/validate-v2-extras.cjs` 再独立核对字段、数量、来源、内容边界与本地音频。

## 城市覆盖与来源边界

200 条城市均有唯一 ID、城市与国家中英文名、ISO alpha-2 地区代码、世界区域、经纬度、IANA 时区、三项亮点、适合人群、季节提示、文化礼仪与来源链接。区域计数为：欧洲 40、亚洲 40、非洲 35、北美洲 30、南美洲 30、大洋洲 24、欧洲与西亚 1。

本轮逐项修正了香港 `HK`、澳门 `MO`、台北和台南 `TW` 的 ISO 字段，以及 Victoria Falls、Savannah、Halifax、Victoria (British Columbia)、Banff、Trujillo (Peru)、Córdoba (Argentina)、Mendoza、Darwin、Gold Coast、Queenstown (New Zealand) 和 Napier 的社区旅行页面定位。基加利失效的旧页面改用 Wikivoyage 社区旅行参考。Wikivoyage 只作为社区编写的静态旅行参考，不声明为政府、目的地官方或实时来源。

新增 130 城拥有 130 条不同的 `seasonNote`，全池 200 条季节提示也均不重复。提示不写固定天气数字，并明确要求对天气、步道、开放或活动条件查阅临近出发时的信息。针对布鲁塞尔大广场、台北大稻埕、门多萨水渠、布里斯班南岸、杜布罗夫尼克旧城、维多利亚瀑布与哥本哈根设计场所的生硬礼仪模板已替换为对应场景的表述。

城市卡是静态策展，不替代签证、安全、天气、节庆、交通或开放时间等实时旅行信息；当前天气只在用户主动点击时请求，并显示获取时间。

## 德语覆盖、参考资源与朗读

- 等级严格均衡：A1、A2、B1、B2 各 125 条。
- 类型分布：表达 170、词汇 170、语法 160。
- 500 条均有唯一德语知识点、唯一德语例句、中文解释、中文例句翻译、参考资源定位和 `narration` 字段。
- Goethe、Duden 与 IDS Grammis 链接用于语言学习参考，不是对每个自编例句的逐句出处声明。
- 6 个公共政策或学术词保留在 B2 轮换中，但解释明确标为 B2+ 扩展词，并说明适用语域和主动学习边界。
- 固定女声清单包含 500 项，对应目录中恰好 500 个 MP3；清单顺序、ID、路径、例句文本哈希、文件字节数与 MP3 SHA-256 均逐项核对。

500 个 MP3 合计 10,330,632 字节；清单记录的编码前 PCM 样本时长合计 1,677,712 ms。Piper 与 MP3 编码不声明跨次运行字节确定；重新合成后必须生成并核对新清单。本轮只因德语解释文字修订而更新清单的 `source.lessonsSha256`，500 个例句、清单 `items` 和 MP3 整树摘要均未改变。

## 医学安全边界与来源复核

500 条医学卡分布在 12 个主题组，每条均包含一般科普摘要、可执行的日常行动、适用边界或危险信号、风险级别、来源和 `imageTheme`。当前汇总为 415 个不同主题、274 个不同来源 URL；风险分布为一般 153、需谨慎 273、紧急警示 74。

扩展池曾被统一模板过度标为紧急。本轮把原 77 个待复核条目精确拆分为 22 个真正急救条目、12 个需要尽快联系毒物中心、眼科、牙科、产科、儿科、精神健康或其他专门服务的时间敏感条目、13 个一般条目和 30 个谨慎条目。只有明确条件触发时才出现急救或急诊提示；一般和谨慎条目不再被无条件追加“联系急救／救护车”。

本轮同时修复了 50 个旧失效链接、25 个 NHS 错误重定向或标签不符的链接，以及 13 个不足以支持具体主张的宽泛来源。92 个逐条来源覆盖中，本机网络请求有 88 个直接返回 2xx；NIH ODS、AirNow、OSHA 与 SAMHSA 的 4 个官方页面因反自动化或本机网络限制没有得到 Node 2xx，故不把它们计入“网络请求通过”，但页面地址与主张定位已单独核对。

医学卡只提供一般健康教育，不根据少量输入诊断或给出个体化治疗。紧急程度、服务可得性和号码随所在地变化，应以当地急救、毒物咨询、专业医疗服务和实际症状为准。六张本地图只承担主题识别，不能替代文字证据或医学判断。

## 实际验证

已执行并通过：

```text
node --check scripts/v3-extras-data.cjs
node --check scripts/build-v2-extras.cjs
node --check scripts/validate-v2-extras.cjs
npm run build:extras
node scripts/build-v2-extras.cjs --check
npm run check:extras

PASS: cities200.json=200; 130/130 new season notes unique
PASS: german500.json=500; A1/A2/B1/B2=125/125/125/125
PASS: 500 bundled German narrations match visible example sentences
PASS: medical500.json=500; risks=153 general / 273 caution / 74 urgent
```

后续总目录、Service Worker、浏览器耗尽和完整 500 音频离线安装测试，应以最终候选版的发布测试记录为准，不能由上述内容构建检查替代。

## 当前文件摘要

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| `cities200.json` | 251,476 | `5748EA6EE60944F3F672D9680D1740E7678EDEBF6B0C84A0A644FFC115BDC8C8` |
| `german500.json` | 402,617 | `18D2B0471E46B013CAFB8B3E20A02B65593A2B70C4F4C56D3E9484C36C9AB0A4` |
| `medical500.json` | 578,293 | `310B98A0D181C26A8AFA74A0304E7BA55BD769CBCCDDA0B37768BEB6A96A9850` |
| `assets/audio/german/manifest.json` | — | `35E652038EB1B805D51D7AC50A72F892B6F3451792D573940ECBF550AAB4C0EA` |

500 个 MP3 的“相对路径 + 文件 SHA-256”整树摘要为 `FCE1D3E9CA40B1B9FAEC52E89278BA6728682D2883A15E5EE3A1D3EB2527D238`。
