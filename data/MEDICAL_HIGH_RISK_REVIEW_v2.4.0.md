# 今日万象 v2.4.0 医学高风险内容专项复核

复核完成时间：2026-08-30T07:06:31.399Z

结论：BLOCKED_PENDING_CONCRETE_TEXT_AND_SOURCE_FIXES。阻断来自可复现的文本拼接错误、紧急升级不足和来源错配；不要求用户提交专家签名、保密文件或个人健康信息。

## 范围与边界

- 逐条审阅 urgent 74/74；caution 全量规则扫描 273/273，并按 12 个主题分层抽样 69 条（最低要求 60）。
- 对 72 个唯一 urgent URL 实际执行 HTTPS GET、跟随重定向；传输可达与主题支持分开判定。
- 本报告是一般科普的编辑安全审查，不是诊断、处方、临床指南认证或个体治疗建议。风险级别是编辑优先级，不是临床分诊评分。

## 结果总览

| 项目 | 结果 |
|---|---:|
| 医学目录 | 500 |
| urgent pass | 61 |
| urgent critical / major / moderate / minor | 4 / 5 / 2 / 2 |
| urgent 紧急行动清楚 / 歧义 | 72 / 2 |
| caution 分层抽样 needs_revision / source review / pass | 12 / 11 / 46 |
| caution 高敏升级候选 / 泛来源候选 | 99 / 81 |
| urgent 唯一来源 URL 实测 | 72/72 |

## 发布阻断与最小修复

- **CRITICAL · medical-v3-sepsis-recognition**：条目讲脓毒症，但引用页是 CDC Hygiene Basics，不能支持危及生命器官功能障碍与急救升级。 修复：改用 https://www.cdc.gov/sepsis/about/index.html 并逐句核对。
- **CRITICAL · medical-v3-cardiac-arrest-aed**：action 出现“若出现不要因不确定脉搏而长时间推迟按压”拼接错误，可能延误按压。 修复：改为：发现无反应且没有正常呼吸时，立即呼叫当地急救、开始胸外按压并尽快使用 AED；不要因尝试摸脉搏而长时间延误按压。
- **CRITICAL · medical-v3-adult-choking**：action/limits 把“意识丧失后开始复苏且每次开放气道检查可见异物”错误嵌入条件，混淆处置顺序。 修复：按能有效咳嗽、无法说话/咳嗽/呼吸、意识丧失三个阶段重写，并明确只移除可见异物。
- **CRITICAL · medical-v3-delirium-acute**：条目讲急性谵妄，但引用 NIA Healthy Aging；实测 405 Human Verification，主题也不匹配。 修复：改用实测 200 的 https://www.nhs.uk/symptoms/confusion/ 并核对突然混乱需立即评估。
- **MAJOR · medical-choking-adult**：原 NHS URL 实测跨域重定向到 St John Ambulance 通用急救首页，不能作为成人窒息的具体证据。 修复：改用 https://www.sja.org.uk/first-aid-advice/choking/ 并复核清醒严重梗阻与意识丧失后的分支。
- **MAJOR · medical-major-bleeding**：原 NHS URL 实测跨域重定向到 St John Ambulance 通用急救首页，不能作为严重出血的具体证据。 修复：改用 https://www.sja.org.uk/first-aid-advice/life-threatening-bleed/ 并逐句对照。
- **MAJOR · medical-chemical-label**：NIOSH chemicals URL 返回 262 B 拒绝页且无标题，无法核实标签与 SDS 的具体区分。 修复：换成 OSHA Hazard Communication/Safety Data Sheets 的具体官方页面并验证公众可达性。
- **MAJOR · medical-v3-heat-stroke**：当前写“冷水、冰水浸泡”，而所引 St John 页面建议凉湿床单、风扇/冷水擦拭和冷敷；更强干预未由该来源支持。 修复：按现有来源改写，或换成明确支持浸泡且说明适用情境与现场安全的官方指南。
- **MAJOR · medical-v3-suicide-immediate**：NIMH 一般心理自护页只部分涉及自杀危机，不能充分支持具体计划与可及手段的全部即时动作。 修复：改用 NIMH Suicide FAQ 或 5 Action Steps 具体页面，并保留当地服务边界。
- **MODERATE · medical-v3-severe-hypoglycemia**：St John 糖尿病急救页支持无反应时急救，但本次正文核对未找到胰高血糖素方案细节。 修复：保留意识受损不得口服，并增加支持经训练人员按个人方案使用胰高血糖素的官方来源。
- **MODERATE · medical-v3-opioid-overdose**：SAMHSA URL 两次 GET 均为 403，公众链路可达性无法确认。 修复：改用实测 200 的 https://www.cdc.gov/stop-overdose/caring/naloxone.html 或增加该官方备用来源。
- **MINOR · medical-v3-major-burn**：引用页明确凉水降温至少 20 分钟并防止过度降温；当前未写持续时间与婴儿/老人失温边界。 修复：补充来源支持的持续时间与避免全身过度降温提示。
- **MINOR · medical-v3-tooth-avulsion**：action 未像 NHS 原文那样限定牛奶、生理盐水或唾液冲洗，也未写能轻松放回时再复位。 修复：明确只拿牙冠；如脏用牛奶/生理盐水/唾液轻柔冲洗；仅能轻松复位时尝试，乳牙不得复位。

