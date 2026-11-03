// Injuries and tonight's points from the league sync: ESPN's fantasy status for rostered players updates the page between builds. A healthy starter
// listed day-to-day flips, with his return date, games left and season total; a player on ESPN's injury report stays flagged even
// when his fantasy status reads active (the build's rule: either source); the update panel says what changed; a reload applies
// the saved sync before projections exist without errors. ESPN is blocked so only the made-up sync is applied.
// Needs a build whose league has drafted. Usage: node tests/injuries.js [build/draft-room.html]
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const file=process.argv[2]||path.join(__dirname,'../build/draft-room.html');let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
  const pg=await b.newPage({viewport:{width:1100,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/lm-api-reads.fantasy.espn.com/**',r=>r.abort());await pg.goto('file://'+file);await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  if(!(await pg.evaluate(()=>HAS_LG()&&LEAGUE.drafted&&!!LEAGUE.rosters))){console.log('skip: this build\'s league has not drafted');await b.close();return}
  // a healthy player of yours with a game in the next three days, and anyone on a roster flagged by the injury report
  const pick=await pg.evaluate(()=>{const mine=myRoster(),h=mine.filter(p=>!p.out&&!p.dtd&&p.days.slice(0,3).length).sort((a,b)=>b.projTot-a.projTot)[0],
      rep=Object.values(LEAGUE.rosters).flat().map(e=>BY_ESPN.has(e)?players[BY_ESPN.get(e)]:null).find(p=>p&&p.inj&&(p.inj.status==="Out"||p.inj.status==="Day-To-Day"));
    return {h:h&&{e:h.espnId,name:h.name,retP:h.retP,tot:h.projTot},rep:rep&&{e:rep.espnId,name:rep.name,out:rep.out,dtd:rep.dtd}}});
  check(!!pick.h,`a healthy player to test with: ${pick.h&&pick.h.name}`);
  const sync=st=>pg.evaluate(([h,rep,st])=>{const inj=Object.fromEntries(Object.values(LEAGUE.rosters).flat().map(e=>{const p=BY_ESPN.has(e)?players[BY_ESPN.get(e)]:null;return [e,p&&p.out?'OUT':p&&p.dtd?'DAY_TO_DAY':'ACTIVE']}));inj[h]=st;if(rep)inj[rep]='ACTIVE';
    const x={lg:LEAGUE.id,at:new Date().toISOString(),rosters:LEAGUE.rosters,slots:LEAGUE.slots,ir:LEAGUE.ir||{},rec:LEAGUE.rec,results:LEAGUE.results||[],live:null,dayPts:LEAGUE.dayPts,inj,curMatchup:LEAGUE.curMatchup,picks:[],drafted:true,dp:{sp:CUR_PERIOD,pts:Object.fromEntries(myRoster().map(p=>[p.espnId,p.espnId===h?23.5:0]))}};
    const b0={rosters:LEAGUE.rosters,ir:LEAGUE.ir,slots:LEAGUE.slots,rec:LEAGUE.rec};S.lgLive=x;applyLive(x);save();return lgDiff(b0,x)},[pick.h.e,pick.rep&&pick.rep.e,st]);
  const ch=await sync('DAY_TO_DAY');
  const H=await pg.evaluate(e=>{const p=players[BY_ESPN.get(e)];return {dtd:p.dtd,out:p.out,retP:p.retP,tot:p.projTot}},pick.h.e);
  check(H.dtd&&!H.out,`${pick.h.name} is day-to-day after the sync`);
  check(H.retP>pick.h.retP&&H.tot<pick.h.tot,`his return date moves past his next game and his season total drops (${Math.round(pick.h.tot)} to ${Math.round(H.tot)})`);
  check(!ch.some(c=>/is now healthy/.test(c)),`nobody else is reported as changed (${ch.filter(c=>/is now/.test(c)).length} injury lines)`);
  check(ch.some(c=>c.includes(pick.h.name)&&c.includes('day-to-day')),`the update panel says so: "${ch.find(c=>c.includes(pick.h.name))}"`);
  if(pick.rep){const R=await pg.evaluate(e=>{const p=players[BY_ESPN.get(e)];return {out:p.out,dtd:p.dtd}},pick.rep.e);
    check(R.out===pick.rep.out&&R.dtd===pick.rep.dtd,`${pick.rep.name} stays ${pick.rep.out?'out':'day-to-day'}: ESPN's injury report still lists him`)}
  await pg.evaluate(()=>{setMode('season');document.getElementById('tab-today').click()});await pg.waitForTimeout(600);
  check(await pg.evaluate(n=>[...document.querySelectorAll('#view-today tr')].some(r=>r.innerText.includes(n)&&/23\.5 so far/i.test(r.innerText)),pick.h.name),'Tonight\'s lineup shows his points so far from ESPN');
  check(await pg.evaluate(()=>![...document.querySelectorAll('#view-today tr')].some(r=>/0\.0 so far/i.test(r.innerText))),'no "0.0 so far" for players who haven\'t scored');
  check(await pg.evaluate(n=>[...document.querySelectorAll('#view-today li')].some(l=>l.innerText.includes(n)&&/GTD/.test(l.innerText)),pick.h.name),'Today lists him as a game-time decision');
  // late at night: tonight's box scores already saved still count as tonight's game, and a lineup ESPN gave for another day isn't
  // shown as tonight's
  check(await pg.evaluate(()=>myRoster().filter(p=>(SCHED[p.team]||[]).includes(CUR_PERIOD)&&!p.out).every(p=>{const g=nextGames(p,1,true)[0];return g&&g.q===CUR_PERIOD})),'every player with a game today has it in Tonight\'s lineup');
  check(await pg.evaluate(()=>{const was=LEAGUE.slotsSp;LEAGUE.slotsSp=CUR_PERIOD+1;document.getElementById('tab-today').click();const t=document.querySelector('#view-today .chart-card').textContent;LEAGUE.slotsSp=was;return !/as set on ESPN/.test(t)}),'a lineup for another day falls back to Pivot\'s lineup');
  await pg.reload();await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  check(await pg.evaluate(e=>{const p=players[BY_ESPN.get(e)];return p.dtd&&p.projTot>0},pick.h.e),'after a reload the saved sync still has him day-to-day, with projections');
  await sync('ACTIVE');check(await pg.evaluate(e=>{const p=players[BY_ESPN.get(e)];return !p.dtd&&!p.out&&p.retP===CUR_PERIOD},pick.h.e),'a later sync with him active clears it');
  check(!errs.length,'no page errors '+errs.join(' | '));await b.close();process.exit(fail?1:0)})();
