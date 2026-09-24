/* 教员台 · engines.js —— 数据引擎（零 DOM）：展开引擎 / 解析链 / 规则引擎 / 导入合并 /
   业绩投影与解析 / 冲突扫描 / 对账投影 / 统计纯函数。函数体逐字搬迁自 app.js 1.26。 */

'use strict';

function entryTypeId(en) {
  // 四期④a：null/undefined 守卫（违参不崩溃，附录A §5 回退哲学）
  if (!en) return normalizeTypeId('theory');
  const t = en && en.typeId;
  if (t && state.courseTypes.some(function (x) { return x.id === t; })) return t;
  const c = state.courses.find(function (x) { return x.id === en.courseId; });
  return normalizeTypeId(c ? c.typeId : 'theory');
}

/**
 * 授课班级回落链（插单 1.22，v1.27 方案乙拍板）：排课项 entry.classes → 课程 course.classes → 空串。
 * 班级仅展示用——不写入流水快照（§7 快照字段不含 classes）、不进统计/结算/导出；
 * 渲染处（排课项列表 / 周格色块 meta / 今日清单 meta）一律实时经此函数回落，空串不渲染分隔符。
 */

function entryClassesOf(en) {
  if (en && typeof en.classes === 'string' && en.classes) return en.classes;
  const c = en ? state.courses.find(function (x) { return x.id === en.courseId; }) : null;
  return (c && c.classes) || '';
}

function findEntryConflict(weekday, periodStart, periodEnd, weeks, excludeEntryId) {
  const cal = getActiveCalendar();
  if (!cal) return null;
  const weekSet = {};
  (Array.isArray(weeks) ? weeks : []).forEach(function (w) { weekSet[w] = true; });
  for (let i = 0; i < state.entries.length; i++) {
    const en = state.entries[i];
    if (en.id === excludeEntryId) continue;
    if (en.calendarId !== cal.id || en.weekday !== weekday) continue;
    const eps = en.periodStart, epe = en.periodEnd;
    if (!(Number.isInteger(eps) && Number.isInteger(epe) &&
          eps <= periodEnd && periodStart <= epe)) continue;   // 节次相交（相邻不报）
    const ew = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
      ? en.weekPattern.weeks : [];
    let inter = false;
    for (let j = 0; j < ew.length; j++) { if (weekSet[ew[j]]) { inter = true; break; } }
    if (!inter) continue;                                    // 周次无交集不报
    const course = state.courses.find(function (c) { return c.id === en.courseId; });
    // 四期⑦（B.11-U13）：冲突定位——返回体补重叠周号清单（双方 weeks[] 交集，升序），
    // 供新建排课项横幅标出「重叠周：X、Y」，文案不硬拒口径不变
    const overlapWeeks = ew.filter(function (w) { return weekSet[w]; })
      .sort(function (a, b) { return a - b; });
    return { entry: en, courseName: course ? course.name : '未知课程',
      overlapWeeks: overlapWeeks };
  }
  return null;
}

/* ============================================================
   四之四乙、教务课表文本粘贴解析（一期 1.9）
   依据 D5 导入两级制之「①粘贴文本解析」+ R2 预览确认铁律 + Q1 weeks[] 权威：
    - 从 Excel/PDF 复制的课表文本（制表符/多空格分列，含星期表头与节次首列）容错解析：
      全半角归一、中文/数字节次标签（第一节 / 1）、竖向合并单元格空行向下继承
      （"第一节/第二节"同课并段）、同一课程相邻节次自动并段；
    - 周次多写法（用户裁定语义）：连续范围「10-19」、单/双周关键字、「第X周」、
      混合列表「(3,5,8-16)」= 第3、5、8-16周（列表项可为区间）、
      裸周号「(代码) 1 (18号…)" = 仅第 1 周——节次后紧跟、号楼内容前的孤立数字即周次；
      「10-197号B308」类粘连按「起≤止≤30」消歧（= 10-19 周 + 7号B308）；
    - 课程归属三级裁定：课程名精确匹配已有课程（去空格、全半角归一）→ 归入；
      未匹配 → 预览默认「自动新建课程」（调色板自动配色、typeId 默认 theory，
      同名多行只建一门），预览表内可逐行下拉改派已有 active 课程；
      整行无法导入（无课程名 / 周次全部越界 / 节次越界）→ 标红拒收，绝不落库；
    - 去重键 = courseId|weekday|periodStart-periodEnd|weeks[]（升序周列表串）：
      与现有排课项或载荷内部完全同键 → 标「已存在重复」默认不勾选；
      同课程同星期同节次但周次/地点不同 → 标「类似已存在」黄提醒，默认勾选、
      按独立排课项并存（排课项本就允许多条共存）；
    - 粘贴导入不解析班级（插单 1.22 固化：教务课表文本无班级列），导入所建排课项 classes 缺省
     空串 = 跟随课程；班级仅展示用，不进流水快照/统计/导出；
   - 预览阶段零写入（R2，buildPastePreview 纯函数）；确认后建课程/排课项 →
      自动 expandEntries（方案 3）→ 落库 → 横幅汇报（R7 不弹窗）。
   ============================================================ */

/* ---------- 三期 3.1a CSV 文件导入（D5 之②；不引任何库，R1；v1.41 拍板②⑤） ---------- */

/**
 * CSV 字节解码（纯函数，便于沙盒断言）：
 *  ① 剥离 UTF-8 BOM（EF BB BF）；
 *  ② xlsx 魔数（PK\x03\x04）拒收——引导另存 CSV 或走粘贴（拍板② 不直读 .xlsx）；
 *  ③ UTF-8 主解；出现 U+FFFD 替换符（GBK/ANSI 被误按 UTF-8 解码的典型症状）→ 回退 GBK 重解
 *    （GBK 为 ASCII 超集，教务系统 GBK/ANSI 导出由此覆盖；拍板⑤）；
 *  ④ TextDecoder 不可用环境降级 Latin-1 直读（仅 ASCII 安全，不乱报）。
 * 返回 { text, encoding }；② 失败返回 { error }（人话原因）。
 */

function decodeCsvBytes(bytes) {
  var arr = bytes;
  if (typeof arr === 'undefined' || arr === null) return { error: '文件内容为空。' };
  // 防御：调用方约定 Uint8Array，脏入参（普通数组/类数组）先规范化为 Uint8Array——
  // 后续 subarray / TextDecoder 均要求 TypedArray，规范化保证数据层不抛错（1.5 F1 同精神）
  if (!(arr instanceof Uint8Array) && typeof arr.length === 'number') {
    arr = new Uint8Array(arr);
  }
  if (arr.length >= 3 && arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF) {
    arr = arr.subarray(3);                       // ① BOM 剥离（字节级，先于编码识别）
  }
  if (arr.length >= 4 && arr[0] === 0x50 && arr[1] === 0x4B &&
      arr[2] === 0x03 && arr[3] === 0x04) {
    return { error: '这是 .xlsx 文件：请用 Excel/WPS 另存为 CSV（UTF-8 或 GBK 均可）后重试，' +
      '或全选课表区域复制后走「粘贴导入」。' };
  }
  if (typeof TextDecoder === 'undefined') {
    var s = '';
    for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return { text: s, encoding: 'latin1-fallback' };
  }
  var u8 = null;
  try { u8 = new TextDecoder('utf-8').decode(arr); } catch (e1) { u8 = null; }
  if (u8 !== null && u8.indexOf('\uFFFD') < 0) {
    return { text: u8, encoding: 'utf-8' };
  }
  try {
    var g = new TextDecoder('gbk').decode(arr);
    return { text: g, encoding: 'gbk' };         // ③ GBK 兜底（GBK 为 ASCII 超集，非 GBK 文本亦不乱码）
  } catch (e2) {
    return { text: (u8 === null ? '' : u8), encoding: 'utf-8-lossy' };
  }
}

/**
 * 极简 RFC 4180 → 1.9 粘贴文本（纯函数）：
 * 逗号分列转制表符（1.9 splitPasteLine 只认 \t / 多空格，CSV 单空格逗号不分列，故先转换）；
 * 双引号包裹字段保护其内部逗号并去引号；"" 还原为 "；\r\n / \n 行尾统一且不产空行。
 */

