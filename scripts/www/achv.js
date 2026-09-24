/* 教员台 · achv.js —— 业绩本全部（3.0a–d）：面板 / 条目与分类 CRUD / 导入 /
   导出构建 / 移动速记。函数体逐字搬迁自 app.js 1.26。 */

'use strict';

let uiAchvCatOpen = false;      // 分类管理卡展开态

let formAchvCatId = null;       // 分类重命名编辑对象（null = 新增模式）

let uiAchvFormOpen = false;     // 条目表单展开态

let formAchvId = null;          // 条目编辑对象 id（null = 新建模式）

let uiAchvMonth = fmtLocalDate(new Date()).slice(0, 7);   // 条目列表与导出默认当前月

/** 分类排序列表：按 order 升序（§12.2 展示与导出排序位唯一口径） */

/** 文件名片段过滤（四期④c，B.12-2.6）：自由文本（姓名等）中的路径非法字符一律剔除 */
function achvSafeFilePart(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '');
}

function achievementReportFilename(month) {
  const p = String(month).split('-');
  const ym = p[0] + '年' + parseInt(p[1], 10) + '月';
  const name = achvSafeFilePart((state.settings.userName || '').trim());
  return '工作业绩报告表_' + ym + (name ? '_' + name : '') + '.html';
}

/**
 * §12.6 可打印导出共用内联样式（R1 零外链；全年逐月分节的节间分页亦在此定义）。
 */

/**
 * 报表表头（四期⑪ 导出列选择：单月/逐月分节/全年汇总/区间汇总四处共用 thead 抽口）——
 * cols.role === false 时不渲染「本人作用」列（3 列宽表）；默认（cols 空）与改前逐字节一致。
 */
function achvReportTheadHtml(cols) {
  const showRole = !cols || cols.role !== false;
  return '<tr><th scope="col" style="width:34px">序号</th><th scope="col" style="width:150px">项目</th>' +
    '<th scope="col">工作内容与效果</th>' +
    (showRole ? '<th scope="col" style="width:110px">本人作用</th>' : '') + '</tr>';
}

/**
 * §12.6 报表表体行（学时项行 + 分类动态行 + 承诺签字行；单月 / 全年逐月分节 / 全年汇总 /
 * 区间汇总共用，C4）。studyLabel 供全年汇总标注「全年合计」。
 * 四期⑪（1.29 拍板 c 导出列选择）：cols = { role, date } 可选列（默认全列 = 改前逐字节）——
 * role=false 去本人作用列，date=false 去分类行内容前缀 M/D 日期；承诺行 colspan 随行数。
 */
function achievementTableRowsHtml(entries, proj, studyLabel, cols) {
  const showRole = !cols || cols.role !== false;
  const showDate = !cols || cols.date !== false;
  const colSpan = showRole ? 4 : 3;
  const f1 = function (v) { return Number(v).toFixed(1); };   // §12.4.7：显示一位小数
  const now = new Date();
  const fillDate = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' +
    now.getDate() + ' 日';
  const cats = achvCategoriesOrdered();
  let seq = 2;   // 序号 1 恒为学时项行，分类行动态从 2 起编
  let catRows = '';
  cats.forEach(function (c) {
    const list = entries.filter(function (a) { return a.categoryId === c.id; });
    if (!list.length) return;   // 动态行：无条目的分类不渲染（§12.6）
    const lines = list.map(function (a) {
      return '<div>' + (showDate
        ? escapeHtml(a.date.slice(5).replace('-', '/')) + '　' : '') +
        escapeHtml(a.content) + '</div>';
    }).join('');
    const roleTd = showRole
      ? '<td class="role">' + list.map(function (a) {
          return escapeHtml((a.role || '').trim()) || '—';
        }).join('<br>') + '</td>'
      : '';
    catRows += '<tr><td class="seq">' + (seq++) + '</td><td class="cat">' +
      escapeHtml(c.name) + '</td><td>' + lines + '</td>' + roleTd + '</tr>';
  });
  const studyRow = '<tr><td class="seq">1</td><td class="cat">' +
    escapeHtml(studyLabel || '学时项（授课）') + '</td><td>理论 ' +
    f1(proj.theory) + ' 学时；实训 ' + f1(proj.lab) + ' 学时；合计 ' + f1(proj.total) +
    ' 学时</td>' + (showRole ? '<td class="role">—</td>' : '') + '</tr>';
  const signRow = '<tr><td colspan="' + colSpan + '" class="sign">本人承诺以上业绩内容属实。' +
    '承诺人签字：＿＿＿＿＿＿＿＿＿＿　　填报时间：' + fillDate + '</td></tr>';
  return studyRow + catRows + signRow;
}

/**
 * 单月可打印导出 HTML（§12.6 形态一；内联样式、零外链 R1；浏览器打开 → 打印 / 另存 PDF）。
 * 表 = 表头（单位/姓名/职务/年月）+ achievementTableRowsHtml 表体。
 */

function buildAchievementMonthReportHtml(month, cols) {
  const s = state.settings;
  const ym = String(month).split('-');
  const ymText = ym[0] + ' 年 ' + parseInt(ym[1], 10) + ' 月';
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>工作业绩报告表（' + ymText + '）</title><style>' + ACHV_REPORT_CSS + '</style></head><body>' +
    '<h1>工作业绩报告表</h1>' +
    '<div class="meta"><span>单位：' + escapeHtml(s.orgName || '') + '</span>' +
    '<span>姓名：' + escapeHtml(s.userName || '') + '</span>' +
    '<span>职务/职称：' + escapeHtml(s.userTitle || '') + '</span>' +
    '<span>年月：' + ymText + '</span></div>' +
    '<table><thead>' + achvReportTheadHtml(cols) + '</thead><tbody>' +
    achievementTableRowsHtml(achvEntriesOfMonth(month), monthAchvProjection(month),
      undefined, cols) +
    '</tbody></table></body></html>';
}

/** §12.4 学年投影：1–12 月逐月投影求和（各月已 round2 收口，逐年再收一次防浮点漂移，R6 口径唯一） */

function downloadAchievementMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) { showBanner('请选择有效的导出月份。', 'warn'); return; }
  downloadTextFile(achievementReportFilename(month),
    buildAchievementMonthReportHtml(month, uiAchvExportColSel), 'text/html;charset=utf-8');
  state.settings.lastAchievementExportAt = nowIso();   // 三期 3.0d 拍板②：备份提醒写点①（月报导出）
  saveState();
  const blanks = achvBlankRoleEntries(achvEntriesOfMonth(month));
  if (blanks.length) {
    showBanner(month + ' 月报已导出：' + blanks.length +
      ' 条「本人作用」为空（' +
      blanks.slice(0, 2).map(function (a) {
        return a.date.slice(5).replace('-', '/') + ' ' + String(a.content).slice(0, 12);
      }).join('；') + (blanks.length > 2 ? ' 等' : '') +
      '），可补填后重导。', 'warn');
  }
}

/** §12.6 全年文件命名：工作业绩报告表_2026年度_逐月[_姓名].html / …_汇总[_姓名].html（姓名空省略该段） */

function achievementYearFilename(year, kind) {
  const name = achvSafeFilePart((state.settings.userName || '').trim());
  return '工作业绩报告表_' + year + '年度_' + kind + (name ? '_' + name : '') + '.html';
}

/** 空白提醒横幅（月/年导出共用；纯提醒不阻断） */

function achvBlankRoleBanner(year, list) {
  const blanks = achvBlankRoleEntries(list);
  if (!blanks.length) return;
  showBanner(year + ' 报表已导出：' + blanks.length +
    ' 条「本人作用」为空（' +
    blanks.slice(0, 2).map(function (a) {
      return a.date.slice(5).replace('-', '/') + ' ' + String(a.content).slice(0, 12);
    }).join('；') + (blanks.length > 2 ? ' 等' : '') +
    '），可补填后重导。', 'warn');
}

/** §12.6 形态二导出入口：全年逐月分节 */

function downloadAchievementYearSections(year) {
  if (!/^\d{4}$/.test(String(year))) { showBanner('请输入有效的导出年份（如 2026）。', 'warn'); return; }
  downloadTextFile(achievementYearFilename(year, '逐月'),
    buildAchievementYearSectionsHtml(year, uiAchvExportColSel), 'text/html;charset=utf-8');
  state.settings.lastAchievementExportAt = nowIso();   // 三期 3.0d 拍板②：备份提醒写点②（全年逐月导出）
  saveState();
  achvBlankRoleBanner(String(year) + ' 年度', achvEntriesOfYear(year));
}

/** §12.6 形态三导出入口：全年汇总 */

function downloadAchievementYearSummary(year) {
  if (!/^\d{4}$/.test(String(year))) { showBanner('请输入有效的导出年份（如 2026）。', 'warn'); return; }
  downloadTextFile(achievementYearFilename(year, '汇总'),
    buildAchievementYearSummaryHtml(year, uiAchvExportColSel), 'text/html;charset=utf-8');
  state.settings.lastAchievementExportAt = nowIso();   // 三期 3.0d 拍板②：备份提醒写点③（全年汇总导出）
  saveState();
  achvBlankRoleBanner(String(year) + ' 年度', achvEntriesOfYear(year));
}

/**
 * §12.6 形态二「全年逐月分节」导出 HTML：有数据月份（条目 > 0 或 §12.4 投影 > 0）逐节排列，
 * 每节同月报表（表头 + 月表体），节间 @media print 分页（首页不前置分页）。
 */

function buildAchievementYearSectionsHtml(year, cols) {
  const s = state.settings;
  const yText = String(year);
  let sections = '';
  for (let m = 1; m <= 12; m++) {
    const monthStr = yText + '-' + ('0' + m).slice(-2);
    const entries = achvEntriesOfMonth(monthStr);
    const proj = monthAchvProjection(monthStr);
    if (!entries.length && !proj.total) continue;   // 无数据月份不成节（§12.6 动态节）
    const ymText = yText + ' 年 ' + m + ' 月';
    sections += '<section class="rep-section">' +
      '<h2>' + ymText + '</h2>' +
      '<div class="meta"><span>单位：' + escapeHtml(s.orgName || '') + '</span>' +
      '<span>姓名：' + escapeHtml(s.userName || '') + '</span>' +
      '<span>职务/职称：' + escapeHtml(s.userTitle || '') + '</span>' +
      '<span>年月：' + ymText + '</span></div>' +
      '<table><thead>' + achvReportTheadHtml(cols) + '</thead><tbody>' +
      achievementTableRowsHtml(entries, proj, undefined, cols) +
      '</tbody></table></section>';
  }
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>工作业绩报告表（' + yText + ' 年度 · 逐月）</title><style>' + ACHV_REPORT_CSS +
    '</style></head><body>' +
    '<h1>工作业绩报告表（' + yText + ' 年度）</h1>' + sections + '</body></html>';
}

/**
 * §12.6 形态三「全年汇总」导出 HTML：一张表 = 学时项全年合计（§12.4 逐月投影求和，标注全年合计）
 * + 各分类条目全年按日期升序（仅渲染有条目分类）+ 承诺签字行。
 */

