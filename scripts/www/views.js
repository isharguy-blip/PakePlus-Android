/* 教员台 · views.js —— 只读/操作视图：顶栏导航 / 周格视图（1.6/1.12/3.1c/四期吸收项①）/
   今日模式与流水操作。函数体逐字搬迁自 app.js 1.26；四期吸收项两小件（点击直达编辑 +
   信息悬浮 title）与四期②打印版式（翻周条「打印本周」+ printCurrentView）为本文件新增，
   其余函数体逐字未动。 */

'use strict';

/** 顶栏 HTML：品牌 + 视图导航（课表/排课/课程/校历） + 当前校历名 + 保存状态灯 */

function topbarHtml(cal) {
  const weekCls = uiView === 'week' ? ' active' : '';
  const courseCls = uiView === 'courses' ? ' active' : '';
  const entryCls = uiView === 'entries' ? ' active' : '';
  const calCls = uiView === 'calendars' ? ' active' : '';
  const dataCls = uiView === 'data' ? ' active' : '';
  const rulesCls = uiView === 'rules' ? ' active' : '';
  const statsCls = uiView === 'stats' ? ' active' : '';
  const reconCls = uiView === 'reconcile' ? ' active' : '';
  const achvCls = uiView === 'achv' ? ' active' : '';
  return (
    '<header class="topbar">' +
      '<div class="topbar-brand">' + ICON_LOGO + '<span>教员台</span></div>' +
      '<nav class="topbar-nav">' +
        '<button type="button" class="btn-topbar' + weekCls + '"' + (weekCls ? ' aria-current="page"' : '') + ' id="btnNavWeek">' +
          ICON_GRID + '<span>课表</span></button>' +
        '<button type="button" class="btn-topbar' + courseCls + '"' + (courseCls ? ' aria-current="page"' : '') + ' id="btnNavCourses">' +
          ICON_BOOK + '<span>课程</span></button>' +
        '<button type="button" class="btn-topbar' + entryCls + '"' + (entryCls ? ' aria-current="page"' : '') + ' id="btnNavEntries">' +
          ICON_ENTRIES + '<span>排课</span></button>' +
        '<button type="button" class="btn-topbar' + calCls + '"' + (calCls ? ' aria-current="page"' : '') + ' id="btnNavCalendars">' +
          ICON_CAL + '<span>校历</span></button>' +
        '<button type="button" class="btn-topbar' + dataCls + '"' + (dataCls ? ' aria-current="page"' : '') + ' id="btnNavData">' +
          ICON_DATA + '<span>数据</span></button>' +
        '<button type="button" class="btn-topbar' + rulesCls + '"' + (rulesCls ? ' aria-current="page"' : '') + ' id="btnNavRules">' +
          ICON_RULE + '<span>规则</span></button>' +
        '<button type="button" class="btn-topbar' + statsCls + '"' + (statsCls ? ' aria-current="page"' : '') + ' id="btnNavStats">' +
          ICON_STATS + '<span>统计</span></button>' +
        '<button type="button" class="btn-topbar' + reconCls + '"' + (reconCls ? ' aria-current="page"' : '') + ' id="btnNavRecon">' +
          ICON_RECON + '<span>对账</span></button>' +
        '<button type="button" class="btn-topbar' + achvCls + '"' + (achvCls ? ' aria-current="page"' : '') + ' id="btnNavAchv">' +
          ICON_ACHV + '<span>业绩</span></button>' +
      '</nav>' +
      '<div class="topbar-center" id="topbarCenter">' + escapeHtml(cal.name) + '</div>' +
      '<div class="topbar-right">' +
        '<span class="save-dot" id="saveDot"></span>' +
        '<span id="saveText" role="status"></span>' +
        // W4-F（UX #24/#139）：保存时间感知后缀节点（主文案 saveText 逐字不变）
        '<span class="factor-hint" id="saveTextAgo"></span>' +
      '</div>' +
    '</header>'
  );
}

/** 绑定顶栏视图导航：课表 ↔ 课程 ↔ 校历管理 */

function bindTopbarNav() {
  const btnWeek = document.getElementById('btnNavWeek');
  const btnCourses = document.getElementById('btnNavCourses');
  const btnCals = document.getElementById('btnNavCalendars');
  const btnEntries = document.getElementById('btnNavEntries');
  if (btnWeek) btnWeek.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'week'; renderApp(); });
  if (btnCourses) btnCourses.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'courses'; renderApp(); });
  if (btnEntries) btnEntries.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'entries'; renderApp(); });
  if (btnCals) btnCals.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'calendars'; renderApp(); });
  const btnData = document.getElementById('btnNavData');
  if (btnData) btnData.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'data'; renderApp(); });
  const btnRules = document.getElementById('btnNavRules');
  if (btnRules) btnRules.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'rules'; renderApp(); });
  const btnStats = document.getElementById('btnNavStats');
  if (btnStats) btnStats.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'stats'; renderApp(); });
  const btnRecon = document.getElementById('btnNavRecon');
  if (btnRecon) btnRecon.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'reconcile'; renderApp(); });
  const btnAchv = document.getElementById('btnNavAchv');
  if (btnAchv) btnAchv.addEventListener('click', function () {
      if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫（R7 横幅挽留）
      resetTodayUi(); uiView = 'achv'; renderApp(); });
}

/** 切换视图时收起今日清单的操作区（仅 UI 态清理，不碰数据） */

let uiWeekOffset = 0;

/** 四期⑥（B.11-U16）：今日清单切日偏移（纯 UI 态；0 = 今天，正 = 未来日，负 = 往日；
    往日/明日清单只读；随 resetViewsUi 跨视图复位） */

let uiTodayOffset = 0;

/** 四期⑥（B.11-U15）：周末列手动开关（纯 UI 态；'auto' = 沿用 1.12 自动判定，
    'always' = 常显 7 列；同 uiWeekOffset 惯例跨视图保留，不随复位） */

let uiWeekendCols = 'auto';

/** W4-F（UX #45/#46）：周格发现性提示「同一自然日一次」日标记（照备份提醒惯例，渲染期纯 UI 态） */
let weekDiscoverHintDay = '';

/* ---------- 四期⑥ 导航与视图交互批：hash 路由 / 键盘统一守卫 / Esc 最小集
   （纯 UI 增量，R4 零迁移； VALID_VIEWS 与 renderApp 分发一一对应） ---------- */

const VALID_VIEWS = ['week', 'entries', 'courses', 'calendars', 'data',
  'rules', 'stats', 'reconcile', 'achv'];

/** hash 串 → 视图（纯函数，便于沙盒断言）：去 # 后命中合法清单透传，其余一律回落 week */

function viewFromHashStr(h) {
  const v = String(h || '').replace(/^#/, '');
  return VALID_VIEWS.indexOf(v) >= 0 ? v : 'week';
}

/** 读取当前地址栏 hash 对应视图（B.11-U20：刷新/直链恢复视图；非法值回落 week） */

function viewFromHash() {
  try { return viewFromHashStr(window.location.hash); } catch (e) { return 'week'; }
}

/**
 * 键盘统一守卫（B.11-U19 伴生条款）：焦点在输入框 / 文本域 / 下拉框 / 富文本时，
 * 一切快捷键（Esc / ←/→ 翻周）一律不触发——防录入过程误触导航。
 */

function kbFocusInField() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
    a.isContentEditable === true;
}

/**
 * Esc 最小集（B.9-2.4）：关闭当前展开表单 / 抽屉——今日操作区、便签抽屉、排课/课程/校历
 * 编辑表单、规则草稿、对账编辑、业绩表单与分类管理、粘贴区与重展开预览；
 * 逐个命中即关并重渲染，全部未命中则零动作（不打扰）。R7：Esc 不弹窗。
 */

