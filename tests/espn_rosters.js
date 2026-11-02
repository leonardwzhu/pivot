// After the draft, ESPN is the only source for rosters: stale local edits (a dropped player, an added free agent, an old team
// name) are replaced on load, and nothing offers to edit rosters or make picks. Mock drafts keep their Draft buttons.
// Needs a build whose league has drafted. Usage: node tests/espn_rosters.js [build/draft-room.html]
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const file=process.argv[2]||path.join(__dirname,'../build/draft-room.html');let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
  const pg=await b.newPage({viewport:{width:1100,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('file://'+file);await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  if(!(await pg.evaluate(()=>HAS_LG()&&LEAGUE.drafted&&!!LEAGUE.rosters))){console.log('skip: this build\'s league has not drafted');await b.close();return}
  await pg.evaluate(()=>{const mine=S.league[S.slot],gone=mine[0],f=freeAgents()[0].id,other=Object.keys(LEAGUE.teams).map(Number).find(t=>t!==S.slot);
    S.league[S.slot]=mine.filter(x=>x!==gone).concat(f);S.teamNames[other]='Stale Name';save()});
  await pg.reload();await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  check(await pg.evaluate(()=>Object.keys(LEAGUE.rosters).every(t=>JSON.stringify([...LEAGUE.rosters[t]].filter(e=>BY_ESPN.has(e)).sort())===JSON.stringify(rosterOf(+t).map(p=>p.espnId).sort()))),'every roster matches ESPN after a reload');
  check(await pg.evaluate(()=>Object.keys(LEAGUE.teams).map(Number).filter(t=>t!==S.slot).every(t=>teamName(t)===LEAGUE.teams[t].name)),'team names match ESPN');
  await pg.evaluate(()=>{setMode('season');const x=document.getElementById('tab-rosters');x.hidden=false;x.click()});await pg.waitForTimeout(1200);
  check(await pg.evaluate(()=>document.querySelectorAll('#view-rosters .ros-grid2 .chart-card').length===Object.keys(LEAGUE.rosters).length),'Rosters shows every team');
  check(await pg.evaluate(()=>!document.querySelector('[data-drop],[data-addname],#seasonReset')),'no roster editing on Rosters');
  await pg.click('#tab-waivers');await pg.waitForTimeout(1200);check(await pg.evaluate(()=>!document.querySelector('[data-add]')),'no Add buttons on Waivers');
  await pg.click('#tab-trades');await pg.waitForTimeout(800);check(await pg.evaluate(()=>!document.getElementById('tDo')),'no Record this trade');
  await pg.evaluate(()=>openPlayer(players[0].id));await pg.waitForTimeout(600);check(await pg.evaluate(()=>!document.querySelector('.drawer [data-mine],.drawer [data-take]')),'player profile has no Draft or Taken');
  await pg.evaluate(()=>{closePlayer();setMode('draft');document.getElementById('tab-board').click()});await pg.waitForTimeout(1000);
  check(await pg.evaluate(()=>![...document.querySelectorAll('[data-mine],[data-take],#undo')].some(e=>e.offsetParent)),'Draft Day shows no Draft, Taken or Undo');
  await pg.evaluate(()=>startMock('adp'));await pg.waitForTimeout(1200);check(await pg.evaluate(()=>[...document.querySelectorAll('[data-mine]')].some(e=>e.offsetParent)),'a mock draft keeps its Draft buttons');
  check(await pg.evaluate(()=>myRoster().length===LEAGUE.rosters[S.slot].filter(e=>BY_ESPN.has(e)).length),'a mock draft leaves the season screens on your ESPN roster');
  // a new device that adopts a synced copy still mid mock draft from before the real draft: the mock is closed and every screen has the league
  await pg.evaluate(()=>{S.mock={active:true,started:LEAGUE.draftDate-36e5};S.picks=[];save()});await pg.reload();await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  check(await pg.evaluate(()=>!MOCK()&&draftDone()&&Object.keys(LEAGUE.rosters).every(t=>rosterOf(+t).length===LEAGUE.rosters[t].filter(e=>BY_ESPN.has(e)).length)),'a stale synced mock draft is closed and every team is filled from ESPN');
  check(!errs.length,'no page errors '+errs.join(' | '));await b.close();process.exit(fail?1:0)})();
