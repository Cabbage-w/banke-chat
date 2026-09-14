export type Profile={id:string;name:string};
export type Room={id:string;name:string;description:string;owner:string;token:string;created:number;lastMessage?:string;lastTime?:number};
export type Message={seq:number;id:string;room:string;user:string;name:string;body:string;created:number};
export async function api(path="",body?:Record<string,string>) {
  const response=await fetch("/api/chat"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json() as {error?:string;rooms:Room[];profile:Profile;messages:Message[];members:Profile[];id:string}; if(!response.ok) throw new Error(data.error || "连接失败，请重试"); return data;
}
export function clockTime(t:number){return new Date(t).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});}