function onEscClose() {
  if (uiShortcutHelpOpen) { toggleShortcutHelp(); return; }   // 四期⑩：帮助浮层最优先关闭（纯 UI）
  // W0A #3（#135）：Esc 不得静默吞未提交修改——脏表单先挽留（R7 横幅，不弹窗）
  if (uiFormDirty) {
    showBanner('表单有未提交的修改，已保留编辑——请先保存或点「取消」放弃后再关闭。', 'info');
    return;
  }
  if (uiTodayInstId || uiTodayAction) { resetTodayUi(); renderApp(); return; }
  if (uiMemoCourseId) { uiMemoCourseId = null; renderApp(); return; }
  if (formRuleOpen) { formRuleOpen = false; uiRuleTierDraft = []; rulePrefill = null; renderApp(); return; }
  if (uiReconcileMonth) { uiReconcileMonth = null; renderApp(); return; }
  if (uiAchvFormOpen || formAchvId) {
    uiAchvFormOpen = false; formAchvId = null; renderApp(); return;
  }
  if (uiAchvCatOpen) { uiAchvCatOpen = false; formAchvCatId = null; renderApp(); return; }
  if (formEntryId || entryPrefill || uiEntryLocId) {
    formEntryId = null; entryPrefill = null; uiEntryLocId = null;   // W4-E 拍板⑥：Esc 一并关地点行内编辑
    renderApp(); return;
  }
  if (formCourseId) { formCourseId = null; renderApp(); return; }
  if (formCalendarId || uiSemInitOpen || uiSemInitPlan) {   // 插单 1.18：新学期初始化随 Esc 关闭
    formCalendarId = null; uiSemInitOpen = false; uiSemInitPlan = null;
    renderApp(); return;
  }
  if (uiPasteOpen || uiPasteParsed) {
    uiPasteOpen = false; uiPasteParsed = null; uiPasteError = ''; renderApp(); return;
  }
  if (uiExpandPreview) { uiExpandPreview = null; renderApp(); }
}

/** 今日清单当前展开操作的流水 id 与操作类型（move|cancel|makeup）：纯 UI 态，不入数据 */

let uiTodayInstId = null;

let uiTodayAction = null;

/** 流水状态角标文案（调课 / 临时停课 / 补课；normal 无角标） */

/* ============================================================
   四期 · 吸收项两小件（2026-09-19 交付；合并轮 C2 准入：同属本文件渲染层、互不相交；
   纯 UI 增量，零 schema 变更，R4）
   ① 周格色块点击直达编辑：可解析出当前校历既有排课项（entryId 命中）的色块渲染
     clickable 态 + 「点击直达编辑」提示，点击经 onWeekBlockClick 跳「排课」面板并
     按编辑态展开该排课项表单（与卡片「编辑」按钮同一语义）；manual 补课（entryId
     null）与悬空 entryId 零跳转 + R7 横幅人话说明；脏 id 沿用 1.15 防线不渲染跳转 id；
   ② 信息悬浮 title：周格色块 / 今日清单行 / 移动端只读行统一走 instanceTitleText
     悬浮提示（课程名 · 星期节次 · 地点 · 状态 · 人数），可交互处附操作引导语。
   ============================================================ */

/** 流水悬浮提示文本（纯函数）：课程名 · 周X 第N节 · 地点 · 状态角标 · 人数（空字段不臆造） */

function instanceTitleText(inst) {
  const course = state.courses.find(function (c) { return c.id === inst.courseId; });
  const parts = [course ? course.name : '未知课程'];
  parts.push(WEEKDAY_NAMES[weekdayOfDate(inst.date) - 1] + ' 第' + inst.periods + '节');
  if (inst.location) parts.push(inst.location);
  if (inst.status !== 'normal') parts.push(WEEK_STATUS_NAMES[inst.status]);
  // 四期④c（B.10-2.4/2.5）：调课原定日期与补课说明进悬浮提示，空字段不臆造
  if (inst.status === 'moved' && inst.movedFromDate) parts.push('原定 ' + inst.movedFromDate);
  if (inst.linkNote) parts.push(inst.linkNote);
  if (inst.headcount !== null && inst.headcount !== undefined) {
    parts.push(inst.headcount + '人');
  }
  return parts.join(' · ');
}

/** 色块可跳转排课项解析（纯函数）：entryId 命中当前校历既有排课项才返回该排课项，否则 null */

function weekBlockJumpEntry(inst, cal) {
  if (!inst || !inst.entryId) return null;
  const en = state.entries.find(function (x) {
    return x.id === inst.entryId && x.calendarId === cal.id; });
  return en || null;
}

/**
 * 色块点击直达编辑（四期吸收项①）：manual 补课（entryId null）与悬空 entryId 零跳转
 * + R7 横幅说明；命中排课项 → 切视图前 resetTodayUi 复位，跳「排课」面板并按编辑态
 * 展开表单（formEntryId + renderEntryForm，与卡片「编辑」按钮同链路）。
 */

function onWeekBlockClick(instId) {
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst) return;
  const cal = state.calendars.find(function (c) { return c.id === inst.calendarId; }) ||
    getActiveCalendar();
  const en = weekBlockJumpEntry(inst, cal);
  if (!en) {
    // W4-C #77（问题列表裁决 #77 部分采纳）：保留人话说明并给可操作路径（原仅一句死路说明）
    showBanner('该记录无法直达编辑。可操作路径：①今日清单改期/录人数；②「排课」面板重排。', 'info');
    return;
  }
  resetTodayUi();
  uiView = 'entries';
  formEntryId = en.id;
  renderApp();
  renderEntryForm();
}

/**
 * 空白格点击直达新建（B.11-U14）：周格空白格（非色块 / 停课角标，委托层已过滤）点击 →
 * 跳「排课」面板并按点击处星期 / 节次预填新建表单——复用 1.24 复制排课项的 entryPrefill
 * 链路（纯表单预填，零数据写入）；课程归属预选第一门开设中课程（无则留空待用户选择）。
 */

function onWeekBlankClick(weekday, period) {
  const cal = getActiveCalendar();
  if (!cal) return;
  resetTodayUi();          // 切视图统一复位（entryPrefill 在其后赋值，不被清掉）
  uiView = 'entries';
  const firstCourse = state.courses.find(function (c) { return c.status === 'active'; });
  entryPrefill = {
    courseId: firstCourse ? firstCourse.id : '',
    weekday: weekday,
    periodStart: period,
    periodEnd: period,
    weekPattern: { kind: 'every', startWeek: 1, endWeek: cal.totalWeeks,
      weeks: buildPatternWeeks('every', 1, cal.totalWeeks) },
    location: '',
    hoursPerSession: 2,
    typeId: null,
    classes: '',
    defaultHeadcount: null
  };
  formEntryId = null;
  renderApp();
  renderEntryForm();
}

/** 周次跳转取值口（纯函数，B.10-1.2）：目标周次钳制 [1,totalWeeks] 后换算翻周位移 */

function weekJumpOffset(cal, n) {
  const totalWeeks = (Number.isInteger(cal.totalWeeks) && cal.totalWeeks >= 1)
    ? cal.totalWeeks : 16;
  return clampWeek(n, totalWeeks) - weekNoOfToday(cal);
}

/** 打印当前视图（四期②）：window.print 不可用环境（沙盒/旧浏览器）静默跳过不抛错；纯展示层零数据写入 */

function printCurrentView() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

/**
 * 移动端只读顶栏（三期 3.1c）：保留品牌 / 当前校历名 / 保存状态灯，
 * 不渲染顶栏导航（避免从只读视图进入可写面板）；顶栏零新增入口（D8 不变）。
 */

/**
 * 移动端第二行导航（W0 #7，2026-09-19；3.1c「顶栏零新增入口」拍板的导航死路修正）：
 * 只读不等于不可导航——导航走顶栏下方独立第二行（.mobile-nav，style.css 承载），
 * 不挤占顶栏；仅移动视图渲染，桌面宽屏逐字节不变；写操作红线不变（3.1c 移动周格
 * 仍只读，目标面板按各自口径分流，如业绩走 3.0d 速记）。
 */
function mobileNavHtml() {
  const items = [['week', '课表'], ['courses', '课程'], ['entries', '排课'],
    ['calendars', '校历'], ['data', '数据'], ['rules', '规则'],
    ['stats', '统计'], ['reconcile', '对账'], ['achv', '业绩']];
  return '<nav class="mobile-nav">' + items.map(function (o) {
    const cls = uiView === o[0] ? ' active' : '';
    return '<button type="button" class="btn-topbar' + cls + '"' + (cls ? ' aria-current="page"' : '') + ' id="btnMobNav-' + o[0] +
      '">' + o[1] + '</button>';
  }).join('') + '</nav>';
}

/** 绑定移动端第二行导航（id 为系统字面量，天然安全；桌面路径不渲染不绑定） */
function bindMobileNav() {
  ['week', 'courses', 'entries', 'calendars', 'data', 'rules', 'stats', 'reconcile', 'achv']
    .forEach(function (v) {
      const b = document.getElementById('btnMobNav-' + v);
      if (b) b.addEventListener('click', function () {
        if (guardDirtyLeave('切换面板')) return;   // W0A #2
        resetTodayUi();
        uiView = v;
        renderApp();
      });
    });
}

