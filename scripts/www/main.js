/* 教员台 · main.js —— 编排与启动（必须最后加载）：uiView / renderApp 分发 /
   resetTodayUi 编排式复位 / 横幅与保存灯 / 启动入口。函数体逐字搬迁自 app.js 1.26。
   加载序实例：core.js 的 loadState 调用本文件的 showBanner——合法，因为调用发生在
   本文件启动入口执行时，六脚本已全部求值完毕（拆分评估方案 v1.2 原则三，防后人误改顺序）。 */

'use strict';

/**
 * 主界面当前视图：
 * week = 周格课表视图（1.6）；courses = 课程管理（1.3）；
 * calendars = 校历管理（1.2）；entries = 排课项管理（1.4）；
 * data = 数据与备份（1.8：JSON 全量导出 / 合并导入 / 流水 CSV 导出）
 */

let uiView = 'week';

/** W4（#188）：视图 → 页面标题文案——document.title 随视图同步，浏览器标签页可直接读当前面板 */

const VIEW_TITLE_NAMES = { week: '课表', entries: '排课', courses: '课程', calendars: '校历',
  data: '数据', rules: '规则', stats: '统计', reconcile: '对账', achv: '业绩' };

/** 顶部分发包装层（四期⑥）：同视图重渲染标记 __keepScroll（core.js 的 appRoot 包装器
 *  据此留存滚动位置，U8），视图切换不保留（回顶自然）；渲染后同步 location.hash（U20）。
 *  分发本体 renderAppDispatch 与拆分前 renderApp 函数体逐字一致。
 */

let __hashQuiet = false;   // 程序式写 hash 的静音标记：hashchange 回环在此截断（仅 location.hash 回退分支需要）

function renderApp() {
  const sameView = renderApp.__lastView === uiView;
  renderApp.__lastView = uiView;
  appRoot.__keepScroll = sameView;
  renderAppDispatch();
  syncViewHash();
  // W4 #188（文档兑现）：document.title 随当前视图同步（向导期显「首次设置」）；
  // 纯展示层增量——环境无 document.title（测试沙盒）时静默降级，历史断言零影响
  try {
    document.title = '教员台 · ' +
      (state.settings.activeCalendarId ? (VIEW_TITLE_NAMES[uiView] || '课表') : '首次设置');
  } catch (errTitle) { /* document.title 不可写环境静默降级 */ }
}

/** 视图分发本体：与拆分前 renderApp 逐字一致 */

function renderAppDispatch() {
  if (!state.settings.activeCalendarId) { renderWizard(); return; }
  if (uiView === 'entries') { renderEntryPanel(); return; }
  if (uiView === 'courses') { renderCoursePanel(); return; }
  if (uiView === 'calendars') { renderCalendarPanel(); return; }
  if (uiView === 'data') { renderDataPanel(); return; }
  if (uiView === 'rules') { renderRulePanel(); return; }
  if (uiView === 'stats') { renderStatsPanel(); return; }
  if (uiView === 'reconcile') { renderReconcilePanel(); return; }
  if (uiView === 'achv') { renderAchvPanel(); return; }
  renderWeekView();
}

/**
 * hash 路由同步（B.11-U20）：地址栏 hash 与 uiView 不一致时写入（刷新/直链可恢复视图）。
 * W4 #191（问题列表裁决）：优先 history.replaceState——同步视图不再污染历史栈
 * （浏览器后退不再逐视图回退、可直接离开本页）；replaceState 不触发 hashchange，
 * 故 __hashQuiet 静音标记仅在回退分支（旧环境 location.hash 赋值）置位。
 */

function syncViewHash() {
  try {
    if (window.location && String(window.location.hash) !== '#' + uiView) {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', '#' + uiView);
      } else {
        __hashQuiet = true;   // 程序式写 hash 的回环截断（仅此分支会触发 hashchange）
        window.location.hash = uiView;
      }
    }
  } catch (err) { /* hash 不可写环境静默降级 */ }
}

/** 取当前校历；id 悬空时兜底纠正到第一个校历（无校历返回 null，与 1.1 语义一致） */

