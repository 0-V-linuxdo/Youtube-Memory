# [Youtube] Video Memory · 功能规格说明（净室重写基准）

> 本文档从 `[20251116] v1.0.1` 版脚本的实际行为中抽取而来，是净室重写（clean-room rewrite）的唯一依据，也是验收清单。
> 编号形如 **F-x.y** 的条目是需要实现并验收的功能点；**BUG-n** 是旧版中导致“播放进度丢失”的缺陷；**D-n** 是新版有意与旧版不同的行为。

---

## 0. 范围与运行环境

| 项 | 规格 |
|---|---|
| 运行方式 | 用户脚本（Tampermonkey / Violentmonkey / Orion / iOS Userscripts 等） |
| 匹配 | `*://*.youtube.com/*`（含 `www.` 与 `m.`），在 YouTube 的 SPA 内常驻 |
| 授权 | `GM_getValue` `GM_setValue` `GM_deleteValue` `GM_listValues`；无这些 API 时自动降级为仅 localStorage。`GM_xmlhttpRequest`（`@connect oauth2.googleapis.com`、`www.googleapis.com`）仅供 Drive 同步插件使用，缺失时退回 `fetch` |
| 视频识别 | 观看页 `/watch?v=<id>`。Shorts、嵌入页不在范围内 |
| 外部服务 | DeArrow 标题 `https://sponsor.ajay.app/api/branding?videoID=<id>`；YouTube oEmbed 原标题 `https://www.youtube.com/oembed?format=json&url=https://youtu.be/<id>`；字幕接口（OpenAI 兼容，可配置）；Font Awesome 6.5.1 图标 CSS（cdnjs）；Google OAuth / Drive v3（仅 Drive 同步插件，见 9.4） |
| 源码与构建 | TypeScript 源码在 `src/`，按功能拆成插件（第 9 节）；`bun run build` 打包成单文件 `userscript/[Youtube] Video Memory.user.js`（文件名、`@namespace` 不变，已安装的用户可直接更新） |
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
| `updatedAt` | number（可缺省，与 v1.4.0 相同） | 记录最近一次被本地修改的时间（ms）。进度、标题、笔记、字幕写入时更新；仅改同步元数据时不更新 |
| `driveSync` | object（可缺省，与 v1.4.0 相同） | `{lastUploadAt, lastDownloadAt}`，Drive 同步插件记录的最近上传/下载时间（ms）；新版另加 `remoteModifiedAt`（最近一次上传后云端文件的修改时间，避免把自己刚上传的文件再下载一遍） |

读取时未知字段原样保留；写入一律“读取—合并—写回”，不得丢弃其它字段（笔记、字幕等）。

### F-1.2 设置项（同时写入 localStorage 与 GM 存储，读取时 localStorage 优先，其次 GM）
| 键 | 值 |
|---|---|
| `YSRP_StorageMode` | `local` 或 `gm` |
| `YSRP_TranscriptSettings` | JSON 字符串 `{endpoint, model, apiKey, timeoutMs}` |
| `YSRP_LanguagePreference` | `auto` / `zh` / `en` |
| `YSRP_Plugins` | JSON 字符串 `{"plugins": {"<插件名>": {"enabled": bool, ...该插件的设置}}}`；缺省的项取插件默认值 |
| `YSRP_DriveSettings` | JSON 字符串 `{clientId, clientSecret, refreshToken}`（与 v1.4.0 同键同格式）。含密钥，**例外**：读取时 GM 优先、其次 localStorage（可直接沿用 v1.4.0 留在 localStorage 里的凭据）；写入只写 GM，GM 不可用时才写 localStorage |
| `YSRP_DriveFullSyncDone` | `1` 表示已完成首次全量上传（与 v1.4.0 同键） |

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
  - 无存档，或存档 `videoProgress` ≤ 1 秒 → 不恢复。
  - 存档位置距结尾 < 5 秒（已看完）→ 不恢复，从头播放（D-2）。
  - 地址栏带有 `t=` / `start=` 时间参数 → 弹窗让用户选择（F-2.6，D-1）。
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