function csvToPasteText(text) {
  var s = String(text);
  var lines = [], cur = [], field = '', inQ = false, i = 0;
  while (i < s.length) {
    var ch = s.charAt(i);
    if (inQ) {
      if (ch === '"') {
        if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      // 插单 1.26 修复 P0-1：RFC 4180 引号字段内换行替换为空格，防下游按行拆分错位
      if (ch === '\r' || ch === '\n') { field += ' '; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { cur.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { cur.push(field); lines.push(cur.join('\t')); cur = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || cur.length) { cur.push(field); lines.push(cur.join('\t')); }
  return lines.join('\n');
}

/**
 * CSV 引号闭合检查（W2-B #47，2026-09-20 问题列表裁决；纯函数，沙盒可直测）：
 * 扫引号态——"" 转义对整体跳过；扫描结束引号仍开着 = 未闭合。修复前 csvToPasteText 遇未闭合
 * 引号时 inQ 恒真，后续逗号/换行全被吞进同一字段，整份课表解析错位且无提示；调用方
 * （panels 文件选择写点）据此在**填入文本域之前**人话拒收，绝不把错位内容塞给 1.9 解析。
 * 口径说明：csvToPasteText 返回字符串为历史断言基石（平衡输入行为逐字节不变），
 * 报错通道独立走本函数——两函数引号态判定逻辑逐字一致。
 */
function csvQuoteUnclosed(text) {
  const s = String(text);
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (inQ) {
      if (ch === '"') {
        if (s.charAt(i + 1) === '"') { i++; continue; }   // "" 转义对
        inQ = false;
      }
    } else if (ch === '"') {
      inQ = true;
    }
  }
  return inQ;
}

/** FileReader 字节直读 → decodeCsvBytes；环境无 FileReader / 读取失败 → { error }（绝不静默） */

function readCsvFileText(file) {
  return new Promise(function (resolve) {
    if (typeof FileReader === 'undefined') {
      resolve({ error: '当前环境不支持文件读取，请改用粘贴导入。' }); return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      try { resolve(decodeCsvBytes(new Uint8Array(reader.result))); }
      catch (err) { resolve({ error: '文件解析失败，请改用粘贴导入。' }); }
    };
    reader.onerror = function () { resolve({ error: '文件读取失败，请重试或改用粘贴导入。' }); };
    try { reader.readAsArrayBuffer(file); }
    catch (err) { resolve({ error: '文件读取失败，请重试或改用粘贴导入。' }); }
  });
}

/**
 * 文件选择 change：读取 → 填入粘贴文本域 → 横幅汇报编码口径与引导。
 * 解析与确认仍由用户在粘贴区点「解析」「确认导入」完成（R2 预览确认铁律不变）；
 * 解码失败（xlsx / 读取错）横幅引导另存 CSV 或走粘贴，全程零写入。
 */

function normalizePasteText(t) {
  return String(t)
    .replace(/[！-～]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, ' ');
}

/** 分列：优先制表符（Excel 复制），否则按 2 个以上空白切 */

function splitPasteLine(line) {
  if (line.indexOf('\t') >= 0) return line.split('\t');
  return line.split(/\s{2,}/);
}

/** 表头单元格 → 星期（1–7）；认「星期一/周一/礼拜一/星期1」等写法 */

function weekdayOfHeaderCell(cell) {
  var m = normalizePasteText(cell).match(/(?:星期|周|礼拜)\s*([一二三四五六七1234567天日])/);
  if (!m) return null;
  var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '天': 7, '日': 7,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
  return map[m[1]] || null;
}

/** 中文数字节次标签 → 数字（十/十二/二十等，覆盖 1–30 内常规写法） */

function cnPeriodNum(s) {
  var CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (s === '十') return 10;
  var m = s.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
  if (m) return CN[m[1]] * 10 + (m[2] ? CN[m[2]] : 0);
  m = s.match(/^十([一二三四五六七八九])$/);
  if (m) return 10 + CN[m[1]];
  return CN[s] || null;
}

/**
 * 周次写法解析（纯函数，用户裁定语义）：
 *  ① 混合列表「(3,5,8-16)」→ 第 3、5、8-16 周（列表项可单周可区间，升序去重，custom）；
 *  ② 连续范围「(第)A-B(周)」，单/双周关键字定型 odd/even；
 *  ③ 「第X周」= 仅第 X 周；
 *  ④ 裸周号：代码括号与「号楼」等内容之间的孤立数字（前后为空格/括号/行端），
 *     如「…02) 1 (18号…" = 仅第 1 周；后随 号/班/层/室/栋 的数字属地点，不认领；
 *  粘连消歧：「10-197号」→ 起止均 ≤30 且起≤止才认领（= 10-19 周，余下归地点）；
 *  返回 { kind, startWeek, endWeek, customWeeks, rest }（rest = 去掉周次后的剩余文本）。
 */

function parseWeeksSpec(raw) {
  var s = String(raw);
  var out = { kind: 'every', startWeek: null, endWeek: null, customWeeks: null, rest: s };
  var isOdd = s.indexOf('单周') >= 0;
  var isEven = s.indexOf('双周') >= 0;
  var consumed = null;

  // ① 混合列表（项可含区间）：3,5,8-16 / 3，5、8-16周；后随 号/班/层/室/栋 的是地点不是周次
  var ml = s.match(/(?:\d{1,2}(?:\s*[-~]\s*\d{1,2})?\s*[,，、])+\d{1,2}(?:\s*[-~]\s*\d{1,2})?\s*周?(?!\s*[号班层室栋])/);
  if (ml) {
    var ws = [], ok = true;
    ml[0].replace(/\s*周?$/, '').split(/[,，、]/).forEach(function (tok) {
      var rm = tok.trim().match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/);
      if (rm) {
        var a = parseInt(rm[1], 10), b = parseInt(rm[2], 10);
        if (!(a >= 1 && a <= b && b <= 30)) { ok = false; return; }
        for (var w = a; w <= b; w++) if (ws.indexOf(w) < 0) ws.push(w);
      } else {
        var v = parseInt(tok.trim(), 10);
        if (!(v >= 1 && v <= 30)) { ok = false; return; }
        if (ws.indexOf(v) < 0) ws.push(v);
      }
    });
    if (ok && ws.length) {
      ws.sort(function (x, y) { return x - y; });
      out.kind = 'custom'; out.customWeeks = ws; consumed = ml[0];
    }
  }
  // ② 连续范围「(第)A-B(周)」
  if (!consumed) {
    var m = s.match(/第?\s*(\d{1,2})\s*[-~]\s*(\d{1,2})\s*周?/);
    if (m) {
      var a2 = parseInt(m[1], 10), b2 = parseInt(m[2], 10);
      if (a2 >= 1 && a2 <= b2 && b2 <= 30) {
        out.startWeek = a2; out.endWeek = b2; consumed = m[0];
      }
    }
  }
  // ③ 「第X周」
  if (!consumed) {
    var m2 = s.match(/第\s*(\d{1,2})\s*周/);
    if (m2) { out.startWeek = out.endWeek = parseInt(m2[1], 10); consumed = m2[0]; }
  }
  // ④ 裸周号：孤立数字（「…02) 1 (18号…" = 仅第 1 周；「7号…」的 7 后随号字不认领）
  if (!consumed) {
    var m3 = s.match(/(?:^|[\s)）])(\d{1,2})(?=$|[\s(（])/);
    if (m3) { out.startWeek = out.endWeek = parseInt(m3[1], 10); consumed = m3[0]; }
  }
  if (consumed) out.rest = s.replace(consumed, ' ');
  if (out.customWeeks === null) {
    if (isOdd) out.kind = 'odd';
    else if (isEven) out.kind = 'even';
  }
  return out;
}

/**
 * 单个格子的文本 → 候选排课段（纯函数）：
 *  「课程名(代码) 周次 地点」；首个括号组仅当「前面无数字」时视为课程代码
 *  （否则是「7号B308(新校区)」这类地点括号，走无代码分支）；
 *  地点 = 尾括号组（“(新校区)”）与其前核心文本拼接还原「7号B308(新校区)」；
 *  周次缺失 → 默认全学期每周；周次越界立即钳到 [1,totalWeeks]（钳空由上层拒收）。
 */

function parseScheduleCell(raw, totalWeeks) {
  var s = normalizePasteText(raw).trim();
  if (!s) return null;
  var coreOverride = '';
  var name = '', code = null, rest = s;
  var pi = s.search(/[(（]/);
  if (pi > 0) {
    var cm = s.slice(pi).match(/^[(（]([^()（）]*)[)　)]/);
    // 代码判定：内容 ≤20 字且无空白，且（括号后还有文本 = 周次/地点跟随），
    // 或括号内容含字母数字（孤立的「课程名(代码)」格）。
    // 「7号B308(新校区)」这类纯中文地点括号（后无文本）不视为代码；
    // 含数字课程名（如「口腔3D扫描」）因「括号后有文本」判据可正确识别代码。
    if (cm && cm[1].length <= 20 && !/\s/.test(cm[1]) &&
        (s.slice(pi + cm[0].length).trim() !== '' || /[0-9A-Za-z]/.test(cm[1]))) {
      name = s.slice(0, pi).trim();
      code = cm[1].trim() || null;
      rest = s.slice(pi + cm[0].length);
    }
  }
  var wk = parseWeeksSpec(rest);
  var tail = wk.rest;
  // 尾括号组作地点修饰（“(新校区)”），剥出后剩余为核心地点文本
  var parenLoc = '';
  var tm = tail.match(/[(（]([^()（）]*)[)）]\s*$/);
  if (tm && tm.index > 0) {
    // 尾括号组作地点修饰（“(新校区)”），剥出后剩余为核心地点文本
    parenLoc = tm[1].trim();
    tail = (tail.slice(0, tm.index) + ' ').trim();
  } else {
    var tg = tail.match(/[(（](.*)[)）]\s*$/);
    var headBlank = tg && tg.index > 0 &&
      !tail.slice(0, tg.index).replace(/[\s,，;；·-]/g, '');
    if (headBlank) {
      // 括号组前只有空白：整串是外层括号地点（如 “(18号A403(新校区))”），整体作地点
      coreOverride = tg[1].trim();
    } else {
      // 括号配平：只剥「闭括号比开括号多」的尾部右括号（半全角各认各的配对，不吃合法括号）
      var opens = (tail.match(/[(（]/g) || []).length;
      var closes = (tail.match(/[)）]/g) || []).length;
      var extra = closes - opens;
      if (extra > 0) {
        var chars = tail.split('');
        for (var ci = chars.length - 1; ci >= 0 && extra > 0; ci--) {
          if (chars[ci] === ')' || chars[ci] === '）') { chars[ci] = ''; extra--; }
        }
        tail = chars.join('').replace(/\s+$/, '');
      }
    }
  }
  if (!name) {
    // 无代码分支：剩余文本首个空格切分 → 左课程名、右地点核心
    var fsi = tail.search(/\s/);
    if (fsi > 0) {
      name = tail.slice(0, fsi).trim();
      tail = tail.slice(fsi);
    } else {
      name = tail.trim();
      tail = '';
    }
    if (!name) return null;
  }
  var core = coreOverride || tail.replace(/^[\s,，;；·)）(（\-]+/, '').trim();
  var location = core ? (parenLoc ? core + '(' + parenLoc + ')' : core) : parenLoc;

  var kind = wk.kind, startWeek, endWeek, weeks;
  if (wk.customWeeks) {
    kind = 'custom';
    weeks = wk.customWeeks.slice();
  } else if (wk.startWeek !== null && wk.startWeek === wk.endWeek) {
    kind = 'custom';            // 仅第 X 周（第X周 / 裸周号写法）：单周 custom，与 Q1 一致
    weeks = [wk.startWeek];
  } else if (wk.startWeek !== null) {
    startWeek = wk.startWeek; endWeek = wk.endWeek;
    weeks = buildPatternWeeks(kind, startWeek, endWeek);
  } else {
    startWeek = 1; endWeek = totalWeeks;
    weeks = buildPatternWeeks('every', 1, totalWeeks);
  }
  weeks = weeks.filter(function (w) { return w >= 1 && w <= totalWeeks; });
  if (weeks.length) { startWeek = weeks[0]; endWeek = weeks[weeks.length - 1]; }
  return { courseName: name, code: code, kind: kind,
    startWeek: startWeek, endWeek: endWeek, weeks: weeks, location: location };
}

/**
 * 整段课表文本 → 候选排课段数组（纯函数）：
 *  定位星期表头（≥2 个星期列）→ 逐行取节次（「第一节」/「1」/空首列=合并续行）→
 *  竖向合并继承（空节次接续同列上一课程段）→ 相邻同课同地点同周并段；
 *  无表头/无节次行 → 返回 { error } 由上层拒收展示（不臆造）。
 */

function parseScheduleText(text, totalWeeks) {
  var lines = normalizePasteText(text).replace(/\r\n?/g, '\n').split('\n');
  // 四期④a：粘贴行数上限——超限直接人话拒收（防超长粘贴卡死 UI；上限内行为零变化）
  if (lines.length > 500) {
    return { error: '粘贴内容超过 500 行，疑似复制了整份文档。请只复制课表区域' +
      '（星期表头 + 节次列）后重试，或改用「CSV 文件导入」。', rows: [] };
  }
  var headerIdx = -1, colByWeekday = null;
  for (var i = 0; i < lines.length; i++) {
    var cells = splitPasteLine(lines[i]);
    var colMap = {}, hits = 0;
    cells.forEach(function (c, idx) {
      var w = weekdayOfHeaderCell(c);
      if (w && colMap[w] === undefined) { colMap[w] = idx; hits++; }
    });
    if (hits >= 2) { headerIdx = i; colByWeekday = colMap; break; }
  }
  if (headerIdx < 0) {
    return { error: '未检测到星期表头（需包含「星期一 … 星期日」等列）。' +
      '请从 Excel/PDF 全选课表区域（含表头与节次列）复制后粘贴。', rows: [] };
  }
  var rawGrid = {};   // period -> { weekday: 原文 }
  var maxPeriod = 0, prevPeriod = 0;
  var dupCells = [];   // W0 #27：同格重复清单（period × weekday 已有内容再被写入）
  for (var r = headerIdx + 1; r < lines.length; r++) {
    var line = lines[r];
    if (!line.trim()) continue;
    var cs = splitPasteLine(line);
    var first = normalizePasteText(cs[0] || '').trim();
    var period = null;
    var pmAr = first.match(/^第?\s*(\d{1,2})\s*节?$/);
    if (pmAr) period = parseInt(pmAr[1], 10);
    else if (!first) period = prevPeriod + 1;          // 竖向合并单元格续行
    else {
      var pmCn = first.match(/^第?([一二三四五六七八九十]{1,3})\s*节?$/);
      if (pmCn) period = cnPeriodNum(pmCn[1]);
    }
    if (period === null) continue;                     // 页脚/说明行跳过
    if (!(period >= 1 && period <= 30)) continue;
    prevPeriod = period;
    if (period > maxPeriod) maxPeriod = period;
    rawGrid[period] = rawGrid[period] || {};
    Object.keys(colByWeekday).forEach(function (w) {
      var idx = colByWeekday[w];
      var v = idx < cs.length ? String(cs[idx] || '') : '';
      if (v.trim()) {
        // W0 #27：同格重复不得静默覆盖（后写吞先写丢课）——记录并整段人话拒收
        if (rawGrid[period][w] !== undefined) {
          dupCells.push('第 ' + period + ' 节 ' + (WEEKDAY_NAMES[w - 1] || w));
        }
        rawGrid[period][w] = v;
      }
    });
  }
  if (!maxPeriod) return { error: '表头以下没有可识别的节次行。', rows: [] };
  // W0 #27：同格重复整段拒收（未导入任何数据；疑似课表重复行或复制区域含拆分单元格）
  if (dupCells.length) {
    return { error: '同一节次同一星期出现多段课程内容（' + dupCells.slice(0, 3).join('、') +
      (dupCells.length > 3 ? ' 等' : '') + '）——疑似课表重复行或复制区域含拆分单元格，' +
      '请核对课表后重新复制粘贴（本次未导入任何数据）。', rows: [] };
  }

  var rows = [];
  [1, 2, 3, 4, 5, 6, 7].forEach(function (w) {
    var cur = null;
    for (var p = 1; p <= maxPeriod; p++) {
      var cellRaw = rawGrid[p] ? (rawGrid[p][w] || '') : '';
      if (!cellRaw.trim()) {
        // 竖向合并：空节次接续同列上一课程段（仅限紧邻上一节，且至多并 2 节——
        // 小节制课表一次授课 = 2 小节；更长的连排见显式同课文本并段分支，防止空行拖尾误并）
        if (cur && cur.periodEnd === p - 1 &&
            (cur.periodEnd - cur.periodStart + 1) < 2) {
          cur.periodEnd = p; cur.continued = true;
        }
        continue;
      }
      var cell = parseScheduleCell(cellRaw, totalWeeks);
      if (!cell) { cur = null; continue; }
      if (cur && cur.periodEnd === p - 1 && cur.courseName === cell.courseName &&
          cur.location === cell.location &&
          JSON.stringify(cur.weeks) === JSON.stringify(cell.weeks)) {
        cur.periodEnd = p; cur.continued = true; continue;   // 相邻同课并段（PDF 重复文本同理）
      }
      cur = { courseName: cell.courseName, code: cell.code, weekday: w,
        periodStart: p, periodEnd: p, kind: cell.kind,
        startWeek: cell.startWeek, endWeek: cell.endWeek, weeks: cell.weeks,
        location: cell.location, continued: false };
      rows.push(cur);
    }
  });
  return { rows: rows };
}

/** 去重键：courseId|weekday|periodStart-periodEnd|weeks[]（与 entries 的语义同构） */

/**
 * 去重键：courseId|weekday|periodStart-periodEnd|weeks[]（与 entries 的语义同构）。
 * W2-B #45（2026-09-20 问题列表裁决）：周列表键内升序排序——脏数据未排序周列表与已排序
 * 同集此前视为不同键，重复排课项漏判；排序后两侧同口径，干净数据行为逐字节不变。
 * 预览 / 确认 / 数据健康检查全链共用本函数，一处修复处处生效。
 */
function pasteEntryKey(courseKey, weekday, ps, pe, weeks) {
  const ws = (Array.isArray(weeks) ? weeks.slice() : []).sort(function (a, b) { return a - b; });
  return courseKey + '|' + weekday + '|' + ps + '-' + pe + '|' + ws.join(',');
}

/**
 * 解析结果 → 预览模型（纯函数，零写入——R2 的数据层保障）：
 *  归属匹配 / 同键去重（载荷内部 + 对现有 entries）/ 类似检测 / 越界拒收。
 */

function buildPastePreview(rows, cal) {
  var items = [], rejected = [];
  var existing = state.entries.filter(function (en) { return en.calendarId === cal.id; });
  var seen = {};
  rows.forEach(function (r) {
    if (!r.weeks.length) {
      rejected.push({ name: r.courseName, reason: '周次全部越出校历范围（1–' + cal.totalWeeks + ' 周）' });
      return;
    }
    const pMax = periodCountOf(cal);   // 插单 1.11：越界判据按该校历节数，不写死 12
    if (!(r.periodStart >= 1 && r.periodEnd <= pMax && r.periodStart <= r.periodEnd)) {
      rejected.push({ name: r.courseName, reason: '节次超出 1–' + pMax + ' 范围' });
      return;
    }
    // 只匹配开设中的课程：归档课程不出现在新建排课候选（附录A §5），同名归档课不抢归属。
    // W2-B #44（2026-09-20）：课程名归一匹配——全半角/首尾空格差异不再误判「待新建」
    //（normalizePasteText 与 1.9 解析层同一归一口径，干净数据行为逐字节不变）
    var rowNameN = normalizePasteText(r.courseName).trim();
    var course = state.courses.find(function (c) {
      return c.status === 'active' && normalizePasteText(c.name).trim() === rowNameN; }) || null;
    var courseKey = course ? course.id : 'new:' + rowNameN;
    var key = pasteEntryKey(courseKey, r.weekday, r.periodStart, r.periodEnd, r.weeks);
    var status = course ? 'new' : 'new-course', checked = true;
    if (seen[key] || existing.some(function (en) {
      return pasteEntryKey(en.courseId, en.weekday, en.periodStart, en.periodEnd,
        en.weekPattern && Array.isArray(en.weekPattern.weeks) ? en.weekPattern.weeks : []) === key;
    })) {
      status = 'duplicate'; checked = false;
    } else if (course && existing.some(function (en) {
      return en.courseId === course.id && en.weekday === r.weekday &&
        en.periodStart === r.periodStart && en.periodEnd === r.periodEnd;
    })) {
      status = 'similar';   // 同课程同星期同节次、周次或地点不同：按独立排课项并存（黄色提醒）
    }
    seen[key] = true;
    items.push({ row: r, courseId: course ? course.id : null,
      status: status, checked: checked, hours: 2 });
  });
  return { items: items, rejected: rejected };
}

/** 粘贴区 HTML：未解析 → 文本域；已解析 → 预览表（全程零写入，R2） */

/**
 * 节次快照结构化归一（W2-D #303）：脏导入可能把 periodStart/periodEnd 写成数字串——
 * 旧严格相等在 '03' 与 3 混型时会把单节误拼成「03-3」；此处统一转数值后收口为
 * 「N」或「N-M」。非整数/倒置等不可评估脏值不臆造，回落空串（periodRangeOf 将拒绝）。
 */
function normalizeSnapshotPeriods(en) {
  const ps = Number(en ? en.periodStart : NaN);
  const pe = Number(en ? en.periodEnd : NaN);
  if (!(Number.isInteger(ps) && Number.isInteger(pe) && ps >= 1 && pe >= ps)) return '';
  return ps === pe ? String(ps) : ps + '-' + pe;
}

function instanceSnapshot(en) {
  const course = state.courses.find(function (c) { return c.id === en.courseId; });
  // W2-D #26：学时快照防 undefined——脏排课项缺 hoursPerSession 时显式回落 0，
  // 不让 undefined 进流水快照（统计 Number(undefined)=NaN、JSON 序列化均失控）。
  const nominal = Number(en.hoursPerSession);
  return {
    periods: normalizeSnapshotPeriods(en),
    location: en.location || (course ? course.defaultLocation : ''),
    nominalHours: (isFinite(nominal) && nominal >= 0) ? nominal : 0,
    typeId: entryTypeId(en)        // 课时性质快照（1.7 增补）：理论/实训拆分按实例算，不现场回算
  };
}

/**
 * 只读目标集合计划层（插单 1.17，C4 最小改动）：把 expandEntries 的「算」与「写」分离——
 * 合法校历校验 / desired 目标集合 / 现网生成实例索引 / touched 收敛判据四处只读逻辑
 * 抽为本函数，expandEntries（写）与 previewExpandImpact（干跑预览）共用同一份计划，
 * 保证预览计数与真实执行严格一致（预览即干跑，零写入，R2 精神延伸到引擎操作）。
 */

/**
 * 展开引擎幂等键·结构化（W2-E #24，2026-09-20《问题列表裁决_v1.0》）：entryId + '|' +
 * 原始date 的字符串拼接在脏导入数据下存在拼接歧义——id 或快照日期（movedFromDate/date）
 * 含 '|' 时，两对不同的 (id,date) 可能拼出同一字符串键，desired/existing/touched 三处
 * 索引同源互吞（预览与执行共用计划层，病灶一处修复处处生效）。改 JSON 数组结构化键：
 * 两对分量任一不同则键必不同，拼接歧义归零。键只作引擎内存索引，不落库、不入流水快照，
 * 干净数据（系统发号 id + YYYY-MM-DD 日期）行为逐字节不变。
 */
function expandInstanceKey(id, date) {
  return JSON.stringify([String(id), String(date)]);
}

/**
 * 周一起始判据·统一 UTC 解析（W2-E #302）：此前 validCalIds / 数据健康检查用
 * new Date(startDate + 'T00:00:00').getDay()（本地时区解释）。按附录A §11 本地日期串
 * 语义，对「YYYY-MM-DD 日历日的星期」而言，本地与 UTC 分量解析恒同判（组件显式解析
 * 进 Date.UTC，不存在跨午夜的日界漂移），统一为 UTC 分量解析 + 日历日反查后与 dateDayNum /
 * weekNoOfDate 的 UTC 锚定口径（插单 1.16）拉齐。脏格式与溢出日历日（如 2026-02-30，
 * Date.UTC 会顺移）恒 false，与改前防线逐字节一致。
 */
function isMondayAnchor(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 日历日反查：2026-02-30 类溢出日期 Date.UTC 会顺移到 3 月，须与 isValidDateStr
  // 同口径拒绝（修复前该形态按 false 处理，行为逐字节一致）
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return dt.getUTCDay() === 1;
}

function buildExpandPlan() {
  // 合法校历表：起始日再校验（附录A §6「引擎再校验」精神）——导入/手改存储可能绕过表单校验，
  // startDate 损坏时 dateOfWeek 会产出 "NaN-NaN-NaN" 脏日期；此类校历整体视为「无法评估」，
  // 既不展开也不收敛（保留现状，绝不臆删其下流水）
  const validCalIds = {};
  state.calendars.forEach(function (c) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) return;
    // 插单 1.26 修复 P1-6：非周一锚点会让全学期周次整体偏移一格（dateOfWeek 假定周一），
    // 视为「无法评估」——既不展开也不收敛；周格渲染侧同判据降级提示
    if (!isMondayAnchor(c.startDate)) return;
    // 插单 1.14 子项 3（B.6 #3）：totalWeeks 必须为 ≥1 整数——脏导入/手改存储可能
    // 绕过表单校验产生 'abc'/NaN，dateOfWeek 会产出脏日期；此类校历「无法评估」，
    // 既不展开也不收敛其下流水（1.5 F1 精神延续：绝不臆删）
    if (!(Number.isInteger(c.totalWeeks) && c.totalWeeks >= 1)) return;
    validCalIds[c.id] = true;
  });

  // 目标集合：幂等键 entryId|date → { entry, calendarId, date, weekNo }
  const desired = {};
  const desiredKeys = [];
  state.entries.forEach(function (en) {
    if (!validCalIds[en.calendarId]) return;   // 校历缺失/起始日损坏：跳过该排课项（不臆造）
    const cal = state.calendars.find(function (c) { return c.id === en.calendarId; });
    const calBreaks = Array.isArray(cal.breaks) ? cal.breaks : [];   // 1.14 子项 3：breaks 非数组视为无停课周
    const weeks = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
      ? en.weekPattern.weeks : [];
    weeks.forEach(function (w) {
      if (!(Number.isInteger(w) && w >= 1 && w <= cal.totalWeeks)) return;  // 引擎再校验（附录A §6）
      if (calBreaks.indexOf(w) >= 0) return;   // 校历级停课周不生成实例（Q2）
      const date = dateOfWeek(cal, w, en.weekday);
      const key = expandInstanceKey(en.id, date);
      if (desired[key]) return;               // 同一键只记一次（防重复周号）
      desired[key] = { entry: en, calendarId: cal.id, date: date, weekNo: w };
      desiredKeys.push(key);
    });
  });

  // 现网生成实例索引（manual 不进索引、不被处理，Q3 规则 1）
  const existing = {};
  state.instances.forEach(function (inst) {
    if (inst.source !== 'generated') return;
    const origDate = inst.movedFromDate || inst.date;   // 幂等键用原始date（调课改期后仍占原键，1.7）
    existing[expandInstanceKey(inst.entryId, origDate)] = inst;
  });

  const touched = {};   // 目标集合出现过的键（收敛清理的判据）
  desiredKeys.forEach(function (key) { touched[key] = true; });

  return { validCalIds: validCalIds, desired: desired, desiredKeys: desiredKeys,
    existing: existing, touched: touched };
}

/** 快照 typeId 比对归一（插单 1.26 修复 P1-5）：null/undefined 视为同值，防脏数据幻影更新计数 */

function sameSnapTypeId(a, b) {
  return (a === null || a === undefined ? null : a) ===
    (b === null || b === undefined ? null : b);
}

/**
 * 重新展开影响预览（插单 1.17 干跑，纯函数零写入——R2 预览确认铁律延伸到引擎操作）：
 * 与 expandEntries 共用 buildExpandPlan 计划层，输出五类影响计数——
 *  add        目标集合中尚无实例 → 将新增的流水数
 *  update     已有非冻结生成实例且快照与排课项当前定义不同 → 将同步更新的条数
 *  remove     非冻结生成实例已不在目标集合（周次收缩/新增停课周/校历悬挂）→ 将移除的孤儿数
 *  frozenSkip 目标集合命中冻结实例 → 跳过同步（人工改动永不被引擎改回，Q3 规则 2）
 *  manualKeep manual 实例总数 → 引擎永不触碰（Q3 规则 1）
 *  orphanKeep 校历无法评估（起始日/totalWeeks 损坏）而保留现状的生成实例数（1.5 F1：绝不臆删）
 * 及校历结构变更越界清单 outOfBounds（B.6 #14）——weeks[] 越出 [1,totalWeeks] 的周号、
 * periodEnd 越出该校历节数（periodCountOf）的排课项；只提示不拒收（引擎丢弃越界部分，
 * 排课项本身保留，请用户编辑修正，与 1.5 F1「不臆删」同精神）。
 */

function previewExpandImpact() {
  const plan = buildExpandPlan();

  let add = 0, update = 0, frozenSkip = 0;
  plan.desiredKeys.forEach(function (key) {
    const d = plan.desired[key];
    const inst = plan.existing[key];
    if (!inst) { add++; return; }
    if (inst.frozen) { frozenSkip++; return; }
    const snap = instanceSnapshot(d.entry);   // 快照对比：只把「真的会改」的计为更新
    if (inst.weekNo !== d.weekNo || inst.periods !== snap.periods ||
        inst.location !== snap.location || inst.nominalHours !== snap.nominalHours ||
        !sameSnapTypeId(inst.typeId, snap.typeId)) update++;
  });

  let remove = 0, manualKeep = 0, orphanKeep = 0;
  const removeDetails = [];   // 四期⑦（B.9-2.2）：移除明细——课程名 + 原日期，确认前「删了知道删了什么」
  state.instances.forEach(function (inst) {
    if (inst.source === 'manual') { manualKeep++; return; }   // Q3 规则 1：manual 永不触碰
    if (inst.frozen) return;                                  // 冻结孤儿同样保留（含在 frozenSkip 语义内）
    if (!plan.validCalIds[inst.calendarId]) { orphanKeep++; return; }   // 1.5 F1：无法评估保留现状
    const origDate = inst.movedFromDate || inst.date;
    if (plan.touched[expandInstanceKey(inst.entryId, origDate)] !== true) {
      remove++;
      const rmCourse = state.courses.find(function (c) { return c.id === inst.courseId; });
      removeDetails.push({ courseName: rmCourse ? rmCourse.name : '未知课程',
        date: origDate });
    }
  });
  // 明细排序：课程名升序（同课程按原日期升序），渲染取前 20 条 + 「等 N 条」收口
  removeDetails.sort(function (a, b) {
    return String(a.courseName).localeCompare(String(b.courseName), 'zh') ||
      String(a.date).localeCompare(String(b.date));
  });

  const outOfBounds = [];
  state.entries.forEach(function (en) {
    const cal = state.calendars.find(function (c) { return c.id === en.calendarId; });
    if (!cal) return;   // 校历缺失另有引擎跳过语义，不在越界清单范围
    const weeks = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
      ? en.weekPattern.weeks : [];
    const badWeeks = weeks.filter(function (w) {
      return !(Number.isInteger(w) && w >= 1 && w <= cal.totalWeeks);
    });
    const periodMax = periodCountOf(cal);
    const periodOverflow = !(Number.isInteger(en.periodEnd) && en.periodEnd <= periodMax);
    if (!badWeeks.length && !periodOverflow) return;
    const course = state.courses.find(function (c) { return c.id === en.courseId; });
    outOfBounds.push({
      entryId: en.id,
      courseName: course ? course.name : '未知课程',
      weekdayText: WEEKDAY_NAMES[en.weekday - 1] || ('周' + en.weekday),
      periodsText: en.periodStart + '-' + en.periodEnd,
      badWeeks: badWeeks,
      periodOverflow: periodOverflow,
      periodMax: periodMax
    });
  });

  return { add: add, update: update, remove: remove, frozenSkip: frozenSkip,
    manualKeep: manualKeep, orphanKeep: orphanKeep, outOfBounds: outOfBounds,
    removeDetails: removeDetails };   // 四期⑦：移除明细随预览模型返回（仅 remove——C2 最小，add/update/frozenSkip 不做）
}

/**
 * 展开引擎：把全部 entries 按各自校历展开/同步/收敛为 source="generated" 流水。
 * 纯数据层、不读 DOM（设计哲学 2：复杂性藏在数据层）；无副作用于 manual 与 frozen 记录。
 * 插单 1.17：写路径与预览共用 buildExpandPlan 计划层，行为与 1.5 完全一致（C4 纯抽取）。
 */

function expandEntries() {
  // W0 #8（2026-09-19）：原子化——进入前的流水表浅拷贝留底；任一步抛错即整体回滚
  // （desired 循环 push 进共享数组的半残数据随旧引用一起丢弃），绝不让半残内存状态
  // 被后续 saveState 持久化
  const instancesBefore = state.instances.slice();
  try {
  const ts = nowIso();
  const plan = buildExpandPlan();

  plan.desiredKeys.forEach(function (key) {
    const d = plan.desired[key];
    const inst = plan.existing[key];
    if (inst) {
      if (inst.frozen) return;              // 冻结保护（Q3 规则 2）：人工改动永不被引擎改回
      const snap = instanceSnapshot(d.entry);
      inst.weekNo = d.weekNo;
      inst.periods = snap.periods;
      inst.location = snap.location;
      inst.nominalHours = snap.nominalHours;
      inst.typeId = snap.typeId;
      inst.updatedAt = ts;
    } else {
      const snap = instanceSnapshot(d.entry);
      state.instances.push({
        id: nextId('i'),
        entryId: d.entry.id,
        courseId: d.entry.courseId,
        calendarId: d.calendarId,
        date: d.date,
        weekNo: d.weekNo,
        periods: snap.periods,
        location: snap.location,
        headcount: (Number.isFinite(d.entry.defaultHeadcount) && d.entry.defaultHeadcount >= 0)
          ? d.entry.defaultHeadcount : null,   // 四期⑧ 项 4：排课项默认人数仅新建流水瞬间预填快照（D3）；引擎同步永不回填
        nominalHours: snap.nominalHours,
        typeId: snap.typeId,        // 课时性质快照（1.7 增补）
        settledHours: null,         // D10/R6：规则未定，结算学时一律留空，绝不出现无来源数字
        settleMode: null,
        status: 'normal',
        source: 'generated',
        frozen: false,
        movedFromDate: null,
        overrideNote: null,
        linkNote: '',
        ruleVersion: null,          // 二期结算规则启用
        createdAt: ts,
        updatedAt: ts
      });
    }
  });

  // 收敛清理：非冻结生成实例且已不在目标集合（周次改小 / 新增停课周 / 校历悬挂）→ 移除；
  // frozen 与 manual 一律保留（人工留痕优先于数据纯净）
  state.instances = state.instances.filter(function (inst) {
    if (inst.source !== 'generated') return true;
    if (inst.frozen) return true;
    if (!plan.validCalIds[inst.calendarId]) return true;   // 校历无法评估：保留现状，绝不臆删
    const origDate = inst.movedFromDate || inst.date;
    return plan.touched[expandInstanceKey(inst.entryId, origDate)] === true;
  });
  } catch (err) {
    // 插单 1.26 修复 P1-8：展开失败不崩应用；W0 #8 补强：回滚到进入前原状再提示
    state.instances = instancesBefore;
    showBanner('展开失败：流水已回滚，未做任何改动——请到「排课」面板点「重新展开」。', 'error');
  }
}

/**
 * 插单 1.18 新学期初始化·计划层（纯函数零写入，R2）：源校历课程整组拷贝到目标校历——
 * 排课项随课程联动（不逐条勾选），周次模式/classes/defaultHeadcount/typeId 全字段携带口径
 * 由写点执行；weeks[] 越出目标校历 totalWeeks 的部分截掉（dropped 计数供标黄提示），
 * 截后为空该排课项进 skipped（不复制）。源=目标或校历悬空 → { error } 人话拒收。
 */
function semesterCopyPlan(srcCalId, dstCalId, courseIds) {
  const src = state.calendars.find(function (c) { return c.id === srcCalId; });
  const dst = state.calendars.find(function (c) { return c.id === dstCalId; });
  if (!src || !dst || src.id === dst.id) return { error: '源校历与目标校历无效或相同。' };
  const maxWeek = (Number.isInteger(dst.totalWeeks) && dst.totalWeeks >= 1)
    ? dst.totalWeeks : 16;
  const items = [];
  const skipped = [];
  (Array.isArray(courseIds) ? courseIds : []).forEach(function (cid) {
    const course = state.courses.find(function (c) { return c.id === cid; });
    if (!course) return;
    const entries = state.entries
      .filter(function (en) { return en.courseId === cid && en.calendarId === srcCalId; })
      .map(function (en) {
        const allWeeks = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
          ? en.weekPattern.weeks : [];
        const keptWeeks = allWeeks.filter(function (w) {
          return Number.isInteger(w) && w >= 1 && w <= maxWeek;
        });
        return { entry: en, keptWeeks: keptWeeks,
          droppedWeeks: allWeeks.length - keptWeeks.length };
      })
      .filter(function (x) {
        if (x.keptWeeks.length) return true;
        skipped.push({ courseName: course.name, entry: x.entry });
        return false;
      });
    items.push({ course: course, entries: entries, checked: true });
  });
  return { items: items, skipped: skipped, dstCalId: dst.id, srcCalId: src.id };
}

/* ============================================================
   四之六、周格课表视图（一期 1.6）
   依据：D8 主界面 = 周格课表视图；Q2 停课角标为纯投影；B.4 接口提示——
        周格渲染只认流水（instances 表，calendarId + 日期区间过滤），
        勿现场回算、勿全表重算。
   能力：7 天 × N 节网格（N = periodTimes.length，插单 1.11 起 8/10/12 可调）；课程色块（courses.color 实边 + 淡底）；
        翻周（2026-09-17 用户裁定方案 C：左右 = chevron 线性图标按钮，
        「回到本周」= 文字按钮）、周次标题（第 X 周 + 日期范围）；
        今日高亮（按校历 startDate 周一锚点换算，复用 dateOfWeek）；
        插单 1.12 周末列按需显示：默认 5 列，周末日有流水色块或停课角标投影时扩列
        （列数经 --wg-cols 注入 style.css；隐藏周末不占列号，坐标按可见列重排）；
        校历级停课角标：breaks × 当前周排课项投影渲染——
        不占数据、不入流水（Q2），与展开引擎零耦合。
   边界：翻周钳制 [1,totalWeeks]；起始日损坏（脏存储）时不臆造 NaN
        网格，降级提示修复（与 1.5 F1 双防线同精神）。
   ============================================================ */

/** 翻周位移：0 = 本周（按校历周一锚点由 weekNoOfToday 推算；跨校历切换时沿用） */

/**
 * 导入记录最小结构校验（W2-C #97，#89 并入；2026-09-20 问题列表裁决「部分采纳」边界——
 * 完整 schema 校验层归架构批）：记录须为非 null 对象且非数组，原始值/数组不再整条入
 * state。带 id 表的 string id、reconciles 的 string month 等键校验由调用点组合给出；
 * 预览（buildImportPreview）与合并执行（applyImportMerge）共用本口径，
 * 保证 #42 跳过计数与真实落库严格一致（预览即干跑）。
 */
function isMergeableRec(r) {
  return !!r && typeof r === 'object' && !Array.isArray(r);
}

function canonicalKey(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalKey).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(function (k) {
    return JSON.stringify(k) + ':' + canonicalKey(obj[k]);
  }).join(',') + '}';
}

