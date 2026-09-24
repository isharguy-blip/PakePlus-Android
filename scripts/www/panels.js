/* 教员台 · panels.js —— 写操作面板：向导 / 校历 / 课程（含便签）/ 排课（含粘贴导入 UI）/
   数据面板 / 结算规则 / 统计 / 对账核对。函数体逐字搬迁自 app.js 1.26。 */

'use strict';

/**
 * 严格数字解析（W2-D #50，2026-09-20 问题列表裁决）：只接受整串十进制数字——
 * 拒绝 parseInt/parseFloat 会静默吞尾的「12abc」「2.5x」「1e2」等脏输入；
 * 空串/非数字返回 NaN，由各自写点沿用原有范围校验与人话错误文案。纯函数层，沙盒可直测。
 */
function parseStrictIntInput(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  return /^[+-]?\d+$/.test(s) ? Number(s) : NaN;
}
function parseStrictFloatInput(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s) ? Number(s) : NaN;
}

function renderWizard() {
  appRoot.innerHTML =
    '<div class="wizard-wrap">' +
      '<div class="wizard-card">' +
        '<div class="wizard-icon">' + ICON_WIZARD + '</div>' +
        '<h1>欢迎使用教员台</h1>' +
        '<p class="wizard-sub">欢迎使用教员台。第一步：填好下面的信息，创建本学期校历；创建后按「课程 → 排课」两步走，课表与统计自动展开。</p>' +
        '<form class="wizard-form" id="wizardForm" novalidate>' +
          '<div class="field">' +
            '<label for="wizName">学期名称</label>' +
            '<input id="wizName" name="name" type="text" maxlength="30" aria-required="true" aria-describedby="wizardError" ' +
              'placeholder="例如：2026 秋季学期" autocomplete="off">' +
          '</div>' +
          '<div class="field">' +
            '<label for="wizStart">学期起始日（第 1 周的周一）</label>' +
            '<input id="wizStart" name="startDate" type="date" aria-required="true" aria-describedby="wizardError">' +
          '</div>' +
          '<div class="field">' +
            '<label for="wizWeeks">总周数</label>' +
            '<input id="wizWeeks" name="totalWeeks" type="number" min="1" max="30" value="16" aria-required="true" aria-describedby="wizardError" inputmode="numeric" enterkeyhint="done" autocomplete="off">' +
          '</div>' +
          '<p class="hint-line">说明：停课周与节次时刻表创建后可在「校历」面板随时调整；' +
            '当前先按 12 节默认时刻表初始化。</p>' +
          '<div class="wizard-error" id="wizardError" role="alert"></div>' +
          '<button type="submit" class="btn-primary">创建校历，开始使用</button>' +
        '</form>' +
      '</div>' +
    '</div>';

  const wizardFormEl = document.getElementById('wizardForm');
  wizardFormEl.addEventListener('submit', onWizardSubmit);
  wizardFormEl.addEventListener('input', function () { wizardFormEl.__submitting = false; });
  clearFormInvalid(['wizName', 'wizStart', 'wizWeeks']);   // 四期⑦：复学前清除 aria-invalid
}

/** 向导提交：校验 → 建校历 → 置为当前校历 → 落库 → 进入主界面 */

function onWizardSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const name = document.getElementById('wizName').value.trim();
  const startDate = document.getElementById('wizStart').value;
  const totalWeeks = parseStrictIntInput(document.getElementById('wizWeeks').value);
  const errBox = document.getElementById('wizardError');

  // 校验：学期名必填；起始日必填且必须是合法的 YYYY-MM-DD；周数为 1–30 的整数
  if (!name) { formErrorAt(errBox, '请填写学期名称。', 'wizName'); return; }
  // 四期④a：统一经 isValidDateStr（2026-02-30 类格式合法但日历不存在的日期一并拒绝；文案与防御行为不变）
  if (!isValidDateStr(startDate)) { formErrorAt(errBox, '请选择学期起始日。', 'wizStart'); return; }
  // startDate 是周次换算唯一锚点（D4），附录A §4 冻结其为「第 1 周周一」，必须校验
  if (new Date(startDate + 'T00:00:00').getDay() !== 1) {
    formErrorAt(errBox, '起始日需为周一（第 1 周第 1 天）。', 'wizStart'); return;
  }
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) {
    formErrorAt(errBox, '总周数需为 1–30 之间的整数。', 'wizWeeks'); return;
  }

  const ts = nowIso();
  const calendar = {
    id: nextId('cal'),
    name: name,
    startDate: startDate,        // 第 1 周第 1 天（周一）：周次换算唯一锚点（D4）
    totalWeeks: totalWeeks,
    breaks: [],                  // 停课周 1.2 开放编辑（附录A §4，默认空）
    periodTimes: defaultPeriodTimes(),
    createdAt: ts,
    updatedAt: ts
  };

  state.calendars.push(calendar);
  state.settings.activeCalendarId = calendar.id;   // 创建即设为当前校历
  saveState();
  renderApp();
  // 四期⑩（B.12-7.2）：首次建校历落库后的下一步引导——轻量一句横幅，不新增向导步骤（R7 不弹窗）
  showBanner('校历已创建。下一步：①「课程」建课 ②「排课」排课，课表自动展开。', 'success');
}

/* ============================================================
   四之二、校历管理面板（一期 1.2）
   能力：多校历列表 / 新建 / 编辑（学期名、起始日、总周数、
        停课周、节次时刻表——插单 1.11 起节数 8/10/12 三档可调）/ 切换当前校历（settings.activeCalendarId）
   ============================================================ */

/** 校历表单当前编辑对象 id：null = 新建模式 */

let formCalendarId = null;

function renderCalendarPanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导

  const rows = state.calendars.map(function (c) {
    const isCurrent = c.id === state.settings.activeCalendarId;
    const breakText = c.breaks.length ? ('停课 ' + c.breaks.length + ' 周') : '无停课周';
    return (
      '<div class="cal-card' + (isCurrent ? ' current' : '') + '">' +
        '<div class="cal-card-main">' +
          '<div class="cal-card-name">' + escapeHtml(c.name) +
            (isCurrent ? '<span class="cal-badge">当前</span>' : '') + '</div>' +
          '<div class="cal-card-meta">' + escapeHtml(c.startDate) + ' 起 · 共 ' + c.totalWeeks +
            ' 周 · ' + breakText + '</div>' +
        '</div>' +
        '<div class="cal-card-actions">' +
          (isCurrent ? '' :
            '<button type="button" class="btn-sec" id="btnSetActive-' + c.id + '">设为当前</button>') +
          '<button type="button" class="btn-sec" id="btnEdit-' + c.id + '">编辑</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head">' +
          '<h2>校历管理</h2>' +
          '<div class="panel-head-ops">' +
            '<button type="button" class="btn-sec" id="btnSemInit" aria-expanded="' + (uiSemInitOpen ? 'true' : 'false') + '" aria-controls="semInitWrap">新学期初始化</button>' +
            '<button type="button" class="btn-primary btn-auto" id="btnNewCalendar">新建校历</button>' +
          '</div>' +
        '</div>' +
        '<div id="semInitWrap"></div>' +
        '<div id="calendarFormWrap"></div>' +   // 四期⑩：表单卡统一置顶（B.6 #9 余量；与课程/排课面板同序）
        '<div class="cal-list">' + rows + '</div>' +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  // 列表操作：设为当前 / 编辑（当前校历无「设为当前」按钮，天然防重）
  state.calendars.forEach(function (c) {
    const btnSet = document.getElementById('btnSetActive-' + c.id);
    if (btnSet) {
      btnSet.addEventListener('click', function () { setActiveCalendar(c.id); });
    }
    const btnEdit = document.getElementById('btnEdit-' + c.id);
    if (btnEdit) {
      btnEdit.addEventListener('click', function () { formCalendarId = c.id; renderCalendarForm(); });
    }
  });
  document.getElementById('btnNewCalendar').addEventListener('click', function () {
    formCalendarId = null;
    renderCalendarForm();
  });
  /* 插单 1.18：新学期初始化（两步走，R2 确认前零写入） */
  const btnSemInit = document.getElementById('btnSemInit');
  if (btnSemInit) {
    btnSemInit.addEventListener('click', function () {
      uiSemInitOpen = !uiSemInitOpen;
      uiSemInitPlan = null;
      renderCalendarPanel();
    });
  }
  renderSemInitForm();
}

/**
 * 插单 1.18「新学期初始化」表单/预览卡渲染（复用 cal-form-card / today-line / break-chip /
 * import-preview / btn 体系，零新增样式）：源校历选择＋名称后缀＋课程整组勾选预览
 * （越界周次 badge-warn 标黄、全截空排课项列出提示）＋解析预览/确认两步走。
 */
function renderSemInitForm() {
  const wrap = document.getElementById('semInitWrap');
  if (!wrap) return;
  if (!uiSemInitOpen) { wrap.innerHTML = ''; return; }
  const cal = getActiveCalendar();
  const others = state.calendars.filter(function (c) { return c.id !== (cal ? cal.id : null); });
  const srcDefault = uiSemInitSrcId || (others.length ? others[others.length - 1].id : '');
  const srcOpts = others.map(function (c) {
    return '<option value="' + escapeHtml(c.id) + '"' +
      (c.id === srcDefault ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
  }).join('');
  let preview = '';
  if (uiSemInitPlan) {
    const p = uiSemInitPlan;
    const picked = p.items.filter(function (it) { return it.checked; }).length;
    const rows = p.items.map(function (it, i) {
      const dropped = it.entries.reduce(function (s, x) { return s + x.droppedWeeks; }, 0);
      return '<div class="today-line">' +
        '<div class="today-main">' +
          '<div class="today-name">' +
            '<label class="break-chip"><input type="checkbox" id="semInitPick-' + i + '"' +
              (it.checked ? ' checked' : '') + '><span>' + escapeHtml(it.course.name) +
              '</span></label></div>' +
          '<div class="today-meta">排课项 ' + it.entries.length + ' 条（随课程联动）' +
            (dropped ? ' <span class="paste-badge badge-warn">越界截断 ' + dropped + ' 周</span>' : '') +
          '</div>' +
        '</div></div>';
    }).join('');
    const skippedHint = p.skipped.length
      ? '<p class="form-hint">以下课程存在周次全部越出目标校历的排课项，将不复制：' +
        p.skipped.map(function (s) { return escapeHtml(s.courseName); }).join('、') + '。</p>'
      : '';
    preview = '<div class="import-preview"><table><tbody>' + rows + '</tbody></table></div>' +
      skippedHint +
      '<div class="form-actions" style="margin-top:12px">' +
        '<button type="button" class="btn-primary btn-auto" id="btnSemInitConfirm">确认复制（' +
          picked + ' 门课程）</button>' +
        '<button type="button" class="btn-sec" id="btnSemInitCancel">取消</button>' +
      '</div>';
  }
  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>新学期初始化（复制上学期课程与排课项到新校历）</h3>' +
      '<p class="form-hint">两步走（确认前不写任何数据）：选择源校历 → 解析预览课程整组清单 ' +
        '（排课项随课程联动不逐条勾选；周次模式 / 授课班级 / 默认人数 / 课时性质全字段携带；' +
        '目标校历越界周次自动截断并标黄）。确认后课程深拷贝（nextId 发号、名称可加后缀）并 ' +
        '自动展开流水。不查重不合并——重复执行会得到两套可见副本。</p>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="semInitSrc">源校历（复制自）</label>' +
          '<select id="semInitSrc">' + srcOpts + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="semInitSuffix">新课程名称后缀（可改，可空）</label>' +
          '<input id="semInitSuffix" type="text" maxlength="20" value="' +
            escapeHtml(uiSemInitSuffix) + '" placeholder="如：（2026 春）">' +
        '</div>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn-sec" id="btnSemInitPreview">解析预览</button>' +
      '</div>' +
      preview +
    '</div>';

  const srcEl = document.getElementById('semInitSrc');
  if (srcEl) srcEl.addEventListener('change', function () { uiSemInitSrcId = srcEl.value; });
  const sfxEl = document.getElementById('semInitSuffix');
  if (sfxEl) sfxEl.addEventListener('change', function () { uiSemInitSuffix = sfxEl.value; });
  const btnPrev = document.getElementById('btnSemInitPreview');
  if (btnPrev) btnPrev.addEventListener('click', onSemInitPreviewClick);
  const btnCancel = document.getElementById('btnSemInitCancel');
  if (btnCancel) btnCancel.addEventListener('click', function () {
    uiSemInitOpen = false;
    uiSemInitPlan = null;
    renderCalendarPanel();
  });
  if (uiSemInitPlan) {
    uiSemInitPlan.items.forEach(function (it, i) {
      const pick = document.getElementById('semInitPick-' + i);
      if (pick) pick.addEventListener('change', function () { it.checked = !!pick.checked; });
    });
    const btnConfirm = document.getElementById('btnSemInitConfirm');
    if (btnConfirm) btnConfirm.addEventListener('click', onSemInitConfirmClick);
  }
}

/** 「解析预览」：读源校历/后缀 → semesterCopyPlan 干跑（state 零写入，R2）→ 渲染预览卡 */

function onSemInitPreviewClick() {
  const cal = getActiveCalendar();
  if (!cal) return;
  const srcEl = document.getElementById('semInitSrc');
  uiSemInitSrcId = srcEl ? srcEl.value : uiSemInitSrcId;
  const sfxEl = document.getElementById('semInitSuffix');
  uiSemInitSuffix = sfxEl ? sfxEl.value : uiSemInitSuffix;
  uiSemInitPlan = null;
  if (!uiSemInitSrcId || uiSemInitSrcId === cal.id) {
    showBanner('源校历不能与目标校历（当前校历）相同。', 'warn');
    renderCalendarPanel();
    return;
  }
  const activeIds = state.courses.filter(function (c) { return c.status === 'active'; })
    .map(function (c) { return c.id; });
  const plan = semesterCopyPlan(uiSemInitSrcId, cal.id, activeIds);
  if (plan.error) {
    showBanner(plan.error, 'warn');
    renderCalendarPanel();
    return;
  }
  uiSemInitPlan = plan;
  renderCalendarPanel();
}

/** 「确认复制」（唯一写点）：课程深拷贝（nextId('c')、名称＋后缀、状态恒 active）＋
    排课项深拷贝改挂目标校历（nextId('e')、weeks 越界截掉、startWeek/endWeek 同步截后界、
    typeId/classes/defaultHeadcount 全字段携带）→ expandEntries → saveState → 横幅汇报。 */

function onSemInitConfirmClick() {
  if (!uiSemInitPlan) return;
  const plan = uiSemInitPlan;
  const dst = state.calendars.find(function (c) { return c.id === plan.dstCalId; });
  if (!dst) { uiSemInitPlan = null; renderCalendarPanel(); return; }
  const suffix = String(uiSemInitSuffix || '').trim();
  const ts = nowIso();
  let courseCount = 0, entryCount = 0, droppedWeeks = 0;
  plan.items.forEach(function (it) {
    if (!it.checked) return;
    const nc = {
      id: nextId('c'),
      name: it.course.name + suffix,
      typeId: it.course.typeId,
      defaultLocation: it.course.defaultLocation || '',
      classes: it.course.classes || '',
      color: it.course.color,
      notes: it.course.notes || '',
      status: 'active',          // 拷贝课程恒为开设中（源清单仅列开设中，双保险）
      createdAt: ts,
      updatedAt: ts
    };
    state.courses.push(nc);
    courseCount++;
    it.entries.forEach(function (x) {
      droppedWeeks += x.droppedWeeks;
      const en = x.entry;
      state.entries.push({
        id: nextId('e'),
        courseId: nc.id,
        calendarId: dst.id,
        weekday: en.weekday,
        periodStart: en.periodStart,
        periodEnd: en.periodEnd,
        weekPattern: {            // weeks[] 权威（Q1）：截后列表为准，再生参数同步截后界
          kind: (en.weekPattern && en.weekPattern.kind) || 'every',
          startWeek: x.keptWeeks[0],
          endWeek: x.keptWeeks[x.keptWeeks.length - 1],
          weeks: x.keptWeeks.slice()
        },
        location: en.location || '',
        hoursPerSession: en.hoursPerSession,
        typeId: (en.typeId === undefined ? null : en.typeId),
        classes: en.classes || '',
        defaultHeadcount: (en.defaultHeadcount === undefined ? null : en.defaultHeadcount),
        createdAt: ts,
        updatedAt: ts
      });
      entryCount++;
    });
  });
  uiSemInitOpen = false;
  uiSemInitPlan = null;
  uiSemInitSrcId = '';
  uiSemInitSuffix = '';
  expandEntries();   // 方案 3：拷贝排课项自动展开为目标校历流水
  saveState();
  renderCalendarPanel();
  showBanner('新学期初始化完成：课程 ' + courseCount + ' 门、排课项 ' + entryCount +
    ' 条已挂「' + dst.name + '」。' +
    (droppedWeeks ? '越界截断共 ' + droppedWeeks + ' 周次。' : '') +
    (plan.skipped.length ? '跳过空排课项 ' + plan.skipped.length + ' 条。' : ''), 'success');
}

/* ============================================================
   四之三、课程管理面板（一期 1.3）

/** 切换当前校历：只改 settings.activeCalendarId，立即落库并刷新面板 */

function setActiveCalendar(id) {
  state.settings.activeCalendarId = id;
  uiWeekOffset = 0;   // 四期⑥（B.9-3.5）：切换当前校历，翻周位移同步归零（新校历从本周起）
  saveState();
  renderCalendarPanel();
}

/** 停课周 chips：按总周数生成，周号范围天然合法（附录A §4：breaks 只存周号） */

function breaksChipsHtml(totalWeeks, selected) {
  let html = '';
  for (let w = 1; w <= totalWeeks; w++) {
    const checked = selected.indexOf(w) >= 0 ? ' checked' : '';
    html += '<label class="break-chip"><input type="checkbox" id="calBreak-' + w +
      '" value="' + w + '"' + checked + '><span>第 ' + w + ' 周</span></label>';
  }
  return html;
}

/** 收集勾选的停课周（升序天然成立，checkbox 由总周数生成故不越界） */

function collectBreaks(totalWeeks) {
  const out = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const box = document.getElementById('calBreak-' + w);
    if (box && box.checked) out.push(w);
  }
  return out;
}

/**
 * 节次时刻表行（插单 1.11：行数 = count，不再固定 12）：
 * 既有值优先（改档往返不丢已填时刻），缺失行补默认时刻。
 */

function periodRowsHtml(periodTimes, count) {
  const base = defaultPeriodTimes();
  let html = '';
  for (let p = 1; p <= count; p++) {
    const pt = (periodTimes && periodTimes[p - 1]) || base[p - 1];
    html += '<tr><td>第 ' + p + ' 节</td>' +
      '<td><input type="time" id="calPtStart-' + p + '" value="' + escapeHtml(pt.start) + '"></td>' +
      '<td><input type="time" id="calPtEnd-' + p + '" value="' + escapeHtml(pt.end) + '"></td></tr>';
  }
  return html;
}

/**
 * 读当前表单已填的节次时刻草稿（最多 12 行；缺失/非法回落默认时刻）。
 * 改档时先读草稿再按新行数重建表格，保证 8/10/12 往返切换不丢已填值。
 */

function readPeriodTimesDraft() {
  const base = defaultPeriodTimes();
  const out = [];
  for (let p = 1; p <= 12; p++) {
    const sEl = document.getElementById('calPtStart-' + p);
    const eEl = document.getElementById('calPtEnd-' + p);
    const s = sEl ? sEl.value : '';
    const e = eEl ? eEl.value : '';
    out.push({
      period: p,
      start: /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : base[p - 1].start,
      end: /^([01]\d|2[0-3]):[0-5]\d$/.test(e) ? e : base[p - 1].end
    });
  }
  return out;
}

/** 节数改档：按新节数重建时刻表（仅认 8/10/12 三档，脏值回落 12） */

function renderCalPeriodRows(count) {
  const n = [8, 10, 12].indexOf(count) >= 0 ? count : 12;
  const tbody = document.getElementById('calPeriodTbody');
  if (tbody) tbody.innerHTML = periodRowsHtml(readPeriodTimesDraft(), n);
}

/** 渲染新建/编辑校历表单（编辑对象由 formCalendarId 决定；向导建的校历同样可编辑补全） */

function renderCalendarForm() {
  const wrap = document.getElementById('calendarFormWrap');
  if (!wrap) return;

  const editing = formCalendarId
    ? state.calendars.find(function (c) { return c.id === formCalendarId; })
    : null;
  if (formCalendarId && !editing) { formCalendarId = null; renderCalendarPanel(); return; }

  const cal = editing || {
    name: '', startDate: '', totalWeeks: 16, breaks: [], periodTimes: defaultPeriodTimes()
  };
  // 节数下拉（插单 1.11 拍板 a：8/10/12 三档）：编辑态按实际节数预填；脏数据（非三档长度）回落 12
  const countSel = [8, 10, 12].indexOf(periodCountOf(cal)) >= 0 ? periodCountOf(cal) : 12;

  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>' + (editing ? '编辑校历' : '新建校历') + '</h3>' +
      '<form id="calendarForm" class="cal-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field full">' +
            '<label for="calFormName">学期名称</label>' +
            '<input id="calFormName" type="text" maxlength="30" aria-required="true" aria-describedby="calFormError" value="' + escapeHtml(cal.name) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="calFormStart">学期起始日（第 1 周的周一）</label>' +
            '<input id="calFormStart" type="date" aria-required="true" aria-describedby="calFormError" value="' + escapeHtml(cal.startDate) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="calFormWeeks">总周数（1–30）</label>' +
            '<input id="calFormWeeks" type="number" min="1" max="30" aria-required="true" aria-describedby="calFormError" value="' + cal.totalWeeks + '" inputmode="numeric" enterkeyhint="done" autocomplete="off">' +
          '</div>' +
          '<fieldset class="field full">' + '<legend>停课周（可多选）</legend>' + '<div class="breaks-grid" id="breaksGrid">' +
              breaksChipsHtml(cal.totalWeeks, cal.breaks) + '</div>' + '</fieldset>' +
          '<div class="field">' +
            '<label for="calFormPeriodCount">每天节数（8 / 10 / 12 三档）</label>' +
            '<select id="calFormPeriodCount">' +
              [8, 10, 12].map(function (n) {
                return '<option value="' + n + '"' + (n === countSel ? ' selected' : '') +
                  '>' + n + ' 节</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="field full">' +
            '<label>节次时刻表（行数随节数联动）</label>' +
            '<table class="period-table">' +
              '<thead><tr><th scope="col">节次</th><th scope="col">开始</th><th scope="col">结束</th></tr></thead>' +
              '<tbody id="calPeriodTbody">' + periodRowsHtml(cal.periodTimes, countSel) + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
        '<p class="hint-line">起始日须为周一（周次换算的唯一锚点）；停课周可多选、按周号升序保存；' +
          '周次结构变更后请到「排课」面板「重新展开」同步流水。</p>' +
        '<div class="form-error" id="calFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">' +
            (editing ? '保存修改' : '创建校历') + '</button>' +
          '<button type="button" class="btn-sec" id="calFormCancel">取消</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const calendarFormEl = document.getElementById('calendarForm');
  calendarFormEl.addEventListener('submit', onCalendarSubmit);
  calendarFormEl.addEventListener('input', function () { calendarFormEl.__submitting = false; });
  document.getElementById('calFormCancel').addEventListener('click', function () {
    formCalendarId = null;
    renderCalendarPanel();
  });
  // 节数改档 → 重建时刻表行（草稿读回，已填时刻不丢）
  document.getElementById('calFormPeriodCount').addEventListener('change', function () {
    renderCalPeriodRows(parseStrictIntInput(document.getElementById('calFormPeriodCount').value));
  });
  // 总周数变化 → 按新周数重建停课周选择，保留仍在范围内的勾选
  document.getElementById('calFormWeeks').addEventListener('change', function () {
    const n = parseStrictIntInput(document.getElementById('calFormWeeks').value);
    if (!Number.isInteger(n) || n < 1 || n > 30) return;
    const sel = collectBreaks(30);
    document.getElementById('breaksGrid').innerHTML = breaksChipsHtml(n, sel);
  });
  // W6-5：清除清单补齐 12 节时刻行——提交校验可给 calPtStart-N 置 aria-invalid，复学前同步清场
  const calInvalidIds = ['calFormName', 'calFormStart', 'calFormWeeks'];
  for (let cp = 1; cp <= 12; cp++) calInvalidIds.push('calPtStart-' + cp);
  clearFormInvalid(calInvalidIds);   // 四期⑦
}

/**
 * 校历表单提交：校验（与向导同一套规则）→ 新建或更新 → 落库 → 刷新面板。
 * 起始日必须周一（D4 锚点，附录A §4）；周数 1–30；停课周只存周号；
 * 12 节时刻逐节校验格式与 start<end。
 */

function onCalendarSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const name = document.getElementById('calFormName').value.trim();
  const startDate = document.getElementById('calFormStart').value;
  const totalWeeks = parseStrictIntInput(document.getElementById('calFormWeeks').value);
  const errBox = document.getElementById('calFormError');

  if (!name) { formErrorAt(errBox, '请填写学期名称。', 'calFormName'); return; }
  // 四期④a：统一经 isValidDateStr（2026-02-30 类格式合法但日历不存在的日期一并拒绝；文案与防御行为不变）
  if (!isValidDateStr(startDate)) { formErrorAt(errBox, '请选择学期起始日。', 'calFormStart'); return; }
  if (new Date(startDate + 'T00:00:00').getDay() !== 1) {
    formErrorAt(errBox, '起始日需为周一（第 1 周第 1 天）。', 'calFormStart'); return;
  }
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) {
    formErrorAt(errBox, '总周数需为 1–30 之间的整数。', 'calFormWeeks'); return;
  }

  // 四期④a（T2）：全范围 1–30 收集——改小总周数不丢停课设置；超范围周号保留在数据中
  //（chips 按新总周数不渲染，改回大周数自动恢复；collectBreaks 由 totalWeeks 生成故天然不越界）
  const breaks = collectBreaks(30);

  // 节数（插单 1.11）：仅认 8/10/12 三档，脏值回落 12（旧表单/缺该控件时同为 12，兼容基线）
  const periodCountRaw = parseStrictIntInput(document.getElementById('calFormPeriodCount').value);
  const pCount = [8, 10, 12].indexOf(periodCountRaw) >= 0 ? periodCountRaw : 12;

  const periodTimes = [];
  for (let p = 1; p <= pCount; p++) {
    const s = document.getElementById('calPtStart-' + p).value;
    const e = document.getElementById('calPtEnd-' + p).value;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(e)) {
      formErrorAt(errBox, '第 ' + p + ' 节的起止时刻不完整，请填写。', 'calPtStart-' + p); return;
    }
    if (s >= e) { formErrorAt(errBox, '第 ' + p + ' 节开始时刻需早于结束时刻。', 'calPtStart-' + p); return; }
    periodTimes.push({ period: p, start: s, end: e });
  }

  const ts = nowIso();
  let shapeChanged = false;   // 周次结构（起始日/总周数/停课周）是否变更：决定保存后是否提示手动重展开
  if (formCalendarId) {
    const cal = state.calendars.find(function (c) { return c.id === formCalendarId; });
    if (!cal) { formCalendarId = null; renderCalendarPanel(); return; }
    const shapeBefore = { startDate: cal.startDate, totalWeeks: cal.totalWeeks,
      breaks: JSON.stringify(cal.breaks),
      periodCount: periodCountOf(cal) };   // 插单 1.26 修复 P1-4：节数变化纳入结构变更提示
    cal.name = name;
    cal.startDate = startDate;
    cal.totalWeeks = totalWeeks;
    cal.breaks = breaks;
    cal.periodTimes = periodTimes;
    cal.updatedAt = ts;
    // 结构性变更才提示；改名、只动时刻表不打扰（R7 防骚扰）
    shapeChanged = cal.startDate !== shapeBefore.startDate ||
      cal.totalWeeks !== shapeBefore.totalWeeks ||
      JSON.stringify(cal.breaks) !== shapeBefore.breaks ||
      periodCountOf(cal) !== shapeBefore.periodCount;
  } else {
    const calendar = {
      id: nextId('cal'),
      name: name,
      startDate: startDate,
      totalWeeks: totalWeeks,
      breaks: breaks,
      periodTimes: periodTimes,
      createdAt: ts,
      updatedAt: ts
    };
    state.calendars.push(calendar);
    state.settings.activeCalendarId = calendar.id;   // 与向导一致：创建即置为当前
    uiWeekOffset = 0;   // 四期⑥：新校历置为当前，翻周位移同步归零
  }

  formCalendarId = null;
  saveState();
  renderCalendarPanel();
  // 方案 3：校历是坐标系，结构变更不自动重跑引擎，提示用户去「排课」面板手动「重新展开」
  if (shapeChanged) {
    showBanner('校历周次结构已变更，流水未自动改动——请到「排课」面板点「重新展开」。', 'warn');
  }
}

/** 四期⑨（B.9-3.1）：课程面板搜索匹配（纯函数，客户端过滤；空词恒真） */
function courseSearchMatch(c) {
  const t = String(uiCourseSearch || '').trim();
  return !t || String(c.name).indexOf(t) >= 0;
}

/* ============================================================
   四之三、课程管理面板（一期 1.3）
   能力：课程列表（开设中 / 已归档分区）、新建、编辑、归档/取消归档。
   约束：一期禁止物理删除，只能归档（附录A §5，历史流水照常显示）；
        类型仅用预置三类（courseTypes 一期不做界面维护，二期结算规则面板再开放）；
        color 按创建顺序从 COURSE_PALETTE 循环分配，不开放手选。
   ============================================================ */

/** 课程表单当前编辑对象 id：null = 新建模式 */

let formCourseId = null;

/** 三期 3.1b：课级便签抽屉当前展开课程 id（纯 UI 态，单开；随 resetTodayUi 复位） */

let uiMemoCourseId = null;

/* 四期⑨：面板头搜索词（纯 UI 态，客户端过滤；负向锁定组不入复位声明表，与表单编辑态同惯例） */
let uiCourseSearch = '';

let uiEntrySearch = '';

/* 插单 1.18 新学期初始化 UI 态（纯 UI 态不入数据；负向锁定组） */
let uiSemInitOpen = false;

let uiSemInitPlan = null;   // 预览模型（确认前零写入，R2）

let uiSemInitSrcId = '';    // 源校历选择

let uiSemInitSuffix = '';   // 新课程名称后缀（可改，可空）

/** typeId 合法性回退：不在预置三类中的 id 一律回落 "theory"（附录A §5） */

/**
 * 课程列表区统一渲染出口（W4-F，UX 裁决 #18）：搜索词非空且零命中 → 无匹配空态
 * （区别于「还没有课程」引导空态，不含新建主操作按钮）；否则按开设中/已归档分区渲染。
 * 初始渲染与搜索局部重渲染共用本函数，输出口径唯一。
 */
function courseListWrapHtml() {
  const termW4F = String(uiCourseSearch || '').trim();
  const activeW4F = state.courses.filter(function (c) { return c.status === 'active'; })
    .filter(courseSearchMatch);   // 四期⑨：搜索框客户端过滤
  const archivedW4F = state.courses.filter(function (c) { return c.status !== 'active'; })
    .filter(courseSearchMatch);
  if (termW4F && !activeW4F.length && !archivedW4F.length) {
    return emptyStateHtml('没有匹配「' + escapeHtml(termW4F) + '」的课程（按课程名过滤）。' +
      '换个关键词试试，或点「新建课程」录入。', '', ICON_BOOK);
  }
  return courseListHtml(activeW4F, false) + courseListHtml(archivedW4F, true);
}

function renderCoursePanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head">' +
          '<h2>课程管理</h2>' +
          '<div class="panel-head-ops">' +
            '<input id="courseSearch" type="text" class="panel-search" placeholder="搜索课程名" aria-label="搜索课程名" autocomplete="off" enterkeyhint="search" value="' +
              escapeHtml(uiCourseSearch) + '">' +
            // W4-F（UX #18）：搜索结果数角标（局部刷新，不整面板重渲）
            '<span class="factor-hint" id="courseSearchCount"></span>' +
            '<button type="button" class="btn-primary btn-auto" id="btnNewCourse">新建课程</button>' +
          '</div>' +
        '</div>' +
        '<div id="courseFormWrap"></div>' +
        '<div id="memoDrawerWrap"></div>' +
        '<div id="courseListWrap">' +
          courseListWrapHtml() +
        '</div>' +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  var newCourseHandler = function () {
    formCourseId = null;
    renderCourseForm();
  };
  document.getElementById('btnNewCourse').addEventListener('click', newCourseHandler);
  const btnNewCourseEmpty = document.getElementById('btnNewCourseEmpty');
  if (btnNewCourseEmpty) btnNewCourseEmpty.addEventListener('click', newCourseHandler);
  // 四期⑨ + W4-F（UX #18）：搜索输入 → 仅局部重渲染列表（不整页重渲，输入焦点不丢）＋
  // 结果数角标；Esc 清空并复位（裸搜索补全：结果数 / 无结果态在 courseListWrapHtml）
  const courseSearchEl = document.getElementById('courseSearch');
  if (courseSearchEl) {
    const refreshCourseListW4F = function () {
      uiCourseSearch = courseSearchEl.value;
      var listWrap = document.getElementById('courseListWrap');
      if (listWrap) listWrap.innerHTML = courseListWrapHtml();
      bindCourseCardActions(state.courses);
      var emptyBtn = document.getElementById('btnNewCourseEmpty');
      if (emptyBtn) emptyBtn.addEventListener('click', newCourseHandler);
      renderMemoDrawer();
      var cntEl = document.getElementById('courseSearchCount');
      if (cntEl) {
        var tW4F = String(uiCourseSearch || '').trim();
        cntEl.textContent = tW4F ? '匹配 ' +
          state.courses.filter(courseSearchMatch).length + ' 门' : '';
      }
    };
    courseSearchEl.addEventListener('input', refreshCourseListW4F);
    courseSearchEl.addEventListener('keydown', function (ev) {
      if (!ev || ev.key !== 'Escape') return;
      uiCourseSearch = '';
      courseSearchEl.value = '';
      refreshCourseListW4F();
      if (typeof courseSearchEl.blur === 'function') courseSearchEl.blur();
    });
  }
  bindCourseCardActions(state.courses);
  renderMemoDrawer();   // 三期 3.1b：课级便签抽屉（单开态在，则渲染）
}

