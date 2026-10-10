# 规格 → 代码 对照表

路径均相对于 `src/`。“函数”列给出主要的实现入口。

## 第一部分 · 原脚本功能

### 1.1 核心（C-1 … C-86）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| C-1 … C-12 元数据、致谢、开发须知 | `../build.ts` | `header`、`credits`（按 N-0.1 更新名称、版本、授权、@connect） |
| C-13 私有作用域、严格模式 | `../build.ts`、`index.ts` | IIFE 打包 + `'use strict'`；`bootstrap()` 只在 `<html>` 上留一个 data 标记 |
| C-14 … C-21 存储键、占位文字、DOM 类名、事件名 | `utils/constants.ts` | 常量；事件派发见 `api/events.ts` `dispatch()` |
| C-22 … C-30 运行时配置 | `plugins/_core/engine/index.ts`、`plugins/transcript/service.ts`、`api/titles.ts` | 会话状态取代全局“已恢复”标志；字幕默认值 `DEFAULTS` |
| C-31 … C-33 图标、DeArrow SVG | `utils/dom.ts` | `icon()`、`dearrowIcon()`（附录 A 路径逐字） |
| C-34 … C-36 主题 | `api/theme.css` | CSS 变量 + `prefers-color-scheme`（N-5.1 色板取代） |
| C-37 时间格式化 | `utils/text.ts` | `formatTime()` |
| C-38、C-39 等待元素 | `utils/dom.ts` | `waitFor()`（可选超时） |
| C-40 … C-56 多语言 | `utils/i18n.ts` | `normalizePreference()`、`detectBrowserLanguage()`、`getPreference()`、`setPreference()`、`getLanguage()`、`interpolate()`、`pick()`、`tr()`、`extend()`、`t()`，内置 `language.*` 词条 |
| C-57 … C-61 播放器辅助 | `api/player.ts` | `getPlayer()`、`urlVideoId()`、`playerTime()`、`playerDuration()`、`readyPlayer()` |
| C-62 … C-68 标题规范化、来源表、有效标题 | `utils/text.ts`、`api/titles.ts` | `normalizeTitle()`、`sameTitle()`、`setOriginalTitle()`、`setDearrowTitle()`、`resolveTitle()` |
| C-69 … C-71 当前视频标题缓存与事件 | `api/titles.ts` | `setCurrentVideo()`、`refreshCurrent()`、`currentStatus()` |
| C-72 … C-75 oEmbed | `api/titles.ts` | `fetchOriginalTitle()`、`persistOriginal()`、`knownOriginalTitle()` |
| C-76 … C-79 DeArrow | `api/titles.ts` | `pickDearrowTitle()`、`fetchDearrowTitle()`、`cachedDearrow()` |
| C-80 … C-86 标题刷新、视频切换检测、获取视频名称 | `plugins/_core/engine/index.ts`、`api/titles.ts` | 引擎 `tick()` / `switchTo()` 检测切换并调用 `setCurrentVideo()`；保存时 `titleForRecord()` |

**1.1 已知问题处理**

| 问题 | 处理 |
|---|---|
| C-Q1 innerHTML | 全部用 DOM API（`utils/dom.ts` `h()` 拒绝 innerHTML 属性）；构建时检查产物 |
| C-Q2 oEmbed 失败永久缓存并抹掉记录 | 失败 5 分钟后可重试，失败不写 `null`（`fetchOriginalTitle()`） |
| C-Q3 DeArrow 无负缓存 | “无标题”缓存 30 分钟（`cachedDearrow()`） |
| C-Q4 主题只判断一次 | CSS 媒体查询实时跟随（`api/theme.css`） |
| C-Q5 非法时间 | `formatTime()` 对 NaN/负数输出 `0:00` |
| C-Q6 `#title` 过宽 | 不再监听 `#title`；视频切换由引擎检测 |
| C-Q7 导航种子保存写错视频 | 取消种子保存；只在跟踪阶段、播放器显示会话视频时保存（引擎） |
| C-Q8 恢复标志不复位 | 每个视频一个会话（引擎 `Session`） |
| C-Q9 播放器缺失返回 0 | 只有 `readyPlayer()` 为真时才读取时间 |
| C-Q10 来源标签与标题不一致 | `refreshCurrent()` 按实际解析结果设置来源 |
| C-Q11 每 1.5 秒派发状态事件 | 仅在变化时派发 |
| C-Q12 无意义的 1.5 秒重试 | 删除该重试 |
| C-Q13 只识别 `?v=` | **保留**：N-2.2.1 仍规定会话 ID 取自地址栏 `v` |
| C-Q14 占位文字不随语言/被存入记录 | 占位文字双语显示，且从不写入 `videoName`（`titleForRecord()`） |
| C-Q15 语言偏好 localStorage 优先 | **保留**：N-1.3 规定设置读取 localStorage 优先 |
| C-Q16 硬编码的字幕 Key | **保留**为默认值（服务方公开 Key）；用户现在可以清空它（`updateSettings()`） |
| C-Q17 空字符串处理不一致 | `pick()` 与 `t()` 一致 |
| C-Q18 只看第一个候选语言 | `detectBrowserLanguage()` 检查全部候选 |