/** 字段差异摘要（子项⑤）：双方自有字段并集内序列化值不同者，供冲突详情逐条核对 */

function diffFieldNames(a, b) {
  const keys = {};
  Object.keys(a || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(b || {}).forEach(function (k) { keys[k] = true; });
  return Object.keys(keys).filter(function (k) {
    return JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]);
  });
}

/**
 * 悬空引用统计（子项①，纯函数）：扫描导入载荷中引用字段指向本地不存在的对象——
 * instances.entryId/courseId/calendarId、entries.courseId/calendarId、achievements.categoryId。
 * 只计数提示，不拒收、不阻断（由用户在确认时自行权衡，R2 精神）。
 */

function countDanglingRefs(payload) {
  const idSet = function (table) {
    const s = Object.create(null);   // W2-C #41：无原型对象，防 __proto__ 键污染
    (Array.isArray(state[table]) ? state[table] : []).forEach(function (r) {
      if (r && r.id !== undefined) s[r.id] = true;
    });
    return s;
  };
  const courseIds = idSet('courses'), calIds = idSet('calendars'),
    entryIds = idSet('entries'), catIds = idSet('achievementCategories');
  const out = [];
  const scan = function (table, fields) {
    if (!Array.isArray(payload[table])) return;
    let n = 0;
    payload[table].forEach(function (r) {
      if (!r) return;
      let bad = false;
      fields.forEach(function (f) {
        const v = r[f.f];
        if (v === null || v === undefined || v === '') return;
        if (!f.set[v]) bad = true;
      });
      if (bad) n++;
    });
    if (n) out.push({ table: table, count: n });
  };
  scan('instances', [
    { f: 'entryId', set: entryIds },
    { f: 'courseId', set: courseIds },
    { f: 'calendarId', set: calIds }
  ]);
  scan('entries', [
    { f: 'courseId', set: courseIds },
    { f: 'calendarId', set: calIds }
  ]);
  // achievements.categoryId：除本地分类外，载荷自带分类 id 与「同名合并映射后的赢家 id」
  // 均视为有效（三期 3.0c B.7 #41——同名分类不会被误报悬空）
  const incomingCatIds = Object.create(null);   // W2-C #41
  (Array.isArray(payload.achievementCategories) ? payload.achievementCategories : [])
    .forEach(function (c) { if (c && c.id !== undefined) incomingCatIds[c.id] = true; });
  const catRemapP = achvSameNameRemap(payload);
  const catHit = function (v) {
    if (catIds[v] || incomingCatIds[v]) return true;
    const w = catRemapP[v];
    return !!(w && (catIds[w] || incomingCatIds[w]));
  };
  if (Array.isArray(payload.achievements)) {
    let nAchv = 0;
    payload.achievements.forEach(function (r) {
      if (!r) return;
      const v = r.categoryId;
      if (v === null || v === undefined || v === '') return;
      if (!catHit(v)) nAchv++;
    });
    if (nAchv) out.push({ table: 'achievements', count: nAchv });
  }
  return out;
}

