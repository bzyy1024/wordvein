# 英语词根词缀词典

**在线访问：https://word.thinkmeta.site**

输入一个单词，看清它由哪些词根 / 前缀 / 后缀拼成，以及含义是怎么推出来的；
也可以反过来，从一个词根出发查看同族词——用词源逻辑一次记一串，而不是把每个词当独立字符串死记。

```
predict = pre-（预先）+ dict（说）  →  预先说出  →  预言，预测
```

## 为什么做这个

背单词的低效，在于把 `predict` / `dictate` / `contradict` / `verdict` 当成四个互不相干的词。
它们共享词根 `dict`（说），区别只在前后缀。看清这层关系，一串词只需记一次。

普通词典给释义，词根词典给词素列表，但很少把**拆解关系**本身当成一等数据来建库：
每个词明确挂到具体词素上、带顺序和在该词中的具体含义，每个词素都能反查它出现在哪些词里。
本站的数据模型就是围绕这一点建的（见 `docs/schema.sql`）。

## 功能

| 功能 | 说明 |
| --- | --- |
| 单词拆解 | 音标、CEFR、难度、词频，按「后缀 → 前缀 → 词根」切分并高亮配色 |
| 构词串讲 | 一句话把各词素含义串成单词含义（`words.gloss`），本站区别于普通词典的关键字段 |
| 同族词反查 | 顺着共享词素找到一串同源词 |
| 词素详情 | 词素的中文含义、来源语言、词源、变体、易混提示，以及它参与构成的所有词 |
| 词素总览 | 按 root / prefix / suffix 浏览，按关联词数排序 |
| 搜索容错 | `pg_trgm` 模糊匹配，拼错也能找到；支持用中文含义反查词素 |
| 收藏 | 单词页一键收藏，`/favorites` 回看，无需登录 |
| 明暗主题 | 浅色 / 深色 / 跟随系统三态，首屏无闪烁 |
| 管理端 | 独立端口 + 口令登录，看词库规模、活跃访客、被收藏最多的词、导入批次 |

## 页面一览

| 路径 | 内容 |
| --- | --- |
| `/` | 首页搜索入口 |
| `/word/[word]` | 单词详情（拆解 + 串讲 + 义项 + 同族词） |
| `/morpheme/[slug]` | 词素详情 |
| `/morphemes` | 词素总览 |
| `/search?q=` | 搜索结果 |
| `/favorites` | 我的收藏（客户端加载，不进搜索引擎） |
| `/about` | 关于与数据来源 |
| `/admin` | 管理端（需口令） |

## 当前数据

| 项 | 数量 |
| --- | --- |
| 单词 | 6,709 |
| 词素 | 610 |
| 拆解关系 | 6,585 |
| 义项 | 8,265 |
| 规则自动拆解覆盖率 | 94%（6,312 / 6,709） |

未命中规则切分的词在页面走兜底文案，而不是显示空白。

---

## 本地运行

需要 Node >= 22 与 pnpm，以及一个 PostgreSQL 实例（推荐 15+，需 `pg_trgm`）。

```bash
pnpm install
cp .env.example .env      # 填入 DATABASE_URL
pnpm db:init              # 建扩展 + 建表（幂等，可重复执行）
pnpm import               # 导入 data/*.jsonl
pnpm dev                  # http://localhost:3000
```

Docker（数据库用外部实例，compose 只跑应用，不部署数据库）：

```bash
docker compose up -d --build   # 构建并启动
docker compose logs -f         # 跟日志
docker compose ps              # 看状态
docker compose down            # 停止
```

两个服务共用同一个镜像，各占一个端口：

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| `web` | `WEB_PORT`（默认 3000） | 站点 |
| `admin` | `ADMIN_PORT`（默认 8311） | 管理端，需口令登录 |

镜像 tag 固定为 `english-word:local`（不用 `latest`），并带
`LABEL com.centurylinklabs.watchtower.enable=false`，宿主机上的 watchtower 不会扫描 / 重建本容器。

## 数据从哪来

词库来自 **ECDICT**（MIT）：主词典 `ecdict.csv` 提供音标 / 释义 / 词频 / 考试标签，
`wordroot.txt` 提供 611 条词根词缀。原始文件约 120MB，**不在仓库中**（`data/raw/` 已忽略），需自行下载：

```bash
# 下载 ECDICT 整仓 zip 并解压到 data/raw/repo/ECDICT-master/
# https://github.com/skywind3000/ECDICT
```

然后跑管线：

```
ECDICT wordroot.txt
   ↓ pnpm data:morphemes
data/morphemes.jsonl + data/morphemes.examples.jsonl
   ↓ pnpm data:words          （自动切分：后缀 → 前缀 → 词根，并生成 gloss）
data/words.jsonl
   ↓ pnpm import              （幂等 upsert + 单事务 + 回填 word_count）
PostgreSQL
```