### 1.2 存储、字幕接口、徽标文本、保存与恢复、界面插入（S-1 … S-102）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| S-1 … S-8 常量与契约 | `utils/constants.ts`、`api/player.ts` | |
| S-9 … S-19 后端 | `utils/storage.ts` | `gmAvailable`、`localBackend`、`gmBackend`、`listPrefixed()` |
| S-20 … S-23 模式确定 | `utils/storage.ts` | `getMode()`、`detectMode()`、`persistMode()`、`activeBackend()` |
| S-24 … S-30 切换与迁移 | `utils/storage.ts` | `switchMode()` |
| S-31 … S-37 导出 / 导入 | `utils/storage.ts` | `exportData()`、`importData()` |
| S-38 … S-40 记录格式 | `api/records.ts` | `VideoRecord`、`parseRecord()`、`readRecord()`、`updateRecord()` |
| S-41 … S-54 字幕接口设置 | `plugins/transcript/service.ts` | `normalizeTimeoutMs()`、`timeoutMinutes()`、`normalizeEndpoint()`、`getSettings()`、`updateSettings()` |
| S-55 原标题持久化 | `api/titles.ts` | `persistOriginal()` |
| S-56 … S-70 字幕获取 | `plugins/transcript/service.ts` | `cachedTranscript()`、`fetchTranscript()`、`extractText()`、`persist()` |
| S-71 … S-73 徽标文本 | `api/badge.ts`、`plugins/_core/playerBadge/index.ts` | `badgeText()`、`showSavedTime()`、`renderBadge()` |
| S-74 … S-79 保存 | `plugins/_core/engine/index.ts` | 被 N-2.5 取代：`save()`、`write()` |
| S-80 … S-85 恢复 | `plugins/_core/engine/index.ts` | 被 N-2.4 取代：`decide()`、`continueRestore()` |
| S-86 … S-89 徽标插入点 | `plugins/_core/playerBadge/index.ts` | `ensureBadge()` |
| S-90、S-91 弹窗宿主与遮罩 | `utils/dom.ts`、`plugins/_core/settings/shell.ts` | `pageHost()`、`SettingsModal.ensureBuilt()` |
| S-92、S-93 滚动锁定 | `plugins/_core/settings/scrollLock.ts` | 被 N-5.3.4 取代：`createScrollLock()` |
| S-94、S-95 弹窗定位 | `plugins/_core/settings/style.css` | 固定居中（CSS，随视口自动适配，无需 resize 监听） |
| S-96 … S-102 设置按钮开关 | `plugins/_core/playerBadge/index.ts`、`api/tabs.ts`、`settings/shell.ts` | `createBadge()`（pointerdown 捕获）、`openSettings()`、`SettingsModal.open()/close()` |

**1.2 已知问题处理**

| 问题 | 处理 |
|---|---|
| S-Q1 保存不等待恢复 | 恢复结束前不保存（引擎阶段 `waiting/restoring`） |
| S-Q2 单页导航不恢复 | 每个视频新会话 |
| S-Q3 种子保存写错视频 | 取消；`readyPlayer()` 校验 `video_id` |
| S-Q4 自我恢复 | 无存档（或 ≤1 秒）直接进入跟踪，不跳转 |
| S-Q5 广告与片尾 | 广告期间不就绪；距结尾 < 5 秒从头播放 |
| S-Q6 暂停时重写 | 相差 < 0.5 秒不写 |
| S-Q7 切到不可用的 GM 丢数据 | `switchMode()` 拒绝并逐条校验；界面禁用 GM 选项 |
| S-Q8 写入失败静默 | 后端抛错；徽标显示“⚠ 保存失败”（`write()`） |
| S-Q9 导入不比较新旧、计数含失败、对象值 | 对象值先序列化，计数只含成功；覆盖空数据被拒绝。**保留**“同名直接覆盖”（T-81 明确规定） |
| S-Q10 字幕先于进度产生无进度记录 | 恢复要求 `videoProgress` 为 > 1 的数字，不会 `seekTo(undefined)` |
| S-Q11 `originalTitle` 被清空 | 未知时保留原值 |
| S-Q12 模式判定偏向 localStorage | **保留**（S-20 规则、兼容已安装用户）；GM 不可用时迁移被阻止 |
| S-Q13 字幕缓存形同虚设 | `cachedTranscript()` 每 30 分钟才从记录重载 |
| S-Q14 强制刷新并发 | 进行中表按 token 清理 |
| S-Q15 超时只覆盖响应头 | 计时覆盖整个请求 |
| S-Q16 无法清空字段 | 清空 Key 生效；清空地址/模型回到默认 |
| S-Q17 地址规范化不一致 | **保留** S-46/S-47 规则（L-22 与示例仍要求如此） |
| S-Q18 空地址错误几乎不可达 | 保留检查（`fetchTranscript()`） |
| S-Q19 错误只有中文 | 全部双语 |
| S-Q20 2xx 中的 error.message 视为失败 | **保留**（S-70 第 4 条） |
| S-Q21 按钮只能打开、引用旧弹窗 | 遮罩/Esc/✕ 关闭；按钮通过 `openSettings()` 调用当前弹窗 |
| S-Q22 章节容器备选几乎不生效 | 接受任意 `.ytp-chapter-container` |
| S-Q23 时间异常值 | `formatTime()` |
| S-Q24 恢复轮询永久运行 | 引擎的单一检查循环取代轮询，无存档时立即进入跟踪 |
| S-Q25 字幕设置 GM 判定不一致 | 统一用 `readSetting()/writeSetting()` |

