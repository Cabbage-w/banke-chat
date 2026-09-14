import { getChatUser } from "../../session-auth";
import { allowedOrigin, readBody, reply } from "../http";
import { database } from "../../../db/raw";
export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return reply(request,null,allowedOrigin(request)?204:403); }
export async function GET(request: Request) {
  const json=(data:unknown,status=200)=>reply(request,data,status);
  try {
    const user = await getChatUser(request); if (!user) return json({error:"请先填写昵称进入聊天"},401);
    const db = database(), url = new URL(request.url), room = url.searchParams.get("room");
    if (room) {
      const member = await db.prepare("SELECT 1 FROM members WHERE room=? AND user=?").bind(room,user.userId).first();
      if (!member) return json({error:"请通过邀请链接加入此房间"},403);
      const before = Number(url.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
      const messages = await db.prepare("SELECT m.*, p.name FROM messages m JOIN profiles p ON p.id=m.user WHERE m.room=? AND m.seq<? ORDER BY m.seq DESC LIMIT 60").bind(room,before).all();
      const members = await db.prepare("SELECT p.id,p.name FROM members m JOIN profiles p ON p.id=m.user WHERE m.room=? ORDER BY m.joined").bind(room).all();
      return json({messages:messages.results.reverse(),members:members.results});
    }
    const profile = await db.prepare("SELECT * FROM profiles WHERE id=?").bind(user.userId).first();
    const rooms = await db.prepare("SELECT r.*, (SELECT body FROM messages WHERE room=r.id ORDER BY seq DESC LIMIT 1) AS lastMessage, (SELECT created FROM messages WHERE room=r.id ORDER BY seq DESC LIMIT 1) AS lastTime FROM rooms r JOIN members m ON m.room=r.id WHERE m.user=? ORDER BY COALESCE(lastTime,r.created) DESC").bind(user.userId).all();
    return json({profile,rooms:rooms.results});
  } catch (e) { console.error(e); return json({error:"聊天暂时无法连接，请稍后重试。"},503); }
}
export async function POST(request: Request) {
  const json=(data:unknown,status=200)=>reply(request,data,status);
  try {
    if (!allowedOrigin(request)) return json({error:"请求来源无效"},403);
    const user = await getChatUser(request); if (!user) return json({error:"请先填写昵称进入聊天"},401);
    if (Number(request.headers.get("content-length")) > 16000) return json({error:"内容过长"},413);
    const b = await readBody(request); const db = database(), uid=user.userId;
    if (b.action === "init" || b.action === "profile") {
      const name = b.name?.trim() || user.fullName?.slice(0,24) || "新朋友";
      if (name.length>24) return json({error:"昵称最多 24 个字"},400);
      if (b.action === "init") await db.prepare("INSERT INTO profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING").bind(uid,name).run();
      else await db.prepare("INSERT INTO profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(uid,name).run();
      return json({ok:true});
    }
    if (!await db.prepare("SELECT id FROM profiles WHERE id=?").bind(uid).first()) return json({error:"请刷新页面完成登录"},400);
    if (b.action === "create") {
      const name=b.name?.trim(), description=b.description?.trim() || "留半刻时间，聊聊身边的小事。";
      if (!name || name.length>32 || description.length>160) return json({error:"房间名称需为 1–32 个字，介绍最多 160 字"},400);
      const count = await db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE owner=?").bind(uid).first<{n:number}>();
      if (count && count.n>=30) return json({error:"最多可以创建 30 个房间"},400);
      const id=crypto.randomUUID(), token=crypto.randomUUID(), created=Date.now();
      await db.batch([db.prepare("INSERT INTO rooms(id,name,description,owner,token,created) VALUES(?,?,?,?,?,?)").bind(id,name,description,uid,token,created),db.prepare("INSERT INTO members(room,user,joined) VALUES(?,?,?)").bind(id,uid,created)]);
      return json({id});
    }
    if (b.action === "join") {
      const room=await db.prepare("SELECT id FROM rooms WHERE token=?").bind(b.token || "").first<{id:string}>();
      if (!room) return json({error:"邀请链接无效，请向朋友获取新的链接"},404);
      await db.prepare("INSERT INTO members(room,user,joined) VALUES(?,?,?) ON CONFLICT(room,user) DO NOTHING").bind(room.id,uid,Date.now()).run();
      return json({id:room.id});
    }
    if (b.action === "send") {
      if (!b.body?.trim() || b.body.length>2000 || !/^[0-9a-f-]{36}$/.test(b.id || "")) return json({error:"消息需为 1–2000 字"},400);
      if (!await db.prepare("SELECT 1 FROM members WHERE room=? AND user=?").bind(b.room,uid).first()) return json({error:"你尚未加入此房间"},403);
      const existing=await db.prepare("SELECT user FROM messages WHERE id=?").bind(b.id).first<{user:string}>();
      if (existing) return existing.user===uid ? json({ok:true}) : json({error:"消息标识冲突"},409);
      const recent=await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE room=? AND user=? AND created>?").bind(b.room,uid,Date.now()-10000).first<{n:number}>();
      if (recent && recent.n>=10) return json({error:"发送太快了，请稍等片刻"},429);
      await db.prepare("INSERT INTO messages(id,room,user,body,created) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(b.id,b.room,uid,b.body.trim(),Date.now()).run();
      return json({ok:true});
    }
    return json({error:"未知操作"},400);
  } catch (e) { console.error(e); return json({error:"操作未完成，请保留内容并重试。"},503); }
}