/** 课程分区列表 HTML：卡片复用 cal-card 体系；归档卡降透明度 + 角标标识 */

function courseListHtml(list, isArchived) {
  if (!list.length) {
    return isArchived ? '' :
      emptyStateHtml('还没有课程。下一步：点下方「新建课程」（或面板右上角按钮）录入第一门课。',
        '<button type="button" class="btn-primary btn-auto" id="btnNewCourseEmpty">新建课程</button>',
        ICON_BOOK);
  }
  const title = isArchived ? '已归档课程' : '开设中的课程';
  const cards = list.map(function (c) {
    const meta = [courseTypeName(c.typeId), c.defaultLocation, c.classes]
      .filter(function (s) { return !!s; }).join(' · ');
    // 1.15 复审修复：脏 id（含引号等特殊字符）不渲染带 id 属性的操作按钮——
    // 绑定层 isSafeElId 已跳过，输出层同步清场（R5 顾头不顾腚），属性串零逃逸。
    // 安全 id 仍经 escapeHtml 纵深防御（系统发号 id 不含特殊字符，行为不变）。
    const cid = isSafeElId(c.id) ? escapeHtml(c.id) : null;
    // 三期 3.1b：「便签」按钮两态均渲染（归档课程抽屉只读，拍板⑤）；脏 id 沿用 1.15 防线（cid=null 时 actions 为空）
    // W6-6 列表批：单卡操作 >2 收「更多」（复用 W6-3 纯 CSS 下拉；id/class 串与绑定逐字保留）——
    // 开设中：便签/编辑在场、归档入菜单；归档态：便签/取消归档在场、编辑入菜单
    const moreOpen83 = '<span class="more-wrap"><button type="button" class="btn-sec" id="btnCourseMore-' +
      cid + '">更多 ▾</button><span class="more-menu">';
    const actions = cid === null ? '' : (isArchived
      ? '<button type="button" class="btn-sec" id="btnMemo-' + cid + '">便签</button>' +
        '<button type="button" class="btn-sec" id="btnCourseUnarchive-' + cid +
          '">取消归档</button>' +
        moreOpen83 +
        '<button type="button" class="btn-sec" id="btnCourseEdit-' + cid + '">编辑</button>' +
        '</span></span>'
      : '<button type="button" class="btn-sec" id="btnMemo-' + cid + '">便签</button>' +
        '<button type="button" class="btn-sec" id="btnCourseEdit-' + cid + '">编辑</button>' +
        moreOpen83 +
        '<button type="button" class="btn-sec" id="btnCourseArchive-' + cid + '">归档</button>' +
        '</span></span>');
    return (
      '<div class="cal-card' + (isArchived ? ' archived' : '') + '">' +
        '<span class="course-dot" style="background:' + safeColor(c.color) + '"></span>' +
        '<div class="cal-card-main">' +
          '<div class="cal-card-name course-card-name">' + escapeHtml(c.name) +
            (isArchived ? '<span class="badge-archived">已归档</span>' : '') + '</div>' +
          '<div class="cal-card-meta">' + (meta ? escapeHtml(meta) : '—') +
            (c.notes ? ' · ' + escapeHtml(c.notes) : '') + '</div>' +
        '</div>' +
        '<div class="cal-card-actions">' + actions + '</div>' +
      '</div>'
    );
  }).join('');
  return '<h3 class="section-subtitle">' + title + '（' + list.length + '）</h3>' +
    '<div class="cal-list">' + cards + '</div>';
}

/** 绑定课程卡片操作：编辑 / 归档 / 取消归档 */

function bindCourseCardActions(list) {
  list.forEach(function (c) {
    if (!isSafeElId(c.id)) return;   // 1.15 子项③：脏 id 不绑定，防属性串逃逸
    const btnEdit = document.getElementById('btnCourseEdit-' + c.id);
    if (btnEdit) {
      btnEdit.addEventListener('click', function () { formCourseId = c.id; renderCourseForm(); });
    }
    const btnMemo = document.getElementById('btnMemo-' + c.id);
    if (btnMemo) {
      // 三期 3.1b：课级便签抽屉（单开切换，纯 UI 态）
      btnMemo.addEventListener('click', function () { onMemoCourseToggle(c.id); });
    }
    const btnArc = document.getElementById('btnCourseArchive-' + c.id);
    if (btnArc) {
      btnArc.addEventListener('click', function () { setCourseStatus(c.id, 'archived'); });
    }
    const btnUn = document.getElementById('btnCourseUnarchive-' + c.id);
    if (btnUn) {
      btnUn.addEventListener('click', function () { setCourseStatus(c.id, 'active'); });
    }
  });
}

/**
 * 归档 / 取消归档：非破坏性操作，不弹窗（R7）。
 * 归档课程的语义约束（附录A §5）：不得出现在任何「新建排课项」候选中——
 * 排课项功能 1.4 才落地，届时直接复用本 status 过滤即可，本轮无候选清单可接。
 */

function setCourseStatus(id, status) {
  const c = state.courses.find(function (x) { return x.id === id; });
  if (!c) return;
  c.status = status;
  c.updatedAt = nowIso();
  formCourseId = null;
  saveState();
  renderCoursePanel();
}

/** 渲染新建/编辑课程表单（编辑对象由 formCourseId 决定） */

function renderCourseForm() {
  const wrap = document.getElementById('courseFormWrap');
  if (!wrap) return;

  const editing = formCourseId
    ? state.courses.find(function (c) { return c.id === formCourseId; })
    : null;
  if (formCourseId && !editing) { formCourseId = null; renderCoursePanel(); return; }

  const course = editing || {
    name: '', typeId: 'theory', defaultLocation: '', classes: '', notes: ''
  };
  const typeId = normalizeTypeId(course.typeId);

  // 色板选择器（插单 1.13）：新建默认「自动分配」；编辑态预填当前色（调色板外脏值回落自动兜底）。
  // 仅输出 COURSE_PALETTE 常量色值，无自由色值输入口；渲染侧仍走 safeColor 白名单，防线不破。
  const colorIdx = editing ? COURSE_PALETTE.indexOf(editing.color) : -1;
  const autoChecked = editing ? colorIdx < 0 : true;
  const colorPickerHtml =
    '<fieldset class="field full">' + '<legend>课程颜色（默认自动分配，可点选覆盖；只能从调色板中选择）</label>' +
      '<div class="color-picker">' +
        '<label class="break-chip"><input type="radio" name="courseFormColor" ' +
          'id="courseColor-auto" value="auto"' + (autoChecked ? ' checked' : '') +
          '><span>自动</span></label>' +
        COURSE_PALETTE.map(function (hex, i) {
          const chk = (!autoChecked && i === colorIdx) ? ' checked' : '';
          return '<label class="color-swatch"><input type="radio" name="courseFormColor" ' +
            'id="courseColor-' + i + '" value="' + hex + '"' + chk + '>' +
            '<span class="swatch" style="background:' + hex + '"></span></label>';
        }).join('') + '</div>' + '</fieldset>';

  const options = state.courseTypes.map(function (t) {
    const sel = t.id === typeId ? ' selected' : '';
    return '<option value="' + escapeHtml(t.id) + '"' + sel + '>' + escapeHtml(t.name) + '</option>';
  }).join('');

  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>' + (editing ? '编辑课程' : '新建课程') + '</h3>' +
      '<form id="courseForm" class="cal-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field full">' +
            '<label for="courseFormName">课程名称</label>' +
            '<input id="courseFormName" type="text" maxlength="40" aria-required="true" aria-describedby="courseFormError" value="' +
              escapeHtml(course.name) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="courseFormType">课程类型</label>' +
            '<select id="courseFormType">' + options + '</select>' +
          '</div>' +
          colorPickerHtml +
          '<div class="field">' +
            '<label for="courseFormLocation">默认地点</label>' +
            '<input id="courseFormLocation" type="text" maxlength="40" value="' +
              escapeHtml(course.defaultLocation) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="courseFormClasses">授课班级</label>' +
            '<input id="courseFormClasses" type="text" maxlength="60" value="' +
              escapeHtml(course.classes) + '">' +
          '</div>' +
          '<div class="field full">' +
            '<label for="courseFormNotes">备注</label>' +
            '<input id="courseFormNotes" type="text" maxlength="200" value="' +
              escapeHtml(course.notes) + '">' +
          '</div>' +
        '</div>' +
        '<p class="hint-line">颜色默认自动分配、可点选覆盖（仅调色板八色）；课程类型用于分类展示与结算规则系数。</p>' +
        '<div class="form-error" id="courseFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">' +
            (editing ? '保存修改' : '创建课程') + '</button>' +
          '<button type="button" class="btn-sec" id="courseFormCancel">取消</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const courseFormEl = document.getElementById('courseForm');
  courseFormEl.addEventListener('submit', onCourseSubmit);
  courseFormEl.addEventListener('input', function () { courseFormEl.__submitting = false; });
  document.getElementById('courseFormCancel').addEventListener('click', function () {
    formCourseId = null;
    renderCoursePanel();
  });
  clearFormInvalid(['courseFormName', 'courseFormLocation', 'courseFormClasses', 'courseFormNotes']);   // 四期⑦
}

/**
 * 课程表单提交：仅课程名必填；typeId 经 normalizeTypeId 防篡改回退 theory；
 * 新建时按创建顺序循环分配调色板颜色；编辑保留 id/createdAt/status/color。
 */

function onCourseSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const name = document.getElementById('courseFormName').value.trim();
  const typeId = normalizeTypeId(document.getElementById('courseFormType').value);
  const location = document.getElementById('courseFormLocation').value.trim();
  const classes = document.getElementById('courseFormClasses').value.trim();
  const notes = document.getElementById('courseFormNotes').value.trim();
  const errBox = document.getElementById('courseFormError');

  if (!name) { formErrorAt(errBox, '请填写课程名称。', 'courseFormName'); return; }

  // W4-C #51（问题列表裁决 #51 部分采纳·最小边界）：课程精确重名硬拦截——编辑态排除自身；
  // 人话文案并给可操作路径（改名区分或回去编辑原课程）
  if (state.courses.some(function (c) { return c.id !== formCourseId && c.name === name; })) {
    formErrorAt(errBox, '已有同名课程「' + name + '」。请换个名字区分（如加班级或学期后缀），' +
      '或到课程列表编辑原课程。', 'courseFormName'); return;
  }

  // 色板取值（插单 1.13）：提交端白名单——仅接受 COURSE_PALETTE 内色值；
  // 未选/篡改一律回落「自动分配」（新建按创建顺序位次，编辑按课程位次）
  let colorPick = null;
  for (let i = 0; i < COURSE_PALETTE.length; i++) {
    const r = document.getElementById('courseColor-' + i);
    if (r && r.checked) { colorPick = r.value; break; }
  }
  if (colorPick && COURSE_PALETTE.indexOf(colorPick) < 0) colorPick = null;
  const colorAutoEl = document.getElementById('courseColor-auto');
  const colorAutoChecked = !!(colorAutoEl && colorAutoEl.checked);

  const ts = nowIso();
  if (formCourseId) {
    const c = state.courses.find(function (x) { return x.id === formCourseId; });
    if (!c) { formCourseId = null; renderCoursePanel(); return; }
    c.name = name;
    c.typeId = typeId;
    c.defaultLocation = location;
    c.classes = classes;
    c.notes = notes;
    // 手选色落库；选「自动」或原色已脏（调色板外）→ 回落位次调色板色；否则保持原色
    if (colorPick) c.color = colorPick;
    else if (colorAutoChecked || COURSE_PALETTE.indexOf(c.color) < 0) {
      c.color = paletteAutoColor(state.courses.indexOf(c));
    }
    c.updatedAt = ts;
  } else {
    state.courses.push({
      id: nextId('c'),
      name: name,
      typeId: typeId,
      defaultLocation: location,
      classes: classes,
      color: colorPick || paletteAutoColor(state.courses.length),   // 手选覆盖，默认仍按创建顺序自动分配（插单 1.13）
      notes: notes,
      status: 'active',
      createdAt: ts,
      updatedAt: ts
    });
  }

  formCourseId = null;
  saveState();
  renderCoursePanel();
}

/* ============================================================
   四之三乙、资料库·课级便签（三期 3.1b，附录A §10 memos 首写；
   v1.42 拍板①–⑤，授权 AI 按建议裁决，升版随用户指令）：
    ① 形态：课程卡内行内展开抽屉（列表 + 底部新增框），按创建时间倒序，纯文本；
    ② CRUD 仅新增 / 删除二件套（删除弹窗确认 R7），不做编辑（错了删了重写，C2 最小）；
    ③ 抽屉单开（uiMemoCourseId 纯 UI 态，随 resetTodayUi 复位）；
    ④ text 上限 200 字、trim 后必填（超长防御性截断）；
    ⑤ 归档课程：便签列表照常显示（历史事实），抽屉不渲染新增框（与 §5 归档语义一致）。
   R4：memos 为附录A §10 既有表，本轮纯启用——只写数据与 UI，零结构改动零迁移；
   id 走 nextId('m') 全实体共计数器（附录A §11，D7）；1.14 起 liftCounterGlobal 已扫
   memos 表防撞号；instanceId 暂不开放（v1.41 拍板③），恒 null；脏 id 沿用 1.15 防线。
   ============================================================ */

/** 便签按钮：单开切换抽屉（纯 UI 态，不碰数据；拍板③） */

function onMemoCourseToggle(courseId) {
  uiMemoCourseId = (uiMemoCourseId === courseId) ? null : courseId;
  renderCoursePanel();
}

/** 抽屉渲染：memoDrawerWrap 行内展开；复用 cal-form-card / today-line / btn-sec 体系（零新增样式，R3） */

function renderMemoDrawer() {
  const wrap = document.getElementById('memoDrawerWrap');
  if (!wrap) return;
  if (!uiMemoCourseId) { wrap.innerHTML = ''; return; }
  const course = state.courses.find(function (c) { return c.id === uiMemoCourseId; });
  if (!course) { uiMemoCourseId = null; wrap.innerHTML = ''; return; }   // 课程悬空兜底：收起
  const isActive = course.status === 'active';
  const list = state.memos
    .filter(function (m) { return m.courseId === course.id; })
    .sort(function (a, b) {   // 创建时间倒序（ISO 串字典序即时间序），最新在前；
      // id 降序兜底：同一毫秒内连记多条时 createdAt 相同，按发号序新者在前
      return String(b.createdAt || '').localeCompare(String(a.createdAt || '')) ||
        String(b.id).localeCompare(String(a.id));
    });
  const rows = list.length
    ? list.map(function (m) {
        const safe = isSafeElId(m.id);   // 1.15 防线：脏 id 不渲染删除按钮（绑定层同步跳过）
        return '<div class="today-line">' +
          '<div class="today-main">' +
            '<div class="today-name" style="font-weight:400">' + escapeHtml(m.text) + '</div>' +
            '<div class="today-meta">' +
              escapeHtml(String(m.createdAt || '').slice(0, 10)) + '</div>' +
          '</div>' +
          (safe ? '<button type="button" class="btn-danger" id="btnMemoDel-' +
            escapeHtml(m.id) + '">删除</button>' : '') +
        '</div>';
      }).join('')
    : '<div class="today-empty">暂无便签。</div>';
  // 拍板⑤：归档课程只读——列表照常显示，不渲染新增框
  const addForm = isActive
    ? '<form id="memoForm" class="cal-form" novalidate>' +
        '<div class="field" style="margin-bottom:8px">' +
          '<label for="memoText">新增便签（200 字内，纯文本）</label>' +
          '<input id="memoText" type="text" maxlength="200" autocomplete="off" aria-required="true" aria-describedby="memoFormError">' +
        '</div>' +
        '<div class="form-error" id="memoFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">添加便签</button>' +
          '<button type="button" class="btn-sec" id="memoDrawerClose">收起</button>' +
        '</div>' +
      '</form>'
    : '<p class="form-hint">该课程已归档：便签仅供查阅，如需新增请先取消归档。</p>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn-sec" id="memoDrawerClose">收起</button></div>';

  wrap.innerHTML =
    '<div class="cal-form-card" style="margin-bottom:16px">' +
      '<h3>课程便签 · ' + escapeHtml(course.name) +
        (isActive ? '' : ' <span class="badge-archived">已归档</span>') + '</h3>' +
      rows +
      '<div style="margin-top:12px">' + addForm + '</div>' +
    '</div>';

  const closeBtn = document.getElementById('memoDrawerClose');
  if (closeBtn) closeBtn.addEventListener('click', function () { onMemoCourseToggle(course.id); });
  const form = document.getElementById('memoForm');
  if (form) form.addEventListener('submit', function (ev) { onMemoSubmit(course.id, ev); });
  list.forEach(function (m) {
    if (!isSafeElId(m.id)) return;
    const btn = document.getElementById('btnMemoDel-' + m.id);
    if (btn) btn.addEventListener('click', function () { onMemoDeleteClick(m.id); });
  });
}

/**
 * 便签新增（拍板④）：text trim 后必填、上限 200 字（超长防御性截断）；courseId 锁当前抽屉
 * 课程、instanceId 恒 null（v1.41 拍板③）；nextId('m') 发号（附录A §11，D7）→ saveState →
 * 刷新抽屉（保持展开）→ 横幅汇报（R7 不弹窗）。归档课程无可新增入口（拍板⑤，双保险）。
 */

function onMemoSubmit(courseId, ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const course = state.courses.find(function (c) { return c.id === courseId; });
  if (!course || course.status !== 'active') return;
  const errBox = document.getElementById('memoFormError');
  const raw = (document.getElementById('memoText') || {}).value || '';
  const text = String(raw).trim().slice(0, 200);
  if (!text) {
    formErrorAt(errBox, '请填写便签内容（200 字内）。', 'memoText');
    return;
  }
  state.memos.push({
    id: nextId('m'),
    courseId: courseId,
    instanceId: null,
    text: text,
    createdAt: nowIso()
  });
  saveState();
  renderCoursePanel();
  showBanner('便签已添加到「' + course.name + '」。', 'success');
}

/** 便签删除（拍板②）：不可逆 → 原生弹窗确认（R7）；确认后移除 + saveState + 横幅汇报 */

function onMemoDeleteClick(memoId) {
  const memo = state.memos.find(function (m) { return m.id === memoId; });
  if (!memo) return;
  // 四期⑦：confirm 四散收口 confirmDelete（人话文案 = 对象 + 不可恢复 + 级联范围）；
  // W4-D：动作收进确认回调——外部测试桩 / 沙盒路径同步执行（断言时序基石），原生环境弹层确认后执行
  confirmDelete('删除该便签后不可恢复，确定删除？', function () {
    state.memos = state.memos.filter(function (m) { return m.id !== memoId; });
    saveState();
    renderCoursePanel();
    showBanner('便签已删除。如需恢复，请从 JSON 备份经「数据」面板合并导入。', 'success');
  });
}

/* ============================================================
   四之四、排课项管理面板（一期 1.4）
   能力：为课程挂排课项（星期 + 节次区间 + 周次模式 + 地点 + 名义学时）、编辑。
   约束：calendarId 一律取当前校历，UI 不暴露选择（附录A §6）；
        location 空则回落 courses.defaultLocation——渲染时回落，不写入（附录A §6）；
        仅 status="active" 的课程可挂新排课项（附录A §5，1.3 归档语义）；
        weekPattern 双层结构：kind+startWeek+endWeek 为再生参数，weeks[] 为权威（Q1）；
        单双周基期固定「第 1 周 = 奇周」（B.1 已冻结，不开放编辑）；
        本期不触发流水展开（1.5 展开引擎的事），落库 entries 即完成；
        不提供删除：排课项归属是历史事实（D1），如需删除语义另行与用户确认（C8）。
   ============================================================ */

/** 排课项表单当前编辑对象 id：null = 新建模式 */

let formEntryId = null;

/** 复制排课项预填模板（插单 1.24）：仅新建表单预填用，提交/取消/切换视图即清空；纯 UI 态不入数据 */

let entryPrefill = null;

/* W4-E 拍板⑥（#150 立项试点）：排课项「地点」单字段行内编辑对象 id（null = 无编辑态）。
   负向锁定组——同表单编辑态惯例不入复位声明表；Esc / 打开主编辑表单 / 复制 / 删除该排课项
   时同步清场；仅试点地点单字段，不做其他字段行内编辑、不抽象通用框架（拍板 C4）。 */
let uiEntryLocId = null;

/** 「重新展开」影响预览态（插单 1.17）：previewExpandImpact 干跑模型缓存，纯 UI 态不入数据 */

let uiExpandPreview = null;

function periodOptionsHtml(selected, maxPeriod) {
  const max = (Number.isInteger(maxPeriod) && maxPeriod >= 1) ? maxPeriod : 12;
  let html = '';
  for (let p = 1; p <= max; p++) {
    html += '<option value="' + p + '"' + (p === selected ? ' selected' : '') +
      '>第 ' + p + ' 节</option>';
  }
  return html;
}

/**
 * 自定义周次点阵（三期 3.1d：chips → 点阵选择器，纯 UI 体验强化）：
 * 每周一枚圆点（10 列一行，totalWeeks ≤30 最多 3 行），点内周号、悬停 title 提示；
 * 选中 = 实心底（主色），未选 = 空心。隐藏 checkbox 与取值口完全沿用 1.4 既有契约
 * （id="entryWeek-W" value="W" checked、collectEntryWeeks 升序收集）——基线断言
 * 零改写的结构基石；weeks[] 权威语义不变（Q1，R4 零迁移）。
 */

function entryWeekChipsHtml(totalWeeks, selected) {
  let html = '<div class="weekmatrix">';
  for (let w = 1; w <= totalWeeks; w++) {
    const checked = selected.indexOf(w) >= 0 ? ' checked' : '';
    html += '<label class="week-dot"><input type="checkbox" id="entryWeek-' + w +
      '" value="' + w + '"' + checked + '><span title="第 ' + w + ' 周">' + w + '</span></label>';
  }
  return html + '</div>';
}

/** 点阵已选计数回显（3.1d 纯 UI）：「已选 N 周」小字；点阵初渲 / 模式往返重渲后调用，不碰数据 */

function updateEntryWeekCount() {
  const cal = getActiveCalendar();
  const el = document.getElementById('entryWeekCount');
  if (!el || !cal) return;
  el.textContent = '（已选 ' + collectEntryWeeks(cal.totalWeeks).length + ' 周）';
}

/** 收集自定义模式勾选的周（chips 由 totalWeeks 生成，天然在界内且升序） */

function collectEntryWeeks(totalWeeks) {
  const out = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const box = document.getElementById('entryWeek-' + w);
    if (box && box.checked) out.push(w);
  }
  return out;
}

/**
 * 自定义点阵种子重建（四期⑥，B.9-3.5 / B.10-2.11）：切回「自定义」时——
 * 已勾选周 ∩ 当前规律范围（lastRegularKind × 范围输入）求交重建：范围改小后不再携带
 * 范围外旧勾选（消除种子周不一致）；交集为空或原本无勾选 → 回落当前规律范围全周；
 * 范围输入非法时保留已勾选（编辑态原 weeks 不丢）。纯函数，沙盒可直测。
 */

function entryCustomSeed(totalWeeks, checked, kind, s, e) {
  let pat = [];
  if (Number.isInteger(s) && Number.isInteger(e) &&
      s >= 1 && e <= totalWeeks && s <= e) {
    pat = buildPatternWeeks(kind, s, e);
  }
  if (!checked.length || !pat.length) return pat.length ? pat : checked.slice();
  const pset = {};
  pat.forEach(function (w) { pset[w] = true; });
  const inter = checked.filter(function (w) { return pset[w]; });
  return inter.length ? inter : pat;
}

/** 排课项面板：列表按课程分组（组序 = 课程创建顺序，组内按星期、节次排序） */

function renderEntryPanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head">' +
          '<h2>排课项管理</h2>' +
          '<div class="panel-head-ops">' +
            '<input id="entrySearch" type="text" class="panel-search" placeholder="搜索课程/地点" aria-label="搜索课程或地点" autocomplete="off" enterkeyhint="search" value="' +
              escapeHtml(uiEntrySearch) + '">' +
            // W4-F（UX #18）：搜索结果数角标（局部刷新，不整面板重渲）
            '<span class="factor-hint" id="entrySearchCount"></span>' +
            '<button type="button" class="btn-sec" id="btnExpandAll">重新展开</button>' +
            '<button type="button" class="btn-sec" id="btnPasteImport"' +
              ' style="margin-left:8px" aria-expanded="' + (uiPasteOpen ? 'true' : 'false') + '" aria-controls="pasteImportWrap">粘贴导入</button>' +
            '<button type="button" class="btn-primary btn-auto" id="btnNewEntry"' +
              ' style="margin-left:8px">新建排课项</button>' +
          '</div>' +
        '</div>' +
        // 四期④c（B.10-2.10）：自动/手动展开关系常驻一句，消除「校历改了流水为何没变」疑惑
        '<p class="form-hint">保存排课项后即自动生成上课记录；校历的起始日 / 总周数 / 停课周' +
          '变更后不会自动改动记录，请点上方「重新展开」手动同步——先预览影响、确认后才执行' +
          '（两步走，手动改动过的与手动补课记录不受影响）。</p>' +
        '<div id="entryFormWrap"></div>' +
        '<div id="pasteImportWrap"></div>' +
        '<div id="expandPreviewWrap"></div>' +
        '<div id="entryListWrap">' + entryGroupsHtml(cal) + '</div>' +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  document.getElementById('btnNewEntry').addEventListener('click', function () {
    formEntryId = null;
    entryPrefill = null;   // 插单 1.24：「新建排课项」不受复制模板污染
    renderEntryForm();
  });
  // 校历结构变更（起始日/总周数/停课周）后的手动同步口（方案 3；幂等 + 冻结保护）
  // 插单 1.17：两步走——先干跑预览（零写入），用户确认后才真正执行（R2 精神延伸到引擎操作）
  document.getElementById('btnExpandAll').addEventListener('click', onExpandPreviewClick);

  // 1.9 粘贴导入：展开/收起粘贴区（纯 UI 态切换，不碰数据）
  var btnPaste = document.getElementById('btnPasteImport');
  if (btnPaste) {
    btnPaste.addEventListener('click', function () {
      uiPasteOpen = !uiPasteOpen;
      if (!uiPasteOpen) { uiPasteParsed = null; uiPasteError = ''; }
      renderEntryPanel();
    });
  }
  renderPasteArea(cal);
  renderExpandPreview();
  /** 排课卡片操作区绑定（含空态主操作按钮；搜索局部重渲染后复用，R5 伴生物同步抽取） */
  function bindEntryCardActionBtns() {
    state.entries.forEach(function (en) {
    if (en.calendarId !== cal.id) return;
    if (!isSafeElId(en.id)) return;   // 1.15 子项③：脏 id 不绑定
    const btnCopy = document.getElementById('btnEntryCopy-' + en.id);
    if (btnCopy) {
      // 插单 1.24：复制排课项——模板带入表单（新建模式预填，不立即落库）
      btnCopy.addEventListener('click', function () {
        uiEntryLocId = null;   // W4-E 拍板⑥：进复制预填即弃地点编辑态（防双编辑态并存）
        onEntryCopyClick(en.id);
      });
    }
    const btnEdit = document.getElementById('btnEntryEdit-' + en.id);
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        uiEntryLocId = null;   // W4-E 拍板⑥：进主编辑表单即弃地点编辑态
        formEntryId = en.id;
        renderEntryForm();
      });
    }
    // W4-E 拍板⑥（#150 试点）：地点行内编辑三件套绑定（脏 id 已由上方防线跳过）
    const btnLoc = document.getElementById('btnEntryLoc-' + en.id);
    if (btnLoc) {
      btnLoc.addEventListener('click', function () {
        uiEntryLocId = (uiEntryLocId === en.id) ? null : en.id;   // 单开切换
        renderEntryPanel();
      });
    }
    const locForm = document.getElementById('entryLocForm-' + en.id);
    if (locForm) {
      locForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        onEntryLocSaveClick(en.id);
      });
    }
    const locCancel = document.getElementById('btnEntryLocCancel-' + en.id);
    if (locCancel) {
      locCancel.addEventListener('click', function () {
        uiEntryLocId = null;   // 取消零写入
        renderEntryPanel();
      });
    }
    const btnDel = document.getElementById('btnEntryDelete-' + en.id);
    if (btnDel) {
      // 插单 1.23：删除排课项（甲级联硬删，R7 弹窗确认前置）
      btnDel.addEventListener('click', function () { onEntryDeleteClick(en.id); });
    }
    });
  }
  bindEntryCardActionBtns();
  // 四期⑨ + W4-F（UX #18）：排课搜索 → 仅局部重渲染列表（输入焦点不丢）＋结果数角标；
  // Esc 清空并复位（无匹配文案走 entryGroupsHtml 既有口径）
  const entrySearchEl = document.getElementById('entrySearch');
  if (entrySearchEl) {
    const refreshEntryListW4F = function () {
      uiEntrySearch = entrySearchEl.value;
      var listWrap = document.getElementById('entryListWrap');
      if (!listWrap) return;
      listWrap.innerHTML = entryGroupsHtml(getActiveCalendar());
      bindEntryCardActionBtns();
      var cntEl = document.getElementById('entrySearchCount');
      if (cntEl) {
        var tW4F = String(uiEntrySearch || '').trim();
        if (!tW4F) { cntEl.textContent = ''; return; }
        var calW4F = getActiveCalendar();
        var cnW4F = state.entries.filter(function (en) {
          if (en.calendarId !== calW4F.id) return false;
          var cW4F = state.courses.find(function (x) { return x.id === en.courseId; });
          return (cW4F ? cW4F.name : '').indexOf(tW4F) >= 0 ||
            String(en.location || '').indexOf(tW4F) >= 0;
        }).length;
        cntEl.textContent = '匹配 ' + cnW4F + ' 条排课项';
      }
    };
    entrySearchEl.addEventListener('input', refreshEntryListW4F);
    entrySearchEl.addEventListener('keydown', function (ev) {
      if (!ev || ev.key !== 'Escape') return;
      uiEntrySearch = '';
      entrySearchEl.value = '';
      refreshEntryListW4F();
      if (typeof entrySearchEl.blur === 'function') entrySearchEl.blur();
    });
  }
}

/**
 * 「重新展开」两步走（插单 1.17，B.6 #8）：点按钮先干跑预览（previewExpandImpact 纯函数，
 * 零写入）并渲染预览卡；「确认执行」才真正 expandEntries + saveState + 横幅汇报实际影响数
 * （R7 不弹窗）；「取消」丢弃预览模型，全程零写入（R2 预览确认铁律延伸到引擎操作）。
 */

function onExpandPreviewClick() {
  uiExpandPreview = previewExpandImpact();
  renderEntryPanel();
}

function onExpandConfirmClick() {
  if (!uiExpandPreview) return;
  const p = uiExpandPreview;   // 预览与执行共用 buildExpandPlan 计划层，计数即实际影响数
  expandEntries();
  uiExpandPreview = null;
  saveState();
  renderEntryPanel();
  showBanner('重新展开完成：新增 ' + p.add + '、更新 ' + p.update + '、移除 ' + p.remove +
    ' 条；冻结 ' + p.frozenSkip + ' 条与补课 ' + p.manualKeep + ' 条未受影响。', 'success');
}

function onExpandCancelClick() {
  uiExpandPreview = null;   // 丢弃干跑模型，数据层零写入
  renderEntryPanel();
}

/** 重新展开影响预览卡（复用 cal-form-card / import-preview / paste-badge 既有体系，R3 风格一致）：
 *  五类影响计数表 + 校历结构变更越界清单（badge-warn 标黄，只提示不拒收）+ 确认/取消 */

