"use strict";
/**
 * 内存版 store，结构与 CloudBase 适配器一致，专供本地测试。
 * 返回的 doc 均为深拷贝，避免测试代码意外共享引用。
 */
function clone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function createMemoryStore(){
  const cols = new Map();
  function col(name){
    if (!cols.has(name)) cols.set(name, new Map());
    return cols.get(name);
  }
  function matches(doc, q){
    for (const [k, spec] of Object.entries(q||{})) {
      const v = k === "_id" ? doc._id : doc[k];
      if (spec !== null && typeof spec === "object" && !Array.isArray(spec)) {
        if ("lt" in spec && !(v < spec.lt)) return false;
        if ("gt" in spec && !(v > spec.gt)) return false;
        if ("ne" in spec && !(v !== spec.ne)) return false;
        if ("in" in spec && !spec.in.includes(v)) return false;
      } else if (v !== spec) return false;
    }
    return true;
  }
  return {
    async find(name, q, opts){
      let rows = [...col(name).values()].filter(d=>matches(d,q));
      if (opts && opts.orderBy) {
        const f = opts.orderBy, dir = opts.desc ? -1 : 1;
        rows.sort((a,b)=> a[f]<b[f]?-1*dir : a[f]>b[f]?dir : 0);
      }
      if (opts && opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map(clone);
    },
    async count(name, q){
      return [...col(name).values()].filter(d=>matches(d,q)).length;
    },
    async get(name, id){
      const d = col(name).get(id);
      return d ? clone(d) : null;
    },
    async add(name, id, data){
      const c = col(name);
      if (c.has(id)) return false;
      c.set(id, {...clone(data), _id: id});
      return true;
    },
    async update(name, id, patch){
      const c = col(name), d = c.get(id);
      if (d) c.set(id, {...d, ...clone(patch)});
      return d ? {updated:1} : {updated:0};
    },
    async inc(name, id, field, delta, init){
      const c = col(name);
      const d = c.get(id);
      if (!d) { c.set(id, {...clone(init), _id: id, [field]: (init[field]||0)+delta}); return (init[field]||0)+delta; }
      d[field] = (d[field]||0)+delta;
      return d[field];
    },
    async del(name, id){ col(name).delete(id); },
    async delWhere(name, q){
      const c = col(name);
      for (const [id,d] of [...c]) if (matches(d,q)) c.delete(id);
    },
  };
}

module.exports = { createMemoryStore };
