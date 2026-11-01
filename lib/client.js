window.__ModuleLoader__.load({ id: "@lucagiftzek/dsh-workspace-rail", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// src/palette.ts
var HUE_KEYS = ["slate", "teal", "amber", "rose", "indigo", "lime", "violet", "cyan"];
var HUES = {
  slate: { fill: "#2a3138", stripe: "#7d8b99", label: "Slate" },
  teal: { fill: "#1f3a37", stripe: "#4fb3a4", label: "Teal" },
  amber: { fill: "#3a3221", stripe: "#d3a84c", label: "Amber" },
  rose: { fill: "#3a2629", stripe: "#d47b8b", label: "Rose" },
  indigo: { fill: "#262a3d", stripe: "#7b8bdc", label: "Indigo" },
  lime: { fill: "#2b3524", stripe: "#93c46a", label: "Lime" },
  violet: { fill: "#322640", stripe: "#a98bd6", label: "Violet" },
  cyan: { fill: "#1f3238", stripe: "#5cb6cf", label: "Cyan" }
};
function hue(key) {
  const h = HUES[key] ?? HUES.slate;
  return { fill: h.fill, stripe: h.stripe };
}
var CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;
function stripeColor(key) {
  if (key !== void 0 && HUE_KEYS.includes(key)) return HUES[key].stripe;
  if (key !== void 0 && CSS_COLOR_RE.test(key)) return key;
  return HUES.slate.stripe;
}
function nextHue(usedKeys) {
  const used = new Set(usedKeys);
  for (const k of HUE_KEYS) if (!used.has(k)) return k;
  return HUE_KEYS[usedKeys.length % HUE_KEYS.length];
}

// src/sections.ts
function isSectionKey(v) {
  return v === "pinned" || v === "projects" || v === "recents";
}
function sectionView(layout, key) {
  if (layout.expandedSection !== null) {
    const expanded = layout.expandedSection === key;
    return { folded: !expanded, expanded };
  }
  return { folded: layout.collapsedSections.includes(key), expanded: false };
}
function toggleExpanded(layout, key) {
  return {
    collapsedSections: [...layout.collapsedSections],
    expandedSection: layout.expandedSection === key ? null : key
  };
}
function toggleFold(layout, key) {
  const view = sectionView(layout, key);
  const without = layout.collapsedSections.filter((k) => k !== key);
  const collapsedSections = view.folded ? without : [...without, key];
  return { collapsedSections, expandedSection: null };
}

// src/store.ts
var RAIL_SCHEMA_VERSION = 1;
var EMPTY_RAIL_STATE = {
  schemaVersion: RAIL_SCHEMA_VERSION,
  folders: {},
  folderOrder: [],
  projects: {},
  projectOrder: [],
  pinned: [],
  sessionFolders: {},
  memberships: {},
  stripes: {},
  docs: {},
  journal: [],
  importedSessionPinAt: null,
  stripeEdge: "right",
  sectionRows: { pinned: 6, projects: 4 },
  collapsedSections: [],
  expandedSection: null,
  binned: {},
  workingIndicator: "kitty",
  tabTitle: true
};
function createMemoryPersistence(initial = null) {
  let state = initial;
  return { load: () => state, save: (s) => {
    state = s;
  } };
}
function createLocalStoragePersistence(key) {
  const mem = createMemoryPersistence();
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? mem.load() : normalizeRailState(JSON.parse(raw));
      } catch {
        return mem.load();
      }
    },
    save(state) {
      mem.save(state);
      try {
        window.localStorage.setItem(key, JSON.stringify(state));
      } catch {
      }
    }
  };
}
function normalizeRailState(raw) {
  const src = raw ?? {};
  const folders = {};
  for (const [id, f] of Object.entries(src.folders ?? {})) {
    if (!f || typeof f.id !== "string" || typeof f.name !== "string") continue;
    folders[id] = {
      id,
      name: f.name,
      iconKind: f.iconKind === "emoji" ? "emoji" : "pixel",
      iconValue: typeof f.iconValue === "string" ? f.iconValue : "folder",
      iconTone: f.iconTone === "white" ? "white" : "black",
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      collapsed: f.collapsed === true
    };
  }
  const projects = {};
  for (const [id, p] of Object.entries(src.projects ?? {})) {
    if (!p || typeof p.id !== "string" || typeof p.name !== "string") continue;
    projects[id] = {
      id,
      name: p.name,
      hueKey: typeof p.hueKey === "string" ? p.hueKey : nextHue(Object.values(projects).map((x) => x.hueKey)),
      workspaceId: typeof p.workspaceId === "string" ? p.workspaceId : null,
      autoCarryover: p.autoCarryover === true,
      ...typeof p.dir === "string" && p.dir.length > 0 ? { dir: p.dir } : {},
      ...typeof p.instructions === "string" ? { instructions: p.instructions.slice(0, 2e4) } : {},
      ...typeof p.description === "string" ? { description: p.description.slice(0, 2e3) } : {},
      ...p.memory === true ? { memory: true } : {},
      ...p.strict === true ? { strict: true } : {},
      ...p.model !== null && typeof p.model === "object" && typeof p.model.provider === "string" && typeof p.model.model === "string" ? { model: { provider: p.model.provider, model: p.model.model, ...typeof p.model.reasoningEffort === "string" ? { reasoningEffort: p.model.reasoningEffort } : {} } } : {},
      ...p.archived === true ? { archived: true } : {}
    };
  }
  const memberships = {};
  for (const [sid, pid] of Object.entries(src.memberships ?? {})) {
    if (typeof sid === "string" && typeof pid === "string" && projects[pid] !== void 0) memberships[sid] = pid;
  }
  const stripes = {};
  for (const [eid, hk] of Object.entries(src.stripes ?? {})) {
    if (typeof eid === "string" && typeof hk === "string") stripes[eid] = hk;
  }
  const docs = {};
  for (const [did, d] of Object.entries(src.docs ?? {})) {
    if (!d || typeof d.id !== "string" || typeof d.projectId !== "string" || typeof d.name !== "string") continue;
    const kind = d.kind === "snippet" || d.kind === "data" ? d.kind : "document";
    docs[did] = { id: did, projectId: d.projectId, kind, name: d.name, pointer: typeof d.pointer === "string" ? d.pointer : "" };
  }
  const sessionFolders = {};
  for (const [sid, fid] of Object.entries(src.sessionFolders ?? {})) {
    if (typeof sid === "string" && typeof fid === "string" && folders[fid] !== void 0) sessionFolders[sid] = fid;
  }
  const binned = {};
  for (const [sid, at] of Object.entries(src.binned ?? {})) {
    if (typeof sid === "string" && typeof at === "number" && Number.isFinite(at)) binned[sid] = at;
  }
  const journal = (Array.isArray(src.journal) ? src.journal : []).filter((e) => e !== null && typeof e === "object" && typeof e.id === "string" && typeof e.inverse === "object");
  return {
    schemaVersion: RAIL_SCHEMA_VERSION,
    folders,
    folderOrder: (Array.isArray(src.folderOrder) ? src.folderOrder : []).filter((id) => typeof id === "string" && folders[id] !== void 0),
    projects,
    projectOrder: (Array.isArray(src.projectOrder) ? src.projectOrder : []).filter((id) => typeof id === "string" && projects[id] !== void 0),
    pinned: (Array.isArray(src.pinned) ? src.pinned : []).filter((id) => typeof id === "string"),
    sessionFolders,
    memberships,
    stripes,
    docs,
    journal,
    importedSessionPinAt: typeof src.importedSessionPinAt === "number" ? src.importedSessionPinAt : null,
    stripeEdge: src.stripeEdge === "left" ? "left" : "right",
    sectionRows: {
      pinned: clampRows(src.sectionRows?.pinned, 6),
      projects: clampRows(src.sectionRows?.projects, 4)
    },
    collapsedSections: (Array.isArray(src.collapsedSections) ? src.collapsedSections : []).filter((x) => x === "pinned" || x === "projects" || x === "recents"),
    expandedSection: isSectionKey(src.expandedSection) ? src.expandedSection : null,
    binned,
    workingIndicator: src.workingIndicator === "dots" || src.workingIndicator === "off" ? src.workingIndicator : "kitty",
    tabTitle: src.tabTitle !== false
  };
}
function clampRows(v, fallback) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(30, Math.max(1, n));
}
function createRailStore(persistence) {
  let state = persistence.load() ?? normalizeRailState(EMPTY_RAIL_STATE);
  const listeners = /* @__PURE__ */ new Set();
  const store = {
    getSnapshot: () => state,
    update(mutate) {
      const draft = normalizeRailState(state);
      mutate(draft);
      state = draft;
      persistence.save(state);
      for (const l of listeners) l();
      return state;
    },
    replace(next, persist = false) {
      state = normalizeRailState(next);
      if (persist) persistence.save(state);
      for (const l of listeners) l();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  return store;
}

// src/catalog.ts
function buildRecents(entries, opts) {
  const pinned = new Set(opts.pinnedIds);
  const includeBlank = opts.includeBlank ?? false;
  const rows = [];
  for (const e of entries) {
    if (!includeBlank && e.blank) continue;
    const projectId = opts.memberships[e.id];
    const project = projectId !== void 0 ? opts.projects[projectId] : void 0;
    const explicitStripe = opts.stripes[e.id];
    const repeat = pinned.has(e.id) ? "pinned" : project !== void 0 ? "project" : "none";
    const hueKey = explicitStripe ?? (project !== void 0 ? project.hueKey : void 0);
    rows.push({ ...e, repeat, hueKey });
  }
  return rows;
}

// src/recents-order.ts
function createActivityTracker(opts = {}) {
  const now = opts.now ?? Date.now;
  const cap = opts.cap ?? 500;
  const completed = /* @__PURE__ */ new Map();
  try {
    for (const [id, at] of Object.entries(opts.load?.() ?? {})) {
      if (typeof at === "number" && Number.isFinite(at)) completed.set(id, at);
    }
  } catch {
  }
  const lastRunning = /* @__PURE__ */ new Map();
  const lastPrompt = /* @__PURE__ */ new Map();
  const frozen = /* @__PURE__ */ new Map();
  const idleKey = (row) => Math.max(completed.get(row.id) ?? 0, row.updatedAt ?? 0);
  const persist = () => {
    if (opts.save === void 0) return;
    let entries = [...completed.entries()];
    if (entries.length > cap) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, cap);
      completed.clear();
      for (const [id, at] of entries) completed.set(id, at);
    }
    try {
      opts.save(Object.fromEntries(entries));
    } catch {
    }
  };
  return {
    observe(rows) {
      let stamped = false;
      const t = now();
      for (const row of rows) {
        const prev = lastRunning.get(row.id);
        if (prev === true && !row.running) {
          completed.set(row.id, Math.max(t, completed.get(row.id) ?? 0));
          frozen.delete(row.id);
          stamped = true;
        } else if (prev !== true && row.running && !frozen.has(row.id)) {
          frozen.set(row.id, idleKey({ ...row, updatedAt: lastPrompt.get(row.id) ?? row.updatedAt }));
        }
        lastRunning.set(row.id, row.running);
        if (!row.running) lastPrompt.set(row.id, row.updatedAt ?? 0);
      }
      if (stamped) persist();
      return stamped;
    },
    keyOf(row) {
      if (row.running) {
        const f = frozen.get(row.id);
        if (f !== void 0) return f;
        const c = completed.get(row.id);
        return c !== void 0 ? c : row.updatedAt ?? 0;
      }
      return idleKey(row);
    },
    completedAt: (id) => completed.get(id)
  };
}
function orderByActivity(items, keyOf) {
  return items.map((item, index) => ({ item, index, key: keyOf(item) })).sort((a, b) => b.key - a.key || a.index - b.index).map((x) => x.item);
}
function catalogSignature(catalog, currentId, binCount, running, limit = 400) {
  let sig = String(currentId) + "|" + catalog.length + "|bin" + binCount;
  for (let i = 0; i < catalog.length && i < limit; i++) {
    const e = catalog[i];
    sig += "|" + e.id + "" + e.title + (e.blank ? "" : "") + Math.floor((e.updatedAt ?? 0) / 6e4) + (running.has(e.id) ? "" : "");
  }
  return sig;
}

// src/search-docs.ts
function buildSearchDocs(entries, state, windows, now = Date.now()) {
  return entries.map((e, idx) => {
    const folderId = state.sessionFolders[e.id];
    const folder = folderId !== void 0 ? state.folders[folderId] : void 0;
    const projectId = state.memberships[e.id];
    const project = projectId !== void 0 ? state.projects[projectId] : void 0;
    const docNames = projectId !== void 0 ? Object.values(state.docs).filter((d) => d.projectId === projectId).map((d) => d.name) : [];
    const win = windows[e.id];
    return {
      id: e.id,
      title: e.title,
      folderNames: folder !== void 0 ? [folder.name] : [],
      projectTitle: project !== void 0 ? project.name : void 0,
      docNames,
      tags: [],
      firstMsgs: win?.f ?? [],
      lastMsgs: win?.l ?? [],
      lastUsed: now - idx * 6e4,
      pinned: state.pinned.includes(e.id) || state.sessionFolders[e.id] !== void 0 || state.memberships[e.id] !== void 0
    };
  });
}

// src/scoring.ts
var TIER_WEIGHTS = { title: 40, docs: 15, first: 8, last: 4 };
var RECENCY_HALF_LIFE_DAYS = 14;
var PINNED_BOOST = 1.2;
var includes = (haystacks, needle) => haystacks.some((h) => typeof h === "string" && h.toLowerCase().includes(needle));
function matchTier(doc, query) {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return null;
  if (includes([doc.title, ...doc.folderNames, ...doc.projectTitle !== void 0 ? [doc.projectTitle] : []], q)) return 1;
  if (includes([...doc.docNames, ...doc.tags], q)) return 2;
  if (includes(doc.firstMsgs, q)) return 3;
  if (includes(doc.lastMsgs, q)) return 4;
  return null;
}
function recencyDecay(lastUsed, now, halfLifeDays = RECENCY_HALF_LIFE_DAYS) {
  if (!Number.isFinite(lastUsed) || !Number.isFinite(now) || now <= lastUsed) return 1;
  const ageDays = (now - lastUsed) / 864e5;
  return Math.pow(0.5, ageDays / halfLifeDays);
}
function scoreDoc(doc, query, now) {
  const tier = matchTier(doc, query);
  if (tier === null) return null;
  const weight = tier === 1 ? TIER_WEIGHTS.title : tier === 2 ? TIER_WEIGHTS.docs : tier === 3 ? TIER_WEIGHTS.first : TIER_WEIGHTS.last;
  const score = weight * recencyDecay(doc.lastUsed, now) * (doc.pinned ? PINNED_BOOST : 1);
  return { id: doc.id, score, tier };
}
function rankResults(docs, query, now) {
  const hits = [];
  for (const d of docs) {
    const hit = scoreDoc(d, query, now);
    if (hit !== null) hits.push({ ...hit, lastUsed: d.lastUsed });
  }
  hits.sort((a, b) => b.score !== a.score ? b.score - a.score : b.lastUsed - a.lastUsed);
  return hits.map(({ id, score, tier }) => ({ id, score, tier }));
}

// src/virtual-list.ts
function computeWindow(input) {
  const { scrollTop, viewportHeight, rowHeight, total } = input;
  const overscan = Math.max(0, input.overscan ?? 4);
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + visible + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: Math.max(0, (total - end) * rowHeight) };
}
var raf = (cb) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
  else setTimeout(cb, 16);
};
var VirtualList = class {
  viewport;
  sizer;
  band;
  opts;
  scheduled = false;
  lastScrollAt = 0;
  lastRange = { start: -1, end: -1, padTop: 0, padBottom: 0 };
  constructor(host, opts) {
    this.opts = opts;
    this.viewport = document.createElement("div");
    if (opts.className !== void 0) this.viewport.className = opts.className;
    if (opts.keepKey !== void 0) this.viewport.dataset.keep = opts.keepKey;
    this.viewport.style.position = "relative";
    this.viewport.style.setProperty("overflow-anchor", "none");
    this.sizer = document.createElement("div");
    this.sizer.style.position = "relative";
    this.sizer.style.width = "100%";
    this.sizer.style.setProperty("overflow-anchor", "none");
    this.band = document.createElement("div");
    this.band.style.position = "absolute";
    this.band.style.left = "0";
    this.band.style.right = "0";
    this.band.style.top = "0";
    this.band.style.setProperty("overflow-anchor", "none");
    this.sizer.appendChild(this.band);
    this.viewport.appendChild(this.sizer);
    host.appendChild(this.viewport);
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
    this.refresh();
  }
  onScroll = () => {
    this.lastScrollAt = Date.now();
    if (this.scheduled) return;
    this.scheduled = true;
    raf(() => {
      this.scheduled = false;
      this.refresh(false);
    });
  };
  /** True while the user is actively scrolling (a host redraw should wait). */
  get scrolling() {
    return Date.now() - this.lastScrollAt < 250;
  }
  /** Re-render the current window (force=true also after count/content changes). */
  refresh(force = true) {
    const total = this.opts.count();
    const range = computeWindow({
      scrollTop: this.viewport.scrollTop,
      viewportHeight: this.viewport.clientHeight,
      rowHeight: this.opts.rowHeight,
      overscan: this.opts.overscan,
      total
    });
    const totalPx = String(total * this.opts.rowHeight) + "px";
    if (this.sizer.style.height !== totalPx) this.sizer.style.height = totalPx;
    if (!force && range.start === this.lastRange.start && range.end === this.lastRange.end) return range;
    this.lastRange = range;
    this.band.style.transform = "translateY(" + String(range.padTop) + "px)";
    const rows = [];
    for (let i = range.start; i < range.end; i++) {
      const row = this.opts.renderRow(i);
      if (row !== null) rows.push(row);
    }
    this.band.replaceChildren(...rows);
    return range;
  }
  /** The last computed window (for assertions and diagnostics). */
  get range() {
    return this.lastRange;
  }
  destroy() {
    this.viewport.removeEventListener("scroll", this.onScroll);
    this.viewport.remove();
  }
};