function renderExpandPreview() {
  const wrap = document.getElementById('expandPreviewWrap');
  if (!wrap) return;
  if (!uiExpandPreview) { wrap.innerHTML = ''; return; }
  const p = uiExpandPreview;
  const row = function (label, n) {
    return '<tr><td>' + label + '</td><td>' + n + '</td></tr>';
  };
  let oobHtml = '';
  if (p.outOfBounds.length) {
    oobHtml = '<div class="form-hint" style="margin-top:10px">越界提示（引擎将丢弃越界部分，' +
      '排课项本身保留，请编辑修正）：</div><div class="import-preview"><table><tbody>' +
      p.outOfBounds.map(function (o) {
        return '<tr><td>' + escapeHtml(o.courseName) + ' · ' + escapeHtml(o.weekdayText) +
          ' · 第 ' + escapeHtml(o.periodsText) + ' 节</td><td>' +
          (o.badWeeks.length
            ? '<span class="paste-badge badge-warn">越界周：' +
              o.badWeeks.join('、') + '</span>'
            : '') +
          (o.periodOverflow
            ? '<span class="paste-badge badge-warn">节次越界（该校历共 ' + o.periodMax + ' 节）</span>'
            : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  wrap.innerHTML =
    '<div class="cal-form-card paste-card">' +
      '<h3>重新展开影响预览（预览不产生任何改动，确认后才执行）</h3>' +
      '<div class="import-preview"><table>' +
        '<thead><tr><th scope="col">影响项</th><th scope="col">数量</th></tr></thead><tbody>' +
        row('新增授课流水', p.add) +
        row('同步更新（自动生成的记录）', p.update) +
        row('移除记录（周次收缩 / 新增停课周）', p.remove) +
        row('跳过（人工改动过的记录保留）', p.frozenSkip) +
        row('手动补课不受影响', p.manualKeep) +
        (p.orphanKeep ? row('校历异常保留（无法评估不删除）', p.orphanKeep) : '') +
        '</tbody></table></div>' +
      // 四期⑦（B.9-2.2）：移除明细清单（课程名 + 原日期，升序，前 20 条 + 「等 N 条」收口）——
      // 评审原文痛点「删了不知道删了什么」；复用 import-preview 体系，零新增样式
      ((p.removeDetails && p.removeDetails.length)
        ? '<div class="form-hint" style="margin-top:10px">将移除以下授课流水（' +
          p.remove + ' 条，按课程名与日期升序）：</div>' +
          '<div class="import-preview"><table><tbody>' +
          p.removeDetails.slice(0, 20).map(function (d) {
            return '<tr><td>' + escapeHtml(d.courseName) + '</td><td>' +
              escapeHtml(d.date) + '</td></tr>';
          }).join('') +
          (p.removeDetails.length > 20
            ? '<tr><td colspan="2">等 ' + p.removeDetails.length + ' 条</td></tr>' : '') +
          '</tbody></table></div>'
        : '') +
      oobHtml +
      '<div class="form-actions" style="margin-top:12px">' +
        '<button type="button" class="btn-primary btn-auto" id="btnExpandConfirm">确认执行重新展开</button>' +
        '<button type="button" class="btn-sec" id="btnExpandCancel">取消</button>' +
      '</div>' +
    '</div>';
  document.getElementById('btnExpandConfirm').addEventListener('click', onExpandConfirmClick);
  document.getElementById('btnExpandCancel').addEventListener('click', onExpandCancelClick);
}

/** 排课项分组列表：空 → 引导空状态；卡片复用 cal-card 体系；地点空串回落课程默认地点（渲染时回落，不写入） */

function entryGroupsHtml(cal) {
  const term = String(uiEntrySearch || '').trim();   // 四期⑨：面板头搜索（课程名/地点，客户端过滤）
  const courseNameOf = function (cid) {
    const c = state.courses.find(function (x) { return x.id === cid; });
    return c ? c.name : '';
  };
  const calEntries = state.entries.filter(function (en) {
    if (en.calendarId !== cal.id) return false;
    if (!term) return true;
    return courseNameOf(en.courseId).indexOf(term) >= 0 ||
      String(en.location || '').indexOf(term) >= 0;
  });
  if (!calEntries.length) {
    return emptyStateHtml(term
      ? '没有匹配「' + escapeHtml(term) + '」的排课项（按课程名/地点过滤）。'
      : '当前校历还没有排课项。下一步：先在「课程」面板创建课程，再点面板右上角「新建排课项」安排上课规律。',
      '', ICON_GRID);
  }
  return state.courses.map(function (c) {
    const list = calEntries.filter(function (en) { return en.courseId === c.id; })
      .sort(function (a, b) { return a.weekday - b.weekday || a.periodStart - b.periodStart; });
    if (!list.length) return '';
    const cards = list.map(function (en) {
      const periodsText = en.periodStart === en.periodEnd
        ? '第 ' + en.periodStart + ' 节'
        : '第 ' + en.periodStart + '-' + en.periodEnd + ' 节';
      const locText = en.location || c.defaultLocation || '地点未定';
      const clsText = en.classes || c.classes;   // 插单 1.22 回落链：entry → course → 空
      return (
        '<div class="cal-card">' +
          '<span class="course-dot" style="background:' + safeColor(c.color) + '"></span>' +
          '<div class="cal-card-main">' +
            '<div class="cal-card-name">' + WEEKDAY_NAMES[en.weekday - 1] + ' · ' + periodsText + '</div>' +
            '<div class="cal-card-meta">' + weekPatternText(en.weekPattern) + ' · ' +
              escapeHtml(locText) +
              (clsText ? ' · ' + escapeHtml(clsText) : '') +
              ' · ' + en.hoursPerSession + ' 学时/次</div>' +
          '</div>' +
          '<div class="cal-card-actions">' +
            (isSafeElId(en.id)
              ? (uiEntryLocId === en.id
                // W4-E 拍板⑥：地点行内编辑展开态——单输入框 + 保存/取消（复用 btn-sec 体系，R3）
                ? '<form id="entryLocForm-' + escapeHtml(en.id) +
                  '" class="entry-loc-form" novalidate>' +
                  '<input id="entryLocInput-' + escapeHtml(en.id) +
                  '" class="entry-loc-input" type="text" maxlength="40" value="' +
                  escapeHtml(en.location) + '" aria-label="上课地点">' +
                  '<button type="submit" class="btn-primary btn-auto">保存</button>' +
                  '<button type="button" class="btn-sec" id="btnEntryLocCancel-' +
                  escapeHtml(en.id) + '">取消</button></form>'
                : '<button type="button" class="btn-sec" id="btnEntryCopy-' +
                escapeHtml(en.id) + '">复制</button>' +
                '<button type="button" class="btn-sec" id="btnEntryEdit-' +
                escapeHtml(en.id) + '">编辑</button>' +
                // W6-6 列表批：单卡操作 >2 收「更多」——改地点/删除收入下拉（复用 W6-3
                // .more-wrap/.more-menu 纯 CSS 体系，触屏点按可用；id/class 串与绑定逐字保留，
                // 只改排布不改事件链；菜单项样式由 .more-menu 规则统一接管）
                '<span class="more-wrap"><button type="button" class="btn-sec" id="btnEntryMore-' +
                escapeHtml(en.id) + '">更多 ▾</button>' +
                '<span class="more-menu">' +
                '<button type="button" class="btn-sec" id="btnEntryLoc-' +
                escapeHtml(en.id) + '">改地点</button>' +
                '<button type="button" class="btn-danger" id="btnEntryDelete-' +
                escapeHtml(en.id) + '">删除</button>' +
                '</span></span>')
              : '') +   // 1.15 复审修复：脏 id 不渲染操作按钮（绑定层同步跳过，R5）
          '</div>' +
        '</div>'
      );
    }).join('');
    return '<h3 class="section-subtitle">' + escapeHtml(c.name) +
      '（' + list.length + ' 条排课项）</h3>' + '<div class="cal-list">' + cards + '</div>';
  }).join('');
}

/** 渲染新建/编辑排课项表单（编辑对象由 formEntryId 决定） */

function renderEntryForm() {
  const wrap = document.getElementById('entryFormWrap');
  if (!wrap) return;
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }

  const editing = formEntryId
    ? state.entries.find(function (en) { return en.id === formEntryId; })
    : null;
  if (formEntryId && !editing) { formEntryId = null; renderEntryPanel(); return; }

  // 插单 1.24：复制排课项以模板带入表单默认值（仅预填不落库）；普通新建仍用默认值，行为不变
  const entry = editing || entryPrefillDraft() || {
    courseId: '', weekday: 1, periodStart: 1, periodEnd: 2,
    weekPattern: {
      kind: 'every', startWeek: 1, endWeek: cal.totalWeeks,
      weeks: buildPatternWeeks('every', 1, cal.totalWeeks)
    },
    location: '', hoursPerSession: 2, classes: '', defaultHeadcount: null
  };
  const wp = entry.weekPattern;
  const isCustom = wp.kind === 'custom';

  // 课程归属编辑态不可改（历史事实，D1）：渲染为静态块；新建候选仅开设中课程（附录A §5）
  let courseFieldHtml;
  if (editing) {
    const owner = state.courses.find(function (c) { return c.id === entry.courseId; });
    const ownerName = owner ? owner.name : '（课程已不存在）';
    const ownerColor = safeColor(owner ? owner.color : '');
    courseFieldHtml =
      '<label>课程（创建后不可更改归属）</label>' +
      '<div class="form-static"><span class="course-dot" style="background:' +
        escapeHtml(ownerColor) + '"></span><span>' + escapeHtml(ownerName) + '</span></div>';
  } else {
    const options = state.courses
      .filter(function (c) { return c.status === 'active'; })
      .map(function (c) {
        // 插单 1.24：复制预填时按模板课程选中归属（普通新建无选中 = 首项默认，行为不变）
        const sel = (!editing && entry.courseId === c.id) ? ' selected' : '';
        return '<option value="' + escapeHtml(c.id) + '"' + sel + '>' +
          escapeHtml(c.name) + '</option>';
      }).join('');
    courseFieldHtml =
      '<label for="entryFormCourse">课程（仅开设中的课程可排课）</label>' +
      '<select id="entryFormCourse" aria-required="true" aria-describedby="entryFormError">' + options + '</select>';
  }

  // 课时性质（1.7 增补）：默认空值 = 跟随课程；编辑态预填已选类型
  const selType = entry.typeId || '';   // 插单 1.24：复制预填带课时性质（编辑态/普通新建行为不变）
  const typeFieldHtml =
    '<label for="entryFormType">课时性质（默认跟随课程）</label>' +
    '<select id="entryFormType">' +
      '<option value="">跟随课程</option>' +
      state.courseTypes.map(function (t) {
        const sel = t.id === selType ? ' selected' : '';
        return '<option value="' + escapeHtml(t.id) + '"' + sel + '>' +
          escapeHtml(t.name) + '</option>';
      }).join('') +
    '</select>';

  const kindOptions = Object.keys(WEEK_KIND_NAMES).map(function (k) {
    const sel = k === wp.kind ? ' selected' : '';
    return '<option value="' + k + '"' + sel + '>' + WEEK_KIND_NAMES[k] + '</option>';
  }).join('');

  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>' + (editing ? '编辑排课项' : '新建排课项') + '</h3>' +
      '<form id="entryForm" class="cal-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field full">' + courseFieldHtml + '</div>' +
          '<div class="field">' + typeFieldHtml + '</div>' +
          '<div class="field">' +
            '<label for="entryFormWeekday">星期</label>' +
            '<select id="entryFormWeekday">' +
              WEEKDAY_NAMES.map(function (n, i) {
                const sel = (i + 1) === entry.weekday ? ' selected' : '';
                return '<option value="' + (i + 1) + '"' + sel + '>' + n + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label>节次（起止均含）</label>' +
            '<div class="period-pair">' +
              '<select id="entryFormPeriodStart" aria-label="开始节次">' +
                periodOptionsHtml(entry.periodStart, periodCountOf(cal)) + '</select>' +
              '<span class="pair-sep">至</span>' +
              '<select id="entryFormPeriodEnd" aria-label="结束节次">' +
                periodOptionsHtml(entry.periodEnd, periodCountOf(cal)) + '</select>' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label for="entryFormWeekKind">周次模式（第 1 周 = 奇周）</label>' +
            '<select id="entryFormWeekKind">' + kindOptions + '</select>' +
          '</div>' +
          '<div class="field" id="entryRangeField">' +
            '<label>周次范围</label>' +
            '<div class="period-pair">' +
              '<input id="entryFormWeekStart" type="number" aria-label="开始周次" min="1" max="' + cal.totalWeeks +
                '" value="' + wp.startWeek + '" inputmode="numeric" enterkeyhint="done">' +
              '<span class="pair-sep">至</span>' +
              '<input id="entryFormWeekEnd" type="number" aria-label="结束周次" min="1" max="' + cal.totalWeeks +
                '" value="' + wp.endWeek + '" inputmode="numeric" enterkeyhint="done">' +
            '</div>' +
          '</div>' +
          '<fieldset class="field full" id="entryWeeksField" style="display:' +
            (isCustom ? 'block' : 'none') + '">' +
            '<legend>点选上课周（至少 1 周）<span class="factor-hint" id="entryWeekCount"></span>' +
              '<span class="factor-hint" id="entrySeedHint" style="color:#d64545"></span></legend>' +
            '<div id="entryWeeksGrid">' +
              entryWeekChipsHtml(cal.totalWeeks, isCustom ? wp.weeks : []) +
            '</div>' + '</fieldset>' +
          '<div class="field">' +
            '<label for="entryFormLocation">地点（留空用课程默认地点）</label>' +
            '<input id="entryFormLocation" type="text" maxlength="40" value="' +
              escapeHtml(entry.location) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="entryFormClasses">授课班级（留空跟随课程）</label>' +
            '<input id="entryFormClasses" type="text" maxlength="60" value="' +
              escapeHtml(entry.classes || '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="entryFormHc">默认人数（选填，生成流水时预填人数快照）</label>' +
            '<input id="entryFormHc" type="number" min="0" max="500" inputmode="numeric" enterkeyhint="done" value="' +
              (entry.defaultHeadcount === null || entry.defaultHeadcount === undefined
                ? '' : entry.defaultHeadcount) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="entryFormHours">单次名义学时</label>' +
            '<input id="entryFormHours" type="number" min="0.5" step="0.5" aria-required="true" aria-describedby="entryFormError" value="' +
              entry.hoursPerSession + '" inputmode="decimal" enterkeyhint="done">' +
          '</div>' +
        '</div>' +
        '<p class="hint-line">排课项挂到当前校历「' + escapeHtml(cal.name) + '」；' +
          '周次不可超出 1–' + cal.totalWeeks + ' 周；保存后将逐周自动生成上课记录。</p>' +
        '<div class="form-error" id="entryFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">' +
            (editing ? '保存修改' : '创建排课项') + '</button>' +
          '<button type="button" class="btn-sec" id="entryFormCancel">取消</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const entryFormEl = document.getElementById('entryForm');
  entryFormEl.addEventListener('submit', onEntrySubmit);
  entryFormEl.addEventListener('input', function () { entryFormEl.__submitting = false; });
  document.getElementById('entryFormCancel').addEventListener('click', function () {
    formEntryId = null;
    entryPrefill = null;   // 插单 1.24：取消即弃复制模板
    renderEntryPanel();
  });
  // 插单 1.24：复制预填落到控件值——innerHTML 的 selected/checked 属性负责真实 DOM 初始态，
  // 此处显式再写一遍 .value/.checked，保证测试沙盒（mock DOM 不解析属性）与改档往返下取值一致
  if (!editing && entryPrefill) applyEntryPrefillToForm(entryPrefill);
  // 模式切换：连续/单/双走范围输入；自定义切换为周 chips，并按此前的规律模式预勾当前范围，减少手动重选
  let lastRegularKind = isCustom ? 'every' : wp.kind;
  document.getElementById('entryFormWeekKind').addEventListener('change', function () {
    const kindEl = document.getElementById('entryFormWeekKind');
    const custom = kindEl.value === 'custom';
    document.getElementById('entryRangeField').style.display = custom ? 'none' : 'block';
    document.getElementById('entryWeeksField').style.display = custom ? 'block' : 'none';
    if (custom) {
      // 四期⑥：种子与当前规律范围求交重建（entryCustomSeed 纯函数）——编辑态原 weeks
      // 在范围输入未改时原样保留（交集即原勾选），范围改小后不再携带范围外旧勾选
      const s0 = parseStrictIntInput(document.getElementById('entryFormWeekStart').value);
      const e0 = parseStrictIntInput(document.getElementById('entryFormWeekEnd').value);
      const seed = entryCustomSeed(cal.totalWeeks,
        collectEntryWeeks(cal.totalWeeks), lastRegularKind, s0, e0);
      document.getElementById('entryWeeksGrid').innerHTML =
        entryWeekChipsHtml(cal.totalWeeks, seed);
      updateEntryWeekCount();   // 3.1d：预勾种子渲染后同步计数
      updateEntrySeedHint();    // W4-C #75：切换后同步范围合法性提示
    } else {
      lastRegularKind = kindEl.value;
    }
  });
  // W4-C #75（问题列表裁决 #75 部分采纳）：自定义模式范围非法时就地提示——与
  // entryCustomSeed 回落口径一致（非法范围保留已勾选周次，修正后重切可全选）
  function updateEntrySeedHint() {
    const hintEl = document.getElementById('entrySeedHint');
    if (!hintEl) return;
    const kindNow = document.getElementById('entryFormWeekKind');
    if (!kindNow || kindNow.value !== 'custom') { hintEl.textContent = ''; return; }
    const s = parseStrictIntInput(document.getElementById('entryFormWeekStart').value);
    const e = parseStrictIntInput(document.getElementById('entryFormWeekEnd').value);
    hintEl.textContent = (Number.isInteger(s) && Number.isInteger(e) &&
        s >= 1 && e <= cal.totalWeeks && s <= e)
      ? ''
      : '　当前周次范围非法（须 1–' + cal.totalWeeks +
        ' 且开始不晚于结束）——已保留已勾选周次；修正范围后重新切换「自定义」可全选。';
  }
  // 3.1d：点阵勾选计数（纯 UI 反馈，change 委托在容器上不逐点绑定，不碰数据）
  const weeksGrid = document.getElementById('entryWeeksGrid');
  if (weeksGrid) weeksGrid.addEventListener('change', updateEntryWeekCount);
  const wsInput = document.getElementById('entryFormWeekStart');
  if (wsInput) wsInput.addEventListener('input', updateEntrySeedHint);
  const weInput = document.getElementById('entryFormWeekEnd');
  if (weInput) weInput.addEventListener('input', updateEntrySeedHint);
  updateEntryWeekCount();
  updateEntrySeedHint();
  clearFormInvalid(['entryFormCourse', 'entryFormWeekday', 'entryFormPeriodStart', 'entryFormPeriodEnd',
    'entryFormWeekStart', 'entryFormWeekEnd', 'entryFormLocation', 'entryFormHours', 'entryFormClasses', 'entryFormHc']);   // 四期⑦
}

/**
 * 排课项表单提交：weekday 1–7；节次上限 = periodCountOf(cal)（插单 1.11，旧为 1–12）且 periodEnd>=periodStart（附录A §6）；
 * weeks[] 在 [1,totalWeeks] 内升序去重（界面生成 + 提交再校验，Q1）；
 * hoursPerSession 必须 > 0；location 允许空串（回落在渲染层）。
 * 编辑保留 id/createdAt/courseId/calendarId（归属是历史事实，D1）。
 */

function onEntrySubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const cal = getActiveCalendar();
  if (!cal) return;
  const errBox = document.getElementById('entryFormError');

  const editing = formEntryId
    ? state.entries.find(function (en) { return en.id === formEntryId; })
    : null;

  let courseId;
  if (editing) {
    courseId = editing.courseId;   // 编辑态不可改课程归属
  } else {
    const courseSel = document.getElementById('entryFormCourse');
    courseId = courseSel ? courseSel.value : '';
    const course = state.courses.find(function (c) { return c.id === courseId; });
    // 防篡改兜底：候选只有 active 课程，但提交时再以数据为准复核一次
    if (!course || course.status !== 'active') {
      formErrorAt(errBox, '请选择课程（归档课程不可新建排课项）。', 'entryFormCourse'); return;
    }
  }

  const weekday = parseStrictIntInput(document.getElementById('entryFormWeekday').value);
  const periodStart = parseStrictIntInput(document.getElementById('entryFormPeriodStart').value);
  const periodEnd = parseStrictIntInput(document.getElementById('entryFormPeriodEnd').value);
  if (!(Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)) {
    formErrorAt(errBox, '星期取值非法。', 'entryFormWeekday'); return;
  }
  if (!(Number.isInteger(periodStart) && Number.isInteger(periodEnd) &&
        periodStart >= 1 && periodEnd <= periodCountOf(cal) && periodStart <= periodEnd)) {
    formErrorAt(errBox, '节次需为 1–' + periodCountOf(cal) +
      '，且结束节次不早于开始节次。', 'entryFormPeriodStart'); return;
  }

  const kind = document.getElementById('entryFormWeekKind').value;
  let startWeek, endWeek, weeks;
  if (kind === 'custom') {
    weeks = collectEntryWeeks(cal.totalWeeks);
    if (!weeks.length) { formErrorAt(errBox, '自定义周次请至少勾选 1 周。', 'entryWeeksGrid'); return; }
    startWeek = weeks[0];
    endWeek = weeks[weeks.length - 1];
  } else {
    startWeek = parseStrictIntInput(document.getElementById('entryFormWeekStart').value);
    endWeek = parseStrictIntInput(document.getElementById('entryFormWeekEnd').value);
    if (!(Number.isInteger(startWeek) && Number.isInteger(endWeek) &&
          startWeek >= 1 && endWeek <= cal.totalWeeks && startWeek <= endWeek)) {
      formErrorAt(errBox, '周次范围需为 1–' + cal.totalWeeks + '，且开始不晚于结束。', 'entryFormWeekStart'); return;
    }
    weeks = buildPatternWeeks(kind, startWeek, endWeek);
    if (!weeks.length) {
      formErrorAt(errBox, '这个周数范围内没有符合「' + WEEK_KIND_NAMES[kind] +
        '」的上课周——请调整范围，或改用「自定义」直接勾选上课周。', 'entryFormWeekStart'); return;
    }
  }

  const location = document.getElementById('entryFormLocation').value.trim();
  // 授课班级（插单 1.22）：trim 后可空串——空 = 跟随课程（展示用，不入流水快照）
  const entryClassesVal = document.getElementById('entryFormClasses').value.trim();
  // 四期⑧ 项 4：排课项默认人数（选填）——生成流水瞬间预填人数快照（D3）；留空 = null
  const hcRaw52 = String((document.getElementById('entryFormHc') || {}).value || '').trim();
  let defaultHeadcount = null;
  if (hcRaw52 !== '') {
    const hn = parseStrictIntInput(hcRaw52);
    if (!(Number.isInteger(hn) && hn >= 0 && hn <= 500)) {
      formErrorAt(errBox, '默认人数需为 0–500 的整数，或留空。', 'entryFormHc'); return;
    }
    defaultHeadcount = hn;
  }
  const hours = parseStrictFloatInput(document.getElementById('entryFormHours').value);
  if (!(isFinite(hours) && hours > 0)) {
    formErrorAt(errBox, '单次名义学时需为大于 0 的数字。', 'entryFormHours'); return;
  }

  // 课时性质（选填）：空 = 跟随课程；非法值提交端清洗为 null（防篡改，附录A §5 回退哲学）
  let typeId = null;
  const typeSel = document.getElementById('entryFormType');
  if (typeSel && typeSel.value &&
      state.courseTypes.some(function (t) { return t.id === typeSel.value; })) {
    typeId = typeSel.value;
  }

  // 插单 1.19 第三写点（v1.30 扩充）＋ W1 #13（2026-09-19 问题列表裁决）：新建/编辑两态
  // 均做同星期节次×周次交集扫描——编辑态经 excludeEntryId 排除自身，保存后与他人排课项
  // 相交照样横幅提示（行为变更：编辑态由「不触发」改「排除自身后触发」，落变更记录 v1.69）
  // 插单 1.26 修复 P1-7：冲突软提示扫描失败（脏数据）绝不阻断保存——降级为不提示
  let entryConflict = null;
  try {
    entryConflict = findEntryConflict(weekday, periodStart, periodEnd, weeks,
      editing ? editing.id : null);
  } catch (e1) { entryConflict = null; }
  const ts = nowIso();
  if (editing) {
    editing.weekday = weekday;
    editing.periodStart = periodStart;
    editing.periodEnd = periodEnd;
    editing.weekPattern = { kind: kind, startWeek: startWeek, endWeek: endWeek, weeks: weeks };
    editing.location = location;
    editing.hoursPerSession = hours;
    editing.typeId = typeId;
    editing.classes = entryClassesVal;   // 插单 1.22：可空串（跟随课程）
    editing.defaultHeadcount = defaultHeadcount;   // 四期⑧：仅改排课项定义，不回填已有流水快照
    editing.updatedAt = ts;
  } else {
    state.entries.push({
      id: nextId('e'),
      courseId: courseId,
      calendarId: cal.id,          // 一律取当前校历，UI 不暴露选择（附录A §6）
      weekday: weekday,
      periodStart: periodStart,
      periodEnd: periodEnd,
      weekPattern: { kind: kind, startWeek: startWeek, endWeek: endWeek, weeks: weeks },
      location: location,          // 空串合法：渲染时回落 courses.defaultLocation（不写入）
      hoursPerSession: hours,
      typeId: typeId,              // null = 跟随课程（1.7 增补）
      classes: entryClassesVal,    // 插单 1.22：空串 = 跟随课程（展示用，不入流水快照）
      defaultHeadcount: defaultHeadcount,   // 四期⑧ 项 4：null = 未设默认人数
      createdAt: ts,
      updatedAt: ts
    });
  }

  entryPrefill = null;   // 插单 1.24：复制模板用完即弃
  formEntryId = null;
  expandEntries();   // 方案 3：保存排课项后自动重跑（幂等 + 冻结保护，安全）
  saveState();
  renderEntryPanel();
  // 插单 1.19 第三写点：横幅警告不硬拒（允许故意连排，B.6 #21 精神）
  if (entryConflict) {
    // 四期⑦（B.11-U13）：标出重叠周号便于定位（W6-7 收口 5 个——横幅 ≤40 字拍板）；不硬拒口径不变
    const ow = entryConflict.overlapWeeks || [];
    const owText = ow.length
      ? '（重叠周：' + (ow.length <= 5 ? ow.join('、') : ow.slice(0, 5).join('、') +
        ' 等 ' + ow.length + ' 周') + '）'
      : '';
    showBanner('排课项已保存：与「' + entryConflict.courseName + '」周次重叠' + owText +
      '，允许连排请留意。', 'warn');
  }
}


/* ============================================================
   四之四丙、排课项复制 / 删除 / 新建冲突扫描（插单 1.24 / 1.23 / 1.19 第三写点）
   ============================================================ */

/**
 * 复制排课项（插单 1.24，v1.30 拍板）：以该排课项为模板带入表单——课程/星期/节次/
 * 周次模式（含自定义 weeks[] 勾选态）/地点/学时/课时性质全带入；仅表单预填不立即落库，
 * 用户改后按正常新建提交（nextId 发新 e-id、createdAt 为当下；编辑态语义不受影响）。
 */

function onEntryCopyClick(entryId) {
  const src = state.entries.find(function (en) { return en.id === entryId; });
  if (!src) return;
  entryPrefill = src;
  formEntryId = null;   // 强制新建模式
  renderEntryPanel();
  renderEntryForm();
}

/** 复制预填草稿（插单 1.24）：把模板排课项转成表单默认值对象（新建模式专用，纯函数） */

function entryPrefillDraft() {
  if (!entryPrefill) return null;
  const p = entryPrefill;
  const wp = p.weekPattern || {};
  return {
    courseId: p.courseId,
    weekday: p.weekday,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    weekPattern: {
      kind: wp.kind || 'every',
      startWeek: wp.startWeek,
      endWeek: wp.endWeek,
      weeks: Array.isArray(wp.weeks) ? wp.weeks.slice() : []
    },
    location: p.location,
    hoursPerSession: p.hoursPerSession,
    typeId: p.typeId || null,
    classes: p.classes || '',
    defaultHeadcount: (p.defaultHeadcount === undefined ? null : p.defaultHeadcount)
  };
}

/** 复制预填落控件（插单 1.24）：innerHTML 属性负责真实 DOM 初始态，此处显式写 .value/.checked 兜底 */

function applyEntryPrefillToForm(p) {
  const setVal = function (id, v) {
    const el = document.getElementById(id);
    if (el) el.value = String(v);
  };
  setVal('entryFormWeekday', p.weekday);
  setVal('entryFormPeriodStart', p.periodStart);
  setVal('entryFormPeriodEnd', p.periodEnd);
  setVal('entryFormWeekKind', p.weekPattern.kind);
  setVal('entryFormWeekStart', p.weekPattern.startWeek);
  setVal('entryFormWeekEnd', p.weekPattern.endWeek);
  setVal('entryFormLocation', p.location);
  setVal('entryFormHours', p.hoursPerSession);
  setVal('entryFormType', p.typeId || '');
  setVal('entryFormClasses', p.classes || '');
  setVal('entryFormHc', (p.defaultHeadcount === null || p.defaultHeadcount === undefined)
    ? '' : p.defaultHeadcount);
  if (p.weekPattern.kind === 'custom') {
    (p.weekPattern.weeks || []).forEach(function (w) {
      const box = document.getElementById('entryWeek-' + w);
      if (box) box.checked = true;
    });
  }
}

/**
 * 地点行内编辑保存（W4-E 拍板⑥/#150 试点，唯一写点）：值 trim 后与编辑表单同链——
 * entry.location 更新 + updatedAt 刷新 + expandEntries 自动重展开（非冻结实例快照同步，
 * 冻结/ manual 天然免疫）+ saveState + 横幅汇报。地点变更不产生星期/节次/周次新交集，
 * 不触发冲突扫描（拍板 C3）；留空 = 回落课程默认地点（渲染层回落口径，与编辑表单一致）。
 */
function onEntryLocSaveClick(entryId) {
  const en = state.entries.find(function (x) { return x.id === entryId; });
  if (!en) { uiEntryLocId = null; return; }
  const input = document.getElementById('entryLocInput-' + entryId);
  const loc = input ? String(input.value).trim() : '';
  en.location = loc;
  en.updatedAt = nowIso();
  uiEntryLocId = null;
  expandEntries();   // 与 onEntrySubmit 同链：幂等 + 冻结保护，非冻结实例地点快照同步
  saveState();
  renderEntryPanel();
  showBanner('地点已更新为「' + (loc || '空（跟随课程默认地点）') + '」，流水已自动同步。', 'success');
}

/**
 * 排课项删除（插单 1.23，v1.30 拍板「甲级联硬删」，R7 不可逆场景弹窗确认前置）：
 * 确认后删除该排课项，并级联删除其名下「未冻结」的生成流水（frozen=true 与
 * source=manual 一律保留——人工留痕优先于数据纯净，Q3 精神）；被删排课项的 manual 补课
 * entryId 按附录A §7 语义自然悬空（Q3 规则 3 已兼容，引擎/统计对悬空 entryId 天然容错）。
 * 零 schema 变更（只删数据不删结构，R4）；误删可经 1.14 快照备份 / JSON 导出合回。
 * 删除后自动 expandEntries()（收敛兜底，幂等）+ saveState + 横幅汇报级联计数。
 */

function onEntryDeleteClick(entryId) {
  const en = state.entries.find(function (x) { return x.id === entryId; });
  if (!en) return;
  const gen = state.instances.filter(function (x) {
    return x.entryId === entryId && x.source === 'generated'; });
  const delGen = gen.filter(function (x) { return !x.frozen; }).length;
  const keepFrozen = gen.length - delGen;
  const keepManual = state.instances.filter(function (x) {
    return x.entryId === entryId && x.source === 'manual'; }).length;
  // R7：删除属不可逆操作，弹窗确认并说明级联范围（四期⑦收口 confirmDelete；沙盒无 confirm
  // 视为已确认）；W4-D：动作收进确认回调——桩/沙盒同步执行，原生环境弹层确认后执行
  confirmDelete('删除这条排课安排后，由它自动生成的 ' + delGen +
    ' 条上课记录会一并删除；你已手动改动过的 ' + keepFrozen + ' 条和手动补课的 ' +
    keepManual + ' 条会保留。此操作不可撤销，确定删除？', function () {
    state.entries = state.entries.filter(function (x) { return x.id !== entryId; });
    state.instances = state.instances.filter(function (x) {
      if (x.entryId !== entryId) return true;
      return !(x.source === 'generated' && !x.frozen);   // 未冻结生成流水级联删除
    });
    if (formEntryId === entryId) formEntryId = null;
    if (entryPrefill && entryPrefill.id === entryId) entryPrefill = null;
    if (uiEntryLocId === entryId) uiEntryLocId = null;   // W4-E 拍板⑥：删除即清场行内编辑态
    expandEntries();   // 收敛兜底（幂等 + 冻结保护）：悬空 entryId 的生成流水不会被重建
    saveState();
    renderEntryPanel();
    showBanner('删除排课项完成：生成流水 ' + delGen + ' 条已一并删除；手动改动 ' +
      keepFrozen + ' 条与补课 ' + keepManual + ' 条保留。', 'success');
  });
}

/**
 * 新建排课项冲突检测（插单 1.19 第三写点，v1.30 扩充；纯函数只读）：
 * 判定口径——同校历已存在排课项中，与目标「星期 + 节次区间」相交（start≤end 交叉，
 * 相邻如 3-4 与 5-6 不报）且 weeks[] 与目标 weeks[] 有交集者才报；已展开流水由排课项
 * 派生，扫排课项即覆盖生成流水。返回首个冲突 { entry, courseName }；无冲突 → null。
 */

/**
 * CSV 文件大小上限（W2-B #48，UX 裁决 #238 归并，2026-09-20）：2MB——课表 CSV 远超实际需求；
 * 超限在读文件之前人话拒收，防主线程读取+解码卡顿。mock 环境 file.size 缺失不触发。
 */
const PASTE_CSV_MAX_BYTES = 2 * 1024 * 1024;

function onPasteCsvChosen(ev) {
  var input = ev.target;
  var file = input && input.files && input.files[0];
  if (!file) return;
  // W2-B #48：超大文件前置拦截——零读取、零写入
  if (Number(file.size) > PASTE_CSV_MAX_BYTES) {
    showBanner('CSV 超过 ' + (PASTE_CSV_MAX_BYTES / 1024 / 1024) + 'MB（约 ' +
      Math.round(Number(file.size) / 1024 / 1024 * 10) / 10 +
      'MB），疑似不是课表：请只导出课表区域，或走「粘贴导入」。', 'warn');
    return;
  }
  readCsvFileText(file).then(function (r) {
    if (r.error) { showBanner(r.error); return; }
    // W2-B #47：未闭合引号前置拦截——不吞内容、不填错位文本，人话报错引导检查文件
    if (csvQuoteUnclosed(r.text)) {
      showBanner('CSV 引号未闭合，整份课表将解析错位——本次未填入任何内容，请修正后重试。', 'warn');
      return;
    }
    var ta = document.getElementById('pasteText');
    if (ta) ta.value = r.text;
    uiPasteError = '';
    showBanner('CSV 已读取（' + r.encoding + '，' + r.text.length +
      ' 字符）填入文本域：请核对后点「解析」。', 'success');
  });
}

/** 粘贴导入区 UI 态：展开态 / 解析后的预览模型 / 错误信息（纯 UI 态，不入数据） */

let uiPasteOpen = false;

let uiPasteParsed = null;

let uiPasteError = '';

/** 全半角归一：数字/字母/标点全角转半角（教务系统导出常见全角），全角空格转半角 */

function pasteAreaHtml(cal) {
  if (!uiPasteParsed) {
    return '<div class="cal-form-card paste-card">' +
      '<h3>粘贴导入教务课表</h3>' +
      '<p class="form-hint">从 Excel/PDF 全选课表区域复制（含星期表头与节次首列）后粘贴到下方；' +
        '竖向合并的空节次自动接续上方课程（至多并 2 节，更长连排请预览核对）；同名多行只建一门课程。解析后先预览确认，不会直接写入。</p>' +
      '<div class="data-actions" style="margin-bottom:12px">' +
        '<input type="file" id="pasteCsvFile" accept=".csv,text/csv">' +
        '<span class="factor-hint">支持 UTF-8 / GBK；.xlsx 请另存 CSV 或复制走粘贴</span>' +
      '</div>' +
      '<textarea id="pasteText" class="paste-textarea" placeholder="节次/周次\t星期一\t星期二\t……\n' +
        '第一节\t课程名(代码) 10-19 7号B308(新校区)\t……"></textarea>' +
      (uiPasteError ? '<div class="form-error" role="alert">' + escapeHtml(uiPasteError) + '</div>' : '') +
      '<div class="form-actions">' +
        '<button type="button" class="btn-primary btn-auto" id="btnPasteParse">解析</button>' +
        '<button type="button" class="btn-sec" id="btnPasteClose">收起</button>' +
      '</div></div>';
  }
  var m = uiPasteParsed;
  var rows = m.items.map(function (it, i) {
    var r = it.row;
    var badge = it.status === 'duplicate'
      ? '<span class="paste-badge badge-dup">已存在重复</span>'
      : it.status === 'similar'
      ? '<span class="paste-badge badge-warn">类似已存在</span>'
      : it.status === 'new-course'
      ? '<span class="paste-badge badge-newcourse">待新建课程</span>'
      : '<span class="paste-badge badge-new">新增</span>';
    var courseCell;
    if (it.courseId) {
      var oc = state.courses.find(function (x) { return x.id === it.courseId; });
      courseCell = escapeHtml(oc ? oc.name : r.courseName);
    } else {
      var opts = '<option value="">自动新建「' + escapeHtml(r.courseName) + '」</option>' +
        state.courses.filter(function (x) { return x.status === 'active'; }).map(function (x) {
          return '<option value="' + escapeHtml(x.id) + '">归入：' + escapeHtml(x.name) + '</option>';
        }).join('');
      courseCell = '<select id="pasteAssign-' + i + '" class="paste-assign">' + opts + '</select>';
    }
    return '<tr>' +
      '<td><input type="checkbox" id="pastePick-' + i + '"' + (it.checked ? ' checked' : '') + '></td>' +
      '<td>' + courseCell + badge + '</td>' +
      '<td>' + (r.code ? escapeHtml(r.code) : '—') + '</td>' +   // 四期④c：parseScheduleCell.code 正式消费
      '<td>' + WEEKDAY_NAMES[r.weekday - 1] + '</td>' +
      '<td>第 ' + r.periodStart + (r.periodEnd !== r.periodStart ? '-' + r.periodEnd : '') + ' 节</td>' +
      '<td>' + weekPatternText({ kind: r.kind, startWeek: r.startWeek, endWeek: r.endWeek, weeks: r.weeks }) + '</td>' +
      '<td>' + (r.location ? escapeHtml(r.location) : '—') + '</td>' +
      '<td><input type="number" class="paste-hours" id="pasteHours-' + i +
        '" min="0.5" step="0.5" value="' + it.hours + '"></td>' +
      '</tr>';
  }).join('');
  var rejRows = m.rejected.map(function (rj) {
    return '<tr class="paste-reject-row"><td colspan="8">拒收：' + escapeHtml(rj.name) +
      ' —— ' + escapeHtml(rj.reason) + '</td></tr>';
  }).join('');
  return '<div class="cal-form-card paste-card">' +
    '<h3>导入预览（不产生任何改动，确认后才写入）</h3>' +
    '<div class="import-preview"><table>' +
      '<thead><tr><th scope="col">导入</th><th scope="col">课程</th><th scope="col">代码</th><th scope="col">星期</th><th scope="col">节次</th><th scope="col">周次</th><th scope="col">地点</th><th scope="col">学时/次</th></tr></thead>' +   // 四期④c（B.9-4.3）
      '<tbody>' + rows + rejRows + '</tbody></table></div>' +
    '<div class="form-actions" style="margin-top:12px">' +
      '<button type="button" class="btn-primary btn-auto" id="btnPasteConfirm">确认导入勾选项</button>' +
      '<button type="button" class="btn-sec" id="btnPasteBack">返回重贴</button>' +
    '</div></div>';
}

/** 渲染粘贴区并绑定事件（行内展开，R7 不弹窗） */

function renderPasteArea(cal) {
  var wrap = document.getElementById('pasteImportWrap');
  if (!wrap) return;
  wrap.innerHTML = uiPasteOpen ? pasteAreaHtml(cal) : '';
  if (!uiPasteOpen) return;
  var close = document.getElementById('btnPasteClose');
  if (close) close.addEventListener('click', function () {
    uiPasteOpen = false; uiPasteError = ''; renderEntryPanel();
  });
  var csvInput = document.getElementById('pasteCsvFile');
  if (csvInput) csvInput.addEventListener('change', onPasteCsvChosen);   // 三期 3.1a：CSV 文件导入
  var parse = document.getElementById('btnPasteParse');
  if (parse) parse.addEventListener('click', onPasteParseClick);
  var back = document.getElementById('btnPasteBack');
  if (back) back.addEventListener('click', function () {
    uiPasteParsed = null; uiPasteError = ''; renderEntryPanel();
  });
  var confirm = document.getElementById('btnPasteConfirm');
  if (confirm) confirm.addEventListener('click', onPasteImportConfirm);
  if (uiPasteParsed) {
    uiPasteParsed.items.forEach(function (it, i) {
      var pick = document.getElementById('pastePick-' + i);
      if (pick) pick.addEventListener('change', function () { it.checked = !!pick.checked; });
      var hours = document.getElementById('pasteHours-' + i);
      if (hours) hours.addEventListener('change', function () {
        // W2-D #50：预览学时同样严格解析——非法输入不静默回落 2，保留原值并人话提示
        var h = parseStrictFloatInput(hours.value);
        if (isFinite(h) && h > 0) { it.hours = h; return; }
        showBanner('学时/次需为大于 0 的数字，已保留原值。', 'warn');
        hours.value = it.hours;
      });
      var assign = document.getElementById('pasteAssign-' + i);
      if (assign) assign.addEventListener('change', function () {
        it.courseId = assign.value || null;
      });
    });
  }
}

/** 解析按钮：读文本 → parseScheduleText → buildPastePreview；失败拒收并说明，state 零改动 */

function onPasteParseClick() {
  var cal = getActiveCalendar();
  if (!cal) return;
  var ta = document.getElementById('pasteText');
  var text = ta ? ta.value : '';
  uiPasteError = '';
  uiPasteParsed = null;
  if (!String(text).trim()) { uiPasteError = '请先粘贴课表文本。'; renderEntryPanel(); return; }
  var parsed = parseScheduleText(text, cal.totalWeeks);
  if (parsed.error || !parsed.rows.length) {
    uiPasteError = parsed.error || '未解析到任何课程行，请检查粘贴内容。';
    renderEntryPanel();
    return;
  }
  uiPasteParsed = buildPastePreview(parsed.rows, cal);
  renderEntryPanel();
}

/**
 * 确认导入（仅用户点「确认导入勾选项」后调用，R2）：
 *  逐勾选项建课程（同名自动新建只建一门，调色板配色）与排课项（calendarId 锁当前校历，
 *  typeId=null 跟随课程，hoursPerSession 取预览行输入值，默认 2）；
 *  完成后自动 expandEntries（方案 3）→ 落库 → 刷新面板 → 横幅汇报。
 */

function onPasteImportConfirm() {
  var cal = getActiveCalendar();
  if (!cal || !uiPasteParsed) return;
  var ts = nowIso();
  var createdCourses = 0, added = 0, skipped = 0;
  // W2-B #53（2026-09-20）：自动新建课程名归一——大小写/全半角/首尾空格差异视为同一门，
  // 载荷内同名多行只建一门（与 buildPastePreview #44 归一匹配口径互为往返）；落库名取归一名。
  var autoCreated = {};
  var createdEntries = [];   // 四期⑨：落库条目收集，供冲突扫描
  uiPasteParsed.items.forEach(function (it) {
    if (!it.checked) { skipped++; return; }
    var r = it.row;
    var courseId = it.courseId;
    if (!courseId) {
      var ak = 'n:' + normalizePasteText(r.courseName).trim();
      if (autoCreated[ak]) {
        courseId = autoCreated[ak];
      } else {
        var nc = {
          id: nextId('c'), name: normalizePasteText(r.courseName).trim(), typeId: 'theory', defaultLocation: '',
          classes: '', color: paletteAutoColor(state.courses.length),   // 与课程表单同一写入来源（插单 1.13 统一口径，语义等价）
          notes: '', status: 'active', createdAt: ts, updatedAt: ts
        };
        state.courses.push(nc);
        autoCreated[ak] = nc.id;
        courseId = nc.id;
        createdCourses++;
      }
    }
    var hours = (isFinite(it.hours) && it.hours > 0) ? it.hours : 2;
    state.entries.push({
      id: nextId('e'),
      courseId: courseId,
      calendarId: cal.id,          // 一律取当前校历（与手动新建排课项同约束）
      weekday: r.weekday,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      weekPattern: { kind: r.kind, startWeek: r.startWeek, endWeek: r.endWeek,
        weeks: r.weeks.slice() },  // weeks[] 权威（Q1）
      location: r.location,
      hoursPerSession: hours,
      typeId: null,                // 跟随课程（1.7 语义）
      createdAt: ts,
      updatedAt: ts
    });
    createdEntries.push(state.entries[state.entries.length - 1]);
    added++;
  });
  uiPasteOpen = false;
  uiPasteParsed = null;
  uiPasteError = '';
  expandEntries();   // 方案 3：确认落库后自动展开流水
  saveState();
  renderEntryPanel();
  // 四期⑨（B.9-1.3）：落库后逐条冲突扫描——异课同星期节次相交且周次有交集才报
  //（同课程 similar 并存系 1.9 合法语义，不误报）；只横幅汇总不阻断（B.6 #21 同精神）
  var conflictNames = {};
  createdEntries.forEach(function (en) {
    var hit = null;
    try {
      hit = findEntryConflict(en.weekday, en.periodStart, en.periodEnd,
        en.weekPattern && en.weekPattern.weeks, en.id);
    } catch (e1) { hit = null; }
    if (hit && hit.entry.courseId !== en.courseId) conflictNames[hit.courseName] = true;
  });
  var cNameList = Object.keys(conflictNames);
  if (cNameList.length) {
    // W6-7：冲突提醒先行（warn），完成汇报殿后（success）——lastBannerMsg 锚「粘贴导入完成」
    showBanner('与既有排课「' + cNameList.slice(0, 2).join('、') +
      (cNameList.length > 2 ? ' 等' : '') + '」节次/周次重叠，允许连堂请留意。', 'warn');
  }
  showBanner('粘贴导入完成：新增排课项 ' + added + ' 条' +
    (createdCourses ? '（自动新建课程 ' + createdCourses + ' 门）' : '') +
    (skipped ? '，跳过未勾选/重复 ' + skipped + ' 条' : '') + '。', 'success');
}

/* ============================================================
   四之五、展开引擎（一期 1.5）
   依据附录A Q3「幂等展开 + 冻结保护」+ Q2 两级停课 + Q1 weeks[] 权威：
    1. 幂等键 = entryId + '|' + 原始date（调课实例的原始date取 movedFromDate，
       1.7 语义先行兼容：改期后仍占原键，引擎不会在原日期重造一条）；
    2. 引擎只碰 source="generated" 的记录：frozen=true 跳过（永不被改回，Q3 规则 2），
       manual 记录永不创建/修改/删除（Q3 规则 1）；
    3. 校历级停课周（calendar.breaks）不生成实例（Q2），流水保持
       「流水 = 实际发生的授课」纯净语义；
    4. weeks[] 是权威数据源（Q1），引擎不按 kind 现场重算；
       越界周号由引擎再校验丢弃（附录A §6「界面保证 + 展开引擎再校验」）；
    5. 快照语义（§7）：非冻结生成实例每次重跑同步为排课项当前定义；
       实例层 location 快照 = entry.location 空则回落 course.defaultLocation——
       附录A §6「渲染时回落，不写入」仅约束 entries 层，实例是快照必须写入；
    6. 收敛清理：周次范围改小 / 新增停课周后，不在目标集合的非冻结生成实例移除；
       frozen 与 manual 一律保留（人工留痕优先于数据纯净）；
       校历缺失 / 起始日损坏的排课项及其实例完全跳过——引擎只收敛「能评估」的数据，
       无法评估的保留现状，绝不臆删。
   触发时机（2026-09-17 用户裁定方案 3）：
    - 保存排课项后自动重跑（单条排课项影响面明确，排了即生效）；
    - 校历结构变更（起始日/总周数/停课周）不自动触发，改由「排课」面板
      「重新展开」按钮手动同步（坐标系改动需人工缓冲，防瞬时冲击全量流水）。
   插单 1.17（B.6 #8/#14）：「重新展开」两步走——buildExpandPlan 抽出只读目标集合
   （与 expandEntries 共用，C4 最小改动），previewExpandImpact 干跑预览零写入：
   新增/更新/移除/冻结跳过/manual 计数 + 校历结构变更越界清单（越界周/节次越界，
   只提示不拒收，与 1.5 F1「不臆删」同精神）；确认后才执行 expandEntries + saveState，
   取消零写入（R2 预览确认铁律延伸到引擎操作）。
   ============================================================ */

/** 本地日期 → YYYY-MM-DD（附录A §11：本地日期串，不用带时区的 ISO 时刻，防时区漂移） */

let uiImportParsed = null;

/* W4-E 拍板⑤（#142 部分采纳）：逐条取舍裁定态——键 '数据表|记录id'（reconciles 为
   'reconciles|月份'），值 'local'/'incoming'；缺省 = 自动（updatedAt 新者胜）。
   会话级纯 UI 态（拍板 B2）：随载荷生命周期清空（解析/取消/确认三处），负向锁定组——
   不入复位声明表；不落库、不留痕、不改写记录 updatedAt（拍板 B3）。 */
let uiImportConflictChoice = {};

let uiImportError = '';

/** 剪贴板粘贴导入的 UI 态（插单 1.21）：文本域草稿与解析错误（纯 UI 态，不入数据） */

let uiClipImportText = '';

let uiClipImportError = '';

/** 文件名日期戳：YYYYMMDD（本地时间） */

function exportStateJson() {
  return JSON.stringify(state, null, 2);
}

/** CSV 单元格转义：含引号/逗号/换行的字段加引号并双写引号（RFC 4180）；null/undefined 空串 */

function exportInstancesCsv() {
  const lines = [CSV_FIELDS.join(',')];
  state.instances.forEach(function (inst) {
    lines.push(CSV_FIELDS.map(function (f) { return csvInstanceCell(inst, f); }).join(','));
  });
  return '﻿' + lines.join('\r\n');
}

/* ---------- 插单 1.21 剪贴板 JSON 导入/导出（B.7 #30；数据面板纯 UI 增量，
      复用 1.8 文件导入的校验 / 预览 / 合并链路，R2 预览确认铁律不变） ---------- */

/**
 * 剪贴板写入封装（纯函数层，便于沙盒断言）：优先 navigator.clipboard.writeText
 * （安全上下文可用）；不可用时降级 execCommand('copy')（临时不可见 textarea）；
 * 再不可用返回 false。统一返回 thenable<boolean>；失败绝不静默，由调用方横幅引导（R7）。
 */

function copyAllDataToClipboard() {
  // 四期④b：成功才计入备份写点——先盖章再捕获内容（剪贴板内容即含最新时间戳，
  // 与「内容恒等于 exportStateJson()」基线断言兼容）；复制失败还原旧值，只有真正拿到备份才算数
  const prevStamp = state.settings.lastFullExportAt;
  markFullExported();
  const json = exportStateJson();
  const done = function (ok) {
    showBanner(ok
      ? '全量 JSON 已复制到剪贴板，可在其他设备「数据」面板粘贴导入。'
      : '剪贴板不可用：请改用「导出全部数据（JSON）」下载传输。', ok ? 'success' : 'warn');
    if (ok) { saveState(); }
    else { state.settings.lastFullExportAt = prevStamp; }   // 复制失败：还原备份写点
  };
  let r;
  try { r = copyTextToClipboard(json); } catch (err) { r = null; }
  if (r && typeof r.then === 'function') { r.then(done, function () { done(false); }); }
  else { done(!!r); }
  return json;
}

/**
 * 粘贴解析入口（纯函数，零写入——R2）：JSON.parse → validateImportPayload，
 * 与文件导入完全同一套校验/拒收口径；成功 { ok:true, payload }，
 * 失败 { ok:false, error }。
 */

function parseClipImportText(text) {
  let parsed = null;
  try {
    // 四期④a：粘贴路径同样剥 BOM 再解析（两路径同一口径）
    parsed = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch (err) {
    return { ok: false, error: 'JSON 解析失败：粘贴内容不是有效的 JSON。' };
  }
  const v = validateImportPayload(parsed);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, payload: parsed };
}

/**
 * 「解析并预览」：合法 → 载入 uiImportParsed（与文件导入共用同一预览模型与确认链路，
 * 渲染同一张预览表——含同 id 冲突详情 / 悬空引用提示，确认前零写入）；
 * 非法 → 清空待确认载荷并标错，绝不留旧预览误导。
 */

function onClipImportParseClick() {
  const ta = document.getElementById('clipImportText');
  const text = ta ? ta.value : '';
  uiClipImportText = String(text);
  uiClipImportError = '';
  if (!String(text).trim()) {
    uiImportParsed = null;
    uiClipImportError = '请先粘贴 JSON 文本。';
    renderDataPanel();
    return;
  }
  const r = parseClipImportText(text);
  if (!r.ok) {
    uiImportParsed = null;   // 清空待确认载荷，绝不留旧预览误导（R2）
    uiClipImportError = r.error;
    renderDataPanel();
    return;
  }
  uiImportError = '';
  uiImportConflictChoice = {};   // W4-E 拍板⑤：新载荷入库即清旧取舍态
  uiImportParsed = r.payload;   // 仅暂存待确认，state 零改动；确认走与文件导入同一 onImportConfirm
  renderDataPanel();
}

/** 通用文本下载：Blob + 临时 a 标签（R1：零外链，浏览器原生能力） */


/* ============================================================
   四期③ 数据健康检查（数据面板「数据健康」卡；只读扫描 + 人话报告，零写入零修复）
   结果缓存为纯 UI 态（uiDataHealthResult）：与粘贴区/导入预览态同组——切视图后
   保留、不参与 resetTodayUi 复位（拆分前 resetTodayUi 语义，负向锁定同精神）。
   ============================================================ */

/** 健康检查结果缓存（null = 未检查；数组 = runDataHealthCheck 返回值；纯 UI 态不入数据） */

let uiDataHealthResult = null;

/** 「数据健康」卡 HTML：未检查 → 说明文案；已检查无问题 → 全绿；有问题 → 分级报告表 */

function dataHealthCardHtml() {
  const result = uiDataHealthResult;
  let body;
  if (result === null) {
    body = '<p class="data-desc">对全部数据做只读体检：悬空引用、脏 id、校历结构、' +
      '重复 id 与计数器、记录留痕完整性、重复排课项与零流水。只报告不自动修复' +
      '（每条附修复引导），全程零写入。</p>';
  } else if (!result.length) {
    body = '<p class="form-hint" style="color:#1a7f37">检查完成：未发现问题，数据状态健康。</p>';
  } else {
    const nErr = result.filter(function (f) { return f.level === 'error'; }).length;
    const nWarn = result.filter(function (f) { return f.level === 'warn'; }).length;
    const nInfo = result.length - nErr - nWarn;
    const badgeCls = { error: 'badge-error', warn: 'badge-warn', info: 'badge-dup' };
    const badgeText = { error: '错误', warn: '警告', info: '提示' };
    body = '<p class="form-hint">检查完成：错误 ' + nErr + ' 项 · 警告 ' + nWarn +
      ' 项 · 提示 ' + nInfo + ' 项（只读报告，未做任何改动）。</p>' +
      '<div class="import-preview"><table><tbody>' +
      result.map(function (f) {
        return '<tr><td><span class="paste-badge ' + badgeCls[f.level] + '">' +
          badgeText[f.level] + '</span></td><td>' + escapeHtml(f.area) + '</td><td>' +
          escapeHtml(f.message) + '<br><span class="factor-hint">' +
          escapeHtml(f.hint) + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  return '<section class="data-card data-card-wide">' +
    '<h3>数据健康检查（四期③）</h3>' + body +
    '<div class="data-actions">' +
      '<button type="button" class="btn-sec" id="btnDataHealthRun">开始检查</button>' +
      (result === null ? '' :
        '<button type="button" class="btn-sec" id="btnDataHealthClear">清除结果</button>') +
    '</div></section>';
}

/** 「开始检查」：只读扫描 → 缓存结果 → 重渲染卡片 → 横幅汇报分级计数（R7 不弹窗） */

function onDataHealthRunClick() {
  uiDataHealthResult = runDataHealthCheck();
  renderDataPanel();
  const nErr = uiDataHealthResult.filter(function (f) { return f.level === 'error'; }).length;
  const nWarn = uiDataHealthResult.filter(function (f) { return f.level === 'warn'; }).length;
  showBanner('数据健康检查完成：错误 ' + nErr + ' 项、警告 ' + nWarn + ' 项、提示 ' +
    (uiDataHealthResult.length - nErr - nWarn) + ' 项（只读，未做任何改动）。', 'info');
}

function renderDataPanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导（与既有面板一致）

  maybeFullBackupReminder();   // 四期④b：距上次全量备份 >30 天横幅（同一自然日一次，R7 不弹窗）

  const preview = uiImportParsed ? buildImportPreview(uiImportParsed) : null;

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head"><h2>数据与备份</h2></div>' +
        '<div class="data-grid">' +
          '<section class="data-card">' +
            '<h3>导出</h3>' +
            '<p class="data-desc">JSON 是全量备份（含数据结构版本），换机迁移 / 数据恢复用；' +
              'CSV 仅授课流水表，供 Excel 查看对账。</p>' +
            '<p class="data-desc">上次全量备份：' + escapeHtml(fullBackupHealthText()) +
              '（超 ' + FULL_EXPORT_STALE_DAYS + ' 天未备份会在打开本面板时横幅提醒）。</p>' +
            '<p class="data-desc">教员台 v5.0 · 数据已本地保存</p>' +   // W0A #5（#272）：界面版本号与发布版口径一致
            '<div class="data-actions">' +
              '<button type="button" class="btn-sec" id="btnExportJson">导出全部数据（JSON）</button>' +
              '<button type="button" class="btn-sec" id="btnExportCsv">导出流水表（CSV）</button>' +
              '<button type="button" class="btn-sec" id="btnCopyJson">复制全部数据（JSON）</button>' +
            '</div>' +
          '</section>' +
          '<section class="data-card">' +
            '<h3>导入（合并，非覆盖）</h3>' +
            '<p class="data-desc">选择 JSON 备份文件：先预览各表记录概况，确认后才写入。' +
              '同 id 冲突以修改时间新者为准；导入不会清空任何原有数据。</p>' +
            '<div class="data-actions">' +
              '<input type="file" id="dataImportFile" accept=".json,application/json">' +
            '</div>' +
            '<p class="data-desc" style="margin-top:10px">或粘贴 JSON 全文（剪贴板导入，服务手机↔电脑手动迁移）：' +
              '与文件导入同一张预览表，确认后才写入。</p>' +
            '<textarea id="clipImportText" class="paste-textarea" style="min-height:90px" ' +
              'placeholder="粘贴全量 JSON 文本…">' + escapeHtml(uiClipImportText) + '</textarea>' +
            (uiClipImportError ? '<div class="form-error" role="alert">' + escapeHtml(uiClipImportError) + '</div>' : '') +
            '<div class="data-actions">' +
              '<button type="button" class="btn-sec" id="btnClipParse">解析并预览</button>' +
            '</div>' +
            (preview ? importPreviewHtml(preview) : '') +
          '</section>' +
          corruptBackupCardHtml(listCorruptBackups()) +
          dataHealthCardHtml() +
        '</div>' +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  document.getElementById('btnExportJson').addEventListener('click', function () {
    // 四期④b：先记备份写点并落库，再导出——备份文件自身即携带最新时间戳
    markFullExported();
    saveState();
    downloadTextFile('教员台_全量数据_' + fileDateStamp() + '.json',
      exportStateJson(), 'application/json');
  });
  document.getElementById('btnExportCsv').addEventListener('click', function () {
    downloadTextFile('教员台_授课流水_' + fileDateStamp() + '.csv',
      exportInstancesCsv(), 'text/csv;charset=utf-8');
  });
  document.getElementById('dataImportFile').addEventListener('change', onImportFileChosen);
  // 插单 1.21：剪贴板导出（clipboard 降级链封装在 copyAllDataToClipboard）与粘贴导入
  const btnCopyJson = document.getElementById('btnCopyJson');
  if (btnCopyJson) btnCopyJson.addEventListener('click', copyAllDataToClipboard);
  const clipTa = document.getElementById('clipImportText');
  if (clipTa) clipTa.addEventListener('change', function () {
    uiClipImportText = clipTa.value;   // 重渲染（解析/标错）后保留草稿，免重贴
  });
  const btnClipParse = document.getElementById('btnClipParse');
  if (btnClipParse) btnClipParse.addEventListener('click', onClipImportParseClick);
  bindCorruptBackupExport();
  // 四期③：数据健康检查（只读扫描 + 分级报告，零写入）
  const btnDataHealth = document.getElementById('btnDataHealthRun');
  if (btnDataHealth) btnDataHealth.addEventListener('click', onDataHealthRunClick);
  const btnHealthClear = document.getElementById('btnDataHealthClear');
  if (btnHealthClear) btnHealthClear.addEventListener('click', function () {
    uiDataHealthResult = null;
    renderDataPanel();
  });
  if (uiImportParsed) {
    document.getElementById('btnImportConfirm').addEventListener('click', onImportConfirm);
    document.getElementById('btnImportCancel').addEventListener('click', function () {
      uiImportParsed = null;
      uiImportConflictChoice = {};   // W4-E 拍板⑤：载荷生命周期同步清空取舍态（拍板 B2）
      uiImportError = '';
      uiClipImportError = '';
      renderDataPanel();
    });
    bindImportChoiceControls(buildImportPreview(uiImportParsed));   // W4-E 拍板⑤：逐条取舍绑定
  }
}

/** 备份健康度文案（四期④b，纯函数）：无记录引导立即备份 / 今天已备份 / N 天前（附日期） */
function fullBackupHealthText() {
  const days = fullExportStaleDays();
  if (days === null) return '从未备份——建议现在就导出一份 JSON 全量备份';
  if (days <= 0) return '今天已备份';
  return days + ' 天前（' + String(state.settings.lastFullExportAt).slice(0, 10) + '）';
}

/**
 * 枚举损坏数据备份键（corrupt.* 前缀，字典序即时间序；localStorage 枚举失败时返回空数组，
 * 只影响入口显隐，不影响主流程）。
 */

function listCorruptBackups() {
  const out = [];
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.indexOf(CORRUPT_KEY_PREFIX) === 0) out.push(k);
    }
  } catch (err) { /* 枚举失败按无备份处理 */ }
  return out.sort();
}

/**
 * 数据面板「数据修复」卡（插单 1.14 子项 2 的修复口）：
 * 仅当存在损坏备份时渲染（R7 防骚扰）；原始内容零改动导出，人工修复后可经
 * 「导入（合并）」合回系统（设计哲学 4：数据比软件活得久）。
 */

function corruptBackupCardHtml(keys) {
  if (!keys.length) return '';
  return (
    '<section class="data-card data-card-wide">' +
      '<h3>数据修复</h3>' +
      '<p class="data-desc">检测到 ' + keys.length + ' 份历史损坏数据备份（原始内容，未做任何改动）。' +
        '修复三步走：① 下方选择一份备份，点「导出损坏数据」存成文件；' +
        '② 用文本编辑器把文件内容修正为合法 JSON；' +
        '③ 回到本面板上方「导入（合并，非覆盖）」选中修好的文件，预览确认后合回系统。</p>' +
      '<div class="data-actions">' +
        '<select id="corruptKeySel" class="paste-assign" aria-label="选择损坏备份">' +
          keys.map(function (k) {
            return '<option value="' + escapeHtml(k) + '">' +
              escapeHtml(k.slice(CORRUPT_KEY_PREFIX.length)) + '</option>';
          }).join('') +
        '</select>' +
        '<button type="button" class="btn-sec" id="btnExportCorrupt">导出损坏数据</button>' +
      '</div>' +
    '</section>'
  );
}

/** 绑定「导出损坏数据」：原样导出所选备份字符串，一字节不改 */

function bindCorruptBackupExport() {
  const btn = document.getElementById('btnExportCorrupt');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const sel = document.getElementById('corruptKeySel');
    const key = sel ? sel.value : '';
    const raw = key ? readStorageKey(key) : null;
    if (raw === null) { showBanner('损坏备份读取失败，可能已被清理。', 'warn'); return; }
    downloadTextFile('教员台_损坏数据备份_' + key.slice(CORRUPT_KEY_PREFIX.length) + '.json',
      raw, 'application/json');
  });
}

/* ---------- W4-E 拍板⑤：冲突详情逐条取舍（#142 部分采纳）----------
   三态裁定控件：自动（按时间）/ 保留本地 / 以导入为准——用户未改选时维持 updatedAt 新者胜
   （行为逐字节不变）；显式取值随确认链路传入 applyImportMerge 第二参（engines 落库语义）。
   角标「已人工裁定 N 条」实时回显（拍板 B5）；脏 id 不渲染可绑定控件（1.15 防线沿用）。 */
function impChoiceKey(table, recId) { return table + '|' + recId; }

function impChoiceSelectHtml(table, recId) {
  if (!isSafeElId(recId)) return '<span class="factor-hint">—</span>';   // 脏 id 不渲染可绑定控件
  const cur = uiImportConflictChoice[impChoiceKey(table, recId)] || 'auto';
  return '<select id="impChoice-' + escapeHtml(table) + '-' + escapeHtml(recId) +
    '" class="paste-assign" aria-label="取舍裁定">' +
    '<option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>自动（按时间）</option>' +
    '<option value="local"' + (cur === 'local' ? ' selected' : '') + '>保留本地</option>' +
    '<option value="incoming"' + (cur === 'incoming' ? ' selected' : '') + '>以导入为准</option>' +
    '</select>';
}

function impChoiceChosenCount() {
  let n = 0;
  Object.keys(uiImportConflictChoice).forEach(function (k) {
    const v = uiImportConflictChoice[k];
    if (v === 'local' || v === 'incoming') n++;
  });
  return n;
}

function updateImpChoiceBadge() {
  const b = document.getElementById('impChoiceBadge');
  if (b) b.textContent = String(impChoiceChosenCount());
}

/** 绑定取舍控件（renderDataPanel 在 uiImportParsed 存在时调用；改选只更新纯 UI 态与角标，
    不整面板重渲染——免 details 展开态与文本域草稿丢失） */
function bindImportChoiceControls(preview) {
  preview.tables.forEach(function (t) {
    if (!t.conflicts || !t.conflicts.length) return;
    t.conflicts.forEach(function (c) {
      if (!isSafeElId(c.id)) return;
      const sel = document.getElementById('impChoice-' + t.name + '-' + c.id);
      if (!sel) return;
      sel.addEventListener('change', function () {
        const key = impChoiceKey(t.name, c.id);
        if (sel.value === 'local' || sel.value === 'incoming') {
          uiImportConflictChoice[key] = sel.value;
        } else {
          delete uiImportConflictChoice[key];   // 显式选回自动：清除裁定态
        }
        updateImpChoiceBadge();
      });
    });
  });
}

/**
 * 导入预览表：按顶层表列记录数 + 新增/冲突概况 + 同 id 冲突详情展开区 + 悬空引用提示；
 * 确认前全程零写入（R2）。冲突区用原生 <details> 折叠、复用 import-preview 表格体系（R3 风格一致）。
 * W4-E 拍板⑤：冲突详情区逐条取舍——带 id 表与 reconciles 月键冲突同列（拍板 B4），
 * 人工裁定角标实时回显（拍板 B5）。
 */

function importPreviewHtml(preview) {
  const rows = preview.tables.map(function (t) {
    const conflictCell = t.conflictCount
      ? '<span class="conflict-num">' + t.conflictCount + '（' +
        (t.incomingWins ? t.incomingWins + ' 条以导入为准' : '全部保留本地') + '）</span>'
      : '0';
    return '<tr><td>' + t.name + '</td><td>' + t.localCount + '</td><td>' + t.importCount +
      '</td><td>' + t.addCount + '</td><td>' + conflictCell + '</td></tr>';
  }).join('');
  // W2-C #42（2026-09-20）：跳过记录数入预览——结构非法/无有效 id 的记录无法合并，
  // 既有预览表文案行列明（不新模态）；数据层 buildImportPreview 已逐表计数 skippedCount
  const skippedTotal = preview.tables.reduce(function (s, t) {
    return s + (t.skippedCount || 0); }, 0);
  const skippedHint = skippedTotal
    ? '<div class="form-hint" style="margin-top:10px"><span class="paste-badge badge-warn">' +
      skippedTotal + ' 条跳过</span> 导入记录结构非法或缺少有效 id，无法按 id 合并，' +
      '已自动跳过（安全防线，明细可对照各表导入记录数）。</div>'
    : '';
  // 子项⑤ + W4-E 拍板⑤：同 id 冲突详情——逐条列出 数据表 / 记录 id / 双方 updatedAt /
  // 裁决 / 差异字段 / 取舍裁定（带 id 表与 reconciles 月键冲突统一渲染，拍板 B4）
  let conflictHtml = '';
  const conflictTables = preview.tables.filter(function (t) {
    return t.conflicts && t.conflicts.length; });
  if (conflictTables.length) {
    const lines = [];
    conflictTables.forEach(function (t) {
      t.conflicts.forEach(function (c) {
        lines.push('<tr><td>' + t.name + '</td><td>' + escapeHtml(c.id) + '</td><td>' +
          escapeHtml(c.localUpdatedAt || '（无）') + '</td><td>' +
          escapeHtml(c.incomingUpdatedAt || '（无）') + '</td><td>' +
          (c.incomingWins ? '导入为准' : '保留本地') + '</td><td>' +
          (c.diffs.length
            ? c.diffs.map(function (f) { return escapeHtml(f); }).join('、')
            : '（无字段差异）') + '</td><td>' +
          impChoiceSelectHtml(t.name, c.id) + '</td></tr>');
      });
    });
    // 拍板 B5：人工裁定角标（<span id> 供改选实时刷新，不整面板重渲染）
    conflictHtml = '<details class="import-preview" style="margin-top:10px"><summary>同 id 冲突详情（' +
      lines.length + ' 条，已人工裁定 <span id="impChoiceBadge">0</span> 条，逐条核对后再确认；' +
      '确认前零写入）</summary><table>' +
      '<thead><tr><th scope="col">数据表</th><th scope="col">记录 id</th><th scope="col">本地 updatedAt</th><th scope="col">导入 updatedAt</th>' +
      '<th scope="col">裁决</th><th scope="col">差异字段</th><th scope="col">取舍（改选后按此裁定）</th></tr></thead><tbody>' +
      lines.join('') +
      '</tbody></table></details>';
  }
  // 子项①：悬空引用提示——只提示不阻断，由用户确认时自行权衡
  let danglingHtml = '';
  if (preview.dangling && preview.dangling.length) {
    danglingHtml = '<div class="form-hint" style="margin-top:10px">悬空引用提示（指向本地不存在的对象，' +
      '不拒收、不阻断，请确认时自行权衡）：' +
      preview.dangling.map(function (d) { return d.table + ' ' + d.count + ' 条'; }).join('；') +
      '。</div>';
  }
  // 三期 3.0c（B.7 #41）：同名分类合并提示（预览列清单；确认时静默按 name 去重保留 updatedAt 新者）
  let sameNameHtml = '';
  if (preview.sameNameCats && preview.sameNameCats.length) {
    sameNameHtml = '<div class="form-hint" style="margin-top:10px">发现同名分类（确认导入时将按名称合并、' +
      '保留 updatedAt 新者，条目归属自动改挂）：' +
      preview.sameNameCats.map(function (c) {
        return escapeHtml(c.name) + '（' + escapeHtml(c.loserId) + ' → ' +
          escapeHtml(c.winnerId) + (c.incomingWins ? '，导入为准' : '，保留本地') + '）';
      }).join('；') + '。</div>';
  }
  return (
    '<div class="import-preview"><table>' +
      '<thead><tr><th scope="col">数据表</th><th scope="col">本地记录</th><th scope="col">导入记录</th><th scope="col">新增</th><th scope="col">同 id 冲突</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    skippedHint +   // W2-C #42：跳过数文案行（既有预览表体系）
    conflictHtml + sameNameHtml + danglingHtml +
    '<div class="form-actions" style="margin-top:12px">' +
      '<button type="button" class="btn-primary btn-auto" id="btnImportConfirm">确认导入（合并写入）</button>' +
      '<button type="button" class="btn-sec" id="btnImportCancel">取消</button>' +
    '</div></div>'
  );
}

/** 选文件：读取 → JSON 解析 → 校验 → 渲染预览（任何一步失败都拒收并说明原因） */

function onImportFileChosen(ev) {
  const input = ev.target;
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    let parsed = null;
    try {
      // 四期④a：主路径补 BOM 剥离（CSV 路径已有；带 BOM 备份文件此前被误拒收）
      parsed = JSON.parse(String(reader.result).replace(/^\uFEFF/, ''));
    } catch (err) {
      uiImportParsed = null;
      uiImportError = 'JSON 解析失败：文件不是有效的 JSON。';
      renderDataPanel();
      return;
    }
    const v = validateImportPayload(parsed);
    if (!v.ok) {
      uiImportParsed = null;
      uiImportError = v.error;
      renderDataPanel();
      return;
    }
    uiImportError = '';
    uiImportConflictChoice = {};   // W4-E 拍板⑤：新载荷入库即清旧取舍态
    uiImportParsed = parsed;   // 仅暂存待确认，state 零改动（R2）
    renderDataPanel();
  };
  reader.onerror = function () {
    uiImportParsed = null;
    uiImportError = '文件读取失败，请重试。';
    renderDataPanel();
  };
  reader.readAsText(file);
}

/** 确认导入：执行合并 → 落库 → 刷新面板 → 横幅汇报（R7 不弹窗） */

function onImportConfirm() {
  if (!uiImportParsed) return;
  // W4-E 拍板⑤：逐条取舍随确认传入（显式 'local'/'incoming' 覆盖自动裁定；缺省新者胜不变）
  const report = applyImportMerge(uiImportParsed, uiImportConflictChoice);
  uiImportParsed = null;
  uiImportConflictChoice = {};   // 载荷生命周期结束：取舍态清空（拍板 B2）
  uiImportError = '';
  saveState();
  renderDataPanel();
  let addTotal = 0, conflictTotal = 0;
  report.tables.forEach(function (t) { addTotal += t.addCount; conflictTotal += t.conflictCount; });
  // W4-C #73（问题列表裁决 #73 部分采纳）：按表列出摘要——哪些表有新增/冲突一目了然，
  // 无变更表不列；同 id 冲突与合并保留口径不变
  const tablePartsW4C = report.tables.filter(function (t) {
    return t.addCount > 0 || t.conflictCount > 0;
  }).map(function (t) {
    return t.name + ' 新增 ' + t.addCount +
      (t.conflictCount ? '、同 id 冲突 ' + t.conflictCount : '');
  });
  // W6-7：表数收口 4（防动态横幅超长），口径不变
  const partsW67 = tablePartsW4C.length > 4
    ? tablePartsW4C.slice(0, 4).concat(['等 ' + tablePartsW4C.length + ' 表'])
    : tablePartsW4C;
  showBanner('导入完成：' + (partsW67.length ? partsW67.join('；')
    : '各数据表均无变更') + '（冲突按时间新者胜，原有数据保留）。', 'success');
}

/* ============================================================
   四之九、结算规则（二期 2.1；显示名，原「规则坊」）
   依据 D2（规则全部数据化、界面可编辑、按学期锁定版本）+ R6 + D10 + Q4/Q5 裁定
   （2026-09-18 用户授权 AI 逐项裁决，见附录A Q4）：
    - 规则体方案 A「三因子连乘」：结算学时 = 名义学时 × 类型系数 × 人数加成；
      类型系数 / 人数加成两个因子均可独立停用，或填常数覆盖（常数优先于分档表）；
      真·表达式语法（方案 B）留二期后续轮，content.formula 恒 'multiply' 备扩展；
    - 版本锁定语义（D2）：content 内含 typeCoeffs / tiers 快照副本——结算规则面板维护
      courseTypes.coefficient / headcountTiers 主表即时生效于「下一个版本」的预填，
      但已保存版本结算只认自己的快照，改系数永不追溯污染历史流水；
    - 版本选取：ruleForDate 取 validFrom ≤ 实例日期的版本中 validFrom 最新者；
      无匹配版本 → 结算留空（D10 降级，R6 三来源之一「留空」）；
    - 人数口径（Q2 裁定）：headcount=null 按 0 人参与阶梯匹配；无任何档匹配时
      加成取 1.0（不臆造系数）；
    - 本学期重算边界（Q5 裁定）：仅 calendarId=当前校历 ∧ settleMode≠manual ∧
      status≠canceled；frozen 非 manual 参与（只重算 settledHours/settleMode/
      ruleVersion 三字段，快照字段仍冻结）；canceled 的结算三字段恒清空
      （Q2：校历级停课不入流水，临时停课无结算）；
    - 结果保留两位小数（round2）。
   ============================================================ */

/** 规则编辑态：表单是否展开 / 阶梯草稿行（纯 UI 态，不入数据） */

let formRuleOpen = false;

let uiRuleTierDraft = [];

/** 四期⑧ 项 3：规则版本复制预填态（纯 UI 态）——复制现有版本带入新建表单；提交成功 /
    取消 / Esc 关闭三处都必须清空（汲取 entryPrefill 污染教训，缺一不可）。
    负向锁定组：不入复位声明表（避免改写拆分结构断言的登记数），随表单关闭即清。 */
let rulePrefill = null;

/** 结算结果保留两位小数 */

function initRuleDraft() {
  const latest = rulePrefill ||
    state.rules.slice().sort(function (a, b) { return (b.version || 0) - (a.version || 0); })[0];
  if (latest && latest.content) {
    const c = latest.content;
    uiRuleTierDraft = (c.tiers || []).map(function (t) {
      return { min: t.min, max: t.max, mul: t.multiplier };
    });
  } else {
    uiRuleTierDraft = state.headcountTiers.map(function (t) {
      return { min: t.min, max: t.max, mul: t.multiplier };
    });
  }
}

/** 表单当前输入回读进草稿（增删行前调用，防丢已填值） */

function syncTierDraftFromForm() {
  uiRuleTierDraft = uiRuleTierDraft.map(function (d, i) {
    const minEl = document.getElementById('ruleTierMin-' + i);
    const maxEl = document.getElementById('ruleTierMax-' + i);
    const mulEl = document.getElementById('ruleTierMul-' + i);
    return {
      min: minEl ? minEl.value : d.min,
      max: maxEl ? maxEl.value : d.max,
      mul: mulEl ? mulEl.value : d.mul
    };
  });
}

/** 结算规则面板：当前生效版本 + 历史版本列表 + 新建版本表单 */

function renderRulePanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导（与既有面板一致）

  const sorted = state.rules.slice().sort(function (a, b) {
    return String(b.validFrom).localeCompare(String(a.validFrom));
  });
  const current = ruleForDate(fmtLocalDate(new Date()));

  /* 四期⑧：版本卡片附复制/停用/删除三操作（同面板互不相交）——覆盖计数 meta
     （ruleCoverageOf 纯计算）、停用版置灰 rule-off、脏 id 沿用 1.15 防线不渲染不绑定 */
  const versionsHtml = sorted.length
    ? '<div class="cal-list">' + sorted.map(function (r) {
        const isCur = current && current.id === r.id;
        const off = r.disabled === true;
        const cov = ruleCoverageOf(r, cal);
        const covText = cov.count
          ? ' · 覆盖 ' + cov.count + ' 条流水（' + cov.minDate + ' ~ ' + cov.maxDate + '）'
          : '';
        const btns = isSafeElId(r.id)
          ? '<button type="button" class="btn-sec" id="btnRuleCopy-' + escapeHtml(r.id) +
            '">复制</button>' +
            '<button type="button" class="btn-sec" id="btnRuleToggle-' + escapeHtml(r.id) +
            '">' + (off ? '启用' : '停用') + '</button>' +
            // W6-6 列表批：删除收「更多」（id/class 串与 confirmDelete 绑定逐字保留）
            '<span class="more-wrap"><button type="button" class="btn-sec" id="btnRuleMore-' +
            escapeHtml(r.id) + '">更多 ▾</button>' +
            '<span class="more-menu">' +
            '<button type="button" class="btn-danger" id="btnRuleDel-' + escapeHtml(r.id) +
            '">删除</button>' +
            '</span></span>'
          : '';
        return (
          '<div class="cal-card' + (off ? ' rule-off' : '') + '">' +
            '<div class="cal-card-main">' +
              '<div class="cal-card-name">v' + r.version + ' · ' + escapeHtml(r.id) +
                (isCur ? '<span class="cal-badge">当前生效</span>' : '') +
                (off ? '<span class="badge-archived">已停用</span>' : '') + '</div>' +
              '<div class="cal-card-meta">生效自 ' + escapeHtml(r.validFrom) + ' · ' +
                ruleSummaryText(r.content) + covText +
                (r.changedWhat ? ' · ' + escapeHtml(r.changedWhat) : '') + '</div>' +
            '</div>' +
            '<div class="cal-card-actions">' + btns + '</div>' +
          '</div>'
        );
      }).join('') + '</div>'
    : '';

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head">' +
          '<h2>结算规则</h2>' +
          '<button type="button" class="btn-primary btn-auto" id="btnNewRule">保存新规则版本</button>' +
        '</div>' +
        '<p class="form-hint">结算规则决定每节课的「名义学时」换算成多少报账学时；没有规则时系统只记名义学时、结算留空，随时可补规则后一键重算本学期。</p>' +
        (sorted.length ? '' :
          emptyStateHtml('还没有结算规则：现在只记录课表上的名义学时，报账用的结算学时是空的。' +
            '下一步：点上方「保存新规则版本」，本学期流水会自动按新规则结算。',
            '', ICON_RULE)) +
        '<div id="ruleFormWrap"></div>' +
        versionsHtml +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  document.getElementById('btnNewRule').addEventListener('click', function () {
    rulePrefill = null;   // 四期⑧：手动「保存新规则版本」不受复制预填污染
    formRuleOpen = true;
    initRuleDraft();
    renderRuleForm();
  });
  sorted.forEach(function (r) {
    if (!isSafeElId(r.id)) return;   // 1.15 防线：脏 id 不渲染不绑定
    const bCopy = document.getElementById('btnRuleCopy-' + r.id);
    if (bCopy) bCopy.addEventListener('click', function () { onRuleCopyClick(r.id); });
    const bTog = document.getElementById('btnRuleToggle-' + r.id);
    if (bTog) bTog.addEventListener('click', function () { onRuleToggleClick(r.id); });
    const bDel = document.getElementById('btnRuleDel-' + r.id);
    if (bDel) bDel.addEventListener('click', function () { onRuleDeleteClick(r.id); });
  });
  if (formRuleOpen) renderRuleForm();
}

