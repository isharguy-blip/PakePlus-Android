/* 教员台 · core.js —— 地基（常量 / 默认工厂 / 存取 / 纯工具 / 声明表基础设施；无依赖，必须最先加载）
   拆分评估方案 v1.1 §3 · 依赖关系：core ← engines ← {panels, views, achv} ← main
   函数体自 app.js（1.26 版，7451 行）逐字搬迁，改动面仅声明位置 / 文件位置 / 常量归位三类。 */

'use strict';

/* ============================================================
   教员台 · 个人课程管理系统 —— app.js（插单 1.25 统计筛选区收纳（v1.34 拍板：默认折叠摘要行 + 「时间范围 / 课程与类型 / 结算与口径」
   三组分区 + 激活高亮 badge-warn；折叠/展开纯 UI 态随 resetTodayUi 复位，零 schema 变更）；
   插单 1.22 排课项级授课班级（v1.27 方案乙拍板：entries 增可选
   classes、留空跟随课程；班级仅展示用——排课列表/周格色块/今日清单渲染实时回落 entry.classes →
   course.classes，不写入流水快照、不进统计/结算/导出；粘贴导入不解析班级（注释固化）；R4 纯增量零迁移，
   旧数据缺省 "" 自动兼容）；
   插单 1.21 剪贴板 JSON 导入/导出（B.7 #30：数据面板「复制全部数据」+
   粘贴 JSON 文本解析预览；复用 1.8 文件导入同一预览模型 uiImportParsed 与确认链路，R2 预览确认铁律不变、
   文件导入行为零变化；clipboard API 不可用时 execCommand 兜底、再不可用横幅引导文件导出，失败绝不静默；
   纯 UI 增量零 schema 变更，R4）；
   插单 1.20 统计面板·自由筛选（B.6 #22/#27 五项拍板：
   时间范围四选一含跨校历、课程/课时类型多选 chips、排除停课开关、结算状态筛选、口径小字回显、
   进度列仅本学期、理论/实训拆分列全范围、筛选结果内嵌 CSV 导出；纯读取投影层零 schema 变更，
   默认态与 2.2 口径逐条一致）；
   插单 1.23+1.24 合并轮：排课项删除·甲级联硬删（R7 弹窗确认→级联删未冻结生成流水，冻结/manual 保留、entryId 自然悬空，零 schema 变更）+ 复制排课项（卡片「复制」纯表单预填带入全字段，新建提交 nextId 发新 id、createdAt 为当下）+ 1.19 第三写点（新建排课项提交 findEntryConflict：同校历同星期节次相交且 weeks[] 有交集才横幅提示，不硬拒；编辑态不触发）；
   插单 1.19 调课/补课冲突软提示（AI 提案 A2 / B.6 #21：改期落点同节次已有流水——含停课记录，按建议算占用并注明——横幅警告不硬拒、允许故意连堂；检测抽纯函数 findPeriodConflict 区间相交判定，调课/补课两写点共用，脏数据静默放行）；
   插单 1.17 重新展开影响预览 + 校历结构变更越界提示（B.6 #8/#14）：
   expandEntries 抽出只读计划层 buildExpandPlan（与预览共用，C4 最小改动），新增 previewExpandImpact 干跑预览
   （零写入，R2 精神延伸到引擎操作）——新增/更新/移除/冻结跳过/manual 计数 + 越界周与节次越界清单（只提示不拒收，
   与 1.5 F1 同精神）；排课面板「重新展开」两步走：预览卡 + 确认执行（expandEntries + saveState + 横幅汇报）/ 取消零写入；
   插单 1.16 口径收口（B.6 #6）：weekNoOfDate/weekNoOfToday 统一
   UTC 天数差（dateDayNum 零点锚定，DST 防线）/ 统计名义聚合 round2 / 对账写点同月多条先取 updatedAt 最新再覆盖；
   插单 1.15 导入合并健壮性：悬空引用预览统计 / 无 id 表键序去重 /
   动态 id 白名单校验（含渲染输出层清场）/ reconciles 按 month 唯一键合并 / 同 id 冲突详情预览；
   插单 1.14 数据安全防线：§12 业绩 schema 预置 / 损坏数据备份恢复口 /
   展开引擎脏数据防线（totalWeeks 整数校验 + breaks 数组兜底）/ 导入 counter 全局抬升 / 自动快照轮转与启动自愈；
   插单 1.12 周格周末列按需显示：默认 5 列·周末占用扩列·纯渲染投影；
   插单 1.13 课程色块手选：8 色色板可覆盖、提交端白名单回落；
   插单 1.11 节次时刻表节数可调（8/10/12 三档·全链路联动）/ 二期 2.3 对账核对 / 2.2 统计面板 / 2.1 结算规则 /
   一期 1.9 文本粘贴解析均已交付）；
   三期 3.0a 业绩本·地基（附录A §12 首轮写入：顶栏第 9 入口「业绩」+ 分类管理（重命名/新增/禁删防悬空/排序）+
   按日条目 CRUD（删除弹窗确认 R7）+ 单月可打印导出（§12.4 投影同源、§12.6 命名与三形态之首）+
   orgName/userName/userTitle 设置入口（选址业绩面板「月报导出与设置」卡）；
   拍板①不加「级别/分值」维度、②附件不扩表采纳降级方案 content 存链接/本地路径——
   均 2026-09-18 用户「按建议」授权 AI 裁决；R4：纯写数据与 UI，零结构改动零迁移）；
   三期 3.0b 业绩本·导出与批量（§12.6 形态二全年逐月分节 / 形态三全年汇总可打印导出、
   复制上月条目——源月/目标月显式选择（源月默认上一月）、预览确认（R2 零写入）、
   新 id 发号（nextId('a')）+ 日期平移钳月末、本人作用空白提醒（导出时横幅 + 清单小字，
   不阻断，R7）——三项拍板 2026-09-18 用户「按建议」授权 AI 裁决，落变更记录 v1.38；
   §12 既定 schema 纯增量，零结构改动零迁移，R4）；
   三期 3.0c 业绩本·导入（附录A §12.5 两格式首轮写入：JSON 数组 [{date, category, content, role}]
   与随手记文本行（全/半角竖线、日期可省取基准月 1 日、按前三个竖线切四段且第四段起全归
   「本人作用」——拍板① 2026-09-18 用户授权按建议裁决）→ 表格预览（R2 零写入：分类名模糊匹配
   精确/去括号/子串三级、未命中标红可预览改派或自动新建、失败行标红拒收、同名待新建分类多行
   只建一门）→ 确认落库（条目 nextId('a') 重新发号 D7、新建分类 nextId('ac') order=max+1）；
   B.7 #41 同名分类合并（拍板②：确认时静默按 name 去重保留 updatedAt 新者、预览列合并清单、
   条目归属自动改挂——全量 JSON 合并链路同规则）；R4：§12 四要素冻结，纯写导入与 UI，零结构改动零迁移）；
   三期 3.1a 融合轮之子轮一「CSV 课表文件导入」（v1.41 拍板①②⑤ 按建议裁决，升版随用户指令）：
   D5 导入两级制之②首轮——CSV 文件选择 → FileReader 字节直读 → BOM 剥离 / UTF-8 主解 /
   U+FFFD 乱码回退 GBK（TextDecoder 原生能力，零依赖不违 R1）→ 极简 RFC 4180 逗号分列转制表符
   （双引号字段保护格内逗号）→ 填入粘贴文本域，复用 1.9 parseScheduleText / buildPastePreview /
   onPasteImportConfirm 整条「解析→预览（R2 零写入）→确认落库自动展开（方案 3）」链路零分叉；
   去重键 / 越界拒收 / 改派 / 自动新建课程 / 调色板配色全沿用 1.9；xlsx 魔数（PK）拒收并引导
   另存 CSV 或走粘贴（拍板② 砍 .xlsx 直读）；纯增量零 schema 变更（R4），index.html / style.css
   未动（文件选择框复用 .data-actions 既有样式）
   三期 3.1b 资料库·课级便签（附录A §10 memos 首写；v1.42 拍板①–⑤ 按建议裁决，
   升版随用户指令）：课程卡「便签」按钮（btn-sec，脏 id 沿用 1.15 防线不渲染不绑定）→ 行内
   抽屉单开（uiMemoCourseId 纯 UI 态随 resetTodayUi 复位；复用 cal-form-card / today-line 体系
   零新增样式）→ 列表按创建时间倒序（escapeHtml 回显）→ 新增（text trim 必填、上限 200 字、
   courseId 锁课程、instanceId 恒 null——v1.41 拍板③暂不开放、nextId('m') 发号 D7）→ 删除弹窗
   确认（R7 不可逆）；归档课程抽屉只读不渲染新增框（拍板⑤，与 §5 归档语义一致）；CRUD 仅
   新增/删除二件套不做编辑（拍板②，C2 最小）；R4 纯启用零结构改动零迁移

   插单 1.26「审查修复批」（2026-09-18 专家审查清单 P0/P1 八处：csvToPasteText 字段内
   换行→空格 / 业绩导入 skipped 双重计数 / 角色快改 input 缺失静默清空守卫 / 校历节数
   变更纳入 shapeChanged 提示 / 快照 typeId 比对 null·undefined 归一 / 非周一起始日锚点
   引擎·周格双判据 / 冲突扫描与展开引擎 try·catch 永不阻断——P0-3 与 P1-7/8 为代码级
   守卫、mock 无法构造缺失场景，断言覆盖 P0-1/P0-2/P1-4/P1-5/P1-6 五处）；
   三期 3.1d 前半「周次点阵选择器强化」（排课项自定义周次 chips → 点阵，纯 UI 增量：
   每周圆点 10 列一行、选中实心底、悬停 title、「已选 N 周」计数回显；隐藏 checkbox 与
   collectEntryWeeks 取值口沿用 1.4 契约，基线断言零改写；连续/单/双周规律模式与
   weeks[] 权威语义不变，Q1/R4 零迁移；style.css 新增 .weekmatrix/.week-dot 两条样式）；
   三期 3.1c 移动端只读视图（D8 既有范围；v1.43 拍板①–④ 按建议裁决，升版随用户指令）：
   周格视图在 ≤640px 窄屏重排为「今日课程 + 本周课程」两卡只读视图——共用窄屏谓词
   isMobileViewport（innerWidth≤640 单一判定口；isAchvMobileMode 保留为业绩速记兼容口，R5 清场）
   顶栏零新增入口；移动端不提供调课/停课/补课/人数/便签等一切写操作，底部一行提示回桌面端
   （R7 横幅/小字，不弹窗）；数据口径只认流水（calendarId + 日期区间过滤），含调课/补课，
   临时停课标删除线（与周格色块同口径，勿现场回算）；纯渲染投影零写入，桌面宽屏行为逐字节不变
   （沙盒无 innerWidth 恒走桌面路径，基线断言零改写基石）；R4 纯增量零迁移；
   style.css / index.html 未动（移动两卡复用 today-panel / today-line / wg-tag 既有体系）

   三期 3.0d 移动端业绩快速录入（B.7 #35–#38 定调；拍板①②③ 2026-09-18 用户授权按建议裁决，
   落变更记录 v1.40）：窄屏 ≤640px 自适应移动布局——首屏大文本行快速录入复用 3.0c 解析/预览/
   确认链路（R2 零写入不变）+ 语音转文字引导（B.7 #37）+ 一键补竖线（拍板③：半/全角逗号、
   顿号、分号、斜杠统一转 |，仅作用解析前草稿、幂等不叠加）+ 今天/本月/全部三段列表（今天默认，
   B.7 #38；分类筛选二级下拉不占首屏）+ 轻量编辑（仅「本人作用」快改 + 删除弹窗 R7，内容/日期/
   分类修改回桌面端）+ 备份提醒（拍板②：settings.lastAchievementExportAt 月报/全年三导出口统一
   写入、复制上月不算、距上次导出 >7 天横幅，固定 7 天不入 settings，C2）；范围红线：手机端不做
   分类管理/导出配置/附件（B.7 #35）；桌面宽屏布局与行为逐字节不变——移动分支经 innerWidth
   谓词隔离（沙盒无 innerWidth 恒走桌面路径），基线断言零改写；R4 纯增量零迁移）；
   约束：零依赖（R1）；localStorage 单键存取（D7）；
         Schema v1（附录A，本轮只改数据不改结构，R4）；中文注释（C5）
   ============================================================ */
