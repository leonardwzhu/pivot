// Scorecard, injury fallout and teammate splits: each renders with content, the numbers are sane, and phones fit.
// Usage: node tests/hub.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1280,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(process.argv[2]||path.join(__dirname,'../build/draft-room.html'),'utf8'),{waitUntil:'load'});await pg.waitForTimeout(4500);
let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
await pg.click('#mode-season');await pg.click('#tab-models');await pg.waitForTimeout(300);
const sc=await pg.evaluate(()=>({txt:document.getElementById('view-models').innerText,P:typeof PREDS!=='undefined'?PREDS:null}));
check(/Prediction scorecard/.test(sc.txt),'Models tab shows the prediction scorecard');
if(sc.P&&sc.P.n)check(sc.P.mae>3&&sc.P.mae<25&&sc.P.cover>.5&&sc.P.cover<.98,`scorecard numbers are sane (miss ${sc.P.mae}, in range ${sc.P.cover})`);
await pg.click('#tab-waivers');await pg.waitForTimeout(400);
const fo=await pg.evaluate(()=>{const v=document.getElementById('view-waivers');const outs=players.filter(p=>p.out&&regMin(p)>=20).length;return {card:/Injury fallout/.test(v.innerText),outs}});
check(fo.card||!fo.outs,'Waivers shows injury fallout whenever a regular is out (even before the draft)');
const tm=await pg.evaluate(()=>{const p=players.filter(p=>MATES[p.espnId]&&MATES[p.espnId].some(x=>x[3]>=3)).sort((a,b)=>a.rank-b.rank)[0];if(!p)return null;S.drTab='overview';openPlayer(p.id);
  const t=document.getElementById('drawer').innerText;const g=nextGames(p,3);return {name:p.name,sec:/When a teammate sits|When he sits, who gains/.test(t),fin:g.every(x=>isFinite(x.fp)&&x.fp>=0&&Math.abs(x.mate.adj)<=x.base)}});
check(tm&&tm.sec,`teammate splits show on a profile${tm?' ('+tm.name+')':''}`);check(tm&&tm.fin,'teammate adjustments are finite and never exceed his form');
await pg.setViewportSize({width:390,height:800});await pg.waitForTimeout(200);
check(await pg.evaluate(()=>{const d=document.getElementById('drawer');return d.scrollWidth<=d.clientWidth+1}),'phone: profile with teammate tables fits');
await pg.keyboard.press('Escape');await pg.click('#tab-models');await pg.waitForTimeout(300);
check(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'phone: Models tab fits');
check(!errs.length,'no page errors '+errs.join('; '));await b.close();process.exit(fail?1:0)})();