caution 高敏扫描命中 99 条，这不是把全部候选判错。分层样本已确认 12 条需把严重红旗从模板化“及时就医”升级为明确急救、急诊、危机或人身安全分支：medical-burnout、medical-v3-social-connection-quality、medical-v3-mania-warning、medical-v3-gambling-chasing、medical-v3-caregiver-strain、medical-v3-insect-bite、medical-v3-head-injury-observe、medical-v3-antibiotic-resistance-action、medical-v3-barrier-methods、medical-v3-climate-distress、medical-v3-postpartum-mental、medical-v3-burn-cool-water。

## 74 条 urgent 逐项状态

| ID | 标题 | 状态 | 等级 | 紧急行动 | 来源判断 |
|---|---|---|---|---|---|
| medical-stroke-fast | 中风抢的是时间，不是等症状自己消失 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-heart-attack | 心肌梗死不一定只有剧烈胸痛 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-anaphylaxis | 严重过敏可能在数分钟内进展 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-asthma-attack | 哮喘急性发作应有预先行动计划 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-heat-illness | 中暑可能以意识变化为首要危险信号 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-carbon-monoxide | 一氧化碳无色无味，不能靠鼻子发现 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-suicide-warning | 直接询问自杀想法不会“把念头塞给对方” | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-vision-loss | 突然视力变化属于需要迅速判断的症状 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-drowsy-driving | 困倦驾驶可能在你意识到之前削弱反应 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-heart-failure-changes | 体重和呼吸变化可比单次水肿更早提示液体潴留 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-dvt-signs | 单侧腿肿痛比双腿对称肿胀更需要警惕血栓 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-hypoglycemia | 低血糖可能先表现为出汗、发抖或行为变化 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-measles-contagious | 麻疹的传染性很强，暴露后不能只等皮疹 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-rabies-exposure | 疑似狂犬病暴露后，伤口处理和及时接种不能等待症状 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-bipolar | 双相障碍不等于普通的情绪起伏 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-psychosis-early | 现实感改变越早被认真对待，越有机会减少长期影响 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-alcohol-medicines | 酒精会改变多种药物的镇静、出血和肝脏风险 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-retinal-detachment | 突然增多的飞蚊、闪光和帘幕感可能提示视网膜脱离 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-contact-lens-hygiene | 隐形眼镜接触自来水会增加严重角膜感染风险 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-burn-cooling | 新鲜热烧伤应先持续用凉流动水降温 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-otc-duplicate | 复方感冒药可能让同一成分被重复服用 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-drug-allergy-record | “药物过敏”应尽量记录具体反应，而不只写药名 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-sepsis-signs | 感染伴意识、呼吸或循环异常时要警惕脓毒症 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-choking-adult | 完全气道梗阻时，患者可能无法说话或咳嗽 | needs_revision | major | clear | redirected_to_generic_landing |
| medical-seizure-first-aid | 癫痫发作时保护头部和计时，比按住肢体更重要 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-fainting | 短暂晕厥也需要结合诱因和恢复情况判断 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-poisoning | 疑似中毒时不要自行催吐 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-major-bleeding | 严重外出血的首要任务是持续直接压迫 | needs_revision | major | clear | redirected_to_generic_landing |
| medical-head-injury | 头部受伤后看似清醒，也可能随后恶化 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-appendicitis | 阑尾炎疼痛可能从腹部中央移向右下方 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-meningitis | 脑膜炎不一定等到出现典型皮疹才危险 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-heat-acclimatization | 人体适应高温需要时间，首个炎热工作周风险更高 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-altitude-illness | 体能好并不能避免急性高原病 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-chemical-label | 化学品标签和安全数据表描述的是不同层级的信息 | needs_revision | major | clear | not_substantively_retrievable |
| medical-aaa-screening | 腹主动脉瘤筛查只对部分高风险人群有明确证据 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-pregnancy-warning | 妊娠期严重头痛、视物异常和上腹痛可能是高血压疾病警示 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-postpartum-depression | 产后抑郁比短暂的情绪波动更持久、更影响功能 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-infant-safe-sleep | 婴儿睡眠环境应减少柔软物和窒息风险 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-child-fever | 儿童发热的危险程度不能只由温度高低判断 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-delirium | 突然出现的意识混乱与缓慢发展的痴呆不同 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-rabies-exposure | 症状出现后的狂犬病几乎总是致命，但暴露后预防高度有效 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-hiv-pep-time | 暴露后预防越早开始越好，并有明确时间窗口 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-sepsis-recognition | 脓毒症是感染引起的危及生命器官功能障碍 | needs_revision | critical | clear | topic_mismatch |
| medical-v3-psychosis-early | 幻觉或妄想需要结合文化、物质、睡眠和疾病评估 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-suicide-direct-question | 直接、平静地询问自杀想法不会把念头植入对方 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-sudden-vision-loss | 单眼或双眼突然视力变化可能是时间敏感急症 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-flashes-floaters | 新发大量飞蚊或闪光可能提示玻璃体牵拉或视网膜裂孔 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-stroke-last-known-well | 卒中治疗依赖时间，最后正常时间比发现时间更关键 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-heart-attack-varied | 心肌梗死不一定只有典型压榨性胸痛 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-cardiac-arrest-aed | 无反应且没有正常呼吸应按心脏骤停处理 | needs_revision | critical | ambiguous | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-adult-choking | 能咳嗽发声与完全不能呼吸的处理不同 | needs_revision | critical | ambiguous | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-anaphylaxis-epinephrine | 严重过敏可迅速影响气道、呼吸或循环 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-severe-asthma | 说话困难和吸入药效果差提示危险 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-sepsis-deterioration | 感染者快速变差可能比体温数值更重要 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-massive-bleeding-pressure | 持续直接压迫是控制外出血的核心步骤 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-major-burn | 烧伤深度和部位比疼痛强度更能决定风险 | needs_revision | minor | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-poison-exposure | 不同毒物的催吐、饮水和活性炭建议并不相同 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-carbon-monoxide | 一氧化碳无色无味，可让同一空间多人头痛恶心 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-heat-stroke | 热射病的核心是高热暴露伴中枢神经异常 | needs_revision | major | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-hypothermia-gentle | 低体温会影响判断、协调和心律 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-drowning-aftercare | 离水后看似恢复仍可能存在呼吸系统问题 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-spinal-precaution | 高能量外伤伴颈背痛或神经症状需减少不必要移动 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-seizure-first-aid | 大多数抽搐发作会自行停止，强行按压或塞物入口会伤人 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-severe-hypoglycemia | 意识受损时口服食物会造成误吸 | needs_revision | moderate | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-opioid-overdose | 呼吸慢、针尖样瞳孔和难以唤醒提示阿片过量 | needs_revision | moderate | clear | transport_denied |
| medical-v3-suicide-immediate | 明确计划和可及手段意味着需要立即保护 | needs_revision | major | clear | partially_relevant_not_specific |
| medical-v3-ectopic-pregnancy | 妊娠早期腹痛出血可能包括异位妊娠 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-postpartum-hemorrhage | 产后异常大量出血可在分娩后立即或稍后发生 | pass | none | clear | topic_supported_within_page |
| medical-v3-child-breathing | 胸壁凹陷、呻吟和无法进食可提示儿童呼吸负担 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-chemical-eye | 眼部化学品接触需要立即持续冲洗 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-tooth-avulsion | 外伤脱落的恒牙尽快复位或合适保存可提高存活机会 | needs_revision | minor | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-pregnancy-warning | 孕期严重头痛、视物异常和上腹痛可能提示高血压疾病 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-newborn-fever | 幼小婴儿发热可能是严重感染的唯一早期表现 | pass | none | clear | topic_aligned_by_title_and_targeted_text_review |
| medical-v3-delirium-acute | 数小时到数天波动的注意和意识改变不同于慢性痴呆 | needs_revision | critical | clear | topic_mismatch_and_transport_denied |

