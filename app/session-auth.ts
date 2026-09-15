import { database } from "../db/raw";
import { getChatGPTUser } from "./chatgpt-auth";
export async function tokenHash(value: string) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function getChatUser(request: Request) {
  const authorization=request.headers.get("authorization"),db=database();
  if(authorization){
    if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return null;
    const hash=await tokenHash(authorization.slice(7));
    const row=await db.prepare("SELECT p.id,p.name,a.username FROM sessions s JOIN profiles p ON p.id=s.user LEFT JOIN accounts a ON a.user=p.id WHERE s.hash=? AND s.expires>?").bind(hash,Date.now()).first<{id:string;name:string;username:string|null}>();
    return row?{userId:row.id,fullName:row.name,account:row.username}:null;
  }
  // Legacy platform identity is accepted only on the original platform or local preview.
  if(!["ban-chat-room.wyhahalife.chatgpt.site","localhost","127.0.0.1"].includes(new URL(request.url).hostname))return null;
  const legacy=await getChatGPTUser(); if(!legacy)return null;
  const account=await db.prepare("SELECT username FROM accounts WHERE user=?").bind(legacy.userId).first<{username:string}>();
  if(account)return null;
  return {...legacy,account:null};
}