/** 导入流程的 UI 态：已解析待确认的载荷与错误信息（纯 UI 态，不入数据） */

function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: '文件内容不是有效的 JSON 数据对象。' };
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: '数据版本不符：文件为 v' + String(payload.schemaVersion) +
      '，本系统为 v' + SCHEMA_VERSION + '，已拒收（请使用同版本导出的备份文件）。' };
  }
  const anyTable = IMPORT_TABLES.some(function (t) { return Array.isArray(payload[t]); });
  if (!anyTable) {
    return { ok: false, error: '未识别到任何数据表（calendars / courses / instances 等），已拒收。' };
  }
  const bad = IMPORT_TABLES.filter(function (t) {
    return payload[t] !== undefined && !Array.isArray(payload[t]);
  });
  if (bad.length) {
    return { ok: false, error: '数据表 ' + bad.join('、') + ' 结构非法（应为数组），已拒收。' };
  }
  return { ok: true };
}

/**
 * 合并预览（纯函数，绝不写 state——R2 预览确认铁律的数据层保障）：
 * 按顶层表统计 本地记录 / 导入记录 / 新增 / 同 id 冲突（含将以导入为准的条数）。
 * 插单 1.15 扩充：
 *  - 带 id 表附 conflicts 详情（id / 双方 updatedAt / 差异字段清单 / 裁决方向），供预览展开区逐条核对（子项⑤）；
 *  - 无 id 表整条去重改用键名排序的 canonicalKey——键序不同不再视为两条（子项②）；
 *  - reconciles 改按 month 唯一键计新增/冲突（子项④：与合并执行、2.3「一月一条」同语义）；
 *  - 返回值附 dangling 悬空引用汇总——只提示、不拒收、不阻断（子项①）。
 */

function buildImportPreview(payload) {
  const tables = [];
  IMPORT_TABLES.forEach(function (name) {
    if (!Array.isArray(payload[name])) return;
    const incoming = payload[name];
    const local = Array.isArray(state[name]) ? state[name] : [];
    if (IMPORT_ID_TABLES.indexOf(name) >= 0) {
      const localIds = Object.create(null);   // W2-C #41
      local.forEach(function (r) { if (r && r.id !== undefined) localIds[r.id] = r; });
      let add = 0, conflict = 0, incomingWins = 0, skipped = 0;   // W2-C #42：跳过计数
      const conflicts = [];
      incoming.forEach(function (r) {
        // W2-C #97/#42：结构非法或无 id 记录跳过并入预览计数（预览与执行同一口径）
        if (!isMergeableRec(r) || typeof r.id !== 'string') { skipped++; return; }
        const loc = localIds[r.id];
        if (!loc) { add++; return; }
        conflict++;
        // W2-C #40：updatedAt 统一数值时间比较（格式不一致不再错序，缺失视为最旧）
        const win = updatedAtNum(r.updatedAt) > updatedAtNum(loc.updatedAt);
        if (win) incomingWins++;
        conflicts.push({ id: r.id,
          localUpdatedAt: loc.updatedAt || null,
          incomingUpdatedAt: r.updatedAt || null,
          incomingWins: win,
          diffs: diffFieldNames(loc, r) });
      });
      tables.push({ name: name, localCount: local.length, importCount: incoming.length,
        addCount: add, conflictCount: conflict, incomingWins: incomingWins, byId: true,
        skippedCount: skipped,   // W2-C #42：跳过记录数入预览模型
        conflicts: conflicts });
    } else if (name === 'reconciles') {
      // 子项④：按 month 唯一键——预览口径与合并执行、2.3 写点同一语义（一月一条）
      const localMonths = Object.create(null);   // W2-C #41
      local.forEach(function (r) { if (r && r.month !== undefined) localMonths[r.month] = r; });
      let add = 0, conflict = 0, incomingWins = 0, skipped = 0;   // W2-C #42
      // W4-E 拍板⑤（#142 部分采纳）：月键冲突详情入列——与带 id 表同待遇，
      // 取舍 UI（冲突详情区逐条裁定）统一数据源；纯增量字段，历史计数断言零波及
      const conflicts = [];
      incoming.forEach(function (r) {
        // W2-C #97/#42：月键须 string 且记录须为对象，结构非法跳过并计数
        if (!isMergeableRec(r) || typeof r.month !== 'string') { skipped++; return; }
        const loc = localMonths[r.month];
        if (!loc) { add++; return; }
        conflict++;
        // W2-C #40：updatedAt 数值时间比较
        const win = updatedAtNum(r.updatedAt) > updatedAtNum(loc.updatedAt);
        if (win) incomingWins++;
        conflicts.push({ id: r.month,
          localUpdatedAt: loc.updatedAt || null,
          incomingUpdatedAt: r.updatedAt || null,
          incomingWins: win,
          diffs: diffFieldNames(loc, r) });
      });
      tables.push({ name: name, localCount: local.length, importCount: incoming.length,
        addCount: add, conflictCount: conflict, incomingWins: incomingWins, byId: false,
        skippedCount: skipped,   // W2-C #42
        conflicts: conflicts });   // W4-E 拍板⑤：月键冲突详情
    } else {
      const localKeys = Object.create(null);   // W2-C #41：无原型对象
      local.forEach(function (r) { localKeys[canonicalKey(r)] = true; });
      let add = 0, skipped = 0;   // W2-C #42
      incoming.forEach(function (r) {
        if (!isMergeableRec(r)) { skipped++; return; }   // W2-C #97/#42：非对象记录跳过并计数
        const k = canonicalKey(r);
        if (!localKeys[k]) { add++; localKeys[k] = true; }
      });
      tables.push({ name: name, localCount: local.length, importCount: incoming.length,
        addCount: add, conflictCount: 0, incomingWins: 0, byId: false,
        skippedCount: skipped });   // W2-C #42
    }
  });
  // 三期 3.0c（B.7 #41，拍板②）：同名分类合并清单——只提示不拒收；确认时静默去重（新者胜）
  const sameNameCats = [];
  const remapP = achvSameNameRemap(payload);
  const localByIdP = Object.create(null), incomingByIdP = Object.create(null);   // W2-C #41
  state.achievementCategories.forEach(function (c) { localByIdP[c.id] = c; });
  (Array.isArray(payload.achievementCategories) ? payload.achievementCategories : [])
    .forEach(function (c) { if (c && c.id !== undefined) incomingByIdP[c.id] = c; });
  Object.keys(remapP).forEach(function (loserId) {
    const winnerId = remapP[loserId];
    const loser = localByIdP[loserId] || incomingByIdP[loserId];
    const winner = localByIdP[winnerId] || incomingByIdP[winnerId];
    if (!loser || !winner) return;
    sameNameCats.push({ name: String(loser.name || '').trim(),
      loserId: loserId, winnerId: winnerId,
      incomingWins: !!incomingByIdP[winnerId] });
  });
  return { tables: tables, dangling: countDanglingRefs(payload), sameNameCats: sameNameCats };
}

/**
 * 执行合并导入（仅在用户点「确认导入」后调用，调用方负责落库与刷新）：
 * 同 id 冲突以 updatedAt 新者胜；纯新增保留原 id 并入；无 id 表整条去重；
 * settings 不覆盖本地，instanceCounter 抬升到双方最大（D7）。
 */

/**
 * 执行合并导入（仅在用户点「确认导入」后调用，调用方负责落库与刷新）。
 * W4-E 拍板⑤（#142 部分采纳）：第二参 choiceMap（可选）= 逐条取舍裁定——
 * 键 '数据表|记录id'（reconciles 为 'reconciles|月份'），值 'local'/'incoming'；
 * 显式取值覆盖 updatedAt 自动裁定，缺省/未知键维持「新者胜」——不传参行为逐字节不变。
 * 人工裁定不改写记录自身 updatedAt（裁定只决定本次谁进库，不制造新时间戳）、不留痕、
 * 不加字段（C2 最小边界，拍板 B3）；取舍态存续与清理由 panels 确认链路负责。
 */
function applyImportMerge(payload, choiceMap) {
  const report = buildImportPreview(payload);
  // 三期 3.0c（B.7 #41，拍板②）：同名分类合并映射——确认时静默按 name 去重、保留
  // updatedAt 新者；条目归属自动改挂（载荷侧在 achievements 合并时映射，本地输家即处改挂）
  const achvRemap = achvSameNameRemap(payload);
  const achvIncomingIds = Object.create(null);   // W2-C #41
  (Array.isArray(payload.achievementCategories) ? payload.achievementCategories : [])
    .forEach(function (c) { if (c && c.id !== undefined) achvIncomingIds[c.id] = true; });
  IMPORT_TABLES.forEach(function (name) {
    if (!Array.isArray(payload[name])) return;
    const incoming = payload[name];
    if (IMPORT_ID_TABLES.indexOf(name) >= 0) {
      const indexById = Object.create(null);   // W2-C #41
      state[name].forEach(function (r, i) { if (r && r.id !== undefined) indexById[r.id] = i; });
      incoming.forEach(function (r) {
        // W2-C #97：与预览同口径的结构校验
        if (!isMergeableRec(r) || typeof r.id !== 'string') return;
        const i = indexById[r.id];
        if (i === undefined) {
          indexById[r.id] = state[name].length;
          state[name].push(r);
        } else {
          // W4-E 拍板⑤：逐条取舍——显式 'incoming'/'local' 覆盖自动裁定（不改写时间戳）；
          // 缺省维持 W2-C #40 updatedAt 数值时间比较（行为零变化基石）
          const ch = choiceMap ? choiceMap[name + '|' + r.id] : undefined;
          const incWins = ch === 'incoming' ? true
            : ch === 'local' ? false
            : updatedAtNum(r.updatedAt) > updatedAtNum(state[name][i].updatedAt);
          if (incWins) state[name][i] = r;   // 导入方较新或人工裁定以导入为准
        }
      });
      // 三期 3.0c（B.7 #41）：同名分类去重——仅 achievementCategories 表且存在同名映射时
      // 触发（无同名 → 两趟 filter 零移除，基线行为逐字节不变，非工程回归）
      if (name === 'achievementCategories') {
        // ① 本地输家（同名载荷记录更新）：移除本地记录，本地条目改挂赢家 id（防 categoryId 悬空）
        state.achievementCategories = state.achievementCategories.filter(function (c) {
          const winId = achvRemap[c.id];
          if (!winId || !achvIncomingIds[winId]) return true;
          state.achievements.forEach(function (a) {
            if (a.categoryId === c.id) a.categoryId = winId;
          });
          return false;
        });
        // ② 载荷输家（同名本地记录更新，或载荷内部同名新者胜）：移除刚并入的输家记录
        state.achievementCategories = state.achievementCategories.filter(function (c) {
          if (!achvIncomingIds[c.id]) return true;   // 本地记录不在此列
          return !(achvRemap[c.id] && achvRemap[c.id] !== c.id);
        });
      }
    } else if (name === 'reconciles') {
      // 子项④：按 month 唯一键、updatedAt 新者胜收敛（一月一条）。
      // 改前行为：整条 JSON 去重——同月不同内容的两条并存，一月多条破坏 2.3 写点语义；
      // 改后行为：与 2.3 写点同语义——同月多条收敛为一条，新者胜，旧备份不盖新账（C4 记变更记录）。
      const byMonth = Object.create(null);   // W2-C #41
      state.reconciles.forEach(function (r) {
        if (r && r.month !== undefined) byMonth[r.month] = r;
      });
      incoming.forEach(function (r) {
        // W2-C #97：与预览同口径
        if (!isMergeableRec(r) || typeof r.month !== 'string') return;
        const loc = byMonth[r.month];
        if (!loc) { byMonth[r.month] = r; state.reconciles.push(r); }
        else {
          // W4-E 拍板⑤：月键冲突同待遇——显式取舍覆盖自动裁定（口径与带 id 表逐字一致）
          const ch = choiceMap ? choiceMap['reconciles|' + r.month] : undefined;
          const incWins = ch === 'incoming' ? true
            : ch === 'local' ? false
            : updatedAtNum(r.updatedAt) > updatedAtNum(loc.updatedAt);
          if (incWins) {
            const i = state.reconciles.indexOf(loc);
            if (i >= 0) state.reconciles[i] = r;
            byMonth[r.month] = r;
          }
        }
      });
    } else if (name === 'achievements') {
      // 三期 3.0c（B.7 #41）：同名分类合并的归属改挂——输家 id 先映射到赢家再按整条去重
      const keys = Object.create(null);   // W2-C #41
      state.achievements.forEach(function (r) { keys[canonicalKey(r)] = true; });
      incoming.forEach(function (r) {
        if (!isMergeableRec(r)) return;   // W2-C #97：非对象记录不入库
        let rec = r;
        const rawCatId = r.categoryId;
        // W2-D #330：载荷 categoryId 缺失/非法类型不再做 undefined 键访问或裸并入——
        // 走与业绩导入一致的兜底分类；兜底目标也不存在（全部分类被删）时跳过该行，
        // 绝不写 categoryId:null（§12.3 必填，W0 #4 同精神）。
        if (typeof rawCatId !== 'string' || rawCatId === '') {
          const fbId = achvFallbackCatId();
          if (!fbId) return;
          rec = {};
          Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
          rec.categoryId = fbId;
        } else if (achvRemap[rawCatId]) {
          rec = {};
          Object.keys(r).forEach(function (k) { rec[k] = r[k]; });
          rec.categoryId = achvRemap[rawCatId];
        }
        const k = canonicalKey(rec);
        if (!keys[k]) { keys[k] = true; state.achievements.push(rec); }
      });
    } else {
      const keys = Object.create(null);   // W2-C #41
      state[name].forEach(function (r) { keys[canonicalKey(r)] = true; });
      incoming.forEach(function (r) {
        if (!isMergeableRec(r)) return;   // W2-C #97：非对象记录不入库
        const k = canonicalKey(r);
        if (!keys[k]) { keys[k] = true; state[name].push(r); }
      });
    }
  });
  if (payload.settings && Number.isFinite(payload.settings.instanceCounter)) {
    state.settings.instanceCounter = Math.max(state.settings.instanceCounter,
      payload.settings.instanceCounter);
  }
  liftCounterGlobal(state);   // 1.14 子项 4：扫描全部带 id 表抬到全局最大（防 i-999 撞号）
  return report;
}

/** 数据与备份面板：导出区 + 导入区（含预览确认，R2/R7） */

/**
 * 版本选取（纯函数）：validFrom ≤ 实例日期的版本中 validFrom 最新者胜出；
 * 一条都没有 → null（D10 降级：结算留空，绝不臆造）。
 */

/**
 * 规则版本反查统一口径（四期⑧ 项 2）：跳过停用版（r.disabled === true）。
 * ruleForDate（结算）/ 覆盖计数 / 表单实时提示共用本函数——**vN 显示反查
 * （ruleVersionLabel）不得过滤停用版**（停用≠删除，裁决书修正意见 3）。
 */
