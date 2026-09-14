"use client";
import {useEffect,useRef,useState} from "react";
import {MessageCircle,Plus,Search,Send,Smile,Info,UserPlus,ArrowLeft,Check,ChevronRight,Hash,LogIn,LoaderCircle,Settings,Copy,RefreshCw} from "lucide-react";
import {Avatar,Modal,RoomInfo} from "./chat-components";
import {api,clockTime,type Room,type Message,type Profile} from "./chat-types";
export default function ChatApp({signedIn}:{signedIn:boolean}) {
 const [rooms,setRooms]=useState<Room[]>([]),[profile,setProfile]=useState<Profile>(),[selected,setSelected]=useState(""),[messages,setMessages]=useState<Message[]>([]),[members,setMembers]=useState<Profile[]>([]);
 const [search,setSearch]=useState(""),[drafts,setDrafts]=useState<Record<string,string>>({}),[modal,setModal]=useState<"create"|"profile"|"invite"|null>(null),[info,setInfo]=useState(false),[mobileChat,setMobileChat]=useState(false),[emoji,setEmoji]=useState(false);
 const [loading,setLoading]=useState(signedIn),[busy,setBusy]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState(""),[connected,setConnected]=useState(true),[more,setMore]=useState(false),[historyBusy,setHistoryBusy]=useState(false),[ready,setReady]=useState(false),[returnTo,setReturnTo]=useState("/");
 const bottom=useRef<HTMLDivElement>(null), scroll=useRef<HTMLDivElement>(null),selectedRef=useRef(selected), nearBottom=useRef(true), input=useRef<HTMLTextAreaElement>(null), sendingRef=useRef(false), pending=useRef<{body:string;room:string;id:string}|null>(null);
 const room=rooms.find(r=>r.id===selected),draft=drafts[selected]||"";
 const login="/signin-with-chatgpt?return_to="+encodeURIComponent(returnTo);
 selectedRef.current=selected;
 function notify(text:string){setToast(text);}
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3000);return()=>clearTimeout(t);},[toast]);
 async function refreshRooms(){const d=await api();setRooms(d.rooms);setProfile(d.profile);return d.rooms as Room[];}
 async function initialize(){
   setLoading(true);setError("");
   try {await api("",{action:"init"});const list=await refreshRooms();const q=new URLSearchParams(location.search),token=q.get("join");
     if(token){const j=await api("",{action:"join",token});await refreshRooms();setSelected(j.id);setMobileChat(true);history.replaceState(null,"","/");}
     else if(list.length)setSelected(list[0].id);
     setReady(true);
   } catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 useEffect(()=>{setInfo(window.innerWidth>1200);setReturnTo(location.pathname+location.search);try{setDrafts(JSON.parse(sessionStorage.getItem("banke-drafts")||"{}"));}catch{} if(signedIn)void initialize();},[]);
 useEffect(()=>{try{sessionStorage.setItem("banke-drafts",JSON.stringify(drafts));}catch{}},[drafts]);
 useEffect(()=>{if(!ready)return;const id=setInterval(()=>{if(!document.hidden)void refreshRooms().catch(()=>{});},7000);return()=>clearInterval(id);},[ready]);
 useEffect(()=>{
   setMessages([]);setMembers([]);setMore(false);nearBottom.current=true;
   if(!selected)return;
   let cancelled=false,active=false,first=true;
   async function poll(){if(active||document.hidden)return;active=true;try{const d=await api("?room="+encodeURIComponent(selected));if(!cancelled){setMessages(prev=>{const all=new Map<number,Message>();prev.forEach(m=>all.set(m.seq,m));d.messages.forEach((m:Message)=>all.set(m.seq,m));return [...all.values()].sort((a,b)=>a.seq-b.seq);});setMembers(d.members);setConnected(true);if(first){setMore(d.messages.length===60);first=false;}}}catch{if(!cancelled)setConnected(false);}finally{active=false;}}
   void poll();const id=setInterval(poll,2000);return()=>{cancelled=true;clearInterval(id);};
 },[selected]);
 useEffect(()=>{if(nearBottom.current)bottom.current?.scrollIntoView({behavior:"smooth"});},[messages.length,selected]);
 async function send(){
   if(!draft.trim()||!room||sendingRef.current)return;sendingRef.current=true;setSending(true);setError("");
   const text=draft,target=selected;
   if(!pending.current||pending.current.body!==text||pending.current.room!==target)pending.current={id:crypto.randomUUID(),body:text,room:target};
   try{await api("",{action:"send",...pending.current});pending.current=null;setDrafts(d=>d[target]===text?{...d,[target]:""}:d);nearBottom.current=true;
     const data=await api("?room="+encodeURIComponent(target));if(selectedRef.current===target)setMessages(prev=>{const all=new Map(prev.map(m=>[m.seq,m]));data.messages.forEach((m:Message)=>all.set(m.seq,m));return [...all.values()].sort((a,b)=>a.seq-b.seq);});void refreshRooms().catch(()=>{});
   }catch(e){setError((e as Error).message);}finally{sendingRef.current=false;setSending(false);input.current?.focus();}
 }
 async function older(){if(!messages.length)return;const target=selected;setHistoryBusy(true);try{const d=await api("?room="+target+"&before="+messages[0].seq);if(selectedRef.current===target){setMessages(prev=>{const all=new Map(prev.map(m=>[m.seq,m]));d.messages.forEach((m:Message)=>all.set(m.seq,m));return [...all.values()].sort((a,b)=>a.seq-b.seq);});setMore(d.messages.length===60);}}catch(e){setError((e as Error).message);}finally{setHistoryBusy(false);}}
 function inviteUrl(){return location.origin+"/?join="+room?.token;}
 async function copyInvite(){if(!room)return;try{await navigator.clipboard.writeText(inviteUrl());notify("邀请链接已复制，发给朋友就好");}catch{setModal("invite");}}
 function newRoom(){if(!signedIn){location.href=login;return;}setError("");setModal("create");}
 async function submitModal(e:React.FormEvent<HTMLFormElement>){
   e.preventDefault();setBusy(true);setError("");const form=new FormData(e.currentTarget);
   try{if(modal==="create"){const result=await api("",{action:"create",name:String(form.get("name")),description:String(form.get("description"))});await refreshRooms();setSelected(result.id);setMobileChat(true);notify("房间已创建，邀请朋友一起聊聊吧");}
   else {await api("",{action:"profile",name:String(form.get("name"))});await refreshRooms();notify("昵称已更新");}setModal(null);
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className={"app-shell"+(mobileChat?" show-chat":"")}>
  <nav className="brand-rail" aria-label="主导航"><button className="brand" aria-label="半刻首页" onClick={()=>{setSelected("");setMobileChat(true);}}><span><MessageCircle size={25} fill="currentColor"/></span><strong>半刻</strong></button><button className="rail-active" title="消息" aria-label="消息列表" onClick={()=>setMobileChat(false)}><MessageCircle size={24}/></button><div className="rail-bottom"><button className="profile-button" title={signedIn?"编辑昵称":"登录"} aria-label={signedIn?"编辑昵称":"登录"} onClick={()=>signedIn?setModal("profile"):location.assign(login)}><Avatar name={profile?.name||"我"}/><span>{profile?.name||"未登录"}</span></button></div></nav>
  <aside className="conversation-list"><div className="list-heading"><h1>消息</h1><button className="new-button" aria-label="新建聊天室" onClick={newRoom}><Plus size={23}/></button></div><div className="search-box"><Search size={19}/><input aria-label="搜索会话" placeholder="搜索会话..." value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="清空搜索" onClick={()=>setSearch("")}>×</button>}</div><div className="list-label"><span>我的聊天室</span><span>{rooms.length.toString().padStart(2,"0")}</span></div>
  <div className="room-list">{loading?<div className="list-placeholder"><LoaderCircle className="spin" size={18}/>正在载入会话…</div>:rooms.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=><button key={r.id} className={"conversation"+(selected===r.id?" selected":"")} onClick={()=>{setSelected(r.id);setMobileChat(true);setError("");setEmoji(false);}}><span className="conversation-icon"><MessageCircle size={22}/></span><span className="conversation-copy"><strong>{r.name}</strong><span>{r.lastMessage||r.description}</span></span>{r.lastTime&&<time>{clockTime(r.lastTime)}</time>}</button>)}
  {!loading&&rooms.length===0&&!search&&<button className={"conversation welcome-conversation"+(!selected?" selected":"")} onClick={()=>{setSelected("");setMobileChat(true);}}><span className="conversation-icon"><MessageCircle size={22}/></span><span className="conversation-copy"><strong>欢迎来到半刻</strong><span>每一段对话，都从这里开始</span></span></button>}
  {search&&!rooms.some(r=>r.name.toLowerCase().includes(search.toLowerCase()))&&<p className="list-placeholder">没有找到相关会话</p>}
  </div><div className="sidebar-footer"><span className="mini-mark">半</span><div>给交流，留半刻。<small>简单一点，靠近一点。</small></div></div></aside>
  <main className="chat-main"><header className="chat-header"><button className="icon-button mobile-back" aria-label="返回会话列表" onClick={()=>setMobileChat(false)}><ArrowLeft size={21}/></button><span className="header-icon"><MessageCircle size={25}/></span><div className="header-copy"><h2>{room?.name||"欢迎来到半刻"}</h2><span>{room?(connected?"房间聊天 · 消息自动同步":"连接中断 · 正在重连"):"留半刻时间，聊聊身边的小事"}</span></div><div className="header-actions">{room&&<button className="outline-button" aria-label="邀请好友" onClick={copyInvite}><UserPlus size={18}/><span>邀请好友</span></button>}<button className={"icon-button"+(info?" active":"")} aria-label="切换房间信息" onClick={()=>setInfo(!info)}><Info size={22}/></button></div></header>
  <div className="message-scroll" ref={scroll} onScroll={()=>{const el=scroll.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<120;}}><div className="date-divider"><span>{room?"聊天室已建立":"今天"}</span></div>
  <div className="message-row system-message"><Avatar name="半"/><div className="message-content"><div className="bubble"><strong>{room?"这里，是你们的聊天角落。":"欢迎来到半刻 👋"}</strong><p>{room?"把邀请链接发给朋友，从一句「你好」开始吧。":"创建一个房间，把邀请链接发给朋友，就可以开始聊天了。"}</p>{!room&&<button className="welcome-cta" disabled={loading} onClick={newRoom}>{signedIn?"创建第一个聊天室":"登录并开始聊天"}<ChevronRight size={17}/></button>}</div><div className="message-meta">半刻 · 让交流更轻松</div></div></div>
  {!signedIn&&<div className="signin-note"><LogIn size={17}/><span>使用 ChatGPT 账号登录，保存每一次对话。</span><a href={login} target="_top">去登录</a></div>}
  {more&&<button className="history-button" disabled={historyBusy} onClick={older}>{historyBusy?"正在载入…":"查看更早的消息"}</button>}
  {messages.map((m,i)=>{const own=m.user===profile?.id,day=new Date(m.created).toLocaleDateString("zh-CN"),prev=i?new Date(messages[i-1].created).toLocaleDateString("zh-CN"):"";return <div key={m.id}>{day!==prev&&<div className="message-day">{day}</div>}<div className={"message-row"+(own?" own":"")}>{!own&&<Avatar name={m.name}/>}<div className="message-content">{!own&&<div className="sender-name">{m.name}</div>}<div className="bubble">{m.body}</div><div className="message-meta">{clockTime(m.created)}{own&&<><Check size={14}/><span>已发送</span></>}</div></div></div></div>;})}<div ref={bottom}/></div>
  {error&&!modal&&<div className="error-banner" role="alert">{error}{!ready&&signedIn&&<button onClick={initialize}><RefreshCw size={14}/>重试</button>}<button aria-label="关闭错误提示" onClick={()=>setError("")}>×</button></div>}
  <div className="composer-area"><div className={"composer"+(!room?" composer-empty":"")}><div className="composer-input"><button className="icon-button emoji-toggle" disabled={!room} aria-label="添加表情" onClick={()=>setEmoji(!emoji)}><Smile size={23}/></button><textarea ref={input} aria-label="消息内容" placeholder={room?"写点什么…":"创建或加入一个房间，开始你的对话…"} maxLength={2000} disabled={!room} value={draft} onChange={e=>setDrafts(d=>({...d,[selected]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/></div>{emoji&&<div className="emoji-picker">{["😀","😊","👋","❤️","👍","🎉","😂","🤔","☕","✨","🙏","🌈"].map(e=><button aria-label={"插入表情 "+e} key={e} onClick={()=>{setDrafts(d=>({...d,[selected]:(d[selected]||"")+e}));setEmoji(false);input.current?.focus();}}>{e}</button>)}</div>}<div className="composer-toolbar"><span>{draft.length>1800?draft.length+"/2000":"Enter 发送 · Shift + Enter 换行"}</span><button className="primary-button send-button" disabled={!room||!draft.trim()||sending} onClick={send}>{sending?<LoaderCircle className="spin" size={18}/>:<Send size={18}/>}发送</button></div></div></div></main>
  {info&&<RoomInfo room={room} members={members} uid={profile?.id} onClose={()=>setInfo(false)} onInvite={copyInvite}/>}
  {toast&&<div className="toast" role="status"><Check size={18}/>{toast}</div>}
  {modal&&<Modal title={modal==="create"?"新建聊天室":modal==="profile"?"你的聊天昵称":"邀请好友"} onClose={()=>{if(!busy){setModal(null);setError("");}}}>{modal==="invite"?<div className="invite-modal"><p>把下方链接发给朋友，登录后即可加入房间。</p><input aria-label="邀请链接" readOnly value={inviteUrl()} onFocus={e=>e.target.select()}/><button className="primary-button" onClick={copyInvite}><Copy size={17}/>复制链接</button></div>:<form onSubmit={submitModal}><p className="modal-description">{modal==="create"?"给这段对话起个名字，邀请想聊的人。":"朋友们会在消息和房间成员中看到这个名字。"}</p><label>{modal==="create"?"房间名称":"昵称"}<input name="name" required maxLength={modal==="create"?32:24} defaultValue={modal==="profile"?profile?.name:""} placeholder={modal==="create"?"例如：日常闲聊": "怎么称呼你？"} autoFocus/></label>{modal==="create"&&<label>房间介绍 <span>选填</span><textarea name="description" maxLength={160} placeholder="聊聊今天的小事，分享生活中的点滴…" rows={3}/></label>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button modal-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:modal==="create"?<Plus size={17}/>:<Check size={17}/>} {busy?"请稍候…":modal==="create"?"创建聊天室":"保存昵称"}</button></form>}</Modal>}
 </div>;
}