'use strict';

/* ============================================================
   一、常量
   ============================================================ */

/** localStorage 单键（D7：单键原子写，防半残数据） */


/* ============================================================
   声明式 UI 态复位基础设施（拆分评估方案 v1.1 §4.2；P2-9/21 一并解决）
   原则：不改变量名、不引入命名空间——695 项基线断言逐字零改写的基石。
   ============================================================ */
function makeUiDecl(getter, setter, def) {
  return { get: getter, set: setter, def: def };
}
function applyUiDecls(decls) {
  for (let i = 0; i < decls.length; i++) {
    const d = decls[i];
    d.set(typeof d.def === 'function' ? d.def() : d.def);
  }
}


const STORAGE_KEY = 'instructorDesk.state.v1';

/** 数据结构版本（附录A，演进须递增并配迁移函数，红线 R4） */

const SCHEMA_VERSION = 1;

/** 自动快照单键（插单 1.14 子项 5：saveState 成功时同步写入最新一份；启动时主键损坏可从此恢复） */

const SNAPSHOT_KEY = 'instructorDesk.state.v1.snapshot';

/**
 * 自动快照滚动槽（四期④b，B.12-1.1：误操作回滚纵深）——保存时把上一份主快照下推入
 * 3 个滚动槽之一，主快照键始终为最新；恢复时按「最新→最旧」逐个尝试救回历史版本。
 */
