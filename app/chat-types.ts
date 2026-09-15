export type Profile={id:string;name:string};
export type Room={id:string;name:string;description:string;owner:string;token:string;created:number;lastMessage?:string;lastTime?:number};
export type Message={seq:number;id:string;room:string;user:string;name:string;body:string;created:number};
declare const __BANKE_API_ORIGIN__: string | undefined;
function resolveApiOrigin(): string {
  const compiled = typeof __BANKE_API_ORIGIN__ === "string" ? __BANKE_API_ORIGIN__ : "";
  try { return localStorage.getItem("banke-api-origin") || compiled; } catch { return compiled; }
}
const origin = resolveApiOrigin();
let memoryToken = "";
export function getSessionToken() {
  if (memoryToken) return memoryToken;
  try {return localStorage.getItem("banke-session") || "";}catch{return "";}
}
export function saveSessionToken(token:string) {
  memoryToken=token;
  try {if(token)localStorage.setItem("banke-session",token);else localStorage.removeItem("banke-session");return true;}catch{return false;}
}
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
async function request(path:string,body?:Record<string,string>) {
  const token=getSessionToken();
  const response=await fetch(origin+path,{method:body?"POST":"GET",credentials:origin?"omit":"same-origin",headers:{...(body?{"Content-Type":"application/json"}:{}),...(token?{"Authorization":"Bearer "+token}:{})},body:body?JSON.stringify(body):undefined});
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError("聊天服务暂时无法连接，请稍后重试",response.status);
  const data=await response.json() as {error?:string;rooms:Room[];profile:Profile;messages:Message[];members:Profile[];id:string;token:string};
  if(!response.ok)throw new ApiError(data.error||"连接失败，请重试",response.status);
  return data;
}
export function api(path="",body?:Record<string,string>) { return request("/api/chat"+path,body); }
export function enterChat(action:"register"|"login",username:string,password:string,confirmPassword="") { return request("/api/session",{action,username,password,confirmPassword}); }
export function leaveChat() { return request("/api/session",{action:"logout"}); }
export function clockTime(t:number){return new Date(t).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});}

