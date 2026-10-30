const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();
for(const mode of ['pre','post','mid']){
  let html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../build/draft-room.html'),'utf8');
  if(mode!=='pre'){const E=JSON.parse(html.match(/const ESPN=(\[.*?\]);\n/s)[1]).filter(o=>o.rk).sort((a,b)=>a.rk-b.rk).slice(0,104);
    const L=JSON.parse(html.match(/const LEAGUE=(\{.*?\});\n/s)[1]);L.drafted=true;L.fetched='2026-11-02';
    const at=o=>{const r=Math.floor((o-1)/8),i=(o-1)%8;return r%2===0?i+1:8-i};
    L.picks=E.map((o,i)=>[i+1,at(i+1),o.e]);L.rosters={};L.picks.forEach(p=>(L.rosters[p[1]]=L.rosters[p[1]]||[]).push(p[2]));
    if(mode==='mid'){L.rec={};for(let t=1;t<=8;t++)L.rec[t]=[t%4,3-t%4,0,1100*3+t*20,1100*3];L.results=[];for(let w=0;w<3;w++){const seen=new Set();for(let a=1;a<=8;a++){const o=L.opp[w][a];if(seen.has(a))continue;seen.add(a);seen.add(o);L.results.push([w+1,a,1100+a*10,o,1090+o*7,'HOME'])}}}
    html=html.replace(/const LEAGUE=\{.*?\};\n/s,'const LEAGUE='+JSON.stringify(L)+';\n');}
  const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.setContent(html,{waitUntil:'load'});await pg.waitForTimeout(5000);
  const t0=Date.now();await pg.click('#tab-team');await pg.waitForTimeout(300);const t1=Date.now()-t0;
  await pg.waitForFunction(()=>!document.getElementById('tradeIdeas')||!/Searching/.test(document.getElementById('tradeIdeas').innerText),{timeout:30000});
  const txt=await pg.evaluate(()=>document.getElementById('view-team').innerText);
  console.log('=====',mode,'render ms',t1,'errors',errs);console.log(txt.slice(0,300));
  if(mode==='post'){await pg.setViewportSize({width:390,height:800});await pg.waitForTimeout(300);console.log('phone overflow',await pg.evaluate(()=>document.documentElement.scrollWidth))}
  await pg.close()}
await b.close()})();
