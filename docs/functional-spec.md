# [Youtube] Video Memory · 功能规格说明（净室重写基准）

> 本文档从 `[20251116] v1.0.1` 版脚本的实际行为中抽取而来，是净室重写（clean-room rewrite）的唯一依据，也是验收清单。
> 编号形如 **F-x.y** 的条目是需要实现并验收的功能点；**BUG-n** 是旧版中导致“播放进度丢失”的缺陷；**D-n** 是新版有意与旧版不同的行为。

---

## 0. 范围与运行环境

| 项 | 规格 |
|---|---|
| 运行方式 | 用户脚本（Tampermonkey / Violentmonkey / Orion / iOS Userscripts 等） |
| 匹配 | `*://*.youtube.com/*`（含 `www.` 与 `m.`），在 YouTube 的 SPA 内常驻 |
| 授权 | `GM_getValue` `GM_setValue` `GM_deleteValue` `GM_listValues`；无这些 API 时自动降级为仅 localStorage |
| 视频识别 | 观看页 `/watch?v=<id>`。Shorts、嵌入页不在范围内 |
| 外部服务 | DeArrow 标题 `https://sponsor.ajay.app/api/branding?videoID=<id>`；YouTube oEmbed 原标题 `https://www.youtube.com/oembed?format=json&url=https://youtu.be/<id>`；字幕接口（OpenAI 兼容，可配置）；Font Awesome 6.5.1 图标 CSS（cdnjs） |
| 安全 | YouTube 启用 Trusted Types，**任何地方都不得写 `innerHTML`**（包括赋空字符串），只能用 DOM API 构建界面 |

---

## 1. 持久化数据格式（必须兼容旧版）

### F-1.1 视频记录
- 键：`Youtube_SaveResume_Progress-<videoId>`
- 值：JSON **字符串**（localStorage 与 GM 存储中都以字符串保存）

| 字段 | 类型 | 含义 |
|---|---|---|
| `videoProgress` | number（秒，可带小数） | 最近一次保存的播放位置 |
| `saveDate` | number（ms 时间戳） | 最近一次保存时间 |
| `videoName` | string | 展示标题：有 DeArrow 标题时为 DeArrow 标题，否则为原标题，均无则 `Unknown Title` |
| `originalTitle` | string \| null | YouTube 原标题 |
| `videoNote` | string（可缺省） | 用户笔记；为空时删除该字段 |
| `videoTranscript` | string（可缺省） | 已获取的字幕全文 |
| `videoTranscriptUpdatedAt` | number（可缺省） | 字幕获取时间 |
| `videoDuration` | number（**新版新增，可缺省**） | 视频总时长（秒），用于在列表中计算任意记录的百分比 |

读取时未知字段原样保留；写入一律“读取—合并—写回”，不得丢弃其它字段（笔记、字幕等）。

### F-1.2 设置项（同时写入 localStorage 与 GM 存储，读取时 localStorage 优先，其次 GM）
| 键 | 值 |
|---|---|
| `YSRP_StorageMode` | `local` 或 `gm` |
| `YSRP_TranscriptSettings` | JSON 字符串 `{endpoint, model, apiKey, timeoutMs}` |
| `YSRP_LanguagePreference` | `auto` / `zh` / `en` |

### F-1.3 存储后端
- `local`：`window.localStorage`（默认）。
- `gm`：`GM_*` API；仅在四个 GM 函数都可用时可选。
- 启动时：已保存的模式为 `gm` 且 GM 可用 → `gm`；否则 `local`。
- 记录的增删改查只作用于当前后端。

### F-1.4 导出格式
```json
{ "version": "1", "exportedAt": 1731744000000, "storageMode": "local",
  "entries": { "Youtube_SaveResume_Progress-<id>": "<记录 JSON 字符串>" } }
```
导入时只接受以 `Youtube_SaveResume_Progress-` 开头的键；值若是对象（手工编辑过的文件）需先序列化成字符串再写入（D-6）。

---

## 2. 进度引擎（核心）

### 2.1 旧版行为与进度丢失根因

