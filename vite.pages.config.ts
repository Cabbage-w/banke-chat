import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {resolve} from "node:path";
export default defineConfig({
  root:resolve(process.cwd(),"web-client"),
  base:"/banke-chat/",
  plugins:[react()],
  publicDir:resolve(process.cwd(),"public"),
  define:{__BANKE_API_ORIGIN__:JSON.stringify(process.env.BANKE_API_ORIGIN || "https://ban-chat-room.wyhahalife.chatgpt.site")},
  build:{outDir:resolve(process.cwd(),"docs"),emptyOutDir:true},
  server:{host:"127.0.0.1",port:4173},
});