// src/rail-style.ts
var P = "div.__dsh-workspace-rail__";
var L = "div.__dsh-workspace-rail-launcher__";
var PIN_FOOTER = "button.__dsh-session-pin-footer__";
var RAIL_CSS = `
${P}{
  --wr-fg:var(--dsw-alias-label-primary,#e6edf3);
  --wr-fg2:var(--dsw-alias-label-secondary,#c9d1d9);
  --wr-muted:var(--dsw-alias-label-tertiary,#8b949e);
  --wr-faint:var(--dsw-alias-label-caption,#6b7686);
  --wr-line:var(--dsw-alias-border-l2,#30363d);
  --wr-line-soft:var(--dsw-alias-border-l1,#21262d);
  --wr-hover:var(--dsw-alias-interactive-bg-hover,#ffffff14);
  --wr-active:var(--dsw-alias-interactive-bg-active,#ffffff24);
  --wr-field:var(--dsw-alias-bg-layer-2,#10151b);
  --wr-raised:var(--dsw-alias-bg-layer-2,#1f2428);
  --wr-accent:var(--tz-accent,var(--dsw-alias-link,#4d93f8));
  --wr-accent-2:var(--tz-accent-2,var(--dsw-alias-link,#4d93f8));
  --wr-on-accent:var(--tz-on-accent,#fff);
  --wr-display:var(--tz-font-display,inherit);
  --wr-mono:var(--tz-font-mono,var(--ds-font-family-code,ui-monospace,monospace));
  --wr-r:var(--tz-radius,6px);
  --wr-shadow:var(--tz-shadow-pop,0 8px 24px rgba(0,0,0,.28));
  --wr-ease:var(--tz-ease,cubic-bezier(.2,.7,.3,1));
  --wr-unread:#1f6feb;
  display:flex;flex-direction:column;min-height:0;overflow:hidden;
  color:var(--wr-fg);font-size:13px;line-height:1.35;
}
${P}.wr-embedded{position:relative;flex:1 1 auto;height:100%;background:transparent;}
${P}.wr-floating{position:fixed;top:48px;left:12px;bottom:48px;width:300px;z-index:1001;
  background:var(--dsw-alias-bg-layer-1,#161b22);border:1px solid var(--wr-line);border-radius:10px;box-shadow:var(--wr-shadow);}
${L}{position:fixed;bottom:12px;left:12px;z-index:1002;padding:4px 10px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2,#30363d);background:var(--dsw-alias-bg-layer-2,#1f2428);
  color:var(--dsw-alias-label-tertiary,#8b949e);font-size:11.5px;cursor:pointer;user-select:none;}
${P} button{font:inherit;}

/* ---- head: view switch + search ---- */
${P} .wr-head{display:flex;flex-direction:column;gap:8px;padding:2px 12px 10px;flex:none;}
${P} .wr-seg{display:flex;border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:2px;gap:2px;}
${P} .wr-seg button{all:unset;flex:1;text-align:center;cursor:pointer;padding:3px 0;border-radius:calc(var(--wr-r) - 2px);
  font-family:var(--wr-display);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--wr-muted);
  transition:background .15s var(--wr-ease),color .15s var(--wr-ease);}
${P} .wr-seg button:hover{color:var(--wr-fg);}
${P} .wr-seg button[aria-pressed="true"]{background:var(--wr-accent);color:var(--wr-on-accent);}
${P} .wr-searchrow{display:flex;align-items:center;gap:6px;}
${P} .wr-search{flex:1;display:flex;align-items:center;gap:6px;min-width:0;height:30px;box-sizing:border-box;padding:0 8px;
  background:var(--wr-field);border:1px solid var(--wr-line);border-radius:var(--wr-r);
  transition:border-color .15s var(--wr-ease),box-shadow .15s var(--wr-ease);}
${P} .wr-search:focus-within{border-color:var(--wr-accent);box-shadow:0 0 0 1px var(--wr-accent);}
${P} .wr-search svg{flex:none;color:var(--wr-faint);}
${P} .wr-search input{all:unset;flex:1;min-width:0;font-size:12.5px;color:var(--wr-fg);}
${P} .wr-search input::placeholder{color:var(--wr-faint);}
${P} .wr-iconbtn{all:unset;flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;
  box-sizing:border-box;border-radius:var(--wr-r);color:var(--wr-muted);cursor:pointer;}
${P} .wr-iconbtn:hover,${P} .wr-iconbtn[aria-pressed="true"]{background:var(--wr-hover);color:var(--wr-fg);}

/* ---- body + sections ---- */
${P} .wr-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;}
${P}.wr-embedded .wr-body{overflow-y:hidden;}
${P} .wr-section{padding:4px 0 6px;flex:none;}
${P}.wr-embedded .wr-section.wr-grow{flex:1 1 auto;min-height:96px;display:flex;flex-direction:column;}
${P} .wr-results:empty{display:none;}
${P} .wr-label{display:flex;align-items:center;gap:6px;padding:6px 12px 4px 14px;
  font-family:var(--wr-display);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--wr-faint);}
${P} .wr-label .wr-count{font-family:var(--wr-mono);letter-spacing:0;text-transform:none;font-size:10.5px;}
${P} .wr-label .wr-add{margin-left:auto;all:unset;margin-left:auto;cursor:pointer;color:var(--wr-faint);
  width:20px;height:18px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--wr-r);font-size:14px;}
${P} .wr-label .wr-add:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-empty{padding:4px 14px 6px;color:var(--wr-faint);font-size:12px;}

/* ---- rows ---- */
${P} .wr-row{height:32px;display:flex;align-items:center;gap:8px;margin:0 6px;padding:0 6px 0 10px;position:relative;
  white-space:nowrap;border-radius:var(--wr-r);cursor:pointer;color:var(--wr-fg2);
  transition:background .12s var(--wr-ease),color .12s var(--wr-ease);}
${P} .wr-row:hover{background:var(--wr-hover);color:var(--wr-fg);}
${P} .wr-row.wr-current{background:var(--wr-active);color:var(--wr-fg);}
${P} .wr-row.wr-current::before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:2px;background:var(--wr-accent);}
${P} .wr-title{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}
${P} .wr-icon{flex:none;display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;color:var(--wr-muted);}
${P} .wr-badge{font-size:11px;color:var(--wr-faint);flex:none;font-variant-numeric:tabular-nums;}
[data-ds-dark-theme] ${P}{--wr-unread:#4c9aff;}
/* Unread reply: a fixed-size blue dot in the row's flow (never over the time, pin or kitty). */
${P} .wr-unread{flex:none;width:7px;height:7px;border-radius:50%;background:var(--wr-unread);margin:0 1px;}
${P} .wr-time{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-faint);flex:none;font-variant-numeric:tabular-nums;}
${P} .wr-stripe{position:absolute;top:6px;bottom:6px;width:4px;}
${P}.edge-right .wr-stripe{right:0;}
${P}.edge-left .wr-stripe{left:0;}
${P} .wr-dots{all:unset;cursor:pointer;color:var(--wr-faint);flex:none;width:20px;height:22px;display:inline-flex;
  align-items:center;justify-content:center;border-radius:var(--wr-r);}
${P} .wr-row .wr-dots{opacity:0;}
${P} .wr-row:hover .wr-dots,${P} .wr-row .wr-dots[aria-expanded="true"]{opacity:1;}
${P} .wr-row:hover .wr-time{display:none;}
${P} .wr-dots:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-proj{color:var(--wr-fg);}
${P} .wr-scroller{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}
${P} .wr-vl{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}
${P}.wr-floating .wr-vl{max-height:420px;}

/* ---- menus ---- */
${P} .wr-menu{position:absolute;right:6px;top:30px;z-index:20;background:var(--wr-raised);
  border:1px solid var(--dsw-alias-border-l3,var(--wr-line));border-radius:var(--wr-r);padding:4px;min-width:170px;box-shadow:var(--wr-shadow);}
${P} .wr-menu button{all:unset;display:block;width:100%;box-sizing:border-box;cursor:pointer;padding:6px 8px;
  border-radius:calc(var(--wr-r) - 2px);font-size:12.5px;color:var(--wr-fg);}
${P} .wr-menu button:hover{background:var(--wr-hover);}

/* ---- inline rename ---- */
${P} input.wr-rename{all:unset;flex:1;min-width:0;box-sizing:border-box;height:24px;padding:0 6px;font-size:13px;
  color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-accent);border-radius:var(--wr-r);cursor:text;}
${P} input.wr-rename::selection{background:color-mix(in srgb,var(--wr-accent) 40%,transparent);}
${P} input.wr-rename.wr-rename-error{border-color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-row:has(input.wr-rename) .wr-time,${P} .wr-row:has(input.wr-rename) .wr-dots{display:none;}

/* ---- stripe swatch picker (inside menus) ---- */
${P} .wr-swatches{padding:6px 8px 4px;border-top:1px solid var(--wr-line-soft);margin-top:2px;}
${P} .wr-swcap{font-size:11px;color:var(--wr-muted);margin-bottom:6px;}
${P} .wr-swgrid{display:grid;grid-template-columns:repeat(9,16px);gap:5px;}
${P} .wr-menu button.wr-sw{all:unset;box-sizing:border-box;width:16px;height:16px;cursor:pointer;padding:0;
  border:1px solid color-mix(in srgb,var(--wr-fg) 18%,transparent);transition:transform .1s var(--wr-ease);}
${P} .wr-menu button.wr-sw:hover{transform:scale(1.15);background-color:inherit;}
${P} .wr-menu button.wr-sw[aria-pressed="true"]{outline:2px solid var(--wr-fg);outline-offset:1px;}
${P} .wr-menu button.wr-sw-none{background:linear-gradient(135deg,transparent 45%,var(--wr-muted) 45% 55%,transparent 55%);}

/* ---- forms ---- */
${P} .wr-form{display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 8px;}
${P} .wr-form input,${P} .wr-form select{all:unset;box-sizing:border-box;height:28px;background:var(--wr-field);
  border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:0 8px;font-size:12px;color:var(--wr-fg);}
${P} .wr-form input:focus,${P} .wr-form select:focus{border-color:var(--wr-accent);}
${P} .wr-form .wr-go,${P} .wr-go{all:unset;cursor:pointer;background:var(--wr-accent);color:var(--wr-on-accent);
  border-radius:var(--wr-r);padding:0 12px;height:28px;display:inline-flex;align-items:center;font-size:12px;
  box-shadow:var(--tz-shadow-btn,none);}
${P} .wr-form .wr-cancel,${P} .wr-cancel{all:unset;cursor:pointer;border:1px solid var(--wr-line);color:var(--wr-muted);
  border-radius:var(--wr-r);padding:0 12px;height:28px;display:inline-flex;align-items:center;font-size:12px;}
${P} .wr-cancel:hover{color:var(--wr-fg);}

/* ---- search results ---- */
${P} .wr-results .wr-row{cursor:pointer;}
${P} .wr-tier{flex:none;font-family:var(--wr-mono);font-size:9.5px;font-weight:600;color:var(--wr-accent-2);
  border:1px solid var(--wr-line);border-radius:3px;padding:0 4px;line-height:15px;}

/* ---- carryover plan / config / footer ---- */
${P} .wr-plan{margin:6px 12px;border:1px solid var(--wr-line);border-radius:var(--wr-r);padding:8px 10px;background:var(--wr-field);}
${P} .wr-planhead{font-weight:600;font-size:12px;color:var(--wr-accent-2);}
${P} .wr-plannote{color:var(--wr-muted);font-size:12px;margin:4px 0;}
${P} .wr-planlist{max-height:160px;overflow-y:auto;}
${P} .wr-planrow{font-size:12px;color:var(--wr-fg);padding:1px 0;word-break:break-all;}
${P} .wr-planremove{color:var(--dsw-alias-state-error-primary,#d47b8b);}
${P} .wr-config{margin:0 12px 8px;padding:8px 10px;border:1px solid var(--wr-line);border-radius:var(--wr-r);flex:none;}
${P} .wr-cfglabel{font-size:11.5px;color:var(--wr-muted);margin-right:6px;}
${P} .wr-footer{display:flex;align-items:center;gap:8px;padding:6px 14px;border-top:1px solid var(--wr-line-soft);
  color:var(--wr-faint);font-size:11px;flex:none;font-family:var(--wr-mono);}
${P} .wr-footer .wr-dots{margin-left:auto;width:auto;padding:0 6px;font-family:inherit;}
${P} .wr-autolabel{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--wr-fg);cursor:pointer;}

/* ---- project drawer: an in-rail view, not a floating card ---- */
${P} .wr-drawer{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;
  background:var(--tz-sidebar-bg,var(--dsw-alias-bg-layer-1,#161b22));color:var(--wr-fg);
  animation:wr-in .18s var(--wr-ease);}
${P}.wr-floating .wr-drawer{border-radius:inherit;}
@keyframes wr-in{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}
${P} .wr-drawer .wr-dhead{display:flex;align-items:center;gap:8px;padding:2px 8px 10px 6px;position:relative;
  border-bottom:1px solid var(--wr-line-soft);flex:none;}
${P} .wr-drawer .wr-dclose{all:unset;cursor:pointer;color:var(--wr-muted);width:28px;height:28px;display:inline-flex;
  align-items:center;justify-content:center;font-size:15px;border-radius:var(--wr-r);flex:none;}
${P} .wr-drawer .wr-dclose:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-pswatch{width:10px;height:10px;flex:none;}
${P} .wr-ptitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:14px;}
${P} .wr-dhead .wr-rename{height:28px;font-size:14px;}
${P} .wr-dhead .wr-menu{top:34px;}
${P} .wr-drawer .wr-dbody{flex:1;overflow-y:auto;padding:4px 0 12px;}
${P} .wr-psection{padding:8px 0 4px;}
${P} .wr-psection+.wr-psection{border-top:1px solid var(--wr-line-soft);margin-top:6px;}
${P} .wr-plabel{display:flex;align-items:center;gap:8px;padding:2px 14px 6px;font-family:var(--wr-display);font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--wr-faint);}
${P} .wr-plabel .wr-count{font-family:var(--wr-mono);letter-spacing:0;font-size:10.5px;}
${P} .wr-pactions{display:flex;gap:6px;padding:8px 12px 2px;}
${P} .wr-pbtn{all:unset;cursor:pointer;height:28px;padding:0 10px;display:inline-flex;align-items:center;font-size:12px;
  color:var(--wr-fg2);border:1px solid var(--wr-line);border-radius:var(--wr-r);}
${P} .wr-pbtn:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-pbtn-primary{background:var(--wr-accent);border-color:var(--wr-accent);color:var(--wr-on-accent);box-shadow:var(--tz-shadow-btn,none);}
${P} .wr-pbtn-primary:hover{background:var(--wr-accent);color:var(--wr-on-accent);filter:brightness(1.08);}
${P} .wr-picker{margin:8px 12px 0;border:1px solid var(--wr-line);border-radius:var(--wr-r);background:var(--wr-field);padding:6px;}
${P} .wr-picker .wr-pfield{margin:0 0 4px;width:100%;}
${P} .wr-pickerlist{max-height:220px;overflow-y:auto;}
${P} .wr-pickitem{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:8px;height:30px;padding:0 6px;
  cursor:pointer;border-radius:var(--wr-r);color:var(--wr-fg2);font-size:12.5px;}
${P} .wr-pickitem:hover{background:var(--wr-hover);color:var(--wr-fg);}
${P} .wr-pickplus{flex:none;color:var(--wr-accent);font-size:15px;width:14px;text-align:center;}
${P} input.wr-pfield{all:unset;box-sizing:border-box;display:block;width:calc(100% - 24px);margin:8px 12px 0;height:30px;padding:0 9px;
  font-size:12.5px;color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);border-radius:var(--wr-r);}
${P} input.wr-pfield::placeholder{color:var(--wr-faint);}
${P} input.wr-pfield:focus{border-color:var(--wr-accent);}
${P} .wr-phint{padding:4px 14px 0;font-size:11px;color:var(--wr-faint);}
${P} .wr-plink{all:unset;cursor:pointer;margin:8px 14px 0;font-size:11.5px;color:var(--dsw-alias-state-error-primary,#e0685a);display:block;}
${P} .wr-plink:hover{text-decoration:underline;}
${P} .wr-files{transition:background .12s var(--wr-ease),outline-color .12s var(--wr-ease);outline:1px dashed transparent;outline-offset:-4px;}
${P} .wr-files.wr-drop{background:color-mix(in srgb,var(--wr-accent) 8%,transparent);outline-color:var(--wr-accent);}
${P} .wr-row.wr-file{height:40px;}
${P} .wr-ficon{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--wr-mono);
  font-size:10px;color:var(--wr-muted);border:1px solid var(--wr-line);}
${P} .wr-ficon-data{color:var(--wr-accent-2);}
${P} .wr-ficon-snippet{color:var(--dsw-alias-state-success-primary,#4f9d69);}
${P} .wr-ficon-link{color:var(--wr-accent);}
${P} .wr-ftext{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25;}
${P} .wr-ftext .wr-title{flex:none;}
${P} .wr-fdir{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${P} .wr-missing .wr-title{color:var(--wr-muted);text-decoration:line-through;text-decoration-color:var(--wr-faint);}
${P} .wr-missing .wr-fdir{color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-toast{position:absolute;left:10px;right:10px;bottom:40px;z-index:30;display:flex;align-items:center;gap:10px;
  padding:8px 10px;font-size:12px;background:var(--dsw-alias-bg-layer-3,#2a2523);color:var(--wr-fg);
  border:1px solid var(--wr-line);box-shadow:var(--wr-shadow);animation:wr-in .16s var(--wr-ease);}
${P} .wr-toast button{all:unset;cursor:pointer;flex:none;color:var(--wr-accent);font-weight:600;}
${P} .wr-toast button:hover{text-decoration:underline;}

/* ---- sections: fixed header, own scroll list, drag handle ---- */
${P} .wr-fold{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:inherit;letter-spacing:inherit;
  text-transform:inherit;color:inherit;}
${P} .wr-fold:hover{color:var(--wr-fg);}
${P} .wr-chev{display:inline-block;font-family:system-ui,sans-serif;font-size:10px;transition:transform .15s var(--wr-ease);}
${P} .wr-collapsed .wr-chev{transform:rotate(-90deg);}
${P} .wr-slist{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}
${P} .wr-section.wr-pinned,${P} .wr-section.wr-projects{padding-bottom:0;}
/* In the sidebar, Pinned/Projects give way when space is short (their lists
   shrink and scroll); Recents always keeps at least four rows. */
${P}.wr-embedded .wr-section.wr-pinned,${P}.wr-embedded .wr-section.wr-projects{flex:0 1 auto;min-height:68px;overflow:hidden;display:flex;flex-direction:column;}
${P}.wr-embedded .wr-section.wr-collapsed{min-height:0;flex:none;}
${P} .wr-section>.wr-label,${P} .wr-section>.wr-form,${P} .wr-section>.wr-resize{flex:none;}
${P}.wr-embedded .wr-slist{flex:0 1 auto;min-height:32px;}
${P}.wr-embedded .wr-section.wr-grow{flex:1 1 0;min-height:152px;}
${P}.wr-embedded .wr-config{flex:none;}
${P} .wr-recents.wr-collapsed{flex:none;min-height:0;}
${P}.wr-embedded .wr-section.wr-grow.wr-collapsed{flex:none;min-height:0;}
/* ---- section expand: one section fills the sidebar, the others keep only their header row ---- */
${P} .wr-label .wr-expand{all:unset;flex:none;box-sizing:border-box;width:18px;height:18px;margin-left:-6px;margin-right:-2px;
  display:inline-flex;align-items:center;justify-content:center;border-radius:var(--wr-r);color:var(--wr-faint);cursor:pointer;}
${P} .wr-label .wr-expand:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-label .wr-expand[aria-expanded="true"]{color:var(--wr-accent);}
${P} .wr-label .wr-expand:focus-visible,${P} .wr-fold:focus-visible{outline:1px solid var(--wr-accent);outline-offset:1px;}
${P}.wr-embedded .wr-section.wr-expanded{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
${P} .wr-section.wr-expanded>.wr-slist{flex:1 1 auto;min-height:0;max-height:none;}
${P}.wr-floating .wr-section.wr-expanded>.wr-slist{max-height:520px;}
${P} .wr-resize{height:9px;margin:0 10px;cursor:row-resize;position:relative;touch-action:none;}
${P} .wr-resize::after{content:"";position:absolute;left:0;right:0;top:4px;height:1px;background:var(--wr-line-soft);
  transition:background .12s var(--wr-ease),height .12s var(--wr-ease),top .12s var(--wr-ease);}
${P} .wr-resize:hover::after,${P} .wr-resize.wr-dragging::after{background:var(--wr-accent);height:2px;top:3px;}
${P} .wr-resize.wr-dragging::before{content:attr(data-rows) " rows";position:absolute;right:0;top:-18px;font-family:var(--wr-mono);
  font-size:10px;color:var(--wr-on-accent);background:var(--wr-accent);padding:1px 5px;}
/* ---- drag-and-drop reorder ---- */
${P} .wr-row[draggable="true"]{-webkit-user-drag:element;}
${P} .wr-row.wr-dragsrc{opacity:.35;}
${P} .wr-row.wr-drop-before::after,${P} .wr-row.wr-drop-after::after{content:"";position:absolute;left:4px;right:4px;height:2px;background:var(--wr-accent);pointer-events:none;z-index:2;}
${P} .wr-row.wr-drop-before::after{top:-1px;}
${P} .wr-row.wr-drop-after::after{bottom:-1px;}
${P} .wr-row.wr-drop-into{background:var(--wr-active);box-shadow:inset 0 0 0 1px var(--wr-accent);}
${P} .wr-slist.wr-drop-end{box-shadow:inset 0 -2px 0 var(--wr-accent);}
${P} .wr-vl{overflow-anchor:none;}
/* ---- working indicator: pixel kitty / dots ---- */
${P} .wr-working{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--wr-accent);margin:0 2px;}
${P} .wr-kitty{position:relative;width:24px;height:12px;animation:wr-bob .36s steps(1,end) infinite;}
${P} .wr-kitty .wr-kf{position:absolute;left:0;bottom:1px;}
${P} .wr-kitty .wr-kf-a{animation:wr-fa .36s steps(1,end) infinite;}
${P} .wr-kitty .wr-kf-b{animation:wr-fb .36s steps(1,end) infinite;}
@keyframes wr-fa{0%{opacity:1}50%{opacity:0}}
@keyframes wr-fb{0%{opacity:0}50%{opacity:1}}
@keyframes wr-bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
${P} .wr-dots3{gap:3px;height:12px;}
${P} .wr-dots3 i{width:4px;height:4px;background:currentColor;display:block;animation:wr-dot 1s ease-in-out infinite;}
${P} .wr-dots3 i:nth-child(2){animation-delay:.16s;}
${P} .wr-dots3 i:nth-child(3){animation-delay:.32s;}
@keyframes wr-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion: reduce){
  ${P} .wr-kitty,${P} .wr-kitty .wr-kf-a,${P} .wr-dots3 i{animation:none;}
  ${P} .wr-kitty .wr-kf-b{display:none;}
}
/* ---- bin ---- */
${P} .wr-footer .wr-binbtn{margin-left:10px;}
${P} .wr-binrow{cursor:default;}
${P} .wr-binact{all:unset;cursor:pointer;flex:none;font-size:11.5px;padding:2px 6px;color:var(--wr-accent);border-radius:var(--wr-r);}
${P} .wr-binact:hover{background:var(--wr-hover);}
${P} .wr-bindel{color:var(--wr-faint);}
${P} .wr-bindel:hover{color:var(--dsw-alias-state-error-primary,#e0685a);}
${P} .wr-drawer .wr-phint{padding:8px 14px;}
/* ---- settings panel ---- */
${P} .wr-cfgrow{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px;}
${P} .wr-cfgrow .wr-cfglabel{margin:0;font-size:12px;color:var(--wr-fg2);}
${P} .wr-select{position:relative;display:inline-flex;align-items:center;}
${P} .wr-select select{all:unset;box-sizing:border-box;height:28px;min-width:92px;padding:0 28px 0 10px;font-size:12px;line-height:28px;
  color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);cursor:pointer;}
${P} .wr-select select:focus-visible{border-color:var(--wr-accent);}
${P} .wr-select::after{content:"";position:absolute;right:10px;top:50%;width:6px;height:6px;margin-top:-5px;pointer-events:none;
  border-right:1.5px solid var(--wr-muted);border-bottom:1.5px solid var(--wr-muted);transform:rotate(45deg);}
${P} .wr-select option{background:var(--dsw-alias-bg-layer-2,#221e1c);color:var(--wr-fg);}
${P} .wr-stepper{display:inline-flex;align-items:center;border:1px solid var(--wr-line);height:28px;}
${P} .wr-stepper button{all:unset;cursor:pointer;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;
  color:var(--wr-muted);font-size:14px;}
${P} .wr-stepper button:hover{color:var(--wr-fg);background:var(--wr-hover);}
${P} .wr-stepval{min-width:28px;text-align:center;font-family:var(--wr-mono);font-size:12px;color:var(--wr-fg);}
${P} .wr-config .wr-phint{padding:6px 0 0;}

/* ---- project rows (main rail): plain row + colour square, never a full tint ---- */
${P} .wr-proj{color:var(--wr-fg2);}
${P} .wr-psq{flex:none;width:9px;height:9px;margin-right:2px;}
/* ---- project view: instructions ---- */
${P} .wr-instr{padding:10px 0 6px;}
${P} .wr-instrcard{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:3px;margin:0 12px;width:calc(100% - 24px);
  padding:9px 10px;cursor:pointer;border:1px dashed var(--wr-line);color:var(--wr-fg2);}
${P} .wr-instrcard:hover{border-color:var(--wr-accent);background:var(--wr-hover);}
${P} .wr-instrhead{font-size:12.5px;font-weight:600;color:var(--wr-fg);}
${P} .wr-instrbody{font-size:12px;color:var(--wr-muted);line-height:1.4;}
${P} .wr-instrflags{font-family:var(--wr-mono);font-size:10.5px;color:var(--wr-accent-2);}
${P} .wr-instrform{padding:0 0 4px;}
${P} textarea.wr-textarea{all:unset;box-sizing:border-box;display:block;width:calc(100% - 24px);margin:0 12px 6px;min-height:120px;padding:8px 9px;
  font-size:12.5px;line-height:1.45;white-space:pre-wrap;color:var(--wr-fg);background:var(--wr-field);border:1px solid var(--wr-line);resize:vertical;}
${P} textarea.wr-textarea:focus{border-color:var(--wr-accent);}
${P} textarea.wr-textarea::placeholder{color:var(--wr-faint);}
${P} .wr-check{display:flex;gap:9px;align-items:flex-start;padding:6px 14px;cursor:pointer;}
${P} .wr-check input{margin-top:2px;accent-color:var(--wr-accent);flex:none;}
${P} .wr-check>span{display:flex;flex-direction:column;gap:2px;}
${P} .wr-checklabel{font-size:12.5px;color:var(--wr-fg);}
${P} .wr-checkhint{font-size:11px;color:var(--wr-faint);line-height:1.35;}
${P} input.wr-pfield.wr-pfield-inline{margin-top:0;}
${P} .wr-pactions-top{padding:0 12px 6px;}
${P} .wr-upload{font-weight:600;}

/* ---- archive / delete / model ---- */
${P} .wr-archtoggle{all:unset;cursor:pointer;display:block;margin:4px 6px 0;padding:4px 10px;font-size:11.5px;color:var(--wr-faint);}
${P} .wr-archtoggle:hover{color:var(--wr-fg);}
${P} .wr-row.wr-archived{opacity:.6;}
${P} .wr-confirm{margin:10px 12px 4px;padding:10px;border:1px solid var(--dsw-alias-state-error-primary,#e0685a);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e0685a) 7%,transparent);display:flex;flex-direction:column;gap:4px;}
${P} .wr-confirm .wr-check{padding:6px 0 0;}
${P} .wr-confirm .wr-pactions{padding:8px 0 0;}
${P} .wr-pbtn-danger{background:var(--dsw-alias-state-error-primary,#e0685a);border-color:var(--dsw-alias-state-error-primary,#e0685a);color:#fff;}
${P} .wr-pbtn-danger:hover{filter:brightness(1.08);background:var(--dsw-alias-state-error-primary,#e0685a);color:#fff;}
${P} .wr-modelrow{display:flex;gap:6px;padding:0 12px 6px;}
${P} .wr-select-wide{flex:1;min-width:0;}
${P} .wr-select-wide select{width:100%;min-width:0;}
${P} .wr-select[hidden]{display:none;}

/* ---- collapsed sidebar (56px column) ---- */
${P}.wr-compact .wr-head,${P}.wr-compact .wr-footer,${P}.wr-compact .wr-label,${P}.wr-compact .wr-time,
${P}.wr-compact .wr-title,${P}.wr-compact .wr-dots{display:none;}

/* ---- the rail replaces the pinned-sessions footer button ----
   dsh-session-pin keeps pinning (the rail reads its pins); only its footer
   toggle is hidden. The seal status lock takes that place. */
${PIN_FOOTER}{display:none!important;}
`;