旧版逻辑：脚本启动后立即 `setInterval(save, 1500)`，**无条件**把 `#movie_player.getCurrentTime()` 写入“地址栏中 `v` 对应的记录”；另起一个 500ms 轮询，在“播放器存在 + 有存档 + 时长>0”时 `seekTo` 一次，并把全局标志 `savedProgressAlreadySet` 置为 `true`，此后**永不复位**。

| 编号 | 缺陷 | 触发场景 | 结果 |
|---|---|---|---|
| **BUG-1** | 恢复标志全局只用一次，SPA 内切换视频后不再恢复 | 在 YouTube 内点击推荐/历史/播放列表进入一个看过的视频 | 新视频从 0 开始播放，而保存定时器把 0、1、2…秒**覆盖**原有存档 → 进度永久丢失（最主要原因） |
| **BUG-2** | 保存与恢复无先后约束 | 页面首次加载较慢、播放器尚未就绪或 `getCurrentTime` 返回 0 时，保存定时器先跑 | 存档被写成 0，随后“恢复”读到 0 并跳到 0 |
| **BUG-3** | 地址栏 ID 与播放器实际视频不一致时仍然保存 | SPA 跳转瞬间 URL 已变、播放器仍是旧视频（或反之）；导航事件里还会立即调用一次保存 | 旧视频的时间被写进新视频的记录（串号） |
| **BUG-4** | 广告期间照常保存/恢复 | 片头广告播放中 | 恢复的 `seekTo` 作用在广告上被吞掉且标志已置位；广告时间或 0 被写入存档 |
| **BUG-5** | 暂停/后台标签页每 1.5 秒重复写入同一时间 | 两个标签页打开同一视频，A 暂停在 10:00，在 B 中看到 40:00 | A 不停把 10:00 写回，覆盖 B 的进度 |
| **BUG-6** | localStorage 写入异常被静默吞掉 | localStorage 配额满（YouTube 自身占用大量空间，且字幕全文也存在记录里） | 进度不再保存且无任何提示 |
| **BUG-7** | 设置界面使用 `innerHTML = ''` | YouTube 强制 Trusted Types 时 | 笔记编辑按钮刷新抛异常（界面问题，不影响进度） |
| **BUG-8** | 列表百分比使用“当前视频”的时长计算所有记录 | 打开记录列表 | 其它视频的百分比错误 |

### 2.2 新版规格

#### F-2.1 视频会话
- 每个“正在观看的视频 ID”对应一个会话：`{ id, phase: waiting|restoring|tracking, lastTime, lastWritten }`。
- 视频 ID 取自地址栏 `v`。地址栏 ID 变化（SPA 跳转、前进后退、自动连播、播放列表下一首、页面刷新）即结束旧会话、建立新会话。
- 离开观看页（首页、搜索页等，`v` 为空）→ 结束会话，不再保存。

#### F-2.2 “播放器就绪”判定（全部满足）
1. `#movie_player` 存在且具备 `getCurrentTime/getDuration/seekTo`；
2. 播放器当前加载的视频 `getVideoData().video_id` **等于**会话 ID（不可用时退化为不检查）；
3. `getDuration() > 0`；
4. 未处于广告：`#movie_player` 无 `ad-showing` / `ad-interrupting` class。

#### F-2.3 恢复（phase = waiting → restoring → tracking）
- 会话建立后**不保存任何东西**，直到恢复阶段结束（修复 BUG-1/2/3）。
- 播放器就绪后：
  - 地址栏带有 `t=` / `start=` 时间参数 → 尊重链接，不恢复（D-1）。
  - 无存档，或存档 `videoProgress` ≤ 1 秒 → 不恢复。
  - 存档位置距结尾 < 5 秒（已看完）→ 不恢复，从头播放（D-2）。
  - 否则 `seekTo(videoProgress, true)`，并在随后的检查中确认 `|currentTime − videoProgress| ≤ 3`；YouTube 若把位置重置回去（自身“继续观看”、广告结束、质量切换），重新 seek，最多 8 次、总时长不超过约 15 秒。
- 恢复结束（成功、跳过或放弃）后进入 tracking；徽标短暂显示“已恢复 / Resumed”。
- 广告期间保持等待，广告结束后再恢复（修复 BUG-4）。
- 直播（`getVideoData().isLive`）不恢复也不保存（D-3）。

