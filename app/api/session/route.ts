import bcrypt from "bcryptjs";
import { database } from "../../../db/raw";
import { getChatUser, tokenHash } from "../../session-auth";
import { allowedOrigin, readBody, reply } from "../http";
export const dynamic="force-dynamic";
export function OPTIONS(request:Request){return reply(request,null,allowedOrigin(request)?204:403);}
async function limited(key:string,max:number,period:number){
  const now=Date.now(),digest=await tokenHash(key+":"+Math.floor(now/period));
  const row=await database().prepare("INSERT INTO guest_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(digest,now+period*2).first<{count:number}>();
  return (row?.count||0)>max;
}
async function newSession(user:string){
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
  return {token,statement:database().prepare("INSERT INTO sessions(hash,user,expires) VALUES(?,?,?)").bind(await tokenHash(token),user,Date.now()+30*86400000)};
}
export async function POST(request:Request){
  if(!allowedOrigin(request))return reply(request,{error:"请求来源无效"},403);
  let b:Record<string,string>;
  try{b=await readBody(request);}catch{return reply(request,{error:"请求格式无效"},400);}
  try{
    const db=database();
    if(b.action==="logout"){
      const auth=request.headers.get("authorization");
      if(auth && /^Bearer [a-f0-9]{64}$/.test(auth))await db.prepare("DELETE FROM sessions WHERE hash=?").bind(await tokenHash(auth.slice(7))).run();
      return reply(request,{ok:true});
    }
    if(!["register","login"].includes(b.action))return reply(request,{error:"请选择注册或登录"},400);
    const username=b.username?.trim().toLowerCase(),password=b.password||"";
    if(!username || !/^[a-z0-9_]{3,24}$/.test(username))return reply(request,{error:"用户名需为 3–24 位英文字母、数字或下划线"},400);
    if(!password || password.length>64 || bcrypt.truncates(password))return reply(request,{error:"密码过长或为空，请检查后重试"},400);
    const ip=request.headers.get("cf-connecting-ip");
    if(ip && await limited("auth-ip:"+b.action+":"+ip,b.action==="register"?10:60,b.action==="register"?3600000:900000))return reply(request,{error:"尝试次数过多，请稍后再试"},429);
    if(b.action==="login" && await limited("login-user:"+username,30,900000))return reply(request,{error:"登录尝试过多，请 15 分钟后再试"},429);
    await db.prepare("DELETE FROM guest_limits WHERE expires<?").bind(Date.now()).run();
    if(b.action==="register"){
      if(password.length<8)return reply(request,{error:"密码至少需要 8 位"},400);
      if(password!==b.confirmPassword)return reply(request,{error:"两次输入的密码不一致"},400);
      if(await db.prepare("SELECT 1 FROM accounts WHERE username=?").bind(username).first())return reply(request,{error:"这个用户名已被使用，请换一个"},409);
      const existing=await getChatUser(request);
      if(existing?.account)return reply(request,{error:"你已登录账号，请先退出后再注册"},409);
      const uid=existing?.userId || "account_"+crypto.randomUUID();
      const name=existing?.fullName || username;
      const hash=await bcrypt.hash(password,12),session=await newSession(uid);
      try{
        await db.batch([
          db.prepare("INSERT INTO profiles(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING").bind(uid,name),
          db.prepare("INSERT INTO accounts(username,user,password_hash,created) VALUES(?,?,?,?)").bind(username,uid,hash,Date.now()),
          db.prepare("DELETE FROM sessions WHERE user=?").bind(uid),
          session.statement
        ]);
      }catch(e){
        if(String(e).includes("UNIQUE"))return reply(request,{error:"用户名或当前身份已注册，请直接登录"},409);
        throw e;
      }
      return reply(request,{token:session.token,profile:{id:uid,name},username});
    }
    const account=await db.prepare("SELECT a.user,a.password_hash,p.name FROM accounts a JOIN profiles p ON p.id=a.user WHERE a.username=?").bind(username).first<{user:string;password_hash:string;name:string}>();
    // A fixed valid bcrypt hash avoids the fast-path timing leak for unknown usernames.
    const dummy="$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    const valid=await bcrypt.compare(password,account?.password_hash||dummy);
    if(!account||!valid)return reply(request,{error:"用户名或密码不正确"},401);
    const session=await newSession(account.user);await session.statement.run();
    return reply(request,{token:session.token,profile:{id:account.user,name:account.name},username});
  }catch(e){console.error("Account operation failed",e instanceof Error?e.message:"Unknown error");return reply(request,{error:"账号服务暂时无法连接，请稍后重试"},503);}
}