// src/pixel-icons.ts
var PIXEL_VARIANTS = ["folder", "star", "bolt", "box", "flag", "heart"];
var GRIDS = {
  folder: [".......", ".XXXXX.", "XXXXXXX", "X.....X", "X.....X", "XXXXXXX", "......."],
  star: ["...X...", "...X...", "..XXX..", "XXXXXXX", ".XXXXX.", "..X.X..", ".X...X."],
  bolt: ["....XX.", "...XX..", "..XX...", ".XXXXX.", "...XX..", "..XX...", ".XX...."],
  box: [".......", "XXXXXXX", "X..X..X", "X..X..X", "X..X..X", "XXXXXXX", "......."],
  flag: ["XX.....", "XXXXX..", "XXXXXXX", "XXXXX..", "XX.....", "XX.....", "XX....."],
  heart: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X...", "......."]
};
var TONE_FILL = { black: "#10141a", white: "#e6edf3" };
function isPixelVariant(value) {
  return PIXEL_VARIANTS.includes(value);
}
function pixelIconSvg(variant, tone) {
  const grid = GRIDS[isPixelVariant(variant) ? variant : "folder"];
  const fill = TONE_FILL[tone === "white" ? "white" : "black"];
  let rects = "";
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "X") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// src/folders.ts
function createFolder(state, input) {
  const name2 = input.name.trim();
  if (name2.length === 0) throw new Error("folder name required");
  let parentId = null;
  if (input.parentId !== void 0 && input.parentId !== null) {
    const parent = state.folders[input.parentId];
    if (parent === void 0) throw new Error("unknown parent folder");
    if (parent.parentId !== null) throw new Error("nesting is limited to one level");
    parentId = input.parentId;
  }
  const id = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const folders = { ...state.folders };
  folders[id] = {
    id,
    name: name2,
    iconKind: input.iconKind === "emoji" ? "emoji" : "pixel",
    iconValue: input.iconKind === "pixel" && !isPixelVariant(input.iconValue) ? "folder" : input.iconValue,
    iconTone: input.iconTone === "white" ? "white" : "black",
    parentId,
    collapsed: false
  };
  const folderOrder = [...state.folderOrder, id];
  return { folders, folderOrder };
}
function buildPinnedRows(state, sessionTitle) {
  const rows = [];
  const inFolders = new Set(Object.keys(state.sessionFolders));
  const rootIds = state.folderOrder.filter((id) => state.folders[id]?.parentId === null);
  for (const fid of rootIds) {
    const folder = state.folders[fid];
    if (folder === void 0) continue;
    rows.push({ kind: "folder", id: fid, name: folder.name, indent: 0, collapsed: folder.collapsed });
    if (folder.collapsed) continue;
    for (const sid of state.folderOrder) {
      const sub = state.folders[sid];
      if (sub !== void 0 && sub.parentId === fid) {
        rows.push({ kind: "folder", id: sid, name: sub.name, indent: 1, collapsed: sub.collapsed });
        if (sub.collapsed) continue;
        for (const [sid2, folderId] of Object.entries(state.sessionFolders)) {
          if (folderId === sid) rows.push(sessionRow(sid2, sessionTitle(sid2), sid, 1));
        }
      }
    }
    for (const [sid, folderId] of Object.entries(state.sessionFolders)) {
      if (folderId === fid) rows.push(sessionRow(sid, sessionTitle(sid), fid, 1));
    }
  }
  for (const sid of state.pinned) {
    if (inFolders.has(sid)) continue;
    rows.push(sessionRow(sid, sessionTitle(sid), null));
  }
  return rows;
}
function sessionRow(id, title, folderId, indent = 0) {
  return { kind: "session", id, name: title, indent, folderId };
}
function unpinSession(state, sessionId) {
  const pinned = state.pinned.filter((id) => id !== sessionId);
  const sessionFolders = { ...state.sessionFolders };
  delete sessionFolders[sessionId];
  return { pinned, sessionFolders };
}
function deleteFolder(state, folderId) {
  const folder = state.folders[folderId];
  if (folder === void 0) return state;
  const folders = { ...state.folders };
  const sessionFolders = { ...state.sessionFolders };
  delete folders[folderId];
  for (const [sid, fid] of Object.entries(sessionFolders)) {
    if (fid === folderId) delete sessionFolders[sid];
  }
  if (folder.parentId === null) {
    for (const f of Object.values(folders)) {
      if (f.parentId === folderId) {
        folders[f.id] = { ...f, parentId: null };
      }
    }
  }
  const folderOrder = state.folderOrder.filter((id) => folders[id] !== void 0);
  return { folders, folderOrder, sessionFolders };
}
function toggleFolderCollapsed(state, folderId) {
  const folder = state.folders[folderId];
  if (folder === void 0) return state;
  return { folders: { ...state.folders, [folderId]: { ...folder, collapsed: !folder.collapsed } } };
}
function assignSessionFolder(state, sessionId, folderId) {
  const pinned = state.pinned.includes(sessionId) ? state.pinned : [sessionId, ...state.pinned];
  if (folderId === null) {
    const sessionFolders = { ...state.sessionFolders };
    delete sessionFolders[sessionId];
    return { pinned, sessionFolders };
  }
  if (state.folders[folderId] === void 0) throw new Error("unknown folder");
  return { pinned, sessionFolders: { ...state.sessionFolders, [sessionId]: folderId } };
}
function movePinnedSession(state, sessionId, target) {
  const unchanged = { pinned: state.pinned, sessionFolders: state.sessionFolders };
  const pinned0 = state.pinned.includes(sessionId) ? state.pinned : [sessionId, ...state.pinned];
  const entries = Object.entries(state.sessionFolders).filter(([k]) => k !== sessionId);
  let pinned = pinned0;
  if (target.kind === "folder") {
    if (state.folders[target.id] === void 0) return unchanged;
    entries.push([sessionId, target.id]);
  } else if (target.kind === "end") {
    pinned = [...pinned0.filter((x) => x !== sessionId), sessionId];
  } else {
    if (target.id === sessionId) return unchanged;
    const folderId = state.sessionFolders[target.id];
    if (folderId !== void 0) {
      const idx = entries.findIndex(([k]) => k === target.id);
      if (idx < 0) return unchanged;
      entries.splice(idx + (target.after ? 1 : 0), 0, [sessionId, folderId]);
    } else {
      const rest = pinned0.filter((x) => x !== sessionId);
      const idx = rest.indexOf(target.id);
      if (idx < 0) rest.push(sessionId);
      else rest.splice(idx + (target.after ? 1 : 0), 0, sessionId);
      pinned = rest;
    }
  }
  return { pinned, sessionFolders: Object.fromEntries(entries) };
}
function moveFolder(state, folderId, targetId, after) {
  const f = state.folders[folderId];
  const t = state.folders[targetId];
  if (f === void 0 || t === void 0 || folderId === targetId || f.parentId !== t.parentId) return state.folderOrder;
  const order = state.folderOrder.filter((x) => x !== folderId);
  const idx = order.indexOf(targetId);
  if (idx < 0) return state.folderOrder;
  order.splice(idx + (after ? 1 : 0), 0, folderId);
  return order;
}
function reorderIds(order, id, targetId, after) {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return [...order];
  const rest = order.filter((x) => x !== id);
  const idx = rest.indexOf(targetId);
  rest.splice(idx + (after ? 1 : 0), 0, id);
  return rest;
}

// src/projects.ts
function createProject(state, name2) {
  const trimmed = name2.trim();
  if (trimmed.length === 0) throw new Error("project name required");
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const hueKey = nextHue(Object.values(state.projects).map((p) => p.hueKey));
  const projects = { ...state.projects };
  projects[id] = { id, name: trimmed, hueKey, workspaceId: null, autoCarryover: false };
  return { projects, projectOrder: [...state.projectOrder, id] };
}
function deleteProject(state, projectId) {
  if (state.projects[projectId] === void 0) return state;
  const projects = { ...state.projects };
  delete projects[projectId];
  const memberships = { ...state.memberships };
  for (const [sid, pid] of Object.entries(memberships)) {
    if (pid === projectId) delete memberships[sid];
  }
  const docs = {};
  for (const [did, d] of Object.entries(state.docs)) {
    if (d.projectId !== projectId) docs[did] = d;
  }
  return { projects, projectOrder: state.projectOrder.filter((id) => id !== projectId), memberships, docs };
}
function renameProject(state, projectId, name2) {
  const p = state.projects[projectId];
  if (p === void 0) return state;
  const trimmed = name2.trim();
  if (trimmed.length === 0) throw new Error("project name required");
  return { projects: { ...state.projects, [projectId]: { ...p, name: trimmed } } };
}
function moveSessionToProject(state, sessionId, projectId) {
  if (projectId !== null && state.projects[projectId] === void 0) throw new Error("unknown project");
  const memberships = { ...state.memberships };
  if (projectId === null) delete memberships[sessionId];
  else memberships[sessionId] = projectId;
  return { memberships };
}
function addDoc(state, projectId, kind, name2, pointer) {
  if (state.projects[projectId] === void 0) throw new Error("unknown project");
  const trimmed = name2.trim();
  if (trimmed.length === 0) throw new Error("doc name required");
  const id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return { docs: { ...state.docs, [id]: { id, projectId, kind, name: trimmed, pointer: pointer.trim() } } };
}
function removeDoc(state, docId) {
  const docs = { ...state.docs };
  delete docs[docId];
  return { docs };
}
function listDocs(state, projectId) {
  return Object.values(state.docs).filter((d) => d.projectId === projectId).sort((a, b) => a.kind !== b.kind ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name));
}
function projectMembers(state, projectId) {
  return Object.entries(state.memberships).filter(([, pid]) => pid === projectId).map(([sid]) => sid);
}

// src/carryover.ts
function planCarryover(state, sessionId, toProjectId, docHealth = {}) {
  if (toProjectId !== null && state.projects[toProjectId] === void 0) throw new Error("unknown project");
  const fromProjectId = state.memberships[sessionId] ?? null;
  const targetDocs = toProjectId !== null ? Object.values(state.docs).filter((d) => d.projectId === toProjectId) : [];
  const sourceDocs = fromProjectId !== null ? Object.values(state.docs).filter((d) => d.projectId === fromProjectId) : [];
  const targetPointers = new Set(targetDocs.map((d) => d.pointer));
  const adds = toProjectId !== null ? targetDocs.filter((d) => (docHealth[d.id]?.status ?? "ok") === "ok").map((d) => ({ docId: d.id, name: d.name, pointer: d.pointer })) : [];
  const rebinds = targetDocs.filter((d) => docHealth[d.id]?.repaired !== void 0).map((d) => ({ docId: d.id, name: d.name, from: d.pointer, to: docHealth[d.id].repaired }));
  const removes = [];
  for (const d of sourceDocs) {
    if (docHealth[d.id]?.status === "missing") removes.push({ docId: d.id, name: d.name, reason: "pointer missing on disk" });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const d of targetDocs) {
    if (targetPointers.has(d.pointer) && seen.has(d.pointer)) {
      const first = targetDocs.find((x) => x.pointer === d.pointer);
      removes.push({ docId: d.id, name: d.name, reason: "duplicate of " + (first?.name ?? d.pointer) });
    }
    seen.add(d.pointer);
  }
  const targetName = toProjectId !== null ? state.projects[toProjectId]?.name ?? toProjectId : "the global default workspace";
  const note = "Moved into " + targetName + " with " + adds.length + " shared doc(s) in scope" + (rebinds.length > 0 ? ", " + rebinds.length + " pointer(s) rebound" : "") + (removes.length > 0 ? ", " + removes.length + " stale doc(s) trimmed" : "") + ".";
  return { sessionId, fromProjectId, toProjectId, adds, rebinds, removes, note, createdAt: Date.now() };
}
function applyCarryover(state, plan) {
  const memberships = { ...state.memberships };
  if (plan.sessionId !== "") {
    if (plan.toProjectId === null) delete memberships[plan.sessionId];
    else memberships[plan.sessionId] = plan.toProjectId;
  }
  const docs = { ...state.docs };
  const pointerFixes = {};
  const removedDocIds = [];
  for (const r of plan.rebinds) {
    const doc = docs[r.docId];
    if (doc !== void 0) {
      pointerFixes[r.docId] = doc.pointer;
      docs[r.docId] = { ...doc, pointer: r.to };
    }
  }
  const restoredDocs = {};
  for (const r of plan.removes) {
    const doc = docs[r.docId];
    if (doc !== void 0) {
      restoredDocs[r.docId] = doc;
      delete docs[r.docId];
      removedDocIds.push(r.docId);
    }
  }
  const entry = {
    id: "j_" + plan.createdAt.toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    at: plan.createdAt,
    sessionId: plan.sessionId,
    inverse: { membership: plan.fromProjectId, pointerFixes, restoredDocs, removedDocIds },
    summary: plan.note
  };
  const journal = [entry, ...state.journal].slice(0, 50);
  return { memberships, docs, journal };
}
function revertCarryover(state, entryId) {
  const idx = entryId === void 0 || entryId === null ? 0 : state.journal.findIndex((e) => e.id === entryId);
  const entry = state.journal[idx];
  if (entry === void 0) return null;
  const memberships = { ...state.memberships };
  if (entry.inverse.membership === null) delete memberships[entry.sessionId];
  else memberships[entry.sessionId] = entry.inverse.membership;
  const docs = { ...state.docs };
  for (const [docId, oldPointer] of Object.entries(entry.inverse.pointerFixes)) {
    const doc = docs[docId];
    if (doc !== void 0) docs[docId] = { ...doc, pointer: oldPointer };
  }
  for (const docId of entry.inverse.removedDocIds) {
    const doc = entry.inverse.restoredDocs[docId];
    if (doc !== void 0) docs[docId] = doc;
  }
  const journal = state.journal.filter((e) => e.id !== entry.id);
  return { memberships, docs, journal };
}

// src/files.ts
var DATA_EXT = /* @__PURE__ */ new Set(["json", "jsonl", "ndjson", "csv", "tsv", "yaml", "yml", "toml", "xml", "sql", "parquet", "xlsx", "xls", "db", "sqlite"]);
var SNIPPET_EXT = /* @__PURE__ */ new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "sh", "bash", "zsh", "rb", "java", "kt", "c", "h", "cpp", "hpp", "cs", "php", "swift", "lua", "css", "scss", "vue", "svelte"]);
function isUrl(pointer) {
  return /^https?:\/\//i.test(pointer);
}
function parsePointers(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let s = raw.trim();
    if (s.length === 0 || s.startsWith("#")) continue;
    if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).trim();
    if (/^file:\/\//i.test(s)) {
      try {
        s = decodeURIComponent(new URL(s).pathname);
      } catch {
        continue;
      }
    }
    if (s.length === 0 || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}
function docNameFor(pointer) {
  if (isUrl(pointer)) {
    try {
      const u = new URL(pointer);
      const seg2 = u.pathname.split("/").filter(Boolean).pop();
      return seg2 !== void 0 ? decodeURIComponent(seg2) : u.hostname;
    } catch {
      return pointer;
    }
  }
  const seg = pointer.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return seg !== void 0 && seg.length > 0 ? seg : pointer;
}
function docKindFor(pointer) {
  if (isUrl(pointer)) return "document";
  const m = /\.([a-z0-9]+)$/i.exec(docNameFor(pointer));
  const ext = m?.[1]?.toLowerCase() ?? "";
  if (DATA_EXT.has(ext)) return "data";
  if (SNIPPET_EXT.has(ext)) return "snippet";
  return "document";
}
function shortDir(pointer, max = 34) {
  if (isUrl(pointer)) {
    try {
      return new URL(pointer).hostname;
    } catch {
      return "";
    }
  }
  const parts = pointer.split(/[\\/]/);
  parts.pop();
  let dir = parts.join("/");
  dir = dir.replace(/^\/home\/[^/]+/, "~");
  if (dir.length <= max) return dir;
  return "\u2026" + dir.slice(dir.length - max + 1);
}

// src/instructions.ts
var MEMORY_FILE = "PROJECT-MEMORY.md";
function composeAgentsMd(p) {
  const parts = [];
  const own = (p.instructions ?? "").trim();
  if (own.length > 0) parts.push(own);
  if (p.strict === true) {
    parts.push([
      "## Sources",
      "Answer only from the files in this project folder. If they do not contain the answer, say so plainly;",
      "do not fill gaps from general knowledge or the web. Name the file you relied on."
    ].join("\n"));
  }
  if (p.hasFiles === true) {
    parts.push([
      "## Project files",
      "Use the project_search tool to find the relevant passages in this project's files before answering questions about them, and cite file:line."
    ].join("\n"));
  }
  if (p.memory === true) {
    parts.push([
      "## Project memory",
      `Read ./${MEMORY_FILE} at the start of each chat in this project.`,
      "When a durable fact, decision or preference comes up, add one short dated line to it.",
      "Keep it concise; never store secrets there."
    ].join("\n"));
  }
  if (parts.length === 0) return "";
  return [`# Project: ${p.name.trim()}`, "Files for this project live in this folder.", ...parts].join("\n\n") + "\n";
}
function instructionsPreview(text, max = 90) {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > max ? line.slice(0, max - 1) + "\u2026" : line;
}

