// Cross-device sync with a stand-in for the artifact store: an edit on one device reaches a fresh device on load, a fresh
// device's boot-time saves never overwrite the saved copy, and an open device is offered a reload when another one changes.
// Usage: node tests/sync.js [build/draft-room.html]
const {chromium}=require('playwright');const path=require('path');
(async()=>{const file='file://'+path.resolve(process.argv[2]||path.join(__dirname,'../build/draft-room.html'));const store={};const subs=[];
let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};const b=await chromium.launch();
const device=async()=>{const ctx=await b.newContext();const pg=await ctx.newPage();const errs=[];let loads=0;pg.on('pageerror',e=>errs.push(e.message));pg.on('load',()=>loads++);
  await pg.exposeFunction('__get',p=>store[p]||null);await pg.exposeFunction('__set',(p,d)=>{store[p]=d;subs.forEach(f=>f(p,d).catch(()=>{}))});
  await pg.addInitScript(()=>{window.claude={use:async n=>n==='db'?{doc:p=>({get:async()=>{const v=await window.__get(p);return {exists:!!v,data:()=>v}},set:d=>window.__set(p,d),onSnapshot:cb=>{window.__snap=cb;return ()=>{}}})}:n==='user'?{id:async()=>'me'}:null}});
  subs.push(async(p,d)=>{await pg.evaluate(([p,d])=>window.__snap&&window.__snap({exists:true,data:()=>d}),[p,d])});
  await pg.goto(file);await pg.waitForTimeout(4000);return {pg,errs,loads:()=>loads}};
// the copy a fresh device saves (no edits yet) must not send another device into a reload loop
const A0=await device();await A0.pg.waitForTimeout(1000);const C=await device();await C.pg.waitForTimeout(14000);const n=C.loads()-1;
check(n<=1,`a second device loads the first device's untouched copy without a reload loop (${n} reload${n===1?"":"s"})`);for(const k in store)delete store[k];
const A=await device();
check(!store['data/users/me/state']||!JSON.parse(store['data/users/me/state'].s).adj?.['4278073'],'a fresh device saves nothing that looks like an edit');
await A.pg.evaluate(()=>{const p=players.find(p=>p.name==="Nikola Jokic");S.adj[p.espnId]={m:.1};save()});await A.pg.waitForTimeout(2000);
const saved=store['data/users/me/state'];check(saved&&JSON.parse(saved.s).adj&&Object.keys(JSON.parse(saved.s).adj).length===1,'an edit on device A is saved to the store');
const B=await device();await B.pg.waitForTimeout(1500);
check(await B.pg.evaluate(()=>Object.keys(S.adj||{}).length===1),'a fresh device B loads that edit');
check(Object.keys(JSON.parse(store['data/users/me/state'].s).adj||{}).length===1,"device B's boot didn't overwrite it");
await B.pg.evaluate(()=>{S.adj={};save()});await B.pg.waitForTimeout(2500);
check(await A.pg.evaluate(()=>!!document.getElementById('syncBar')),'device A, still open, is offered a reload');
check(!A.errs.length&&!B.errs.length,'no page errors '+A.errs.concat(B.errs).join('; '));await b.close();process.exit(fail?1:0)})();