const SNAPSHOT_ROT_COUNT = 3;
const SNAPSHOT_ROT_KEYS = [
  SNAPSHOT_KEY + '.1', SNAPSHOT_KEY + '.2', SNAPSHOT_KEY + '.3'
];
/** 滚动槽写序标记键（持久化当前槽位，跨会话轮转次序稳定） */
const SNAPSHOT_ROT_INDEX_KEY = SNAPSHOT_KEY + '.rot';
/** 损坏备份保留份数（四期④b，B.12-1.2：启动清理，超 5 份按时间戳删最旧，防 localStorage 无限增长） */
const CORRUPT_KEEP = 5;

/** 损坏数据备份键前缀（插单 1.14 子项 2：检测到主键/快照损坏时，原始字符串原样备份，禁止静默重置） */

const CORRUPT_KEY_PREFIX = 'instructorDesk.state.v1.corrupt.';

/** 课程调色板（附录A §5：默认按创建顺序循环分配；插单 1.13 起课程表单可点选覆盖，仅认此八色，不开放自由色值） */

const COURSE_PALETTE = [
  '#5B8FF9', '#5AD8A6', '#F6BD16', '#E8684A',
  '#6DC8EC', '#9270CA', '#FF9D4D', '#269A99'
];

/**
 * 颜色白名单校验：课程色只允许 #RRGGBB，非法值（脏导入/手改存储）回落默认灰。
 * 1.6 周格已按此模式加固；本轮提取公用函数并顺手加固 1.3 课程面板 / 1.4 排课面板的
 * course-dot 同款注入隐患（顾头不顾腚禁令 R5 的正面落实）。
 */

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8c959f';
}

/**
 * 调色板自动分配（插单 1.13 抽出公用）：按课程位次循环取色。
 * 新建取 state.courses.length（「创建顺序」语义不变）；编辑态选「自动」或脏值回落取 indexOf 位次。
 */

function paletteAutoColor(index) {
  const n = COURSE_PALETTE.length;
  return COURSE_PALETTE[((index % n) + n) % n];
}

/**
 * 校历节数（插单 1.11 全链路唯一取值口）：periodTimes.length 即该校历节数；
 * 缺失/空数组/脏数据一律按 12 节默认兜底（与 totalWeeks 兜底同精神，R4：不产出 NaN 网格）。
 * 凡涉及节次上限处（排课/补课时校验、周格行数、periodRangeOf、粘贴导入越界判据）禁止写死 12，必经此函数。
 */

function periodCountOf(cal) {
  return (cal && Array.isArray(cal.periodTimes) && cal.periodTimes.length >= 1)
    ? cal.periodTimes.length : 12;
}

/**
 * 窄屏移动视图判定（三期 3.1c 抽出共用，v1.43 拍板①）：innerWidth ≤640 唯一判定口。
 * 桌面宽屏与无 innerWidth 环境（测试沙盒）恒为桌面路径——业绩速记（3.0d）与
 * 周格只读视图（3.1c）共用同一分流，避免两处谓词漂移（R5 伴生物清场）。
 */

function isMobileViewport() {
  return typeof window !== 'undefined' && Number(window.innerWidth) > 0 &&
    window.innerWidth <= 640;
}

/* ============================================================
   二、默认数据工厂
   ============================================================ */

/**
 * 预置 12 节节次时刻表（附录A §4：一期预置 12 节，可界面编辑）。
 * 1.1 向导直接采用；1.2「校历管理」开放编辑后再改此处不负责。
 */

function defaultPeriodTimes() {
  const raw = [
    [1,  '08:00', '08:45'],
    [2,  '08:55', '09:40'],
    [3,  '10:00', '10:45'],
    [4,  '10:55', '11:40'],
    [5,  '14:00', '14:45'],
    [6,  '14:55', '15:40'],
    [7,  '16:00', '16:45'],
    [8,  '16:55', '17:40'],
    [9,  '19:00', '19:45'],
    [10, '19:55', '20:40'],
    [11, '20:50', '21:35'],
    [12, '21:40', '22:25']
  ];
  return raw.map(function (row) {
    return { period: row[0], start: row[1], end: row[2] };
  });
}

/**
 * 预置业绩分类（附录A §12.2：加分项 / 教学建设 / 科研工作 / 其他工作，order 1–4）。
 * 插单 1.14 子项 1（B.6 #1）：3.0a 前预置进 createInitialState 与 loadState 防御补齐，
 * 纯增量演进（R4），旧数据加载时自动补齐；id 为固定 'ac-1'~'ac-4'（创建时不依赖全局 state，
 * 故不能用 nextId），加载路径由 liftCounterGlobal 把计数器抬过 4，防撞号（D7）。
 */

function defaultAchievementCategories() {
  const ts = nowIso();
  return [
    { id: 'ac-1', name: '加分项',           order: 1, createdAt: ts, updatedAt: ts },
    { id: 'ac-2', name: '教学建设（日常工作）', order: 2, createdAt: ts, updatedAt: ts },
    { id: 'ac-3', name: '科研工作（重点工作）', order: 3, createdAt: ts, updatedAt: ts },
    { id: 'ac-4', name: '其他工作（临时工作）', order: 4, createdAt: ts, updatedAt: ts }
  ];
}

/** 预置课程类型（附录A §3：理论 / 实验 / 实践，一期仅存档不参与计算，D10） */

function defaultCourseTypes() {
  return [
    { id: 'theory',   name: '理论', coefficient: 1 },
    { id: 'lab',      name: '实验', coefficient: 1 },
    { id: 'practice', name: '实践', coefficient: 1 }
  ];
}

/**
 * 全新初始状态：严格按附录A §1 顶层 state 的字段与默认值。
 */

function createInitialState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      activeCalendarId: null,   // null = 未初始化 → 首次启动向导
      theme: 'light',
      reconcileTolerance: 0.5,  // 二期用，先设默认值
      instanceCounter: 0,       // 全实体 id 单调计数器种子（附录A §11）
      orgName: '口腔医学院',     // 附录A §12.1：业绩导出表头用（插单 1.14 预置，可改）
      userName: '',             // 教师姓名（导出表头 / 文件命名用）
      userTitle: '',            // 职务/职称（导出表头用）
      lastAchievementExportAt: null,  // 三期 3.0d 拍板②：业绩备份提醒时间戳（月报/全年三导出口统一写入；null = 从未导出，不误报）
      lastFullExportAt: null          // 四期④b：JSON 全量备份时间戳（导出文件/剪贴板全量两写点统一写入；null = 从未备份）
    },
    calendars: [],
    courseTypes: defaultCourseTypes(),
    headcountTiers: [],          // 二期结算规则启用
    courses: [],
    entries: [],
    instances: [],
    rules: [],                   // 一期为空，D10 降级运行
    reconciles: [],              // 二期启用
    memos: [],
    achievementCategories: defaultAchievementCategories(),   // 附录A §12.2 预置四类（插单 1.14）
    achievements: []             // 附录A §12.3 业绩条目（3.0a 起写入，本轮仅预置空表）
  };
}

