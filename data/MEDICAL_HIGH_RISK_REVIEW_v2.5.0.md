# 今日万象 v2.5.0 医学高风险内容独立复核

复核日期：2026-09-02  
结论：`INDEPENDENT_CONTENT_SAFETY_REVIEW_PASS`

## 范围

- 当前输入：`data/raw/medical500.json`
- 当前 SHA-256：`855C734A49A70C0308CAF5DF76B1B91062A99E9DDE3C93B0000903A17D131743`
- 总条目：500；一般 153、需谨慎 273、紧急 74。
- 自动结构与危险措辞筛查覆盖 500/500；高风险统计子集为 caution／urgent 347 条。
- 独立只读语义复核聚焦紧急识别、急救、用药安全、药物过量、自伤危机与孕产心理健康，并重新核对 v2.4.0 报告中的阻断项。

## 复核结论

当前目录中的脓毒症、心脏骤停、成人窒息、严重出血、突然混乱、自杀危机、严重低血糖、阿片过量、产后心理危机和复方非处方药等样本，均保留主题匹配的来源、可执行但不替代专业服务的行动提示，以及必要的急救／及时就医边界。v2.4.0 报告记录的来源错配、语句拼接和紧急升级不足没有在当前文本中复现。

本结论允许这些内容以“一般健康科普”范围发布，不把 HTTP 可达性当作内容正确，也不宣称医生签字、临床指南认证、诊断、处方或个体化治疗。来源页面和医学事实如在未来发生明确变化，应按 v2.5.x 维护规则更正。

## 代表性复核条目

- `medical-v3-sepsis-recognition`
- `medical-v3-cardiac-arrest-aed`
- `medical-v3-adult-choking`
- `medical-v3-delirium-acute`
- `medical-major-bleeding`
- `medical-v3-suicide-immediate`
- `medical-v3-severe-hypoglycemia`
- `medical-v3-opioid-overdose`
- `medical-v3-postpartum-mental`
- `medical-otc-duplicate`

机器可读结论见 `data/medical-high-risk-review.v2.5.0.json`；自动筛查见 `data/medical-high-risk-screen.v2.5.0.json` 与 `data/MEDICAL_HIGH_RISK_SCREEN_v2.5.0.md`。旧报告继续保留为历史审查记录，但不能覆盖本报告绑定的当前哈希。