// src/rail-ui.ts
var PANEL_CLASS = "__dsh-workspace-rail__";
var LAUNCHER_CLASS = "__dsh-workspace-rail-launcher__";
var STYLE_ID = "__dsh-workspace-rail-style__";
var ROW_HEIGHT = 32;
function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = RAIL_CSS;
  doc.head.appendChild(style);
}
var SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/></svg>';
var EXPAND_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" aria-hidden="true"><path d="M3.5 4 6 1.5 8.5 4M3.5 8 6 10.5 8.5 8"/></svg>';
var COLLAPSE_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square" aria-hidden="true"><path d="M3.5 1 6 3.5 8.5 1M3.5 11 6 8.5 8.5 11M2 6h8"/></svg>';
var GEAR_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 4h7M12 4h2M2 8h2M7 8h7M2 12h9M14 12h0"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="12.5" cy="12" r="1.5"/></svg>';
function relativeAge(ts, now = Date.now()) {
  if (ts === void 0 || !Number.isFinite(ts) || ts <= 0) return "";
  const sec = Math.max(0, Math.round((now - ts) / 1e3));
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return min + "m";
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + "h";
  const day = Math.round(hr / 24);
  if (day < 14) return day + "d";
  const wk = Math.round(day / 7);
  if (wk < 53) return wk + "w";
  return Math.round(day / 365) + "y";
}
var KITTY_A = [
  "#.......#.#.",
  "#......#####",
  ".##########.",
  "..########..",
  "..#.#..#.#.."
];
var KITTY_B = [
  ".#......#.#.",
  "#.....######",
  ".##########.",
  "..########..",
  "...#.#..#.#."
];
function kittySvg(frame) {
  const grid = frame === "a" ? KITTY_A : KITTY_B;
  let rects = "";
  grid.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) if (line[x] === "#") rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
  });
  return '<svg class="wr-kf wr-kf-' + frame + '" viewBox="0 0 12 5" width="24" height="10" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">' + rects + "</svg>";
}
var RailPanel = class {
  panel = null;
  drawer = null;
  drawerState = null;
  list = null;
  recentsBox = null;
  deps;
  doc;
  unsubscribe = null;
  openMenuKey = null;
  pinnedFormOpen = false;
  projectFormOpen = false;
  filterQ = "";
  configOpen = false;
  resultsBox = null;
  recentsSection = null;
  toast = null;
  /** Project view: the "add chats" picker and its query. */
  addChatsOpen = false;
  addChatsQ = "";
  dropActive = false;
  /** Row being dragged for reorder (Pinned / Projects), or null. */
  drag = null;
  dropMarkEl = null;
  renderDeferred = false;
  dragTouched = 0;
  binOpen = false;
  binConfirm = null;
  /** Project view: the instructions editor is open. */
  editingInstructions = false;
  uploading = 0;
  /** Loaded model catalog (null until fetched). */
  catalog = null;
  catalogLoading = false;
  /** Projects list: show the archived ones. */
  showArchived = false;
  /** Project view: the delete confirmation is open. */
  confirmDelete = false;
  deleteFiles = false;
  resizeObs = null;
  /** The chat being renamed inline; survives re-renders (the list redraws on every host update). */
  renaming = null;
  renameInput = null;
  /** Optimistic titles shown until the host's list reports the accepted one. */
  pendingTitles = /* @__PURE__ */ new Map();
  constructor(deps, doc = document) {
    this.deps = deps;
    this.doc = doc;
    ensureStyle(doc);
    this.unsubscribe = deps.store.subscribe(() => this.render());
  }
  /** The fixed launcher chip. */
  mountLauncher(host = this.doc.body) {
    const chip = this.doc.createElement("div");
    chip.className = LAUNCHER_CLASS;
    chip.textContent = "\u25A4 Rail";
    chip.addEventListener("click", () => this.toggle());
    host.appendChild(chip);
    return chip;
  }
  get isOpen() {
    return this.panel !== null;
  }
  /**
   * Open the rail. With a `host` it is embedded (part of the layout: the
   * sidebar seat); without one it falls back to the legacy floating panel.
   */
  open(host) {
    if (this.panel !== null) return;
    const panel = this.doc.createElement("div");
    panel.className = PANEL_CLASS + (host !== void 0 ? " wr-embedded" : " wr-floating");
    (host ?? this.doc.body).appendChild(panel);
    this.panel = panel;
    panel.addEventListener("mousemove", () => {
      if (this.drag !== null && Date.now() - this.dragTouched > 300) this.endDrag();
    }, true);
    this.render();
  }
  close() {
    if (this.panel === null) return;
    this.panel.remove();
    this.panel = null;
    this.list?.destroy();
    this.list = null;
    this.recentsBox = null;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.closeDrawer();
  }
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
  /** (Re)render the panel content. */
  render() {
    if (this.panel === null) return;
    if (this.drag !== null && Date.now() - this.dragTouched > 1500) this.drag = null;
    if (this.drag !== null || this.list?.scrolling === true) {
      if (!this.renderDeferred) {
        this.renderDeferred = true;
        setTimeout(() => this.flushDeferredRender(), this.drag === null ? 280 : 1600);
      }
      return;
    }
    this.renderDeferred = false;
    const state = this.deps.store.getSnapshot();
    const panel = this.panel;
    this.settlePendingTitles();
    const keep = this.captureView(panel);
    panel.replaceChildren();
    panel.classList.toggle("edge-right", state.stripeEdge === "right");
    panel.classList.toggle("edge-left", state.stripeEdge === "left");
    const head = this.doc.createElement("div");
    head.className = "wr-head";
    if (this.deps.onSwitchView !== void 0) {
      const seg = this.doc.createElement("div");
      seg.className = "wr-seg";
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "Sidebar view");
      const railBtn = this.doc.createElement("button");
      railBtn.textContent = "Rail";
      railBtn.setAttribute("aria-pressed", "true");
      const foldersBtn = this.doc.createElement("button");
      foldersBtn.textContent = "Folders";
      foldersBtn.setAttribute("aria-pressed", "false");
      foldersBtn.title = "Show the folder view (metafolder)";
      foldersBtn.addEventListener("click", () => this.deps.onSwitchView?.());
      seg.appendChild(railBtn);
      seg.appendChild(foldersBtn);
      head.appendChild(seg);
    }
    const searchRow = this.doc.createElement("div");
    searchRow.className = "wr-searchrow";
    const search = this.doc.createElement("label");
    search.className = "wr-search";
    search.innerHTML = SEARCH_SVG;
    const filter = this.doc.createElement("input");
    filter.dataset.keep = "search";
    filter.placeholder = "Search chats";
    filter.value = this.filterQ;
    filter.setAttribute("aria-label", "Search chats");
    filter.addEventListener("input", () => {
      this.filterQ = filter.value;
      this.applyFilterView();
    });
    filter.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        this.filterQ = "";
        filter.value = "";
        this.applyFilterView();
      }
    });
    search.appendChild(filter);
    const gear = this.doc.createElement("button");
    gear.className = "wr-iconbtn";
    gear.innerHTML = GEAR_SVG;
    gear.title = "Rail settings";
    gear.setAttribute("aria-pressed", String(this.configOpen));
    gear.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.configOpen = !this.configOpen;
      this.render();
    });
    searchRow.appendChild(search);
    searchRow.appendChild(gear);
    head.appendChild(searchRow);
    panel.appendChild(head);
    if (this.configOpen) panel.appendChild(this.renderConfig(state));
    const body = this.doc.createElement("div");
    body.className = "wr-body";
    body.dataset.keep = "body";
    panel.appendChild(body);
    body.appendChild(this.renderPinned(state));
    body.appendChild(this.renderProjects(state));
    const results = this.doc.createElement("div");
    results.className = "wr-results";
    this.resultsBox = results;
    body.appendChild(results);
    this.recentsSection = this.renderRecents(state);
    body.appendChild(this.recentsSection);
    this.applyFilterView();
    panel.appendChild(this.renderFooter(state));
    if (this.drawerState !== null) this.renderDrawer();
    if (this.binOpen) panel.appendChild(this.renderBinDrawer());
    if (this.toast !== null) panel.appendChild(this.renderToast());
    this.restoreView(panel, keep);
  }
  flushDeferredRender() {
    if (!this.renderDeferred) return;
    if (this.drag !== null && Date.now() - this.dragTouched > 1500) this.drag = null;
    if (this.drag !== null) {
      setTimeout(() => this.flushDeferredRender(), 800);
      return;
    }
    if (this.list?.scrolling === true) {
      setTimeout(() => this.flushDeferredRender(), 280);
      return;
    }
    this.render();
  }
  // ---- Bin ---------------------------------------------------------------
  /** Hide a chat everywhere in the rail (reversible); memberships and pins are kept for a restore. */
  binChat(id) {
    const title = this.deps.sessionTitle(id);
    this.openMenuKey = null;
    this.mutate((d) => {
      d.binned[id] = Date.now();
    });
    this.showToast("Moved \u201C" + title + "\u201D to the bin", () => this.restoreChat(id));
  }
  restoreChat(id) {
    this.mutate((d) => {
      delete d.binned[id];
    });
  }
  renderBinDrawer() {
    const drawer = this.doc.createElement("div");
    drawer.className = "wr-drawer wr-bindrawer";
    const head = this.doc.createElement("div");
    head.className = "wr-dhead";
    const back = this.doc.createElement("button");
    back.className = "wr-dclose";
    back.textContent = "\u2190";
    back.title = "Back to the rail";
    back.setAttribute("aria-label", "Back to the rail");
    back.addEventListener("click", () => {
      this.binOpen = false;
      this.binConfirm = null;
      this.render();
    });
    const title = this.doc.createElement("span");
    title.className = "wr-ptitle";
    title.textContent = "Bin";
    head.appendChild(back);
    head.appendChild(title);
    const items = this.deps.binned?.() ?? [];
    if (items.length > 0 && this.deps.deleteForever !== void 0) {
      const empty = this.doc.createElement("button");
      empty.className = "wr-pbtn" + (this.binConfirm === "*" ? " wr-pbtn-danger" : "");
      empty.textContent = this.binConfirm === "*" ? "Really delete all?" : "Empty bin";
      empty.addEventListener("click", () => {
        if (this.binConfirm !== "*") {
          this.binConfirm = "*";
          this.render();
          return;
        }
        this.binConfirm = null;
        for (const it of items) void this.deps.deleteForever(it.id);
        this.showToast("Deleted " + items.length + (items.length === 1 ? " chat" : " chats"));
      });
      head.appendChild(empty);
    }
    drawer.appendChild(head);
    const body = this.doc.createElement("div");
    body.className = "wr-dbody";
    body.dataset.keep = "bin-body";
    drawer.appendChild(body);
    if (items.length === 0) {
      const none = this.doc.createElement("div");
      none.className = "wr-empty";
      none.textContent = "The bin is empty. Use \u22EF \u2192 Move to bin on any chat.";
      body.appendChild(none);
    } else {
      const hint = this.doc.createElement("div");
      hint.className = "wr-phint";
      hint.textContent = "Binned chats are hidden in the rail and searches. Restore brings them back where they were. Delete forever hides them everywhere in DSH; the transcript stays on disk.";
      body.appendChild(hint);
    }
    for (const it of items) {
      const row = this.doc.createElement("div");
      row.className = "wr-row wr-binrow";
      const t = this.doc.createElement("span");
      t.className = "wr-title";
      t.textContent = it.title;
      t.title = it.title;
      row.appendChild(t);
      const age = relativeAge(it.at);
      if (age.length > 0) {
        const time = this.doc.createElement("span");
        time.className = "wr-time";
        time.textContent = age;
        row.appendChild(time);
      }
      const restore = this.doc.createElement("button");
      restore.className = "wr-binact";
      restore.textContent = "Restore";
      restore.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.restoreChat(it.id);
      });
      row.appendChild(restore);
      if (this.deps.deleteForever !== void 0) {
        const del = this.doc.createElement("button");
        del.className = "wr-binact wr-bindel";
        const armed = this.binConfirm === it.id;
        del.textContent = armed ? "Sure?" : "\u2715";
        del.title = "Delete forever";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (!armed) {
            this.binConfirm = it.id;
            this.render();
            return;
          }
          this.binConfirm = null;
          void this.deps.deleteForever(it.id).then((ok) => {
            if (!ok) this.showToast("Could not delete that chat");
          });
        });
        row.appendChild(del);
      }
      body.appendChild(row);
    }
    return drawer;
  }
  // ---- Working indicator ---------------------------------------------------
  /** Blue dot for a row holding an unread reply; null when there is none. */
  unreadMark(unread, label = "Unread reply") {
    if (!unread) return null;
    const el = this.doc.createElement("span");
    el.className = "wr-unread";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
    el.title = label;
    return el;
  }
  /** Any chat filed in this folder or one of its subfolders is unread. */
  folderHasUnread(state, folderId) {
    if (this.deps.isUnread === void 0) return false;
    const inside = (fid) => {
      for (let f = fid, guard = 0; f != null && guard < 32; f = state.folders[f]?.parentId, guard++) if (f === folderId) return true;
      return false;
    };
    return Object.entries(state.sessionFolders).some(([sid, fid]) => inside(fid) && this.deps.isUnread(sid));
  }
  /** A pixel kitty (or dots) for a chat that is working; null when idle or switched off. */
  workingBadge(running) {
    if (!running) return null;
    const mode = this.deps.store.getSnapshot().workingIndicator;
    if (mode === "off") return null;
    const el = this.doc.createElement("span");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Working");
    el.title = "Working\u2026";
    if (mode === "dots") {
      el.className = "wr-working wr-dots3";
      el.innerHTML = "<i></i><i></i><i></i>";
    } else {
      el.className = "wr-working wr-kitty";
      el.innerHTML = kittySvg("a") + kittySvg("b");
    }
    return el;
  }
  // ---- Drag-and-drop reorder (Pinned + Projects) --------------------------
  clearDropMark() {
    if (this.dropMarkEl !== null) this.dropMarkEl.classList.remove("wr-drop-before", "wr-drop-after", "wr-drop-into", "wr-drop-end");
    this.dropMarkEl = null;
  }
  endDrag() {
    this.clearDropMark();
    this.panel?.querySelectorAll(".wr-dragsrc").forEach((n) => n.classList.remove("wr-dragsrc"));
    this.drag = null;
    if (this.renderDeferred) this.flushDeferredRender();
  }
  /**
   * Make a row draggable for reorder. `mode(fromKey)` says what dropping the
   * dragged row here means: 'reorder' (before/after by cursor half), 'into'
   * (the whole row is a target) or null (refuse).
   */
  makeSortable(el, group, key, mode, onDrop) {
    el.draggable = true;
    el.addEventListener("dragstart", (ev) => {
      const t = ev.target;
      if (ev.dataTransfer === null || t.closest("input,textarea") !== null) {
        ev.preventDefault();
        return;
      }
      this.drag = { group, key };
      this.dragTouched = Date.now();
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("application/x-wr-row", group + "|" + key);
      setTimeout(() => el.classList.add("wr-dragsrc"), 0);
    });
    el.addEventListener("dragend", () => this.endDrag());
    const position = (ev, m) => {
      if (m === "into") return "into";
      const r = el.getBoundingClientRect();
      return ev.clientY < r.top + r.height / 2 ? "before" : "after";
    };
    el.addEventListener("dragover", (ev) => {
      const d = this.drag;
      if (d !== null) this.dragTouched = Date.now();
      if (d === null || d.group !== group || d.key === key) return;
      const m = mode(d.key);
      if (m === null) return;
      ev.preventDefault();
      if (ev.dataTransfer !== null) ev.dataTransfer.dropEffect = "move";
      const pos = position(ev, m);
      if (this.dropMarkEl !== el) this.clearDropMark();
      this.dropMarkEl = el;
      el.classList.toggle("wr-drop-before", pos === "before");
      el.classList.toggle("wr-drop-after", pos === "after");
      el.classList.toggle("wr-drop-into", pos === "into");
    });
    el.addEventListener("dragleave", (ev) => {
      if (!el.contains(ev.relatedTarget)) {
        el.classList.remove("wr-drop-before", "wr-drop-after", "wr-drop-into");
        if (this.dropMarkEl === el) this.dropMarkEl = null;
      }
    });
    el.addEventListener("drop", (ev) => {
      const d = this.drag;
      if (d === null || d.group !== group || d.key === key) return;
      const m = mode(d.key);
      if (m === null) return;
      ev.preventDefault();
      ev.stopPropagation();
      const pos = position(ev, m);
      const from = d.key;
      this.endDrag();
      onDrop(from, pos);
    });
  }
  /** Scroll a section list while a row is dragged near its top/bottom edge. */
  autoScrollOnDrag(list) {
    list.addEventListener("dragover", (ev) => {
      if (this.drag === null) return;
      const r = list.getBoundingClientRect();
      const edge = 18;
      if (ev.clientY < r.top + edge) list.scrollTop -= 10;
      else if (ev.clientY > r.bottom - edge) list.scrollTop += 10;
    });
  }
  /**
   * Remember what a redraw would destroy - the focused field (value, caret)
   * and every scroll position - keyed by stable data-keep attributes.
   */
  captureView(panel) {
    const scroll = /* @__PURE__ */ new Map();
    panel.querySelectorAll("[data-keep]").forEach((el) => {
      if (el.scrollTop > 0) scroll.set(el.dataset.keep, el.scrollTop);
    });
    const a = this.doc.activeElement;
    let focus = null;
    if ((a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) && panel.contains(a) && a.dataset.keep !== void 0) {
      focus = { key: a.dataset.keep, value: a.value, s: a.selectionStart, e: a.selectionEnd };
    }
    const focusKey = a instanceof HTMLElement && panel.contains(a) && a.dataset.focusKey !== void 0 ? a.dataset.focusKey : null;
    return { focus, focusKey, scroll };
  }
  restoreView(panel, keep) {
    const byKey = /* @__PURE__ */ new Map();
    panel.querySelectorAll("[data-keep]").forEach((el2) => {
      if (!byKey.has(el2.dataset.keep)) byKey.set(el2.dataset.keep, el2);
    });
    for (const [key, top] of keep.scroll) {
      const el2 = byKey.get(key);
      if (el2 !== void 0) el2.scrollTop = top;
    }
    if (keep.focusKey !== null) {
      const btn = [...panel.querySelectorAll("[data-focus-key]")].find((el2) => el2.dataset.focusKey === keep.focusKey);
      if (btn !== void 0 && this.doc.activeElement !== btn) btn.focus();
    }
    const f = keep.focus;
    if (f === null) return;
    const el = byKey.get(f.key);
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    if (el.value !== f.value) el.value = f.value;
    el.focus();
    try {
      if (f.s !== null && f.e !== null) el.setSelectionRange(f.s, f.e);
    } catch {
    }
  }
  /** Footer: global default workspace entry + settings toggle (spec §4). */
  renderFooter(state) {
    const footer = this.doc.createElement("div");
    footer.className = "wr-footer";
    const globalCount = this.deps.recents().filter((r) => r.repeat !== "project").length;
    const global = this.doc.createElement("span");
    global.textContent = globalCount + " chats";
    global.title = "Fallback workspace for chats outside any project";
    const settings = this.doc.createElement("button");
    settings.className = "wr-dots";
    settings.textContent = this.configOpen ? "Close settings" : "Settings";
    settings.addEventListener("click", () => {
      this.configOpen = !this.configOpen;
      this.render();
    });
    footer.appendChild(global);
    const binCount = this.deps.binned?.().length ?? 0;
    if (this.deps.binned !== void 0) {
      const bin = this.doc.createElement("button");
      bin.className = "wr-dots wr-binbtn";
      bin.textContent = binCount > 0 ? "Bin " + binCount : "Bin";
      bin.title = "Chats you moved to the bin";
      bin.addEventListener("click", () => {
        this.binOpen = true;
        this.binConfirm = null;
        this.render();
      });
      footer.appendChild(bin);
    }
    footer.appendChild(settings);
    return footer;
  }
  /**
   * Show ranked search hits while a query is present (Recents hidden -
   * one surface at a time); restore the feed when the query clears.
   */
  applyFilterView() {
    const query = this.filterQ.trim();
    if (this.resultsBox === null || this.recentsSection === null) return;
    if (query.length === 0) {
      this.resultsBox.replaceChildren();
      this.recentsSection.style.display = "";
      return;
    }
    this.recentsSection.style.display = "none";
    this.resultsBox.replaceChildren();
    const label = this.doc.createElement("div");
    label.className = "wr-label";
    label.textContent = "Results";
    this.resultsBox.appendChild(label);
    const hits = this.deps.search(query);
    if (hits.length === 0) {
      const empty = this.doc.createElement("div");
      empty.className = "wr-empty";
      empty.textContent = "No matches in titles, docs, or transcript windows";
      this.resultsBox.appendChild(empty);
      return;
    }
    for (const hit of hits) {
      const row = this.doc.createElement("div");
      row.className = "wr-row";
      const tier = this.doc.createElement("span");
      tier.className = "wr-tier";
      tier.textContent = "T" + String(hit.tier);
      tier.title = "Match tier (1 = title/folder/project, 2 = docs/tags, 3 = first messages, 4 = last messages)";
      const title = this.doc.createElement("span");
      title.className = "wr-title";
      title.textContent = hit.title;
      title.title = hit.title;
      const score = this.doc.createElement("span");
      score.className = "wr-badge";
      score.textContent = hit.score.toFixed(1);
      row.appendChild(tier);
      row.appendChild(title);
      row.appendChild(score);
      row.addEventListener("click", () => this.deps.openSession?.(hit.id));
      this.resultsBox.appendChild(row);
    }
    if (hits.length < 3) this.deps.requestWindows?.();
  }
  // ---- Pinned -----------------------------------------------------------
  renderPinned(state) {
    const rows = buildPinnedRows(state, (id) => this.deps.sessionTitle(id)).filter((r) => r.kind !== "session" || this.deps.isHidden?.(r.id) !== true);
    const { section, labelRow, list } = this.sectionShell(state, "pinned", "Pinned", rows.length);
    const add = this.doc.createElement("button");
    add.className = "wr-add";
    add.textContent = "+";
    add.title = "New folder";
    add.addEventListener("click", () => {
      this.pinnedFormOpen = !this.pinnedFormOpen;
      this.projectFormOpen = false;
      this.render();
    });
    labelRow.appendChild(add);
    if (this.isCollapsed(state, "pinned")) return section;
    if (this.pinnedFormOpen) section.insertBefore(this.renderFolderForm(), list);
    if (rows.length === 0) {
      const empty = this.doc.createElement("div");
      empty.className = "wr-empty";
      empty.textContent = "Pin chats from Recents with \u22EF";
      list.appendChild(empty);
      return section;
    }
    for (const row of rows) list.appendChild(this.renderPinnedRow(state, row));
    this.autoScrollOnDrag(list);
    const dropEnd = (target) => {
      target.addEventListener("dragover", (ev) => {
        if (this.drag === null || this.drag.group !== "pinned" || !this.drag.key.startsWith("S:")) return;
        if (ev.target !== target) return;
        ev.preventDefault();
        if (this.dropMarkEl !== list) this.clearDropMark();
        this.dropMarkEl = list;
        list.classList.add("wr-drop-end");
      });
      target.addEventListener("dragleave", (ev) => {
        if (ev.target === target) list.classList.remove("wr-drop-end");
      });
      target.addEventListener("drop", (ev) => {
        if (this.drag === null || this.drag.group !== "pinned" || !this.drag.key.startsWith("S:")) return;
        ev.preventDefault();
        const sid = this.drag.key.slice(2);
        this.endDrag();
        this.mutate((d) => Object.assign(d, movePinnedSession(d, sid, { kind: "end" })));
      });
    };
    dropEnd(list);
    return section;
  }
  renderFolderForm() {
    const form = this.doc.createElement("div");
    form.className = "wr-form";
    const name2 = this.doc.createElement("input");
    name2.placeholder = "Folder name";
    const kindSel = this.doc.createElement("select");
    kindSel.appendChild(this.option("pixel", "Pixel icon"));
    kindSel.appendChild(this.option("emoji", "Emoji"));
    const variantSel = this.doc.createElement("select");
    for (const v of PIXEL_VARIANTS) variantSel.appendChild(this.option(v, v));
    const toneSel = this.doc.createElement("select");
    toneSel.appendChild(this.option("black", "Black"));
    toneSel.appendChild(this.option("white", "White"));
    const emoji = this.doc.createElement("input");
    emoji.placeholder = "\u{1F4E6}";
    emoji.maxLength = 4;
    const go = this.doc.createElement("button");
    go.className = "wr-go";
    go.textContent = "Create";
    const submit = () => {
      const iconKind = kindSel.value === "emoji" ? "emoji" : "pixel";
      this.mutate((d) => Object.assign(d, createFolder(d, {
        name: name2.value,
        iconKind,
        iconValue: iconKind === "emoji" ? emoji.value.trim() === "" ? "\u{1F4E6}" : emoji.value.trim() : variantSel.value,
        iconTone: toneSel.value === "white" ? "white" : "black"
      })));
      this.pinnedFormOpen = false;
    };
    go.addEventListener("click", submit);
    name2.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") submit();
    });
    form.appendChild(name2);
    form.appendChild(kindSel);
    form.appendChild(variantSel);
    form.appendChild(toneSel);
    form.appendChild(emoji);
    form.appendChild(go);
    return form;
  }
  renderPinnedRow(state, row) {
    const el = this.doc.createElement("div");
    el.className = "wr-row";
    el.dataset.rowKey = (row.kind === "folder" ? "F:" : "S:") + row.id;
    if (row.indent === 1) el.style.paddingLeft = "28px";
    const icon = this.doc.createElement("span");
    icon.className = "wr-icon";
    if (row.kind === "folder") {
      const folder = state.folders[row.id];
      if (folder !== void 0 && folder.iconKind === "emoji") icon.textContent = folder.iconValue;
      else if (folder !== void 0) icon.innerHTML = pixelIconSvg(folder.iconValue, folder.iconTone);
    } else {
      icon.textContent = "\u2022";
    }
    el.appendChild(icon);
    if (row.kind === "folder") {
      const title = this.doc.createElement("span");
      title.className = "wr-title";
      title.textContent = row.name;
      title.title = row.name;
      el.appendChild(title);
    } else {
      el.appendChild(this.chatTitle(row.id, row.name));
    }
    const unreadMark = row.kind === "session" ? this.unreadMark(this.deps.isUnread?.(row.id) === true) : this.unreadMark(row.collapsed === true && this.folderHasUnread(state, row.id), "Unread reply inside");
    if (unreadMark !== null) el.appendChild(unreadMark);
    if (row.kind === "folder") {
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".wr-dots,.wr-menu") !== null) return;
        this.mutate((d) => Object.assign(d, toggleFolderCollapsed(d, row.id)));
      });
    } else {
      if (this.deps.currentId?.() === row.id) el.classList.add("wr-current");
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".wr-dots,.wr-menu,.wr-rename") !== null || ev.detail > 1) return;
        this.deps.openSession?.(row.id);
      });
    }
    if (row.kind === "session") {
      const working = this.workingBadge(this.deps.isRunning?.(row.id) === true);
      if (working !== null) {
        el.classList.add("wr-isworking");
        el.appendChild(working);
      }
    }
    const stripeHue = state.stripes[row.id];
    if (stripeHue !== void 0) {
      const stripe = this.doc.createElement("span");
      stripe.className = "wr-stripe";
      stripe.style.background = stripeColor(stripeHue);
      el.appendChild(stripe);
    }
    if (row.kind === "folder") {
      this.makeSortable(
        el,
        "pinned",
        "F:" + row.id,
        (from) => {
          if (from.startsWith("S:")) return "into";
          const f = this.deps.store.getSnapshot().folders[from.slice(2)];
          const t = this.deps.store.getSnapshot().folders[row.id];
          return f !== void 0 && t !== void 0 && f.parentId === t.parentId ? "reorder" : null;
        },
        (from, pos) => {
          if (from.startsWith("S:")) this.mutate((d) => Object.assign(d, movePinnedSession(d, from.slice(2), { kind: "folder", id: row.id })));
          else this.mutate((d) => {
            d.folderOrder = moveFolder(d, from.slice(2), row.id, pos === "after");
          });
        }
      );
    } else {
      this.makeSortable(
        el,
        "pinned",
        "S:" + row.id,
        (from) => from.startsWith("S:") ? "reorder" : null,
        (from, pos) => this.mutate((d) => Object.assign(d, movePinnedSession(d, from.slice(2), { kind: "session", id: row.id, after: pos === "after" })))
      );
    }
    const menuKey = "P:" + row.id;
    el.appendChild(this.dotsButton(menuKey));
    if (this.openMenuKey === menuKey) el.appendChild(this.menuEl(menuKey, this.pinnedMenuItems(state, row)));
    return el;
  }
  pinnedMenuItems(state, row) {
    if (row.kind === "folder") {
      return [
        { label: row.collapsed === true ? "Expand" : "Collapse", action: () => this.mutate((d) => Object.assign(d, toggleFolderCollapsed(d, row.id))) },
        { label: "Stripe color", action: () => {
        }, swatchFor: row.id },
        { label: "Delete folder", action: () => this.mutate((d) => Object.assign(d, deleteFolder(d, row.id))) }
      ];
    }
    const items = [
      { label: "Rename", action: () => this.startRename(row.id, row.name) },
      { label: "Unpin", action: () => this.mutate((d) => Object.assign(d, unpinSession(d, row.id))) }
    ];
    if (row.folderId != null) items.push({ label: "Remove from folder", action: () => this.mutate((d) => Object.assign(d, assignSessionFolder(d, row.id, null))) });
    items.push({ label: "Stripe color", action: () => {
    }, swatchFor: row.id });
    items.push({ label: "Move to bin", action: () => this.binChat(row.id) });
    return items;
  }
  /** Rail settings: stripe edge + per-project auto-carryover pointer. */
  renderConfig(state) {
    const section = this.doc.createElement("div");
    section.className = "wr-config";
    const line = (label, control) => {
      const row = this.doc.createElement("div");
      row.className = "wr-cfgrow";
      const l = this.doc.createElement("span");
      l.className = "wr-cfglabel";
      l.textContent = label;
      row.appendChild(l);
      row.appendChild(control);
      section.appendChild(row);
    };
    const selWrap = this.doc.createElement("span");
    selWrap.className = "wr-select";
    const edgeSel = this.doc.createElement("select");
    edgeSel.appendChild(this.option("right", "Right"));
    edgeSel.appendChild(this.option("left", "Left"));
    edgeSel.value = state.stripeEdge;
    edgeSel.addEventListener("change", () => this.mutate((d) => {
      d.stripeEdge = edgeSel.value === "left" ? "left" : "right";
    }));
    selWrap.appendChild(edgeSel);
    line("Stripe edge", selWrap);
    const wWrap = this.doc.createElement("span");
    wWrap.className = "wr-select";
    const wSel = this.doc.createElement("select");
    wSel.appendChild(this.option("kitty", "Kitty"));
    wSel.appendChild(this.option("dots", "Dots"));
    wSel.appendChild(this.option("off", "Off"));
    wSel.value = state.workingIndicator;
    wSel.addEventListener("change", () => this.mutate((d) => {
      d.workingIndicator = wSel.value === "dots" || wSel.value === "off" ? wSel.value : "kitty";
    }));
    wWrap.appendChild(wSel);
    line("Working chats", wWrap);
    const tWrap = this.doc.createElement("span");
    tWrap.className = "wr-select";
    const tSel = this.doc.createElement("select");
    tSel.appendChild(this.option("on", "Live"));
    tSel.appendChild(this.option("off", "Off"));
    tSel.value = state.tabTitle ? "on" : "off";
    tSel.title = "Live: rail icon, unread count, working kitty, last message. Off: the default tab title and icon.";
    tSel.addEventListener("change", () => this.mutate((d) => {
      d.tabTitle = tSel.value !== "off";
    }));
    tWrap.appendChild(tSel);
    line("Browser tab", tWrap);
    for (const [key, label] of [["pinned", "Pinned rows"], ["projects", "Project rows"]]) {
      const step = this.doc.createElement("span");
      step.className = "wr-stepper";
      const minus = this.doc.createElement("button");
      minus.textContent = "\u2212";
      minus.setAttribute("aria-label", "Fewer " + label.toLowerCase());
      const val = this.doc.createElement("span");
      val.className = "wr-stepval";
      val.textContent = String(state.sectionRows[key]);
      const plus = this.doc.createElement("button");
      plus.textContent = "+";
      plus.setAttribute("aria-label", "More " + label.toLowerCase());
      const set = (delta) => this.mutate((d) => {
        d.sectionRows = { ...d.sectionRows, [key]: Math.min(30, Math.max(1, d.sectionRows[key] + delta)) };
      });
      minus.addEventListener("click", () => set(-1));
      plus.addEventListener("click", () => set(1));
      step.appendChild(minus);
      step.appendChild(val);
      step.appendChild(plus);
      line(label, step);
    }
    const hint = this.doc.createElement("div");
    hint.className = "wr-phint";
    hint.textContent = "Recents fills the rest. You can also drag the line under a section.";
    section.appendChild(hint);
    return section;
  }
  renderProjects(state) {
    const { section, labelRow, list } = this.sectionShell(state, "projects", "Projects", state.projectOrder.filter((id) => state.projects[id]?.archived !== true).length);
    const add = this.doc.createElement("button");
    add.className = "wr-add";
    add.textContent = "+";
    add.title = "New project";
    add.addEventListener("click", () => {
      this.projectFormOpen = !this.projectFormOpen;
      this.pinnedFormOpen = false;
      this.render();
    });
    labelRow.appendChild(add);
    if (this.isCollapsed(state, "projects")) return section;
    if (this.projectFormOpen) {
      const form = this.doc.createElement("div");
      form.className = "wr-form";
      const name2 = this.doc.createElement("input");
      name2.placeholder = "Project name";
      const go = this.doc.createElement("button");
      go.className = "wr-go";
      go.textContent = "Create";
      const submit = () => {
        this.mutate((d) => Object.assign(d, createProject(d, name2.value)));
        this.projectFormOpen = false;
      };
      go.addEventListener("click", submit);
      name2.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") submit();
      });
      form.appendChild(name2);
      form.appendChild(go);
      section.insertBefore(form, list);
      setTimeout(() => {
        if (name2.isConnected) name2.focus();
      }, 0);
    }
    if (state.projectOrder.length === 0) {
      const empty = this.doc.createElement("div");
      empty.className = "wr-empty";
      empty.textContent = "No projects yet";
      list.appendChild(empty);
      return section;
    }
    this.autoScrollOnDrag(list);
    const archived = [];
    for (const pid of state.projectOrder) {
      const p = state.projects[pid];
      if (p === void 0) continue;
      if (p.archived === true) {
        archived.push(pid);
        continue;
      }
      list.appendChild(this.renderProjectRow(state, pid));
    }
    if (archived.length > 0) {
      const toggle = this.doc.createElement("button");
      toggle.className = "wr-archtoggle";
      toggle.textContent = (this.showArchived ? "\u25BE " : "\u25B8 ") + "Archived (" + archived.length + ")";
      toggle.addEventListener("click", () => {
        this.showArchived = !this.showArchived;
        this.render();
      });
      list.appendChild(toggle);
      if (this.showArchived) for (const pid of archived) {
        const row = this.renderProjectRow(state, pid);
        row.classList.add("wr-archived");
        list.appendChild(row);
      }
    }
    return section;
  }
  // ---- Section chrome: fixed header, own scroll list, drag-to-resize ----------
  isCollapsed(state, key) {
    return sectionView(state, key).folded;
  }
  isExpanded(state, key) {
    return sectionView(state, key).expanded;
  }
  /**
   * Header row: expand button, then chevron + label + count. The chevron folds
   * the section (hides its body); the expand button makes it fill the sidebar
   * (the other sections show only their headers) until it is pressed again.
   */
  sectionHeader(state, key, text, count) {
    const labelRow = this.doc.createElement("div");
    labelRow.className = "wr-label";
    const expanded = this.isExpanded(state, key);
    const expand = this.doc.createElement("button");
    expand.type = "button";
    expand.className = "wr-expand";
    expand.dataset.focusKey = "expand:" + key;
    expand.innerHTML = expanded ? COLLAPSE_SVG : EXPAND_SVG;
    const expandName = expanded ? "Collapse section" : "Expand section";
    expand.title = expandName;
    expand.setAttribute("aria-label", expandName);
    expand.setAttribute("aria-expanded", String(expanded));
    expand.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.mutate((d) => {
        d.expandedSection = toggleExpanded(d, key).expandedSection;
      });
    });
    labelRow.appendChild(expand);
    const toggle = this.doc.createElement("button");
    toggle.type = "button";
    toggle.className = "wr-fold";
    toggle.dataset.focusKey = "fold:" + key;
    const folded = this.isCollapsed(state, key);
    toggle.setAttribute("aria-expanded", String(!folded));
    toggle.title = folded ? "Show " + text : "Hide " + text;
    const chev = this.doc.createElement("span");
    chev.className = "wr-chev";
    chev.textContent = "\u25BE";
    toggle.appendChild(chev);
    toggle.appendChild(this.doc.createTextNode(text));
    if (count !== null && count > 0) {
      const c = this.doc.createElement("span");
      c.className = "wr-count";
      c.textContent = String(count);
      toggle.appendChild(c);
    }
    toggle.addEventListener("click", () => this.mutate((d) => {
      const next = toggleFold(d, key);
      d.collapsedSections = next.collapsedSections;
      d.expandedSection = next.expandedSection;
    }));
    labelRow.appendChild(toggle);
    return labelRow;
  }
  /**
   * A section with a header that stays put and a list that scrolls on its own,
   * `rows` tall, plus a handle under it to drag the height in whole rows.
   */
  sectionShell(state, key, text, count) {
    const folded = this.isCollapsed(state, key);
    const expanded = this.isExpanded(state, key);
    const section = this.doc.createElement("div");
    section.className = "wr-section wr-" + key + (folded ? " wr-collapsed" : "") + (expanded ? " wr-expanded" : "");
    const labelRow = this.sectionHeader(state, key, text, count);
    section.appendChild(labelRow);
    const list = this.doc.createElement("div");
    list.className = "wr-slist";
    list.dataset.keep = key + "-list";
    const rows = state.sectionRows[key];
    if (!expanded) list.style.maxHeight = String(rows * ROW_HEIGHT) + "px";
    if (!folded) {
      section.appendChild(list);
      if (!expanded) section.appendChild(this.resizeHandle(key, list));
    }
    return { section, labelRow, list };
  }
  resizeHandle(key, list) {
    const handle = this.doc.createElement("div");
    handle.className = "wr-resize";
    handle.title = "Drag to show more or fewer rows";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "horizontal");
    handle.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const startY = ev.clientY;
      const start = this.deps.store.getSnapshot().sectionRows[key];
      let rows = start;
      handle.classList.add("wr-dragging");
      try {
        handle.setPointerCapture(ev.pointerId);
      } catch {
      }
      const move = (e) => {
        rows = Math.min(30, Math.max(1, start + Math.round((e.clientY - startY) / ROW_HEIGHT)));
        list.style.maxHeight = String(rows * ROW_HEIGHT) + "px";
        handle.dataset.rows = String(rows);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        handle.classList.remove("wr-dragging");
        if (rows !== start) this.mutate((d) => {
          d.sectionRows = { ...d.sectionRows, [key]: rows };
        });
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    return handle;
  }
  renderProjectRow(state, pid) {
    const p = state.projects[pid];
    const row = this.doc.createElement("div");
    row.className = "wr-row wr-proj";
    const h = hue(p.hueKey);
    const stripe = this.doc.createElement("span");
    stripe.className = "wr-psq";
    stripe.style.background = h.stripe;
    const title = this.doc.createElement("span");
    title.className = "wr-title";
    title.textContent = p.name;
    const members = this.doc.createElement("span");
    members.className = "wr-badge";
    members.textContent = String(this.visibleMembers(state, pid).length);
    row.appendChild(stripe);
    row.appendChild(title);
    const projUnread = this.unreadMark(this.visibleMembers(state, pid).some((sid) => this.deps.isUnread?.(sid) === true), "Unread reply inside");
    if (projUnread !== null) row.appendChild(projUnread);
    const anyWorking = this.workingBadge(this.visibleMembers(state, pid).some((sid) => this.deps.isRunning?.(sid) === true));
    if (anyWorking !== null) {
      row.classList.add("wr-isworking");
      row.appendChild(anyWorking);
    }
    row.appendChild(members);
    row.addEventListener("click", (ev) => {
      if (ev.target.closest(".wr-dots,.wr-menu") !== null) return;
      this.openDrawer(pid);
    });
    this.makeSortable(
      row,
      "projects",
      pid,
      () => "reorder",
      (from, pos) => this.mutate((d) => {
        d.projectOrder = reorderIds(d.projectOrder, from, pid, pos === "after");
      })
    );
    const menuKey = "J:" + pid;
    row.appendChild(this.dotsButton(menuKey));
    if (this.openMenuKey === menuKey) {
      row.appendChild(this.menuEl(menuKey, [
        { label: "Delete project", action: () => this.mutate((d) => Object.assign(d, deleteProject(d, pid))) }
      ]));
    }
    return row;
  }
  // ---- Drawer (project workspace) ---------------------------------------
  openDrawer(projectId) {
    this.drawerState = { projectId };
    this.editingInstructions = false;
    this.confirmDelete = false;
    this.addChatsOpen = false;
    this.addChatsQ = "";
    this.renamingProject = null;
    this.deps.requestPointerHealth?.([projectId]);
    this.renderDrawer();
  }
  closeDrawer() {
    this.drawerState = null;
    this.drawer?.remove();
    this.drawer = null;
  }
  renderDrawer() {
    if (this.drawerState === null) return;
    const state = this.deps.store.getSnapshot();
    const project = state.projects[this.drawerState.projectId];
    this.drawer?.remove();
    if (project === void 0) {
      this.closeDrawer();
      return;
    }
    const pid = project.id;
    const drawer = this.doc.createElement("div");
    drawer.className = "wr-drawer";
    this.drawer = drawer;
    const head = this.doc.createElement("div");
    head.className = "wr-dhead";
    const back = this.doc.createElement("button");
    back.className = "wr-dclose";
    back.textContent = "\u2190";
    back.title = "Back to the rail";
    back.setAttribute("aria-label", "Back to the rail");
    back.addEventListener("click", () => this.closeDrawer());
    const swatch = this.doc.createElement("span");
    swatch.className = "wr-pswatch";
    swatch.style.background = hue(project.hueKey).stripe;
    head.appendChild(back);
    head.appendChild(swatch);
    if (this.renamingProject === pid) {
      const input = this.doc.createElement("input");
      input.className = "wr-rename";
      input.value = project.name;
      input.setAttribute("aria-label", "Project name");
      const done = (save) => {
        if (this.renamingProject !== pid) return;
        this.renamingProject = null;
        const name2 = input.value.trim();
        if (save && name2.length > 0 && name2 !== project.name) this.mutate((d) => Object.assign(d, renameProject(d, pid, name2)));
        else this.render();
      };
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") done(true);
        else if (ev.key === "Escape") done(false);
      });
      input.addEventListener("blur", () => done(true));
      head.appendChild(input);
      setTimeout(() => {
        if (input.isConnected) {
          input.focus();
          input.select();
        }
      }, 0);
    } else {
      const title = this.doc.createElement("span");
      title.className = "wr-ptitle";
      title.textContent = project.name;
      title.title = project.name + ", triple-click to rename";
      title.addEventListener("click", (ev) => {
        if (ev.detail === 3) {
          this.renamingProject = pid;
          this.render();
        }
      });
      head.appendChild(title);
    }
    const menuKey = "J:" + pid + ":head";
    head.appendChild(this.dotsButton(menuKey));
    if (this.openMenuKey === menuKey) head.appendChild(this.menuEl(menuKey, this.projectMenuItems(pid, project.name)));
    drawer.appendChild(head);
    const bodyEl = this.doc.createElement("div");
    bodyEl.className = "wr-dbody";
    bodyEl.dataset.keep = "drawer-body";
    drawer.appendChild(bodyEl);
    if (this.confirmDelete) bodyEl.appendChild(this.renderDeleteConfirm(state, pid));
    bodyEl.appendChild(this.renderProjectSettings(state, pid));
    bodyEl.appendChild(this.renderProjectChats(state, pid));
    bodyEl.appendChild(this.renderProjectFiles(state, pid));
    (this.panel ?? this.doc.body).appendChild(drawer);
  }
  renamingProject = null;
  projectMenuItems(pid, name2) {
    return [
      { label: "Rename project", action: () => {
        this.renamingProject = pid;
        this.render();
      } },
      { label: "Instructions & memory", action: () => {
        this.editingInstructions = true;
        this.render();
      } },
      { label: "Project color", action: () => {
      }, swatchFor: "project:" + pid },
      {
        label: this.deps.store.getSnapshot().projects[pid]?.archived === true ? "Unarchive project" : "Archive project",
        action: () => {
          const wasArchived = this.deps.store.getSnapshot().projects[pid]?.archived === true;
          const setArchived = (d, on) => {
            const cur = d.projects[pid];
            if (cur === void 0) return;
            const next = { ...cur };
            if (on) next.archived = true;
            else delete next.archived;
            d.projects[pid] = next;
          };
          this.mutate((d) => setArchived(d, !wasArchived));
          if (!wasArchived) this.closeDrawer();
          this.showToast((wasArchived ? "Restored \u201C" : "Archived \u201C") + name2 + "\u201D", () => this.mutate((d) => setArchived(d, wasArchived)));
        }
      },
      { label: "Delete project\u2026", action: () => {
        this.confirmDelete = true;
        this.render();
      } }
    ];
  }
  // ---- Project view: instructions & memory -----------------------------------
  modelLabel(m) {
    const g = this.catalog?.find((x) => x.id === m.provider);
    const name2 = g?.models.find((x) => x.id === m.model)?.name ?? m.model;
    return name2 + (m.reasoningEffort !== void 0 ? " \xB7 " + m.reasoningEffort : "");
  }
  /** Delete confirmation: keeps the files unless asked (Gemini deletes sources with the notebook - a trap). */
  renderDeleteConfirm(state, pid) {
    const p = state.projects[pid];
    const box = this.doc.createElement("div");
    box.className = "wr-confirm";
    const head = this.doc.createElement("div");
    head.className = "wr-instrhead";
    head.textContent = "Delete \u201C" + p.name + "\u201D?";
    const note = this.doc.createElement("div");
    note.className = "wr-checkhint";
    note.textContent = "Its chats stay in Recents. Or archive it instead to keep everything out of sight.";
    box.appendChild(head);
    box.appendChild(note);
    const fileCount = Object.values(state.docs).filter((d) => d.projectId === pid).length;
    let cb = null;
    if (p.dir !== void 0 && this.deps.deleteProjectFolder !== void 0) {
      const row = this.doc.createElement("label");
      row.className = "wr-check";
      cb = this.doc.createElement("input");
      cb.type = "checkbox";
      cb.checked = this.deleteFiles;
      const box2 = cb;
      cb.addEventListener("change", () => {
        this.deleteFiles = box2.checked;
      });
      const t = this.doc.createElement("span");
      const l = this.doc.createElement("span");
      l.className = "wr-checklabel";
      l.textContent = "Also delete the project folder";
      const h = this.doc.createElement("span");
      h.className = "wr-checkhint";
      h.textContent = shortDir(p.dir + "/x") + (fileCount > 0 ? " \xB7 uploads and instructions; linked files elsewhere are not touched" : "");
      t.appendChild(l);
      t.appendChild(h);
      row.appendChild(cb);
      row.appendChild(t);
      box.appendChild(row);
    }
    const actions = this.doc.createElement("div");
    actions.className = "wr-pactions";
    const del = this.doc.createElement("button");
    del.className = "wr-pbtn wr-pbtn-danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      const alsoFiles = cb?.checked === true || cb !== null && this.deleteFiles;
      this.deleteFiles = false;
      const before = this.deps.store.getSnapshot();
      this.confirmDelete = false;
      this.closeDrawer();
      const finish = () => {
        this.mutate((d) => Object.assign(d, deleteProject(d, pid)));
        this.showToast("Deleted \u201C" + p.name + "\u201D" + (alsoFiles ? " and its folder" : ""), alsoFiles ? void 0 : () => this.mutate((d) => {
          d.projects = before.projects;
          d.projectOrder = before.projectOrder;
          d.memberships = before.memberships;
          d.docs = before.docs;
        }));
      };
      if (alsoFiles) void this.deps.deleteProjectFolder(pid).then((ok) => {
        if (ok) finish();
        else this.showToast("Could not delete the folder; the project was kept");
      });
      else finish();
    });
    const cancel = this.doc.createElement("button");
    cancel.className = "wr-pbtn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      this.confirmDelete = false;
      this.deleteFiles = false;
      this.render();
    });
    actions.appendChild(del);
    actions.appendChild(cancel);
    box.appendChild(actions);
    return box;
  }
  renderProjectSettings(state, pid) {
    const p = state.projects[pid];
    const section = this.doc.createElement("div");
    section.className = "wr-psection wr-instr";
    if (!this.editingInstructions) {
      const card = this.doc.createElement("button");
      card.className = "wr-instrcard";
      const has = (p.instructions ?? "").trim().length > 0;
      const head = this.doc.createElement("span");
      head.className = "wr-instrhead";
      head.textContent = has ? "Instructions" : "+ Add instructions";
      card.appendChild(head);
      const body = this.doc.createElement("span");
      body.className = "wr-instrbody";
      body.textContent = has ? instructionsPreview(p.instructions) : "Tell the assistant how to work in this project. Applies to every chat started here.";
      card.appendChild(body);
      const flags = [];
      if (p.memory === true) flags.push("Project memory");
      if (p.strict === true) flags.push("Files only");
      if (p.model !== void 0) flags.push(this.modelLabel(p.model));
      if (flags.length > 0) {
        const f = this.doc.createElement("span");
        f.className = "wr-instrflags";
        f.textContent = flags.join(" \xB7 ");
        card.appendChild(f);
      }
      card.addEventListener("click", () => {
        this.editingInstructions = true;
        this.render();
      });
      section.appendChild(card);
      return section;
    }
    const form = this.doc.createElement("div");
    form.className = "wr-instrform";
    const lab = (t) => {
      const l = this.doc.createElement("div");
      l.className = "wr-plabel";
      l.textContent = t;
      return l;
    };
    form.appendChild(lab("Instructions"));
    const ta = this.doc.createElement("textarea");
    ta.className = "wr-textarea";
    ta.rows = 7;
    ta.dataset.keep = "instr-" + pid;
    ta.placeholder = "e.g. You are helping with Acme\u2019s legal pages. Write in plain English, cite the GDPR article, keep answers short.";
    ta.value = this.instrDraft?.pid === pid ? this.instrDraft.text : p.instructions ?? "";
    ta.addEventListener("input", () => {
      this.instrDraft = { pid, text: ta.value };
    });
    ta.addEventListener("keydown", (ev) => ev.stopPropagation());
    form.appendChild(ta);
    const check = (label, hint, on) => {
      const row = this.doc.createElement("label");
      row.className = "wr-check";
      const cb = this.doc.createElement("input");
      cb.type = "checkbox";
      cb.checked = on;
      const txt = this.doc.createElement("span");
      const strong = this.doc.createElement("span");
      strong.className = "wr-checklabel";
      strong.textContent = label;
      const small = this.doc.createElement("span");
      small.className = "wr-checkhint";
      small.textContent = hint;
      txt.appendChild(strong);
      txt.appendChild(small);
      row.appendChild(cb);
      row.appendChild(txt);
      form.appendChild(row);
      return cb;
    };
    const mem = check("Project memory", "The assistant keeps PROJECT-MEMORY.md with this project\u2019s key facts and decisions, and reads it in every chat.", p.memory === true);
    const strict = check("Answer from project files only", "No general knowledge or web; if the files don\u2019t say, it says so.", p.strict === true);
    form.appendChild(lab("Default model for new chats"));
    const modelRow = this.doc.createElement("div");
    modelRow.className = "wr-modelrow";
    const mWrap = this.doc.createElement("span");
    mWrap.className = "wr-select wr-select-wide";
    const mSel = this.doc.createElement("select");
    mSel.setAttribute("aria-label", "Default model");
    const eWrap = this.doc.createElement("span");
    eWrap.className = "wr-select";
    const eSel = this.doc.createElement("select");
    eSel.setAttribute("aria-label", "Reasoning effort");
    const cur = p.model;
    const keyOf = (prov, m) => prov + "" + m;
    const fillEfforts = () => {
      eSel.replaceChildren();
      const [prov, mid] = mSel.value.split("");
      const model = this.catalog?.find((g) => g.id === prov)?.models.find((x) => x.id === mid);
      const efforts = model?.reasoning?.efforts ?? [];
      eWrap.hidden = efforts.length === 0;
      eSel.appendChild(this.option("", "Default effort"));
      for (const e of efforts) eSel.appendChild(this.option(e.id, e.name));
      if (cur !== void 0 && keyOf(cur.provider, cur.model) === mSel.value && cur.reasoningEffort !== void 0) eSel.value = cur.reasoningEffort;
    };
    mSel.appendChild(this.option("", "dsh default"));
    if (this.catalog === null) {
      if (cur !== void 0) mSel.appendChild(this.option(keyOf(cur.provider, cur.model), this.modelLabel(cur)));
      mSel.appendChild(this.option("__loading", this.catalogLoading ? "Loading models\u2026" : "Models unavailable"));
      if (!this.catalogLoading && this.deps.modelCatalog !== void 0) {
        this.catalogLoading = true;
        void this.deps.modelCatalog().then((c) => {
          this.catalog = c ?? [];
          this.catalogLoading = false;
          this.render();
        });
      }
    } else {
      for (const g of this.catalog) {
        const og = this.doc.createElement("optgroup");
        og.label = g.name;
        for (const m of g.models) og.appendChild(this.option(keyOf(g.id, m.id), m.name));
        mSel.appendChild(og);
      }
    }
    mSel.value = cur !== void 0 ? keyOf(cur.provider, cur.model) : "";
    mSel.addEventListener("change", fillEfforts);
    fillEfforts();
    mWrap.appendChild(mSel);
    eWrap.appendChild(eSel);
    modelRow.appendChild(mWrap);
    modelRow.appendChild(eWrap);
    form.appendChild(modelRow);
    form.appendChild(lab("Description (only for you)"));
    const desc = this.doc.createElement("input");
    desc.className = "wr-pfield wr-pfield-inline";
    desc.dataset.keep = "desc-" + pid;
    desc.value = p.description ?? "";
    desc.placeholder = "What this project is about";
    desc.addEventListener("keydown", (ev) => ev.stopPropagation());
    form.appendChild(desc);
    const note = this.doc.createElement("div");
    note.className = "wr-phint";
    note.textContent = "Applies to chats started with + New chat here (they run in the project folder). Chats moved in from elsewhere keep their own folder.";
    form.appendChild(note);
    const actions = this.doc.createElement("div");
    actions.className = "wr-pactions";
    const save = this.doc.createElement("button");
    save.className = "wr-pbtn wr-pbtn-primary";
    save.textContent = "Save";
    save.addEventListener("click", () => {
      this.editingInstructions = false;
      this.instrDraft = null;
      this.mutate((d) => {
        const cur2 = d.projects[pid];
        if (cur2 === void 0) return;
        const [prov, mid] = mSel.value.split("");
        const model = prov !== void 0 && prov.length > 0 && prov !== "__loading" && mid !== void 0 ? { provider: prov, model: mid, ...eSel.value.length > 0 ? { reasoningEffort: eSel.value } : {} } : void 0;
        const next = { ...cur2, instructions: ta.value.trim(), memory: mem.checked, strict: strict.checked, description: desc.value.trim() };
        if (model !== void 0) next.model = model;
        else delete next.model;
        d.projects[pid] = next;
      });
      void this.deps.ensureProject?.(pid).then((dir) => this.showToast(dir !== null ? "Instructions saved" : "Saved, but the project folder could not be updated"));
    });
    const cancel = this.doc.createElement("button");
    cancel.className = "wr-pbtn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      this.editingInstructions = false;
      this.instrDraft = null;
      this.render();
    });
    actions.appendChild(save);
    actions.appendChild(cancel);
    form.appendChild(actions);
    section.appendChild(form);
    return section;
  }
  /** Unsaved instructions text, kept across redraws. */
  instrDraft = null;
  /** Upload desktop files into the project folder and list them as project files. */
  async uploadInto(pid, files) {
    if (files.length === 0) return;
    if (this.deps.uploadFiles === void 0) {
      this.showToast("Uploads are not available here");
      return;
    }
    this.uploading += files.length;
    this.showToast("Uploading " + files.length + " file" + (files.length === 1 ? "" : "s") + "\u2026");
    let results = [];
    try {
      results = await this.deps.uploadFiles(pid, files);
    } finally {
      this.uploading -= files.length;
    }
    const ok = results.filter((r) => r.path !== void 0);
    const bad = results.filter((r) => r.path === void 0);
    if (ok.length > 0) {
      this.mutate((d) => {
        for (const r of ok) d.docs = addDoc(d, pid, docKindFor(r.path), docNameFor(r.path), r.path).docs;
      });
      this.deps.requestPointerHealth?.([pid]);
      void this.deps.ensureProject?.(pid);
    }
    if (bad.length > 0) this.showToast("Could not upload " + bad.map((b) => b.name).join(", ") + ": " + (bad[0].error ?? "error"));
    else this.showToast(ok.length === 1 ? "Uploaded " + ok[0].name : "Uploaded " + ok.length + " files");
  }
  // ---- Project view: chats --------------------------------------------------
  /** Project members minus archived/trashed chats. */
  visibleMembers(state, pid) {
    const explicit = projectMembers(state, pid);
    const dir = state.projects[pid]?.dir;
    const byFolder = dir !== void 0 ? this.deps.folderMembers?.(dir) ?? [] : [];
    const all = [.../* @__PURE__ */ new Set([...explicit, ...byFolder.filter((sid) => state.memberships[sid] === void 0 || state.memberships[sid] === pid)])];
    return all.filter((sid) => this.deps.isHidden?.(sid) !== true);
  }
  renderProjectChats(state, pid) {
    const section = this.doc.createElement("div");
    section.className = "wr-psection";
    const members = this.visibleMembers(state, pid);
    const label = this.doc.createElement("div");
    label.className = "wr-plabel";
    label.textContent = "Chats";
    const count = this.doc.createElement("span");
    count.className = "wr-count";
    count.textContent = String(members.length);
    label.appendChild(count);
    section.appendChild(label);
    const recents = this.deps.recents();
    const order = new Map(recents.map((r, i) => [r.id, i]));
    const sorted = [...members].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
    for (const sid of sorted) {
      const known = recents.find((r) => r.id === sid);
      const row = known ?? { id: sid, title: this.deps.sessionTitle(sid), workspaceId: null, blank: false, repeat: "project" };
      const el = this.renderRecentRow(state, { ...row, repeat: "none", hueKey: state.stripes[sid] }, "M:", () => [
        { label: "Rename", action: () => this.startRename(sid, this.deps.sessionTitle(sid)) },
        { label: "Remove from project", action: () => this.moveChat(sid, null) },
        { label: "Stripe color", action: () => {
        }, swatchFor: sid },
        { label: "Move to bin", action: () => this.binChat(sid) }
      ]);
      if (el !== null) section.appendChild(el);
    }
    if (members.length === 0 && !this.addChatsOpen) {
      const empty = this.doc.createElement("div");
      empty.className = "wr-empty";
      empty.textContent = "No chats yet. Start one here, or add existing chats.";
      section.appendChild(empty);
    }
    const actions = this.doc.createElement("div");
    actions.className = "wr-pactions";
    if (this.deps.createSession !== void 0) {
      const newChat = this.doc.createElement("button");
      newChat.className = "wr-pbtn wr-pbtn-primary";
      newChat.textContent = "+ New chat";
      newChat.title = "Start a new chat in this project";
      newChat.addEventListener("click", () => {
        void this.newChatInProject(pid);
      });
      actions.appendChild(newChat);
    }
    const add = this.doc.createElement("button");
    add.className = "wr-pbtn";
    add.textContent = this.addChatsOpen ? "Done" : "Add chats\u2026";
    add.setAttribute("aria-expanded", String(this.addChatsOpen));
    add.addEventListener("click", () => {
      this.addChatsOpen = !this.addChatsOpen;
      this.addChatsQ = "";
      this.render();
    });
    actions.appendChild(add);
    section.appendChild(actions);
    if (this.addChatsOpen) section.appendChild(this.renderAddChats(state, pid));
    return section;
  }
  /** Searchable picker of chats not in this project; a click adds one (picker stays open). */
  renderAddChats(state, pid) {
    const box = this.doc.createElement("div");
    box.className = "wr-picker";
    const search = this.doc.createElement("input");
    search.className = "wr-pfield";
    search.dataset.keep = "addchats";
    search.placeholder = "Find a chat to add";
    search.value = this.addChatsQ;
    const list = this.doc.createElement("div");
    list.className = "wr-pickerlist";
    const fill = () => {
      list.replaceChildren();
      const q = this.addChatsQ.trim().toLowerCase();
      const snap = this.deps.store.getSnapshot();
      const rows = this.deps.recents().filter((r) => snap.memberships[r.id] !== pid && (q.length === 0 || r.title.toLowerCase().includes(q))).slice(0, 40);
      if (rows.length === 0) {
        const empty = this.doc.createElement("div");
        empty.className = "wr-empty";
        empty.textContent = q.length > 0 ? "No matching chats" : "Every chat is already here";
        list.appendChild(empty);
      }
      for (const r of rows) {
        const item = this.doc.createElement("button");
        item.className = "wr-pickitem";
        const t = this.doc.createElement("span");
        t.className = "wr-title";
        t.textContent = r.title;
        item.appendChild(t);
        const other = snap.memberships[r.id];
        if (other !== void 0 && snap.projects[other] !== void 0) {
          const tag = this.doc.createElement("span");
          tag.className = "wr-time";
          tag.textContent = snap.projects[other].name;
          tag.title = "Currently in " + snap.projects[other].name + ", adding moves it";
          item.appendChild(tag);
        }
        const plus = this.doc.createElement("span");
        plus.className = "wr-pickplus";
        plus.textContent = "+";
        item.appendChild(plus);
        item.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.moveChat(r.id, pid);
        });
        list.appendChild(item);
      }
    };
    search.addEventListener("input", () => {
      this.addChatsQ = search.value;
      fill();
    });
    search.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") {
        this.addChatsOpen = false;
        this.render();
      }
    });
    box.appendChild(search);
    box.appendChild(list);
    fill();
    setTimeout(() => {
      if (search.isConnected && this.doc.activeElement?.tagName !== "INPUT") search.focus();
    }, 0);
    return box;
  }
  async newChatInProject(pid) {
    if (this.deps.startProjectChat !== void 0) {
      const sid = await this.deps.startProjectChat(pid);
      if (sid === null) {
        this.showToast("Could not start a new chat");
        return;
      }
      if (this.deps.store.getSnapshot().memberships[sid] !== pid) this.mutate((d) => {
        d.memberships = moveSessionToProject(d, sid, pid).memberships;
      });
      return;
    }
    const dir = await this.deps.ensureProject?.(pid) ?? void 0;
    const id = await this.deps.createSession?.(dir);
    if (id === null || id === void 0) {
      this.showToast("Could not start a new chat");
      return;
    }
    this.mutate((d) => {
      d.memberships = moveSessionToProject(d, id, pid).memberships;
    });
    this.deps.openSession?.(id);
  }
  /**
   * Move a chat into a project (or out, with null) immediately. Journaled
   * membership-only (no doc side effects), so the toast's Undo restores it.
   */
  moveChat(sessionId, toProjectId) {
    const state = this.deps.store.getSnapshot();
    if (state.memberships[sessionId] === (toProjectId ?? void 0)) return;
    const base = planCarryover(state, sessionId, toProjectId, {});
    const plan = { ...base, adds: [], rebinds: [], removes: [] };
    let entryId;
    this.mutate((d) => {
      Object.assign(d, applyCarryover(d, plan));
      entryId = d.journal[0]?.id;
    });
    const title = this.deps.sessionTitle(sessionId);
    const where = toProjectId === null ? "Removed \u201C" + title + "\u201D from " + (state.projects[state.memberships[sessionId] ?? ""]?.name ?? "the project") : "Moved \u201C" + title + "\u201D to " + (state.projects[toProjectId]?.name ?? "project");
    this.showToast(where, () => this.mutate((d) => {
      const r = revertCarryover(d, entryId);
      if (r !== null) Object.assign(d, r);
    }));
  }
  // ---- Project view: files --------------------------------------------------
  renderProjectFiles(state, pid) {
    const section = this.doc.createElement("div");
    section.className = "wr-psection wr-files" + (this.dropActive ? " wr-drop" : "");
    const docs = listDocs(state, pid).sort((a, b) => a.name.localeCompare(b.name));
    const health = this.deps.docHealth?.() ?? {};
    const label = this.doc.createElement("div");
    label.className = "wr-plabel";
    label.textContent = "Files";
    const count = this.doc.createElement("span");
    count.className = "wr-count";
    count.textContent = String(docs.length);
    label.appendChild(count);
    section.appendChild(label);
    if (this.deps.uploadFiles !== void 0) {
      const picker = this.doc.createElement("input");
      picker.type = "file";
      picker.multiple = true;
      picker.hidden = true;
      picker.addEventListener("change", () => {
        const fl = [...picker.files ?? []];
        picker.value = "";
        void this.uploadInto(pid, fl);
      });
      const up = this.doc.createElement("button");
      up.className = "wr-pbtn wr-upload";
      up.textContent = this.uploading > 0 ? "Uploading\u2026" : "\u2191 Upload files";
      up.addEventListener("click", () => picker.click());
      const bar = this.doc.createElement("div");
      bar.className = "wr-pactions wr-pactions-top";
      bar.appendChild(up);
      bar.appendChild(picker);
      section.appendChild(bar);
    }
    for (const d of docs) section.appendChild(this.renderFileRow(pid, d.id, d.kind, d.name, d.pointer, health[d.id]?.status === "missing"));
    const field = this.doc.createElement("input");
    field.className = "wr-pfield";
    field.dataset.keep = "files-" + pid;
    field.placeholder = "Or link a server path / URL, then Enter";
    field.setAttribute("aria-label", "Add a file by path or URL");
    field.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.addFiles(pid, field.value);
      }
    });
    field.addEventListener("paste", (ev) => {
      const text = ev.clipboardData?.getData("text/plain") ?? "";
      if (text.includes("\n")) {
        ev.preventDefault();
        this.addFiles(pid, text);
      }
    });
    section.appendChild(field);
    const hint = this.doc.createElement("div");
    hint.className = "wr-phint";
    hint.textContent = "Drop files here to upload them. Linked paths stay where they are.";
    section.appendChild(hint);
    const missing = docs.filter((d) => health[d.id]?.status === "missing");
    if (missing.length > 0) {
      const clean = this.doc.createElement("button");
      clean.className = "wr-plink";
      clean.textContent = "Remove " + missing.length + " missing file" + (missing.length === 1 ? "" : "s");
      clean.addEventListener("click", () => {
        const before = this.deps.store.getSnapshot().docs;
        this.mutate((d) => {
          for (const m of missing) d.docs = removeDoc(d, m.id).docs;
        });
        this.showToast("Removed " + missing.length + " missing", () => this.mutate((d) => {
          d.docs = before;
        }));
      });
      section.appendChild(clean);
    }
    section.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      if (!this.dropActive) {
        this.dropActive = true;
        section.classList.add("wr-drop");
      }
    });
    section.addEventListener("dragleave", (ev) => {
      if (ev.relatedTarget instanceof Node && section.contains(ev.relatedTarget)) return;
      this.dropActive = false;
      section.classList.remove("wr-drop");
    });
    section.addEventListener("drop", (ev) => {
      ev.preventDefault();
      this.dropActive = false;
      const dt = ev.dataTransfer;
      const text = dt?.getData("text/uri-list") || dt?.getData("text/plain") || "";
      const dropped = [...dt?.files ?? []];
      if (dropped.length > 0) void this.uploadInto(pid, dropped);
      else if (text.trim().length > 0) this.addFiles(pid, text);
      else this.render();
    });
    return section;
  }
  /** Add every pointer in `text` to the project; name and kind are inferred. */
  addFiles(pid, text) {
    const pointers = parsePointers(text);
    if (pointers.length === 0) return;
    const state = this.deps.store.getSnapshot();
    const existing = new Set(listDocs(state, pid).map((d) => d.pointer));
    const fresh = pointers.filter((p) => !existing.has(p));
    if (fresh.length === 0) {
      this.showToast(pointers.length === 1 ? "Already in this project" : "All of those are already here");
      this.render();
      return;
    }
    const beforeDocs = state.docs;
    this.mutate((d) => {
      for (const p of fresh) d.docs = addDoc(d, pid, docKindFor(p), docNameFor(p), p).docs;
    });
    this.deps.requestPointerHealth?.([pid]);
    void this.deps.ensureProject?.(pid);
    this.showToast(fresh.length === 1 ? "Added " + docNameFor(fresh[0]) : "Added " + fresh.length + " files", () => this.mutate((d) => {
      d.docs = beforeDocs;
    }));
  }
  renderFileRow(pid, docId, kind, name2, pointer, missing) {
    const row = this.doc.createElement("div");
    row.className = "wr-row wr-file" + (missing ? " wr-missing" : "");
    row.dataset.docId = docId;
    const icon = this.doc.createElement("span");
    icon.className = "wr-ficon wr-ficon-" + (isUrl(pointer) ? "link" : kind);
    icon.textContent = isUrl(pointer) ? "\u2197" : kind === "data" ? "{ }" : kind === "snippet" ? "</>" : "\u2261";
    row.appendChild(icon);
    const text = this.doc.createElement("span");
    text.className = "wr-ftext";
    const n = this.doc.createElement("span");
    n.className = "wr-title";
    n.textContent = name2;
    const dir = this.doc.createElement("span");
    dir.className = "wr-fdir";
    dir.textContent = missing ? "Not found \xB7 " + shortDir(pointer) : shortDir(pointer);
    text.appendChild(n);
    text.appendChild(dir);
    row.appendChild(text);
    row.title = pointer + (missing ? "\n(not found on the server)" : "");
    row.addEventListener("click", (ev) => {
      if (ev.target.closest(".wr-dots,.wr-menu") !== null) return;
      this.openPointer(pointer);
    });
    const menuKey = "F:" + docId;
    row.appendChild(this.dotsButton(menuKey));
    if (this.openMenuKey === menuKey) {
      row.appendChild(this.menuEl(menuKey, [
        { label: "Open", action: () => this.openPointer(pointer) },
        { label: "Copy path", action: () => {
          void this.copy(pointer);
        } },
        { label: "Remove from project", action: () => {
          const before = this.deps.store.getSnapshot().docs;
          this.mutate((d) => {
            d.docs = removeDoc(d, docId).docs;
          });
          this.showToast("Removed " + name2, () => this.mutate((d) => {
            d.docs = before;
          }));
        } }
      ]));
    }
    void pid;
    return row;
  }
  openPointer(pointer) {
    if (isUrl(pointer)) {
      this.doc.defaultView?.open(pointer, "_blank", "noopener");
      return;
    }
    if (this.deps.openFile?.(pointer) === true) return;
    void this.copy(pointer, "No editor available, path copied");
  }
  async copy(text, message = "Path copied") {
    try {
      await this.doc.defaultView?.navigator.clipboard.writeText(text);
      this.showToast(message);
    } catch {
      this.showToast(text);
    }
  }
  // ---- Toast ----------------------------------------------------------------
  showToast(text, undo) {
    if (this.toast?.timer !== void 0) clearTimeout(this.toast.timer);
    const timer = setTimeout(() => {
      if (this.toast?.timer === timer) {
        this.toast = null;
        this.render();
      }
    }, 6e3);
    this.toast = { text, undo, timer };
    this.render();
  }
  renderToast() {
    const t = this.toast;
    const el = this.doc.createElement("div");
    el.className = "wr-toast";
    el.setAttribute("role", "status");
    const msg = this.doc.createElement("span");
    msg.className = "wr-title";
    msg.textContent = t.text;
    el.appendChild(msg);
    if (t.undo !== void 0) {
      const undo = this.doc.createElement("button");
      undo.textContent = "Undo";
      undo.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const fn = t.undo;
        if (t.timer !== void 0) clearTimeout(t.timer);
        this.toast = null;
        fn?.();
        this.render();
      });
      el.appendChild(undo);
    }
    return el;
  }
  // ---- Recents ----------------------------------------------------------
  renderRecents(state) {
    const section = this.doc.createElement("div");
    section.className = "wr-section wr-grow wr-recents" + (this.isCollapsed(state, "recents") ? " wr-collapsed" : "") + (this.isExpanded(state, "recents") ? " wr-expanded" : "");
    section.appendChild(this.sectionHeader(state, "recents", "Recents", null));
    this.recentsBox = section;
    if (this.isCollapsed(state, "recents")) return section;
    const scroller = this.doc.createElement("div");
    scroller.className = "wr-scroller";
    section.appendChild(scroller);
    this.recentsBox = section;
    this.mountRecentsList(state, scroller);
    return section;
  }
  mountRecentsList(state, scroller) {
    const filter = this.filterQ.trim().toLowerCase();
    const rows = this.deps.recents().filter((r) => filter.length === 0 || r.title.toLowerCase().includes(filter));
    this.list?.destroy();
    this.list = new VirtualList(scroller, {
      className: "wr-vl",
      keepKey: "recents",
      rowHeight: ROW_HEIGHT,
      overscan: 6,
      count: () => rows.length,
      renderRow: (i) => this.renderRecentRow(state, rows[i])
    });
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    if (typeof ResizeObserver !== "undefined") {
      const list = this.list;
      this.resizeObs = new ResizeObserver(() => list.refresh());
      this.resizeObs.observe(list.viewport);
    }
  }
  /** Re-render only the Recents list (keeps the filter input focus). */
  refreshRecents() {
    if (this.recentsBox === null || this.panel === null) return;
    const scroller = this.recentsBox.querySelector(".wr-scroller");
    if (!(scroller instanceof HTMLElement)) return;
    this.mountRecentsList(this.deps.store.getSnapshot(), scroller);
  }
  renderRecentRow(state, row, menuPrefix = "R:", items) {
    if (row === void 0) return null;
    const el = this.doc.createElement("div");
    el.className = "wr-row";
    el.dataset.sessionId = row.id;
    if (this.deps.currentId?.() === row.id) el.classList.add("wr-current");
    el.addEventListener("click", (ev) => {
      if (ev.target.closest(".wr-dots,.wr-menu,.wr-rename") !== null || ev.detail > 1) return;
      this.deps.openSession?.(row.id);
    });
    if (row.hueKey !== void 0) {
      const stripe = this.doc.createElement("span");
      stripe.className = "wr-stripe";
      stripe.style.background = stripeColor(row.hueKey);
      el.appendChild(stripe);
    }
    el.appendChild(this.chatTitle(row.id, row.title));
    const unreadMark = this.unreadMark(this.deps.isUnread?.(row.id) === true);
    if (unreadMark !== null) el.appendChild(unreadMark);
    if (row.repeat === "pinned") {
      const badge = this.doc.createElement("span");
      badge.className = "wr-badge";
      badge.textContent = "\u{1F4CC}";
      el.appendChild(badge);
    } else if (row.repeat === "project") {
      const badge = this.doc.createElement("span");
      badge.className = "wr-badge";
      badge.textContent = "\u{1F5C2}";
      el.appendChild(badge);
    }
    const working = this.workingBadge(this.deps.isRunning?.(row.id) === true);
    if (working !== null) {
      el.classList.add("wr-isworking");
      el.appendChild(working);
    }
    const age = relativeAge(row.updatedAt);
    if (age.length > 0 && working === null) {
      const time = this.doc.createElement("span");
      time.className = "wr-time";
      time.textContent = age;
      el.appendChild(time);
    }
    const menuKey = menuPrefix + row.id;
    el.appendChild(this.dotsButton(menuKey));
    if (this.openMenuKey === menuKey) el.appendChild(this.menuEl(menuKey, items !== void 0 ? items() : this.recentsMenuItems(row.id)));
    return el;
  }
  recentsMenuItems(sessionId) {
    const state = this.deps.store.getSnapshot();
    const isPinned = state.pinned.includes(sessionId) || state.sessionFolders[sessionId] !== void 0;
    const items = [
      { label: "Rename", action: () => this.startRename(sessionId, this.deps.sessionTitle(sessionId)) },
      isPinned ? { label: "Unpin", action: () => this.mutate((d) => Object.assign(d, unpinSession(d, sessionId))) } : { label: "Pin to rail", action: () => this.mutate((d) => {
        d.pinned = [sessionId, ...d.pinned];
      }) }
    ];
    const current = state.memberships[sessionId];
    for (const pid of state.projectOrder) {
      const p = state.projects[pid];
      if (p === void 0) continue;
      const isCurrent = current === pid;
      items.push({
        label: (isCurrent ? "\u2713 In " : "Move to ") + p.name,
        action: () => this.moveChat(sessionId, pid)
      });
    }
    if (current !== void 0) {
      items.push({ label: "Remove from " + (state.projects[current]?.name ?? "project"), action: () => this.moveChat(sessionId, null) });
    }
    items.push({ label: "Stripe color", action: () => {
    }, swatchFor: sessionId });
    items.push({ label: "Move to bin", action: () => this.binChat(sessionId) });
    return items;
  }
  // ---- Shared chrome ------------------------------------------------------
  dotsButton(menuKey) {
    const dots = this.doc.createElement("button");
    dots.className = "wr-dots";
    dots.textContent = "\u22EF";
    dots.title = "Actions";
    dots.setAttribute("aria-expanded", String(this.openMenuKey === menuKey));
    dots.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.openMenuKey = this.openMenuKey === menuKey ? null : menuKey;
      this.render();
    });
    return dots;
  }
  menuEl(menuKey, items) {
    const menu = this.doc.createElement("div");
    menu.className = "wr-menu";
    const closer = (ev) => {
      const target = ev.target;
      if (menu.contains(target)) return;
      this.openMenuKey = null;
      this.render();
      this.doc.removeEventListener("click", closer);
    };
    for (const item of items) {
      if (item.swatchFor !== void 0) {
        menu.appendChild(this.swatchPicker(item.label, item.swatchFor));
        continue;
      }
      const btn = this.doc.createElement("button");
      btn.textContent = item.label;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.doc.removeEventListener("click", closer);
        this.openMenuKey = null;
        try {
          item.action();
        } catch (error) {
          this.deps.warn?.(String(error));
        }
      });
      menu.appendChild(btn);
    }
    this.doc.addEventListener("click", closer);
    void menuKey;
    return menu;
  }
  // ---- Rename (triple-click a title, or \u22ef -> Rename) -------------------
  /** Title cell for a chat row: the label, or the inline rename field. */
  chatTitle(id, text) {
    const shown = this.pendingTitles.get(id) ?? text;
    const r = this.renaming;
    if (r !== null && r.id === id) {
      const input = this.doc.createElement("input");
      input.className = "wr-rename" + (r.error !== void 0 ? " wr-rename-error" : "");
      input.value = r.draft;
      input.maxLength = 200;
      input.setAttribute("aria-label", "Chat name");
      input.title = r.error ?? "Enter to save \xB7 Esc to cancel";
      const track = () => {
        if (this.renaming === null || this.renameInput !== input) return;
        this.renaming.draft = input.value;
        this.renaming.selStart = input.selectionStart ?? input.value.length;
        this.renaming.selEnd = input.selectionEnd ?? input.value.length;
      };
      for (const evName of ["input", "keyup", "mouseup", "select"]) input.addEventListener(evName, track);
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          ev.preventDefault();
          track();
          this.commitRename();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          this.cancelRename();
        }
      });
      for (const evName of ["click", "dblclick", "mousedown"]) input.addEventListener(evName, (ev) => ev.stopPropagation());
      input.addEventListener("blur", () => {
        setTimeout(() => {
          if (this.renaming === null || this.renaming.id !== id) return;
          if (this.renameInput !== input) return;
          if (this.doc.activeElement === input) return;
          this.commitRename();
        }, 0);
      });
      this.renameInput = input;
      setTimeout(() => {
        if (!input.isConnected || this.renameInput !== input || this.renaming === null) return;
        input.focus();
        input.setSelectionRange(this.renaming.selStart, this.renaming.selEnd);
      }, 0);
      return input;
    }
    const title = this.doc.createElement("span");
    title.className = "wr-title";
    title.textContent = shown;
    title.title = shown + " \u2014 triple-click to rename";
    title.addEventListener("click", (ev) => {
      if (ev.detail === 3) {
        ev.stopPropagation();
        this.startRename(id, shown);
      }
    });
    return title;
  }
  /** Begin renaming a chat inline (whole title selected, like a file manager). */
  startRename(id, current) {
    if (this.deps.renameSession === void 0) return;
    const text = this.pendingTitles.get(id) ?? current;
    this.openMenuKey = null;
    this.renaming = { id, draft: text, selStart: 0, selEnd: text.length };
    this.render();
  }
  cancelRename() {
    this.renaming = null;
    this.renameInput = null;
    this.render();
  }
  commitRename() {
    const r = this.renaming;
    if (r === null) return;
    this.renaming = null;
    this.renameInput = null;
    const title = r.draft.trim();
    const before = this.pendingTitles.get(r.id) ?? this.deps.sessionTitle(r.id);
    if (title.length === 0 || title === before || this.deps.renameSession === void 0) {
      this.render();
      return;
    }
    this.pendingTitles.set(r.id, title);
    this.render();
    void this.deps.renameSession(r.id, title).then((res) => {
      if (res.ok) this.pendingTitles.set(r.id, res.title);
      else {
        this.pendingTitles.delete(r.id);
        this.deps.warn?.("workspace-rail: rename failed: " + res.error);
        this.renaming = { id: r.id, draft: title, selStart: 0, selEnd: title.length, error: "Rename failed: " + res.error };
      }
      this.render();
    }, (error) => {
      this.pendingTitles.delete(r.id);
      this.renaming = { id: r.id, draft: title, selStart: 0, selEnd: title.length, error: "Rename failed: " + String(error) };
      this.render();
    });
  }
  /** Drop optimistic titles the host has caught up with. */
  settlePendingTitles() {
    for (const [id, title] of this.pendingTitles) {
      if (this.deps.sessionTitle(id) === title) this.pendingTitles.delete(id);
    }
  }
  /**
   * Inline stripe picker: a labelled row of the 8 palette swatches plus
   * "none". Picking applies immediately and closes the menu; the current hue
   * is marked, so the choice is visible before and after.
   */
  swatchPicker(label, entityId) {
    const snap = this.deps.store.getSnapshot();
    const current = entityId.startsWith("project:") ? snap.projects[entityId.slice(8)]?.hueKey : snap.stripes[entityId];
    const wrap = this.doc.createElement("div");
    wrap.className = "wr-swatches";
    const cap = this.doc.createElement("div");
    cap.className = "wr-swcap";
    cap.textContent = label;
    wrap.appendChild(cap);
    const grid = this.doc.createElement("div");
    grid.className = "wr-swgrid";
    const projectId = entityId.startsWith("project:") ? entityId.slice(8) : null;
    const pick = (value) => {
      this.openMenuKey = null;
      if (projectId !== null) {
        this.mutate((d) => {
          const p = d.projects[projectId];
          if (p !== void 0 && value !== null) d.projects[projectId] = { ...p, hueKey: value };
        });
        return;
      }
      this.mutate((d) => {
        if (value === null) delete d.stripes[entityId];
        else d.stripes[entityId] = value;
      });
    };
    const none = this.doc.createElement("button");
    none.className = "wr-sw wr-sw-none";
    none.title = "No stripe";
    none.setAttribute("aria-label", "No stripe");
    none.setAttribute("aria-pressed", String(current === void 0));
    none.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pick(null);
    });
    if (projectId === null) grid.appendChild(none);
    for (const key of HUE_KEYS) {
      const sw = this.doc.createElement("button");
      sw.className = "wr-sw";
      sw.style.background = HUES[key].stripe;
      sw.title = HUES[key].label;
      sw.setAttribute("aria-label", HUES[key].label);
      sw.setAttribute("aria-pressed", String(current === key));
      sw.addEventListener("click", (ev) => {
        ev.stopPropagation();
        pick(key);
      });
      grid.appendChild(sw);
    }
    wrap.appendChild(grid);
    return wrap;
  }
  option(value, label) {
    const opt = this.doc.createElement("option");
    opt.value = value;
    opt.textContent = label;
    return opt;
  }
  mutate(fn) {
    this.deps.store.update(fn);
    this.render();
  }
  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.close();
  }
};