function readonlyTopbarHtml(cal) {
  return (
    '<header class="topbar">' +
      '<div class="topbar-brand">' + ICON_LOGO + '<span>教员台</span></div>' +
      '<div class="topbar-center" id="topbarCenter">' + escapeHtml(cal.name) + '</div>' +
      '<div class="topbar-right">' +
        '<span class="save-dot" id="saveDot"></span>' +
        '<span id="saveText" role="status"></span>' +
        // W4-F（UX #24/#139）：保存时间感知后缀节点（主文案 saveText 逐字不变）
        '<span class="factor-hint" id="saveTextAgo"></span>' +
      '</div>' +
    '</header>'
  );
}

/** 移动端只读流水行（今日卡与本周卡共用）：状态角标 / 地点 / 班级回落链与周格同口径 */

function mobileWeekRowHtml(inst, cal, withDate) {
  const course = state.courses.find(function (c) { return c.id === inst.courseId; });
  const color = safeColor(course ? course.color : '');
  const name = course ? course.name : '未知课程';
  const tag = inst.status !== 'normal'
    ? '<span class="wg-tag tag-' + inst.status + '">' + WEEK_STATUS_NAMES[inst.status] + '</span>'
    : '';
  const clsText = entryClassesOf(state.entries.find(function (x) {
    return x.id === inst.entryId; }) || null);
  const dateLabel = withDate
    ? WEEKDAY_NAMES[weekdayOfDate(inst.date) - 1] + ' ' + inst.date.slice(5).replace('-', '/') + ' · '
    : '';
  const cancelStyle = inst.status === 'canceled' ? ' style="text-decoration:line-through"' : '';
  return (
    '<div class="today-line" title="' + escapeHtml(instanceTitleText(inst)) + '">' +
      '<span class="course-dot" style="background:' + color + '"></span>' +
      '<div class="today-main">' +
        '<div class="today-name"' + cancelStyle + '>' + escapeHtml(name) + tag + '</div>' +
        '<div class="today-meta">' + dateLabel + '第 ' + escapeHtml(inst.periods) + ' 节' +
          (inst.location ? ' · ' + escapeHtml(inst.location) : '') +
          (clsText ? ' · ' + escapeHtml(clsText) : '') + '</div>' +
      '</div>' +
    '</div>'
  );
}

/**
 * 移动端只读周视图（三期 3.1c，D8 既有范围）：今日课程 + 本周课程两卡。
 * 数据口径只认流水（calendarId + 日期区间过滤），含调课/补课；临时停课标删除线。
 * 纯渲染投影：零写入、零事件绑定、零写操作入口；编辑提示用底部小字（R7 不弹窗）。
 */

function renderMobileWeekView(cal) {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const totalWeeks = (Number.isInteger(cal.totalWeeks) && cal.totalWeeks >= 1)
    ? cal.totalWeeks : 16;
  const weekNo = clampWeek(weekNoOfToday(cal), totalWeeks);
  const monday = dateOfWeek(cal, weekNo, 1);
  const sunday = dateOfWeek(cal, weekNo, 7);
  const todayStr = fmtLocalDate(new Date());
  const periodStartOf = function (inst) {
    const pr = periodRangeOf(inst.periods, periodCountOf(cal));
    return pr ? pr.start : 99;
  };
  const todayList = state.instances
    .filter(function (x) { return x.calendarId === cal.id && x.date === todayStr; })
    .sort(function (a, b) { return periodStartOf(a) - periodStartOf(b); });
  const weekList = state.instances
    .filter(function (x) { return x.calendarId === cal.id && x.date >= monday && x.date <= sunday; })
    .sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || periodStartOf(a) - periodStartOf(b);
    });
  const todayWd = weekdayOfDate(todayStr);
  const todayHtml = todayList.length
    ? todayList.map(function (inst) { return mobileWeekRowHtml(inst, cal, false); }).join('')
    : '<div class="today-empty">今天没有排课。到「排课」面板可新建排课项（手机端只读）。';
  const weekHtml = weekList.length
    ? weekList.map(function (inst) { return mobileWeekRowHtml(inst, cal, true); }).join('')
    : '<div class="today-empty">本周（第 ' + weekNo + ' 周）没有排课。到「排课」面板安排本周课程。</div>';

  appRoot.innerHTML =
    '<div class="app-shell">' +
      readonlyTopbarHtml(cal) +
      mobileNavHtml() +   // W0 #7：第二行导航（只读周格原本无任何出口）
      '<main class="main-area" id="mainContent">' +
        '<section class="today-panel">' +
          '<div class="today-title">今日课程' +
            '<span class="today-sub">' + todayStr + ' · 第 ' + weekNoOfDate(cal, todayStr) +
              ' 周' + WEEKDAY_NAMES[todayWd - 1] + '</span></div>' +
          todayHtml +
        '</section>' +
        '<section class="today-panel">' +
          '<div class="today-title">本周课程' +
            '<span class="today-sub">第 ' + weekNo + ' 周 · ' + monday + ' ~ ' + sunday + '</span></div>' +
          weekHtml +
        '</section>' +
        '<p class="form-hint">移动版为只读视图：调课 / 停课 / 补课 / 人数等编辑请回桌面端。</p>' +
      '</main>' +
    '</div>';

  updateSaveIndicator(storageAvailable);   // 只更新保存状态灯，不绑定任何写操作
  bindMobileNav();   // W0 #7：第二行导航绑定（写操作红线不变）
}

/** 周格主视图：顶栏 + 翻周条 + 7×12 网格（只认流水；Q2 投影停课角标） */

