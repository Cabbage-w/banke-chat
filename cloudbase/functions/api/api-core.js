"use strict";
/**
 * 半刻 · 聊天 API 核心逻辑（平台无关）
 * 与原 Cloudflare Worker/D1 版本行为对齐：
 *   POST /api/session  {action: register|login|logout}
 *   GET  /api/chat[?room=&before=]
 *   POST /api/chat     {action: init|profile|create|join|send}
 *
 * store 接口（异步）：
 *   get(coll,id) -> doc|null
 *   add(coll,id,data) -> true|false（_id 冲突时 false）
 *   update(coll,id,patch)
 *   inc(coll,id,field,delta,initDoc) -> 新值
 *   del(coll,id)
 *   delWhere(coll,query)
 *   find(coll,query,{orderBy,desc,limit}) -> [doc]（doc 含 _id）
 *   count(coll,query) -> number
 * query 值：原始值=相等；{lt}/{gt}/{in}/{ne}=比较
 */
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

const PAGES_ORIGIN = "https://cabbage-w.github.io";
const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:4173","http://localhost:4173",
  "http://127.0.0.1:4174","http://localhost:4174",
]);
const SESSION_MS = 30 * 86400000;
const UUID_RE = /^[0-9a-f-]{36}$/;
// 固定的有效 bcrypt 哈希，避免“用户名不存在”时的时序泄露。
const DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

function sha256hex(v){ return crypto.createHash("sha256").update(v,"utf8").digest("hex"); }
function newToken(){ return crypto.randomBytes(32).toString("hex"); }
function uuid(){ return crypto.randomUUID(); }

function allowedOrigin(origin){
  return !origin || origin === PAGES_ORIGIN || LOCAL_ORIGINS.has(origin);
}

class HttpError extends Error {
  constructor(status,message){ super(message); this.status=status; }
}
function err(status,message){ throw new HttpError(status,message); }

function corsHeaders(origin){
  const h = {
    "Cache-Control":"no-store",
    "Vary":"Origin",
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type",
    "Access-Control-Max-Age":"600",
  };
  if (origin && allowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function readBody(body){
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body)) err(400,"请求格式无效");
  if (Object.values(body).some(v => typeof v !== "string")) err(400,"请求格式无效");
  if (JSON.stringify(body).length > 12000) err(400,"请求内容过长");
  return body;
}

