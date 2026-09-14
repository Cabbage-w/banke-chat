import { database } from "../../../db/raw";
import { getChatUser, tokenHash } from "../../session-auth";
import { allowedOrigin, readBody, reply } from "../http";
export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return reply(request,null,allowedOrigin(request)?204:403); }
export async function POST(request: Request) {
  if (!allowedOrigin(request)) return reply(request,{error:"请求来源无效"},403);
  let body:Record<string,string>;
  try { body=await readBody(request); } catch {return reply(request,{error:"请求格式无效"},400);}
  const name=body.name?.trim();
  if (!name || name.length>24) return reply(request,{error:"请输入 1–24 个字的昵称"},400);
  try {
    const db=database(), now=Date.now();
    const ip=request.headers.get("cf-connecting-ip");
    if (ip) {
      const key=await tokenHash("guest-rate:"+ip+":"+Math.floor(now/3600000));
      const limit=await db.prepare("INSERT INTO guest_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key,now+7200000).first<{count:number}>();
      if (limit && limit.count>30) return reply(request,{error:"创建次数过多，请稍后再试"},429);
      await db.prepare("DELETE FROM guest_limits WHERE expires<?").bind(now).run();
    }
    const existing=await getChatUser(request);
    const uid=existing?.userId || "guest_"+crypto.randomUUID();
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
    const hash=await tokenHash(token);
    await db.batch([
      db.prepare("INSERT INTO profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(uid,name),
      db.prepare("INSERT INTO sessions(hash,user,expires) VALUES(?,?,?)").bind(hash,uid,now+180*86400000),
    ]);
    return reply(request,{token,profile:{id:uid,name}});
  } catch(e) {console.error(e);return reply(request,{error:"暂时无法进入聊天，请稍后重试"},503);}
}
