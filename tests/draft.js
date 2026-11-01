// A full draft, as on draft day: other teams' picks through the board's Taken buttons, ours through the Pick Advisor's top Draft
// button once it has finished updating, one undo along the way, on desktop and a phone. Every pick must register, the advisor must
// always have suggestions, nothing may scroll sideways, and Today and My Team must fill in afterwards. Usage: node tests/draft.js [page]
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{let html=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../build/draft-room.html'),'utf8');let fail=0;const L=JSON.parse(html.match(/const LEAGUE=(\{.*?\});\n/s)[1]);L.draftDate=Date.now()+30*60e3;html=html.replace(/const LEAGUE=\{.*?\};\n/s,'const LEAGUE='+JSON.stringify(L)+';\n');
const b=await chromium.launch();
for(const [w,h] of [[1300,900],[390,844]]){const pg=await b.newPage({viewport:{width:w,height:h}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.setContent(html,{waitUntil:'load'});await pg.waitForTimeout(4000);
  const st=await pg.evaluate(()=>({mode:S.mode,tab:document.querySelector('[role=tab][aria-selected=true]').id,teams:S.teams,slot:S.slot}));
  const times=[],mineTimes=[],issues=[],advWait=[];let undoOk=null;
  for(let k=1;k<=st.teams*13;k++){const mine=await pg.evaluate(()=>teamAt(S.picks.length+1)===S.slot);const t0=Date.now();
    if(mine){const ta=Date.now();await pg.waitForFunction(()=>!document.getElementById('advCard').classList.contains('busy'),null,{timeout:20000});advWait.push(Date.now()-ta);const btn=await pg.$('#adv [data-mine]');if(!btn){issues.push('no advisor button at pick '+k);break}await btn.scrollIntoViewIfNeeded();await btn.click()}
    else{const btn=await pg.$('#tbody [data-take]');if(!btn){issues.push('no Taken button at pick '+k);break}await btn.scrollIntoViewIfNeeded();await btn.click()}
    await pg.waitForFunction(n=>S.picks.length>=n,k,{timeout:15000}).catch(()=>issues.push('pick '+k+' did not register'));const dt=Date.now()-t0;(mine?mineTimes:times).push(dt);
    if(k===30&&undoOk===null){await pg.click('#undo');await pg.waitForTimeout(300);const n=await pg.evaluate(()=>S.picks.length);undoOk=n===29;await pg.evaluate(()=>{});k=29;}
    const ok=await pg.evaluate(()=>{const a=document.getElementById('adv');return S.picks.length>=S.teams*13||!!a.querySelector('.sug')});if(!ok)issues.push('advisor empty after pick '+k)}
  await pg.waitForTimeout(1500);
  const end=await pg.evaluate(()=>({picks:S.picks.length,mine:S.picks.filter(x=>x.mine).length,mode:S.mode,tab:document.querySelector('[role=tab][aria-selected=true]').id,roster:myRoster().length,overflow:document.documentElement.scrollWidth}));
  await pg.click('#mode-season').catch(()=>{});await pg.waitForTimeout(500);
  const season=await pg.evaluate(()=>{const g=document.getElementById('seasonFromDraft');if(g)g.click();return !!g});await pg.waitForTimeout(800);
  await pg.click('#tab-today');await pg.waitForTimeout(500);const today=await pg.evaluate(()=>/Tonight's lineup|best bets/.test(document.getElementById('view-today').innerText));
  await pg.click('#tab-team');await pg.waitForTimeout(800);const team=await pg.evaluate(()=>/Starter points/i.test(document.getElementById('view-team').innerText));
  const q=a=>a.length?[Math.round(a.reduce((x,y)=>x+y)/a.length),Math.max(...a)]:[0,0];
  console.log(`${w}px: advisor ready after others' picks avg ${q(advWait)[0]}ms max ${q(advWait)[1]}ms; start ${st.mode}/${st.tab}; ${end.picks} picks (${end.mine} mine), others avg ${q(times)[0]}ms max ${q(times)[1]}ms, mine avg ${q(mineTimes)[0]}ms max ${q(mineTimes)[1]}ms; undo ${undoOk}; after: roster ${end.roster}, mode ${end.mode}/${end.tab}; season start button ${season}; Today ${today}; My Team ${team}; overflow ${end.overflow}; issues ${issues.length?issues.slice(0,5).join('; '):'none'}; errors ${errs.length?errs.slice(0,3).join('; '):'none'}`);
  const ok=end.picks===st.teams*13&&end.mine===13&&undoOk&&today&&team&&end.overflow<=w&&!issues.length&&!errs.length;if(!ok)fail++;console.log((ok?'ok   ':'FAIL ')+`full draft at ${w}px`);await pg.close()}
await b.close();process.exit(fail?1:0)})();