| 命令 | 作用 |
| --- | --- |
| `pnpm db:init` | 建扩展 + 建表（幂等） |
| `pnpm db:probe` | 探活：权限、各表行数、样例 |
| `pnpm db:check` | 校验 `docs/schema.sql` 与 Drizzle 镜像是否一致 |
| `pnpm db:gloss` | 重算 `words.gloss`（派生字段） |
| `pnpm data:morphemes` | `wordroot.txt` → 词素中间文件 |
| `pnpm data:words` | 生成 `data/words.jsonl`（自动拆解 + gloss） |
| `pnpm data:cn` | 把 `data/morpheme-cn.json` 的中文释义写回词素 |
| `pnpm import` | 导入数据库（可加 `--dry-run` / `--truncate`） |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 连接串，唯一来源。密码含特殊字符需 URL 编码；远程库按需追加 `?sslmode=require` |
| `DB_SCHEMA` | 目标 schema，默认 `public`。PG15+ 普通账号无 `public` 的 CREATE 权限，建议用自建 schema，建表脚本会自动创建 |
| `SITE_URL` | 站点对外地址，用于 `sitemap.xml` / `robots.txt` / canonical。运行时读取，换域名重启即可 |
| `WEB_PORT` | 站点映射端口，默认 3000 |
| `ADMIN_PASSWORD` | 管理端口令，必填。未设置时管理端拒绝登录 |
| `ADMIN_PORT` | 管理端映射端口，默认 8311 |
| `ADMIN_COOKIE_SECURE` | 管理端走 HTTPS 时设为 1，给会话 Cookie 加 Secure；内网 http 保持 0 |

连接串由 `src/db/connection-string.ts` 统一派生并自动附加 `search_path`，业务代码不感知 host / port。

## 数据表

| 表 | 内容 |
| --- | --- |
| `words` | 单词：音标、词频、难度、`gloss`（构词串讲） |
| `senses` | 义项：词性、中英释义、例句 |
| `morphemes` | 词素：词根 / 前缀 / 后缀，中英含义、来源语言、`word_count` |
| `word_morphemes` | 单词 ↔ 词素拆解关系（含顺序与在词中的具体作用） |
| `morpheme_relations` | 词素之间的关系：变体 / 相关 / 反义 / 派生 |
| `tags` / `word_tags` | 考试与主题标签 |
| `import_batches` | 每次导入的留痕 |
| `users` | 匿名访客：uuid + 查词计数，不含手机号 / 邮箱等个人信息 |
| `favorites` | 收藏：`user_id` + `word_id`，一人一词一条 |

`docs/schema.sql` 是**唯一权威**表定义，`src/db/schema.ts` 是供类型与 drizzle-kit 使用的镜像，
两者由 `pnpm db:check` 校验防漂移。

## 目录

```
src/app          页面：首页 / 单词 / 词素 / 词素总览 / 搜索 / 收藏 / 关于
src/app/admin    管理端（独立端口，口令登录）：概览 / 用户
src/components   搜索框、词素卡、构词拆解、义项列表、收藏、主题切换
src/lib/queries  数据访问层（仅服务端）
src/lib/store    收藏与访客的数据访问层
scripts          建表、导入、校验、数据生成
docs             技术方案、数据格式规范、数据源档案、需求-第二期、权威 schema.sql
```

## 技术栈

- Next.js 15（App Router）+ React 19 + Tailwind CSS 3
- PostgreSQL，查询走 `pg` 原生 SQL；Drizzle 仅作类型镜像与本地迁移
- 拼写容错依赖 `pg_trgm` 的 GIN 索引

## 实现要点

几个不显然的取舍，改动相关代码前建议先读：

1. **首页与 sitemap 用 `force-dynamic`，不用 ISR。** 镜像构建期连不上数据库，
   若走 ISR 会先把页面渲染成「统计全为 0 / sitemap 为空」，上线后要等 revalidate 过期才恢复。
2. **管理端鉴权放在 Server Component，不放在 `middleware.ts`。**
   Next.js 会把 middleware 里的 `process.env` 在**构建时内联**，而镜像构建时读不到 `ADMIN_PASSWORD`，
   写在 middleware 里的校验会永远失败（表现为登录后又跳回登录页）。
3. **`SITE_URL` 用非 `NEXT_PUBLIC_` 变量。** `NEXT_PUBLIC_*` 同样会被构建时内联，
   用它会导致 sitemap 里的地址恒为 `http://localhost:3000`。
4. **暗色主题用集中映射而非逐处 `dark:`。** 组件里散着 180 多处颜色类，
   改法是在 `globals.css` 的 `.dark` 作用域下把浅色类按档位重映射，现有页面零改动即适配。
5. **构建期缺数据库凭据不抛错，运行期抛错。** 构建期返回占位串让镜像能打包（查询降级为空），
   运行期缺凭据必须立刻暴露，避免带病上线。

## 已知限制

- 拆解由规则自动切分，覆盖率 94%，未命中的词走兜底；部分拆解仍需人工或 LLM 校正
- 释义与例句直接来自 ECDICT，未做人工校对，可能存在义项缺失或对应不准
- 收藏挂在浏览器匿名 uuid 上，**换设备或清缓存不跟随**（未做账号体系）
- 管理端的访客统计只有 uuid 与计数，没有时间序列与留存分析

## 贡献

欢迎 issue 与 PR。几点约定：

- 改表结构时，`docs/schema.sql` 与 `src/db/schema.ts` 必须同步修改，并提交前跑 `pnpm db:check`
- 提交前跑 `pnpm typecheck` 与 `pnpm build`
- 不要提交 `.env` 与 `data/raw/` 下的原始数据

## 许可

- **代码：MIT**，见 [LICENSE](LICENSE)
- **词库数据：来自 [ECDICT](https://github.com/skywind3000/ECDICT)，MIT（Copyright (c) 2025 Linwei）**，
  其许可适用于数据库内容，不适用于本仓库代码