function renderWeekView() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导

  // 起始日损坏（脏存储/脏导入）：与 1.5 F1 同精神——不臆造 NaN 网格，提示修复
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cal.startDate) ||
      new Date(cal.startDate + 'T00:00:00').getDay() !== 1) {   // 插单 1.26 修复 P1-6：非周一锚点同走降级提示
    appRoot.innerHTML =
      '<div class="app-shell">' +
        topbarHtml(cal) +
        '<main class="main-area" id="mainContent">' +
          '<div class="empty-state course-empty"><p>当前校历的起始日数据损坏，' +
            '请到「校历」面板检查并修复后再查看课表。</p></div>' +
        '</main>' +
      '</div>';
    bindTopbarNav();
    updateSaveIndicator(storageAvailable);
    showBanner('当前校历起始日无法解析，周格视图已暂停渲染（数据未做任何改动）。', 'error');
    return;
  }

  // 三期 3.1c（v1.43 拍板①）：窄屏只读分流。共用谓词与 3.0d 业绩速记同口；
  // 桌面宽屏与无 innerWidth 沙盒恒走下方桌面周格路径，行为逐字节不变（基线零改写）。
  if (isMobileViewport()) { renderMobileWeekView(cal); return; }

  // 防御性兜底（导入/手改存储可能绕过表单校验，R4 精神：不崩、不臆造）
  const breakWeeks = Array.isArray(cal.breaks) ? cal.breaks : [];
  const ptList = Array.isArray(cal.periodTimes) ? cal.periodTimes : [];
  const periodCount = periodCountOf(cal);   // 插单 1.11：节数按 periodTimes.length（缺失兜底 12）

  // totalWeeks 兜底：脏存储可能为非整数（起始日防线管不到此处），按 16 周防 NaN 网格
  const totalWeeks = (Number.isInteger(cal.totalWeeks) && cal.totalWeeks >= 1) ? cal.totalWeeks : 16;
  const weekNo = clampWeek(weekNoOfToday(cal) + uiWeekOffset, totalWeeks);
  const monday = dateOfWeek(cal, weekNo, 1);
  const sunday = dateOfWeek(cal, weekNo, 7);
  const todayStr = fmtLocalDate(new Date());

  /* 翻周条：方案 C——左右翻周为 chevron 线性图标按钮，
     「回到本周」为文字按钮（与排课面板 btn-sec 同风格，R3） */
  const weekbarHtml =
    '<div class="weekbar">' +
      '<div class="weekbar-nav">' +
        '<button type="button" class="btn-icon" id="btnPrevWeek" title="上一周" aria-label="上一周">' +
          ICON_PREV_WEEK + '</button>' +
        '<button type="button" class="btn-icon" id="btnNextWeek" title="下一周" aria-label="下一周">' +
          ICON_NEXT_WEEK + '</button>' +
        '<button type="button" class="btn-sec" id="btnThisWeek">回到本周</button>' +
        // 四期⑥（B.10-1.2）周次跳转：输入周次直达（1–totalWeeks 钳制，weekJumpOffset 取值口）
        '<input id="weekJumpVal" type="number" min="1" max="' + totalWeeks +
          '" placeholder="周次" class="week-jump-input" aria-label="周次" title="输入周次后点「跳至」" inputmode="numeric" enterkeyhint="done">' +
        '<button type="button" class="btn-sec" id="btnWeekJump">跳至</button>' +
        // W6-3 周格批：打印 / 周末列收进「更多」下拉（主操作唯一；控件 id 与绑定逐字保留）
        '<span class="more-wrap">' +
          '<button type="button" class="btn-sec" id="btnWeekMore">更多 ▾</button>' +
          '<span class="more-menu">' +
            // 四期②打印版式：打印本周课表 + 今日清单（@media print 隐藏操作层，style.css 承载）
            '<button type="button" id="btnPrintWeek">打印本周</button>' +
            // 四期⑥（B.11-U15）周末列手动开关：自动（1.12 占用判定）↔ 常显 7 列（纯 UI 态）
            '<button type="button" id="btnWeekendCols">周末列：' +
              (uiWeekendCols === 'always' ? '常显' : '自动') + '</button>' +
          '</span>' +
        '</span>' +
      '</div>' +
      '<div class="weekbar-title">第 ' + weekNo + ' 周' +
        '<span class="weekbar-range">' + monday + ' ~ ' + sunday + '</span></div>' +
    '</div>';

  /* 插单 1.12 周末列按需显示：先投影本周各日占用——工作日（周一~周五）恒显示；
     周末日仅当该日有流水色块或停课角标投影时扩列。纯渲染层投影：
     与 Q2 停课角标同精神，不占数据、不入流水（R4 零数据结构改动）。 */
  const weekInsts = state.instances.filter(function (x) {
    return x.calendarId === cal.id && x.date >= monday && x.date <= sunday;
  });
  const occupied = {};
  weekInsts.forEach(function (inst) { occupied[weekdayOfDate(inst.date)] = true; });
  const breakEntries = (breakWeeks.indexOf(weekNo) >= 0)
    ? state.entries.filter(function (en) {
        if (en.calendarId !== cal.id) return false;
        if (!en.weekPattern || !Array.isArray(en.weekPattern.weeks)) return false;
        return en.weekPattern.weeks.indexOf(weekNo) >= 0;
      })
    : [];
  breakEntries.forEach(function (en) { occupied[en.weekday] = true; });
  const visibleDays = [];
  const weekendAlways = uiWeekendCols === 'always';   // 四期⑥ U15：周末列手动常显开关
  for (let w = 1; w <= 7; w++) {
    // 四期⑥ U15：手动「常显」覆盖 1.12 自动判定；自动态维持原占用投影口径
    if (w <= 5 || weekendAlways || occupied[w]) visibleDays.push(w);   // 周末无占用 → 列不渲染（列号不预留）
  }
  const colOfDay = {};   // 星期 → 网格列号（仅可见列编号，隐藏周末不占列号）
  visibleDays.forEach(function (w, i) { colOfDay[w] = i + 2; });

  /* 表头：节次角列 + 可见日（今日高亮整列；1.12 起周末列按本周占用动态显隐）。
     修复（2026-09-17 验收缺陷）：基底格必须显式写 grid-column/grid-row——
     色块/停课角标是显式定位项，若基底格靠自动排布，会被挤到错误行列
     （用户实测：节次数字漂到课程列里）。坐标即语义，不靠流。 */
  let gridHtml = '<div class="wg-corner" style="grid-column:1;grid-row:1">节次</div>';
  for (let vi = 0; vi < visibleDays.length; vi++) {
    const w = visibleDays[vi];
    const d = dateOfWeek(cal, weekNo, w);
    gridHtml += '<div class="wg-dayhead' + (d === todayStr ? ' today' : '') +
      '" style="grid-column:' + colOfDay[w] + ';grid-row:1">' +
      WEEKDAY_NAMES[w - 1] + '<span>' + d.slice(5).replace('-', '/') + '</span></div>';
  }

  /* 主体：periodCount 节 ×（节次标签列 + 可见日格），全部显式定位（插单 1.11：节数联动） */
  for (let p = 1; p <= periodCount; p++) {
    const pt = ptList.find(function (x) { return x.period === p; });
    gridHtml += '<div class="wg-period" style="grid-column:1;grid-row:' + (p + 1) + '">' +
      '<span class="wg-period-no">' + p + '</span>' +
      '<span class="wg-period-time">' + (pt ? pt.start : '') + '</span></div>';
    for (let vi = 0; vi < visibleDays.length; vi++) {
      const w = visibleDays[vi];
      const d = dateOfWeek(cal, weekNo, w);
      // 四期⑥ U14：data-wd/data-p 供空白格点击预填新建（#weekGrid 委托监听，见绑定段）——
      // 置于 style 属性之后：1.6/1.12 基线断言的「class 紧接 style」regex 判据（149）逐字不破
      gridHtml += '<div class="wg-cell' + (d === todayStr ? ' today' : '') +
        '" style="grid-column:' + colOfDay[w] + ';grid-row:' + (p + 1) +
        '" data-wd="' + w + '" data-p="' + p + '"></div>';
    }
  }

  /* 课程色块：只认流水（calendarId + 当前周日期区间过滤）；
     位置直接取实例快照（date → 星期、periods → 行区间），勿现场回算 */
  let blocksHtml = '';
  weekInsts.forEach(function (inst) {
    const pr = periodRangeOf(inst.periods, periodCount);
    if (!pr) return;
    const wd = weekdayOfDate(inst.date);
    const wcol = colOfDay[wd];
    if (!wcol) return;   // 理论不可达（占用判定已含全部本周流水），防御：隐藏列不渲色块
    const course = state.courses.find(function (c) { return c.id === inst.courseId; });
    const color = safeColor(course ? course.color : '');
    const name = course ? course.name : '未知课程';
    // 插单 1.22：授课班级回落链（entry.classes → course.classes → 空串不渲）
    const clsText = entryClassesOf(state.entries.find(function (x) { return x.id === inst.entryId; }) || null);
    const cls = 'wg-block' + (inst.status === 'canceled' ? ' is-canceled' : '');
    // 四期吸收项①：可解析出当前校历既有排课项且 id 安全（1.15 防线）才渲染跳转态
    const canClick = !!weekBlockJumpEntry(inst, cal) && isSafeElId(inst.id);
    const tag = inst.status !== 'normal'
      ? '<span class="wg-tag tag-' + inst.status + '">' + WEEK_STATUS_NAMES[inst.status] + '</span>'
      : '';
    blocksHtml +=
      '<div class="' + cls + (canClick ? ' clickable' : '') + '"' +
        (canClick ? ' id="wgBlock-' + escapeHtml(inst.id) + '"' : '') +
        ' title="' + escapeHtml(instanceTitleText(inst) +
          (canClick ? ' · 点击直达编辑' : '')) + '"' +
        ' style="grid-column:' + wcol + ';grid-row:' +
        (pr.start + 1) + ' / ' + (pr.end + 2) + ';border-left-color:' + color +
        ';background:' + color + '59">' +
        '<div class="wg-block-name">' + escapeHtml(name) + tag + '</div>' +
        '<div class="wg-block-meta">' + escapeHtml(inst.periods) + ' 节' +
          (inst.location ? ' · ' + escapeHtml(inst.location) : '') +
          (clsText ? ' · ' + escapeHtml(clsText) : '') + '</div>' +
        // W6-3 周格批：原定日期 / 补课说明降为次信息行（.wg-block-sub），与 title 同口径
        ((inst.status === 'moved' && inst.movedFromDate) || inst.linkNote
          ? '<div class="wg-block-sub">' +
            (inst.status === 'moved' && inst.movedFromDate
              ? '原定 ' + escapeHtml(inst.movedFromDate) : '') +
            (inst.linkNote
              ? ((inst.status === 'moved' && inst.movedFromDate) ? ' · ' : '') +
                escapeHtml(inst.linkNote) : '') + '</div>'
          : '') +
      '</div>';
  });

  /* 校历级停课角标（Q2）：当前周 ∈ breaks 时按「breaks × 当周排课项」投影虚线格——
     不占数据、不入流水，与展开引擎零耦合（引擎本就跳过停课周，Q2 两级停课） */
  let breaksHtml = '';
  breakEntries.forEach(function (en) {
    const bcol = colOfDay[en.weekday];
    if (!bcol) return;   // 理论不可达（占用判定已含角标投影），防御：隐藏列不渲角标
    // W6-3 周格批：角标增强 = 「校历停课」签 + 删除线课程名（投影语义不变，纯视觉层）
    const brCourse = state.courses.find(function (c) { return c.id === en.courseId; });
    breaksHtml +=
      '<div class="wg-break" style="grid-column:' + bcol + ';grid-row:' +
        (en.periodStart + 1) + ' / ' + (en.periodEnd + 2) + '">' +
        '<span class="wg-break-tag">校历停课</span>' +
        (brCourse ? '<span class="wg-break-name">' + escapeHtml(brCourse.name) + '</span>' : '') +
      '</div>';
  });

  const emptyNote = (!weekInsts.length && !breaksHtml)
    ? emptyStateHtml('本周（第 ' + weekNo + ' 周）没有排课。下一步：点下方「新建排课项」，或在上方周格空白格点击新建。',
        // W6-3 周格批：空态主操作直达「新建排课项」（三件套口径：原因 + 下一步 + 主操作）
        '<button type="button" class="btn-primary btn-auto" id="btnNewEntryEmpty">新建排课项</button>',
        ICON_GRID)   // 四期⑨：空状态三件套
    : '';

  // 今日模式（1.7）：今天落在校历范围内 → 网格下方追加今日课程清单；假期越界不渲染
  const todayWeekNo = weekNoOfToday(cal);
  const todaySection = (todayWeekNo >= 1 && todayWeekNo <= totalWeeks)
    ? todayPanelHtml(cal, todayStr)
    : '';

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        weekbarHtml +
        '<div class="weekgrid-wrap"><div class="weekgrid" id="weekGrid" style="--wg-cols:' +
          visibleDays.length + '">' +
          gridHtml + blocksHtml + breaksHtml +
        '</div></div>' +
        emptyNote +
        todaySection +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  // W4-F（UX #45/#46）：周格发现性提示——空白格可新建排课、色块可直达编辑；同一自然日
  // 只提示一次（R7 横幅不弹窗；帮助浮层文案同步补充）
  const hintDayW4F = fmtLocalDate(new Date());
  if (weekDiscoverHintDay !== hintDayW4F) {
    weekDiscoverHintDay = hintDayW4F;
    showBanner('小提示：点周格空白格可直接新建排课项；点课程色块可直达编辑。', 'info');
  }

  document.getElementById('btnPrevWeek').addEventListener('click', function () {
    uiWeekOffset -= 1;
    renderWeekView();
  });
  document.getElementById('btnNextWeek').addEventListener('click', function () {
    uiWeekOffset += 1;
    renderWeekView();
  });
  document.getElementById('btnThisWeek').addEventListener('click', function () {
    uiWeekOffset = 0;
    renderWeekView();
  });
  // 四期⑥（B.10-1.2）周次跳转：输入周次 → 钳制 → 直达该周
  document.getElementById('btnWeekJump').addEventListener('click', function () {
    const v = parseInt(document.getElementById('weekJumpVal').value, 10);
    if (!Number.isInteger(v)) {
      showBanner('请输入要跳转的周次（1–' + totalWeeks + '）。', 'warn'); return;
    }
    uiWeekOffset = weekJumpOffset(cal, v);
    renderWeekView();
  });
  // 四期⑥（U15）周末列开关：自动 ↔ 常显（纯 UI 态，覆盖 1.12 自动判定）
  document.getElementById('btnWeekendCols').addEventListener('click', function () {
    uiWeekendCols = (uiWeekendCols === 'always') ? 'auto' : 'always';
    renderWeekView();
  });
  // 四期⑥（U16）今日清单切日：← → 纯 UI 切换，往日/明日只读（操作态一并复位）
  const btnDayPrev = document.getElementById('btnTodayPrev');
  if (btnDayPrev) btnDayPrev.addEventListener('click', function () {
    uiTodayOffset -= 1; uiTodayInstId = null; uiTodayAction = null; renderWeekView();
  });
  const btnDayNext = document.getElementById('btnTodayNext');
  if (btnDayNext) btnDayNext.addEventListener('click', function () {
    uiTodayOffset += 1; uiTodayInstId = null; uiTodayAction = null; renderWeekView();
  });
  const btnDayBack = document.getElementById('btnTodayBack');
  if (btnDayBack) btnDayBack.addEventListener('click', function () {
    uiTodayOffset = 0; uiTodayInstId = null; uiTodayAction = null; renderWeekView();
  });
  // 四期⑥（U14）空白格点击 → 排课新建预填：委托监听（色块/停课角标自有语义，先行排除）
  const gridEl = document.getElementById('weekGrid');
  if (gridEl) gridEl.addEventListener('click', function (ev) {
    const t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.wg-block') || t.closest('.wg-break')) return;
    const cell = t.closest('.wg-cell');
    if (!cell) return;
    const wd = parseInt(cell.getAttribute && cell.getAttribute('data-wd'), 10);
    const p = parseInt(cell.getAttribute && cell.getAttribute('data-p'), 10);
    if (Number.isInteger(wd) && Number.isInteger(p)) onWeekBlankClick(wd, p);
  });
  // W6-3 周格批：空态主操作直达——切排课面板并展开新建表单（与面板头「新建排课项」同链路）
  const btnNewEntryEmpty = document.getElementById('btnNewEntryEmpty');
  if (btnNewEntryEmpty) btnNewEntryEmpty.addEventListener('click', function () {
    if (guardDirtyLeave('切换面板')) return;   // W0A #2：脏表单离开守卫
    resetTodayUi();
    uiView = 'entries';
    formEntryId = null;
    renderApp();
    renderEntryForm();
  });
  document.getElementById('btnPrintWeek').addEventListener('click', function () {
    printCurrentView();
  });
  // 四期吸收项①：可跳转色块绑定点击直达编辑（manual/悬空 entryId 与脏 id 不绑定）
  weekInsts.forEach(function (inst) {
    if (!isSafeElId(inst.id)) return;
    if (!weekBlockJumpEntry(inst, cal)) return;
    const blk = document.getElementById('wgBlock-' + inst.id);
    if (blk) blk.addEventListener('click', function () { onWeekBlockClick(inst.id); });
  });
  bindTodayPanel();
}