/** 渲染规则版本表单（系数表 + 阶梯表 + 因子开关与常数覆盖，复用 cal-form 体系） */

function renderRuleForm() {
  const wrap = document.getElementById('ruleFormWrap');
  if (!wrap) return;

  const latest = state.rules.slice().sort(function (a, b) { return (b.version || 0) - (a.version || 0); })[0];
  const pre = (rulePrefill && rulePrefill.content) ? rulePrefill.content
    : ((latest && latest.content) ? latest.content : null);

  const coefRows = state.courseTypes.map(function (t) {
    const v = pre && pre.typeCoeffs && isFinite(pre.typeCoeffs[t.id])
      ? pre.typeCoeffs[t.id]
      : t.coefficient;
    return (
      '<div class="coef-row">' +
        '<label>' + escapeHtml(t.name) + '</label>' +
        '<input type="number" class="coef-input" id="ruleCoef-' + escapeHtml(t.id) +
          '" min="0" step="0.05" value="' + v + '">' +
      '</div>'
    );
  }).join('');

  const tierRows = uiRuleTierDraft.map(function (d, i) {
    return (
      '<tr>' +
        '<td>第 ' + (i + 1) + ' 档</td>' +
        '<td><input type="number" class="rule-tier-input" id="ruleTierMin-' + i +
          '" min="0" value="' + escapeHtml(d.min) + '"></td>' +
        '<td><input type="number" class="rule-tier-input" id="ruleTierMax-' + i +
          '" min="0" value="' + escapeHtml(d.max) + '"></td>' +
        '<td><input type="number" class="rule-tier-input" id="ruleTierMul-' + i +
          '" min="0" step="0.05" value="' + escapeHtml(d.mul) + '"></td>' +
        '<td><span class="factor-hint" id="ruleTierText-' + i + '"></span></td>' +
        '<td><button type="button" class="btn-sec" id="btnRuleDelTier-' + i + '">删除</button></td>' +
      '</tr>'
    );
  }).join('');

  const useTypeCoef = pre ? !!pre.useTypeCoef : true;
  const useTier = pre ? !!pre.useTier : true;
  const constTypeCoef = pre ? (pre.constTypeCoef === null || pre.constTypeCoef === undefined
    ? '' : pre.constTypeCoef) : '';
  const constTier = pre ? (pre.constTier === null || pre.constTier === undefined
    ? '' : pre.constTier) : '';

  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>规则版本草稿（v' +
        (state.rules.reduce(function (m, r) { return Math.max(m, r.version || 0); }, 0) + 1) +
        '）</h3>' +
      (rulePrefill
        ? '<p class="form-hint">复制自 v' + rulePrefill.version + '（' +
          escapeHtml(rulePrefill.id) + '）预填：修改后保存为新版本，原版本不受影响。</p>'
        : '') +
      '<form id="ruleForm" class="cal-form" novalidate>' +
        // 插单 1.28 ①②③：人话公式条＋实时示例＋三模板一键预填（factor-row/btn-sec/form-actions
        // 既有体系，R3 零新增样式；公式条口径与版本列表 ruleSummaryText 同一函数，不新造口径）
        '<div class="field full" style="margin-bottom:10px">' +
          '<label>公式与示例（随下方因子、常数与阶梯实时变化）</label>' +
          '<div class="factor-row"><span class="factor-hint" id="ruleDraftFormula"></span></div>' +
          '<div class="factor-row" style="margin-top:6px">' +
            '<span class="factor-hint" id="ruleDraftExample"></span></div>' +
          '<div class="form-actions" style="margin-top:10px">' +
            '<span class="factor-hint">模板预填：</span>' +
            '<button type="button" class="btn-sec" id="btnRuleTplA">只按类型系数</button>' +
            '<button type="button" class="btn-sec" id="btnRuleTplB">三因子连乘</button>' +
            '<button type="button" class="btn-sec" id="btnRuleTplC">只按人数阶梯</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="ruleValidFrom">生效日期（含当日及之后按本版结算）</label>' +
            '<input id="ruleValidFrom" type="date" aria-required="true" aria-describedby="ruleFormError" value="' + fmtLocalDate(new Date()) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="ruleChangedWhat">变更说明（人话描述，可空）</label>' +
            '<input id="ruleChangedWhat" type="text" maxlength="100" value="">' +
          '</div>' +
          '<div class="field full">' +
            '<label>因子一：类型系数（结算 = 名义 × 类型系数 × 人数加成）</label>' +
            '<div class="factor-row">' +
              '<label class="factor-label"><input type="checkbox" id="ruleUseTypeCoef"' +
                (useTypeCoef ? ' checked' : '') + '>启用</label>' +
              coefRows +
              '<span class="factor-hint">常数覆盖（留空按上表）：</span>' +
              '<input type="number" id="ruleConstTypeCoef" min="0" step="0.05" value="' +
                constTypeCoef + '" placeholder="如 1.2">' +
            '</div>' +
          '</div>' +
          '<div class="field full">' +
            '<label>因子二：人数加成阶梯（未录人数按 0 人档；无匹配档加成取 1）</label>' +
            '<div class="factor-row">' +
              '<label class="factor-label"><input type="checkbox" id="ruleUseTier"' +
                (useTier ? ' checked' : '') + '>启用</label>' +
              '<span class="factor-hint">常数覆盖（留空按阶梯表）：</span>' +
              '<input type="number" id="ruleConstTier" min="0" step="0.05" value="' +
                constTier + '" placeholder="如 1.1">' +
            '</div>' +
            '<table class="period-table" style="margin-top:8px">' +
              '<thead><tr><th scope="col">档位</th><th scope="col">下限（含）</th><th scope="col">上限（含）</th><th scope="col">加成系数</th>' +
              '<th scope="col">人话</th><th scope="col"></th></tr></thead>' +
              '<tbody>' + tierRows + '</tbody>' +
            '</table>' +
            '<div class="form-actions" style="margin-top:10px">' +
              '<button type="button" class="btn-sec" id="btnRuleAddTier">添加阶梯档</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<p class="hint-line" id="ruleDraftHint"></p>' +
        '<p class="hint-line">保存后：系数与阶梯随本版本锁定（历史版本永不被追溯污染）；' +
          '本学期上课记录立即重算（手动覆盖与停课除外）。</p>' +
        '<div class="form-error" id="ruleFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">保存为新版本并重算本学期</button>' +
          '<button type="button" class="btn-sec" id="ruleFormCancel">取消</button>' +
        '</div>' +
      '</form>' +
    '</div>';

  const ruleFormEl = document.getElementById('ruleForm');
  ruleFormEl.addEventListener('submit', onRuleSubmit);
  ruleFormEl.addEventListener('input', function () { ruleFormEl.__submitting = false; });
  document.getElementById('ruleFormCancel').addEventListener('click', onRuleFormCancel);
  document.getElementById('btnRuleAddTier').addEventListener('click', onRuleAddTier);
  uiRuleTierDraft.forEach(function (d, i) {
    const btnDel = document.getElementById('btnRuleDelTier-' + i);
    if (btnDel) btnDel.addEventListener('click', function () { onRuleDelTier(i); });
  });
  const ruleVfEl = document.getElementById('ruleValidFrom');
  if (ruleVfEl) ruleVfEl.addEventListener('change', updateRuleDraftHint);
  updateRuleDraftHint();   // 四期⑧ 项 8：初渲即回显影响面提示
  // 插单 1.28：公式条/实时示例/阶梯人话初渲即刷新；因子与阶梯输入只刷新这三处小节点，
  // 不整表重渲（输入焦点不丢）；mock 环境不派发事件，测试按显式调用同链刷新断言
  refreshRuleDraftExtras();
  ['ruleUseTypeCoef', 'ruleUseTier', 'ruleConstTypeCoef', 'ruleConstTier'].forEach(function (id) {
    const x = document.getElementById(id);
    if (x) x.addEventListener('change', function () {
      syncTierDraftFromForm();   // 顺带回读阶梯草稿，不丢已填值
      refreshRuleDraftExtras();
    });
  });
  state.courseTypes.forEach(function (t) {
    const x = document.getElementById('ruleCoef-' + t.id);
    if (x) x.addEventListener('input', function () { refreshRuleDraftExtras(); });
  });
  uiRuleTierDraft.forEach(function (d, i) {
    ['ruleTierMin-' + i, 'ruleTierMax-' + i, 'ruleTierMul-' + i].forEach(function (id) {
      const x = document.getElementById(id);
      if (x) x.addEventListener('input', function () {
        syncTierDraftFromForm();
        refreshRuleDraftExtras();
      });
    });
  });
  // 插单 1.28 ③：三模板一键预填——改写控件草稿（非落库），保存仍走 onRuleSubmit 全量校验＋既有防抖
  ['A', 'B', 'C'].forEach(function (k) {
    const b = document.getElementById('btnRuleTpl' + k);
    if (b) b.addEventListener('click', function () {
      ruleTemplateApply(k);
      refreshRuleDraftExtras();
    });
  });
  // 四期⑦：动态 id 逐项收集后统一清除
  const ruleInvalidIds = ['ruleValidFrom', 'ruleChangedWhat', 'ruleConstTypeCoef', 'ruleConstTier'];
  state.courseTypes.forEach(function (t) { ruleInvalidIds.push('ruleCoef-' + t.id); });
  uiRuleTierDraft.forEach(function (d, i) {
    ruleInvalidIds.push('ruleTierMin-' + i, 'ruleTierMax-' + i, 'ruleTierMul-' + i);
  });
  clearFormInvalid(ruleInvalidIds);
}