function ruleLookupFor(dateStr) {
  let best = null;
  state.rules.forEach(function (r) {
    if (!r || typeof r.validFrom !== 'string' || r.disabled === true) return;
    if (r.validFrom > dateStr) return;
    if (!best) { best = r; return; }
    if (r.validFrom > best.validFrom) { best = r; return; }
    // W0 #3（2026-09-19）：同 validFrom 后保存者胜——版本号大者优先；同版本（脏数据）
    // 取 changedAt 新者（缺时间戳视为最旧，安全兜底）。修复前严格大于判据使后保存的
    // 同生效日版本被先遍历者压制、新规则不生效
    if (r.validFrom === best.validFrom) {
      const rv = r.version || 0, bv = best.version || 0;
      if (rv > bv ||
          (rv === bv && String(r.changedAt || '') >= String(best.changedAt || ''))) {
        best = r;
      }
    }
  });
  return best;
}

function ruleForDate(dateStr) {
  return ruleLookupFor(dateStr);
}

/**
 * 规则版本号反查（四期⑧ 项 9）：ruleVersion（r-3）→ 显示用 vN；**不过滤停用版**；
 * 查不到（脏引用/已删除）→ null，显示侧回落原样 ruleVersion。
 */
function ruleVersionLabel(ruleId) {
  const r = state.rules.find(function (x) { return x.id === ruleId; });
  return r ? 'v' + r.version : null;
}

/**
 * 版本覆盖统计（四期⑧ 项 8，纯函数零写入）：该版本当前实际覆盖的本学期流水数与日期
 * 范围——口径 = recomputeSettledHours 边界（当前校历 ∧ 非 canceled ∧ 非 manual），
 * 且经 ruleLookupFor 判定（停用版同口径跳过）；停用影响面横幅复用本函数，不重复实现。
 */
function ruleCoverageOf(rule, cal) {
  let count = 0, minDate = null, maxDate = null;
  state.instances.forEach(function (inst) {
    if (inst.calendarId !== cal.id) return;
    if (inst.status === 'canceled' || inst.settleMode === 'manual') return;
    // W1 #299（2026-09-19 问题列表裁决）：覆盖统计改按版本 id 判定——导入合并以
    // updatedAt 新者胜整体替换规则记录后，版本列表持有的旧对象引用与 state.rules 内
    // 新记录不再同引用，引用比较会把全部覆盖误计为 0；id 口径与对象引用无关，防误计
    const hitRule = ruleLookupFor(inst.date);
    if (!rule || !hitRule || hitRule.id !== rule.id) return;
    count++;
    if (!minDate || inst.date < minDate) minDate = inst.date;
    if (!maxDate || inst.date > maxDate) maxDate = inst.date;
  });
  return { count: count, minDate: minDate, maxDate: maxDate };
}

/**
 * 新规则生效日影响面预估（四期⑧ 项 8 表单实时提示，纯函数零写入）：validFrom 取该值时
 * 本学期将改按新版本结算的流水数（排除 canceled/manual；现有同日期更近版本赢出的不计）。
 */
function ruleDraftCoverage(validFrom, cal) {
  let count = 0;
  state.instances.forEach(function (inst) {
    if (inst.calendarId !== cal.id) return;
    if (inst.status === 'canceled' || inst.settleMode === 'manual') return;
    if (inst.date < validFrom) return;
    const cur = ruleLookupFor(inst.date);
    if (cur && cur.validFrom >= validFrom) return;
    count++;
  });
  return count;
}

/**
 * 组装规则体（纯函数，便于测试）：系数与阶梯以快照副本入 content（D2 锁定）。
 * opts: { useTypeCoef, constTypeCoef|null, useTier, constTier|null }
 */

function buildRuleContent(typeCoeffs, tiers, opts) {
  return {
    formula: 'multiply',                       // 方案 A 连乘；语法扩展时递增此字段
    useTypeCoef: !!opts.useTypeCoef,
    constTypeCoef: (opts.constTypeCoef === undefined) ? null : opts.constTypeCoef,
    useTier: !!opts.useTier,
    constTier: (opts.constTier === undefined) ? null : opts.constTier,
    // 四期④a：深拷贝真快照（D2 锁定红线）——与入参对象断绝引用，防主表/表单事后篡改污染已存版本
    typeCoeffs: Object.assign({}, typeCoeffs),
    tiers: (tiers || []).map(function (t) { return Object.assign({}, t); })
  };
}

/**
 * 结算计算（方案 A 三因子连乘，纯函数）：
 * 名义学时恒为基准；类型系数因子可取常数覆盖，否则按实例 typeId 查快照表（缺省 1）；
 * 人数加成因子可取常数覆盖，否则按 headcount 落档（null 视为 0 人）取第一匹配档，
 * 无匹配档加成取 1（不臆造）；结果 round2。
 */

function computeSettledHours(inst, rule) {
  const c = rule && rule.content;
  if (!c) return null;
  let h = inst.nominalHours;
  // W1 #21（2026-09-19 问题列表裁决）：负系数脏数据防御——表单校验（系数 ≥0 / 加成 >0）
  // 管不到导入路径，脏规则快照可能带负值。类型系数与常数覆盖的语义域为 [0,∞)，负值钳 0；
  // 阶梯加成表单域为 (0,∞)，匹配档加成非正时取 1（不臆造系数，Q4 同精神）
  if (c.useTypeCoef) {
    const kRaw = (c.constTypeCoef !== null && c.constTypeCoef !== undefined)
      ? c.constTypeCoef
      : (c.typeCoeffs && isFinite(c.typeCoeffs[inst.typeId]) ? c.typeCoeffs[inst.typeId] : 1);
    // W1 #304（2026-09-19 问题列表裁决）：系数 Number 化后参与计算——脏字符串 "1.2"
    // 此前经 isFinite 放行后隐式转换参与乘法，显式归一防隐式转换语义漂移（导入脏数据防线）
    const kNum = Number(kRaw);
    const k = (isFinite(kNum) && kNum >= 0) ? kNum : (isFinite(kNum) ? 0 : 1);
    h *= k;
  }
  if (c.useTier) {
    if (c.constTier !== null && c.constTier !== undefined) {
      // W1 #304：人数加成常数覆盖同口径 Number 化
      const ctNum = Number(c.constTier);
      h *= (isFinite(ctNum) && ctNum >= 0) ? ctNum : (isFinite(ctNum) ? 0 : 1);
    } else {
      const hc = (inst.headcount === null || inst.headcount === undefined) ? 0 : inst.headcount;
      const tiers = Array.isArray(c.tiers) ? c.tiers : [];
      const t = tiers.find(function (x) { return hc >= x.min && hc <= x.max; });
      // W1 #304：阶梯加成同口径 Number 化
      const mNum = Number(t ? t.multiplier : 1);
      h *= (isFinite(mNum) && mNum > 0) ? mNum : 1;
    }
  }
  return round2(h);
}

/**
 * 本学期重算（Q5 边界裁定）：遍历流水——
 *  仅处理当前校历；manual 覆盖跳过（R6 留痕优先）；
 *  canceled 结算三字段恒清空；其余按 ruleForDate 取版本计算，
 *  无版本 → 三字段清空（D10 留空）；ruleVersion 写入实例（D2 按学期锁定）。
 */

function recomputeSettledHours(cal) {
  const ts = nowIso();
  state.instances.forEach(function (inst) {
    if (inst.calendarId !== cal.id) return;
    if (inst.settleMode === 'manual') return;
    if (inst.status === 'canceled') {
      if (inst.settledHours !== null || inst.settleMode !== null || inst.ruleVersion !== null) {
        inst.settledHours = null;
        inst.settleMode = null;
        inst.ruleVersion = null;
        inst.updatedAt = ts;
      }
      return;
    }
    const rule = ruleForDate(inst.date);
    if (!rule) {
      if (inst.settledHours !== null || inst.settleMode !== null || inst.ruleVersion !== null) {
        inst.settledHours = null;
        inst.settleMode = null;
        inst.ruleVersion = null;
        inst.updatedAt = ts;
      }
      return;
    }
    inst.settledHours = computeSettledHours(inst, rule);
    inst.settleMode = 'rule';
    inst.ruleVersion = rule.id;
    inst.updatedAt = ts;
  });
}

/** 规则体人话摘要（版本列表用） */

function ruleSummaryText(content) {
  if (!content) return '—';
  const parts = ['名义学时'];
  parts.push(content.useTypeCoef
    ? (content.constTypeCoef !== null && content.constTypeCoef !== undefined
      ? '类型系数×' + content.constTypeCoef : '类型系数')
    : '类型系数(停)');
  parts.push(content.useTier
    ? (content.constTier !== null && content.constTier !== undefined
      ? '人数加成×' + content.constTier : '人数加成')
    : '人数加成(停)');
  return parts.join(' × ');
}

/** 打开表单时初始化阶梯草稿：从最新版本快照预填，无版本则从主表预填 */

function statsFilterActive(f) {
  const d = defaultStatsFilter();
  if (!f) return false;
  if (f.range !== d.range) return true;
  if (f.range === 'month' && f.month) return true;
  if (f.range === 'custom' && (f.dateFrom || f.dateTo)) return true;
  if (Object.keys(f.courses || {}).length) return true;
  if (Object.keys(f.types || {}).length) return true;
  if (f.excludeCanceled !== d.excludeCanceled) return true;
  if (f.settleFilter !== d.settleFilter) return true;
  if ((f.statusFilter || 'all') !== 'all') return true;   // 四期⑨：状态筛选偏离默认即激活
  return false;
}

/**
 * 时间范围命中判定（纯函数，拍板 a）：semester = 当前校历；month = date 串前缀匹配自然月；
 * custom = date 串落在 [dateFrom, dateTo]（空端 = 不限）；all = 恒真（跨校历，仅按 date 串过滤）。
 */

function statsRangeHit(inst, f, cal) {
  if (f.range === 'semester') return inst.calendarId === cal.id;
  if (f.range === 'month') return String(inst.date).slice(0, 7) === f.month;
  if (f.range === 'custom') {
    if (f.dateFrom && inst.date < f.dateFrom) return false;
    if (f.dateTo && inst.date > f.dateTo) return false;
    return true;
  }
  return true;   // all：全部时间（跨校历回溯，B.3 遗留拍板项就此收口）
}

/**
 * 类型解析链（拍板 d，与附录A §12.4 同源、不现场回算）：
 * 实例快照 inst.typeId（非法/缺失）→ 排课项 entry.typeId → 课程 course.typeId（normalizeTypeId 回退 theory）。
 */

function instTypeIdOf(inst) {
  const t = inst && inst.typeId;
  if (t && state.courseTypes.some(function (x) { return x.id === t; })) return t;
  const en = inst && inst.entryId
    ? state.entries.find(function (x) { return x.id === inst.entryId; }) : null;
  if (en) return entryTypeId(en);
  const c = state.courses.find(function (x) { return x.id === inst.courseId; });
  return normalizeTypeId(c ? c.typeId : 'theory');
}

/** 统计口径：当前校历内计入统计的流水（排除 canceled，含 manual 补课，Q2）——2.2 既有函数保留，兼容口与筛选层共用同口径 */

function statsIncludedInstances(cal) {
  return state.instances.filter(function (x) {
    return x.calendarId === cal.id && x.status !== 'canceled';
  });
}

/**
 * 自由筛选谓词（纯函数，拍板 a/b）：范围 → 排除停课开关 → 课程多选（空集合 = 全部）→
 * 课时类型多选（空集合 = 全部）→ 结算状态（all / settled / unsettled）。
 * 默认筛选结果与 statsIncludedInstances 逐条一致（2.2 既有口径，非工程回归）。
 */

function statsFilterIncludedInstances(cal, filter) {
  // 四期④a（B.12-5.1）：部分字段缺失时回落默认口径——堵 canceled 不排除的判定漂移
  const f = Object.assign(defaultStatsFilter(), filter || {});
  const courseSel = f.courses || {};
  const typeSel = f.types || {};
  const hasCourses = Object.keys(courseSel).length > 0;
  const hasTypes = Object.keys(typeSel).length > 0;
  return state.instances.filter(function (inst) {
    if (!statsRangeHit(inst, f, cal)) return false;
    if (f.excludeCanceled && inst.status === 'canceled') return false;
    // 四期⑨（B.11-U29）：授课状态筛选——'all' 或缺失（旧 UI 态对象）回落恒真，默认口径逐条不变
    if (f.statusFilter && f.statusFilter !== 'all' && inst.status !== f.statusFilter) return false;
    if (hasCourses && !courseSel[inst.courseId]) return false;
    if (hasTypes && !typeSel[instTypeIdOf(inst)]) return false;
    if (f.settleFilter === 'settled' &&
        (inst.settledHours === null || inst.settledHours === undefined)) return false;
    if (f.settleFilter === 'unsettled' &&
        inst.settledHours !== null && inst.settledHours !== undefined) return false;
    return true;
  });
}

/** 按课程聚合（传入已筛选流水列表，纯函数）：条数 / 名义 / 结算 / 理论·实训名义拆分（拍板 d，round2 收口） */

function courseStatsRowsFrom(list) {
  const byCourse = {};
  list.forEach(function (inst) {
    let r = byCourse[inst.courseId];
    if (!r) {
      r = { courseId: inst.courseId, count: 0, nominal: 0, settled: 0, settledCount: 0,
        theoryNominal: 0, labNominal: 0 };
      byCourse[inst.courseId] = r;
    }
    r.count += 1;
    // W0 #6（2026-09-19）：先 Number 化再求和——脏字符串学时防 '2'+'2'='22' 拼接，
    // 与四期④a 投影（monthAchvProjection）口径一致；非有限值该加数跳过
    const nhW0 = Number(inst.nominalHours);
    if (isFinite(nhW0)) r.nominal += nhW0;
    if (inst.settledHours !== null && inst.settledHours !== undefined) {
      const shW0 = Number(inst.settledHours);
      if (isFinite(shW0)) r.settled += shW0;
      r.settledCount += 1;
    }
    if (instTypeIdOf(inst) === 'theory') { if (isFinite(nhW0)) r.theoryNominal += nhW0; }
    else { if (isFinite(nhW0)) r.labNominal += nhW0; }   // lab / practice 归实训档（附录A §12.4）
  });
  // 结算值是两位小数（round2），浮点累加会漂移（3.3+2.4=5.6999…）：聚合后统一 round2 收口，
  // 保证汇总合计与逐条之和一致（R6：显示数字有来源且口径唯一）
  return Object.keys(byCourse).map(function (k) {
    byCourse[k].settled = round2(byCourse[k].settled);
    byCourse[k].nominal = round2(byCourse[k].nominal);   // 1.16 子项②：名义合计同 round2 收口（0.1+0.2 类漂移防线）
    byCourse[k].theoryNominal = round2(byCourse[k].theoryNominal);
    byCourse[k].labNominal = round2(byCourse[k].labNominal);
    return byCourse[k];
  });
}

/**
 * 按班级聚合（四期⑪ 拍板②，纯函数）：粒度 = 授课班级整串——流水 entryId → 排课项 →
 * entryClassesOf 回落链（entry.classes → course.classes，§6 回退哲学），不拆单班
 * （classes 为自由文本，拆班属臆造分隔符规则，C8）；空串（未设班级）归「未设班级」组；
 * 数值口径与 courseStatsRowsFrom 逐条一致（名义/结算/理论·实训拆分，round2 收口）；
 * 行序 = 名义学时降序（汇报主战场排序）。按班级模式无钻取（钻取按课程）。
 */
function classesStatsRowsFrom(list) {
  const byClasses = {};
  (Array.isArray(list) ? list : []).forEach(function (inst) {
    const en = inst && inst.entryId
      ? state.entries.find(function (x) { return x.id === inst.entryId; }) : null;
    const key = entryClassesOf(en || null) || '未设班级';
    let r = byClasses[key];
    if (!r) {
      r = { classes: key, count: 0, nominal: 0, settled: 0, settledCount: 0,
        theoryNominal: 0, labNominal: 0 };
      byClasses[key] = r;
    }
    r.count += 1;
    // W0 #6：先 Number 化再求和（与 courseStatsRowsFrom 同口径，防字符串拼接）
    const nhW0c = Number(inst.nominalHours);
    if (isFinite(nhW0c)) r.nominal += nhW0c;
    if (inst.settledHours !== null && inst.settledHours !== undefined) {
      const shW0c = Number(inst.settledHours);
      if (isFinite(shW0c)) r.settled += shW0c;
      r.settledCount += 1;
    }
    if (instTypeIdOf(inst) === 'theory') { if (isFinite(nhW0c)) r.theoryNominal += nhW0c; }
    else { if (isFinite(nhW0c)) r.labNominal += nhW0c; }   // lab / practice 归实训档（§12.4.5）
  });
  const rows = Object.keys(byClasses).map(function (k) {
    const r = byClasses[k];
    r.nominal = round2(r.nominal);
    r.settled = round2(r.settled);
    r.theoryNominal = round2(r.theoryNominal);
    r.labNominal = round2(r.labNominal);
    return r;
  });
  rows.sort(function (a, b) { return b.nominal - a.nominal; });
  return rows;
}