/* ============================================================
   四之七、今日模式 + 流水操作（一期 1.7）
   依据附录A Q3 三语义 + §7 不变式 + B.4 接口提示：
    - 今日模式 = 周格视图内聚焦：今日列高亮（1.6 已有）+ 网格下方「今日课程」清单，
      清单只认 date=今天的流水，按节次排序；点行内联展开操作区（R7 不弹窗）。
    - 调课：对原生成实例改 date/location + status:moved + movedFromDate + frozen:true
      （不新建实例、不动 entries，前后同一条流水；重复调课保留最早原始日期）。
      manual 实例只改期、status 恒 makeup（§7 不变式①）。
    - 临时停课：status:canceled + overrideNote 必填原因 + frozen:true；
      结算学时按 D10 留空，绝不出现无来源数字（R6）。
    - 手动补课：source:"manual" + status:"makeup"，entryId 引用原排课项（Q3 规则 3）；
      nominalHours 默认取原排课项学时（表单预填快照值，可改，B.1）；
      一切落库后引擎重跑不得还原（冻结保护 + manual 天然免疫，1.5 已覆盖）。
    - 留痕铁律：调课/停课 overrideNote 必填；补课说明进 linkNote（选填）。
   ============================================================ */

/**
 * 今日课程清单：只认 date=今天的流水（calendarId + date 过滤），按节次排序。
 * 每行可点，展开内联操作区（调课 / 临时停课 / 补这节课 / 改期）。
 */

/**
 * 今日课程清单（1.7 口径）：只认 date=清单日的流水，按节次排序。
 * 四期⑥（B.11-U16）切日增强：面板头「← →」日切换（uiTodayOffset 纯 UI 态，默认 0 = 今天）；
 * 往日 / 明日清单只读——行点击与操作区仅今天开放（interactive 判定），零数据写入。
 */