/* ============================================================
   三、全局状态与 localStorage 存取（D7）
   ============================================================ */

let state = null;

/** localStorage 是否可用（隐私模式/被禁用时降级为内存态并提示） */

let storageAvailable = true;

let snapshotRotIdx = -1;            // 四期④b：快照滚动槽写序（渲染期态；持久化副本在 SNAPSHOT_ROT_INDEX_KEY）

let lastFullBackupRemindDay = '';   // 四期④b：全量备份提醒「同一自然日一次」（B.11-U7 精神）

/**
 * 读取状态：
 *  - 读不到（首次启动）→ 全新初始状态；
 *  - JSON 解析失败或结构损坏 → 丢弃损坏数据，回退全新初始状态（不臆造半残数据）；
 *  - schemaVersion 不符 → 一期仅支持 v1，回退全新初始状态（二期起走迁移函数，R4）。
 */
/**
 * 读取状态（插单 1.14 强化：数据安全纵深「快照→恢复→备份→修复」）：
 *  - 读不到（首次启动）→ 全新初始状态；若主键缺失但自动快照存在 → 从快照恢复并修复主键；
 *  - 主键损坏（JSON 解析失败 / 结构非法 / schemaVersion 不符）→ 先尝试快照自愈；
 *    快照可用 → 恢复 + 主键损坏内容原样备份；快照亦损坏 → 双双落 corrupt 备份口；
 *  - 一切损坏路径都先把原始字符串原样备份到 instructorDesk.state.v1.corrupt.<时间戳> 键
 *    并横幅告知（R7 不弹窗）——禁止静默重置（设计哲学 4：数据比软件活得久）；
 *  - 旧数据（schemaVersion=1 但缺新字段）→ 防御性补齐（含 §12 业绩三字段与两表预置），
 *    并把 instanceCounter 抬到全局最大 id（防撞号，D7）。
 */

function loadState() {
  pruneCorruptBackups();   // 四期④b：损坏备份启动清理（超 CORRUPT_KEEP 份删最旧）
  let raw = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    storageAvailable = false;
    return createInitialState();
  }

  // 主键缺失：尝试从自动快照恢复（启动自愈，子项 5；四期④b 起含滚动槽回退）
  if (raw === null) {
    const snap = restoreFromSnapshot();
    if (snap) {
      repairMainKey(snap.raw);
      liftCounterGlobal(snap.state);
      showBanner('已从自动快照恢复数据（主存储键缺失）。', 'success');
      return snap.state;
    }
    return createInitialState();
  }

  const parsed = tryParseState(raw);
  if (parsed) {
    liftCounterGlobal(parsed);   // 预置分类 ac-1~ac-4 等并入旧数据后，计数器抬到全局最大
    return parsed;
  }

  // 主键损坏：先尝试快照自愈（子项 5；四期④b 起按主快照→滚动槽次序逐个尝试），失败再走 corrupt 备份口（子项 2）
  const snap = restoreFromSnapshot();
  if (snap) {
    backupCorruptRaw(raw, 'main');      // 主键原始串原样备份（可导出人工修复后经导入合并回）
    repairMainKey(snap.raw);            // 恢复同时修复主键，下次启动直连主键
    liftCounterGlobal(snap.state);
    showBanner('主数据损坏，已从自动快照恢复（原始数据已备份）。', 'error');
    return snap.state;
  }
  // 快照全部不可用（含滚动槽）：逐个原样落备份口，绝不静默丢弃
  snapshotCandidateRaws().forEach(function (sr, i) {
    backupCorruptRaw(sr, i === 0 ? 'snap' : 'snap' + i);
  });
  backupCorruptRaw(raw, 'main');
  showBanner('检测到数据损坏，已备份原始数据；系统已回退到初始状态。', 'error');
  return createInitialState();
}

/**
 * 快照候选原串（四期④b）：主快照键（最新）→ 3 个滚动槽按写序标记从最新到最旧。
 * 滚动槽引入前写下的旧数据只有主快照键，天然兼容（候选列表即主键一个）。
 */
function snapshotCandidateRaws() {
  const out = [];
  const mainRaw = readStorageKey(SNAPSHOT_KEY);
  if (mainRaw !== null) out.push(mainRaw);
  let idx = parseInt(readStorageKey(SNAPSHOT_ROT_INDEX_KEY), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= SNAPSHOT_ROT_COUNT) idx = -1;
  for (let k = 0; k < SNAPSHOT_ROT_COUNT; k++) {
    const i = (idx - k + SNAPSHOT_ROT_COUNT * 2) % SNAPSHOT_ROT_COUNT;
    const r = readStorageKey(SNAPSHOT_ROT_KEYS[i]);
    if (r !== null) out.push(r);
  }
  return out;
}

/** 快照恢复：按候选顺序返回首个可解析的 { raw, state }；全部不可用 → null（绝不臆造） */
function restoreFromSnapshot() {
  const raws = snapshotCandidateRaws();
  for (let i = 0; i < raws.length; i++) {
    const st = tryParseState(raws[i]);
    if (st) return { raw: raws[i], state: st };
  }
  return null;
}

/** 损坏备份启动清理（四期④b，B.12-1.2）：corrupt.* 超 CORRUPT_KEEP 份时按时间戳键名删最旧（字典序即时间序） */
function pruneCorruptBackups() {
  try {
    const ls = window.localStorage;
    const keys = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.indexOf(CORRUPT_KEY_PREFIX) === 0) keys.push(k);
    }
    keys.sort();
    while (keys.length > CORRUPT_KEEP) ls.removeItem(keys.shift());
  } catch (err) { /* 清理失败不阻塞启动（主流程不受影响） */ }
}

/** 容错读存储键：任何异常按 null 处理（数据层不抛错） */

function readStorageKey(key) {
  try { return window.localStorage.getItem(key); } catch (err) { return null; }
}

/**
 * 解析并防御补齐状态对象：JSON 解析失败 / 非对象 / 数组 / schemaVersion 不符 → 返回 null；
 * 合法则按 createInitialState 的字段清单补齐缺失的顶层表与 settings 子字段（§12 预置由此进旧数据）。
 */