#### F-2.6 时间戳链接与存档冲突时的选择弹窗（phase = choosing）
- 触发条件：地址栏带 `t=` / `start=` / `#t=`（支持 `90`、`90s`、`1m30s`、`1h2m3s`），且存档满足恢复条件（> 1 秒、距结尾 ≥ 5 秒），且链接时间与存档相差 > 3 秒。相差 ≤ 3 秒或无可恢复存档时不弹窗，直接按链接播放。
- 弹窗以 DOM API 构建，挂在 `#movie_player` 内居中（全屏时也可见），标题“从哪里继续播放？ / Where to continue?”，两个按钮：“上次进度 m:ss”（`.ysrp-resume-saved`，默认聚焦）与“链接时间 m:ss”（`.ysrp-resume-link`）。Esc 等同选择链接时间。点击弹窗不影响播放器。
- 弹出时暂停视频，徽标显示“请选择播放位置… / Choose a position…”；**选择前不保存任何进度**，存档保持原值。
- 选“上次进度”→ 进入 restoring，按 F-2.3 定位到存档位置；选“链接时间”→ 直接进入 tracking，从链接时间开始保存。若弹出前在播放，选择后继续播放。
- 站内跳到其他视频时弹窗自动关闭，未选择的视频存档不变。

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
- **F-4.2** 打开时页面不随滚轮、触摸滑动和翻页键滚动（弹窗内可滚动的区域照常滚动，滚到头也不带动页面），关闭后恢复。**不得改动 `html` / `body` 的 `overflow`**：页面滚动条保持显示，页面不能左右抖动。窗口尺寸变化时弹窗保持居中。
- **F-4.3** 关闭方式：右上角 ✖；点击遮罩；按 `Esc`（D-4，旧版仅 ✖）。
- **F-4.4** 标题“已保存视频 - (N) / Saved Videos - (N)”，旁边徽章显示当前后端（“浏览器本地存储 / localStorage”或“GM 存储 / GM Storage”）；列表刷新时显示旋转刷新图标。
- **F-4.5** 标签页依次为：记录 Records、存储 Storage、插件提供的标签（默认有字幕 Transcript、云同步 Drive）、插件 Plugins、界面 Display；当前标签高亮。插件被关闭时它的标签随之消失，打开时出现，无需刷新页面。
- **F-4.6** 弹窗内滚动条为细滚动条并随主题配色。

### 4.2 记录标签
- **F-4.7** 列出当前后端的全部记录；**当前正在观看的视频排在最前**，其余按 `saveDate` 由新到旧（D-5，旧版为存储顺序）。
- **F-4.8** 每行：百分比（`videoProgress / videoDuration`，保留 1 位小数；缺少时长时若为当前视频则用播放器时长，否则显示保存的位置 `M:SS`，如旧版记录）、标题、按钮组。链接、笔记、字幕三个面板默认全部收起，点击对应按钮才展开；链接面板为一行：URL 文字 + 复制 + 新标签打开。
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
| D-1 | 链接带 `t=` 且与存档不同时弹窗让用户选择（旧版直接跳到存档） | 时间戳链接和上次进度都可能是用户想要的 |
| D-2 | 已看完（距结尾 < 5 秒）不恢复 | 避免一打开就结束并触发自动连播 |
| D-3 | 直播不保存不恢复 | 直播没有稳定的时间轴 |
| D-4 | 遮罩、Esc 可关闭弹窗 | 易用性 |
| D-5 | 列表按最近保存排序 | 易用性 |
| D-6 | 导入时对象值自动序列化 | 防止手工编辑的备份导入后被启动清理删除 |
| D-7 | 新增 `videoDuration` 字段 | 修复 BUG-8；旧数据缺失时安全降级 |
| D-8 | 功能拆成可开关的插件（第 9 节），新增“插件”标签 | 参照 void++ 架构；可选功能可单独关闭 |
| D-9 | Drive 同步在**每次打开视频、恢复进度之前**拉取该视频的云端记录（v1.4.0 只在页面加载时拉一次） | 站内跳转到另一台设备看过的视频时也能接着看 |
| D-10 | 徽标显示/隐藏开关内置为默认开启的插件（原为单独的 Controller 脚本） | 用户要求 |