function todayPanelHtml(cal, todayStr) {
  const viewD = new Date();
  viewD.setDate(viewD.getDate() + uiTodayOffset);
  const viewDate = fmtLocalDate(viewD);
  const viewWd = weekdayOfDate(viewDate);
  const wn = weekNoOfDate(cal, viewDate);
  const inRange = Number.isInteger(wn) && wn >= 1 && wn <= cal.totalWeeks;
  const interactive = uiTodayOffset === 0;   // 操作入口照旧限今天
  const list = state.instances
    .filter(function (x) { return x.calendarId === cal.id && x.date === viewDate; })
    .sort(function (a, b) {
      const ra = periodRangeOf(a.periods, periodCountOf(cal));
      const rb = periodRangeOf(b.periods, periodCountOf(cal));
      return (ra ? ra.start : 99) - (rb ? rb.start : 99);
    });
  let rowsHtml = '';
  list.forEach(function (inst) {
    const course = state.courses.find(function (c) { return c.id === inst.courseId; });
    const color = safeColor(course ? course.color : '');
    const name = course ? course.name : '未知课程';
    const tag = inst.status !== 'normal'
      ? '<span class="wg-tag tag-' + inst.status + '">' + WEEK_STATUS_NAMES[inst.status] + '</span>'
      : '';
    // 插单 1.22：授课班级回落链（entry.classes → course.classes → 空串不渲）
    const clsText = entryClassesOf(state.entries.find(function (x) { return x.id === inst.entryId; }) || null);
    if (!interactive) {
      // 往日 / 明日：只读行（无行 id、无 caret、无操作区，整行不可点）
      rowsHtml +=
        '<div class="today-line" title="' + escapeHtml(instanceTitleText(inst)) + '">' +
          '<span class="course-dot" style="background:' + color + '"></span>' +
          '<div class="today-main">' +
            '<div class="today-name">' + escapeHtml(name) + tag + '</div>' +
            '<div class="today-meta">第 ' + escapeHtml(inst.periods) + ' 节' +
              (inst.location ? ' · ' + escapeHtml(inst.location) : '') +
              (clsText ? ' · ' + escapeHtml(clsText) : '') + '</div>' +
          '</div>' +
        '</div>';
      return;
    }
    const active = uiTodayInstId === inst.id;
    rowsHtml +=
      '<div class="today-row' + (active ? ' active' : '') + '" id="todayRow-' + escapeHtml(inst.id) +
        '" title="' + escapeHtml(instanceTitleText(inst) + ' · 点击展开操作') + '">' +
        '<div class="today-line">' +
          '<span class="course-dot" style="background:' + color + '"></span>' +
          '<div class="today-main">' +
            '<div class="today-name">' + escapeHtml(name) + tag + '</div>' +
            '<div class="today-meta">第 ' + escapeHtml(inst.periods) + ' 节' +
              (inst.location ? ' · ' + escapeHtml(inst.location) : '') +
              (clsText ? ' · ' + escapeHtml(clsText) : '') + '</div>' +
          '</div>' +
          '<span class="today-caret">' + ICON_NEXT_WEEK + '</span>' +
        '</div>' +
        (active ? '<div class="today-ops">' + todayOpsHtml(inst) + '</div>' : '') +
      '</div>';
  });
  const dayNav =
    '<button type="button" class="btn-icon" id="btnTodayPrev" title="前一天" aria-label="前一天">' +
      ICON_PREV_WEEK + '</button>' +
    '<button type="button" class="btn-icon" id="btnTodayNext" title="后一天" aria-label="后一天">' +
      ICON_NEXT_WEEK + '</button>' +
    (uiTodayOffset !== 0
      ? '<button type="button" class="btn-sec" id="btnTodayBack">回到今天</button>' : '');
  return (
    '<section class="today-panel">' +
      '<div class="today-title">' + dayNav + '<span>今日课程</span>' +
        '<span class="today-sub">' + viewDate + ' · ' +
          (inRange ? '第 ' + wn + ' 周' + WEEKDAY_NAMES[viewWd - 1] : '校历范围外') +
          (interactive ? '' : ' · 只读') + '</span></div>' +
      (list.length ? rowsHtml
        : emptyStateHtml(interactive ? '今天没有排课。下一步：点上方周格空白格可直接新建排课项。' :
        '该日没有排课。下一步：点「回到今天」返回今日清单。', '', ICON_GRID)) +   // 四期⑨：空状态三件套
    '</section>'
  );
}

/** 操作区内容：按操作类型渲染按钮组或对应表单 */

function todayOpsHtml(inst) {
  if (uiTodayAction === 'move') return todayMoveFormHtml(inst);
  if (uiTodayAction === 'cancel') return todayCancelFormHtml(inst);
  if (uiTodayAction === 'makeup') return todayMakeupFormHtml(inst);
  if (uiTodayAction === 'uncancel') return todayUncancelFormHtml(inst);   // W1 #287
  if (uiTodayAction === 'hc') return todayHcFormHtml(inst);
  let btns = '';
  if (inst.source === 'manual') {
    // manual（补课）只允许改期；status 恒 makeup（§7 不变式①），无停课语义
    btns = '<button type="button" class="btn-sec" id="todayBtnMove">改期</button>';
  } else {
    if (inst.status === 'canceled') {
      // W1 #287（2026-09-19 问题列表裁决）：撤销停课——status 恢复 normal 的同时
      // 处理 frozen/留痕状态（#286 伴生：frozen 保持 true 防引擎快照同步误改、
      // overrideNote 前缀「撤销停课：」留痕、结算字段按规则即时重算）
      btns += '<button type="button" class="btn-sec" id="todayBtnUncancel">撤销停课</button>';
    } else {
      btns += '<button type="button" class="btn-sec" id="todayBtnMove">调课</button>' +
              '<button type="button" class="btn-sec" id="todayBtnCancel">临时停课</button>';
    }
    btns += '<button type="button" class="btn-sec" id="todayBtnMakeup">补这节课</button>';
  }
  btns += '<button type="button" class="btn-sec" id="todayBtnHc">人数</button>';
  return '<div class="today-ops-btns">' + btns + '</div>';
}

/** 调课表单：新日期（date 选择器）+ 地点（留空保持不变）+ 原因（必填，留痕） */