function tryParseState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    const fresh = createInitialState();
    const keys = Object.keys(fresh);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      // W2-C #99：空串视为缺失一并补齐（theme:'' / orgName:'' 等脏 falsy 值）；
      // 0 与 false 属合法值不补齐（instanceCounter 0、reconcileTolerance 0 语义不动）
      if (parsed[k] === undefined || parsed[k] === null || parsed[k] === '') {
        parsed[k] = fresh[k];
      }
    }
    // W2-C #99：settings 本体非对象（脏字符串/数字/数组）按整表缺失回补——修复前字符串
    // 本体进逐键补齐会在 strict 模式抛 TypeError，导致整份数据走损坏拒收路径
    if (typeof parsed.settings !== 'object' || parsed.settings === null ||
        Array.isArray(parsed.settings)) {
      parsed.settings = fresh.settings;
    }
    const settingsKeys = Object.keys(fresh.settings);
    for (let j = 0; j < settingsKeys.length; j++) {
      const sk = settingsKeys[j];
      // W2-C #99：settings 子字段空串同样回补（0/false 合法值不动，同顶层口径）
      if (parsed.settings[sk] === undefined || parsed.settings[sk] === null ||
          parsed.settings[sk] === '') {
        parsed.settings[sk] = fresh.settings[sk];
      }
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

/**
 * 快照滚动写入（四期④b）：上一份主快照下推 3 槽之一（LRU 式轮转），主快照键恒为最新；
 * 首次保存（无上一份）只写主键不落槽——与 1.14 既有断言「主键内容 == 快照内容」逐字节兼容。
 */
function writeSnapshotRotated(json) {
  const prev = window.localStorage.getItem(SNAPSHOT_KEY);
  let idx = parseInt(readStorageKey(SNAPSHOT_ROT_INDEX_KEY), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= SNAPSHOT_ROT_COUNT) idx = snapshotRotIdx;
  if (prev !== null) {
    idx = (idx + 1) % SNAPSHOT_ROT_COUNT;
    window.localStorage.setItem(SNAPSHOT_ROT_KEYS[idx], prev);
    window.localStorage.setItem(SNAPSHOT_ROT_INDEX_KEY, String(idx));
  }
  snapshotRotIdx = idx;
  window.localStorage.setItem(SNAPSHOT_KEY, json);
}

/** 恢复成功后修复主键：把可用内容写回主键（下次启动直连主键，快照继续作第二道防线） */

function repairMainKey(raw) {
  try { window.localStorage.setItem(STORAGE_KEY, raw); } catch (err) { /* 修复失败不阻塞，快照仍在 */ }
}

/** 损坏数据原样备份：原始字符串一个字节不改写入 corrupt.<ISO时间戳>.<来源> 键 */

function backupCorruptRaw(raw, source) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    window.localStorage.setItem(CORRUPT_KEY_PREFIX + stamp + '.' + source, raw);
  } catch (err) { /* 备份失败不阻塞回退，但横幅仍会告知数据损坏 */ }
}

/**
 * 写入状态：单键整体序列化（D7 原子写）。
 * 写入失败（如超出配额）不中断操作，由顶部状态灯提示用户。
 */

function saveState() {
  if (!storageAvailable) { updateSaveIndicator(false); return; }
  setSaveLampSaving();   // 四期⑦ U27：写入瞬间保存灯切「保存中…」（呼吸样式见 style.css）
  try {
    const json = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, json);
    lastSaveAtMs = Date.now();   // W4-F：保存灯时间感知写点（main.js 变量，调用发生时六脚本已求值）
    // 插单 1.14 子项 5 + 四期④b：自动快照——同一份 JSON 写入主快照键（恒为最新）；
    // 上一份下推 3 槽滚动（误操作可回滚 3 份深，槽位经标记键持久化）；快照失败不影响主键
    try { writeSnapshotRotated(json); } catch (snapErr) { /* 快照失败静默降级 */ }
    updateSaveIndicator(true);
  } catch (err) {
    updateSaveIndicator(false);
  }
}

/**
 * 生成实体 id：前缀 + settings.instanceCounter 单调递增（附录A §11，防导入合并撞号，D7）。
 */

function nextId(prefix) {
  state.settings.instanceCounter += 1;
  return prefix + '-' + state.settings.instanceCounter;
}

/** 当前 ISO 时间戳（仅用于 createdAt / updatedAt，附录A §11） */

function nowIso() {
  return new Date().toISOString();
}

/**
 * 计数器全局抬升（插单 1.14 子项 4，B.6 #4a）：扫描全部带 id 表（含 achievements），
 * 解析 id 末尾序号，把 settings.instanceCounter 抬到全局最大——防脏导入/旧备份里的
 * i-999 之类高序号与后续 nextId 发号撞号（D7）。幂等，可反复调用。
 */