逐项 issues、修复建议和检查布尔值见 JSON 的 urgentReview.items。74 条均未直接下诊断，也未根据个人输入给出处方或个体治疗；这不抵消上述急救动作与来源问题。

## caution 全量扫描与分层抽样

- 结构缺失：0；非 HTTPS：0；精确剂量型指令：0。
- 严重红旗但无强升级词的高敏候选：99；主题入口/泛来源候选：81。完整 ID 在 JSON。
- CDC Hygiene Basics 被用于脓毒症、耐药、食源性疾病、屏障防护与 STI 等具体主张，是明确来源管线问题。

| 主题 | 抽样数 | caution 可用数 |
|---|---:|---:|
| 睡眠与昼夜节律 | 6 | 27 |
| 急救与紧急警示 | 3 | 3 |
| 用药、检查与健康素养 | 6 | 22 |
| 心理、脑健康与成瘾 | 6 | 26 |
| 营养、消化与口腔 | 6 | 21 |
| 感官与皮肤 | 6 | 26 |
| 运动、肌肉与骨骼 | 6 | 28 |
| 心血管、代谢与肾脏 | 6 | 28 |
| 感染预防与免疫 | 6 | 21 |
| 环境、旅行与职业健康 | 6 | 22 |
| 预防、癌症与筛查 | 6 | 22 |
| 生命周期、生殖与老龄健康 | 6 | 27 |