function todayMoveFormHtml(inst) {
  return (
    '<form id="todayMoveForm" class="cal-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="todayMoveDate">新上课日期</label>' +
          '<input id="todayMoveDate" type="date" aria-required="true" aria-describedby="todayMoveError" value="' + escapeHtml(inst.date) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="todayMoveLoc">地点（留空保持不变）</label>' +
          '<input id="todayMoveLoc" type="text" maxlength="40" value="">' +
        '</div>' +
        '<div class="field full">' +
          '<label for="todayMoveNote">调课原因（必填，留痕备查）</label>' +
          '<input id="todayMoveNote" type="text" maxlength="100" aria-required="true" aria-describedby="todayMoveError" value="">' +
        '</div>' +
      '</div>' +
      '<div class="form-error" id="todayMoveError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">确认调课</button>' +
        '<button type="button" class="btn-sec" id="todayMoveBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/** 临时停课表单：原因必填（留痕铁律；结算学时一期留空，D10/R6） */

function todayCancelFormHtml() {
  return (
    '<form id="todayCancelForm" class="cal-form" novalidate>' +
      '<div class="field full">' +
        '<label for="todayCancelNote">停课原因（必填，留痕备查）</label>' +
        '<input id="todayCancelNote" type="text" maxlength="100" aria-required="true" aria-describedby="todayCancelError" value="">' +
      '</div>' +
      '<div class="form-error" id="todayCancelError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">确认临时停课</button>' +
        '<button type="button" class="btn-sec" id="todayCancelBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/**
 * 撤销停课表单（W1 #287）：原因必填（留痕铁律）；确认后该次课恢复为正常授课，
 * 结算字段按当前规则重算（无版本则 D10 留空）。
 */

function todayUncancelFormHtml() {
  return (
    '<form id="todayUncForm" class="cal-form" novalidate>' +
      '<div class="field full">' +
        '<label for="todayUncNote">撤销原因（必填，留痕备查）</label>' +
        '<input id="todayUncNote" type="text" maxlength="100" aria-required="true" aria-describedby="todayUncError" value="">' +
      '</div>' +
      '<div class="form-error" id="todayUncError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">确认撤销停课</button>' +
        '<button type="button" class="btn-sec" id="todayUncBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/** 补课表单：日期/节次/地点/学时默认取原课快照（可改，B.1），说明进 linkNote（选填） */

function todayMakeupFormHtml(src) {
  const calMk = state.calendars.find(function (c) { return c.id === src.calendarId; }) ||
    getActiveCalendar();
  const maxP = periodCountOf(calMk);   // 插单 1.11：节次上限按该校历节数
  const pr = periodRangeOf(src.periods, maxP) || { start: 1, end: 2 };
  return (
    '<form id="todayMkForm" class="cal-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="todayMkDate">补课日期</label>' +
          '<input id="todayMkDate" type="date" aria-required="true" aria-describedby="todayMkError" value="' + escapeHtml(src.date) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label>节次（起止均含）</label>' +
          '<div class="period-pair">' +
            '<select id="todayMkPStart">' + periodOptionsHtml(pr.start, maxP) + '</select>' +
            '<span class="pair-sep">至</span>' +
            '<select id="todayMkPEnd">' + periodOptionsHtml(pr.end, maxP) + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="todayMkLoc">地点（留空用原课地点）</label>' +
          '<input id="todayMkLoc" type="text" maxlength="40" value="' +
            escapeHtml(src.location) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="todayMkHours">名义学时（默认取原排课项，可改）</label>' +
          '<input id="todayMkHours" type="number" min="0.5" step="0.5" aria-required="true" aria-describedby="todayMkError" value="' +
            src.nominalHours + '" inputmode="decimal" enterkeyhint="done">' +
        '</div>' +
        '<div class="field full">' +
          '<label for="todayMkNote">说明（选填，如「第 3 周补课」）</label>' +
          '<input id="todayMkNote" type="text" maxlength="100" value="">' +
        '</div>' +
      '</div>' +
      '<div class="form-error" id="todayMkError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">记录补课</button>' +
        '<button type="button" class="btn-sec" id="todayMkBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/** 绑定今日清单的行点击与操作区事件（行内展开，R7 不弹窗） */

function bindTodayPanel() {
  const cal = getActiveCalendar();
  if (!cal) return;
  const todayStr = fmtLocalDate(new Date());
  const list = state.instances.filter(function (x) {
    return x.calendarId === cal.id && x.date === todayStr;
  });
  list.forEach(function (inst) {
    if (!isSafeElId(inst.id)) return;   // 1.15 子项③：脏 id 不绑定
    const row = document.getElementById('todayRow-' + inst.id);
    if (!row) return;
    row.addEventListener('click', function (ev) {
      // 点击行内控件（按钮/表单）不触发行折叠
      if (ev && ev.target && ev.target.closest &&
          ev.target.closest('button, input, select, form')) return;
      uiTodayInstId = (uiTodayInstId === inst.id) ? null : inst.id;
      uiTodayAction = null;
      renderWeekView();
    });
    bindTodayOps(inst);
  });
}

/** 绑定单个流水行的操作按钮与表单提交 */

function bindTodayOps(inst) {
  if (!isSafeElId(inst.id)) return;   // 1.15 子项③：脏 id 不绑定
  const actionBtns = { todayBtnMove: 'move', todayBtnCancel: 'cancel', todayBtnMakeup: 'makeup',
    todayBtnHc: 'hc', todayBtnUncancel: 'uncancel' };   // W1 #287
  Object.keys(actionBtns).forEach(function (btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      uiTodayAction = actionBtns[btnId];
      renderWeekView();
    });
  });
  ['todayMoveBack', 'todayCancelBack', 'todayMkBack', 'todayHcBack', 'todayUncBack'].forEach(function (backId) {   // W1 #287
    const back = document.getElementById(backId);
    if (!back) return;
    back.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      uiTodayAction = null;
      renderWeekView();
    });
  });
  const moveForm = document.getElementById('todayMoveForm');
  if (moveForm) moveForm.addEventListener('submit', function (ev) { onTodayMoveSubmit(inst.id, ev); });
  const cancelForm = document.getElementById('todayCancelForm');
  if (cancelForm) cancelForm.addEventListener('submit', function (ev) { onTodayCancelSubmit(inst.id, ev); });
  const mkForm = document.getElementById('todayMkForm');
  if (mkForm) mkForm.addEventListener('submit', function (ev) { onTodayMakeupSubmit(inst.id, ev); });
  const hcForm = document.getElementById('todayHcForm');
  if (hcForm) hcForm.addEventListener('submit', function (ev) { onTodayHeadcountSubmit(inst.id, ev); });
  const uncForm = document.getElementById('todayUncForm');   // W1 #287
  if (uncForm) uncForm.addEventListener('submit', function (ev) { onTodayUncancelSubmit(inst.id, ev); });
}

/**
 * 调课提交（Q3 调课语义）：对原生成实例改 date/location + status:moved +
 * movedFromDate + frozen:true；不新建实例、不动 entries，前后同一条流水。
 * manual 实例走同一入口但只改期：status 恒 makeup、movedFromDate 恒 null（§7 不变式①）。
 */

function onTodayMoveSubmit(instId, ev) {
  ev.preventDefault();
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst) return;
  const cal = state.calendars.find(function (c) { return c.id === inst.calendarId; }) ||
    getActiveCalendar();
  const errBox = document.getElementById('todayMoveError');
  const date = document.getElementById('todayMoveDate').value;
  const loc = document.getElementById('todayMoveLoc').value.trim();
  const note = document.getElementById('todayMoveNote').value.trim();

  // 四期④a：统一经 isValidDateStr（2026-02-30 类一并拒绝；文案与防御行为不变）
  if (!isValidDateStr(date)) {
    errBox.textContent = '请选择有效的上课日期。'; return;
  }
  const wn = weekNoOfDate(cal, date);
  if (!(wn >= 1 && wn <= cal.totalWeeks)) {
    errBox.textContent = '该日期不在当前校历范围内（第 1–' + cal.totalWeeks + ' 周）。'; return;
  }
  if (!note) { errBox.textContent = '请填写调课原因（留痕备查）。'; return; }

  const oldDate = inst.date;
  if (loc) inst.location = loc;
  if (inst.source === 'generated') {
    if (!inst.movedFromDate) inst.movedFromDate = oldDate;   // 重复调课保留最早原始日期
    inst.status = 'moved';
    inst.frozen = true;                                      // 冻结保护：引擎重跑不得还原（Q3 规则 2）
  }
  inst.date = date;
  inst.weekNo = wn;
  inst.overrideNote = note;                                  // 留痕铁律
  inst.updatedAt = nowIso();

  // 改期落点冲突软提示（插单 1.19，B.6 #21）：目标日期同节次已有其他流水（含停课记录）
  // → 横幅警告但不阻断（允许故意连堂）；检测失败（脏数据）静默放行
  const mvConflict = findPeriodConflict(date, inst.periods, inst.id);
  resetTodayUi();
  expandEntries();   // 幂等 + 冻结保护：仅同步未冻结生成实例，人工改动永不还原
  saveState();
  renderWeekView();
  const mvNotes = [];
  if (mvConflict) {
    // 四期⑦（B.11-U13）：同日冲突标日期 + 节次，便于定位；文案不硬拒口径不变
    mvNotes.push(mvConflict.canceled
      ? '目标时段已有停课记录（' + mvConflict.courseName + '），请留意'
      : '目标时段已有课程（' + mvConflict.courseName + '），允许连堂请留意');
  }
  // 冲突软提示（不硬拒）：改期落在校历停课周内时提醒，由用户自行权衡
  if (Array.isArray(cal.breaks) && cal.breaks.indexOf(wn) >= 0) {
    mvNotes.push('调课落在校历停课周内：周格显停课角标，流水不受影响');
  }
  if (mvNotes.length) showBanner('调课已完成：' + mvNotes.join('；') + '。', 'warn');
}

/** 临时停课提交：status:canceled + frozen:true + overrideNote 必填；结算学时按 D10 留空（R6） */

function onTodayCancelSubmit(instId, ev) {
  ev.preventDefault();
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst || inst.source !== 'generated') return;
  const errBox = document.getElementById('todayCancelError');
  const note = document.getElementById('todayCancelNote').value.trim();
  if (!note) { errBox.textContent = '请填写停课原因（留痕备查）。'; return; }

  inst.status = 'canceled';
  inst.frozen = true;
  inst.overrideNote = note;
  // W0 #80（2026-09-19）：停课写点立即清空结算三字段（Q2：停课无结算）——修复前要等
  // 下次规则保存 recompute 才清，停课后立刻看统计仍显示旧结算（R6 即时口径一致）
  inst.settledHours = null;
  inst.settleMode = null;
  inst.ruleVersion = null;
  inst.updatedAt = nowIso();

  resetTodayUi();
  expandEntries();
  saveState();
  renderWeekView();
}

/**
 * 撤销停课提交（W1 #287/#286）：status 恢复 normal；frozen 保持 true（该流水已被人工
 * 改动过，引擎快照同步仍跳过——§7 不变式④ 留痕语义）；overrideNote 前缀「撤销停课：」
 * 定死（与人数/结算留痕前缀同惯例）；结算字段经 recomputeSettledHours 按当前规则版本
 * 即时重算（Q5：frozen 非 manual 参与；status 反转后 canceled 清空口径自动解除，
 * 无生效版本则 D10 三字段留空）。仅限 generated 且当前 canceled 的流水。
 */
function onTodayUncancelSubmit(instId, ev) {
  ev.preventDefault();
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst || inst.status !== 'canceled' || inst.source !== 'generated') return;
  const errBox = document.getElementById('todayUncError');
  const note = document.getElementById('todayUncNote').value.trim();
  if (!note) { errBox.textContent = '请填写撤销原因（留痕备查）。'; return; }

  const cal = state.calendars.find(function (c) { return c.id === inst.calendarId; }) ||
    getActiveCalendar();
  inst.status = 'normal';
  inst.frozen = true;                  // #286：人工改动位保留，引擎快照同步仍跳过
  inst.overrideNote = '撤销停课：' + note;
  inst.updatedAt = nowIso();

  resetTodayUi();
  recomputeSettledHours(cal);          // 恢复 normal 后按规则重算（无版本则 D10 留空）
  saveState();
  renderWeekView();
  showBanner('已撤销停课：该次课恢复为正常' +
    (inst.settleMode === 'rule' ? '，按规则结算 ' + inst.settledHours + ' 学时' : '，结算留空') +
    '（已留痕）。', 'success');
}

/**
 * 手动补课提交（Q3 规则 3 + B.1）：source:"manual" + status:"makeup"，
 * entryId 引用原排课项（用于统计归属、钻取）；名义学时默认取原排课项学时（可改）；
 * 说明进 linkNote（选填）。引擎对 manual 永不触碰，frozen 仅标记生成实例。
 */

function onTodayMakeupSubmit(fromInstId, ev) {
  ev.preventDefault();
  const src = state.instances.find(function (x) { return x.id === fromInstId; });
  if (!src) return;
  const cal = state.calendars.find(function (c) { return c.id === src.calendarId; }) ||
    getActiveCalendar();
  const errBox = document.getElementById('todayMkError');

  const date = document.getElementById('todayMkDate').value;
  const ps = parseInt(document.getElementById('todayMkPStart').value, 10);
  const pe = parseInt(document.getElementById('todayMkPEnd').value, 10);
  const loc = document.getElementById('todayMkLoc').value.trim();
  const hours = parseFloat(document.getElementById('todayMkHours').value);
  const note = document.getElementById('todayMkNote').value.trim();

  // 四期④a：统一经 isValidDateStr（2026-02-30 类一并拒绝；文案与防御行为不变）
  if (!isValidDateStr(date)) {
    errBox.textContent = '请选择有效的补课日期。'; return;
  }
  const wn = weekNoOfDate(cal, date);
  if (!(wn >= 1 && wn <= cal.totalWeeks)) {
    errBox.textContent = '该日期不在当前校历范围内（第 1–' + cal.totalWeeks + ' 周）。'; return;
  }
  const mkMax = periodCountOf(cal);
  if (!(Number.isInteger(ps) && Number.isInteger(pe) && ps >= 1 && pe <= mkMax && ps <= pe)) {
    errBox.textContent = '节次需为 1–' + mkMax + '，且结束节次不早于开始节次。'; return;
  }
  if (!(isFinite(hours) && hours > 0)) {
    errBox.textContent = '补课学时需为大于 0 的数字。'; return;
  }

  const newPeriods = ps === pe ? String(ps) : ps + '-' + pe;
  // 落点冲突软提示（插单 1.19）：与调课同口径纯函数，排除来源实例自身——
  // 默认同日同节补课不与自己冲突；只警告不阻断，脏数据静默放行
  const mkConflict = findPeriodConflict(date, newPeriods, src.id);
  const course = state.courses.find(function (c) { return c.id === src.courseId; });
  // W4-C #16（问题列表裁决 #16 / v1.78 拍板⑦）：补课落点在校历停课周内 → linkNote 自动附
  // 「（落在停课周内）」标记——人工补课落停课周可能合法，只标记不阻断；用户原说明保留在前
  const mkInBreakW4C = Array.isArray(cal.breaks) && cal.breaks.indexOf(wn) >= 0;
  const ts = nowIso();
  state.instances.push({
    id: nextId('i'),
    entryId: src.entryId,          // 引用原排课项（原排课项已不存在时为 null，§7）
    courseId: src.courseId,
    calendarId: cal.id,
    date: date,
    weekNo: wn,
    periods: newPeriods,
    location: loc || src.location || (course ? course.defaultLocation : ''),
    headcount: null,
    nominalHours: hours,
    typeId: src.typeId || entryTypeId({ courseId: src.courseId, typeId: null }),
    settledHours: null,
    settleMode: null,
    status: 'makeup',
    source: 'manual',
    frozen: false,
    movedFromDate: null,
    overrideNote: null,
    linkNote: mkInBreakW4C ? ((note ? note + ' ' : '') + '（落在停课周内）') : note,
    ruleVersion: null,
    createdAt: ts,
    updatedAt: ts
  });

  resetTodayUi();
  expandEntries();
  saveState();
  renderWeekView();
  showBanner(mkConflict
    ? '补课已记录：目标时段已有' +
      (mkConflict.canceled ? '停课记录（' : '课程（') + mkConflict.courseName + '）' +
      (mkConflict.canceled ? '，请留意。' : '，允许连堂请留意。')
    : '补课已记录：与原排课关联，重新展开不会改动它。',
    mkConflict ? 'warn' : 'success');
}

/** 人数快照表单：留空 = 未录入（null，D3）；修改原因必填（§7 不变式④：人工改动自动生成字段必留痕） */

function todayHcFormHtml(inst) {
  return (
    '<form id="todayHcForm" class="cal-form" novalidate>' +
      '<div class="field full">' +
        '<label for="todayHcValue">学生人数（留空 = 未录入；当前快照：' +
          (inst.headcount === null || inst.headcount === undefined
            ? '未录入' : inst.headcount + ' 人') + '）</label>' +
        '<input id="todayHcValue" type="number" min="0" max="500" inputmode="numeric" enterkeyhint="done" value="' +
          (inst.headcount === null || inst.headcount === undefined ? '' : inst.headcount) + '">' +
      '</div>' +
      '<div class="field full">' +
        '<label for="todayHcNote">修改原因（必填，留痕备查）</label>' +
        '<input id="todayHcNote" type="text" maxlength="100" aria-required="true" aria-describedby="todayHcError" value="">' +
      '</div>' +
      '<div class="form-error" id="todayHcError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">保存人数</button>' +
        '<button type="button" class="btn-sec" id="todayHcBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/**
 * 人数快照提交（D3 快照制）：headcount 录入/修改/清除；null = 未录入。
 * 留痕铁律：原因必填 + frozen=true + overrideNote（§7 不变式④）；
 * 冻结后引擎重跑不还原人数（Q3 规则 2），重算结算时照用新人数（Q5：frozen 非 manual 参与）。
 */

function onTodayHeadcountSubmit(instId, ev) {
  ev.preventDefault();
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst) return;
  const errBox = document.getElementById('todayHcError');
  const raw = document.getElementById('todayHcValue').value.trim();
  const note = document.getElementById('todayHcNote').value.trim();

  let hc = null;
  if (raw !== '') {
    const n = parseInt(raw, 10);
    if (!(Number.isInteger(n) && n >= 0 && n <= 500)) {
      errBox.textContent = '人数需为 0–500 的整数，或留空表示未录入。'; return;
    }
    hc = n;
  }
  if (!note) { errBox.textContent = '请填写修改原因（留痕备查）。'; return; }

  inst.headcount = hc;
  inst.frozen = true;            // 人工改动自动生成字段：冻结 + 留痕（§7 不变式④）
  // W1 #298（2026-09-19 问题列表裁决）：留痕前缀统一——清除人数时与统计钻取入口
  // 同口径带「清除人数：」前缀（#297 人数录入两处逻辑收敛的文案半）
  inst.overrideNote = (hc === null ? '清除人数：' : '') + note;
  inst.updatedAt = nowIso();

  resetTodayUi();
  expandEntries();   // frozen 实例跳过快照同步，人数永不被引擎还原
  saveState();
  renderWeekView();
  showBanner('人数快照已更新（' + (hc === null ? '未录入' : hc + ' 人') + '），本次修改已留痕。', 'success');
}

/** 顶部保存状态灯：绿 = 已保存；红 = 本地存储不可用或写入失败（横幅提示，R7 不弹窗） */


/* ---------- 声明式 UI 态复位表（拆分评估方案 v1.2 §4.3；views 2 项，与拆分前 resetTodayUi 逐条一致。
   复审 P0-1 修正：uiWeekOffset 不纳入复位——翻周位移属视图内状态，切面板后保留（拆分前语义）。） ---------- */
const VIEWS_UI_DECLS = [
  makeUiDecl(function () { return uiTodayInstId; },
    function (v) { uiTodayInstId = v; }, null),
  makeUiDecl(function () { return uiTodayAction; },
    function (v) { uiTodayAction = v; }, null)
];
function resetViewsUi() {
  applyUiDecls(VIEWS_UI_DECLS);
  // 四期⑥ U16：今日清单切日偏移随视图切换复位（周末列开关 / 翻周位移保留，同 uiWeekOffset 惯例）
  uiTodayOffset = 0;
}

