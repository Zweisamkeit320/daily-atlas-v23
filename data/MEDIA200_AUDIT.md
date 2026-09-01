# 书影音 200 条扩池证据说明

生成时间（固定为上游快照完成时间，保证字节级复现）：2026-08-12T05:09:43.385Z  
上游联合清单：`data/upstream/snapshots/2026-08-12T05-07-39-407Z/manifest.json`  
上游联合清单 SHA-256：`B893F3C256DB5736709A9FD59295053EB84818803E1CB7E2F4A7D433CB047E58`

## 已确认结果

- 图书严格 200 本；主分类为历史／悬疑／科幻 68／54／78。
- 电影严格 200 部；主分类为历史／悬疑／科幻 70／69／61。
- 原有 50 个 Open Library Work ID 和 50 个 IMDb title ID 全部保留。
- 新增图书 150 本全部满足 Open Library 评分不低于 4.0/5、评分人数不少于 20；新增电影与原有电影均逐 ID 对照本次 IMDb 官方 `title.ratings.tsv.gz`，满足 7.5/10、30,000 票门槛。
- 新增电影还要求 Cinemeta `released` 可解析且不晚于 2026-08-12；原始上映时间逐条保存在 `metadataAudit.sourceReleasedAt`。
- 22 个可可靠确认的 Open Library 首版年份按稳定 Work ID 显式校正；上游原值和校正依据均保留在 `metadataAudit.firstPublishYearOverride`。另有 5 个作品／版本边界存在实质歧义，展示年份置为“待核”，不套用通用猜测规则。
- 图书热度层：{"classic":66,"mid":50,"underseen":84}；电影热度层：{"classic":60,"mid":95,"underseen":45}。热度只表示平台评分人数。
- 图书作者标签 141 个，单一作者标签最多 7 本；电影导演标签 147 个，单一导演标签最多 6 部。

## 图书年份加固