---

## 7. 验收清单

| 编号 | 场景 | 期望 |
|---|---|---|
| A-1 | 新视频播放 20 秒后刷新页面 | 自动跳回约 20 秒处继续 |
| A-2 | 观看 A 到 30 秒 → 站内点击跳到 B（看过，存档 60 秒） | B 从约 60 秒开始；A 的存档仍为约 30 秒 |
| A-3 | 接上，从 B 后退回 A | A 从约 30 秒开始 |
| A-4 | 播放器加载慢（时长长期为 0） | 期间存档不被改写 |
| A-5 | 片头广告 | 广告期间不保存；广告结束后恢复到存档位置 |
| A-6 | 存档 100 秒，打开 `watch?v=<id>&t=5` | 弹出选择框、视频暂停、存档不变；选“链接时间”后从 5 秒播放并正常保存 |
| A-6b | 同上，选“上次进度” | 跳到约 100 秒并继续播放 |
| A-6c | 链接时间与存档相差 ≤ 3 秒，或无存档 | 不弹窗，按链接时间播放 |
| A-7 | 暂停的标签页 | 不再重复写入；另一标签页的更新进度不被覆盖 |
| A-8 | SPA 跳转瞬间 URL 与播放器视频不一致 | 不发生串号写入 |
| A-9 | 存档在结尾 3 秒内 | 从头播放 |
| A-9b | 播放器加载后自行跳回 0 | 重新定位到存档位置 |
| A-10 | 存储写入抛异常 | 徽标显示保存失败 |
| A-11 | 旧版数据（无 `videoDuration`，含笔记/字幕） | 正常恢复，笔记与字幕在保存后仍保留 |
| A-12 | 徽标 | 出现在左侧控制栏，只有一个，被移除后自动恢复，显示最近保存时间 |
| A-13 | 齿轮按钮 | 打开弹窗，播放状态不变；✖ / 遮罩 / Esc 关闭 |
| A-13b | 弹窗打开时滚动页面 | 页面滚动条保持显示、页面不左右移动，页面不滚动；弹窗内列表照常滚动；关闭后页面恢复滚动 |
| A-14 | 记录标签 | 当前视频置顶、计数正确、删除生效、笔记保存、链接复制；面板默认收起，链接面板单行；无时长的旧记录显示保存位置 |
| A-15 | 存储标签 | 切换到 GM 并迁移后记录全部在 GM 侧；导出→覆盖导入往返一致 |
| A-16 | 字幕 | 设置保存与地址规范化正确；请求体格式正确；响应解析正确 |
| A-17 | 界面语言 | 切换中/英立即生效并持久化 |
| A-18 | Trusted Types | 在 `require-trusted-types-for 'script'` 下无任何异常 |
| A-19 | 插件标签 | 列出全部插件及开关；关闭“字幕”后字幕标签和行内字幕按钮立即消失，刷新后仍关闭；重新打开后恢复 |
| A-20 | 徽标开关插件 | 默认开启：徽标前有唯一的 💾 按钮，徽标默认隐藏；点击显示、再点隐藏，播放状态不变；徽标重建后状态保持；关闭插件后按钮消失、徽标可见 |
| A-21 | Drive 上传 | 填好凭据后，新进度约 1.5 秒后上传为文件夹内的 `<标题>｜<id>.json`，内容格式正确；同一视频 15 秒内的多次变化只上传一次；删除记录同时删除云端文件 |
| A-22 | Drive 下载 | 云端记录比本地新：打开视频时先应用云端进度再恢复；云端更旧：不覆盖本地 |
| A-23 | Drive 首次全量 | 第一次配置凭据后上传全部本地记录并写入完成标记，之后不再重复全量 |

---

