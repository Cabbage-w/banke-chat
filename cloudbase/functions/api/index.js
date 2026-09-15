"use strict";
/**
 * 半刻 · 聊天 API 云函数入口（HTTP 访问服务 → 普通云函数集成响应）。
 * 部署后在 HTTP 访问服务把路径 /api 关联到本函数，开启免鉴权。
 */
const { createCloudStore } = require("./store");
const { handleApi } = require("./api-core");

let storePromise = null;
function getStore(){
  if (!storePromise) storePromise = Promise.resolve(createCloudStore());
  return storePromise;
}

exports.main = async (event) => {
  const store = await getStore();
  const method = String((event && event.httpMethod) || "GET").toUpperCase();

  const headers = {};
  for (const [k,v] of Object.entries((event && event.headers) || {})) headers[String(k).toLowerCase()] = String(v);

  const query = {};
  for (const [k,v] of Object.entries((event && event.queryStringParameters) || {})) query[k] = String(v);

  let raw = (event && event.body) || "";
  if (typeof raw === "string" && event && event.isBase64Encoded) raw = Buffer.from(raw,"base64").toString("utf8");
  let body;
  if (method === "POST" && typeof raw === "string" && raw.length) {
    try { body = JSON.parse(raw); } catch(e) { body = undefined; }
  }

  const rc = (event && event.requestContext) || {};
  const ip = rc.sourceIp || headers["x-real-ip"] || String(headers["x-forwarded-for"]||"").split(",")[0].trim() || "";

  const out = await handleApi({method, path: (event && event.path) || "", query, headers, body, ip, store});
  return {
    statusCode: out.status,
    headers: {...out.headers, "Content-Type": "application/json; charset=utf-8"},
    body: JSON.stringify(out.data ?? null),
    isBase64Encoded: false,
  };
};
