"use client";
import { useEffect,useRef } from "react";
import { X,Hash,Users,Copy } from "lucide-react";
import type { Profile,Room } from "./chat-types";
export function Avatar({name,small=false}:{name:string;small?:boolean}) {return <span className={"avatar"+(small?" small":"")}>{Array.from(name)[0] || "半"}</span>;}
export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20}/></button></div>{children}</dialog>;
}
export function RoomInfo({room,members,uid,onClose,onInvite}:{room?:Room;members:Profile[];uid?:string;onClose:()=>void;onInvite:()=>void}) {
 return <aside className="room-info"><div className="info-heading"><h2>房间信息</h2><button className="icon-button" aria-label="关闭房间信息" onClick={onClose}><X size={20}/></button></div><div className="room-about"><span className="room-symbol"><Hash size={38}/></span><h2>{room?.name || "欢迎来到半刻"}</h2><p>{room?.description || "留半刻时间，聊聊身边的小事。\n和朋友的每一次交流，都值得被记住。"}</p></div>{room ? <><div className="member-title"><Users size={19}/>房间成员 <span>{members.length}</span></div><div className="member-list">{members.map(m=><div className="member" key={m.id}><Avatar name={m.name}/><div><strong>{m.name}{m.id===uid?"（我）":""}</strong>{m.id===room.owner&&<span className="owner">房主</span>}</div></div>)}</div><button className="subtle-button" onClick={onInvite}><Copy size={16}/>复制邀请链接</button><p className="info-note">拥有邀请链接的朋友，登录自己的账号即可加入此房间。</p></> : <div className="room-tips"><p><b>01</b><span>创建你的第一个聊天室</span></p><p><b>02</b><span>把邀请链接分享给朋友</span></p><p><b>03</b><span>从一句「你好」开始</span></p></div>}</aside>;
}