## 8. 自动化验收

`tests/acceptance.mjs` 用 Playwright 在模拟的 YouTube 观看页（`tests/mock/`，带 `require-trusted-types-for 'script'`）上逐条跑上表场景：

```bash
bun install && bun run build                                            # src/ → userscript/[Youtube] Video Memory.user.js
NODE_PATH=$(npm root -g) node tests/acceptance.mjs                      # 新脚本
NODE_PATH=$(npm root -g) node tests/acceptance.mjs path/to/old.user.js  # 对照旧版
```

---

## 9. 插件架构与插件（参照 void++）

### 9.1 插件框架
- **P-1** 每个功能是一个插件：名称、说明、作者、`enabledByDefault`（默认是否开启）、`required`（核心插件，不能关闭）、设置项定义、`start()` / `stop()`；可选地向设置弹窗贡献一个标签页、向记录行贡献一个按钮及其展开面板、向进度引擎贡献“恢复前”钩子（P-D.8）。
- **P-2** 是否启用：核心插件始终启用；其余插件取 `YSRP_Plugins` 中该插件的 `enabled`，没有则取 `enabledByDefault`。
- **P-3** 启动时按顺序启动所有启用的插件：先核心插件（进度引擎、播放器徽标、设置弹窗），再其它插件。某个插件启动失败只记日志，不影响其它插件和进度保存。
- **P-4** 运行中开关插件立即生效并保存，无需刷新：关闭时插件移除它添加的一切（DOM、监听、定时器、样式、标签页、行按钮），打开时重新添加。
- **P-5** 设置项类型：开关（布尔）、文本、数字、下拉选择。值保存在 `YSRP_Plugins` 中该插件名下，修改即保存，并通知插件。
- **P-6** “插件”标签：每个插件一张卡片，显示名称、说明和开关；核心插件标“核心”且开关不可用；已开启的插件在卡片内显示它的设置项。
- **P-7** 插件列表（括号内为默认状态）：

| 插件 | 说明 |
|---|---|
| 进度引擎 Engine（核心） | 第 2 节 |
| 播放器徽标 PlayerBadge（核心） | 第 3 节与 F-2.6 选择弹窗 |
| 设置弹窗 Settings（核心） | 第 4 节的外壳、记录、存储、插件、界面标签 |
| 徽标开关 BadgeToggle（开启） | 9.2 |
| 字幕 Transcript（开启） | 9.3 |
| 云同步 DriveSync（开启） | 9.4；没有凭据时什么也不做 |

### 9.2 徽标开关（BadgeToggle）
- **P-B.1** 在徽标 `.last-save-info-container` 前插入一个 💾 按钮 `.ysrp-badge-toggle`（透明背景、无边框、字号 1.5rem、右边距 .5rem），整个页面只有一个。
- **P-B.2** 设置项“默认隐藏徽标”（开关，默认开）：开时每次打开页面徽标先隐藏（`opacity: 0`、`pointer-events: none`），关时先显示。点击 💾 在显示/隐藏之间切换；徽标被重建（语言切换、控制栏重建）后保持当前状态。
- **P-B.3** 点击 💾 不影响播放（同 F-3.4 的事件拦截）。
- **P-B.4** 关闭插件：移除按钮，徽标恢复可见。

### 9.3 字幕（Transcript）
- **P-T.1** 字幕标签（F-4.18 – F-4.23）和记录行的字幕按钮与面板（F-4.10）都由该插件提供。
- **P-T.2** 关闭插件后两者都不出现；已保存在记录里的 `videoTranscript` 不删除。