function getActiveCalendar() {
  let cal = state.calendars.find(function (c) {
    return c.id === state.settings.activeCalendarId;
  });
  if (!cal) {
    state.settings.activeCalendarId = state.calendars.length ? state.calendars[0].id : null;
    saveState();
    cal = state.calendars[0] || null;
  }
  return cal;
}

/* ---------- 顶栏（各视图共用：课表 / 排课 / 课程 / 校历） ---------- */

/** W4-F（UX #24/#139）：保存灯时间感知——成功保存时刻戳；「刚刚 / N 分钟前」后缀走
 * 独立 #saveTextAgo 节点（topbarHtml / readonlyTopbarHtml 各一），saveText 主文案逐字
 * 不变（四期⑦-12 精确等值断言零 mandated 的基石）；从未保存过不加后缀。 */
let lastSaveAtMs = null;
function saveAgoText() {
  if (lastSaveAtMs === null) return '';
  const minsW4F = Math.floor((Date.now() - lastSaveAtMs) / 60000);
  return minsW4F < 1 ? '（刚刚）' : '（' + minsW4F + ' 分钟前）';
}

function updateSaveIndicator(ok) {
  const dot = document.getElementById('saveDot');
  const text = document.getElementById('saveText');
  const ago = document.getElementById('saveTextAgo');
  if (!dot || !text) return;
  if (ok && storageAvailable) {
    dot.classList.remove('save-failed');   // 四期⑦ U27：写入完成退出「保存中」呼吸态
    dot.classList.remove('save-saving');   // 拆两次单参调用：mock classList.remove 单参，双参会静默丢第二个
    text.textContent = '数据已自动保存';
    if (ago) ago.textContent = saveAgoText();
  } else {
    dot.classList.remove('save-saving');
    dot.classList.add('save-failed');
    text.textContent = '本地存储不可用，数据不会被保存';
    if (ago) ago.textContent = '';
    showBanner('本地存储不可用，本次数据不会保存——请立即「导出全部数据（JSON）」备份。', 'error');
  }
}

/** 保存灯「保存中…」瞬态（四期⑦ U27）：写入瞬间切换，写入完成/失败路径文案不变；纯展示层 */
function setSaveLampSaving() {
  const dot = document.getElementById('saveDot');
  const text = document.getElementById('saveText');
  if (!dot || !text) return;
  text.textContent = '保存中…';
  dot.classList.add('save-saving');
}

/** 非破坏性提醒横幅（R7：仅角落横幅，不打断操作）；lastBannerMsg 记录最近一条内容 */

let bannerQueue = [];   // 四期⑦（B.9-2.5）：堆叠队列 [{msg, timer}]——上限 3 条纵向排列，先进先出，各 5 秒自消

let lastBannerMsg = '';   // 语义不变：仍记录「最近一条」横幅内容（大量历史断言依赖）

function showBanner(message, level) {
  lastBannerMsg = message;
  // W6-7 横幅分级（拍板⑤＋UX 裁决 #49/#50）：level ∈ success（成功）/ warn（警告）/
  // error（错误·恢复类），缺省 info（提醒）——视觉分级走既有 badge 色系（style.css），
  // 队列机制（上限 3 / FIFO / 单条 5 秒）与非 error 层行为逐字节不变（四期⑦-51 节基石）；
  // 错误/恢复类不落 5 秒自消计时（常驻，仅随队列上限挤出或跨视图复位清除）
  const tier = (level === 'success' || level === 'warn' || level === 'error') ? level : 'info';
  let banner = document.getElementById('appBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'appBanner';
    banner.className = 'banner';
    // W4（#204/#229，UX 裁决）：横幅 role=status（隐含 aria-live=polite）——
    // 状态变化可被辅助技术播报；mock 环境无 setAttribute 时跳过，历史断言零影响
    if (typeof banner.setAttribute === 'function') banner.setAttribute('role', 'status');
    document.body.appendChild(banner);
  }
  // 入队：超上限 3 条时挤掉队首（FIFO）；逐条管理计时器（bannerTimer 单计时器口径就此废止）
  const item = { msg: message, tier: tier, timer: null };
  bannerQueue.push(item);
  if (bannerQueue.length > 3) {
    const head = bannerQueue.shift();
    if (head && head.timer) window.clearTimeout(head.timer);
  }
  renderBannerQueue();
  if (tier === 'error') return;   // 错误/恢复类常驻：不挂自消计时器
  item.timer = window.setTimeout(function () {
    bannerQueue = bannerQueue.filter(function (x) { return x !== item; });
    renderBannerQueue();
  }, 5000);
}