#### F-2.4 保存（仅 tracking 阶段）
- 触发：每 1.5 秒检查一次；外加 `<video>` 的 `pause`、`seeked` 事件，`visibilitychange`（转入后台）、`pagehide`，以及 SPA 跳转开始（`yt-navigate-start`）时立即冲刷。
- 每次检查只在播放器就绪（F-2.2）时读取 `currentTime` 并更新 `lastTime`。
- 只有当 `|lastTime − lastWritten| ≥ 0.5 秒` 才写入（修复 BUG-5：暂停的标签页不会反复覆盖）。
- 写入的目标永远是**会话 ID**，冲刷时使用会话里最后一次“就绪状态下”读到的时间，而非切换瞬间的播放器读数（修复 BUG-3）。
- 写入内容：合并已有记录 + `videoProgress`、`saveDate`、`videoDuration`、`videoName`、`originalTitle`。
- 写入失败（例如配额满）→ `console.error`，并在徽标上显示“⚠ 保存失败 / Save failed”，鼠标悬停显示错误信息（修复 BUG-6）。
- 写入成功后派发文档事件 `ysrp-record-updated`，detail `{ videoId, videoProgress }`，打开中的记录列表据此刷新。

#### F-2.5 标题
- 原标题优先取自播放器 `getVideoData().title`，其次 oEmbed；成功后写回记录的 `originalTitle`。
- DeArrow：请求上述 API，从 `titles` 中取第一个满足“`title` 为字符串、`original !== true`、`locked` 或 `votes ≥ 0`”的条目；与原标题（忽略大小写和多余空白）相同视为无 DeArrow 标题。结果在内存缓存 6 小时，同一视频的并发请求合并。
- 记录的 `videoName` = DeArrow 标题 ?? 原标题 ?? `Unknown Title`。

---

## 3. 播放器内徽标

- **F-3.1** 在播放器左侧控制栏 `.ytp-left-controls` 末尾插入 `.last-save-info-container`，内含：文字 `.last-save-info-text` 与齿轮按钮 `.ysrp-settings-button`。
- **F-3.2** 文字状态：初始“加载中... / Loading...”；恢复成功短暂显示“已恢复 m:ss / Resumed m:ss”；之后显示最近一次保存的时间，格式 `H:MM:SS`（不足 1 小时为 `M:SS`）；保存失败显示 F-2.4 的警告。
- **F-3.3** YouTube 重建控制栏导致徽标被移除时，自动重新插入（同一时刻页面上只有一个徽标）。
- **F-3.4** 齿轮按钮在 `pointerdown`（捕获阶段）打开设置弹窗，并阻止 `pointerdown/click/touchstart` 冒泡，使播放器不因点击而暂停、放大或抖动。
- **F-3.5** 徽标样式随系统深浅色（`prefers-color-scheme`）。

---

## 4. 设置弹窗

### 4.1 外壳
- **F-4.1** 弹窗挂载在页面内容区（`ytd-app #content` → `#content` → `#page-manager` → `body`），**不在播放器内部**；固定定位居中，宽 50rem、最大 90vw × 80vh；下方有半透明遮罩。
- **F-4.2** 打开时锁定 `body` 滚动，关闭时恢复原值；窗口尺寸变化保持居中。
- **F-4.3** 关闭方式：右上角 ✖；点击遮罩；按 `Esc`（D-4，旧版仅 ✖）。
- **F-4.4** 标题“已保存视频 - (N) / Saved Videos - (N)”，旁边徽章显示当前后端（“浏览器本地存储 / localStorage”或“GM 存储 / GM Storage”）；列表刷新时显示旋转刷新图标。
- **F-4.5** 四个标签页：记录 Records、存储 Storage、字幕 Transcript、界面 Display；当前标签高亮。
- **F-4.6** 弹窗内滚动条为细滚动条并随主题配色。