### 69 条抽样逐项状态

| ID | 标题 | 状态 | 等级 | 主要问题 |
|---|---|---|---|---|
| medical-sleep-apnea | 打鼾不总是无害的小事 | pass | none | 无 |
| medical-older-sleep | 年龄增长不意味着只需要很少睡眠 | pass | none | 无 |
| medical-v3-caffeine-duration | 下午的咖啡因可能在夜间仍有作用 | pass | none | 无 |
| medical-v3-restless-legs | 夜间静止时腿部难受并因活动缓解具有特征性 | pass | none | 无 |
| medical-v3-older-sleep | 年龄增长会改变睡眠结构，但严重失眠和极度嗜睡不应一概归为老化 | pass | none | 无 |
| medical-v3-sleep-medicine-review | 助眠药的收益、次日影响和依赖风险因药物与人而异 | pass | none | 无 |
| medical-cold-weather | 失温可在零度以上发生 | pass | none | 无 |
| medical-headache-red-flags | 大多数头痛并非危险，但模式突变要重视 | pass | none | 无 |
| medical-v3-head-injury-observe | 头部外伤后的危险表现可延迟出现 | needs_revision | critical | 抽搐、嗜睡加重、瞳孔不等与神经症状只写“及时就医”。 |
| medical-drug-interactions | 药物相互作用也包括食物和保健品 | pass | none | 无 |
| medical-online-pharmacy | 异常便宜且无需处方的网店可能出售假药或错误成分 | pass | none | 无 |
| medical-v3-pill-organizer-limits | 分药盒有助提醒，却不适合所有药和所有储存条件 | pass | none | 无 |
| medical-v3-acetaminophen-total | 对乙酰氨基酚过量可严重损伤肝脏，早期症状可能轻 | pass | none | 无 |
| medical-v3-pregnancy-medication | 孕期停药和继续用药都可能有风险 | pass | none | 无 |
| medical-v3-misinformation-check | 专业外观、名人背书和大量转发都不能证明健康主张 | pass | none | 无 |
| medical-depression | 抑郁不等于普通的短暂难过 | pass | none | 无 |
| medical-burnout | 职业倦怠是工作情境现象，不应包揽所有疲惫 | needs_revision | major | 自伤想法只写“需医疗帮助”，未明确立即联系危机/急救服务。 |
| medical-v3-social-connection-quality | 连接质量比联系人数量更能影响支持感 | needs_revision | major | 暴力、控制、威胁和危机只写“及时就医”，缺少人身安全/急救分支。 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-mania-warning | 明显少睡却不困、思维加速和冲动增加可能提示躁狂 | needs_revision | critical | 攻击、自伤、精神病性症状和危险驾驶只写“及时就医”。 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-gambling-chasing | 追损会把偶然损失转化为不断加码的循环 | needs_revision | major | 自伤与家庭暴力只写“及时就医”，缺少危机与安全服务分支。 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-caregiver-strain | 长期照护者也需要把自己的健康列入计划 | needs_revision | major | 暴力、自伤、走失和无法维持基本照护只写“及时就医”。 |
| medical-diarrhea | 腹泻最现实的短期风险常是脱水 | pass | none | 无 |
| medical-gum-bleeding | 刷牙出血不是应该长期忽略的正常现象 | pass | none | 无 |
| medical-v3-electrolyte-use | 普通短时活动通常不需要额外高糖电解质饮料 | pass | none | 无 |
| medical-v3-probiotic-strain | 益生菌效果具有菌株、剂量和适应证特异性 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-b12-plant-diet | 严格植物性饮食通常需要可靠的B12强化食品或补充来源 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-reflux-pattern | 反流触发因素具有个体差异，不需要机械禁掉所有常见食物 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-melanoma | 皮肤变化比“痣大不大”更值得追踪 | pass | none | 无 |
| medical-earwax | 棉签可能把耳垢推得更深 | pass | none | 无 |
| medical-v3-headphone-breaks | 音量、时长和耳机隔音共同决定听音风险 | pass | none | 无 |
| medical-v3-skin-self-check | 熟悉自身痣和皮损的变化比寻找所谓完美正常外观更实用 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-burn-cool-water | 尽快用凉的流动水降温能限制持续热损伤 | needs_revision | critical | 面/手/会阴、大面积、环形、电烧伤或吸入伤只写“及时就医”。 |
| medical-v3-insect-bite | 多数局部红痒会自行缓解，但反应和传播风险因地区而异 | needs_revision | critical | 呼吸困难、全身风团、面舌肿胀提示严重过敏，但只写“及时就医”。 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-talk-test | 说话测试能粗略帮助判断活动强度 | pass | none | 无 |
| medical-muscle-function | 肌力关系到起身、提物和稳定，而不只是外观 | pass | none | 无 |
| medical-v3-rest-days | 恢复日不是完全不动，也不是忽略持续疼痛 | pass | none | 无 |
| medical-v3-flexibility-specific | 柔韧训练应服务于具体动作需求，而非比较谁更软 | pass | none | 无 |
| medical-v3-bone-loading | 骨骼对负重与冲击的反应具有部位特异性 | pass | none | 无 |
| medical-v3-pain-monitoring | 训练中的轻微不适与组织损伤并非完全同义 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-home-bp-technique | 家庭血压测量的姿势和流程会改变读数 | pass | none | 无 |
| medical-a1c-window | 糖化血红蛋白反映的是一段时间的平均血糖 | pass | none | 无 |
| medical-v3-irregular-pulse | 脉搏快慢和是否规则提供不同信息 | pass | none | 无 |
| medical-v3-egfr-trend | eGFR是估算值，趋势通常比单次小幅波动更有信息 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-home-bp-average | 多日平均值比挑选一次最好或最坏读数更可靠 | pass | none | 无 |
| medical-v3-kidney-stone-fluid | 结石类型不同，预防策略也不完全相同 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-vaccine-reactions | 接种后短暂不适不等于感染了目标疾病 | pass | none | 无 |
| medical-tick-check | 蜱虫暴露后尽早检查身体，有助于及时发现附着 | pass | none | 无 |
| medical-v3-antibiotic-resistance-action | 耐药的是微生物，不是人的身体产生习惯 | needs_revision | critical | 脓毒症表现或严重药物过敏只写“及时就医”，且来源错指 CDC Hygiene Basics。 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-foodborne-clusters | 多人食用相同食物后相似发病是重要线索 | source_specificity_review | major | 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-barrier-methods | 正确持续使用屏障方法能降低多种性传播感染风险 | needs_revision | major | 性暴力与时间敏感暴露未给出急救/性暴力支持服务分支。 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-immunosuppressed-plan | 免疫功能较弱者应预先确认感染预防和就医路径 | pass | none | 无 |
| medical-wildfire-smoke | 野火烟雾中的细颗粒能进入肺深部 | pass | none | 无 |
| medical-long-flight-movement | 长途旅行中的久坐会增加静脉血栓风险 | pass | none | 无 |
| medical-v3-cold-wind | 风会加速裸露皮肤散热，湿衣物进一步增加风险 | pass | none | 无 |
| medical-v3-traveler-diarrhea | 食品与水卫生可降低风险，但无法消除所有旅行者腹泻 | pass | none | 无 |
| medical-v3-occupational-noise | 噪声性听力损失通常不可逆但可预防 | pass | none | 无 |
| medical-v3-climate-distress | 灾害与长期环境变化可引发焦虑、哀伤和无力感 | needs_revision | major | 自伤想法只写“及时就医”，没有危机/急救升级。 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-cervical-screening | 接种 HPV 疫苗后仍需要按当地建议筛查 | pass | none | 无 |
| medical-hepatitis-c-screening | 丙肝可多年无症状，检测后还有可治愈的治疗路径 | pass | none | 无 |
| medical-v3-breast-screening | 乳腺X线筛查的获益与假阳性会随年龄和风险变化 | pass | none | 无 |
| medical-v3-hbv-vaccine-liver | 乙肝疫苗和感染检测共同支持肝癌预防 | pass | none | 无 |
| medical-v3-symptoms-not-screening | 出现症状后即使年龄未到筛查标准也需要诊断评估 | pass | none | 无 |
| medical-v3-diabetes-screening | 筛查时点应结合年龄、体重、妊娠史和其他风险 | pass | none | 无 |
| medical-pregnancy-medicines | 怀孕后不能把所有药都停掉，也不能把非处方药当作天然安全 | pass | none | 无 |
| medical-sti-testing | 许多性传播感染没有症状 | pass | none | 无 |
| medical-v3-prenatal-continuity | 连续产检用于监测孕妇与胎儿变化，而不只是做超声 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |
| medical-v3-sti-window | 检测窗口期和采样部位取决于感染与暴露方式 | source_specificity_review | major | 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-postpartum-mental | 产后抑郁和焦虑可影响任何照护者，不等于不爱孩子 | needs_revision | critical | 自伤、伤婴、精神病性症状和极度混乱只写“及时就医”。 引用页与该条具体主题不匹配或过于宽泛。 |
| medical-v3-polypharmacy-goals | 药物数量多可能合理，但每一种都应有当前目标 | source_specificity_review | moderate | 引用页是主题入口或泛页，不能逐句支持当前精确主张。 |