| Open Library Work ID | 作品 | 冻结上游值 | 展示校正值 | 外部依据 |
| --- | --- | ---: | ---: | --- |
| `/works/OL36287W` | The Count of Monte Cristo | 1830 | 1844 | [依据](https://etc.usf.edu/lit2go/180/the-count-of-monte-cristo/) |
| `/works/OL98459W` | Slaughterhouse-Five | 1956 | 1969 | [依据](https://www.loc.gov/exhibits/america-reads/1950-to-2009.html#obj052) |
| `/works/OL114967W` | The Jungle | 1791 | 1906 | [依据](https://www.loc.gov/exhibits/america-reads/1900-to-1949.html#obj014) |
| `/works/OL273644W` | The Color Purple | 1976 | 1982 | [依据](https://search.worldcat.org/title/The-color-purple-%3A-a-novel/oclc/8221433) |
| `/works/OL1815447W` | Roots | 1861 | 1976 | [依据](https://search.worldcat.org/title/Roots/oclc/2188350) |
| `/works/OL1846074W` | Number the Stars | 1901 | 1989 | [依据](https://search.worldcat.org/title/Number-the-stars/oclc/755033504) |
| `/works/OL8193478W` | Oliver Twist | 1822 | 1837 | [依据](https://www.vam.ac.uk/articles/charles-dickens) |
| `/works/OL267171W` | War and Peace | 1864 | 1865 | [依据](https://www.cambridge.org/core/books/abs/war-and-peace/conclusion-war-and-peace/A16B195EAF0C9D1AA94E5D3FB0DBC852) |
| `/works/OL2746369W` | The Clan of the Cave Bear | 1900 | 1980 | [依据](https://search.worldcat.org/title/6277166) |
| `/works/OL1253285W` | The Scarlet Pimpernel | 1900 | 1905 | [依据](https://search.worldcat.org/title/Scarlet-Pimpernel-The/oclc/1078570373) |
| `/works/OL2941508W` | The Secret Life of Bees | 2000 | 2002 | [依据](https://suemonkkidd.com/books/the-secret-life-of-bees/)、[补充依据](https://www.loc.gov/static/managed-content/uploads/sites/22/2024/07/nbf09_monk_kidd.pdf) |
| `/works/OL38483W` | The Confusion | 2003 | 2004 | [依据](https://search.worldcat.org/title/confusion/oclc/52727987/lists) |
| `/works/OL2746372W` | The Mammoth Hunters | 1611 | 1985 | [依据](https://search.worldcat.org/title/The-mammoth-hunters/oclc/12371377) |
| `/works/OL41059W` | The Tell-Tale Heart | 1958 | 1843 | [依据](https://www.eapoe.org/works/info/pt043.htm) |
| `/works/OL2625431W` | Kafka on the Shore | 2001 | 2002 | [依据](https://search.worldcat.org/zh-tw/title/50764038) |
| `/works/OL176092W` | The Moonstone | 1800 | 1868 | [依据](https://search.worldcat.org/title/The-Moonstone/oclc/49727789) |
| `/works/OL81634W` | Misery | 1978 | 1987 | [依据](https://search.worldcat.org/title/Misery/oclc/979456670) |
| `/works/OL675722W` | Oryx and Crake | 2002 | 2003 | [依据](https://search.worldcat.org/title/Oryx-and-Crake-%3A-a-novel/oclc/50774561) |
| `/works/OL19800273W` | Tiamat's Wrath | 2018 | 2019 | [依据](https://www.hachettebookgroup.com/titles/james-s-a-corey/tiamats-wrath/9780316332866/) |
| `/works/OL16114008W` | Leviathan Wakes | 2009 | 2011 | [依据](https://search.worldcat.org/title/Leviathan-wakes/oclc/668192559) |
| `/works/OL15936512W` | Ready Player One | 2008 | 2011 | [依据](https://www.penguinrandomhouse.com/books/209887/ready-player-one-by-ernest-cline/9780307887450/) |
| `/works/OL1737320W` | I Have No Mouth and I Must Scream | 1972 | 1967 | [依据](https://search.worldcat.org/title/I-have-no-mouth-and-I-must-scream-%3A-stories/oclc/3886746) |

### 暂不显示确定年份

- `/works/OL1388028W` 永恒之王：该作品合并了跨年份出版的多个分卷；单一首版年取决于按分卷还是按 1958 年合集计算。
- `/works/OL257663W` 长船（Röde Orm）：该作品分两部分于 1941 和 1945 年出版；冻结上游的 1943 不作为确定作品年份展示。
- `/works/OL110971W` 虚构集：该文集存在 1941、1944 及后续扩充版等不同作品边界；冻结上游的 1945 需要进一步编辑裁定。
- `/works/OL2897797W` V字仇杀队：该作品先有早期连载，后有 DC 合集；冻结上游的 1988 取决于采用哪一种版本边界。
- `/works/OL13646905W` Daemon（暂无核定中译名）：该作品有 2006 年自出版版与 2009 年 Dutton 商业版；产品需要先明确采用哪一种版本口径。

《The Secret Life of Bees》采用 2002，而不是 2001：[作者官网](https://suemonkkidd.com/books/the-secret-life-of-bees/)和[美国国会图书馆](https://www.loc.gov/static/managed-content/uploads/sites/22/2024/07/nbf09_monk_kidd.pdf)均把 Viking 小说列为 2002；WorldCat 的 2001 记录是单独的有声书记录，不能据此提前小说的出版年。

## 策展证据等级

原有各 50 条保留为 `editorial-curated`。新增各 150 条均有逐项中文简介、推荐理由、题材依据、适读／适看边界、内容提示和证据说明，并标为 `editorial-reviewed`；编辑决定为 reject 的候选不会进入成品池。评分只证明达到来源门槛，逐项策展也不等于作品适合所有人。

Cinemeta 的英文简介用于判定元数据完整性和候选相关性；为避免把第三方文字批量再发布，生成数据只保存简介 SHA-256 及证据文件引用，不逐字复制简介。中文展示文案只陈述导演、年份、类型、评分与筛选层级。

## 上游证据

- Open Library：3 份不可变 Search API 响应，分别对应历史、悬疑和科幻查询；新增条目逐项记录证据文件与 SHA-256。Search API 的 Work 级评分字段用于本轮来源筛选，但不等同于保存每个 `/ratings.json` 的单条 HTTP 原始响应。
- IMDb：官方非商业 `title.ratings.tsv.gz`，SHA-256 `4EE880262E131234ABD05E228019B89A3B91B56D8478BD20482EA8F68A1843B7`。每部电影在 `metadataAudit.imdbRatingRecord` 中保存实际匹配行。Information courtesy of IMDb (https://www.imdb.com). Used with permission. IMDb 数据限个人、非商业使用，公开商业运营必须重新取得适用许可。
- Cinemeta：30 份分类页响应（每个题材从 skip 0 到 450），提供候选影片的导演、年份、片长、类型和简介存在性；它不是 IMDb 官方数据，也没有服务可用性或商业授权保证。评分真值不采用 Cinemeta 的 `imdbRating`。
- 海报：新增影片沿用基于 IMDb ID 的 MetaHub 远程海报端点，只是可失败的展示增强；端点没有商业许可或长期可用性保证，不应被 PWA 静默批量预缓存，应用必须保留文字视觉回退。
- 豆瓣：未抓取、复制或展示豆瓣评分。

## 文件哈希

- `data/raw/books200.json`：`E0B1B4CD815A47D806E5A8C467B0000933E43CA29E9826CDABD4D925FF83E26B`
- `data/raw/movies200.json`：`76C815654A2F485F83CAABB35E1C5C655A34B63C065B70925B1D7E3550822A3B`

## 可重复验证

```powershell
node scripts/build-media200.cjs --check
```

检查模式会重新读取并计算联合清单及 34 个上游文件的 SHA-256，重建两个 200 条池，并将结果与已交付 JSON 和本审计文档逐字节比较。脚本不联网，不会用当前变化中的分数覆盖固定快照。
