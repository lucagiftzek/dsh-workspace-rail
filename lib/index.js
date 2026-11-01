// src/index.ts
import z from "@deepseek-ai/schemastery";

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

// src/host/session-store.ts
import { readFileSync, readdirSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";
import { homedir } from "node:os";
import { join } from "node:path";

// src/host/transcript.ts
var ZSTD_MAGIC = Buffer.from([40, 181, 47, 253]);
var TEXT_CAP = 200;
function extractTexts(jsonl, cap = TEXT_CAP) {
  const texts = [];
  for (const line of jsonl.split("\n")) {
    if (line.length === 0) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event === null || typeof event !== "object") continue;
    let blocks;
    if (event.type === "user/message") blocks = event.data?.content;
    else if (event.type === "assistant/message") blocks = event.data?.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block?.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
        texts.push(block.text.length > cap ? block.text.slice(0, cap) : block.text);
      }
    }
  }
  return texts;
}

// src/host/session-store.ts
var DEFAULT_FS = { readdir: readdirSync, readFile: readFileSync };
var SessionStore = class {
  root;
  fs;
  headBytes;
  tailBytes;
  constructor(options = {}) {
    this.root = options.root ?? join(homedir(), ".dsh", "sessions");
    this.fs = options.fs ?? DEFAULT_FS;
    this.headBytes = options.headBytes ?? 8 * 1024 * 1024;
    this.tailBytes = options.tailBytes ?? 8 * 1024 * 1024;
  }
  /** List known session ids (uuid directory names, any cwd bucket). */
  listIds() {
    const ids = [];
    let buckets = [];
    try {
      buckets = this.fs.readdir(this.root);
    } catch {
      return ids;
    }
    for (const bucket of buckets) {
      let entries = [];
      try {
        entries = this.fs.readdir(join(this.root, bucket));
      } catch {
        continue;
      }
      for (const entry of entries) ids.push(entry);
    }
    return ids;
  }
  /** Resolve one session id to its transcript path (null when absent). */
  pathFor(id) {
    let buckets = [];
    try {
      buckets = this.fs.readdir(this.root);
    } catch {
      return null;
    }
    for (const bucket of buckets) {
      const candidate = join(this.root, bucket, id, "session.jsonl.zstd");
      try {
        this.fs.readFile(candidate);
        return candidate;
      } catch {
      }
    }
    return null;
  }
  /**
   * Search windows for one session. Head slice yields first messages, tail
   * slice (walked backwards) yields last messages. Truncated boundary frames
   * are skipped by design - windows are previews, not archives.
   */
  readWindows(id, perWindow = 3) {
    const path = this.pathFor(id);
    if (path === null) return null;
    let data;
    try {
      data = this.fs.readFile(path);
    } catch {
      return null;
    }
    const first = this.headTexts(data, perWindow);
    const last = this.tailTexts(data, perWindow);
    return { first, last };
  }
  /**
   * Head texts with early exit: stop decompressing as soon as perWindow
   * texts are found (sync per-frame decompress costs ~4ms - unbounded reads
   * of 16k-frame heads cost a minute; early exit costs milliseconds).
   */
  headTexts(data, perWindow) {
    const head = data.length <= this.headBytes ? data : data.subarray(0, this.headBytes);
    const starts = frameStartsOf(head);
    const texts = [];
    for (let k = 0; k < starts.length - 1 && texts.length < perWindow && k < 500; k++) {
      let chunk = "";
      try {
        chunk = decompressSafe(head.subarray(starts[k], starts[k + 1]));
      } catch {
        continue;
      }
      for (const text of extractTexts(chunk)) {
        texts.push(text);
        if (texts.length >= perWindow) break;
      }
    }
    return texts;
  }
  /**
   * Tail texts, walked backwards with early exit; bounded at 4000 frames
   * (tool-call-heavy tails may hide the last text message deep - beyond the
   * cap the window simply misses, which is acceptable for previews).
   */
  tailTexts(data, perWindow) {
    const tail = data.length <= this.tailBytes ? data : data.subarray(data.length - this.tailBytes);
    const starts = frameStartsOf(tail);
    const texts = [];
    let scanned = 0;
    for (let k = starts.length - 2; k >= 0 && texts.length < perWindow && scanned < 4e3; k--) {
      scanned++;
      let chunk = "";
      try {
        chunk = decompressSafe(tail.subarray(starts[k], starts[k + 1]));
      } catch {
        continue;
      }
      const found = extractTexts(chunk);
      for (let f = found.length - 1; f >= 0 && texts.length < perWindow; f--) texts.unshift(found[f]);
    }
    return texts;
  }
};
function frameStartsOf(data) {
  const magic = Buffer.from([40, 181, 47, 253]);
  const starts = [0];
  for (let i = 1; i < data.length - 4; i++) {
    if (data[i] === magic[0] && data[i + 1] === magic[1] && data[i + 2] === magic[2] && data[i + 3] === magic[3]) starts.push(i);
  }
  starts.push(data.length);
  return starts;
}
function decompressSafe(seg) {
  return zstdDecompressSync(seg).toString();
}