async function handleApi(ctx){
  const store = ctx.store;
  const now = ctx.now || Date.now;
  const method = String(ctx.method||"GET").toUpperCase();
  const headers = {};
  for (const [k,v] of Object.entries(ctx.headers||{})) headers[String(k).toLowerCase()] = String(v);
  const origin = headers.origin || "";
  const query = ctx.query || {};
  const json = (data,status=200) => ({status, data, headers: corsHeaders(origin)});

  const bcryptCost = Number(ctx.bcryptCost || process.env.BCRYPT_COST) || 12;

  async function limited(key,max,period){
    const digest = sha256hex(key + ":" + Math.floor(now()/period));
    const count = await store.inc("limits", digest, "count", 1, {count:0, expires: now()+period*2});
    return count > max;
  }

  async function newSession(uid){
    const token = newToken();
    const added = await store.add("sessions", sha256hex(token), {user:uid, expires: now()+SESSION_MS});
    if (!added) throw new Error("session collision");
    return token;
  }

  async function getChatUser(){
    const authorization = headers.authorization;
    if (!authorization) return null;
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) return null;
    const hash = sha256hex(authorization.slice(7));
    const session = await store.get("sessions", hash);
    if (!session || session.expires <= now()) return null;
    const profile = await store.get("profiles", session.user);
    if (!profile) return null;
    const accounts = await store.find("accounts", {user: session.user}, {limit:1});
    return {userId: session.user, name: profile.name, account: accounts.length ? accounts[0]._id : null};
  }

  async function nameMap(uids){
    const distinct = [...new Set(uids)];
    if (!distinct.length) return {};
    const rows = await store.find("profiles", {_id: {in: distinct}}, {limit: 1000});
    const map = {};
    for (const row of rows) map[row._id] = row.name;
    return map;
  }

  function requireAuthedWithAccount(user){
    if (!user) err(401,"请先登录账号");
    if (!user.account) err(428,"请注册账号密码，以保留并继续使用原有聊天记录");
  }

  // ---------- GET /api/chat ----------
  async function chatGet(user){
    const db = store, uid = user.userId;
    const room = query.room;
    if (room) {
      const member = await db.find("members", {room, user: uid}, {limit:1});
      if (!member.length) err(403,"请通过邀请链接加入此房间");
      const before = Number(query.before) || Number.MAX_SAFE_INTEGER;
      const rows = await db.find("messages", {room, seq:{lt:before}}, {orderBy:"seq", desc:true, limit:60});
      rows.reverse();
      const names = await nameMap(rows.map(m=>m.user));
      const memberRows = await db.find("members", {room}, {orderBy:"joined"});
      const memberNames = await nameMap(memberRows.map(m=>m.user));
      return {
        messages: rows.map(m=>({seq:m.seq, id:m._id, room:m.room, user:m.user, name:names[m.user]??"?", body:m.body, created:m.created})),
        members: memberRows.map(m=>({id:m.user, name:memberNames[m.user]??"?"})),
      };
    }
    const profileRow = await db.get("profiles", uid);
    const memberships = await db.find("members", {user: uid}, {limit: 1000});
    const ids = memberships.map(m=>m.room);
    const rooms = ids.length ? await db.find("rooms", {_id:{in:ids}}, {limit:1000}) : [];
    const decorated = [];
    for (const r of rooms) {
      const last = await db.find("messages", {room: r._id}, {orderBy:"seq", desc:true, limit:1});
      decorated.push({
        id:r._id, name:r.name, description:r.description, owner:r.owner, token:r.token, created:r.created,
        lastMessage: last.length ? last[0].body : undefined,
        lastTime: last.length ? last[0].created : undefined,
      });
    }
    decorated.sort((a,b)=>(b.lastTime||b.created)-(a.lastTime||a.created));
    return {profile:{id:uid, name:profileRow.name}, rooms: decorated};
  }

  // ---------- POST /api/chat ----------
  async function chatPost(user){
    if (!allowedOrigin(origin)) err(403,"请求来源无效");
    const db = store, uid = user.userId;
    const cl = Number(headers["content-length"]);
    if (cl > 16000) err(413,"内容过长");
    const b = readBody(ctx.body);

    if (b.action === "init" || b.action === "profile") {
      const name = (b.name||"").trim() || (user.name||"").slice(0,24) || "新朋友";
      if (name.length>24) err(400,"昵称最多 24 个字");
      const existing = await db.get("profiles", uid);
      if (b.action === "init") {
        if (!existing) await db.add("profiles", uid, {name});
      } else {
        if (existing) await db.update("profiles", uid, {name});
        else await db.add("profiles", uid, {name});
      }
      return {ok:true};
    }
    if (!await db.get("profiles", uid)) err(400,"请刷新页面完成登录");

    if (b.action === "create") {
      const name=(b.name||"").trim(), description=(b.description||"").trim() || "留半刻时间，聊聊身边的小事。";
      if (!name || name.length>32 || description.length>160) err(400,"房间名称需为 1–32 个字，介绍最多 160 字");
      const n = await db.count("rooms", {owner: uid});
      if (n>=30) err(400,"最多可以创建 30 个房间");
      const id=uuid(), token=uuid(), created=now();
      if (!await db.add("rooms", id, {name, description, owner:uid, token, created})) err(503,"操作未完成，请保留内容并重试。");
      await db.add("members", id+"::"+uid, {room:id, user:uid, joined:created});
      return {id};
    }
    if (b.action === "join") {
      const found = await db.find("rooms", {token: b.token||""}, {limit:1});
      if (!found.length) err(404,"邀请链接无效，请向朋友获取新的链接");
      await db.add("members", found[0]._id+"::"+uid, {room:found[0]._id, user:uid, joined:now()});
      return {id: found[0]._id};
    }
    if (b.action === "send") {
      const body=(b.body||"");
      if (!body.trim() || body.length>2000 || !UUID_RE.test(b.id||"")) err(400,"消息需为 1–2000 字");
      const member = await db.find("members", {room:b.room, user:uid}, {limit:1});
      if (!member.length) err(403,"你尚未加入此房间");
      const existing = await db.get("messages", b.id);
      if (existing) return existing.user===uid ? {ok:true} : err(409,"消息标识冲突");
      const recent = await db.count("messages", {room:b.room, user:uid, created:{gt: now()-10000}});
      if (recent>=10) err(429,"发送太快了，请稍等片刻");
      const seq = await db.inc("counters", "message_seq", "n", 1, {n:0});
      if (!await db.add("messages", b.id, {seq, room:b.room, user:uid, body:body.trim(), created:now()})) return {ok:true};
      return {ok:true};
    }
    err(400,"未知操作");
  }

  // ---------- POST /api/session ----------
  async function handleSession(){
    if (!allowedOrigin(origin)) err(403,"请求来源无效");
    let b;
    try { b = readBody(ctx.body); } catch(e) { err(400,"请求格式无效"); }
    const db = store;

    if (b.action === "logout") {
      const auth = headers.authorization;
      if (auth && /^Bearer [a-f0-9]{64}$/.test(auth)) await db.del("sessions", sha256hex(auth.slice(7)));
      return {ok:true};
    }
    if (!["register","login"].includes(b.action)) err(400,"请选择注册或登录");
    const username=(b.username||"").trim().toLowerCase(), password=b.password||"";
    if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) err(400,"用户名需为 3–24 位英文字母、数字或下划线");
    if (!password || password.length>64 || bcrypt.truncates(password)) err(400,"密码过长或为空，请检查后重试");
    if (ctx.ip && await limited("auth-ip:"+b.action+":"+ctx.ip, b.action==="register"?10:60, b.action==="register"?3600000:900000)) err(429,"尝试次数过多，请稍后再试");
    if (b.action==="login" && await limited("login-user:"+username,30,900000)) err(429,"登录尝试过多，请 15 分钟后再试");
    await db.delWhere("limits", {expires:{lt: now()}}).catch(()=>{});

    if (b.action==="register") {
      if (password.length<8) err(400,"密码至少需要 8 位");
      if (password!==b.confirmPassword) err(400,"两次输入的密码不一致");
      if (await db.get("accounts", username)) err(409,"这个用户名已被使用，请换一个");
      const current = await getChatUser();
      if (current?.account) err(409,"你已登录账号，请先退出后再注册");
      const uid = "account_"+uuid();
      const name = current?.name || username;
      const hash = await bcrypt.hash(password, bcryptCost);
      if (!await db.add("accounts", username, {user:uid, password_hash:hash, created:now()})) err(409,"用户名或当前身份已注册，请直接登录");
      if (!await db.get("profiles", uid)) await db.add("profiles", uid, {name});
      await db.delWhere("sessions", {user: uid}).catch(()=>{});
      const token = await newSession(uid);
      return {token, profile:{id:uid, name}, username};
    }

    const account = await db.get("accounts", username);
    let profileName = username;
    if (account) {
      const p = await db.get("profiles", account.user);
      if (p?.name) profileName = p.name;
    }
    const valid = await bcrypt.compare(password, account?.password_hash || DUMMY_HASH);
    if (!account || !valid) err(401,"用户名或密码不正确");
    const token = await newSession(account.user);
    return {token, profile:{id:account.user, name:profileName}, username};
  }

  // ---------- 路由 ----------
  try {
    if (method === "OPTIONS") return json(null, allowedOrigin(origin)?204:403);
    const p = "/"+String(ctx.path||"").split("/").filter(Boolean).slice(-2).join("/");
    const user = await getChatUser();
    if (p === "/api/session" && method === "POST") return json(await handleSession());
    if (p === "/api/chat") {
      if (method === "GET") { requireAuthedWithAccount(user); return json(await chatGet(user)); }
      if (method === "POST") { requireAuthedWithAccount(user); return json(await chatPost(user)); }
    }
    return json({error:"未知接口"},404);
  } catch(e) {
    if (e instanceof HttpError) return json({error:e.message}, e.status);
    console.error("banke api error:", e && (e.stack||e.message||e));
    return json({error:"服务暂时无法连接，请稍后重试。"},503);
  }
}

module.exports = { handleApi, allowedOrigin, corsHeaders, sha256hex, HttpError, PAGES_ORIGIN };
