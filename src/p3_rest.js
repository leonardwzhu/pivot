// ================= STATE =================
const LS="hoopsDraftRoom.v2";
let sample=null; // Ask Claude, when the viewer allows it (set at the end of the file)
// saves made while the page boots (league sync, opening mode) don't count as edits, so a fresh device never outranks your saved copy
let BOOT=true,pushT=null;const SYNC={ref:null,dev:null,push:()=>{}};
let S={teams:10,slot:1,scoring:"pts",picks:[],order:null,pos:"ALL",sort:{k:"rank",d:1},hideTaken:true,hideOut:false,view:"model",rankBy:"board"};
try{const s=JSON.parse(localStorage.getItem(LS)||"null");if(s)S={...S,...s}}catch(e){}
S.mix=S.mix||{};S.adj=S.adj||{};
// your ESPN league (synced daily): adopt its size, your draft slot and team names once; after the draft, load ESPN's picks and rosters whenever they're newer
const BY_ESPN=new Map(players.map(p=>[p.espnId,p.id]));let LEAGUE_MSG="";
(()=>{if(typeof LEAGUE==="undefined"||!LEAGUE||(S.mock&&S.mock.active))return;
  if(S.leagueId!==LEAGUE.id){if(S.teams!==LEAGUE.size||S.slot!==LEAGUE.mySlot)S.picks=[];S.teams=LEAGUE.size;S.slot=LEAGUE.mySlot||S.slot;S.league=null;S.teamNames={};S.leagueId=LEAGUE.id;
    LEAGUE_MSG=`Loaded ${LEAGUE.name}: ${LEAGUE.size} teams, you pick ${S.slot}${["st","nd","rd"][S.slot-1]||"th"}`}
  S.teamNames=S.teamNames||{};for(const t in LEAGUE.teams)if(+t!==S.slot&&!S.teamNames[t])S.teamNames[t]=LEAGUE.teams[t].name;
  if(LEAGUE.picks.length&&S.leaguePicksAt!==LEAGUE.fetched){S.picks=LEAGUE.picks.filter(x=>BY_ESPN.has(x[2])).sort((a,b)=>a[0]-b[0]).map(x=>({id:BY_ESPN.get(x[2]),mine:x[1]===S.slot,o:x[0]}));S.leaguePicksAt=LEAGUE.fetched;LEAGUE_MSG=`Draft picks synced from ESPN (${LEAGUE.fetched})`}
  if(LEAGUE.drafted&&LEAGUE.rosters&&S.leagueRostersAt!==LEAGUE.fetched){const L={};for(const t in LEAGUE.rosters)L[t]=LEAGUE.rosters[t].filter(e=>BY_ESPN.has(e)).map(e=>BY_ESPN.get(e));S.league=L;S.leagueRostersAt=LEAGUE.fetched;LEAGUE_MSG=`Rosters synced from ESPN (${LEAGUE.fetched})`}
  save()})();
// this week's head-to-head opponent from your league schedule (week index -> your slot's opponent)
const leagueOpp=w=>typeof LEAGUE!=="undefined"&&LEAGUE&&LEAGUE.opp&&LEAGUE.opp[w]?LEAGUE.opp[w][S.slot]:null;
let MIX=applyMix(S.mix,S.adj);
function save(){if(!BOOT)S._t=Date.now();try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}if(!BOOT&&SYNC.ref){clearTimeout(pushT);pushT=setTimeout(SYNC.push,1200)}}
function applyOrder(){
  if(S.order&&S.order.length===players.length)S.order.forEach((id,i)=>{players[id].rank=i+1});
  else players.forEach(p=>p.rank=S.scoring==="cat"?p.baseRoto:p.base);
}
// chance a player is still on the board at overall pick k, from ESPN average draft position (spread grows with ADP)
const erf=x=>{const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y};
const availAt=(p,k)=>{if(!k)return 1;const sc=scoutFor(k);if(sc)return 1-(sc.pTaken[p.id]||0);const a=MOCK()&&p.roomPick?p.roomPick:p.adp||(p.rank+15),sd=Math.max(1.5,.22*a);return 1-.5*(1+erf((k-.5-a)/(sd*Math.SQRT2)))};
(()=>{[...players].sort((a,b)=>(a.adp||999)-(b.adp||999)).forEach((p,i)=>p.adpRank=p.adp?i+1:null)})();
applyOrder();
function computeDisp(){players.forEach(p=>p.disp=S.rankBy==="model"?(S.scoring==="pts"?p.modelRank:p.catRank):p.rank)}
const pickOf=id=>S.picks.find(x=>x.id===id);
// your league's team names, by draft slot (blank = "Team N"); short form for tight spots like the draft grid
const teamName=t=>{const n=((S.teamNames||{})[t]||"").trim();return n||`Team ${t}`};
const teamShort=t=>{const n=((S.teamNames||{})[t]||"").trim();return n?(n.length>10?n.slice(0,9)+"…":n):"T"+t};
const mine=()=>S.picks.filter(x=>x.mine).map(x=>players[x.id]);
function teamAt(o){const n=S.teams,r=Math.floor((o-1)/n),i=(o-1)%n;return r%2===0?i+1:n-i}
function myNextPick(from){for(let o=from;o<from+S.teams*2+1;o++)if(teamAt(o)===S.slot)return o;return null}
const valueOf=p=>p.rank-(S.scoring==="pts"?p.modelRank:p.catRank);

// ================= CHART HELPERS =================
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const f1=x=>x.toFixed(1),f0=x=>Math.round(x).toLocaleString(),pct=x=>x.toFixed(3).replace(/^0/,""),pc=x=>Math.round(x*100)+"%";
function ticks(lo,hi,n){const raw=(hi-lo)/n,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw);
  const out=[];for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step)out.push(+v.toFixed(6));return out}
function sx(d,r){return v=>r[0]+(v-d[0])/(d[1]-d[0]||1)*(r[1]-r[0])}
function scatter({pts,fit,diag,origin,xl,yl,W=480,H=320,labels=[]}){
  const m={l:44,r:14,t:12,b:40},xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  if(diag){x0=y0=Math.min(x0,y0);x1=y1=Math.max(x1,y1)}
  if(origin){x0=Math.min(0,x0);y0=Math.min(0,y0)}
  const px=(x1-x0)*.06||1,py=(y1-y0)*.08||1;x0-=px;x1+=px;y0-=py;y1+=py;
  const X=sx([x0,x1],[m.l,W-m.r]),Y=sx([y0,y1],[H-m.b,m.t]);
  let g="";
  ticks(y0,y1,5).forEach(t=>g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${t}</text>`);
  ticks(x0,x1,6).forEach(t=>g+=`<text x="${X(t)}" y="${H-m.b+14}" text-anchor="middle">${t}</text>`);
  g+=`<line class="ax" x1="${m.l}" x2="${W-m.r}" y1="${H-m.b}" y2="${H-m.b}"/>`;
  if(diag)g+=`<line class="diag" x1="${X(x0)}" y1="${Y(x0)}" x2="${X(x1)}" y2="${Y(x1)}"/>`;
  if(fit)g+=`<line class="fit" x1="${X(x0)}" y1="${Y(fit.a+fit.b*x0)}" x2="${X(x1)}" y2="${Y(fit.a+fit.b*x1)}"/>`;
  pts.forEach(p=>g+=`<circle class="dot ${p.cls||""}" cx="${X(p.x)}" cy="${Y(p.y)}" r="4.5" data-tip="${esc(p.tip)}"/>`);
  labels.forEach(p=>g+=`<text class="lbl" x="${X(p.x)+7}" y="${Y(p.y)+3}">${esc(p.label)}</text>`);
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-6}" text-anchor="middle">${esc(xl)}</text><text x="12" y="${(m.t+H-m.b)/2}" text-anchor="middle" transform="rotate(-90 12 ${(m.t+H-m.b)/2})">${esc(yl)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yl+" vs "+xl)}">${g}</svg>`;
}
function sparkTrend(p){
  const W=78,H=24,vals=p.hist.map(h=>({x:h.i,y:h.fp}));if(p.college&&!vals.length)vals.push({x:2,y:trans(fpOf(p.college))});
  const all=[...vals.map(v=>v.y),p.proj.fp],lo=Math.min(...all),hi=Math.max(...all),X=sx([0,3],[4,W-5]),Y=sx([lo-1,hi+1],[H-4,4]);
  const pth=vals.map((v,i)=>(i?"L":"M")+X(v.x)+" "+Y(v.y)).join(" ");const last=vals[vals.length-1];
  const tip=p.hist.map(h=>`${SEAS[h.i]}: ${f1(h.fp)}`).join(" · ")+` · 2026-27 proj: ${f1(p.proj.fp)}`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-tip="${esc(tip)}"><rect class="hit" width="${W}" height="${H}"/>${pth?`<path class="ln" d="${pth}"/>`:""}${last?`<path class="ln proj" d="M${X(last.x)} ${Y(last.y)} L${X(3)} ${Y(p.proj.fp)}"/>`:""}<circle class="dot hollow" cx="${X(3)}" cy="${Y(p.proj.fp)}" r="3"/></svg>`;
}
// Season-mode trend: the Draft Day sparkline plus this season so far (dark dot) before the rest-of-season projection
function sparkSeasons(p){const W=96,H=24,vals=p.hist.map(h=>({x:h.i,y:h.fp})),now=p.now&&p.now.gp?p.nowFp:null;
  const all=[...vals.map(v=>v.y),p.proj.fp,...(now!=null?[now]:[])],lo=Math.min(...all),hi=Math.max(...all),X=sx([0,3.7],[4,W-5]),Y=sx([lo-1,hi+1],[H-4,4]);
  const pth=vals.map((v,i)=>(i?"L":"M")+X(v.x)+" "+Y(v.y)).join(" "),last=vals[vals.length-1],from=now!=null?{x:3,y:now}:last;
  const tip=p.hist.map(h=>`${SEAS[h.i]}: ${f1(h.fp)}`).join(" · ")+(now!=null?` · 2026-27 so far: ${f1(now)} in ${p.now.gp} g`:"")+` · rest-of-season projection: ${f1(p.proj.fp)}`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-tip="${esc(tip)}"><rect class="hit" width="${W}" height="${H}"/>${pth?`<path class="ln" d="${pth}"/>`:""}${last&&now!=null?`<path class="ln" style="opacity:.45" d="M${X(last.x)} ${Y(last.y)} L${X(3)} ${Y(now)}"/>`:""}${from?`<path class="ln proj" d="M${X(from.x)} ${Y(from.y)} L${X(3.7)} ${Y(p.proj.fp)}"/>`:""}${now!=null?`<circle class="dot" cx="${X(3)}" cy="${Y(now)}" r="2.6" style="fill:var(--ink);stroke:none"/>`:""}<circle class="dot hollow" cx="${X(3.7)}" cy="${Y(p.proj.fp)}" r="3"/></svg>`}
let RLO,RHI;
function whisker(p){const W=96,H=16,X=sx([RLO,RHI],[4,W-4]);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-tip="80% range: ${f1(p.lo)}–${f1(p.hi)} FP/G"><rect class="hit" width="${W}" height="${H}"/><line class="whisk" x1="${X(Math.max(RLO,p.lo))}" x2="${X(p.hi)}" y1="8" y2="8"/><circle class="dot" cx="${X(p.proj.fp)}" cy="8" r="4"/></svg>`}

// ================= BOARD =================
const tierOf=r=>r<=4?1:r<=10?2:r<=20?3:r<=35?4:r<=55?5:r<=80?6:r<=105?7:8;
const nameCell=p=>{const chips=[p.out?`<span class="chip out">Out${p.gamesOut>=2?` ~${p.gamesOut}g`:""}</span>`:"",p.dtd?'<span class="chip dtd">GTD</span>':"",p.rook?'<span class="chip rook">Rookie</span>':"",p.hot?'<span class="chip hot">Hot</span>':"",p.cold?'<span class="chip dtd">Cold</span>':"",p.adp?`<span class="chip espn">ADP ${p.adp.toFixed(1)}</span>`:p.unranked?`<span class="chip espn">Not ranked by ESPN</span>`:"",p.adj?`<span class="chip rook">You ${p.adj.o!=null?"="+f1(p.adj.o):(p.adj.m>0?"+":"")+Math.round(p.adj.m*100)+"%"}</span>`:""].join("");
  return `<td class="l"><button class="expander" data-open="${p.id}"><div class="pname">${esc(p.name)}</div><div class="pmeta">${p.team} · ${p.pos.join("/")} · ${p.age} ${chips}</div></button></td>`};
const valCell=p=>{const v=valueOf(p);return `<td class="num">${Math.abs(v)<3?'<span class="mut">–</span>':`<span class="${v>0?"zpos":"zneg"}">${v>0?"+":""}${v}</span>`}</td>`};
const zCell=p=>`<td class="num ${p.cat>=0?"zpos":"zneg"}">${p.cat>=0?"+":""}${f1(p.cat)}</td>`;
const COMMON=[{k:"rank",l:"#",get:p=>p.disp,asc:1,cell:p=>`<td class="num">${p.disp}</td>`},{k:"name",l:"Player",get:p=>p.name,asc:1,str:1,cell:nameCell},
  {k:"tier",l:"Tier",get:p=>p.disp,asc:1,cell:p=>`<td><span class="tier">T${tierOf(p.disp)}</span></td>`}];
const COLS_M=[...COMMON,
  {k:"trend",l:"Trend",get:p=>p.delta,cell:p=>`<td>${sparkTrend(p)}</td>`},
  {k:"fp",l:"Proj FP/G",get:p=>p.proj.fp,cell:p=>`<td class="num fp">${f1(p.proj.fp)}</td>`},
  {k:"espnfp",l:"ESPN FP/G",get:p=>p.espnFp??-1,cell:p=>`<td class="num">${p.espnFp!=null?f1(p.espnFp):'<span class="mut">–</span>'}</td>`},
  {k:"adp",l:"ADP",get:p=>p.adp??999,asc:1,cell:p=>`<td class="num">${p.adp?p.adp.toFixed(1):'<span class="mut">–</span>'}</td>`},
  {k:"rng",l:"80% range",get:p=>p.proj.sigma,asc:1,cell:p=>`<td>${whisker(p)}</td>`},
  {k:"gp",l:"Proj GP",get:p=>p.projGP,cell:p=>`<td class="num">${Math.round(p.projGP)}</td>`},
  {k:"pog",l:"Playoff G",get:p=>p.poGames,cell:p=>`<td class="num">${p.poGames}</td>`},
  {k:"tot",l:"Proj FP",get:p=>p.projTot,cell:p=>`<td class="num fp">${f0(p.projTot)}</td>`},
  {k:"t50",l:"Top-50",get:p=>p.pTop50,cell:p=>`<td class="num">${pc(p.pTop50)}</td>`},
  {k:"brk",l:"Breakout",get:p=>p.brk===null?-1:p.brk,cell:p=>`<td class="num">${p.brk===null?'<span class="mut">–</span>':`<span class="${p.brk>=.3?"zpos":""}">${pc(p.brk)}</span>`}</td>`},
  {k:"fitm",l:"Team fit",get:p=>p.fit.tot,cell:p=>{const d=Math.round((p.fit.tot-1)*100);return `<td class="num">${Math.abs(d)<2?'<span class="mut">–</span>':`<span class="${d>0?"zpos":"zneg"}">${d>0?"+":""}${d}%</span>`}</td>`}},
  {k:"cat",l:"Cat z",get:p=>p.cat,cell:zCell},{k:"val",l:"Value",get:valueOf,cell:valCell}];
const cs=k=>({k,l:{pts:"PTS",reb:"REB",ast:"AST",stl:"STL",blk:"BLK",tpm:"3PM",tov:"TO"}[k],get:p=>p.cur[k],asc:k==="tov"?1:0,cell:p=>`<td class="num">${f1(p.cur[k])}</td>`});
const COLS_S=[...COMMON,
  {k:"fp25",l:"FP/G",get:p=>fpOf(p.cur),cell:p=>`<td class="num fp">${f1(fpOf(p.cur))}</td>`},
  ...["pts","reb","ast","stl","blk","tpm"].map(cs),
  {k:"fg",l:"FG%",get:p=>p.cur.fg,cell:p=>`<td class="num">${pct(p.cur.fg)}</td>`},{k:"ft",l:"FT%",get:p=>p.cur.ft,cell:p=>`<td class="num">${pct(p.cur.ft)}</td>`},
  cs("tov"),{k:"gp25",l:"GP",get:p=>p.curGp,cell:p=>`<td class="num">${p.curGp<0?'<span class="mut">Rookie</span>':p.curGp}</td>`}];
const pm=(k,l)=>({k:"h_"+k,l,get:p=>p.per100(k),cell:p=>`<td class="num">${f1(p.per100(k))}</td>`});
const COLS_P=[...COMMON,
  {k:"mpgL",l:"MPG 25-26",get:p=>p.lastMpg??-1,cell:p=>`<td class="num">${p.lastMpg?f1(p.lastMpg):'<span class="mut">–</span>'}</td>`},
  {k:"mpgP",l:"Proj MPG",get:p=>p.projMpg,cell:p=>`<td class="num fp">${f1(p.projMpg)}</td>`},
  {k:"dmin",l:"Δ Min",get:p=>p.lastMpg?p.projMpg-p.lastMpg:0,cell:p=>{const d=p.lastMpg?p.projMpg-p.lastMpg:null;return `<td class="num">${d===null||Math.abs(d)<.5?'<span class="mut">–</span>':`<span class="${d>0?"zpos":"zneg"}">${d>0?"+":""}${f1(d)}</span>`}</td>`}},
  {k:"f36L",l:"FP/36 25-26",get:p=>p.fp36Last??-1,cell:p=>`<td class="num">${p.fp36Last?f1(p.fp36Last):'<span class="mut">–</span>'}</td>`},
  {k:"f36",l:"Proj FP/36",get:p=>p.fp36,cell:p=>`<td class="num fp">${f1(p.fp36)}</td>`},
  pm("fp","FP/100"),pm("pts","PTS/100"),pm("reb","REB/100"),pm("ast","AST/100"),
  {k:"stk",l:"STL+BLK/100",get:p=>p.per100("stl")+p.per100("blk"),cell:p=>`<td class="num">${f1(p.per100("stl")+p.per100("blk"))}</td>`},
  {k:"at34",l:"FP/G at 34 min",get:p=>p.fp36/36*34,cell:p=>`<td class="num">${f1(p.fp36/36*34)}</td>`},
  {k:"fp",l:"Proj FP/G",get:p=>p.proj.fp,cell:p=>`<td class="num">${f1(p.proj.fp)}</td>`}];
const ACT={k:"act",l:""};
const TEAMFIT_ON=BTALL.betaM>0||BTALL.betaU>0;
const cols=()=>{const c=S.view==="model"?(TEAMFIT_ON?COLS_M:COLS_M.filter(x=>x.k!=="fitm")):S.view==="min"?COLS_P:COLS_S;return [c[0],c[1],ACT,...c.slice(2)]};
function actCell(p){const pk=pickOf(p.id);if(MOCK())return `<td class="act"><div class="actw">${pk?`<span class="mut">${pk.mine?"Mine":esc(teamName(teamAt(pk.o)))} · #${pk.o}</span>`:`<button class="btn mine" data-mine="${p.id}">Draft</button>`}</div></td>`;return `<td class="act"><div class="actw">${pk?`<button class="btn" data-undo="${p.id}">${pk.mine?"Mine":"Taken"} · #${pk.o} ✕</button>`
  :`<button class="btn mine" data-mine="${p.id}">Draft</button><button class="btn" data-take="${p.id}">Taken</button>`}</div></td>`}
let boardLimit=150;
function renderBoard(){
  computeDisp();const C=cols();
  if(!C.some(c=>c.k===S.sort.k))S.sort={k:"rank",d:1};
  $("thead").innerHTML=C.map(c=>{const on=S.sort.k===c.k;return `<th class="${c.k==="name"?"l":""}" data-k="${c.k}"${on?` aria-sort="${S.sort.d>0?"ascending":"descending"}"`:""}>${c.l}${on&&c.k!=="act"?(S.sort.d>0?" ▲":" ▼"):""}</th>`}).join("");
  const q=$("q").value.trim().toLowerCase();
  const list=players.filter(p=>{
    if(S.hideTaken&&pickOf(p.id))return false;if(S.hideOut&&p.out)return false;
    if(S.pos!=="ALL"){const g={G:["PG","SG"],F:["SF","PF"]}[S.pos]||[S.pos];if(!p.pos.some(x=>g.includes(x)))return false}
    if(q&&!(norm2(p.name).includes(norm2(q))||p.team.toLowerCase()===q))return false;return true});
  const col=C.find(c=>c.k===S.sort.k),dir=(col.asc?1:-1)*S.sort.d;
  list.sort((a,b)=>{const A=col.get(a),B=col.get(b);return (col.str?A.localeCompare(B):(A-B))*dir||a.disp-b.disp});
  const tierSort=S.sort.k==="rank"||S.sort.k==="tier";let last=null;
  const shown=Math.min(list.length,boardLimit);$("boardMore").innerHTML=list.length>shown?`<span class="mut">Showing ${shown} of ${list.length} players.</span> <button class="btn" id="more150">Show 150 more</button> <button class="btn" id="moreAll">Show all</button>`:`<span class="mut">${list.length} player${list.length===1?"":"s"}${list.length<players.length?` (of ${players.length} on standard contracts)`:" on standard NBA contracts"}.</span>`;
  if($("more150"))$("more150").onclick=()=>{boardLimit+=150;renderBoard()};if($("moreAll"))$("moreAll").onclick=()=>{boardLimit=1e9;renderBoard()};
  $("tbody").innerHTML=list.slice(0,shown).map(p=>{const t=tierOf(p.disp),br=tierSort&&last!==null&&t!==last?" tierbreak":"";last=t;const pk=pickOf(p.id);
    return `<tr class="${pk?(pk.mine?"is-mine":"is-taken"):""}${br}">${C.map(c=>c.k==="act"?actCell(p):c.cell(p)).join("")}</tr>`}).join("")
    ||`<tr><td colspan="${C.length}" class="l mut">No players match these filters.</td></tr>`;
  $("boardFoot").textContent=(S.scoring==="pts"?(SC_CUSTOM?"Your league's custom points scoring. ":"ESPN default H2H Points scoring (PTS +1, REB +1, AST +2, STL +4, BLK +4, 3PM +1, FGM +2, FGA −1, FTM +1, FTA −1, TO −2). "):"ESPN default 8 categories. ")+(S.view==="min"
    ?"Per-minute view. Proj MPG comes from the minutes model plus team fit. FP/36 and per-100 figures use projected 2026-27 production; per-100 uses approximate team pace. FP/G at 34 min shows what a bigger role would be worth."
    :S.view==="model"
    ?"Projections for the rest of 2026-27. Trend = FP/G by season, with the dashed segment leading to the projection. Value = board rank minus model rank. Tap a name to open the Player Lab."
    :"2025-26 per-game lines. Tap a name to open the Player Lab.");
}

// ================= SIDE =================
const SLOTS=[["PG",["PG"]],["SG",["SG"]],["SF",["SF"]],["PF",["PF"]],["C",["C"]]];
// ESPN default lineup: 10 starters + 3 bench
const LINEUP=[["PG",["PG"]],["SG",["SG"]],["SF",["SF"]],["PF",["PF"]],["C",["C"]],["G",["PG","SG"]],["F",["SF","PF"]],["UTIL",null],["UTIL",null],["UTIL",null]];
const BENCH=3,BASEPOS=["PG","SG","SF","PF","C"];
const elig=(p,i)=>!LINEUP[i][1]||p.pos.some(x=>LINEUP[i][1].includes(x));
// expected contribution per team game (availability-weighted), so injured players count for less in a weekly lineup
const vpg=p=>S.scoring==="pts"?p.projTot/REMAIN:Math.max(.1,p.cat+6)*p.projGP/REMAIN;
// Best players get starting slots first; augmenting paths reshuffle eligible players (optimal for this kind of matching)
function assignLineup(list){
  const slot=new Array(LINEUP.length).fill(null),bench=[];
  const aug=(p,seen)=>{for(let i=0;i<LINEUP.length;i++){if(!elig(p,i)||seen.has(i))continue;seen.add(i);if(slot[i]===null||aug(slot[i],seen)){slot[i]=p;return true}}return false};
  [...list].sort((a,b)=>vpg(b)-vpg(a)).forEach(p=>{if(!aug(p,new Set()))bench.push(p)});
  // tidy: put the better player in the more specific slot when both fit
  for(let pass=0;pass<3;pass++)for(let i=0;i<LINEUP.length;i++)for(let j=i+1;j<LINEUP.length;j++){const a=slot[i],b=slot[j];
    if(b&&elig(b,i)&&(!a||elig(a,j))&&(!a||vpg(b)>vpg(a))){slot[i]=b;slot[j]=a}}
  return {slot,bench,value:slot.reduce((t,p)=>t+(p?vpg(p):0),0)+bench.slice(0,BENCH).reduce((t,p)=>t+.2*vpg(p),0)};
}
// ================= ESPN H2H: daily lineups, weekly matchups =================
// Each remaining day, every rostered player whose team plays (and who is healthy) is available; you can start 10 of them,
// position rules apply, and the rest score nothing. Availability is drawn per player per day from his games-played rate,
// using the same random draws for every roster so comparisons between picks are fair.
const H2H_SAMPLES=4,DAY_LIST=[];for(let q=CUR_PERIOD;q<=LAST_PERIOD;q++)DAY_LIST.push(q);
const WEEK_OF=q=>WEEKS.findIndex(w=>q>=w.p[0]&&q<=w.p[1]);const DAY_WEEK=Object.fromEntries(DAY_LIST.map(q=>[q,WEEK_OF(q)]));
function u01(a,b,c){let h=(2166136261^a)>>>0;h=Math.imul(h^b,16777619);h=Math.imul(h^c,16777619);h^=h>>>13;h=Math.imul(h,1274126177);h^=h>>>16;return (h>>>0)/4294967296}
const gameVal=p=>S.scoring==="pts"?p.proj.fp:Math.max(.1,p.cat+6);
// Weekly mode: you pick 10 starters for the whole matchup week; their games count, everyone else's don't.
function h2hWeekly(roster){
  const weekly=new Float64Array(WEEKS.length);let waste=0,startedPts=0,empty=0,wks=0;const slot=new Array(LINEUP.length);
  WEEKS.forEach((wk,w)=>{if(wk.p[1]<CUR_PERIOD)return;wks++;const days=wk.p[1]-Math.max(wk.p[0],CUR_PERIOD)+1;
    const ev=roster.map(p=>{let g=0;for(let q=Math.max(wk.p[0],CUR_PERIOD);q<=wk.p[1];q++)if(p.daySet.has(q))g++;return {p,g,v:gameVal(p)*p.rate*g}}).sort((a,b)=>b.v-a.v);
    slot.fill(-1);const aug=(i,seen)=>{for(let k=0;k<LINEUP.length;k++){if(seen[k]||!elig(ev[i].p,k))continue;seen[k]=1;if(slot[k]<0||aug(slot[k],seen)){slot[k]=i;return true}}return false};
    let pts=0,games=0;ev.forEach((e,i)=>{if(e.v<=0)return;if(!aug(i,new Uint8Array(LINEUP.length)))waste+=e.v});
    for(let k=0;k<LINEUP.length;k++)if(slot[k]>=0){pts+=ev[slot[k]].v;games+=ev[slot[k]].g*ev[slot[k]].p.rate}
    weekly[w]=pts;startedPts+=pts;empty+=LINEUP.length*Math.min(7,days)-games});
  let reg=0,po=0;WEEKS.forEach((wk,i)=>{if(wk.po)po+=weekly[i];else reg+=weekly[i]});
  return {reg,po,total:reg+(S.poW||1.5)*po,weekly,waste,wastePct:waste/(waste+startedPts||1),emptyPerWeek:empty/Math.max(1,wks)};
}
function h2hValue(roster){
  if(S.lineup==="weekly")return h2hWeekly(roster);
  const weekly=new Float64Array(WEEKS.length);let waste=0,started=0,empty=0,slotDays=0;
  const ps=[...roster].sort((a,b)=>gameVal(b)-gameVal(a)),vals=ps.map(gameVal);
  const slot=new Array(LINEUP.length);
  const aug=(i,seen,play)=>{for(let k=0;k<LINEUP.length;k++){if(seen[k]||!elig(ps[i],k))continue;seen[k]=1;if(slot[k]<0||aug(slot[k],seen,play)){slot[k]=i;return true}}return false};
  for(const q of DAY_LIST){const w=DAY_WEEK[q];if(w<0)continue;
    const today=[];for(let i=0;i<ps.length;i++)if(ps[i].daySet.has(q))today.push(i);
    slotDays+=LINEUP.length;if(!today.length){empty+=LINEUP.length;continue}
    let dayPts=0;
    for(let s=0;s<H2H_SAMPLES;s++){slot.fill(-1);let n=0;
      for(const i of today){if(u01(ps[i].id*13+7,q,s)>=ps[i].rate)continue;const seen=new Uint8Array(LINEUP.length);
        if(aug(i,seen)){n++}else waste+=vals[i]/H2H_SAMPLES}
      for(let k=0;k<LINEUP.length;k++)if(slot[k]>=0)dayPts+=vals[slot[k]];
      started+=n/H2H_SAMPLES;empty+=(LINEUP.length-n)/H2H_SAMPLES}
    weekly[w]+=dayPts/H2H_SAMPLES}
  let reg=0,po=0;WEEKS.forEach((wk,i)=>{if(wk.po)po+=weekly[i];else reg+=weekly[i]});
  const pw=S.poW||1.5,startedPts=reg+po;
  return {reg,po,total:reg+pw*po,weekly,waste,wastePct:waste/(waste+startedPts||1),emptyPerWeek:empty/Math.max(1,WEEKS.filter(w=>w.p[1]>=CUR_PERIOD).length),started};
}
// Lookahead: simulate your next few picks greedily from players the board says will still be there,
// so a pick that leaves restrictive slots (PG, C...) to chance is valued below one that fills them.
function lineupWithFuture(roster,pool,startPick,horizon){
  let r=[...roster],pk=startPick;const taken=new Set(r.map(p=>p.id));
  for(let k=0;k<horizon&&pk;k++){
    const cands=pool.filter(p=>!taken.has(p.id)&&availAt(p,pk)>=.5).sort((a,b)=>vpg(b)-vpg(a)).slice(0,25);if(!cands.length)break;
    let best=null,bv=-1;cands.forEach(p=>{const v=assignLineup([...r,p]).value;if(v>bv){bv=v;best=p}});
    r.push(best);taken.add(best.id);pk+=S.teams;
  }
  return assignLineup(r).value;
}
// ---- roster rules: your center minimum, "fill every position", and ESPN's cap of 4 primary centers
const isC=p=>p.pos.includes("C");
const C_CAP=4; // ESPN default leagues: at most 4 players whose primary (default) position is C
const capOk=(roster,p)=>!(p.dp===5&&roster.filter(q=>q.dp===5).length>=C_CAP);
const roundOf=o=>Math.ceil(o/S.teams);
function myPicksFrom(o0){const out=[];for(let o=o0;o<=S.teams*13;o++)if(teamAt(o)===S.slot)out.push(o);return out.slice(0,13-mine().length)}
function rosterRules(){const R=[],n=S.minC??2;if(n>0)R.push({P:"C",n,by:S.minCBy??8});if(S.fillAll!==false)["PG","SG","SF","PF"].forEach(P=>R.push({P,n:1,by:13}));return R}
function needsOf(roster){return rosterRules().map(r=>({...r,left:Math.max(0,r.n-roster.filter(p=>p.pos.includes(r.P)).length)})).filter(r=>r.left>0)}
// fewest players (from those available) that would cover the unmet needs: greedy set cover, so a PG/SG counts for both
function picksToCover(needs,pool,roster){const left=Object.fromEntries(needs.map(r=>[r.P,r.left]));let k=0;const used=new Set(),ros=[...roster];
  while(Object.values(left).some(v=>v>0)&&k<12){let best=null,bc=0;for(const p of pool){if(used.has(p.id)||!capOk(ros,p))continue;const c=p.pos.filter(P=>left[P]>0).length;if(c>bc){bc=c;best=p;if(c>=2)break}}
    if(!best)return 99;used.add(best.id);ros.push(best);best.pos.forEach(P=>{if(left[P]>0)left[P]--});k++}
  return k}
// does the pick at o have to cover an unmet need? (true when the picks left before a deadline are only just enough)
function mustCover(roster,o,after,pool){const needs=needsOf(roster);if(!needs.length)return null;
  for(const d of [...new Set(needs.map(r=>r.by))].sort((a,b)=>a-b)){if(roundOf(o)>d)continue;const nd=needs.filter(r=>r.by<=d);
    if(picksToCover(nd,pool,roster)>=1+after.filter(x=>roundOf(x)<=d).length)return nd.map(r=>r.P)}
  return null}
function cPlan(){const n=S.minC??2,by=S.minCBy??8,my=mine(),have=my.filter(isC).length,cur=S.picks.length+1;
  const picks=myPicksFrom(cur),before=picks.filter(o=>roundOf(o)<=by);
  return {n,by,have,need:Math.max(0,n-have),picks,before,left:before.length,active:n>0&&have<n,missing:S.fillAll!==false?["PG","SG","SF","PF"].filter(P=>!my.some(p=>p.pos.includes(P))):[],primC:my.filter(p=>p.dp===5).length}}
// Simulate your next picks greedily from players likely to still be there, honouring every roster rule along the way.
function futureRoster(roster,pool,futurePicks){
  let r=[...roster];const taken=new Set(r.map(p=>p.id));
  for(let k=0;k<futurePicks.length;k++){const pk=futurePicks[k];
    const avail=pool.filter(p=>!taken.has(p.id));let cands=avail.filter(p=>availAt(p,pk)>=.5&&capOk(r,p));
    const must=mustCover(r,pk,futurePicks.slice(k+1),avail);
    if(must){const m=cands.filter(p=>p.pos.some(P=>must.includes(P)));cands=m.length?m:avail.filter(p=>capOk(r,p)&&p.pos.some(P=>must.includes(P)))}
    cands=cands.sort((a,b)=>vpg(b)-vpg(a)).slice(0,25);if(!cands.length)break;
    let best=null,bv=-1;cands.forEach(p=>{const v=assignLineup([...r,p]).value;if(v>bv){bv=v;best=p}});
    r.push(best);taken.add(best.id);
  }
  return r;
}
function rosterCtx(){
  const my=mine(),base=assignLineup(my),cur=S.picks.length+1,onClock=teamAt(cur)===S.slot,nx=onClock?cur:myNextPick(cur),fol=myNextPick(nx+1);
  const av=players.filter(p=>!pickOf(p.id)),cache=new Map(),plan=cPlan();
  const openN=base.slot.filter(x=>!x).length;
  // look far enough ahead to reach the center deadline when the minimum is still open
  const needs=needsOf(my),lastDeadline=needs.length?Math.max(...needs.map(r=>r.by)):0;
  const mineLeft=myPicksFrom(nx),H=Math.min(mineLeft.length,Math.max(Math.min(4,openN),needs.length?mineLeft.filter(o=>roundOf(o)<=lastDeadline).length:0,1),13);
  const fut=mineLeft.slice(1,H);
  const future=roster=>h2hValue(fut.length?futureRoster(roster,av,fut):roster).total;
  // is taking p now consistent with the minimum? (needs enough picks left for the centers still missing)
  const mustPos=mustCover(my,nx,mineLeft.slice(1),av),mustC=!!mustPos;
  const feasible=p=>capOk(my,p)&&(!mustPos||p.pos.some(P=>mustPos.includes(P)));
  const baseF=future(my);
  const shortlist=new Set([...av].sort((a,b)=>vpg(b)-vpg(a)).slice(0,60).concat(av.filter(isC).sort((a,b)=>vpg(b)-vpg(a)).slice(0,12)).map(p=>p.id));
  const gainOf=p=>{if(!cache.has(p.id)){const a=assignLineup([...my,p]),i=a.slot.findIndex(x=>x&&x.id===p.id);
    let g=shortlist.has(p.id)?future([...my,p])-baseF:(a.value-base.value)*p.avail*.4;if(!feasible(p))g-=1e7;
    cache.set(p.id,{gain:g,slot:i>=0?LINEUP[i][0]:"Bench"})}return cache.get(p.id)};
  const later={};BASEPOS.forEach(P=>{const el=av.filter(p=>p.pos.includes(P)).sort((a,b)=>vpg(b)-vpg(a));const l=fol?el.find(p=>availAt(p,fol)>=.5):el[1];later[P]=l?vpg(l):0});
  const score=p=>gainOf(p).gain;
  const open=base.slot.map((p,i)=>p?null:i).filter(i=>i!==null).map(i=>{const [lab,g]=LINEUP[i];
    const el=av.filter(p=>!g||p.pos.some(x=>g.includes(x))).sort((a,b)=>vpg(b)-vpg(a)),b=el[0];
    const drop=b?Math.max(0,...b.pos.filter(P=>!g||g.includes(P)).map(P=>vpg(b)-later[P])):0,rel=b?drop/vpg(b):0;
    return {i,lab,g,best:b,drop,urg:lab==="UTIL"?"low":rel>=.15?"high":rel>=.07?"med":"low"}});
  return {my,base,cur,onClock,nx,fol,av,gainOf,score,bonus:()=>0,open,later,plan,mustC,mustPos,feasible,mineLeft};
}
function h2hBlock(H){
  const live=WEEKS.map((w,i)=>({w,i,v:H.weekly[i]})).filter(x=>x.w.p[1]>=CUR_PERIOD),Wd=300,Ht=70,mx=Math.max(...live.map(x=>x.v),1),bw=Wd/live.length;
  let g="";live.forEach((x,k)=>{const h=x.v/mx*(Ht-14);g+=`<rect class="${x.w.po?"bar":"bar2"}" x="${k*bw+1}" width="${Math.max(1,bw-2)}" y="${Ht-h}" height="${h}" rx="2" data-tip="Week ${x.w.i} (${x.w.s} to ${x.w.e})${x.w.po?" · playoffs":""}: ${f0(x.v)} starter points"/>`});
  const regW=live.filter(x=>!x.w.po),poW=live.filter(x=>x.w.po);
  return `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Projected starter points by week">${g}</svg>
    <div class="stat-row"><span>Starter points per week</span><b>${f0(mean(regW.map(x=>x.v)))}</b></div>
    <div class="stat-row"><span>Per playoff week (orange)</span><b>${f0(mean(poW.map(x=>x.v)))}</b></div>
    <div class="stat-row"><span>Points stuck on your bench</span><b>${pc(H.wastePct)}</b></div>
    <div class="stat-row"><span>Empty starter slots per week</span><b>${f1(H.emptyPerWeek)}</b></div>
    <p class="empty" style="margin-top:6px">${S.lineup==="weekly"?"Assumes you lock 10 starters each week.":"Assumes you set the best lineup every day."} Change this in the mix card.</p>`}
function renderSide(){
  computeDisp();const my=mine();
  $("myCount").textContent=`${my.length} / 13`;
  const lu=assignLineup(my),ord=id=>(S.picks.find(x=>x.id===id)||{}).o;
  $("slots").className="needs";
  const openCt={};LINEUP.forEach((l,i)=>{if(!lu.slot[i])openCt[l[0]]=(openCt[l[0]]||0)+1});
  $("slots").innerHTML=!my.length?"":Object.keys(openCt).length?Object.entries(openCt).map(([l,n])=>`<span class="need-chip">${l}${n>1?" ×"+n:""} open</span>`).join(""):'<span class="need-chip ok">Starting lineup full</span>';
  $("roster").innerHTML=LINEUP.map((l,i)=>{const p=lu.slot[i];return `<li class="lu"><span class="lu-slot">${l[0]}</span>${p?`<span class="lu-name"><button class="expander" data-open="${p.id}">${esc(p.name)}</button> <small class="mut">${p.pos.join("/")}</small></span><span>#${ord(p.id)} · ${f1(p.proj.fp)}</span>`:'<span class="lu-name mut">open</span><span></span>'}</li>`}).join("")
    +lu.bench.map((p,i)=>`<li class="lu"><span class="lu-slot">${i<BENCH?"BE":"+"}</span><span class="lu-name"><button class="expander" data-open="${p.id}">${esc(p.name)}</button> <small class="mut">${p.pos.join("/")}</small></span><span>#${ord(p.id)} · ${f1(p.proj.fp)}</span></li>`).join("")
    +(lu.bench.length<BENCH?Array.from({length:BENCH-lu.bench.length},()=>'<li class="lu"><span class="lu-slot">BE</span><span class="lu-name mut">open</span><span></span></li>').join(""):"");
  const H=my.length?h2hValue(my):null;
  $("h2hBox").innerHTML=H?h2hBlock(H):'<p class="empty">Draft players to see your weekly head-to-head outlook.</p>';
  const top=[...my].sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,10);
  $("teamFp").textContent=f1(top.reduce((s,p)=>s+p.proj.fp,0));$("teamTot").textContent=f0(top.reduce((s,p)=>s+p.projTot,0));
  if(my.length){const sum={};Object.keys(CAT_LABEL).forEach(c=>sum[c]=my.reduce((s,p)=>s+p.z[c],0));const srt=Object.entries(sum).sort((a,b)=>b[1]-a[1]);
    $("teamCats").textContent=srt.slice(0,3).map(([c])=>CAT_LABEL[c]).join(" · ")+" / weak: "+srt.slice(-2).map(([c])=>CAT_LABEL[c]).join(" · ")}else $("teamCats").textContent="–";
  const need=new Set(SLOTS.filter(([,g])=>!my.some(p=>p.pos.some(x=>g.includes(x)))).map(([l])=>l));
  const ba=players.filter(p=>!pickOf(p.id)).sort((a,b)=>a.disp-b.disp).slice(0,7);
  $("baNote").textContent=(S.rankBy==="model"?"model rank":"board rank")+" · "+(S.scoring==="pts"?"proj FP/G":"cat z");
  $("ba").innerHTML=ba.map(p=>{const fills=my.length&&p.pos.some(x=>need.has(x));
    return `<li><span class="rk">${p.disp}</span><span class="nm"><button class="expander" data-open="${p.id}">${esc(p.name)}</button><br><span class="sub">${p.team} · ${p.pos.join("/")} · ${S.scoring==="pts"?f1(p.proj.fp)+" FP/G":(p.cat>=0?"+":"")+f1(p.cat)+" z"} · top-50 ${pc(p.pTop50)}${p.out?" · OUT":""}${fills?" · fills need":""}</span></span><button class="btn mine" data-mine="${p.id}">Draft</button></li>`}).join("");
  const cur=S.picks.length+1,rnd=Math.ceil(cur/S.teams);replay($("curPick"),"tick",String(cur));
  if(S.picks.length>=S.teams*13){$("curPick").textContent="✓";$("clockMsg").innerHTML=`<div class="lab">Draft complete<br>${MOCK()?"see Mock Draft results":"<button class='btn' id='toSeason' style='margin-top:4px'>Go to Season</button>"}</div>`}
  else if(!S.picks.length&&!MOCK()&&typeof LEAGUE!=="undefined"&&LEAGUE&&LEAGUE.draftDate>Date.now()&&teamAt(cur)!==S.slot)$("clockMsg").innerHTML=`<div class="lab">${esc(LEAGUE.name)} drafts<br>${new Date(LEAGUE.draftDate).toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div>`
  else if(teamAt(cur)===S.slot)$("clockMsg").innerHTML=`<button class="you clockbtn" id="toAdv">You're on the clock · Rd ${rnd} · see picks</button>`;
  else{const nx=myNextPick(cur);$("clockMsg").innerHTML=`<div class="lab">Rd ${rnd} · ${esc(teamName(teamAt(cur)))} picking<br>Your next: #${nx} (${nx-cur} away)</div>`}
  const tb=$("toAdv");if(tb)tb.onclick=()=>$("advCard").scrollIntoView({behavior:"smooth",block:"start"});
  renderAdvisor();
}


// ================= PICK ADVISOR =================
function advisor(){
  const R=rosterCtx();if(!R.av.length)return null;
  const {my,nx,fol,cur,onClock,gainOf,score,open,plan,mustC,mustPos}=R;const av=R.av.filter(R.feasible);
  const pts=S.scoring==="pts",desc=f=>(a,b)=>f(b)-f(a);
  const used=new Set(),out=[];
  const pick=list=>list.find(p=>!used.has(p.id));
  const slotTag=p=>{const g=gainOf(p);return g.slot==="Bench"?"→ bench":`→ ${g.slot} slot`};
  const add=(key,lab,p,why,stat,tag)=>{if(!p)return;out.push({key,lab,p,why:why(p),stat:stat(p),slot:tag||slotTag(p)});used.add(p.id)};
  const near=av.filter(p=>p.rank<=nx+S.teams*2.5||p.modelRank<=nx+S.teams*2.5),pool0=near.length>=5||mustC?(near.length?near:av):av;
  // once the lineup is taking shape, only suggest players who would actually start
  const starts=p=>gainOf(p).slot!=="Bench";
  const pool=my.length>=4&&pool0.filter(starts).length>=3?pool0.filter(starts):pool0;
  const bySc=[...av].sort(desc(score)),top=bySc[0];
  const goneList=fol?bySc.filter(p=>availAt(p,fol)<.4):bySc;
  const now=goneList[0],best=now&&score(now)>=.8*score(top)?now:top;
  add("best",mustC?`Best pick · fills a required ${mustPos.join("/")} spot`:"Best pick for your roster",best,p=>{const g=gainOf(p);
    const wk=Math.max(1,WEEKS.filter(w=>w.p[1]>=CUR_PERIOD).length);
    return (my.length?`Adds the most to your weekly starting lineup: about +${f0(g.gain/wk)} ${pts?"starter points":"value"} a week, mostly in your ${g.slot} slot, after daily lineup limits and his team's schedule (${p.avail} games left, ${p.poGames} in the playoff weeks)`:`Projects ${f0(p.projTot)} FP this season (${f1(p.proj.fp)}/game × ~${Math.round(p.projGP)} games)`)
      +`, counting the players likely left for your next ${Math.max(0,Math.min(3,R.open.length-1))} picks.`+(p.id!==top.id?` ${top.name} adds a bit more, but there's a ${pc(availAt(top,fol))} chance he's still there at #${fol}, so take him next time.`:!fol?"":availAt(p,fol)<.5?` Only a ${pc(availAt(p,fol))} chance he lasts to #${fol}.`:` There's a ${pc(availAt(p,fol))} chance he'd still be there at #${fol}, but nobody likely to go sooner helps you as much.`)},
    p=>`${f1(p.proj.fp)} FP/G · ${p.pos.join("/")}`);
  // up to two cards for the most urgent open positions
  const rankU={high:0,med:1,low:2};
  open.filter(o=>o.lab!=="UTIL").sort((a,b)=>rankU[a.urg]-rankU[b.urg]||b.drop-a.drop).slice(0,2).forEach(o=>{
    const el=av.filter(p=>p.pos.some(x=>o.g.includes(x))).sort(desc(score)),p=pick(el);if(!p)return;
    const later=fol?el.find(q=>availAt(q,fol)>=.5&&q.id!==p.id&&!used.has(q.id)):null,diff=later?p.proj.fp-later.proj.fp:0;
    add("need",`Fills your ${o.lab} · ${o.urg==="high"?"urgent":o.urg==="med"?"soon":"no rush"}`,p,
      q=>`Your ${o.lab} slot is open. ${later?(diff>1?`By your next pick (#${fol}) the best ${o.lab} likely left is ${later.name} (${f1(later.proj.fp)} FP/G), ${f1(diff)} less per game.`:`There will still be options at #${fol}, like ${later.name} (${f1(later.proj.fp)} FP/G), so this can wait.`):`He's the best ${o.lab} option available.`}`,
      q=>`${q.pos.join("/")} · ${f1(q.proj.fp)} FP/G`,`→ fills ${o.lab}`)});
  const upC=[...pool].sort(desc(p=>p.q.p90)).slice(0,12).filter(p=>!used.has(p.id));
  add("upside","Highest upside · risky",[...upC].sort(desc(p=>(p.q.p90-p.q.p10)/Math.max(1,p.q.p50)))[0],
    p=>`Ceiling of ${f0(p.q.p90)} FP in a great season (P90), but the floor is ${f0(p.q.p10)} (P10). ${p.rook?"Rookie with the widest projection range.":p.out?"Currently injured, so the games risk is real.":p_risk(p)}`,
    p=>`P90 ${f0(p.q.p90)} · P10 ${f0(p.q.p10)}`);
  add("breakout","Breakout candidate",pick([...pool].filter(p=>p.brk!==null&&p.brk>=BRK_BASE).sort(desc(p=>p.brk+p.comps.delta/40))),
    p=>`${pc(p.brk)} of his closest comps broke out the next season (base rate ${pc(BRK_BASE)}), e.g. ${p.comps.list.filter(x=>x.r.brk).slice(0,2).map(x=>x.r.p.name+" "+sh(x.r.t)).join(", ")||p.comps.list[0].r.p.name}.${p.fit.tot>1.02?" His team fit adds room too.":p.fit.tot<.98?" His new team squeezes him, though.":""}`,
    p=>`breakout ${pc(p.brk)} · comps ${p.comps.delta>=0?"+":""}${f1(p.comps.delta)}`);
  const medF36=[...av].map(p=>p.fp36).sort((a,b)=>a-b)[Math.floor(av.length/2)];
  add("minutes","Minutes upside",pick([...pool].filter(p=>!p.out&&p.fp36>=medF36&&p.projMpg<31).sort(desc(p=>p.fp36/36*(34-p.projMpg)+(p.lastMpg?p.projMpg-p.lastMpg:0)))),
    p=>`Produces ${f1(p.fp36)} FP per 36 minutes, better than most of the pool, but projects for only ${f1(p.projMpg)} min. At 34 minutes he'd be a ${f1(p.fp36/36*34)} FP/G player.${p.lastMpg&&p.projMpg-p.lastMpg>=1?` His minutes are already projected to rise by ${f1(p.projMpg-p.lastMpg)}.`:""}`,
    p=>`${f1(p.fp36)} FP/36 · ${f1(p.projMpg)} min`);
  add("safe","Safest floor",pick([...pool].filter(p=>!p.out).sort(desc(p=>p.q.p10))),
    p=>`Best bad-case outcome: even in his 10th-percentile season he scores ${f0(p.q.p10)} FP. Healthy, with a ±${f1(p.proj.sigma)} FP/G range.`,
    p=>`P10 ${f0(p.q.p10)} · ±${f1(p.proj.sigma)}`);
  add("value","Best value vs ADP",pick(pool.filter(p=>p.adpRank&&p.modelRank<=nx+S.teams*2&&!p.out&&p.adpRank-p.modelRank>=3).sort(desc(p=>p.adpRank-p.modelRank))),
    p=>`Model ranks him #${p.modelRank}, but ESPN drafters take him around pick ${f1(p.adp)} (#${p.adpRank} by ADP). You'd get a player the room is underrating.`,p=>`model #${p.modelRank} · ADP ${f1(p.adp)}`);
  if(my.length){
    const sum={};Object.keys(CAT_LABEL).forEach(c=>sum[c]=my.reduce((t,p)=>t+p.z[c],0));
    const weak=Object.entries(sum).sort((a,b)=>a[1]-b[1]).slice(0,2).map(([c])=>c);
    add("fit","Patches your weakest categories",pick([...pool].sort(desc(p=>weak.reduce((t,c)=>t+p.z[c],0)+.35*p.cat))),
      p=>`Your roster is weakest in ${weak.map(c=>CAT_LABEL[c]).join(" and ")}. He adds ${weak.map(c=>`${p_z(p.z[c])} in ${CAT_LABEL[c]}`).join(" and ")}.`,
      p=>weak.map(c=>`${CAT_LABEL[c]} ${p_z(p.z[c])}`).join(" · "));
  }
  if(fol){
    add("gone","Also won't make it back",pick(goneList.filter(p=>pool.includes(p)||!my.length)),p=>`ADP ${p.adp?f1(p.adp):"–"}: only a ${pc(availAt(p,fol))} chance he's still there at your next pick (#${fol}). Take him now if you want him.`,p=>`ADP ${p.adp?f1(p.adp):"–"} · ${f1(p.proj.fp)} FP/G`);
    add("wait","Can likely wait",pick(bySc.filter(p=>availAt(p,fol)>=.65)),p=>`ADP ${p.adp?f1(p.adp):"–"}: a ${pc(availAt(p,fol))} chance he's still there at your next pick (#${fol}). Spend this pick on someone who won't last.`,p=>`ADP ${p.adp?f1(p.adp):"–"} · ${f1(p.proj.fp)} FP/G`);
  }
  const t=tierOf(best.rank),left=av.filter(p=>tierOf(p.rank)===t).length;
  // center plan: where you stand against your minimum, and which centers are likely to last
  const Cs=R.av.filter(isC).sort((a,b)=>score(b)-score(a)),cBest=Cs[0],cLater=fol?R.av.filter(isC).sort((a,b)=>vpg(b)-vpg(a)).find(p=>availAt(p,fol)>=.5&&(!cBest||p.id!==cBest.id)):null;
  if(plan.active&&!mustC&&cBest&&!used.has(cBest.id))add("cplan",`Best center · you have ${plan.have} of ${plan.n}`,cBest,
    p=>`If you'd rather bank a center now, he adds the most. The advisor ranks him ${bySc.findIndex(q=>q.id===p.id)+1}${["st","nd","rd"][bySc.findIndex(q=>q.id===p.id)]||"th"} for this pick${cLater?`; ${cLater.name} has a ${pc(availAt(cLater,fol))} chance of lasting to #${fol}`:""}.`,
    p=>`${f1(p.proj.fp)} FP/G · ${p.pos.join("/")}`);
  const cMsg={have:plan.have,n:plan.n,by:plan.by,left:plan.left,mustC,mustPos,met:!plan.active,cLater,missing:plan.missing,primC:plan.primC,cOn:plan.n>0};
  return {out,onClock,cur,nx,fol,open,my,cMsg,tierMsg:left<=2?`Only ${left} player${left===1?"":"s"} left in board tier ${t}. Prices jump after this.`:""};
}
const pBtn=(p,cls="")=>p.id!=null?`<button class="expander" data-open="${p.id}">${cls?`<span class="${cls}">${esc(p.name)}</span>`:esc(p.name)}</button>`:`<span class="${cls}">${esc(p.name)}</span>`;
const norm2=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const p_z=z=>(z>=0?"+":"")+z.toFixed(1)+"z";
function p_risk(p){return p.projGP<55?`Projects for only ~${Math.round(p.projGP)} games, which is where the risk comes from.`:`His per-game range is wide (±${f1(p.proj.sigma)} FP/G).`}
function renderAdvisor(){
  const a=advisor(),card=$("advCard");if(!a){$("adv").innerHTML='<p class="empty">Everyone has been drafted.</p>';return}
  card.classList.toggle("live",a.onClock);
  $("advNote").textContent=a.onClock?`you're on the clock · #${a.cur}`:`preview for your pick #${a.nx}`;
  const strip=a.my.length?`<div class="needs" style="margin-bottom:10px">${a.open.length?a.open.map(o=>`<span class="need-chip ${o.urg}" title="${o.best?esc("Best fit now: "+o.best.name):""}">${o.lab}${o.urg==="high"?" · urgent":o.urg==="med"?" · soon":""}</span>`).join(""):'<span class="need-chip ok">Starting lineup full · drafting for depth</span>'}</div>`:"";
  const cm=a.cMsg,parts=[];
  if(cm.cOn)parts.push(cm.met?`Centers: ${cm.have} (minimum ${cm.n} met)`:`Centers: ${cm.have} of ${cm.n} by round ${cm.by}, ${cm.left} pick${cm.left===1?"":"s"} left before then`);
  if(cm.missing.length)parts.push(`still empty: ${cm.missing.join(", ")}`);
  if(cm.primC>=C_CAP)parts.push(`ESPN's cap of ${C_CAP} primary centers reached`);
  const cLine=(cm.mustC||parts.length)?`<p class="empty" style="margin:0 0 10px;${cm.mustC?"color:var(--bad)":(!cm.met&&cm.cOn)||cm.missing.length?"color:var(--warn)":""}">${cm.mustC?`This pick must cover ${cm.mustPos.join(" or ")} to keep your roster rules possible, so every suggestion below does. `:""}${parts.join(" · ")}.${!cm.mustC&&(cm.missing.length||(!cm.met&&cm.cOn))?" The advisor plans your next picks so these are met at the lowest cost.":""}</p>`:"";
  const H=headlines(a.open).slice(0,3),hl=H.length?`<ul class="heads">${H.map(h=>`<li class="${h.k}">${h.t}</li>`).join("")}</ul><p class="empty" style="margin:-4px 0 10px"><button class="expander" id="toIns" style="color:var(--mine);font-weight:600">More draft insights →</button></p>`:"";
  setTimeout(hookIns,0);
  $("adv").innerHTML=hl+strip+cLine+a.out.map(s=>`<div class="sug"><div class="lab${s.key==="best"?" top":""}">${s.lab}</div>
    <div class="who"><button class="expander${s.key==="best"?" call":""}" data-open="${s.p.id}">${esc(s.p.name)}</button><div class="meta">${s.p.team} · <span class="big">${s.stat}</span> · <b class="slot-tag">${s.slot}</b></div></div>
    <button class="btn mine" data-mine="${s.p.id}">Draft</button><div class="why">${esc(s.why)}</div></div>`).join("")
   +(a.tierMsg?`<p class="empty" style="margin-top:6px;color:var(--warn)">${a.tierMsg}</p>`:"")
   +cmpTable(a.out);
}
function hookIns(){const b=$("toIns");if(b)b.onclick=()=>{$("tab-insights").click();window.scrollTo({top:0,behavior:"smooth"})}}
function cmpTable(list){
  const seen=new Set(),rows=list.filter(s=>!seen.has(s.p.id)&&seen.add(s.p.id));
  const short={cplan:"C plan",minutes:"Min",need:"Need",breakout:"Brk",best:"Best",upside:"Upside",safe:"Safe",value:"Value",need:"Need",fit:"Cats",gone:"Now",wait:"Wait"};
  return `<details class="cmp" ${cmpOpen?"open":""} id="cmpBox"><summary>Compare these ${rows.length} players</summary><div class="tablebox"><table>
  <thead><tr><th class="l">Player</th><th>Why</th><th>FP/G</th><th>GP</th><th>P10</th><th>P50</th><th>P90</th><th>Top-12</th><th>Top-50</th><th>MPG</th><th>FP/36</th><th>Brk</th><th>Fit</th><th>Board</th><th>Model</th></tr></thead><tbody>
  ${rows.map(s=>{const p=s.p;return `<tr><td class="l"><button class="expander" data-open="${p.id}">${esc(p.name)}</button></td><td>${short[s.key]}</td><td class="num">${f1(p.proj.fp)}</td><td class="num">${Math.round(p.projGP)}</td><td class="num">${f0(p.q.p10)}</td><td class="num">${f0(p.q.p50)}</td><td class="num">${f0(p.q.p90)}</td><td class="num">${pc(p.pTop12)}</td><td class="num">${pc(p.pTop50)}</td><td class="num">${f1(p.projMpg)}</td><td class="num">${f1(p.fp36)}</td><td class="num">${p.brk===null?"–":pc(p.brk)}</td><td class="num">×${p.fit.tot.toFixed(2)}</td><td class="num">#${p.rank}</td><td class="num">#${p.modelRank}</td></tr>`}).join("")}
  </tbody></table></div><p class="empty" style="margin-top:6px">P10/P50/P90 are simulated season fantasy points (bad / typical / great season). Top-12/50 = share of 2,000 simulations finishing there.</p></details>`;
}
let cmpOpen=false;
document.addEventListener("toggle",e=>{if(e.target.id==="cmpBox")cmpOpen=e.target.open},true);

// ================= DRAFT INSIGHTS =================
const BP=["PG","SG","SF","PF","C"];
function draftState(){const cur=S.picks.length+1,av=players.filter(p=>!pickOf(p.id)),my=mine(),onClock=teamAt(cur)===S.slot,nx=onClock?cur:myNextPick(cur),fol=myNextPick(nx+1);
  return {cur,av,my,onClock,nx,fol,taken:S.picks.map(x=>({...x,p:players[x.id],team:teamAt(x.o)}))}}
// startable threshold: the projected FP/G of roughly the last starter league-wide (teams x 10 starters)
function replacementFp(){const s=[...players].sort((a,b)=>b.proj.fp-a.proj.fp);return s[Math.min(s.length-1,S.teams*10)].proj.fp}
function headlines(openList){const D=draftState(),out=[];if(!D.av.length)return out;const repl=replacementFp();
  // 1. position runs in the last 8 picks
  const last=D.taken.slice(-8);if(last.length>=6)BP.forEach(P=>{const n=last.filter(x=>x.p.pos[0]===P||(P==="C"&&x.p.dp===5)).length;if(n>=4)out.push({w:9,k:"warn",t:`<b>Run on ${P}:</b> ${n} of the last ${last.length} picks. Others may keep chasing; check whether you need one before #${D.fol||D.nx}.`})});
  // 2. value cliff among the best available
  const byFp=[...D.av].sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,14);let gi=-1,gap=0;for(let i=0;i<byFp.length-1;i++){const g=byFp[i].proj.fp-byFp[i+1].proj.fp;if(g>gap){gap=g;gi=i}}
  if(gap>=2.2&&gi<=6)out.push({w:8,k:"hi",t:`<b>Cliff ahead:</b> the top ${gi+1} available (${byFp.slice(0,Math.min(3,gi+1)).map(p=>esc(p.name)).join(", ")}${gi>=3?"…":""}) project ${f1(byFp[gi].proj.fp)}+ FP/G; the next best drops ${f1(gap)} to ${f1(byFp[gi+1].proj.fp)}.`});
  // 3. fallers past ADP
  const fall=D.av.filter(p=>p.adp&&D.cur-p.adp>=10&&p.proj.fp>=repl).sort((a,b)=>(D.cur-b.adp)-(D.cur-a.adp));
  if(fall[0])out.push({w:7+Math.min(3,(D.cur-fall[0].adp)/10),k:"good",t:`<b>${esc(fall[0].name)}</b> is still here ${Math.round(D.cur-fall[0].adp)} picks past his ADP (${f1(fall[0].adp)}), projecting ${f1(fall[0].proj.fp)} FP/G${fall[0].out?" (currently injured)":""}.`});
  // 4. likely gone before your next pick
  if(D.fol&&D.onClock){const gone=[...D.av].sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,15).filter(p=>availAt(p,D.fol)<.35).slice(0,3);
    if(gone.length)out.push({w:6,k:"hi",t:`<b>Likely gone before #${D.fol}:</b> ${gone.map(p=>`${esc(p.name)} (${pc(availAt(p,D.fol))} to last)`).join(", ")}.`})}
  // 5. thinning positions for your roster
  if(D.my.length&&openList){openList.filter(o=>o.urg==="high"&&o.lab!=="UTIL").slice(0,1).forEach(o=>out.push({w:7,k:"warn",t:`<b>${o.lab} is thinning:</b> best now ${o.best?esc(o.best.name):"–"}; the best ${o.lab} likely left at your next pick is ${f1(o.drop)} FP/G worse.`}))}
  // 6. your standing (once every pick so far is entered)
  if(D.cur>S.teams*3){const st=leagueStandings();const me=st.findIndex(x=>x.t===S.slot);if(me>=0)out.push({w:5,k:me<S.teams/3?"good":me>=S.teams*2/3?"warn":"",t:`<b>You project ${me+1} of ${S.teams}</b> on weekly starter points with the rosters drafted so far (${f0(st[me].wk)} a week vs ${f0(st[0].wk)} for the leader).`})}
  // 7. injury exposure on your roster
  if(D.my.length>=3){const lost=D.my.reduce((s,p)=>s+p.gamesOut,0);if(lost>=25)out.push({w:4,k:"warn",t:`<b>Injury exposure:</b> your roster is already projected to miss ${lost} games to current injuries (${D.my.filter(p=>p.gamesOut>=10).map(p=>esc(p.name)).join(", ")}).`})}
  // 8. reach alert from the last picks
  const reach=D.taken.slice(-S.teams).filter(x=>x.p.adp&&x.p.adp-x.o>=20).sort((a,b)=>(b.p.adp-b.o)-(a.p.adp-a.o))[0];
  if(reach&&!reach.mine)out.push({w:3,k:"",t:`<b>Reach:</b> ${esc(reach.p.name)} went #${reach.o}, ${Math.round(reach.p.adp-reach.o)} picks ahead of his ADP. Expect more value to slide to you.`});
  const sh=scoutHeadline();if(sh)out.push(sh);
  return out.sort((a,b)=>b.w-a.w)}
function leagueStandings(){return Array.from({length:S.teams},(_,i)=>i+1).map(t=>{const ros=S.picks.filter(x=>teamAt(x.o)===t).map(x=>players[x.id]);const H=ros.length?h2hValue(ros):{reg:0,po:0};
  const wks=Math.max(1,WEEKS.filter(w=>!w.po&&w.p[1]>=CUR_PERIOD).length);return {t,n:ros.length,wk:H.reg/wks,pwk:H.po/4,ros}}).sort((a,b)=>b.wk-a.wk)}
function teamNamesEditor(){
  return `<details class="chart-card" ${(S.tnOpen??!S.picks.length)?"open":""} id="tnBox"><summary style="cursor:pointer;font-weight:600">Opponent team names <span class="mut" style="font-weight:400">· by draft slot, used across the app</span></summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin-top:10px">${Array.from({length:S.teams},(_,i)=>i+1).map(t=>`<label class="chk" for="tn-${t}" style="gap:6px"><span style="width:52px">Slot ${t}</span>${t===S.slot?'<input id="tn-'+t+'" value="You" disabled style="flex:1;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:5px 8px">':`<input id="tn-${t}" data-tn="${t}" maxlength="24" placeholder="Team ${t}" value="${esc((S.teamNames||{})[t]||"")}" style="flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 8px">`}</label>`).join("")}</div>
    <p class="empty" style="margin-top:6px">Enter each manager's team (or name) in draft order; slot ${S.slot} is you. Names save in this browser and also label the mock draft.</p></details>`}
document.addEventListener("toggle",e=>{if(e.target.id==="tnBox"){S.tnOpen=e.target.open;save()}},true);
document.addEventListener("change",e=>{const el=e.target.closest&&e.target.closest("[data-tn]");if(!el)return;S.teamNames=S.teamNames||{};const v=el.value.trim();if(v)S.teamNames[el.dataset.tn]=v;else delete S.teamNames[el.dataset.tn];save();renderAll();renderMock();toast(v?`Slot ${el.dataset.tn} is now "${v}"`:`Slot ${el.dataset.tn} cleared`)});
function renderInsights(){const v=$("view-insights"),D=draftState(),repl=replacementFp(),A0=D.av.length?advisor():null,H=headlines(A0&&A0.open);
  const kp=(k,val,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${val}</div><div class="d">${d}</div></div>`;
  let h=teamNamesEditor()+`<div class="chart-card"><h4>Right now · pick #${D.cur}${D.onClock?" · you're on the clock":D.nx?` · your next pick #${D.nx}`:""}</h4>${H.length?`<ul class="heads" style="margin-top:8px">${H.map(x=>`<li class="${x.k}">${x.t}</li>`).join("")}</ul>`:'<p class="empty">Nothing unusual on the board yet. Insights appear as picks are made.</p>'}</div>`;
  // league
  if(S.picks.length){const st=leagueStandings();h+=`<h3>League</h3><div class="chart-grid"><div class="chart-card"><h4>Projected standings from picks so far</h4><div class="tablebox"><table><thead><tr><th class="l">Team</th><th>Players</th><th>Pts/week</th><th>Playoff week</th><th class="l">Top player</th></tr></thead><tbody>
    ${st.map((x,i)=>`<tr ${x.t===S.slot?'style="background:var(--mine-soft);font-weight:600"':""}><td class="l">${i+1}. ${x.t===S.slot?"You":esc(teamName(x.t))}${MOCK()&&S.mock.styles&&S.mock.styles[x.t]?` <span class="mut">(${STYLE_LABEL[S.mock.styles[x.t]]})</span>`:""}</td><td class="num">${x.n}</td><td class="num">${f0(x.wk)}</td><td class="num">${f0(x.pwk)}</td><td class="l">${esc([...x.ros].sort((a,b)=>b.projTot-a.projTot)[0]?.name||"–")}</td></tr>`).join("")}</tbody></table></div>
    <p>Counts only players drafted so far. Teams that have picked more players will lead early. In your real draft, this assumes every pick has been entered in order.</p></div>`;
    // runs + supply
    const last=D.taken.slice(-Math.min(20,D.taken.length)),runs=BP.map(P=>({label:P,v:last.filter(x=>x.p.pos.includes(P)).length/Math.max(1,last.length),tip:`${P}-eligible: ${last.filter(x=>x.p.pos.includes(P)).length} of the last ${last.length} picks`}));
    const supply=BP.map(P=>({label:P,v:D.av.filter(p=>p.pos.includes(P)&&p.proj.fp>=repl).length,tip:`${D.av.filter(p=>p.pos.includes(P)&&p.proj.fp>=repl).length} available ${P}-eligible players project above starter level (${f1(repl)} FP/G)`}));
    h+=`<div class="chart-card"><h4>What the room is taking</h4><div class="eq">share of the last ${last.length} picks eligible at each position</div>${vbars(runs,{H:170,yl:"Share of picks"})}
      <h4 style="margin-top:10px">Starter-level players left</h4><div class="eq">available players projecting above ${f1(repl)} FP/G (about the last starter in a ${S.teams}-team league)</div>${vbars(supply,{H:170,fmt:v=>String(Math.round(v)),yl:"Players"})}</div></div>`}
  // your team
  if(D.my.length){const my=D.my,sum={};Object.keys(CAT_LABEL).forEach(c=>sum[c]=my.reduce((t,p)=>t+p.z[c],0));const Hm=h2hValue(my);
    const ages=my.map(p=>p.age),lost=my.reduce((t,p)=>t+p.gamesOut,0),po=my.reduce((t,p)=>t+p.poGames,0),risk=Math.sqrt(my.reduce((t,p)=>t+p.proj.sigma**2,0));
    const catBars=Object.entries(sum).map(([c,v])=>({label:CAT_LABEL[c],v:Math.max(0,v+3),raw:v,tip:`${CAT_LABEL[c]}: ${v>=0?"+":""}${f1(v)} z across your roster`}));
    h+=`<h3>Your team</h3><div class="kpis">${kp("Starter pts / week",f0(Hm.reg/Math.max(1,WEEKS.filter(w=>!w.po&&w.p[1]>=CUR_PERIOD).length)),`playoff weeks ${f0(Hm.po/4)}`)}${kp("Games left",f0(my.reduce((t,p)=>t+p.avail,0)),`${lost} lost to injuries`)}${kp("Playoff-week games",po,`${f1(po/my.length)} per player (13–16 is the range)`)}${kp("Average age",f1(mean(ages)),`youngest ${Math.min(...ages)}, oldest ${Math.max(...ages)}`)}${kp("Roster risk",`±${f1(risk)}`,"FP/G combined uncertainty")}${kp("Bench waste",pc(Hm.wastePct),`${f1(Hm.emptyPerWeek)} empty slots / week`)}</div>
    <div class="chart-grid"><div class="chart-card"><h4>Category profile (ESPN 8 categories)</h4><div class="eq">roster total z-score per category, shifted so 0 = −3</div>${vbars(catBars,{H:190,fmt:v=>(v-3>=0?"+":"")+(v-3).toFixed(1),yl:"z (+3)"})}
      <p>Useful in category leagues, and as a style read in points leagues: blocks and steals are worth 4 points each.</p></div>
      <div class="chart-card"><h4>Your players</h4><div class="tablebox"><table><thead><tr><th class="l">Player</th><th>FP/G</th><th>80% range</th><th>Games</th><th>Playoff G</th><th>Age</th></tr></thead><tbody>
      ${[...my].sort((a,b)=>b.proj.fp-a.proj.fp).map(p=>`<tr><td class="l">${pBtn(p)} <span class="mut">${p.pos.join("/")}</span></td><td class="num">${f1(p.proj.fp)}</td><td class="num">${f1(p.lo)}–${f1(p.hi)}</td><td class="num">${Math.round(p.projGP)}${p.gamesOut?` <span class="zneg">(−${p.gamesOut})</span>`:""}</td><td class="num">${p.poGames}</td><td class="num">${p.age}</td></tr>`).join("")}</tbody></table></div></div></div>`}
  h+=scoutingSection();
  // value watch
  const fall=D.av.filter(p=>p.adp&&D.cur-p.adp>=3).sort((a,b)=>(D.cur-b.adp)-(D.cur-a.adp)).slice(0,8),reaches=D.taken.filter(x=>x.p.adp&&x.p.adp-x.o>=8).sort((a,b)=>(b.p.adp-b.o)-(a.p.adp-a.o)).slice(0,8);
  h+=`<h3>Value watch</h3><div class="chart-grid"><div class="chart-card"><h4>Sliding past ADP</h4>${fall.length?`<div class="tablebox"><table><tbody>${fall.map(p=>`<tr><td class="l">${pBtn(p)} <span class="mut">${p.team} · ${p.pos.join("/")}</span></td><td class="num zpos">+${Math.round(D.cur-p.adp)}</td><td class="num">${f1(p.proj.fp)} FP/G</td><td class="num mut">model #${p.modelRank}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">Nobody has slid meaningfully yet.</p>'}</div>
    <div class="chart-card"><h4>Biggest reaches so far</h4>${reaches.length?`<div class="tablebox"><table><tbody>${reaches.map(x=>`<tr><td class="l">${pBtn(x.p)} <span class="mut">by ${x.mine?"you":esc(teamName(x.team))}</span></td><td class="num">#${x.o}</td><td class="num zneg">${Math.round(x.p.adp-x.o)} early</td><td class="num mut">ADP ${f1(x.p.adp)}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">No big reaches yet.</p>'}</div></div>`;
  // next pick forecast
  if(D.nx){const tgt=D.onClock?D.fol:D.nx,cand=[...D.av].sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,24);
    h+=`<h3>${D.onClock?`Planning for your following pick (#${D.fol||"–"})`:`Your next pick (#${D.nx})`}</h3><div class="chart-card"><div class="tablebox"><table><thead><tr><th class="l">Player</th><th>Proj FP/G</th><th>ADP</th><th>Chance he's there</th><th class="l">Fits</th></tr></thead><tbody>
      ${tgt?cand.map(p=>{const a=availAt(p,tgt);return `<tr><td class="l">${pBtn(p)} <span class="mut">${p.team}</span></td><td class="num">${f1(p.proj.fp)}</td><td class="num">${p.adp?f1(p.adp):"–"}</td><td class="num ${a>=.6?"zpos":a<.3?"zneg":""}">${pc(a)}</td><td class="l mut">${p.pos.join("/")}</td></tr>`}).join(""):""}</tbody></table></div>
      <p>${(D.onClock?D.fol:D.nx)===(scoutSim()||{}).target?"Odds come from simulating the picks before yours, with each team drafting in its inferred style and filling its needs (see Opponent scouting).":MOCK()?"Odds use this mock room's mix of drafters.":"Odds use ESPN ADP with a spread that grows later in the draft."}</p></div>`}
  // detailed comparison of the advisor's top candidates
  const A=A0;if(A){const seen=new Set(),top=A.out.filter(x=>!seen.has(x.p.id)&&seen.add(x.p.id)).slice(0,5).map(x=>({lab:x.lab,p:x.p}));
    const rows=[["Why",x=>x.lab.split(" · ")[0]],["Team · pos",x=>`${x.p.team} · ${x.p.pos.join("/")}`],["Proj FP/G (80%)",x=>`<b>${f1(x.p.proj.fp)}</b> (${f1(x.p.lo)}–${f1(x.p.hi)})`],["ESPN proj FP/G",x=>x.p.espnFp!=null?f1(x.p.espnFp):"–"],["2025-26 FP/G",x=>x.p.hist.length?f1(x.p.hist[x.p.hist.length-1].fp):"–"],["2026-27 so far",x=>x.p.nowFp!=null?`${f1(x.p.nowFp)} in ${x.p.now.gp} g`:"–"],
      ["PTS / REB / AST",x=>{const l=x.p.proj.line;return `${f1(l.pts)} / ${f1(l.reb)} / ${f1(l.ast)}`}],["STL / BLK / 3PM / TO",x=>{const l=x.p.proj.line;return `${f1(l.stl)} / ${f1(l.blk)} / ${f1(l.tpm)} / ${f1(l.tov)}`}],["FG% / FT%",x=>{const l=full(x.p.proj.line);return `${pct(l.fgm/Math.max(.1,l.fga))} / ${pct(l.ftm/Math.max(.1,l.fta))}`}],
      ["Minutes · FP/36",x=>`${f1(x.p.projMpg)} · ${f1(x.p.fp36)}`],["Games left (playoff wks)",x=>`${Math.round(x.p.projGP)} (${x.p.poGames})${x.p.gamesOut?` · out ~${x.p.gamesOut}`:""}`],["Season FP P10 / P90",x=>`${f0(x.p.q.p10)} / ${f0(x.p.q.p90)}`],["Top-50 odds · breakout",x=>`${pc(x.p.pTop50)} · ${x.p.brk==null?"–":pc(x.p.brk)}`],["ADP · model rank",x=>`${x.p.adp?f1(x.p.adp):"–"} · #${x.p.modelRank}`],["Age · name value",x=>`${x.p.age} · #${x.p.fameRank}`]];
    h+=`<h3>Detailed comparison · the advisor's top options</h3><div class="chart-card"><div class="tablebox"><table class="cmp-wide"><thead><tr><th class="l"></th>${top.map(x=>`<th>${pBtn(x.p)}</th>`).join("")}</tr></thead><tbody>${rows.map(([lab,f])=>`<tr><td class="l mut">${lab}</td>${top.map(x=>`<td class="num">${f(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`}
  v.innerHTML=h;
}
// ================= OPPONENT SCOUTING =================
// Which drafting style best explains a team's picks so far (log scale, so early picks count more)
function inferStyle(t){if(MOCK()&&S.mock.styles&&S.mock.styles[t])return {style:S.mock.styles[t],conf:1,known:true};
  const ps=S.picks.filter(x=>teamAt(x.o)===t).map(x=>({o:x.o,p:players[x.id]}));if(ps.length<3)return {style:"adp",conf:0,n:ps.length};
  const err=st=>mean(ps.map(x=>Math.abs(Math.log(Math.max(1,styleKey(st,x.p)))-Math.log(x.o))));
  const e=["adp","name","sharp"].map(st=>[st,err(st)]).sort((a,b)=>a[1]-b[1]);
  return {style:e[0][0],conf:clamp((e[1][1]-e[0][1])/.2,0,1),n:ps.length,errs:Object.fromEntries(e)}}
function teamTraits(t){const ros=S.picks.filter(x=>teamAt(x.o)===t).map(x=>({o:x.o,p:players[x.id]})),P=ros.map(x=>x.p),tr=[];if(!ros.length)return {ros,P,tr,reach:0,needs:BP.slice(),cnt:{}};
  const withAdp=ros.filter(x=>x.p.adp),reach=withAdp.length?mean(withAdp.map(x=>x.o-x.p.adp)):0,age=mean(P.map(p=>p.age));
  if(withAdp.length>=2&&reach<=-8)tr.push("reaches early");if(withAdp.length>=2&&reach>=8)tr.push("waits for value");
  if(P.length>=3&&age<=24.5)tr.push("young core");if(P.length>=3&&age>=30)tr.push("veterans");
  if(P.filter(p=>p.gamesOut>=15).length>=1)tr.push("takes injured players");if(P.filter(p=>p.rook).length>=2)tr.push("likes rookies");
  const g=P.filter(p=>p.pos.every(x=>x==="PG"||x==="SG")).length,b=P.filter(p=>p.pos.includes("C")).length;
  if(P.length>=3&&g/P.length>=.6)tr.push("guard-heavy");if(P.length>=3&&b/P.length>=.5)tr.push("bigs-heavy");
  const cnt=Object.fromEntries(BP.map(x=>[x,P.filter(p=>p.pos.includes(x)).length]));
  return {ros,P,tr,reach,age,cnt,needs:BP.filter(x=>!cnt[x]),primC:P.filter(p=>p.dp===5).length}}
// Simulate every pick between now and your next one, many times, with each team drafting in its inferred style and filling needs.
let SCOUT={key:null};
function scoutFor(k){const sc=scoutSim();return sc&&sc.target===k?sc:null}
function scoutSim(){const key=[S.picks.length,S.slot,S.teams,S.scoring,MOCK()?S.mock.seed:0,JSON.stringify(S.mix||{}),JSON.stringify(S.adj||{})].join("|");if(SCOUT.key===key)return SCOUT.res;
  SCOUT={key,res:null};const cur=S.picks.length+1,onClock=teamAt(cur)===S.slot,target=onClock?myNextPick(cur+1):myNextPick(cur);
  if(!target||S.picks.length>=S.teams*13)return null;
  const seq=[];for(let o=onClock?cur+1:cur;o<target;o++)if(teamAt(o)!==S.slot)seq.push(o);
  const av=players.filter(p=>!pickOf(p.id)),teams=[...new Set(seq.map(teamAt))],sty={},base={};
  teams.forEach(t=>{sty[t]=inferStyle(t).style;const tr=teamTraits(t);base[t]={P:tr.P}});
  const order={};["adp","name","sharp"].forEach(st=>order[st]=av.slice().sort((a,b)=>styleKey(st,a)-styleKey(st,b)));
  let seed=(S.picks.length*2654435761+S.slot*97)>>>0;const rnd=()=>{seed=seed+0x6D2B79F5|0;let x=Math.imul(seed^seed>>>15,1|seed);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296};
  const gs=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd())};
  const N=300,taken={},byTeam={};teams.forEach(t=>byTeam[t]={});
  for(let r=0;r<N;r++){const gone=new Set(),ros={};teams.forEach(t=>ros[t]=base[t].P.slice());
    for(const o of seq){const t=teamAt(o),st=sty[t],R=ros[t],left=13-R.length,miss=BP.filter(x=>!R.some(p=>p.pos.includes(x)));
      let best=null,bk=1e9,seen=0;
      for(const p of order[st]){if(gone.has(p.id))continue;if(!capOk(R,p))continue;if(miss.length&&miss.length>=left&&!p.pos.some(x=>miss.includes(x)))continue;
        const a=styleKey(st,p),k=a+Math.max(1.5,a*.12)*gs()+(st!=="name"&&p.out&&p.gamesOut>30?a*.25:0);if(k<bk){bk=k;best=p}if(++seen>=40)break}
      if(!best)continue;gone.add(best.id);R.push(best);taken[best.id]=(taken[best.id]||0)+1;byTeam[t][best.id]=(byTeam[t][best.id]||0)+1}}
  const pTaken={};Object.entries(taken).forEach(([id,c])=>pTaken[id]=c/N);
  const res={target,seq,teams,sty,pTaken,byTeam,N};SCOUT.res=res;return res}
function scoutHeadline(){const sc=scoutSim();if(!sc)return null;const av=players.filter(p=>!pickOf(p.id)).sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,8);
  const hot=av.find(p=>(sc.pTaken[p.id]||0)>=.5);if(!hot)return null;
  const who=sc.teams.map(t=>[t,(sc.byTeam[t][hot.id]||0)/sc.N]).sort((a,b)=>b[1]-a[1])[0],tr=teamTraits(who[0]);
  return {w:6.5,k:"warn",t:`<b>Scouting:</b> ${pc(sc.pTaken[hot.id])} chance ${esc(hot.name)} is gone before #${sc.target}. Most likely taker: ${esc(teamName(who[0]))} (${STYLE_LABEL[sc.sty[who[0]]]} drafter${tr.needs.length?`, still needs ${tr.needs.join("/")}`:""}).`}}
function scoutingSection(){const sc=scoutSim(),others=Array.from({length:S.teams},(_,i)=>i+1).filter(t=>t!==S.slot);
  const before=new Set(sc?sc.teams:[]),rows=others.map(t=>({t,st:inferStyle(t),tr:teamTraits(t),nb:sc?sc.seq.filter(o=>teamAt(o)===t).length:0})).sort((a,b)=>b.nb-a.nb||a.t-b.t);
  const targets=t=>{if(!sc||!sc.byTeam[t])return "–";const e=Object.entries(sc.byTeam[t]).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return e.map(([id,c])=>`${pBtn(players[id])} <span class="mut">${pc(c/sc.N/Math.max(1,sc.seq.filter(o=>teamAt(o)===t).length))}</span>`).join(", ")};
  return `<h3>Opponent scouting</h3><div class="chart-card"><div class="tablebox"><table class="cmp-wide"><thead><tr><th class="l">Team</th><th>Picks before you</th><th>Style</th><th>vs ADP</th><th class="l">Positions</th><th class="l">Needs</th><th class="l">Tendencies</th><th class="l">Likely next targets</th></tr></thead><tbody>
    ${rows.map(r=>{const st=r.st,conf=st.known?"known":st.n<3?"too early":st.conf>=.6?"clear":st.conf>=.25?"leaning":"unclear";
      return `<tr ${r.nb?'style="background:var(--warn-soft)"':""}><td class="l">${esc(teamName(r.t))}</td><td class="num">${r.nb||"–"}</td><td class="num">${st.n<3&&!st.known?'<span class="mut">ADP?</span>':STYLE_LABEL[st.style]} <span class="mut">(${conf})</span></td>
        <td class="num ${r.tr.reach<=-5?"zneg":r.tr.reach>=5?"zpos":""}">${r.tr.ros.length?(r.tr.reach>0?"+":"")+f1(r.tr.reach):"–"}</td><td class="l">${r.tr.ros.length?BP.map(x=>`${x}${r.tr.cnt[x]}`).join(" "):"–"}</td>
        <td class="l">${r.tr.ros.length?(r.tr.needs.join(", ")||'<span class="mut">none</span>'):"–"}${r.tr.primC>=C_CAP?' <span class="mut">(C cap reached)</span>':""}</td><td class="l">${r.tr.tr.join(", ")||'<span class="mut">–</span>'}</td><td class="l">${r.nb?targets(r.t):'<span class="mut">picks after you</span>'}</td></tr>`}).join("")}</tbody></table></div>
    <p>Style is whichever of ESPN ADP, name value or this model best explains a team's picks so far (shown once it has 3 picks${MOCK()?"; in mocks the computer teams' styles are known":""}). "vs ADP" is how many picks after ESPN's ADP a team takes players on average: negative means it reaches. Highlighted teams pick before your next pick at #${sc?sc.target:"–"}. Their likely targets come from ${sc?sc.N:300} simulations of those picks, with each team drafting in its own style and filling its own needs. The same simulation sets the Pick Advisor's odds that a player lasts to your next pick.</p></div>`}
// ================= SEASON HUB =================
const dayDate=q=>new Date(new Date(PERIOD0+"T12:00:00").getTime()+q*864e5);
const dayLabel=q=>dayDate(q).toLocaleDateString(undefined,{weekday:"short",month:"numeric",day:"numeric"});
const CUR_WEEK=Math.max(0,WEEKS.findIndex(w=>CUR_PERIOD>=w.p[0]&&CUR_PERIOD<=w.p[1]));
// league rosters: once you start the season they're stored and editable; before that they come from the draft picks
function leagueRosters(){if(S.league)return S.league;const L={};for(let t=1;t<=S.teams;t++)L[t]=[];if(!MOCK())S.picks.forEach(x=>L[teamAt(x.o)].push(x.id));return L}
const rosterOf=t=>(leagueRosters()[t]||[]).map(id=>players[id]).filter(Boolean);
const myRoster=()=>rosterOf(S.slot);
// injury fallout: regulars who are out right now, and the teammates the model expects to gain in his absence
function falloutCard(){const d=PDATE(CUR_PERIOD),own=new Set(Object.values(leagueRosters()).flat()),mine=new Set(myRoster().map(p=>p.id));
  const outs=players.filter(p=>p.out&&regMin(p)>=20).sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,8).map(a=>({a,g:players.filter(q=>q.team===a.team&&q!==a&&!q.out).map(q=>({q,m:mateAdj(q,d,formBase(q)).list.find(m=>m.q===a)})).filter(x=>x.m&&x.m.dl>=1).sort((x,y)=>y.m.dl-x.m.dl).slice(0,3)})).filter(x=>x.g.length);
  if(!outs.length)return "";
  const tag=q=>!own.size?"":mine.has(q.id)?'<span class="chip">yours</span>':own.has(q.id)?'<span class="mut">rostered</span>':'<span class="chip hot">free agent</span>';
  return `<div class="chart-card"><h4 style="margin:0 0 4px">Injury fallout</h4><p class="empty" style="margin:0 0 8px">Regulars who are out now, and who the model expects to pick up the slack: fantasy points per game added while he sits, from his production, their roles and how they've actually done without him.</p>
    <div class="tablebox"><table><thead><tr><th class="l">Out</th><th class="l">Who gains (FP/G while he's out)</th></tr></thead><tbody>${outs.map(({a,g})=>`<tr><td class="l">${pBtn(a)} <span class="mut">${a.team} · ${retText(a.inj&&a.inj.ret,a.inj&&a.inj.fs)}</span></td><td class="l">${g.map(({q,m})=>`${pBtn(q)} <b class="zpos">+${f1(m.dl)}</b>${m.nO?` <span class="mut">(${m.nO}g without)</span>`:""} ${tag(q)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div>`}
function freeAgents(){const own=new Set(Object.values(leagueRosters()).flat());return players.filter(p=>!own.has(p.id))}
function weekDays(w){const wk=WEEKS[w],out=[];for(let q=Math.max(wk.p[0],CUR_PERIOD);q<=wk.p[1];q++)out.push(q);return out}
// expected lineup for one day: the best 10 of your players with a game, by expected points, respecting positions
function dayLineup(ros,q){const c=ros.filter(p=>p.daySet.has(q)).sort((a,b)=>gameVal(b)*b.rate-gameVal(a)*a.rate),slot=new Array(LINEUP.length).fill(null),bench=[];
  const aug=(p,seen)=>{for(let k=0;k<LINEUP.length;k++){if(seen[k]||!elig(p,k))continue;seen[k]=1;if(!slot[k]||aug(slot[k],seen)){slot[k]=p;return true}}return false};
  c.forEach(p=>{if(!aug(p,new Uint8Array(LINEUP.length)))bench.push(p)});return {slot,bench,starters:slot.filter(Boolean)}}
function weekProj(ros,w){let pts=0,games=0;const per=weekDays(w).map(q=>{const L=dayLineup(ros,q),v=L.starters.reduce((s,p)=>s+p.proj.fp*p.rate,0);pts+=v;games+=L.starters.length;return {q,L,v}});return {pts,per,games}}
// head-to-head week: availability drawn per game from each player's games-played rate, and each game's points drawn from
// the measured spread of actual vs predicted over two seasons of games (MATCHUP.RQ: lopsided, more bad nights than blowups)
// centered on 1: the shape of the swing, not last season's slight under-prediction, belongs in the simulation
const RQ1=MATCHUP.RQ.map(x=>x/mean(MATCHUP.RQ)),swing=rnd=>{const u=rnd()*(RQ1.length-1),i=Math.floor(u);return RQ1[i]+(RQ1[Math.min(i+1,RQ1.length-1)]-RQ1[i])*(u-i)};
function matchupSim(A,B,w,N=600){let seed=(w*7919+A.length*31+B.length)>>>0;const rnd=()=>{seed=seed+0x6D2B79F5|0;let x=Math.imul(seed^seed>>>15,1|seed);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296};
  const days=weekDays(w);
  const side=ros=>{const ps=[...ros].sort((a,b)=>gameVal(b)-gameVal(a));let tot=0;for(const q of days){const slot=new Array(LINEUP.length).fill(-1);
      const aug=(i,seen)=>{for(let k=0;k<LINEUP.length;k++){if(seen[k]||!elig(ps[i],k))continue;seen[k]=1;if(slot[k]<0||aug(slot[k],seen)){slot[k]=i;return true}}return false};
      for(let i=0;i<ps.length;i++){if(!ps[i].daySet.has(q)||rnd()>=ps[i].rate)continue;aug(i,new Uint8Array(LINEUP.length))}
      for(let k=0;k<LINEUP.length;k++)if(slot[k]>=0){const p=ps[slot[k]];tot+=p.proj.fp*swing(rnd)}}return tot};
  let win=0;const a=[],b=[];for(let i=0;i<N;i++){const x=side(A),y=side(B);a.push(x);b.push(y);if(x>y)win++}
  return {p:win/N,a:mean(a),b:mean(b),aq:[quant(a,.1),quant(a,.9)],bq:[quant(b,.1),quant(b,.9)]}}
function seasonGate(view){const has=myRoster().length;if(has)return "";
  return `<div class="chart-card" style="max-width:720px"><h4>Set up your season</h4><p style="font-size:13px;color:var(--ink)">The Matchup, Waivers and Trades tabs work from your league's rosters. ${S.picks.length&&!MOCK()?`You have ${S.picks.length} draft picks entered. Use them to fill every team's roster, then record adds, drops and trades in the Rosters tab.`:"Enter your draft on the Big Board (Draft for your picks, Taken for everyone else's, in order), or add players to your roster in the Rosters tab."}</p>
    <div class="row-btns" style="margin-top:8px">${S.picks.length&&!MOCK()?'<button class="btn primary" id="seasonFromDraft">Start the season from my draft</button>':""}<button class="btn" id="goRosters">Go to Rosters</button></div>${MOCK()?'<p class="empty" style="margin-top:6px">You\'re in a mock draft. Exit it first so the season uses your real draft.</p>':""}</div>`}
function startSeasonFromDraft(){const L={};for(let t=1;t<=S.teams;t++)L[t]=[];S.picks.forEach(x=>L[teamAt(x.o)].push(x.id));S.league=L;save();toast("Season started: rosters copied from your draft");renderSeason("season")}
function renderSeason(view){const v=$("view-"+view);if(!v)return;
  if(view==="rosters"){v.innerHTML=rostersView();hookSeason();return}
  const g=seasonGate(view);if(g){v.innerHTML=(view==="waivers"?falloutCard():"")+g;hookSeason();return}  // injury fallout needs no roster
  v.innerHTML=view==="season"?seasonView():view==="waivers"?waiversView():tradesView();hookSeason()}
function weekSelect(id,sel){return `<select id="${id}">${WEEKS.map((w,i)=>i<CUR_WEEK?"":`<option value="${i}" ${i===sel?"selected":""}>Week ${w.i}${w.po?" (playoffs)":""} · ${new Date(w.s+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}–${new Date(w.e+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}</option>`).join("")}</select>`}
function seasonView(){const w=S.seasonWeek??CUR_WEEK,my=myRoster(),opp=S.seasonOpp||leagueOpp(w)||Object.keys(leagueRosters()).map(Number).find(t=>t!==S.slot),O=rosterOf(opp),P=weekProj(my,w),days=weekDays(w);
  let h=`<div class="chart-card"><div class="row-btns" style="justify-content:space-between;align-items:center"><h4 style="margin:0">Your week</h4><div class="row-btns">${weekSelect("seasonWeek",w)}<select id="seasonOpp">${Object.keys(leagueRosters()).map(Number).filter(t=>t!==S.slot).map(t=>`<option value="${t}" ${t===opp?"selected":""}>vs ${esc(teamName(t))}</option>`).join("")}</select></div></div>`;
  if(O.length){const M=matchupSim(my,O,w);h+=`<div class="vs" style="margin-top:12px"><div><div class="k mut">You</div><div class="big">${f0(M.a)}</div><div class="mut" style="font-size:12px">80%: ${f0(M.aq[0])}–${f0(M.aq[1])} · ${P.games} starts</div></div>
      <div><div class="big" style="color:${M.p>=.5?"var(--ok)":"var(--bad)"}">${pc(M.p)}</div><div class="mut" style="font-size:12px">chance you win</div></div>
      <div><div class="k mut">${esc(teamName(opp))}</div><div class="big">${f0(M.b)}</div><div class="mut" style="font-size:12px">80%: ${f0(M.bq[0])}–${f0(M.bq[1])} · ${weekProj(O,w).games} starts</div></div></div>
      <p class="empty" style="margin-top:8px">${days.length} day${days.length===1?"":"s"} left in this matchup (from ${dayLabel(days[0])}). Your opponent comes from your league's ESPN schedule; pick another team to compare.</p>`}
  h+=`</div><div class="chart-card"><h4>Daily lineup · week ${WEEKS[w].i}</h4><div class="eq"><span style="color:var(--ok)">■</span> starts &nbsp;<span style="color:var(--warn)">■</span> has a game but no open slot &nbsp;<span style="color:var(--bad)">OUT</span> injured</div>
    <div class="tablebox"><table class="wkgrid"><thead><tr><th class="l">Player</th>${P.per.map(d=>`<th>${dayLabel(d.q)}</th>`).join("")}<th>Games</th></tr></thead><tbody>
    ${[...my].sort((a,b)=>b.proj.fp-a.proj.fp).map(p=>{let g=0;return `<tr><td class="l">${pBtn(p)} <span class="mut">${p.pos.join("/")} · ${f1(p.proj.fp)}</span></td>${P.per.map(d=>{const opp=(SCHED_OPP[p.team]||{})[d.q];if(!opp)return '<td class="no">·</td>';
      if(d.q<p.retP)return `<td class="ot">OUT</td>`;g++;const st=d.L.starters.includes(p);return `<td class="${st?"st":"bn"}" title="${st?"Starts":"Bench: no open slot"}">${opp}</td>`}).join("")}<td>${g}</td></tr>`}).join("")}
    <tr><td class="l"><b>Projected points</b></td>${P.per.map(d=>`<td><b>${f0(d.v)}</b></td>`).join("")}<td><b>${f0(P.pts)}</b></td></tr>
    <tr><td class="l mut">Open slots</td>${P.per.map(d=>`<td class="mut">${LINEUP.length-d.L.starters.length}</td>`).join("")}<td></td></tr></tbody></table></div>
    <p>Starts assume you set the best lineup each day (Quick Lineup at the start of the week does about the same). Open slots are spots you could fill by streaming a free agent; see Waivers.</p></div>`;
  // rest-of-season standings
  const st=Object.keys(leagueRosters()).map(Number).map(t=>{const R=rosterOf(t),H=R.length?h2hValue(R):{reg:0,po:0};const wks=Math.max(1,WEEKS.filter(x=>!x.po&&x.p[1]>=CUR_PERIOD).length);return {t,wk:H.reg/wks,pwk:H.po/4,n:R.length}}).sort((a,b)=>b.wk-a.wk);
  h+=`<div class="chart-card"><h4>Rest-of-season power rankings</h4><div class="tablebox"><table><thead><tr><th class="l">Team</th><th>Players</th><th>Starter pts/week</th><th>Playoff weeks</th></tr></thead><tbody>${st.map((x,i)=>`<tr ${x.t===S.slot?'style="background:var(--mine-soft);font-weight:600"':""}><td class="l">${i+1}. ${x.t===S.slot?"You":esc(teamName(x.t))}</td><td class="num">${x.n}</td><td class="num">${f0(x.wk)}</td><td class="num">${f0(x.pwk)}</td></tr>`).join("")}</tbody></table></div><p>From each roster's projected starter points per week for the rest of the season, using the same daily-lineup simulation as the draft tools.</p></div>`;
  return h}
function waiversView(){const w=S.seasonWeek??CUR_WEEK,my=myRoster(),fa=freeAgents(),base=weekProj(my,w).pts,baseRos=h2hValue(my).total,wks=Math.max(1,WEEKS.filter(x=>x.p[1]>=CUR_PERIOD).length);
  const full=my.length>=13,dropC=[...my].sort((a,b)=>a.projTot-b.projTot),drop=S.wDrop&&my.find(p=>p.id===S.wDrop)||dropC[0];
  const cands=[...fa].sort((a,b)=>b.projTot-a.projTot).slice(0,70).concat([...fa].sort((a,b)=>weekGames(b,w)*b.proj.fp-weekGames(a,w)*a.proj.fp).slice(0,30));
  const seen=new Set(),rows=cands.filter(p=>!seen.has(p.id)&&seen.add(p.id)).map(p=>{const R=full?my.filter(x=>x!==drop).concat([p]):my.concat([p]);
    return {p,wk:weekProj(R,w).pts-base,ros:(h2hValue(R).total-baseRos)/wks,g:weekGames(p,w),g2:weekGames(p,Math.min(WEEKS.length-1,w+1))}});
  const sortK=S.wSort||"wk";rows.sort((a,b)=>b[sortK]-a[sortK]);
  return `${falloutCard()}<div class="chart-card"><div class="row-btns" style="justify-content:space-between;align-items:center"><h4 style="margin:0">Waiver wire · ${fa.length} free agents on standard contracts</h4><div class="row-btns">${weekSelect("seasonWeek",w)}
      ${full?`<label class="chk" for="wDrop">Drop</label><select id="wDrop">${dropC.map(p=>`<option value="${p.id}" ${p===drop?"selected":""}>${esc(p.name)} (${f1(p.proj.fp)})</option>`).join("")}</select>`:""}
      <select id="wSort"><option value="wk" ${sortK==="wk"?"selected":""}>Sort: points this week (streaming)</option><option value="ros" ${sortK==="ros"?"selected":""}>Sort: rest-of-season value</option></select></div></div>
    <p class="empty" style="margin-top:6px">${full?`Your roster is full, so each pickup is scored as replacing ${esc(drop.name)} (your lowest rest-of-season value; change it above).`:`You have ${13-my.length} open roster spot${13-my.length===1?"":"s"}, so pickups are scored as adds.`} "This week" is the change in your projected starter points for week ${WEEKS[w].i}, after daily lineup limits. "Rest of season" is the change per week from now on, playoff weeks weighted as in your mix card.</p>
    <div class="tablebox"><table><thead><tr><th class="l">Player</th><th>Proj FP/G</th><th>Games this wk</th><th>Next wk</th><th>This week</th><th>Rest of season / wk</th><th>Playoff G</th><th title="Places gained or lost in the rest-of-season rank over the last 7 days">7-day move</th><th>Rostered</th><th></th></tr></thead><tbody>
    ${rows.slice(0,40).map((r,i)=>{const p=r.p;return `<tr><td class="l">${pBtn(p,i?"":"call")} <span class="mut">${p.team} · ${p.pos.join("/")}</span>${p.out?` <span class="chip out">Out ~${p.gamesOut}g</span>`:p.dtd?' <span class="chip dtd">GTD</span>':""}${p.hot?' <span class="chip hot">Hot</span>':""}</td><td class="num">${f1(p.proj.fp)}</td><td class="num">${r.g}</td><td class="num">${r.g2}</td>
      <td class="num ${r.wk>0?"zpos":"zneg"}">${r.wk>=0?"+":""}${f0(r.wk)}</td><td class="num ${r.ros>0?"zpos":"zneg"}">${r.ros>=0?"+":""}${f1(r.ros)}</td><td class="num">${p.poGames}</td><td class="num">${moveTag(moveOf(p,7),1)}</td><td class="num mut">${f0(p.own||0)}%</td><td><button class="btn mine" data-add="${p.id}">Add</button></td></tr>`}).join("")}</tbody></table></div>
    <p class="empty" style="margin-top:6px">Free agents are standard-contract players not on any roster in your league. "Rostered" is ESPN's share across all leagues. Add records the move in Rosters${full?` and drops ${esc(drop.name)}`:""}.</p></div>`}
const weekGames=(p,w)=>weekDays(w).filter(q=>p.daySet.has(q)).length;
function tradesView(){const teams=Object.keys(leagueRosters()).map(Number).filter(t=>t!==S.slot),T=S.tTeam&&teams.includes(S.tTeam)?S.tTeam:teams[0],my=myRoster(),their=rosterOf(T),give=new Set(S.tGive||[]),get=new Set(S.tGet||[]);
  const list=(ros,set,attr)=>`<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px">${[...ros].sort((a,b)=>b.projTot-a.projTot).map(p=>`<li><label class="chk" style="color:var(--ink)"><input type="checkbox" data-${attr}="${p.id}" ${set.has(p.id)?"checked":""}> ${esc(p.name)} <span class="mut">${p.pos.join("/")} · ${f1(p.proj.fp)} FP/G · ${Math.round(p.projGP)} g</span></label></li>`).join("")}</ul>`;
  let h=`<div class="chart-grid"><div class="chart-card"><h4>You give</h4>${list(my,give,"tgive")}</div><div class="chart-card"><h4><select id="tTeam">${teams.map(t=>`<option value="${t}" ${t===T?"selected":""}>${esc(teamName(t))}</option>`).join("")}</select> gives</h4>${list(their,get,"tget")}</div></div>`;
  if(give.size||get.size){const wks=Math.max(1,WEEKS.filter(x=>!x.po&&x.p[1]>=CUR_PERIOD).length);
    const after=(ros,out,inn)=>ros.filter(p=>!out.has(p.id)).concat(players.filter(p=>inn.has(p.id)));
    const mB=h2hValue(my),mA=h2hValue(after(my,give,get)),tB=h2hValue(their),tA=h2hValue(after(their,get,give));
    const d=(A,B)=>({wk:(A.reg-B.reg)/wks,po:(A.po-B.po)/4});const me=d(mA,mB),them=d(tA,tB);
    const verdict=me.wk>=5&&me.po>=-5?"Good for you":me.wk<=-5?"Bad for you":"Close to even for you";
    h+=`<div class="chart-card"><h4>Trade verdict: ${verdict}</h4><div class="kpis">
      <div class="kpi"><div class="k">You · per week</div><div class="v ${me.wk>=0?"zpos":"zneg"}">${me.wk>=0?"+":""}${f0(me.wk)}</div><div class="d">starter points, rest of regular season</div></div>
      <div class="kpi"><div class="k">You · playoff weeks</div><div class="v ${me.po>=0?"zpos":"zneg"}">${me.po>=0?"+":""}${f0(me.po)}</div><div class="d">per playoff week</div></div>
      <div class="kpi"><div class="k">${esc(teamName(T))} · per week</div><div class="v ${them.wk>=0?"zpos":"zneg"}">${them.wk>=0?"+":""}${f0(them.wk)}</div><div class="d">what they'd gain or lose</div></div>
      <div class="kpi"><div class="k">${esc(teamName(T))} · playoff weeks</div><div class="v ${them.po>=0?"zpos":"zneg"}">${them.po>=0?"+":""}${f0(them.po)}</div><div class="d">per playoff week</div></div></div>
      <p>Measured with the daily-lineup simulation, so it accounts for positions, schedules, injuries and who would actually start for each team. ${me.wk>0&&them.wk>0?"Both teams improve, so this one has a real chance of being accepted.":me.wk>0?"They'd lose value, so expect pushback.":"Look for a deal that helps both sides."}</p>
      <div class="row-btns"><button class="btn primary" id="tDo">Record this trade</button><button class="btn" id="tClear">Clear</button></div></div>`}
  else h+=`<p class="empty">Tick players on both sides to evaluate a trade.</p>`;
  return h}
function rostersView(){const L=leagueRosters(),fa=freeAgents();
  return `${!S.league?`<div class="chart-card"><h4>${S.picks.length&&!MOCK()?"These rosters come from your draft entries":"No rosters yet"}</h4><p style="font-size:13px">${S.picks.length&&!MOCK()?"Start the season to lock them in, then record adds, drops and trades here.":"Add players to each team below, or enter your draft on the Big Board first."}</p><div class="row-btns" style="margin-top:6px">${S.picks.length&&!MOCK()?'<button class="btn primary" id="seasonFromDraft">Start the season from my draft</button>':'<button class="btn primary" id="seasonEmpty">Start with empty rosters</button>'}</div></div>`:""}
    <datalist id="faList">${fa.sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.name)}">`).join("")}</datalist>
    <div class="ros-grid">${Object.keys(L).map(Number).map(t=>`<div class="chart-card"><h4>${t===S.slot?"You":esc(teamName(t))} <span class="mut" style="font-weight:400">· ${L[t].length}/13</span></h4><ul>${rosterOf(t).sort((a,b)=>b.projTot-a.projTot).map(p=>`<li><span>${pBtn(p)} <span class="mut">${p.pos.join("/")}</span></span>${S.league?`<button class="btn" data-drop="${t}:${p.id}" title="Drop">✕</button>`:""}</li>`).join("")||'<li class="mut">Empty</li>'}</ul>
      ${S.league?`<div class="row-btns" style="margin-top:8px"><input list="faList" data-addname="${t}" placeholder="Add a free agent…" style="flex:1;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:5px 8px"></div>`:""}</div>`).join("")}</div>
    ${S.league?'<div class="row-btns" style="margin-top:12px"><button class="btn" id="seasonReset">Reset rosters</button></div>':""}`}
let resetArmed=false;
function hookSeason(){const on=(id,ev,f)=>{const el=$(id);if(el)el[ev]=f};
  on("seasonFromDraft","onclick",startSeasonFromDraft);on("goRosters","onclick",()=>$("tab-rosters").click());
  on("seasonEmpty","onclick",()=>{const L={};for(let t=1;t<=S.teams;t++)L[t]=[];S.league=L;save();renderSeason("rosters")});
  on("seasonReset","onclick",e=>{if(!resetArmed){resetArmed=true;e.target.textContent="Click again to reset all rosters";setTimeout(()=>{resetArmed=false;if(e.target)e.target.textContent="Reset rosters"},3000);return}S.league=null;save();renderSeason("rosters");toast("Rosters reset")});
  on("seasonWeek","onchange",e=>{S.seasonWeek=+e.target.value;S.seasonOpp=null;save();renderSeason(!$("view-waivers").hidden?"waivers":"season")});
  on("seasonOpp","onchange",e=>{S.seasonOpp=+e.target.value;save();renderSeason("season")});
  on("wSort","onchange",e=>{S.wSort=e.target.value;save();renderSeason("waivers")});on("wDrop","onchange",e=>{S.wDrop=+e.target.value;save();renderSeason("waivers")});
  on("tTeam","onchange",e=>{S.tTeam=+e.target.value;S.tGet=[];save();renderSeason("trades")});on("tClear","onclick",()=>{S.tGive=[];S.tGet=[];save();renderSeason("trades")});
  on("tDo","onclick",()=>{const L=leagueRosters();if(!S.league)S.league=JSON.parse(JSON.stringify(L));const T=S.tTeam||Object.keys(S.league).map(Number).find(t=>t!==S.slot),g=new Set(S.tGive||[]),r=new Set(S.tGet||[]);
    S.league[S.slot]=S.league[S.slot].filter(id=>!g.has(id)).concat([...r]);S.league[T]=S.league[T].filter(id=>!r.has(id)).concat([...g]);S.tGive=[];S.tGet=[];save();toast("Trade recorded");renderSeason("trades")});
}
document.addEventListener("change",e=>{const t=e.target;if(t.dataset&&(t.dataset.tgive||t.dataset.tget)){const k=t.dataset.tgive?"tGive":"tGet",id=+(t.dataset.tgive||t.dataset.tget);S[k]=S[k]||[];if(t.checked)S[k].push(id);else S[k]=S[k].filter(x=>x!==id);save();renderSeason("trades")}
  if(t.dataset&&t.dataset.addname){const p=freeAgents().find(x=>x.name===t.value);if(!p){toast("Pick a free agent from the list");return}if(!S.league)S.league=JSON.parse(JSON.stringify(leagueRosters()));S.league[t.dataset.addname].push(p.id);save();toast(`Added ${p.name}`);renderSeason("rosters")}});
document.addEventListener("click",e=>{const b=e.target.closest("[data-add],[data-drop]");if(!b)return;
  if(!S.league)S.league=JSON.parse(JSON.stringify(leagueRosters()));
  if(b.dataset.drop){const [t,id]=b.dataset.drop.split(":").map(Number);S.league[t]=S.league[t].filter(x=>x!==id);save();toast(`Dropped ${players[id].name}`);renderSeason("rosters");return}
  const id=+b.dataset.add,my=S.league[S.slot]||[];if(my.length>=13){const drop=S.wDrop&&my.includes(S.wDrop)?S.wDrop:[...my].sort((a,b)=>players[a].projTot-players[b].projTot)[0];S.league[S.slot]=my.filter(x=>x!==drop);toast(`Added ${players[id].name}, dropped ${players[drop].name}`)}else toast(`Added ${players[id].name}`);
  S.league[S.slot].push(id);S.wDrop=null;save();renderSeason("waivers")});
// ================= PLAYER LAB =================
let openId=null;
function seriesChart(p){
  const W=560,H=230,m={l:40,r:16,t:22,b:40};
  const pts=p.hist.map(h=>({x:h.i,y:h.fp,tip:`${SEAS[h.i]}: ${f1(h.fp)} FP/G in ${h.gp} games`,lab:SEAS[h.i],gp:h.gp}));
  if(p.college)pts.push({x:2,y:fpOf(p.college),tip:`College 2025-26: ${f1(fpOf(p.college))} FP/G (college stats, before NBA translation)`,lab:"NCAA 25-26",gp:null});
  const now=p.now&&p.now.gp?p.nowFp:null,lo=Math.max(0,Math.min(p.lo,...pts.map(v=>v.y),...(now!=null?[now]:[]))-4),hi=Math.max(p.hi,...pts.map(v=>v.y),...(now!=null?[now]:[]))+4;
  const X=sx([-.4,3.4],[m.l,W-m.r]),Y=sx([lo,hi],[H-m.b,m.t]);let g="";
  ticks(lo,hi,4).forEach(t=>g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${t}</text>`);
  g+=`<rect class="band" x="${X(3)-16}" width="32" y="${Y(p.hi)}" height="${Y(p.lo)-Y(p.hi)}" rx="4"/>`;
  const real=pts.filter(v=>v.gp!==null);
  if(real.length>1)g+=`<path class="ln" d="${real.map((v,i)=>(i?"L":"M")+X(v.x)+" "+Y(v.y)).join(" ")}"/>`;
  const last=pts[pts.length-1];if(last)g+=`<path class="ln proj" d="M${X(last.x)} ${Y(last.y)} L${X(3)} ${Y(p.proj.fp)}"/>`;
  // this season so far, just left of the projection it feeds into
  if(now!=null)g+=`<circle cx="${X(2.72)}" cy="${Y(now)}" r="5" style="fill:var(--ink)" data-tip="2026-27 so far: ${f1(now)} FP/G in ${p.now.gp} games"/><text class="lbl" x="${X(2.72)-9}" y="${Y(now)+3}" text-anchor="end">${f1(now)}</text>`;
  pts.forEach(v=>g+=`<circle class="dot${v.gp===null?" hollow":""}" cx="${X(v.x)}" cy="${Y(v.y)}" r="5" data-tip="${esc(v.tip)}"/><text class="lbl" x="${X(v.x)}" y="${Y(v.y)-10}" text-anchor="middle">${f1(v.y)}</text>`);
  g+=`<circle class="dot hollow" cx="${X(3)}" cy="${Y(p.proj.fp)}" r="6" data-tip="2026-27 projection: ${f1(p.proj.fp)} FP/G (80% range ${f1(p.lo)}–${f1(p.hi)})"/><text class="lbl" x="${X(3)+20}" y="${Y(p.proj.fp)+3}">${f1(p.proj.fp)}</text>`;
  g+=`<text x="${X(3)+20}" y="${Y(p.hi)+3}">${f1(p.hi)}</text><text x="${X(3)+20}" y="${Y(p.lo)+3}">${f1(p.lo)}</text>`;
  const labs=["2023-24","2024-25",p.college?"NCAA 25-26":"2025-26","2026-27 proj"];
  labs.forEach((l,i)=>{const v=pts.find(q=>q.x===i);const sub=i===3?(now!=null?`${p.now.gp} GP so far · ~${Math.round(p.projGP)} left`:`~${Math.round(p.projGP)} GP left`):v&&v.gp?`${v.gp} GP`:i<3&&!v?(p.seasons[i]&&p.seasons[i].gp===0?"0 GP (injured)":"—"):"";
    g+=`<text x="${X(i)}" y="${H-m.b+16}" text-anchor="middle" class="lbl">${l}</text><text x="${X(i)}" y="${H-m.b+29}" text-anchor="middle">${sub}</text>`});
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fantasy points per game by season for ${esc(p.name)}">${g}</svg>`;
}
function gpChart(p){
  const W=560,H=120,m={l:40,r:16,t:16,b:24},X=sx([-.4,3.4],[m.l,W-m.r]),Y=sx([0,82],[H-m.b,m.t]);let g="";
  [0,41,82].forEach(t=>g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${t}</text>`);
  p.seasons.forEach((s,i)=>{if(!s)return;const v=Math.min(82,s.gp);g+=`<rect class="bar" x="${X(i)-14}" width="28" y="${Y(v)}" height="${Math.max(0,Y(0)-Y(v))}" rx="4" data-tip="${SEAS[i]}: ${s.gp} games"/><text class="lbl" x="${X(i)}" y="${Y(v)-4}" text-anchor="middle">${s.gp}</text>`});
  const pg=p.projGP+(82-REMAIN)*p.rate;
  g+=`<rect class="bar soft" x="${X(3)-14}" width="28" y="${Y(pg)}" height="${Y(0)-Y(pg)}" rx="4" data-tip="2026-27 projection: ~${Math.round(pg)} games (${Math.round(p.projGP)} of the ${REMAIN} remaining)"/><text class="lbl" x="${X(3)}" y="${Y(pg)-4}" text-anchor="middle">~${Math.round(pg)}</text>`;
  ["2023-24","2024-25","2025-26","2026-27 proj"].forEach((l,i)=>g+=`<text x="${X(i)}" y="${H-6}" text-anchor="middle">${l}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Games played by season">${g}</svg>`;
}
function histChart(p){
  const W=560,H=170,m={l:16,r:16,t:26,b:26},v=Array.from(p.sims),lo=Math.min(...v),hi=Math.max(...v),nb=28,bw=(hi-lo)/nb||1,bins=new Array(nb).fill(0);
  v.forEach(x=>bins[Math.min(nb-1,Math.floor((x-lo)/bw))]++);const mx=Math.max(...bins),X=sx([lo,hi],[m.l,W-m.r]),Y=sx([0,mx],[H-m.b,m.t]);let g="";
  bins.forEach((c,i)=>{const x=X(lo+i*bw),w=Math.max(1,X(lo+(i+1)*bw)-x-2);g+=`<rect class="bar" x="${x+1}" width="${w}" y="${Y(c)}" height="${Y(0)-Y(c)}" rx="2" data-tip="${f0(lo+i*bw)}–${f0(lo+(i+1)*bw)} FP: ${(c/NSIM*100).toFixed(1)}% of seasons"/>`});
  [["P10",p.q.p10],["Median",p.q.p50],["P90",p.q.p90]].forEach(([l,q])=>g+=`<line class="mk" x1="${X(q)}" x2="${X(q)}" y1="${m.t-4}" y2="${H-m.b}"/><text class="lbl" x="${X(q)}" y="${m.t-8}" text-anchor="middle">${l} ${f0(q)}</text>`);
  g+=`<line class="ax" x1="${m.l}" x2="${W-m.r}" y1="${H-m.b}" y2="${H-m.b}"/>`;
  ticks(lo,hi,5).forEach(t=>g+=`<text x="${X(t)}" y="${H-8}" text-anchor="middle">${f0(t)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of simulated season fantasy points">${g}</svg>`;
}
function catMini(p,k,label){
  const W=170,H=50,vals=p.hist.map(h=>({x:h.i,y:h.s[k]}));const pv=p.proj.line[k];
  const all=[...vals.map(v=>v.y),pv],lo=Math.min(...all),hi=Math.max(...all),X=sx([0,3],[6,W-6]),Y=sx([lo-(hi-lo)*.15-.05,hi+(hi-lo)*.15+.05],[H-6,6]);
  let g=vals.length>1?`<path class="ln" d="${vals.map((v,i)=>(i?"L":"M")+X(v.x)+" "+Y(v.y)).join(" ")}"/>`:"";
  const last=vals[vals.length-1];if(last)g+=`<path class="ln proj" d="M${X(last.x)} ${Y(last.y)} L${X(3)} ${Y(pv)}"/>`;
  vals.forEach(v=>g+=`<circle class="dot" cx="${X(v.x)}" cy="${Y(v.y)}" r="3.5" data-tip="${SEAS[v.x]}: ${f1(v.y)} ${label}"/>`);
  g+=`<circle class="dot hollow" cx="${X(3)}" cy="${Y(pv)}" r="3.5" data-tip="2026-27 projection: ${f1(pv)} ${label}"/>`;
  const prev=last?last.y:null,ch=prev?((pv-prev)/Math.max(prev,.1)*100):null;
  return `<div class="mini"><div class="k">${label}</div><div class="v">${prev!==null?f1(prev)+" → ":""}<b>${f1(pv)}</b>${ch!==null&&Math.abs(ch)>=3?` <span class="${(k==="tov"?-ch:ch)>0?"zpos":"zneg"}">${ch>0?"+":""}${Math.round(ch)}%</span>`:""}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} trend">${g}</svg></div>`;
}
function waterfall(p){
  const st=p.proj.steps.filter(([l])=>l!=="Health"||CTX[p.boardName]);let run=0;const vals=[];st.forEach(([l,v],i)=>{const from=i?run:0;run+=v;vals.push({l,v,from,to:run,first:i===0})});
  const hi=Math.max(...vals.map(v=>Math.max(v.from,v.to)))*1.05,X=x=>x/hi*100;
  const why={"Health":CTX[p.boardName]?CTX[p.boardName][1]:"","Team fit: usage":fitNote(p),"Team fit: minutes":minNote(p),
    "Minutes model":p.mm&&!p.mm.rookie?`${Math.round(MU*100)}% weight on per-minute production × projected minutes: ${f1(p.mm.rate*36)} FP/36 × ${f1(p.mm.mpg)} min = ${f1(p.mm.fpg)} FP/G.`:"",
    "ESPN projection":p.espnFp!=null?`${Math.round(MIX.espn*100)}% weight on ESPN's projection of ${f1(p.espnFp)} FP/G (backtest best: ${Math.round(OMEGA*100)}%).`:"",
    "2026-27 pace":p.now?`${p.now.gp} games at ${f1(p.nowFp)} FP/G in ${f1(p.now.min)} min. Weight ${pc(p.wCur)}: ${p.now.gp} games against ${f1(curK(MIX.cur))} games for half trust, set by your slider. His projected minutes move the same way, to ${f1(p.projMpg)}.`:"",
    "FantasyPros consensus":p.fpro?`Expert consensus rank #${p.fpro[0]} (best #${p.fpro[2]}, worst #${p.fpro[3]}), which matches ${f1(p.fproFp)} FP/G on this board. Weight ${pc(MIX.fpro)}.`:"",
    "Your adjustment":p.adj?(p.adj.o!=null?`You set him to ${f1(p.adj.o)} FP/G.`:`Your take: ${p.adj.m>0?"+":""}${Math.round(p.adj.m*100)}%.`):"",
    "ESPN projection (no NBA history)":"No NBA seasons yet, so ESPN's projected line is the starting point.",
    "Rookie prior (ESPN + draft position)":p.draft?`Half ESPN's projection (${p.rookEspnFp!=null?f1(p.rookEspnFp):"none"}) and half what rookies picked #${p.draft.pick} at his age have produced (${f1(p.rookDraftFp)} FP/G).`:"",
    "2026-27 games so far":p.now?`${p.now.gp} games at ${f1(fpOf(p.now))} FP/G, weighted against the starting point by sample size.`:"",
    "Breakout comps":p.comps?`${Math.round(LAM*100)}% weight on what his 10 closest comps did the next season (${p.comps.delta>=0?"+":""}${f1(p.comps.delta)} FP/G on average). The comps are listed below.`:""};
  const ageNote=`Average change at this age, after removing regression to the mean: ${(PRM.ageFit.a+PRM.ageFit.b*p.age>=0?"+":"")}${f1(PRM.ageFit.a+PRM.ageFit.b*p.age)} FP/G.`;
  return `<div class="wf">${vals.map(v=>{const a=Math.min(v.from,v.to),b=Math.max(v.from,v.to);
    const col=v.first?"var(--accent)":v.v>=0?"var(--ok)":"var(--bad)";
    const w=v.l.startsWith("Age")?ageNote:v.l.startsWith("Regression")?`Pulls ${p.proj.N?Math.round(p.proj.N):0} weighted games toward the pool average (${f1(MEANS.fp)} FP/G) with ${Math.round(PRM.K)} average games mixed in.`:v.l.startsWith("NBA")?`Fit on last year's rookies (n=${TR.n}).`:why[v.l]||"";
    return `<div class="wf-row"><span>${esc(v.l)}</span><div class="wf-track"><span style="left:${X(a)}%;width:${Math.max(.6,X(b)-X(a))}%;background:${col}"></span></div><span class="amt">${v.first?f1(v.v):(v.v>=0?"+":"")+f1(v.v)}</span>${w?`<div class="wf-why">${esc(w)}</div>`:""}</div>`}).join("")}
    <div class="wf-row" style="font-weight:600"><span>Projection</span><div class="wf-track"><span style="left:0;width:${X(p.proj.fp)}%;background:var(--ink)"></span></div><span class="amt">${f1(p.proj.fp)}</span></div></div>`;
}

function fitNote(p){const f=p.fit,T=f.team,b=BTALL.betaU;
  if(!b)return `Backtests across three seasons found that squeezing usage for crowded rosters didn't improve accuracy, so the usage effect is off (×${f.m.toFixed(2)}).`;
  return `${p.team}'s players project to use ${f1(T.useSum)} plays a game against a league average of ${f1(TEAMS.plays)}${f.moved?` (he joined from ${p.prevTeam})`:""}. The backtest-fit squeeze (strength ${b}) scales his scoring and playmaking ×${f.m.toFixed(2)}; stars give up less than role players.`}
function minNote(p){const f=p.fit,T=f.team,b=BTALL.betaM;
  if(!b)return `Backtests found the 240-minute cap didn't improve minutes predictions, so it is off. Projected ${f1(p.projMpg)} min/g.`;
  return `${p.team}'s rotation projects to ${f0(T.minSum)} minutes a game before the 240-minute cap (availability-weighted). With the backtest-fit strength of ${b}, his minutes go ${f1(p.mm.mpg)} → ${f1(p.projMpg)} (×${f.mMin.toFixed(2)}).`}
function seasonBars(vals,{W=560,H=130,max,proj,projLab,fmt=f1,tip}){const m={l:40,r:16,t:18,b:24},X=sx([-.4,3.4],[m.l,W-m.r]),hi=max||Math.max(...vals.filter(v=>v!==null),proj||0)*1.15,Y=sx([0,hi],[H-m.b,m.t]);let g="";
  ticks(0,hi,3).forEach(t=>g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${t}</text>`);
  vals.forEach((v,i)=>{if(v===null)return;g+=`<rect class="bar" x="${X(i)-14}" width="28" y="${Y(v)}" height="${Math.max(0,Y(0)-Y(v))}" rx="4" data-tip="${SEAS[i]}: ${fmt(v)} ${tip}"/><text class="lbl" x="${X(i)}" y="${Y(v)-4}" text-anchor="middle">${fmt(v)}</text>`});
  if(proj!=null)g+=`<rect class="bar soft" x="${X(3)-14}" width="28" y="${Y(proj)}" height="${Y(0)-Y(proj)}" rx="4" data-tip="${projLab}: ${fmt(proj)} ${tip}"/><text class="lbl" x="${X(3)}" y="${Y(proj)-4}" text-anchor="middle">${fmt(proj)}</text>`;
  ["2023-24","2024-25","2025-26","2026-27 proj"].forEach((l,i)=>g+=`<text x="${X(i)}" y="${H-6}" text-anchor="middle">${l}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tip)} by season">${g}</svg>`}
function minutesSection(p){
  const mins=p.seasons.map(s=>s&&s.gp>0&&s.min?s.min:null),f36=p.seasons.map(s=>s&&s.gp>0&&s.min?fpOf(s)/s.min*36:null);
  const rk=[...players].sort((a,b)=>b.fp36-a.fp36).findIndex(x=>x.id===p.id)+1,at34=p.fp36/36*34;
  return `<div class="pgrid">
    <div class="kpi"><div class="k">Proj minutes</div><div class="v">${f1(p.projMpg)}</div><div class="d">${p.lastMpg?`${f1(p.lastMpg)} last season (${p.projMpg-p.lastMpg>=0?"+":""}${f1(p.projMpg-p.lastMpg)})`:"rookie estimate"}</div></div>
    <div class="kpi"><div class="k">Proj FP per 36</div><div class="v">${f1(p.fp36)}</div><div class="d">#${rk} of ${players.length}${p.fp36Last?` · ${f1(p.fp36Last)} last season`:""}</div></div>
    <div class="kpi"><div class="k">FP per 100 poss</div><div class="v">${f1(p.per100("fp"))}</div><div class="d">${p.team} pace ≈ ${pace(p.team)}</div></div>
    <div class="kpi"><div class="k">At 34 minutes</div><div class="v">${f1(at34)}</div><div class="d">FP/G if his role grew to 34 min</div></div></div>
  <div style="margin-top:10px"><div class="eq mut" style="font-size:12px">Minutes per game</div>${seasonBars(mins,{max:40,proj:p.projMpg,projLab:"2026-27 projection",tip:"min/g"})}</div>
  <div style="margin-top:6px"><div class="eq mut" style="font-size:12px">Fantasy points per 36 minutes</div>${seasonBars(f36,{proj:p.fp36,projLab:"2026-27 projection",tip:"FP/36"})}</div>
  <p class="empty" style="margin-top:6px">Per 100 possessions: ${["pts","reb","ast","stl","blk","tpm"].map(k=>`${f1(p.per100(k))} ${({pts:"pts",reb:"reb",ast:"ast",stl:"stl",blk:"blk",tpm:"3pm"})[k]}`).join(" · ")}. ${p.mm.rookie?"Rookie minutes assume league-average production per minute, so they follow from his projected FP/G.":`The minutes model alone says ${f1(p.mm.fpg)} FP/G (${f1(p.mm.rate*36)} FP/36 × ${f1(p.mm.mpg)} min).`}</p>`;
}
function compsSection(p){
  if(!p.comps)return `<p class="empty">${p.rook?"Rookies have no NBA seasons to match, so the projection uses the college translation instead.":"Fewer than 25 games last season, so there's no reliable profile to match. The projection uses the base model only."}</p>`;
  const c=p.comps,f=p.feat;
  return `<div class="pgrid"><div class="kpi"><div class="k">Breakout odds</div><div class="v">${pc(c.brk)}</div><div class="d">calibrated (raw comps ${pc(c.rawBrk)}) · base rate ${pc(BRK_BASE)}</div></div>
    <div class="kpi"><div class="k">Comps' next season</div><div class="v">${c.delta>=0?"+":""}${f1(c.delta)}</div><div class="d">FP/G change, ±${f1(c.sd)} spread</div></div>
    <div class="kpi"><div class="k">His profile</div><div class="v">${f1(f.fp)}</div><div class="d">FP/G at ${f.age}${f.trend!==null?` · trend ${f.trend>=0?"+":""}${f1(f.trend)}`:""} · usage ${f1(f.use)}</div></div></div>
  <div class="tablebox" style="margin-top:10px"><table><thead><tr><th class="l">Comparable season</th><th>Age</th><th>FP/G</th><th>Next</th><th>Change</th></tr></thead><tbody>
  ${c.list.slice(0,8).map(x=>{const r=x.r;return `<tr><td class="l">${pBtn(r.p)} <span class="mut">${sh(r.t)}→${sh(r.t+1)}</span> ${r.brk?'<span class="chip hot">Breakout</span>':""}</td><td class="num">${r.f.age}</td><td class="num">${f1(r.f.fp)}</td><td class="num">${f1(r.next)}</td><td class="num ${r.d>=0?"zpos":"zneg"}">${r.d>=0?"+":""}${f1(r.d)}</td></tr>`}).join("")}
  </tbody></table></div><p class="empty" style="margin-top:6px">Matched on age, production, prior-year trend, usage, assists and rebounds. A breakout is +${BRK.min} FP/G and +${Math.round(BRK.rel*100)}% the next season.</p>`;
}
function teamSection(p){
  const ros=[...(TEAMS.rosterNew[p.team]||[])].filter(r=>r.minNew>=6).sort((a,b)=>b.minNew-a.minNew);const W=560,rh=21,H=ros.length*rh+8,X=sx([0,40],[160,W-70]);
  let g="";ros.forEach((r,i)=>{const y=4+i*rh,me=r.id===p.id;g+=`<text x="154" y="${y+14}" text-anchor="end" class="${me?"lbl":""}">${esc(r.name)}</text><rect class="${me?"bar":"bar2"}" x="160" y="${y+3}" height="14" width="${Math.max(2,X(r.minNew)-160)}" rx="3" data-tip="${esc(r.name)}: ${f1(r.minNew)} projected min/g, ${Math.round(r.a*100)}% availability${r.moved?" · new to the team":r.rook?" · rookie":""}"/><text x="${X(r.minNew)+6}" y="${y+14}">${f1(r.minNew)}${r.moved||r.rook?" · new":""}</text>`});
  return `<p class="empty" style="margin:0 0 8px">${esc(minNote(p))} ${esc(fitNote(p))}</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected minutes on ${p.team}">${g}</svg><p class="empty" style="margin-top:6px">Projected minutes per game for everyone who has played for ${p.team} this season, plus injured board players. Bars are after the 240-minute cap.</p>`;
}
function espnSection(p){const e=p.espnProj,l=p.proj.line,row=(lab,x)=>x?`<tr><td class="l">${lab}</td>${["gp","min","pts","reb","ast","stl","blk","tpm","tov"].map(k=>`<td class="num">${k==="gp"?Math.round(x[k]||0):f1(x[k]||0)}</td>`).join("")}<td class="num fp">${f1(fpOf(x))}</td></tr>`:"";
  return `${p.inj?`<p style="margin:0 0 8px"><span class="chip ${p.inj.status==="Out"?"out":"dtd"}">${esc(p.inj.status)}</span> ${esc(p.inj.short)} ${`<span class="mut">${retText(p.inj.ret,p.inj.fs,"Expected back about ").replace(/^o/,"O").replace(/^n/,"N")}${p.gamesOut?` (~${p.gamesOut} games)`:""}.</span>`}</p>`:""}
  <div class="tablebox"><table><thead><tr><th class="l"></th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>3PM</th><th>TO</th><th>FP/G</th></tr></thead><tbody>
  ${row("ESPN projection",e)}${row("This model",{...l,gp:p.projGP+(82-REMAIN)*p.rate,min:p.projMpg})}${p.now?row("2026-27 so far",p.now):""}</tbody></table></div>
  <div class="pgrid" style="margin-top:10px"><div class="kpi"><div class="k">ADP</div><div class="v">${p.adp?f1(p.adp):"–"}</div><div class="d">average ESPN draft spot</div></div>
    <div class="kpi"><div class="k">Auction value</div><div class="v">$${f0(p.auc||0)}</div><div class="d">average in ESPN auctions</div></div>
    <div class="kpi"><div class="k">Rostered</div><div class="v">${f0(p.own||0)}%</div><div class="d">of ESPN leagues</div></div></div>
  <p style="margin:10px 0 0;font-size:13px">${esc(p.outlook||"No ESPN outlook yet.")}</p><p class="empty" style="margin-top:4px">Outlook and projection from ESPN Fantasy, fetched ${FETCHED}.</p>`}
function rookieSection(p){const b=ROOK.band(p.draft.pick);
  return `<div class="dr-sec"><h3>Rookie outlook · pick #${p.draft.pick}</h3><div class="pgrid">
    <div class="kpi"><div class="k">Draft-position model</div><div class="v">${f1(p.rookDraftFp)}</div><div class="d">FP/G for pick #${p.draft.pick} at age ${p.age}</div></div>
    <div class="kpi"><div class="k">ESPN projection</div><div class="v">${p.rookEspnFp!=null?f1(p.rookEspnFp):"–"}</div><div class="d">ESPN over-projected 2025-26 rookies by 1.6 on average</div></div>
    <div class="kpi"><div class="k">Rookies at picks ${b.lo}–${b.hi}</div><div class="v">${pc(b.played)}</div><div class="d">played 20+ games · median ${f1(b.med)} FP/G (middle half ${f1(b.q25)}–${f1(b.q75)})</div></div></div>
    <p class="empty" style="margin-top:6px">His starting point is ${Math.round(ROOK_W*100)}% the draft-position model and ${Math.round((1-ROOK_W)*100)}% ESPN, the mix that best predicted last year's rookies. His 2026-27 games then move it, and his games-played rate starts from how often rookies at this pick actually played (${pc(b.gpr)} of games).</p></div>`}
// ================= PLAYER PROFILE: recent games, insights, schedule, news, advanced profile, comparisons =================
const GAMES_=typeof GAMES!=="undefined"?GAMES:{};
// recent games as stat lines with fantasy points (newest first); a row with only date and opponent is a game he missed
function gamesOf(p){return (GAMES_[p.espnId]||[]).map(r=>{const [date,opp,min,pts,reb,ast,stl,blk,tpm,tov,fgm,fga,ftm,fta]=r;
  if(r.length<3)return {date,opp,dnp:true};const l={pts,reb,ast,stl,blk,tpm,tov,fgm,fga,ftm,fta};return {date,opp,min,...l,fp:fpOf(l)}})}
const gDate=d=>new Date(d+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"});
const SEASON_END=WEEKS[WEEKS.length-1].e,retText=(ret,fs,pre="back ~")=>fs==="OFS"||(ret&&ret>SEASON_END)?"out for the season":ret&&ret>=FETCHED?pre+gDate(ret):"no return date yet";
const retLabel=p=>p.inj?retText(p.inj.ret,p.inj.fs,"expected back about "):"no return date yet";
// this season's games only: form and minutes insights shouldn't mix in last April
// ASOF: the scorecard replays predictions as of an earlier date (tools/log_preds.js); null in the app
let ASOF=null;const SEASON_GAMES=p=>gamesOf(p).filter(g=>!g.dnp&&g.date>=PERIOD0&&(!ASOF||g.date<ASOF));
// the most recent season with enough games to describe him: this season once he has 10 games, otherwise last season
function baseSeason(p){if(p.now&&p.now.gp>=10)return p.now;for(let i=p.seasons.length-1;i>=0;i--){const s=p.seasons[i];if(s&&s.gp>=10)return s}return p.now&&p.now.gp?p.now:null}
function recentSection(p){const G=gamesOf(p);if(!G.length)return '<p class="empty">No NBA games on record yet.</p>';
  const played=G.filter(g=>!g.dnp),last5=played.slice(0,5),avg5=last5.length?mean(last5.map(g=>g.fp)):null,base=baseSeason(p),bfp=base?fpOf(base):null;
  const W=560,H=170,L=34,R=8,T=12,B=26,ord=[...G].reverse(),n=ord.length,bw=(W-L-R)/n,mx=Math.max(10,...played.map(g=>g.fp),p.proj.fp,bfp||0)*1.1,Y=v=>T+(H-T-B)*(1-Math.max(0,v)/mx);
  const ticks=[0,mx/2,mx].map(v=>Math.round(v/5)*5);
  let g=ticks.map(v=>`<line class="gr" x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L-6}" y="${Y(v)+3}" text-anchor="end">${v}</text>`).join("");
  ord.forEach((x,i)=>{const cx=L+i*bw+bw/2;g+=x.dnp?`<text x="${cx}" y="${H-B-4}" text-anchor="middle">DNP</text>`:`<rect class="${x.date<"2026-10-01"?"bar2":"bar"}" x="${cx-bw*.32}" width="${bw*.64}" y="${Y(x.fp)}" height="${Y(0)-Y(x.fp)}" rx="2" data-tip="${gDate(x.date)} ${x.opp}: ${f1(x.fp)} FP in ${Math.round(x.min)} min"/>`;
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${gDate(x.date)}</text>`});
  g+=`<line class="ln proj" x1="${L}" x2="${W-R}" y1="${Y(p.proj.fp)}" y2="${Y(p.proj.fp)}"/><text class="lbl" x="${W-R}" y="${Y(p.proj.fp)-4}" text-anchor="end">projection ${f1(p.proj.fp)}</text>`;
  const row=x=>x.dnp?`<tr class="mut"><td class="l">${gDate(x.date)}</td><td class="l">${x.opp}</td><td class="l" colspan="9">Did not play</td></tr>`:`<tr><td class="l">${gDate(x.date)}</td><td class="l">${x.opp}</td><td class="num">${Math.round(x.min)}</td><td class="num">${x.pts}</td><td class="num">${x.reb}</td><td class="num">${x.ast}</td><td class="num">${x.stl}</td><td class="num">${x.blk}</td><td class="num">${x.tpm}</td><td class="num">${x.fgm}-${x.fga}</td><td class="num fp">${f1(x.fp)}</td></tr>`;
  const split=G.some(x=>x.date<"2026-10-01")&&G.some(x=>x.date>="2026-10-01");
  return `<div class="pgrid"><div class="kpi"><div class="k">Last ${last5.length} games</div><div class="v">${avg5!=null?f1(avg5):"–"}</div><div class="d">FP/G${avg5!=null?` · ${avg5>=p.proj.fp?"+":"−"}${f1(Math.abs(avg5-p.proj.fp))} vs projection`:""}</div></div>
    <div class="kpi"><div class="k">${base?SEASON_LONG(base.y):"Season"}</div><div class="v">${bfp!=null?f1(bfp):"–"}</div><div class="d">FP/G in ${base?base.gp:0} games</div></div>
    <div class="kpi"><div class="k">Minutes, last 5</div><div class="v">${last5.length?f1(mean(last5.map(x=>x.min))):"–"}</div><div class="d">${base?`${f1(base.min)} in ${SEASON_LONG(base.y)}`:""}</div></div></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fantasy points in each of his last ${n} team games" style="margin-top:10px">${g}</svg>
    <p class="empty">${split?"Darker bars are this season, lighter bars last season. ":""}Fantasy points in each of his team's last ${n} games, oldest on the left.</p>
    <div class="tablebox" style="margin-top:8px"><table><thead><tr><th class="l">Date</th><th class="l">Opp</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th><th>3PM</th><th>FG</th><th>FP</th></tr></thead><tbody>${G.map(row).join("")}</tbody></table></div>`}
// short, ranked observations; each is only shown when the gap is big enough to matter
function insightsOf(p){const out=[],add=(w,k,t)=>out.push({w:Math.min(w,9),k,t}),G=p.out?[]:SEASON_GAMES(p).slice(0,5),base=baseSeason(p),prev=p.seasons.filter(s=>s&&s.gp>=20).slice(-2);
  const rl=retLabel(p),gone=p.out&&rl==="out for the season";
  if(p.out||p.dtd)out.push({w:10,k:"warn",t:`<b>${gone?"Out for the season":`${p.out?"Out":"Day-to-day"}, ${rl}`}.</b> ${p.inj?esc(p.inj.short):""}${p.out&&!gone&&p.teamLeft-p.avail>0?` That's about ${p.teamLeft-p.avail} games missed.`:""}`});
  if(G.length>=3){const a=mean(G.map(g=>g.fp)),d=a/p.proj.fp-1;if(Math.abs(d)>=.15)add(6+Math.abs(d)*10,d>0?"good":"warn",`<b>${d>0?"Running hot":"Running cold"}:</b> ${f1(a)} FP/G over his last ${G.length} games this season, ${pc(Math.abs(d))} ${d>0?"above":"below"} his ${f1(p.proj.fp)} projection.${d>0?" Hot streaks usually cool off, so the projection only moves part of the way.":" Slumps usually recover unless his role changed."}`)}
  if(G.length>=3&&base&&base.min){const m=mean(G.map(g=>g.min)),d=m-base.min;if(Math.abs(d)>=3)add(5+Math.abs(d)/2,d>0?"good":"warn",`<b>Minutes ${d>0?"up":"down"}:</b> ${f1(m)} a game this season against ${f1(base.min)} in ${SEASON_LONG(base.y)}. Minutes drive fantasy points more than anything else.`)}
  if(p.adp&&p.modelRank){const d=p.adp-p.modelRank;if(Math.abs(d)>=12)add(4+Math.abs(d)/10,d>0?"good":"",`<b>${d>0?"Value pick":"Priced high"}:</b> the model ranks him #${p.modelRank}, but ESPN drafters take him around pick ${f0(p.adp)}.`)}
  if(p.espnFp!=null&&Math.abs(p.fitFp-p.espnFp)>=3)add(3.5,"",`<b>Model and ESPN disagree:</b> the model's own projection is ${f1(p.fitFp)} FP/G, ESPN's is ${f1(p.espnFp)}. Your mix card sets how much each counts.`);
  if(p.brk!=null&&p.brk>=.25)add(4+p.brk*5,"good",`<b>Breakout candidate:</b> ${pc(p.brk)} of his closest historical comparisons jumped 6+ FP/G the next season.`);
  if(p.proj.fp>0&&(p.hi-p.lo)/p.proj.fp>=.5)add(3,"",`<b>Wide range:</b> his 80% range runs ${f1(p.lo)} to ${f1(p.hi)} FP/G, so he's a bigger bet than his average suggests.`);
  const poAvg=PO_AVG();if(Math.abs(p.poGames-poAvg)>=2)add(3,p.poGames>poAvg?"good":"warn",`<b>Playoff schedule:</b> ${p.poGames} games in your fantasy playoffs (Mar 15–Apr 11), against ${f1(poAvg)} for a typical player.`);
  const l=p.proj.line,st=(l.stl*SC.stl+l.blk*SC.blk)/Math.max(1,p.proj.fp);if(st>=.2)add(2.5,"good",`<b>Defensive points:</b> steals and blocks make up ${pc(st)} of his fantasy points. They're worth 4 each, so this is a steady source.`);
  const sh=full(l),eff=sh.fgm*SC.fgm+sh.fga*SC.fga+sh.ftm*SC.ftm+sh.fta*SC.fta;if(eff<=-3)add(2.5,"warn",`<b>Inefficient shooting costs him</b> about ${f1(-eff)} FP/G: misses count against you in points leagues.`);
  if(prev.length===2&&prev[0].usg&&prev[1].usg&&Math.abs(prev[1].usg-prev[0].usg)>=3)add(2,"",`<b>Role ${prev[1].usg>prev[0].usg?"grew":"shrank"}:</b> usage (the share of team plays he finishes while on the floor) went from ${f1(prev[0].usg)}% to ${f1(prev[1].usg)}% in ${SEASON_LONG(prev[1].y)}.`);
  if(p.age>=33)add(2,"warn",`<b>Age ${p.age}:</b> the age curve starts taking points off at this stage; it's already in his projection.`);
  return gone?out.filter(x=>x.w===10):out.sort((a,b)=>b.w-a.w).slice(0,6)}
let PO_AVG_=null;const PO_AVG=()=>PO_AVG_??(PO_AVG_=mean(players.filter(q=>q.projTot>0).map(q=>q.poGames)));
// games per matchup week for the next few weeks and the playoffs, against the league's typical count
function scheduleSection(p){const w0=Math.max(0,CUR_WEEK),ws=WEEKS.map((w,i)=>i).filter(i=>i>=w0&&!WEEKS[i].po).slice(0,5),teams=Object.keys(SCHED);
  const avg=i=>mean(teams.map(t=>SCHED[t].filter(q=>q>=Math.max(WEEKS[i].p[0],CUR_PERIOD)&&q<=WEEKS[i].p[1]).length));
  const cell=i=>{const g=weekGames(p,i),a=avg(i),k=g>=a+.6?"ok":g<=a-.6?"high":"";const w=WEEKS[i];return `<div class="wk ${k?"wk-"+k:""}"><div class="k">${w.po?"Playoffs":"Week "+w.i}</div><div class="v">${g}</div><div class="d">${gDate(w.s)}–${gDate(w.e).replace(/^[A-Za-z]+ /,"")} · avg ${f1(a)}</div></div>`};
  return `<div class="wkrow">${ws.map(cell).join("")}<div class="wk ${p.poGames>=PO_AVG()+1?"wk-ok":p.poGames<=PO_AVG()-1?"wk-high":""}"><div class="k">Fantasy playoffs</div><div class="v">${p.poGames}</div><div class="d">Mar 15–Apr 11 · avg ${f1(PO_AVG())}</div></div></div>
    <p class="empty">Games he's expected to play in each matchup week (injuries included). Green is more than a typical player, red is fewer.</p>${nextSection(p)}`}
function nextSection(p){const N=nextGames(p,5),grp=GROUP_NAME[posGroup(p)];if(!N.length)return "";
  const vs=g=>g.vs?`${g.vs[1]>=100?"+":"−"}${Math.abs(g.vs[1]-100)}% <span class="mut">(${g.vs[0]}g)</span>`:'<span class="mut">—</span>';
  return `<h4 style="margin:14px 0 6px">Next games</h4><div style="overflow-x:auto"><table style="min-width:440px"><thead><tr><th>Date</th><th>Opp</th><th title="Recent form: his games this season, latest counting most, pulled toward his preseason projection">Form</th><th title="Change from teammates who are out (or back) for that game, beyond what his recent form already includes">Teammates</th><th title="How this defense treats ${grp}: fantasy points allowed vs what those players usually score">Defense</th><th>Expected</th><th title="8 in 10 games land in this range">Range</th><th title="His games against this team over the last two seasons, vs what he was expected to score. Shown for reference only">Vs them</th></tr></thead>
    <tbody>${N.map((g,i)=>`<tr><td>${gDate(g.date)}</td><td>${g.o}${g.b2b?' <span class="zneg" title="Second night of a back-to-back">b2b</span>':""}</td><td>${f1(g.base)}</td><td>${Math.abs(g.mate.adj)>=.3?`<span class="${g.mate.adj>0?"zpos":"zneg"}" title="${esc(g.mate.list.filter(m=>Math.abs(m.x)>=.3).map(m=>`${m.q.name} ${m.out?"out":"playing"}: ${m.x>0?"+":"−"}${f1(Math.abs(m.x))}`).join("; "))}">${g.mate.adj>0?"+":"−"}${f1(Math.abs(g.mate.adj))}</span>`:'<span class="mut">—</span>'}</td><td>${pctTag(g.f)}</td>${g.out?'<td colspan="2" class="zneg">expected out</td>':`<td>${i===N.findIndex(x=>!x.out)?`<b class="call">${f1(g.fp)}</b>`:`<b>${f1(g.fp)}</b>`}</td><td class="mut">${f0(g.lo)}–${f0(g.hi)}</td>`}<td>${vs(g)}</td></tr>`).join("")}</tbody></table></div>
    <p class="empty">Expected = (form + teammates) × how this defense treats ${grp} × home court (±${Math.round(MP.hm*100)}%, @ = away) × back-to-back (b2b, −${Math.round(MP.b2*100)}%). Vs them is his record against that team over two seasons compared with what he was expected to score. It is shown but not used: across two seasons it didn't make predictions better, because a handful of games against one team is mostly noise.</p>`}
// with and without teammates: his own splits, and who gains when he sits
function matesSection(p){const d=PDATE(CUR_PERIOD),me=mateAdj(p,d,formBase(p)).list.filter(m=>m.nO>=1||m.out).sort((a,b)=>b.dl-a.dl);
  const gain=players.filter(q=>q.team===p.team&&q!==p).map(q=>({q,m:mateAdj(q,d,formBase(q)).list.find(m=>m.q===p)})).filter(x=>x.m).sort((a,b)=>b.m.dl-a.m.dl).slice(0,6);
  const row=(who,m)=>`<tr><td class="l">${pBtn(who)}${m.out?' <span class="chip out">out</span>':""}</td><td>${m.nW}</td><td>${m.fW!=null?f1(m.fW):dash}</td><td>${m.nO}</td><td>${m.fO!=null?f1(m.fO):dash}</td><td class="mut">${m.mW!=null&&m.mO!=null?cpos(m.mO-m.mW):dash}</td><td><b>${cpos(m.dl)}</b></td></tr>`;
  const head=`<thead><tr><th class="l">Teammate</th><th title="Games with him, this season and last (when they were teammates)">With</th><th>FP/G</th><th>Without</th><th>FP/G</th><th title="Minutes per game without him minus with him, this season">Min</th><th title="Expected change in fantasy points per game while he sits: the redistribution rule, moved toward the actual split as games pile up">Model</th></tr></thead>`;
  if(!me.length&&!gain.length)return '<p class="empty">No regular teammate has missed games with him yet.</p>';
  return `${me.length?`<h4 style="margin:0 0 6px">When a teammate sits</h4><div style="overflow-x:auto"><table style="min-width:420px">${head}<tbody>${me.slice(0,6).map(m=>row(m.q,m)).join("")}</tbody></table></div>`:""}
    ${gain.length?`<h4 style="margin:14px 0 6px">When he sits, who gains</h4><div style="overflow-x:auto"><table style="min-width:420px">${head.replace(">Teammate<",">Player<").replace(/with him/g,"with "+esc(p.name.split(" ").pop())).replace(/he sits/g,"he sits")}<tbody>${gain.map(x=>row(x.q,x.m)).join("")}</tbody></table></div>`:""}
    <p class="empty">Raw splits swing a lot on a few games, so the model starts from a rule (about ${Math.round(MP.beta*100)}% of a missing regular's production goes to teammates, in proportion to their roles) and moves toward the actual split as games pile up: ${MP.Km} games without him would count as much as the rule.</p>`}
function newsSection(p){const N=ESPN_NEWS.filter(a=>a.tags.includes(p.name)).sort((a,b)=>String(b.p).localeCompare(String(a.p))).slice(0,5);
  return `${p.inj?`<p style="margin:0 0 8px"><span class="chip ${p.inj.status==="Out"?"out":"dtd"}">${esc(p.inj.status)}</span> ${esc(p.inj.short)}</p>`:""}
    ${N.length?`<div class="news">${N.map(a=>`<div class="item"><div class="h">${esc(a.h)}</div><p>${esc(a.d)}</p><div class="src"><span class="mut">${gDate(String(a.p).slice(0,10))}</span> · <a href="${a.u}" target="_blank" rel="noopener">ESPN ↗</a></div></div>`).join("")}</div>`:`<p class="empty">No headlines about him in today's ESPN feed.</p>`}
    ${p.outlook?`<p style="margin:10px 0 0"><b>ESPN outlook.</b> ${esc(p.outlook)}</p>`:""}
    <p class="src" style="margin-top:8px;font-size:12px"><a href="https://www.espn.com/nba/player/_/id/${p.espnId}" target="_blank" rel="noopener">Full ESPN player page ↗</a></p>`}
// advanced profile: percentiles against players at his position (guards, forwards or centers) with 15+ games and 15+ minutes
const ADV=[["usg","Usage rate","share of team plays he finishes",s=>s.usg],["ts","True shooting","scoring efficiency, free throws and threes included",s=>s.ts!=null?s.ts*100:null],["bpm","Box plus-minus","points per 100 possessions added vs an average player",s=>s.bpm],
  ["p36","Points per 36 min","",s=>s.pts/s.min*36],["r36","Rebounds per 36","",s=>s.reb/s.min*36],["a36","Assists per 36","",s=>s.ast/s.min*36],["d36","Steals + blocks per 36","",s=>(s.stl+s.blk)/s.min*36],
  ["t36","3-point attempts per 36","",s=>s.tpa!=null?s.tpa/s.min*36:null],["to36","Turnovers per 36","lower is better",s=>s.tov/s.min*36,1],["fpm","Fantasy points per minute","",s=>fpOf(s)/s.min],["min","Minutes per game","",s=>s.min]];
const posGroup=p=>p.dp===5?"C":p.dp>=3?"F":"G",GROUP_NAME={G:"guards",F:"forwards",C:"centers"};let ADV_POP=null;
function advPop(){if(ADV_POP)return ADV_POP;ADV_POP={G:{},F:{},C:{}};players.forEach(q=>{const s=baseSeason(q);if(!s||s.gp<15||s.min<15)return;const g=posGroup(q);ADV.forEach(([k,,,f])=>{const v=f(s);if(v!=null&&isFinite(v))(ADV_POP[g][k]=ADV_POP[g][k]||[]).push(v)})});
  Object.values(ADV_POP).forEach(o=>Object.values(o).forEach(a=>a.sort((x,y)=>x-y)));return ADV_POP}
function advSection(p){const s=baseSeason(p);if(!s||!s.min)return '<p class="empty">Not enough NBA minutes yet for an advanced profile.</p>';
  const pop=advPop()[posGroup(p)],rows=ADV.map(([k,lab,sub,f,inv])=>{const v=f(s),a=pop[k];if(v==null||!isFinite(v)||!a||!a.length)return "";let lo=0;while(lo<a.length&&a[lo]<v)lo++;let pr=lo/a.length;if(inv)pr=1-pr;const P=Math.round(pr*100),c=P>=70?"var(--ok)":P<=30?"var(--bad)":"var(--accent)";
    return `<div class="wf-row"><span>${lab}${sub?`<br><span class="mut" style="font-size:11px">${sub}</span>`:""}</span><div class="wf-track" data-tip="${P}th percentile among ${GROUP_NAME[posGroup(p)]}"><span style="left:0;width:${Math.max(2,P)}%;background:${c};opacity:.85"></span><span style="left:50%;width:1px;background:var(--muted)"></span></div><span class="amt">${k==="ts"||k==="usg"?f1(v)+"%":k==="fpm"?v.toFixed(2):f1(v)} <span class="mut">${P}</span></span></div>`}).join("");
  return `<div class="wf">${rows}</div><p class="empty">${SEASON_LONG(s.y)}, ${s.gp} games. Bars show his percentile among ${GROUP_NAME[posGroup(p)]} with 15+ games and 15+ minutes (right-hand number); the middle line is average. Usage, true shooting and box plus-minus come from Basketball Reference.</p>`}
// where his projected fantasy points come from, per game
function sourcesSection(p){const l=full(p.proj.line),S0=[["Points",l.pts*SC.pts],["Rebounds",l.reb*SC.reb],["Assists",l.ast*SC.ast],["Steals",l.stl*SC.stl],["Blocks",l.blk*SC.blk],["Threes",l.tpm*SC.tpm],["Shooting (makes − misses)",l.fgm*SC.fgm+l.fga*SC.fga+l.ftm*SC.ftm+l.fta*SC.fta],["Turnovers",l.tov*SC.tov]],mx=Math.max(1,...S0.map(x=>Math.abs(x[1])));
  return `<div class="wf">${S0.map(([lab,v])=>`<div class="wf-row"><span>${lab}</span><div class="wf-track"><span style="left:${v>=0?50:50-Math.abs(v)/mx*50}%;width:${Math.abs(v)/mx*50}%;background:${v>=0?"var(--ok)":"var(--bad)"}"></span><span style="left:50%;width:1px;background:var(--muted)"></span></div><span class="amt">${v>=0?"+":"−"}${f1(Math.abs(v))}</span></div>`).join("")}</div>
    <p class="empty">Projected fantasy points per game from each stat, using your league's scoring. They add up to ${f1(fpOf(l))}.</p>`}
// comparisons: side by side with any player, plus the closest alternatives at his positions right now
let CMP={};
function similarTo(p,n=5){return players.filter(q=>q!==p&&q.pos.some(x=>p.pos.includes(x))).map(q=>({q,d:Math.abs(q.proj.fp-p.proj.fp)/3+Math.abs(q.age-p.age)/6+Math.abs(Math.log((q.projGP+1)/(p.projGP+1)))*2})).sort((a,b)=>a.d-b.d).slice(0,n).map(x=>x.q)}
function compareSection(p){const q=players[CMP[p.id]]||similarTo(p,1)[0];if(!q)return "";const A=gamesOf(p).filter(g=>!g.dnp).slice(0,5),B=gamesOf(q).filter(g=>!g.dnp).slice(0,5),sa=baseSeason(p),sb=baseSeason(q);
  const rows=[["Projected FP/G",p.proj.fp,q.proj.fp,f1],["80% range",p.lo,q.lo,(v,x)=>`${f1(v)}–${f1(x===p?p.hi:q.hi)}`,0,1],["Projected games",p.projGP,q.projGP,v=>Math.round(v)],["Projected season FP",p.projTot,q.projTot,f0],["Top-50 odds",p.pTop50,q.pTop50,pc],
    ["Last 5 games FP/G",A.length?mean(A.map(g=>g.fp)):null,B.length?mean(B.map(g=>g.fp)):null,f1],["Minutes (last season or this)",sa&&sa.min,sb&&sb.min,f1],["Usage rate",sa&&sa.usg,sb&&sb.usg,v=>f1(v)+"%"],["True shooting",sa&&sa.ts!=null?sa.ts*100:null,sb&&sb.ts!=null?sb.ts*100:null,v=>f1(v)+"%"],
    ["Playoff-week games",p.poGames,q.poGames,v=>String(v)],["Breakout odds",p.brk,q.brk,pc],["ESPN ADP",p.adp,q.adp,f1,1],["Age",p.age,q.age,v=>String(v),1]];
  const cell=(v,o,fmt,lower,noWin,who)=>v==null||!isFinite(v)?'<td class="num mut">–</td>':`<td class="num"${!noWin&&o!=null&&isFinite(o)&&(lower?v<o:v>o)?' style="font-weight:700;color:var(--ok)"':""}>${fmt(v,who)}</td>`;
  return `<div class="row-btns" style="align-items:center"><label class="chk" for="cmpPick">Compare with</label><input id="cmpPick" list="cmpList" placeholder="Type a player's name" value="${esc(q.name)}" style="flex:1;min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:6px 8px">
    <datalist id="cmpList">${players.filter(x=>x!==p).sort((a,b)=>a.rank-b.rank).slice(0,300).map(x=>`<option value="${esc(x.name)}"></option>`).join("")}</datalist></div>
    <div class="tablebox" style="margin-top:10px"><table class="cmp-wide"><thead><tr><th class="l"></th><th>${esc(p.name)}</th><th>${pBtn(q)}</th></tr></thead><tbody>
    ${rows.map(([lab,a,b,fmt,lower,noWin])=>`<tr><td class="l">${lab}</td>${cell(a,b,fmt,lower,noWin,p)}${cell(b,a,fmt,lower,noWin,q)}</tr>`).join("")}</tbody></table></div>
    <p class="empty">Green marks the better number in each row. Lower is better for ADP (taken earlier) and age.</p>
    <h3 style="margin-top:14px">Closest alternatives</h3><p class="empty" style="margin-top:0">Same position, similar projection, age and games.</p>
    <ol class="ba" style="margin-top:6px">${similarTo(p).map(x=>`<li><span class="rk">${x.disp??x.rank}</span><span class="nm">${pBtn(x)}<br><span class="sub">${x.team} · ${x.pos.join("/")} · ${f1(x.proj.fp)} FP/G · ${Math.round(x.projGP)} games${pickOf(x.id)?" · drafted":""}</span></span><button class="btn" data-cmp="${x.id}">Compare</button></li>`).join("")}</ol>`}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-cmp],[data-dtab]");if(!b||openId==null)return;
  if(b.dataset.cmp){CMP[openId]=+b.dataset.cmp;S.drTab="compare"}else S.drTab=b.dataset.dtab;openPlayer(openId)});
document.addEventListener("change",e=>{if(e.target.id!=="cmpPick"||openId==null)return;const q=byName[e.target.value];if(!q){toast("Pick a player from the list");return}CMP[openId]=q.id;openPlayer(openId)});
// ================= PLAYERS (Season): every player, rostered or not, with who owns him and how he's playing =================
S.pl=Object.assign({q:"",pos:"ALL",own:"all",sort:"rk",dir:1,n:100,view:"ov",rn:"5"},S.pl||{});
// column views for the Players tab: each column has a key, header, sort value, display and an optional tooltip
const dash='<span class="mut">–</span>',nv=(v,d=1)=>v==null||!isFinite(v)?dash:d?v.toFixed(d):String(Math.round(v)),pv=v=>v==null||!isFinite(v)?dash:pct(v),cpos=v=>v==null||!isFinite(v)?dash:Math.abs(v)<.05?'<span class="mut">0.0</span>':`<span class="${v>0?"zpos":"zneg"}">${v>0?"+":""}${f1(v)}</span>`;
function avgGames(G){if(!G.length)return null;const k=["min","pts","reb","ast","stl","blk","tpm","tov","fgm","fga","ftm","fta","fp"],o={n:G.length};k.forEach(x=>o[x]=mean(G.map(g=>g[x])));o.fg=o.fga?o.fgm/o.fga:null;o.ft=o.fta?o.ftm/o.fta:null;return o}
// last ten team games as bars: this season in the accent color, last season muted, gaps for games he missed
function formSpark(p){const G=gamesOf(p).slice(0,10).reverse();if(!G.length)return dash;const mx=Math.max(20,...G.filter(g=>!g.dnp).map(g=>g.fp)),w=7;
  return `<svg width="${G.length*w}" height="20" viewBox="0 0 ${G.length*w} 20" role="img" aria-label="Fantasy points in his last ${G.length} team games">${G.map((g,i)=>g.dnp?`<rect x="${i*w+2}" y="18" width="3" height="1" fill="var(--bad)"/>`:`<rect x="${i*w+1}" y="${20-Math.max(1,g.fp/mx*20)}" width="5" height="${Math.max(1,g.fp/mx*20)}" fill="${g.date>=PERIOD0?"var(--accent)":"var(--line)"}"><title>${gDate(g.date)} ${g.opp}: ${f1(g.fp)} FP</title></rect>`).join("")}</svg>`}
const PL_VIEWS=[["ov","Overview"],["mv","Movers"],["out","Outlook"],["stats","This season"],["recent","Recent games"],["adv","Advanced"],["proj","Rest of season"],["sched","Schedule"],["mkt","Ownership & ADP"]];
// in-season outlook: last 10 games with a 3-game moving average, then the next four games as predicted, each with its 80% range
function outlookSpark(p){const G=gamesOf(p).slice(0,10).reverse(),N=nextGames(p),W=150,H=30,n=G.length,slots=n+Math.max(1,N.length),x=i=>4+i*(W-8)/Math.max(1,slots-1),played=G.filter(g=>!g.dnp);
  const mx=Math.max(20,...played.map(g=>g.fp),...N.map(g=>g.fp*1.4))*1.05,y=v=>H-3-(Math.min(mx,Math.max(0,v))/mx)*(H-6);
  let s=N.length?`<line x1="${x(n)-4}" x2="${x(n)-4}" y1="2" y2="${H-2}" stroke="var(--line)" stroke-dasharray="1 2"/>`:"";
  N.forEach((g,j)=>{const cx=x(n+j);s+=g.out?`<rect x="${cx-1.5}" y="${H-2}" width="3" height="1.5" fill="var(--bad)"><title>${gDate(g.date)} ${g.o}: expected out</title></rect>`:`<g><title>${gDate(g.date)} ${g.o}: about ${f0(g.fp)} FP expected (8 in 10 games land ${f0(g.lo)}–${f0(g.hi)})</title><line x1="${cx}" x2="${cx}" y1="${y(g.hi)}" y2="${y(g.lo)}" stroke="var(--accent)" stroke-opacity=".3" stroke-width="3"/><circle cx="${cx}" cy="${y(g.fp)}" r="2.2" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.3"/></g>`});
  const ma=[];G.forEach((g,i)=>{const w=G.slice(Math.max(0,i-2),i+1).filter(q=>!q.dnp);if(!g.dnp&&w.length)ma.push([x(i),y(mean(w.map(q=>q.fp)))])});
  if(ma.length>1)s+=`<path d="${ma.map((q,i)=>(i?"L":"M")+q[0].toFixed(1)+" "+q[1].toFixed(1)).join(" ")}" class="ln" style="stroke-width:1.5"/>`;
  G.forEach((g,i)=>{s+=g.dnp?`<rect x="${x(i)-1.5}" y="${H-2}" width="3" height="1.5" fill="var(--bad)"><title>${gDate(g.date)} ${g.opp}: did not play</title></rect>`:`<circle cx="${x(i)}" cy="${y(g.fp)}" r="2" fill="${g.date>=PERIOD0?"var(--accent)":"var(--muted)"}" opacity="${g.date>=PERIOD0?1:.6}"><title>${gDate(g.date)} ${g.opp}: ${f1(g.fp)} FP</title></circle>`});
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Last ${n} games and projection">${s}</svg>`}
const paceDelta=p=>{const st=p.proj.steps.find(x=>x[0]==="2026-27 pace");return st?st[1]:0};
// ---- daily ranks, in house: for every day since opening night, each player's projection is rebuilt from his own games
// through that day (the same in-season blend as now), his rest-of-season points use the games left after it, and he's ranked
// overall and at his position. Comparing two days shows what that day's games did. Injuries back then aren't known, so
// games left use today's injury list for every day.
let DAYS=null;const POS1=p=>p.pos[0];
function dayRanks(){if(DAYS&&DAYS.k===MIX)return DAYS;const L=typeof SLOG!=="undefined"&&SLOG?SLOG:{},K=curK(MIX.cur);
  const all=Object.values(L).flatMap(l=>l.map(x=>x[0])),q1=all.length?Math.max(...all):CUR_PERIOD-1,q0=all.length?Math.min(...all):q1,Q=[];for(let q=q0;q<=q1;q++)Q.push(q);
  const R=new Map(),rows=players.map(p=>{const g=L[p.espnId]||[],line=p.now&&p.now.gp?p.now:null,sc=SC_CUSTOM&&line?fpOf(line)/Math.max(1,(()=>{const l=line,d=ESPN_SCORING;return l.pts*d.pts+l.reb*d.reb+l.ast*d.ast+l.stl*d.stl+l.blk*d.blk+l.tpm*d.tpm+l.tov*d.tov+l.fgm*d.fgm+l.fga*d.fga+l.ftm*d.ftm+l.fta*d.fta})()):1;
    const pre=p.proj.fp-paceDelta(p),on=!p.baseProj.rookie&&MIX.cur>0;let i=0,n=0,sum=0;
    const fp=Q.map(q=>{while(i<g.length&&g[i][0]<=q){sum+=g[i][1]*sc;n++;i++}const w=on&&n?n/(n+K):0;return pre+w*(sum/Math.max(1,n)-pre)});
    return {p,fp,left:Q.map(q=>p.days.filter(d=>d>q&&d>=p.retP).length)}});
  rows.forEach(r=>R.set(r.p.id,{fp:r.fp,rank:[],pos:[]}));
  Q.forEach((q,k)=>{const o=[...rows].sort((a,b)=>b.fp[k]*b.left[k]*b.p.rate-a.fp[k]*a.left[k]*a.p.rate),pc={};o.forEach((r,j)=>{const x=R.get(r.p.id),ps=POS1(r.p);pc[ps]=(pc[ps]||0)+1;x.rank[k]=j+1;x.pos[k]=pc[ps]})});
  return DAYS={k:MIX,Q,R,last:Q.length-1}}
const seasonRank=p=>{const D=dayRanks(),x=D.R.get(p.id);return x?x.rank[D.last]:null};
const posRank=p=>{const D=dayRanks(),x=D.R.get(p.id);return x?x.pos[D.last]:null};
// places gained (positive) and projection change over the last k days, ending with the latest day of games
function moveOf(p,k){const D=dayRanks(),x=D.R.get(p.id),a=D.last,b=a-k;if(!x||b<0)return null;return {dr:x.rank[b]-x.rank[a],dp:x.pos[b]-x.pos[a],dfp:x.fp[a]-x.fp[b],exact:true}}
// what the latest day's games did to him: his game that day (if any) and the change in projection and ranks
function lastDay(p){const D=dayRanks(),q=D.Q[D.last],g=((typeof SLOG!=="undefined"&&SLOG&&SLOG[p.espnId])||[]).find(x=>x[0]===q),m=moveOf(p,1);return {q,date:PDATE(q),g,m}}
const moveTag=(m,small)=>!m||Math.abs(m.dr)<1?'<span class="mut">–</span>':`<span class="${m.dr>0?"zpos":"zneg"}" title="${m.dr>0?"Up":"Down"} ${Math.abs(m.dr)} places in rest-of-season rank; projection ${m.dfp>=0?"+":"−"}${f1(Math.abs(m.dfp))} FP/G${m.dp?`; ${m.dp>0?"up":"down"} ${Math.abs(m.dp)} at his position`:""}">${m.dr>0?"▲":"▼"}${Math.abs(m.dr)}${small?"":` <span class="mut" style="font-size:12px">${m.dfp>=0?"+":"−"}${f1(Math.abs(m.dfp))}</span>`}</span>`;
// signals from his games this season: a change in minutes usually means a new role and sticks; a shooting streak usually fades
function signals(p){const G=SEASON_GAMES(p).slice(0,5),prev=p.seasons.filter(s=>s&&s.gp>=20).pop(),out=[];if(G.length<3||!prev)return {html:dash,score:0};
  const dm=mean(G.map(g=>g.min))-prev.min,fga=G.reduce((a,g)=>a+g.fga,0),dfg=fga>=20?G.reduce((a,g)=>a+g.fgm,0)/fga-prev.fg:0;
  if(Math.abs(dm)>=3)out.push(`<span class="${dm>0?"zpos":"zneg"}" title="Minutes this season vs ${SEASON_LONG(prev.y)}: a role change that tends to stick">${dm>0?"▲":"▼"} ${f1(Math.abs(dm))} min</span>`);
  if(Math.abs(dfg)>=.06)out.push(`<span class="mut" title="FG% this season vs ${SEASON_LONG(prev.y)}: shooting streaks usually fade">${dfg>0?"hot":"cold"} shooting ${dfg>0?"+":"−"}${Math.round(Math.abs(dfg)*100)} pts</span>`);
  return {html:out.length?out.join("<br>"):'<span class="mut">none</span>',score:dm}}
// next-game model (tools/build_matchup.py, fit walk-forward on two seasons of games): recent form with a 10-game half-life, pulled
// toward the preseason projection, times the opponent's defense against his position group, home court and back-to-backs
const MP=MATCHUP.P,PDATE=q=>{const d=new Date(PERIOD0+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+q);return d.toISOString().slice(0,10)};
const FB=new Map();
function formBase(p){if(FB.has(p.id))return FB.get(p.id);const dec=.5**(1/MP.h);let s=0,w=0;SEASON_GAMES(p).slice().reverse().forEach(g=>{s=s*dec+g.fp;w=w*dec+1});const v=(s+MP.K*p.baseProj.fp)/(w+MP.K);FB.set(p.id,v);return v}
const isOut=(p,date)=>!!(p.out&&p.inj&&(p.inj.fs==="OFS"||!p.inj.ret||date<p.inj.ret));
const regMin=p=>{const s=p.now&&p.now.gp>=3?p.now:p.seasons.filter(s=>s&&s.gp>=10).pop();return s?s.min:0};
// teammates who are out: a regular's absence hands MP.beta of his form to the others in proportion to theirs, moved toward what this
// player actually did without him (MP.Km games of weight on that rule); only the part not already in his recent form counts
function mateAdj(p,date,base){const L=(typeof MATES!=="undefined"&&MATES[p.espnId])||[];if(!L.length)return {adj:0,list:[]};
  const act=players.filter(q=>q.team===p.team&&regMin(q)>=10),list=[];let adj=0;
  L.forEach(([e,nW,fW,nO,fO,mW,mO,sh])=>{const q=players[BY_ESPN.get(e)];if(!q||q.team!==p.team||regMin(q)<20)return;
    const S=act.filter(x=>x!==q).reduce((a,x)=>a+formBase(x),0)||1,pri=MP.beta*formBase(q)*base/S,dl=nW>=3&&nO?(nO*(fO-fW)+MP.Km*pri)/(nO+MP.Km):pri,out=isOut(q,date),x=dl*((out?1:0)-sh);
    adj+=x;list.push({q,out,dl,x,sh,nW,nO,fW,fO,mW,mO,pri})});
  return {adj:Math.max(-base,Math.min(base,adj)),list}}
let DEF_NOW=null;
// each defense: last season's record (a quarter weight) plus this season's games, as FP allowed vs what those players were expected to score
function defNow(){if(DEF_NOW)return DEF_NOW;const D={},dec=.5**(1/MP.h);Object.entries(MATCHUP.DEF).forEach(([t,o])=>{D[t]={};Object.entries(o).forEach(([g,v])=>D[t][g]=[...v])});
  players.forEach(p=>{const g=posGroup(p),pr=p.baseProj.fp;let s=0,w=0;SEASON_GAMES(p).slice().reverse().forEach(x=>{const b=(s+MP.K*pr)/(w+MP.K),o=x.opp.replace(/^@/,"");
    if(b>5&&D[o]){const v=D[o][g]=D[o][g]||[0,0,0];v[0]+=x.fp;v[1]+=b;v[2]++}s=s*dec+x.fp;w=w*dec+1})});return DEF_NOW=D}
const defFactor=(opp,g)=>{const v=(defNow()[opp]||{})[g];return v&&v[1]?1+(v[0]/v[1]-1)*v[2]/(v[2]+MP.Kd):1};
function nextGames(p,n=4){const S=SCHED[p.team]||[],O=SCHED_OPP[p.team]||{},last=(gamesOf(p)[0]||{}).date||"",base=formBase(p),g=posGroup(p);
  return S.filter(q=>q>=CUR_PERIOD&&PDATE(q)>last).slice(0,n).map(q=>{const o=O[q]||"",opp=o.replace("@",""),home=!o.startsWith("@"),b2b=S.includes(q-1),f=defFactor(opp,g),
    date=PDATE(q),m=mateAdj(p,date,base),fp=(base+m.adj)*Math.max(.5,f)**MP.a*(home?1+MP.hm:1-MP.hm)*(b2b?1-MP.b2:1),out=isOut(p,date);
    return {q,date,out,o,opp,home,b2b,f,fp,lo:fp*MATCHUP.Q[0],hi:fp*MATCHUP.Q[1],base,mate:m,vs:(MATCHUP.VS[p.espnId]||{})[opp]}})}
const pctTag=f=>{const d=Math.round((f-1)*100);return d?`<span class="${d>0?"zpos":"zneg"}">${d>0?"+":"−"}${Math.abs(d)}%</span>`:`<span class="mut">even</span>`};
function plCols(view){const w0=Math.max(0,CUR_WEEK),N=+S.pl.rn,line=(get,lab)=>[["pts","Pts"],["reb","Reb"],["ast","Ast"],["stl","Stl"],["blk","Blk"],["tpm","3PM"],["tov","TO"]].map(([k,h])=>({k:lab+k,h,v:p=>{const o=get(p);return o?o[k]:-1},d:p=>{const o=get(p);return o?nv(o[k]):dash}}));
  const S2=p=>p.now&&p.now.gp?p.now:null,R=p=>p._r,P=p=>p.proj.line,B=p=>p._bs;
  if(view==="out"){const nw=Math.min(WEEKS.length-1,w0+1),ng=p=>p._ng||(p._ng=nextGames(p,12)),
      wfp=(p,i)=>{const G=ng(p).filter(g=>!g.out&&g.q>=WEEKS[i].p[0]&&g.q<=WEEKS[i].p[1]),c=weekGames(p,i);return c*(G.length?mean(G.map(g=>g.fp)):formBase(p))};
    return [{k:"otrend",h:"Last 10 → next 4",t:"Left: his last 10 games (dots; muted = last season) and a 3-game average line. Right of the dotted line: what the model expects in his next four games, with the range 8 in 10 games land in",v:p=>p._l5!=null?p._l5-p.proj.fp:-99,d:outlookSpark},
      {k:"next",h:"Next game",t:"Model prediction for his next game, and how that opponent's defense treats his position group (+ means it allows more than expected)",v:p=>ng(p)[0]&&!ng(p)[0].out?ng(p)[0].fp:-1,d:p=>{const g=ng(p)[0];return !g?dash:g.out?'<span class="zneg">out</span>':`<b>${f1(g.fp)}</b> <span class="mut">${g.o}</span> ${pctTag(g.f)}`}},
      {k:"proj",h:"Proj FP/G",t:"Rest of season: his preseason projection blended with this season's pace",v:p=>p.proj.fp,d:p=>`<b>${f1(p.proj.fp)}</b>`},{k:"chg",h:"Since preseason",t:"How much this season's games have moved his projection",v:p=>paceDelta(p),d:p=>cpos(paceDelta(p))},
      {k:"range",h:"80% range",v:p=>p.hi-p.lo,d:p=>`${f1(p.lo)}–${f1(p.hi)}`},{k:"twk",h:`Week ${WEEKS[w0].i} FP`,t:"Projected fantasy points in this matchup week: games he is expected to play x the model's prediction for those games",v:p=>wfp(p,w0),d:p=>`${f0(wfp(p,w0))} <span class="mut">(${weekGames(p,w0)}g)</span>`},
      {k:"nwk",h:`Week ${WEEKS[nw].i} FP`,v:p=>wfp(p,nw),d:p=>`${f0(wfp(p,nw))} <span class="mut">(${weekGames(p,nw)}g)</span>`},{k:"sig",h:"Signals",t:"Minutes changes tend to stick; shooting streaks tend to fade",v:p=>signals(p).score,d:p=>signals(p).html,l:1}]}
  if(view==="stats")return [{k:"gp",h:"GP",v:p=>S2(p)?S2(p).gp:-1,d:p=>S2(p)?String(S2(p).gp):dash},{k:"smin",h:"Min",v:p=>S2(p)?S2(p).min:-1,d:p=>S2(p)?nv(S2(p).min):dash},...line(S2,"s"),
    {k:"sfg",h:"FG%",v:p=>S2(p)&&S2(p).fga?S2(p).fgm/S2(p).fga:-1,d:p=>S2(p)&&S2(p).fga?pv(S2(p).fgm/S2(p).fga):dash},{k:"sft",h:"FT%",v:p=>S2(p)&&S2(p).fta?S2(p).ftm/S2(p).fta:-1,d:p=>S2(p)&&S2(p).fta?pv(S2(p).ftm/S2(p).fta):dash},
    {k:"now",h:"FP/G",v:p=>p.nowFp??-1,d:p=>`<b>${nv(p.nowFp)}</b>`},{k:"sdiff",h:"vs proj",t:"This season's FP/G minus his projection",v:p=>p.nowFp!=null?p.nowFp-p.proj.fp:-99,d:p=>cpos(p.nowFp!=null?p.nowFp-p.proj.fp:null)}];
  if(view==="recent")return [{k:"rgp",h:"Games",t:`Games played in his team's last ${N} games this season`,v:p=>R(p)?R(p).n:-1,d:p=>R(p)?`${R(p).n}${p._miss?` <span class="zneg">(${p._miss} missed)</span>`:""}`:dash},
    {k:"rmin",h:"Min",v:p=>R(p)?R(p).min:-1,d:p=>R(p)?nv(R(p).min):dash},...line(R,"r"),{k:"rfg",h:"FG%",v:p=>R(p)&&R(p).fg!=null?R(p).fg:-1,d:p=>R(p)?pv(R(p).fg):dash},
    {k:"rfp",h:"FP/G",v:p=>R(p)?R(p).fp:-1,d:p=>R(p)?`<b>${nv(R(p).fp)}</b>`:dash},{k:"rdiff",h:"vs proj",v:p=>R(p)?R(p).fp-p.proj.fp:-99,d:p=>cpos(R(p)?R(p).fp-p.proj.fp:null)},{k:"form",h:"Last 10",t:"Fantasy points in his team's last 10 games (lighter bars are last season)",v:p=>p._l5??-1,d:formSpark}];
  if(view==="adv")return [{k:"bsy",h:"Season",t:"This season once he has 10 games, otherwise last season",v:p=>B(p)?B(p).y:0,d:p=>B(p)?`<span class="mut">${SEASON_LONG(B(p).y)}</span>`:dash},
    {k:"usg",h:"Usage",t:"Share of team plays he finishes while on the floor",v:p=>B(p)?B(p).usg:-1,d:p=>B(p)&&B(p).usg?nv(B(p).usg)+"%":dash},{k:"ts",h:"TS%",t:"True shooting: scoring efficiency including threes and free throws",v:p=>B(p)&&B(p).ts!=null?B(p).ts:-1,d:p=>B(p)?pv(B(p).ts):dash},
    {k:"bpm",h:"BPM",t:"Box plus-minus: points per 100 possessions above an average player",v:p=>B(p)&&B(p).bpm!=null?B(p).bpm:-99,d:p=>B(p)?cpos(B(p).bpm):dash},{k:"fpm",h:"FP/min",v:p=>B(p)&&B(p).min?fpOf(B(p))/B(p).min:-1,d:p=>B(p)&&B(p).min?nv(fpOf(B(p))/B(p).min,2):dash},
    ...[["p36","Pts/36","pts"],["r36","Reb/36","reb"],["a36","Ast/36","ast"]].map(([k,h,x])=>({k,h,v:p=>B(p)&&B(p).min?B(p)[x]/B(p).min*36:-1,d:p=>B(p)&&B(p).min?nv(B(p)[x]/B(p).min*36):dash})),
    {k:"d36",h:"Stl+Blk/36",v:p=>B(p)&&B(p).min?(B(p).stl+B(p).blk)/B(p).min*36:-1,d:p=>B(p)&&B(p).min?nv((B(p).stl+B(p).blk)/B(p).min*36):dash},{k:"t36",h:"3PA/36",v:p=>B(p)&&B(p).min&&B(p).tpa!=null?B(p).tpa/B(p).min*36:-1,d:p=>B(p)&&B(p).min&&B(p).tpa!=null?nv(B(p).tpa/B(p).min*36):dash},
    {k:"to36",h:"TO/36",v:p=>B(p)&&B(p).min?B(p).tov/B(p).min*36:99,d:p=>B(p)&&B(p).min?nv(B(p).tov/B(p).min*36):dash}];
  if(view==="proj")return [{k:"proj",h:"FP/G",v:p=>p.proj.fp,d:p=>`<b>${f1(p.proj.fp)}</b>`},{k:"range",h:"80% range",t:"He lands in this range 8 times in 10",v:p=>p.hi-p.lo,d:p=>`${f1(p.lo)}–${f1(p.hi)}`},...line(P,"p"),
    {k:"pfg",h:"FG%",v:p=>P(p).fg??-1,d:p=>pv(P(p).fg)},{k:"pft",h:"FT%",v:p=>P(p).ft??-1,d:p=>pv(P(p).ft)},{k:"pgp",h:"Games",t:"Projected games for the rest of the season",v:p=>p.projGP,d:p=>String(Math.round(p.projGP))},
    {k:"po",h:"Playoff games",v:p=>p.poGames,d:p=>String(p.poGames)},{k:"ros",h:"Season FP",v:p=>p.projTot,d:p=>f0(p.projTot)},{k:"t50",h:"Top-50 odds",v:p=>p.pTop50,d:p=>pc(p.pTop50)},{k:"brk",h:"Breakout",t:"Share of his closest historical comparisons who jumped 6+ FP/G",v:p=>p.brk??-1,d:p=>p.brk!=null?pc(p.brk):dash}];
  if(view==="sched"){const ws=WEEKS.map((w,i)=>i).filter(i=>i>=w0&&!WEEKS[i].po).slice(0,4);
    return [...ws.map(i=>({k:"w"+i,h:`Week ${WEEKS[i].i}`,t:`${gDate(WEEKS[i].s)}–${gDate(WEEKS[i].e)}`,v:p=>weekGames(p,i),d:p=>{const g=weekGames(p,i);return `<span class="${g>=4?"zpos":g<=2?"zneg":""}">${g}</span>`}})),
      {k:"left",h:"Games left",v:p=>p.avail,d:p=>String(p.avail)},{k:"po",h:"Playoff games",t:"Mar 15–Apr 11",v:p=>p.poGames,d:p=>`<span class="${p.poGames>=PO_AVG()+1?"zpos":p.poGames<=PO_AVG()-1?"zneg":""}">${p.poGames}</span>`},
      {k:"out",h:"Status",v:p=>p.out?2:p.dtd?1:0,d:p=>p.out?`<span class="chip out">Out</span> <span class="mut">${retLabel(p)}</span>`:p.dtd?'<span class="chip dtd">Day-to-day</span>':'<span class="mut">Healthy</span>',l:1}]}
  if(view==="mv"){const last3=p=>{const G=SEASON_GAMES(p).slice(0,3);return G.length?mean(G.map(g=>g.fp)):null},ld=dayRanks(),day=gDate(PDATE(ld.Q[ld.last]));
    return [{k:"pos",h:"Pos rank",t:"Rank at his main position by rest-of-season points, and its change over the latest day",v:p=>-(posRank(p)||999),d:p=>{const m=moveOf(p,1);return `${POS1(p)} #${posRank(p)}${m&&m.dp?` <span class="${m.dp>0?"zpos":"zneg"}" style="font-size:12px">${m.dp>0?"▲":"▼"}${Math.abs(m.dp)}</span>`:""}`}},
      {k:"night",h:day,t:`His game on ${day}, the latest day of games, and what it did to his projection`,v:p=>{const x=lastDay(p);return x.g?x.g[1]:-1},d:p=>{const x=lastDay(p);return x.g?`${f0(x.g[1])} FP <span class="${x.m&&x.m.dfp>=0?"zpos":"zneg"}" style="font-size:12px">${x.m?(x.m.dfp>=0?"+":"−")+f1(Math.abs(x.m.dfp)):""}</span>`:'<span class="mut">no game</span>'}},
      {k:"m1",h:"1 day",t:"Rest-of-season rank change from the day before the latest day of games (▲ = up), and the projection change in FP/G",v:p=>(moveOf(p,1)||{dr:0}).dr,d:p=>moveTag(moveOf(p,1))},
      {k:"m3",h:"3 days",v:p=>(moveOf(p,3)||{dr:0}).dr,d:p=>moveTag(moveOf(p,3))},{k:"m7",h:"7 days",v:p=>(moveOf(p,7)||{dr:0}).dr,d:p=>moveTag(moveOf(p,7))},
      {k:"proj",h:"Proj FP/G",v:p=>p.proj.fp,d:p=>`<b>${f1(p.proj.fp)}</b>`},{k:"l3",h:"Last 3",t:"Average fantasy points in his last three games this season",v:p=>last3(p)??-1,d:p=>{const x=last3(p);return x==null?dash:`${f1(x)} <span class="${x>p.proj.fp?"zpos":"zneg"}" style="font-size:12px">${x>p.proj.fp?"above":"below"}</span>`}},
      {k:"form",h:"Last 10",t:"Fantasy points in his team's last 10 games (lighter bars are last season)",v:p=>p._l5??-1,d:formSpark},{k:"st",h:"Status",v:p=>p.out?2:p.dtd?1:0,d:p=>p.out?`<span class="chip out">Out</span> <span class="mut" style="font-size:12px">${esc(retText(p.inj&&p.inj.ret,p.inj&&p.inj.fs))}</span>`:p.dtd?'<span class="chip dtd">GTD</span>':'<span class="mut">healthy</span>',l:1}]}
  if(view==="mkt")return [{k:"own%",h:"ESPN rostered",t:"Share of ESPN leagues where he's on a roster",v:p=>p.own??-1,d:p=>p.own!=null?nv(p.own)+"%":dash},{k:"adp",h:"ADP",t:"Average draft position in ESPN drafts",v:p=>p.adp??999,d:p=>p.adp?nv(p.adp):dash},
    {k:"espn",h:"ESPN rank",v:p=>p.base,d:p=>"#"+p.base},{k:"mrank",h:"Model rank",v:p=>p.modelRank,d:p=>"#"+p.modelRank},{k:"val",h:"Value",t:"ADP minus model rank: positive means the model likes him more than drafters do",v:p=>p.adp?p.adp-p.modelRank:-999,d:p=>p.adp?cpos(p.adp-p.modelRank):dash},
    {k:"fpro",h:"Experts",t:"FantasyPros consensus rank",v:p=>p.fpro?p.fpro[0]:999,d:p=>p.fpro?"#"+p.fpro[0]:dash},{k:"sal",h:"Salary",v:p=>p.sal||0,d:p=>p.sal?`$${(p.sal/1e6).toFixed(1)}M`:dash}];
  return [{k:"proj",h:"Proj FP/G",v:p=>p.proj.fp,d:p=>`<b>${f1(p.proj.fp)}</b>`},{k:"now",h:"This season",v:p=>p.nowFp??-1,d:p=>p.nowFp!=null?`${f1(p.nowFp)} <span class="mut">(${p.now.gp})</span>`:dash},
    {k:"l5",h:"Last 5",v:p=>p._l5??-1,d:p=>nv(p._l5)},{k:"trend",h:"Trend",v:p=>p._l5!=null&&p.nowFp!=null&&p.now&&p.now.gp>5?p._l5-p.nowFp:-99,d:p=>{if(p._l5==null||p.nowFp==null||!p.now||p.now.gp<=5)return dash;const d=p._l5-p.nowFp;return Math.abs(d)<2?'<span class="mut">steady</span>':`<span class="${d>0?"zpos":"zneg"}">${d>0?"▲":"▼"} ${f1(Math.abs(d))}</span>`}},
    {k:"form",h:"Last 10",t:"Fantasy points in his team's last 10 games (lighter bars are last season)",v:p=>p._l5??-1,d:formSpark},{k:"min",h:"Min",v:p=>p._min??-1,d:p=>nv(p._min)},{k:"wk",h:"This week",v:p=>p._wk,d:p=>String(p._wk)},
    {k:"left",h:"Games left",v:p=>p.avail,d:p=>String(p.avail)},{k:"ros",h:"Season FP",t:"Projected fantasy points for the rest of the season: Proj FP/G × games he's expected to play. This sets the # rank",v:p=>p.projTot,d:p=>f0(p.projTot)},
    {k:"seas",h:"Seasons",t:"FP/G in each of the last three seasons, this season so far (dark dot) and the rest-of-season projection (hollow)",v:p=>{const l=p.hist[p.hist.length-1];return l?p.proj.fp-l.fp:-99},d:sparkSeasons},
    {k:"m7",h:"7-day move",t:"Places gained or lost in the # rank over the last 7 days",v:p=>(moveOf(p,7)||{dr:0}).dr,d:p=>moveTag(moveOf(p,7),1)},
    {k:"pre",h:"Preseason",t:"His rank on the Draft Day board",v:p=>p.disp??p.rank,d:p=>`<span class="mut">#${p.disp??p.rank}</span>`}]}
function playersView(){computeDisp();const L=leagueRosters(),owner={};for(const t in L)L[t].forEach(id=>owner[id]=+t);const w=Math.max(0,CUR_WEEK),q=S.pl.q.trim().toLowerCase(),N=+S.pl.rn;
  players.forEach(p=>{const SG=SEASON_GAMES(p),G=SG.slice(0,5),all=gamesOf(p).filter(g=>g.date>=PERIOD0).slice(0,N);p._l5=G.length>=2?mean(G.map(g=>g.fp)):null;p._min=p.now&&p.now.gp?p.now.min:G.length?mean(G.map(g=>g.min)):null;p._wk=weekGames(p,w);
    p._r=avgGames(all.filter(g=>!g.dnp));p._miss=all.filter(g=>g.dnp).length;p._bs=(s=>s&&s.gp>=10&&s.min>=8?s:null)(baseSeason(p));const o=owner[p.id];p._own=o==null?"~":o===S.slot?" ":teamName(o)});
  // in-season rank: total fantasy points left, so missed games and schedule count, not just points per game
  players.forEach(p=>p._sr=seasonRank(p)??999);
  let list=players.filter(p=>(S.pl.pos==="ALL"||(S.pl.pos==="G"?p.pos.some(x=>x==="PG"||x==="SG"):S.pl.pos==="F"?p.pos.some(x=>x==="SF"||x==="PF"):p.pos.includes(S.pl.pos)))
    &&(S.pl.own==="all"||(S.pl.own==="fa"?owner[p.id]==null:S.pl.own==="mine"?owner[p.id]===S.slot:owner[p.id]!=null&&owner[p.id]!==S.slot))
    &&(!q||p.name.toLowerCase().includes(q)||p.team.toLowerCase()===q));
  const C=[{k:"rk",h:"#",t:"Rest-of-season rank: projected FP/G × games he's expected to play from here",v:p=>p._sr,l:1},{k:"name",h:"Player",v:p=>p.name,l:1},{k:"owner",h:"Owner",v:p=>p._own,l:1},...plCols(S.pl.view)],col=C.find(c=>c.k===S.pl.sort)||C[3];
  list.sort((a,b)=>{const x=col.v(a),y=col.v(b);return (typeof x==="string"?x.localeCompare(y):x-y)*(C.find(c=>c.k===S.pl.sort)?S.pl.dir:-1)});
  const n=list.length,shown=list.slice(0,S.pl.n),hasOwners=Object.keys(owner).length>0;
  const seg=(key,opts)=>`<div class="seg" role="group">${opts.map(([v,lab])=>`<button data-pl="${key}:${v}" aria-pressed="${S.pl[key]===v}">${lab}</button>`).join("")}</div>`;
  const own=p=>{const o=owner[p.id];return o==null?'<span class="chip espn">Free agent</span>':o===S.slot?'<span class="chip rook">Your team</span>':`<span class="mut own" title="${esc(teamName(o))}">${esc(teamName(o))}</span>`};
  const th=c=>`<th class="${c.l?"l":""}" data-plsort="${c.k}"${c.t?` title="${esc(c.t)}"`:""}${S.pl.sort===c.k?` aria-sort="${S.pl.dir<0?"descending":"ascending"}"`:""}>${c.h}${S.pl.sort===c.k?(S.pl.dir<0?" ▼":" ▲"):""}</th>`;
  const NOTE={mv:"Every rank here is Pivot's own: for each day since opening night, each player's projection is rebuilt from his games through that day, his rest-of-season points use the games left after it, and he's ranked overall (the # column) and at his main position. The latest-day column shows his game and what it did to his projection; 1, 3 and 7 days show how far he has climbed (▲) or slid (▼) since then. Games left use today's injury list for every day, so an injury moves a player when it's reported, not on the day it happened.",out:"Next game and the right side of each chart come from a per-game model: his recent games (each game ten games back counts half as much as his latest), pulled toward his preseason projection, then adjusted for how the opponent defends his position, home court and back-to-backs. Single games swing a lot, so read the range, not just the number. Proj FP/G is the rest-of-season projection, which moves more slowly: his preseason projection blended with this season's pace, half the weight at 10 games. Since preseason shows how far that has moved him. Week FP is his expected games that week times the per-game predictions.",ov:"# ranks players by Season FP, the fantasy points they're projected to score from here (Proj FP/G × games they're expected to play), so injuries and schedule count. Preseason is their Draft Day board rank. Proj FP/G is the projection per game for the rest of the season. This season is fantasy points per game so far (games in brackets). Last 5 averages his last five games this season, Trend compares that with his season once he has more than five games, and Last 10 shows each of his team's last ten games.",
    stats:"Per-game averages this season, from Basketball Reference. vs proj compares his fantasy points per game with his rest-of-season projection.",recent:`Averages over his team's last ${N} games this season (games he missed are counted separately), from ESPN's box scores.`,
    adv:"From Basketball Reference: this season once he has 10 games, otherwise last season; players with fewer than 10 games at 8+ minutes show dashes. Per-36 numbers scale his production to 36 minutes so bench and starting players compare fairly.",proj:"The model's projected per-game line for the rest of the season, under your league's scoring.",
    sched:"Games he's expected to play (injuries included). Green weeks have 4 or more games, red weeks 2 or fewer.",mkt:"How the fantasy world values him: ESPN rostered share and draft position, ESPN's and this model's ranks, and the FantasyPros expert consensus."};
  return `<div class="filters"><input type="search" id="plQ" placeholder="Search a player or team (e.g. DEN)" value="${esc(S.pl.q)}">${seg("pos",["ALL","PG","SG","SF","PF","C","G","F"].map(x=>[x,x]))}</div>
    <div class="filters"><span class="seg-lab">Show</span>${seg("own",[["all","Everyone"],["fa","Free agents"],["mine","My team"],["others","Other teams"]])}<span class="mut" style="font-size:12px">${n} player${n===1?"":"s"}${hasOwners?"":" · rosters appear after your draft"}</span></div>
    <div class="filters"><span class="seg-lab">Columns</span>${seg("view",PL_VIEWS)}${S.pl.view==="recent"?seg("rn",[["5","Last 5"],["10","Last 10"]]):""}</div>
    <div class="tablebox"><table class="board"><thead><tr>${C.map(th).join("")}</tr></thead><tbody>
    ${shown.map(p=>`<tr${owner[p.id]===S.slot?' class="is-mine"':""}><td class="num">${p._sr}</td>${nameCell(p)}<td class="l">${own(p)}</td>${C.slice(3).map(c=>`<td class="${c.l?"l":"num"}">${c.d(p)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${n>shown.length?`<p style="margin-top:8px"><button class="btn" data-plmore="1">Show ${Math.min(100,n-shown.length)} more</button> <span class="mut" style="font-size:12px">${shown.length} of ${n}</span></p>`:""}
    <p class="empty" style="margin-top:8px">${NOTE[S.pl.view]||NOTE.ov} Hover a column header for what it means; click it to sort. Click a name for his full profile${hasOwners?"; free agents can be added from the Waivers tab":""}.</p>`}
function renderPlayers(){const v=$("view-players");if(!v)return;const a=document.activeElement,typing=a&&a.id==="plQ",pos=typing?a.selectionStart:0;v.innerHTML=playersView();
  if(typing){const i=$("plQ");i.focus();i.setSelectionRange(pos,pos)}}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-pl],[data-plsort],[data-plmore]");if(!t)return;
  if(t.dataset.pl){const [k,v]=t.dataset.pl.split(":");S.pl[k]=v;S.pl.n=100}
  else if(t.dataset.plsort){const k=t.dataset.plsort;if(S.pl.sort===k)S.pl.dir*=-1;else{S.pl.sort=k;S.pl.dir=k==="rk"||k==="name"||k==="owner"||k==="adp"||k==="espn"||k==="mrank"||k==="fpro"||k==="to36"?1:-1}}
  else S.pl.n+=100;save();renderPlayers()});
document.addEventListener("input",e=>{if(e.target.id!=="plQ")return;S.pl.q=e.target.value;S.pl.n=100;clearTimeout(renderPlayers.t);renderPlayers.t=setTimeout(()=>{save();renderPlayers()},150)});
// a drawn jersey in his team's colors with his number: no logos or photos, just the team's colors and nickname
const lum=h=>{const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]},
  contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
// pixel-art jersey: the team's Wikimedia Commons icon kit with his number drawn in the same pixel grid (5x7 digits, bolded, outlined)
// athletic 5x7 digits: two-pixel uprights so the fill color carries the number and the outline stays a thin edge
const DIGITS=["01110110111101111011110111101101110","01100111000110001100011000110011110","01110110110001100110011001100011111","11110000110001101110000110001111110","00011001110101110011111110001100011","11111110001111000011000111101101110","01110110001100011110110111101101110","11111000110011000110011000110001100","01110110111101101110110111101101110","01110110111101101111000110001101110"];
// the number is painted into the kit bitmap itself (38x59), so it shares the art's pixel grid and 1-pixel strokes, then the whole
// image is scaled up as one; images decode asynchronously, so a first render shows the plain kit and swaps in the numbered one
// pixel number fonts matched to each team's real numbers: rounded (DIGITS), square block, slab-serif (footed 1, 4 and 7),
// italic (top rows lean one pixel right) and tall (middle row doubled, for condensed fonts)
const KIT_IMG={},KIT_CACHE={},DIGITS_SQ=["11111110111101111011110111101111111","01100111000110001100011000110011110","11111000110001111111110001100011111","11111000110001101111000110001111111","11011110111101111111000110001100011","11111110001100011111000110001111111","11111110001100011111110111101111111","11111000110001100110001100110001100","11111110111101111111110111101111111","11111110111101111111000110001111111"];
const DIGITS_SLAB=DIGITS.map((g,d)=>d===1?"01100111000110001100011000110011111":d===4?g.slice(0,30)+"00111":d===7?g.slice(0,30)+"01110":g);
function glyph(font,d){const base=font.startsWith("s")&&font!=="sl"?DIGITS_SQ:font==="sl"?DIGITS_SLAB:DIGITS,g=base[d];if(!g)return null;
  let R=[0,1,2,3,4,5,6].map(y=>g.slice(y*5,y*5+5));
  if(font==="i")R=R.map((row,y)=>y<3?"0"+row:row+"0");
  if(font.endsWith("t"))R.splice(3,0,R[3]);
  return R}
function kitWithNumber(team,num){const key=team+"#"+num;if(KIT_CACHE[key])return KIT_CACHE[key];
  let im=KIT_IMG[team];if(!im){im=KIT_IMG[team]=new Image();im.src=KITS[team]}
  if(!im.complete||!im.naturalWidth){im.addEventListener("load",()=>document.querySelectorAll(`img[data-kit="${CSS.escape(key)}"]`).forEach(e=>e.src=kitWithNumber(team,num)),{once:true});return KITS[team]}
  const M=(typeof KIT_NUM!=="undefined"&&KIT_NUM[team])||{y:31,f:"FFFFFF",o:"000000",font:"r"},cv=document.createElement("canvas");cv.width=38;cv.height=59;const g=cv.getContext("2d");g.imageSmoothingEnabled=false;g.drawImage(im,0,0);
  // clear art inside a ring (the Warriors' bridge) so the number takes its place
  if(M.clear){const [cx,cy,rad]=M.clear;g.fillStyle="#"+M.o;for(let y=0;y<59;y++)for(let x=0;x<38;x++)if((x+.5-cx)**2+(y+.5-cy)**2<rad*rad)g.fillRect(x,y,1,1)}
  const on=new Set();let W=0;[...num].forEach(d=>{const R=glyph(M.font||"r",+d);if(!R)return;R.forEach((row,y)=>[...row].forEach((c,x)=>{if(c==="1")on.add((W+x)+","+y)}));W+=R[0].length+1});W=Math.max(0,W-1);
  const x0=Math.round((M.cx??19)-W/2),y0=M.y,edge=new Set();// outline the four direct neighbours only, so the edge stays one pixel and the fill reads as the number
  on.forEach(k=>{const [x,y]=k.split(",").map(Number);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const q=(x+dx)+","+(y+dy);if(!on.has(q))edge.add(q)}});
  const paint=(set,col)=>{g.fillStyle=col;set.forEach(k=>{const [x,y]=k.split(",").map(Number);g.fillRect(x0+x,y0+y,1,1)})};paint(edge,"#"+M.o);paint(on,"#"+M.f);
  return KIT_CACHE[key]=cv.toDataURL("image/png")}
function pixelJersey(p,size=76){const num=String(p.jersey||""),key=p.team+"#"+num,name=TEAM_COLORS&&TEAM_COLORS[p.team]?TEAM_COLORS[p.team][2]:p.team;
  return `<img class="jersey pixel" data-kit="${esc(key)}" src="${num?kitWithNumber(p.team,num):KITS[p.team]}" width="${size}" height="${Math.round(size*59/38)}" alt="${esc(name)} home jersey${num?", number "+esc(num):""}" title="Jersey art: Wikimedia Commons contributors, CC BY-SA 4.0 (number added)">`}
function jerseySvg(p,size=78){if(typeof KITS!=="undefined"&&KITS[p.team])return pixelJersey(p);const J=typeof TEAM_JERSEY!=="undefined"&&TEAM_JERSEY[p.team],id="j"+p.id,num=p.jersey||"",c=h=>"#"+h;
  if(!J)return `<svg class="jersey" width="${size}" height="${Math.round(size*1.1)}" viewBox="0 0 100 110" role="img" aria-label="No team jersey"><path d="${JERSEY_BODY}" fill="var(--soft)" stroke="var(--line)" stroke-width="1.5"/>${num?`<text x="50" y="90" text-anchor="middle" style="font-family:'Saira Condensed',sans-serif;font-weight:800;font-size:44px;fill:var(--muted)">${esc(num)}</text>`:""}</svg>`;
  const block=J.f!=="college",ff=block?"'Saira Condensed','Arial Narrow',sans-serif":"Graduate,Rockwell,'Courier New',serif",fw=block?800:400,
    widths=[[4],[6,2.6],[8,4.6,2]][J.t.length-1],ws=J.w.length,wsz=Math.min(block?13:11,58/(ws*(block?.5:.68))),fit=false,
    nsz=block?(num.length>=2?46:50):(num.length>=2?36:40),word=`style="font-family:${ff};font-weight:${fw};font-size:${wsz.toFixed(1)}px;letter-spacing:${block?.4:.2}px;fill:${c(J.wf)}${J.wo?`;stroke:${c(J.wo)};stroke-width:1.3px;paint-order:stroke`:""}"${fit?' textLength="58" lengthAdjust="spacingAndGlyphs"':""}`,
    ntxt=(fill,stroke,w)=>`<text x="${J.sw?66:50}" y="${J.sw?101:block?96:93}" text-anchor="middle" style="font-family:${ff};font-weight:${fw};font-size:${J.sw?Math.round(nsz*.66):nsz}px;fill:${fill}${stroke?`;stroke:${stroke};stroke-width:${w}px;stroke-linejoin:round;paint-order:stroke`:""}">${esc(num)}</text>`;
  return `<svg class="jersey" width="${size}" height="${Math.round(size*1.1)}" viewBox="0 0 100 110" role="img" aria-label="${esc(TEAM_COLORS&&TEAM_COLORS[p.team]?TEAM_COLORS[p.team][2]:p.team)} home jersey${num?", number "+esc(num):""}">
    <defs><clipPath id="${id}c"><path d="${JERSEY_BODY}"/></clipPath>
      <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
      <linearGradient id="${id}v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
      ${J.pin?`<pattern id="${id}p" width="4.2" height="10" patternUnits="userSpaceOnUse"><rect x="0" width=".55" height="10" fill="${c(J.pin)}" opacity=".45"/></pattern>`:""}
      ${J.a?`<path id="${id}a" d="M19 48 Q50 33 81 48"/>`:""}${J.glow?`<linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c(J.glow)}" stop-opacity=".9"/><stop offset="1" stop-color="${c(J.glow)}" stop-opacity="0"/></linearGradient>`:""}</defs>
    <g clip-path="url(#${id}c)"><rect width="100" height="110" fill="${c(J.b)}"/>${J.pin?`<rect width="100" height="110" fill="url(#${id}p)"/>`:""}
      ${J.top?`<rect width="100" height="58" fill="${c(J.top[0])}"/><rect y="56" width="100" height="5" fill="${c(J.top[1])}"/>`:""}
      ${J.glow?`<rect width="100" height="70" fill="url(#${id}g)"/>`:""}
      ${J.sash?(J.sw?`<path d="M0 74L100 38V56L0 92Z" fill="${c(J.sash[0])}"/><path d="M0 94L100 58V62L0 98Z" fill="${c(J.sash[1])}"/>`:J.sd?`<path d="M0 64L100 98V110L0 76Z" fill="${c(J.sash[0])}"/><path d="M0 79L100 113V118L0 84Z" fill="${c(J.sash[1])}"/>`:`<path d="M0 104L100 64V82L0 122Z" fill="${c(J.sash[0])}"/><path d="M0 124L100 84V89L0 129Z" fill="${c(J.sash[1])}"/>`):""}
      ${J.sp?`<rect x="8" y="30" width="5" height="80" fill="${c(J.sp)}"/><rect x="87" y="30" width="5" height="80" fill="${c(J.sp)}"/>`:""}
      ${J.dash?[0,1,2,3,4].map(k=>`<rect x="9" y="${60+k*8}" width="4" height="4" fill="${c(J.dash)}"/><rect x="87" y="${60+k*8}" width="4" height="4" fill="${c(J.dash)}"/>`).join(""):""}
      ${J.ring?`<circle cx="50" cy="70" r="27" fill="none" stroke="${c(J.ring)}" stroke-width="2.4" opacity=".9"/>`:""}
      ${J.t.map((col,i)=>`<path d="${JERSEY_TRIM}" fill="none" stroke="${c(col)}" stroke-width="${widths[i]}" stroke-linecap="round"/>`).join("")}
      <rect width="100" height="110" fill="url(#${id}s)"/><rect width="100" height="110" fill="url(#${id}v)"/>
      <rect x="14" y="97" width="9" height="5" rx="1" fill="#f2f2f2" opacity=".85"/></g>
    <path d="${JERSEY_BODY}" fill="none" stroke="var(--ink)" stroke-opacity=".35" stroke-width="1"/>
    ${J.sw?`<text x="50" y="69" text-anchor="middle" transform="rotate(-19.8 50 65)" ${word.replace(/font-size:[\d.]+px/,"font-size:15px")}>${esc(J.w)}</text>`:J.a?`<text text-anchor="middle" ${word}><textPath href="#${id}a" startOffset="50%">${esc(J.w)}</textPath></text>`:`<text x="50" y="47" text-anchor="middle" ${word}>${esc(J.w)}</text>`}
    ${num?(J.no2?ntxt(c(J.no2),c(J.no2),6.5):"")+ntxt(c(J.nf),J.no?c(J.no):"",J.no2?3:2.4):""}</svg>`}
// NBA cut: deep armholes, scooped neck; the trim path follows the neck and both armholes
const JERSEY_BODY="M24 3H37C40 15 60 15 63 3H76C76 19 82 28 92 31V106Q50 109 8 106V31C18 28 24 19 24 3Z",JERSEY_TRIM="M37 3C40 15 60 15 63 3M24 3C24 19 18 28 8 31M76 3C76 19 82 28 92 31";
const DTABS=[["overview","Overview"],["stats","Stats"],["proj","Projection"],["compare","Compare"]];
function openPlayer(id){
  const same=openId===id,scroll=$("drawer").scrollTop;openId=id;const tab=S.drTab||"overview";const p=players[id],pk=pickOf(id),l=p.proj.line;computeDisp();
  const chips=[p.out?`<span class="chip out">Out${p.gamesOut>=2?` ~${p.gamesOut}g`:""}</span>`:"",p.dtd?'<span class="chip dtd">GTD</span>':"",p.rook?'<span class="chip rook">Rookie</span>':"",p.hot?'<span class="chip hot">Hot</span>':""].join("");
  $("drawer").innerHTML=`
  <div class="dr-head"><div class="dr-id">${jerseySvg(p)}<div><h2 id="drName">${esc(p.name)}</h2><div class="dr-sub">${p.team} · ${p.pos.join("/")} · age ${p.age} ${chips}</div>
    <div class="dr-sub">Rank <b>#${seasonRank(p)}</b> overall · <b>${POS1(p)} #${posRank(p)}</b> · ${[[1,"1 day"],[3,"3 days"],[7,"7 days"]].map(([k,l])=>`${moveTag(moveOf(p,k),1)} ${l}`).join(" · ")}</div>
    ${(x=>x.g&&x.m?`<div class="dr-sub">${gDate(x.date)}: ${f0(x.g[1])} FP in ${x.g[2]} min → projection ${x.m.dfp>=0?"+":"−"}${f1(Math.abs(x.m.dfp))} FP/G, ${x.m.dr?`${x.m.dr>0?"up":"down"} ${Math.abs(x.m.dr)} overall`:"no change overall"}${x.m.dp?`, ${x.m.dp>0?"up":"down"} ${Math.abs(x.m.dp)} at ${POS1(p)}`:""}</div>`:"")(lastDay(p))}
    ${p.nowFp!=null?`<div class="dr-sub">2026-27 so far: <b>${f1(p.nowFp)} FP/G</b> in ${p.now.gp} game${p.now.gp>1?"s":""}, ${f1(p.now.min)} min</div>`:""}
    <div class="dr-sub">Name value #${p.fameRank}${p.fameParts&&p.fameParts[0]?` · ${p.fameParts[0]}× All-Star`:""}${p.fameParts&&p.fameParts[1]?` · ${p.fameParts[1]}× All-NBA`:""} since 2016-17</div>
    <div class="dr-sub">${p.sal?`$${(p.sal/1e6).toFixed(1)}M standard contract (${CONTRACT_SEASON}) · `:""}${p.unranked?"Not ranked by ESPN; placed by this model · ":""}ESPN #${p.base} points · #${p.baseRoto} cats${p.adp?` · ADP ${f1(p.adp)}`:""} · Model #${p.modelRank} points · #${p.catRank} cats</div></div>
    </div><button class="btn" id="drClose" aria-label="Close">Close ✕</button></div>
  <div class="row-btns" style="margin-top:10px">${pk?`<button class="btn" data-undo="${p.id}">${pk.mine?"On my team":"Taken"} · pick #${pk.o} · undo</button>`:`<button class="btn mine" data-mine="${p.id}">Draft to my team</button><button class="btn" data-take="${p.id}">Mark taken</button>`}</div>
  <div class="pgrid" style="margin-top:12px">
    <div class="kpi"><div class="k">Proj FP/G</div><div class="v">${f1(p.proj.fp)}</div><div class="d">80%: ${f1(p.lo)}–${f1(p.hi)}</div></div>
    <div class="kpi"><div class="k">Proj games</div><div class="v">${Math.round(p.projGP)}</div><div class="d">${p.team} has ${p.teamLeft} left${p.gamesOut?` · misses ~${p.gamesOut}`:""} · ${p.poGames} in fantasy playoffs</div></div>
    <div class="kpi"><div class="k">Season FP</div><div class="v">${f0(p.q.p50)}</div><div class="d">P10 ${f0(p.q.p10)} · P90 ${f0(p.q.p90)}</div></div>
    <div class="kpi"><div class="k">Top-12 odds</div><div class="v">${pc(p.pTop12)}</div><div class="d">Top-50 ${pc(p.pTop50)} · Top-100 ${pc(p.pTop100)}</div></div>
  </div>
  <div class="dtabs" role="tablist" aria-label="Player sections">${DTABS.map(([k,lab])=>`<button role="tab" data-dtab="${k}" aria-selected="${k===tab}"><span class="tl" data-label="${lab}">${lab}</span></button>`).join("")}</div>
  ${tab==="overview"?`
  <div class="dr-sec"><h3>Insights</h3>${(()=>{const I=insightsOf(p);return I.length?`<ul class="heads">${I.map(x=>`<li class="${x.k}">${x.t}</li>`).join("")}</ul>`:'<p class="empty">Nothing stands out: his recent games, minutes and schedule are in line with his projection.</p>'})()}</div>
  ${S.mode==="season"?`<div class="dr-sec"><h3>Season by season</h3>${seriesChart(p)}<p class="empty">Line: his last three seasons. Dark dot: 2026-27 so far. Hollow: the rest-of-season projection, with its 80% range shaded.</p></div>`:""}
  <div class="dr-sec"><h3>Recent games</h3>${recentSection(p)}</div>
  <div class="dr-sec"><h3>Schedule</h3>${scheduleSection(p)}</div>
  <div class="dr-sec"><h3>Teammates</h3>${matesSection(p)}</div>
  <div class="dr-sec"><h3>News</h3>${newsSection(p)}</div>`
  :tab==="stats"?`
  <div class="dr-sec"><h3>Advanced profile</h3>${advSection(p)}</div>
  <div class="dr-sec"><h3>Where his points come from</h3>${sourcesSection(p)}</div>
  <div class="dr-sec"><h3>Fantasy points per game by season</h3>${seriesChart(p)}<p class="empty">The shaded band is the model's 80% range for 2026-27.${p.rook?" Rookies start from a blend of ESPN's projection and what past rookies at his draft pick produced, then move with his 2026-27 games.":""}</p></div>
  <div class="dr-sec"><h3>Category trends → 2026-27</h3><div class="mini-grid">${[["pts","PTS"],["reb","REB"],["ast","AST"],["stl","STL"],["blk","BLK"],["tpm","3PM"]].map(([k,lb])=>catMini(p,k,lb)).join("")}</div>
    <p class="empty" style="margin-top:8px">Projected line: ${f1(l.pts)} pts · ${f1(l.reb)} reb · ${f1(l.ast)} ast · ${f1(l.stl)} stl · ${f1(l.blk)} blk · ${f1(l.tpm)} 3pm · ${f1(l.tov)} to · ${pct(l.fg)} FG · ${pct(l.ft)} FT. Best 8-cat categories: ${Object.entries(p.z).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c])=>CAT_LABEL[c]).join(", ")}.</p></div>
  <div class="dr-sec"><h3>Minutes &amp; per-minute production</h3>${minutesSection(p)}</div>
  <div class="dr-sec"><h3>Games played</h3>${gpChart(p)}</div>`
  :tab==="compare"?`<div class="dr-sec"><h3>Compare</h3>${compareSection(p)}</div>`
  :`
  <div class="dr-sec"><h3>Your take</h3><div class="row-btns" role="group" aria-label="Adjust projection">${[-.2,-.1,-.05,0,.05,.1,.2].map(m=>`<button class="btn${(p.adj&&p.adj.o==null&&Math.abs(p.adj.m-m)<1e-9)||(!p.adj&&m===0)?" primary":""}" data-adj="${m}" data-pid="${p.espnId}">${m===0?"None":(m>0?"+":"")+Math.round(m*100)+"%"}</button>`).join("")}</div>
    <div class="row-btns" style="margin-top:8px;align-items:center"><label class="chk" for="ovr">Or set FP/G</label><input type="number" id="ovr" step="0.5" min="0" max="90" style="width:90px;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:5px 8px" value="${p.adj&&p.adj.o!=null?p.adj.o:""}" placeholder="${f1(p.proj.fp)}"><button class="btn" data-ovr="${p.espnId}">Set</button></div>
    <p class="empty" style="margin-top:6px">Your take changes his projection everywhere: ranks, simulations and the Pick Advisor. Sources: model ${f1(p.fitFp)}${p.espnFp!=null?` · ESPN ${f1(p.espnFp)}`:""}${p.nowFp!=null?` · this season ${f1(p.nowFp)} in ${p.now.gp} g`:""}${p.fproFp!=null?` · FantasyPros #${p.fpro[0]} ≈ ${f1(p.fproFp)}`:""} FP/G.</p></div>
  ${p.draft?rookieSection(p):""}
  <div class="dr-sec"><h3>How the projection is built</h3>${waterfall(p)}</div>
  <div class="dr-sec"><h3>Breakout comps</h3>${compsSection(p)}</div>
  <div class="dr-sec"><h3>Team fit · ${p.team} 2026-27</h3>${teamSection(p)}</div>
  <div class="dr-sec"><h3>Season outcome simulation</h3>${histChart(p)}<p class="empty">${NSIM.toLocaleString()} simulated seasons of per-game level × availability, starting from today.</p></div>
  <div class="dr-sec"><h3>ESPN</h3>${espnSection(p)}</div>`}`;
  $("drawer").hidden=false;$("scrim").hidden=false;$("drClose").onclick=closePlayer;
  // switching sections keeps your place; opening a different player starts at the top
  if(same)$("drawer").scrollTop=scroll;else{$("drawer").scrollTop=0;$("drClose").focus()}
}
function closePlayer(){openId=null;$("drawer").hidden=true;$("scrim").hidden=true}
$("scrim").onclick=closePlayer;document.addEventListener("keydown",e=>{if(e.key==="Escape"&&openId!==null)closePlayer()});

// ================= MODELS TAB =================
// prediction scorecard: next-game predictions logged before tip-off each morning, scored once the game is played
function scorecardCard(){const P=typeof PREDS!=="undefined"?PREDS:null;
  if(!P||!P.n)return `<div class="chart-card" style="grid-column:1/-1"><h4>Prediction scorecard</h4><p class="empty">Each morning Pivot saves its prediction for every relevant player's game that day, then scores it once the game is played. ${P&&P.pending?`${P.pending} predictions are waiting on tonight's games.`:"The first predictions are scored after the next refresh."}</p></div>`;
  const pc0=x=>Math.round(x*100)+"%",win=P.avg?Math.round((1-P.mae/P.avg)*100):0;
  const kp=(k,v,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  return `<div class="chart-card" style="grid-column:1/-1"><h4>Prediction scorecard</h4>
    <div class="kpis" style="margin:8px 0 12px">${kp("Games scored",P.n.toLocaleString(),P.live?`${P.live.toLocaleString()} logged live, the rest replayed`:`replayed from ${gDate(P.since)}; live scoring starts with the next refresh`)}
      ${kp("Average miss",f1(P.mae)+" FP",`vs ${f1(P.avg)} for his season average so far${P.proj!=null?` and ${f1(P.proj)} for the rest-of-season projection`:""}`)}
      ${kp("Better than season average",`<span class="call">${(win>=0?"":"−")+Math.abs(win)}%</span>`,"smaller average miss on the same games")}
      ${kp("Inside the 80% range",pc0(P.cover),"should be close to 80%: much lower means the ranges are too narrow")}
      ${kp("Bias",(P.bias>=0?"+":"−")+f1(Math.abs(P.bias))+" FP","actual minus predicted, on average: near zero means no lean")}</div>
    <div class="chart-grid" style="margin:0">
      <div><h4 style="margin:0 0 6px;font-size:15px">Calibration</h4><table><thead><tr><th class="l">Predicted</th><th>Games</th><th>Avg predicted</th><th>Avg actual</th></tr></thead><tbody>${P.bins.map(([lo,hi,n,pr,ac])=>`<tr><td class="l">${hi>90?lo+"+":lo+"–"+hi} FP</td><td>${n}</td><td>${f1(pr)}</td><td><b>${f1(ac)}</b> ${cpos(ac-pr)}</td></tr>`).join("")}</tbody></table>
        <p class="empty">If the model is honest, each row's actual average lands near its predicted average.</p></div>
      <div><h4 style="margin:0 0 6px;font-size:15px">By matchup week</h4><div style="overflow-x:auto"><table><thead><tr><th class="l">Week</th><th>Games</th><th>Model miss</th><th title="Average miss of his season average so far">Season avg</th><th>In range</th></tr></thead><tbody>${P.weeks.map(w=>`<tr><td class="l">${w.w}</td><td>${w.n}</td><td><b>${f1(w.mae)}</b></td><td>${f1(w.avg)}</td><td>${pc0(w.cover)}</td></tr>`).join("")}</tbody></table></div></div>
      <div><h4 style="margin:0 0 6px;font-size:15px">Biggest misses, ${gDate(P.lastD)}</h4><table><thead><tr><th class="l">Player</th><th>Predicted</th><th>Actual</th></tr></thead><tbody>${P.misses.map(([e,n,pr,ac,lo,hi])=>{const p=players[BY_ESPN.get(e)];return `<tr><td class="l">${p?pBtn(p):esc(n)}</td><td>${f1(pr)} <span class="mut">(${f0(lo)}–${f0(hi)})</span></td><td><b>${f1(ac)}</b></td></tr>`}).join("")}</tbody></table></div>
    </div>
    <p class="empty" style="margin-top:8px">Predictions are for games he plays: a player who sits isn't scored. ${P.live<P.n?"Games before live logging began are replayed: the model as it stands now, using only games before each date, but without teammate adjustments, since who sat is only known after the fact. ":""}One game is noisy whatever you do, so judge the model over weeks, not nights.</p></div>`}
function renderModels(){
  const P=PRM,peak=P.ageFit.b?-P.ageFit.a/P.ageFit.b:0,vs=players.map(p=>({p,v:p.rank-p.modelRank}));
  const ups=[...vs].sort((a,b)=>b.v-a.v).slice(0,6),downs=[...vs].sort((a,b)=>a.v-b.v).slice(0,6);
  const st=P.chart.st,gpd=P.chart.gp;
  const kp=(k,v,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  $("view-models").innerHTML=`
  <div class="kpis">
    ${kp("Year-over-year carryover",P.stab.b.toFixed(2),`R² ${P.stab.r2.toFixed(2)} · n=${P.stab.n}`)}
    ${kp("Regression weight",Math.round(P.K/5)+" g",`average games mixed into each projection`)}
    ${kp("Age effect",(P.ageFit.b>=0?"+":"")+P.ageFit.b.toFixed(2),`FP/G per year · break-even age ≈ ${Math.round(peak)}`)}
    ${kp("Games carryover",P.gfit.b.toFixed(2),`R² ${P.gfit.r2.toFixed(2)}: last year's GP is a weak predictor`)}
    ${kp("ESPN projection weight",Math.round(OMEGA*100)+"%",`chosen on 2025-26 · games weight ${Math.round(OMEGA_G*100)}%`)}
    ${kp("Backtest error",f1(BT.maeB)+" FP/G",`blend · base ${f1(BT.maeM)} · comps ${f1(BT.maeC)} · repeat-last-year ${f1(BT.maeN)} (n=${BT.nBoth})`)}
    ${kp("Comps weight",Math.round(LAM*100)+"%",`chosen by backtest from 0–100%`)}
    ${kp("Breakout base rate",pc(BRK_BASE),`${TRANS.filter(r=>r.brk).length} breakouts in ${TRANS.length} player-seasons`)}
  </div>
  <div class="chart-grid">
    ${scorecardCard()}
    <div class="chart-card"><h4>Next-game model</h4><div class="eq">expected FP = (form + teammates out) × defense vs his position${MP.a!==1?"^"+MP.a:""} × home (±${Math.round(MP.hm*100)}%) × back-to-back (−${Math.round(MP.b2*100)}%)</div>
      <div style="overflow-x:auto"><table><thead><tr><th style="text-align:left">Predicting each game from</th><th title="First month of 2025-26, Oct 21 to Nov 19">Early season</th><th title="Feb to Apr 2026. Weights were chosen on late Nov to Jan games only">Holdout</th></tr></thead><tbody>${MATCHUP.BT.map((r,i)=>`<tr><td style="text-align:left">${r[0]}</td><td>${f1(r[1])}</td><td>${i===MATCHUP.BT.length-2?"<b>"+f1(r[2])+"</b>":f1(r[2])}</td></tr>`).join("")}</tbody></table></div>
      <p>Average miss in fantasy points per game, tested walk-forward on ${MATCHUP.N.toLocaleString()} games: each prediction only uses games before it. Weighting recent games beats a plain season average. Accounting for teammates who sit is the next biggest gain, then the opponent's defense. A player's own record against that team didn't help when choosing weights, so it gets none. One game is noisy whatever you do: 8 in 10 land between ${Math.round(MATCHUP.Q[0]*100)}% and ${Math.round(MATCHUP.Q[1]*100)}% of the prediction.</p></div>
    <div class="chart-card"><h4>Year-over-year stability</h4><div class="eq">FP/G 2025-26 = ${P.stab.a.toFixed(1)} + ${P.stab.b.toFixed(2)} × FP/G 2024-25 · R² ${P.stab.r2.toFixed(2)}</div>
      ${scatter({pts:st.map(d=>({x:d.x,y:d.y,tip:`${d.p.name}: ${f1(d.x)} → ${f1(d.y)}`})),fit:P.stab,diag:true,xl:"FP/G 2024-25",yl:"FP/G 2025-26"})}
      <p>A slope below 1 means extreme seasons drift back toward the middle. This slope sets how hard every projection is pulled toward the pool average. The dashed line marks "no change."</p></div>
    <div class="chart-card"><h4>Age curve</h4><div class="eq">change beyond regression = ${P.ageFit.a.toFixed(1)} ${P.ageFit.b>=0?"+":"−"} ${Math.abs(P.ageFit.b).toFixed(2)} × age · R² ${P.ageFit.r2.toFixed(2)}</div>
      ${scatter({pts:st.map(d=>({x:d.age,y:d.res,tip:`${d.p.name} (${d.age}): ${d.res>=0?"+":""}${f1(d.res)} FP/G vs expected`})),fit:P.ageFit,xl:"Age during 2025-26",yl:"FP/G vs expected"})}
      <p>Each dot is how far a player beat or missed his expected 2025-26 level. Younger players tend to beat it and older players tend to miss.</p></div>
    <div class="chart-card"><h4>Games played persistence</h4><div class="eq">GP 2025-26 = ${(P.gfit.a*82).toFixed(0)} + ${P.gfit.b.toFixed(2)} × GP 2024-25 · R² ${P.gfit.r2.toFixed(2)}</div>
      ${scatter({pts:gpd.map(d=>({x:d.x,y:d.y,tip:`${d.p.name}: ${Math.round(d.x)} → ${Math.round(d.y)} games`})),fit:{a:P.gfit.a*82,b:P.gfit.b},xl:"Games 2024-25",yl:"Games 2025-26"})}
      <p>Availability is noisy, so the games model leans heavily on the average and on known injuries. One healthy year doesn't make a player durable.</p></div>
    <div class="chart-card"><h4>ESPN's 2025-26 projections vs what happened</h4><div class="eq">ESPN MAE ${f1(BTE.maeEspn)} · this model ${f1(BTE.maeModel)} · blend ${f1(BTE.maeBlend)} · naive ${f1(BTE.maeNaive)} (n=${BTE.n})</div>
      ${scatter({pts:BTE.rows.map(r=>({x:r.espn,y:r.act,tip:`${r.p.name}: ESPN projected ${f1(r.espn)}, actual ${f1(r.act)}`})),diag:true,xl:"ESPN preseason projection (FP/G)",yl:"Actual FP/G 2025-26"})}
      ${vbars(BTE.grid.map(g=>({label:Math.round(g.l*100)+"%",v:g.e,tip:`${Math.round(g.l*100)}% ESPN: MAE ${f1(g.e)}`})),{H:170,fmt:v=>v.toFixed(1),yl:"MAE"})}
      <p>ESPN's preseason numbers know about trades, roles and injuries that history can't see; this model knows the long-run trends. The bars show the error for each mix, and the projections use the lowest (${Math.round(OMEGA*100)}% ESPN). For games played the best mix was ${Math.round(OMEGA_G*100)}% ESPN (${f1(BTE.gpBlend)} games off on average vs ${f1(BTE.gpModel)} model-only and ${f1(BTE.gpEspn)} ESPN-only).</p></div>
    <div class="chart-card"><h4>Backtest: predicted vs actual 2025-26</h4><div class="eq">blend MAE ${f1(BT.maeB)} · repeat-last-year MAE ${f1(BT.maeN)} · R² ${BT.fit.r2.toFixed(2)} · ${pc(BT.within5)} within 5 FP/G</div>
      ${scatter({pts:BT.rows.map(r=>({x:r.blend,y:r.act,tip:`${r.p.name}: predicted ${f1(r.blend)}, actual ${f1(r.act)}`})),diag:true,xl:"Predicted FP/G (fit on 2023-25 only)",yl:"Actual FP/G 2025-26"})}
      <p>${BT.maeB<BT.maeN?`The model's misses average ${f1(BT.maeN-BT.maeB)} FP/G smaller than assuming each player repeats last season.`:`On this data the model does not beat simply repeating last season, so lean on the ranges more than the point estimates.`} Points on the dashed line were predicted exactly. Team fit isn't in the backtest because past rosters aren't in the data.</p></div>
    <div class="chart-card"><h4>Where the model disagrees with the board</h4><div class="eq">x = board rank · y = model rank (season points)</div>
      ${scatter({pts:players.map(p=>({x:p.rank,y:p.modelRank,tip:`${p.name}: board #${p.rank}, model #${p.modelRank}`})),diag:true,labels:[ups[0],ups[1],downs[0],downs[1]].map(d=>({x:d.p.rank,y:d.p.modelRank,label:d.p.name.split(" ").pop()})),xl:"Board rank",yl:"Model rank"})}
      <p>Dots below the line are players the model likes more than the board does. Most of the gap comes from games played: injured players drop, and durable role players rise.</p></div>
  </div>
  <div class="chart-grid">
    <div class="chart-card"><h4>Model likes more than the board</h4><table><tbody>${ups.map(d=>`<tr><td class="l"><button class="expander" data-open="${d.p.id}"><span class="pname">${esc(d.p.name)}</span></button></td><td class="num">#${d.p.rank} → #${d.p.modelRank}</td><td class="num zpos">+${d.v}</td></tr>`).join("")}</tbody></table></div>
    <div class="chart-card"><h4>Model likes less than the board</h4><table><tbody>${downs.map(d=>`<tr><td class="l"><button class="expander" data-open="${d.p.id}"><span class="pname">${esc(d.p.name)}</span></button></td><td class="num">#${d.p.rank} → #${d.p.modelRank}</td><td class="num zneg">${d.v}</td></tr>`).join("")}</tbody></table></div>
  </div>`+validationModels()+rookieModels()+breakoutModels()+teamModels()+minutesModels();
}


function vbars(items,{W=480,H=230,fmt=v=>pc(v),yl=""}={}){
  const m={l:40,r:10,t:18,b:40},mx=Math.max(...items.map(d=>d.v),.01)*1.15,bw=(W-m.l-m.r)/items.length,Y=sx([0,mx],[H-m.b,m.t]);let g="";
  ticks(0,mx,4).forEach(t=>g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${fmt(t)}</text>`);
  items.forEach((d,i)=>{const x=m.l+i*bw+bw*.18,w=bw*.64;g+=`<rect class="${d.cls||"bar"}" x="${x}" width="${w}" y="${Y(d.v)}" height="${Math.max(0,Y(0)-Y(d.v))}" rx="4" data-tip="${esc(d.tip||"")}"/><text class="lbl" x="${x+w/2}" y="${Y(d.v)-5}" text-anchor="middle">${fmt(d.v)}</text><text x="${x+w/2}" y="${H-m.b+14}" text-anchor="middle">${esc(d.label)}</text>${d.n!==undefined?`<text x="${x+w/2}" y="${H-m.b+27}" text-anchor="middle">n=${d.n}</text>`:""}`});
  if(yl)g+=`<text x="12" y="${(m.t+H-m.b)/2}" text-anchor="middle" transform="rotate(-90 12 ${(m.t+H-m.b)/2})">${esc(yl)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yl)}">${g}</svg>`}
function rateBy(groups){return groups.map(([label,f])=>{const rs=TRANS.filter(f);return {label,n:rs.length,v:rs.length?rs.filter(r=>r.brk).length/rs.length:0,tip:`${label}: ${rs.filter(r=>r.brk).length} of ${rs.length} broke out`}})}
function breakoutModels(){
  const hist=[...TRANS].filter(r=>r.brk).sort((a,b)=>b.d-a.d);
  const cands=players.filter(p=>p.brk!==null).sort((a,b)=>b.brk-a.brk||b.comps.delta-a.comps.delta).slice(0,12);
  const ageB=rateBy([["≤22",r=>r.f.age<=22],["23–24",r=>r.f.age>=23&&r.f.age<=24],["25–26",r=>r.f.age>=25&&r.f.age<=26],["27–29",r=>r.f.age>=27&&r.f.age<=29],["30+",r=>r.f.age>=30]]);
  const trB=rateBy([["Rose 4+",r=>r.f.trend!==null&&r.f.trend>=4],["Flat",r=>r.f.trend!==null&&Math.abs(r.f.trend)<4],["Fell 4+",r=>r.f.trend!==null&&r.f.trend<=-4],["Unknown",r=>r.f.trend===null]]);
  const fpB=rateBy([["<25",r=>r.f.fp<25],["25–35",r=>r.f.fp>=25&&r.f.fp<35],["35–45",r=>r.f.fp>=35&&r.f.fp<45],["45+",r=>r.f.fp>=45]]);
  return `<h3>Breakouts</h3>
  <div class="chart-grid">
    <div class="chart-card"><h4>Every season-to-season change</h4><div class="eq"><span style="color:var(--accent)">●</span> breakout (+${BRK.min} FP/G and +${Math.round(BRK.rel*100)}%) &nbsp; <span class="mut">●</span> everyone else</div>
      ${scatter({pts:TRANS.filter(r=>r.f.fp>=15&&r.t>=2022).map(r=>({x:r.f.age,y:r.d,cls:r.brk?"":"dim",tip:`${r.p.name} ${sh(r.t)}→${sh(r.t+1)}: ${f1(r.f.fp)} → ${f1(r.next)} (${r.d>=0?"+":""}${f1(r.d)}) at age ${r.f.age}`})),xl:"Age in the starting season",yl:"FP/G change next season"})}
      <p>Players who started a season at 15+ FP/G, 2021-22 through 2025-26. The rates in the next three charts use all ${TRANS.length.toLocaleString()} player-seasons since 2016-17.</p></div>
    <div class="chart-card"><h4>Breakout rate by age</h4><div class="eq">share of player-seasons followed by a breakout</div>${vbars(ageB,{yl:"Breakout rate"})}<p>This is why age gets the heaviest weight when matching comps.</p></div>
    <div class="chart-card"><h4>Breakout rate by prior trend</h4><div class="eq">did the player already rise the year before?</div>${vbars(trB,{yl:"Breakout rate"})}<p>Shows whether momentum carries. "Unknown" are seasons without a prior year in the data, mostly 2023-24 starts.</p></div>
    <div class="chart-card"><h4>Breakout rate by production level</h4><div class="eq">FP/G in the starting season</div>${vbars(fpB,{yl:"Breakout rate"})}<p>Lower-volume players have more room to jump. Stars rarely add 6+ more.</p></div>
    <div class="chart-card"><h4>How much to trust the comps</h4><div class="eq">backtest error by weight on comps (0% = base model only)</div>${vbars(BT.grid.map(g=>({label:Math.round(g.l*100)+"%",v:g.e,tip:`${Math.round(g.l*100)}% comps: MAE ${f1(g.e)} FP/G`})),{fmt:v=>v.toFixed(1),yl:"MAE (FP/G)"})}<p>The weight with the lowest error (${Math.round(LAM*100)}%) is the one the projections use.</p></div>
  </div>
  <div class="chart-grid">
    <div class="chart-card"><h4>2026-27 breakout candidates</h4><div class="tablebox"><table><thead><tr><th class="l">Player</th><th>Odds</th><th>Comps Δ</th><th class="l">Closest comps</th></tr></thead><tbody>
      ${cands.map(p=>`<tr><td class="l"><button class="expander" data-open="${p.id}"><span class="pname">${esc(p.name)}</span></button> <span class="mut">${p.age}</span></td><td class="num zpos">${pc(p.brk)}</td><td class="num">${p.comps.delta>=0?"+":""}${f1(p.comps.delta)}</td><td class="l mut" style="white-space:normal;min-width:180px">${p.comps.list.slice(0,3).map(x=>esc(x.r.p.name.split(" ").pop())+" "+sh(x.r.t)).join(", ")}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="chart-card"><h4>Breakouts in the data</h4><div class="tablebox"><table><thead><tr><th class="l">Player</th><th>Season</th><th>Age</th><th>FP/G</th><th>Δ</th></tr></thead><tbody>
      ${hist.slice(0,16).map(r=>`<tr><td class="l">${pBtn(r.p)}</td><td class="num">${sh(r.t)}→${sh(r.t+1)}</td><td class="num">${r.f.age}</td><td class="num">${f1(r.f.fp)}→${f1(r.next)}</td><td class="num zpos">+${f1(r.d)}</td></tr>`).join("")}</tbody></table></div></div>
  </div>`;
}
function teamModels(){
  const rows=TEAMS.teams.map(t=>({t,d:TEAMS.info[t].minSum-240,u:TEAMS.info[t].useSum-TEAMS.plays})).sort((a,b)=>b.d-a.d);
  const W=480,rh=19,H=rows.length*rh+30,mx=Math.max(...rows.map(r=>Math.abs(r.d)),1),X=sx([-mx,mx],[60,W-40]);let g=`<line class="ax" x1="${X(0)}" x2="${X(0)}" y1="4" y2="${H-22}"/>`;
  rows.forEach((r,i)=>{const y=6+i*rh,x0=Math.min(X(0),X(r.d)),w=Math.abs(X(r.d)-X(0));
    g+=`<text x="54" y="${y+12}" text-anchor="end" class="lbl">${r.t}</text><rect class="${r.d>0?"bar":"bar3"}" x="${x0}" y="${y+2}" width="${Math.max(1.5,w)}" height="13" rx="3" data-tip="${r.t}: rotation projects to ${f0(r.d+240)} min/g before the cap; usage ${r.u>=0?"+":""}${f1(r.u)} plays vs league average"/><text x="${r.d>0?X(r.d)+4:X(r.d)-4}" y="${y+12}" text-anchor="${r.d>0?"start":"end"}">${r.d>=0?"+":""}${f0(r.d)}</text>`});
  g+=`<text x="${X(-mx/2)}" y="${H-6}" text-anchor="middle">minutes to spare →</text><text x="${X(mx/2)}" y="${H-6}" text-anchor="middle">← over the 240 cap</text>`;
  const fitters=[...players].filter(p=>!p.rook).sort((a,b)=>b.fit.tot-a.fit.tot);
  const row=p=>`<tr><td class="l">${pBtn(p,"pname")} <span class="mut">${p.fit.moved?p.prevTeam+"→":""}${p.team}</span></td><td class="num ${p.fit.tot>=1?"zpos":"zneg"}">${p.fit.tot>=1?"+":""}${Math.round((p.fit.tot-1)*100)}%</td><td class="num mut">use ${p.fit.m>=1?"+":""}${Math.round((p.fit.m-1)*100)}% · min ${p.fit.mMin>=1?"+":""}${Math.round((p.fit.mMin-1)*100)}%</td></tr>`;
  if(!TEAMFIT_ON)return `<h3>Team fit</h3><div class="chart-grid">
    <div class="chart-card"><h4>Which rotations are overbooked</h4><div class="eq">projected minutes per game for each 2026-27 roster minus the 240 available</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Team minutes over or under the cap">${g}</svg>
      <p>Built from every player who has appeared for each team this season, with injured players counted only for the games they're expected to play.</p></div>
    <div class="chart-card"><h4>Why team fit is switched off</h4><p style="font-size:13px;color:var(--ink)">The model squeezed overbooked rotations and backtested that across 2023-24, 2024-25 and 2025-26. At every strength it made both minutes and fantasy-point predictions <b>worse</b> than leaving players' own trends alone (see the two strength charts under Validation). Players' history already reflects most of their role, and a mechanical cap mostly added noise. So the projections don't apply it. The chart on the left still shows which rotations look crowded, as context for your own judgment.</p></div>
  </div>`;
  return `<h3>Team fit</h3><div class="chart-grid">
    <div class="chart-card"><h4>Which rotations are overbooked</h4><div class="eq">projected minutes per game for each 2026-27 roster minus the 240 available</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Team minutes over or under the cap">${g}</svg>
      <p>Built from every player who has appeared for each team this season, with injured players counted only for the games they're expected to play. Orange teams have more projected minutes than exist, so the cap squeezes everyone, stars least. The squeeze strength (${BTALL.betaM} for minutes, ${BTALL.betaU} for usage) was fit by backtesting the same method on 2023-24 through 2025-26 rosters.</p></div>
    <div class="chart-card"><h4>Biggest team-fit boosts</h4><table><tbody>${fitters.slice(0,10).map(row).join("")}</tbody></table>
      <h4 style="margin-top:14px">Biggest team-fit squeezes</h4><table><tbody>${fitters.slice(-10).reverse().map(row).join("")}</tbody></table></div>
  </div>`;
}
const SEASON_LONG=y=>`${y-1}-${String(y).slice(2)}`;
function rookieModels(){const R=ROOK,pts=R.pl.filter(x=>x.y>=2020).map(x=>({x:Math.log(x.pick),y:x.fp,tip:`${DB[x.pid].n} (${shortY(x.y)}, pick #${x.pick}): ${f1(x.fp)} FP/G in ${x.r.gp} games`}));
  const curve=[1,2,3,5,8,12,20,30,45,60].map(k=>({x:Math.log(k),y:R.fpAt(k,20)}));
  return `<h3>Rookies</h3><div class="chart-grid">
    <div class="chart-card"><h4>Rookie production by draft pick</h4><div class="eq">rookie FP/G = ${R.w[0].toFixed(1)} − ${Math.abs(R.w[1]).toFixed(2)} × ln(pick) ${R.w[2]>=0?"+":"−"} ${Math.abs(R.w[2]).toFixed(2)} × (age − 20) · n=${R.n} rookies with 20+ games · residual SD ${f1(R.sd)}</div>
      ${scatter({pts,fit:null,xl:"ln(draft pick): 0 = #1 · 1.1 = #3 · 2.3 = #10 · 3.4 = #30 · 4.1 = #60",yl:"Rookie FP/G"})}
      <p>Each dot is a rookie season since 2019-20. Value falls fast after the top few picks, and a rookie a year older produces a little more. Most second-rounders never reach 20 games.</p></div>
    <div class="chart-card"><h4>What happened to each draft range</h4><div class="tablebox"><table><thead><tr><th class="l">Picks</th><th>Rookies</th><th>Played 20+</th><th>Share of games</th><th>Median FP/G</th><th>Top quarter</th></tr></thead><tbody>
      ${R.BANDS.map(b=>`<tr><td class="l">${b.lo}–${b.hi}</td><td class="num">${b.n}</td><td class="num">${pc(b.played)}</td><td class="num">${pc(b.gpr)}</td><td class="num">${f1(b.med)}</td><td class="num">${f1(b.q75)}</td></tr>`).join("")}</tbody></table></div>
      <p style="margin-top:8px">Tested on the 2025-26 class (22 rookies with ESPN projections and 20+ games): ESPN alone missed by 4.62 FP/G, the draft model alone by 5.10, and a 50/50 blend by 4.32. ESPN over-projected that class by 1.6 FP/G on average. Rookie projections use the 50/50 blend. It's one class, so treat the exact weight loosely.</p></div>
  </div>`}
function validationModels(){
  const B=BTALL,kp=(k,v,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const W=480,H=260,m={l:44,r:14,t:14,b:40},X=sx([0,.6],[m.l,W-m.r]),Y=sx([0,.6],[H-m.b,m.t]);
  let g=`<line class="diag" x1="${X(0)}" y1="${Y(0)}" x2="${X(.6)}" y2="${Y(.6)}"/>`;[0,.2,.4,.6].forEach(t=>{g+=`<line class="gr" x1="${m.l}" x2="${W-m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l-6}" y="${Y(t)+3}" text-anchor="end">${pc(t)}</text><text x="${X(t)}" y="${H-m.b+14}" text-anchor="middle">${pc(t)}</text>`});
  B.bins.filter(b=>b.n>=5).forEach(b=>g+=`<circle class="dot" cx="${X(Math.min(.6,b.pred))}" cy="${Y(Math.min(.6,b.act))}" r="${4+Math.min(8,Math.sqrt(b.n)/2)}" data-tip="Predicted ${pc(b.pred)} breakout odds → ${pc(b.act)} actually broke out (n=${b.n})"/>`);
  g+=`<text x="${(m.l+W-m.r)/2}" y="${H-6}" text-anchor="middle">Predicted breakout odds</text><text x="12" y="${(m.t+H-m.b)/2}" text-anchor="middle" transform="rotate(-90 12 ${(m.t+H-m.b)/2})">Actual breakout rate</text>`;
  return `<h3>Validation</h3>
  <div class="kpis">
    ${kp("Walk-forward error",f1(WF.best.err)+" FP/G",`on seasons it never saw · old fixed settings ${f1(WF.best.def)} · same-as-last-year ${f1(WF.best.naive)}`)}
    ${kp("80% range coverage",pc(B.coverCal),`was ${pc(B.coverRaw)} before calibration (σ ×${SIGSCALE.toFixed(2)})`)}
    ${kp("Minutes error",f1(B.minFit)+" min",`${f1(B.minNo)} without the 240-minute cap`)}
    ${kp("Comps weight",Math.round(LAM*100)+"%",`k=${KNN} nearest of ${TRAIN.length.toLocaleString()} player-seasons`)}
    ${kp("Computed in your browser",(MODEL_MS/1000).toFixed(1)+" s","every fit, backtest and simulation on page load")}
  </div>
  <div class="chart-grid">
    <div class="chart-card"><h4>Error by season, walking forward</h4><div class="eq"><span style="color:var(--accent)">■</span> walk-forward tuned &nbsp;<span class="mut">■</span> old fixed settings &nbsp;<span style="color:var(--mine)">■</span> same as last year</div>${vbars(B.perT.flatMap(t=>[{label:"",v:t.model,tip:`${SEASON_LONG(t.T)}: tuned model ${f1(t.model)} FP/G (n=${t.n})`},{label:SEASON_LONG(t.T),v:t.def,cls:"bar2",tip:`${SEASON_LONG(t.T)}: old fixed settings ${f1(t.def)}`},{label:"",v:t.naive,cls:"bar3",tip:`${SEASON_LONG(t.T)}: same as last year ${f1(t.naive)}`}]),{fmt:v=>v.toFixed(1),yl:"MAE (FP/G)"})}
      <p>For each season: the walk-forward model, my original hand-picked settings, and "same as last year". 2025-26 was the hardest season to predict for every method.</p></div>
    <div class="chart-card"><h4>What each season taught the next</h4><div class="tablebox"><table><thead><tr><th class="l">Predicting</th><th>Season weights</th><th>Comps</th><th>Comps wt</th><th>Min model</th><th>Team fit</th><th>Error</th></tr></thead><tbody>
      ${WF.best.ys.map(y=>`<tr><td class="l">${SEASON_LONG(y.T)}<br><span class="mut">tuned on ${SEASON_LONG(WF_YEARS[0])} to ${SEASON_LONG(y.T-1)}</span></td><td class="num">${WSETS[y.P.wi].join(" / ")}</td><td class="num">${KS[y.P.ki]}</td><td class="num">${pc(y.P.lam)}</td><td class="num">${pc(y.P.mu)}</td><td class="num">${BETAS[y.P.iM]} / ${BETAS[y.P.iU]}</td><td class="num">${f1(y.model)}</td></tr>`).join("")}
      <tr style="font-weight:600"><td class="l">2026-27 (now)<br><span class="mut">tuned on all seven seasons</span></td><td class="num">${WSETS[WF.FINAL.wi].join(" / ")}</td><td class="num">${KS[WF.FINAL.ki]}</td><td class="num">${pc(WF.FINAL.lam)}</td><td class="num">${pc(WF.FINAL.mu)}</td><td class="num">${BETAS[WF.FINAL.iM]} / ${BETAS[WF.FINAL.iU]}</td><td class="num">–</td></tr></tbody></table></div>
      <p>Season weights run oldest → newest. Older seasons count ${WF.best.rho===1?"the same as recent ones":`${WF.best.rho}× as much per year back`} when tuning; that decay was also picked by walk-forward error (${WF.runs.map(r=>`${r.rho}: ${r.err.toFixed(3)}`).join(", ")}). Team fit shows minutes / usage strength.</p></div>
    <div class="chart-card"><h4>Are the breakout odds honest?</h4><div class="eq">grouped predictions vs what happened (dashed = perfect)</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Breakout calibration">${g}</svg>
      <p>Each dot groups backtest players by the raw comps odds. The raw odds ran high, so displayed odds are mapped through this curve: a raw 35% becomes about ${pc(BRKCAL(.35))}.</p></div>
    <div class="chart-card"><h4>Team-fit strength: minutes</h4><div class="eq">minutes error by squeeze strength (0 = no cap)</div>${vbars(B.gridTM.map(x=>({label:String(x.l),v:x.e,tip:`strength ${x.l}: ${f1(x.e)} min MAE`})),{fmt:v=>v.toFixed(2),yl:"MAE (min/g)"})}<p>The projections use the lowest-error strength (${B.betaM}).</p></div>
    <div class="chart-card"><h4>Team-fit strength: usage</h4><div class="eq">fantasy-point error by usage squeeze strength</div>${vbars(B.gridTU.map(x=>({label:String(x.l),v:x.e,tip:`strength ${x.l}: ${f1(x.e)} FP/G MAE`})),{fmt:v=>v.toFixed(2),yl:"MAE (FP/G)"})}<p>The projections use the lowest-error strength (${B.betaU}).</p></div>
  </div>`;
}
function minutesModels(){
  const P=PRMM,ch=P.chart,kp=(k,v,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const vets=players.filter(p=>!p.rook&&p.lastMpg);
  const risers=[...vets].sort((a,b)=>(b.projMpg-b.lastMpg)-(a.projMpg-a.lastMpg));
  const under=[...players].filter(p=>p.projMpg<27).sort((a,b)=>b.fp36-a.fp36).slice(0,10);
  const lab=[];under.forEach(p=>{if(lab.length<4&&!lab.some(q=>Math.abs(q.x-p.projMpg)<1.6&&Math.abs(q.y-p.fp36)<2.5))lab.push({x:p.projMpg,y:p.fp36,label:p.name.replace(/ (Jr\.|II|III)$/,"").split(" ").pop()})});
  const row=p=>`<tr><td class="l"><button class="expander" data-open="${p.id}"><span class="pname">${esc(p.name)}</span></button> <span class="mut">${p.team}</span></td><td class="num">${f1(p.lastMpg)} → ${f1(p.projMpg)}</td><td class="num ${p.projMpg>=p.lastMpg?"zpos":"zneg"}">${p.projMpg>=p.lastMpg?"+":""}${f1(p.projMpg-p.lastMpg)}</td></tr>`;
  return `<h3>Minutes &amp; per-minute</h3>
  <div class="kpis">
    ${kp("Per-game carryover",`R² ${P.gfit.r2.toFixed(2)}`,`FP/G year to year · slope ${P.gfit.b.toFixed(2)}`)}
    ${kp("Per-minute carryover",`R² ${P.rfit.r2.toFixed(2)}`,`FP per minute year to year · slope ${P.rfit.b.toFixed(2)}`)}
    ${kp("Minutes carryover",`R² ${P.mfit.r2.toFixed(2)}`,`MPG year to year · slope ${P.mfit.b.toFixed(2)}`)}
    ${kp("Minutes-model weight",Math.round(MU*100)+"%",`chosen by backtest · MAE ${f1(BTM.maeBest)} vs ${f1(BTM.maeMain)} without (n=${BTM.n})`)}
    ${kp("Age effect on minutes",(P.mAge.b>=0?"+":"")+P.mAge.b.toFixed(2),`min/g per year of age`)}
  </div>
  <div class="chart-grid">
    <div class="chart-card"><h4>${P.rfit.r2>P.gfit.r2?"Per-minute production is stickier than per-game":"Per-minute vs per-game stability"}</h4><div class="eq">FP/36 2025-26 = ${(P.rfit.a*36).toFixed(1)} + ${P.rfit.b.toFixed(2)} × FP/36 2024-25 · R² ${P.rfit.r2.toFixed(2)}</div>
      ${scatter({pts:ch.map(d=>({x:d.rx*36,y:d.ry*36,tip:`${d.p.name}: ${f1(d.rx*36)} → ${f1(d.ry*36)} FP/36`})),fit:{a:P.rfit.a*36,b:P.rfit.b},diag:true,xl:"FP/36 2024-25",yl:"FP/36 2025-26"})}
      <p>${P.rfit.r2>P.gfit.r2?"How productive a player is per minute carries over better than his per-game total, which also depends on his role.":`In this data, per-minute production (R² ${P.rfit.r2.toFixed(2)}) carries over slightly less well than per-game totals (R² ${P.gfit.r2.toFixed(2)}). The minutes figures are approximate, and that noise lands on the per-minute rate.`} Splitting the two still separates a role change from a skill change.</p></div>
    <div class="chart-card"><h4>Minutes year to year</h4><div class="eq">MPG 2025-26 = ${P.mfit.a.toFixed(1)} + ${P.mfit.b.toFixed(2)} × MPG 2024-25 · R² ${P.mfit.r2.toFixed(2)}</div>
      ${scatter({pts:ch.map(d=>({x:d.mx,y:d.my,tip:`${d.p.name}: ${f1(d.mx)} → ${f1(d.my)} min`})),fit:P.mfit,diag:true,xl:"MPG 2024-25",yl:"MPG 2025-26"})}
      <p>Dots above the dashed line earned a bigger role. The regression line is what the minutes model expects before team fit and age.</p></div>
    <div class="chart-card"><h4>Production rate vs projected minutes</h4><div class="eq">x = projected MPG · y = projected FP/36</div>
      ${scatter({pts:players.map(p=>({x:p.projMpg,y:p.fp36,cls:p.rook?"dim":"",tip:`${p.name}: ${f1(p.fp36)} FP/36 in ${f1(p.projMpg)} min → ${f1(p.proj.fp)} FP/G`})),labels:lab,xl:"Projected minutes per game",yl:"Projected FP per 36"})}
      <p>Top-left players produce like starters in a bench role. They gain the most if an injury or trade opens minutes. Grey dots are rookies.</p></div>
    <div class="chart-card"><h4>How much to trust the minutes model</h4><div class="eq">backtest error by weight on rate × minutes (0% = main model only)</div>${vbars(BTM.grid.map(g=>({label:Math.round(g.l*100)+"%",v:g.e,tip:`${Math.round(g.l*100)}%: MAE ${f1(g.e)} FP/G`})),{fmt:v=>v.toFixed(1),yl:"MAE (FP/G)"})}<p>${MU>0?`The projections use the weight with the lowest error (${Math.round(MU*100)}%).`:"On this data, rate × minutes doesn't beat the main model at any weight, so it gets 0%. Projected minutes still drive team fit, the per-minute view and the minutes-upside card."}</p></div>
  </div>
  <div class="chart-grid">
    <div class="chart-card"><h4>Biggest projected minutes gains</h4><table><tbody>${risers.slice(0,10).map(row).join("")}</tbody></table></div>
    <div class="chart-card"><h4>Biggest projected minutes losses</h4><table><tbody>${risers.slice(-10).reverse().map(row).join("")}</tbody></table></div>
    <div class="chart-card"><h4>Most productive per minute in a limited role</h4><table><tbody>${under.map(p=>`<tr><td class="l"><button class="expander" data-open="${p.id}"><span class="pname">${esc(p.name)}</span></button> <span class="mut">${p.team}</span></td><td class="num">${f1(p.fp36)} FP/36</td><td class="num mut">${f1(p.projMpg)} min</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}
// ================= NEWS =================
// the top of News: what today's injuries and headlines mean for you. In Season that's your roster; in Draft Day it's
// the players likely to be there at your next pick, plus the top of the board
function newsFocus(){const my=myRoster(),season=S.mode==="season"&&my.length;
  if(season)return {season,label:"your roster",head:"Injured on your roster",set:new Set(my.map(p=>p.id)),list:my};
  const D=draftState(),near=D.nx?D.av.filter(p=>{const a=availAt(p,D.nx);return a>=.2&&a<=.95&&p.rank<=D.nx+30}):[],top=D.av.filter(p=>p.rank<=40);
  const list=[...new Set([...near,...top])];return {season,label:D.nx?`players near your pick #${D.nx} or high on the board`:"players high on the board",head:D.nx?`Injured near your pick #${D.nx} or high on the board`:"Injured high on the board",set:new Set(list.map(p=>p.id)),list,near:new Set(near.map(p=>p.id)),nx:D.nx}}
function newsSummary(){const F=newsFocus(),back=p=>p.inj?retText(p.inj.ret,p.inj.fs):"no return date yet",
  missed=p=>Math.max(0,p.teamLeft-p.avail),hurt=F.list.filter(p=>p.out||p.dtd).sort((a,b)=>(b.out-a.out)||b.projTot-a.projTot),
  fresh=[...ESPN_NEWS].sort((a,b)=>String(b.p).localeCompare(String(a.p))),mine=fresh.filter(a=>a.tags.some(t=>byName[t]&&F.set.has(byName[t].id))).slice(0,4),
  allOut=ESPN_INJ.filter(i=>byName[i.n]).length,since=fresh.length?Math.round((Date.parse(FETCHED+"T12:00:00")-Date.parse(fresh[fresh.length-1].p))/864e5):0;
  const li=[];
  if(hurt.length)hurt.slice(0,6).forEach(p=>li.push(`<li class="${p.out?"warn":""}">${pBtn(p)} <span class="chip ${p.out?"out":"dtd"}">${p.out?"Out":"Day-to-day"}</span> <span class="mut">${back(p)}${p.out&&missed(p)?` · misses about ${missed(p)} game${missed(p)===1?"":"s"}`:""}${F.near&&F.near.has(p.id)?` · likely there at #${F.nx}`:""}</span></li>`));
  else li.push(`<li class="good">Nobody in ${F.label} is on the injury report.</li>`);
  return `<div class="chart-card news-sum"><h4>${F.season?"What today's news means for your team":"What today's news means for your draft"}</h4>
    <div class="eq">${allOut} players in the pool are on ESPN's injury report · ${fresh.length} headlines ${since<=1?"from the past day":`from the past ${since} days`}</div>
    <div class="sum-grid"><div><h5>${F.head}</h5><ul class="heads">${li.join("")}</ul>${hurt.length>6?`<p class="empty">and ${hurt.length-6} more below</p>`:""}</div>
    <div><h5>Headlines about them</h5>${mine.length?`<ul class="heads">${mine.map(a=>`<li><b>${esc(a.h)}</b><br><span class="mut">${new Date(a.p).toLocaleDateString(undefined,{month:"short",day:"numeric"})} · ${a.tags.filter(t=>byName[t]&&F.set.has(byName[t].id)).map(t=>pBtn(byName[t])).join(", ")}</span></li>`).join("")}</ul>`:`<p class="empty">None of today's headlines mention ${F.label}.</p>`}</div></div>
    <div class="row-btns" style="margin-top:10px" id="briefRow" ${sample?"":"hidden"}><button class="btn primary" id="briefBtn">Write me a briefing</button><span class="mut" style="font-size:12px;align-self:center">Claude reads today's headlines and injury report with ${F.season?"your roster":"your draft position"} in mind</span></div>
    <div class="ai-out" id="briefOut" hidden></div></div>`}
async function newsBrief(){const out=$("briefOut"),F=newsFocus();out.hidden=false;out.textContent="Reading today's news…";
  const fresh=[...ESPN_NEWS].sort((a,b)=>String(b.p).localeCompare(String(a.p))).slice(0,30),inj=ESPN_INJ.filter(i=>byName[i.n]&&F.set.has(byName[i.n].id));
  const who=F.list.slice(0,40).map(p=>`${p.name} (${p.team}, ${p.pos.join("/")}, proj ${f1(p.proj.fp)} FP/G${p.out?", OUT":p.dtd?", day-to-day":""})`).join("; ");
  const prompt=`I play in an ESPN head-to-head points fantasy basketball league. ${F.season?"These are the players on my roster":`My next draft pick is #${F.nx}. These are the players I'm considering`}: ${who}.
Today's injury report for them:\n${inj.map(i=>`- ${i.n}: ${i.status}${i.ret?`, expected back ${i.ret}`:""}. ${i.short}`).join("\n")||"(none)"}
Today's NBA headlines:\n${fresh.map(a=>`- ${a.h}: ${a.d}`).join("\n")}
Write a short briefing for me: at most 5 bullet points, most important first. Only include items that change a decision for me (${F.season?"who to start, bench, drop or pick up":"who to draft, avoid or wait on"}). Name players and say what to do. Use only the information above. Plain text, bullets starting with "-".`;
  try{const r=await sample(prompt,{modelTier:"default",onText:({text})=>{out.textContent=text}});out.textContent=r.text}
  catch(e){out.textContent=e&&e.code==="not_granted"?"Claude access wasn't allowed for this page. You can turn it on from the artifact's Permissions menu.":e&&e.code==="rate_limited"?"Too many requests just now. Try again in a minute.":"Couldn't write the briefing: "+(e&&e.message||"unknown error")}}
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("#briefBtn"))newsBrief()});
function renderNews(){
  const fmt=d=>new Date(d).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  const poolNames=new Set(players.map(p=>p.name));
  const inj=[...ESPN_INJ].filter(i=>poolNames.has(i.n)).sort((a,b)=>(a.status===b.status?0:a.status==="Out"?-1:1)||String(b.ret||"").localeCompare(String(a.ret||"")));
  const moves=players.filter(p=>p.prevTeam&&p.prevTeam!==p.team).sort((a,b)=>a.rank-b.rank);
  const pb=n=>{const p=byName[n];return p?`<button class="expander" data-open="${p.id}"><b>${esc(n)}</b></button>`:`<b>${esc(n)}</b>`};
  $("newsCount").textContent=ESPN_NEWS.length;
  $("newsList").innerHTML=newsSummary()+`<div class="news-sec"><h3>Injury report · drafted-range players (${inj.length})</h3><div class="news">${inj.map(i=>`<div class="item ${i.status==="Out"?"out":"dtd"}"><div class="h">${pb(i.n)} <span class="mut">· ${esc(i.team)}</span> <span class="chip ${i.status==="Out"?"out":"dtd"}">${esc(i.status)}</span>${` <span class="mut">${retText(i.ret,i.fs)}</span>`}</div><p>${esc(i.short)}</p></div>`).join("")}</div></div>
  <div class="news-sec"><h3>Latest NBA news</h3><div class="news">${[...ESPN_NEWS].sort((a,b)=>String(b.p).localeCompare(String(a.p))).map(a=>`<div class="item"><div class="h">${esc(a.h)}</div><p>${esc(a.d)}</p><div class="src"><span class="mut">${fmt(a.p)}</span> · <a href="${a.u}" target="_blank" rel="noopener">ESPN ↗</a>${a.tags.filter(t=>poolNames.has(t)).map(t=>` · ${pb(t)}`).join("")}</div></div>`).join("")}</div></div>
  <div class="news-sec"><h3>New teams since last season (${moves.length})</h3><div class="news">${moves.map(p=>`<div class="item move"><div class="h">${pb(p.name)} <span class="mut">${p.prevTeam} → ${p.team}</span></div></div>`).join("")}</div></div>
  <p class="empty" style="margin-top:14px">ESPN news and injury report fetched ${FETCHED}; team changes from Basketball Reference and ESPN rosters.</p>`;
}
function renderAll(){DAYS=null;applyOrder();renderBoard();renderSide();if(openId!==null)openPlayer(openId);if(!$("view-insights").hidden)renderInsights();if(!$("view-players").hidden)renderPlayers();if(!$("view-today").hidden)renderToday();["season","waivers","trades","rosters"].forEach(t=>{if(!$("view-"+t).hidden)renderSeason(t)});save()}

// ================= LEAGUE SCORING =================
function renderScoring(){
  const keys=Object.keys(SCORING_LABELS);
  $("scoringBox").innerHTML=`<div class="tablebox" style="max-width:520px"><table><thead><tr><th class="l">Stat</th><th>ESPN default</th><th>Your league</th></tr></thead><tbody>
    ${keys.map(k=>`<tr><td class="l">${SCORING_LABELS[k]}</td><td class="num">${ESPN_SCORING[k]>0?"+":""}${ESPN_SCORING[k]}</td><td class="num"><input type="number" step="0.5" id="sc-${k}" value="${SC[k]}" style="width:72px;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:4px 6px;text-align:right${SC[k]!==ESPN_SCORING[k]?";border-color:var(--accent)":""}"></td></tr>`).join("")}
    </tbody></table></div>
    <div class="row-btns" style="margin-top:8px"><button class="btn primary" id="scApply">Save and recompute</button><button class="btn" id="scReset">Use ESPN defaults</button></div>
    <p class="empty" style="margin-top:6px">${SC_CUSTOM?"<b>Custom scoring is active.</b> ":"Using ESPN's default H2H Points scoring. "}Saving reloads the page and refits every model with these values (about 3 seconds). Bonuses for double-doubles, triple-doubles and other stats aren't supported. Category leagues ignore these values and use ESPN's 8 categories.</p>`;
  const save=o=>{try{localStorage.setItem("hoopsDraftRoom.scoring",JSON.stringify(o));location.reload()}catch(e){toast("Couldn't save in this browser (storage is blocked)")}};
  $("scApply").onclick=()=>{const o={};for(const k of keys){const v=parseFloat($("sc-"+k).value);if(!isFinite(v)){toast(`Enter a number for ${SCORING_LABELS[k]}`);return}o[k]=v}save(o)};
  $("scReset").onclick=()=>save({...ESPN_SCORING});
}
// ================= YOUR MIX =================
function setMix(m){S.mix=m;MIX=applyMix(S.mix,S.adj);RLO=Math.min(...players.map(p=>p.lo));RHI=Math.max(...players.map(p=>p.hi));renderAll();renderModels();renderMix()}
function renderMix(){const GNOW=Math.round(quant(players.filter(p=>p.now&&p.now.gp).map(p=>p.now.gp),.5))||4;
  const m=MIX,jer=byName["Ty Jerome"],sl=(id,lab,val,note)=>`<div class="mix-row"><label for="${id}">${lab} <b id="${id}-v">${Math.round(val*100)}%</b></label><input type="range" id="${id}" min="0" max="100" step="5" value="${Math.round(val*100)}"><div class="mix-note">${note}</div></div>`;
  const n=Object.keys(S.adj).length;
  $("mixBody").innerHTML=sl("mxEspn","ESPN projection",m.espn,`vs this model. Backtest best: ${Math.round(OMEGA*100)}%.`)
    +sl("mxCur","This season's games",m.cur,`How fast to trust 2026-27: right now ${GNOW} games count for ${pc(m.cur>0?GNOW/(GNOW+curK(m.cur)):0)} of a projection. Walk-forward tested on game logs: tuned on 2024-25, 45% was best (half trust at 11.5 games), and on 2025-26, which the tuning never saw, 45% was best again, missing rest-of-season FP/G by 3.75 on average against 3.76 at 50% and 3.82 at 65%.`)
    +sl("mxFp","FantasyPros experts",m.fpro,`Roto consensus of ${FPRO_META.experts} experts, updated ${FPRO_META.updated.replace("\\","")}. Not backtested.`)
    +`<div class="mix-row"><label for="lineupMode">How often you set your lineup</label><select id="lineupMode"><option value="daily" ${S.lineup!=="weekly"?"selected":""}>Every day (best possible)</option><option value="weekly" ${S.lineup==="weekly"?"selected":""}>Once a week</option></select><div class="mix-note">Daily: anyone with a game can fill an open slot, so balance matters less. Weekly: your 10 starters are locked all week and the bench scores nothing, so positions and weekly game counts matter much more.</div></div>`
    +`<div class="mix-row"><label for="minC">Minimum centers (C-eligible players)</label><div class="row-btns"><select id="minC">${[0,1,2,3].map(v=>`<option value="${v}" ${(S.minC??2)===v?"selected":""}>${v===0?"No minimum":"At least "+v}</option>`).join("")}</select><select id="minCBy" aria-label="by round">${[4,5,6,7,8,9,10,11,12,13].map(v=>`<option value="${v}" ${(S.minCBy??8)===v?"selected":""}>by round ${v}</option>`).join("")}</select></div><div class="mix-note">The Pick Advisor plans your next picks so this is met by that round, and switches to centers only when it has to. Players with C among their ESPN positions count (e.g. PF/C).</div></div>`
    +`<div class="mix-row"><label class="chk" for="fillAll" style="color:var(--ink)"><input type="checkbox" id="fillAll" ${S.fillAll!==false?"checked":""}> Fill every position by the end of the draft</label><div class="mix-note">At least one PG, SG, SF and PF (and your center minimum). ESPN's cap of ${C_CAP} primary centers is always enforced.</div></div>`
    +`<div class="mix-row"><label for="poW">Fantasy playoff weeks count</label><select id="poW">${[1,1.5,2,3].map(v=>`<option value="${v}" ${(S.poW||1.5)===v?"selected":""}>${v}× a regular week</option>`).join("")}</select><div class="mix-note">For the Pick Advisor's head-to-head value. Weeks 20–23 (Mar 15 – Apr 11) decide titles; you only need a top-4 regular season.</div></div>`
    +`<div class="row-btns" style="margin-top:6px"><button class="btn" id="mixReset">Reset to backtest defaults</button>${n?`<button class="btn" id="adjClear">Clear my ${n} player take${n>1?"s":""}</button>`:""}</div>`
    +(jer?`<p class="empty" style="margin-top:6px">Example: Ty Jerome projects ${f1(jer.proj.fp)} FP/G (model #${jer.modelRank}) with this mix.</p>`:"");
  [["mxEspn","espn"],["mxCur","cur"],["mxFp","fpro"]].forEach(([id,k])=>{const el=$(id);
    el.oninput=()=>{$(id+"-v").textContent=el.value+"%"};
    el.onchange=()=>setMix({...S.mix,[k]:el.value/100})});
  $("mixReset").onclick=()=>{S.poW=1.5;S.minC=2;S.minCBy=8;S.fillAll=true;setMix({})};
  $("poW").onchange=e=>{S.poW=+e.target.value;renderAll()};
  $("minC").onchange=e=>{S.minC=+e.target.value;renderAll()};$("fillAll").onchange=e=>{S.fillAll=e.target.checked;renderAll()};$("minCBy").onchange=e=>{S.minCBy=+e.target.value;renderAll()};
  $("lineupMode").onchange=e=>{S.lineup=e.target.value;renderAll();toast(e.target.value==="weekly"?"Valuing rosters as if you set lineups once a week":"Valuing rosters as if you set lineups daily")};
  if($("adjClear"))$("adjClear").onclick=()=>{S.adj={};setMix(S.mix);toast("Cleared your player takes")};
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-adj],[data-ovr]");if(!b)return;
  if(b.dataset.adj!==undefined){const m=+b.dataset.adj,k=b.dataset.pid;if(m===0)delete S.adj[k];else S.adj[k]={m};}
  else{const v=parseFloat($("ovr").value),k=b.dataset.ovr;if(!(v>=0)){toast("Enter a number of fantasy points per game");return}S.adj[k]={o:v}}
  setMix(S.mix);const p=players.find(x=>String(x.espnId)===String(b.dataset.pid||b.dataset.ovr));if(p)toast(`${p.name}: ${f1(p.proj.fp)} FP/G, model #${p.modelRank}`)});
// ================= NAME VALUE =================
// How recognisable a player is, for "name" drafters: All-Star and All-NBA selections and top-5 MVP finishes since 2016-17,
// peak scoring, contract size, and the hype around this year's top draft picks. A judgment-based score (it can't be backtested).
(()=>{const HYPE={1:12,2:10,3:9,4:7,5:6};players.forEach(p=>{const f=p.pid&&FAME_DATA[p.pid]||[0,0,0,0];
  p.fameParts=f;p.fame=4*f[0]+3*f[1]+3*f[2]+Math.max(0,f[3]-15)/2+(p.sal||0)/6e6+(p.draft&&HYPE[p.draft.pick]||0)});
  [...players].sort((a,b)=>b.fame-a.fame).forEach((p,i)=>p.fameRank=i+1)})();
// ================= MOCK DRAFT =================
// Computer teams draft from ESPN ADP with noise (or from this model, for a sharper room) and fill their lineups sensibly.
const MOCK=()=>!!(S.mock&&S.mock.active);
const ROUNDS=13,mockDone=()=>S.picks.length>=S.teams*ROUNDS;
function mockRng(){let t=(S.mock.seed+S.picks.length*7919)>>>0;return ()=>{t=t+0x6D2B79F5|0;let x=Math.imul(t^t>>>15,1|t);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296}}
function teamRoster(team){return S.picks.filter(x=>teamAt(x.o)===team).map(x=>players[x.id])}
const ROOMS={adp:{label:"Like ESPN drafters (ADP)",mix:{adp:1}},mix:{label:"Realistic mix: mostly ADP, some name drafters, one sharp",mix:{adp:.6,name:.3,sharp:.1}},
  casual:{label:"Casual league: mostly name drafters",mix:{adp:.3,name:.7}},sharp:{label:"Sharp league (this model's rankings)",mix:{sharp:1}}};
const STYLE_LABEL={adp:"ADP",name:"Name",sharp:"Sharp"};
// expected draft spot of a player for each drafter type (lower = earlier)
const styleKey=(st,p)=>st==="sharp"?p.modelRank:st==="name"?.85*p.fameRank+.15*(p.adp||p.rank+20):(p.adp||p.rank+20);
function assignStyles(){const room=ROOMS[S.mock.cpu]||ROOMS.adp,teams=Array.from({length:S.teams},(_,i)=>i+1).filter(t=>t!==S.slot),styles=[];
  Object.entries(room.mix).forEach(([st,sh])=>{for(let k=0;k<Math.round(sh*teams.length);k++)styles.push(st)});while(styles.length<teams.length)styles.push("adp");styles.length=teams.length;
  let t=S.mock.seed>>>0;const r=()=>{t=t+0x6D2B79F5|0;let x=Math.imul(t^t>>>15,1|t);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296};
  for(let i=styles.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[styles[i],styles[j]]=[styles[j],styles[i]]}
  S.mock.styles={};teams.forEach((tm,i)=>S.mock.styles[tm]=styles[i]);setRoomPicks()}
// for availability odds during a mock: a player's expected draft spot in this room, weighting each drafter type by how many teams use it
function setRoomPicks(){const st=Object.values(S.mock.styles||{}),n=st.length||1,w={};st.forEach(x=>w[x]=(w[x]||0)+1/n);
  players.forEach(p=>{p.roomPick=Object.entries(w).reduce((s,[k,v])=>s+v*styleKey(k,p),0)})}
function cpuPick(o){const team=teamAt(o),ros=teamRoster(team),style=(S.mock.styles||{})[team]||"adp",rnd=mockRng(),g=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd())};
  let av=players.filter(p=>!pickOf(p.id));
  const left=ROUNDS-ros.length,missing=["PG","SG","SF","PF","C"].filter(P=>!ros.some(p=>p.pos.includes(P)));
  if(missing.length&&missing.length>=left){const f=av.filter(p=>p.pos.some(x=>missing.includes(x)));if(f.length)av=f}   // fill every position before the roster is full
  {const f=av.filter(p=>capOk(ros,p));if(f.length)av=f}                                                                  // ESPN's cap of 4 primary centers
  // name drafters don't discount injuries; everyone else pushes long-term injured players later
  const key=p=>{const a=styleKey(style,p),sd=Math.max(1.5,a*.12);return a+sd*g()+(style!=="name"&&p.out&&p.gamesOut>30?a*.25:0)};
  const shortlist=[...new Set([...av.slice().sort((a,b)=>styleKey(style,a)-styleKey(style,b)).slice(0,60),...av.slice().sort((a,b)=>(a.adp||a.rank+20)-(b.adp||b.rank+20)).slice(0,30)])];
  let best=null,bk=1e9;shortlist.forEach(p=>{const k=key(p);if(k<bk){bk=k;best=p}});
  return best||av[0]}
function runCPU(){while(!mockDone()&&teamAt(S.picks.length+1)!==S.slot){const o=S.picks.length+1,p=cpuPick(o);if(!p)break;S.picks.push({id:p.id,mine:false,o})}save()}
function startMock(cpu){if(!MOCK())S.realDraft={picks:S.picks,slot:S.slot,teams:S.teams};
  S.mock={active:true,cpu:cpu||"mix",seed:(Math.random()*1e9)>>>0,started:Date.now()};assignStyles();S.picks=[];runCPU();closePlayer();renderAll();renderMock();
  document.getElementById("mockBadge").hidden=false;toast(`Mock started: ${S.teams} teams, you pick ${S.slot}${["st","nd","rd"][S.slot-1]||"th"}`)}
function exitMock(){const r=S.realDraft||{picks:[]};S.mock=null;S.picks=r.picks||[];if(r.slot)S.slot=r.slot;if(r.teams)S.teams=r.teams;S.realDraft=null;
  document.getElementById("mockBadge").hidden=true;fillSelects();renderAll();renderMock();toast("Back to your real draft board")}
function mockUndo(){if(!S.picks.some(x=>x.mine)){toast("No pick of yours to undo");return}let x;do{x=S.picks.pop()}while(x&&!x.mine);toast(`Undid your pick: ${players[x.id].name}`);renderAll();renderMock()}
function autoPickMe(){if(!MOCK()||mockDone()||teamAt(S.picks.length+1)!==S.slot)return;const a=advisor(),p=a&&a.out.find(x=>x.key==="best");if(!p)return;
  S.picks.push({id:p.p.id,mine:true,o:S.picks.length+1});toast(`Auto-picked ${p.p.name}`);runCPU();renderAll();renderMock()}
function autoDraftRest(){while(MOCK()&&!mockDone()){if(teamAt(S.picks.length+1)===S.slot){const a=advisor(),p=a&&a.out.find(x=>x.key==="best");if(!p)break;S.picks.push({id:p.p.id,mine:true,o:S.picks.length+1})}runCPU()}renderAll();renderMock()}
function renderMock(){
  const v=$("view-mock");document.getElementById("mockBadge").hidden=!MOCK();
  if(!MOCK()){v.innerHTML=`<div class="chart-card" style="max-width:720px"><h4>Practice a draft against computer teams</h4>
      <p style="font-size:13px;color:var(--ink)">Computer teams draft one of three ways: <b>ADP</b> (like average ESPN drafters, with randomness), <b>Name</b> (mostly by how famous a player is, so stars, veterans and hyped rookies go early, and injuries are ignored), or <b>Sharp</b> (this model's rankings). Uses your league size and draft slot from the header (now ${S.teams} teams, pick ${S.slot}). Computer teams draft instantly until it's your turn; then pick from the Big Board as usual, with the Pick Advisor, My Team and the head-to-head outlook all working on the mock. Your real draft board is set aside and comes back when you exit.</p>
      <p class="empty" style="margin-top:6px">Team names come from Insights → Opponent team names.</p>
      <div class="row-btns" style="margin-top:10px"><label class="chk" for="mockCpu">Your league's drafters</label><select id="mockCpu">${Object.entries(ROOMS).map(([k,r])=>`<option value="${k}" ${k==="mix"?"selected":""}>${r.label}</option>`).join("")}</select><button class="btn primary" id="mockStart">Start mock draft</button></div>
      ${S.mockHistory&&S.mockHistory.length?`<h4 style="margin-top:16px">Your recent mocks</h4><div class="tablebox"><table><thead><tr><th class="l">When</th><th>Slot</th><th>Room</th><th>Finish</th><th>Starter pts/wk</th><th class="l">First three picks</th></tr></thead><tbody>${S.mockHistory.slice().reverse().map(h=>`<tr><td class="l">${new Date(h.t).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</td><td class="num">${h.slot}/${h.teams}</td><td class="num">${(ROOMS[h.cpu]||{label:h.cpu}).label.split(":")[0].replace("Like ESPN drafters (ADP)","ADP").replace(" (this model's rankings)","")}</td><td class="num">${h.rank} of ${h.teams}</td><td class="num">${f0(h.pts)}</td><td class="l">${esc(h.first)}</td></tr>`).join("")}</tbody></table></div>`:""}</div>`;
    $("mockStart").onclick=()=>startMock($("mockCpu").value);return}
  const cur=S.picks.length+1,done=mockDone(),mineTurn=!done&&teamAt(cur)===S.slot,lastMine=[...S.picks].reverse().find(x=>x.mine);
  const since=S.picks.filter(x=>!x.mine&&(!lastMine||x.o>lastMine.o));
  let body=`<div class="chart-card"><div class="row-btns" style="justify-content:space-between;align-items:center"><h4 style="margin:0">${done?"Mock draft complete":mineTurn?`Your pick: #${cur} (round ${roundOf(cur)})`:`Pick #${cur}`}</h4>
    <div class="row-btns">${mineTurn?'<button class="btn primary" id="mkAuto">Auto-pick for me</button><button class="btn" id="mkRest">Auto-draft the rest</button>':""}<button class="btn" id="mkUndo">Undo my last pick</button><button class="btn" id="mkNew">New mock</button><button class="btn" id="mkExit">Exit mock</button></div></div>
    ${mineTurn?`<p class="empty" style="margin-top:6px">Pick from the Big Board, or use the Pick Advisor's suggestions. ${since.length} pick${since.length===1?"":"s"} made since your last turn:</p>
    <ul class="feed">${since.slice(-S.teams*2).reverse().map(x=>{const p=players[x.id];return `<li><span class="mut">#${x.o} ${esc(teamShort(teamAt(x.o)))}${(S.mock.styles||{})[teamAt(x.o)]==="name"?"·N":(S.mock.styles||{})[teamAt(x.o)]==="sharp"?"·S":""}</span><span>${pBtn(p)} <span class="mut">${p.pos.join("/")}</span></span><span class="mut">ADP ${p.adp?f1(p.adp):"–"}</span></li>`}).join("")}</ul>`:""}</div>`;
  if(done)body+=mockResults();
  // draft grid
  const grid=[];for(let r=1;r<=ROUNDS;r++){const row=[];for(let t=1;t<=S.teams;t++){const o=Array.from({length:S.teams},(_,i)=>(r-1)*S.teams+i+1).find(o=>teamAt(o)===t),x=S.picks.find(y=>y.o===o);row.push({o,x,t})}grid.push(row)}
  body+=`<div class="chart-card"><h4>Draft board</h4><div class="tablebox"><table class="mock-grid"><thead><tr><th>Rd</th>${Array.from({length:S.teams},(_,i)=>`<th>${i+1===S.slot?"You":esc(teamShort(i+1))+`<br><span class="pos">${STYLE_LABEL[(S.mock.styles||{})[i+1]]||""}</span>`}</th>`).join("")}</tr></thead><tbody>
    ${grid.map((row,ri)=>`<tr><th>${ri+1}</th>${row.map(c=>{const p=c.x&&players[c.x.id];return `<td class="${c.t===S.slot?"me":""}">${p?`${pBtn({id:p.id,name:p.name.replace(/ (Jr\.?|Sr\.?|II|III|IV)$/,"").split(" ").slice(-1)[0]})} <span class="pos">${p.pos[0]}</span>`:`<span class="mut">#${c.o}</span>`}</td>`}).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  v.innerHTML=body;
  const on=(id,f)=>{const el=$(id);if(el)el.onclick=f};
  on("mkAuto",autoPickMe);on("mkRest",autoDraftRest);on("mkUndo",mockUndo);on("mkNew",()=>startMock(S.mock.cpu));on("mkExit",exitMock);
}
function mockResults(){
  const teams=Array.from({length:S.teams},(_,i)=>i+1).map(t=>{const ros=teamRoster(t),H=h2hValue(ros);return {t,ros,reg:H.reg,po:H.po,wk:H.reg/Math.max(1,WEEKS.filter(w=>!w.po&&w.p[1]>=CUR_PERIOD).length),pwk:H.po/4}}).sort((a,b)=>b.wk-a.wk);
  const me=teams.findIndex(x=>x.t===S.slot),my=teams[me],pct=1-me/(S.teams-1||1),grade=pct>=.9?"A":pct>=.7?"B+":pct>=.5?"B":pct>=.3?"C+":"C";
  const myPicks=S.picks.filter(x=>x.mine).map(x=>({x,p:players[x.id]}));
  if(!S.mock.saved){S.mock.saved=true;(S.mockHistory=S.mockHistory||[]).push({t:Date.now(),slot:S.slot,teams:S.teams,cpu:S.mock.cpu,rank:me+1,pts:my.wk,first:myPicks.slice(0,3).map(z=>z.p.name).join(", ")});if(S.mockHistory.length>10)S.mockHistory.shift();save()}
  return `<div class="kpis">
      <div class="kpi"><div class="k">Projected finish</div><div class="v">${me+1} of ${S.teams}</div><div class="d">by weekly starter points</div></div>
      <div class="kpi"><div class="k">Draft grade</div><div class="v">${grade}</div><div class="d">relative to this room</div></div>
      <div class="kpi"><div class="k">Starter points / week</div><div class="v">${f0(my.wk)}</div><div class="d">playoff weeks ${f0(my.pwk)}</div></div>
      <div class="kpi"><div class="k">Points left on bench</div><div class="v">${pc(h2hValue(my.ros).wastePct)}</div><div class="d">${my.ros.filter(isC).length} C-eligible</div></div></div>
    <div class="chart-grid"><div class="chart-card"><h4>Projected standings</h4><div class="tablebox"><table><thead><tr><th class="l">Team</th><th>Pts/week</th><th>Playoff week</th><th class="l">Best player</th></tr></thead><tbody>
      ${teams.map((x,i)=>`<tr ${x.t===S.slot?'style="background:var(--mine-soft);font-weight:600"':""}><td class="l">${i+1}. ${x.t===S.slot?"You":esc(teamName(x.t))+` <span class="mut">(${STYLE_LABEL[(S.mock.styles||{})[x.t]]||"ADP"})</span>`}</td><td class="num">${f0(x.wk)}</td><td class="num">${f0(x.pwk)}</td><td class="l">${esc([...x.ros].sort((a,b)=>b.projTot-a.projTot)[0]?.name||"")}</td></tr>`).join("")}</tbody></table></div>
      <p>Standings use the same daily-lineup simulation as My Team, on ESPN's schedule. Head-to-head luck and in-season moves aren't included.${(()=>{const by={};teams.forEach((x,i)=>{if(x.t===S.slot)return;const st=(S.mock.styles||{})[x.t]||"adp";(by[st]=by[st]||[]).push(i+1)});const parts=Object.entries(by).filter(([,v])=>v.length).map(([k,v])=>`${STYLE_LABEL[k]} drafters averaged a ${f1(v.reduce((a,b)=>a+b,0)/v.length)} finish`);return parts.length>1?" "+parts.join("; ")+".":""})()}</p></div>
    <div class="chart-card"><h4>Your picks vs ADP</h4><div class="tablebox"><table><thead><tr><th>Pick</th><th class="l">Player</th><th>ADP</th><th>vs ADP</th><th>Proj FP/G</th></tr></thead><tbody>
      ${myPicks.map(({x,p})=>{const d=p.adp?Math.round(p.adp-x.o):null;return `<tr><td class="num">#${x.o}</td><td class="l">${pBtn(p)} <span class="mut">${p.pos.join("/")}</span></td><td class="num">${p.adp?f1(p.adp):"–"}</td><td class="num ${d===null?"mut":d>=0?"zpos":"zneg"}">${d===null?"–":(d>0?"+":"")+d}</td><td class="num">${f1(p.proj.fp)}</td></tr>`}).join("")}</tbody></table></div>
      <p>"vs ADP" is how much later ESPN drafters usually take him: positive means you got value, negative means you reached.</p></div></div>`;
}
// ================= CONTROLS =================
RLO=Math.min(...players.map(p=>p.lo));RHI=Math.max(...players.map(p=>p.hi));
function fillSelects(){
  $("teams").innerHTML=[8,10,12,14,16].map(n=>`<option ${n===S.teams?"selected":""}>${n}</option>`).join("");
  $("slot").innerHTML=Array.from({length:S.teams},(_,i)=>`<option ${i+1===S.slot?"selected":""}>${i+1}</option>`).join("");
}
fillSelects();
$("teams").onchange=e=>{S.teams=+e.target.value;if(S.slot>S.teams)S.slot=S.teams;fillSelects();if(MOCK())startMock(S.mock.cpu);else{renderAll();renderMock()}};
$("slot").onchange=e=>{S.slot=+e.target.value;if(MOCK())startMock(S.mock.cpu);else{renderAll();renderMock()}};
function seg(a,b,key,va,vb){const set=v=>{S[key]=v;$(a).setAttribute("aria-pressed",v===va);$(b).setAttribute("aria-pressed",v===vb)};
  $(a).onclick=()=>{set(va);renderAll()};$(b).onclick=()=>{set(vb);renderAll()};set(S[key])}
seg("scPts","scCat","scoring","pts","cat");
(()=>{const ids={model:"vModel",min:"vMin",stats:"vStats"},set=v=>{S.view=v;Object.entries(ids).forEach(([k,id])=>$(id).setAttribute("aria-pressed",k===v))};
  Object.entries(ids).forEach(([k,id])=>$(id).onclick=()=>{set(k);renderAll()});set(S.view)})();seg("rBoard","rModel","rankBy","board","model");
$("posSeg").innerHTML=["ALL","PG","SG","SF","PF","C","G","F"].map(p=>`<button data-pos="${p}" aria-pressed="${p===S.pos}">${p}</button>`).join("");
$("posSeg").onclick=e=>{const b=e.target.closest("button");if(!b)return;S.pos=b.dataset.pos;[...$("posSeg").children].forEach(x=>x.setAttribute("aria-pressed",x===b));renderAll()};
$("q").oninput=()=>{boardLimit=150;renderBoard()};
$("hideTaken").checked=S.hideTaken;$("hideOut").checked=S.hideOut;
$("hideTaken").onchange=e=>{S.hideTaken=e.target.checked;renderAll()};
$("hideOut").onchange=e=>{S.hideOut=e.target.checked;renderAll()};
$("thead").onclick=e=>{const th=e.target.closest("th");if(!th||th.dataset.k==="act")return;const k=th.dataset.k;S.sort=S.sort.k===k?{k,d:-S.sort.d}:{k,d:1};renderAll()};
// restart a CSS animation on an element (optionally setting its text first); a no-op when the text is unchanged
function replay(el,cls,text){if(!el)return;if(text!=null){if(el.textContent===text)return;el.textContent=text}el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(root){if(REDUCED)return;root.querySelectorAll(".kpi .v").forEach(el=>{const m=el.textContent.match(/^([^\d-]*)(-?[\d,]*\.?\d+)([^\d]*)$/);if(!m)return;
  const end=parseFloat(m[2].replace(/,/g,"")),dec=(m[2].split(".")[1]||"").length,comma=m[2].includes(","),t0=performance.now(),fmt=v=>comma?Math.round(v).toLocaleString():v.toFixed(dec);
  const step=t=>{const k=Math.min(1,(t-t0)/650),e=1-Math.pow(1-k,3);el.textContent=m[1]+fmt(end*e)+m[3];if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)})}
function toast(t){const el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,1800)}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-mine],[data-take],[data-undo],[data-open]");if(!b)return;
  if(b.dataset.open!==undefined){openPlayer(+b.dataset.open);return}
  if(b.dataset.undo!==undefined){if(MOCK()){mockUndo();return}const id=+b.dataset.undo;S.picks=S.picks.filter(x=>x.id!==id);S.picks.forEach((x,i)=>x.o=i+1);toast(`${players[id].name} back on the board`);renderAll();return}
  const id=+(b.dataset.mine??b.dataset.take),isMine=b.dataset.mine!==undefined;if(pickOf(id))return;
  if(MOCK()){if(!isMine)return;if(mockDone()){toast("The mock draft is over");return}if(teamAt(S.picks.length+1)!==S.slot){toast("Not your pick yet");return}
    S.picks.push({id,mine:true,o:S.picks.length+1});toast(`Drafted ${players[id].name}`);runCPU();renderAll();renderMock();return}
  S.picks.push({id,mine:isMine,o:S.picks.length+1});toast(isMine?`Drafted ${players[id].name}`:`${players[id].name} marked taken`);renderAll();
});
let rsArmed=false;
$("restart").onclick=e=>{if(MOCK()){startMock(S.mock.cpu);return}if(!S.picks.length){toast("No picks to clear yet");return}
  if(!rsArmed){rsArmed=true;e.target.textContent="Confirm restart";e.target.classList.add("primary");setTimeout(()=>{rsArmed=false;e.target.textContent="Restart";e.target.classList.remove("primary")},3000);return}
  rsArmed=false;e.target.textContent="Restart";e.target.classList.remove("primary");S.picks=[];closePlayer();renderAll();toast("Draft restarted. Settings and rankings kept.")};
$("undo").onclick=()=>{if(MOCK()){mockUndo();return}const x=S.picks.pop();if(x)toast(`Undid pick #${x.o}: ${players[x.id].name}`);renderAll()};
// ================= MY TEAM: how you're doing, what to do next, and how teams work =================
const HAS_LG=()=>typeof LEAGUE!=="undefined"&&!!LEAGUE;
const wksLeft=()=>Math.max(1,WEEKS.filter(x=>!x.po&&x.p[1]>=CUR_PERIOD).length);
const perWk=H=>H.reg/wksLeft();
// a team's weekly scoring spread: game-to-game swings (MATCHUP.CV of each start, measured) plus projection error, from the same
// assumptions as the matchup simulator, so playoff odds and weekly win chances agree
function teamWeekly(R){const H=R.length?h2hValue(R):{reg:0,po:0,weekly:new Float64Array(WEEKS.length),started:0};
  const top=[...R].sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,10),avg=top.length?mean(top.map(p=>p.proj.fp)):0,sig=top.length?mean(top.map(p=>p.proj.sigma)):0;
  const starts=Math.max(1,H.started/wksLeft()),sd=Math.sqrt(starts*(MATCHUP.CV*avg)**2+(starts*sig*.5)**2);return {H,mu:perWk(H),sd}}
// season simulation over your real schedule: current ESPN records plus each remaining week drawn from those spreads
function playoffOdds(){const L=leagueRosters(),T=Object.keys(L).map(Number);if(T.length<2||!HAS_LG()||!LEAGUE.opp)return null;
  const tw=Object.fromEntries(T.map(t=>[t,teamWeekly(rosterOf(t))])),rec=LEAGUE.rec||{},N=3000,po=Object.fromEntries(T.map(t=>[t,0])),wins=Object.fromEntries(T.map(t=>[t,0])),seed0=Object.fromEntries(T.map(t=>[t,0]));
  let seed=987654321;const rnd=()=>{seed=seed+0x6D2B79F5|0;let x=Math.imul(seed^seed>>>15,1|seed);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296};
  const gs=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd())};
  const done=new Set((LEAGUE.results||[]).map(r=>r[0]-1)),todo=WEEKS.map((w,i)=>i).filter(i=>!WEEKS[i].po&&!done.has(i)&&WEEKS[i].p[1]>=CUR_PERIOD&&LEAGUE.opp[i]);
  for(let s=0;s<N;s++){const W={},P={};T.forEach(t=>{const r=rec[t]||[0,0,0,0,0];W[t]=r[0]+r[2]/2;P[t]=r[3]});
    for(const i of todo){const seen=new Set();for(const a of T){const b=LEAGUE.opp[i][a];if(!b||seen.has(a))continue;seen.add(a);seen.add(b);
      const x=tw[a].mu*(tw[a].H.weekly[i]/Math.max(1,tw[a].mu))+tw[a].sd*gs(),y=tw[b].mu*(tw[b].H.weekly[i]/Math.max(1,tw[b].mu))+tw[b].sd*gs();
      P[a]+=x;P[b]+=y;if(x>y)W[a]++;else W[b]++}}
    const ord=[...T].sort((a,b)=>W[b]-W[a]||P[b]-P[a]);ord.slice(0,4).forEach(t=>po[t]++);seed0[ord[0]]++;T.forEach(t=>wins[t]+=W[t])}
  return {po:Object.fromEntries(T.map(t=>[t,po[t]/N])),first:Object.fromEntries(T.map(t=>[t,seed0[t]/N])),wins:Object.fromEntries(T.map(t=>[t,wins[t]/N])),tw,games:19}}
// where a roster's points come from, per week: each starter's per-game line x scoring x expected games a week
const SRC=[["pts","Points",l=>l.pts*SC.pts],["reb","Rebounds",l=>l.reb*SC.reb],["ast","Assists",l=>l.ast*SC.ast],["stl","Steals",l=>l.stl*SC.stl],["blk","Blocks",l=>l.blk*SC.blk],["tpm","Threes",l=>l.tpm*SC.tpm],
  ["eff","Shooting (makes − misses)",l=>l.fgm*SC.fgm+l.fga*SC.fga+l.ftm*SC.ftm+l.fta*SC.fta],["tov","Turnovers",l=>l.tov*SC.tov]];
function sourcesOf(R){const top=[...R].sort((a,b)=>b.projTot-a.projTot).slice(0,10),out={};SRC.forEach(([k,,f])=>out[k]=top.reduce((s,p)=>s+f(p.proj.line)*p.avail*p.rate/Math.max(1,REMAIN_WEEKS()),0));return out}
const REMAIN_WEEKS=()=>Math.max(1,WEEKS.filter(x=>x.p[1]>=CUR_PERIOD).length);
// suggestions, each scored in projected starter points per week (rest of season, playoff weeks weighted as in your mix)
let TEAM_CACHE={key:"",trades:null};
function teamKey(){return JSON.stringify([leagueRosters(),S.slot,S.mix,S.adj,SC])}
function waiverIdeas(my){const base=h2hValue(my).total,wk=REMAIN_WEEKS(),full=my.length>=13,drop=[...my].sort((a,b)=>a.projTot-b.projTot)[0];
  return freeAgents().filter(p=>p.projTot>0&&!my.includes(p)).sort((a,b)=>b.projTot-a.projTot).slice(0,40).map(p=>{const R=full?my.filter(q=>q!==drop).concat(p):my.concat(p);return {p,drop:full?drop:null,g:(h2hValue(R).total-base)/wk}}).filter(x=>x.g>0.5).sort((a,b)=>b.g-a.g).slice(0,3)}
function irIdea(my){const lg=HAS_LG()?LEAGUE.irSlots:1;if(!lg)return null;const out=my.filter(p=>p.out&&p.retP-CUR_PERIOD>=7).sort((a,b)=>b.projTot-a.projTot)[0];if(!out)return null;
  const base=h2hValue(my).total,best=freeAgents().sort((a,b)=>b.projTot-a.projTot).slice(0,30).map(p=>({p,g:(h2hValue(my.concat(p)).total-base)/REMAIN_WEEKS()})).sort((a,b)=>b.g-a.g)[0];return best&&best.g>0?{out,...best}:null}
// 1-for-1 trades where both sides gain projected starter points (a trade the other manager has a reason to accept)
function tradeIdeas(my){const base=h2hValue(my).total,wk=REMAIN_WEEKS(),L=leagueRosters(),out=[];
  for(const t of Object.keys(L).map(Number).filter(t=>t!==S.slot)){const their=rosterOf(t);if(!their.length)continue;const tb=h2hValue(their).total;
    for(const a of my)for(const b of their){if(Math.abs(a.projTot-b.projTot)>.3*Math.max(a.projTot,b.projTot))continue;
      const M=my.filter(x=>x!==a).concat(b),T2=their.filter(x=>x!==b).concat(a);if(!capOk(M.filter(x=>x!==b),b))continue;
      const g=(h2hValue(M).total-base)/wk;if(g<3)continue;const h=(h2hValue(T2).total-tb)/wk;if(h>0)out.push({t,give:a,get:b,g,h})}}
  return out.sort((x,y)=>Math.min(y.g,y.h*1.5)-Math.min(x.g,x.h*1.5)).filter((x,i,a)=>a.findIndex(z=>z.give===x.give||z.get===x.get)===i).filter((x,i,a)=>a.slice(0,i).filter(z=>z.t===x.t).length<2).slice(0,4)}
function myTeamView(){const my=myRoster(),lg=HAS_LG(),started=lg&&Object.values(LEAGUE.rec||{}).some(r=>r[0]+r[1]+r[2]>0);
  let h="";
  if(!my.length){h+=`<div class="chart-card" style="max-width:760px"><h4>Your team appears here after the draft</h4><p style="font-size:13px;color:var(--ink)">${lg?`${esc(LEAGUE.name)} drafts ${new Date(LEAGUE.draftDate).toLocaleString(undefined,{weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}. The morning after, ESPN's rosters load here automatically. During the draft, picks you enter on the Big Board show up here right away.`:"Enter your draft on the Big Board, or your roster in the Rosters tab."}</p></div>`;return h+howTeamsWork(my)}
  const L=leagueRosters(),T=Object.keys(L).map(Number),tw=Object.fromEntries(T.map(t=>[t,teamWeekly(rosterOf(t))])),rank=[...T].sort((a,b)=>tw[b].mu-tw[a].mu),myRank=rank.indexOf(S.slot)+1,odds=playoffOdds();
  const lgAvg=mean(T.filter(t=>t!==S.slot).map(t=>tw[t].mu)),me=tw[S.slot];
  // ---- headline numbers
  const rec=lg&&LEAGUE.rec&&LEAGUE.rec[S.slot];const stand=lg&&LEAGUE.rec?[...T].sort((a,b)=>{const A=LEAGUE.rec[a]||[0,0,0,0],B=LEAGUE.rec[b]||[0,0,0,0];return (B[0]+B[2]/2)-(A[0]+A[2]/2)||B[3]-A[3]}).indexOf(S.slot)+1:null;
  const w=Math.max(0,CUR_WEEK),opp=leagueOpp(w),M=opp&&rosterOf(opp).length?matchupSim(my,rosterOf(opp),w):null;
  h+=`<div class="kpis">${started?kpT("Record",`${rec[0]}-${rec[1]}${rec[2]?"-"+rec[2]:""}`,`${ordinal(stand)} of ${T.length} · ${f0(rec[3])} points for`):kpT("Season",lg?"Starts Nov 2":"Not started",lg?"Week 1 is Nov 2–8":"")}
    ${kpT("Starter points / week",f0(me.mu),`${ordinal(myRank)} of ${T.length} · league average ${f0(lgAvg)}`)}
    ${odds?kpT("Playoff odds",`<span class="call">${pc(odds.po[S.slot])}</span>`,`top 4 of ${T.length} make it · projected ${f1(odds.wins[S.slot])} wins`):""}
    ${M?kpT(`Week ${WEEKS[w].i} vs ${esc(teamShort(opp))}`,pc(M.p),`projected ${f0(M.a)}–${f0(M.b)}`):""}
    ${kpT("Playoff-week games",String(my.reduce((s,p)=>s+p.poGames,0)),`your 13 players, Mar 15–Apr 11 · league avg ${f0(mean(T.filter(t=>t!==S.slot).map(t=>rosterOf(t).reduce((s,p)=>s+p.poGames,0))))}`)}</div>`;
  // ---- season so far (ESPN results)
  if(lg&&(LEAGUE.results||[]).length){const mine=LEAGUE.results.filter(r=>r[1]===S.slot||r[3]===S.slot).sort((a,b)=>a[0]-b[0]);
    h+=`<div class="chart-card"><h4>Season so far</h4><div class="tablebox"><table><thead><tr><th class="l">Week</th><th class="l">Opponent</th><th>You</th><th>Them</th><th class="l">Result</th></tr></thead><tbody>${mine.map(r=>{const home=r[1]===S.slot,me2=home?r[2]:r[4],th=home?r[4]:r[2],o=home?r[3]:r[1],res=r[5]==="TIE"?"T":(r[5]==="HOME")===home?"W":"L";
      return `<tr><td class="l">${r[0]}</td><td class="l">${esc(teamName(o))}</td><td class="num">${f1(me2)}</td><td class="num">${f1(th)}</td><td class="l" style="color:${res==="W"?"var(--ok)":res==="L"?"var(--bad)":"inherit"};font-weight:600">${res}</td></tr>`}).join("")}</tbody></table></div>
      <p>From ESPN, updated each morning. Points for: ${f0(rec[3])} (${f0(rec[3]/Math.max(1,mine.length))} a week). Points against: ${f0(rec[4])}.</p></div>`}
  // ---- power rankings with playoff odds
  h+=`<div class="chart-card"><h4>Where you stand</h4><div class="tablebox"><table><thead><tr><th class="l">Team</th>${started?"<th>Record</th>":""}<th>Starter pts/week</th><th>Playoff-week pts/week</th>${odds?"<th>Proj. wins</th><th>Playoffs</th><th>1st seed</th>":""}</tr></thead><tbody>
    ${rank.map((t,i)=>{const r=lg&&LEAGUE.rec&&LEAGUE.rec[t];return `<tr ${t===S.slot?'style="background:var(--mine-soft);font-weight:600"':""}><td class="l">${i+1}. ${t===S.slot?"You":esc(teamName(t))}</td>${started?`<td class="num">${r?r[0]+"-"+r[1]:"–"}</td>`:""}<td class="num">${f0(tw[t].mu)}</td><td class="num">${f0(tw[t].H.po/4)}</td>${odds?`<td class="num">${f1(odds.wins[t])}</td><td class="num">${pc(odds.po[t])}</td><td class="num">${pc(odds.first[t])}</td>`:""}</tr>`}).join("")}</tbody></table></div>
    <p>Ranked by projected starter points per week for the rest of the season. ${odds?`Playoff odds play out your league's real schedule 3,000 times${started?", starting from ESPN's current records":""}: each week every team scores its projection plus a random swing, the higher score wins, and the top 4 records make the playoffs (points for breaks ties).`:""}</p></div>`;
  // ---- strengths and weaknesses
  const srcMine=sourcesOf(my),srcLg=Object.fromEntries(SRC.map(([k])=>[k,mean(T.filter(t=>t!==S.slot).map(t=>sourcesOf(rosterOf(t))[k]))])),diffs=SRC.map(([k,lab])=>({k,lab,d:srcMine[k]-srcLg[k],v:srcMine[k]}));
  const mx=Math.max(1,...diffs.map(x=>Math.abs(x.d)));
  h+=`<div class="chart-grid"><div class="chart-card"><h4>Where your points come from</h4><div class="eq">your top 10 vs the average team, fantasy points per week</div><div class="wf" style="margin-top:8px">${diffs.map(x=>`<div class="wf-row"><span>${x.lab}</span><div class="wf-track"><span style="left:${x.d>=0?50:50-Math.abs(x.d)/mx*50}%;width:${Math.abs(x.d)/mx*50}%;background:${x.d>=0?"var(--ok)":"var(--bad)"}"></span><span style="left:50%;width:1px;background:var(--muted)"></span></div><span class="amt">${x.d>=0?"+":"−"}${f0(Math.abs(x.d))}</span></div>`).join("")}</div>
    <p>${(()=>{const s=[...diffs].sort((a,b)=>b.d-a.d);return `Biggest edge: <b>${s[0].lab.toLowerCase()}</b> (+${f0(s[0].d)} a week). Biggest gap: <b>${s[s.length-1].lab.toLowerCase()}</b> (${f0(s[s.length-1].d)}). In points leagues every source is worth the same per point, so a gap only matters if you can close it cheaply.`})()}</p></div>`;
  // positions: who fills each slot, and how deep each position is
  const A=assignLineup(my),depth=["PG","SG","SF","PF","C"].map(P=>{const e=my.filter(p=>p.pos.includes(P)),lgD=mean(T.filter(t=>t!==S.slot).map(t=>rosterOf(t).filter(p=>p.pos.includes(P)).length));return {P,n:e.length,lg:lgD}});
  h+=`<div class="chart-card"><h4>Your lineup and depth</h4><div class="eq">typical starting lineup by slot, best players placed first</div><div class="tablebox"><table><thead><tr><th class="l">Slot</th><th class="l">Player</th><th>FP/G</th><th>Games left</th></tr></thead><tbody>
    ${LINEUP.map(([lab],i)=>{const p=A.slot[i];return `<tr><td class="l">${lab}</td><td class="l">${p?pBtn(p)+` <span class="mut">${p.pos.join("/")}</span>`:'<span style="color:var(--bad)">Empty</span>'}</td><td class="num">${p?f1(p.proj.fp):"–"}</td><td class="num">${p?f0(p.avail*p.rate):""}</td></tr>`}).join("")}
    ${A.bench.map(p=>`<tr class="mut"><td class="l">Bench</td><td class="l">${pBtn(p)} <span class="mut">${p.pos.join("/")}</span></td><td class="num">${f1(p.proj.fp)}</td><td class="num">${f0(p.avail*p.rate)}</td></tr>`).join("")}</tbody></table></div>
    <div class="needs" style="margin-top:8px">${depth.map(d=>`<span class="need-chip ${d.n<2?"high":d.n<d.lg-1?"med":"ok"}">${d.P}: ${d.n} eligible (avg ${f1(d.lg)})</span>`).join("")}</div>
    <p>A week has 70 starts to fill (10 slots × 7 days). NBA teams play 3–4 games a week, so a 13-man roster fills about ${f0(70-me.H.emptyPerWeek)} of them and ${f0(me.H.emptyPerWeek)} go empty. That's normal in daily leagues, and it's why streaming players with games on light days pays off. ${pc(me.H.wastePct)} of your bench's games are wasted because every slot they fit is already taken.</p></div></div>`;
  // ---- suggestions
  const S2=[],ir=irIdea(my),myA=ir?my.filter(p=>p!==ir.out).concat(ir.p):my,wv=waiverIdeas(myA),hot=my.filter(p=>p.hot&&p.nowFp&&p.nowFp>p.proj.fp*1.15).sort((a,b)=>(b.nowFp-b.proj.fp)-(a.nowFp-a.proj.fp))[0],
    cold=T.filter(t=>t!==S.slot).flatMap(t=>rosterOf(t).map(p=>({p,t}))).filter(x=>x.p.cold&&x.p.proj.fp>=25).sort((a,b)=>b.p.proj.fp-a.p.proj.fp)[0],
    poAvg=mean(players.filter(p=>p.projTot>0).map(p=>p.poGames)),poLow=my.filter(p=>p.poGames<=poAvg-2).sort((a,b)=>b.projTot-a.projTot)[0],dl=lg&&LEAGUE.tradeDeadline?new Date(LEAGUE.tradeDeadline):null;
  if(ir)S2.push({g:ir.g,t:`<b>Move ${esc(ir.out.name)} to IR, then add ${pBtn(ir.p)}</b> (${ir.p.pos.join("/")}, ${esc(ir.p.team)}). ${esc(ir.out.name)} is out until about ${dayLabel(ir.out.retP)}. The IR slot doesn't count against your 13, so this is a free add worth about +${f1(ir.g)} starter points a week.`});
  wv.forEach((x,i)=>S2.push({g:x.g,t:`<b>${i?"Also worth a look":"Best pickup"}: ${pBtn(x.p)}</b> (${x.p.pos.join("/")}, ${esc(x.p.team)}, ${f1(x.p.proj.fp)} FP/G)${x.drop?`, dropping ${pBtn(x.drop)}`:""}: +${f1(x.g)} starter points a week for the rest of the season.`}));
  if(me.H.emptyPerWeek>=1.5){const w0=Math.max(0,CUR_WEEK),base=weekProj(myA,w0).pts,drop=[...myA].sort((a,b)=>a.projTot-b.projTot)[0],st=freeAgents().filter(p=>!myA.includes(p)&&!wv.some(x=>x.p===p)).sort((a,b)=>b.projTot-a.projTot).slice(0,40).map(p=>({p,g:weekProj(myA.filter(q=>q!==drop).concat(p),w0).pts-base})).sort((a,b)=>b.g-a.g)[0];
    if(st&&st.g>3)S2.push({g:st.g/2,t:`<b>Stream for empty slots.</b> About ${f0(me.H.emptyPerWeek)} of your 70 weekly starts go unused. This week, ${pBtn(st.p)} (${weekGames(st.p,w0)} games) in place of ${esc(drop.name)} adds about +${f0(st.g)} points.`})}
  if(hot)S2.push({g:(hot.nowFp-hot.proj.fp)*.3,t:`<b>Sell high?</b> ${pBtn(hot)} is scoring ${f1(hot.nowFp)} FP/G this season against a projection of ${f1(hot.proj.fp)}. Hot starts usually cool off, so if a manager values him at his current pace, trading him could net more than he'll produce from here.`});
  if(cold)S2.push({g:(cold.p.proj.fp-(cold.p.nowFp||0))*.3,t:`<b>Buy low:</b> ${pBtn(cold.p)} (${esc(teamName(cold.t))}) is at ${f1(cold.p.nowFp||0)} FP/G, well under his ${f1(cold.p.proj.fp)} projection. His manager may sell cheap.`});
  if(poLow&&(!dl||dl>Date.now()))S2.push({g:1,t:`<b>Playoff schedule:</b> ${pBtn(poLow)} has only ${poLow.poGames} games in the playoff weeks (Mar 15–Apr 11; a typical player has ${f0(poAvg)}). Worth keeping in mind for trades${dl?` before the ${dl.toLocaleDateString(undefined,{month:"short",day:"numeric"})} deadline`:""}.`});
  const cN=my.filter(p=>p.dp===5).length;if(cN>=4)S2.push({g:2,t:`<b>Center cap:</b> you have ${cN} players whose ESPN position is C${cN>4?', over the league maximum of 4':', the league maximum'}. You can't add another until one leaves.`});
  depth.filter(d=>d.n<2).forEach(d=>S2.push({g:2,t:`<b>Thin at ${d.P}:</b> only ${d.n} eligible player${d.n===1?"":"s"}. When ${d.n?"he sits":"nobody's available"}, that slot goes empty or takes a UTIL player. Look for a ${d.P}-eligible pickup or trade target.`}));
  h+=`<div class="chart-card"><h4>Suggestions</h4><ul class="heads" style="margin-top:8px" id="teamSugg">${S2.length?S2.sort((a,b)=>b.g-a.g).map(x=>`<li class="hi">${x.t}</li>`).join(""):'<li>Nothing urgent. Your roster is close to the best the waiver wire allows.</li>'}</ul>
    <h4 style="margin-top:12px">Trade ideas</h4><div id="tradeIdeas"><p class="empty">Searching every 1-for-1 swap with each team…</p></div>
    <p>Each suggestion is scored by how many projected starter points a week it adds, after daily lineup limits. Trade ideas only list swaps where the other team's projection improves too, so they have a reason to say yes.</p></div>`;
  return h+howTeamsWork(my)}
function fillTradeIdeas(){const el=$("tradeIdeas");if(!el)return;const k=teamKey();if(TEAM_CACHE.key!==k){TEAM_CACHE={key:k,trades:tradeIdeas(myRoster())}}
  const X=TEAM_CACHE.trades;el.innerHTML=X.length?`<ul class="heads">${X.map(x=>`<li class="good">Trade ${pBtn(x.give)} to <b>${esc(teamName(x.t))}</b> for ${pBtn(x.get)}: you +${f1(x.g)} a week, them +${f1(x.h)} a week. <span class="mut">(${x.give.pos.join("/")} for ${x.get.pos.join("/")})</span></li>`).join("")}</ul>`:'<p class="empty">No 1-for-1 swap helps both sides right now. That usually means rosters are balanced; check again after injuries or hot starts.</p>'}
const ordinal=n=>n+(["th","st","nd","rd"][(n%100-20)%10]||["th","st","nd","rd"][n%100]||"th");
const kpT=(k,v,d)=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
// plain-language rules: how a team is put together and how it scores, using this league's settings
function howTeamsWork(my){const lg=HAS_LG(),sc=Object.keys(SCORING_LABELS).map(k=>`<tr><td class="l">${SCORING_LABELS[k]}</td><td class="num">${SC[k]>0?"+":""}${SC[k]}</td></tr>`).join("");
  const dl=lg&&LEAGUE.tradeDeadline?new Date(LEAGUE.tradeDeadline).toLocaleDateString(undefined,{month:"long",day:"numeric"}):"mid-February";
  return `<div class="chart-card prose" style="max-width:none"><h4 style="color:var(--ink)">How teams are built and scored${lg?` in ${esc(LEAGUE.name)}`:""}</h4>
  <h3>The roster</h3><p>Every team has <b>13 players</b>: <b>10 starters and 3 bench</b>, plus <b>1 IR slot</b> for a player ESPN lists as OUT. The IR player doesn't count toward the 13, so stashing an injured player there frees a spot to add someone.</p>
  <div class="tablebox" style="max-width:560px"><table><thead><tr><th class="l">Starting slot</th><th class="l">Who can play there</th></tr></thead><tbody>
  <tr><td class="l">PG, SG, SF, PF, C</td><td class="l">a player eligible at that position</td></tr><tr><td class="l">G</td><td class="l">any PG or SG</td></tr><tr><td class="l">F</td><td class="l">any SF or PF</td></tr><tr><td class="l">UTIL × 3</td><td class="l">anyone</td></tr></tbody></table></div>
  <p><b>Positions come from ESPN.</b> Many players are eligible at two or three spots (say PG/SG), which makes them easier to fit. A team can have <b>at most 4 players whose main ESPN position is C</b>.</p>
  <h3>Lineups</h3><p>Each day, only your starters score. A bench player's points don't count, and a starter whose team doesn't play that day scores nothing. Lineups lock game by game, so you can swap someone in until his game starts. This app assumes you set the best lineup each day, starting the 10 healthy players with a game who project to score the most (Quick Lineup at the start of the week gets close to this).</p>
  <h3>Scoring</h3><p>Every stat a starter records is worth points:</p><div class="tablebox" style="max-width:360px"><table><tbody>${sc}</tbody></table></div><p>So a 20-point, 10-rebound, 5-assist night on 8-of-16 shooting and 4-of-5 free throws with 2 turnovers is 20 + 10 + 10 + 16 − 16 + 4 − 5 − 4 = <b>35 points</b>. Steals and blocks (+4) are the most valuable single plays. Missed shots and turnovers cost you.</p>
  <h3>Weeks, standings and playoffs</h3><p>Each week (Monday to Sunday) you play one team. All your starters' points for the week are added up, and the higher total wins. There are <b>19 regular-season weeks</b> (Nov 2 to Mar 14). The <b>top 4 records</b> make the playoffs, with seeding by head-to-head record. Playoffs are two rounds of <b>two weeks each</b>: semifinals Mar 15–28, final Mar 29–Apr 11. That's why the app weights playoff-week games: a player with 16 games in those four weeks is worth more to you then than one with 12.</p>
  <h3>Changing your team</h3><p>Free agents are added through <b>waivers</b>: a dropped player waits on waivers briefly, and claims go by waiver priority. There's no limit on adds. Trades are allowed until <b>${dl}</b>.</p>
  <h3>How this app reads your team</h3><p>Rosters come from ESPN each morning${lg&&LEAGUE.drafted?"":", starting the morning after your draft"} (until then, from the picks you enter on the Big Board). For any roster, the app walks through every remaining day of the NBA schedule. Each day it starts your best available players in valid slots, counts each one's projected FP/G times his chance of playing, and adds it all up into weekly totals. Matchup odds replay a week hundreds of times, drawing each game from how far real games landed from their predictions over the last two seasons: a typical game misses by about half the prediction, and bad nights are more common than huge ones.</p></div>`}
const TABS=["board","today","team","ana","players","season","waivers","trades","rosters","models","news","insights","mock","how"];
$("tab-insights").addEventListener("click",()=>renderInsights());
$("tab-news").addEventListener("click",()=>renderNews());
function renderTeam(){$("view-team").innerHTML=myTeamView();countUp($("view-team"));setTimeout(fillTradeIdeas,30)}
// ---- Today: what to do today, in one screen: tonight's lineup, news that touches your team, your matchup, one move ----
function tonight(my){const d=PDATE(CUR_PERIOD),P=my.map(p=>{const g=nextGames(p,1)[0];return {p,g:g&&g.date===d?g:null}});
  const play=P.filter(x=>x.g&&!x.g.out).sort((a,b)=>b.g.fp-a.g.fp),slot=new Array(LINEUP.length).fill(-1);
  const aug=(i,seen)=>{for(let k=0;k<LINEUP.length;k++){if(seen[k]||!elig(play[i].p,k))continue;seen[k]=1;if(slot[k]<0||aug(slot[k],seen)){slot[k]=i;return true}}return false};
  play.forEach((_,i)=>aug(i,new Uint8Array(LINEUP.length)));const on=new Set(slot.filter(i=>i>=0));
  const starters=slot.map((i,k)=>i>=0?{...play[i],k}:null).filter(Boolean),bench=play.filter((_,i)=>!on.has(i));
  // a close call: a benched player within 3 FP of a starter he could replace
  bench.forEach(b=>{const r=starters.filter(s=>elig(b.p,s.k)).sort((x,y)=>x.g.fp-y.g.fp)[0];if(r&&r.g.fp-b.g.fp<3)b.close=r});
  return {d,starters,bench,out:P.filter(x=>x.g&&x.g.out),idle:P.filter(x=>!x.g),open:LINEUP.length-starters.length}}
// the single best pickup this week, if one is worth a roster move
function bestMove(my,w){const fa=freeAgents(),base=weekProj(my,w).pts,full=my.length>=13,drop=[...my].sort((a,b)=>a.projTot-b.projTot)[0];
  const C=[...fa].sort((a,b)=>b.projTot-a.projTot).slice(0,30).concat([...fa].sort((a,b)=>weekGames(b,w)*b.proj.fp-weekGames(a,w)*a.proj.fp).slice(0,20));
  let best=null;new Set(C).forEach(p=>{if(p.out)return;const R=full?my.filter(x=>x!==drop).concat([p]):my.concat([p]),g=weekProj(R,w).pts-base;if(!best||g>best.g)best={p,g,drop:full?drop:null}});
  return best&&best.g>=12?best:null}
function todayView(){const my=myRoster(),w=Math.max(0,CUR_WEEK),wk=WEEKS[w],d=PDATE(CUR_PERIOD),dl=new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  const head=`<div class="today-head"><h3 style="margin:0">${dl}</h3><span class="mut">${CUR_WEEK>=0&&d>=wk.s?`Week ${wk.i} · day ${Math.round((Date.parse(d)-Date.parse(wk.s))/864e5)+1} of ${Math.round((Date.parse(wk.e)-Date.parse(wk.s))/864e5)+1}`:`Week 1 starts ${gDate(WEEKS[0].s)}`}</span></div>`;
  const row=(x,lab,extra="")=>`<tr><td class="l mut" style="width:52px">${lab}</td><td class="l">${pBtn(x.p)} <span class="mut meta">${x.p.pos.join("/")} · ${x.g?x.g.o:""}</span>${extra}</td><td>${x.g?`<b>${f1(x.g.fp)}</b> <span class="mut rng">(${f0(x.g.lo)}–${f0(x.g.hi)})</span>`:dash}</td></tr>`;
  if(!my.length){const top=players.filter(p=>p.rank<=200).map(p=>({p,g:(n=>n&&n.date===d&&!n.out?n:null)(nextGames(p,1)[0])})).filter(x=>x.g).sort((a,b)=>b.g.fp-a.g.fp).slice(0,10);
    const dn=draftNear(),hrs=dn.at?(dn.at-Date.now())/36e5:null,when=dn.at?new Date(dn.at).toLocaleString(undefined,{weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
    return `${head}<div class="chart-card"><h4>${hrs!=null&&hrs>0?`Your draft is ${hrs<24?`in ${Math.max(1,Math.round(hrs))} hour${Math.round(hrs)===1?"":"s"}`:`in ${Math.round(hrs/24)} day${Math.round(hrs/24)===1?"":"s"}`}`:"After your draft"}</h4><p class="empty" style="margin:0">${when?`${esc(LEAGUE.name)} drafts ${when}. Draft Day opens on its own 12 hours before. `:""}After the draft, this screen is your daily checklist: who to start tonight, news that touches your team, how your matchup stands, and the one pickup worth making.</p>
      <div class="row-btns" style="margin-top:8px"><button class="btn primary" onclick="setMode('draft')">Open Draft Day</button><button class="btn" onclick="setMode('draft');$('tab-mock').click()">Practice with a mock draft</button></div></div>
      ${top.length?`<div class="chart-card"><h4>Tonight's best bets</h4><div class="tablebox"><table class="today-tbl"><tbody>${top.map((x,i)=>row(x,"#"+(i+1))).join("")}</tbody></table></div><p class="empty">Expected fantasy points tonight from the next-game model, with the range 8 in 10 games land in.</p></div>`:""}${falloutCard()}`}
  const T=tonight(my),opp=leagueOpp(w),O=opp?rosterOf(opp):[],M=O.length?matchupSim(my,O,w,400):null,mv=bestMove(my,w);
  const live=HAS_LG()&&LEAGUE.live?LEAGUE.live.find(r=>r[0]===LEAGUE.curMatchup&&(r[1]===S.slot||r[3]===S.slot)):null,sc=live?(live[1]===S.slot?[live[2],live[4]]:[live[4],live[2]]):null;
  let h=head;
  h+=`<div class="chart-card"><h4>Tonight's lineup</h4>${T.starters.length?`<div class="tablebox"><table class="today-tbl"><tbody>${T.starters.map(x=>row(x,LINEUP[x.k][0])).join("")}${T.bench.map(x=>row(x,"Bench",x.close?` <span class="chip dtd" title="Within 3 FP of ${esc(x.close.p.name)}, who starts at ${LINEUP[x.close.k][0]}">close call vs ${esc(x.close.p.name.split(" ").pop())}</span>`:"")).join("")}</tbody></table></div>`:'<p class="empty">None of your players has a game tonight.</p>'}
    <p class="empty" style="margin-top:6px">${T.open?`${T.open} open slot${T.open>1?"s":""} tonight: a free agent with a game could fill ${T.open>1?"them":"it"}. `:""}${T.out.length?`Out tonight: ${T.out.map(x=>esc(x.p.name)).join(", ")}. `:""}${T.idle.length?`No game: ${T.idle.length} player${T.idle.length>1?"s":""}. `:""}Starters are the best valid lineup by tonight's expected points.</p></div>`;
  const news=[];my.forEach(p=>{if(p.out||p.dtd)news.push(`<li><b>${pBtn(p)}</b> <span class="chip ${p.out?"out":"dtd"}">${p.out?"Out":"GTD"}</span> ${esc(p.inj&&p.inj.short||"")}${p.out?` <span class="mut">(${retLabel(p)})</span>`:""}</li>`)});
  T.starters.concat(T.bench).forEach(x=>{const m=x.g.mate;if(m.adj>=1.5){const who=m.list.filter(q=>q.out&&q.x>0).map(q=>q.q.name);if(who.length)news.push(`<li><b>${pBtn(x.p)}</b> <span class="zpos">+${f1(m.adj)} FP tonight</span> with ${esc(who.join(" and "))} out</li>`)}});
  my.map(p=>({p,m:moveOf(p,3)})).filter(x=>x.m&&Math.abs(x.m.dr)>=8).sort((a,b)=>Math.abs(b.m.dr)-Math.abs(a.m.dr)).slice(0,3).forEach(({p,m})=>news.push(`<li><b>${pBtn(p)}</b> ${m.dr>0?"climbed":"slid"} ${Math.abs(m.dr)} places in 3 days ${moveTag(m)} <span class="mut">now #${seasonRank(p)}</span></li>`));
  const names=new Set(my.map(p=>p.name)),H=ESPN_NEWS.filter(a=>a.tags.some(t=>names.has(t)&&a.h.includes(t.split(" ").pop())))  // about him, not just tagged.sort((a,b)=>String(b.p).localeCompare(String(a.p))).slice(0,3);
  H.forEach(a=>news.push(`<li class="mut">${esc(a.h)} <span style="font-size:12px">· ${gDate(String(a.p).slice(0,10))}</span></li>`));
  h+=`<div class="chart-card"><h4>News for your team</h4>${news.length?`<ul class="today-news">${news.join("")}</ul>`:'<p class="empty">Nothing new about your players.</p>'}</div>`;
  if(M)h+=`<div class="chart-card"><h4>Your matchup · vs ${esc(teamName(opp))}</h4><div class="vs"><div><div class="k mut">${sc?"Score so far":"Projected score"}</div><div class="big">${sc?f0(sc[0])+"–"+f0(sc[1]):f0(M.a)+"–"+f0(M.b)}</div></div><div><div class="big" style="color:${M.p>=.5?"var(--ok)":"var(--bad)"}">${pc(M.p)}</div><div class="mut" style="font-size:12px">chance you win the week</div></div></div>
    <p class="empty" style="margin-top:6px"><button class="expander" onclick="$('tab-season').click()">Full matchup and daily lineups →</button></p></div>`;
  h+=`<div class="chart-card"><h4>One move</h4>${mv?`<p style="margin:0;font-style:normal;font-size:15px">Add ${pBtn(mv.p,"call")}${mv.drop?` and drop ${pBtn(mv.drop)}`:""}: <b class="zpos">+${f0(mv.g)} FP</b> this week, from his games and your open lineup slots.</p><p class="empty" style="margin-top:6px"><button class="expander" onclick="$('tab-waivers').click()">All pickups →</button></p>`:'<p class="empty" style="margin:0">No pickup adds more than about 12 FP this week. Your roster is fine as it is.</p>'}</div>`;
  return h}
function renderToday(){$("view-today").innerHTML=todayView()}
// one-line summary for the pre-game phone notification (tools/digest.js)
function todayDigest(){const my=myRoster();if(!my.length)return "";const T=tonight(my),w=Math.max(0,CUR_WEEK),opp=leagueOpp(w),O=opp?rosterOf(opp):[],M=O.length?matchupSim(my,O,w,400):null,mv=bestMove(my,w),out=[];
  const close=T.bench.filter(x=>x.close);if(close.length)out.push(`Close call: ${close[0].close.p.name} over ${close[0].p.name} tonight`);
  const newOut=my.filter(p=>p.out&&T.out.some(x=>x.p===p));if(newOut.length)out.push(`Out tonight: ${newOut.map(p=>p.name).join(", ")}`);
  out.push(`${T.starters.length} starting tonight${T.open?`, ${T.open} open slot${T.open>1?"s":""}`:""}`);
  if(M)out.push(`Win chance this week ${pc(M.p)}`);if(mv)out.push(`Pickup: ${mv.p.name} (+${f0(mv.g)} FP this week)`);return out.join(". ")+"."}
$("tab-today").addEventListener("click",renderToday);
// ---- Team Analyzer: any team from any league. It's graded against a league of the same size drafted by ESPN average
// draft position, and pickups come from players on under 40% of ESPN rosters (likely free in most leagues)
S.ana=S.ana||{n:10,ids:[]};S.ana.give=S.ana.give||[];S.ana.get=S.ana.get||[];
const anaRoster=()=>S.ana.ids.map(e=>players[BY_ESPN.get(e)]).filter(Boolean);
function anaPeers(n){const pool=[...players].sort((a,b)=>(a.adp??a.rank+15)-(b.adp??b.rank+15)).slice(0,n*13),T=Array.from({length:n},()=>[]);
  pool.forEach((p,i)=>{const r=Math.floor(i/n),k=i%n;T[r%2?n-1-k:k].push(p)});return T}
const anaPool=R=>players.filter(p=>(p.own??0)<40&&!R.includes(p)&&p.projTot>0);
function anaPickups(R){const base=h2hValue(R).total,wk=REMAIN_WEEKS(),full=R.length>=13,drop=[...R].sort((a,b)=>a.projTot-b.projTot)[0];
  return anaPool(R).sort((a,b)=>b.projTot-a.projTot).slice(0,40).map(p=>{const X=full?R.filter(q=>q!==drop).concat(p):R.concat(p);return {p,drop:full?drop:null,g:(h2hValue(X).total-base)/wk}}).filter(x=>x.g>.5).sort((a,b)=>b.g-a.g).slice(0,3)}
function anaView(){S.ana.give=S.ana.give||[];S.ana.get=S.ana.get||[];const R=anaRoster(),n=S.ana.n;  // older saved copies lack the trade fields
  let h=`<div class="chart-card"><h4>Team Analyzer</h4><p class="empty" style="margin:2px 0 10px">For any ESPN-style head-to-head points team, in any league. Add your players, set your league size, and see how the team stacks up and what to do next.</p>
    <div class="row-btns" style="align-items:center"><input type="search" id="anaQ" placeholder="Add a player" autocomplete="off" style="flex:1 1 220px;max-width:340px">
      <label class="chk" for="anaN">League size <select id="anaN">${[8,10,12,14,16].map(k=>`<option ${k===n?"selected":""}>${k}</option>`).join("")}</select></label>
      ${myRoster().length?'<button class="btn" id="anaMine">Use my league team</button>':""}${R.length?'<button class="btn" id="anaClear">Clear</button>':""}</div>
    <div class="ana-sug" id="anaSug"></div>
    <details style="margin-top:8px"><summary class="mut" style="cursor:pointer;font-size:13px">Paste a roster instead</summary><textarea id="anaPaste" placeholder="One player per line, e.g. copied from your ESPN team page" style="min-height:100px;margin-top:6px"></textarea><button class="btn primary" id="anaPasteBtn" style="margin-top:6px">Add these players</button> <span class="mut" id="anaMsg" style="font-size:12px"></span></details>
    <div class="ana-chips">${R.map(p=>`<span class="ana-chip">${esc(p.name)} <span class="mut">${p.team}</span><button data-anadel="${p.espnId}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join("")}</div>
    <p class="empty" style="margin-top:6px">${R.length}/13 players${R.length<8?" · add at least 8 for a full analysis":""}</p></div>`;
  if(R.length<8)return h;
  const P=anaPeers(n),tw=P.map(teamWeekly),me=teamWeekly(R),place=tw.filter(t=>t.mu>me.mu).length+1,avg=mean(tw.map(t=>t.mu)),poMe=R.reduce((s,p)=>s+p.poGames,0),poAvg=mean(P.map(T=>T.reduce((s,p)=>s+p.poGames,0)));
  h+=`<div class="kpis">${kpT("Starter points / week",f0(me.mu),`typical team in a ${n}-team league: ${f0(avg)}`)}${kpT("Would rank",`<span class="call">${ordinal(place)} of ${n+1}</span>`,`among ${n} teams drafted by ESPN average draft position, plus yours`)}
    ${kpT("Playoff-week games",String(poMe),`Mar 15–Apr 11 · typical team ${f0(poAvg)}`)}${kpT("Injured",String(R.filter(p=>p.out).length),R.filter(p=>p.out).map(p=>esc(p.name.split(" ").filter(w=>!/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop())).join(", ")||"everyone is healthy")}</div>`;
  // where the points come from, against the typical team
  const sm=sourcesOf(R),sp=Object.fromEntries(SRC.map(([k])=>[k,mean(P.map(T=>sourcesOf(T)[k]))])),D=SRC.map(([k,lab])=>({lab,d:sm[k]-sp[k]})),mx=Math.max(1,...D.map(x=>Math.abs(x.d))),srt=[...D].sort((a,b)=>b.d-a.d);
  h+=`<div class="chart-grid"><div class="chart-card"><h4>Where your points come from</h4><div class="eq">your top 10 vs the typical team, fantasy points per week</div><div class="wf" style="margin-top:8px">${D.map(x=>`<div class="wf-row"><span>${x.lab}</span><div class="wf-track"><span style="${x.d>=0?`left:50%;width:${x.d/mx*50}%`:`right:50%;width:${-x.d/mx*50}%`};background:${x.d>=0?"var(--ok)":"var(--bad)"}"></span></div><span class="amt">${x.d>=0?"+":"−"}${f0(Math.abs(x.d))}</span></div>`).join("")}</div>
    <p>Biggest edge: <b>${srt[0].lab.toLowerCase()}</b>. Biggest gap: <b>${srt[srt.length-1].lab.toLowerCase()}</b>. In points leagues every source counts the same, so a gap only matters if a pickup can close it cheaply.</p></div>`;
  const A=assignLineup(R),depth=["PG","SG","SF","PF","C"].map(Q=>({Q,k:R.filter(p=>p.pos.includes(Q)).length,lg:mean(P.map(T=>T.filter(p=>p.pos.includes(Q)).length))}));
  h+=`<div class="chart-card"><h4>Lineup and depth</h4><div class="tablebox"><table><thead><tr><th class="l">Slot</th><th class="l">Player</th><th>FP/G</th><th>Games left</th></tr></thead><tbody>${LINEUP.map(([lab],i)=>{const p=A.slot[i];return `<tr><td class="l">${lab}</td><td class="l">${p?pBtn(p):'<span style="color:var(--bad)">Empty</span>'}</td><td class="num">${p?f1(p.proj.fp):"–"}</td><td class="num">${p?f0(p.avail*p.rate):"–"}</td></tr>`}).join("")}</tbody></table></div>
    <div class="needs" style="margin-top:8px">${depth.map(d=>`<span class="need-chip ${d.k<2?"high":d.k<d.lg-1?"med":"ok"}">${d.Q}: ${d.k} (typical ${f1(d.lg)})</span>`).join("")}</div></div></div>`;
  // every player: value against the best player likely on waivers
  const pool=anaPool(R).sort((a,b)=>b.projTot-a.projTot),repl=pool[0]?pool[0].projTot:0,core=[...R].sort((a,b)=>b.projTot-a.projTot);
  const verdict=p=>p.out&&p.retP-CUR_PERIOD>=14?'<span class="chip out">IR candidate</span>':p.projTot<repl?'<span class="chip dtd">Replaceable</span>':core.indexOf(p)<4?'<span class="chip hot">Core</span>':'<span class="mut">Keep</span>';
  h+=`<div class="chart-card"><h4>Your players</h4><div class="tablebox"><table><thead><tr><th class="l">Player</th><th>Proj FP/G</th><th>Games left</th><th title="Projected fantasy points for the rest of the season">Season FP</th><th title="How much this season's games have moved his projection">Since preseason</th><th class="l">Verdict</th></tr></thead><tbody>
    ${core.map(p=>`<tr><td class="l">${pBtn(p)} <span class="mut">${p.team} · ${p.pos.join("/")}</span>${p.out?' <span class="chip out">Out</span>':p.dtd?' <span class="chip dtd">GTD</span>':""}</td><td class="num">${f1(p.proj.fp)}</td><td class="num">${f0(p.projGP)}</td><td class="num">${f0(p.projTot)}</td><td class="num">${cpos(paceDelta(p))}</td><td class="l">${verdict(p)}</td></tr>`).join("")}</tbody></table></div>
    <p>Replaceable means the best player on fewer than 40% of ESPN rosters${pool[0]?` (${esc(pool[0].name)}, ${f0(repl)} season FP)`:""} is projected to outscore him from here.</p></div>`;
  // what to do
  const tips=[],pk=anaPickups(R),out=R.filter(p=>p.out&&p.retP-CUR_PERIOD>=14).sort((a,b)=>b.projTot-a.projTot)[0],hot=R.filter(p=>p.nowFp&&p.now.gp>=5&&p.nowFp>p.proj.fp*1.15).sort((a,b)=>(b.nowFp-b.proj.fp)-(a.nowFp-a.proj.fp))[0],
    cold=players.filter(p=>!R.includes(p)&&(p.own??0)>=90&&p.now&&p.now.gp>=5&&p.nowFp<p.proj.fp*.85&&p.proj.fp>=30).sort((a,b)=>b.proj.fp-a.proj.fp)[0];
  if(out)tips.push(`<b>Put ${pBtn(out)} on IR</b> if your league has an IR slot: he's out until about ${dayLabel(out.retP)}, and the open roster spot is a free pickup.`);
  pk.forEach((x,i)=>tips.push(`<b>${i?"Also worth a look":"Best pickup"}: ${pBtn(x.p)}</b> (${x.p.pos.join("/")}, ${x.p.team}, on ${f0(x.p.own||0)}% of ESPN rosters)${x.drop?`, dropping ${pBtn(x.drop)}`:""}: +${f1(x.g)} starter points a week. Check he's free in your league first.`));
  if(hot)tips.push(`<b>Sell high on ${pBtn(hot)}</b>: ${f1(hot.nowFp)} FP/G so far against a ${f1(hot.proj.fp)} projection. Hot starts usually cool off, so his trade value may never be higher.`);
  if(cold)tips.push(`<b>Buy low on ${pBtn(cold)}</b>: ${f1(cold.nowFp)} FP/G so far, but still projected for ${f1(cold.proj.fp)}. A frustrated manager may sell below his value.`);
  const tradeHtml=anaTradeCard(R);
  h+=`<div class="chart-card"><h4>What to do</h4>${tips.length?`<ul class="today-news">${tips.map(t=>`<li>${t}</li>`).join("")}</ul>`:'<p class="empty">Nothing stands out: no pickup beats your weakest player and nobody needs a move.</p>'}
    <p>Pickups assume players on fewer than 40% of ESPN rosters are free in your league; your league's actual free agents may differ.</p></div>`+tradeHtml;
  return h}
// trade targets: players on other teams (40%+ of ESPN rosters) worth about the same over the rest of the season, so the
// other manager sees a fair swap, who raise your starter points a week (a thinner position filled, more games, a better fit)
const anaWk=()=>Math.max(1,WEEKS.filter(x=>!x.po&&x.p[1]>=CUR_PERIOD).length);
function anaTrade(R,give,get){const A=R.filter(p=>!give.includes(p)).concat(get),B=h2hValue(R),X=h2hValue(A);return {wk:(X.reg-B.reg)/anaWk(),po:(X.po-B.po)/4}}
function anaTargets(R){const others=players.filter(p=>!R.includes(p)&&(p.own??0)>=40&&!p.out&&p.projTot>0),out=[];
  [...R].filter(p=>!(p.out&&p.retP-CUR_PERIOD>=14)).sort((a,b)=>b.projTot-a.projTot).slice(0,10).forEach(g=>{
    const C=others.filter(q=>Math.abs(q.projTot-g.projTot)<=.12*g.projTot).sort((a,b)=>Math.abs(a.projTot-g.projTot)-Math.abs(b.projTot-g.projTot)).slice(0,12);
    C.map(q=>({g,q,...anaTrade(R,[g],[q])})).filter(x=>x.wk>=3).sort((a,b)=>b.wk-a.wk).slice(0,2).forEach(x=>out.push(x))});
  return out.sort((a,b)=>b.wk-a.wk).slice(0,6)}
// 2-for-1: two of your middle players for one better one, then the open spot goes to the best likely free agent
function anaConsolidate(R){const mid=[...R].sort((a,b)=>b.projTot-a.projTot).slice(3,10).filter(p=>!p.out),pool=anaPool(R).sort((a,b)=>b.projTot-a.projTot),fa=pool[0];let best=null;
  for(let i=0;i<mid.length;i++)for(let j=i+1;j<mid.length;j++){const a=mid[i],b=mid[j],sum=a.projTot+b.projTot,top=Math.max(a.projTot,b.projTot);
    players.filter(q=>!R.includes(q)&&q!==fa&&(q.own??0)>=40&&!q.out&&q.projTot>=top*1.15&&q.projTot<=sum*.85).sort((x,y)=>y.projTot-x.projTot).slice(0,5).forEach(q=>{
      const t=anaTrade(R,[a,b],fa?[q,fa]:[q]);if(t.wk>=3&&(!best||t.wk>best.wk))best={a,b,q,fa,...t}})}
  return best}
function anaTradeCard(R){const give=R.filter(p=>S.ana.give.includes(p.espnId)),get=S.ana.get.map(e=>players[BY_ESPN.get(e)]).filter(Boolean),T=anaTargets(R),C=anaConsolidate(R);
  const sg=(n)=>`${n>=0?"+":"−"}${f0(Math.abs(n))}`;
  let h=`<div class="chart-card"><h4>Trades</h4>`;
  h+=T.length?`<h5 style="margin:10px 0 6px;font-family:var(--body);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Targets: similar value, better for your lineup</h5><div class="tablebox"><table><thead><tr><th class="l">You give</th><th class="l">Ask for</th><th title="Rest-of-season fantasy points: you give vs you get">Season FP</th><th title="Your starter points a week, rest of the regular season">You · per week</th><th>Playoff weeks</th><th></th></tr></thead><tbody>
    ${T.map((x,i)=>`<tr><td class="l">${pBtn(x.g)}</td><td class="l">${pBtn(x.q)} <span class="mut">${x.q.team} · ${x.q.pos.join("/")}</span></td><td class="num">${f0(x.g.projTot)} → ${f0(x.q.projTot)}</td><td class="num zpos">${sg(x.wk)}</td><td class="num ${x.po>=0?"zpos":"zneg"}">${sg(x.po)}</td><td><button class="btn" data-anatry="${x.g.espnId}:${x.q.espnId}">Try it</button></td></tr>`).join("")}</tbody></table></div>`:'<p class="empty">No even-value swap clearly helps your lineup. Your roster fits together well.</p>';
  if(C)h+=`<p style="margin:10px 0 0;font-style:normal;font-size:14px"><b>Consolidate:</b> ${pBtn(C.a)} and ${pBtn(C.b)} for ${pBtn(C.q)}${C.fa?`, then pick up ${pBtn(C.fa)} with the open spot`:""}: <b class="zpos">${sg(C.wk)}</b> starter points a week. Two-for-one deals turn depth you can't start into one better starter. <button class="btn" data-anatry="${C.a.espnId},${C.b.espnId}:${C.q.espnId}${C.fa?","+C.fa.espnId:""}">Try it</button></p>`;
  h+=`<p class="empty" style="margin-top:6px">Targets are players on at least 40% of ESPN rosters, so likely on a team in your league, worth about the same over the rest of the season (within 12%). Pivot can't see other rosters here, so it can't say whether a manager would accept; in your own ESPN league, My Team finds trades that help both sides.</p>`;
  // the checker: tick what you give, search what you get
  h+=`<h5 style="margin:16px 0 6px;font-family:var(--body);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)">Try a trade</h5>
    <div class="chart-grid" style="margin:0"><div><div class="mut" style="font-size:12px;margin-bottom:4px">You give</div><div class="ana-chips" style="margin:0">${[...R].sort((a,b)=>b.projTot-a.projTot).map(p=>`<label class="ana-chip" style="padding-right:10px;cursor:pointer"><input type="checkbox" data-anagive="${p.espnId}" ${S.ana.give.includes(p.espnId)?"checked":""}> ${esc(p.name)}</label>`).join("")}</div></div>
    <div><div class="mut" style="font-size:12px;margin-bottom:4px">You get</div><input type="search" id="anaGetQ" placeholder="Add a player you'd get" autocomplete="off" style="width:100%;max-width:320px"><div class="ana-sug" id="anaGetSug"></div>
      <div class="ana-chips">${get.map(p=>`<span class="ana-chip">${esc(p.name)} <span class="mut">${p.team}</span><button data-anagetdel="${p.espnId}" aria-label="Remove ${esc(p.name)}">×</button></span>`).join("")}</div></div></div>`;
  if(give.length||get.length){const t=anaTrade(R,give,get),n=R.length-give.length+get.length,v=t.wk>=5&&t.po>=-5?"Good for you":t.wk<=-5?"Bad for you":"Close to even";
    h+=`<div class="kpis" style="margin-top:10px">${kpT("Verdict",v,`${give.length} for ${get.length}${n>13?` · you'd need to drop ${n-13}`:n<13?` · ${13-n} open spot${13-n>1?"s":""} for a pickup`:""}`)}${kpT("You · per week",`<span class="${t.wk>=0?"zpos":"zneg"}">${sg(t.wk)}</span>`,"starter points, rest of regular season")}${kpT("You · playoff weeks",`<span class="${t.po>=0?"zpos":"zneg"}">${sg(t.po)}</span>`,"per playoff week")}${kpT("Season FP",`${f0(give.reduce((a,p)=>a+p.projTot,0))} → ${f0(get.reduce((a,p)=>a+p.projTot,0))}`,"what you give vs what you get")}</div>
      <p class="empty" style="margin-top:6px">Measured with the daily-lineup simulation: who would actually start for you each day, with schedules and injuries. ${n>13?"Extra players are counted as if you kept them, so drop your weakest afterwards.":""}</p><button class="btn" id="anaTClear" style="margin-top:6px">Clear trade</button>`}
  return h+`</div>`}
function renderAna(){$("view-ana").innerHTML=anaView()}
$("tab-ana").addEventListener("click",renderAna);
const anaAdd=ids=>{ids.forEach(e=>{if(!S.ana.ids.includes(e)&&S.ana.ids.length<16)S.ana.ids.push(e)});save();renderAna()};
document.addEventListener("input",e=>{if(e.target.id==="anaGetQ"){const t=norm2(e.target.value.trim()),R=anaRoster();
  $("anaGetSug").innerHTML=t.length<2?"":players.filter(p=>!R.includes(p)&&!S.ana.get.includes(p.espnId)&&norm2(p.name).includes(t)).sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,6).map(p=>`<button class="btn" data-anaget="${p.espnId}">${esc(p.name)} <span class="mut">${p.team}</span></button>`).join("");return}
  if(e.target.id!=="anaQ")return;const t=norm2(e.target.value.trim()),R=anaRoster();
  $("anaSug").innerHTML=t.length<2?"":players.filter(p=>!R.includes(p)&&norm2(p.name).includes(t)).sort((a,b)=>b.proj.fp-a.proj.fp).slice(0,6).map(p=>`<button class="btn" data-anaadd="${p.espnId}">${esc(p.name)} <span class="mut">${p.team}</span></button>`).join("")});
document.addEventListener("keydown",e=>{if(e.target.id==="anaQ"&&e.key==="Enter"){const b=document.querySelector("[data-anaadd]");if(b)b.click()}});
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-anaadd],[data-anadel],#anaMine,#anaClear,#anaPasteBtn,[data-anaget],[data-anagetdel],[data-anatry],#anaTClear");if(!t)return;
  if(t.dataset.anaget){S.ana.get.push(+t.dataset.anaget);save();renderAna();const q=$("anaGetQ");if(q)q.focus();return}
  if(t.dataset.anagetdel){S.ana.get=S.ana.get.filter(x=>x!==+t.dataset.anagetdel);save();renderAna();return}
  if(t.dataset.anatry){const [g,q]=t.dataset.anatry.split(":");S.ana.give=g.split(",").map(Number);S.ana.get=q.split(",").map(Number);save();renderAna();$("anaGetQ").scrollIntoView({block:"center",behavior:"smooth"});return}
  if(t.id==="anaTClear"){S.ana.give=[];S.ana.get=[];save();renderAna();return}
  if(t.dataset.anaadd){anaAdd([+t.dataset.anaadd]);const q=$("anaQ");if(q)q.focus()}
  else if(t.dataset.anadel){const id=+t.dataset.anadel;S.ana.ids=S.ana.ids.filter(x=>x!==id);S.ana.give=S.ana.give.filter(x=>x!==id);save();renderAna()}
  else if(t.id==="anaMine"){S.ana.ids=myRoster().map(p=>p.espnId);save();renderAna()}
  else if(t.id==="anaClear"){S.ana.ids=[];S.ana.give=[];S.ana.get=[];save();renderAna()}
  else{const keys=players.map(p=>({e:p.espnId,k:norm(p.name)})).sort((a,b)=>b.k.length-a.k.length),got=[];
    $("anaPaste").value.split(/\n/).map(norm).filter(Boolean).forEach(l=>{const hit=keys.find(x=>l.includes(x.k)&&!got.includes(x.e));if(hit)got.push(hit.e)});
    anaAdd(got);const m=$("anaMsg");if(m)m.textContent=got.length?`Added ${got.length} player${got.length>1?"s":""}.`:"No names matched. Put one player per line."}});
document.addEventListener("change",e=>{if(e.target.id==="anaN"){S.ana.n=+e.target.value;save();renderAna()}
  if(e.target.dataset&&e.target.dataset.anagive){const id=+e.target.dataset.anagive;S.ana.give=e.target.checked?[...new Set(S.ana.give.concat(id))]:S.ana.give.filter(x=>x!==id);save();renderAna()}});
// ---- find a player from anywhere: the search button or "/" opens it, arrows move, Enter opens his profile ----
(()=>{const box=document.createElement("div");box.className="finder";box.id="finder";box.hidden=true;box.setAttribute("role","dialog");box.setAttribute("aria-label","Find a player");
  box.innerHTML='<div class="finder-box"><input id="findQ" placeholder="Find a player or team (e.g. DEN)" autocomplete="off" spellcheck="false" aria-controls="findList"><div id="findList" role="listbox"></div></div>';document.body.appendChild(box);
  const q=$("findQ"),list=$("findList"),norm=x=>x.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();let hits=[],sel=0;
  const draw=()=>{const t=norm(q.value.trim());hits=!t?[]:players.filter(p=>norm(p.name).includes(t)||p.team.toLowerCase()===t).sort((a,b)=>(norm(b.name).split(" ").some(w=>w.startsWith(t))-norm(a.name).split(" ").some(w=>w.startsWith(t)))||b.proj.fp-a.proj.fp).slice(0,8);sel=0;
    list.innerHTML=hits.length?hits.map((p,i)=>`<button class="hit" role="option" aria-selected="${i===sel}" data-i="${i}"><span><b>${esc(p.name)}</b> <span class="mut">${p.team} · ${p.pos.join("/")}</span>${p.out?' <span class="chip out">Out</span>':p.dtd?' <span class="chip dtd">GTD</span>':""}</span><span class="mut">${f1(p.proj.fp)} FP/G</span></button>`).join(""):`<div class="hint">${t?"No player matches.":"Type a name or a team code. Enter opens the profile; Esc closes."}</div>`};
  const mark=()=>list.querySelectorAll(".hit").forEach((b,i)=>b.setAttribute("aria-selected",i===sel));
  const open=()=>{box.hidden=false;q.value="";draw();q.focus()},close=()=>{box.hidden=true},go=i=>{const p=hits[i];if(!p)return;close();openPlayer(p.id)};
  $("findBtn").onclick=open;box.onclick=e=>{if(e.target===box)close();const h=e.target.closest(".hit");if(h)go(+h.dataset.i)};q.oninput=draw;
  q.onkeydown=e=>{if(e.key==="ArrowDown"){sel=Math.min(hits.length-1,sel+1);mark();e.preventDefault()}else if(e.key==="ArrowUp"){sel=Math.max(0,sel-1);mark();e.preventDefault()}else if(e.key==="Enter")go(sel);else if(e.key==="Escape")close()};
  document.addEventListener("keydown",e=>{if(e.key==="/"&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&box.hidden){e.preventDefault();open()}})})();
$("tab-team").addEventListener("click",renderTeam);
$("tab-players").addEventListener("click",renderPlayers);
["season","waivers","trades","rosters"].forEach(t=>$("tab-"+t).addEventListener("click",()=>renderSeason(t)));
TABS.forEach(t=>$("tab-"+t).onclick=()=>{TABS.forEach(u=>{$("view-"+u).hidden=u!==t;$("tab-"+u).setAttribute("aria-selected",u===t)});replay($("view-"+t),"view-in")});
// ---- modes: Draft Day (board, insights, mock) and Season (my team, matchup, waivers, trades, rosters) ----
const modeOf=t=>$("tab-"+t).dataset.mode||null;
S.lastTab=S.lastTab||{draft:"board",season:"today"};if(!S.todaySeen){S.lastTab.season="today";S.todaySeen=1}  // Today is the Season home
function setMode(m,{open=true}={}){S.mode=m;save();document.body.classList.toggle("m-draft",m==="draft");document.body.classList.toggle("m-season",m==="season");
  $("mode-draft").setAttribute("aria-pressed",m==="draft");$("mode-season").setAttribute("aria-pressed",m==="season");
  TABS.forEach(t=>{const md=modeOf(t);$("tab-"+t).hidden=!!md&&md!==m});
  // the draft sidebar stays for all of Draft Day (shared tabs included) so the page width never changes within a mode
  $("rail").hidden=m!=="draft";document.querySelector("main").classList.toggle("solo",m!=="draft");
  if(m==="season")renderSeasonBar();
  if(open){const cur=TABS.find(t=>$("tab-"+t).getAttribute("aria-selected")==="true");if(!cur||modeOf(cur)!==m)$("tab-"+(S.lastTab[m]||(m==="draft"?"board":"today"))).click()}}
function renderSeasonBar(){const el=$("seasonBar");if(!el)return;const w=Math.max(0,CUR_WEEK),wk=WEEKS[w],opp=leagueOpp(w),my=myRoster(),O=opp?rosterOf(opp):[];
  const dates=`${new Date(wk.s+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}–${new Date(wk.e+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"})}`;
  const M=my.length&&O.length?matchupSim(my,O,w,300):null;
  el.innerHTML=`<span><b>Week ${wk.i}</b> <span class="mut">${dates}</span><br>${opp?`vs ${esc(teamName(opp))}`:"no matchup set"}</span>${M?`<span class="pct" style="color:${M.p>=.5?"var(--ok)":"var(--bad)"}">${pc(M.p)}</span>`:`<span class="mut">${my.length?"":"after the draft"}</span>`}`;
  el.hidden=false;el.title="Open this week's matchup";el.onclick=()=>$("tab-season").click()}
// reserve each tab's width for its selected (bold italic) form so choosing a tab never nudges its neighbours
document.querySelectorAll(".tabs [role=tab],.modes button").forEach(b=>{const t=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!t)return;
  const s=document.createElement("span");s.className="tl";s.dataset.label=s.textContent=t.textContent.trim();b.replaceChild(s,t)});
$("mode-draft").onclick=()=>setMode("draft");$("mode-season").onclick=()=>setMode("season");
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("#toSeason"))setMode("season")});
// a tab opened from anywhere (a link inside a view, a button) brings its mode with it, and each mode remembers its last tab
TABS.forEach(t=>$("tab-"+t).addEventListener("click",()=>{const md=modeOf(t);if(md&&md!==S.mode)setMode(md,{open:false});S.lastTab[S.mode]=t;save()}));
// Season is home: Draft Day takes over only for the draft itself, from 12 hours before it starts until it's done (or during a
// mock draft). Each of those moments switches once; switching yourself sticks until the next one
const draftNear=()=>{const done=(HAS_LG()&&LEAGUE.drafted)||(!MOCK()&&S.picks.length>=S.teams*13),at=HAS_LG()&&LEAGUE.draftDate?LEAGUE.draftDate:null;return {done,at,near:!done&&((HAS_LG()&&LEAGUE.inProgress)||(!!at&&Date.now()>at-12*36e5))}};
(()=>{const {done,near}=draftNear(),key=(HAS_LG()?LEAGUE.id:"")+":"+(done?"done":near?"near":"before");
  if(S.modeAuto!==key&&!MOCK()){S.modeAuto=key;S.mode=near?"draft":"season"}setMode(S.mode||(near||MOCK()?"draft":"season"))})();
// tooltips
const tip=$("tip");
document.addEventListener("pointerover",e=>{const t=e.target.closest("[data-tip]");if(!t){tip.hidden=true;return}tip.textContent=t.getAttribute("data-tip");tip.hidden=false});
document.addEventListener("pointermove",e=>{if(tip.hidden)return;const w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.min(innerWidth-w-8,e.clientX+14)+"px";tip.style.top=Math.max(8,e.clientY-h-10)+"px"});
document.addEventListener("scroll",()=>tip.hidden=true,true);
// import
const norm=s=>s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z ]/g," ").replace(/\b(jr|sr|ii|iii|iv)\b/g,"").replace(/\s+/g," ").trim();
$("importBtn").onclick=()=>{
  const lines=$("importBox").value.split(/\n/).map(norm).filter(Boolean),keys=players.map(p=>({id:p.id,k:norm(p.name)})),used=new Set(),order=[];
  lines.forEach(l=>{const hit=keys.find(x=>!used.has(x.id)&&l.includes(x.k));if(hit){used.add(hit.id);order.push(hit.id)}});
  if(!order.length){$("importMsg").textContent="No player names matched. Paste one player per line.";return}
  const rest=players.filter(p=>!used.has(p.id)).sort((a,b)=>a.base-b.base).map(p=>p.id);
  S.order=[...order,...rest];applyOrder();renderAll();renderModels();$("importMsg").textContent=`Re-ranked ${order.length} matched players. ${rest.length} others follow in default order.`;
};
$("resetRanks").onclick=()=>{S.order=null;applyOrder();renderAll();renderModels();$("importMsg").textContent="Default board restored."};
let clearArmed=false;
$("resetDraft").onclick=e=>{if(!clearArmed){clearArmed=true;e.target.textContent="Click again to clear all picks";setTimeout(()=>{clearArmed=false;e.target.textContent="Clear draft"},3000);return}
  S.picks=[];clearArmed=false;e.target.textContent="Clear draft";renderAll();$("importMsg").textContent="Draft cleared."};

if(MOCK()&&S.mock.styles)setRoomPicks();
// freshness: when the page was built, and any source stuck on an old copy (a failed fetch) or a refresh that never ran
(()=>{const B=typeof BUILD!=="undefined"?BUILD:null,el=$("asof");if(!B){el.textContent=`ESPN 2026-27 · data as of ${new Date(FETCHED+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;return}
  const t=s=>new Date(s.replace("Z",":00Z")),fmt=d=>d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}),at=t(B.at),age=(Date.now()-at)/36e5;
  const LAB={stats:"Basketball Reference stats",contracts:"contracts",ESPN:"ESPN injuries and news",league:"your ESPN league",schedule:"NBA schedule","recent games":"recent games",teammates:"teammate splits",FantasyPros:"FantasyPros ranks"};
  const old=Object.entries(B.src).filter(([k,v])=>(at-t(v))/36e5>36).map(([k,v])=>`${LAB[k]||k} from ${t(v).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`);
  el.textContent=`ESPN 2026-27 · updated ${fmt(at)}`;el.title="Last fetched: "+Object.entries(B.src).map(([k,v])=>`${LAB[k]||k} ${fmt(t(v))}`).join(" · ");
  const w=age>30?`Data is ${Math.max(1,Math.round(age/24))} day${Math.round(age/24)>1?"s":""} old: the daily refresh hasn't run since ${at.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`:old.length?`Stale: ${old.join(", ")}`:"";
  if(w)el.insertAdjacentHTML("afterend",`<span class="need-chip med" id="staleChip" title="${esc(w)}">${age>30?"data "+Math.max(1,Math.round(age/24))+"d old":"some data stale"}</span>`)})();
renderNews();renderModels();renderAll();renderMix();renderScoring();renderMock();

// ================= ASK CLAUDE (optional capability) =================
(async()=>{try{sample=window.claude&&window.claude.use?await window.claude.use("sample"):null}catch(e){sample=null}if(sample){$("aiCard").hidden=false;const b=$("briefRow");if(b)b.hidden=false}})();
function ctx(){
  computeDisp();const my=mine(),avail=players.filter(p=>!pickOf(p.id)).sort((a,b)=>a.disp-b.disp).slice(0,30);
  const line=p=>`${p.disp}. ${p.name}${p.adp?` [ADP ${f1(p.adp)}]`:""}${p.espnFp!=null?` [ESPN proj ${f1(p.espnFp)} FP/G]`:""} (${p.team}, ${p.pos.join("/")}, age ${p.age}) proj ${f1(p.proj.fp)} FP/G [80% ${f1(p.lo)}-${f1(p.hi)}], proj ${Math.round(p.projGP)} GP, proj season ${f0(p.projTot)} FP, top-50 odds ${pc(p.pTop50)}, 9cat z ${f1(p.cat)}, board #${p.rank} vs model #${p.modelRank}, breakout odds ${p.brk===null?"n/a":pc(p.brk)}, team fit ×${p.fit.tot.toFixed(2)}, proj ${f1(p.projMpg)} min/g (${f1(p.fp36)} FP/36)${p.out?", CURRENTLY OUT":""}${p.dtd?", day-to-day":""}. Note: ${p.note}`;
  const cur=S.picks.length+1,nx=teamAt(cur)===S.slot?cur:myNextPick(cur),after=myNextPick(nx+1);
  return `ESPN fantasy NBA draft, 2026-27 season (today is ${new Date(FETCHED+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}; about ${REMAIN} games remain). ${S.teams} teams, snake draft, I pick from slot ${S.slot}. Scoring: ${S.scoring==="pts"?"ESPN default H2H points":"8-category"}. Roster: PG, SG, SF, PF, C, G, F, 3 UTIL, 3 bench (13).
Current overall pick: ${cur}. My next pick: ${nx}; the one after: ${after}.
My roster so far:
${my.length?my.map(line).join("\n"):"(none)"}
Top 30 available (${S.rankBy==="model"?"model":"board"} order):
${avail.map(line).join("\n")}`;
}
async function ask(kind){
  const out=$("aiOut");out.hidden=false;out.textContent="Thinking…";
  const task=kind==="pick"?"Recommend who I should draft with my next pick, plus two alternates. Weigh scoring format, positional needs, projected games, risk ranges and who is likely gone before my following pick. Be concise: a short ranked list with one-line reasons, then one sentence of strategy for the next round."
    :"Grade my current roster for this format (letter grade), name its two biggest strengths and two biggest holes, and list three types of players to target next. Be concise.";
  try{const r=await sample(`${task}\n\n${ctx()}\n\nUse only the data above. Projections come from a regression-based model with Monte Carlo simulation. Plain text, no markdown headers.`,{modelTier:"default",onText:({text})=>{out.textContent=text}});out.textContent=r.text}
  catch(e){out.textContent=e&&e.code==="not_granted"?"Claude access wasn't allowed for this page. You can turn it on from the artifact's Permissions menu.":e&&e.code==="rate_limited"?"Too many requests just now. Try again in a minute.":"Couldn't get an answer: "+(e&&e.message||"unknown error")}
}
if(LEAGUE_MSG)setTimeout(()=>toast(LEAGUE_MSG),800);
$("aiPick").onclick=()=>ask("pick");$("aiTeam").onclick=()=>ask("team");
BOOT=false;
// your picks, roster edits, adjustments and settings follow you across devices: a private copy only you can read, newest wins
(async()=>{try{if(!window.claude||!window.claude.use)return;const db=await window.claude.use("db"),user=await window.claude.use("user");if(!db||!user)return;const uid=await user.id();if(!uid)return;
  let dev=null;try{dev=localStorage.getItem("pivot.device")||Math.random().toString(36).slice(2);localStorage.setItem("pivot.device",dev)}catch(e){dev=Math.random().toString(36).slice(2)}
  const ref=db.doc("data/users/"+uid+"/state"),sc=()=>{try{return localStorage.getItem("hoopsDraftRoom.scoring")}catch(e){return null}};
  // the adopted copy carries its own time, so after the reload it no longer looks newer; at most one reload per copy, and none
  // when this browser can't keep it (storage blocked), so the page can never get stuck reloading
  const adopt=d=>{try{const s=JSON.parse(d.s);s._t=d.t;const v=JSON.stringify(s);localStorage.setItem(LS,v);if(d.sc)localStorage.setItem("hoopsDraftRoom.scoring",d.sc);else localStorage.removeItem("hoopsDraftRoom.scoring");
    if(localStorage.getItem(LS)!==v||sessionStorage.getItem("pivot.adopted")===String(d.t))return;sessionStorage.setItem("pivot.adopted",String(d.t))}catch(e){return}location.reload()};
  SYNC.ref=ref;SYNC.dev=dev;SYNC.push=()=>{S._t=S._t||Date.now();return ref.set({t:S._t,dev,s:JSON.stringify(S),sc:sc()}).catch(()=>{})};
  const snap=await ref.get(),r=snap.exists?snap.data():null;
  if(r&&r.t>(S._t||0)&&r.dev!==dev){adopt(r);return}
  if(!r||(S._t||0)>r.t)SYNC.push();
  // edits from another device while this one is open: offer a reload rather than changing the screen under you
  ref.onSnapshot(sn=>{const d=sn.exists?sn.data():null;if(!d||d.dev===dev||d.t<=(S._t||0)||$("syncBar"))return;
    const b=document.createElement("div");b.id="syncBar";b.className="toast show";b.style.cursor="pointer";b.textContent="Changed on another device · tap to load";b.onclick=()=>adopt(d);document.body.appendChild(b)},()=>{})}catch(e){}})();
</script>