// src/sync.ts
var API_BASE = "/workspace-rail/api";
var MARKER = "dsh-workspace-rail";
function mergeRailStates(host, local) {
  const out = normalizeRailState(host);
  let added = 0;
  const dicts = ["folders", "projects", "sessionFolders", "memberships", "stripes", "docs"];
  for (const k of dicts) {
    const h = out[k];
    for (const [id, v] of Object.entries(local[k])) {
      if (!(id in h)) {
        h[id] = v;
        added++;
      }
    }
  }
  for (const id of local.pinned) if (!out.pinned.includes(id)) {
    out.pinned.push(id);
    added++;
  }
  for (const id of local.folderOrder) if (!out.folderOrder.includes(id) && out.folders[id] !== void 0) out.folderOrder.push(id);
  for (const id of local.projectOrder) if (!out.projectOrder.includes(id) && out.projects[id] !== void 0) out.projectOrder.push(id);
  for (const [sid, pid] of Object.entries(out.memberships)) if (out.projects[pid] === void 0) delete out.memberships[sid];
  if (out.importedSessionPinAt === null && local.importedSessionPinAt !== null) out.importedSessionPinAt = local.importedSessionPinAt;
  return { merged: out, added };
}
function createRailSync(opts) {
  let ready = false;
  let rev;
  let pending = null;
  let timer = null;
  let inflight = null;
  const debounce = opts.debounceMs ?? 400;
  const jsonHeaders = { "content-type": "application/json", "x-requested-with": MARKER, accept: "application/json" };
  async function get() {
    try {
      const r = await opts.fetch(API_BASE + "/state", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!r.ok) {
        opts.warn?.("workspace-rail: state read failed (" + r.status + ")");
        return null;
      }
      const body = await r.json();
      return { rev: typeof body.rev === "number" ? body.rev : 0, state: body.state === null || body.state === void 0 ? null : normalizeRailState(body.state) };
    } catch (error) {
      opts.warn?.("workspace-rail: state read failed: " + String(error));
      return null;
    }
  }
  async function put(state) {
    const r = await opts.fetch(API_BASE + "/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: jsonHeaders,
      body: JSON.stringify({ baseRev: rev, state })
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 409) {
      rev = body.rev;
      if (body.state !== null && body.state !== void 0) opts.adopt(normalizeRailState(body.state));
      return;
    }
    if (!r.ok) {
      opts.warn?.("workspace-rail: save failed (" + r.status + "): " + String(body.error ?? ""));
      return;
    }
    rev = body.rev;
  }
  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, debounce);
  }
  async function run() {
    if (inflight !== null) {
      await inflight;
      if (pending !== null) schedule();
      return;
    }
    const s = pending;
    pending = null;
    if (s === null) return;
    inflight = put(s).catch((error) => {
      opts.warn?.("workspace-rail: save failed: " + String(error));
    }).finally(() => {
      inflight = null;
    });
    await inflight;
  }
  return {
    get ready() {
      return ready;
    },
    async hydrate(local) {
      const host = await get();
      if (host === null) return null;
      rev = host.rev;
      const base = host.state ?? normalizeRailState({});
      const { merged, added } = mergeRailStates(base, local);
      ready = true;
      if (added > 0 || host.state === null) {
        pending = merged;
        await run();
      }
      return merged;
    },
    save(state) {
      if (!ready) return;
      pending = state;
      schedule();
    },
    async refresh() {
      if (!ready || pending !== null || inflight !== null || timer !== null) return null;
      const host = await get();
      if (host === null || host.rev === rev || host.state === null) return null;
      rev = host.rev;
      return host.state;
    },
    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await run();
    }
  };
}