function buildAchievementYearSummaryHtml(year, cols) {
  const s = state.settings;
  const yText = String(year);
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>工作业绩报告表（' + yText + ' 年度 · 汇总）</title><style>' + ACHV_REPORT_CSS +
    '</style></head><body>' +
    '<h1>工作业绩报告表（' + yText + ' 年度 · 汇总）</h1>' +
    '<div class="meta"><span>单位：' + escapeHtml(s.orgName || '') + '</span>' +
    '<span>姓名：' + escapeHtml(s.userName || '') + '</span>' +
    '<span>职务/职称：' + escapeHtml(s.userTitle || '') + '</span>' +
    '<span>年月：' + yText + ' 年度</span></div>' +
    '<table><thead>' + achvReportTheadHtml(cols) + '</thead><tbody>' +
    achievementTableRowsHtml(achvEntriesOfYear(yText), yearAchvProjection(yText),
      '学时项（授课·全年合计）', cols) +
    '</tbody></table></body></html>';
}

/* ============================================================
   三期 3.0b 复制上月条目（拍板①：源月/目标月显式选择，源月默认上一月、目标月默认当前月；
   拍板②：新 id 重新发号（nextId('a')，D7）+ date 平移到目标月同日、无该日钳到月末；
   全程预览确认（R2 零写入）、逐条可勾选；纯 UI 增量零 schema 变更，R4）
   ============================================================ */

/** 复制上月条目 UI 态（纯 UI 态，不入数据；随 resetTodayUi 复位） */

let uiAchvCopySrc = '';       // 源月 YYYY-MM（空 = 未动过，面板按默认上一月预填）

let uiAchvCopyDst = '';       // 目标月 YYYY-MM（空 = 未动过，面板按默认当前月预填）

let uiAchvCopyParsed = null;  // 预览模型 [{src, dstDate, checked}]（确认前零写入，R2）

/** 月份平移：ym ± n 个月 → YYYY-MM（源月默认上一月的取值口；跨年正确） */

function onAchvCopyPreviewClick() {
  const srcEl = document.getElementById('achvCopySrc');
  const dstEl = document.getElementById('achvCopyDst');
  const src = srcEl ? srcEl.value : '';
  const dst = dstEl ? dstEl.value : '';
  uiAchvCopyParsed = null;   // 先清旧预览：校验失败绝不留旧模型误导（R2 精神）
  if (!/^\d{4}-\d{2}$/.test(src) || !/^\d{4}-\d{2}$/.test(dst)) {
    showBanner('请选择有效的源月与目标月。', 'warn'); return;
  }
  if (src === dst) { showBanner('源月与目标月相同，无需复制。', 'warn'); return; }
  uiAchvCopySrc = src;
  uiAchvCopyDst = dst;
  uiAchvCopyParsed = achvCopyPreviewModel(src, dst);
  renderAchvPanel();
}

/** 「确认复制勾选项」：勾选条目新 id 发号落库（createdAt 为当下），横幅汇报（R7 不弹窗） */

function onAchvCopyConfirmClick() {
  if (!uiAchvCopyParsed) return;
  const ts = nowIso();
  const src = uiAchvCopySrc, dst = uiAchvCopyDst;
  let added = 0;
  uiAchvCopyParsed.forEach(function (it) {
    if (!it.checked) return;
    state.achievements.push({
      id: nextId('a'),
      date: it.dstDate,            // 拍板②：平移到目标月同日（已钳月末）
      categoryId: it.src.categoryId,
      content: it.src.content,
      role: it.src.role || '',
      createdAt: ts,               // 新记录：创建时间为当下
      updatedAt: ts
    });
    added++;
  });
  uiAchvCopyParsed = null;
  saveState();
  renderAchvPanel();
  showBanner('复制完成：' + src + ' → ' + dst + ' 新增 ' + added +
    ' 条（日期已平移）。', 'success');
}

/** 分类管理卡 HTML：新增/重命名表单 + 分类列表（重命名/上移/下移/删除，索引型按钮 id 天然安全） */

function achvCatManagerHtml(cats) {
  let formRow;
  if (formAchvCatId) {
    const ec = state.achievementCategories.find(function (c) { return c.id === formAchvCatId; });
    if (!ec) { formAchvCatId = null; }
    formRow = ec
      ? '<div class="form-grid"><div class="field full">' +
        '<label for="achvCatName">分类名称（重命名）</label>' +
        '<input id="achvCatName" type="text" maxlength="40" value="' +
        escapeHtml(ec.name) + '"></div></div>' +
        '<div class="form-actions">' +
        '<button type="button" class="btn-primary btn-auto" id="btnAchvCatSave">保存名称</button>' +
        '<button type="button" class="btn-sec" id="btnAchvCatCancel">取消</button></div>'
      : '';
  }
  if (!formAchvCatId) {
    formRow = '<div class="form-grid"><div class="field full">' +
      '<label for="achvCatNewName">新增分类</label>' +
      '<input id="achvCatNewName" type="text" maxlength="40" placeholder="分类名称"></div></div>' +
      '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-auto" id="btnAchvCatAdd">新增分类</button></div>';
  }
  const rows = cats.map(function (c, i) {
    const cnt = state.achievements.filter(function (a) { return a.categoryId === c.id; }).length;
    const btns = isSafeElId(c.id)
      ? '<button type="button" class="btn-sec" id="btnAchvCatEdit-' + i + '">重命名</button>' +
        '<button type="button" class="btn-sec" id="btnAchvCatUp-' + i + '"' +
          (i === 0 ? ' disabled' : '') + '>上移</button>' +
        '<button type="button" class="btn-sec" id="btnAchvCatDown-' + i + '"' +
          (i === cats.length - 1 ? ' disabled' : '') + '>下移</button>' +
        '<button type="button" class="btn-danger" id="btnAchvCatDel-' + i + '">删除</button>'
      : '';   // 1.15 防线：脏 id 不渲染操作按钮（绑定层同步跳过）
    return '<div class="cal-card">' +
      '<div class="cal-card-main">' +
        '<div class="cal-card-name">' + (i + 1) + '. ' + escapeHtml(c.name) +
          (cnt ? '<span class="paste-badge badge-dup">' + cnt + ' 条</span>' : '') + '</div>' +
      '</div>' +
      '<div class="cal-card-actions">' + btns + '</div></div>';
  }).join('');
  return '<div class="cal-form-card">' +
    '<h3>分类管理</h3>' + formRow +
    '<div class="cal-list" style="margin-top:12px">' + rows + '</div>' +
    '<p class="form-hint">分类下存在业绩条目时禁止删除（防止条目失去归属）；' +
      '删除分类需确认；删除后排序自动整理。</p></div>';
}

/** 条目新建/编辑表单 HTML（编辑对象由 formAchvId 决定；复用 cal-form 体系，零新增样式） */