/** 队列渲染：多条时容器内分行（white-space: pre-line 承载换行，style.css 微改）；队列清空即移除容器 */
function renderBannerQueue() {
  const banner = document.getElementById('appBanner');
  if (!banner) return;
  if (!bannerQueue.length) {
    if (typeof banner.remove === 'function') banner.remove();
    return;
  }
  banner.textContent = bannerQueue.map(function (x) { return x.msg; }).join('\n');
  // W6-7：容器视觉分级 = 队列内最高层级（error > warn > success > info；info 维持原类串）
  let top = 'info';
  const rank = { info: 0, success: 1, warn: 2, error: 3 };
  bannerQueue.forEach(function (x) { if (rank[x.tier || 'info'] > rank[top]) top = x.tier || 'info'; });
  banner.className = top === 'info' ? 'banner' : 'banner banner-' + top;
}

/** 跨视图复位时清空横幅队列（resetTodayUi 编排调用；逐条清计时器） */
function clearBannerQueue() {
  bannerQueue.forEach(function (item) {
    if (item.timer) window.clearTimeout(item.timer);
  });
  bannerQueue = [];
  const el = document.getElementById('appBanner');
  if (el && typeof el.remove === 'function') el.remove();
}

/* ============================================================
   W4-D 自定义危险确认弹层（UX 裁决 #6；v1.78 拍板①：仅替换原生 confirm 外观层——
   确认语义、文案规范、测试语义红线一律不动）。R7 不变：仅不可逆操作走本弹层；
   三条退路（取消按钮 / 点遮罩空白 / Esc）随时可退；确认键 danger-ok 实心危险色
   （R3：与 btn-primary 同尺寸口径，仅色相区分）。不叠层、不阻断页面（无原生同步阻塞）。
   ============================================================ */

/** 弹层存续标记（防叠层权威口径；真实/mock DOM 行为一致） */
let dangerConfirmOpen = false;

/** 警告三角线性 SVG（R3 内联图标，零外链 R1） */
const ICON_WARN =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
  '<path d="M12 9v4M12 17h.01"/></svg>';

/**
 * 危险确认弹层（浏览器原生环境路径）：遮罩 + 卡片（标题 / 人话文案 / 确认·取消）——
 * 确认点击后执行 onOk（实际删除等动作）；取消 / 点遮罩空白 / Esc 三退口只关弹层零副作用。
 * 防叠层（已存在即忽略）；focus 落取消键（R7：默认焦点在非破坏侧）。
 * mock 环境可直调断言：弹层 DOM 内容、按钮绑定与回调驱动（详见回归第 73 节）。
 */
function showDangerConfirm(msg, onOk) {
  if (typeof document === 'undefined' || !document.body) {
    if (onOk) onOk();   // 无 DOM 兜底：视为已确认（与沙盒红线同精神，不阻断动作）
    return;
  }
  if (dangerConfirmOpen) return;   // 不叠层（模块级标记为权威口径：mock 环境 getElementById 不解析 innerHTML）
  dangerConfirmOpen = true;
  const wrap = document.createElement('div');
  wrap.id = 'dangerConfirm';
  wrap.className = 'danger-mask';
  wrap.innerHTML =
    '<div class="danger-card" role="alertdialog" aria-modal="true" aria-label="危险操作确认">' +
      '<div class="danger-title">' + ICON_WARN + '<span>危险操作确认</span></div>' +
      '<div class="danger-msg">' + escapeHtml(msg) + '</div>' +
      '<div class="form-actions">' +
        '<button type="button" class="danger-ok" id="dangerOkBtn">确认执行</button>' +
        '<button type="button" class="btn-sec" id="dangerCancelBtn">取消</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  const onKey = function (ev) {
    if (ev && ev.key === 'Escape') {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      close(false);
    }
  };
  const close = function (doOk) {
    dangerConfirmOpen = false;   // 关闭即复位（mock remove 为 noop 时语义一致）
    if (doOk && onOk) onOk();
    if (typeof wrap.remove === 'function') wrap.remove();
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', onKey, true);
    }
  };
  const okBtn = document.getElementById('dangerOkBtn');
  if (okBtn && okBtn.addEventListener) {
    okBtn.addEventListener('click', function () { close(true); });
  }
  const cancelBtn = document.getElementById('dangerCancelBtn');
  if (cancelBtn && cancelBtn.addEventListener) {
    cancelBtn.addEventListener('click', function () { close(false); });
  }
  if (wrap.addEventListener) {
    wrap.addEventListener('click', function (ev) {   // 点遮罩空白 = 取消
      if (ev && ev.target === wrap) close(false);
    });
  }
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', onKey, true);
  }
  if (cancelBtn && typeof cancelBtn.focus === 'function') cancelBtn.focus();
}