### 1.3 设置外壳、DeArrow、进度显示（U-1 … U-69）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| U-1、U-2 色板、图标 | `api/theme.css`、`utils/dom.ts` | N-5.1 色板与单色图标取代；DeArrow 彩色圆环改为单色 `wand-magic-sparkles` |
| U-3 … U-7 本地化辅助 | `utils/i18n.ts` | `pick()`、`tr()` |
| U-8 … U-13 语言状态、选项文案、语言变更重建 | `utils/i18n.ts`、`settings/displayTab.ts`、`settings/shell.ts` | `languageName()`、`createDisplayTab()`、`SettingsModal.rebuild()`（50 ms 防抖） |
| U-14 … U-16 iOS / 分享探测 | `settings/storageTab.ts` | `isIOS()`、`canShareFiles` |
| U-17 … U-19 标题比较 | `utils/text.ts` | `sameTitle()`、`isPlaceholderTitle()`、`normalizeTitle()` |
| U-20 … U-28 DeArrow 获取 | `api/titles.ts` | `fetchDearrowTitle()` |
| U-29 … U-35 可用性缓存、持久化、ready 事件 | `settings/recordsTab.ts` | `availability`、`persistDearrow()`、`RecordRow.applyDearrow()`、`RecordsList`（事件监听） |
| U-36、U-37 滚动条样式 | `api/ui.css` | N-5.2.16（滑块 border-l2、轨道透明） |
| U-38 … U-50 弹窗创建、样式、开关 | `settings/shell.ts`、`settings/style.css` | `SettingsModal.open()/close()/ensureBuilt()`；N-5 取代布局与尺寸 |
| U-51 … U-56 头部 | `settings/shell.ts` | `refreshHeader()`、`setBusy()`、`storageModeLabel()` |
| U-57 … U-61 标签栏 | `settings/shell.ts`、`api/tabs.ts` | `renderNav()`、`activate()`、`registerTab()` |
| U-62 … U-65 主体与面板 | `settings/shell.ts`、`settings/recordsTab.ts` | `.ysrp-panes.ysrp-settings-container-body`、`.ysrp-pane` |
| U-66 … U-69 百分比与实时刷新 | `settings/recordsTab.ts` | `progressText()`（N-2.6）、`RecordRow.updateProgress()`、`RecordsList.rebuild()`（防重入） |

**1.3 已知问题处理**

| 问题 | 处理 |
|---|---|
| U-Q1 用当前播放器时长 | 改用记录的 `videoDuration`（N-2.6） |
| U-Q2 `NaN%` | 缺进度按 0 计算 |
| U-Q3 小数位不一致 | 有时长统一 1 位小数；无时长显示 `M:SS`（N-2.6）；记录缺失 `0%` |
| U-Q4 刷新指示器不可见 | 至少显示 300 ms |
| U-Q5 无 Esc/遮罩关闭 | D-4 实现 |
| U-Q6 主题只判断一次 | CSS 实时 |
| U-Q7 徽章文字信息量不对等 | `Browser storage` / `浏览器本地存储` |
| U-Q8 选项固定文本 | 走翻译表 |
| U-Q9 中文占位 | 双语 |
| U-Q10 两套相同规则 | 统一 `sameTitle()` |
| U-Q11 列表 DeArrow 总是强制 | 使用缓存 |
| U-Q12 覆盖 `videoName` | 先确保 `originalTitle` 已存再写（U-33）；**保留**覆盖行为（R-43） |
| U-Q13 每次 ready 整表重建 | 原地更新 |
| U-Q14 页面级缓存永不清理 | **保留**（仅内存、页面关闭即释放，规模很小） |
| U-Q15 无徽标时创建弹窗静默失败 | 弹窗不再依赖徽标存在 |
| U-Q16 无障碍 | 弹窗 `role=dialog`、开关 `role=switch`/`aria-checked`、按钮 `aria-label`、焦点样式 |
| U-Q17 计数不实时 | 每次打开/重建/删除时刷新 |
| U-Q18 h3 字号依赖默认 | `.ysrp-heading` 显式 18px/600 |