## urgent 来源实际网络记录

方法：GET，跟随重定向，第一次 20 秒、失败后 35 秒重试。正文足够长的 HTTP 200 仍需主题核对。

| # | 原 URL | HTTP | 最终域名 | 标题 | 传输 | 语义 |
|---:|---|---:|---|---|---|---|
| 0 | https://www.cdc.gov/stroke/signs-symptoms/index.html | 200 | www.cdc.gov | Signs and Symptoms of Stroke ｜ Stroke ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 1 | https://www.cdc.gov/heart-disease/about/heart-attack.html | 200 | www.cdc.gov | About Heart Attack Symptoms, Risk, and Recovery ｜ Heart Disease ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 2 | https://www.nhs.uk/conditions/anaphylaxis/ | 200 | www.nhs.uk | Anaphylaxis - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 3 | https://www.nhs.uk/conditions/asthma/asthma-attack/ | 200 | www.nhs.uk | Asthma - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 4 | https://www.cdc.gov/heat-health/about/index.html | 200 | www.cdc.gov | About Heat and Your Health ｜ Heat Health ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 5 | https://www.cdc.gov/carbon-monoxide/about/index.html | 200 | www.cdc.gov | Carbon Monoxide Poisoning Basics ｜ Carbon Monoxide Poisoning ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 6 | https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide | 200 | www.nimh.nih.gov | 5 Action Steps to Help Someone Having Thoughts of Suicide - National Institute of Mental Health (NIMH) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 7 | https://www.nhs.uk/conditions/vision-loss/ | 200 | www.nhs.uk | Vision loss - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 8 | https://www.cdc.gov/niosh/motor-vehicle/driver-fatigue/index.html | 200 | www.cdc.gov | Driver Fatigue on the Job ｜ Motor Vehicle ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 9 | https://www.nhs.uk/conditions/heart-failure/ | 200 | www.nhs.uk | Heart failure - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 10 | https://www.nhs.uk/conditions/deep-vein-thrombosis-dvt/ | 200 | www.nhs.uk | DVT (deep vein thrombosis) - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 11 | https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia | 200 | www.niddk.nih.gov | Low Blood Glucose (Hypoglycemia) - NIDDK | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 12 | https://www.who.int/news-room/fact-sheets/detail/measles | 200 | www.who.int | Measles | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 13 | https://www.who.int/news-room/fact-sheets/detail/rabies | 200 | www.who.int | Rabies | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 14 | https://www.nimh.nih.gov/health/publications/bipolar-disorder | 200 | www.nimh.nih.gov | Bipolar Disorder - National Institute of Mental Health (NIMH) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 15 | https://www.nimh.nih.gov/health/publications/understanding-psychosis | 200 | www.nimh.nih.gov | Understanding Psychosis - National Institute of Mental Health (NIMH) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 16 | https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/harmful-interactions-mixing-alcohol-with-medicines | 200 | www.niaaa.nih.gov | Harmful Interactions ｜ National Institute on Alcohol Abuse and Alcoholism (NIAAA) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 17 | https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/retinal-detachment | 200 | www.nei.nih.gov | Retinal Detachment ｜ National Eye Institute | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 18 | https://www.cdc.gov/contact-lenses/prevention/index.html | 200 | www.cdc.gov | Preventing Eye Infections When Wearing Contacts ｜ Healthy Contact Lens Wear and Care ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 19 | https://www.nhs.uk/conditions/burns-and-scalds/treatment/ | 200 | www.nhs.uk | Burns and scalds - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 20 | https://www.fda.gov/drugs/buying-using-medicine-safely/understanding-over-counter-medicines | 200 | www.fda.gov | Understanding Over-the-Counter Medicines ｜ FDA | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 21 | https://medlineplus.gov/drugreactions.html | 200 | medlineplus.gov | Drug Reactions: MedlinePlus | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 22 | https://www.who.int/news-room/fact-sheets/detail/sepsis | 200 | www.who.int | Sepsis | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 23 | https://www.nhs.uk/tests-and-treatments/first-aid/ | 200 | www.sja.org.uk | First aid advice ｜ St John Ambulance | substantive_http_200 | redirected_to_generic_landing |
| 24 | https://www.nhs.uk/conditions/what-to-do-if-someone-has-a-seizure-fit/ | 200 | www.nhs.uk | What to do if someone has a seizure (fit) - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 25 | https://www.nhs.uk/conditions/fainting/ | 200 | www.nhs.uk | Fainting - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 26 | https://www.nhs.uk/conditions/poisoning/ | 200 | www.nhs.uk | Poisoning - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 27 | https://www.nhs.uk/conditions/first-aid/after-an-accident/ | 200 | www.sja.org.uk | First aid advice ｜ St John Ambulance | substantive_http_200 | redirected_to_generic_landing |
| 28 | https://www.nhs.uk/conditions/severe-head-injury/ | 200 | www.nhs.uk | Head injury and concussion - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 29 | https://www.nhs.uk/conditions/appendicitis/ | 200 | www.nhs.uk | Appendicitis - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 30 | https://www.nhs.uk/conditions/meningitis/ | 200 | www.nhs.uk | Meningitis - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 31 | https://www.cdc.gov/niosh/heat-stress/recommendations/acclimatization.html | 200 | www.cdc.gov | Acclimatization ｜ Heat Stress ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 32 | https://wwwnc.cdc.gov/travel/page/travel-to-high-altitudes | 200 | wwwnc.cdc.gov | Travel to High Altitudes ｜ Travelers Health ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 33 | https://www.cdc.gov/niosh/chemicals/ | 200 | www.cdc.gov | — | non_substantive_body | not_substantively_retrievable |
| 34 | https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/abdominal-aortic-aneurysm-screening | 200 | www.uspreventiveservicestaskforce.org | Recommendation: Abdominal Aortic Aneurysm: Screening ｜ United States Preventive Services Taskforce | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 35 | https://www.who.int/news-room/fact-sheets/detail/pre-eclampsia | 200 | www.who.int | Pre-eclampsia | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 36 | https://www.nimh.nih.gov/health/publications/perinatal-depression | 200 | www.nimh.nih.gov | Perinatal Depression - National Institute of Mental Health (NIMH) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 37 | https://www.cdc.gov/sudden-infant-death/about/index.html | 200 | www.cdc.gov | About SUID and SIDS ｜ SUID and SIDS ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 38 | https://www.nhs.uk/conditions/fever-in-children/ | 200 | www.nhs.uk | High temperature (fever) in children - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 39 | https://www.nhs.uk/conditions/confusion/ | 200 | www.nhs.uk | Sudden confusion (delirium) - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 40 | https://www.cdc.gov/rabies/hcp/clinical-care/post-exposure-prophylaxis.html | 200 | www.cdc.gov | Rabies Post-exposure Prophylaxis Guidance ｜ Rabies ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 41 | https://www.cdc.gov/hiv/prevention/pep.html | 200 | www.cdc.gov | Preventing HIV with PEP ｜ HIV ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 42 | https://www.cdc.gov/hygiene/about/index.html | 200 | www.cdc.gov | Hygiene Basics ｜ Water, Sanitation, and Environmentally Related Hygiene (WASH) ｜ CDC | substantive_http_200 | topic_mismatch |
| 43 | https://www.nimh.nih.gov/health/publications/suicide-faq | 200 | www.nimh.nih.gov | Frequently Asked Questions About Suicide - National Institute of Mental Health (NIMH) | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 44 | https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/retinal-detachment | 200 | www.nei.nih.gov | Retinal Detachment ｜ National Eye Institute | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 45 | https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/floaters | 200 | www.nei.nih.gov | Floaters ｜ National Eye Institute | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 46 | https://www.sja.org.uk/first-aid-advice/stroke/ | 200 | www.sja.org.uk | Stroke Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 47 | https://www.sja.org.uk/first-aid-advice/heart-attack/ | 200 | www.sja.org.uk | Heart Attack Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 48 | https://www.sja.org.uk/first-aid-advice/cardiac-arrest/ | 200 | www.sja.org.uk | Sudden Cardiac Arrest ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 49 | https://www.sja.org.uk/first-aid-advice/choking/ | 200 | www.sja.org.uk | Choking ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 50 | https://www.sja.org.uk/first-aid-advice/anaphylaxis/ | 200 | www.sja.org.uk | Anaphylaxis Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 51 | https://www.sja.org.uk/first-aid-advice/asthma-attack/ | 200 | www.sja.org.uk | Asthma Attack Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 52 | https://www.sja.org.uk/first-aid-advice/sepsis/ | 200 | www.sja.org.uk | Sepsis Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 53 | https://www.sja.org.uk/first-aid-advice/life-threatening-bleed/ | 200 | www.sja.org.uk | Life-threatening Bleed ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 54 | https://www.sja.org.uk/first-aid-advice/severe-burn/ | 200 | www.sja.org.uk | Severe Burn First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 55 | https://www.sja.org.uk/first-aid-advice/poisoning/ | 200 | www.sja.org.uk | Poisoning ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 56 | https://www.sja.org.uk/first-aid-advice/carbon-monoxide-poisoning/ | 200 | www.sja.org.uk | Carbon Monoxide Poisoning ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 57 | https://www.sja.org.uk/first-aid-advice/heatstroke/ | 200 | www.sja.org.uk | Heatstroke Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 58 | https://www.sja.org.uk/first-aid-advice/hypothermia/ | 200 | www.sja.org.uk | Hypothermia Symptoms and First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 59 | https://www.sja.org.uk/first-aid-advice/drowning/ | 200 | www.sja.org.uk | Drowning First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 60 | https://www.sja.org.uk/first-aid-advice/spinal-injury/ | 200 | www.sja.org.uk | Spinal Injury First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 61 | https://www.sja.org.uk/first-aid-advice/seizure/ | 200 | www.sja.org.uk | Seizure First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 62 | https://www.sja.org.uk/first-aid-advice/diabetes/ | 200 | www.sja.org.uk | Diabetic Emergencies ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 63 | https://www.samhsa.gov/substance-use/treatment/overdose-prevention | 403 | www.samhsa.gov | 403 Forbidden | http_denied_or_error | transport_denied |
| 64 | https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health | 200 | www.nimh.nih.gov | Caring for Your Mental Health - National Institute of Mental Health (NIMH) | substantive_http_200 | partially_relevant_not_specific |
| 65 | https://www.nhs.uk/conditions/ectopic-pregnancy/symptoms/ | 200 | www.nhs.uk | Ectopic pregnancy - Symptoms - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 66 | https://www.nhs.uk/pregnancy/labour-and-birth/early-days/ | 200 | www.nhs.uk | Early days - NHS | substantive_http_200 | topic_supported_within_page |
| 67 | https://www.nhs.uk/baby/health/when-to-get-urgent-medical-help-for-babies-and-children-under-5/ | 200 | www.nhs.uk | When to get urgent medical help for babies and children under 5 - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 68 | https://www.sja.org.uk/first-aid-advice/eye-injury/ | 200 | www.sja.org.uk | Eye Injury First Aid ｜ St John Ambulance | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 69 | https://www.nhs.uk/conditions/knocked-out-tooth/ | 200 | www.nhs.uk | Knocked-out tooth - NHS | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 70 | https://www.cdc.gov/hearher/maternal-warning-signs/index.html | 200 | www.cdc.gov | Urgent Maternal Warning Signs and Symptoms ｜ HEAR HER Campaign ｜ CDC | substantive_http_200 | topic_aligned_by_title_and_targeted_text_review |
| 71 | https://www.nia.nih.gov/health/what-do-we-know-about-healthy-aging | 405 | www.nia.nih.gov | Human Verification | http_denied_or_error | topic_mismatch_and_transport_denied |

特别记录：

- NEI 飞蚊页曾超时，重试恢复 200；不保证未来稳定。
- SAMHSA 为 403；NIA 为 405 Human Verification；NIOSH chemicals 为 200 但正文是极短拒绝页，均不记为已核正文。
- 两个旧 NHS 急救 URL 最终落到 St John 通用首页，不能记为窒息/出血的具体证据。
- NHS early-days 正文确有产后突然大量出血伴晕厥/心悸需急救提示，因此 medical-v3-postpartum-hemorrhage 不按误链处理。

## 放行条件

1. 修复 4 条 critical urgent 并重验。
2. 修复 5 条 major urgent；moderate/minor 同次收口。
3. 对 99 个 caution 高敏候选逐条分流，至少先修抽样已确认的 12 条。
4. 替换明确错配泛来源并重新执行全部 urgent URL GET 与主题核对。
5. 只有 critical=0、major=0 且已确认 caution 升级问题清零，医学内容才可标为通过。

原始医学文件 SHA-256：EDB6D12B12F59EBBB7F963C5247DDE90F49C9B1FDA420600C0EC7073D98ECC14。