/* ============================================================
   四期⑩ 键盘快捷键最小集（拍板② 2026-09-19 用户「按建议」裁决：数字键 1–9 跳面板 +
   ? 帮助浮层，更多快捷键挂起）。纯 UI 增量：零 schema 变更（R4）、零数据写入；
   顶栏「数字跳面板」与导航按钮同一复位链路（resetTodayUi + renderApp，hash 随渲染同步）。
   ============================================================ */

/**
 * 数字键跳面板（纯 UI）：VALID_VIEWS 序映射（1=课表 … 9=业绩）；同视图 / 越界 /
 * 无当前校历（向导期）一律零动作；跳前 resetTodayUi 与顶栏导航按钮语义逐字节一致。
 */
function onNumberViewJump(n) {
  const v = VALID_VIEWS[n - 1];
  if (!v || v === uiView) return;
  if (!state.settings.activeCalendarId) return;   // 首次向导期无面板可跳
  if (guardDirtyLeave('切换面板')) return;   // W0A #2：数字键跳面板同守卫
  resetTodayUi();
  uiView = v;
  renderApp();
}

/** 快捷键帮助浮层 UI 态（纯 UI 态，不入数据；Esc / 再按 ? / 点「关闭」均可收起） */

let uiShortcutHelpOpen = false;

/** 帮助浮层开关（? 键 / Esc / 关闭按钮三处共用） */
function toggleShortcutHelp() {
  uiShortcutHelpOpen = !uiShortcutHelpOpen;
  renderShortcutHelp();
}

/** 帮助浮层焦点陷阱监听（W4 #193，问题列表裁决）：开启时挂 document keydown 捕获
 *  Tab 在浮层内循环（Shift+Tab 绕回首项、Tab 尾项回首项），关闭即卸载——
 *  键盘焦点不再跳出浮层；mock 环境无 querySelectorAll/contains 时零动作放行。 */
let shortcutHelpTrap = null;

/**
 * 帮助浮层渲染（R7 不弹窗——固定角卡行内呈现，复用 .banner 的定位思路、独立样式）：
 * 列已绑快捷键清单（数字跳面板 / ← → 翻周 / Esc / ? 与输入框聚焦守卫说明）。
 * W4（#193/#229）：role=dialog + aria-label 标注；打开即聚焦「关闭」按钮并启用焦点陷阱。
 */