### 1.4 记录标签（R-1 … R-84）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| R-1 … R-9 术语、容器 | `settings/recordsTab.ts`、`settings/style.css` | `.ysrp-records` |
| R-10 … R-19 重建、排序、空状态 | `settings/recordsTab.ts` | `RecordsList.rebuild()`（D-5 排序） |
| R-20 … R-29 行布局、百分比、标题 | `settings/recordsTab.ts` | `RecordRow` 构造、`progressText()`、`initTitles()` |
| R-30 … R-48 DeArrow 切换、原标题 | `settings/recordsTab.ts`、`api/titles.ts` | `initTitles()`、`applyDearrow()`、`markMissing()`、`renderTitle()`、`toggleDearrow()`、`persistDearrow()` |
| R-49 … R-62 字幕按钮与获取 | `plugins/transcript/index.ts` | `openTranscriptDialog()`（N-5.4.6 子弹窗取代面板） |
| R-63 … R-73 笔记 | `settings/rowParts.ts` | `noteContribution`、`openNoteDialog()`（N-5.4.5 子弹窗取代面板，保存规则不变） |
| R-74 … R-78 链接 | `settings/rowParts.ts`、`api/ui.ts` | `linkContribution`、`openLinkDialog()`、`copyText()`（N-5.4.4） |
| R-79、R-80 删除 | `settings/recordsTab.ts`、`api/dialogs.ts` | `RecordCard.confirmDelete()`（N-5.4.7 确认弹窗） |
| R-81 … R-84 实时更新 | `settings/recordsTab.ts` | `RecordsList` 构造中的三个监听 |

**1.4 已知问题处理**

| 问题 | 处理 |
|---|---|
| R-Q1、R-Q2 百分比 | N-2.6 + 0–100 限制 |
| R-Q3 未排序 | D-5 |
| R-Q4 计数不一致 | 统一为有效行数 |
| R-Q5 无空状态、删除无确认 | 增加空状态；删除改为经确认弹窗（N-5.4.7，新版 A-14 要求） |
| R-Q6 重建丢失状态 | 每视频界面状态跨重建保留 |
| R-Q7 连续重建 | 原地更新 |
| R-Q8 状态文字被截断 | 不再截前缀 |
| R-Q9 颜色被忽略 | 成功/错误分别着色（N-5.1 只保留这两种） |
| R-Q10 首次显示“重新获取” | 首次显示“正在获取…” |
| R-Q11 缓存载入不设不透明度 | `show()` 统一设置 |
| R-Q12 DeArrow 出错永久 pending | 出错按“无标题”处理并移除按钮（fetch 内部已把错误变为 null） |
| R-Q13 原标题失败写 null | 不写 |
| R-Q14 残缺记录 | 记录不存在时不写笔记 |
| R-Q15 剪贴板无回退/无反馈 | `copyText()` 回退 + 失败提示 |
| R-Q16 提示文字 | 每个图标按钮都有 aria-label 与同名提示（N-5.2.3）；笔记按钮按有无笔记显示“添加笔记/编辑笔记” |
| R-Q17 指示器不可见 | 300 ms |
| R-Q18 选择器未转义 | 不再拼接选择器，用 `Map` 查找行 |
| R-Q19 删除不清缓存 | 删除时清字幕缓存 |
| R-Q20 null 视频 ID 也重建 | **保留**（当前视频置顶需要） |

### 1.5 存储标签（T-1 … T-87）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| T-1 … T-14 配色、按钮装饰、焦点环、状态消息 | `api/ui.ts`、`api/ui.css` | `button()`、`messageLine()`；N-5.2.4 / N-5.7.5 取代配色 |
| T-15 … T-19 标签容器 | `settings/storageTab.ts` | `createStorageTab()` |
| T-20 … T-45 后端选择与迁移 | `settings/storageTab.ts`、`api/ui.ts`、`utils/storage.ts` | `selectControl()`（N-5.7.1 下拉框取代单选卡片）、确认弹窗、`switchMode()` |
| T-46 … T-62 导出 | `settings/storageTab.ts` | `exportFileName()`、`downloadFile()`、分享分支 |
| T-63 … T-84 导入 | `settings/storageTab.ts`、`utils/storage.ts` | `runImport()`、`importData()` |
| T-85 … T-87 联动 | `settings/recordsTab.ts`、`settings/shell.ts` | `bulk` 变更触发列表重建；语言切换整体重建 |

**1.5 已知问题处理**（按原编号 1–22）

