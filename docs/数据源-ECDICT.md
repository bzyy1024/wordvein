# 数据源档案：ECDICT

> 用途：记录 ECDICT 的**元数据**（字段定义、文件清单、许可、实测统计、与我们 schema 的映射关系），供导入脚本与数据生产流程对照。
> 原始文件统一存放于 `data/raw/repo/ECDICT-master/`（唯一数据源，无重复副本）。
> 校验值（SHA256）见 `data/raw/_meta.json`，统计报告见 `data/raw/_stats.json`。
> 统计脚本：`scripts/stats-ecdict.mjs`（`node scripts/stats-ecdict.mjs` 可重跑）。

---

## 一、数据源基本信息

| 项 | 值 |
|---|---|
| 项目 | ECDICT — Free English to Chinese Dictionary Database |
| 仓库 | https://github.com/skywind3000/ECDICT |
| 分支 / commit 包 | `master`（整仓 zip） |
| **许可** | **MIT**（`Copyright (c) 2025 Linwei`）— 商用友好，仅需保留版权声明 |
| 署名要求 | 在 `/about` 页注明 "ECDICT (MIT) by Linwei" 即可满足许可义务 |

**许可结论**：MIT 是全站最友好的一档，**不需要**像 CC BY-SA 那样做署名链路追踪或衍生作品同协议共享。本站的释义/音标/词频/考试标签可以放心入库并展示。

---

## 二、仓库文件清单（已全部取回）

| 文件 | 大小（字节） | 约合 | 用途 |
|---|---:|---:|---|
| `ecdict.csv` | 65,933,428 | 62.9 MiB | **主词典**，770,611 条 |
| `stardict.7z` | 51,577,449 | 49.2 MiB | 最新版压缩数据库（README 称 ecdict.csv 为"基础版本"） |
| `lemma.en.txt` | 2,318,694 | 2.2 MiB | lemma 词形还原表（BNC 全语料生成） |
| `wordroot.txt` | 370,702 | 362 KiB | **词根词缀库（JSON）**，611 词素 |
| `resemble.txt` | 529,302 | 517 KiB | 形近词表 |
| `stardict.py` | 62,339 | 61 KiB | 官方 Python 读写库（CSV/SQLite/MySQL） |
| `dictutils.py` | 29,963 | 29 KiB | 维护工具集 |
| `README.md` | 18,414 | 18 KiB | 官方字段定义（本文档依据） |
| `linguist.py` | 8,047 | 7.9 KiB | WordNet / NodeBox 封装 |
| `del_bfz.py` | 2,348 | 2.3 KiB | 清理工具 |
| `ecdict.mini.csv` | 4,204 | 4.1 KiB | 格式样例 |
| `LICENSE` | 1,063 | 1.0 KiB | MIT 许可原文 |

> **`stardict.7z` 暂不解压**：需 7-Zip 且内部为 SQLite/StarDict 格式。MVP 用 `ecdict.csv` 已足够；若后续需要更全版本再处理。

---

## 三、`ecdict.csv` 字段定义与**实测填充率**

表头共 14 列：

```csv
word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
```

| 字段 | 官方解释 | 填充率* | 我们的处理 |
|---|---|---:|---|
| `word` | 单词名称 | 100% | → `words.word`，统一小写 |
| `phonetic` | 音标，以英语音标为主 | **51.8%** | → `words.phonetic`，补 `/…/` |
| `definition` | 释义（英文），**每行一个** | **40.8%** | → `senses[].definition_en`，按 `\n` 切分 |
| `translation` | 释义（中文），**每行一个** | **99.8%** ✅ | → `senses[].definition_cn`（**必填字段唯一来源**） |
| `pos` | 词性位置，`/` 分割，如 `n:46/v:54` | **0%** ⚠️ | **整列为空，需另找来源** |
| `collins` | 柯林斯星级 | 3.4% | → `difficulty` 推导 |
| `oxford` | 是否牛津 3000 核心词 | 0.9% | → `difficulty` 推导 |
| `tag` | 考试标签，**空格分割** | 4.1% | → `word_tags` → `tags` |
| `bnc` | BNC 语料库词频序 | 12.4% | 传统语料词频 |
| `frq` | 当代语料库词频序 | 11.5% | → **主用** `words.freq_rank` |
| `exchange` | 时态/复数变换，`/` 分割 | 23% | 词形反查（二期） |
| `detail` | JSON 扩展信息（**待添加**） | ~0% | 忽略 |
| `audio` | 音频 url（**待添加**） | 0% | 忽略 |

\* 填充率口径：**纯字母单词子集**（365,948 条）中该字段非空且非 `"0"` 的比例。全量口径（含 40 万短语条目）会显著更低。

### ⚠️ 实测与官方文档的 3 处出入