function liftCounterGlobal(s) {
  let max = (s && s.settings && Number.isFinite(s.settings.instanceCounter))
    ? s.settings.instanceCounter : 0;
  const scanTables = ALL_ID_TABLES;   // 四期④b：ID 表清单收口（此前此处与健康检查两处各自 concat）
  scanTables.forEach(function (name) {
    if (!Array.isArray(s[name])) return;
    s[name].forEach(function (r) {
      if (!r || typeof r.id !== 'string') return;
      const m = r.id.match(/-(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  });
  s.settings.instanceCounter = max;
}

/* ============================================================
   四、渲染根节点（渲染函数已分驻 views.js / panels.js / achv.js；
   本文件仅保留根节点绑定——复审 P1-1 余项清场）
   ============================================================ */

const appRoot = document.getElementById('app');

/**
 * 主区滚动位置留存（四期⑥ U8）：appRoot 每次整体重渲染（innerHTML 替换）前后留存并恢复
 * 窗口 / .main-area 滚动位置——表单提交、展开收起等同视图重渲染不再跳回顶部。
 * 视图切换时 renderApp 置 appRoot.__keepScroll = false，包装器读到即不保留（回顶自然）。
 * 实例级 defineProperty 包装（数据属性影子），任何异常静默降级为改前行为（1.5 F1 同精神）。
 */
(function () {
  var _html = '';   // 无原生 innerHTML 环境（测试 mock）的存储兜底
  var nativeDesc = null;
  try {
    if (typeof Element !== 'undefined' && Element.prototype) {
      nativeDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    }
  } catch (e) { nativeDesc = null; }
  try {
    Object.defineProperty(appRoot, 'innerHTML', {
      configurable: true,
      enumerable: true,
      get: function () {
        return nativeDesc ? nativeDesc.get.call(appRoot) : _html;
      },
      set: function (v) {
        var keep = appRoot.__keepScroll !== false;   // renderApp 视图切换时置 false
        appRoot.__keepScroll = true;
        var stW = 0, stE = 0, ma = null;
        if (keep && typeof window !== 'undefined') {
          stW = window.pageYOffset || 0;
          if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
            ma = document.querySelector('.main-area');
            stE = ma ? (ma.scrollTop || 0) : 0;
          }
        }
        if (nativeDesc) nativeDesc.set.call(appRoot, v);   // 真实 DOM 必须真正写入
        else _html = v;                                     // mock 环境兜底存储
        if (keep && (stW || stE)) {
          if (stW && typeof window.scrollTo === 'function') window.scrollTo(0, stW);
          if (ma) ma.scrollTop = stE;
        }
      }
    });
  } catch (err) { /* 包装失败静默降级：行为与改前一致（滚动位置不留存） */ }
})();

const ICON_LOGO =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
  '<path d="M16 2v4M8 2v4M3 10h18"/></svg>';

const ICON_GRID =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
  '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
  '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
  '<rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

const ICON_BOOK =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>' +
  '<path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>';

const ICON_CAL =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
  '<path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"/></svg>';

const ICON_ENTRIES =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h10"/></svg>';

const ICON_WIZARD =
  '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
  '<path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>';

function normalizeTypeId(typeId) {
  return state.courseTypes.some(function (t) { return t.id === typeId; }) ? typeId : 'theory';
}

/** 课程类型中文名（先经 normalizeTypeId 回退再取，显示永不落空） */

function courseTypeName(typeId) {
  const t = state.courseTypes.find(function (x) { return x.id === normalizeTypeId(typeId); });
  return t ? t.name : '理论';
}

/**
 * 排课项的课时性质（1.7 增补，用户裁定方案 B）：entries.typeId 为可选字段——
 * 空/非法则回落课程类型（附录A §5）。一门课理论+实训混合时按排课项段分别定型
 * （如 1-8 周理论、9-16 周实训），期末统计与 §12.4 投影按实例快照拆分。
 * 纯增量演进：schemaVersion 维持 1，旧数据该字段缺省，解析链自动兼容（R4）。
 */

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const WEEK_KIND_NAMES = { every: '每周', odd: '单周', even: '双周', custom: '自定义' };

/**
 * 由模式参数生成显式周列表（Q1：weeks[] 为权威数据，本函数是唯一的生成口）。
 * 单双周基期固定「第 1 周 = 奇周」（B.1）：odd → 周号 % 2 === 1，even → % 2 === 0。
 * 调用方负责范围校验（start/end 须在 [1,totalWeeks] 且 start<=end）；
 * 规律模式下范围内可能没有任何一周（如单周 + 范围 2–2），调用方须拒收空列表。
 */

function buildPatternWeeks(kind, startWeek, endWeek) {
  const weeks = [];
  for (let w = startWeek; w <= endWeek; w++) {
    if (kind === 'every') weeks.push(w);
    else if (kind === 'odd' && w % 2 === 1) weeks.push(w);
    else if (kind === 'even' && w % 2 === 0) weeks.push(w);
  }
  return weeks;
}

/** 周次模式的人话摘要（排课项列表 / 冒烟测试用） */

function weekPatternText(wp) {
  if (wp.kind === 'custom') {
    // 四期④c（B.9-4.4）：单周自定义显「第 X 周」，多周维持「（自定义）」
    if (wp.weeks.length === 1) return '第 ' + wp.weeks[0] + ' 周';
    if (wp.weeks.length <= 10) return '第 ' + wp.weeks.join('、') + ' 周（自定义）';
    return '共 ' + wp.weeks.length + ' 周（自定义）';
  }
  return '第 ' + wp.startWeek + '–' + wp.endWeek + ' 周（' + WEEK_KIND_NAMES[wp.kind] + '）';
}

/** 节次下拉选项（插单 1.11：上限 = 该校历 periodTimes.length，缺省 12） */

function fmtLocalDate(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

/** 周次 + 星期 → 授课日期：startDate（第 1 周周一锚点，D4）+ (weekNo-1)*7 + (weekday-1) 天 */

function dateOfWeek(calendar, weekNo, weekday) {
  const parts = calendar.startDate.split('-');
  const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  base.setDate(base.getDate() + (weekNo - 1) * 7 + (weekday - 1));
  return fmtLocalDate(base);
}

/** 实例层快照三字段（§7）：periods 字符串（单节只写节号）、location（空回落课程默认地点，写入快照）、nominalHours */

const WEEK_STATUS_NAMES = { moved: '调课', canceled: '停课', makeup: '补课' };

const ICON_PREV_WEEK =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M15 18l-6-6 6-6"/></svg>';

const ICON_NEXT_WEEK =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9 18l6-6-6-6"/></svg>';

/** 周次钳制：翻周/本周一律限制在 [1, totalWeeks]（越界翻周原地不动） */

function clampWeek(weekNo, totalWeeks) {
  return Math.min(totalWeeks, Math.max(1, weekNo));
}

/**
 * 本地日期串 → UTC 日序号（插单 1.16 子项①，B.6 #6）：以 Date.UTC 锚定零点计算天数，
 * 不经过本地时区午夜与 DST 偏移——周次换算全链路（今日定位 / 调课 / 补课改期）唯一口径。
 */

function dateDayNum(dateStr) {
  const p = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}

/**
 * 合法日历日校验（四期④a，纯函数；与 normalizeAchvDate 同口径——正则 + Date.UTC 反查）：
 * 2026-02-30 / 2026-13-01 这类「格式合法但日历不存在」的日期一律拒绝。
 * 向导 / 校历 / 规则 / 调课 / 补课各日期校验口统一经此判据（只换判据不换错误文案与防御行为，C4）。
 */
/**
 * updatedAt 数值时间戳（W2-C #40，2026-09-20 问题列表裁决）：ISO 时间串统一经 Date.parse
 * 转数值比较——带/不带毫秒、时区偏移等格式不一致的字符串此前按字典序比较会错序
 * （#327/#328 同源缺陷）；缺失/非法一律 0（缺时间戳视为最旧），与改前
 * `(a || '') > (b || '')` 的缺失语义逐字节等价（双方缺失比较为假 → 保留本地）。
 */
function updatedAtNum(v) {
  const t = Date.parse(v);
  return isFinite(t) ? t : 0;
}

function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const p = String(s).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

/** 今天按校历 startDate 周一锚点换算的周次（D4；可能越界，由 clampWeek 钳制；
    与 weekNoOfDate 同算法口径——UTC 天数差，1.16 收口） */

function weekNoOfToday(cal) {
  return Math.floor((dateDayNum(fmtLocalDate(new Date())) - dateDayNum(cal.startDate)) / 7) + 1;
}

/** 任意日期 → 校历周次（与 weekNoOfToday 同锚点同算法——UTC 天数差，1.16 收口；调课/补课改期的合法性校验口） */

function weekNoOfDate(cal, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NaN;
  return Math.floor((dateDayNum(dateStr) - dateDayNum(cal.startDate)) / 7) + 1;
}

/** YYYY-MM-DD → 星期（1=周一 … 7=周日；周格列定位唯一入口） */

function weekdayOfDate(dateStr) {
  const w = new Date(dateStr + 'T00:00:00').getDay();
  return w === 0 ? 7 : w;
}

/** 流水 periods 串（"3-4" / "5"）→ {start,end}；上限 maxPeriod 缺省 12（插单 1.11 参数化，兼容旧调用）；
    非法值返回 null（渲染跳过，不臆造） */

function periodRangeOf(periodsStr, maxPeriod) {
  const max = (Number.isInteger(maxPeriod) && maxPeriod >= 1) ? maxPeriod : 12;
  const m = String(periodsStr).match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const s = parseInt(m[1], 10);
  const e = m[2] ? parseInt(m[2], 10) : s;
  if (!(s >= 1 && e <= max && s <= e)) return null;
  return { start: s, end: e };
}

const ICON_DATA =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8 8l4 4 4-4"/><path d="M12 3v9"/>' +
  '<path d="M3 15v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/></svg>';

/** 顶栏「规则」入口图标（线性 SVG，R3） */

const ICON_RULE =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/>' +
  '<path d="M1 14h6M9 8h6M17 16h6"/></svg>';

/** 顶栏「统计」入口图标（线性 SVG，R3） */

const ICON_STATS =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 3v18h18"/>' +
  '<path d="M7 15l4-5 3 3 5-7"/></svg>';

/** CSV 字段序（附录A §7 全字段 + 四期④c classes 投影列，表头即字段名） */

const CSV_FIELDS = [
  'id', 'entryId', 'courseId', 'calendarId', 'date', 'weekNo', 'periods', 'location',
  'headcount', 'nominalHours', 'typeId', 'settledHours', 'settleMode', 'status', 'source',
  'frozen', 'movedFromDate', 'overrideNote', 'linkNote', 'ruleVersion', 'createdAt', 'updatedAt',
  'classes'
];

/** 可合并的顶层表：带 id 的按 id 合并，无 id 的按整条去重 */
// 插单 1.14 子项 1：并入附录A §12 业绩两表——achievementCategories 按 id 合并；
// achievements 本轮仅并入表结构（JSON 导入重新发号是 3.0c 的另案，故暂按整条去重）

const IMPORT_TABLES = ['calendars', 'courseTypes', 'headcountTiers', 'courses', 'entries',
  'instances', 'rules', 'reconciles', 'memos', 'achievementCategories', 'achievements'];

const IMPORT_ID_TABLES = ['calendars', 'courseTypes', 'courses', 'entries', 'instances',
  'rules', 'memos', 'achievementCategories'];

/**
 * 全部带 id 表清单收口（四期④b，B.12-1.4）：此前 liftCounterGlobal（core）与
 * runDataHealthCheck（engines）各自 IMPORT_ID_TABLES.concat(['achievements']) 两处维护——
 * 收为单一常量，新增带 id 表只改一处（R5 伴生物同步清场）。
 */
const ALL_ID_TABLES = IMPORT_ID_TABLES.concat(['achievements']);

/**
 * 键名排序序列化（插单 1.15 子项②）：无 id 表整条去重的比较键。
 * 改前：JSON.stringify 受键序影响，同一对象键序不同会被当成两条重复并入；
 * 改后：键名递归排序后序列化，键序差异不再产生重复记录。
 */

function fileDateStamp() {
  const d = new Date();
  return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
}

/** JSON 全量导出：完整 state 序列化（含 schemaVersion），往返无损 */

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV 辅助导出：流水表全字段，UTF-8 带 BOM，Excel 直开不乱码 */

function copyTextToClipboard(text) {
  const nav = window.navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      return nav.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopyText(text); });
    } catch (err) {
      return Promise.resolve(legacyCopyText(text));
    }
  }
  return Promise.resolve(legacyCopyText(text));
}