/** 2.2 兼容口（基线断言调用点不变）：默认口径聚合 = courseStatsRowsFrom(statsIncludedInstances(cal)) */

function courseStatsRows(cal) {
  return courseStatsRowsFrom(statsIncludedInstances(cal));
}

/**
 * 进度（拍板 d，仅「本学期」范围显示）：已上 = date ≤ 今天的计入流水；应上 = 计入流水总数
 * （含未来周、含 manual 补课、排除 canceled，与统计口径一致）。
 */

function progressOfInstances(list) {
  const todayStr = fmtLocalDate(new Date());
  let done = 0;
  list.forEach(function (inst) { if (String(inst.date) <= todayStr) done++; });
  return { done: done, total: list.length };
}

/** CSV 单元格取值（四期④c）：classes 为投影列——不入流水快照，导出走 entryClassesOf
    运行时回落链（entry.classes → course.classes → 空串）；其余字段直接取实例快照。 */
function csvInstanceCell(inst, f) {
  if (f === 'classes') {
    const en = state.entries.find(function (x) { return x.id === inst.entryId; });
    return csvCell(entryClassesOf(en || null));
  }
  return csvCell(inst[f]);
}

/**
 * 筛选 CSV 中文字段头枚举（四期⑪ 拍板：人机两口径分工——筛选导出口全中文表头供直接阅读/
 * 转发，数据面板流水 CSV 维持附录A §7 英文字段序不动）。键 = CSV_FIELDS 字段名，
 * 值 = 中文表头（经 csvCell 转义防逗号）。
 */
const STATS_CSV_HEADERS = {
  id: '流水ID', entryId: '排课项ID', courseId: '课程ID', calendarId: '校历ID',
  date: '授课日期', weekNo: '周次', periods: '节次区间', location: '地点',
  headcount: '学生人数', nominalHours: '名义学时', typeId: '课时类型',
  settledHours: '结算学时', settleMode: '结算来源', status: '授课状态',
  source: '记录来源', frozen: '已冻结', movedFromDate: '原定日期',
  overrideNote: '留痕说明', linkNote: '关联说明', ruleVersion: '规则版本',
  createdAt: '创建时间', updatedAt: '更新时间', classes: '授课班级'
};

/** 筛选结果 CSV（拍板 e/A3 并入）：字段序同附录A §7（与流水 CSV 同构），UTF-8 BOM + RFC 4180 转义复用 csvCell；
    四期⑪：表头改中文字段头枚举（内容行取值口径不变，机器解析走数据面板英文 CSV） */

function exportFilteredStatsCsv(list) {
  const lines = [CSV_FIELDS.map(function (f) { return csvCell(STATS_CSV_HEADERS[f] || f); }).join(',')];
  list.forEach(function (inst) {
    lines.push(CSV_FIELDS.map(function (f) { return csvInstanceCell(inst, f); }).join(','));
  });
  return '﻿' + lines.join('\r\n');
}

/** 口径小字回显（拍板 c）：筛选条件与口径（canceled 排除、manual 计入、结算「—」语义等）常驻说明 */

function statsFilterEchoText(f, cal) {
  const parts = [];
  if (f.range === 'semester') parts.push('本学期「' + cal.name + '」');
  else if (f.range === 'month') parts.push('月份 ' + (f.month || '未选择'));
  else if (f.range === 'custom') {
    parts.push('自定义 ' + (f.dateFrom || '起始不限') + ' ~ ' + (f.dateTo || '结束不限'));
  } else parts.push('全部时间（跨校历）');
  const cSel = Object.keys(f.courses || {});
  parts.push(cSel.length ? '课程 ' + cSel.length + ' 门' : '全部课程');
  const tSel = Object.keys(f.types || {});
  if (tSel.length) {
    parts.push('类型 ' + tSel.map(function (t) {
      const ct = state.courseTypes.find(function (x) { return x.id === t; });
      return ct ? ct.name : t;
    }).join('/'));
  } else parts.push('全部类型');
  parts.push(f.excludeCanceled ? '排除临时停课' : '含临时停课');
  parts.push(f.settleFilter === 'settled' ? '仅已结算'
    : f.settleFilter === 'unsettled' ? '仅未结算' : '结算不限');
  if (f.statusFilter && f.statusFilter !== 'all') {
    parts.push('状态 ' + (WEEK_STATUS_NAMES[f.statusFilter] || f.statusFilter));
  }
  parts.push('含调课与补课 · 结算列为空显「—」');
  return parts.join(' · ');
}

/**
 * 筛选区 HTML（插单 1.20 控件集 + 插单 1.25 收纳：默认折叠为一条摘要行，展开后按
 * 「时间范围 / 课程与类型 / 结算与口径」三组分区排布；复用 cal-form-card / break-chip /
 * factor-row / period-pair / today-line 既有体系，R3，新增样式仅组标题两条见 style.css）。
 * 摘要行常驻筛选口径小字回显；有非默认条件激活时 badge-warn 高亮「筛选已生效」
 * （避免「筛了但看不见」）；折叠/展开为纯 UI 态（uiStatsFilterCollapsed），筛选条件的
 * 判定逻辑、控件 id 与口径回显文案与 1.20 一字不改（基线绑定点全保留）。
 */

function projectMonthNominalHours(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  let sum = 0;
  state.instances.forEach(function (inst) {
    if (String(inst.date).slice(0, 7) !== month) return;
    if (inst.status === 'canceled') return;
    if (isFinite(inst.nominalHours)) sum += Number(inst.nominalHours);   // 四期④a：先 Number 化再累加，堵字符串拼接污染
  });
  return round2(sum);
}

/** 校历可录入月份范围：[起始月, 结束月]（YYYY-MM 零填充串字典序即时间序） */

function reconcileMonthRange(cal) {
  const totalWeeks = (Number.isInteger(cal.totalWeeks) && cal.totalWeeks >= 1) ? cal.totalWeeks : 16;
  return {
    min: String(cal.startDate).slice(0, 7),
    max: dateOfWeek(cal, totalWeeks, 7).slice(0, 7)
  };
}

/** 对账核对面板：录入/编辑表单 + 按月对照列表 + 待对账提示 */

function achvCategoriesOrdered() {
  return state.achievementCategories.slice().sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  });
}

/**
 * 复制本月条目文本（四期⑪ 汇报速取，纯函数，零写入）：格式 = M/D 分类｜内容｜作用
 * （v1.58 拍板；作用空省略尾段）；分类名兜底「未分类」（悬空 categoryId 原样呈现）；
 * 经 copyTextToClipboard 既有降级链进剪贴板，成功/失败横幅汇报（R7 不弹窗）。
 */
function buildAchvMonthCopyText(month) {
  const catNameOf = function (id) {
    const c = state.achievementCategories.find(function (x) { return x.id === id; });
    return c ? c.name : '未分类';
  };
  return achvEntriesOfMonth(month).map(function (a) {
    let line = a.date.slice(5).replace('-', '/') + ' ' +
      catNameOf(a.categoryId) + '｜' + a.content;
    const role = String(a.role || '').trim();
    if (role) line += '｜' + role;
    return line;
  }).join('\n');
}

/** order 归一化：按当前排序重写 1..n（删除/移动后调用，保证排序位连续） */

function achvRenormalizeOrders() {
  achvCategoriesOrdered().forEach(function (c, i) { c.order = i + 1; });
}

/** 某月业绩条目：date 前缀匹配自然月（§12.3 导出按月聚），按日期升序（同日按 createdAt） */

function achvEntriesOfMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  return state.achievements
    .filter(function (a) { return String(a.date).slice(0, 7) === month; })
    .sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
}

/**
 * §12.4 学时投影（唯一权威口径，与对账核对 projectMonthNominalHours 同源精神：
 * 自然月串前缀 / 跨校历 / 含 normal·moved·makeup / 排除 canceled / 名义学时求和）；
 * 理论·实训拆分走类型解析链 inst → entry → course（instTypeIdOf，不现场回算）；
 * 聚合 round2 收口（与对账核对一致）；显示层按 §12.4.7 取一位小数。
 */

function monthAchvProjection(month) {
  let theory = 0, lab = 0;
  state.instances.forEach(function (inst) {
    if (String(inst.date).slice(0, 7) !== month) return;
    if (inst.status === 'canceled') return;
    if (!isFinite(inst.nominalHours)) return;
    // 四期④a：先 Number 化再累加（year 投影走逐月同链，一并堵住）
    if (instTypeIdOf(inst) === 'theory') theory += Number(inst.nominalHours);
    else lab += Number(inst.nominalHours);   // lab / practice 归实训档（§12.4.5）
  });
  return { theory: round2(theory), lab: round2(lab), total: round2(theory + lab) };
}

/** 月报文件名（§12.6）：工作业绩报告表_2026年8月_马洪超.html；姓名空则省略姓名段 */

function yearAchvProjection(year) {
  const y = String(year);
  if (!/^\d{4}$/.test(y)) return { theory: 0, lab: 0, total: 0 };
  let theory = 0, lab = 0;
  for (let m = 1; m <= 12; m++) {
    const p = monthAchvProjection(y + '-' + ('0' + m).slice(-2));
    theory += p.theory;
    lab += p.lab;
  }
  return { theory: round2(theory), lab: round2(lab), total: round2(theory + lab) };
}

/** 四期⑨（B.11-U31）：月份区间展开 [from, to] 闭区间逐月 YYYY-MM 串（非法或 from>to → 空数组） */
function monthRangeBetween(fromMonth, toMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(fromMonth)) || !/^\d{4}-\d{2}$/.test(String(toMonth))) return [];
  if (String(fromMonth) > String(toMonth)) return [];
  const out = [];
  let cur = String(fromMonth);
  let guard = 0;
  while (cur <= String(toMonth) && guard < 600) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
    guard++;
  }
  return out;
}

/** 区间条目：date 落在 [from, to] 闭区间（YYYY-MM 串字典序即时间序），按日期升序（同日按 createdAt） */
function achvEntriesOfRange(fromMonth, toMonth) {
  const months = {};
  monthRangeBetween(fromMonth, toMonth).forEach(function (m) { months[m] = true; });
  return state.achievements.filter(function (a) {
    return months[String(a.date).slice(0, 7)] === true;
  }).sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date)) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

/** 区间学时投影：逐月 §12.4 投影求和（与学年投影同链，round2 收口，R6 口径唯一） */
function rangeAchvProjection(fromMonth, toMonth) {
  let theory = 0, lab = 0;
  monthRangeBetween(fromMonth, toMonth).forEach(function (m) {
    const p = monthAchvProjection(m);
    theory += p.theory;
    lab += p.lab;
  });
  return { theory: round2(theory), lab: round2(lab), total: round2(theory + lab) };
}

/** 业绩条目按年过滤：date 前缀匹配年份，按日期升序（同日按 createdAt） */

function achvEntriesOfYear(year) {
  if (!/^\d{4}$/.test(String(year))) return [];
  return state.achievements
    .filter(function (a) { return String(a.date).slice(0, 4) === String(year); })
    .sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
}

/** 「本人作用」空白清单（拍板③：导出提醒用，返回 role 空白/缺失的条目数组；不阻断导出，R7） */

function achvBlankRoleEntries(list) {
  return (Array.isArray(list) ? list : []).filter(function (a) {
    return !a || !String(a.role || '').trim();
  });
}

/**
 * 月报导出入口：文件名按 §12.6，内容为上函数（下载走 downloadTextFile，R1 零外链）。
 * 拍板③：导出范围内「本人作用」为空的条目 → 横幅提醒（含日期+内容定位，最多列 3 条），
 * 不弹窗、不阻断导出（R7）；无空白则静默导出（原行为不变）。
 */

function shiftMonth(ym, delta) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
  // W2-D #63：欧几里得取模——JS % 对负数保留负号，跨 0 年/极大负 delta 时原会产出「月 00」
  const t = y * 12 + (m - 1) + delta;
  const yy = Math.floor(t / 12);
  const mm = ((t % 12) + 12) % 12 + 1;
  return yy + '-' + ('0' + mm).slice(-2);
}

/** 日期平移到目标月同日；目标月无该日（如 1/31 → 2 月）钳到月末（拍板②钳制语义） */

function shiftDateToMonth(dateStr, targetMonth) {
  const day = parseInt(String(dateStr).slice(8, 10), 10);
  const y = parseInt(targetMonth.slice(0, 4), 10);
  const m = parseInt(targetMonth.slice(5, 7), 10);
  // W2-D #64：UTC 构造目标月末——本地时区历史偏移/边界不再影响月末钳制
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(Math.max(day || 1, 1), maxDay);
  return targetMonth + '-' + ('0' + d).slice(-2);
}

/** 复制预览模型（纯函数，零写入——R2）：源月条目 + 平移后目标日期 + 默认全勾选 */

function achvCopyPreviewModel(srcMonth, dstMonth) {
  return achvEntriesOfMonth(srcMonth).map(function (a) {
    return { src: a, dstDate: shiftDateToMonth(a.date, dstMonth), checked: true };
  });
}

/** 「解析预览」：校验源/目标月 → 建预览模型 → 重渲染（state 零写入，R2） */

/* 分类名匹配级别（四期④c，B.10-2.12）：返回 { cat, level }——level ∈ 'exact'（精确）/
   'strip'（去括号）/ 'substr'（子串），未命中 null；三级口径与 matchAchvCategory 完全同链。 */
function matchAchvCategoryLevel(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const cats = achvCategoriesOrdered();
  const strip = function (s) { return String(s).replace(/[(（][^()（）]*[)）]/g, '').trim(); };
  let hit = cats.find(function (c) { return String(c.name).trim() === n; });
  if (hit) return { cat: hit, level: 'exact' };
  hit = cats.find(function (c) { return strip(c.name) === n; });
  if (hit) return { cat: hit, level: 'strip' };
  if (n.length >= 2) {
    hit = cats.find(function (c) {
      const sn = strip(c.name);
      return sn.indexOf(n) >= 0 || (sn.length >= 2 && n.indexOf(sn) >= 0);
    });
    if (hit) return { cat: hit, level: 'substr' };
  }
  return null;
}
function matchAchvCategory(name) {
  const m = matchAchvCategoryLevel(name);
  return m ? m.cat : null;   // 语义与改前一致（委托 level 版取 cat）
}

/** 日期归一：认 YYYY-M-D / YYYY/M/D / YYYY.M.D（全角经 normalizePasteText 已转半角）；非法日历日 → null */

function normalizeAchvDate(s) {
  const m = String(s).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

/**
 * 单行切四段（拍板①，2026-09-18 用户授权按建议裁决）：按前三个竖线（全/半角）切分，
 * 第三处竖线之后的内容全部归入第四段「本人作用」——内容内误含竖线时作用段兜底不丢数据。
 */

function splitAchvLineFour(line) {
  const segs = [];
  let rest = String(line);
  for (let i = 0; i < 3; i++) {
    const idx = rest.search(/[|｜]/);
    if (idx < 0) break;
    segs.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1);
  }
  segs.push(rest);
  return segs;   // 长度 1–4
}

/**
 * 随手记单行解析（纯函数）：首段形如日期则认领（否则按日期可省语义视为分类名）；
 * 返回 { date, category, content, role }（date 空串 = 缺省，确认时补基准月 1 日）；
 * 解析失败返回 { error }（人话原因，预览表标红用）。
 */

