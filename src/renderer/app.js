/* 戒烟小助手 — 渲染进程逻辑 */

const DEFAULTS = {
  quitAt: null,        // ISO string，戒烟开始时间
  cigsPerDay: 10,      // 每天吸烟支数
  packPrice: 20,       // 每包价格
  cigsPerPack: 20,     // 每包支数
  lifeMinPerCig: 11,   // 每支烟缩短寿命分钟数
  dailyGoal: 6,        // 每日烟瘾打卡目标（波）
  pinned: true,
  cravings: [],        // [{at: ISO}] 战胜烟瘾记录
  badgesSeen: [],      // 已弹过一次提示的徽章 id
};

// 健康里程碑（分钟）
const MILESTONES = [
  { min: 20,        icon: "❤️", name: "心率和血压恢复正常" },
  { min: 60 * 12,   icon: "🫁", name: "血液中一氧化碳减半，含氧量提升" },
  { min: 60 * 24,   icon: "🚶", name: "一天无烟，心脏病风险开始下降" },
  { min: 60 * 48,   icon: "👅", name: "味觉和嗅觉开始恢复" },
  { min: 60 * 72,   icon: "🌬️", name: "支气管放松，呼吸更顺畅" },
  { min: 60 * 24 * 7,  icon: "💪", name: "一周达成！咳嗽和气短减少" },
  { min: 60 * 24 * 30, icon: "🚴", name: "一个月：循环系统改善，运动更轻松" },
  { min: 60 * 24 * 90, icon: "✨", name: "三个月：肺功能显著提升" },
  { min: 60 * 24 * 365, icon: "🏆", name: "一年：心脏病风险降低一半" },
];

let state = { ...DEFAULTS };

// 成就徽章（unlock: 传入统计值返回是否达成）
const BADGES = [
  { id: "first-urge",  icon: "🥊", name: "首胜",       desc: "战胜第 1 波烟瘾",        test: (s) => s.totalUrge >= 1 },
  { id: "urge-10",     icon: "🔥", name: "十连扛",     desc: "累计战胜 10 波烟瘾",     test: (s) => s.totalUrge >= 10 },
  { id: "urge-50",     icon: "⚡", name: "瘾头克星",   desc: "累计战胜 50 波烟瘾",     test: (s) => s.totalUrge >= 50 },
  { id: "urge-100",    icon: "👑", name: "百分斗士",   desc: "累计战胜 100 波烟瘾",    test: (s) => s.totalUrge >= 100 },
  { id: "day-1",       icon: "🌅", name: "无烟 24 小时", desc: "坚持满 1 天",          test: (s) => s.mins >= 1440 },
  { id: "week-1",      icon: "📅", name: "首周达成",   desc: "坚持满 7 天",            test: (s) => s.mins >= 10080 },
  { id: "month-1",     icon: "🌙", name: "满月无烟",   desc: "坚持满 30 天",           test: (s) => s.mins >= 43200 },
  { id: "cigs-100",    icon: "🚬", name: "少抽一百",   desc: "累计少抽 100 支",        test: (s) => s.cigs >= 100 },
  { id: "cigs-1000",   icon: "🏅", name: "千支斩",     desc: "累计少抽 1000 支",       test: (s) => s.cigs >= 1000 },
  { id: "money-100",   icon: "💰", name: "攒下一百元", desc: "累计省下 ¥100",          test: (s) => s.money >= 100 },
  { id: "money-1000",  icon: "💎", name: "千元大赏",   desc: "累计省下 ¥1000",         test: (s) => s.money >= 1000 },
  { id: "goal-day",    icon: "🎯", name: "目标达成者", desc: "单日完成打卡目标",       test: (s) => s.todayUrge >= state.dailyGoal },
];

const $ = (id) => document.getElementById(id);

/* ---------- 持久化 ---------- */
async function load() {
  try {
    const saved = await window.widget.loadState();
    if (saved) state = { ...DEFAULTS, ...saved };
  } catch (_) { /* 首次运行 */ }
  if (!state.quitAt) {
    state.quitAt = new Date().toISOString();
    await persist();
  }
}

let saveTimer = null;
async function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await window.widget.saveState(state); } catch (_) {}
  }, 300);
}

/* ---------- 计算 ---------- */
function minutesQuit() {
  return (Date.now() - new Date(state.quitAt).getTime()) / 60000;
}

function cigsAvoided() {
  return minutesQuit() / (24 * 60) * state.cigsPerDay;
}

function moneySaved() {
  return cigsAvoided() / state.cigsPerPack * state.packPrice;
}

function lifeGainedHours() {
  return cigsAvoided() * state.lifeMinPerCig / 60;
}

function todayUrgeCount() {
  const day = new Date().toDateString();
  return state.cravings.filter((c) => new Date(c.at).toDateString() === day).length;
}