function achvEntryFormHtml() {
  const editing = formAchvId
    ? state.achievements.find(function (a) { return a.id === formAchvId; })
    : null;
  if (formAchvId && !editing) { formAchvId = null; uiAchvFormOpen = false; return ''; }
  const a = editing || { date: fmtLocalDate(new Date()), categoryId: '', content: '', role: '' };
  const catOpts = achvCategoriesOrdered().map(function (c) {
    const sel = c.id === a.categoryId ? ' selected' : '';
    return '<option value="' + escapeHtml(c.id) + '"' + sel + '>' +
      escapeHtml(c.name) + '</option>';
  }).join('');
  return '<div class="cal-form-card">' +
    '<h3>' + (editing ? '编辑业绩条目' : '新建业绩条目') + '</h3>' +
    '<form id="achvForm" class="cal-form" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="achvFormDate">发生日期</label>' +
          '<input id="achvFormDate" type="date" aria-required="true" aria-describedby="achvFormError" value="' + escapeHtml(a.date) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="achvFormCat">归属分类（不选则自动归入「其他工作（临时工作）」）</label>' +
          '<select id="achvFormCat">' + catOpts + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="achvFormContent">工作内容与效果（必填）</label>' +
          '<input id="achvFormContent" type="text" maxlength="300" aria-required="true" aria-describedby="achvFormError" value="' +
          escapeHtml(a.content) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="achvFormRole">本人作用（选填）</label>' +
          '<input id="achvFormRole" type="text" maxlength="100" placeholder="如：主持 / 参与"' +
          ' value="' + escapeHtml(a.role || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="form-error" id="achvFormError" role="alert"></div>' +
      '<p class="hint-line">归属分类不选则自动归入「其他工作（临时工作）」；' +
        '图片附件请以链接或文字说明写在「工作内容」里。</p>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn-primary btn-auto">' +
          (editing ? '保存修改' : '创建条目') + '</button>' +
        '<button type="button" class="btn-sec" id="achvFormCancel">取消</button>' +
      '</div></form></div>';
}

/* ============================================================
   W6-4 业绩面板批（拍板①②③；纯表现层施工——五卡收纳为「工具区」一卡：
   分类管理 / 月报导出 / 导入业绩 / 复制上月四分区，默认折叠（原生 <details>，
   折叠时内容仍在 DOM 序列化——历史断言锚点零波及）；主操作唯一 = 面板头「新建条目」；
   次级折叠（区间导出 / 列选择与表头设置）灰底收边；hint 统一 .hint-line 置底一行。
   紧凑：输入框 32px 高、「本人作用」与「工作内容」同排 2:1。uiAchvToolOpen 纯 UI 态
   负向锁定组（与搜索词/草稿同惯例，不入复位声明表）；全部控件 id 与绑定逐字保留。
   ============================================================ */

/** 工具区一卡：摘要行 + 四分区（导出 / 导入 / 复制上月 / 分类管理） */
function achvToolAreaHtml(month, proj) {
  return '<details class="tool-card"' + (uiAchvToolOpen ? ' open' : '') + '>' +
    '<summary id="achvToolSummary">' +
      '<span><span class="tool-summary-title">工具区</span>' +
      '<span class="tool-summary-sub">月报导出 · 导入业绩 · 复制上月 · 分类管理</span></span>' +
      '<span class="tool-caret">' + (uiAchvToolOpen ? '收起 ▴' : '展开 ▾') + '</span>' +
    '</summary>' +
    '<div class="tool-body">' +
      '<div class="tool-section">' + achvExportCardHtml(month, proj, state.settings) + '</div>' +
      '<div class="tool-section">' + achvImportCardHtml(month) + '</div>' +
      '<div class="tool-section">' + achvCopyCardHtml() + '</div>' +
      '<div class="tool-section">' + achvCatSectionHtml() + '</div>' +
    '</div>' +
  '</details>';
}

/** 分类管理分区：展开管理按钮（aria-expanded 两态，W4-B #205 口径不动）+ 管理卡容器 */
function achvCatSectionHtml() {
  return '<p class="tool-section-title">分类管理</p>' +
    '<div class="form-actions" style="margin-bottom:10px">' +
      '<button type="button" class="btn-sec" id="btnAchvCatManage" aria-expanded="' +
        (uiAchvCatOpen ? 'true' : 'false') + '" aria-controls="achvCatWrap">' +
        (uiAchvCatOpen ? '收起管理' : '展开管理') + '</button>' +
    '</div>' +
    '<div id="achvCatWrap">' + (uiAchvCatOpen ? achvCatManagerHtml(achvCategoriesOrdered()) : '') + '</div>';
}

/**
 * 「月报导出」分区 HTML（W6-4 起为工具区第一分区，选址拍板不变：与导出口同区）：
 * 导出月份 + 导出年份首行；全年两形态次行（§12.6 形态二/三）；区间导出与
 * 列选择/表头三字段收 <details> 次级折叠；「本人作用」空白清单小字
 * （拍板③：常驻提醒、可定位补填，不阻断导出）。
 */

function achvExportCardHtml(month, proj, s) {
  const blanks = achvBlankRoleEntries(achvEntriesOfMonth(month));
  const blankHint = blanks.length
    ? '<p class="hint-line">提醒：本月 ' + blanks.length + ' 条业绩「本人作用」为空（' +
      blanks.slice(0, 3).map(function (a) {
        return escapeHtml(a.date.slice(5).replace('-', '/')) + ' ' +
          escapeHtml(String(a.content).slice(0, 12));
      }).join('；') + (blanks.length > 3 ? ' 等' : '') +
      '）——导出不阻断，可补填后重新导出。</p>'
    : '';
  return (
    '<p class="tool-section-title">月报导出</p>' +
    '<div class="form-grid">' +
      '<div class="field">' +
        '<label for="achvExportMonth">导出月份</label>' +
        '<input id="achvExportMonth" type="month" value="' + escapeHtml(month) + '">' +
      '</div>' +
      '<div class="field">' +
        '<label for="achvExportYear">导出年份（全年两形态用）</label>' +
        '<input id="achvExportYear" type="number" min="2000" max="2100" inputmode="numeric" enterkeyhint="done" value="' +
          new Date().getFullYear() + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-auto" id="btnAchvExport">导出月报（可打印 HTML）</button>' +
      '<button type="button" class="btn-sec" id="btnAchvExportYearSections">导出全年逐月（HTML）</button>' +
      '<button type="button" class="btn-sec" id="btnAchvExportYearSummary">导出全年汇总（HTML）</button>' +
    '</div>' +
    // W6-4 拍板③：次级收纳——区间导出收 <details> 灰底折叠
    '<details class="sub-fold"><summary>▸ 区间汇总导出（自定义起止月，单表）</summary>' +
      '<div class="sub-fold-body">' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="achvExportFrom">区间起（含）</label>' +
            '<input id="achvExportFrom" type="month" value="' + escapeHtml(month) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="achvExportTo">区间止（含）</label>' +
            '<input id="achvExportTo" type="month" value="' + escapeHtml(month) + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn-sec" id="btnAchvExportRange">导出区间汇总（单表）</button>' +
        '</div>' +
      '</div>' +
    '</details>' +
    // W6-4 拍板③：列选择与表头三字段同收次级折叠
    '<details class="sub-fold"><summary>▸ 列选择与表头设置（单位 / 姓名 / 职务）</summary>' +
      '<div class="sub-fold-body">' +
        (function () {
          const cs = uiAchvExportColSel || { role: true, date: true };
          return '<div class="factor-row" style="margin-bottom:12px">' +
            '<span class="hint-line" style="margin:0">导出列：</span>' +
            '<label class="factor-label"><input type="checkbox" checked disabled>项目（必有）</label>' +
            '<label class="factor-label"><input type="checkbox" checked disabled>工作内容与效果（必有）</label>' +
            '<label class="factor-label"><input type="checkbox" id="achvExpColDate"' +
              (cs.date !== false ? ' checked' : '') + '>日期</label>' +
            '<label class="factor-label"><input type="checkbox" id="achvExpColRole"' +
              (cs.role !== false ? ' checked' : '') + '>本人作用</label>' +
            '</div>';
        })() +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="achvOrgName">单位名称</label>' +
            '<input id="achvOrgName" type="text" maxlength="40" value="' +
              escapeHtml(s.orgName || '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="achvUserName">教师姓名（文件名用，空则省略）</label>' +
            '<input id="achvUserName" type="text" maxlength="20" value="' +
              escapeHtml(s.userName || '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="achvUserTitle">职务/职称</label>' +
            '<input id="achvUserTitle" type="text" maxlength="30" value="' +
              escapeHtml(s.userTitle || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn-sec" id="btnAchvSettings">保存表头设置</button>' +
        '</div>' +
      '</div>' +
    '</details>' +
    blankHint +
    '<p class="hint-line">学时项由上课记录按自然月实时统计（本月：理论 ' +
      proj.theory.toFixed(1) + ' 学时 / 实训 ' + proj.lab.toFixed(1) + ' 学时 / 合计 ' +
      proj.total.toFixed(1) + ' 学时），不占用业绩条目；跨校历按自然月合并；导出为可打印网页，可打印 / 另存 PDF。</p>'
  );
}

/**
 * 「复制上月条目」卡 HTML（拍板①：源月/目标月显式选择——源月默认上一月、目标月默认当前月，
 * 用户未改动过时按默认预填；已解析过则保留上次选择）。预览表复用 import-preview 体系（R3），
 * 逐条勾选、目标日期平移后可见；确认前零写入（R2）。
 */

function achvCopyCardHtml() {
  const cur = (/^\d{4}-\d{2}$/.test(uiAchvMonth))
    ? uiAchvMonth : fmtLocalDate(new Date()).slice(0, 7);
  const defSrc = uiAchvCopySrc || shiftMonth(cur, -1);
  const defDst = uiAchvCopyDst || cur;
  let preview = '';
  if (uiAchvCopyParsed) {
    const rows = uiAchvCopyParsed.map(function (it, i) {
      const cat = state.achievementCategories.find(function (c) {
        return c.id === it.src.categoryId; });
      return '<tr>' +
        '<td><input type="checkbox" id="achvCopyPick-' + i + '"' +
          (it.checked ? ' checked' : '') + '></td>' +
        '<td>' + escapeHtml(it.src.date) + '</td>' +
        '<td>' + escapeHtml(cat ? cat.name : '未分类') + '</td>' +
        '<td>' + escapeHtml(it.src.content) + '</td>' +
        '<td>' + escapeHtml((it.src.role || '').trim() || '—') + '</td>' +
        '<td>' + escapeHtml(it.dstDate) + '</td>' +
      '</tr>';
    }).join('');
    const picked = uiAchvCopyParsed.filter(function (it) { return it.checked; }).length;
    preview = '<div class="import-preview"><table>' +
      '<thead><tr><th scope="col">复制</th><th scope="col">源日期</th><th scope="col">分类</th><th scope="col">工作内容与效果</th>' +
      '<th scope="col">本人作用</th><th scope="col">目标日期</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="form-actions" style="margin-top:12px">' +
        '<button type="button" class="btn-primary btn-auto" id="btnAchvCopyConfirm">确认复制勾选项（' +
          picked + ' 条）</button>' +
        '<button type="button" class="btn-sec" id="btnAchvCopyBack">返回重选</button>' +
      '</div>';
  }
  return '<p class="tool-section-title">复制上月条目</p>' +
    '<div class="form-grid">' +
      '<div class="field">' +
        '<label for="achvCopySrc">源月</label>' +
        '<input id="achvCopySrc" type="month" value="' + escapeHtml(defSrc) + '">' +
      '</div>' +
      '<div class="field">' +
        '<label for="achvCopyDst">目标月</label>' +
        '<input id="achvCopyDst" type="month" value="' + escapeHtml(defDst) + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-actions">' +
      '<button type="button" class="btn-sec" id="btnAchvCopyPreview">解析预览</button>' +
    '</div>' +
    '<p class="hint-line">源月条目复制到目标月：新 id 发号、日期平移（无该日取月末）、录入时间为现在；解析预览不写数据，可逐条勾选后确认。</p>' +
    preview;
}

/** 业绩本面板主渲染：面板头 + 分类管理 + 条目表单 + 导出设置卡 + 按月条目列表 */

function renderAchvPanel() {
  uiFormDirty = false;   // W0A：整面板重渲染 = 表单已提交/放弃，脏标记清零
  const cal = getActiveCalendar();
  if (!cal) { renderApp(); return; }   // 无校历 → 回退向导（与既有面板一致）

  achvMaybeBackupReminder();   // 三期 3.0d 拍板②：距上次导出 >7 天横幅提醒（无记录不误报，R7 不弹窗）
  if (isAchvMobileMode()) { renderAchvQuickPanel(cal); return; }   // 三期 3.0d 拍板①：窄屏走移动速记视图

  const cats = achvCategoriesOrdered();
  const month = (/^\d{4}-\d{2}$/.test(uiAchvMonth))
    ? uiAchvMonth : fmtLocalDate(new Date()).slice(0, 7);
  const entries = achvEntriesOfMonth(month);
  const proj = monthAchvProjection(month);

  /* 四期⑪ 分类分组月列表：按 achvCategoriesOrdered 分组渲染（组标题复用 section-subtitle
     零新增样式，组内日期升序——achvEntriesOfMonth 排序不变）；分类悬空条目兜底「未分类」
     组；卡片操作钮 id 与绑定循环逐字不动（批量删/编辑/删除兼容，脏 id 防线保留） */
  const entryCardHtml = function (a) {
    const cat = state.achievementCategories.find(function (c) { return c.id === a.categoryId; });
    const safe = isSafeElId(a.id);
    return '<div class="cal-card">' +
      (safe ? '<input type="checkbox" class="achv-batch-pick" id="achvBatchPick-' +
        escapeHtml(a.id) + '"' + (uiAchvBatchSel[a.id] ? ' checked' : '') +
        ' title="勾选后可批量删除">' : '') +
      '<div class="cal-card-main">' +
        '<div class="cal-card-name">' + escapeHtml(a.date) + ' · ' +
          escapeHtml(cat ? cat.name : '未分类') + '</div>' +
        '<div class="cal-card-meta">' + escapeHtml(a.content) +
          (a.role ? ' · 本人作用：' + escapeHtml(a.role) : '') + '</div>' +
      '</div>' +
      '<div class="cal-card-actions">' +
        (safe
          ? '<button type="button" class="btn-sec" id="btnAchvEdit-' + escapeHtml(a.id) + '">编辑</button>' +
            '<button type="button" class="btn-danger" id="btnAchvDelete-' + escapeHtml(a.id) + '">删除</button>'
          : '') +
      '</div></div>';
  };
  let entryRows = cats.map(function (c) {
    const list = entries.filter(function (a) { return a.categoryId === c.id; });
    if (!list.length) return '';
    return '<h3 class="section-subtitle">' + escapeHtml(c.name) + '（' + list.length +
      ' 条）</h3><div class="cal-list">' +
      list.map(entryCardHtml).join('') + '</div>';
  }).join('');
  const orphanEntries = entries.filter(function (a) {
    return !cats.some(function (c) { return c.id === a.categoryId; });
  });
  if (orphanEntries.length) {
    entryRows += '<h3 class="section-subtitle">未分类（' + orphanEntries.length +
      ' 条）</h3><div class="cal-list">' +
      orphanEntries.map(entryCardHtml).join('') + '</div>';
  }

  appRoot.innerHTML =
    '<div class="app-shell">' +
      topbarHtml(cal) +
      '<main class="main-area" id="mainContent">' +
        // W6-4 拍板①：主操作唯一——面板头只留「新建条目」一个主操作；
        // 分类管理 / 导出设置 / 复制上月 / 导入收纳进「工具区」一卡（默认折叠，纯 CSS 展开，
        // 折叠时内容仍在 DOM 序列化——历史断言锚点零波及；各控件 id 与绑定逐字保留）
        '<div class="panel-head"><h2>业绩本</h2>' +
          '<div class="panel-head-ops">' +
            '<button type="button" class="btn-primary btn-auto" id="btnAchvNew">新建条目</button>' +
          '</div></div>' +
        '<div id="achvFormWrap">' +
          ((uiAchvFormOpen || formAchvId) ? achvEntryFormHtml() : '') + '</div>' +
        achvToolAreaHtml(month, proj) +
        '<div class="panel-head" style="margin-top:16px">' +
          '<h3 class="section-subtitle" style="margin:0">业绩条目（' + month + ' · ' +
            entries.length + ' 条）</h3>' +
          '<div class="panel-head-ops">' +
            // 四期⑪ 汇报速取：本月条目文本一键进剪贴板（M/D 分类｜内容｜作用）
            '<button type="button" class="btn-sec" id="btnAchvCopyMonth">复制本月条目</button>' +
            '<label class="factor-hint"><input type="checkbox" id="achvBatchAll"> 全选</label>' +
            '<button type="button" class="btn-danger" id="btnAchvBatchDel">删除勾选（' +
              entries.filter(function (a) { return uiAchvBatchSel[a.id]; }).length +
              '）</button>' +
            '<div class="period-pair" style="max-width:170px">' +
              '<input id="achvMonthSel" type="month" aria-label="选择月份" value="' + month + '"></div></div></div>' +
        (entryRows
          ? '<div class="cal-list">' + entryRows + '</div>'
          : emptyStateHtml('本月还没有业绩条目。下一步：点上方「新建条目」录入第一条。', '', ICON_ACHV)) +   // 四期⑨：空状态三件套
      '</main>' +
    '</div>';

  bindTopbarNav();
  updateSaveIndicator(storageAvailable);

  // W6-4：工具区摘要行开关（纯 UI 态，重渲染后 <details open> 由状态驱动）
  const toolSummary = document.getElementById('achvToolSummary');
  if (toolSummary) {
    toolSummary.addEventListener('click', function () {
      uiAchvToolOpen = !uiAchvToolOpen;
      renderAchvPanel();
    });
  }
  const btnCatManage = document.getElementById('btnAchvCatManage');
  if (btnCatManage) {
    btnCatManage.addEventListener('click', function () {
      uiAchvCatOpen = !uiAchvCatOpen;
      formAchvCatId = null;
      renderAchvPanel();
    });
  }
  const btnNew = document.getElementById('btnAchvNew');
  if (btnNew) {
    btnNew.addEventListener('click', function () {
      uiAchvFormOpen = true;
      formAchvId = null;
      renderAchvPanel();
    });
  }
  const monthSel = document.getElementById('achvMonthSel');
  if (monthSel) {
    monthSel.addEventListener('change', function () {
      if (monthSel.value) uiAchvMonth = monthSel.value;
      uiAchvBatchSel = {};   // W0 #5：切月清空勾选集，防跨月残留误删
      renderAchvPanel();
    });
  }
  const btnExport = document.getElementById('btnAchvExport');
  if (btnExport) {
    btnExport.addEventListener('click', function () {
      const mEl = document.getElementById('achvExportMonth');
      downloadAchievementMonth(mEl ? mEl.value : month);
    });
  }
  const btnSettings = document.getElementById('btnAchvSettings');
  if (btnSettings) btnSettings.addEventListener('click', onAchvSettingsSubmit);

  /* 三期 3.0b：全年两形态导出 + 复制上月条目绑定 */
  const btnYearSec = document.getElementById('btnAchvExportYearSections');
  if (btnYearSec) btnYearSec.addEventListener('click', function () {
    const yEl = document.getElementById('achvExportYear');
    downloadAchievementYearSections(yEl ? String(yEl.value) : '');
  });
  const btnYearSum = document.getElementById('btnAchvExportYearSummary');
  if (btnYearSum) btnYearSum.addEventListener('click', function () {
    const yEl = document.getElementById('achvExportYear');
    downloadAchievementYearSummary(yEl ? String(yEl.value) : '');
  });
  /* 四期⑨（B.11-U31）：区间汇总单表导出 */
  const btnRange = document.getElementById('btnAchvExportRange');
  if (btnRange) btnRange.addEventListener('click', function () {
    const fEl = document.getElementById('achvExportFrom');
    const tEl = document.getElementById('achvExportTo');
    downloadAchievementRange(fEl ? fEl.value : '', tEl ? tEl.value : '');
  });
  const btnCopyPrev = document.getElementById('btnAchvCopyPreview');
  if (btnCopyPrev) btnCopyPrev.addEventListener('click', onAchvCopyPreviewClick);
  const btnCopyConfirm = document.getElementById('btnAchvCopyConfirm');
  if (btnCopyConfirm) btnCopyConfirm.addEventListener('click', onAchvCopyConfirmClick);
  const btnCopyBack = document.getElementById('btnAchvCopyBack');
  if (btnCopyBack) btnCopyBack.addEventListener('click', function () {
    uiAchvCopyParsed = null;
    renderAchvPanel();
  });
  if (uiAchvCopyParsed) {
    uiAchvCopyParsed.forEach(function (it, i) {
      const pick = document.getElementById('achvCopyPick-' + i);
      if (pick) pick.addEventListener('change', function () { it.checked = !!pick.checked; });
    });
  }

  bindAchvImportControls();   // 三期 3.0d 抽出共用：桌面导入卡与移动速记首屏卡同一绑定

  /* 分类管理绑定 */
  if (uiAchvCatOpen) {
    const btnAdd = document.getElementById('btnAchvCatAdd');
    if (btnAdd) {
      btnAdd.__submitting = false;   // 四期④a：渲染即重置防抖标志（真实 DOM 为重建按钮）
      btnAdd.addEventListener('click', onAchvCatAddClick);
    }
    const btnSave = document.getElementById('btnAchvCatSave');
    if (btnSave) btnSave.addEventListener('click', onAchvCatSaveClick);
    const btnCancel = document.getElementById('btnAchvCatCancel');
    if (btnCancel) btnCancel.addEventListener('click', function () {
      formAchvCatId = null;
      renderAchvPanel();
    });
    cats.forEach(function (c, i) {
      if (!isSafeElId(c.id)) return;   // 1.15 子项③：脏 id 不绑定
      const bEdit = document.getElementById('btnAchvCatEdit-' + i);
      if (bEdit) bEdit.addEventListener('click', function () {
        formAchvCatId = c.id;
        renderAchvPanel();
      });
      const bUp = document.getElementById('btnAchvCatUp-' + i);
      if (bUp) bUp.addEventListener('click', function () { onAchvCatMoveClick(c.id, -1); });
      const bDown = document.getElementById('btnAchvCatDown-' + i);
      if (bDown) bDown.addEventListener('click', function () { onAchvCatMoveClick(c.id, 1); });
      const bDel = document.getElementById('btnAchvCatDel-' + i);
      if (bDel) bDel.addEventListener('click', function () { onAchvCatDeleteClick(c.id); });
    });
  }

  /* 条目表单绑定 */
  if (uiAchvFormOpen || formAchvId) {
    const form = document.getElementById('achvForm');
    if (form) {
      form.addEventListener('submit', onAchvSubmit);
      form.addEventListener('input', function () { form.__submitting = false; });
    }
    const cancel = document.getElementById('achvFormCancel');
    if (cancel) cancel.addEventListener('click', function () {
      uiAchvFormOpen = false;
      formAchvId = null;
      renderAchvPanel();
    });
    clearFormInvalid(['achvFormDate', 'achvFormCat', 'achvFormContent', 'achvFormRole']);   // 四期⑦：复学前清除 aria-invalid
  }

  /* 条目列表绑定（脏 id 沿用 1.15 防线不渲染不绑定） */
  state.achievements.forEach(function (a) {
    if (!isSafeElId(a.id)) return;
    const bEdit = document.getElementById('btnAchvEdit-' + a.id);
    if (bEdit) bEdit.addEventListener('click', function () {
      formAchvId = a.id;
      uiAchvFormOpen = true;
      renderAchvPanel();
    });
    const bDel = document.getElementById('btnAchvDelete-' + a.id);
    if (bDel) bDel.addEventListener('click', function () { onAchvDeleteClick(a.id); });
    const bPick = document.getElementById('achvBatchPick-' + a.id);
    if (bPick) bPick.addEventListener('change', function () {
      uiAchvBatchSel[a.id] = !!bPick.checked;
      renderAchvPanel();   // 更新「删除勾选（N）」计数
    });
  });
  /* 四期⑨：批量删除——全选 + 一次 confirmDelete（R7） */
  const batchAll = document.getElementById('achvBatchAll');
  if (batchAll) batchAll.addEventListener('change', function () {
    entries.forEach(function (a) {
      if (isSafeElId(a.id)) uiAchvBatchSel[a.id] = !!batchAll.checked;
    });
    renderAchvPanel();
  });
  const btnBatchDel = document.getElementById('btnAchvBatchDel');
  if (btnBatchDel) btnBatchDel.addEventListener('click', onAchvBatchDeleteClick);
  /* 四期⑪：复制本月条目 + 导出列选择绑定 */
  const btnCopyMonth = document.getElementById('btnAchvCopyMonth');
  if (btnCopyMonth) btnCopyMonth.addEventListener('click', function () {
    onAchvCopyMonthClick(month);
  });
  const expColDate = document.getElementById('achvExpColDate');
  if (expColDate) expColDate.addEventListener('change', function () {
    const cs = uiAchvExportColSel || { role: true, date: true };
    cs.date = !!expColDate.checked;
    uiAchvExportColSel = cs;
  });
  const expColRole = document.getElementById('achvExpColRole');
  if (expColRole) expColRole.addEventListener('change', function () {
    const cs = uiAchvExportColSel || { role: true, date: true };
    cs.role = !!expColRole.checked;
    uiAchvExportColSel = cs;
  });
}

/** 复制本月条目文本进剪贴板（四期⑪ 汇报速取；空月横幅提示不复制；成功/失败横幅汇报，R7） */
function onAchvCopyMonthClick(month) {
  const text = buildAchvMonthCopyText(month);
  if (!text) { showBanner('本月暂无业绩条目，无内容可复制。', 'info'); return; }
  const n = text.split('\n').length;
  const done = function (ok) {
    showBanner(ok
      ? '本月 ' + n + ' 条业绩文本已复制到剪贴板（M/D 分类｜内容｜作用）。'
      : '剪贴板不可用：请改用「数据」面板导出 JSON 或手动复制。',
      ok ? 'success' : 'warn');
  };
  let r;
  try { r = copyTextToClipboard(text); } catch (err) { r = null; }
  if (r && typeof r.then === 'function') { r.then(done, function () { done(false); }); }
  else { done(!!r); }
}

/**
 * 条目提交（§12.3 四要素）：date 合法 YYYY-MM-DD；categoryId 须命中现有分类（防悬空）；
 * content 必填；role 选填 trim。编辑保留 id/createdAt；新建 nextId('a') 发号（D7）。
 */

function onAchvSubmit(ev) {
  ev.preventDefault();
  // 四期④a 双击防抖：提交即锁定表单（重复提交忽略）；输入任一字段解锁可重试；mock 无 target 不拦截
  if (ev && ev.target) {
    if (ev.target.__submitting) return;
    ev.target.__submitting = true;
  }
  const errBox = document.getElementById('achvFormError');
  // W4-F（问题列表 #305）：编辑对象已悬空（条目被删）——人话报错并拒绝，绝不误走新建分支落库
  if (formAchvId && !state.achievements.some(function (aW4F) { return aW4F.id === formAchvId; })) {
    formErrorAt(errBox, '该条目已被删除或不存在，请点「取消」关闭表单后重试（未做任何修改）。',
      'achvFormContent');
    return;
  }
  const date = document.getElementById('achvFormDate').value;
  const categoryId = document.getElementById('achvFormCat').value;
  const content = document.getElementById('achvFormContent').value.trim();
  const role = document.getElementById('achvFormRole').value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    formErrorAt(errBox, '请选择发生日期。', 'achvFormDate'); return;
  }
  // 插单 1.29 拍板②：分类必填放宽——未选/非法兜底「其他工作（临时工作）」（R4 零迁移）；
  // 兜底目标不存在（全部分类被删，理论不可能）时维持原拒绝
  let effCatId = categoryId;
  if (!state.achievementCategories.some(function (c) { return c.id === effCatId; })) {
    const fbId = achvFallbackCatId();
    if (!fbId) { formErrorAt(errBox, '请选择归属分类。', 'achvFormCat'); return; }
    effCatId = fbId;
  }
  if (!content) { formErrorAt(errBox, '请填写工作内容与效果。', 'achvFormContent'); return; }

  const ts = nowIso();
  const editing = formAchvId
    ? state.achievements.find(function (a) { return a.id === formAchvId; })
    : null;
  if (editing) {
    editing.date = date;
    editing.categoryId = effCatId;
    editing.content = content;
    editing.role = role;
    editing.updatedAt = ts;
  } else {
    state.achievements.push({
      id: nextId('a'),
      date: date,
      categoryId: effCatId,
      content: content,
      role: role,
      createdAt: ts,
      updatedAt: ts
    });
  }
  uiAchvFormOpen = false;
  formAchvId = null;
  saveState();
  renderAchvPanel();
  showBanner(editing ? '业绩条目已更新。' : '业绩条目已记录。', 'success');
}

/** 条目删除（§12.3 删除约束：不可逆 → 弹窗确认 R7；其余提醒一律横幅） */

function onAchvDeleteClick(id) {
  const a = state.achievements.find(function (x) { return x.id === id; });
  if (!a) return;
  // 四期⑦：confirm 四散收口 confirmDelete；W4-D：动作收进确认回调
  //（外部测试桩 / 沙盒路径同步执行——断言时序基石；原生环境弹层确认后执行）
  confirmDelete('删除该业绩条目后不可恢复，确定删除？', function () {
    state.achievements = state.achievements.filter(function (x) { return x.id !== id; });
    delete uiAchvBatchSel[id];   // 四期⑨：勾选集同步清场（R5 伴生物）
    if (formAchvId === id) { formAchvId = null; uiAchvFormOpen = false; }
    saveState();
    renderAchvPanel();
    showBanner('业绩条目已删除。如需恢复，请从 JSON 备份经「数据」面板合并导入。', 'success');
  });
}

/** 四期⑨（B.9-3.2）：批量删除勾选条目——一次 confirmDelete（文案含条数与不可恢复，R7） */
function onAchvBatchDeleteClick() {
  // W0 #5（2026-09-19）：勾选集按当前月过滤——修复前 9 月勾选切到 10 月后确认会误删
  // 9 月条目；此处只收集「当前月」内勾选的条目，跨月残留勾选一律忽略
  const curMonthW0 = (/^\d{4}-\d{2}$/.test(uiAchvMonth))
    ? uiAchvMonth : fmtLocalDate(new Date()).slice(0, 7);
  const ids = Object.keys(uiAchvBatchSel).filter(function (id) {
    if (!uiAchvBatchSel[id]) return false;
    const a = state.achievements.find(function (x) { return x.id === id; });
    return !!a && String(a.date).slice(0, 7) === curMonthW0;
  });
  if (!ids.length) { showBanner('请先勾选要删除的业绩条目。', 'warn'); return; }
  // W4-D：动作收进确认回调（桩/沙盒同步执行，原生环境弹层确认后执行）
  confirmDelete('删除勾选的 ' + ids.length +
    ' 条业绩条目后不可恢复，确定删除？', function () {
    state.achievements = state.achievements.filter(function (a) {
      return ids.indexOf(a.id) < 0;
    });
    uiAchvBatchSel = {};
    saveState();
    renderAchvPanel();
    showBanner('已批量删除 ' + ids.length +
      ' 条（恢复：从 JSON 备份经「数据」面板导入）。', 'success');
  });
}

/** 分类新增：名称必填 trim；order = max+1；id nextId('ac')（D7 发号） */

function onAchvCatAddClick() {
  // 四期④a 双击防抖：校验通过才锁定（失败路径横幅提示可重试）；渲染即重置——
  // mock 环境元素跨渲染复用，重置语义与真实 DOM 重建按钮一致
  const addBtn = document.getElementById('btnAchvCatAdd');
  if (addBtn && addBtn.__submitting) return;
  const input = document.getElementById('achvCatNewName');
  const name = input ? input.value.trim() : '';
  if (!name) { showBanner('请填写分类名称。', 'warn'); return; }
  // W4-F（问题列表 #307）：新增分类拒重名（防同名分类歧义；重命名走 #306 排除自身口径）
  if (state.achievementCategories.some(function (c) { return c.name === name; })) {
    showBanner('已存在同名分类「' + name + '」，请换个名称（或重命名原分类）。', 'warn');
    return;
  }
  if (addBtn) addBtn.__submitting = true;
  const ts = nowIso();
  const maxOrder = state.achievementCategories.reduce(function (m, c) {
    return Math.max(m, c.order || 0);
  }, 0);
  state.achievementCategories.push({
    id: nextId('ac'), name: name, order: maxOrder + 1, createdAt: ts, updatedAt: ts
  });
  saveState();
  renderAchvPanel();
  showBanner('分类「' + name + '」已新增。', 'success');
}

/** 分类重命名保存：名称必填；保留 id/order/createdAt；updatedAt 刷新 */

function onAchvCatSaveClick() {
  const c = state.achievementCategories.find(function (x) { return x.id === formAchvCatId; });
  const input = document.getElementById('achvCatName');
  if (!c || !input) return;
  const name = input.value.trim();
  if (!name) { showBanner('分类名称不能为空。', 'warn'); return; }
  // W4-F（问题列表 #306）：重命名拒与他人重名（排除自身——原名不改视为合法）
  if (state.achievementCategories.some(function (x) {
      return x.id !== formAchvCatId && x.name === name; })) {
    showBanner('已存在同名分类「' + name + '」，请换个名称。', 'warn');
    return;
  }
  c.name = name;
  c.updatedAt = nowIso();
  formAchvCatId = null;
  saveState();
  renderAchvPanel();
  showBanner('分类已重命名。', 'success');
}

/** 分类删除：有条目禁删（防 categoryId 悬空，§12.2）；空分类弹窗确认后删除并重整排序位 */

function onAchvCatDeleteClick(id) {
  const c = state.achievementCategories.find(function (x) { return x.id === id; });
  if (!c) return;
  const cnt = state.achievements.filter(function (a) { return a.categoryId === id; }).length;
  if (cnt > 0) {
    showBanner('分类「' + c.name + '」下存在 ' + cnt +
      ' 条业绩条目，禁止删除（防条目悬空）。', 'warn');
    return;
  }
  // 四期⑦：收口 confirmDelete；W4-D：动作收进确认回调（桩/沙盒同步，原生环境弹层确认后执行）
  confirmDelete('删除分类「' + c.name + '」？此操作不可恢复。', function () {
    state.achievementCategories = state.achievementCategories.filter(function (x) {
      return x.id !== id;
    });
    if (formAchvCatId === id) formAchvCatId = null;
    achvRenormalizeOrders();
    saveState();
    renderAchvPanel();
    showBanner('分类已删除，排序位已重整。', 'success');
  });
}

/** 分类排序：与相邻项交换 order 后归一化（dir = -1 上移 / +1 下移） */

function onAchvCatMoveClick(id, dir) {
  const cats = achvCategoriesOrdered();
  const i = cats.findIndex(function (c) { return c.id === id; });
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  const t = cats[i].order;
  cats[i].order = cats[j].order;
  cats[j].order = t;
  achvRenormalizeOrders();
  saveState();
  renderAchvPanel();
}

/** 表头设置保存（选址拍板：业绩面板「月报导出与设置」卡；单位空回落默认） */

function onAchvSettingsSubmit() {
  const org = document.getElementById('achvOrgName');
  const un = document.getElementById('achvUserName');
  const ut = document.getElementById('achvUserTitle');
  state.settings.orgName = ((org && org.value.trim()) || '口腔医学院');
  state.settings.userName = un ? un.value.trim() : '';
  state.settings.userTitle = ut ? ut.value.trim() : '';
  saveState();
  showBanner('表头设置已保存（单位 / 姓名 / 职务）。', 'success');
}

/* ============================================================
   三期 3.0c 业绩导入（附录A §12.5 两格式首轮写入 + B.7 #41 同名分类合并；
   R2 预览确认铁律：解析与预览纯函数零写入，确认后才落库）
   ============================================================ */

/** 业绩导入 UI 态（纯 UI 态，不入数据；预览模型随 resetTodayUi 复位） */

let uiAchvImportMode = 'text';     // 'text' = 随手记文本行；'json' = JSON 数组

let uiAchvImportText = '';         // 粘贴草稿（重渲染保留，免重贴）

let uiAchvImportBase = '';         // 基准月 YYYY-MM（空 = 回默认当前月）

let uiAchvImportParsed = null;     // 预览模型 { items, rejected, baseMonth, mode }

let uiAchvImportError = '';        // 解析错误信息

/* 插单 1.29 拍板③预览列选择（纯 UI 态，不入数据；负向锁定组——与导入草稿同惯例
   不纳入复位声明表）：{ date, category, content(恒true), role }——未勾选列按缺省
   口径写入（日期→基准月 1 日、分类→兜底「其他工作」、本人作用→空串）。 */
let uiAchvImportColSel = null;     // null = 全列导入（默认）

/* 三期 3.0d 移动速记 UI 态（纯 UI 态，不入数据；随 resetTodayUi 复位） */

let uiAchvQuickRange = 'today';    // 三段列表：today（默认，B.7 #38）/ month / all

let uiAchvQuickCat = '';           // 二级分类筛选（空 = 全部）

let uiAchvRoleEditId = null;       // 「本人作用」快改内联编辑对象

let uiAchvBatchSel = {};           // 四期⑨：批量删除勾选集（id→bool，负向锁定组）

/* 四期⑪（1.29 拍板 c 导出列选择）：导出报表可选列（本人作用/日期），纯 UI 态不入数据；
   负向锁定组——与导入列选择 uiAchvImportColSel 同惯例不入复位声明表；
   null = 全列（默认，与改前导出逐字节一致——基线 33/34 节断言零改写基石） */
let uiAchvExportColSel = null;

/* W6-4：工具区折叠态（纯 UI 态不入数据；负向锁定组——与导出列选择同惯例不入复位声明表） */
let uiAchvToolOpen = false;

/**
 * 分类名模糊匹配（纯函数，三级口径）：① 精确（trim）；② 去括号说明
 * （「教学建设（日常工作）」↔「教学建设」）；③ 子串（输入 ≥2 字且与去括号名互为子串）。
 * 均未命中 → null（走预览改派或自动新建）；多命中取排序位最前者。
 */

function achvImportCardHtml(month) {
  const base = /^\d{4}-\d{2}$/.test(uiAchvImportBase) ? uiAchvImportBase
    : (/^\d{4}-\d{2}$/.test(month) ? month : fmtLocalDate(new Date()).slice(0, 7));
  const preview = uiAchvImportParsed ? achvImportPreviewHtml(uiAchvImportParsed) : '';

  return '<p class="tool-section-title">导入业绩</p>' +
    '<div class="form-grid">' +
      '<div class="field">' +
        '<label for="achvImportMode">导入格式</label>' +
        '<select id="achvImportMode">' +
          '<option value="text"' +
            (uiAchvImportMode !== 'json' && uiAchvImportMode !== 'table' ? ' selected' : '') +
            '>随手记文本行</option>' +
          '<option value="table"' + (uiAchvImportMode === 'table' ? ' selected' : '') +
            '>表格粘贴（从报告表复制）</option>' +
          '<option value="json"' + (uiAchvImportMode === 'json' ? ' selected' : '') +
            '>JSON 数组</option>' +
        '</select>' +
      '</div>' +
      '<div class="field">' +
        '<label for="achvImportBase">基准月（日期缺省取该月 1 日）</label>' +
        '<input id="achvImportBase" type="month" value="' + escapeHtml(base) + '">' +
      '</div>' +
      '<div class="field" style="grid-column:1 / -1">' +
        '<label for="achvImportText">粘贴导入内容</label>' +
        '<textarea id="achvImportText" class="ipt" style="min-height:100px" ' +
          'placeholder="2026-09-05｜教学建设（日常工作）｜集体备课｜主持\n加分项|监考|">' +
          escapeHtml(uiAchvImportText) + '</textarea>' +
      '</div>' +
    '</div>' +
    (uiAchvImportError ? '<div class="form-error" role="alert">' + escapeHtml(uiAchvImportError) + '</div>' : '') +
    '<div class="form-actions">' +
      '<button type="button" class="btn-primary btn-auto" id="btnAchvImportParse">解析预览</button>' +
    '</div>' +
    '<p class="hint-line">随手记：每行 日期｜分类｜内容｜作用（日期可省取基准月 1 日）；表格粘贴：Word 全选报告表复制后直接粘贴；JSON：[{date, category, content, role}]。解析失败行标红拒收，未识别分类自动归入「其他工作」；确认前不写数据。</p>' +
    preview;
}

/** 「解析预览」：读控件 → 按格式解析 → 建预览模型（state 零写入，R2）；失败标错并清空旧模型 */

function onAchvImportParseClick() {
  const textEl = document.getElementById('achvImportText');
  const baseEl = document.getElementById('achvImportBase');
  const modeEl = document.getElementById('achvImportMode');
  uiAchvImportText = textEl ? textEl.value : uiAchvImportText;
  uiAchvImportBase = (baseEl && /^\d{4}-\d{2}$/.test(baseEl.value)) ? baseEl.value
    : fmtLocalDate(new Date()).slice(0, 7);
  uiAchvImportMode = modeEl ? modeEl.value : uiAchvImportMode;
  uiAchvImportError = '';
  uiAchvImportParsed = null;   // 先清旧预览：解析失败绝不留旧模型误导（R2 精神）
  if (!String(uiAchvImportText).trim()) {
    uiAchvImportError = '请先粘贴导入内容。';
    renderAchvPanel();
    return;
  }
  const parsed = uiAchvImportMode === 'json'
    ? parseAchvJsonImportText(uiAchvImportText)
    : uiAchvImportMode === 'table'
    ? parseAchvTableText(uiAchvImportText)   // 插单 1.27：报告表 TSV（date 恒空，确认时按基准月补）
    : parseAchvImportText(uiAchvImportText, uiAchvImportBase);
  if (parsed.error) {
    uiAchvImportError = parsed.error;
    renderAchvPanel();
    return;
  }
  if (!parsed.rows.length && !parsed.rejected.length) {
    uiAchvImportError = '未解析到任何条目。';
    renderAchvPanel();
    return;
  }
  uiAchvImportParsed = { items: buildAchvImportPreview(parsed.rows),
    rejected: parsed.rejected, baseMonth: uiAchvImportBase, mode: uiAchvImportMode };
  renderAchvPanel();
}

/**
 * 「确认导入勾选项」（R2 确认后才落库）：条目 nextId('a') 重新发号（D7，与本面板手工
 * 新建同链）；未命中分类自动新建（nextId('ac')、order=max+1，同名多行只建一门并同挂）；
 * 预览改派过的行直接用改派分类，不新建；完成后横幅汇报（R7 不弹窗）。
 */

function onAchvImportConfirmClick() {
  if (!uiAchvImportParsed) return;
  const ts = nowIso();
  const base = uiAchvImportParsed.baseMonth;
  // 插单 1.29 拍板③：列选择消费——未勾选列按缺省口径写入（null = 全列导入）
  const colSel = uiAchvImportColSel || {};
  const colDate = colSel.date !== false, colCat = colSel.category !== false,
    colRole = colSel.role !== false;
  const autoCreated = {};   // 同名「自动新建」分类只建一门（载荷内多行共享，B.7 #41 精神）
  const newCatCount = {};   // 同名待新建分类的行数统计（横幅合并提示用）
  let added = 0, skipped = 0, createdCats = 0, fbCount = 0;   // fbCount = 兜底归入条数（1.29）
  const createdNames = [];
  // W2-D #317：分类列未勾选时，确认层实际全部走兜底——兜底目标先取一次，既作拒收判据
  // 也作落库 categoryId，并按「实际生效是否兜底」如实计数（修复前 fbCount 仅在 colCat
  // 为真时计，列关闭但实际全兜底会报 0）。
  const fbCatIdW2D = achvFallbackCatId();
  // 插单 1.26 修复 P0-2：skipped 只由落库循环计一次（此前两遍 forEach 各计一次，横幅翻倍）
  uiAchvImportParsed.items.forEach(function (it) {
    if (!it.checked) return;
    if (!it.categoryId) {
      newCatCount[it.row.category] = (newCatCount[it.row.category] || 0) + 1;
    }
  });
  uiAchvImportParsed.items.forEach(function (it) {
    if (!it.checked) { skipped++; return; }
    // W0 #4（2026-09-19）：兜底目标缺失（预置分类被删且分类表空）且分类列未勾选导入 →
    // 该行拒收，绝不写 categoryId:null（违反 §12.3 必填）。**必须置于自动新建分类之前**——
    // 探针实证：放其后会被「先建类使兜底变非空」绕过，行仍落库（2026-09-19 探针抓出）
    if (!colCat && !fbCatIdW2D) { skipped++; return; }
    let catId = it.categoryId;
    if (!catId) {
      const nm = it.row.category;
      if (autoCreated[nm]) {
        catId = autoCreated[nm];
      } else {
        const maxOrder = state.achievementCategories.reduce(function (m, c) {
          return Math.max(m, c.order || 0); }, 0);
        const nc = { id: nextId('ac'), name: nm, order: maxOrder + 1,
          createdAt: ts, updatedAt: ts };
        state.achievementCategories.push(nc);
        autoCreated[nm] = nc.id;
        catId = nc.id;
        createdCats++;
        createdNames.push(nm);
      }
    }
    // 插单 1.29 拍板①兜底计数（确认横幅提示）＋ W2-D #317：按实际生效分类计数——
    // 分类列勾选时只看预览模型的 fallback 档；分类列未勾选时确认层已全部走兜底，如实计入。
    if (colCat ? it.level === 'fallback' : fbCatIdW2D) fbCount++;
    state.achievements.push({
      id: nextId('a'),
      // 拍板③：日期列取消 → 基准月 1 日；否则日期可省 → 基准月 1 日（§12.5）
      date: (colDate && it.row.date) ? it.row.date : (base + '-01'),
      categoryId: colCat ? catId : fbCatIdW2D,
      content: it.row.content,
      role: colRole ? (it.row.role || '') : '',
      createdAt: ts,
      updatedAt: ts
    });
    added++;
  });
  const dupNames = Object.keys(newCatCount).filter(function (n) { return newCatCount[n] > 1; });
  uiAchvImportParsed = null;
  uiAchvImportError = '';
  saveState();
  renderAchvPanel();
  // W6-7 瘦身：命名清单仅示首项（「等」收口），落库口径与 mandated 锚逐字不动——
  // 同条须含「新增条目 N 条」「跳过未勾选 N 条」「N 条分类未识别」「自动归入」（1.26 P0-2／1.29 锚）
  showBanner('导入完成：新增条目 ' + added + ' 条' +
    (createdCats ? '（新建分类 ' + createdCats + ' 个' +
      (createdNames.length ? '：' + createdNames[0] + (createdNames.length > 1 ? ' 等' : '') : '') +
      '）' : '') +
    (skipped ? '，跳过未勾选 ' + skipped + ' 条' : '') +
    (fbCount ? '；' + fbCount + ' 条分类未识别，已自动归入「其他工作」' : '') +
    (dupNames.length ? '；同名分类多行已合并' : '') + '。', 'success');
}

/* ============================================================
   三期 3.0d 移动端业绩快速录入（B.7 #35–#38 定调；拍板①②③ 落变更记录 v1.40）
   ============================================================ */

/** 备份提醒阈值（拍板②：固定 7 天不入 settings，C2 最小改动） */

function onAchvQuickFixClick() {
  const ta = document.getElementById('achvImportText');
  if (!ta) return;
  const before = String(ta.value);
  const fixed = normalizeAchvQuickText(before);
  ta.value = fixed;
  uiAchvImportText = fixed;
  showBanner(fixed === before
    ? '草稿中暂无逗号/顿号/分号/斜杠需要替换。'
    : '已把草稿中的逗号/顿号/分号/斜杠统一为竖线（仅改草稿，可手动改回）。',
    fixed === before ? 'info' : 'success');
}

/**
 * 三段列表数据源（纯函数，B.7 #38）：today = date=今天；month = 指定自然月（YYYY-MM 前缀）；
 * all = 全部条目；catId 为二级分类筛选（空 = 全部）。排序：today/month 日期升序（同日按
 * createdAt），all 日期降序（最近在前，符合手机端「看最新」直觉）。
 */

function achvImportPreviewHtml(parsed) {
  // 四期④c（B.10-2.12）：匹配级别 hint——精确 / 去括号 / 子串；插单 1.29 增兜底档
  const lvlNames = { exact: '精确', strip: '去括号', substr: '子串', new: '待新建',
    fallback: '自动归类' };
  const rows = parsed.items.map(function (it, i) {
    let catCell, badge;
    if (it.categoryId) {
      const cat = state.achievementCategories.find(function (c) {
        return c.id === it.categoryId; });
      catCell = escapeHtml(cat ? cat.name : it.row.category);
      // 插单 1.29 拍板①：兜底条目标黄（badge-warn）＋人话提示，可定位改派其他分类
      badge = it.level === 'fallback'
        ? ' <span class="paste-badge badge-warn">自动归类</span>' +
          ' <span class="factor-hint">（未识别分类，已自动归入——可在本行改派）</span>'
        : ' <span class="paste-badge badge-new">新增</span>' +
          ' <span class="factor-hint">（' + lvlNames[it.level || 'new'] + '）</span>';
    } else {
      const opts = '<option value="">自动新建「' + escapeHtml(it.row.category) + '」</option>' +
        achvCategoriesOrdered().map(function (c) {
          return '<option value="' + escapeHtml(c.id) + '">归入：' +
            escapeHtml(c.name) + '</option>';
        }).join('');
      catCell = '<select id="achvImportAssign-' + i + '" class="paste-assign">' + opts + '</select>';
      badge = ' <span class="paste-badge badge-newcourse">待新建分类</span>' +
        ' <span class="factor-hint">（' + lvlNames[it.level || 'new'] + '）</span>';
    }
    return '<tr>' +
      '<td><input type="checkbox" id="achvImportPick-' + i + '"' +
        (it.checked ? ' checked' : '') + '></td>' +
      '<td>' + (it.row.date ? escapeHtml(it.row.date) : '—') + '</td>' +
      '<td>' + catCell + badge + '</td>' +
      '<td>' + escapeHtml(it.row.content) + '</td>' +
      '<td>' + (it.row.role ? escapeHtml(it.row.role) : '—') + '</td>' +
    '</tr>';
  }).join('');
  const rejRows = parsed.rejected.map(function (rj) {
    return '<tr class="paste-reject-row"><td colspan="5">第 ' + rj.line +
      ' 行拒收：' + escapeHtml(rj.text) + ' —— ' + escapeHtml(rj.reason) + '</td></tr>';
  }).join('');
  const picked = parsed.items.filter(function (it) { return it.checked; }).length;
  // 插单 1.29 拍板③预览列选择：勾选 = 该列本次导入写入；内容列必选（缺之条目无意义）。
  // 未勾选的列按缺省口径——日期→基准月 1 日、分类→兜底「其他工作」、本人作用→空串。
  // 复用 factor-row / factor-label 既有体系（R3 零新增样式）；纯 UI 态 uiAchvImportColSel。
  const cs = uiAchvImportColSel || { date: true, category: true, content: true, role: true };
  const colSelHtml = '<div class="factor-row" style="margin:10px 0 2px">' +
    '<span class="factor-hint">导入列选择：</span>' +
    '<label class="factor-label"><input type="checkbox" id="achvColDate"' +
      (cs.date !== false ? ' checked' : '') + '>日期</label>' +
    '<label class="factor-label"><input type="checkbox" id="achvColCat"' +
      (cs.category !== false ? ' checked' : '') + '>分类</label>' +
    '<label class="factor-label"><input type="checkbox" id="achvColContent" checked disabled>' +
      '工作内容（必选）</label>' +
    '<label class="factor-label"><input type="checkbox" id="achvColRole"' +
      (cs.role !== false ? ' checked' : '') + '>本人作用</label>' +
    '<span class="factor-hint">（未勾选的列按缺省写入：日期取基准月 1 日、分类自动归入「其他工作」）</span>' +
    '</div>';
  return '<div class="import-preview" style="margin-top:12px">' + colSelHtml + '<table>' +
    '<thead><tr><th scope="col">导入</th><th scope="col">日期</th><th scope="col">分类</th><th scope="col">工作内容与效果</th><th scope="col">本人作用</th></tr></thead>' +
    '<tbody>' + rows + rejRows + '</tbody></table></div>' +
    '<div class="form-actions" style="margin-top:12px">' +
      '<button type="button" class="btn-primary btn-auto" id="btnAchvImportConfirm">确认导入勾选项（' +
        picked + ' 条）</button>' +
      '<button type="button" class="btn-sec" id="btnAchvImportBack">返回重贴</button>' +
    '</div>';
}

/**
 * 业绩导入卡控件绑定（三期 3.0d 抽出共用，C4）：桌面「导入业绩」卡与移动速记首屏卡
 * 同一套解析/预览/确认链路与草稿回读，行为逐字节一致。
 */

function bindAchvImportControls() {
  const btnImpParse = document.getElementById('btnAchvImportParse');
  if (btnImpParse) btnImpParse.addEventListener('click', onAchvImportParseClick);
  const btnImpBack = document.getElementById('btnAchvImportBack');
  if (btnImpBack) btnImpBack.addEventListener('click', function () {
    uiAchvImportParsed = null;
    uiAchvImportError = '';
    renderAchvPanel();
  });
  const btnImpConfirm = document.getElementById('btnAchvImportConfirm');
  if (btnImpConfirm) btnImpConfirm.addEventListener('click', onAchvImportConfirmClick);
  if (uiAchvImportParsed) {
    uiAchvImportParsed.items.forEach(function (it, i) {
      const pick = document.getElementById('achvImportPick-' + i);
      if (pick) pick.addEventListener('change', function () { it.checked = !!pick.checked; });
      const assign = document.getElementById('achvImportAssign-' + i);
      if (assign) assign.addEventListener('change', function () {
        it.categoryId = assign.value || null;   // 预览改派：确认时直接用既有分类，不新建
      });
    });
    // 插单 1.29 拍板③：列选择勾选 → 纯 UI 态（不重渲染：复选框自身即状态，确认时消费）
    const cs0 = uiAchvImportColSel || { date: true, category: true, content: true, role: true };
    [['achvColDate', 'date'], ['achvColCat', 'category'], ['achvColRole', 'role']]
      .forEach(function (pair) {
        const box = document.getElementById(pair[0]);
        if (!box) return;
        box.addEventListener('change', function () {
          cs0[pair[1]] = !!box.checked;
          uiAchvImportColSel = cs0;
        });
      });
  }
  const impModeEl = document.getElementById('achvImportMode');
  if (impModeEl) impModeEl.addEventListener('change', function () {
    uiAchvImportMode = impModeEl.value;
  });
  const impBaseEl = document.getElementById('achvImportBase');
  if (impBaseEl) impBaseEl.addEventListener('change', function () {
    uiAchvImportBase = impBaseEl.value;
  });
  const impTextEl = document.getElementById('achvImportText');
  if (impTextEl) impTextEl.addEventListener('change', function () {
    uiAchvImportText = impTextEl.value;   // 重渲染（解析/标错）后保留草稿，免重贴
  });
}

/** 移动速记首屏卡：大文本行快速录入（复用 3.0c 解析/预览/确认链路，R2 零写入不变） */

function achvQuickEntryCardHtml(month) {
  const base = /^\d{4}-\d{2}$/.test(uiAchvImportBase) ? uiAchvImportBase
    : (/^\d{4}-\d{2}$/.test(month) ? month : fmtLocalDate(new Date()).slice(0, 7));
  return '<div class="cal-form-card">' +
    '<h3>快速录入</h3>' +
    '<p class="hint-line">每行一条：日期｜分类｜内容｜作用（日期可省）；语音输入先点键盘麦克风，' +
      '再「一键补竖线」「解析预览」勾选确认，确认前不写数据。</p>' +
    '<div class="form-grid">' +
      // 四期⑤（B.9-5.6）：移动卡硬编码 text 模式——JSON 选项回桌面端导入卡、不占首屏；
      // 隐藏 input 沿用 achvImportMode 取值口（恒 text），解析 / 确认 / 草稿回读链路
      // 与桌面端逐字节一致（bindAchvImportControls / onAchvImportParseClick 零改动）
      '<input id="achvImportMode" type="hidden" value="text">' +
      '<div class="field">' +
        '<label for="achvImportBase">基准月（日期缺省取该月 1 日）</label>' +
        '<input id="achvImportBase" type="month" value="' + escapeHtml(base) + '">' +
      '</div>' +
      '<div class="field full">' +
        '<label for="achvImportText">口述 / 粘贴内容</label>' +
        '<textarea id="achvImportText" class="paste-textarea achv-quick-textarea" ' +
          'placeholder="加分项，监考，\n教学建设 集体备课 主持">' +
          escapeHtml(uiAchvImportText) + '</textarea>' +
      '</div>' +
    '</div>' +
    (uiAchvImportError ? '<div class="form-error" role="alert">' + escapeHtml(uiAchvImportError) + '</div>' : '') +
    '<div class="form-actions">' +
      '<button type="button" class="btn-sec" id="btnAchvQuickFix">一键补竖线</button>' +
      '<button type="button" class="btn-primary btn-auto" id="btnAchvImportParse">解析预览</button>' +
    '</div>' +
    (uiAchvImportParsed ? achvImportPreviewHtml(uiAchvImportParsed) : '') +
  '</div>';
}

/**
 * 移动速记视图主渲染（拍板①：业绩面板 ≤640px 重排；桌面宽屏逐字节不变）：
 * 首屏快速录入卡 + 三段列表（今天默认）+ 二级分类筛选 + 轻量编辑（本人作用快改/删除）。
 */

function renderAchvQuickPanel(cal) {
  const todayStr = fmtLocalDate(new Date());
  const month = (/^\d{4}-\d{2}$/.test(uiAchvMonth))
    ? uiAchvMonth : todayStr.slice(0, 7);
  const list = achvQuickList(uiAchvQuickRange, month, uiAchvQuickCat);

  const tabsHtml = '<div class="achv-quick-tabs">' +
    [['today', '今天', 'Today'], ['month', '本月', 'Month'], ['all', '全部', 'All']]
      .map(function (o) {
        const active = uiAchvQuickRange === o[0] ? ' active' : '';
        return '<button type="button" class="btn-sec' + active + '" id="achvTab' + o[2] + '">' +
          o[1] + '</button>';
      }).join('') + '</div>';

  const catOpts = '<option value="">全部分类</option>' +
    achvCategoriesOrdered().map(function (c) {
      const sel = uiAchvQuickCat === c.id ? ' selected' : '';
      return '<option value="' + escapeHtml(c.id) + '"' + sel + '>' +
        escapeHtml(c.name) + '</option>';
    }).join('');

  const rowsHtml = list.map(function (a) {
    const cat = state.achievementCategories.find(function (c) {
      return c.id === a.categoryId; });
    const safe = isSafeElId(a.id);
    let roleCell, ops;
    if (!safe) {
      roleCell = escapeHtml((a.role || '').trim() || '—');
      ops = '';   // 1.15 防线：脏 id 不渲染操作按钮（绑定层同步跳过）
    } else if (uiAchvRoleEditId === a.id) {
      roleCell = '<input id="achvRoleInput-' + escapeHtml(a.id) +
        '" type="text" maxlength="100" value="' + escapeHtml(a.role || '') + '">';
      ops = '<button type="button" class="btn-sec" id="btnAchvRoleSave-' +
        escapeHtml(a.id) + '">保存作用</button>';
    } else {
      roleCell = escapeHtml((a.role || '').trim() || '—');
      ops = '<button type="button" class="btn-sec" id="btnAchvRoleEdit-' +
        escapeHtml(a.id) + '">改作用</button>' +
        '<button type="button" class="btn-danger" id="btnAchvQuickDel-' +
        escapeHtml(a.id) + '">删除</button>';
    }
    return '<div class="cal-card">' +
      '<div class="cal-card-main">' +
        '<div class="cal-card-name">' + escapeHtml(a.date) + ' · ' +
          escapeHtml(cat ? cat.name : '未分类') + '</div>' +
        '<div class="cal-card-meta">' + escapeHtml(a.content) + '</div>' +
        '<div class="cal-card-meta">本人作用：' + roleCell + '</div>' +
      '</div>' +
      '<div class="cal-card-actions">' + ops + '</div>' +
    '</div>';
  }).join('');

  appRoot.innerHTML =
    '<div class="app-shell">' +
      // 四期⑤（B.11-U2）：速记顶栏复用 3.1c readonlyTopbarHtml——窄屏不渲染 9 入口导航，
      // 品牌 / 当前校历名 / 保存状态灯保留，与移动周格只读视图同一顶栏语义，杜绝顶栏挤爆
      readonlyTopbarHtml(cal) +
      mobileNavHtml() +   // W0 #7：第二行导航（速记视图原本无任何出口，消除死路）
      '<main class="main-area" id="mainContent">' +
        '<div class="panel-head"><h2>业绩本 · 手机速记</h2></div>' +
        achvQuickEntryCardHtml(month) +
        '<div class="cal-form-card" style="margin-top:16px">' +
          '<h3>业绩列表（' + list.length + ' 条）</h3>' +
          tabsHtml +
          '<div class="field" style="margin-top:10px">' +
            '<label for="achvQuickCat">分类筛选（二级，不占首屏）</label>' +
            '<select id="achvQuickCat">' + catOpts + '</select>' +
          '</div>' +
          (rowsHtml
            ? '<div class="cal-list" style="margin-top:12px">' + rowsHtml + '</div>'
            : emptyStateHtml('当前范围内还没有业绩条目。下一步：在上方「快速录入」粘贴或口述内容，点「解析预览」确认后入账。', '', ICON_ACHV)) +   // 四期⑨：空状态三件套
          '<p class="hint-line">手机端仅改「本人作用」与删除（删除需确认）；' +
            '内容 / 日期 / 分类修改请回桌面端业绩面板。</p>' +
        '</div>' +
      '</main>' +
    '</div>';

  // 四期⑤（B.11-U2）：只读顶栏无导航按钮，bindTopbarNav 不再调用（R5 伴生物清场）
  updateSaveIndicator(storageAvailable);
  bindMobileNav();   // W0 #7：第二行导航绑定
  bindAchvImportControls();   // 速记首屏与桌面导入卡共用 3.0c 解析/预览/确认绑定
  const btnFix = document.getElementById('btnAchvQuickFix');
  if (btnFix) btnFix.addEventListener('click', onAchvQuickFixClick);
  [['today', 'Today'], ['month', 'Month'], ['all', 'All']].forEach(function (o) {
    const btn = document.getElementById('achvTab' + o[1]);
    if (!btn) return;
    btn.addEventListener('click', function () {
      uiAchvQuickRange = o[0];
      uiAchvRoleEditId = null;
      renderAchvPanel();
    });
  });
  const catSel = document.getElementById('achvQuickCat');
  if (catSel) catSel.addEventListener('change', function () {
    uiAchvQuickCat = catSel.value || '';
    uiAchvRoleEditId = null;
    renderAchvPanel();
  });
  list.forEach(function (a) {
    if (!isSafeElId(a.id)) return;   // 1.15 子项③：脏 id 不绑定
    const bEdit = document.getElementById('btnAchvRoleEdit-' + a.id);
    if (bEdit) bEdit.addEventListener('click', function () {
      uiAchvRoleEditId = (uiAchvRoleEditId === a.id) ? null : a.id;
      renderAchvPanel();
    });
    const bSave = document.getElementById('btnAchvRoleSave-' + a.id);
    if (bSave) bSave.addEventListener('click', function () { onAchvQuickRoleSave(a.id); });
    const bDel = document.getElementById('btnAchvQuickDel-' + a.id);
    if (bDel) bDel.addEventListener('click', function () { onAchvDeleteClick(a.id); });
  });
}

/**
 * 「本人作用」快改保存（三期 3.0d 轻量编辑）：仅更新 role + updatedAt 刷新；
 * 内容/日期/分类不在手机端修改（回桌面端）。横幅汇报（R7 不弹窗）。
 */

function onAchvQuickRoleSave(id) {
  const a = state.achievements.find(function (x) { return x.id === id; });
  if (!a) return;
  const input = document.getElementById('achvRoleInput-' + id);
  // 插单 1.26 修复 P0-3：输入框缺失（行重渲染/脏 id）时不得静默清空 role——放弃本次修改
  if (!input) return;
  const role = input.value.trim();
  a.role = role;
  a.updatedAt = nowIso();
  uiAchvRoleEditId = null;
  saveState();
  renderAchvPanel();
  showBanner('本人作用已更新（' + (role || '已清空') + '）。', 'success');
}

/** 四期⑨（B.11-U31）：区间汇总单表命名——…_YYYY年M月-YYYY年M月_汇总[_姓名].html */
function achievementRangeFilename(fromMonth, toMonth) {
  const f = String(fromMonth).split('-'), t = String(toMonth).split('-');
  const name = achvSafeFilePart((state.settings.userName || '').trim());
  return '工作业绩报告表_' + f[0] + '年' + parseInt(f[1], 10) + '月-' +
    t[0] + '年' + parseInt(t[1], 10) + '月_汇总' + (name ? '_' + name : '') + '.html';
}

/** 区间汇总单表 HTML：表头年月 = 区间串；学时项 = 区间投影（标注区间合计），条目 = 区间过滤升序 */
function buildAchievementRangeSummaryHtml(fromMonth, toMonth, cols) {
  const s = state.settings;
  const rangeText = String(fromMonth) + ' ~ ' + String(toMonth);
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>工作业绩报告表（' + escapeHtml(rangeText) + ' · 区间汇总）</title><style>' +
    ACHV_REPORT_CSS + '</style></head><body>' +
    '<h1>工作业绩报告表（区间汇总）</h1>' +
    '<div class="meta"><span>单位：' + escapeHtml(s.orgName || '') + '</span>' +
    '<span>姓名：' + escapeHtml(s.userName || '') + '</span>' +
    '<span>职务/职称：' + escapeHtml(s.userTitle || '') + '</span>' +
    '<span>年月：' + escapeHtml(rangeText) + '</span></div>' +
    '<table><thead>' + achvReportTheadHtml(cols) + '</thead><tbody>' +
    achievementTableRowsHtml(achvEntriesOfRange(fromMonth, toMonth),
      rangeAchvProjection(fromMonth, toMonth), '学时项（授课·区间合计）', cols) +
    '</tbody></table></body></html>';
}

/** 区间汇总导出入口：校验起止 → 导出单表 → 备份提醒写点④（与三导出口同口径，复制上月不算） */
function downloadAchievementRange(fromMonth, toMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(fromMonth)) || !/^\d{4}-\d{2}$/.test(String(toMonth))) {
    showBanner('请选择有效的起止月份。', 'warn'); return;
  }
  if (String(fromMonth) > String(toMonth)) { showBanner('区间起不能晚于区间止。', 'warn'); return; }
  downloadTextFile(achievementRangeFilename(fromMonth, toMonth),
    buildAchievementRangeSummaryHtml(fromMonth, toMonth, uiAchvExportColSel),
    'text/html;charset=utf-8');
  state.settings.lastAchievementExportAt = nowIso();   // 四期⑨：备份提醒写点④（区间导出）
  saveState();
  achvBlankRoleBanner(String(fromMonth) + ' ~ ' + String(toMonth),
    achvEntriesOfRange(fromMonth, toMonth));
}

/* ============================================================
   五、工具函数
   ============================================================ */

/**
 * 改期落点冲突检测（插单 1.19，AI 提案 A2 / B.6 #21；纯函数，调课/补课两写点共用，C4）：
 * 在当前校历内找 date 当天与 periodsStr 区间相交的其他流水（excludeInstId 排除自身）。
 * 区间相交判定：两 periodRangeOf 解析结果 start≤end 交叉；解析上限按 active 校历
 * periodCountOf（插单 1.11 口径）；目标或候选 periods 脏数据解析不出 → 返回 null
 * 静默放行（不阻塞业务，与 1.5 F1 同精神）。canceled（停课）记录算占用——
 * 2026-09-18 按建议执行：该时段虽实际空出，但横幅注明「该时段已有停课记录」提醒用户。
 */


/* ---------- 声明式 UI 态复位表（拆分评估方案 v1.2 §4.3；achv 13 项，与拆分前 resetTodayUi 逐条一致。
   复审 P0-3 修正：uiAchvImportMode / uiAchvImportText / uiAchvImportBase 不纳入复位——导入卡粘贴
   草稿与格式选择在切视图后保留（拆分前语义）。） ---------- */
const ACHV_UI_DECLS = [
  makeUiDecl(function () { return uiAchvCatOpen; },
    function (v) { uiAchvCatOpen = v; }, false),
  makeUiDecl(function () { return formAchvCatId; },
    function (v) { formAchvCatId = v; }, null),
  makeUiDecl(function () { return uiAchvFormOpen; },
    function (v) { uiAchvFormOpen = v; }, false),
  makeUiDecl(function () { return formAchvId; },
    function (v) { formAchvId = v; }, null),
  makeUiDecl(function () { return uiAchvMonth; },
    function (v) { uiAchvMonth = v; },
    function () { return fmtLocalDate(new Date()).slice(0, 7); }),
  makeUiDecl(function () { return uiAchvCopySrc; },
    function (v) { uiAchvCopySrc = v; }, ''),
  makeUiDecl(function () { return uiAchvCopyDst; },
    function (v) { uiAchvCopyDst = v; }, ''),
  makeUiDecl(function () { return uiAchvCopyParsed; },
    function (v) { uiAchvCopyParsed = v; }, null),
  makeUiDecl(function () { return uiAchvImportParsed; },
    function (v) { uiAchvImportParsed = v; }, null),
  makeUiDecl(function () { return uiAchvImportError; },
    function (v) { uiAchvImportError = v; }, ''),
  makeUiDecl(function () { return uiAchvQuickRange; },
    function (v) { uiAchvQuickRange = v; }, 'today'),
  makeUiDecl(function () { return uiAchvQuickCat; },
    function (v) { uiAchvQuickCat = v; }, ''),
  makeUiDecl(function () { return uiAchvRoleEditId; },
    function (v) { uiAchvRoleEditId = v; }, null)
];
function resetAchvUi() { applyUiDecls(ACHV_UI_DECLS); }

