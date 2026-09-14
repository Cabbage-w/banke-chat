import { database } from "../db/raw";
import { getChatGPTUser } from "./chatgpt-auth";
export async function tokenHash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function getChatUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) return null;
    const hash = await tokenHash(authorization.slice(7));
    const row=await database().prepare("SELECT p.id,p.name FROM sessions s JOIN profiles p ON p.id=s.user WHERE s.hash=? AND s.expires>?").bind(hash,Date.now()).first<{id:string;name:string}>();
    return row ? {userId:row.id,fullName:row.name} : null;
  }
  // Keep existing owners' conversations available on the original site.
  return getChatGPTUser();
}
