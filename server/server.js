"use strict";
/*
 * Sync backend for the LVNT "project-journal" app.
 * Zero dependencies — Node built-in http + fs only.
 *
 * Storage : one JSON file on a persistent Railway volume (DATA_DIR).
 * Auth    : shared bearer token (SYNC_SECRET). Sent as Authorization: Bearer <t>
 *           or, for the SSE stream, as ?token=<t> (EventSource can't set headers).
 * Realtime: Server-Sent Events — every write is broadcast to all open streams.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SYNC_SECRET || "";
const DATA_DIR = process.env.DATA_DIR || "/data";
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const FILE = path.join(DATA_DIR, "state.json");

// ---- storage ----
function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (e) { return { projects: {} }; }
}
function persist(db) {
  ensureDir();
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE); // atomic replace
}
let db = load();

// ---- SSE clients ----
const clients = new Set();
function broadcast(event) {
  const line = "data: " + JSON.stringify(event) + "\n\n";
  for (const res of clients) { try { res.write(line); } catch (e) {} }
}

// ---- helpers ----
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}
function tokenFrom(req, url) {
  const h = req.headers["authorization"] || "";
  if (h.indexOf("Bearer ") === 0) return h.slice(7);
  return url.searchParams.get("token") || "";
}
function authed(req, url) { return SECRET && tokenFrom(req, url) === SECRET; }
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = ""; req.on("data", (c) => { b += c; if (b.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (e) { resolve(null); } });
  });
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  cors(res);

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (url.pathname === "/health") return json(res, 200, { ok: true });

  // ---- SSE stream ----
  if (url.pathname === "/events" && req.method === "GET") {
    if (!authed(req, url)) { res.writeHead(401); return res.end(); }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.write("retry: 3000\n\n");
    clients.add(res);
    const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 25000);
    req.on("close", () => { clearInterval(hb); clients.delete(res); });
    return;
  }

  // everything below requires auth
  if (!authed(req, url)) return json(res, 401, { error: "unauthorized" });

  // ---- get full state ----
  if (url.pathname === "/state" && req.method === "GET") {
    const projects = Object.values(db.projects).sort((a, b) => (a.pos || 0) - (b.pos || 0));
    return json(res, 200, { projects });
  }

  // ---- upsert one project ----
  if (url.pathname === "/project" && req.method === "PUT") {
    const p = await readBody(req);
    if (!p || !p.id) return json(res, 400, { error: "bad project" });
    const proj = {
      id: String(p.id),
      name: p.name || "",
      stages: Array.isArray(p.stages) ? p.stages : [],
      pos: typeof p.pos === "number" ? p.pos : 0,
      updated_by: p.updated_by || "",
      updated_at: new Date().toISOString()
    };
    db.projects[proj.id] = proj;
    persist(db);
    broadcast({ type: "upsert", project: proj });
    return json(res, 200, { ok: true });
  }

  // ---- delete one project ----
  if (url.pathname === "/project" && req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const by = url.searchParams.get("by") || "";
    if (id && db.projects[id]) { delete db.projects[id]; persist(db); }
    broadcast({ type: "delete", id: id, updated_by: by });
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log("project-journal sync on :" + PORT + " data=" + FILE));