| 问题 | 处理 |
|---|---|
| 1 GM 不可用丢数据 | 禁用选项 + `switchMode()` 拒绝 |
| 2 无反馈 | 成功/失败/无需迁移都有消息 |
| 3 忙碌态不可见 | 按钮禁用 500 ms，结果以消息显示 |
| 4 合并覆盖 | **保留**（T-39 规定“移动并合并”） |
| 5 覆盖导入可清空 | 无有效记录时拒绝 |
| 6 校验宽松 | `entries` 必须是非数组对象；非字符串值序列化，`null` 跳过 |
| 7 校验错误不本地化 | 前缀双语；`Invalid import payload` **保留**英文（S-34 规定） |
| 8 iOS 新标签页分支无效 | 删除该分支，直接下载 |
| 9 分享提示语义 | 改为事后提示 |
| 10 文件名看不到 | 读取完成前一直显示 |
| 11 读取错误未处理 | 显示错误 |
| 12 文件名含冒号 | **保留**（T-56 规定的对外格式） |
| 13 报错晦涩 | `copyText()` 回退与明确的“剪贴板不可用” |
| 14 消息不消失 | **保留**（T-14） |
| 15 焦点环颜色 | 单色焦点环（border-l2，N-5.2） |
| 16 键盘可达性 | 原生复选框、可聚焦的文件选择框；单选卡片为 label |
| 17 焦点环覆盖内阴影 | 文本域不再使用内阴影 |
| 18 标题追加两次 | 只追加一次 |
| 19 导入后不清空 | **保留**（T-82 规定保留文本） |
| 20 主题不实时 | CSS 实时 |
| 21 提示错位 | 覆盖复选框旁说明改为“导入前先删除当前存储后端中的全部记录” |
| 22 只处理进度记录 | **保留**（S-28/S-32/S-36） |

### 1.6 字幕 / 界面标签、徽标、启动（L-1 … L-78）

| 规格条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| L-1 … L-5 卡片通用样式 | `api/ui.ts`、`api/ui.css` | N-5.7 改为分组标题 + 设置行：`group()`、`settingsRow()` |
| L-6 … L-26 字幕设置卡片与保存 | `plugins/transcript/index.ts`、`plugins/transcript/service.ts` | `renderTab()`、`updateSettings()`、`secretInput()` |
| L-27 … L-32 状态与提示卡片 | `plugins/transcript/index.ts` | `renderTab()` 中的 `update()` |
| L-33 … L-50 界面语言 | `settings/displayTab.ts`、`utils/i18n.ts` | `createDisplayTab()`、`setPreference()` |
| L-51 … L-55 面板组装 | `settings/index.ts`、`settings/shell.ts` | 插件注册的标签；`SettingsModal` |
| L-56 … L-61 徽标 | `plugins/_core/playerBadge/index.ts` | `createBadge()`、`ensureBadge()` |
| L-62 … L-64 语言变更刷新 | `settings/shell.ts`、`playerBadge/index.ts` | `rebuild()`、`renderBadge()` |
| L-65 … L-67 Font Awesome | `plugins/_core/playerBadge/index.ts` | `ensureFontAwesome()`（只注入一次） |
| L-68 界面初始化顺序 | `index.ts`、`api/plugins.ts` | `bootstrap()`、`startPlugins()` |
| L-69 … L-73 启动清理 | `api/records.ts` | `cleanupRecords()` |
| L-74 … L-77 DOM 重绑定观察器 | `plugins/_core/playerBadge/index.ts`、`plugins/badgeToggle/index.ts` | `ctx.observe(...)` + `ensureBadge()` |
| L-78 启动流程 | `index.ts`、`plugins/_core/engine/index.ts` | `bootstrap()`；保存/恢复由引擎完成 |

**1.6 已知问题处理**

| 问题 | 处理 |
|---|---|
| L-Q1 状态提示不可见 | **保留**（重建后新面板状态行为空；切换效果本身即反馈） |
| L-Q2 “已使用该语言”不可达 | `choiceGroup()` 点击已选项不触发（与之等价）；代码保留该分支 |
| L-Q3 auto 触发重建 | **保留**（偏好确实变化） |
| L-Q4 选项固定文本 | 翻译表 |
| L-Q5 显示名只分 zh/其它 | **保留**（只支持中英） |
| L-Q6 无法清空 | 见 S-Q16 |
| L-Q7 不回写输入框 | **保留**（L-26 规定） |
| L-Q8 小数分钟显示取整 | **保留**（L-18） |
| L-Q9 非标准路径不补后缀 | **保留**（L-22） |
| L-Q10 监听泄漏 | 面板清理时移除 |
| L-Q11 中文占位 | 双语“正在获取标题…/Loading title…” |
| L-Q12、L-Q13 章节容器挂载 | `ensureBadge()` 每次都按“左侧控制栏 → 章节容器”尝试 |
| L-Q14 重建后回到“加载中” | 徽标状态保存在 `api/badge.ts` |
| L-Q15 Font Awesome 重复追加 | 只注入一次 |
| L-Q16、L-Q17 轮询/定时器 | 引擎单一循环 |
| L-Q18 清理只作用于当前后端、重置同名 | 同名不再重置；只清理当前后端**保留** |
| L-Q19 打开判断 | 使用 `isOpen()` 状态而非 display |
| L-Q20 观察器开销 | 回调合并到微任务、只做一次 `querySelector` |

