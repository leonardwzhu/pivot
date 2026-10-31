// Prediction scorecard: logs today's next-game predictions from the built page, scores earlier ones against the games ESPN
// has since recorded, and writes work/p2_preds.js (the summary the Models tab shows) and work/preds_log.json (the full log).
// Log rows: [date, espnId, predicted FP, 80% low, 80% high, season average so far, rest-of-season projection, actual FP or null, R = replayed]
// Usage: node tools/log_preds.js build/draft-room.html [last/preds_log.json] [--score-only]
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const root=path.join(__dirname,'..'),args=process.argv.slice(2).filter(a=>!a.startsWith('--')),scoreOnly=process.argv.includes('--score-only'),inLog=args[1]||path.join(root,'last/preds_log.json');
let log=[];try{log=JSON.parse(fs.readFileSync(inLog,'utf8')).rows||[]}catch(e){}
const b=await chromium.launch();const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(args[0],'utf8'),{waitUntil:'load'});await pg.waitForTimeout(3000);
const r=await pg.evaluate(([log,scoreOnly])=>{const today=PDATE(CUR_PERIOD),keep=p=>p.espnId&&(p.rank<=300||Object.values(leagueRosters()).flat().includes(p.id));
  const avg=p=>{const G=SEASON_GAMES(p);return G.length?mean(G.map(g=>g.fp)):p.baseProj.fp},rd=x=>Math.round(x*10)/10;
  const row=(p,g,R)=>[g.date,p.espnId,rd(g.fp),rd(g.lo),rd(g.hi),rd(avg(p)),R?null:rd(p.proj.fp),null].concat(R?["R"]:[]);  // today's projection already knows replayed games
  const have=new Set(log.map(x=>x[0]+"|"+x[1])),add=[];
  // no live log yet: replay this season's games so far with the model as it stands, minus teammate adjustments (who sat is only known now)
  if(!log.length&&!scoreOnly){const D=[...new Set(players.flatMap(p=>SEASON_GAMES(p).map(g=>g.date)))].filter(d=>d<today).sort();
    for(const d of D){ASOF=d;FB.clear();DEF_NOW=null;players.filter(keep).forEach(p=>{const G=gamesOf(p).find(x=>x.date===d&&!x.dnp);if(!G)return;
      const o=G.opp,opp=o.replace(/^@/,""),f=defFactor(opp,posGroup(p)),q=Math.round((new Date(d+"T00:00:00Z")-new Date(PERIOD0+"T00:00:00Z"))/864e5),S=SCHED[p.team]||[],fp=formBase(p)*Math.max(.5,f)**MP.a*(o[0]!=="@"?1+MP.hm:1-MP.hm)*(S.includes(q-1)?1-MP.b2:1);
      add.push(row(p,{date:d,fp,lo:fp*MATCHUP.Q[0],hi:fp*MATCHUP.Q[1]},1))})}
    ASOF=null;FB.clear();DEF_NOW=null}
  if(!scoreOnly)players.filter(keep).forEach(p=>{const g=nextGames(p,1)[0];if(g&&!g.out&&g.date===today&&!have.has(today+"|"+p.espnId))add.push(row(p,g))});
  const rows=log.concat(add),byE=new Map(players.map(p=>[String(p.espnId),p]));
  rows.forEach(x=>{if(x[7]!=null)return;const p=byE.get(String(x[1]));const G=p&&gamesOf(p).find(g=>g.date===x[0]);if(G)x[7]=G.dnp?-1:rd(G.fp)});
  const names={};rows.forEach(x=>{const p=byE.get(String(x[1]));if(p)names[x[1]]=p.name});
  return {rows:rows.filter(x=>x[7]!=null||x[0]>=PDATE(CUR_PERIOD-14)),names,weeks:WEEKS.map(w=>[w.i,w.s,w.e]),today,added:add.length}},[log,scoreOnly]);
await b.close();if(errs.length)throw new Error(errs.join('; '));
const S=r.rows.filter(x=>x[7]!=null&&x[7]>=0),rd=x=>x==null?null:Math.round(x*100)/100;
const sum=G=>({n:G.length,mae:rd(G.reduce((a,x)=>a+Math.abs(x[7]-x[2]),0)/G.length),avg:rd(G.reduce((a,x)=>a+Math.abs(x[7]-x[5]),0)/G.length),proj:(P=>P.length?rd(P.reduce((a,x)=>a+Math.abs(x[7]-x[6]),0)/P.length):null)(G.filter(x=>x[6]!=null)),cover:rd(G.filter(x=>x[7]>=x[3]&&x[7]<=x[4]).length/G.length),bias:rd(G.reduce((a,x)=>a+x[7]-x[2],0)/G.length)});
// games before Week 1 (opening night to the draft) get their own row
const weeks=[["Before Week 1","",""]].concat(r.weeks).map(([i,s,e],k)=>{const G=S.filter(x=>k?x[0]>=s&&x[0]<=e:x[0]<r.weeks[0][1]);return G.length?{w:i,...sum(G)}:null}).filter(Boolean);
const bins=[[0,15],[15,25],[25,35],[35,45],[45,99]].map(([lo,hi])=>{const G=S.filter(x=>x[2]>=lo&&x[2]<hi);return G.length?[lo,hi,G.length,rd(G.reduce((a,x)=>a+x[2],0)/G.length),rd(G.reduce((a,x)=>a+x[7],0)/G.length)]:null}).filter(Boolean);
const lastD=S.map(x=>x[0]).sort().pop(),misses=S.filter(x=>x[0]===lastD).sort((a,b)=>Math.abs(b[7]-b[2])-Math.abs(a[7]-a[2])).slice(0,6).map(x=>[x[1],r.names[x[1]]||"",x[2],x[7],x[3],x[4]]);
const out=S.length?{...sum(S),live:S.filter(x=>!x[8]).length,since:S.map(x=>x[0]).sort()[0],lastD,weeks,bins,misses,pending:r.rows.filter(x=>x[7]==null).length}:{n:0,pending:r.rows.filter(x=>x[7]==null).length};
fs.writeFileSync(path.join(root,'work/preds_log.json'),JSON.stringify({rows:r.rows}));
fs.writeFileSync(path.join(root,'work/p2_preds.js'),"// Prediction scorecard (tools/log_preds.js): every next-game prediction logged before tip-off and scored once ESPN records the game\nconst PREDS="+JSON.stringify(out)+";\n");
console.log(`scorecard: logged ${r.added} today, ${out.n} scored (${out.live||0} live), average miss ${out.mae} vs season average ${out.avg}, 80% range caught ${out.cover}`)})().catch(e=>{console.error(e.message);process.exit(1)});