function renderShortcutHelp() {
  let card = document.getElementById('shortcutHelp');
  if (!uiShortcutHelpOpen) {
    if (card && typeof card.remove === 'function') card.remove();
    if (shortcutHelpTrap) {   // 关闭即卸焦点陷阱（焦点自然回落文档）
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('keydown', shortcutHelpTrap, true);
      }
      shortcutHelpTrap = null;
    }
    return;
  }
  if (!card) {
    card = document.createElement('div');
    card.id = 'shortcutHelp';
    card.className = 'shortcut-help';
    document.body.appendChild(card);
  }
  if (typeof card.setAttribute === 'function') {   // W4 #229：浮层语义角色标注
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '键盘快捷键帮助');
  }
  card.innerHTML =
    '<h3>键盘快捷键</h3>' +
    '<div class="shortcut-row"><kbd>1</kbd>–<kbd>9</kbd>' +
      '<span>跳转面板：1 课表 · 2 排课 · 3 课程 · 4 校历 · 5 数据 · 6 规则 · 7 统计 · 8 对账 · 9 业绩</span></div>' +
    '<div class="shortcut-row"><kbd>←</kbd><kbd>→</kbd><span>课表视图翻周</span></div>' +
    '<div class="shortcut-row"><kbd>Esc</kbd><span>关闭展开的表单 / 抽屉 / 本帮助</span></div>' +
    '<div class="shortcut-row"><kbd>?</kbd><span>开关本帮助</span></div>' +
    '<p class="shortcut-note">输入框聚焦时快捷键不触发；点击行为与鼠标路径不变。' +
      '点周格空白格可直接新建排课，点课程色块可直达编辑。</p>' +
    '<div class="form-actions"><button type="button" class="btn-sec" id="shortcutHelpClose">关闭</button></div>';
  const closeBtn = document.getElementById('shortcutHelpClose');
  if (closeBtn) closeBtn.addEventListener('click', toggleShortcutHelp);
  // W4 #193：焦点管理——打开即聚焦「关闭」按钮；Tab 在浮层内循环
  if (shortcutHelpTrap && typeof document.removeEventListener === 'function') {
    document.removeEventListener('keydown', shortcutHelpTrap, true);   // 防重复挂载
  }
  shortcutHelpTrap = function (ev) {
    if (!ev || ev.key !== 'Tab') return;
    const c = document.getElementById('shortcutHelp');
    if (!c) return;
    const nodes = [];
    try {
      const nl = (typeof c.querySelectorAll === 'function')
        ? c.querySelectorAll('button, a[href], input, select, textarea, [tabindex]') : [];
      for (let i = 0; i < nl.length; i++) nodes.push(nl[i]);
    } catch (eTrap) { /* 可聚焦元素收集失败：放行不阻断 Tab */ }
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    const ae = document.activeElement;
    const inCard = ae && (ae === c ||
      (typeof c.contains === 'function' && c.contains(ae)));
    if (ev.shiftKey && (!inCard || ae === first)) {   // Shift+Tab 越界 → 绕到末项
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof last.focus === 'function') last.focus();
    } else if (!ev.shiftKey && ae === last) {         // Tab 在末项 → 回首项
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof first.focus === 'function') first.focus();
    }
  };
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', shortcutHelpTrap, true);
  }
  if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
}

/* ============================================================
   四之八、数据与备份面板（一期 1.8；显示名，原「数据管理」）
   依据 D7（导出 JSON 为主、CSV 为辅；导入走合并逻辑而非覆盖）与 R2（预览确认铁律）：
    - JSON 全量导出：完整 state 序列化（含 schemaVersion），下载为 .json 备份；
    - JSON 合并导入：选文件 → 解析校验（版本不符/结构非法拒收并提示）→ 表格预览
      （按顶层表列记录数 + 新增/同 id 冲突概况，全程零写入）→ 用户确认后才落库；
    - 合并裁定（2026-09-17 用户已确认）：同 id 冲突以 updatedAt 新者胜
      （缺时间戳视为最旧，防「旧备份盖新账」）；导入记录保留原 id 不重新发号
      （与三期业绩 JSON 导入「重新发号」是另案，不混用）；
      settings 其余字段不覆盖本地，仅 instanceCounter 抬升到双方最大（D7 防撞号）；
      无 id 表（headcountTiers / reconciles）按整条 JSON 去重合并；
    - CSV 辅助导出：流水表按附录A §7 字段序导出，UTF-8 带 BOM（Excel 直开不乱码），
      引号/逗号/换行按 RFC 4180 转义。
   ============================================================ */

/**
 * 切换视图时收起面板/视图的临时 UI 态（拆分评估方案 v1.2 §4.4：编排式复位，P2-9/21 一并解决）。
 * 本函数只编排不实现——按序调用三个模块的声明表复位函数 + 清理横幅计时器；
 * 各模块复位默认值与拆分前 resetTodayUi 的逐项赋值逐条一致（基线断言零改写）。
 */