// src/host/pointer-health.ts
import { homedir as homedir2 } from "node:os";
import { statSync } from "node:fs";
var nodeFsStat = {
  stat(path) {
    return statSync(path);
  }
};
function expandPointer(pointer) {
  if (pointer === "~" || pointer.startsWith("~/")) return homedir2() + pointer.slice(1);
  return pointer;
}
function checkPointers(docs, fs = nodeFsStat) {
  const health = {};
  for (const doc of docs) {
    const pointer = doc.pointer.trim();
    if (pointer.length === 0 || /^[a-z]+:\/\//i.test(pointer)) {
      health[doc.id] = { status: "ok" };
      continue;
    }
    const expanded = expandPointer(pointer);
    try {
      fs.stat(expanded);
      health[doc.id] = expanded !== pointer ? { status: "ok", repaired: expanded } : { status: "ok" };
    } catch {
      health[doc.id] = { status: "missing" };
    }
  }
  return health;
}

// src/host/api.ts
import { createHash } from "node:crypto";
import { createWriteStream, promises as fsp, statSync as statSync2 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { basename, dirname, join as join2, resolve } from "node:path";
var API_PREFIX = "/workspace-rail/api";
var MARKER = "dsh-workspace-rail";
var MAX_STATE_BYTES = 4 * 1024 * 1024;
var MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
var hdr = (req, name2) => {
  const v = req.headers[name2];
  return typeof v === "string" ? v : void 0;
};
function isLoopbackHostname(h) {
  if (h === "localhost" || h === "[::1]") return true;
  const p = h.split(".");
  return p.length === 4 && p[0] === "127" && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
}
function isLoopbackPeer(addr) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(String(addr ?? ""));
}
function hostOf(req) {
  try {
    return new URL("http://" + (hdr(req, "host") ?? ""));
  } catch {
    return void 0;
  }
}
function harnessCookieName(host) {
  const d = createHash("sha256").update(host).digest("base64");
  return "dsh-auth-" + d.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function hasCookie(cookie, name2) {
  if (cookie === void 0) return false;
  return cookie.split(";").some((seg) => {
    const at = seg.indexOf("=");
    return at !== -1 && seg.slice(0, at).trim() === name2 && seg.slice(at + 1).trim().length > 0;
  });
}
function harnessTrustedHosts(argv, env) {
  const out = [];
  const add = (v) => {
    const s = v.trim();
    if (s !== "" && !out.includes(s)) out.push(s);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--trusted-host=")) {
      add(a.slice("--trusted-host=".length));
      continue;
    }
    if (a !== "--trusted-host") continue;
    while (i + 1 < argv.length && !(argv[i + 1] ?? "").startsWith("-")) add(argv[++i] ?? "");
  }
  for (const v of (env["DSH_WORKSPACE_RAIL_TRUSTED_HOSTS"] ?? "").split(",")) add(v);
  return out;
}
function checkRead(req, trustedHosts) {
  if (!isLoopbackPeer(req.socket?.remoteAddress)) return { ok: false, status: 403, reason: "non-loopback peer" };
  const host = hostOf(req);
  if (host === void 0) return { ok: false, status: 403, reason: "bad Host" };
  if (!isLoopbackHostname(host.hostname) && !trustedHosts.includes(host.hostname) && !trustedHosts.includes(host.host)) {
    return { ok: false, status: 403, reason: "untrusted Host" };
  }
  if (hdr(req, "sec-fetch-site") === "cross-site") return { ok: false, status: 403, reason: "cross-site" };
  const origin = hdr(req, "origin");
  if (origin !== void 0) {
    try {
      if (new URL(origin).host !== host.host) return { ok: false, status: 403, reason: "Origin mismatch" };
    } catch {
      return { ok: false, status: 403, reason: "bad Origin" };
    }
  }
  return { ok: true, status: 200, reason: "" };
}
function checkMutate(req, trustedHosts) {
  const read = checkRead(req, trustedHosts);
  if (!read.ok) return read;
  const site = hdr(req, "sec-fetch-site");
  if (site !== void 0 && site !== "same-origin") return { ok: false, status: 403, reason: "sec-fetch-site must be same-origin" };
  if (hdr(req, "origin") === void 0) return { ok: false, status: 403, reason: "Origin required" };
  if (hdr(req, "x-requested-with") !== MARKER) return { ok: false, status: 403, reason: "marker header required" };
  const host = hostOf(req);
  if (!hasCookie(hdr(req, "cookie"), harnessCookieName(host.host))) return { ok: false, status: 403, reason: "no harness session cookie" };
  return read;
}
function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        fail(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}
async function writeAtomic(path, data) {
  await fsp.mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp-" + process.pid + "-" + Date.now();
  await fsp.writeFile(tmp, data, { mode: 384 });
  await fsp.rename(tmp, path);
}
function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? homedir3() + p.slice(1) : p;
}
function projectSlug(name2, id) {
  const base = name2.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const tail = id.replace(/[^a-z0-9]/gi, "").slice(-5).toLowerCase();
  return (base.length > 0 ? base : "project") + "-" + tail;
}
function safeFileName(name2) {
  const n = basename(name2.replace(/\\/g, "/")).replace(/[\u0000-\u001f]/g, "").trim().replace(/^\.+/, "");
  return n.length > 0 ? n.slice(0, 180) : "upload";
}
async function freePath(dir, name2) {
  const dot = name2.lastIndexOf(".");
  const stem = dot > 0 ? name2.slice(0, dot) : name2;
  const ext = dot > 0 ? name2.slice(dot) : "";
  for (let i = 1; i < 1e3; i++) {
    const candidate = join2(dir, i === 1 ? name2 : `${stem} (${i})${ext}`);
    try {
      await fsp.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("too many files named " + name2);
}
function createApi(opts) {
  const statePath = join2(opts.dataDir, "state.json");
  let cache2 = null;
  let queue = Promise.resolve();
  const serial = (fn) => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => void 0);
    return p;
  };
  async function load() {
    if (cache2 !== null) return cache2;
    try {
      cache2 = JSON.parse(await fsp.readFile(statePath, "utf8"));
    } catch {
      const seeded = opts.seed();
      cache2 = { rev: 1, state: seeded ?? null };
      if (seeded !== null && seeded !== void 0) {
        await writeAtomic(statePath, JSON.stringify(cache2));
        opts.log?.("workspace-rail: state.json seeded from the settings namespace");
      }
    }
    return cache2;
  }
  const projectDir = (id, name2) => join2(expandHome(opts.projectsRoot), projectSlug(name2, id));
  async function projectFromState(pid) {
    const s = (await load()).state;
    return s?.projects?.[pid] ?? null;
  }
  async function handler(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://rail.local");
      const sub = (url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname).replace(/\/+$/, "") || "/";
      const isRead = req.method === "GET" || req.method === "HEAD";
      const gate = isRead ? checkRead(req, opts.trustedHosts) : checkMutate(req, opts.trustedHosts);
      if (!gate.ok) {
        sendJson(res, gate.status, { error: gate.reason });
        return;
      }
      if (req.method === "GET" && sub === "/state") {
        const f = await load();
        sendJson(res, 200, { rev: f.rev, state: f.state });
        return;
      }
      if (req.method === "PUT" && sub === "/state") {
        const body = JSON.parse((await readBody(req, MAX_STATE_BYTES)).toString("utf8"));
        const out = await serial(async () => {
          const f = await load();
          if (typeof body.baseRev === "number" && body.baseRev !== f.rev) return { status: 409, body: { rev: f.rev, state: f.state } };
          if (body.state === null || typeof body.state !== "object") return { status: 400, body: { error: "state must be an object" } };
          const next = { rev: f.rev + 1, state: body.state };
          await writeAtomic(statePath, JSON.stringify(next));
          cache2 = next;
          return { status: 200, body: { rev: next.rev } };
        });
        sendJson(res, out.status, out.body);
        return;
      }
      if (req.method === "POST" && sub === "/project") {
        const body = JSON.parse((await readBody(req, 256 * 1024)).toString("utf8"));
        if (typeof body.id !== "string" || typeof body.name !== "string") {
          sendJson(res, 400, { error: "id and name required" });
          return;
        }
        const dir = typeof body.dir === "string" && body.dir.length > 0 ? resolve(expandHome(body.dir)) : projectDir(body.id, body.name);
        await fsp.mkdir(dir, { recursive: true });
        if (typeof body.instructions === "string") {
          const agents = join2(dir, "AGENTS.md");
          const text = body.instructions.trim();
          if (text.length > 0) await writeAtomic(agents, text + "\n");
          else await fsp.rm(agents, { force: true });
          try {
            await fsp.chmod(agents, 420);
          } catch {
          }
        }
        sendJson(res, 200, { dir });
        return;
      }
      if (req.method === "POST" && sub === "/project/delete") {
        const body = JSON.parse((await readBody(req, 16 * 1024)).toString("utf8"));
        const project = typeof body.id === "string" ? await projectFromState(body.id) : null;
        if (project === null) {
          sendJson(res, 404, { error: "unknown project" });
          return;
        }
        const dir = resolve(project.dir !== void 0 && project.dir.length > 0 ? expandHome(project.dir) : projectDir(project.id, project.name));
        const root = resolve(expandHome(opts.projectsRoot));
        if (!dir.startsWith(root + "/") || dir === root) {
          sendJson(res, 400, { error: "project folder is outside the projects root; not deleting" });
          return;
        }
        await fsp.rm(dir, { recursive: true, force: true });
        sendJson(res, 200, { deleted: dir });
        return;
      }
      if (req.method === "POST" && sub === "/upload") {
        const pid = url.searchParams.get("project") ?? "";
        const project = await projectFromState(pid);
        if (project === null) {
          sendJson(res, 404, { error: "unknown project" });
          return;
        }
        const dir = project.dir !== void 0 && project.dir.length > 0 ? expandHome(project.dir) : projectDir(project.id, project.name);
        await fsp.mkdir(dir, { recursive: true });
        const target = await freePath(dir, safeFileName(url.searchParams.get("name") ?? "upload"));
        if (resolve(dirname(target)) !== resolve(dir)) {
          sendJson(res, 400, { error: "bad name" });
          return;
        }
        const bytes = await new Promise((ok, fail) => {
          let size = 0;
          const out = createWriteStream(target, { flags: "wx", mode: 420 });
          req.on("data", (c) => {
            size += c.length;
            if (size > MAX_UPLOAD_BYTES) {
              req.destroy();
              out.destroy();
              fsp.rm(target, { force: true }).finally(() => fail(new Error("file larger than 200 MB")));
            }
          });
          req.pipe(out);
          out.on("finish", () => ok(size));
          out.on("error", fail);
          req.on("error", fail);
        });
        sendJson(res, 200, { path: target, name: basename(target), bytes, dir });
        return;
      }
      if (req.method === "GET" && sub === "/health") {
        const pid = url.searchParams.get("project") ?? "";
        const s = (await load()).state;
        const out = {};
        for (const [id, d] of Object.entries(s?.docs ?? {})) {
          if (d.projectId !== pid) continue;
          if (/^https?:\/\//i.test(d.pointer) || d.pointer.length === 0) {
            out[id] = { status: "ok" };
            continue;
          }
          try {
            statSync2(expandHome(d.pointer));
            out[id] = { status: "ok" };
          } catch {
            out[id] = { status: "missing" };
          }
        }
        sendJson(res, 200, out);
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      opts.log?.("workspace-rail: api error: " + String(error?.message ?? error));
      try {
        if (!res.headersSent) sendJson(res, 500, { error: String(error?.message ?? error) });
        else res.end();
      } catch {
      }
    }
  }
  return { handler, load, statePath };
}