/* ============================================================
   插单 1.28 规则坊易用化（拍板①②③④，2026-09-19 用户授权按建议裁决；半轮插单）：
   ① 人话公式条——ruleSummaryText 同一函数渲染草稿 content，不新造口径；
   ② 实时示例——本学期最近一条已发生流水代入草稿走 computeSettledHours 同链（纯计算
      零写入），草稿非法时降级提示不显示错误数字；
   ③ 三模板一键预填——A 只按类型系数 / B 三因子连乘 / C 只按人数阶梯，改写控件草稿
      非落库，保存仍走 onRuleSubmit 全量校验＋既有双击防抖；
   ④ 阶梯表人话化——每档实时显示「人数 X–Y 人 → ×Z」，非法档人话报错。
   全部纯 UI/纯渲染增量：Q4 冻结的结算链路（ruleForDate / computeSettledHours /
   recomputeSettledHours / content 结构）一律不碰，buildRuleContent 仅作草稿组装复用
   （深拷贝语义天然隔离），R4 零 schema 变更。
   ============================================================ */

/**
 * 草稿组装（纯函数层，便于沙盒直测）：从当前表单控件读因子开关/常数覆盖/系数表，与
 * uiRuleTierDraft 合成 content 草稿。显示层降级口径：非法数值（负系数/非法常数/档界
 * 倒置/非正加成）置 invalid 标志，content 内降级为可计算值（0 / 1 / 0 档）——公式条
 * 照常显示、示例降级提示不显示错误数字；落库路径 onRuleSubmit 独立组装并硬校验，
 * 两条路径互不影响（显示层绝不放松提交校验）。
 */
function ruleDraftContentFromForm() {
  const typeCoeffs = {};
  let invalid = false;
  state.courseTypes.forEach(function (t) {
    const el = document.getElementById('ruleCoef-' + t.id);
    const v = el ? parseStrictFloatInput(el.value) : NaN;
    if (!isFinite(v) || v < 0) invalid = true;
    typeCoeffs[t.id] = (isFinite(v) && v >= 0) ? v : 0;
  });
  const uT = document.getElementById('ruleUseTypeCoef');
  const cT = document.getElementById('ruleConstTypeCoef');
  const uR = document.getElementById('ruleUseTier');
  const cR = document.getElementById('ruleConstTier');
  let constTypeCoef = null, constTier = null;
  const ctv = cT ? String(cT.value).trim() : '';
  if (ctv !== '') {
    const v = parseStrictFloatInput(ctv);
    if (!(isFinite(v) && v >= 0)) invalid = true;
    constTypeCoef = (isFinite(v) && v >= 0) ? v : 0;
  }
  const crv = cR ? String(cR.value).trim() : '';
  if (crv !== '') {
    const v = parseStrictFloatInput(crv);
    if (!(isFinite(v) && v >= 0)) invalid = true;
    constTier = (isFinite(v) && v >= 0) ? v : 0;
  }
  const tiers = uiRuleTierDraft.map(function (d) {
    const min = parseStrictIntInput(d.min), max = parseStrictIntInput(d.max), mul = parseStrictFloatInput(d.mul);
    if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && min <= max &&
          isFinite(mul) && mul > 0)) invalid = true;
    return { min: (Number.isInteger(min) && min >= 0) ? min : 0,
      max: (Number.isInteger(max) && max >= 0) ? max : 0,
      multiplier: (isFinite(mul) && mul > 0) ? mul : 1 };
  });
  return { content: buildRuleContent(typeCoeffs, tiers, {
    useTypeCoef: !!(uT && uT.checked),
    constTypeCoef: constTypeCoef,
    useTier: !!(uR && uR.checked),
    constTier: constTier
  }), invalid: invalid };
}

/**
 * 实时示例取数（纯函数，零写入）：本学期（当前校历）最近一条已发生流水——date ≤ 今天、
 * 非停课，date 最大者；代入草稿 content 走 computeSettledHours 同链（常数覆盖/落档/
 * 无匹配档加成取 1 全口径一致），因子分解显示与计算同链一一对应；无流水或算不出 →
 * null（显示侧给降级文案）。headcount=null 按 0 人档参与匹配（Q4 人数口径，同链）。
 */
function ruleDraftExampleLine(content, cal) {
  if (!cal || !content) return null;
  const todayStr = fmtLocalDate(new Date());
  let pick = null;
  state.instances.forEach(function (inst) {
    if (inst.calendarId !== cal.id) return;
    if (inst.status === 'canceled') return;
    if (String(inst.date) > todayStr) return;
    if (!pick || String(inst.date) > String(pick.date)) pick = inst;
  });
  if (!pick) return null;
  const h = computeSettledHours(pick, { content: content });
  if (h === null || !isFinite(h)) return null;
  const course = state.courses.find(function (c) { return c.id === pick.courseId; });
  let typeTxt;
  if (!content.useTypeCoef) typeTxt = '1（类型系数停用）';
  else if (content.constTypeCoef !== null && content.constTypeCoef !== undefined) {
    typeTxt = content.constTypeCoef + '（常数覆盖）';
  } else {
    const k = (content.typeCoeffs && isFinite(content.typeCoeffs[pick.typeId]))
      ? content.typeCoeffs[pick.typeId] : 1;
    typeTxt = k + '（' + courseTypeName(pick.typeId) + '）';
  }
  let tierTxt;
  if (!content.useTier) tierTxt = '1（人数加成停用）';
  else if (content.constTier !== null && content.constTier !== undefined) {
    tierTxt = content.constTier + '（常数覆盖）';
  } else {
    const hc = (pick.headcount === null || pick.headcount === undefined) ? 0 : pick.headcount;
    const tr = (content.tiers || []).find(function (x) { return hc >= x.min && hc <= x.max; });
    tierTxt = tr ? (tr.multiplier + '（' + hc + ' 人档）') : '1（无匹配档）';
  }
  return '示例：「' + (course ? course.name : '未知课程') + '」' + pick.nominalHours +
    ' 学时 × ' + typeTxt + ' × ' + tierTxt + ' = ' + h + ' 学时';
}

/**
 * 三模板一键预填（纯函数层，便于沙盒直测）：先回读草稿（syncTierDraftFromForm 语义，
 * 防丢已填阶梯值），再按模板改写因子开关与常数覆盖——A 只按类型系数（人数加成停用、
 * 清人数常数）；B 三因子连乘（两因子启用、两常数清空）；C 只按人数阶梯（停用类型
 * 系数、清类型常数）；阶梯草稿与系数表不动。改写写回控件（真实 DOM 与 mock 同机制），
 * 预填非落库——保存仍走 onRuleSubmit 全量校验与既有双击防抖；返回应用后的开关/常数
 * 快照供断言；未知模板零动作（防御）。
 */
function ruleTemplateApply(kind) {
  syncTierDraftFromForm();   // 回读已填值（含阶梯），模板不丢草稿
  const uT = document.getElementById('ruleUseTypeCoef'),
    cT = document.getElementById('ruleConstTypeCoef'),
    uR = document.getElementById('ruleUseTier'),
    cR = document.getElementById('ruleConstTier');
  const out = {
    useTypeCoef: !!(uT && uT.checked),
    useTier: !!(uR && uR.checked),
    constTypeCoef: cT ? String(cT.value).trim() : '',
    constTier: cR ? String(cR.value).trim() : ''
  };
  if (kind === 'A') {          // 模板 A：只按类型系数
    out.useTypeCoef = true; out.useTier = false; out.constTier = '';
  } else if (kind === 'B') {   // 模板 B：三因子连乘
    out.useTypeCoef = true; out.useTier = true;
    out.constTypeCoef = ''; out.constTier = '';
  } else if (kind === 'C') {   // 模板 C：只按人数阶梯
    out.useTypeCoef = false; out.useTier = true; out.constTypeCoef = '';
  } else {
    return out;   // 未知模板：零动作（防御）
  }
  if (uT) uT.checked = out.useTypeCoef;
  if (uR) uR.checked = out.useTier;
  if (cT) cT.value = out.constTypeCoef;
  if (cR) cR.value = out.constTier;
  return out;
}

/**
 * 公式条/实时示例/阶梯人话同步刷新（纯 UI，不整表重渲——输入焦点不丢）：
 * 公式条 = '结算学时 = ' + ruleSummaryText（草稿 content），与版本列表摘要同一函数
 * 同口径；示例按草稿 invalid 标志降级（非法数值时不显示数字，人话提示修正）；
 * 阶梯逐档人话——档界非法显「档界非法」、加成非法显「加成非法」、合法档显
 * 「人数 X–Y 人 → ×Z」。初渲与每次相关输入/模板点击后调用。
 */
function refreshRuleDraftExtras() {
  const cal = getActiveCalendar();
  const draft = ruleDraftContentFromForm();
  const fEl = document.getElementById('ruleDraftFormula');
  if (fEl) fEl.textContent = '结算学时 = ' + ruleSummaryText(draft.content);
  const exEl = document.getElementById('ruleDraftExample');
  if (exEl) {
    if (draft.invalid) {
      exEl.textContent = '示例：当前草稿存在非法数值（系数/常数/阶梯），修正后才能给出示例。';
    } else {
      const line = ruleDraftExampleLine(draft.content, cal);
      exEl.textContent = line ||
        '示例：本学期暂无已发生的流水，保存规则后新流水即按此版本结算。';
    }
  }
  draft.content.tiers.forEach(function (t, i) {
    const el = document.getElementById('ruleTierText-' + i);
    if (!el) return;
    const d = uiRuleTierDraft[i] || { min: '', max: '', mul: '' };
    const min = parseStrictIntInput(d.min), max = parseStrictIntInput(d.max), mul = parseStrictFloatInput(d.mul);
    if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && min <= max)) {
      el.textContent = '档界非法：需 0 ≤ 下限 ≤ 上限';
    } else if (!(isFinite(mul) && mul > 0)) {
      el.textContent = '加成非法：需大于 0';
    } else {
      el.textContent = '人数 ' + min + '–' + max + ' 人 → ×' + mul;
    }
  });
}

/** 添加阶梯档：当前输入回读进草稿后追加空行并重渲染 */

function onRuleAddTier() {
  syncTierDraftFromForm();
  uiRuleTierDraft.push({ min: '', max: '', mul: '' });
  renderRuleForm();
}

/** 删除第 i 档：先回读再删除，防丢其他行已填值 */

function onRuleDelTier(i) {
  syncTierDraftFromForm();
  uiRuleTierDraft.splice(i, 1);
  renderRuleForm();
}

/* ============================================================
   四期⑧ 结算规则可管理化（拍板·裁决书 2026-09-19：无引用可删 / 有引用仅停用 /
   不提供旧版编辑（新需求=新建版本，D2）/ 新建支持复制现有版本预填）
   ============================================================ */

/** 复制现有版本预填新建（项 3）：模板 content 带入表单草稿（initRuleDraft 优先 rulePrefill），
    仅表单预填不立即落库；保存为新版本（nextId 发号、version=max+1 不回退）。 */
function onRuleCopyClick(id) {
  const r = state.rules.find(function (x) { return x.id === id; });
  if (!r) return;
  rulePrefill = r;
  formRuleOpen = true;
  initRuleDraft();
  renderRulePanel();
}

/** 规则表单取消（项 3 三处清空之一）：关表单 + 弃草稿 + 清复制预填态。 */
function onRuleFormCancel() {
  formRuleOpen = false;
  uiRuleTierDraft = [];
  rulePrefill = null;
  renderRulePanel();
}

/**
 * 版本停用/启用（项 2，可逆操作不弹窗 R7）：ruleLookupFor 统一跳过停用版（结算/覆盖
 * 计数同口径）；停用「当前生效版」时横幅影响面（复用 ruleCoverageOf 纯计算，切换前取数）。
 */
function onRuleToggleClick(id) {
  const r = state.rules.find(function (x) { return x.id === id; });
  if (!r) return;
  if (r.disabled !== true) {
    const cal = getActiveCalendar();
    const wasCurrent = cal ? ruleForDate(fmtLocalDate(new Date())) === r : false;
    const cov = cal ? ruleCoverageOf(r, cal) : { count: 0 };
    r.disabled = true;
    // W0 #2（2026-09-19）：停用即触发本学期重算——结算口径即时回退到剩余版本
    // （修复前停用不重算，已结算流水仍挂旧 ruleVersion，与 ruleLookupFor 新结果不一致）
    if (cal) recomputeSettledHours(cal);
    saveState();
    renderRulePanel();
    if (wasCurrent) {
      showBanner('规则 v' + r.version + ' 已停用（原覆盖本学期 ' + cov.count +
        ' 条记录）：结算口径待下次保存规则时重算。', 'info');
    } else {
      showBanner('规则 v' + r.version + ' 已停用：生效区间回退使用更早版本。', 'info');
    }
  } else {
    r.disabled = false;
    // W0 #2：启用即触发本学期重算（结算口径即时恢复含本版本）
    const calW0 = getActiveCalendar();
    if (calW0) recomputeSettledHours(calW0);
    saveState();
    renderRulePanel();
    showBanner('规则 v' + r.version + ' 已启用。', 'success');
  }
}

/**
 * 版本删除（项 1，禁删判据满足其一即拒——裁决书修正意见 2）：
 * ① 被任意流水 ruleVersion 引用；② ruleForDate(今日) 指向它（当前生效版）；
 * ③ 规则库唯一版本（防删空后规则面板裸奔）。放行路径走 confirmDelete（⑦收口复用）；
 * 删除仅移除版本记录，已结算流水的 ruleVersion 留痕不受影响（R4 零迁移）。
 */
function onRuleDeleteClick(id) {
  const r = state.rules.find(function (x) { return x.id === id; });
  if (!r) return;
  const refCount = state.instances.filter(function (x) { return x.ruleVersion === id; }).length;
  if (refCount > 0) {
    showBanner('规则 v' + r.version + ' 被 ' + refCount +
      ' 条流水结算引用，不可删除（可停用）。', 'warn');
    return;
  }
  const cal = getActiveCalendar();
  if (cal && ruleForDate(fmtLocalDate(new Date())) === r) {
    showBanner('规则 v' + r.version + ' 当前正生效，不可删除（可停用）。', 'warn');
    return;
  }
  if (state.rules.length <= 1) {
    showBanner('规则库至少保留一个版本，不可删除（可停用）。', 'warn');
    return;
  }
  // W4-D：动作收进确认回调（桩/沙盒同步执行，原生环境弹层确认后执行）
  confirmDelete('删除规则版本 v' + r.version + '（生效自 ' + r.validFrom +
    '）？此操作不可恢复。', function () {
    state.rules = state.rules.filter(function (x) { return x.id !== id; });
    saveState();
    renderRulePanel();
    showBanner('规则版本 v' + r.version + ' 已删除；后续版本号全局递增不回退。', 'success');
  });
}

/**
 * 规则表单生效日实时提示（项 8，渲染期纯计算零写入）：改 validFrom 即显示
 * 「本学期 N 条流水将改按本版本结算」（ruleDraftCoverage 口径，与覆盖计数同链）。
 */
function updateRuleDraftHint() {
  const el = document.getElementById('ruleDraftHint');
  const cal = getActiveCalendar();
  const vfEl = document.getElementById('ruleValidFrom');
  if (!el || !cal || !vfEl) return;
  const vf = vfEl.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vf)) { el.textContent = ''; return; }
  const n = ruleDraftCoverage(vf, cal);
  el.textContent = n > 0
    ? '按此生效日期，本学期 ' + n + ' 条流水将改按本版本结算（保存后立即重算；手动覆盖与停课除外）。'
    : '按此生效日期，本学期没有将被本版本影响的流水。';
}

/**
 * 规则提交：校验（系数 ≥0 / 阶梯 0≤min≤max / 加成 >0 / 常数覆盖 ≥0 / 生效日期合法）
 * → 生成新版本（version 递增，content 存快照副本）→ 主表同步维护 →
 * 本学期重算（Q5 边界）→ 落库 → 横幅汇报（R7 不弹窗）。
 */

function onRuleSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const cal = getActiveCalendar();
  if (!cal) return;
  const errBox = document.getElementById('ruleFormError');

  const validFrom = document.getElementById('ruleValidFrom').value;
  // 四期④a：统一经 isValidDateStr（只换判据不换文案）
  if (!isValidDateStr(validFrom)) {
    formErrorAt(errBox, '请选择生效日期。', 'ruleValidFrom'); return;
  }
  const changedWhat = document.getElementById('ruleChangedWhat').value.trim();

  const typeCoeffs = {};
  for (let i = 0; i < state.courseTypes.length; i++) {
    const t = state.courseTypes[i];
    const v = parseStrictFloatInput(document.getElementById('ruleCoef-' + t.id).value);
    if (!(isFinite(v) && v >= 0)) {
      formErrorAt(errBox, '「' + t.name + '」系数需为不小于 0 的数字。', 'ruleCoef-' + t.id); return;
    }
    typeCoeffs[t.id] = v;
  }
  const useTypeCoef = !!document.getElementById('ruleUseTypeCoef').checked;
  const constTypeRaw = document.getElementById('ruleConstTypeCoef').value.trim();
  let constTypeCoef = null;
  if (constTypeRaw !== '') {
    const v = parseStrictFloatInput(constTypeRaw);
    if (!(isFinite(v) && v >= 0)) {
      formErrorAt(errBox, '类型系数常数覆盖需为不小于 0 的数字。', 'ruleConstTypeCoef'); return;
    }
    constTypeCoef = v;
  }
  const useTier = !!document.getElementById('ruleUseTier').checked;
  const constTierRaw = document.getElementById('ruleConstTier').value.trim();
  let constTier = null;
  if (constTierRaw !== '') {
    const v = parseStrictFloatInput(constTierRaw);
    if (!(isFinite(v) && v >= 0)) {
      formErrorAt(errBox, '人数加成常数覆盖需为不小于 0 的数字。', 'ruleConstTier'); return;
    }
    constTier = v;
  }

  syncTierDraftFromForm();
  const tiers = [];
  for (let i = 0; i < uiRuleTierDraft.length; i++) {
    const d = uiRuleTierDraft[i];
    const min = parseStrictIntInput(d.min);
    const max = parseStrictIntInput(d.max);
    const mul = parseStrictFloatInput(d.mul);
    if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && min <= max)) {
      formErrorAt(errBox, '第 ' + (i + 1) + ' 档阶梯需为整数且 0 ≤ 下限 ≤ 上限。', 'ruleTierMin-' + i); return;
    }
    if (!(isFinite(mul) && mul > 0)) {
      formErrorAt(errBox, '第 ' + (i + 1) + ' 档加成系数需为大于 0 的数字。', 'ruleTierMul-' + i); return;
    }
    tiers.push({ min: min, max: max, multiplier: mul });
  }

  // W1 #23（2026-09-19 问题列表裁决）：阶梯重叠表单校验——任意两档人数区间相交即拒收
  // （档位重叠时后档永不生效；导入脏数据的确定性消化与健康检查提示见 engines 层 #22）
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      if (tiers[i].min <= tiers[j].max && tiers[j].min <= tiers[i].max) {
        formErrorAt(errBox, '第 ' + (i + 1) + ' 档与第 ' + (j + 1) +
          ' 档人数区间重叠，请调整后保存。', 'ruleTierMin-' + j); return;
      }
    }
  }

  const content = buildRuleContent(typeCoeffs, tiers, {
    useTypeCoef: useTypeCoef,
    constTypeCoef: constTypeCoef,
    useTier: useTier,
    constTier: constTier
  });
  const version = state.rules.reduce(function (m, r) { return Math.max(m, r.version || 0); }, 0) + 1;
  const rule = {
    id: nextId('r'),
    version: version,
    validFrom: validFrom,
    content: content,
    changedAt: nowIso(),
    changedWhat: changedWhat || ('v' + version + ' 由结算规则面板保存')
  };
  state.rules.push(rule);

  // 主表同步维护（下次预填与展示入口）；已存版本只认 content 快照（D2 锁定，防追溯污染）
  state.courseTypes.forEach(function (t) { t.coefficient = typeCoeffs[t.id]; });
  state.headcountTiers = tiers.map(function (t) {
    return { min: t.min, max: t.max, multiplier: t.multiplier };
  });

  formRuleOpen = false;
  uiRuleTierDraft = [];
  rulePrefill = null;   // 四期⑧ 项 3：提交成功清空复制预填态
  recomputeSettledHours(cal);   // Q5 边界：本学期重算（manual/停课/他校历不波及）
  saveState();
  renderRulePanel();
  showBanner('规则 v' + version + ' 已保存并锁定：本学期流水已重算（手动覆盖与停课除外）。', 'success');
}

/* ============================================================
   四之十、统计面板（二期 2.2）
   依据 B.3 吸收参考系统「课量」页 + D10/R6 双口径 + Q2 停课口径
   （2026-09-18 用户确认「按建议」，裁定固化入变更记录 v1.18）：
    - 范围：仅当前校历；只认流水 instances（含 manual 补课），status≠canceled（Q2），
      不按排课项回算（与附录A §12.4 投影同精神：流水是唯一数据源）；
    - 统计卡四格：总名义学时 / 总结算学时（全部无结算值时显「—」，D10/R6 无来源数字禁止）/
      已上课时（计入流水条数）/ 门数（有流水的课程数）；
    - 汇总表：按课程一行（课程名/类型/流水条数/名义合计/结算合计/未结算角标/明细），
      点「明细」内联展开该课流水钻取（日期升序全量；一学期单课流水量无需分页）；
    - 钻取结算列：值 + 来源标注（"2.4 (r-1)" 规则版本 / "8（手动）" / "—" 留空），R6 溯源。
   纯读取投影：零数据层改动，R4 天然满足。
   插单 1.25（v1.34 拍板）统计筛选区收纳：默认折叠为摘要行（口径回显 + 激活高亮 + 展开按钮）、
   展开后三组分区排布；折叠/展开纯 UI 态随 resetTodayUi 复位（筛选判定逻辑与口径回显一字不改）；
   插单 1.20（B.6 #22/#27 五项拍板）：自由筛选——时间四选一（本学期/指定月/自定义起止/全部时间跨校历）、
   课程与课时类型多选 chips（空 = 全部）、排除停课开关、结算状态筛选（全部/已结算/未结算）、
   口径小字常驻回显、进度列（已上/应上）仅「本学期」显示、理论/实训拆分列全范围
   （类型解析链 inst→entry→course，与 §12.4 同源不现场回算）、筛选结果 CSV 导出口；
   对账核对口径不受影响（仍自然月名义投影，B.6 #27）；筛选态纯 UI 不入数据，跨视图切换复位。
   ============================================================ */

/** 统计面板钻取态：当前展开明细的课程 id（纯 UI 态，不入数据） */

let uiStatsCourseId = null;

/** 四期⑧ 钻取行内编辑态：人数 / 结算覆盖编辑对象 id（纯 UI 态不入数据；负向锁定组——
    不入复位声明表，避免改写拆分结构断言的登记数；切课程/筛选项/重置时随钻取态一并清） */

let uiStatsHcId = null;

let uiStatsSettleId = null;

/** 四期⑪ 汇总维度切换（纯 UI 态不入数据；负向锁定组——与表单编辑态同惯例不入复位
    声明表，避免改写拆分结构断言登记数）：'course' = 按课程（默认）/ 'classes' = 按班级 */
let uiStatsGroupBy = 'course';

/* ---------- 插单 1.20 统计面板·自由筛选（B.6 #22/#27 五项拍板；纯读取投影层，零 schema 变更，R4） ---------- */

/** 筛选态默认值：本学期 + 2.2 既有口径（排除临时停课、含调课/补课、全部课程/类型/结算状态） */

let uiStatsFilter = defaultStatsFilter();

/** 筛选区折叠态（插单 1.25）：默认折叠为一条摘要行；纯 UI 态，跨视图切换随 resetTodayUi 复位 */

let uiStatsFilterCollapsed = true;

/** 当前筛选是否偏离默认态（插单 1.25 摘要行激活高亮用，纯函数）：范围/细化值/课程/类型/停课开关/结算状态任一偏离即激活 */

/** W4-C #172：折叠态筛选标签——已生效条件逐项小角标（不再只有「筛选已生效」一个笼统角标） */
function statsFilterActiveTags(f) {
  const d = defaultStatsFilter();
  const tags = [];
  if (f.range !== d.range) {
    tags.push(f.range === 'month' ? '月份 ' + f.month
      : f.range === 'custom' ? '自定义区间' : '全部时间');
  }
  const cN = Object.keys(f.courses || {}).length;
  if (cN) tags.push('课程 ' + cN + ' 门');
  const tN = Object.keys(f.types || {}).length;
  if (tN) tags.push('类型 ' + tN + ' 种');
  if (!f.excludeCanceled) tags.push('含临时停课');
  if (f.settleFilter === 'settled') tags.push('仅已结算');
  if (f.settleFilter === 'unsettled') tags.push('仅未结算');
  if ((f.statusFilter || 'all') !== 'all') {
    tags.push('状态：' + (WEEK_STATUS_NAMES[f.statusFilter] || f.statusFilter));
  }
  return tags.map(function (t) {
    return ' <span class="paste-badge badge-dup">' + escapeHtml(t) + '</span>';
  }).join('');
}

function statsFilterHtml(cal) {
  const f = uiStatsFilter;

  /* 折叠态：一条摘要行 = 口径回显 + 激活高亮 + 「展开筛选」按钮（复用今日清单行样式，零新增样式） */
  if (uiStatsFilterCollapsed) {
    const active = statsFilterActive(f);
    return (
      '<div class="cal-form-card paste-card" id="statsFilterWrap">' +
        '<div class="today-line">' +
          '<div class="today-main">' +
            '<div class="today-name">筛选' +
              // W4-C #32（问题列表裁决 #32 部分采纳）：「全部时间」跨校历口径常驻警示角标
              (f.range === 'all' ? ' <span class="paste-badge badge-warn">跨校历口径</span>' : '') +
              (active ? ' <span class="paste-badge badge-warn">筛选已生效</span>' + statsFilterActiveTags(f) : '') +
              '<span class="today-sub">筛选口径：' +
                escapeHtml(statsFilterEchoText(f, cal)) + '</span></div>' +
          '</div>' +
          '<button type="button" class="btn-sec" id="statsFExpand" aria-expanded="false" aria-controls="statsFilterWrap">展开筛选</button>' +
        '</div>' +
      '</div>'
    );
  }

  const rangeSel = [['semester', '本学期'], ['month', '指定月份'],
    ['custom', '自定义起止'], ['all', '全部时间']].map(function (o) {
    return '<option value="' + o[0] + '"' + (f.range === o[0] ? ' selected' : '') +
      '>' + o[1] + '</option>';
  }).join('');
  let subField;
  if (f.range === 'month') {
    subField = '<input id="statsFMonth" type="month" aria-label="指定月份" value="' + escapeHtml(f.month) + '">';
  } else if (f.range === 'custom') {
    subField = '<div class="period-pair">' +
      '<input id="statsFDateFrom" type="date" aria-label="开始日期" value="' + escapeHtml(f.dateFrom) + '">' +
      '<span class="pair-sep">至</span>' +
      '<input id="statsFDateTo" type="date" aria-label="结束日期" value="' + escapeHtml(f.dateTo) + '"></div>';
  } else {
    // W4-C #32：跨校历口径人话警示强化（回显主文案 statsFilterEchoText 不动，零 mandated）
    subField = '<span class="factor-hint">' +
      (f.range === 'semester' ? '按当前校历过滤'
        : '跨校历回溯——含全部校历的流水，不是本学期数据，期末跨学期汇总才用') + '</span>';
  }
  const courseChips = state.courses.map(function (c) {
    const chk = f.courses[c.id] ? ' checked' : '';
    if (!isSafeElId(c.id)) {   // 1.15 防线：脏 id 不渲染可绑定控件
      return '<label class="break-chip"><input type="checkbox" disabled' + chk +
        '><span>' + escapeHtml(c.name) + '</span></label>';
    }
    return '<label class="break-chip"><input type="checkbox" id="statsFCourse-' +
      escapeHtml(c.id) + '"' + chk + '><span>' + escapeHtml(c.name) + '</span></label>';
  }).join('');
  const typeChips = state.courseTypes.map(function (t) {
    const chk = f.types[t.id] ? ' checked' : '';
    return '<label class="break-chip"><input type="checkbox" id="statsFType-' +
      escapeHtml(t.id) + '"' + chk + '><span>' + escapeHtml(t.name) + '</span></label>';
  }).join('');
  const settleSel = [['all', '全部'], ['settled', '仅已结算'], ['unsettled', '仅未结算']]
    .map(function (o) {
      return '<option value="' + o[0] + '"' + (f.settleFilter === o[0] ? ' selected' : '') +
        '>' + o[1] + '</option>';
    }).join('');

  /* 四期⑨（B.11-U29）：授课状态筛选——全部/正常/调课/停课/补课，缺失（旧 UI 态）回落全部 */
  const statusSel = [['all', '全部状态'], ['normal', '仅正常'], ['moved', '仅调课'],
    ['canceled', '仅停课'], ['makeup', '仅补课']].map(function (o) {
    return '<option value="' + o[0] + '"' +
      ((f.statusFilter || 'all') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  }).join('');

  /* 展开态：三组横排窄列（W6-12——组内字段纵向堆叠、列间留白承担分隔，整卡高度
      由 ~570px 收至 ~250px，统计卡直入视口）；控件 id 与 1.20 完全一致（基线绑定点不变） */
  return (
    '<div class="cal-form-card paste-card" id="statsFilterWrap">' +
      '<h3>自由筛选</h3>' +
      '<div class="filter-groups">' +
      '<div class="filter-group">' +
      '<p class="filter-group-title">时间范围</p>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="statsFRange">范围</label>' +
          '<select id="statsFRange">' + rangeSel + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label>范围细化</label>' + subField +
        '</div>' +
      '</div>' +
      '</div>' +
      '<div class="filter-group">' +
      '<p class="filter-group-title">课程与类型</p>' +
      '<div class="form-grid">' +
        '<fieldset class="field full">' + '<legend>课程（不勾选 = 全部）</legend>' + '<div class="breaks-grid">' + courseChips + '</div>' + '</fieldset>' +
        '<fieldset class="field full">' + '<legend>课时类型（不勾选 = 全部）</legend>' + '<div class="breaks-grid">' + typeChips + '</div>' + '</fieldset>' +
      '</div>' +
      '</div>' +
      '<div class="filter-group">' +
      '<p class="filter-group-title">结算与口径</p>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="statsFSettle">结算状态</label>' +
          '<select id="statsFSettle">' + settleSel + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="statsFStatus">授课状态</label>' +
          '<select id="statsFStatus">' + statusSel + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label>其他口径</label>' +
          '<div class="factor-row">' +
            '<label class="factor-label"><input type="checkbox" id="statsFExCancel"' +
              (f.excludeCanceled ? ' checked' : '') + '>排除临时停课</label>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<p class="form-hint">筛选口径：' + escapeHtml(statsFilterEchoText(f, cal)) + '</p>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn-sec" id="statsFExport">导出筛选结果（CSV）</button>' +
        '<button type="button" class="btn-sec" id="statsFReset">重置筛选</button>' +
        '<button type="button" class="btn-sec" id="statsFCollapse" aria-expanded="true" aria-controls="statsFilterWrap">收起筛选</button>' +
      '</div>' +
    '</div>'
  );
}

/** 绑定筛选区事件：任一条件变更即重渲染（纯 UI 反馈），CSV 导出不改数据 */

function bindStatsFilter(cal) {
  const f = uiStatsFilter;
  const rerender = function () {
    // W6-13：收回 W6-10「筛选变更即收起」——用户实测反馈多条件连点（chips 多选/
    // 逐项比对）每点必收起反成打断；W6-12 横排后展开态仅 ~250px，结果区本就在
    // 视口内，收起置位整段移除（手动收起仍走「收起筛选」按钮，语义不变）
    // W4-F（问题列表 #157）：筛选后钻取课程仍在计入口径内则保留钻取（含行内编辑态）——
    // 仅被筛掉才关闭，修复「调一下筛选钻取就没了」的打断感
    if (uiStatsCourseId) {
      const stillInW4F = statsFilterIncludedInstances(cal, f).some(function (x) {
        return x.courseId === uiStatsCourseId;
      });
      if (!stillInW4F) { uiStatsCourseId = null; uiStatsHcId = null; uiStatsSettleId = null; }
    }
    renderStatsPanel();
  };
  /* 插单 1.25：折叠态仅绑定「展开筛选」；展开态绑定「收起筛选」+ 全部控件（控件 id 与 1.20 一致） */
  const expandBtn = document.getElementById('statsFExpand');
  if (expandBtn) {
    expandBtn.addEventListener('click', function () {
      uiStatsFilterCollapsed = false;
      renderStatsPanel();
    });
  }
  const collapseBtn = document.getElementById('statsFCollapse');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', function () {
      uiStatsFilterCollapsed = true;
      renderStatsPanel();
    });
  }
  if (uiStatsFilterCollapsed) return;
  const rangeSel = document.getElementById('statsFRange');
  if (rangeSel) rangeSel.addEventListener('change', function () {
    f.range = rangeSel.value; rerender();
  });
  const monthEl = document.getElementById('statsFMonth');
  if (monthEl) monthEl.addEventListener('change', function () {
    f.month = monthEl.value; rerender();
  });
  const fromEl = document.getElementById('statsFDateFrom');
  if (fromEl) fromEl.addEventListener('change', function () {
    f.dateFrom = fromEl.value; rerender();
  });
  const toEl = document.getElementById('statsFDateTo');
  if (toEl) toEl.addEventListener('change', function () {
    f.dateTo = toEl.value; rerender();
  });
  state.courses.forEach(function (c) {
    if (!isSafeElId(c.id)) return;   // 1.15 子项③：脏 id 不绑定
    const box = document.getElementById('statsFCourse-' + c.id);
    if (!box) return;
    box.addEventListener('change', function () {
      if (box.checked) f.courses[c.id] = true; else delete f.courses[c.id];
      rerender();
    });
  });
  state.courseTypes.forEach(function (t) {
    const box = document.getElementById('statsFType-' + t.id);
    if (!box) return;
    box.addEventListener('change', function () {
      if (box.checked) f.types[t.id] = true; else delete f.types[t.id];
      rerender();
    });
  });
  const exEl = document.getElementById('statsFExCancel');
  if (exEl) exEl.addEventListener('change', function () {
    f.excludeCanceled = !!exEl.checked; rerender();
  });
  const settleEl = document.getElementById('statsFSettle');
  if (settleEl) settleEl.addEventListener('change', function () {
    f.settleFilter = settleEl.value; rerender();
  });

  /* 四期⑨：状态筛选变更即重渲染（纯 UI 投影，零数据写入） */
  const statusEl = document.getElementById('statsFStatus');
  if (statusEl) statusEl.addEventListener('change', function () {
    f.statusFilter = statusEl.value; rerender();
  });
  const resetEl = document.getElementById('statsFReset');
  if (resetEl) resetEl.addEventListener('click', onStatsFilterReset);
  const exportEl = document.getElementById('statsFExport');
  if (exportEl) exportEl.addEventListener('click', function () {
    const list = statsFilterIncludedInstances(cal, f);
    downloadTextFile('教员台_统计筛选_' + fileDateStamp() + '.csv',
      exportFilteredStatsCsv(list), 'text/csv;charset=utf-8');
  });
}

/** 重置筛选：一键恢复默认态（本学期 + 2.2 口径） */

function onStatsFilterReset() {
  uiStatsFilter = defaultStatsFilter();
  uiStatsCourseId = null;
  uiStatsHcId = null;
  uiStatsSettleId = null;
  renderStatsPanel();
}

/** 结算单元格文本（钻取明细用）：值 + 来源标注（R6 三来源溯源：规则版本 / 手动 / 留空） */

function settledCellText(inst) {
  if (inst.settledHours === null || inst.settledHours === undefined) return '—';
  // 四期⑧ 项 7：manual 显示分支「手工 N 学时」，不走 vN 反查（R6 三来源之手动）
  if (inst.settleMode === 'manual') return '手工 ' + inst.settledHours + ' 学时';
  // 四期⑧ 项 9：ruleVersion(r-3) 反查版本号显 vN；停用版仍可反查（停用≠删除）；脏引用回落原样
  if (inst.ruleVersion) {
    const lbl = ruleVersionLabel(inst.ruleVersion);
    return inst.settledHours + ' (' + (lbl || inst.ruleVersion) + ')';
  }
  return String(inst.settledHours);
}

/** 统计面板主渲染：四格统计卡 + 按课程汇总表 + 行内钻取明细 */

function renderStatsPanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导（与既有面板一致）

  uiStatsFilter = uiStatsFilter || defaultStatsFilter();   // 复审修复：外部置空时复位默认态（render 与筛选区共用同一引用）
  const isSemester = uiStatsFilter.range === 'semester';   // 拍板 d：进度列仅本学期范围显示
  const included = statsFilterIncludedInstances(cal, uiStatsFilter);
  const rows = courseStatsRowsFrom(included);
  const totalNominal = round2(included.reduce(function (s, x) { return s + x.nominalHours; }, 0));   // 1.16 子项②：卡面合计同口径收口
  const settledList = included.filter(function (x) {
    return x.settledHours !== null && x.settledHours !== undefined; });
  const totalSettled = round2(settledList.reduce(function (s, x) { return s + x.settledHours; }, 0));

  /* 四期⑪ 主三卡（总学时/理论/实训，拆分口径与 §12.4 同源：instTypeIdOf 解析链 +
     lab/practice 归实训档，round2 收口）；结算口径降级为卡下次级行——全空显「—」
     （D10/R6 原口径逐字保留），未结算角标维持汇总行 badge-warn（收入钻取，2.2 既有） */
  const totalTheory = round2(rows.reduce(function (s, r) { return s + r.theoryNominal; }, 0));
  const totalLab = round2(rows.reduce(function (s, r) { return s + r.labNominal; }, 0));
  const cards = [
    { label: '总学时', value: totalNominal, unit: '学时' },
    { label: '理论', value: totalTheory, unit: '学时' },
    { label: '实训', value: totalLab, unit: '学时' }
  ];
  const cardsHtml = '<div class="stats-grid">' + cards.map(function (c) {
    return '<div class="stat-card"><div class="stat-label">' + c.label + '</div>' +
      '<div class="stat-num">' + (c.value === null ? '—' : c.value +
        '<span class="stat-unit">' + c.unit + '</span>') + '</div></div>';
  }).join('') + '</div>' +
    '<div class="stat-sub">已上流水 ' + included.length + ' 条 · ' + rows.length +
      ' 门课程 · 结算 ' + (settledList.length ? totalSettled + ' 学时' : '—') + '</div>';

  /* 汇总表（四期⑪ 维度切换）：按课程 = 课程/班级/类型/条数/名义/结算（空显「—」）/
     未结算角标/理论/实训/进度（仅本学期）/明细；按班级 = 班级整串聚合（entryClassesOf
     回落链，空归「未设班级」）同名数值口径，名义降序，无钻取（钻取按课程） */
  const courseClsText = function (cid) {
    const set = {};
    included.forEach(function (x) {
      if (x.courseId !== cid) return;
      const en = state.entries.find(function (e) { return e.id === x.entryId; });
      const s = entryClassesOf(en || null);
      if (s) set[s] = true;
    });
    return Object.keys(set).join('、');
  };
  let tableHtml;
  if (uiStatsGroupBy === 'classes') {
    const clsRows = classesStatsRowsFrom(included);
    const clsBody = clsRows.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.classes) + '</td>' +
        '<td>' + r.count + '</td>' +
        '<td>' + r.nominal + '</td>' +
        '<td>' + (r.settledCount ? r.settled + ' 学时' : '—') + '</td>' +
        '<td>' + r.theoryNominal + '</td>' +
        '<td>' + r.labNominal + '</td>' +
      '</tr>';
    }).join('');
    tableHtml = clsRows.length
      ? '<h3 class="section-subtitle">按班级汇总（' + clsRows.length + ' 个班）</h3>' +
        '<div class="import-preview"><table>' +
        '<thead><tr><th scope="col">班级</th><th scope="col">流水条数</th><th scope="col">名义学时</th>' +
        '<th scope="col">结算学时</th><th scope="col">理论</th><th scope="col">实训</th></tr></thead>' +
        '<tbody>' + clsBody + '</tbody></table></div>'
      : emptyStateHtml('当前筛选条件下没有计入统计的授课流水' +
        '（临时停课默认不计入，可在上方筛选区关闭「排除临时停课」开关）。',
        '<button type="button" class="btn-primary btn-auto" id="btnStatsEmptyReset">重置筛选</button>',
        ICON_STATS);
  } else if (!rows.length) {
    tableHtml = emptyStateHtml('当前筛选条件下没有计入统计的授课流水' +
      '（临时停课默认不计入，可在上方筛选区关闭「排除临时停课」开关）。',
      '<button type="button" class="btn-primary btn-auto" id="btnStatsEmptyReset">重置筛选</button>',
      ICON_STATS);
  } else {
    const body = rows.map(function (r) {
      const course = state.courses.find(function (c) { return c.id === r.courseId; });
      const name = course ? course.name : '未知课程';
      const typeName = course ? courseTypeName(course.typeId) : '理论';
      const clsText = courseClsText(r.courseId);
      const unsettled = r.count - r.settledCount;
      const badge = unsettled
        ? ' <span class="paste-badge badge-warn">' + unsettled + ' 条未结算</span>' : '';
      // 四期⑧ 项 6 有效人口覆盖线（角标）：当前筛选计入口径内人数未录条数
      const unrecHc = included.filter(function (x) {
        return x.courseId === r.courseId &&
          (x.headcount === null || x.headcount === undefined);
      }).length;
      const active = uiStatsCourseId === r.courseId;
      const prog = isSemester   // 拍板 d：进度 = 已上（date ≤ 今天）/ 应上（计入流水总数）
        ? progressOfInstances(included.filter(function (x) { return x.courseId === r.courseId; }))
        : null;
      return '<tr>' +
        '<td>' + escapeHtml(name) + '</td>' +
        '<td>' + (clsText ? escapeHtml(clsText) : '—') + '</td>' +   // 四期⑪ 班级列（回落链去重串）
        '<td>' + escapeHtml(typeName) + '</td>' +
        '<td>' + r.count +
          (unrecHc ? ' <span class="paste-badge badge-warn">' + unrecHc + ' 条未录人数</span>' : '') +
        '</td>' +
        '<td>' + r.nominal + '</td>' +
        '<td>' + (r.settledCount ? r.settled + badge : '—' + badge) + '</td>' +
        '<td>' + r.theoryNominal + '</td>' +
        '<td>' + r.labNominal + '</td>' +
        // W4-F（问题列表 #160）：进度列补轻量比例条——宽度 = 已上/应上 百分比（纯 CSS，
        // 复用主色与底色变量，零新增色板）；文字口径（已上（含今天）/ 应上）逐字不变
        (prog ? '<td><div class="stat-prog"><span class="stat-prog-text">已上（含今天） ' +
          prog.done + ' / 应上 ' + prog.total + '</span><span class="stat-prog-bar"><i style="width:' +
          (prog.total ? Math.min(100, Math.round(prog.done / prog.total * 100)) : 0) +
          '%"></i></span></div></td>' : '') +
        '<td><button type="button" class="btn-sec" id="btnStatsDrill-' +
          escapeHtml(r.courseId) + '" aria-expanded="' + (active ? 'true' : 'false') + '" aria-controls="statsDrillWrap">' + (active ? '收起' : '明细') + '</button></td>' +
      '</tr>';
    }).join('');
    tableHtml = '<div class="import-preview"><table>' +
      '<thead><tr><th scope="col">课程</th><th scope="col">班级</th><th scope="col">类型</th><th scope="col">流水条数</th>' +
      '<th scope="col">名义学时</th><th scope="col">结算学时</th><th scope="col">理论</th><th scope="col">实训</th>' +
      (isSemester ? '<th scope="col">进度（已上/应上）</th>' : '') +
      '<th scope="col">明细</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head"><h2>统计面板</h2>' +
          '<div class="panel-head-ops">' +
            // 四期⑪ 汇总维度切换（按课程 ↔ 按班级，纯 UI 态）
            '<button type="button" class="btn-sec" id="btnStatsGroupBy">' +
              (uiStatsGroupBy === 'classes' ? '按课程汇总' : '按班级汇总') + '</button>' +
            // 四期②打印版式：打印口径回显行（print-echo 屏幕隐藏、@media print 显示）+ 打印按钮（btn-sec，R3）
            '<button type="button" class="btn-sec" id="btnStatsPrint">打印统计表</button>' +
          '</div></div>' +
        '<p class="print-echo">筛选口径（打印）：' +
          escapeHtml(statsFilterEchoText(uiStatsFilter, cal)) + '</p>' +
        statsFilterHtml(cal) +
        cardsHtml +
        '<p class="form-hint">名义学时 = 课表上每次课排定的学时；结算学时 = 按「结算规则」换算后用于报账的学时（无规则或停课时留空「—」，绝不出现没有来源的数字）。</p>' +
        (rows.length ? '<h3 class="section-subtitle">按课程汇总（' + rows.length + ' 门）</h3>' : '') +
        tableHtml +
        (uiStatsCourseId ? statsDrillHtml(included, uiStatsCourseId) : '') +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);
  bindStatsFilter(cal);
  const btnStatsEmptyReset = document.getElementById('btnStatsEmptyReset');
  if (btnStatsEmptyReset) btnStatsEmptyReset.addEventListener('click', onStatsFilterReset);
  // 四期⑪ 汇总维度切换：切前清空钻取/行内编辑态（钻取按课程，按班级模式无钻取）
  const btnStatsGroupBy = document.getElementById('btnStatsGroupBy');
  if (btnStatsGroupBy) btnStatsGroupBy.addEventListener('click', function () {
    uiStatsGroupBy = (uiStatsGroupBy === 'classes') ? 'course' : 'classes';
    uiStatsCourseId = null;
    uiStatsHcId = null;
    uiStatsSettleId = null;
    renderStatsPanel();
  });
  // 四期②打印版式：统计表打印入口（与周格「打印本周」同一 printCurrentView 链路）
  const btnStatsPrint = document.getElementById('btnStatsPrint');
  if (btnStatsPrint) btnStatsPrint.addEventListener('click', function () { printCurrentView(); });
  rows.forEach(function (r) {
    if (!isSafeElId(r.courseId)) return;   // 1.15 子项③：脏 id 不绑定
    const btn = document.getElementById('btnStatsDrill-' + r.courseId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      uiStatsCourseId = (uiStatsCourseId === r.courseId) ? null : r.courseId;
      uiStatsHcId = null;
      uiStatsSettleId = null;
      renderStatsPanel();
    });
  });
  /* 四期⑧ 钻取行内编辑绑定：人数 / 结算覆盖（脏 id 与停课行不渲染不绑定） */
  if (uiStatsCourseId) {
    const drillList = included.filter(function (x) { return x.courseId === uiStatsCourseId; });
    drillList.forEach(function (inst) {
      if (!isSafeElId(inst.id) || inst.status === 'canceled') return;
      const bHc = document.getElementById('btnStatsHc-' + inst.id);
      if (bHc) bHc.addEventListener('click', function () {
        uiStatsHcId = (uiStatsHcId === inst.id) ? null : inst.id;
        uiStatsSettleId = null;
        renderStatsPanel();
      });
      const bSt = document.getElementById('btnStatsSettle-' + inst.id);
      if (bSt) bSt.addEventListener('click', function () {
        uiStatsSettleId = (uiStatsSettleId === inst.id) ? null : inst.id;
        uiStatsHcId = null;
        renderStatsPanel();
      });
      const bRestore = document.getElementById('btnStatsSettleRestore-' + inst.id);   // W1 #295
      if (bRestore) bRestore.addEventListener('click', function () {
        onStatsSettleRestoreClick(inst.id);
      });
    });
    const hcForm = document.getElementById('statsHcForm');
    if (hcForm) hcForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      onStatsHcSaveClick(uiStatsHcId);
    });
    const stForm = document.getElementById('statsSettleForm');
    if (stForm) stForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      onStatsSettleSaveClick(uiStatsSettleId);
    });
    const hcBack = document.getElementById('btnStatsHcBack');
    if (hcBack) hcBack.addEventListener('click', function () {
      uiStatsHcId = null;
      renderStatsPanel();
    });
    const stBack = document.getElementById('btnStatsSettleBack');
    if (stBack) stBack.addEventListener('click', function () {
      uiStatsSettleId = null;
      renderStatsPanel();
    });
  }
}