function resetTodayUi() {
  resetViewsUi();    // views.js：uiTodayInstId / uiTodayAction（2 项）
  resetPanelsUi();   // panels.js：便签抽屉 / 复制模板 / 重展开预览 / 统计筛选态·钻取 / 对账编辑态（7 项）
  resetAchvUi();     // achv.js：业绩表单 / 分类管理 / 复制上月 / 导入预览 / 速记三段与作用编辑（13 项）
  clearBannerQueue();   // 四期⑦：横幅队列逐条清计时器（原 bannerTimer 单计时器口径废止）
}

/* ============================================================
   W0A 交互安全热修（2026-09-19，依据《前端CSS_UX审核裁决 v1.0》W0A 清单，v1.68 落变更记录）：
   ① resize 打断编辑守卫——窗口尺寸变化时若存在打开的编辑表单，跳过重渲染（内容与编辑态保留）；
   ② 脏表单离开守卫——表单有未提交修改时，切视图（顶栏/移动导航/hash/数字键）一律横幅挽留拦截
     （R7 不弹窗）；刷新/关页经 beforeunload 原生挽留（浏览器唯一可行通道）；
   ③ Esc 守卫复核——onEscClose 最前置脏检查（views.js），未提交修改不得被 Esc 静默吞掉；
   口径：脏标记由表单控件 input/change 委托置位（markFormDirty）；任一完整面板重渲染即清零
   （提交或放弃的复位语义）；预览模型类 UI 态重渲染可复原，不计入打开表单清单。
   ============================================================ */

let uiFormDirty = false;   // W0A：脏表单标记（表单控件 input/change 即置位；整面板重渲染清零）

/** 表单控件输入委托（input/change 捕获阶段）：表单内编辑即置脏；筛选区等非表单控件不误置 */
function markFormDirty(ev) {
  const t = ev && ev.target;
  if (!t || typeof t.closest !== 'function') return;
  if (t.closest('form') ||
      t.id === 'pasteText' || t.id === 'achvCatNewName' || t.id === 'achvCatName') {
    uiFormDirty = true;
  }
}

/** 存在打开的编辑表单（W0A #1 resize 守卫取值口；重渲染可复原的预览模型类 UI 态不计入） */
function hasOpenEditableForm() {
  return !!(formCalendarId || uiSemInitOpen || formCourseId || formEntryId || entryPrefill ||
    formRuleOpen || uiReconcileMonth || uiAchvFormOpen || formAchvId || formAchvCatId ||
    uiMemoCourseId || uiTodayAction || uiStatsHcId || uiStatsSettleId || uiPasteOpen ||
    uiEntryLocId);   // W4-E 拍板⑥：地点行内编辑态纳入编辑中守卫
}

/** 脏表单离开守卫（W0A #2）：有未提交修改时横幅挽留并拦截（R7 不弹窗）；返回 true = 已拦截 */
function guardDirtyLeave(actionText) {
  if (!uiFormDirty) return false;
  showBanner('当前表单有未提交的修改——' + actionText +
    '已拦截：请先保存，或点「取消」放弃修改。', 'info');
  return true;
}

/* ============================================================
   六之零、全局交互绑定（四期⑥，启动时只绑一次）
   ============================================================ */

/**
 * 全局交互绑定（只绑一次）：window resize debounce 200ms → renderApp（移动/桌面分流
 * 谓词重判，B.9-2.1）；hashchange → 视图跟随地址栏（B.11-U20，__hashQuiet 截断程序式
 * 写 hash 的回环）；键盘最小集——Esc 关闭当前展开表单/抽屉（B.9-2.4）、周格视图
 * ←/→ 翻周（B.10-1.2）；焦点在输入框时一律不触发（kbFocusInField 统一守卫，B.11-U19）。
 */

/**
 * 多标签页数据变更监听（四期⑦，纯逻辑层）：非本页写入（storage 事件天然只报其他标签页）
 * 且 event.key 命中 STORAGE_KEY 才提示；只提示不自动刷新（评审原文精神，防打断）。
 */
function onStorageChanged(ev) {
  try {
    if (!ev || ev.key !== STORAGE_KEY) return;
    showBanner('数据已在其他标签页修改，刷新可查看最新。', 'info');
  } catch (err) { /* 环境异常静默跳过，不抛错 */ }
}