// src/host/search.ts
import { execFile } from "node:child_process";
import { promises as fsp2 } from "node:fs";
import { basename as basename2, extname, join as join3, relative } from "node:path";
var TEXT_EXT = /* @__PURE__ */ new Set([
  "md",
  "markdown",
  "txt",
  "text",
  "rst",
  "org",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "ndjson",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "sql",
  "log",
  "env.example",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "sh",
  "bash",
  "zsh",
  "rb",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "swift",
  "lua",
  "vue",
  "svelte",
  "tex",
  "bib",
  "srt",
  "vtt"
]);
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache"]);
var MAX_FILE_BYTES = 25 * 1024 * 1024;
var MAX_FILES = 2e3;
var CHUNK_LINES = 30;
var CHUNK_OVERLAP = 5;
function tokenize(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}
function chunkText(file, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
    const body = lines.slice(start, start + CHUNK_LINES).join("\n");
    if (body.trim().length === 0) continue;
    const toks = tokenize(body);
    const terms = /* @__PURE__ */ new Map();
    for (const t of toks) terms.set(t, (terms.get(t) ?? 0) + 1);
    out.push({ file, line: start + 1, text: body, terms, len: toks.length });
    if (start + CHUNK_LINES >= lines.length) break;
  }
  return out;
}
function rankChunks(chunks, query, limit) {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0 || chunks.length === 0) return [];
  const N = chunks.length;
  const avg = chunks.reduce((s, c) => s + c.len, 0) / N || 1;
  const df = /* @__PURE__ */ new Map();
  for (const t of q) df.set(t, chunks.reduce((n, c) => n + (c.terms.has(t) ? 1 : 0), 0));
  const scored = [];
  for (const c of chunks) {
    let score = 0;
    for (const t of q) {
      const f = c.terms.get(t) ?? 0;
      if (f === 0) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * (f * 2.2) / (f + 1.2 * (1 - 0.75 + 0.75 * c.len / avg));
    }
    if (score > 0) scored.push({ file: c.file, line: c.line, score: Math.round(score * 100) / 100, text: c.text });
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  return scored.slice(0, Math.max(1, Math.min(limit, 30)));
}
function run(cmd, args, timeoutMs = 2e4) {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }, (err, stdout) => err ? fail(err) : ok(stdout));
  });
}
var cache = /* @__PURE__ */ new Map();
async function extractText(path) {
  let st;
  try {
    st = await fsp2.stat(path);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_BYTES) return null;
  const key = st.size + ":" + st.mtimeMs;
  const hit = cache.get(path);
  if (hit !== void 0 && hit.key === key) return hit.text;
  const ext = extname(path).slice(1).toLowerCase();
  let text = null;
  try {
    if (ext === "pdf") text = await run("pdftotext", ["-layout", "-q", path, "-"]);
    else if (ext === "docx") text = (await run("unzip", ["-p", path, "word/document.xml"])).replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    else if (TEXT_EXT.has(ext) || ext === "") {
      const buf = await fsp2.readFile(path);
      if (ext === "" && buf.subarray(0, 4096).includes(0)) text = null;
      else text = buf.toString("utf8");
    }
  } catch {
    text = null;
  }
  cache.set(path, { key, text });
  if (cache.size > 5e3) cache.delete(cache.keys().next().value);
  return text;
}
async function collectFiles(roots) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = async (p, depth) => {
    if (out.length >= MAX_FILES || seen.has(p)) return;
    seen.add(p);
    let st;
    try {
      st = await fsp2.stat(p);
    } catch {
      return;
    }
    if (st.isFile()) {
      out.push(p);
      return;
    }
    if (!st.isDirectory() || depth > 8) return;
    let names = [];
    try {
      names = await fsp2.readdir(p);
    } catch {
      return;
    }
    for (const n of names.sort()) {
      if (n.startsWith(".") || SKIP_DIRS.has(n)) continue;
      await walk(join3(p, n), depth + 1);
    }
  };
  for (const r of roots) await walk(r, 0);
  return out;
}
async function searchProject(dir, linked, query, limit = 8) {
  const roots = [...dir !== null ? [dir] : [], ...linked];
  const files = await collectFiles(roots);
  const chunks = [];
  const unreadable = [];
  for (const f of files) {
    const text = await extractText(f);
    if (text === null) {
      unreadable.push(basename2(f));
      continue;
    }
    const shown = dir !== null && f.startsWith(dir + "/") ? relative(dir, f) : f;
    chunks.push(...chunkText(shown, text));
  }
  return { hits: rankChunks(chunks, query, limit), files: files.length, unreadable: unreadable.slice(0, 20) };
}

