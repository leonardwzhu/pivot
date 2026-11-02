// The week so far and the weekly recap, on a made-up week 3 of box scores: mid-week (Friday) the win chance counts the points
// already scored and the chart's last point is that same chance; the Monday after, Today shows last week's recap and the Matchup
// tab opens the full one with every section. ESPN is blocked so the league sync can't replace the made-up week.
// Needs a build whose league has drafted. Usage: node tests/recap.js [build/draft-room.html]
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');const os=require('os');
const file=process.argv[2]||path.join(__dirname,'../build/draft-room.html'),html=fs.readFileSync(file,'utf8');
// a page set on day `cur` with made-up box scores for week 3 (days 14-20): about half of each roster plays each day, the first ten
// players start; once the week is over its results are added, otherwise ESPN's points by day for this matchup
function fixture(cur){const i=html.indexOf('const LEAGUE='),j=html.indexOf(';\n',i),L=JSON.parse(html.slice(i+13,j));if(!L.drafted||!L.rosters)return null;
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,slots=[0,1,2,3,4,5,6,11,11,11],days={},dayP={};
  for(let q=14;q<Math.min(cur,21);q++){days[q]={};for(const t in L.rosters)days[q][t]=L.rosters[t].flatMap((id,k)=>rnd()<.55?[[id,k<10?slots[k]:12,Math.round(rnd()*470+80)/10]]:[])}
  Object.values(days).forEach(d=>Object.values(d).flat().forEach(r=>dayP[r[0]]=["",[0,1,2,3,4,5,6,11]]));
  const pts=(q,t)=>days[q][t].filter(r=>r[1]!==12).reduce((s,r)=>s+r[2],0),tot=t=>Object.keys(days).reduce((s,q)=>s+pts(q,t),0);
  Object.assign(L,{days,dayP,dayPts:{},results:[],curMatchup:cur>=21?4:3});
  if(cur>=21)Object.entries(L.opp['2']).forEach(([t,o])=>{if(+t<o){const a=tot(t),b=tot(o);L.results.push([3,+t,a,o,b,a>b?'HOME':'AWAY'])}});
  else for(const t in L.rosters)L.dayPts[t]=Object.fromEntries(Object.keys(days).map(q=>[q,pts(q,t)]));
  const out=path.join(os.tmpdir(),`pivot_recap_${cur}.html`);fs.writeFileSync(out,(html.slice(0,i+13)+JSON.stringify(L)+html.slice(j)).replace(/CUR_PERIOD=\d+;/,`CUR_PERIOD=${cur};`));return out}
(async()=>{const b=await chromium.launch();let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
  if(!fixture(18)){console.log('skip: this build\'s league has not drafted');await b.close();return}
  const open=async(cur,w)=>{const pg=await b.newPage({viewport:{width:w,height:900}});pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));
    await pg.route('**/lm-api-reads.fantasy.espn.com/**',r=>r.abort());await pg.goto('file://'+fixture(cur));await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);await pg.evaluate(()=>setMode('season'));return pg};
  // Friday of week 3: four days played
  let pg=await open(18,1100);const M=await pg.evaluate(()=>{const o=leagueOpp(CUR_WEEK),A=myRoster(),B=rosterOf(o),m=matchupSim(A,B,CUR_WEEK),m0=matchupSim(A,B,CUR_WEEK,600,{bank:[0,0]}),P=winPath(CUR_WEEK,S.slot,o);
    return {bank:weekBank(CUR_WEEK),p:m.p,p0:m0.p,n:P.n,last:P.pts[P.n].p,start:P.pts[0].p}});
  check(M.bank[0]>0&&M.bank[1]>0,`points already scored count: ${M.bank.map(Math.round).join('–')}`);
  check(Math.abs(M.p-M.p0)>.05,`the win chance changes with them (${Math.round(M.p0*100)}% without, ${Math.round(M.p*100)}% with)`);
  check(M.n===4&&M.last===M.p,'the chart has the four days played and ends at the headline chance');
  check(M.start>.02&&M.start<.98,`the replayed start of the week is a real chance (${Math.round(M.start*100)}%), not an empty week`);
  await pg.click('#tab-season');await pg.waitForTimeout(500);check(await pg.evaluate(()=>document.querySelectorAll('#view-season svg.wpc circle').length===5),'Matchup draws the win-chance chart');
  check(!pg.errs.length,'mid-week: no page errors '+pg.errs.join(' | '));
  // the Monday after, on desktop and phone
  for(const w of [1100,390]){pg=await open(21,w);await pg.click('#tab-today');await pg.waitForTimeout(500);
    check(await pg.evaluate(()=>/^Last week/.test(document.querySelector('#view-today .chart-card h4').textContent)),`${w}px: Today opens with last week's recap`);
    await pg.click('text=Full recap');await pg.waitForTimeout(800);
    const R=await pg.evaluate(()=>({h:document.querySelector('#view-season h4').textContent,hs:[...document.querySelectorAll('#view-season h5')].map(x=>x.textContent),pts:document.querySelectorAll('#view-season svg.wpc circle').length,
      end:(()=>{const X=recapOf(CUR_WEEK-1);return X.P.pts[X.P.pts.length-1].p===(X.me>X.them?1:X.me<X.them?0:.5)})(),sw:document.documentElement.scrollWidth}));
    check(/^Week 3 recap/.test(R.h)&&R.pts===8,`${w}px: the Matchup tab shows the week 3 recap with a point for each day`);
    check(['Your best games','Points left on the bench','Around the league'].every(x=>R.hs.includes(x)),`${w}px: best games, bench points and the rest of the league`);
    check(R.end,`${w}px: the line ends at 100% or 0%, matching the result`);check(R.sw<=w,`${w}px: no sideways scroll`);
    await pg.selectOption('#seasonWeek',{index:1});await pg.waitForTimeout(500);check(await pg.evaluate(()=>/^Your week/.test(document.querySelector('#view-season h4').textContent)),`${w}px: the week picker goes back to this week`);
    check(!pg.errs.length,`${w}px: no page errors `+pg.errs.join(' | '))}
  await b.close();process.exit(fail?1:0)})();