function bindGlobalInteractions() {
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      // W0A #1（#241）：编辑中不随 resize 重绘——吞掉未提交表单内容/编辑态的根治
      if (hasOpenEditableForm()) {
        showBanner('检测到表单正在编辑，本次窗口变化未重绘（已填内容已保留）。', 'info');
        return;
      }
      renderApp();
    }, 200);
  });
  // 四期⑦（B.11-U21/B.12-3.1）：多标签页并发感知——storage 事件只在「其他标签页」写入时触发，
  // event.key 过滤 STORAGE_KEY；只横幅提示、不自动刷新（防打断）；mock 环境 addEventListener 为 noop，
  // 测试只能断言函数存在与纯逻辑层（onStorageChanged 具名函数直调即可）
  window.addEventListener('storage', onStorageChanged);
  // W0A #2（#135）：刷新 / 关闭页面前挽留——beforeunload 原生提示是浏览器唯一可行通道
  window.addEventListener('beforeunload', function (ev) {
    if (!uiFormDirty) return;
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (ev) ev.returnValue = '';
  });
  // W0A #2：表单控件 input/change 委托置脏（markFormDirty 纯函数层，沙盒可直调断言）
  document.addEventListener('input', markFormDirty, true);
  document.addEventListener('change', markFormDirty, true);
  window.addEventListener('hashchange', function () {
    if (__hashQuiet) { __hashQuiet = false; return; }   // renderApp 同步 hash 引发的回环
    // W4-B #215 伴生守卫：页内锚点（skip-link 的 #mainContent 等非法视图值）不触发视图切换——
    // 启动路径 viewFromHash「非法值回落 week」语义不变，仅 live hashchange 对未知锚点放行
    if (VALID_VIEWS.indexOf(String(window.location.hash || '').replace(/^#/, '')) < 0) return;
    const v = viewFromHash();
    if (v === uiView) return;
    if (guardDirtyLeave('切换视图')) return;   // W0A #2：hash 导航同守卫
    resetTodayUi();
    uiView = v;
    renderApp();
  });
  document.addEventListener('keydown', function (ev) {
    if (kbFocusInField()) return;
    // W4 #192（问题列表裁决）：修饰键组合（Ctrl/Alt/Meta + 键）一律不触发应用快捷键——
    // 防 Ctrl+1 切换浏览器标签页被误跳面板、Ctrl+R 等系统组合被吞
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (ev.key === 'Escape') { onEscClose(); return; }
    // 四期⑩（快捷键最小集，B.6 #23 余量拍板②）：? 帮助浮层开关 + 数字键 1–9 跳面板
    //（VALID_VIEWS 序映射，纯 UI；输入框聚焦一律不触发——kbFocusInField 统一守卫不变）
    if (ev.key === '?') { toggleShortcutHelp(); return; }
    if (/^[1-9]$/.test(ev.key)) { onNumberViewJump(parseInt(ev.key, 10)); return; }
    if (uiView !== 'week') return;
    if (ev.key === 'ArrowLeft') {
      uiWeekOffset -= 1;
      renderWeekView();
    } else if (ev.key === 'ArrowRight') {
      uiWeekOffset += 1;
      renderWeekView();
    }
  });
}

/* ============================================================
   六、启动入口
   ============================================================ */

state = loadState();
// 三期 3.0a 复审修复（F1）：预置分类 ac-1~ac-4（插单 1.14，固定 id）不消耗计数器——
// 全新首启时计数器为 0，首启会话内直接新增分类会与预置 id 撞号（重复 id，归属/删除歧义）。
// loadState 路径已有 liftCounterGlobal 抬升，首启路径没有；启动时全局抬升一次（幂等，D7 防撞号）。
liftCounterGlobal(state);
// 1.5 一次性引导：旧数据（有排课项、无流水）首次运行本版时自动展开一次；
// 幂等 + 冻结保护保证安全，实例非空后不再触发
if (state.entries.length && !state.instances.length) {
  expandEntries();
  saveState();
}
uiView = viewFromHash();        // 四期⑥ U20：刷新/直链按 hash 恢复视图（非法值回落 week）
bindGlobalInteractions();       // 四期⑥：resize 重渲 / hashchange 跟随 / 键盘最小集（Esc、←/→ 翻周，输入框聚焦不触发）
renderApp();