// src/index.ts
import { createRequire } from "node:module";
import { homedir as homedir4 } from "node:os";
import { join as join4 } from "node:path";
var name = "workspace-rail";
var inject = ["settings", "webServer"];
var Config = z.object({
  enableRail: z.boolean().default(true),
  stripeEdge: z.union(["right", "left"]).default("right"),
  recentsMaxRows: z.number().step(1).min(100).max(5e4).default(5e3),
  // OFF by default (2026-09-27): the index mirrors chat message text into the
  // shared settings.yaml; one message serialized as invalid YAML there and
  // dsh-web could not boot. Re-enable only once windows live in their own file.
  enableWindowsIndex: z.boolean().default(false),
  windowsMaxSessions: z.number().step(1).min(100).max(1e4).default(2e3),
  enablePointerHealth: z.boolean().default(true),
  projectsRoot: z.string().default("~/dsh-projects"),
  trustedHosts: z.array(z.string()).default([])
});
var RailSchema = z.object({
  schemaVersion: z.number().default(RAIL_SCHEMA_VERSION),
  folders: z.any().default({}),
  folderOrder: z.array(z.string()).default([]),
  projects: z.any().default({}),
  projectOrder: z.array(z.string()).default([]),
  pinned: z.array(z.string()).default([]),
  sessionFolders: z.dict(z.string()).default({}),
  memberships: z.dict(z.string()).default({}),
  stripes: z.dict(z.string()).default({}),
  docs: z.any().default({}),
  importedSessionPinAt: z.any().default(null),
  stripeEdge: z.union(["right", "left"]).default("right"),
  enableRail: z.boolean().default(true),
  recentsMaxRows: z.number().default(5e3),
  journal: z.array(z.any()).default([]),
  indexRequests: z.array(z.string()).default([]),
  windows: z.any().default({}),
  docHealth: z.any().default({}),
  repairRequests: z.array(z.string()).default([])
});
var BRIDGE_POLL_MS = 5e3;
var BRIDGE_BUDGET_MS = 2e3;
function settingsMode(ctx) {
  let settings;
  try {
    settings = ctx.settings;
  } catch {
    return "none";
  }
  if (settings === void 0 || settings === null) return "none";
  if (typeof settings.register === "function") return "register";
  if (typeof settings.update === "function" && typeof settings.describe === "function") return "forms";
  return "none";
}
function apply(ctx, config) {
  const mode = settingsMode(ctx);
  let scope = null;
  if (mode === "register") {
    const options = {
      base: {
        ...EMPTY_RAIL_STATE,
        enableRail: config.enableRail,
        stripeEdge: config.stripeEdge,
        recentsMaxRows: config.recentsMaxRows,
        indexRequests: [],
        windows: {},
        journal: [],
        docHealth: {},
        repairRequests: []
      },
      applies: "live"
    };
    scope = ctx.settings.register(
      "workspace-rail",
      RailSchema,
      options
    );
  }
  const legacyScope = scope;
  const PERSISTED = ["schemaVersion", "folders", "folderOrder", "projects", "projectOrder", "pinned", "sessionFolders", "memberships", "stripes", "docs", "journal", "importedSessionPinAt", "stripeEdge"];
  const api = createApi({
    dataDir: join4(homedir4(), ".dsh", "workspace-rail"),
    projectsRoot: config.projectsRoot ?? "~/dsh-projects",
    trustedHosts: config.trustedHosts?.length ? config.trustedHosts : harnessTrustedHosts(process.argv, process.env),
    seed: () => {
      if (legacyScope === null) return null;
      try {
        const v = legacyScope.get();
        if (v === void 0 || v === null) return null;
        const out = {};
        for (const k of PERSISTED) if (k in v) out[k] = v[k];
        return out;
      } catch {
        return null;
      }
    },
    log: (m) => console.log(m)
  });
  const web = ctx.webServer;
  const effect = ctx.effect;
  if (web !== void 0 && effect !== void 0) {
    effect.call(ctx, () => web.register({ kind: "prefix", path: API_PREFIX, handler: api.handler }), "workspace-rail: api route");
  }
  registerProjectSearch(ctx, api.load);
  if (legacyScope !== null) {
    ctx.logger?.info?.("workspace-rail: armed - settings namespace registered" + (config.enableWindowsIndex || config.enablePointerHealth ? ", window/pointer bridge on" : ""));
    if (config.enableWindowsIndex || config.enablePointerHealth) mountWindowBridge(ctx, legacyScope, config);
    return;
  }
  console.log("workspace-rail: armed - state.json store, no settings namespace on this host (settings mode: " + mode + ")" + (config.enableWindowsIndex ? "; enableWindowsIndex needs the DSH 0.1.5 settings namespace and stays off" : ""));
}
function mountWindowBridge(ctx, scope, config) {
  const store = new SessionStore();
  const tick = () => {
    if (config.enablePointerHealth) processRepairs(scope);
    if (!config.enableWindowsIndex) return;
    let requests = [];
    try {
      const doc = scope.get();
      if (!Array.isArray(doc?.indexRequests) || doc.indexRequests.length === 0) return;
      requests = doc.indexRequests.filter((x) => typeof x === "string");
    } catch (error) {
      ctx.logger?.warn?.("workspace-rail: bridge read failed: " + String(error));
      return;
    }
    const started = Date.now();
    const windows = { ...scope.get().windows };
    let processed = 0;
    let idx2 = 0;
    while (idx2 < requests.length && Date.now() - started < BRIDGE_BUDGET_MS) {
      const id = requests[idx2];
      idx2++;
      processed++;
      try {
        const win = store.readWindows(id);
        if (win !== null) windows[id] = { f: win.first, l: win.last };
      } catch {
      }
    }
    void processed;
    const keys = Object.keys(windows);
    if (keys.length > config.windowsMaxSessions) {
      for (const k of keys.slice(0, keys.length - config.windowsMaxSessions)) delete windows[k];
    }
    const remaining = requests.slice(idx2);
    void scope.update({ windows, indexRequests: remaining }).catch((error) => {
      ctx.logger?.warn?.("workspace-rail: bridge write failed: " + String(error));
    });
  };
  const processRepairs = (scope2) => {
    try {
      const doc = scope2.get();
      const requested = Array.isArray(doc?.repairRequests) ? doc.repairRequests : [];
      if (requested.length === 0) return;
      const allDocs = doc?.docs ?? {};
      const health = { ...doc?.docHealth ?? {} };
      for (const pid of requested) {
        const projectDocs = Object.values(allDocs).filter((d) => d.projectId === pid && typeof d.pointer === "string");
        Object.assign(health, checkPointers(projectDocs.map((d) => ({ id: d.id, pointer: d.pointer ?? "" }))));
      }
      void scope2.update({ docHealth: health, repairRequests: [] }).catch((error) => {
        ctx.logger?.warn?.("workspace-rail: pointer health write failed: " + String(error));
      });
    } catch (error) {
      ctx.logger?.warn?.("workspace-rail: pointer health failed: " + String(error));
    }
  };
  const ctxAny = ctx;
  let hasCtxInterval = false;
  try {
    hasCtxInterval = typeof ctxAny.setInterval === "function";
  } catch {
  }
  if (hasCtxInterval) ctxAny.setInterval(tick, BRIDGE_POLL_MS);
  else {
    const timer = setInterval(tick, BRIDGE_POLL_MS);
    timer.unref?.();
  }
}
function resolveDefineTool() {
  const bases = [import.meta.url, join4(homedir4(), ".dsh", "profiles", "web", "probe.js")];
  if (process.argv[1] !== void 0) bases.push(process.argv[1]);
  for (const base of bases) {
    try {
      const mod = createRequire(base)("@deepseek-ai/dsh-tools");
      const fn = mod.defineTool ?? mod.default?.defineTool;
      if (typeof fn === "function") return fn;
    } catch {
    }
  }
  return null;
}
function projectForChat(state, cwd, sessionId) {
  const projects = Object.values(state?.projects ?? {});
  if (cwd !== void 0) {
    const c = cwd.replace(/\/+$/, "");
    const byDir = projects.find((p) => p.dir !== void 0 && (c === expandHome(p.dir).replace(/\/+$/, "") || c.startsWith(expandHome(p.dir).replace(/\/+$/, "") + "/")));
    if (byDir !== void 0) return byDir;
  }
  const pid = sessionId !== void 0 ? state?.memberships?.[sessionId] : void 0;
  return pid !== void 0 ? state?.projects?.[pid] ?? null : null;
}
function registerProjectSearch(ctx, load) {
  const defineTool = resolveDefineTool();
  const inject2 = ctx.inject;
  if (defineTool === null || inject2 === void 0) {
    console.error("workspace-rail: project_search NOT registered: " + (defineTool === null ? "defineTool unresolved" : "ctx.inject missing"));
    return;
  }
  inject2.call(ctx, ["tools"], (sub) => {
    try {
      const TEXT = (s) => [{ type: "text", text: s }];
      sub.tools.register(defineTool({
        name: "project_search",
        description: "Search the files of the project this chat belongs to (its project folder, uploads and linked files: text, code, Markdown, CSV/JSON, PDF, Word). Returns the best-matching passages with file and line so you can cite them. Use it before answering questions about the project's documents, especially when there are more files than you can read. Only works in chats that belong to a project.",
        parameters: {
          query: { type: "string", required: true, description: "Words to look for (keywords work better than full questions)." },
          limit: { type: "number", description: "How many passages to return (default 8, max 30)." }
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean", required: true },
              project: { type: "string" },
              files: { type: "number" },
              hits: { type: "array", items: { type: "object", additionalProperties: false, properties: { file: { type: "string" }, line: { type: "number" }, score: { type: "number" }, text: { type: "string" } } } },
              unreadable: { type: "array", items: { type: "string" } },
              error: { type: "string" }
            }
          },
          render: (_a, v) => {
            if (!v.ok) return TEXT("project_search: " + (v.error ?? "failed"));
            if ((v.hits ?? []).length === 0) return TEXT(`No matches in "${v.project}" (${v.files} files searched).`);
            return TEXT(`${v.hits.length} passages from "${v.project}" (${v.files} files):

` + v.hits.map((h) => `--- ${h.file}:${h.line}
${h.text}`).join("\n\n"));
          }
        },
        async execute(args, exec) {
          try {
            const header = exec?.agent?.session?.header;
            const state = (await load()).state;
            const project = projectForChat(state, header?.cwd, header?.id);
            if (project === null) return { ok: false, error: "this chat is not part of a project (start it with + New chat in a project, or add it to one)" };
            const dir = project.dir !== void 0 ? expandHome(project.dir) : null;
            const linked = Object.values(state?.docs ?? {}).filter((d) => d.projectId === project.id && !/^https?:\/\//i.test(d.pointer)).map((d) => expandHome(d.pointer)).filter((p) => dir === null || !(p === dir || p.startsWith(dir + "/")));
            const res = await searchProject(dir, linked, String(args.query ?? ""), typeof args.limit === "number" ? args.limit : 8);
            return JSON.parse(JSON.stringify({ ok: true, project: project.name ?? "", files: res.files, hits: res.hits.map((h) => ({ ...h, text: h.text.slice(0, 1200) })), unreadable: res.unreadable }));
          } catch (error) {
            return { ok: false, error: String(error?.message ?? error) };
          }
        }
      }));
      console.log("workspace-rail: project_search tool registered");
    } catch (error) {
      console.error("workspace-rail: project_search registration failed: " + String(error?.stack ?? error));
    }
  });
}
export {
  Config,
  apply,
  inject,
  name,
  projectForChat,
  registerProjectSearch,
  settingsMode
};
//# sourceMappingURL=index.js.map
