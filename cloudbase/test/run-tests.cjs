"use strict";
/**
 * 半刻 API 本地行为测试（内存 store，不需要腾讯云）。
 * 运行：node cloudbase/test/run-tests.js
 */
const assert = require("node:assert");
const { createMemoryStore } = require("../functions/api/memory-store");
const { handleApi, allowedOrigin } = require("../functions/api/api-core");

let passed = 0;
function ok(name, fn){ return {name, fn}; }

async function run(){
  const tests = [];
  const uuidA = "11111111-1111-4111-8111-111111111111";
  const uuidB = "22222222-2222-4222-8222-222222222222";
  const uuidC = "33333333-3333-4333-8333-333333333333";

  function makeCtx(store, over = {}){
    return {method:"GET", path:"/api/chat", query:{}, headers:{}, body:undefined, ip:"", store, now: Date.now, bcryptCost: 4, ...over};
  }
  async function call(store, over){ return handleApi(makeCtx(store, over)); }

  async function registerAndInit(store, username, t = Date.now()){
    let r = await call(store, {path:"/api/session", method:"POST", body:{action:"register", username, password:"password123", confirmPassword:"password123"}});
    assert.equal(r.status, 200, `register ${username}: ${JSON.stringify(r.data)}`);
    const token = r.data.token;
    r = await call(store, {method:"POST", headers:{authorization:"Bearer "+token, origin:"https://cabbage-w.github.io"}, body:{action:"init"}});
    assert.equal(r.status, 200);
    return token;
  }

  tests.push(ok("CORS：允许 github.io 与本地端口，拒绝陌生来源", async ()=>{
    assert.ok(allowedOrigin("https://cabbage-w.github.io"));
    assert.ok(allowedOrigin("http://localhost:4173"));
    assert.ok(allowedOrigin(""));
    assert.ok(!allowedOrigin("https://evil.example"));
  }));

  tests.push(ok("注册→init→建房→邀请→加入→发消息→拉取消息 全链路", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const tB = await registerAndInit(store, "bob");
    const authA = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    const authB = {authorization:"Bearer "+tB, origin:"https://cabbage-w.github.io"};

    let r = await call(store, {method:"POST", headers:authA, body:{action:"create", name:"日常闲聊", description:"聊聊今天"}});
    assert.equal(r.status, 200); const roomId = r.data.id;

    // 房间出现在列表，带邀请 token
    r = await call(store, {headers:authA});
    assert.equal(r.status, 200);
    assert.equal(r.data.rooms.length, 1);
    assert.equal(r.data.rooms[0].id, roomId);
    assert.ok(r.data.rooms[0].token);
    assert.equal(r.data.profile.name, "alice");
    const roomToken = r.data.rooms[0].token;

    // bob 通过邀请 token 加入
    r = await call(store, {method:"POST", headers:authB, body:{action:"join", token:roomToken}});
    assert.equal(r.status, 200); assert.equal(r.data.id, roomId);

    // 两人发消息
    r = await call(store, {method:"POST", headers:authA, body:{action:"send", id:uuidA, room:roomId, body:"  你好呀  "}});
    assert.equal(r.status, 200);
    r = await call(store, {method:"POST", headers:authB, body:{action:"send", id:uuidB, room:roomId, body:"嗨！"}});
    assert.equal(r.status, 200);

    // 拉取：seq 升序、带发送者昵称、成员表
    r = await call(store, {path:"/api/chat", headers:authB, query:{room:roomId}});
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.messages.map(m=>m.body), ["你好呀","嗨！"]);
    assert.equal(r.data.messages[0].name, "alice");
    assert.deepEqual(r.data.members.map(m=>m.name).sort(), ["alice","bob"]);
    assert.ok(r.data.messages[0].seq > 0 && r.data.messages[1].seq > r.data.messages[0].seq);

    // 未加入的人读不到
    const tC = await registerAndInit(store, "carol");
    r = await call(store, {headers:{authorization:"Bearer "+tC}, query:{room:roomId}});
    assert.equal(r.status, 403);
  }));

  tests.push(ok("幂等：同一消息 id 重发不产生重复；他人 id 冲突 409", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    let r = await call(store, {method:"POST", headers:auth, body:{action:"create", name:"房间"}});
    const roomId = r.data.id;
    r = await call(store, {method:"POST", headers:auth, body:{action:"send", id:uuidA, room:roomId, body:"第一条"}});
    assert.equal(r.status, 200);
    r = await call(store, {method:"POST", headers:auth, body:{action:"send", id:uuidA, room:roomId, body:"第一条"}});
    assert.equal(r.status, 200);
    const tB = await registerAndInit(store, "bob");
    r = await call(store, {method:"POST", headers:{authorization:"Bearer "+tB}, body:{action:"join", token:(await call(store,{headers:auth})).data.rooms[0].token}});
    r = await call(store, {method:"POST", headers:{authorization:"Bearer "+tB, origin:"https://cabbage-w.github.io"}, body:{action:"send", id:uuidA, room:roomId, body:"冒充"}});
    assert.equal(r.status, 409);
    r = await call(store, {headers:auth, query:{room:roomId}});
    assert.equal(r.data.messages.length, 1);
  }));

  tests.push(ok("发送校验：空消息/超长/坏 uuid 被拒", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    const roomId = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"x"}})).data.id;
    for (const body of [{action:"send", id:uuidA, room:roomId, body:"   "}, {action:"send", id:uuidA, room:roomId, body:"x".repeat(2001)}, {action:"send", id:"not-a-uuid", room:roomId, body:"hi"}]) {
      const r = await call(store, {method:"POST", headers:auth, body});
      assert.equal(r.status, 400, JSON.stringify(body).slice(0,40));
    }
  }));

  tests.push(ok("限流：10 秒内第 11 条消息 429", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    const roomId = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"x"}})).data.id;
    let last;
    for (let i=0;i<10;i++){
      last = await call(store, {method:"POST", headers:auth, body:{action:"send", id:`aaaaaaaa-0000-4000-8000-${String(i).padStart(12,"0")}`, room:roomId, body:"m"+i}});
      assert.equal(last.status, 200);
    }
    last = await call(store, {method:"POST", headers:auth, body:{action:"send", id:`aaaaaaaa-0000-4000-8000-999999999999`, room:roomId, body:"m11"}});
    assert.equal(last.status, 429);
  }));

  tests.push(ok("分页：before 只取更早消息", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    const roomId = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"x"}})).data.id;
    for (let i=0;i<5;i++) await call(store, {method:"POST", headers:auth, body:{action:"send", id:`aaaaaaaa-0000-4000-8000-${String(i).padStart(12,"0")}`, room:roomId, body:"m"+i}});
    let r = await call(store, {headers:auth, query:{room:roomId}});
    const all = r.data.messages;
    assert.equal(all.length, 5);
    r = await call(store, {headers:auth, query:{room:roomId, before:String(all[3].seq)}});
    assert.deepEqual(r.data.messages.map(m=>m.seq), all.slice(0,3).map(m=>m.seq));
  }));

  tests.push(ok("注册校验：密码短/不一致/用户名非法/重复", async ()=>{
    const store = createMemoryStore();
    const S = {path:"/api/session", method:"POST"};
    let r = await call(store, {...S, body:{action:"register", username:"ab", password:"password123", confirmPassword:"password123"}});
    assert.equal(r.status, 400); // 用户名太短
    r = await call(store, {...S, body:{action:"register", username:"okname", password:"short1!", confirmPassword:"short1!"}});
    assert.equal(r.status, 400); // 密码太短
    r = await call(store, {...S, body:{action:"register", username:"okname", password:"password123", confirmPassword:"different"}});
    assert.equal(r.status, 400); // 不一致
    r = await call(store, {...S, body:{action:"register", username:"okname", password:"password123", confirmPassword:"password123"}});
    assert.equal(r.status, 200);
    r = await call(store, {...S, body:{action:"register", username:"OKNAME", password:"password456", confirmPassword:"password456"}});
    assert.equal(r.status, 409); // 大小写归一后重复
  }));

  tests.push(ok("登录：对/错密码、dummy 时序防护、多会话并存", async ()=>{
    const store = createMemoryStore();
    const t1 = await registerAndInit(store, "alice");
    const S = {path:"/api/session", method:"POST"};
    let r = await call(store, {...S, body:{action:"login", username:"alice", password:"wrongpass"}});
    assert.equal(r.status, 401);
    r = await call(store, {...S, body:{action:"login", username:"nobody", password:"whatever123"}});
    assert.equal(r.status, 401);
    r = await call(store, {...S, body:{action:"login", username:"alice", password:"password123"}});
    assert.equal(r.status, 200);
    const t2 = r.data.token;
    // 与原版一致：重新登录不踢旧会话，多设备并存
    r = await call(store, {headers:{authorization:"Bearer "+t1}});
    assert.equal(r.status, 200);
    r = await call(store, {headers:{authorization:"Bearer "+t2}});
    assert.equal(r.status, 200);
    assert.equal(r.data.profile.name, "alice");
  }));

  tests.push(ok("logout 撤销会话", async ()=>{
    const store = createMemoryStore();
    const t = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+t, origin:"https://cabbage-w.github.io"};
    let r = await call(store, {path:"/api/session", method:"POST", headers:auth, body:{action:"logout"}});
    assert.equal(r.status, 200);
    r = await call(store, {headers:auth});
    assert.equal(r.status, 401);
  }));

  tests.push(ok("昵称更新反映到消息列表与房间成员", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    const roomId = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"x"}})).data.id;
    await call(store, {method:"POST", headers:auth, body:{action:"send", id:uuidA, room:roomId, body:"hello"}});
    let r = await call(store, {method:"POST", headers:auth, body:{action:"profile", name:"小爱"}});
    assert.equal(r.status, 200);
    r = await call(store, {headers:auth, query:{room:roomId}});
    assert.equal(r.data.messages[0].name, "小爱");
    assert.equal(r.data.members[0].name, "小爱");
  }));

  tests.push(ok("房间上限 30、名字校验、未知 action", async ()=>{
    const store = createMemoryStore();
    const tA = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+tA, origin:"https://cabbage-w.github.io"};
    let r = await call(store, {method:"POST", headers:auth, body:{action:"create", name:""}});
    assert.equal(r.status, 400);
    r = await call(store, {method:"POST", headers:auth, body:{action:"create", name:"x".repeat(33)}});
    assert.equal(r.status, 400);
    for (let i=0;i<30;i++){
      r = await call(store, {method:"POST", headers:auth, body:{action:"create", name:"房"+i}});
      assert.equal(r.status, 200, "第"+i+"个房间");
    }
    r = await call(store, {method:"POST", headers:auth, body:{action:"create", name:"多出来的"}});
    assert.equal(r.status, 400);
    r = await call(store, {method:"POST", headers:auth, body:{action:"dance"}});
    assert.equal(r.status, 400);
  }));

  tests.push(ok("邀请 token 无效 404；未登录 401；非字符串字段 400", async ()=>{
    const store = createMemoryStore();
    let r = await call(store, {method:"POST", headers:{authorization:"Bearer "+"f".repeat(64)}, body:{action:"join", token:"bad"}});
    assert.equal(r.status, 401); // 会话无效视为未登录
    const t = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+t, origin:"https://cabbage-w.github.io"};
    r = await call(store, {method:"POST", headers:auth, body:{action:"join", token:"bad"}});
    assert.equal(r.status, 404);
    r = await call(store, {method:"POST", body:{action:"create", name:"x"}});
    assert.equal(r.status, 401);
    r = await call(store, {headers:{authorization:"Bearer "+"f".repeat(64)}});
    assert.equal(r.status, 401);
    r = await call(store, {method:"POST", headers:{origin:"https://cabbage-w.github.io"}, body:{action:"join", token: 123}});
    assert.equal(r.status, 401); // 未登录先于字段校验
    r = await call(store, {method:"POST", headers:auth, body:{action:"join", token: 123}});
    assert.equal(r.status, 400);
    r = await call(store, {method:"POST", headers:{authorization:"Bearer "+t, origin:"https://cabbage-w.github.io"}, body:{action:"create", name:"x", extra: 1}});
    assert.equal(r.status, 400);
  }));

  tests.push(ok("register 限流：同 IP 1 小时内第 11 次注册 429", async ()=>{
    const store = createMemoryStore();
    const S = {path:"/api/session", method:"POST", ip:"1.2.3.4"};
    let last;
    for (let i=0;i<10;i++){
      last = await call(store, {...S, body:{action:"register", username:"user_"+i, password:"password123", confirmPassword:"password123"}});
      assert.equal(last.status, 200);
    }
    last = await call(store, {...S, body:{action:"register", username:"user_over", password:"password123", confirmPassword:"password123"}});
    assert.equal(last.status, 429);
  }));

  tests.push(ok("lastMessage/lastTime 排序：最近活跃的房间排前", async ()=>{
    const store = createMemoryStore();
    const t = await registerAndInit(store, "alice");
    const auth = {authorization:"Bearer "+t, origin:"https://cabbage-w.github.io"};
    const r1 = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"旧房"}})).data.id;
    await new Promise(res=>setTimeout(res,5));
    const r2 = (await call(store, {method:"POST", headers:auth, body:{action:"create", name:"新房"}})).data.id;
    await new Promise(res=>setTimeout(res,5));
    await call(store, {method:"POST", headers:auth, body:{action:"send", id:uuidA, room:r2, body:"新动静"}});
    const r = await call(store, {headers:auth});
    assert.equal(r.data.rooms[0].id, r2);
    assert.equal(r.data.rooms[0].lastMessage, "新动静");
    assert.ok(r.data.rooms[0].lastTime);
  }));

  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log("  ✓", t.name); }
    catch(e){ failed++; console.error("  ✗", t.name, "\n    ", e.message); }
  }
  console.log(`\n${passed}/${tests.length} 通过`);
  process.exit(failed ? 1 : 0);
}

run().catch(e=>{ console.error(e); process.exit(1); });
