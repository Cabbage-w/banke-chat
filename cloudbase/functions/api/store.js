"use strict";
/**
 * CloudBase 云数据库 store 适配器（服务端 SDK）。
 * 集合：profiles / accounts / sessions / rooms / members / messages / counters / limits
 * 首次写入时 CloudBase 会自动创建集合，无需预建。
 */
const cloudbase = require("@cloudbase/node-sdk");

function createCloudStore(){
  const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
  const db = app.database();
  const _ = db.command;
  const C = name => db.collection(name);

  function translate(v){
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    if ("lt" in v) return _.lt(v.lt);
    if ("gt" in v) return _.gt(v.gt);
    if ("in" in v) return _.in(v.in);
    if ("ne" in v) return _.ne(v.ne);
    return v;
  }
  function cond(q){
    const out = {};
    for (const [k,v] of Object.entries(q||{})) out[k] = translate(v);
    return out;
  }

  return {
    async find(name, q, opts){
      let c = C(name).where(cond(q));
      if (opts && opts.orderBy) c = c.orderBy(opts.orderBy, opts.desc ? "desc" : "asc");
      if (opts && opts.limit) c = c.limit(opts.limit);
      const r = await c.get();
      return r.data || [];
    },
    async count(name, q){
      const r = await C(name).where(cond(q)).count();
      return r.total || 0;
    },
    async get(name, id){
      const r = await C(name).where({_id: id}).get();
      return (r.data && r.data[0]) || null;
    },
    async add(name, id, data){
      try {
        await C(name).add({data: {...data, _id: id}});
        return true;
      } catch(e) {
        const msg = String(e && (e.message || e));
        if (/exist|_id|dup|conflict/i.test(msg)) return false;
        throw e;
      }
    },
    async update(name, id, patch){
      await C(name).doc(id).update(patch);
    },
    async inc(name, id, field, delta, init){
      let r;
      try { r = await C(name).doc(id).update({[field]: _.inc(delta)}); }
      catch(e) { r = null; }
      if (!r || !r.updated) {
        try {
          await C(name).add({data: {...init, _id: id, [field]: (init[field]||0)+delta}});
          return (init[field]||0)+delta;
        } catch(e) { /* 并发下已被别人创建，落到下方读取 */ }
      }
      const after = await this.get(name, id);
      return after ? (after[field] || 0) : delta;
    },
    async del(name, id){
      try { await C(name).doc(id).remove(); } catch(e) { /* 不存在即视为已删 */ }
    },
    async delWhere(name, q){
      try { await C(name).where(cond(q)).remove(); } catch(e) { console.error("delWhere failed", name, e && e.message); }
    },
  };
}

module.exports = { createCloudStore };