function badgeStats() {
  return {
    mins: minutesQuit(),
    cigs: cigsAvoided(),
    money: moneySaved(),
    totalUrge: state.cravings.length,
    todayUrge: todayUrgeCount(),
  };
}

function fmtDuration(mins) {
  if (mins < 1) return "刚开始";
  const totalSec = Math.floor(mins * 60);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分 ${s}秒`;
  return `${m}分 ${s}秒`;
}

function fmtMilestoneTime(mins) {
  if (mins < 60) return `${mins} 分钟后`;
  if (mins < 1440) return `${(mins / 60).toFixed(0)} 小时后`;
  return `${(mins / 1440).toFixed(0)} 天后`;
}

/* ---------- 渲染 ---------- */
function renderDashboard() {
  const mins = minutesQuit();
  $("quitDuration").textContent = fmtDuration(mins);
  $("quitSince").textContent = "自 " + new Date(state.quitAt).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  $("moneySaved").textContent = "¥" + moneySaved().toFixed(2);
  $("cigsAvoided").textContent = Math.floor(cigsAvoided()).toLocaleString();
  $("lifeGained").textContent = Math.floor(lifeGainedHours()).toLocaleString();

  renderDailyGoal();
  renderMilestones(mins);
  checkBadges();
}

function renderDailyGoal() {
  const done = todayUrgeCount();
  const goal = Math.max(1, state.dailyGoal || 6);
  const hit = done >= goal;
  $("dailyGoalPill").textContent = `${done} / ${goal} 波`;
  $("goalFill").style.width = Math.min(100, (done / goal) * 100).toFixed(1) + "%";
  $("goalFill").classList.toggle("hit", hit);

  // 圆点指示
  const dots = $("goalDots");
  dots.innerHTML = "";
  const shown = Math.min(goal, 12);
  for (let i = 0; i < shown; i++) {
    const d = document.createElement("span");
    d.className = "goal-dot" + (i < done ? " on" : "");
    dots.appendChild(d);
  }

  $("goalHint").textContent = hit
    ? "🎉 今日目标已达成，明天继续保持！"
    : `再战胜 ${goal - done} 波烟瘾即达成今日目标`;
}

function renderBadges() {
  const s = badgeStats();
  const grid = $("badgeGrid");
  grid.innerHTML = "";
  let unlocked = 0;
  for (const b of BADGES) {
    const got = b.test(s);
    if (got) unlocked++;
    const cell = document.createElement("div");
    cell.className = "badge" + (got ? " unlocked" : "");
    cell.innerHTML = `
      <div class="badge-icon">${got ? b.icon : "🔒"}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    `;
    grid.appendChild(cell);
  }
  $("badgeCount").textContent = `${unlocked} / ${BADGES.length}`;
}

// 新徽章解锁时弹一次提示
function checkBadges() {
  const s = badgeStats();
  for (const b of BADGES) {
    if (b.test(s) && !state.badgesSeen.includes(b.id)) {
      state.badgesSeen.push(b.id);
      persist();
      showToast(`${b.icon} 解锁成就「${b.name}」`);
    }
  }
  renderBadges();
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

function renderMilestones(mins) {
  const box = $("milestones");
  box.innerHTML = "";
  for (const ms of MILESTONES) {
    const done = mins >= ms.min;
    const pct = done ? 100 : Math.max(2, (mins / ms.min) * 100);
    const row = document.createElement("div");
    row.className = "milestone" + (done ? " done" : "");
    row.innerHTML = `
      <div class="ms-icon">${ms.icon}</div>
      <div class="ms-body">
        <div class="ms-name">${ms.name}</div>
        <div class="ms-time">${done ? "已达成 ✓" : "预计 " + fmtMilestoneTime(ms.min)}</div>
        ${done ? "" : `<div class="ms-bar"><div class="ms-fill" style="width:${pct.toFixed(1)}%"></div></div>`}
      </div>
      <div class="ms-check">${done ? "✔" : ""}</div>
    `;
    box.appendChild(row);
  }
}

function renderCravings() {
  // 本周战胜数
  const weekAgo = Date.now() - 7 * 86400000;
  const_weekCount = state.cravings.filter((c) => new Date(c.at).getTime() >= weekAgo).length;
  $("weekCount").textContent = _weekCount;

  const list = $("cravingList");
  list.innerHTML = "";
  const recent = [...state.cravings].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
  if (recent.length === 0) {
    list.innerHTML = `<li class="empty">还没有记录。扛过一波烟瘾就点上面的按钮！</li>`;
  } else {
    for (const c of recent) {
      const li = document.createElement("li");
      li.innerHTML = `<span>👊 战胜了一次烟瘾</span><time>${new Date(c.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>`;
      list.appendChild(li);
    }
  }
}
let _weekCount = 0;

function renderSettings() {
  const dt = new Date(new Date(state.quitAt).getTime() - new Date(state.quitAt).getTimezoneOffset() * 60000);
  $("quitDateInput").value = dt.toISOString().slice(0, 16);
  $("perDayInput").value = state.cigsPerDay;
  $("packPriceInput").value = state.packPrice;
  $("perPackInput").value = state.cigsPerPack;
  $("lifePerCigInput").value = state.lifeMinPerCig;
  $("dailyGoalInput").value = state.dailyGoal;
}

/* ---------- 烟瘾 60 秒倒计时 ---------- */
let urgeActive = false;
function startUrgeCountdown() {
  if (urgeActive) return;
  urgeActive = true;
  const btn = $("urgeBtn");
  btn.disabled = true;
  const ring = $("urgeRing");
  const CIRC = 2 * Math.PI * 52; // 326.7
  ring.classList.add("active");
  let remain = 60;

  const tick = () => {
    $("urgeSub").textContent = `还剩 ${remain} 秒，坚持住`;
    ring.style.strokeDashoffset = (CIRC * (60 - remain)) / 60;
    if (remain <= 0) {
      urgeActive = false;
      btn.disabled = false;
      btn.textContent = "我扛住了！记录这次";
      $("urgeText").textContent = "干得漂亮 🎉";
      $("urgeSub").textContent = "这一波烟瘾已经过去";
      ring.classList.remove("active");
      state.cravings.push({ at: new Date().toISOString() });
      persist();
      renderCravings();
      renderDailyGoal();
      checkBadges();
      setStatus(`第 ${state.cravings.length} 次烟瘾已被你战胜`);
      setTimeout(() => {
        btn.textContent = "我在忍一波烟瘾";
        $("urgeText").textContent = "想抽烟？";
        $("urgeSub").textContent = "点一下，做 60 秒深呼吸";
        ring.style.strokeDashoffset = CIRC;
      }, 4000);
      return;
    }
    remain--;
    setTimeout(tick, 1000);
  };
  $("urgeText").textContent = "深呼吸…";
  tick();
}

/* 第二次点击（60 秒结束后按钮变为"记录"）已在倒计时归零时自动记录，
   此处按钮复位后再次点击即开始新一轮 */
$("urgeBtn").addEventListener("click", startUrgeCountdown);

/* ---------- 视图切换 ---------- */
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $("view-" + t.dataset.view).classList.add("active");
    if (t.dataset.view === "settings") renderSettings();
    if (t.dataset.view === "badges") renderBadges();
  });
});

/* ---------- 设置事件 ---------- */
function bindInput(id, key, cast) {
  $(id).addEventListener("change", () => {
    const v = cast($(id).value);
    if (Number.isFinite(v) && v >= 0) {
      state[key] = v;
      persist();
      setStatus("设置已保存");
    }
  });
}
bindInput("perDayInput", "cigsPerDay", Number);
bindInput("packPriceInput", "packPrice", Number);
bindInput("perPackInput", "cigsPerPack", (x) => Math.max(1, Number(x)));
bindInput("lifePerCigInput", "lifeMinPerCig", Number);
bindInput("dailyGoalInput", "dailyGoal", (x) => Math.max(1, Math.floor(Number(x))));

$("quitDateInput").addEventListener("change", () => {
  const d = new Date($("quitDateInput").value);
  if (!Number.isNaN(d.getTime())) {
    state.quitAt = d.toISOString();
    persist();
    setStatus("戒烟开始时间已更新");
  }
});

$("resetBtn").addEventListener("click", () => {
  if (confirm("确定从现在开始重新计时吗？打卡记录会保留。")) {
    state.quitAt = new Date().toISOString();
    persist();
    renderSettings();
    renderDashboard();
    setStatus("已重新开始计时，加油！");
  }
});

/* ---------- 窗口控制 ---------- */
$("minBtn").addEventListener("click", () => window.widget.minimize());
$("closeBtn").addEventListener("click", () => window.widget.quit());
$("pinBtn").addEventListener("click", () => {
  state.pinned = !state.pinned;
  $("pinBtn").classList.toggle("pinned", state.pinned);
  window.widget.togglePin(state.pinned);
  persist();
});

/* ---------- 状态栏 ---------- */
function setStatus(text) {
  $("statusText").textContent = text;
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => ($("statusText").textContent = "就绪"), 3000);
}

/* ---------- 启动 ---------- */
(async function init() {
  await load();
  $("pinBtn").classList.toggle("pinned", state.pinned);
  renderDashboard();
  renderCravings();
  setInterval(renderDashboard, 1000);
})();
