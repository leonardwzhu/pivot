// Layout stays put: the draft sidebar shows on every Draft Day tab and never in Season, and clicking tabs or making picks
// moves nothing but content height. Usage: node tests/tabs.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(process.argv[2]||path.join(__dirname,'../build/draft-room.html'),'utf8'),{waitUntil:'load'});await pg.waitForTimeout(5000);
let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
// everything that should hold still: header, dock, mode switch, tab bar and every visible tab, the column's left edge and width
const frame=()=>pg.evaluate(()=>{const R=s=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round).join(',')};
  const tabs=[...document.querySelectorAll('.tabs [role=tab]')].filter(t=>!t.hidden).map(t=>{const r=t.getBoundingClientRect();return t.id+':'+Math.round(r.x)+','+Math.round(r.width)}).join(' ');
  const s=document.querySelector('main section').getBoundingClientRect();
  return {header:R('header.bar'),dock:R('.dock'),modes:R('.modes'),tabsbar:R('.tabs'),tabs,col:Math.round(s.x)+','+Math.round(s.width),rail:!document.getElementById('rail').hidden}});
for(const [mode,tabs] of [['draft',['board','insights','mock','models','news','how','board']],['season',['team','season','waivers','trades','rosters','models','news']]]){
  await pg.click('#mode-'+mode);await pg.waitForTimeout(500);const f0=await frame();check(f0.rail===(mode==='draft'),`${mode}: sidebar ${mode==='draft'?'shown':'hidden'}`);
  for(const t of tabs){await pg.click('#tab-'+t);await pg.waitForTimeout(250);const f=await frame();const moved=Object.keys(f0).filter(k=>f[k]!==f0[k]);check(!moved.length,`${mode}: ${t} moves nothing${moved.length?' (moved: '+moved.join(', ')+')':''}`)}}
await pg.click('#mode-draft');await pg.click('#tab-board');await pg.waitForTimeout(300);const f0=await frame();
for(let i=0;i<4;i++){await pg.click(i===3?'#tbody [data-mine]':'#tbody [data-take]');await pg.waitForTimeout(300)}
const f1=await frame();const moved=Object.keys(f0).filter(k=>f1[k]!==f0[k]);check(!moved.length,`four picks move nothing${moved.length?' (moved: '+moved.join(', ')+')':''}`);
check(!errs.length,'no page errors '+errs.join('; '));await b.close();process.exit(fail?1:0)})();