// src/pin-import.ts
var SESSION_PIN_LOCAL_KEY = "dsh.session-pin.pinned";
var SESSION_PIN_NS = "session-pin";
function normalizePins(pinned, colors) {
  const ids = Array.isArray(pinned) ? pinned.filter((x) => typeof x === "string") : [];
  const colorMap = {};
  if (colors !== null && typeof colors === "object") {
    for (const [id, color] of Object.entries(colors)) {
      if (typeof id === "string" && typeof color === "string") colorMap[id] = color;
    }
  }
  return { pinned: ids, colors: colorMap };
}
function unwrapScopeValue(snap) {
  if (snap === null || typeof snap !== "object") return snap;
  const rec = snap;
  return "value" in rec ? rec.value : snap;
}
function readLocalPins(storage) {
  try {
    const raw = storage !== void 0 ? storage.getItem(SESSION_PIN_LOCAL_KEY) : null;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return normalizePins(parsed.pinned, parsed.colors);
    }
  } catch {
  }
  return null;
}
function readPinsFromScope(settingsScope, storage) {
  try {
    const bound = settingsScope?.bind?.({ namespace: SESSION_PIN_NS });
    const snap = bound?.getSnapshot?.();
    const value = unwrapScopeValue(snap);
    if (value !== null && value !== void 0) return normalizePins(value.pinned, value.colors);
  } catch {
  }
  return readLocalPins(storage) ?? { pinned: [], colors: {} };
}
function pinsFromDescribe(value) {
  const list = Array.isArray(value?.namespaces) ? value.namespaces : [];
  const row = list.find((n) => n !== null && typeof n === "object" && n.ns === SESSION_PIN_NS);
  if (row === void 0 || row.value === null || typeof row.value !== "object") return void 0;
  const v = row.value;
  return normalizePins(v.pinned, v.colors);
}
function readNativePins(list, timeoutMs = 5e3) {
  const read = () => {
    try {
      const snap = list?.getSnapshot();
      if (snap === void 0 || !Array.isArray(snap.pinnedSessionIds)) return null;
      if (snap.phase !== void 0 && snap.phase !== "ready") return void 0;
      return snap.pinnedSessionIds.filter((x) => typeof x === "string");
    } catch {
      return null;
    }
  };
  const now = read();
  if (now !== void 0 || list === void 0) return Promise.resolve(now ?? null);
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        unsubscribe?.();
      } catch {
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      unsubscribe = list.subscribe(() => {
        const v = read();
        if (v !== void 0) finish(v);
      });
    } catch {
      finish(null);
    }
  });
}
async function readPinsFromRemote(remote, storage, opts = {}) {
  const tries = Math.max(1, opts.tries ?? 3);
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (remote !== void 0 && typeof remote.describe === "function") {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const response = await remote.describe();
        if (response?.ok === true) {
          const pins = pinsFromDescribe(response.value);
          if (pins !== void 0) return pins;
          break;
        }
        if (attempt === tries) opts.warn?.("workspace-rail: session-pin describe failed: " + String(response?.error?.code ?? response?.error?.message ?? "not ok"));
      } catch (error) {
        if (attempt === tries) opts.warn?.("workspace-rail: session-pin describe failed: " + String(error));
      }
      if (attempt < tries) await sleep(opts.retryMs ?? 1200);
    }
  }
  return readLocalPins(storage) ?? { pinned: [], colors: {} };
}
async function readPinsWithoutScope(workspaces, remote, storage, opts = {}) {
  const native = await readNativePins(workspaces, opts.nativeTimeoutMs);
  if (native !== null && native.length > 0) return { pinned: native, colors: {} };
  return readPinsFromRemote(remote, storage, opts);
}