## 第二部分 · 新版改动

| 条目 | 实现文件 | 主要函数 / 说明 |
|---|---|---|
| N-0.1 元数据 | `../build.ts` | `header` |
| N-0.2 目录结构 | `api/`、`utils/`、`plugins/_core/*`、`plugins/*`、`index.ts` | |
| N-0.3 构建 | `../build.ts` | `generatePluginList()`、`Bun.build`、`css-as-text` 插件、`.meta.js` |
| N-0.4 Trusted Types | `utils/dom.ts`、`../build.ts` | `h()`；构建时 `forbidden` 正则检查 |
| N-0.5 格式兼容 | `api/records.ts`、`utils/storage.ts` | 键与字段不变 |
| N-1.1 新字段 | `plugins/_core/engine/index.ts`、`api/records.ts`、`plugins/driveSync/sync.ts` | `videoDuration`（`write()`）、`updatedAt`（`writeRecord(kind='content')`）、`driveSync` |
| N-1.2 读取-合并-写回 | `api/records.ts` | `updateRecord()` |
| N-1.3 新设置键 | `api/pluginSettings.ts`、`utils/storage.ts`、`plugins/driveSync/*` | `YSRP_Plugins`；`readSecretSetting()/writeSecretSetting()`；`YSRP_DriveFullSyncDone` |
| N-1.4 导入对象值 | `utils/storage.ts` | `importData()` |
| N-2.1 原因表 | — | 各 BUG 的修复见下 |
| N-2.2 视频会话 | `plugins/_core/engine/index.ts` | `Session`、`switchTo()`、`endSession()` |
| N-2.3 播放器就绪 | `api/player.ts` | `readyPlayer()`、`isAdShowing()` |
| N-2.4 恢复 | `plugins/_core/engine/index.ts`、`api/hooks.ts` | `decide()`、`beginRestore()`、`continueRestore()`、`finishRestore()`、`runBeforeRestoreHooks()` |
| N-2.5 保存 | `plugins/_core/engine/index.ts` | `save()`、`write()`、`flush()` |
| N-2.6 列表百分比 | `settings/recordsTab.ts` | `progressText()` |
| N-3 选择弹窗 | `plugins/_core/playerBadge/resumeDialog.ts`、`api/resumePrompt.ts`、引擎 `choose()` | `createResumePrompt()`、`askResume()` |
| N-4.1 插件定义 | `api/plugins.ts` | `PluginDef`、`PluginContext`（`addTab`、`addRowButton`、`beforeRestore` 等） |
| N-4.2 启用判定 | `api/plugins.ts` | `isEnabled()` |
| N-4.3 启动顺序与容错 | `api/plugins.ts` | `startPlugins()`、`startPlugin()` |
| N-4.4 运行中开关 | `api/plugins.ts` | `setPluginEnabled()`、`PluginContext.dispose()` |
| N-4.5 设置项 | `api/plugins.ts`、`settings/pluginsTab.ts` | `SettingDef`、`getSetting()`、`settings.set/reset`、`settingControl()` |
| N-4.6 插件清单 | `plugins/_core/engine`、`_core/playerBadge`、`_core/settings`、`badgeToggle`、`transcript`、`driveSync` | 各自 `index.ts` |
| N-4.7 字幕插件关闭 | `plugins/transcript/index.ts`、`api/tabs.ts`、`api/rows.ts` | 标签与行按钮随插件注销 |
| N-5.1 颜色、单色图标、字体 | `api/theme.css`、`utils/dom.ts` | 11 个颜色令牌 + 图标块底色，`prefers-color-scheme` 实时切换；`icon()` 只继承文字色；DeArrow 改为 `wand-magic-sparkles`，显示原标题时 `.is-off`（0.4） |
| N-5.2.1 卡片 | `api/ui.ts`、`api/ui.css` | `card()`、`cardMark()`：图标块、标题（提示框）、小标记、控件组、两行说明、分隔线、页脚（空时 `&nbsp;`） |
| N-5.2.2 卡片网格 | `api/ui.ts`、`api/ui.css` | `grid()`：`repeat(2, 1fr)`、间距 12px、≤640px 单列 |
| N-5.2.3 图标按钮 | `api/ui.ts` | `iconButton()`：24px、`aria-label` + 同名 `title`、`.is-active` |
| N-5.2.4 普通按钮 | `api/ui.ts`、`api/ui.css` | `button({variant: primary/secondary/tertiary/danger, small})` |
| N-5.2.5 开关 | `api/ui.ts` | `switchControl()`：`role="switch"`、`aria-checked`、150ms 过渡 |
| N-5.2.6 输入框与下拉框 | `api/ui.ts` | `textInput()`、`textArea()`、`selectControl()`（右侧箭头）、`secretInput()` |
| N-5.2.7 设置行 | `api/ui.ts` | `settingsRow()`：右侧控件 / 下方整行内容 |
| N-5.2.8 分组标题 | `api/ui.ts` | `group()`；组间 1px 分隔线与 16px 间距 |
| N-5.2.9 搜索筛选栏 | `api/ui.ts` | `searchBar()`：输入框占满、筛选下拉 120px |
| N-5.2.10 分类标签条 | `api/ui.ts` | `categoryStrip()`：三级小按钮、选中项 2px 下划线 |
| N-5.2.11 子弹窗 | `api/dialogs.ts` | `openDialog({size: sm/md/lg})`：透明层、✕、Esc/点外面只关最上层 |
| N-5.2.12 字段 | `api/ui.ts` | `field()` |
| N-5.2.13 确认弹窗 | `api/dialogs.ts` | `confirmDialog()`：小号、取消 + 主按钮/危险按钮 |
| N-5.2.14 信息提示 | `api/ui.ts` | `infoHint()` |
| N-5.2.15 空状态 | `api/ui.ts` | `emptyState()` |
| N-5.2.16 滚动区域 | `settings/style.css`、`api/ui.css` | `.ysrp-pane` 左右各延伸 20px；细滚动条 |
| N-5.3.1 … N-5.3.4 外壳、关闭、滚动 | `settings/shell.ts`、`settings/scrollLock.ts`、`settings/style.css` | `open()/close()`；Esc 由 `api/dialogs.ts` 先关子弹窗；`createScrollLock()` 也放行子弹窗内的滚动 |
| N-5.3.5 左栏导航与版本信息 | `settings/shell.ts`、`build.ts`、`utils/constants.ts` | `renderNav()`、`versionFooter()`；`git rev-parse --short HEAD` → `__COMMIT__`（失败为 `dev`），`--dev` → “Development” |
| N-5.3.6 右栏标题行 | `settings/shell.ts`、`api/tabs.ts` | `refreshHeader()`；`TabDef.info()` 信息提示、存储标记、刷新图标 |
| N-5.3.7 窄屏 | `settings/style.css`、`api/ui.css` | 媒体查询 |
| N-5.4 记录标签 | `settings/recordsTab.ts`、`settings/rowParts.ts`、`api/rows.ts` | `RecordsList`（搜索/筛选/空状态）、`RecordCard`（图标、标记、控件组、说明、页脚、实时更新）、`progressText()`、`isFinished()` |
| N-5.4.4 / N-5.4.5 链接、笔记子弹窗 | `settings/rowParts.ts` | `openLinkDialog()`、`openNoteDialog()`（`Ctrl/⌘+Enter` 保存） |
| N-5.4.6 字幕子弹窗 | `plugins/transcript/index.ts` | `openTranscriptDialog()` |
| N-5.4.7 删除确认 | `settings/recordsTab.ts` | `RecordCard.confirmDelete()` |
| N-5.5 插件标签 | `settings/pluginsTab.ts`、`api/pluginSettings.ts`、`api/plugins.ts` | 分类条、搜索筛选、置顶排序、核心分隔线；`setListed('starred' / 'pinned')`；`hasFailed()` 启动失败标记 |
| N-5.6 插件设置子弹窗 | `settings/pluginsTab.ts` | `openPluginDialog()`、`settingRow()`；重置经 `confirmDialog()` |
| N-5.7.1 存储标签 | `settings/storageTab.ts` | 三组设置行；迁移与覆盖导入各有确认弹窗 |
| N-5.7.2 字幕标签 | `plugins/transcript/index.ts` | `renderTab()`：“接口”“当前视频”两组 |
| N-5.7.3 云同步标签 | `plugins/driveSync/index.ts` | “Google Drive”“如何获取凭据”两组 |
| N-5.7.4 界面标签 | `settings/displayTab.ts` | 设置行 + 下拉框（自动 / 中文 / English） |
| N-5.7.5 结果消息 | `api/ui.ts` | `messageLine()` |
| N-5.8 时间戳选择弹窗外观 | `plugins/_core/playerBadge/resumeDialog.ts`、`playerBadge/style.css` | 子弹窗样式，宽 `min(448px, 播放器宽 − 32px)`，主/次按钮，无 ✕ |
| N-6 💾 徽标开关 | `plugins/badgeToggle/index.ts`、`plugins/badgeToggle/style.css` | |
| N-7.1 凭据 | `plugins/driveSync/drive.ts` | `readCredentials()`、`saveCredentials()`、`hasCredentials()` |
| N-7.2 访问令牌 | `plugins/driveSync/drive.ts` | `DriveClient.accessToken()`、`call()`（401 重试） |
| N-7.3 文件夹 | `plugins/driveSync/drive.ts` | `folderId()` |
| N-7.4 文件 | `plugins/driveSync/drive.ts`、`sync.ts` | `fileNameFor()`、`videoIdFromName()`、`payload()` |
| N-7.5 查找 | `plugins/driveSync/drive.ts` | `filesFor()` |
| N-7.6 上传 | `plugins/driveSync/sync.ts` | `queueUpload()`、`kick()`、`upload()` |
| N-7.7 删除 | `plugins/driveSync/sync.ts` | `handleChange()`、`deleteRemote()` |
| N-7.8 打开视频时下载 | `plugins/driveSync/sync.ts`、`index.ts` | `pull()`，经 `ctx.beforeRestore()` 登记 |
| N-7.9 首次全量 | `plugins/driveSync/sync.ts` | `fullSync()`、`importLegacy()` |
| N-7.10 状态 | `plugins/driveSync/sync.ts`、`index.ts` | `setStatus()`、`statusText()` |
| N-7.11 标签 | `plugins/driveSync/index.ts` | `render()` |
| N-7.12 容错与网络 | `utils/net.ts`、`plugins/driveSync/sync.ts` | `httpRequest()`；同步错误只更新状态 |