/** execCommand 降级（file:// 等非安全上下文路径）：临时 textarea 选中后复制；环境不支持返回 false */

function legacyCopyText(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    if (document.body && document.body.appendChild) document.body.appendChild(ta);
    if (typeof ta.select === 'function') ta.select();
    else if (typeof ta.setSelectionRange === 'function') {
      ta.setSelectionRange(0, String(text).length);
    }
    const ok = (typeof document.execCommand === 'function')
      ? document.execCommand('copy') : false;
    if (typeof ta.remove === 'function') ta.remove();
    return !!ok;
  } catch (err) {
    return false;
  }
}

/**
 * 「复制全部数据（JSON）」入口：内容恒等于 exportStateJson() 全量（含 schemaVersion）；
 * 成功/失败均横幅汇报（R7 不弹窗）；clipboard 不可用自动走降级路径并引导改用文件导出。
 */

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  if (a.remove) a.remove();
  // 延后回收：立即 revoke 在部分浏览器会中断尚未建立的下载流（F1 复审修复）
  window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
}

/**
 * 导入载荷校验（纯函数，零副作用）：
 * 非对象 / schemaVersion 不符（R4）/ 未识别到任何数据表 / 表结构非数组 → 拒收并给出原因。
 */

function round2(v) {
  return Math.round(v * 100) / 100;
}

function defaultStatsFilter() {
  return { range: 'semester', month: '', dateFrom: '', dateTo: '',
    courses: {}, types: {}, excludeCanceled: true, settleFilter: 'all',
    statusFilter: 'all' };   // 四期⑨（B.11-U29）：授课状态筛选默认值，'all' 为恒真口径
}

/** 自由筛选态（纯 UI 态，不入数据；跨视图切换时随 resetTodayUi 复位为默认） */

const ICON_RECON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
  '<path d="M14 2v6h6M9 15l2 2 4-4"/></svg>';

/** 顶栏「业绩」入口图标（线性 SVG，R3；clipboard-list 语义：业绩记账） */

const ICON_ACHV =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
  '<path d="M9 12h6M9 16h4"/></svg>';

/**
 * 月度名义学时投影（对账口径，纯函数）：date 前缀匹配自然月（跨校历——月份串全局唯一，
 * 同月即同学期）；计入 normal / moved / makeup，排除 canceled（Q2）；名义学时求和并
 * round2 收口（D10：不用结算学时，规则未定时留空不影响对账，R6）。
 */

const ACHV_REPORT_CSS =
  'body{font-family:"Songti SC","SimSun","PingFang SC","Microsoft YaHei",serif;color:#000;' +
  'max-width:860px;margin:24px auto;padding:0 24px;font-size:14px;line-height:1.7}' +
  'h1{text-align:center;font-size:20px;letter-spacing:4px;margin:0 0 4px}' +
  'h2{font-size:16px;margin:0 0 6px}' +
  '.rep-section{page-break-before:always}' +
  '.rep-section:first-of-type{page-break-before:auto}' +
  '.meta{display:flex;justify-content:space-between;margin:10px 0 14px;font-size:13px}' +
  'table{width:100%;border-collapse:collapse}' +
  'td,th{border:1px solid #000;padding:7px 9px;vertical-align:top;font-size:13px}' +
  'th{background:#f0f0f0}' +
  '.seq{width:34px;text-align:center}' +
  '.cat{width:150px}' +
  '.role{width:110px}' +
  '.sign{letter-spacing:1px}';