// src/tab-title.ts
var NO_CHAT_TITLE = "DeepSeek Harness";
var TAB_FRAMES = [
  "=^._.^= \u222B",
  "=^._.^=\xA0 \u222B",
  "=^-.-^= \u222B",
  "=^._.^= \u0283"
];
var FRAME_MS = 400;
var SNIPPET_WORDS = 6;
var SNIPPET_CHARS = 40;
var SEEN_SKEW_MS = 3e3;
var DASHES = /[\u2012\u2013\u2014\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/;
function cleanText(raw) {
  let s = String(raw ?? "");
  s = s.replace(/```[^\n]*\n?/g, " ");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/(^|\s)#{1,6}\s+/g, "$1");
  s = s.replace(/(^|\s)>\s+/g, "$1");
  s = s.replace(/[*_`~]+/g, "");
  s = s.replace(new RegExp("(\\S)\\s*" + DASHES.source + "+\\s*(?=\\S)", "g"), "$1, ");
  s = s.replace(new RegExp(DASHES.source, "g"), " ");
  s = s.replace(/[\s\u00A0]+/g, " ").trim();
  s = s.replace(/^[,;:.\s]+/, "").replace(/\s+,/g, ",").replace(/,(\s*,)+/g, ",");
  s = s.replace(/(\u2026|\.\.\.)$/, "").trimEnd();
  return s;
}
function snippet(raw, maxWords = SNIPPET_WORDS, maxChars = SNIPPET_CHARS) {
  const text = cleanText(raw);
  if (text.length === 0) return "";
  const words = text.split(" ");
  let out = words.slice(0, maxWords).join(" ");
  let cut = words.length > maxWords;
  if (out.length > maxChars) {
    cut = true;
    const head = out.slice(0, maxChars + 1);
    const space = head.lastIndexOf(" ");
    out = space >= Math.floor(maxChars / 2) ? head.slice(0, space) : out.slice(0, maxChars);
  }
  out = out.replace(/[\s,;:.]+$/, "");
  out = out.replace(/[([{"'\u201C\u2018]+$/, "").trimEnd();
  return cut ? out + "..." : out;
}
function lastMessageText(turns) {
  if (!Array.isArray(turns)) return "";
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (typeof t?.response === "string" && t.response.trim().length > 0) return t.response;
    if (typeof t?.prompt === "string" && t.prompt.trim().length > 0) return t.prompt;
  }
  return "";
}
function lastReplyText(turns) {
  if (!Array.isArray(turns)) return "";
  for (let i = turns.length - 1; i >= 0; i--) {
    const r = turns[i]?.response;
    if (typeof r === "string" && r.trim().length > 0) return r;
  }
  return lastMessageText(turns);
}
function computeTabTitle(input) {
  const frameOf = (i) => {
    const n = TAB_FRAMES.length;
    return TAB_FRAMES[(Math.trunc(i) % n + n) % n];
  };
  if (input.unread.length > 0) {
    if (input.current?.running === true) {
      return { title: "(" + input.unread.length + ") " + frameOf(input.frame), kind: "unread-working", animate: true };
    }
    let newest = input.unread[0];
    for (const u of input.unread) if (u.completedAt > newest.completedAt) newest = u;
    const words2 = snippet(newest.text) || snippet(newest.title) || "new reply";
    return { title: "(" + input.unread.length + ") " + words2, kind: "unread", animate: false };
  }
  const cur = input.current;
  if (cur === null) return { title: NO_CHAT_TITLE, kind: "no-chat", animate: false };
  if (cur.running) {
    return { title: frameOf(input.frame), kind: "working", animate: true };
  }
  const words = snippet(cur.text) || snippet(cur.title) || NO_CHAT_TITLE;
  return { title: words, kind: "idle", animate: false };
}
function normalizeTitle(s) {
  return s.replace(/[\t\n\f\r ]+/g, " ").trim();
}
function createSeenTracker(opts = {}) {
  const cap = opts.cap ?? 500;
  const skew = opts.skewMs ?? SEEN_SKEW_MS;
  const seen = /* @__PURE__ */ new Map();
  const mine = /* @__PURE__ */ new Map();
  const read = () => {
    seen.clear();
    let raw = null;
    try {
      raw = opts.load?.() ?? null;
    } catch {
      raw = null;
    }
    if (raw === null || typeof raw !== "object") return false;
    for (const [id, at] of Object.entries(raw)) if (typeof at === "number" && Number.isFinite(at)) seen.set(id, at);
    return true;
  };
  const persist = () => {
    if (opts.save === void 0) return;
    let entries = [...seen.entries()];
    if (entries.length > cap) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, cap);
      seen.clear();
      for (const [id, at] of entries) seen.set(id, at);
    }
    try {
      opts.save(Object.fromEntries(entries));
    } catch {
    }
  };
  if (!read()) {
    try {
      for (const [id, at] of Object.entries(opts.seed?.() ?? {})) if (typeof at === "number" && Number.isFinite(at)) seen.set(id, at);
    } catch {
    }
    persist();
  }
  return {
    markSeen(id, at) {
      const prev = seen.get(id);
      if (prev !== void 0 && prev >= at) return false;
      seen.set(id, at);
      mine.set(id, at);
      persist();
      return true;
    },
    seenAt: (id) => seen.get(id),
    isUnread(id, completedAt) {
      if (completedAt === void 0) return false;
      const s = seen.get(id);
      if (s === void 0) return true;
      return completedAt > s + (mine.get(id) === s ? 0 : skew);
    },
    reload() {
      read();
    }
  };
}
function collectUnread(opts) {
  if (opts.onScreen !== null && opts.visible) {
    const c = opts.completedAt(opts.onScreen);
    if (c !== void 0) opts.seen.markSeen(opts.onScreen, c);
  }
  const out = [];
  for (const e of opts.entries) {
    if (e.blank === true || opts.visible && e.id === opts.onScreen) continue;
    const c = opts.completedAt(e.id);
    if (c === void 0 || !opts.seen.isUnread(e.id, c)) continue;
    out.push({ id: e.id, completedAt: c, title: e.title });
  }
  return out;
}

// src/tab-chrome.ts
var OWN_ATTR = "data-workspace-rail-icon";
var isIconLink = (n) => n.nodeType === 1 && n.tagName === "LINK" && /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(n.rel ?? "");
function createTabChrome(doc, icons) {
  const head = doc.head ?? doc.documentElement;
  const parked = [];
  const own = [];
  let wanted = null;
  let foreign = doc.title;
  let stopped = false;
  const park = (el) => {
    if (el.hasAttribute(OWN_ATTR)) return;
    parked.push({ el, next: el.nextSibling });
    el.remove();
  };
  for (const el of [...head.querySelectorAll("link")]) if (isIconLink(el)) park(el);
  for (const icon of icons) {
    const el = doc.createElement("link");
    el.setAttribute(OWN_ATTR, "");
    el.rel = icon.rel;
    if (icon.type !== void 0) el.type = icon.type;
    if (icon.sizes !== void 0) el.setAttribute("sizes", icon.sizes);
    el.href = icon.href;
    head.appendChild(el);
    own.push(el);
  }
  const applyTitle = () => {
    if (wanted === null) return;
    const current = doc.title;
    if (current === wanted) return;
    if (current.length > 0) foreign = current;
    doc.title = wanted;
  };
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const observer = Observer === void 0 ? null : new Observer((records) => {
    if (stopped) return;
    for (const r of records) for (const n of r.addedNodes) if (isIconLink(n)) park(n);
    applyTitle();
  });
  observer?.observe(head, { childList: true, subtree: true, characterData: true });
  return {
    setTitle(title) {
      if (stopped) return;
      wanted = normalizeTitle(title);
      applyTitle();
    },
    foreignTitle: () => foreign,
    stop() {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      for (const el of own) el.remove();
      own.length = 0;
      for (const { el, next } of parked.reverse()) {
        if (next !== null && next.parentNode === head) head.insertBefore(el, next);
        else head.appendChild(el);
      }
      parked.length = 0;
      if (wanted !== null && doc.title === wanted) doc.title = foreign;
      wanted = null;
    }
  };
}

// assets/rail-favicon.svg
var rail_favicon_default = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="512" height="512" shape-rendering="crispEdges" role="img" aria-label="Workspace rail icon"><title>Workspace rail icon</title><rect width="8" height="8" fill="#1F2937"/><rect x="1" y="1" width="1" height="6" fill="#3B82F6"/><g fill="#E5E7EB"><rect x="3" y="1" width="4" height="1"/><rect x="3" y="3" width="3" height="1"/><rect x="3" y="5" width="4" height="1"/></g></svg>\n';

// assets/rail-icon-32.png
var rail_icon_32_default = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAa0lEQVRYw2OU1zT/zzCAgGkgLR91AAMDAwMLuoBM5H4U/pPljij8Y/u2UGShlZPP4AqBUQewkKoBPQ6HfAiMOoDkNEBqOUAozQx4CIw6YLQcGHUAzcsBdDDaHhh0DhgtB0YdwDjaNxzxDgAAatARn6ews+4AAAAASUVORK5CYII=";

// assets/rail-icon-192.png
var rail_icon_192_default = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAACd0lEQVR42u3csU3DUBhGUYIyBlLqTBApHdQswIQs4Np0noQ9wgZx9fSw7jkD2K+5+rvvdLneHi8Q9Tr7ATCTAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQdh79g7evn6Hf//1+H/r9bV2Gfp/n7h+fQ7/vApAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkCYA0AZAmANIEQJoASBMAaQIgTQCkDd8FOrrRuzTM5QKQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApNkF2rGty+wn/GtH301yAUgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDS7ALtOPruDc+5AKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpdoF2bOsy+wlpo3eZXADSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANLtAO0bv0jCXC0CaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQdrpcb4/Zj4BZXADSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmAtD+h+xLfve2axQAAAABJRU5ErkJggg==";

// assets/rail-icon-180.png
var rail_icon_180_default = "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAACU0lEQVR42u3dsW0CQRBAUZ/lMpCIqQCJDGI34AppgBhnroQ+ziFHzoLu670CVht8TTa703a3nz8g4vPdF4BnEjQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImpSvUQdvfn6HXfp2Pg459+96GXZn7g6n72Fnm9CkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRn2jMEajVyv5zVMaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImxdb3gs/rH61xC96EJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KZwwW1ri2zyMTmhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJsfW94PP61xi5XW9CkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpgibFMwYLPq9fPxOaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEmZtrv9/O5LwLOY0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJETQpgiZF0KQImhRBkyJoUgRNiqBJ+QeyTRLHbhEARQAAAABJRU5ErkJggg==";

// src/tab-icons.ts
var png = (b64) => "data:image/png;base64," + b64;
var RAIL_ICONS = [
  { rel: "icon", type: "image/svg+xml", href: "data:image/svg+xml," + encodeURIComponent(rail_favicon_default) },
  { rel: "icon", type: "image/png", sizes: "32x32", href: png(rail_icon_32_default) },
  { rel: "icon", type: "image/png", sizes: "192x192", href: png(rail_icon_192_default) },
  { rel: "apple-touch-icon", sizes: "180x180", href: png(rail_icon_180_default) }
];

// src/client.ts
var React = __toESM(require("react"), 1);
var name = "workspace-rail";
var inject = ["sessions", "workspaces", "slots"];
var LOCAL_STORAGE_KEY = "dsh.workspace-rail.state";
var COMPLETED_KEY = "dsh.workspace-rail.completedAt";
var SEEN_KEY = "dsh.workspace-rail.seenAt";
var WINDOW_REQUEST_BATCH = 100;
var WINDOW_REQUEST_COOLDOWN_MS = 3e4;
function apply(ctx) {
  const disposers = [];
  const warn = (message) => {
    try {
      ctx.logger?.warn?.(message);
    } catch {
    }
  };
  const rawSessions = ctx.sessions;
  const rawWorkspaces = ctx.workspaces;
  const sessions = rawSessions?.list ?? rawSessions;
  const workspaces = rawWorkspaces?.list ?? rawWorkspaces;
  const optionalInject = (deps, cb) => {
    ;
    ctx.inject?.(deps, cb);
  };
  let settingsScope;
  let railScope;
  let remoteSettings;
  const local = createLocalStoragePersistence(LOCAL_STORAGE_KEY);
  let store;
  const sync = createRailSync({
    fetch: (url, init) => fetch(url, init),
    adopt: (next) => {
      store.replace(next, false);
      local.save(store.getSnapshot());
    },
    warn
  });
  store = createRailStore({
    load: () => local.load(),
    save: (state) => {
      local.save(state);
      sync.save(state);
    }
  });
  let catalog = [];
  let currentId = null;
  const titleById = /* @__PURE__ */ new Map();
  let lastWindowRequest = 0;
  let runningIds = /* @__PURE__ */ new Set();
  const activity = createActivityTracker({
    load: () => {
      try {
        const raw = globalThis.localStorage?.getItem(COMPLETED_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save: (stamps) => {
      try {
        globalThis.localStorage?.setItem(COMPLETED_KEY, JSON.stringify(stamps));
      } catch {
      }
    }
  });
  let binEntries = [];
  const localStore = () => {
    try {
      return typeof window !== "undefined" ? window.localStorage : void 0;
    } catch {
      return void 0;
    }
  };
  const applyImportedPins = (imported) => {
    if (store.getSnapshot().importedSessionPinAt !== null) return;
    store.update((d) => {
      if (imported.pinned.length > 0 && d.pinned.length === 0) d.pinned = imported.pinned.slice(0, 500);
      for (const [id, color] of Object.entries(imported.colors)) {
        if (id.length > 0 && color.length > 0 && d.stripes[id] === void 0) d.stripes[id] = color;
      }
      d.importedSessionPinAt = Date.now();
    });
  };
  let pinImportRunning = false;
  const importSessionPins = () => {
    if (store.getSnapshot().importedSessionPinAt !== null) return;
    if (settingsScope !== void 0) {
      applyImportedPins(readPinsFromScope(settingsScope, localStore()));
      return;
    }
    if (pinImportRunning) return;
    pinImportRunning = true;
    void readPinsWithoutScope(workspaces, remoteSettings, localStore(), { warn }).then(applyImportedPins).catch((error) => warn("workspace-rail: session-pin import failed: " + String(error))).finally(() => {
      pinImportRunning = false;
    });
  };
  void sync.hydrate(store.getSnapshot()).then((merged) => {
    if (merged !== null) {
      store.replace(merged, false);
      local.save(merged);
    }
    importSessionPins();
  });
  const refresh = () => {
    void sync.refresh().then((next) => {
      if (next !== null) {
        store.replace(next, false);
        local.save(next);
      }
    });
  };
  if (typeof document !== "undefined") {
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(refresh, 45e3);
    disposers.push(() => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(iv);
    });
  }
  const windowsFromScope = () => {
    try {
      const value = unwrapScopeValue(railScope?.getSnapshot?.());
      if (value !== null && value !== void 0 && typeof value === "object" && value.windows !== void 0 && value.windows !== null) return value.windows;
    } catch {
    }
    return {};
  };
  const health = {};
  const docHealthProvider = () => health;
  const healthInflight = /* @__PURE__ */ new Set();
  const requestPointerHealth = (projectIds) => {
    for (const pid of projectIds) {
      if (healthInflight.has(pid)) continue;
      healthInflight.add(pid);
      setTimeout(() => {
        void sync.flush().then(() => fetch(API_BASE + "/health?project=" + encodeURIComponent(pid), { credentials: "same-origin" })).then((r) => r.ok ? r.json() : {}).then((res) => {
          let changed = false;
          for (const [id, h] of Object.entries(res)) {
            if (health[id]?.status !== h.status) {
              health[id] = h;
              changed = true;
            }
          }
          if (changed) panel?.render();
        }).catch((error) => warn("workspace-rail: file check failed: " + String(error))).finally(() => healthInflight.delete(pid));
      }, 600);
    }
  };
  const requestWindows = () => {
    const now = Date.now();
    if (now - lastWindowRequest < WINDOW_REQUEST_COOLDOWN_MS) return;
    if (railScope?.set === void 0) return;
    const have = windowsFromScope();
    const missing = catalog.filter((e) => have[e.id] === void 0 && !e.blank).slice(0, WINDOW_REQUEST_BATCH).map((e) => e.id);
    if (missing.length === 0) return;
    lastWindowRequest = now;
    try {
      void railScope.set("indexRequests", missing);
    } catch {
    }
  };
  const archivedIds = () => {
    try {
      return new Set(workspaces?.getSnapshot().archivedSessionIds ?? []);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  };
  const rebuild = () => {
    if (sessions === void 0) {
      catalog = [];
      return;
    }
    const snap = sessions.getSnapshot();
    const archived = archivedIds();
    currentId = typeof snap.current === "string" ? snap.current : snap.ids.find((id) => (snap.byId[id]?.retainedBy?.mainView ?? 0) > 0) ?? Object.keys(snap.byId).find((id) => (snap.byId[id]?.retainedBy?.mainView ?? 0) > 0) ?? null;
    const binned = store.getSnapshot().binned;
    const running = /* @__PURE__ */ new Set();
    const bin = [];
    catalog = [];
    const keyById = /* @__PURE__ */ new Map();
    const toMs = (v) => typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : void 0;
    activity.observe((function* () {
      for (const id of snap.ids) {
        const row = snap.byId[id];
        if (row !== void 0) yield { id, running: row.running === true, updatedAt: toMs(row.updatedAt) };
      }
    })());
    for (const id of snap.ids) {
      const row = snap.byId[id];
      if (row?.running === true) running.add(typeof row.parentId === "string" && row.parentId.length > 0 ? row.parentId : id);
      if (row !== void 0 && (typeof row.parentId === "string" && row.parentId.length > 0 || row.origin === "subagent")) continue;
      if (archived.has(id)) continue;
      const binnedAt = binned[id];
      if (binnedAt !== void 0) {
        const t = typeof row?.title === "string" && row.title.length > 0 ? row.title : row?.displayTitle ?? id;
        bin.push({ id, title: t, at: binnedAt });
        continue;
      }
      const promptAt = toMs(row?.updatedAt);
      const key = activity.keyOf({ id, running: row?.running === true, updatedAt: promptAt });
      keyById.set(id, key);
      const updatedAt = key > 0 ? key : promptAt;
      const explicit = typeof row?.title === "string" && row.title.length > 0 ? row.title : void 0;
      const title = explicit ?? (row?.blank === true ? "New chat" : row?.displayTitle ?? id);
      const cwd = typeof row?.cwd === "string" ? row.cwd : void 0;
      catalog.push({ id, title, workspaceId: null, blank: row?.blank ?? false, updatedAt, cwd });
    }
    catalog = orderByActivity(catalog, (e) => keyById.get(e.id) ?? 0);
    if (catalog.length > 5e3) catalog = catalog.slice(0, 5e3);
    titleById.clear();
    for (const e of catalog) titleById.set(e.id, e.title);
    for (const b of bin) titleById.set(b.id, b.title);
    runningIds = running;
    binEntries = bin.sort((a, b) => b.at - a.at);
  };
  const readStamps = (key) => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const seen = createSeenTracker({
    load: () => readStamps(SEEN_KEY),
    save: (stamps) => {
      try {
        globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify(stamps));
      } catch {
      }
    },
    // First run: everything finished so far counts as read.
    seed: () => readStamps(COMPLETED_KEY) ?? {}
  });
  let tabChrome = null;
  let tabFrame = 0;
  let tabTimer = null;
  let panelOpen = false;
  const projectionAsked = /* @__PURE__ */ new Set();
  const outlineOf = (id) => {
    const snap = sessions?.getSnapshot();
    const p = snap?.projectionsBySession?.[id];
    const outline = p?.values?.turnOutline;
    if (outline === void 0 && !projectionAsked.has(id)) {
      projectionAsked.add(id);
      const rs = rawSessions;
      try {
        void rs?.refreshProjections?.(id)?.catch?.(() => {
        });
      } catch {
      }
    }
    return outline;
  };
  const stopTabTimer = () => {
    if (tabTimer !== null) {
      clearInterval(tabTimer);
      tabTimer = null;
    }
  };
  let unreadIds = /* @__PURE__ */ new Set();
  let unreadKey = "";
  const unreadSubs = /* @__PURE__ */ new Set();
  const unreadCount = { get: () => unreadIds.size, subscribe: (fn) => {
    unreadSubs.add(fn);
    return () => {
      unreadSubs.delete(fn);
    };
  } };
  const updateTab = () => {
    if (typeof document === "undefined") return false;
    let changed = false;
    try {
      const visible = document.visibilityState === "visible";
      const curEntry = currentId !== null && !panelOpen ? catalog.find((e) => e.id === currentId) : void 0;
      const onScreen = curEntry !== void 0 && !curEntry.blank ? curEntry : void 0;
      const unread = collectUnread({ entries: catalog, completedAt: (id) => activity.completedAt(id), seen, onScreen: onScreen?.id ?? null, visible });
      const key = unread.map((u) => u.id).join("|");
      if (key !== unreadKey) {
        unreadKey = key;
        unreadIds = new Set(unread.map((u) => u.id));
        changed = true;
        for (const fn of [...unreadSubs]) {
          try {
            fn();
          } catch {
          }
        }
      }
      if (!store.getSnapshot().tabTitle) {
        stopTabTimer();
        tabChrome?.stop();
        tabChrome = null;
        return changed;
      }
      if (tabChrome === null) tabChrome = createTabChrome(document, RAIL_ICONS);
      const running = onScreen !== void 0 && runningIds.has(onScreen.id);
      let newest = unread[0];
      for (const u of unread) if (u.completedAt > newest.completedAt) newest = u;
      const result = computeTabTitle({
        unread: unread.map((u) => ({ ...u, text: u === newest && !running ? lastReplyText(outlineOf(u.id)) : "" })),
        current: onScreen === void 0 ? null : {
          id: onScreen.id,
          running,
          text: unread.length === 0 && !running ? lastMessageText(outlineOf(onScreen.id)) : "",
          title: onScreen.title
        },
        frame: tabFrame
      });
      tabChrome.setTitle(result.title);
      if (result.animate && tabTimer === null) tabTimer = setInterval(() => {
        tabFrame++;
        if (updateTab()) redrawMarkers();
      }, FRAME_MS);
      else if (!result.animate) stopTabTimer();
    } catch (error) {
      warn("workspace-rail: tab title failed: " + String(error));
    }
    return changed;
  };
  const redrawMarkers = () => {
    try {
      lastSig = signature();
      panel?.render();
    } catch {
    }
  };
  if (typeof document !== "undefined") {
    const onTabVis = () => {
      if (updateTab()) redrawMarkers();
    };
    const onStorage = (ev) => {
      if (ev.key === SEEN_KEY) {
        seen.reload();
        if (updateTab()) redrawMarkers();
      }
    };
    document.addEventListener("visibilitychange", onTabVis);
    globalThis.addEventListener?.("storage", onStorage);
    disposers.push(() => {
      document.removeEventListener("visibilitychange", onTabVis);
      globalThis.removeEventListener?.("storage", onStorage);
      stopTabTimer();
      tabChrome?.stop();
      tabChrome = null;
    });
  }
  try {
    optionalInject(["layout"], (sub) => {
      const info = sub.layout?.panelInfo;
      if (typeof info?.getSnapshot !== "function") return;
      const read = () => {
        let open = false;
        try {
          open = (info.getSnapshot()?.activePanelId ?? null) !== null;
        } catch {
          open = false;
        }
        if (open !== panelOpen) {
          panelOpen = open;
          if (updateTab()) redrawMarkers();
        }
      };
      read();
      const off = info.subscribe?.(read);
      sub.effect?.(() => () => {
        try {
          off?.();
        } catch {
        }
        if (panelOpen) {
          panelOpen = false;
          if (updateTab()) redrawMarkers();
        }
      }, "workspace-rail: layout panel");
    });
  } catch (error) {
    warn("workspace-rail: layout hook unavailable: " + String(error));
  }
  const openSession = (id) => {
    const ctxAny = ctx;
    if (uiWorkspace !== null) {
      try {
        uiWorkspace.openSession(id);
        return;
      } catch {
      }
    }
    if (typeof ctxAny.sessions?.open === "function") {
      try {
        ctxAny.sessions.open(id);
        return;
      } catch {
      }
    }
    const candidates = [
      () => ctxAny.sessions?.open?.(id),
      () => ctxAny.workspace?.openSession?.(id),
      () => ctxAny.connection?.api?.session?.open?.({ sessionId: id })
    ];
    for (const tryFn of candidates) {
      try {
        const r = tryFn();
        if (r !== void 0 && r !== null) return;
      } catch {
      }
    }
  };
  const search = (query) => {
    const state = store.getSnapshot();
    const docs = buildSearchDocs(catalog, state, windowsFromScope());
    const hits = rankResults(docs, query, Date.now());
    return hits.slice(0, 8).map((h) => ({ ...h, title: titleById.get(h.id) ?? h.id }));
  };
  let lastSig = "";
  const signature = () => catalogSignature(catalog, currentId, binEntries.length, runningIds) + "|u:" + unreadKey;
  if (sessions !== void 0) {
    disposers.push(sessions.subscribe(() => {
      rebuild();
      updateTab();
      const sig = signature();
      if (sig === lastSig) return;
      lastSig = sig;
      requestWindows();
      panel?.render();
    }));
  }
  if (workspaces !== void 0) {
    disposers.push(workspaces.subscribe(() => {
      rebuild();
      updateTab();
      panel?.render();
    }));
  }
  const ensureProjectImpl = async (pid) => {
    const p = store.getSnapshot().projects[pid];
    if (p === void 0) return null;
    try {
      await sync.flush();
      const r = await fetch(API_BASE + "/project", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-requested-with": "dsh-workspace-rail" },
        body: JSON.stringify({ id: p.id, name: p.name, dir: p.dir, instructions: composeAgentsMd({ ...p, hasFiles: Object.values(store.getSnapshot().docs).some((d) => d.projectId === pid) }) })
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || typeof body.dir !== "string") {
        warn("workspace-rail: project folder failed: " + String(body.error ?? r.status));
        return null;
      }
      if (store.getSnapshot().projects[pid]?.dir !== body.dir) {
        store.update((d) => {
          const cur = d.projects[pid];
          if (cur !== void 0) d.projects[pid] = { ...cur, dir: body.dir };
        });
      }
      return body.dir;
    } catch (error) {
      warn("workspace-rail: project folder failed: " + String(error));
      return null;
    }
  };
  const slots = ctx.slots;
  const view = createViewStore();
  const seat = { mount: () => {
  }, unmount: () => {
  } };
  const setView = (next) => {
    view.set(next);
    if (next === "rail") seat.mount();
    else seat.unmount();
  };
  let uiWorkspace = null;
  try {
    ;
    ctx.inject?.(["uiWorkspace"], (sub) => {
      const u = sub.uiWorkspace;
      if (u !== null && typeof u?.openSession === "function" && typeof u.connectWorkspace === "function") uiWorkspace = u;
    });
  } catch (error) {
    warn("workspace-rail: workspace UI hook unavailable: " + String(error));
  }
  let remoteSession = null;
  try {
    ;
    ctx.inject?.(["remote", "remote.session"], (sub) => {
      const rs = sub.remote?.session;
      if (typeof rs?.modelCatalog === "function" && typeof rs?.selectModel === "function") remoteSession = rs;
    });
  } catch (error) {
    warn("workspace-rail: model hook unavailable: " + String(error));
  }
  try {
    optionalInject(["remote", "remote.settings"], (sub) => {
      const rs = sub.remote?.settings;
      if (typeof rs?.describe !== "function") return;
      remoteSettings = rs;
      sub.effect?.(() => () => {
        if (remoteSettings === rs) remoteSettings = void 0;
      }, "workspace-rail: settings rpc");
    });
  } catch (error) {
    warn("workspace-rail: settings rpc unavailable: " + String(error));
  }
  try {
    optionalInject(["settingsScope"], (sub) => {
      const binder = sub.settingsScope;
      if (binder === void 0 || binder === null) return;
      settingsScope = binder;
      try {
        railScope = binder.bind?.({ namespace: "workspace-rail" });
      } catch {
      }
      sub.effect?.(() => () => {
        if (settingsScope === binder) {
          settingsScope = void 0;
          railScope = void 0;
        }
      }, "workspace-rail: settings scope");
      requestWindows();
    });
  } catch (error) {
    warn("workspace-rail: settings scope unavailable: " + String(error));
  }
  let openFileImpl = null;
  try {
    const ctxInject = ctx;
    ctxInject.inject?.(["betterSidebar"], (sub) => {
      const bs = sub.betterSidebar;
      if (bs?.openFile === void 0 || Array.isArray(bs.features) && !bs.features.includes("openFile")) return;
      openFileImpl = (path) => {
        const snap = (rawSessions?.list ?? rawSessions)?.getSnapshot();
        const sid = currentId ?? catalog[0]?.id;
        if (sid === void 0) throw new Error("no chat open");
        bs.openFile({ sessionId: sid, cwd: snap?.byId?.[sid]?.cwd }, path);
      };
    });
  } catch (error) {
    warn("workspace-rail: editor hook unavailable: " + String(error));
  }
  disposers.push(store.subscribe(() => {
    rebuild();
    updateTab();
  }));
  let panel = null;
  if (typeof document !== "undefined") {
    try {
      rebuild();
      panel = new RailPanel({
        store,
        sessionTitle: (id) => titleById.get(id) ?? id,
        isHidden: (id) => archivedIds().has(id) || store.getSnapshot().binned[id] !== void 0,
        isRunning: (id) => runningIds.has(id),
        isUnread: (id) => unreadIds.has(id),
        binned: () => binEntries,
        deleteForever: async (id) => {
          try {
            if (uiWorkspace !== null && typeof uiWorkspace.archiveSession === "function") {
              await uiWorkspace.archiveSession(id);
            } else {
              const ws = rawWorkspaces;
              if (typeof ws?.archiveSession !== "function") return false;
              await ws.archiveSession(id);
            }
            setTimeout(() => {
              if (archivedIds().has(id)) store.update((d) => {
                delete d.binned[id];
              });
            }, 2e3);
            return true;
          } catch (error) {
            warn("workspace-rail: delete failed: " + String(error));
            return false;
          }
        },
        recents: () => {
          const state = store.getSnapshot();
          const pinnedSet = /* @__PURE__ */ new Set([...state.pinned, ...Object.keys(state.sessionFolders)]);
          const keep = (e) => !e.blank || e.id === currentId || pinnedSet.has(e.id) || state.memberships[e.id] !== void 0;
          return buildRecents(catalog.filter(keep).map((e) => e.blank ? { ...e, blank: false } : e), {
            pinnedIds: [...pinnedSet],
            memberships: state.memberships,
            projects: state.projects,
            stripes: state.stripes
          });
        },
        search,
        openSession,
        requestWindows: () => requestWindows(),
        docHealth: docHealthProvider,
        requestPointerHealth,
        warn,
        currentId: () => currentId,
        createSession: async (dir) => {
          const ctxAny = ctx;
          if (typeof ctxAny.sessions?.create !== "function") return null;
          let cwd = dir;
          if (cwd === void 0) {
            try {
              const snap = (rawSessions?.list ?? rawSessions)?.getSnapshot();
              const c = currentId !== null ? snap?.byId?.[currentId]?.cwd : void 0;
              if (typeof c === "string" && c.length > 0) cwd = c;
            } catch {
            }
          }
          try {
            return await ctxAny.sessions.create(cwd !== void 0 ? { cwd } : void 0);
          } catch (error) {
            warn("workspace-rail: new chat failed: " + String(error));
            return null;
          }
        },
        folderMembers: (dir) => {
          const want = dir.replace(/\/+$/, "");
          return catalog.filter((e) => typeof e.cwd === "string" && e.cwd.replace(/\/+$/, "") === want).map((e) => e.id);
        },
        startProjectChat: async (pid) => {
          const dir = await ensureProjectImpl(pid);
          if (dir === null) return null;
          const ws = rawWorkspaces;
          if (uiWorkspace === null || typeof ws?.create !== "function") {
            const ctxAny = ctx;
            const id = await ctxAny.sessions?.create?.({ cwd: dir }).catch(() => null);
            if (typeof id === "string") openSession(id);
            return typeof id === "string" ? id : null;
          }
          try {
            const view2 = await ws.create({ path: dir });
            const name2 = store.getSnapshot().projects[pid]?.name;
            if (name2 !== void 0 && view2.title !== name2) {
              try {
                await ws.rename?.(view2.workspaceId, name2);
              } catch {
              }
            }
            if (store.getSnapshot().projects[pid]?.workspaceId !== view2.workspaceId) {
              store.update((d) => {
                const cur = d.projects[pid];
                if (cur !== void 0) d.projects[pid] = { ...cur, workspaceId: view2.workspaceId };
              });
            }
            const sid = await uiWorkspace.connectWorkspace(view2.workspaceId);
            const m = store.getSnapshot().projects[pid]?.model;
            if (m !== void 0 && remoteSession !== null) {
              try {
                const r = await remoteSession.selectModel({ sessionId: sid, provider: m.provider, model: m.model, ...m.reasoningEffort !== void 0 ? { reasoningEffort: m.reasoningEffort } : {} });
                if (!r.ok) warn("workspace-rail: project model not applied: " + String(r.error?.message ?? ""));
              } catch (error) {
                warn("workspace-rail: project model not applied: " + String(error));
              }
            }
            uiWorkspace.openSession(sid);
            return sid;
          } catch (error) {
            warn("workspace-rail: project chat failed: " + String(error));
            return null;
          }
        },
        ensureProject: async (pid) => ensureProjectImpl(pid),
        modelCatalog: async () => {
          if (remoteSession === null) return null;
          try {
            const r = await remoteSession.modelCatalog();
            if (!r.ok) return null;
            return (r.value?.groups ?? []).filter((g) => Array.isArray(g.models) && g.models.length > 0);
          } catch {
            return null;
          }
        },
        deleteProjectFolder: async (pid) => {
          try {
            await sync.flush();
            const r = await fetch(API_BASE + "/project/delete", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json", "x-requested-with": "dsh-workspace-rail" },
              body: JSON.stringify({ id: pid })
            });
            return r.ok;
          } catch {
            return false;
          }
        },
        uploadFiles: async (pid, files) => {
          await sync.flush();
          const out = [];
          for (const f of files) {
            try {
              const r = await fetch(API_BASE + "/upload?project=" + encodeURIComponent(pid) + "&name=" + encodeURIComponent(f.name), {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/octet-stream", "x-requested-with": "dsh-workspace-rail" },
                body: f
              });
              const body = await r.json().catch(() => ({}));
              if (r.ok && typeof body.path === "string") {
                out.push({ name: body.name ?? f.name, path: body.path });
                if (typeof body.dir === "string" && store.getSnapshot().projects[pid]?.dir === void 0) {
                  store.update((d) => {
                    const cur = d.projects[pid];
                    if (cur !== void 0) d.projects[pid] = { ...cur, dir: body.dir };
                  });
                }
              } else out.push({ name: f.name, error: String(body.error ?? "HTTP " + r.status) });
            } catch (error) {
              out.push({ name: f.name, error: String(error) });
            }
          }
          return out;
        },
        openFile: (path) => {
          if (openFileImpl === null) return false;
          try {
            openFileImpl(path);
            return true;
          } catch (error) {
            warn("workspace-rail: open file failed: " + String(error));
            return false;
          }
        },
        renameSession: async (id, title) => {
          const ctxAny = ctx;
          let binding;
          try {
            binding = ctxAny.sessions?.binding?.(id);
          } catch {
            binding = void 0;
          }
          const rename = binding?.session?.rename;
          if (typeof rename !== "function") return { ok: false, error: "this chat is not available to rename right now" };
          try {
            const res = await rename.call(binding.session, title);
            if (res?.ok === true) return { ok: true, title: typeof res.value?.title === "string" ? res.value.title : title };
            return { ok: false, error: String(res?.error?.message ?? res?.error?.code ?? "rejected by the host") };
          } catch (error) {
            return { ok: false, error: String(error) };
          }
        },
        onSwitchView: slots !== void 0 ? () => setView("folders") : void 0
      });
      if (slots !== void 0) {
        disposers.push(mountSidebarSeat(slots, panel, view, seat, setView, warn, unreadCount));
        if (view.get() === "rail") seat.mount();
      } else {
        panel.mountLauncher();
        panel.open();
      }
      lastSig = signature();
      updateTab();
      requestWindows();
    } catch (error) {
      warn("workspace-rail: panel mount failed: " + String(error));
      panel = null;
    }
  }
  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
      }
    }
    disposers.length = 0;
    panel?.destroy();
    panel = null;
  };
}
var VIEW_KEY = "dsh.workspace-rail.view";
function createViewStore() {
  let value = "rail";
  try {
    if (globalThis.localStorage?.getItem(VIEW_KEY) === "folders") value = "folders";
  } catch {
  }
  const subs = /* @__PURE__ */ new Set();
  return {
    get: () => value,
    set(v) {
      if (v === value) return;
      value = v;
      try {
        globalThis.localStorage?.setItem(VIEW_KEY, v);
      } catch {
      }
      for (const fn of [...subs]) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    }
  };
}
var unreadBlue = () => typeof document !== "undefined" && document.body?.hasAttribute("data-ds-dark-theme") ? "#4c9aff" : "#1f6feb";
var RAIL_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11"/><path d="M6 2.5v11M8.5 6h3.5M8.5 8.5h3.5M8.5 11h2"/></svg>';
function mountSidebarSeat(slots, panel, view, seat, setView, warn, unread) {
  const h = React.createElement;
  function RailSeat(props) {
    const ref = React.useRef(null);
    const wide = props.wide !== false;
    const unreadN = React.useSyncExternalStore(unread.subscribe, unread.get);
    React.useEffect(() => {
      if (!wide || ref.current === null) return;
      panel.open(ref.current);
      return () => panel.close();
    }, [wide]);
    if (!wide) {
      const label = unreadN > 0 ? "Rail, " + unreadN + (unreadN === 1 ? " unread reply" : " unread replies") : "Rail";
      return h(
        "button",
        {
          type: "button",
          title: label,
          "aria-label": label,
          onClick: () => props.expandSidebar?.(),
          style: { all: "unset", cursor: "pointer", display: "flex", justifyContent: "center", padding: "8px 0", color: "var(--dsw-alias-label-secondary)" }
        },
        h(
          "span",
          { style: { position: "relative", display: "inline-flex" } },
          h("span", { style: { display: "inline-flex" }, dangerouslySetInnerHTML: { __html: RAIL_ICON } }),
          unreadN > 0 ? h("span", { className: "wr-unread-compact", title: "Unread reply", style: { position: "absolute", top: -2, right: -3, width: 7, height: 7, borderRadius: "50%", background: unreadBlue(), boxShadow: "0 0 0 1.5px var(--dsw-specific-sidebar-fill, #fff)" } }) : null
        )
      );
    }
    return h("div", {
      ref,
      className: "wr-seat",
      style: { flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: 4 }
    });
  }
  function RailFooterSwitch(props) {
    const current = React.useSyncExternalStore(view.subscribe, view.get);
    if (current === "rail") return null;
    return h("button", {
      type: "button",
      title: "Back to the rail view",
      onClick: () => setView("rail"),
      style: {
        all: "unset",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        fontSize: 12,
        whiteSpace: "nowrap",
        flex: "none",
        color: "var(--dsw-alias-label-secondary)"
      }
    }, h("span", { style: { display: "inline-flex" }, dangerouslySetInnerHTML: { __html: RAIL_ICON } }), props.wide !== false ? "Rail" : null);
  }
  let seatDispose = null;
  seat.mount = () => {
    if (seatDispose !== null) return;
    try {
      seatDispose = slots.inject("sidebar.workspaces", () => slots.register({
        name: "sidebar.workspaces",
        priority: -2,
        locale: "workspace",
        inject: () => ({})
      }, RailSeat));
    } catch (error) {
      warn("workspace-rail: sidebar seat registration failed: " + String(error));
    }
  };
  seat.unmount = () => {
    const d = seatDispose;
    seatDispose = null;
    try {
      d?.();
    } catch {
    }
    panel.close();
  };
  let footerDispose = null;
  try {
    footerDispose = slots.inject("sidebar.footer.action", () => slots.register({
      name: "sidebar.footer.action",
      id: "dsh-workspace-rail-view",
      order: 40,
      inject: () => ({})
    }, RailFooterSwitch));
  } catch (error) {
    warn("workspace-rail: footer switch registration failed: " + String(error));
  }
  return () => {
    seat.unmount();
    try {
      footerDispose?.();
    } catch {
    }
  };
}
return module.exports; } });
//# sourceMappingURL=client.js.map