### 4.2 记录标签
- **F-4.7** 列出当前后端的全部记录；**当前正在观看的视频排在最前**，其余按 `saveDate` 由新到旧（D-5，旧版为存储顺序）。
- **F-4.8** 每行：百分比（`videoProgress / videoDuration`，保留 1 位小数；缺少时长时若为当前视频则用播放器时长，否则显示 `—`）、标题、按钮组。
- **F-4.9** 标题与 DeArrow 切换：
  - 有 DeArrow 标题时默认显示 DeArrow 标题，DeArrow 图标按钮可在“原标题 / DeArrow 标题”之间切换（显示原标题时按钮变灰）。
  - 尚未确定时按钮置灰禁用，提示“正在检测 DeArrow 标题…”，后台请求；确认没有 DeArrow 标题则移除按钮，只显示原标题。
  - 缺原标题时通过 oEmbed 获取并写回记录；取不到显示“未找到原标题 / Original title unavailable”。
- **F-4.10** 字幕按钮：展开/收起字幕面板。首次展开时若无缓存则请求字幕接口。面板含状态文字、刷新（强制重新获取）、复制按钮与只读文本框。展开状态在列表重建后保持。
- **F-4.11** 笔记按钮：无笔记时进入编辑；有笔记时展开/收起；编辑中再次点击 → 保存并收起。面板内铅笔/保存按钮切换编辑。保存时去除首尾空白，为空则删除 `videoNote`。空笔记显示“暂无笔记 / No notes yet”。
- **F-4.12** 链接按钮：展开/收起 `链接：https://www.youtube.com/watch?v=<id>`，带“复制”（图标变为对勾 1 秒，显示“已复制”提示）与“在新标签页打开”。
- **F-4.13** 删除按钮：删除该记录并从列表移除，计数同步更新。
- **F-4.14** 列表在以下情况自动刷新：当前视频变化（重排）、出现新记录、DeArrow 标题到达；已有记录的进度更新只刷新该行百分比。

### 4.3 存储标签
- **F-4.15** 后端选择：两个单选卡片“localStorage（默认）”与“GM 存储”（GM 不可用时禁用 GM）；按钮“应用并迁移 / Apply & Migrate”把**所有记录**移动到新后端（复制后删除源），保存新模式，刷新列表与徽章。
- **F-4.16** 导出：“复制 JSON”写入剪贴板；“下载 JSON”下载文件名 `[Youtube] Video Memory「YYYY MM DD」「HH:MM:SS」.json`。iOS 上优先使用系统分享面板（`navigator.share` 带文件），不支持时在新标签页打开 data URL，最后退回普通下载。结果在状态行显示。
- **F-4.17** 导入：粘贴 JSON 后点“从文本导入”，或“选择文件”读取 `.json` 后自动导入；“覆盖”复选框勾选时先清空当前后端的全部记录。状态行显示“已导入 N 条记录”或错误信息。iOS 上文件选择框以透明覆盖层方式实现以兼容系统选择器。

### 4.4 字幕标签
- **F-4.18** 字段：接口地址、模型、API 密钥（可显示/隐藏）、超时（分钟，1–60，默认 10）。输入后 250ms 自动保存到 `YSRP_TranscriptSettings`。
- **F-4.19** 接口地址规范化：缺协议补 `https://`；路径为空或 `/` 时补 `/v1/chat/completions`；去掉末尾 `/`。
- **F-4.20** 默认值：地址 `https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions`，模型 `transcript`，密钥 `sk-asdlfjalalfja`，超时 10 分钟。
- **F-4.21** 请求：`POST`，`Content-Type: application/json`，有密钥时 `Authorization: Bearer <key>`；body `{"model": <model>, "messages": [{"role":"user","content":"https://www.youtube.com/watch?v=<id>"}]}`；超时后中止并报“字幕接口在 N 分钟内无响应…”。
- **F-4.22** 响应解析（依次尝试）：纯文本；数组拼接；`error.message` 视为错误；`transcript`（字符串或数组）；`output_text`；`output[].content[].text`；`choices[].message.content`（字符串或分段数组）/`choices[].text`；`text`；`data`。结果为空报错“字幕接口未返回有效内容”。成功后写入记录的 `videoTranscript` 并在内存缓存 30 分钟；同一视频并发请求合并。
- **F-4.23** 信息卡显示“当前视频”标题和视频 ID，随视频切换更新。