### N-2.1 各 BUG 的修复位置

| 编号 | 修复 |
|---|---|
| BUG-1 | 每个视频一个会话（引擎 `switchTo()`） |
| BUG-2 | 恢复结束前不保存（阶段机） |
| BUG-3 | `readyPlayer()` 校验 `getVideoData().video_id` |
| BUG-4 | `isAdShowing()` 视为未就绪 |
| BUG-5 | 0.5 秒阈值，暂停不写 |
| BUG-6 | 后端抛错，`write()` 显示“⚠ 保存失败” |
| BUG-7 | 不使用 innerHTML（`utils/dom.ts`、构建检查） |
| BUG-8 | `videoDuration` + `progressText()` |

### N-8 有意差异

| 编号 | 实现 |
|---|---|
| D-1 | 引擎 `choose()` + `resumeDialog.ts` |
| D-2 | 引擎 `decide()` 的 `finished` 分支 |
| D-3 | 引擎 `tick()` 的直播判定 |
| D-4 | `shell.ts` 遮罩 click、`document` Esc |
| D-5 | `RecordsList.rebuild()` 排序 |
| D-6 | `importData()` |
| D-7 | 引擎 `write()` 的 `videoDuration` |
| D-8 | `api/plugins.ts` + 各插件目录 |
| D-9 | `DriveSync.pull()` 作为恢复前钩子 |
| D-10 | `plugins/badgeToggle/` |
| D-11 | `settings/shell.ts`、`settings/style.css` |
| D-12 | `settings/scrollLock.ts`（不改 html/body overflow） |
| D-13 | 被 N-5.4.3 取代：卡片内不再有任何面板，链接/笔记/字幕都在子弹窗里（`rowParts.ts`、`transcript/index.ts`） |

