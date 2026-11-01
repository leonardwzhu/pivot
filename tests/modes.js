// Draft Day / Season modes: which mode the app opens in before and after the draft, which tabs and header parts
// each mode shows, and that each mode remembers its last tab. Usage: node tests/modes.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../build/draft-room.html'),'utf8');
// simulate a finished draft: snake picks of ESPN's top 104, rosters from those picks
const E=JSON.parse(html.match(/const ESPN=(\[.*?\]);\n/s)[1]).filter(o=>o.rk).sort((a,b)=>a.rk-b.rk).slice(0,104);
const L=JSON.parse(html.match(/const LEAGUE=(\{.*?\});\n/s)[1]);L.drafted=true;L.fetched='2026-11-02';const at=o=>{const r=Math.floor((o-1)/8),i=(o-1)%8;return r%2===0?i+1:8-i};
L.picks=E.map((o,i)=>[i+1,at(i+1),o.e]);L.rosters={};L.picks.forEach(p=>(L.rosters[p[1]]=L.rosters[p[1]]||[]).push(p[2]));
const W=JSON.parse(html.match(/const LEAGUE=(\{.*?\});\n/s)[1]);W.drafted=false;W.draftDate=Date.now()+2*36e5;const soon=html.replace(/const LEAGUE=\{.*?\};\n/s,'const LEAGUE='+JSON.stringify(W)+';\n');
const B=JSON.parse(html.match(/const LEAGUE=(\{.*?\});\n/s)[1]);B.drafted=false;B.draftDate=Date.now()+3*864e5;const before=html.replace(/const LEAGUE=\{.*?\};\n/s,'const LEAGUE='+JSON.stringify(B)+';\n');
const post=html.replace(/const LEAGUE=\{.*?\};\n/s,'const LEAGUE='+JSON.stringify(L)+';\n');
const b=await chromium.launch();let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
const state=pg=>pg.evaluate(()=>({mode:S.mode,tabs:[...document.querySelectorAll('.tabs [role=tab]')].filter(x=>!x.hidden).map(x=>x.id.slice(4)),
  sel:document.querySelector('.tabs [aria-selected=true]').id.slice(4),clock:getComputedStyle(document.querySelector('.clock')).display!=='none',
  bar:document.getElementById('seasonBar').hidden||getComputedStyle(document.getElementById('seasonBar')).display==='none'?null:document.getElementById('seasonBar').innerText.replace(/\n/g,' | ')}));
for(const [name,h] of [['before draft',before],['2 hours before the draft',soon],['after draft',post]]){const ctx=await b.newContext({viewport:{width:1280,height:800}});const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.setContent(h,{waitUntil:'load'});await pg.waitForTimeout(4500);let s=await state(pg);console.log(name,JSON.stringify(s));
  if(name==='before draft'){check(s.mode==='season'&&s.sel==='today'&&!s.clock&&!!s.bar,'days before the draft, opens in Season on Today with the week bar');check(await pg.evaluate(()=>/Open Draft Day/.test(document.getElementById('view-today').innerText)),'Today points to the draft');
    await pg.click('#mode-draft');await pg.waitForTimeout(600);s=await state(pg);check(s.mode==='draft'&&s.sel==='board'&&s.clock&&!s.bar,'Draft Day opens the Big Board with the draft clock');check(!s.tabs.includes('team')&&s.tabs.includes('mock'),'draft tabs only (plus shared)')}
  else if(name==='2 hours before the draft'){check(s.mode==='draft'&&s.sel==='board','close to the draft, opens in Draft Day on the Big Board')}
  else{check(s.mode==='season'&&s.sel==='today'&&!!s.bar&&/%/.test(s.bar),'opens in Season on Today with this week\'s win chance');
    await pg.click('#tab-waivers');await pg.click('#mode-draft');await pg.waitForTimeout(400);s=await state(pg);check(s.mode==='draft'&&s.sel==='board','Draft Day opens the Big Board');
    await pg.click('#mode-season');await pg.waitForTimeout(400);s=await state(pg);check(s.sel==='waivers','Season remembers its last tab');
    await pg.setViewportSize({width:390,height:800});await pg.waitForTimeout(300);check(await pg.evaluate(()=>document.documentElement.scrollWidth)<=390,'no sideways scroll on a phone')}
  check(!errs.length,name+': no page errors '+errs.join('; '));await ctx.close()}
await b.close();process.exit(fail?1:0)})();