function parseAchvTextLine(line, baseMonth) {
  const segs = splitAchvLineFour(line);
  let idx = 0;
  let date = '';
  const first = (segs[0] || '').trim();
  if (first) {
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(first)) {
      const nd = normalizeAchvDate(first);
      if (!nd) return { error: '日期非法：' + first };
      date = nd;
      idx = 1;
    }
    // 非日期形态首段不强行认领：视为分类名（日期可省，附录A §12.5）
  }
  const category = (segs[idx] || '').trim();
  const content = (segs[idx + 1] || '').trim();
  // 拍板①：第三处竖线之后全部归「本人作用」——slice 拼接同时覆盖带日期与缺日期两个分支
  // （复审修复：缺日期分支原实现只取 segs[idx+2]，第 4 段被静默丢弃）
  const role = segs.slice(idx + 2).join('|').trim();
  if (!category) return { error: '分类为空' };
  // W2-D #338：段数不足给人话定位——保留「工作内容为空」前缀兼容历史断言，同时补
  // 「行格式不足/当前 N 段」说明（日期行至少 3 段、无日期行至少 2 段）。
  const minSegs = idx > 0 ? 3 : 2;
  if (segs.length < minSegs) {
    return { error: '工作内容为空（行格式不足：需至少 ' +
      (idx > 0 ? '日期｜分类｜内容' : '分类｜内容') + '，当前仅 ' + segs.length + ' 段）' };
  }
  if (!content) return { error: '工作内容为空（行内需至少含 分类｜内容 两段）' };
  return { date: date, category: category, content: content, role: role };
}

/**
 * 随手记整段解析（纯函数）：逐行解析；空行跳过；失败行收 rejected（行号/原文/原因）。
 * date 缺省保留空串，由确认层按基准月补 1 日（§12.5）。
 */

/** 业绩导入行数上限（W2-B #49，2026-09-20）：文本行 / JSON 条数共用，与 1.9 粘贴导入 500 行同口径 */
const ACHV_IMPORT_MAX_ROWS = 500;

function parseAchvImportText(text, baseMonth) {
  const rows = [];
  const rejected = [];
  const lines = normalizePasteText(text).replace(/\r\n?/g, '\n').split('\n');
  // W2-B #49：行数上限——超限人话拒收防预览表渲染冻结，零写入
  if (lines.length > ACHV_IMPORT_MAX_ROWS) {
    return { error: '粘贴内容超过 ' + ACHV_IMPORT_MAX_ROWS +
      ' 行，疑似复制了整份文档。请分批粘贴，或改用「表格粘贴 / JSON 数组」导入。',
      rows: [], rejected: [] };
  }
  lines.forEach(function (raw, i) {
    if (!String(raw).trim()) return;   // 空行跳过，不算拒收
    const r = parseAchvTextLine(raw, baseMonth);
    if (r.error) {
      rejected.push({ line: i + 1, text: String(raw).trim().slice(0, 40), reason: r.error });
    } else {
      rows.push(r);
    }
  });
  return { rows: rows, rejected: rejected };
}

/**
 * 报告表 TSV 解析（插单 1.27，拍板②-1～②-4 按建议固化，与 §12.6 导出互为往返闭环；
 * v2 2026-09-19 实机缺陷修复：改「碎片拼装」模型，适配真实 Word 竖排合并分项列——
 * 分项文字折行成多段、延续行分项列为空、各行列数不等（ragged），定列位映射不成立）：
 * Word/WPS 中全选报告表复制 → 剪贴板文本天然「单元格 \t 分列、行 \n 分行」。逐行裁定：
 *  ① 表头行（W2-A #322：单元格空白归一后恰为「序号」或「工作内容与效果」）跳过；
 *  ② 学时项行（任一单元格 trim 后以「学时项」开头——含「学时项（授课）/…全年合计」）
 *     跳过——学时项由 §12.4 投影生成，非业绩条目（拍板②-1；对照校验为可选增强挂起）；
 *  ③ 承诺行（W2-A #35：末格以「本人承诺 / 以上报告内容 / 填报时间」开头的结构化签名）跳过（拍板②-4）；内容中误含关键词不再误跳；
 *  ④ 页眉行（首格以「单位：」开头，全/半角冒号）跳过；
 *  ⑤ 序号列（行首纯数字单元格）忽略；
 *  ⑥ 碎片拼装：行内非空单元格成 atom 序列——atom 能「生长」为既有分类名前缀
 *     （分类去括号名含 pendingCat+atom 拼接候选）即分项碎片入缓冲；否则首 atom=工作内容、
 *     次 atom=本人作用，行尾 flush 一条目（拍板②-3 同一分项每行一条目、不拼接）；
 *     判定只取生长方向（候选是分类子串）＋等值收口，**不取超串方向**——否则分项前缀
 *     落位后任意内容都会被误判为碎片（2026-09-19 dbg6 实证）；括号双口径比对
 *     （平衡剥除 / aggressive 全剥）适配碎片中段含半括号的情形；
 *     无制表符行仅作可延续分类碎片（免疫竖排承诺行逐字成行），其余静默忽略；
 *  ⑦ 分项沿用链：本行无碎片时 category = pendingCat || lastCat（拍板②-2，合并单元格
 *     延续行回落）；「本人作用」列「—」视为空；date 恒空串——确认时沿用基准月 1 日
 *     口径（§12.5）；全角标点经 normalizePasteText 归一半角（与 3.0c 文本行同口径），
 *     既有分类经 matchAchvCategory 去括号档照常命中。
 * 返回 { rows, rejected }——rows 与 parseAchvImportText 同构（纯函数零写入，沙盒可直测）；
 * rejected 收 { line, text, reason }（分项为空且无上一行）。
 */

function parseAchvTableText(text, baseMonth) {
  const rows = [];
  const rejected = [];
  // W2-A #33：基准月取值口（缺省 = 当前月）——分类行 M/D 日期前缀的年份取基准月年；
  // achv.js 调用点经缺省参数兼容，一行未动（确认链路零改动自然消费）
  const baseYm = /^\d{4}-\d{2}$/.test(String(baseMonth || ''))
    ? String(baseMonth)
    : fmtLocalDate(new Date()).slice(0, 7);
  const baseYear = baseYm.slice(0, 4);
  const strip = function (s) { return String(s).replace(/[(（][^()（）]*[)）]/g, '').trim(); };
  const stripHard = function (s) { return String(s).replace(/[()（）]/g, '').trim(); };   // 碎括号 aggressive 剥除
  // 分类名三口径表：raw=原名（W2-A #319 新增第三口径）、soft=平衡括号剥除（全名）、hard=括号全剥（碎片中段比对用）
  const catPairs = state.achievementCategories.map(function (c) {
    const nm = String(c.name || '').trim();
    return { raw: nm, soft: strip(nm), hard: stripHard(nm) };
  });
  const isCatFrag = function (t) {
    if (!t) return false;
    const cand = pendingCat + t;
    const raw = String(cand).trim();             // W2-A #319：raw 口径——碎括号中段等形态与原名直接比对
    const soft = strip(cand);                    // 平衡口径候选
    const hard = stripHard(cand);                // aggressive 口径候选
    for (let i = 0; i < catPairs.length; i++) {
      if (raw && catPairs[i].raw.indexOf(raw) >= 0) return true;                 // raw 口径生长（碎括号中段）
      if (soft && catPairs[i].soft.indexOf(soft) >= 0) return true;              // 生长：候选是分类子串（含收口等值）
      if (hard && hard.length <= catPairs[i].hard.length &&
          catPairs[i].hard.indexOf(hard) >= 0) return true;                      // hard 口径生长（碎括号中段）
    }
    return false;
  };
  const lines = normalizePasteText(text).replace(/\r\n?/g, '\n').split('\n');
  let lastCat = '';        // 最近完整分项（延续行回落用，拍板②-2）
  let pendingCat = '';     // 正在拼装的分类碎片缓冲
  lines.forEach(function (raw, i) {
    if (!String(raw).trim()) return;              // 空行静默忽略
    const hasTab = raw.indexOf('\t') >= 0;
    if (!hasTab && !pendingCat) return;           // 无制表符且无可延续碎片 → 页眉页脚/竖排承诺字静默忽略
    let cells = String(raw).split('\t').map(function (c) { return String(c).trim(); });
    let atoms = cells.filter(function (c) { return !!c; });
    if (atoms.length && /^\d+$/.test(atoms[0])) atoms = atoms.slice(1);   // ⑤ 序号列忽略
    if (!atoms.length) return;
    // ① 表头行（W2-A #322：空白归一——「序 号」「工作内容 与效果」等含空格表头照常跳过）
    if (atoms.some(function (c) {
      const cn = c.replace(/\s+/g, '');
      return cn === '序号' || cn === '工作内容与效果';
    })) return;
    // ③ 承诺行（W2-A #35 结构化签名：末格以关键词**开头**——工作内容中误含「本人承诺/
    //    以上报告内容/填报时间」不再整行误跳；竖排逐字成行由无制表符守卫免疫，口径不变）
    const lastCell = atoms[atoms.length - 1];
    if (lastCell.indexOf('本人承诺') === 0 || lastCell.indexOf('以上报告内容') === 0 ||
        lastCell.indexOf('填报时间') === 0) return;
    // ② 学时项行（W2-A #35 结构化签名：行首格/次格以「学时项」**开头**——原任意格前缀
    //    命中口径收紧；内容中段含「学时项」不再误跳）
    if (atoms[0].indexOf('学时项') === 0 ||
        (atoms.length > 1 && atoms[1].indexOf('学时项') === 0)) return;
    // ④ 页眉行（全/半角冒号——normalizePasteText 归一后半角判据必备）
    if ((cells[0] || '').indexOf('单位：') === 0 ||
        (cells[0] || '').indexOf('单位:') === 0) return;
    if (!hasTab) {                                // 无制表符行：仅作可延续的分类碎片
      if (isCatFrag(atoms[0])) pendingCat += atoms[0];
      return;
    }
    let lineCat = '';
    const rest = [];
    atoms.forEach(function (a) {
      if (!rest.length && isCatFrag(a)) lineCat += a;   // 分项碎片（行首连续段）
      else rest.push(a);
    });
    pendingCat = lineCat ? pendingCat + lineCat : pendingCat;
    if (!rest.length) return;                     // 本行只有碎片（折行中段），等下一行
    let content = rest.slice(0, Math.max(1, rest.length - 1)).join(' ');
    let role = rest.length > 1 ? rest[rest.length - 1] : '';
    // W2-A #37：全角破折号「－」按空作用处理（原仅认 —/-；含 #321 同源）
    if (role === '—' || role === '-' || role === '－') role = '';
    // W2-A #33：分类行内容 M/D 日期前缀识别（如「09/05　集体备课」，与 §12.6 导出
    // date=true 列互为往返）——解析层归一为 YYYY-MM-DD（年份取基准月、月日零填充），
    // 非法日历值回落内容原文；无前缀行维持空串，由确认层按基准月补 1 日（§12.5）
    let date = '';
    const dm = content.match(/^(\d{1,2})\/(\d{1,2})\s*[　\s]+([\s\S]+)$/);
    if (dm) {
      const mo = parseInt(dm[1], 10), dy = parseInt(dm[2], 10);
      if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
        date = baseYear + '-' + ('0' + mo).slice(-2) + '-' + ('0' + dy).slice(-2);
        content = dm[3].trim();
      }
    }
    const category = pendingCat || lastCat;       // 拍板②-2：空分项沿用
    if (!category) {
      rejected.push({ line: i + 1, text: String(raw).trim().slice(0, 40),
        reason: '分项为空（报告表首行缺少分项名）' });
      pendingCat = '';                          // W2-A #36：拒收行后碎片缓冲复位（防跨行误拼）
      return;
    }
    rows.push({ date: date, category: category, content: content, role: role });
    lastCat = category;
    pendingCat = '';                            // W2-A #36：产出条目后缓冲复位（v1.60 已落，拒收分支本轮补齐）
  });
  // 插单 1.29：本层不判兜底——「分项为空且无上一行沿用」维持拒收（数据缺失非识别失败）；
  // 分项文本存在但无法匹配分类时原样入 rows，由 buildAchvImportPreview 统一兜底归 ac-4。
  return { rows: rows, rejected: rejected };
}

/**
 * JSON 数组解析（纯函数）：载荷须为对象数组 [{date, category, content, role}]
 * （category 为分类名，附录A §12.5）；date 可省（与文本行同口径，基准月补 1 日）；
 * 额外字段忽略（C4）；行级失败（非对象/非法日期/空分类/空内容）收 rejected 不整体拒收；
 * 顶层坏 JSON / 非数组 → { error }。
 */

function parseAchvJsonImportText(text) {
  let arr = null;
  try {
    arr = JSON.parse(String(text));
  } catch (err) {
    return { error: 'JSON 解析失败：粘贴内容不是有效的 JSON。' };
  }
  if (!Array.isArray(arr)) {
    return { error: 'JSON 导入应为数组：[{date, category, content, role}]。' };
  }
  // W2-B #49：条数上限与文本行同口径（500），超限人话拒收防预览表渲染冻结
  if (arr.length > ACHV_IMPORT_MAX_ROWS) {
    return { error: 'JSON 数组超过 ' + ACHV_IMPORT_MAX_ROWS + ' 条，请分批导入。' };
  }
  const rows = [];
  const rejected = [];
  arr.forEach(function (item, i) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejected.push({ line: i + 1, text: '(第 ' + (i + 1) + ' 项)', reason: '不是对象' });
      return;
    }
    let date = '';
    if (item.date !== undefined && item.date !== null && String(item.date).trim() !== '') {
      const nd = normalizeAchvDate(String(item.date).trim());
      if (!nd) {
        rejected.push({ line: i + 1, text: String(item.date).slice(0, 20),
          reason: '日期非法：' + String(item.date).slice(0, 20) });
        return;
      }
      date = nd;
    }
    const category = String(item.category === undefined || item.category === null
      ? '' : item.category).trim();
    const content = String(item.content === undefined || item.content === null
      ? '' : item.content).trim();
    const role = String(item.role === undefined || item.role === null
      ? '' : item.role).trim();
    if (!category) {
      rejected.push({ line: i + 1, text: content.slice(0, 20), reason: '分类为空' });
      return;
    }
    if (!content) {
      rejected.push({ line: i + 1, text: category.slice(0, 20), reason: '工作内容为空' });
      return;
    }
    rows.push({ date: date, category: category, content: content, role: role });
  });
  return { rows: rows, rejected: rejected };
}

/**
 * 导入预览模型（纯函数，零写入——R2）：逐行分类名经 matchAchvCategory 模糊匹配；
 * 命中 → { categoryId, status:'matched' }；未命中 → { categoryId:null, status:'new-cat' }
 * （确认时自动新建，或预览表下拉改派既有分类）；默认全勾选。
 */

/**
 * 分类兜底目标（插单 1.29 拍板①兜底 1a，纯函数）：预置「其他工作（临时工作）」(ac-4)；
 * ac-4 已被删除（空分类可删）时回落排序位最末分类（语义最近「其他」者）；再无 → null。
 * 兜底不兜「工作内容为空」（必填行仍拒收）——兜底只兜识别不到的分类。
 */
function achvFallbackCatId() {
  const cats = state.achievementCategories;
  const fb = cats.find(function (c) { return c.id === 'ac-4'; });
  if (fb) return fb.id;
  const ord = achvCategoriesOrdered();
  return ord.length ? ord[ord.length - 1].id : null;
}

/**
 * 导入预览模型（纯函数，零写入——R2）：逐行分类名经 matchAchvCategoryLevel 三级匹配；
 * 命中 → { categoryId, level, status:'matched' }；
 * 插单 1.29 拍板①兜底 1a：未命中 → 归入「其他工作（临时工作）」（level 记 'fallback'
 * 供预览表标黄角标与人话提示，可定位改派），兜底目标缺失（ac-4 被删且无任何分类）时
 * 退回待新建（旧行为）；默认全勾选。matchAchvCategory 匹配函数本体语义零改写。
 */
function buildAchvImportPreview(rows) {
  const fbId = achvFallbackCatId();
  return rows.map(function (r) {
    const m = matchAchvCategoryLevel(r.category);
    if (m) {
      return { row: r, categoryId: m.cat.id, level: m.level,
        status: 'matched', checked: true };
    }
    return { row: r, categoryId: fbId, level: fbId ? 'fallback' : 'new',
      status: fbId ? 'matched' : 'new-cat', checked: true };
  });
}

/**
 * B.7 #41 同名分类合并映射（纯函数；拍板② 2026-09-18 用户授权按建议裁决：确认时静默按
 * name 去重、保留 updatedAt 新者，预览列清单，不另设勾选开关）：
 * 返回 { 输家id: 赢家id }——载荷内部同名（新者胜）与载荷↔本地同名（updatedAt 新者胜，
 * 缺时间戳视为最旧）统一在此裁定；条目归属改挂由调用方据映射执行。
 */