/**
 * §12.6 报表表体行（学时项行 + 分类动态行 + 承诺签字行；单月 / 全年逐月分节 / 全年汇总共用，C4）：
 * 学时项行 = §12.4 投影（一位小数 §12.4.7）；分类行动态渲染有条目分类（日期升序）；
 * 签字行填报时间 = 导出当日。studyLabel 供全年汇总标注「全年合计」。
 */

const ACHV_EXPORT_STALE_DAYS = 7;

/** 全量备份提醒阈值（四期④b，B.12-1.3：距上次 JSON 全量备份 >30 天横幅；固定 30 天不入 settings，C2） */
const FULL_EXPORT_STALE_DAYS = 30;

/** JSON 全量备份写点（四期④b）：全量导出文件 / 剪贴板复制全量两入口统一调用 + 落库 */
function markFullExported() {
  state.settings.lastFullExportAt = nowIso();
}

/** 距上次全量备份天数（纯函数，与 achvExportStaleDays 同口径）：缺失/非法 → null（不误报基石） */
function fullExportStaleDays() {
  const ts = state.settings.lastFullExportAt;
  if (typeof ts !== 'string' || !ts) return null;
  const t = Date.parse(ts);
  if (!isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** 全量备份提醒（数据面板渲染时调用；>30 天才提醒、同一自然日只一次、无记录/脏值不误报） */
function maybeFullBackupReminder() {
  const days = fullExportStaleDays();
  if (days === null || days <= FULL_EXPORT_STALE_DAYS) return false;
  const today = fmtLocalDate(new Date());
  if (lastFullBackupRemindDay === today) return false;
  lastFullBackupRemindDay = today;
  showBanner('距上次全量数据备份已 ' + days + ' 天（超 ' + FULL_EXPORT_STALE_DAYS +
    ' 天），请尽快「导出全部数据（JSON）」。', 'warn');
  return true;
}

/**
 * 距上次业绩导出的天数（纯函数，拍板②）：lastAchievementExportAt 缺失/非法 → null
 * （无导出记录不误报的基石）；否则按 Date.parse 差值向下取整天数。
 */

function isSafeElId(s) {
  return /^[A-Za-z0-9_-]+$/.test(String(s));
}

/**
 * 表单校验失败统一处理（四期⑦，B.12-2.4）：错误框写文案 → scrollIntoView（block:'nearest'，
 * 环境不可用时静默跳过不抛错）→ 出错输入框置 aria-invalid="true"（复学前经 clearFormInvalid 清除）。
 * mock 环境无 setAttribute 时降级为 __ariaInvalid 属性，语义一致。
 */
function formErrorAt(errBox, msg, inputId) {
  if (errBox) {
    errBox.textContent = msg;
    try {
      if (typeof errBox.scrollIntoView === 'function') {
        errBox.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) { /* 环境不支持 scrollIntoView：静默跳过（F1 同精神，不抛错） */ }
  }
  if (inputId) {
    const el = document.getElementById(inputId);
    if (el) {
      if (typeof el.setAttribute === 'function') el.setAttribute('aria-invalid', 'true');
      else el.__ariaInvalid = true;
    }
  }
}

/** 表单重开/重渲染时清除 aria-invalid（复学前清除，四期⑦） */
function clearFormInvalid(ids) {
  (ids || []).forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof el.removeAttribute === 'function') el.removeAttribute('aria-invalid');
    else el.__ariaInvalid = false;
  });
}

/** 危险操作统一确认口（四期⑦，B.9-2.3/B.12-2.5）：全部删除类确认收口此函数；
    人话文案规范 = 说明对象 + 不可恢复 + 级联范围（如有），由调用方传入。
    测试语义红线：沙盒无 confirm 时视为已确认——typeof window.confirm === 'function' 口径不得变。 */
/**
 * 原生 confirm 引用快照（W4-D，UX 裁决 #6，v1.78 拍板①）：加载时捕获——
 * 运行时 window.confirm === 本快照 ⇒ 浏览器原生环境（自定义危险弹层接管外观层）；
 * 被外部替换（测试桩）⇒ 保持旧同步语义。沙盒无 confirm 视为已确认口径不变（红线）。
 */
const __nativeWindowConfirm = (typeof window !== 'undefined' &&
  typeof window.confirm === 'function') ? window.confirm : null;

/**
 * 危险操作统一确认口（四期⑦收口 + W4-D 外观层替换，UX 裁决 #6 / v1.78 拍板①）：
 * 全部删除类确认收口此函数；人话文案规范 = 说明对象 + 不可恢复 + 级联范围（如有）。
 * 第二参 onOk（W4-D）：确认后执行的实际动作——
 *  ① 外部测试桩（window.confirm 被替换）：同步调用桩，真则立即执行 onOk（1157 断言时序基石）；
 *  ② 沙盒无 confirm：视为已确认，立即执行 onOk（typeof 红线逐字节不变）；
 *  ③ 浏览器原生环境：showDangerConfirm 自定义弹层接管，确认点击后才执行 onOk（异步，不阻断页面）。
 * 返回值：①② 为真实裁定（兼容遗留 `if (!ok) return;` 写法），③ 恒 false（动作改由弹层回调驱动）。
 */
function confirmDelete(msg, onOk) {
  const wc = (typeof window !== 'undefined') ? window.confirm : undefined;
  if (typeof wc === 'function') {
    if (__nativeWindowConfirm !== null && wc === __nativeWindowConfirm) {
      showDangerConfirm(msg, onOk);   // 原生环境：自定义危险确认弹层（仅替换外观层）
      return false;
    }
    if (wc(msg)) {                    // 外部测试桩：同步旧语义
      if (onOk) onOk();
      return true;
    }
    return false;
  }
  if (onOk) onOk();                   // 沙盒无 confirm：视为已确认（红线）
  return true;
}

/** HTML 转义：凡用户输入回显处必须过此函数，防注入 */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 四期⑨（B.11-U26）：空状态三件套统一入口——线性 SVG 图标＋说明＋主操作按钮
 * （btn-primary btn-auto），各面板共用；message/actionHtml 由调用方保证已转义或为静态串。
 */
function emptyStateHtml(message, actionHtml, iconHtml) {
  // W4-C #32：空状态图标按语义区分——iconHtml 由调用方传入面板语义图标（缺省日历图标）
  return '<div class="empty-state course-empty">' +
    '<div class="wizard-icon">' + (iconHtml || ICON_WIZARD) + '</div>' +
    '<p>' + message + '</p>' +
    (actionHtml ? '<div class="empty-ops">' + actionHtml + '</div>' : '') +
    '</div>';
}