### 4.5 界面标签
- **F-4.24** 语言：自动（跟随浏览器，`zh*` → 中文，其余英文）/ 中文 / English，三个单选卡片；显示当前生效语言与浏览器语言。切换后保存偏好并立即以新语言重建徽标与弹窗（保持打开状态和当前标签）。

---

## 5. 启动与清理

- **F-5.1** 启动时清理当前后端中无法解析为对象的记录；去除 `videoName` 首尾空白，空值补 `Unknown Title`。
- **F-5.2** 加载 Font Awesome 样式表一次。
- **F-5.3** 等待 `#movie_player` 出现后再挂载 UI；进度引擎与 SPA 导航监听在启动时即开始工作。

---

## 6. 与旧版的有意差异

| 编号 | 差异 | 理由 |
|---|---|---|
| D-1 | 链接带 `t=` 时不覆盖为存档位置 | 尊重用户点开的时间戳链接 |
| D-2 | 已看完（距结尾 < 5 秒）不恢复 | 避免一打开就结束并触发自动连播 |
| D-3 | 直播不保存不恢复 | 直播没有稳定的时间轴 |
| D-4 | 遮罩、Esc 可关闭弹窗 | 易用性 |
| D-5 | 列表按最近保存排序 | 易用性 |
| D-6 | 导入时对象值自动序列化 | 防止手工编辑的备份导入后被启动清理删除 |
| D-7 | 新增 `videoDuration` 字段 | 修复 BUG-8；旧数据缺失时安全降级 |

---

## 7. 验收清单

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 新视频播放 20 秒后刷新页面 | 自动跳回约 20 秒处继续 |
| A-2 | 观看 A 到 30 秒 → 站内点击跳到 B（看过，存档 60 秒） | B 从约 60 秒开始；A 的存档仍为约 30 秒 |
| A-3 | 接上，从 B 后退回 A | A 从约 30 秒开始 |
| A-4 | 播放器加载慢（时长长期为 0） | 期间存档不被改写 |
| A-5 | 片头广告 | 广告期间不保存；广告结束后恢复到存档位置 |
| A-6 | 打开 `watch?v=<id>&t=5` | 从 5 秒播放，不跳到存档；之后正常保存 |
| A-7 | 暂停的标签页 | 不再重复写入；另一标签页的更新进度不被覆盖 |
| A-8 | SPA 跳转瞬间 URL 与播放器视频不一致 | 不发生串号写入 |
| A-9 | 存档在结尾 3 秒内 | 从头播放 |
| A-9b | 播放器加载后自行跳回 0 | 重新定位到存档位置 |
| A-10 | 存储写入抛异常 | 徽标显示保存失败 |
| A-11 | 旧版数据（无 `videoDuration`，含笔记/字幕） | 正常恢复，笔记与字幕在保存后仍保留 |
| A-12 | 徽标 | 出现在左侧控制栏，只有一个，被移除后自动恢复，显示最近保存时间 |
| A-13 | 齿轮按钮 | 打开弹窗，播放状态不变；✖ / 遮罩 / Esc 关闭 |
| A-14 | 记录标签 | 当前视频置顶、计数正确、删除生效、笔记保存、链接复制 |
| A-15 | 存储标签 | 切换到 GM 并迁移后记录全部在 GM 侧；导出→覆盖导入往返一致 |
| A-16 | 字幕 | 设置保存与地址规范化正确；请求体格式正确；响应解析正确 |
| A-17 | 界面语言 | 切换中/英立即生效并持久化 |
| A-18 | Trusted Types | 在 `require-trusted-types-for 'script'` 下无任何异常 |

---

## 8. 自动化验收

`tests/acceptance.mjs` 用 Playwright 在模拟的 YouTube 观看页（`tests/mock/`，带 `require-trusted-types-for 'script'`）上逐条跑上表场景：

```bash
NODE_PATH=$(npm root -g) node tests/acceptance.mjs                      # 新脚本
NODE_PATH=$(npm root -g) node tests/acceptance.mjs path/to/old.user.js  # 对照旧版
```