| 项 | README 描述 | 实测结果 | 影响 |
|---|---|---|---|
| `pos` 词性 | "数据库中有 pos 字段…扫描语料库生成" | **整列为空（0%）** | `senses[].pos` 无直接来源，需从 `translation` 的词性前缀（`n.` `v.` `adj.`）正则抽取，或引入 WordNet |
| `bnc` / `frq` 词频 | "给每个单词标注…词频顺序" | 仅约 12% 词条有值（约 4.5 万词） | 长尾词无 `freq_rank`，同族词排序需有兜底（如按 `difficulty` 或字母序） |
| 词条性质 | 未说明 | **52.5% 是多词短语**（`gonorrheal bubo`、`robbery conviction`） | 必须按 `^[a-z]+$` 过滤，否则词表被短语污染 |

### 隐藏字段 `sw`（strip-word）

不由 CSV 提供，加载时自动生成，用于模糊匹配：

```python
def stripword(word):
    return (''.join([n for n in word if n.isalnum()])).lower()
```

搜索 "long-time" 时能同时命中 `longtime`、`long time` 等形态。**建议我们自己实现同样的归一化列**，配合 `pg_trgm` 做容错检索。

### `exchange` 变换类型码

| 码 | 含义 | 码 | 含义 |
|---|---|---|---|
| `p` | 过去式（did） | `s` | 名词复数 |
| `d` | 过去分词（done） | `0` | Lemma |
| `i` | 现在分词（doing） | `1` | Lemma 的变换形式 |
| `3` | 第三人称单数 | `r` | 比较级（-er） |
| `t` | 最高级（-est） | | |

---

## 四、`wordroot.txt` — 词根词缀库（本项目核心资产）

⚠️ 文件名是 `.txt`，**内容实为 JSON 对象**，需按 JSON 解析。

### 4.1 结构

```json
{
    "hom": {
        "meaning": "man, human",
        "class": "root",
        "root": "hom",
        "example": ["homage", "homicide", "hominoid", "Homo sapiens"],
        "origin": "Latin"
    },
    "-less": {
        "antonyms": "-ful1",
        "synonyms": "a-1, an-1",
        "class": "adjective-forming suffix",
        "example": ["aimless", "airless", "baseless", "..."],
        "origin": "..."
    }
}
```

### 4.2 实测统计

| 指标 | 值 |
|---|---:|
| 词素总数 | **611** |
| 其中 `root` | 423 |
| 其中 `prefix` | 110 |
| 其中后缀（各类合计） | 78 |
| `example` 总数 | 9,356 |
| 去重后唯一例词 | 6,789 |
| 清洗后（去数字后缀 + 纯字母） | 6,732 |
| **主词典中可匹配** | **6,725（99.9%）** |

**class 分布**

| class | 数量 |
|---|---:|
| root | 423 |
| prefix | 110 |
| noun-forming suffix | 41 |
| adjective-forming suffix | 28 |
| verb-forming suffix | 4 |
| adjective- and noun-forming suffix | 3 |
| adverb-forming suffix | 2 |

**origin 分布**

| origin | 数量 |
|---|---:|
| Latin | 377 |
| Greek | 205 |
| Old English | 20 |
| Latin and Greek | 8 |
| Middle English | 1 |

**字段覆盖率**

| 字段 | 覆盖 | 说明 |
|---|---:|---|
| `meaning` / `origin` / `root` / `class` / `example` | 611（100%） | 全量齐备 |
| `function` | 110 | 仅 prefix 有 |
| `synonyms` | 104 | 逗号分隔 → `related` |
| `antonyms` | 26 | → `opposites` |

> 611 个词素落在技术方案预估的 MVP 区间（500~800 行），**词素表可直接进入"汉化 + 审核"阶段**，无需从零整理。

### 4.3 可拆解词的数据完整度（6,725 词）

这是 MVP 真正落地的那批词，缺口必须清楚：

| 字段 | 覆盖 |
|---|---:|
| `translation`（中文释义） | **100%** |
| `phonetic`（音标） | **99.6%** |
| `definition`（英文释义） | **97.2%** |
| `exchange`（词形变化） | 56.8% |
| `tag`（考试标签） | 53.6% |
| `bnc` | 70.9% |
| `frq` | 79.7% |
| `pos` | **0%** |

**结论**：音标与释义这两个最关键的字段近乎满覆盖，可以直接建站；缺口集中在 `pos`（全缺）和 `frq`（约 20% 缺）。

---

## 五、到本项目 Schema 的字段映射

### 5.1 `morphemes.jsonl`（源：`wordroot.txt`）

