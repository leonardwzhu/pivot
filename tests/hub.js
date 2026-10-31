// Scorecard, injury fallout and teammate splits: each renders with content, the numbers are sane, and phones fit.
// Usage: node tests/hub.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const openTab=async(pg,t)=>{if(await pg.$eval('#tab-'+t,e=>e.hasAttribute('data-more'))){await pg.click('#moreBtn');await pg.click('[data-moretab="'+t+'"]')}else await pg.click('#tab-'+t)};  // Trades, Rosters, Models and Method open from the More menu
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1280,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(process.argv[2]||path.join(__dirname,'../build/draft-room.html'),'utf8'),{waitUntil:'load'});await pg.waitForTimeout(4500);
let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
await pg.click('#mode-season');await openTab(pg,'models');await pg.waitForTimeout(300);
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
await pg.keyboard.press('Escape');await openTab(pg,'models');await pg.waitForTimeout(300);
check(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'phone: Models tab fits');
await pg.setViewportSize({width:1280,height:900});await pg.click('#tab-today');await pg.waitForTimeout(300);
check(/After your draft|Your draft is|Tonight's lineup/.test(await pg.evaluate(()=>document.getElementById('view-today').innerText)),'Today screen renders');
await pg.keyboard.press('/');await pg.keyboard.type('jokic');await pg.keyboard.press('Enter');await pg.waitForTimeout(300);
check(await pg.evaluate(()=>document.getElementById('finder').hidden&&/Jokic/.test(document.getElementById('drawer').innerText)),'"/" finds a player and opens his profile');
await pg.click('#tab-ana');await pg.waitForTimeout(200);
const ana=await pg.evaluate(()=>{S.ana={n:10,ids:[...players].sort((a,b)=>a.rank-b.rank).filter((_,i)=>i%10===3).slice(0,13).map(p=>p.espnId)};renderAna();const t=document.getElementById('view-ana').innerText;return {grade:/Would rank/i.test(t),todo:/What to do/.test(t),rows:document.querySelectorAll('#view-ana .tablebox')[1].querySelectorAll('tbody tr').length}});
check(ana.grade&&ana.todo&&ana.rows===13,'Team Analyzer grades a pasted 13-man team and suggests moves');
const tr=await pg.evaluate(()=>{const b=document.querySelector('[data-anatry]');if(!b)return {n:0};b.click();const t=document.getElementById('view-ana').innerText;return {n:document.querySelectorAll('[data-anatry]').length,v:/Good for you|Close to even|Bad for you/.test(t),calls:document.querySelectorAll('#view-ana .call').length}});
check(tr.n>0&&tr.v,'Team Analyzer suggests trades and scores one');check(tr.calls<=1,`one orange "call" on the analyzer at most (${tr.calls})`);
const mv=await pg.evaluate(()=>{const D=dayRanks(),top=[...players].sort((a,b)=>seasonRank(a)-seasonRank(b))[0],ok=players.every(p=>{const x=D.R.get(p.id);return x&&x.rank.every(r=>r>=1&&r<=players.length)&&x.fp.every(isFinite)});
  S.pl.view='mv';renderPlayers();return {ok,days:D.Q.length,top:seasonRank(top),pos:posRank(top),rows:document.querySelectorAll('#view-players tbody tr').length,today:Math.abs(top.proj.fp-D.R.get(top.id).fp[D.last])}});
check(mv.ok&&mv.days>=1&&mv.top===1&&mv.pos===1,`daily in-house ranks for every player over ${mv.days} days`);check(mv.today<.05,"the latest day's rebuilt projection matches the projection shown");check(mv.rows>20,'Movers view lists players');
check(/updated /.test(await pg.evaluate(()=>document.getElementById('asof').textContent)),'header says when the data was updated');
check(!errs.length,'no page errors '+errs.join('; '));await b.close();process.exit(fail?1:0)})();