### 9.4 云同步（DriveSync，替代 v1.4.0 的 Google Drive 自动同步）
- **P-D.1 凭据** 用户自己的 Google OAuth 客户端 ID、客户端密钥与 refresh token（需 Drive 权限），保存在 `YSRP_DriveSettings`（F-1.2）。三项不全时插件不发任何请求，只在标签里提示填写。
- **P-D.2 访问令牌** 向 `https://oauth2.googleapis.com/token` `POST` 表单 `client_id`、`client_secret`、`refresh_token`、`grant_type=refresh_token`；令牌缓存到过期前 60 秒。Drive 返回 401 时丢弃缓存重新取一次再重试一次。
- **P-D.3 文件夹** 在“我的云端硬盘”中使用名为 `[Youtube] Video Memory` 的文件夹（`mimeType = application/vnd.google-apps.folder`、未删除），没有则创建；本页内缓存其 ID。
- **P-D.4 文件** 每个视频一个文件，名为 `<标题>｜<videoId>.json`：标题取记录的 `videoName`，去掉控制字符，把 `\ / : * ? " < > |` 换成 `-`，最长 120 字符，为空时用 `Unknown Title`。内容为 `{"version": "2", "videoId", "videoUrl": "https://www.youtube.com/watch?v=<id>", "exportedAt": <ms>, "record": <记录，去掉 driveSync 字段>}`。从文件名末尾的 `｜<id>` 或 `[<id>]` 解析视频 ID。
- **P-D.5 查找** 在文件夹内查 `name contains '<id>'`、`mimeType = 'application/json'`、未删除，按修改时间倒序，只认文件名解析出的 ID 与之相等的文件；最新的一个为该视频的文件。
- **P-D.6 上传** 记录在本地被修改（`updatedAt` 晚于 `driveSync.lastUploadAt`）后排队：第一次修改后 1.5 秒上传，期间的修改合并（后续修改不再推迟这个时间，否则每 1.5 秒一次的进度保存会让上传永远等下去）；同一视频两次上传至少间隔 15 秒（未到时间则推迟到 15 秒时）；同一时刻只有一个上传在进行。已有文件则更新内容（标题变化时同时改名），否则在文件夹中新建；同一视频多余的文件删除。成功后写入 `driveSync.lastUploadAt`（不改 `updatedAt`、不再次触发上传）。
- **P-D.7 删除** 在记录标签删除一条记录时删除该视频的云端文件。导入、切换存储后端等批量操作不触发自动上传或删除（需要时用“全部上传”）。
- **P-D.8 打开视频时下载（D-9）** 每次开始一个视频会话时拉取该视频的云端文件：云端修改时间晚于本地 `updatedAt`（缺省为 0）且晚于 `driveSync.lastDownloadAt` 时，用云端记录覆盖本地同名字段（本地独有的字段保留），并把 `driveSync.lastDownloadAt`、`lastUploadAt` 设为当前时间，此次写入不触发上传。进度引擎在读取存档前最多等待 4 秒（徽标显示“正在同步… / Syncing…”），超时或失败则按本地数据继续。云端没有文件但本地有记录时排队上传。
- **P-D.9 首次全量** 凭据齐全且 `YSRP_DriveFullSyncDone` 未设置时，上传全部本地记录（不论是否改过），完成后写入该标记。同时若在云端找到 v1.4.0 早期的单文件 `[Youtube] Video Memory Sync.json`（格式同 F-1.4 的 `entries`），把其中本地没有或 `saveDate` 更新的记录导入本地（不删除该文件）。标签里的“全部上传”按钮随时执行一次全量上传。
- **P-D.10 状态** 标签内状态行显示：未配置 / 同步中（已完成 N / 共 M）/ 已同步（时间）/ 已推迟 / 出错（原因）；同时以 `ysrp-drive-sync-status` 事件（`detail: {state, done, total, message}`，`state` 取 `start` `progress` `done` `deferred` `idle` `error`）广播。
- **P-D.11 标签** “云同步”标签含：客户端 ID、客户端密钥（可显示/隐藏）、refresh token（可显示/隐藏）三个输入框；“保存并验证”按钮（保存后立即换取一次令牌，显示成功或错误；首次保存成功后开始 P-D.9）；“全部上传”按钮；状态行；获取凭据的简短说明。
- **P-D.12** 同步出错不影响进度保存与恢复；网络请求优先用 `GM_xmlhttpRequest`，不可用时用 `fetch`。
