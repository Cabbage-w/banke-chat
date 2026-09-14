export const PAGES_ORIGIN = "https://cabbage-w.github.io";
export function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url=new URL(request.url);
  const local=["localhost","127.0.0.1"].includes(url.hostname) && ["http://127.0.0.1:4173","http://localhost:4173","http://127.0.0.1:4174","http://localhost:4174"].includes(origin || "");
  return !origin || origin === url.origin || origin === PAGES_ORIGIN || local;
}
export function reply(request: Request, data: unknown, status = 200) {
  const headers = new Headers({"Cache-Control":"no-store","Vary":"Origin"});
  const origin = request.headers.get("origin");
  if (origin && allowedOrigin(request)) headers.set("Access-Control-Allow-Origin",origin);
  headers.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers","Authorization, Content-Type");
  headers.set("Access-Control-Max-Age","600");
  return status===204 ? new Response(null,{status,headers}) : Response.json(data,{status,headers});
}
export async function readBody(request: Request): Promise<Record<string,string>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("请使用 JSON 请求");
  const raw = await request.text();
  if (raw.length>12000) throw new Error("请求内容过长");
  const body: unknown=JSON.parse(raw);
  if (!body || typeof body!=="object" || Array.isArray(body) || Object.values(body).some(v=>typeof v!=="string")) throw new Error("请求格式无效");
  return body as Record<string,string>;
}