/** 钻取明细：该课程在当前筛选计入口径内的流水（插单 1.20 起尊重筛选），日期升序全量；结算列带来源标注（R6 溯源） */

function statsDrillHtml(included, courseId) {
  const course = state.courses.find(function (c) { return c.id === courseId; });
  const list = included
    .filter(function (x) { return x.courseId === courseId; })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  const body = list.map(function (inst) {
    const tag = inst.status !== 'normal'
      ? ' <span class="wg-tag tag-' + inst.status + '">' + WEEK_STATUS_NAMES[inst.status] + '</span>'
      : '正常';
    // 四期④c（B.10-2.4）：调课留痕原定日期可见
    const fromNote = (inst.status === 'moved' && inst.movedFromDate)
      ? '<br><span class="factor-hint">原定 ' + escapeHtml(inst.movedFromDate) + '</span>' : '';
    return '<tr>' +
      '<td>' + escapeHtml(inst.date) + '</td>' +
      '<td>第 ' + inst.weekNo + ' 周</td>' +
      '<td>' + escapeHtml(inst.periods) + '</td>' +
      '<td>' + (inst.location ? escapeHtml(inst.location) : '—') + '</td>' +
      '<td>' + tag + fromNote + '</td>' +
      '<td>' + (inst.headcount === null || inst.headcount === undefined
        ? '未录入' : inst.headcount) + '</td>' +
      '<td>' + inst.nominalHours + '</td>' +
      '<td>' + settledCellText(inst) + '</td>' +
      // 四期⑧ 项 5/7：操作列——人数 / 结算行内编辑入口（停课行无入口，Q2；脏 id 沿用 1.15 防线）
      // W4-F（问题列表 #294）：操作列留痕悬浮可见——overrideNote 进 title（复用悬浮提示既有模式）
      '<td' + (inst.overrideNote ? ' title="留痕：' + escapeHtml(inst.overrideNote) + '"' : '') +
      '>' + ((inst.status === 'canceled' || !isSafeElId(inst.id))
        ? '—'
        : '<button type="button" class="btn-sec" id="btnStatsHc-' + escapeHtml(inst.id) +
          '">人数</button>' +
          '<button type="button" class="btn-sec" id="btnStatsSettle-' + escapeHtml(inst.id) +
          '" style="margin-left:6px">结算</button>' +
          // W1 #295/#296（2026-09-19 问题列表裁决）：manual 覆盖可回退——恢复按规则
          // 结算入口（确认后执行；有版本重算回写 ruleVersion，无版本 D10 留空）
          (inst.settleMode === 'manual'
            ? '<button type="button" class="btn-sec" id="btnStatsSettleRestore-' +
              escapeHtml(inst.id) + '" style="margin-left:6px">恢复规则结算</button>'
            : '')) +
      '</td>' +
    '</tr>';
  }).join('');
  // 四期⑧ 项 6 有效人口覆盖线（钻取小字）+ 项 5/7 行内编辑表单区
  const recCount = list.filter(function (x) {
    return x.headcount !== null && x.headcount !== undefined;
  }).length;
  let editHtml = '';
  if (uiStatsHcId) {
    const t = list.find(function (x) { return x.id === uiStatsHcId; });
    if (t) editHtml += '<div class="today-ops" style="margin-top:10px">' +
      statsHcFormHtml(t) + '</div>';
  }
  if (uiStatsSettleId) {
    const t2 = list.find(function (x) { return x.id === uiStatsSettleId; });
    if (t2) editHtml += '<div class="today-ops" style="margin-top:10px">' +
      statsSettleFormHtml(t2) + '</div>';
  }
  return '<div class="stats-drill" id="statsDrillWrap">' +
    '<h3 class="section-subtitle">' + escapeHtml(course ? course.name : '未知课程') +
    ' · 流水明细（' + list.length + ' 条）</h3>' +
    '<p class="form-hint">人数已录 ' + recCount + '/' + list.length +
    ' 条（未录条目可在「操作」列补录：填写或清除都需填写原因，自动留痕）。</p>' +
    '<div class="import-preview"><table>' +
      '<thead><tr><th scope="col">日期</th><th scope="col">周次</th><th scope="col">节次</th><th scope="col">地点</th><th scope="col">状态</th>' +
      '<th scope="col">人数</th><th scope="col">名义学时</th><th scope="col">结算（来源）</th><th style="width:130px">操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' + editHtml + '</div>';
}

/**
 * 钻取行内人数表单（四期⑧ 项 5，B.10-1.3 拍板组合方案——主入口=统计钻取行内编辑，
 * 任意日期可补录）：留空 = 清除为未录入；值或清除**原因都必填**（不留默认可跳过），
 * 落库 headcount + frozen + overrideNote（清除前缀「清除人数：」，裁决书修正意见 4）。
 */
function statsHcFormHtml(inst) {
  return (
    '<form id="statsHcForm" class="cal-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="statsHcValue">学生人数（留空 = 清除为未录入；当前：' +
            (inst.headcount === null || inst.headcount === undefined
              ? '未录入' : inst.headcount + ' 人') + '）</label>' +
          '<input id="statsHcValue" type="number" min="0" max="500" inputmode="numeric" enterkeyhint="done" value="">' +
        '</div>' +
        '<div class="field">' +
          '<label for="statsHcNote">修改原因（必填，留痕备查）</label>' +
          '<input id="statsHcNote" type="text" maxlength="100" aria-required="true" aria-describedby="statsHcError" value="">' +
        '</div>' +
      '</div>' +
      '<div class="form-error" id="statsHcError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">保存人数</button>' +
        '<button type="button" class="btn-sec" id="btnStatsHcBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/** 钻取行内结算覆盖表单（四期⑧ 项 7，B.10-2.1 闭环 R6 第三来源「手动覆盖」）：值+原因必填。 */
function statsSettleFormHtml(inst) {
  return (
    '<form id="statsSettleForm" class="cal-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="statsSettleValue">结算学时（手动覆盖；当前：' +
            settledCellText(inst) + '）</label>' +
          '<input id="statsSettleValue" type="number" min="0" step="0.1" aria-required="true" aria-describedby="statsSettleError" inputmode="decimal" enterkeyhint="done" value="">' +
        '</div>' +
        '<div class="field">' +
          '<label for="statsSettleNote">覆盖原因（必填，留痕备查）</label>' +
          '<input id="statsSettleNote" type="text" maxlength="100" aria-required="true" aria-describedby="statsSettleError" value="">' +
        '</div>' +
      '</div>' +
      '<div class="form-error" id="statsSettleError" role="alert"></div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">保存结算覆盖</button>' +
        '<button type="button" class="btn-sec" id="btnStatsSettleBack">返回</button>' +
      '</div>' +
    '</form>'
  );
}

/**
 * 人数快照提交（四期⑧ 项 5，D3 快照制 + §7 不变式④）：任意日期流水可补录/清除——
 * frozen=true 后引擎重跑不还原人数（Q3 规则 2），重算结算照用新人数（Q5）。
 */
function onStatsHcSaveClick(instId) {
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst) return;
  const errBox = document.getElementById('statsHcError');
  if (inst.status === 'canceled') {
    errBox.textContent = '停课记录不维护人数。'; return;
  }
  const reason = String((document.getElementById('statsHcNote') || {}).value || '').trim();
  if (!reason) { errBox.textContent = '请填写修改原因（留痕备查）。'; return; }
  const raw = String((document.getElementById('statsHcValue') || {}).value || '').trim();
  if (raw === '') {
    inst.headcount = null;
    inst.overrideNote = '清除人数：' + reason;
  } else {
    const n = parseStrictIntInput(raw);
    if (!(Number.isInteger(n) && n >= 0 && n <= 500)) {
      errBox.textContent = '人数需为 0–500 的整数，或留空表示清除。'; return;
    }
    inst.headcount = n;
    inst.overrideNote = reason;
  }
  inst.frozen = true;
  inst.updatedAt = nowIso();
  uiStatsHcId = null;
  saveState();
  renderStatsPanel();
  showBanner('人数快照已更新并留痕（' +
    (inst.headcount === null ? '已清除' : inst.headcount + ' 人') + '）。', 'success');
}

/**
 * 手动结算覆盖提交（四期⑧ 项 7，R6 三来源闭环之「手动覆盖留痕」）：五字段写点
 * settledHours / settleMode='manual' / ruleVersion=null / frozen / overrideNote；
 * 停课流水拒绝（Q2）；recomputeSettledHours 本就不触碰 manual（Q5 边界，现状兼容）。
 */
function onStatsSettleSaveClick(instId) {
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst) return;
  const errBox = document.getElementById('statsSettleError');
  if (inst.status === 'canceled') {
    errBox.textContent = '停课记录没有结算，不可手动结算。'; return;
  }
  const reason = String((document.getElementById('statsSettleNote') || {}).value || '').trim();
  if (!reason) { errBox.textContent = '请填写覆盖原因（留痕备查）。'; return; }
  const raw = String((document.getElementById('statsSettleValue') || {}).value || '').trim();
  const v = parseStrictFloatInput(raw);
  if (raw === '' || !(isFinite(v) && v >= 0)) {
    errBox.textContent = '结算学时需为不小于 0 的数字。'; return;
  }
  inst.settledHours = round2(v);
  inst.settleMode = 'manual';
  inst.ruleVersion = null;   // 来源已非规则算出，版本留痕清空（R6 溯源唯一）
  inst.frozen = true;
  inst.overrideNote = reason;
  inst.updatedAt = nowIso();
  uiStatsSettleId = null;
  saveState();
  renderStatsPanel();
  showBanner('结算学时已手动覆盖为 ' + inst.settledHours + '（已留痕，规则重算不改动）。', 'warn');
}

/**
 * 恢复按规则结算（W1 #295/#296，R6 第三来源闭环）：manual 覆盖可回退——需确认后执行
 * （裁决：覆盖回退显式确认，R7）；有生效版本 → 按 ruleForDate 走 computeSettledHours
 * 同链重算，置 settleMode='rule' 并回写 ruleVersion（D2 按学期锁定落痕）；无版本 →
 * 三字段清空（D10 降级留空）；frozen 保持 true、overrideNote 留痕。停课流水无此入口
 * （Q2，操作列本就不渲染）。
 */
function onStatsSettleRestoreClick(instId) {
  const inst = state.instances.find(function (x) { return x.id === instId; });
  if (!inst || inst.settleMode !== 'manual' || inst.status === 'canceled') return;
  // W4-D：动作收进确认回调（桩/沙盒同步执行，原生环境弹层确认后执行）
  confirmDelete('恢复按规则结算将清除本次手动覆盖（原值 ' + inst.settledHours +
    ' 学时），改按当前规则重新计算，确定执行？', function () {
    const rule = ruleForDate(inst.date);
    if (rule) {
      inst.settledHours = computeSettledHours(inst, rule);
      inst.settleMode = 'rule';
      inst.ruleVersion = rule.id;
    } else {
      inst.settledHours = null;
      inst.settleMode = null;
      inst.ruleVersion = null;
    }
    inst.frozen = true;
    inst.overrideNote = '恢复按规则结算（原手动覆盖已回退）';
    inst.updatedAt = nowIso();
    saveState();
    renderStatsPanel();
    showBanner('已恢复按规则结算：' + inst.settledHours + ' 学时' +
      (rule ? '' : '（当前无生效规则，留空）') + '，原手动覆盖已留痕回退。', 'success');
  });
}

/* ============================================================
   四之十一、对账核对（二期 2.3；显示名，原「对账间」）
   依据附录A §9 + D10 + R6/R7 + 2026-09-18 用户拍板（变更记录 v1.19）：
    - 对照口径 = 名义学时月度投影（projectMonthNominalHours，与附录A §12.4 同源精神：
      自然月串前缀 / 含 normal·moved·makeup / 排除 canceled / 名义学时求和，D10 降级兼容——
      规则未定时结算留空，对账不依赖结算，R6 无来源数字禁止）；
    - R4 演进声明：不写新表、不改既有表结构——reconciles 为附录A §1 既有空表本轮首写，
      仅记录级新增 updatedAt 留痕字段（旧数据缺省兼容），schemaVersion 维持 1，零迁移；
      不加 calendarId（月份串全局唯一，2026-09-18 用户裁定）；
    - 一月一条：month 为唯一键，重复录入原位覆盖 + updatedAt 刷新（覆盖留痕）；
    - 差异判定：|本系统 − 教务| ≤ settings.reconcileTolerance（默认 0.5）绿色「一致」角标，
      超出黄色「差异」提醒（R7 不弹窗）；
    - 可录入月份钳制在当前校历 [起始月, 结束月]；待对账提示 = 当前校历有计入流水
      （status≠canceled）但尚未录入的月份；
    - 本轮不含删除（用户裁定 d）：录错覆盖修正即可；删除属不可逆操作，如需另起插单轮（R7）。
   ============================================================ */

/** 对账核对编辑态：当前编辑的月份（null = 新录入模式） */

let uiReconcileMonth = null;

/** 顶栏「对账」入口图标（线性 SVG，R3） */

function renderReconcilePanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导（与既有面板一致）

  const tolerance = isFinite(state.settings.reconcileTolerance)
    ? state.settings.reconcileTolerance : 0.5;
  const range = reconcileMonthRange(cal);
  const records = state.reconciles.slice().sort(function (a, b) {
    return String(a.month).localeCompare(String(b.month));
  });

  /* 待对账月份：当前校历有计入流水、但尚未录入教务数据的月份 */
  const taught = {};
  state.instances.forEach(function (inst) {
    if (inst.calendarId !== cal.id || inst.status === 'canceled') return;
    taught[String(inst.date).slice(0, 7)] = true;
  });
  const missing = Object.keys(taught).filter(function (m) {
    return !records.some(function (r) { return r.month === m; });
  }).sort();

  /* 一月一条防御：JSON 合并导入（无 id 表整条去重）可能引入同月多条——
     展示与编辑统一按「同月 updatedAt 新者胜」收敛（缺 updatedAt 视为最旧，D7 精神） */
  const byMonth = {};
  records.forEach(function (r) {
    const cur = byMonth[r.month];
    if (!cur || String(r.updatedAt || '') > String(cur.updatedAt || '')) byMonth[r.month] = r;
  });
  const uniqRecords = Object.keys(byMonth).sort().map(function (m) { return byMonth[m]; });

  const rowsHtml = uniqRecords.length
    ? '<div class="cal-list">' + uniqRecords.map(function (r) {
        const off = isFinite(r.officialHours) ? r.officialHours : 0;
        const sys = projectMonthNominalHours(r.month);
        const diff = round2(sys - off);
        const ok = Math.abs(diff) <= tolerance;
        return '<div class="cal-card">' +
          '<div class="cal-card-main">' +
            '<div class="cal-card-name">' + escapeHtml(r.month) +
              (ok ? '<span class="paste-badge badge-new">一致</span>'
                  : '<span class="paste-badge badge-warn">差异 ' +
                    (diff > 0 ? '+' : '') + diff + '</span>') + '</div>' +
            '<div class="cal-card-meta">本系统名义学时 ' + sys + ' · 教务 ' +   // 四期④c（B.10-2.7）：名义投影口径消歧
              escapeHtml(off) + ' 学时' +
              (r.note ? ' · ' + escapeHtml(r.note) : '') + '</div>' +
          '</div>' +
          '<div class="cal-card-actions">' +
            '<button type="button" class="btn-sec" id="btnReconEdit-' +
              escapeHtml(r.month) + '">编辑</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>'
    // W6-6 列表批：空状态三件套收口——对账空态走统一出口补语义图标（表单在上方常驻，不加重复 CTA）
    : emptyStateHtml('尚未录入任何月份的对账数据。下一步：在上方表单选择月份、填入教务口径学时，系统将自动与本系统统计对照。', '', ICON_RECON);

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head"><h2>对账核对</h2>' +
          // W4-F（问题列表 #30 / B.12-4.4 文档承诺缺口）：对账容差设置项——
          // 0.1 步进写入 settings.reconcileTolerance（既有字段，零 schema 变更），差异判定即时按新容差重判
          '<div class="panel-head-ops">' +
            '<label class="factor-hint" for="reconTolInput">容差（学时）</label>' +
            '<input id="reconTolInput" type="number" min="0" step="0.1" ' +
              'value="' + tolerance + '" aria-label="对账容差（学时）" style="width:76px" inputmode="decimal" enterkeyhint="done">' +
            '<button type="button" class="btn-sec" id="btnReconTolSave">保存容差</button>' +
          '</div></div>' +
        '<p class="form-hint">把教务系统里查到的当月学时填进来，系统自动与课表对照：差值在容差以内标绿「一致」，超出容差标黄提醒。</p>' +
        '<div class="form-hint">对照口径：名义学时（自然月 / 含调课与补课 / 排除临时停课，' +
          '与业绩导出口径同源）；容差 ' + tolerance + ' 学时以内视为一致。' +
          '可录入月份：' + escapeHtml(range.min) + ' ~ ' + escapeHtml(range.max) + '。</div>' +
        '<div id="reconFormWrap"></div>' +
        (missing.length
          ? '<div class="form-hint">本学期尚有 ' + missing.length +
            ' 个月未对账：' + missing.map(escapeHtml).join('、') + '。</div>'
          : '') +
        rowsHtml +
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);
  renderReconForm(uniqRecords);
  const btnTolSaveW4F = document.getElementById('btnReconTolSave');
  if (btnTolSaveW4F) btnTolSaveW4F.addEventListener('click', onReconTolSaveClick);
  uniqRecords.forEach(function (r) {
    if (!isSafeElId(r.month)) return;   // 1.15 子项③：脏 id 不绑定
    const btn = document.getElementById('btnReconEdit-' + r.month);
    if (!btn) return;
    btn.addEventListener('click', function () {
      uiReconcileMonth = r.month;
      renderReconcilePanel();
    });
  });
}

/** 渲染录入/编辑表单（编辑对象由 uiReconcileMonth 决定；复用 cal-form 体系） */

function renderReconForm(records) {
  const wrap = document.getElementById('reconFormWrap');
  if (!wrap) return;
  const editing = uiReconcileMonth
    ? records.find(function (r) { return r.month === uiReconcileMonth; })
    : null;
  if (uiReconcileMonth && !editing) { uiReconcileMonth = null; renderReconcilePanel(); return; }
  const rec = editing || { month: '', officialHours: '', note: '' };

  wrap.innerHTML =
    '<div class="cal-form-card">' +
      '<h3>' + (editing ? '编辑对账记录' : '录入对账数据') + '</h3>' +
      '<form id="reconForm" class="cal-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="reconMonth">对账月份</label>' +
            '<input id="reconMonth" type="month" value="' + escapeHtml(rec.month) + '"' +
              (editing ? ' disabled' : '') + ' aria-required="true" aria-describedby="reconFormError"' + '>' +
          '</div>' +
          '<div class="field">' +
            '<label for="reconHours">教务口径学时</label>' +
            '<input id="reconHours" type="number" min="0" step="0.5" aria-required="true" aria-describedby="reconFormError" value="' +
              escapeHtml(rec.officialHours) + '" inputmode="decimal" enterkeyhint="done">' +
          '</div>' +
          '<div class="field full">' +
            '<label for="reconNote">差异说明（选填）</label>' +
            '<input id="reconNote" type="text" maxlength="100" value="' +
              escapeHtml(rec.note) + '">' +
          '</div>' +
        '</div>' +
        '<p class="hint-line">一月一条：同月重复录入将原位覆盖旧值并刷新留痕时间；' +
          '可录入月份限当前校历起止月之间。</p>' +
        '<div class="form-error" id="reconFormError" role="alert"></div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn-primary btn-auto">' +
            (editing ? '保存修改' : '录入对账') + '</button>' +
          (editing ? '<button type="button" class="btn-sec" id="reconFormCancel">取消编辑</button>' : '') +
        '</div>' +
      '</form>' +
    '</div>';

  const reconFormEl = document.getElementById('reconForm');
  reconFormEl.addEventListener('submit', onReconSubmit);
  reconFormEl.addEventListener('input', function () { reconFormEl.__submitting = false; });
  const cancel = document.getElementById('reconFormCancel');
  if (cancel) cancel.addEventListener('click', function () {
    uiReconcileMonth = null;
    renderReconcilePanel();
  });
  clearFormInvalid(['reconMonth', 'reconHours', 'reconNote']);   // 四期⑦
}

/**
 * 对账容差保存（W4-F，问题列表 #30 / B.12-4.4）：严格浮点解析、≥ 0——写
 * settings.reconcileTolerance（附录A §2 既有字段，零 schema 变更，R4），落库并即时
 * 重判差异（差异判定读取同一字段，口径唯一）；非法值人话横幅拒绝、数据不动。
 */
function onReconTolSaveClick() {
  const elW4F = document.getElementById('reconTolInput');
  const vW4F = parseStrictFloatInput(elW4F ? elW4F.value : '');
  if (!(isFinite(vW4F) && vW4F >= 0)) {
    showBanner('对账容差需为不小于 0 的数字（如 0.5）。', 'warn'); return;
  }
  state.settings.reconcileTolerance = vW4F;
  saveState();
  renderReconcilePanel();
  showBanner('对账容差已保存为 ' + vW4F + ' 学时：|本系统 − 教务| ≤ ' + vW4F + ' 判为「一致」。', 'success');
}

/**
 * 对账提交：month 限 YYYY-MM 且落在当前校历 [起始月, 结束月]；officialHours ≥ 0；
 * note 选填。一月一条——同月已存在则原位覆盖 + updatedAt 刷新（覆盖留痕，裁定 c），
 * 否则新增；落库后横幅汇报结果（R7 不弹窗）。
 */

function onReconSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：真实 DOM 提交即锁定表单（重复提交直接忽略）；输入任一字段即解锁，
  // 校验失败改后可重试；测试桩无 target 时不拦截（mock 断言环境行为逐字节不变）
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const cal = getActiveCalendar();
  if (!cal) return;
  const errBox = document.getElementById('reconFormError');
  const range = reconcileMonthRange(cal);

  const monthEl = document.getElementById('reconMonth');
  const month = uiReconcileMonth || (monthEl ? monthEl.value : '');
  const hoursRaw = document.getElementById('reconHours').value.trim();
  const note = document.getElementById('reconNote').value.trim();

  if (!/^\d{4}-\d{2}$/.test(month)) { formErrorAt(errBox, '请选择对账月份。', 'reconMonth'); return; }
  if (month < range.min || month > range.max) {
    formErrorAt(errBox, '对账月份需在 ' + range.min + ' ~ ' + range.max + ' 之间。', 'reconMonth'); return;
  }
  const hours = parseStrictFloatInput(hoursRaw);
  if (!(isFinite(hours) && hours >= 0)) {
    formErrorAt(errBox, '教务口径学时需为不小于 0 的数字。', 'reconHours'); return;
  }

  /* 一月一条写点强制（1.16 子项③：与 2.3 展示口径同语义）——先把同月多条收敛到
     updatedAt 最新一条（缺 updatedAt 视为最旧）再覆盖，其余同月记录清除 */
  const sameMonth = state.reconciles.filter(function (r) { return r.month === month; });
  let existing = null;
  sameMonth.forEach(function (r) {
    if (!existing || String(r.updatedAt || '') > String(existing.updatedAt || '')) existing = r;
  });
  const ts = nowIso();
  if (existing) {
    existing.officialHours = hours;
    existing.note = note;
    existing.updatedAt = ts;   // 覆盖留痕（裁定 c：一月一条，updatedAt 刷新）
    state.reconciles = state.reconciles.filter(function (r) {
      return r.month !== month || r === existing;
    });
  } else {
    state.reconciles.push({ month: month, officialHours: hours, note: note, updatedAt: ts });
  }

  uiReconcileMonth = null;
  saveState();
  renderReconcilePanel();
  showBanner(existing
    ? month + ' 对账记录已更新（原数据已覆盖，留痕备查）。'
    : month + ' 对账记录已录入：本系统名义学时 ' + projectMonthNominalHours(month) +
      ' · 教务 ' + hours + ' 学时。', 'success');
}

/* ============================================================
   四之十二、业绩本（三期 3.0a 主线轮，附录A §12 全节首轮写入）
   依据附录A §12（v1.11 生效，插单 1.14 已预置 achievementCategories / achievements
   两表与 settings 三字段，旧数据防御补齐零迁移）：
    - 顶栏第 9 入口「业绩」+ 独立业绩面板（本轮唯一主线目标：业绩本地基）；
    - 分类管理（§12.2）：预置四类可重命名 / 新增 / 删除 / 排序（order 展示与导出排序位）；
      分类下存在业绩条目时禁止删除（防 categoryId 悬空）；删除属不可逆操作 → 弹窗确认（R7）；
    - 按日条目 CRUD（§12.3）：date / categoryId / content / role 四要素；
      content 必填、date 合法、categoryId 须命中现有分类；删除弹窗确认（R7）；
    - 单月可打印导出（§12.6 形态一）：可打印 HTML、内联样式、零外链（R1）；
      表头用 settings 三字段；文件命名 工作业绩报告表_YYYY年M月[_姓名].html（姓名空省略该段）；
      表结构 = 表头（单位/姓名/职务/年月）+ 学时项行 + 各分类动态行（仅渲染本月有条目的分类，
      分类内条目按日期升序）+ 承诺签字行（填报时间 = 导出当日）；
      学时项 = §12.4 投影口径唯一权威 monthAchvProjection（自然月串前缀 / 跨校历 /
      含 normal·moved·makeup / 排除 canceled / 名义学时求和 / 理论·实训按类型解析链
      inst → entry → course 拆分，不现场回算；显示一位小数 §12.4.7）——与本面板展示同函数，R6 同源；
    - 设置入口选址（拍板）：orgName / userName / userTitle 保存在业绩面板「月报导出与设置」卡
      （三者仅为导出表头服务，与导出口同面板就近维护；数据面板不动）；
    - 两项拍板（2026-09-18 用户「按建议」授权 AI 裁决，落变更记录 v1.37）：
      ① 不加「级别/分值」维度——§12.3 四要素冻结、导出表无该列，先加无消费方属臆造（C2），
        日后真有需求走 R4 纯增量补列；② 附件不扩表，采纳降级方案——content 允许存
        图片链接/本地路径文本（与 3.0d「不做附件」定调一致，R4 下将来扩表仍是纯增量）；
    - R4 声明：§12 既定 schema 首轮写入，纯写数据与 UI，零结构改动、零迁移。
   ============================================================ */

/** 业绩本 UI 态（纯 UI 态，不入数据；跨视图切换随 resetTodayUi 复位） */


/* ---------- 声明式 UI 态复位表（拆分评估方案 v1.2 §4.3；panels 7 项，与拆分前 resetTodayUi 逐条一致。
   复审 P0-2 修正：formCalendarId / formCourseId / formEntryId / 粘贴区 / 导入预览 / 规则草稿等 12 项
   不纳入复位——切视图后保持原状（拆分前语义；如需全面复位走独立插单，P2-9 方向）。） ---------- */
const PANELS_UI_DECLS = [
  makeUiDecl(function () { return uiMemoCourseId; },
    function (v) { uiMemoCourseId = v; }, null),
  makeUiDecl(function () { return entryPrefill; },
    function (v) { entryPrefill = v; }, null),
  makeUiDecl(function () { return uiExpandPreview; },
    function (v) { uiExpandPreview = v; }, null),
  makeUiDecl(function () { return uiStatsCourseId; },
    function (v) { uiStatsCourseId = v; }, null),
  makeUiDecl(function () { return uiStatsFilter; },
    function (v) { uiStatsFilter = v; }, function () { return defaultStatsFilter(); }),
  makeUiDecl(function () { return uiStatsFilterCollapsed; },
    function (v) { uiStatsFilterCollapsed = v; }, true),
  makeUiDecl(function () { return uiReconcileMonth; },
    function (v) { uiReconcileMonth = v; }, null)
];
function resetPanelsUi() { applyUiDecls(PANELS_UI_DECLS); }