| 源字段 | 我们的字段 | 转换规则 |
|---|---|---|
| JSON key | `form` | 取复合形式**第一项**为主 form，保持连字符 |
| key 其余项 | `variants` | `"-able, -ible, -ble"` → form=`-able`, variants=[`-ible`,`-ble`] |
| `class` | `type` | `root`→`root`；`prefix`→`prefix`；`*-forming suffix`→`suffix` |
| `meaning` | `meaning_en` | 直接搬运（MIT 允许） |
| — | `meaning_cn` | **缺失，需生产**：611 条批量汉化 + 抽检 |
| `origin` | `origin_lang` | Latin→`L`；Greek→`G`；Old English→`OE`；Middle English→`ME`；"Latin and Greek"→`L`（`etymology` 注明双源） |
| `synonyms` | `related` | 逗号拆分，**剥离数字消歧后缀**（`-ful1`→`-ful`） |
| `antonyms` | `opposites` | 同上 |
| `function` | `caution` / `story` | 并入说明性字段 |
| — | `etymology` | 二期由 Wiktionary 补充 |

### 5.2 `words.jsonl`（源：`example[]` ∩ `ecdict.csv`）

| 源字段 | 我们的字段 | 说明 |
|---|---|---|
| `word` | `word` | 已小写、已过滤为纯字母 |
| `phonetic` | `phonetic` | 补 `/…/` |
| `translation` | `senses[].definition_cn` | 按 `\n` 拆分；剔除 `[网络]` 噪声行 |
| `definition` | `senses[].definition_en` | 按 `\n` 拆分 |
| `pos` | `senses[].pos` | **源数据为空**，需从 `translation` 前缀抽取 |
| `frq` | `freq_rank` | 缺失约 20%，需兜底排序 |
| `tag` | `tags` | 按空格拆分 → 考试标签 |
| `collins` / `oxford` | `difficulty` | 推导 1~5 |

---

## 六、清洗要点（导入脚本必须处理）

1. **过滤多词短语**：77 万条目里 **40.4 万** 是短语/变体/专名，按 `^[a-z]+$` 过滤，保留 36.6 万纯单词。
2. **剥离消歧数字后缀**：`soundless1`→`soundless`、`in-2`→`in-`，否则与主词典匹配失败（未清洗时漏配 38 个，清洗后仅剩 7 个）。
3. **复合 form 拆分**：key 可能是 `"-able, -ible, -ble"`、`"metr, -meter, -metry"`。第一项作 `form`，其余进 `variants`。
4. **`meaning` 是英文**：`meaning_cn` 全站必填，611 条需批量汉化后抽检。
5. **`pos` 无来源**：从 `translation` 义项前缀（`n.` / `v.` / `adj.` / `adv.`）正则抽取，抽不到的留 `null`（schema 已允许）。
6. **`translation` 有噪声行**：形如 `[网络] 胡德；兜帽`，建议剔除，只保留带词性前缀的规范义项。
7. **编码**：UTF-8 无 BOM；不要用 Excel 直接打开。

---

## 七、网络通道说明（本机实测）

| 域名 | 状态 | 结论 |
|---|---|---|
| `api.github.com` | ✅ 200 | 可用（Contents API 取 base64，限单文件 <1MB） |
| `codeload.github.com` | ✅ 200 | **可用**，整仓 zip 下载（本次取数走这条） |
| `raw.githubusercontent.com` | ❌ TLS 连接被重置（`curl (35)`） | 不可用 |
| `cdn.jsdelivr.net` | ❌ 超时 | 不可用 |

```powershell
# 整仓打包（推荐，本次采用）
Invoke-WebRequest -Uri "https://codeload.github.com/skywind3000/ECDICT/zip/refs/heads/master" `
                  -OutFile "data\raw\ecdict-repo.zip"
Expand-Archive -Path "data\raw\ecdict-repo.zip" -DestinationPath "data\raw\repo" -Force
```

> 未认证 GitHub API 限流 60 次/小时；频繁取数建议配置 `GITHUB_TOKEN`。

---

## 八、当前进度

**已完成**

- [x] ECDICT 整仓下载至 `data/raw/repo/ECDICT-master/`（12 个文件全部到位）
- [x] SHA256 校验清单 `data/raw/_meta.json`
- [x] 全量统计报告 `data/raw/_stats.json`（脚本 `scripts/stats-ecdict.mjs`）
- [x] 字段定义梳理 + 到 schema 的映射关系
- [x] 数据缺口识别（`pos` 全空、`frq` 缺 20%、52.5% 短语污染）

**待执行**

- [ ] 编写 `scripts/build-morphemes.ts`：`wordroot.txt` → `morphemes.jsonl`
- [ ] 编写 `scripts/build-words.ts`：6,725 词 ∩ `ecdict.csv` → `words.jsonl`
- [ ] 生产 `meaning_cn`（611 条汉化）
- [ ] 确认 `pos` 与 `freq_rank` 缺失值的兜底策略

---

## 九、合规与出处（`/about` 页文案素材）

```
词典数据：ECDICT（https://github.com/skywind3000/ECDICT），MIT License，Copyright (c) 2025 Linwei
词根词缀数据：ECDICT 项目内 wordroot.txt，同上许可
```

如需引入 Wiktionary / kaikki 系数据补充词源（CC BY-SA），需另行评估署名与传染性条款。