## 第三部分 · 验收清单

| 编号 | 主要实现 | 自动化 |
|---|---|---|
| A-1 | 引擎 `flush()`（pagehide）+ 恢复 | ✓ |
| A-2、A-3 | 会话切换、`endSession()` | ✓ |
| A-4 | `readyPlayer()`、阶段机 | ✓ |
| A-5 | `isAdShowing()` | ✓ |
| A-6、A-6b、A-6c | `choose()`、`resumeDialog.ts`、`linkStartTime()` | ✓ |
| A-7 | 0.5 秒阈值 | ✓ |
| A-8 | `video_id` 校验、会话末次读数 | ✓ |
| A-9、A-9b | `decide()`、`continueRestore()` | ✓ |
| A-10 | `write()` 错误提示 | ✓ |
| A-11 | 读取-合并-写回 | ✓ |
| A-12 | `ensureBadge()` + 观察器 | ✓ |
| A-13、A-13b | `shell.ts`、`scrollLock.ts` | ✓ |
| A-14 | `recordsTab.ts`、`rowParts.ts`、`api/ui.ts`（`card()`、`searchBar()`）、`api/dialogs.ts` | ✓ |
| A-15 | `storageTab.ts`、`utils/storage.ts`、`confirmDialog()` | ✓ |
| A-16 | `plugins/transcript/*` | ✓ |
| A-17 | `displayTab.ts`、`i18n.ts`、`shell.rebuild()` | ✓ |
| A-18 | 全部（DOM API） | ✓ |
| A-19 | `pluginsTab.ts`、`setPluginEnabled()` | ✓ |
| A-20 | `plugins/badgeToggle/` | ✓ |
| A-21、A-22、A-23 | `plugins/driveSync/*` | ✓ |
| A-24 | `pluginsTab.ts`、`api/pluginSettings.ts`（`starred`/`pinned`）、`api/dialogs.ts`、`shell.ts`（版本页脚）、`build.ts`（提交哈希） | ✓ |
| A-25 | `api/theme.css`、`api/ui.css`、`api/ui.ts`、各标签文件 | ✓ |
