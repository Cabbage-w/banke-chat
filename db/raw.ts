import { env } from "cloudflare:workers";
export function database() { if (!env.DB) throw new Error("Chat database unavailable"); return env.DB; }