function achvSameNameRemap(payload) {
  const remap = {};
  const incoming = Array.isArray(payload && payload.achievementCategories)
    ? payload.achievementCategories : [];
  const localByName = Object.create(null);   // W2-C #41
  state.achievementCategories.forEach(function (c) {
    const nm = String(c.name || '').trim();
    if (nm && localByName[nm] === undefined) localByName[nm] = c;
  });
  const incomingByName = Object.create(null);   // W2-C #41
  incoming.forEach(function (c) {
    if (!c || typeof c.name !== 'string') return;
    const nm = c.name.trim();
    if (!nm) return;
    if (incomingByName[nm]) {
      // W2-C #40/#327：数值时间比较（格式不一致不再错序；同刻平手取先见者，确定性口径）
      const w = updatedAtNum(c.updatedAt) > updatedAtNum(incomingByName[nm].updatedAt)
        ? c : incomingByName[nm];
      const l = w === c ? incomingByName[nm] : c;
      if (l.id !== w.id) remap[l.id] = w.id;
      incomingByName[nm] = w;
    } else {
      incomingByName[nm] = c;
    }
  });
  Object.keys(incomingByName).forEach(function (nm) {
    const loc = localByName[nm];
    const inc = incomingByName[nm];
    if (loc && inc && loc.id !== inc.id) {
      // W2-C #40/#327：数值时间比较
      const incWins = updatedAtNum(inc.updatedAt) > updatedAtNum(loc.updatedAt);
      remap[(incWins ? loc : inc).id] = (incWins ? inc : loc).id;
    }
  });
  return remap;
}

/* ---------- 业绩导入 UI（业绩面板「导入业绩」卡；复用 cal-form-card / paste-textarea /
      import-preview / paste-badge 体系，R3 零新增样式） ---------- */

/** 「导入业绩」卡 HTML：格式选择 + 基准月 + 文本域 + 解析预览（零写入）+ 确认/返回 */

function achvExportStaleDays() {
  const ts = state.settings.lastAchievementExportAt;
  if (typeof ts !== 'string' || !ts) return null;
  const t = Date.parse(ts);
  if (!isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** 备份提醒「同一自然日一次」日标记（四期⑦ B.11-U7：渲染期纯 UI 态变量，照 lastFullBackupRemindDay 惯例） */

let lastAchvBackupRemindDay = '';

/** 备份提醒横幅（R7 不弹窗）：距上次导出 >7 天才提醒；同一自然日只提醒一次；无记录/未超限静默不误报 */

function achvMaybeBackupReminder() {
  const days = achvExportStaleDays();
  if (days === null || days <= ACHV_EXPORT_STALE_DAYS) return;
  const today = fmtLocalDate(new Date());
  if (lastAchvBackupRemindDay === today) return;
  lastAchvBackupRemindDay = today;
  showBanner('距上次业绩数据导出已 ' + days + ' 天（超 ' + ACHV_EXPORT_STALE_DAYS +
    ' 天），请到「数据」面板导出 JSON 备份。', 'warn');
}

/**
 * 移动速记视图判定（拍板①）：窗口内宽 ≤640px 走移动布局；桌面宽屏与无 innerWidth
 * 环境（测试沙盒）恒为桌面路径——桌面行为逐字节不变、基线断言零改写的基石。
 */

function isAchvMobileMode() {
  return isMobileViewport();   // 3.1c 兼容口：业绩速记原函数名保留，判定逻辑统一走共用谓词（R5）
}

/**
 * 一键补竖线（拍板③，纯函数）：半/全角逗号、顿号、分号、斜杠统一转 |；已有竖线不动；
 * 幂等（重复替换结果不变，不叠加竖线）；仅作用于解析前草稿，不动任何数据。
 */

function normalizeAchvQuickText(t) {
  return String(t).replace(/[,，、;；\/／]/g, '|');
}

/** 「一键补竖线」：改写文本域草稿并回写 uiAchvImportText，横幅说明（仅草稿、可手动改回） */

function achvQuickList(range, monthStr, catId) {
  const todayStr = fmtLocalDate(new Date());
  let list = state.achievements.slice();
  if (range === 'today') {
    list = list.filter(function (a) { return a.date === todayStr; });
  } else if (range === 'month') {
    list = list.filter(function (a) { return String(a.date).slice(0, 7) === monthStr; });
  }
  if (catId) list = list.filter(function (a) { return a.categoryId === catId; });
  const byDateAsc = function (a, b) {
    return String(a.date).localeCompare(String(b.date)) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  };
  list.sort(range === 'all' ? function (a, b) { return byDateAsc(b, a); } : byDateAsc);
  return list;
}

/**
 * 业绩导入预览表 + 确认/返回按钮（三期 3.0d 从桌面导入卡原样抽出共用，C4）：
 * 桌面「导入业绩」卡与移动速记首屏卡渲染逐字节一致。
 */

function findPeriodConflict(dateStr, periodsStr, excludeInstId) {
  const cal = getActiveCalendar();
  if (!cal) return null;
  const target = periodRangeOf(periodsStr, periodCountOf(cal));
  if (!target) return null;   // 脏数据静默放行
  for (let i = 0; i < state.instances.length; i++) {
    const inst = state.instances[i];
    if (inst.id === excludeInstId) continue;          // 排除自身
    if (inst.calendarId !== cal.id || inst.date !== dateStr) continue;
    const pr = periodRangeOf(inst.periods, periodCountOf(cal));
    if (!pr) continue;                                // 候选脏数据跳过
    if (pr.start <= target.end && target.start <= pr.end) {
      const course = state.courses.find(function (c) { return c.id === inst.courseId; });
      return { inst: inst,
        courseName: course ? course.name : '未知课程',
        canceled: inst.status === 'canceled' };
    }
  }
  return null;
}

/**
 * 动态 id 白名单（插单 1.15 子项③，B.6 #5 降级措施）：凡动态拼接进 id 属性的实体 id
 * （c-2 / i-999 / 2026-09 等系统发号值）仅允许字母、数字、连字符、下划线；
 * 含引号/空白/尖括号等特殊字符的脏 id（脏导入/手改存储）一律视为非法，
 * 动态绑定与读取点直接跳过——防恶意 id 逃逸出属性串。渲染侧已有 escapeHtml，此为纵深防线。
 */


/* ============================================================
   四期③ 数据健康检查（2026-09-19 交付；只读扫描，零写入零修复——
   纯函数 runDataHealthCheck 供数据面板展示与沙盒断言共用）。
   检查口径全部复用既有数据层防线同标准：悬空引用与 countDanglingRefs
   同构、脏 id 与 isSafeElId 同口径、校历异常与 buildExpandPlan 合法校历
   判据同标准、流水不变式与附录A §7 四条一一对应、重复排课项与 pasteEntryKey
   去重键同构。结果分级：error（结构损坏）/ warn（引用与不变式）/ info（提示）。
   ============================================================ */

function runDataHealthCheck() {
  const findings = [];
  const add = function (level, area, message, hint) {
    findings.push({ level: level, area: area, message: message, hint: hint });
  };

  /* ① 悬空引用（口径与导入预览 countDanglingRefs 一致，本地 state 全表扫描） */
  // W2-C #61：id 集统一无原型对象，防 __proto__ 等键污染（防原型污染同口径）
  const courseIds = Object.create(null), calIds = Object.create(null),
    entryIds = Object.create(null), catIds = Object.create(null);
  state.courses.forEach(function (r) { if (r && r.id !== undefined) courseIds[r.id] = true; });
  state.calendars.forEach(function (r) { if (r && r.id !== undefined) calIds[r.id] = true; });
  state.entries.forEach(function (r) { if (r && r.id !== undefined) entryIds[r.id] = true; });
  state.achievementCategories.forEach(function (r) {
    if (r && r.id !== undefined) catIds[r.id] = true; });
  state.instances.forEach(function (x) {
    if (!x) return;
    if (x.entryId && !entryIds[x.entryId]) {
      add('warn', '授课流水', '流水 ' + x.id + ' 引用的排课项 ' + x.entryId + ' 不存在（entryId 悬空）',
        '若来源排课项已删除属正常留痕可忽略；否则请经「数据」面板核对导入备份。');
    }
    if (x.courseId && !courseIds[x.courseId]) {
      add('warn', '授课流水', '流水 ' + x.id + ' 引用的课程 ' + x.courseId + ' 不存在',
        '请经「数据」面板核对导入备份。');
    }
    if (x.calendarId && !calIds[x.calendarId]) {
      add('warn', '授课流水', '流水 ' + x.id + ' 引用的校历 ' + x.calendarId + ' 不存在',
        '请经「数据」面板核对导入备份。');
    }
  });
  state.entries.forEach(function (x) {
    if (!x) return;
    if (x.courseId && !courseIds[x.courseId]) {
      add('warn', '排课项', '排课项 ' + x.id + ' 引用的课程 ' + x.courseId + ' 不存在',
        '请经「数据」面板核对导入备份。');
    }
    if (x.calendarId && !calIds[x.calendarId]) {
      add('warn', '排课项', '排课项 ' + x.id + ' 引用的校历 ' + x.calendarId + ' 不存在',
        '请经「数据」面板核对导入备份。');
    }
  });
  state.achievements.forEach(function (x) {
    if (!x) return;
    if (x.categoryId && !catIds[x.categoryId]) {
      add('warn', '业绩条目', '业绩 ' + x.id + ' 引用的分类 ' + x.categoryId + ' 不存在（条目失去归属）',
        '请在业绩面板删除该条目或改挂既有分类。');
    }
  });

  /* ② 脏 id（isSafeElId 同口径：动态绑定点已自动跳过，建议清理；四期④b：ID 表清单收口走 ALL_ID_TABLES） */
  ALL_ID_TABLES.forEach(function (t) {
    if (!Array.isArray(state[t])) return;
    state[t].forEach(function (r) {
      if (r && typeof r.id === 'string' && !isSafeElId(r.id)) {
        add('warn', '数据表 ' + t,
          '记录 id「' + r.id.slice(0, 24) + '…」含特殊字符，动态操作按钮已自动跳过',
          '建议经「数据」面板导出后人工修正再合并导入。');
      }
    });
  });

  /* ③ 校历结构异常（与 buildExpandPlan 合法校历判据同标准） */
  state.calendars.forEach(function (c) {
    if (!c) return;
    const nm = '「' + (c.name || c.id) + '」';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) {
      add('error', '校历', '校历' + nm + '起始日格式损坏：' + c.startDate,
        '请到「校历」面板编辑修复起始日（须为周一）。');
    } else if (!isMondayAnchor(c.startDate)) {
      add('error', '校历', '校历' + nm + '起始日 ' + c.startDate + ' 不是周一（周次锚点失效）',
        '请到「校历」面板改回周一（第 1 周第 1 天）。');
    }
    if (!(Number.isInteger(c.totalWeeks) && c.totalWeeks >= 1)) {
      add('error', '校历', '校历' + nm + '总周数非法：' + c.totalWeeks,
        '请到「校历」面板编辑为 1–30 的整数。');
    }
    if (!Array.isArray(c.breaks)) {
      add('error', '校历', '校历' + nm + '停课周数据损坏（非数组）',
        '请到「校历」面板重新勾选停课周。');
    }
  });

  /* ④ 同表重复 id（D7）与计数器低于全局最大序号（防撞号） */
  let maxId = 0;
  ALL_ID_TABLES.forEach(function (t) {
    if (!Array.isArray(state[t])) return;
    const seen = Object.create(null);   // W2-C #61
    state[t].forEach(function (r) {
      if (!r || typeof r.id !== 'string') return;
      if (seen[r.id]) {
        add('error', '数据表 ' + t, '记录 id「' + r.id + '」在同一表内重复出现',
          '请经「数据」面板导出后人工去重再合并导入。');
      }
      seen[r.id] = true;
      const m = r.id.match(/-(\d+)$/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    });
  });
  if (Number.isFinite(state.settings.instanceCounter) &&
      state.settings.instanceCounter < maxId) {
    add('error', '计数器',
      'id 计数器（' + state.settings.instanceCounter + '）低于全局最大序号（' + maxId +
      '），后续新记录可能撞号',
      '保存或导入数据一次即可自动抬升；如持续出现请导出备份后重启应用。');
  }

  /* ⑤ 流水不变式（附录A §7 四条一一核对） */
  state.instances.forEach(function (x) {
    if (!x) return;
    if (x.status === 'moved' && !x.movedFromDate) {
      add('warn', '授课流水', '记录 ' + x.id + ' 状态为调课但缺少原日期',
        '该记录留痕不完整；可在「课表」今日清单对该次课重新调课补留痕。');
    }
    if (x.settledHours !== null && x.settledHours !== undefined && !x.settleMode) {
      add('warn', '授课流水', '记录 ' + x.id + ' 有结算学时但未标注来源',
        '该记录来源标注缺失；请到「统计」面板核对结算值来源。');
    }
    if (x.source === 'manual' && x.status !== 'makeup') {
      add('warn', '授课流水', '记录 ' + x.id + ' 为手动记录但状态不是补课',
        '状态与来源不一致；请到「课表」今日清单检查该记录。');
    }
    if (x.frozen && !x.overrideNote) {
      add('warn', '授课流水', '记录 ' + x.id + ' 已被手动改动但无留痕说明',
        '缺少修改原因留痕；请补填原因或经 JSON 备份修正。');
    }
  });

  /* ⑤乙 规则阶梯重叠（W1 #22，2026-09-19 问题列表裁决）：表单已拒重叠档（panels #23），
     导入脏数据由 computeSettledHours 按「第一匹配档」确定性消化，此处只读提示修正 */
  state.rules.forEach(function (r) {
    if (!r || !r.content || !Array.isArray(r.content.tiers)) return;
    const tiers = r.content.tiers;
    let hit = false;
    for (let i = 0; i < tiers.length && !hit; i++) {
      for (let j = i + 1; j < tiers.length; j++) {
        const a = tiers[i], b = tiers[j];
        if (a && b && Number.isFinite(a.min) && Number.isFinite(a.max) &&
            Number.isFinite(b.min) && Number.isFinite(b.max) &&
            a.min <= b.max && b.min <= a.max) {
          add('warn', '规则', '规则 v' + (r.version || '?') + '（' + r.id + '）阶梯档第 ' +
            (i + 1) + ' 档（' + a.min + '–' + a.max + '）与第 ' + (j + 1) + ' 档（' +
            b.min + '–' + b.max + '）人数区间重叠',
            '结算按档位表中先匹配的一档计算；建议到「规则」面板复制本版修正后另存新版本。');
          hit = true;
          break;
        }
      }
    }
  });

  /* ⑥ 重复排课项（pasteEntryKey 同键）与零流水提示（合法校历内应有生成流水却没有） */
  const seenEntryKeys = Object.create(null);   // W2-C #61
  state.entries.forEach(function (en) {
    if (!en) return;
    const weeks = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
      ? en.weekPattern.weeks : [];
    const key = pasteEntryKey(en.courseId, en.weekday, en.periodStart, en.periodEnd, weeks);
    if (seenEntryKeys[key]) {
      add('info', '排课项',
        '存在完全同键的重复排课项：课程 ' + en.courseId + ' · 周' + en.weekday +
        ' · 第 ' + en.periodStart + '-' + en.periodEnd + ' 节 · 周次列表相同',
        '如系误建，请到「排课」面板用「删除」按钮清理（弹窗会说明级联范围）。');
    }
    seenEntryKeys[key] = true;
  });
  const healthyCalBreaks = Object.create(null);   // W2-C #61
  state.calendars.forEach(function (c) {
    if (!c) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) return;
    if (!isMondayAnchor(c.startDate)) return;
    if (!(Number.isInteger(c.totalWeeks) && c.totalWeeks >= 1)) return;
    healthyCalBreaks[c.id] = Array.isArray(c.breaks) ? c.breaks : [];
  });
  state.entries.forEach(function (en) {
    if (!en) return;
    const breaks = healthyCalBreaks[en.calendarId];
    if (!breaks) return;   // 校历异常已由 ③ 报告，此处不重复
    const cal = state.calendars.find(function (c) { return c.id === en.calendarId; });
    const weeks = (en.weekPattern && Array.isArray(en.weekPattern.weeks))
      ? en.weekPattern.weeks : [];
    const expect = weeks.some(function (w) {
      return Number.isInteger(w) && w >= 1 && w <= cal.totalWeeks && breaks.indexOf(w) < 0;
    });
    if (!expect) return;   // 全部周次越界或都在停课周内：本就不该有流水
    const has = state.instances.some(function (x) {
      return x && x.entryId === en.id && x.source === 'generated';
    });
    if (!has) {
      add('info', '排课项', '排课项 ' + en.id + ' 在合法周次内但没有任何生成流水',
        '请到「排课」面板点「重新展开」同步（如刚录入尚未展开请忽略）。');
    }
  });

  return findings;
}
