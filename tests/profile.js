// Player profile: every section opens without errors for a star, an injured player, a rookie and a deep-bench player;
// recent games, the advanced profile and comparisons have content; season-ending injuries read as such; phone fits.
// Usage: node tests/profile.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1280,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(process.argv[2]||path.join(__dirname,'../build/draft-room.html'),'utf8'),{waitUntil:'load'});await pg.waitForTimeout(4500);
let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
const ids=await pg.evaluate(()=>{const top=[...players].sort((a,b)=>a.rank-b.rank)[0],inj=players.find(p=>p.out&&p.rank<80),rook=players.find(p=>p.rook&&p.rank<150),deep=[...players].sort((a,b)=>b.rank-a.rank)[0];return [top,inj,rook,deep].filter(Boolean).map(p=>p.id)});
for(const id of ids){const r=await pg.evaluate(id=>{const out={};for(const t of ['overview','stats','proj','compare']){S.drTab=t;openPlayer(id);out[t]=document.getElementById('drawer').innerText.length}
  S.drTab='overview';openPlayer(id);return {name:players[id].name,out,games:document.querySelectorAll('#drawer .dr-sec table tbody tr').length,tabsH:document.querySelector('.dtabs').getBoundingClientRect().height}},id);
  check(Object.values(r.out).every(n=>n>400)&&r.tabsH>20,`${r.name}: all four sections render (tab bar ${Math.round(r.tabsH)}px)`)}
const star=await pg.evaluate(id=>{S.drTab='overview';openPlayer(id);const t=document.getElementById('drawer').innerText;S.drTab='stats';openPlayer(id);const s=document.getElementById('drawer').innerText;S.drTab='compare';openPlayer(id);
  return {games:/Recent games[\s\S]*Did not play|Recent games[\s\S]*\d+-\d+/.test(t),adv:/True shooting/.test(s)&&/Box plus-minus/.test(s),cmp:document.querySelectorAll('#drawer [data-cmp]').length}},ids[0]);
check(star.games,'top player has recent games');check(star.adv,'advanced profile shows true shooting and box plus-minus');check(star.cmp>=3,'closest alternatives listed');
const ofs=await pg.evaluate(()=>{const p=players.find(p=>p.inj&&p.inj.fs==='OFS');if(!p)return null;return insightsOf(p).map(x=>x.t).join(' ')});
if(ofs!==null)check(/Out for the season/.test(ofs)&&!/Priced high|Value pick/.test(ofs),'season-ending injury reads "Out for the season" with nothing else');
const kits=await pg.evaluate(()=>{const T=[...new Set(players.map(p=>p.team))].filter(t=>t!=='FA');return T.filter(t=>!(KITS[t]&&KIT_NUM[t]))});
check(!kits.length,'every team has pixel jersey art and number settings'+(kits.length?' (missing: '+kits.join(', ')+')':''));
await pg.setViewportSize({width:390,height:800});await pg.evaluate(id=>{S.drTab='overview';openPlayer(id)},ids[0]);await pg.waitForTimeout(200);
check(await pg.evaluate(()=>{const d=document.getElementById('drawer'),t=document.querySelector('.dtabs');return d.scrollWidth<=d.clientWidth+1&&t.scrollWidth<=t.clientWidth+1}),'phone: panel and section tabs fit');
check(!errs.length,'no page errors '+errs.join('; '));await b.close();process.exit(fail?1:0)})();
