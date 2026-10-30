// Load the built page headlessly and fail loudly on any error or implausible result.
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:1000}});const errs=[];
p.on('pageerror',x=>errs.push(x.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+process.argv[2]);await p.waitForTimeout(1500);
const r=await p.evaluate(()=>({players:typeof players!=='undefined'?players.length:0,rows:document.querySelectorAll('#tbody tr').length,ms:typeof MODEL_MS!=='undefined'?MODEL_MS:-1,fetched:typeof FETCHED!=='undefined'?FETCHED:null,top:typeof players!=='undefined'?[...players].sort((a,b)=>a.modelRank-b.modelRank).slice(0,3).map(x=>x.name):[]}));
// visit every tab in both modes (Season tabs are hidden in Draft Day and vice versa)
for(const [m,ts] of [['season',['team','players','season','waivers','trades','rosters','models','news']],['draft',['insights','mock','board']]]){await p.click('#mode-'+m);await p.waitForTimeout(150);for(const t of ts){await p.click('#tab-'+t);await p.waitForTimeout(150)}}
await p.setViewportSize({width:400,height:800});await p.click('#mode-draft');await p.click('#tab-board');await p.waitForTimeout(200);const sw=await p.evaluate(()=>document.documentElement.scrollWidth);
console.log(JSON.stringify({...r,phoneWidth:sw,errors:errs}));await b.close();
if(errs.length||r.players<350||r.rows<50||sw>400){console.error('SMOKE TEST FAILED');process.exit(1)}})().catch(e=>{console.error(e);process.exit(1)});
