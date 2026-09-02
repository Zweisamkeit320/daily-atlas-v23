# 德语固定女声朗读素材

本目录包含 500 个 MP3 文件及 `manifest.json`，每个文件只朗读对应
德语知识条目的 `exampleGerman`。按钮由用户主动点击后播放，不自动播放；
Service Worker 会把清单和全部 500 个文件纳入离线缓存。

## 声音与边界

- 合成引擎：Piper 1.6.0。
- 固定模型：`de_DE-eva_k-x_low`，单说话人、德语、16 kHz。
- 声音呈现：女声。模型卡本身不含性别字段，因此本项目另以公开论文中
  “female speaker Eva K”的说明作为声音呈现依据；这与 Web Speech API
  通过名称猜测性别不同。
- 生成音频是合成语音，不是真人针对本项目录制，也不表示说话人或数据集
  贡献者为本项目背书。
- M-AILABS 数据许可声明完整保存在 `LICENSE-M-AILABS.txt`。
- 固定文件缺失或播放失败时，应用才回退到设备 Web Speech API；该 API
  没有可靠的声音性别字段，因此后备音色不承诺性别。

## 可重建与校验

网页发布包交付现成 MP3、清单、许可通知与生成脚本，不包含 Piper 推理
运行时或模型权重；普通播放及 Node.js 构建校验不需要这些外部文件。重新
生成音频时，先按 `requirements-assets.txt` 安装固定依赖（其中
`Pillow==10.4.0` 用于其他本地资产，朗读生成使用
`piper-tts==1.6.0` 与 `lameenc==1.8.1`），再另行下载模型与配置：

```powershell
python -m pip install -r requirements-assets.txt
python -m piper.download_voices --download-dir .\work\piper-model de_DE-eva_k-x_low
python scripts\build-german-audio.py `
  --model .\work\piper-model\de_DE-eva_k-x_low.onnx `
  --config .\work\piper-model\de_DE-eva_k-x_low.onnx.json
```

固定模型、配置和依赖使生成过程可审计、可再次执行，但 Piper 推理与 MP3
编码没有被本项目证明为跨两次运行字节确定；实际复建结果必须重新生成清单，
不能用“同版本”推断 MP3 SHA-256 必然相同。随包清单中的
`assetSnapshotAt` 是素材快照日期，不冒充实际合成完成时刻；每项
`durationMs` 由编码前 PCM 样本数计算，只是合成波形时长，不等同于解码后
MP3 播放器报告的精确时长。

生成脚本会拒绝非预期的模型/config SHA-256，并逐项记录句子哈希、当前
MP3 哈希、字节数和 PCM 样本时长。只校验现有随包素材：

```powershell
python scripts\build-german-audio.py `
  --model .\work\piper-model\de_DE-eva_k-x_low.onnx `
  --config .\work\piper-model\de_DE-eva_k-x_low.onnx.json `
  --check
```
