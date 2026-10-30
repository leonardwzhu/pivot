
// ================= DATA =================
const T0=performance.now();
const KEYS=["pts","reb","ast","stl","blk","tpm","tov"],SKEYS=[...KEYS,"fgm","fga","ftm","fta"];
const SEAS=["2023-24","2024-25","2025-26"],POOLY=[2024,2025,2026],CUR=2027;
const YEARS=[2017,2018,2019,2020,2021,2022,2023,2024,2025,2026,2027];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
const quant=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))]};
function rec(pid,y){const r=DB[pid]&&DB[pid].s[y];if(!r)return null;
  const [age,team,gp,min,pts,reb,ast,stl,blk,tpm,tov,fgm,fga,ftm,fta,usg,splits]=r;
  return {y,age,team,gp,min,pts,reb,ast,stl,blk,tpm,tov,fgm,fga,ftm,fta,usg,splits,fg:fga?fgm/fga:0,ft:fta?ftm/fta:0}}
// games each team played per season (shortened 2020 and 2021 seasons)
const GMS={};YEARS.forEach(y=>{let m=0;for(const pid in DB){const r=DB[pid].s[y];if(r&&r[2]>m)m=r[2]}GMS[y]=m});
const REMAIN=82-GMS[CUR];
function shots(l){if(l.fga!=null)return {fgm:l.fgm,fga:l.fga,ftm:l.ftm,fta:l.fta};
  const ftm=0.18*l.pts,fta=l.ft>0?ftm/l.ft:0,fgm=Math.max(0,(0.82*l.pts-l.tpm)/2),fga=l.fg>0?fgm/l.fg:0;return {ftm,fta,fgm,fga}}
// ESPN default points: PTS+1, 3PM+1, FGM+2, FGA-1, FTM+1, FTA-1, REB+1, AST+2, STL+4, BLK+4, TO-2
// ESPN H2H Points scoring. Defaults come from ESPN's default H2H Points league settings ;
// a league's own values can be saved in Method & Import and are applied to every fit, backtest and projection on load.
const ESPN_SCORING={"tov": -2.0, "fga": -1.0, "fta": -1.0, "pts": 1.0, "reb": 1.0, "ftm": 1.0, "tpm": 1.0, "ast": 2.0, "fgm": 2.0, "blk": 4.0, "stl": 4.0};
const SCORING_LABELS={pts:"Point scored",reb:"Rebound",ast:"Assist",stl:"Steal",blk:"Block",tpm:"3-pointer made",tov:"Turnover",fgm:"Field goal made",fga:"Field goal attempted",ftm:"Free throw made",fta:"Free throw attempted"};
const SC=(()=>{let c=null;try{c=JSON.parse(localStorage.getItem("hoopsDraftRoom.scoring")||"null")}catch(e){}
  const o={...ESPN_SCORING};if(c&&typeof c==="object")Object.keys(o).forEach(k=>{if(typeof c[k]==="number"&&isFinite(c[k]))o[k]=c[k]});return o})();
const SC_CUSTOM=Object.keys(SC).some(k=>SC[k]!==ESPN_SCORING[k]);
function fpOf(l){const s=shots(l);return SC.pts*l.pts+SC.reb*l.reb+SC.ast*l.ast+SC.stl*l.stl+SC.blk*l.blk+SC.tpm*l.tpm+SC.tov*l.tov+SC.fgm*s.fgm+SC.fga*s.fga+SC.ftm*s.ftm+SC.fta*s.fta}
function full(l){return l.fga!=null?l:{...l,...shots(l)}}
function scale(l,m,keys=SKEYS){const o=full(l),r={...o};keys.forEach(k=>r[k]=o[k]*m);return r}
const usage=l=>{const s=shots(l);return s.fga+.44*s.fta+l.tov};
function linfit(xs,ys){
  const n=xs.length,mx=mean(xs),my=mean(ys);let sxx=0,sxy=0,syy=0;
  for(let i=0;i<n;i++){sxx+=(xs[i]-mx)**2;sxy+=(xs[i]-mx)*(ys[i]-my);syy+=(ys[i]-my)**2}
  const b=sxx?sxy/sxx:0,a=my-b*mx;let rss=0;for(let i=0;i<n;i++)rss+=(ys[i]-a-b*xs[i])**2;
  return {a,b,n,r2:sxx&&syy?sxy*sxy/(sxx*syy):0,sd:Math.sqrt(rss/Math.max(1,n-2))};
}
// a season inside a player's career with no games is a missed season, not a gap in the data
function careerSeasons(pid,years){const have=YEARS.filter(y=>DB[pid]&&DB[pid].s[y]),first=have[0],last=have[have.length-1];
  return years.map(y=>{const r=rec(pid,y);if(r)return r;return first!==undefined&&y>first&&y<last?{y,gp:0,min:0,missed:true}:null})}
const shortY=y=>`${String(y-1).slice(2)}-${String(y).slice(2)}`;
const sh=y=>shortY(y);

// ================= TRAINING SET: every NBA player-season since 2016-17 =================
const BRK={min:6,rel:.15}; // a breakout = +6 FP/G and +15% the next season
const ALLPIDS=Object.keys(DB);
function featOf(pid,t){const st=rec(pid,t);if(!st||st.gp<25||st.min<10)return null;const pv=rec(pid,t-1);
  return {age:st.age,fp:fpOf(st),trend:pv&&pv.gp>=25?fpOf(st)-fpOf(pv):null,first:t===YEARS[0]?null:(pv?0:1),use:usage(st),ast:st.ast,reb:st.reb,min:st.min,usg:st.usg}}
const TRAIN=[],GPROWS=[];
ALLPIDS.forEach(pid=>{for(let t=YEARS[0];t<CUR-1;t++){
  const st=rec(pid,t),nx=rec(pid,t+1);if(!st)continue;
  if(st.gp>=10&&nx)GPROWS.push({pid,t,x:Math.min(1,st.gp/GMS[t]),y:Math.min(1,nx.gp/GMS[t+1]),age:st.age});
  const f=featOf(pid,t);if(!f||!nx||nx.gp<25)continue;
  const d=fpOf(nx)-f.fp;TRAIN.push({pid,p:{name:DB[pid].n,id:null},t,f,d,next:fpOf(nx),brk:d>=BRK.min&&d/Math.max(1,f.fp)>=BRK.rel,st,nx})}});
const TRANS=TRAIN;

function lineMeans(rows){const m={};const ls=rows.map(r=>full(r.st));SKEYS.forEach(k=>m[k]=mean(ls.map(l=>l[k])));
  m.fg=m.fgm/m.fga;m.ft=m.ftm/m.fta;m.fp=mean(ls.map(fpOf));return m}
// Fit the base model on every transition that ends by season tMax
function fitParams(tMax){
  const rows=TRAIN.filter(r=>r.t+1<=tMax),xs=rows.map(r=>r.f.fp),ys=rows.map(r=>r.next),ages=rows.map(r=>r.f.age);
  const stab=linfit(xs,ys),b=clamp(stab.b,.5,.99),Nref=5*mean(rows.map(r=>Math.min(82,r.nx.gp))),K=Nref*(1-b)/b;
  const resid=ys.map((y,i)=>y-(stab.a+stab.b*xs[i])),ageFit=linfit(ages,resid);
  const g=GPROWS.filter(r=>r.t+1<=tMax),gfit=linfit(g.map(r=>r.x),g.map(r=>r.y)),bg=clamp(gfit.b,.1,.95),Kg=5*(1-bg)/bg,meanRate=mean(g.map(r=>r.y));
  const gres=g.map(r=>r.y-(gfit.a+gfit.b*r.x)),gAge=linfit(g.map(r=>r.age),gres);
  const last=rows.filter(r=>r.t===tMax-1&&r.f.fp>=15);
  return {stab,b,K,Nref,ageFit,gfit,Kg,meanRate,gAge,means:lineMeans(rows),n:rows.length,
    chart:{st:last.map(r=>({x:r.f.fp,y:r.next,age:r.f.age,res:r.next-(stab.a+stab.b*r.f.fp)-0,p:r.p})),
      gp:g.filter(r=>r.t===tMax-1).map(r=>({x:r.x*82,y:r.y*82,p:{name:DB[r.pid].n}}))}};
}
function fitMin(tMax){
  const rows=TRAIN.filter(r=>r.t+1<=tMax&&r.st.min>=12&&r.nx.min>=12),ages=rows.map(r=>r.f.age);
  const mx=rows.map(r=>r.st.min),my=rows.map(r=>r.nx.min),mfit=linfit(mx,my);
  const bm=clamp(mfit.b,.3,.98),Kmpg=5*mean(rows.map(r=>Math.min(82,r.nx.gp)))*(1-bm)/bm,mAge=linfit(ages,my.map((y,i)=>y-(mfit.a+mfit.b*mx[i])));
  const rx=rows.map(r=>r.f.fp/r.st.min),ry=rows.map(r=>r.next/r.nx.min),rfit=linfit(rx,ry);
  const br=clamp(rfit.b,.4,.99),Krate=5*mean(rows.map(r=>Math.min(82,r.nx.gp)*r.nx.min))*(1-br)/br,rAge=linfit(ages,ry.map((y,i)=>y-(rfit.a+rfit.b*rx[i])));
  const gfit=linfit(rows.map(r=>r.f.fp),rows.map(r=>r.next));
  const last=rows.filter(r=>r.t===tMax-1&&r.f.fp>=15);
  return {mfit,Kmpg,mAge,rfit,Krate,rAge,gfit,meanMin:mean(my),meanRate:mean(ry),n:rows.length,
    chart:last.map(r=>({p:r.p,mx:r.st.min,my:r.nx.min,rx:r.f.fp/r.st.min,ry:r.next/r.nx.min}))};
}

// ---- base projection: weighted seasons -> regression to the mean -> age
function blend(seasons,weights,K,m){
  let W=0;const acc={};SKEYS.forEach(k=>acc[k]=0);
  seasons.forEach((s,i)=>{if(!s||s.gp<=0)return;const w=weights[i]*Math.min(82,s.gp),f=full(s);W+=w;SKEYS.forEach(k=>acc[k]+=w*f[k])});
  if(!W)return null;
  const raw={},reg={};SKEYS.forEach(k=>{raw[k]=acc[k]/W;reg[k]=(acc[k]+K*m[k])/(W+K)});
  [raw,reg].forEach(l=>{l.fg=l.fga?l.fgm/l.fga:0;l.ft=l.fta?l.ftm/l.fta:0});
  return {raw,reg,N:W};
}
// players with no NBA history start from ESPN's projected line, then their 2026-27 games pull them toward reality
function project(prior,seasons,weights,prm,age){
  const hasHist=seasons.slice(0,3).some(x=>x&&x.gp>0);
  if(!hasHist&&prior){const bt=blend(seasons,weights,prm.K,prior),sig=prm.ageFit.sd*1.6,fp0=fpOf(prior);
    const lab=prior.__rk?"Rookie prior (ESPN + draft position)":"ESPN projection (no NBA history)";
    if(!bt)return {line:prior,fp:fp0,sigma:sig,N:0,rookie:true,steps:[[lab,fp0]]};
    const fp=fpOf(bt.reg);return {line:bt.reg,fp,sigma:sig*Math.sqrt(prm.K/(bt.N+prm.K)),N:bt.N,rookie:true,steps:[[lab,fp0],["2026-27 games so far",fp-fp0]]}}
  const b=blend(seasons,weights,prm.K,prm.means);
  if(!b)return null;
  const fpRaw=fpOf(b.raw),fpReg=fpOf(b.reg),ageD=clamp(prm.ageFit.a+prm.ageFit.b*age,-6,6),mAge=clamp(1+ageD/Math.max(5,fpReg),.8,1.2);
  const line=scale(b.reg,mAge),fp=fpOf(line);
  const sigma=Math.min(prm.ageFit.sd*2.5,prm.ageFit.sd*Math.sqrt(.6+.4*prm.Nref/Math.max(b.N,1)));
  return {line,fp,sigma,N:b.N,steps:[["3-season weighted",fpRaw],["Regression to mean",fpReg-fpRaw],["Age ("+age+")",fp-fpReg]]};
}
function gameRate(seasons,weights,prm,age){
  let sw=0,swr=0;seasons.forEach((s,i)=>{if(!s)return;sw+=weights[i];swr+=weights[i]*Math.min(1,s.gp/(GMS[s.y]||82))});
  const r=(swr+prm.Kg*prm.meanRate)/(sw+prm.Kg)+prm.gAge.a+prm.gAge.b*age;return clamp(r,.25,.97);
}
function projectMin(seasons,weights,prm,age){
  let wg=0,wm=0,wfp=0;
  seasons.forEach((s,i)=>{if(!s||s.gp<=0||!s.min)return;const w=weights[i]*Math.min(82,s.gp);wg+=w;wm+=w*s.min;wfp+=w*fpOf(s)});
  if(!wg)return null;
  const mpgR=(wm+prm.Kmpg*prm.meanMin)/(wg+prm.Kmpg),rateR=(wfp+prm.Krate*prm.meanRate)/(wm+prm.Krate);
  const mpg=clamp(mpgR+clamp(prm.mAge.a+prm.mAge.b*age,-3,3),6,38),rate=Math.max(.2,rateR+clamp(prm.rAge.a+prm.rAge.b*age,-.15,.15));
  return {mpg0:wm/wg,rate0:wfp/wm,mpg,rate,fpg:mpg*rate};
}

// ---- college -> NBA rookie translation (2025 class: college lines compiled, NBA lines real)
const TR=(()=>{const pairs=Object.keys(COLL).filter(n=>PID[n]&&rec(PID[n],2026));
  const L9=c=>({gp:30,pts:c[0],reb:c[1],ast:c[2],stl:c[3],blk:c[4],tpm:c[5],tov:c[6],fg:c[7],ft:c[8]});
  const xs=pairs.map(n=>fpOf(L9(COLL[n]))),ys=pairs.map(n=>fpOf(rec(PID[n],2026)));
  return {...linfit(xs,ys),pts:pairs.map((n,i)=>({x:xs[i],y:ys[i],n}))}})();
const trans=x=>TR.a+TR.b*x;

// ---- breakout comps: nearest-neighbour player-seasons
const FSD=(()=>{const sd=k=>{const v=TRAIN.map(r=>r.f[k]).filter(x=>x!==null&&x!==undefined),m=mean(v);return Math.sqrt(mean(v.map(x=>(x-m)**2)))||1};
  return {age:sd("age"),fp:sd("fp"),trend:sd("trend"),use:sd("use"),ast:sd("ast"),reb:sd("reb"),min:sd("min")}})();
const FW={age:1.6,fp:1,trend:.8,use:.6,ast:.4,reb:.3,min:.5,first:.8};
const FK=["age","fp","use","ast","reb","min"],FSC=FK.map(k=>Math.sqrt(FW[k])/FSD[k]),TSC=Math.sqrt(FW.trend)/FSD.trend;
// pre-scaled feature vector so each distance is a short loop
function fvec(f){if(f._v)return f._v;const v=new Float64Array(8);FK.forEach((k,i)=>v[i]=f[k]*FSC[i]);v[6]=f.trend===null?NaN:f.trend*TSC;v[7]=f.first===null?NaN:f.first;return f._v=v}
function fdist(a,b){const x=fvec(a),y=fvec(b);let d=0;for(let i=0;i<6;i++){const q=x[i]-y[i];d+=q*q}
  d+=(x[6]===x[6]&&y[6]===y[6])?(x[6]-y[6])**2:.25;d+=(x[7]===x[7]&&y[7]===y[7])?FW.first*(x[7]-y[7])**2:.15;return Math.sqrt(d)}
let KNN=10;
function comps(f,rows,selfPid,k=KNN){
  const near=[];for(const r of rows){if(r.pid===selfPid)continue;const d=fdist(f,r.f);
    if(near.length<k||d<near[near.length-1].d){let i=near.length;while(i>0&&near[i-1].d>d)i--;near.splice(i,0,{r,d});if(near.length>k)near.pop()}}
  const w=near.map(x=>1/(.25+x.d)),W=w.reduce((a,b)=>a+b,0);
  const delta=near.reduce((s,x,i)=>s+w[i]*x.r.d,0)/W,brk=near.reduce((s,x,i)=>s+w[i]*(x.r.brk?1:0),0)/W;
  const sd=Math.sqrt(near.reduce((s,x,i)=>s+w[i]*(x.r.d-delta)**2,0)/W);
  return {delta,brk,sd,list:near}}
const BRK_BASE=TRAIN.filter(r=>r.brk).length/TRAIN.length;

// ---- team fit: every roster gets 240 minutes and a fixed number of plays; projections that overflow are scaled
// back, with stars giving up less than bench players. The strength (beta) of each squeeze is fit by backtest.
function teamFit(entries,betaM,betaU,usePlays){
  const byTeam={};entries.forEach(e=>(byTeam[e.team]=byTeam[e.team]||[]).push(e));
  const solve=(list,val,cap,beta)=>{const f=c=>list.reduce((s,e)=>s+e.a*Math.min(cap.max||1e9,val(e)*c**beta(e)),0);
    let lo=.3,hi=3;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(f(mid)>cap.total)hi=mid;else lo=mid}return (lo+hi)/2};
  const info={};
  Object.entries(byTeam).forEach(([t,list])=>{
    const bM=e=>betaM*clamp(1-e.mpg/48,.15,1),cM=solve(list,e=>e.mpg,{total:240,max:40},bM);
    list.forEach(e=>{e.mMin=clamp(Math.min(40,e.mpg*cM**bM(e))/e.mpg,.6,1.4)});
    const bU=e=>betaU*clamp(1-e.use/30,.2,1),cU=solve(list,e=>e.use*e.mMin,{total:usePlays},bU);
    list.forEach(e=>{e.mUse=clamp(cU**bU(e),.75,1.3)});
    info[t]={minSum:list.reduce((s,e)=>s+e.a*e.mpg,0),useSum:list.reduce((s,e)=>s+e.a*e.use*e.mMin,0),cM,cU,n:list.length};
  });
  return info;
}
// one roster entry per player-season: projected minutes and usage from history before the season
function rosterEntry(pid,y,prm,pm,team,a){
  const ss=careerSeasons(pid,[y-3,y-2,y-1]),age=(rec(pid,y)||{}).age||((rec(pid,y-1)||{}).age+1)||25;
  const mm=projectMin(ss,[3,4,5],pm,age),base=project(null,ss,[3,4,5],prm,age);
  return {pid,team,a,mpg:mm?mm.mpg:15,use:base?usage(base.line):8,base,mm};
}
const leaguePlays=y=>{let s=0;for(const pid in DB){const r=rec(pid,y);if(r)s+=usage(r)*r.gp}return s/(30*GMS[y])};

// ================= WALK-FORWARD BACKTEST =================
// Every season from 2019-20 on is predicted using only the seasons before it. Settings for season T are tuned on
// earlier seasons only (recent ones weighted more, by a decay that is itself chosen walk-forward), then scored on T.
const WF_YEARS=[2020,2021,2022,2023,2024,2025,2026],WF_EVAL=WF_YEARS.slice(2);
const WSETS=[[3,4,5],[1,3,6],[1,2,7],[0,2,5],[0,1,3],[0,0,1]],KS=[10,20,40,80],G11=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1],BETAS=[0,.25,.5,.75,1,1.5],RHOS=[1,.75,.5];
function aggK(near,k){const n=near.slice(0,k),w=n.map(x=>1/(.25+x.d)),W=w.reduce((a,b)=>a+b,0);
  return {delta:n.reduce((s,x,i)=>s+w[i]*x.r.d,0)/W,brk:n.reduce((s,x,i)=>s+w[i]*(x.r.brk?1:0),0)/W,sd:Math.sqrt(n.reduce((s,x,i)=>s+w[i]*(x.r.d-n.reduce((a,y,j)=>a+w[j]*y.r.d,0)/W)**2,0)/W),list:n}}
const WF=(()=>{const rows=[];const tA=performance.now();
  WF_YEARS.forEach(T=>{const prm=fitParams(T-1),pm=fitMin(T-1),train=TRAIN.filter(r=>r.t+1<=T-1),plays=leaguePlays(T-1);
    const ent=[];ALLPIDS.forEach(pid=>{const r=rec(pid,T);if(!r)return;let team=r.team;
      if(r.splits){const sp=r.splits.split(",").map(x=>x.split(":"));team=sp.sort((a,b)=>b[1]-a[1])[0][0]}
      const ss=careerSeasons(pid,[T-3,T-2,T-1]);const a=ss.some(Boolean)?gameRate(ss,[3,4,5],prm,r.age):.6;ent.push({...rosterEntry(pid,T,prm,pm,team,a),act:r})});
    // team-fit multipliers for every strength pair, cached per player
    BETAS.forEach((bm,iM)=>BETAS.forEach((bu,iU)=>{teamFit(ent,bm,bu,plays);ent.forEach(e=>{(e.cM=e.cM||[])[iM]=e.mpg*e.mMin;(e.cU=e.cU||[])[iM*6+iU]=e.base?teamMult(e):1})}));
    ent.forEach(e=>{const r=e.act,s1=rec(e.pid,T-1),s0=rec(e.pid,T-2);
      if(r.gp<30||!e.base||!((s1&&s1.gp>=20)||(s0&&s0.gp>=20)))return;
      const lastFp=s1&&s1.gp>=20?fpOf(s1):fpOf(s0);if(lastFp<15)return;
      const ss=careerSeasons(e.pid,[T-3,T-2,T-1]),age=r.age,preds=WSETS.map(ws=>{const b=project(null,ss,ws,prm,age);return b?b.fp:e.base.fp});
      const f=featOf(e.pid,T-1),near=f?comps(f,train,e.pid,80).list:null,ck=near?KS.map(k=>aggK(near,k)):null;
      rows.push({T,e,p:{name:DB[e.pid].n,id:null},preds,sig:e.base.sigma,compK:ck?ck.map(c=>f.fp+c.delta):null,brkK:ck?ck.map(c=>c.brk):null,
        minp:e.mm?e.mm.fpg:null,naive:lastFp,act:fpOf(r),actMin:r.min,f,cM:e.cM,cU:e.cU})});
  });
  const msRows=Math.round(performance.now()-tA),tB=performance.now();
  const s2=(r,P)=>{const b=r.preds[P.wi],c=r.compK?r.compK[P.ki]:null,x=c==null?b:P.lam*c+(1-P.lam)*b;return r.minp==null?x:P.mu*r.minp+(1-P.mu)*x};
  const predOf=(r,P)=>s2(r,P)*r.cU[P.iM*6+P.iU];
  // tune every setting on the given seasons, weighting season y by rho^(newest - y)
  function tune(years,rho){const rs=rows.filter(r=>years.includes(r.T)),yMax=Math.max(...years),w=rs.map(r=>Math.pow(rho,yMax-r.T)),W=w.reduce((a,b)=>a+b,0);
    let best=null;
    for(let wi=0;wi<WSETS.length;wi++)for(let ki=0;ki<KS.length;ki++)for(const lam of G11)for(const mu of G11){
      const P={wi,ki,lam,mu,iM:0,iU:0};let e=0;for(let i=0;i<rs.length;i++)e+=w[i]*Math.abs(s2(rs[i],P)-rs[i].act);e/=W;
      if(!best||e<best.err)best={...P,err:e}}
    let bM=1e9;for(let iM=0;iM<6;iM++){let e=0;for(let i=0;i<rs.length;i++)e+=w[i]*Math.abs(rs[i].cM[iM]-rs[i].actMin);if(e<bM){bM=e;best.iM=iM}}
    let bU=1e9;for(let iU=0;iU<6;iU++){const P={...best,iU};let e=0;for(let i=0;i<rs.length;i++)e+=w[i]*Math.abs(predOf(rs[i],P)-rs[i].act);if(e<bU){bU=e;best.iU=iU}}
    const z=rs.map(r=>Math.abs(r.act-predOf(r,best))/r.sig);best.sig=quant(z,.8)/1.2816;return best}
  // walk forward: settings for T come only from seasons before T
  const DEF={wi:0,ki:0,lam:.5,mu:0,iM:0,iU:0};
  const runs=RHOS.map(rho=>{const ys=WF_EVAL.map(T=>{const P=tune(WF_YEARS.filter(y=>y<T),rho),rs=rows.filter(r=>r.T===T);
      return {T,P,n:rs.length,model:mean(rs.map(r=>Math.abs(predOf(r,P)-r.act))),naive:mean(rs.map(r=>Math.abs(r.naive-r.act))),def:mean(rs.map(r=>Math.abs(predOf(r,DEF)-r.act))),
        cover:rs.filter(r=>Math.abs(r.act-predOf(r,P))<=1.2816*r.sig*P.sig).length/rs.length}});
    const n=ys.reduce((a,y)=>a+y.n,0);return {rho,ys,err:ys.reduce((a,y)=>a+y.model*y.n,0)/n,naive:ys.reduce((a,y)=>a+y.naive*y.n,0)/n,def:ys.reduce((a,y)=>a+y.def*y.n,0)/n,
      cover:ys.reduce((a,y)=>a+y.cover*y.n,0)/n}});
  const bestRun=runs.reduce((a,b)=>b.err<a.err?b:a);
  rows.forEach(r=>{const y=bestRun.ys.find(y=>y.T===r.T);r.oos=y?predOf(r,y.P):null});
  const FINAL=tune(WF_YEARS,bestRun.rho);
  return {rows,runs,best:bestRun,FINAL,predOf,s2,DEF,msRows,msTune:Math.round(performance.now()-tB)};
})();
KNN=KS[WF.FINAL.ki];
const WS_FINAL=WSETS[WF.FINAL.wi];
// legacy-shaped summaries for the charts, at the final settings
const BTALL=(()=>{const F=WF.FINAL,rows=WF.rows,mae=(rs,f)=>mean(rs.map(r=>Math.abs(f(r)-r.act)));
  rows.forEach(r=>{r.pred=r.preds[F.wi];r.comp=r.compK?r.compK[F.ki]:null;r.cbrk=r.brkK?r.brkK[F.ki]:null;
    r.s1=r.comp==null?r.pred:F.lam*r.comp+(1-F.lam)*r.pred;r.s2=WF.s2(r,F);r.fin=WF.predOf(r,F);r.blend=r.oos!=null?r.oos:r.fin});
  const both=rows.filter(r=>r.comp!==null),oosRows=rows.filter(r=>r.oos!=null);
  const grid=G11.map(l=>({l,e:mae(both,r=>l*r.comp+(1-l)*r.pred)})),gridM=G11.map(l=>({l,e:mae(rows.filter(r=>r.minp!=null),r=>l*r.minp+(1-l)*r.s1)}));
  const gridTM=BETAS.map((b,i)=>({l:b,e:mean(rows.map(r=>Math.abs(r.cM[i]-r.actMin)))})),gridTU=BETAS.map((b,i)=>({l:b,e:mae(rows,r=>r.s2*r.cU[F.iM*6+i])}));
  const sigScale=F.sig,cover=s=>oosRows.filter(r=>Math.abs(r.act-r.oos)<=1.2816*r.sig*s).length/oosRows.length;
  const bins=[[0,.1],[.1,.2],[.2,.3],[.3,.45],[.45,1.01]].map(([lo,hi])=>{const rs=both.filter(r=>r.cbrk>=lo&&r.cbrk<hi);
    return {lo,hi,n:rs.length,pred:mean(rs.map(r=>r.cbrk)),act:rs.length?rs.filter(r=>r.act-r.naive>=BRK.min&&(r.act-r.naive)/r.naive>=BRK.rel).length/rs.length:0}});
  const perT=WF_EVAL.map(T=>{const y=WF.best.ys.find(y=>y.T===T);return {T,n:y.n,model:y.model,naive:y.naive,def:y.def}});
  return {rows:oosRows,both,lam:F.lam,grid,mu:F.mu,gridM,betaM:BETAS[F.iM],betaU:BETAS[F.iU],gridTM,gridTU,sigScale,coverRaw:cover(1),coverCal:WF.best.cover,bins,perT,
    minNo:mean(rows.map(r=>Math.abs(r.cM[0]-r.actMin))),minFit:mean(rows.map(r=>Math.abs(r.cM[F.iM]-r.actMin))),
    maeM:mae(oosRows,r=>r.pred),maeC:mae(both,r=>r.comp),maeS1:mae(rows,r=>r.s1),maeMinOnly:mae(rows.filter(r=>r.minp!=null),r=>r.minp),maeB:WF.best.err,maeN:WF.best.naive,
    fit:linfit(oosRows.map(r=>r.oos),oosRows.map(r=>r.act)),within5:oosRows.filter(r=>Math.abs(r.oos-r.act)<=5).length/oosRows.length};
})();
function teamMult(e){const l=e.base.line,u=fpOf(scale(scale(l,e.mUse,["pts","ast","tpm","tov","fgm","fga","ftm","fta"]),e.mMin));return u/e.base.fp}
const LAM=BTALL.lam,MU=BTALL.mu,SIGSCALE=BTALL.sigScale;
const BRKCAL=(()=>{const pts=[{x:0,y:0},...BTALL.bins.filter(b=>b.n>=20).map(b=>({x:b.pred,y:b.act}))];for(let i=1;i<pts.length;i++)pts[i].y=Math.max(pts[i].y,pts[i-1].y);
  return x=>{if(x<=pts[0].x)return pts[0].y;for(let i=1;i<pts.length;i++)if(x<=pts[i].x){const a=pts[i-1],b=pts[i];return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x||1)}
    const a=pts[pts.length-2],b=pts[pts.length-1];return Math.min(.9,b.y+(b.y-a.y)/(b.x-a.x||1)*(x-b.x))}})();
const BT={rows:BTALL.rows,lam:LAM,grid:BTALL.grid,maeM:BTALL.maeM,maeC:BTALL.maeC,maeB:BTALL.maeB,maeN:BTALL.maeN,nBoth:BTALL.both.length,fit:BTALL.fit,within5:BTALL.within5};
const BTM={grid:BTALL.gridM,mu:MU,maeMain:BTALL.maeS1,maeMin:BTALL.maeMinOnly,maeBest:Math.min(...BTALL.gridM.map(g=>g.e)),n:BTALL.rows.length};

// ================= ESPN PROJECTIONS: how much to trust them, judged on 2025-26 =================
const ESPN_BY_PID=Object.fromEntries(ESPN.filter(o=>o.pid).map(o=>[o.pid,o]));
const pjLine=a=>a?{gp:a[0],min:a[1],pts:a[2],reb:a[3],ast:a[4],stl:a[5],blk:a[6],tpm:a[7],tov:a[8],fgm:a[9],fga:a[10],ftm:a[11],fta:a[12],fg:a[10]?a[9]/a[10]:0,ft:a[12]?a[11]/a[12]:0}:null;
const BTE=(()=>{const rows=WF.rows.filter(r=>r.T===2026&&ESPN_BY_PID[r.e.pid]&&ESPN_BY_PID[r.e.pid].pj26&&ESPN_BY_PID[r.e.pid].pj26[0]>=10)
    .map(r=>{const pj=pjLine(ESPN_BY_PID[r.e.pid].pj26);return {...r,espn:fpOf(pj),espnGp:pj.gp,ourGp:r.e.a*82,actGp:r.e.act.gp}});
  const mae=f=>mean(rows.map(r=>Math.abs(f(r)-r.act)));let om=0,be=1e9;const grid=[];
  for(let l=0;l<=1.0001;l+=.1){const e=mae(r=>l*r.espn+(1-l)*r.blend);grid.push({l:+l.toFixed(1),e});if(e<be){be=e;om=+l.toFixed(1)}}
  const gm=f=>mean(rows.map(r=>Math.abs(f(r)-r.actGp)));let og=0,bg=1e9;const gridG=[];
  for(let l=0;l<=1.0001;l+=.1){const e=gm(r=>l*r.espnGp+(1-l)*r.ourGp);gridG.push({l:+l.toFixed(1),e});if(e<bg){bg=e;og=+l.toFixed(1)}}
  return {rows,n:rows.length,omega:om,grid,maeModel:mae(r=>r.blend),maeEspn:mae(r=>r.espn),maeBlend:be,maeNaive:mae(r=>r.naive),omegaG:og,gridG,gpModel:gm(r=>r.ourGp),gpEspn:gm(r=>r.espnGp),gpBlend:bg};
})();
const OMEGA=BTE.omega,OMEGA_G=BTE.omegaG;

// ================= CURRENT SEASON =================
const PRM=fitParams(CUR-1),PRMM=fitMin(CUR-1),MEANS=PRM.means;
const pace=t=>PACE27[t]||PACE26[t]||99.5;
const fpm=s=>fpOf(s)/s.min;
const DAYS_PER_GAME=174/82; // regular season runs ~174 days
// remaining game days for each team, from ESPN's schedule
const TEAM_DAYS=Object.fromEntries(Object.entries(SCHED).map(([t,ps])=>[t,ps.filter(q=>q>=CUR_PERIOD)]));
const LAST_PERIOD=Math.max(...Object.values(SCHED).flat()),PO_START=WEEKS[19].p[0],PO_END=WEEKS[22].p[1];
const periodOf=iso=>Math.round((new Date(iso+"T12:00:00")-new Date(PERIOD0+"T12:00:00"))/864e5);
// first scoring period he can play: injuries map ESPN's expected return date onto his team's schedule
function returnPeriod(o,team){const i=o.inj,days=TEAM_DAYS[team]||[];
  if(i&&i.fs==="OFS")return LAST_PERIOD+1;
  if(i&&i.ret)return Math.max(CUR_PERIOD,periodOf(i.ret));
  if((i&&i.status==="Day-To-Day")||o.st==="DAY_TO_DAY")return days.length>1?days[1]:CUR_PERIOD;
  if(i&&i.status==="Out")return days.length>3?days[3]:CUR_PERIOD;
  return CUR_PERIOD}
function gamesOut(o){const days=TEAM_DAYS[o.t]||[],rp=returnPeriod(o,o.t);return days.filter(q=>q<rp).length}
// ================= ROOKIES: draft position model, fit on every class since 2016 =================
const nmKey=x=>x.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\./g,"").replace(/-/g," ").replace(/[^a-z ]/g,"").replace(/ (jr|iii|ii|iv)$/,"").replace(/ (jr|iii|ii|iv) /g," ").trim();
const DRAFT_BY_PID={},DRAFT_BY_NAME={};DRAFT.forEach(([y,pick,pid,n])=>{const d={y,pick,pid};if(pid)DRAFT_BY_PID[pid]=d;DRAFT_BY_NAME[n]=d});
const ROOK=(()=>{const rows=[];DRAFT.forEach(([y,pick,pid])=>{const r=pid?rec(pid,y+1):null;if(y+1>=CUR||!r)return;rows.push({y:y+1,pick,pid,r,fp:fpOf(r),gpr:Math.min(1,r.gp/GMS[y+1]),age:r.age})});
  const pl=rows.filter(x=>x.r.gp>=20);
  // rookie FP/G = a + b ln(pick) + c (age - 20), least squares on rookies with 20+ games
  const X=pl.map(x=>[1,Math.log(x.pick),x.age-20]),Y=pl.map(x=>x.fp),A=[0,1,2].map(i=>[0,1,2].map(j=>X.reduce((s,x)=>s+x[i]*x[j],0))),bb=[0,1,2].map(i=>X.reduce((s,x,k)=>s+x[i]*Y[k],0));
  for(let i=0;i<3;i++)for(let r2=i+1;r2<3;r2++){const f=A[r2][i]/A[i][i];for(let c=i;c<3;c++)A[r2][c]-=f*A[i][c];bb[r2]-=f*bb[i]}
  const w=[0,0,0];for(let i=2;i>=0;i--)w[i]=(bb[i]-[0,1,2].slice(i+1).reduce((s,c)=>s+A[i][c]*w[c],0))/A[i][i];
  const sd=Math.sqrt(mean(pl.map((x,k)=>(Y[k]-(w[0]+w[1]*Math.log(x.pick)+w[2]*(x.age-20)))**2)));
  const BANDS=[[1,3],[4,10],[11,20],[21,30],[31,60]].map(([lo,hi])=>{const g=rows.filter(x=>x.pick>=lo&&x.pick<=hi),p2=g.filter(x=>x.r.gp>=20).map(x=>x.fp).sort((a,b)=>a-b);
    return {lo,hi,n:g.length,played:g.filter(x=>x.r.gp>=20).length/Math.max(1,g.length),gpr:mean(g.map(x=>x.gpr)),med:p2[Math.floor(p2.length/2)],q75:p2[Math.floor(p2.length*.75)],q25:p2[Math.floor(p2.length*.25)]}});
  return {w,sd,n:pl.length,rows,pl,BANDS,fpAt:(pick,age)=>Math.max(3,w[0]+w[1]*Math.log(pick)+w[2]*((age||20)-20)),band:pick=>BANDS.find(b=>pick>=b.lo&&pick<=b.hi)}})();
const ROOK_W=.5; // weight on the draft model vs ESPN, best on the 2025-26 rookie class (22 rookies)
const DEEP_FP=quant(TRAIN.map(r=>r.next),.1);
const POOL=ESPN; // every player on a standard NBA contract, on a team right now
const players=POOL.map((o,i)=>{
  const pid=o.pid,now=pid?rec(pid,CUR):null,s26=pid?rec(pid,2026):null,seasons=pid?careerSeasons(pid,POOLY):[null,null,null];
  const rook=!seasons.some(x=>x&&x.gp>0)&&!(pid&&YEARS.slice(0,-1).some(y=>DB[pid].s[y]));
  const out=["OUT","INJURY_RESERVE","SUSPENSION"].includes(o.st)||(o.inj&&o.inj.status==="Out"),dtd=!out&&(["DAY_TO_DAY","QUESTIONABLE","DOUBTFUL","PROBABLE"].includes(o.st)||(o.inj&&o.inj.status==="Day-To-Day"));
  const ol=(o.ol||"").replace(/\s+/g," "),sent=ol.match(/[^.!?]+[.!?]+/g)||[ol],note=sent.slice(0,2).join("").trim().slice(0,360);
  return {id:i,pid,espnId:o.e,sal:o.sal,dp:o.dp,rank:o.rk||o.rr||300,base:o.rk||o.rr||300,baseRoto:o.rr||o.rk||300,adp:o.adp>0?o.adp:null,auc:o.auc,own:o.own,
    name:o.n,boardName:o.n,team:o.t,pos:o.pos.length?o.pos:["SF"],age:now?now.age:s26?s26.age+1:(pid&&DB[pid]?((Object.values(DB[pid].s).pop()||[24])[0]+1):22),
    note:note||"No ESPN outlook yet.",outlook:ol,espn:o.rk,espnProj:pjLine(o.pj),inj:o.inj,gamesOut:gamesOut(o),
    seasons,now,college:null,cur:s26||{gp:0,pts:0,reb:0,ast:0,stl:0,blk:0,tpm:0,tov:0,fg:0,ft:0},curGp:s26?s26.gp:rook?-1:0,
    out,dtd,rook,hot:false,cold:false,prevTeam:s26?s26.team:null,mid:!!(s26&&s26.splits)};
});
const byName=Object.fromEntries(players.map(p=>[p.name,p]));
const poolByPid=Object.fromEntries(players.filter(p=>p.pid).map(p=>[p.pid,p]));
TRAIN.forEach(r=>{const p=poolByPid[r.pid];if(p)r.p={name:p.name,id:p.id}});
const INJ=Object.fromEntries(players.filter(p=>p.gamesOut).map(p=>[p.boardName,p.gamesOut]));

players.forEach(p=>{
  const ss=[...p.seasons,p.now],W=[...WS_FINAL,WS_FINAL[2]||1];
  if(p.rook){const d=(p.pid&&DRAFT_BY_PID[p.pid])||DRAFT_BY_NAME[nmKey(p.name)];p.draft=d&&d.y===2026?d:null;
    if(p.draft){const dm=ROOK.fpAt(p.draft.pick,p.age),ef=p.espnProj&&p.espnProj.gp?fpOf(p.espnProj):null;p.rookDraftFp=dm;p.rookEspnFp=ef;
      const target=ef!=null?ROOK_W*dm+(1-ROOK_W)*ef:dm,shape=p.espnProj&&p.espnProj.gp?p.espnProj:{...MEANS};p.rookPrior=scale(shape,target/Math.max(.1,fpOf(shape)));p.rookPrior.__rk=1}}
  const base=project(p.rookPrior||p.espnProj,ss,W,PRM,p.age)||{line:scale({...MEANS},DEEP_FP/MEANS.fp),fp:DEEP_FP,sigma:PRM.ageFit.sd*2,N:0,rookie:true,steps:[["No NBA history or projection (deep-bench level)",DEEP_FP]]};p.baseProj=base;
  const f=p.pid?featOf(p.pid,2026):null;p.feat=f;p.comps=f?comps(f,TRAIN,p.pid):null;if(p.comps){p.comps.rawBrk=p.comps.brk;p.comps.brk=BRKCAL(p.comps.brk)}p.brk=p.comps?p.comps.brk:null;
  let line=base.line,fp=base.fp,sigma=base.sigma;const steps=[...base.steps];
  if(p.comps&&LAM>0){const fpH=LAM*(f.fp+p.comps.delta)+(1-LAM)*base.fp;line=scale(line,fpH/fp);fp=fpOf(line);
    sigma=(1-LAM)*base.sigma+LAM*Math.max(base.sigma*.8,p.comps.sd);steps.push(["Breakout comps",fp-base.fp])}
  p.mm=projectMin(ss,W,PRMM,p.age);
  if(p.mm&&MU>0){const fpB=(1-MU)*fp+MU*p.mm.fpg;line=scale(line,fpB/fp);const fp2=fpOf(line);steps.push(["Minutes model",fp2-fp]);fp=fp2}
  // blend with ESPN's projection by the weight the 2025-26 backtest chose
  p.espnFp=p.espnProj&&p.espnProj.gp>0?fpOf(p.espnProj):null;
  if(!p.mm){const mpg=p.espnProj&&p.espnProj.min?p.espnProj.min:p.now&&p.now.gp?p.now.min:clamp(fp/PRMM.meanRate,16,33);p.mm={mpg0:null,rate0:null,mpg,rate:fp/mpg,fpg:fp,rookie:true}}
  p.histLine=line;p.histFp=fp;p.sigma0=sigma*SIGSCALE;p.steps0=steps;
  const ours=p.seasons.some(Boolean)?gameRate(p.seasons,[3,4,5],PRM,p.age):p.draft?ROOK.band(p.draft.pick).gpr:PRM.meanRate,espnRate=p.espnProj&&p.espnProj.gp?Math.min(1,p.espnProj.gp/82):null;
  p.rate=espnRate!=null?(1-OMEGA_G)*ours+OMEGA_G*espnRate:ours;p.rateOurs=ours;p.rateEspn=espnRate;
  p.days=TEAM_DAYS[p.team]||[];p.retP=returnPeriod({inj:p.inj,st:p.out?"OUT":p.dtd?"DAY_TO_DAY":"ACTIVE"},p.team);
  p.teamLeft=p.days.length;p.avail=p.days.filter(q=>q>=p.retP).length;p.daySet=new Set(p.days.filter(q=>q>=p.retP));
  p.poGames=p.days.filter(q=>q>=Math.max(p.retP,PO_START)&&q<=PO_END).length;
  if(p.now&&p.now.gp>=3){const ref=p.espnFp!=null?(fp+p.espnFp)/2:fp,r=fpOf(p.now)/Math.max(1,ref);p.hot=r>=1.2;p.cold=r<=.8}
  const fr=FPRO[p.espnId];p.fpro=fr?[+fr[0],+fr[1],+fr[2],+fr[3]]:null;
});

// rosters for 2026-27: everyone who has played this season, plus injured board players
const TEAMS=(()=>{const ent=[],seen=new Set();
  players.forEach(p=>{if(p.pid)seen.add(p.pid);if(p.team==='FA')return;ent.push({pid:p.pid,team:p.team,a:p.rate*p.avail/REMAIN,mpg:p.mm.mpg,use:usage(p.histLine),p})});
  ALLPIDS.forEach(pid=>{if(seen.has(pid))return;const r=rec(pid,CUR);if(!r)return;
    const e=rosterEntry(pid,CUR,PRM,PRMM,r.team,.75);if(!e.mm)e.mpg=r.min||12;if(!e.base)e.use=usage(r);ent.push(e)});
  const info=teamFit(ent,BTALL.betaM,BTALL.betaU,leaguePlays(CUR-1));
  const rosterNew={};ent.forEach(e=>{(rosterNew[e.team]=rosterNew[e.team]||[]).push({id:e.p?e.p.id:null,name:e.p?e.p.name:DB[e.pid].n,useNew:e.use*e.mMin*e.mUse*e.a,minNew:e.mpg*e.mMin,a:e.a,
    moved:e.p?e.p.prevTeam&&e.p.prevTeam!==e.team:false,rook:e.p?e.p.rook:false,pool:!!e.p})});
  return {ent,info,rosterNew,teams:Object.keys(info).sort(),plays:leaguePlays(CUR-1)};
})();
(()=>{const maxS=Math.max(...players.filter(p=>p.espn).map(p=>p.base)),maxR=Math.max(...ESPN.map(o=>o.rr||0));
  players.filter(p=>!p.espn).sort((a,b)=>b.histFp*b.avail-a.histFp*a.avail).forEach((p,i)=>{p.base=maxS+i+1;p.unranked=true});
  players.filter(p=>!ESPN.find(o=>o.e===p.espnId).rr).sort((a,b)=>b.histFp*b.avail-a.histFp*a.avail).forEach((p,i)=>p.baseRoto=maxR+i+1)})();
const ENT_BY_ID={};TEAMS.ent.forEach(e=>{if(e.p)ENT_BY_ID[e.p.id]=e});
players.forEach(p=>{const e=ENT_BY_ID[p.id]||{mUse:1,mMin:1};
  const l=scale(p.histLine,e.mUse,["pts","ast","tpm","tov","fgm","fga","ftm","fta"]),fpU=fpOf(l),lm=scale(l,e.mMin),fpM=fpOf(lm);
  p.fit={m:e.mUse,mMin:e.mMin,tot:e.mUse*e.mMin,moved:!!p.prevTeam&&p.prevTeam!==p.team,mid:p.mid,rookie:!p.prevTeam,team:TEAMS.info[p.team]};
  p.fitLine=lm;p.fitFp=fpM;p.modelMpg=p.mm.mpg*e.mMin;
  p.fitSteps=[...p.steps0,...(BTALL.betaU>0?[["Team fit: usage",fpU-p.histFp]]:[]),...(BTALL.betaM>0?[["Team fit: minutes",fpM-fpU]]:[])];
  const s3=p.seasons[2];p.lastMpg=s3&&s3.gp>0&&s3.min?s3.min:null;
  p.hist=p.seasons.map((s,i)=>s&&s.gp>0?{i,fp:fpOf(s),gp:s.gp,s}:null).filter(Boolean);
  p.nowFp=p.now&&p.now.gp?fpOf(p.now):null;p.fp36Last=p.lastMpg?fpOf(s3)/p.lastMpg*36:null;
});

// ================= YOUR MIX: how much each source counts, plus your own player takes =================
const MIX_DEFAULT={espn:OMEGA,cur:.5,fpro:0,curK:10};
// slider 0..1 sets how many games until this season counts half: 50% -> 10 games, 100% -> 2.5 games, 0% -> off
const curK=c=>10*Math.pow(4,(.5-c)*2);
const curWeight=(p,mix)=>{const g=p.now&&p.now.gp?p.now.gp:0;return g&&!p.baseProj.rookie&&mix.cur>0?g/(g+curK(mix.cur)):0};
function applyMix(mix0,adj){
  const mix={...MIX_DEFAULT,...(mix0||{})};adj=adj||{};
  const curve=players.map(p=>p.fitFp).sort((a,b)=>b-a),implied=r=>curve[Math.min(curve.length-1,r-1)]*(r>curve.length?Math.pow(.995,r-curve.length):1);
  players.forEach(p=>{
    const model=p.fitFp,rook=p.baseProj.rookie,steps=[...p.fitSteps];let fp=model;
    if(p.espnFp!=null&&!rook&&mix.espn>0){fp=(1-mix.espn)*model+mix.espn*p.espnFp;steps.push(["ESPN projection",fp-model])}
    const wc=curWeight(p,mix);p.wCur=wc;
    if(wc>0){const f0=fp;fp=(1-wc)*fp+wc*p.nowFp;steps.push(["2026-27 pace",fp-f0])}
    p.fproFp=p.fpro?implied(p.fpro[0]):null;
    if(p.fpro&&mix.fpro>0){const f0=fp;fp=(1-mix.fpro)*fp+mix.fpro*p.fproFp;steps.push(["FantasyPros consensus",fp-f0])}
    const a=adj[p.espnId]||null;p.adj=a;
    if(a){const f0=fp;fp=a.o!=null?a.o:fp*(1+a.m);steps.push(["Your adjustment",fp-f0])}
    fp=Math.max(1,fp);
    p.proj={line:scale(p.fitLine,fp/Math.max(.1,model)),fp,sigma:p.sigma0,N:p.baseProj.N,rookie:rook,steps};
    p.projMpg=wc>0&&p.now.min?(1-wc)*p.modelMpg+wc*p.now.min:p.modelMpg;
    p.projGP=p.avail*p.rate;p.projTot=p.proj.fp*p.projGP;
    p.lo=p.proj.fp-1.2816*p.proj.sigma;p.hi=p.proj.fp+1.2816*p.proj.sigma;
    const last=p.hist.length?p.hist[p.hist.length-1].fp:p.proj.fp;p.delta=p.proj.fp-last;
    p.fp36=p.proj.fp/p.projMpg*36;
    p.per100=k=>(k==="fp"?p.proj.fp:p.proj.line[k])/p.projMpg*48/pace(p.team)*100;
  });
  simulate();rankAll();return mix;
}

// Monte Carlo season simulation (fixed seed, so the same mix always gives the same odds)
const NSIM=2000;
function simulate(){
  let seed=20261029;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const gauss=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd())};
  const n=players.length,sdr=PRM.gAge.sd,c12=new Array(n).fill(0),c50=c12.slice(),c100=c12.slice(),tot=new Float64Array(n);
  // only players who can plausibly finish top-100 need ranking each run (others still get their own simulated seasons)
  const idx=[...Array(n).keys()].sort((a,b)=>players[b].projTot-players[a].projTot).slice(0,Math.min(n,220));
  players.forEach(p=>p.sims=new Float32Array(NSIM));
  for(let s=0;s<NSIM;s++){
    for(let i=0;i<n;i++){const p=players[i];const f=Math.max(0,p.proj.fp+p.proj.sigma*gauss());
      const r=clamp(p.rate+sdr*gauss(),0,1);tot[i]=f*p.avail*r;p.sims[s]=tot[i]}
    idx.sort((a,b)=>tot[b]-tot[a]);
    for(let k=0;k<n;k++){const i=idx[k];if(k<12)c12[i]++;if(k<50)c50[i]++;if(k<100)c100[i]++}
  }
  players.forEach((p,i)=>{p.pTop12=c12[i]/NSIM;p.pTop50=c50[i]/NSIM;p.pTop100=c100[i]/NSIM;
    const srt=p.sims.slice().sort();p.q={p10:srt[Math.floor(NSIM*.1)],p50:srt[Math.floor(NSIM*.5)],p90:srt[Math.floor(NSIM*.9)]}});
}
// Ranks and 9-cat z-scores on projected lines
function rankAll(){
  players.forEach(p=>{const l=full(p.proj.line);p.pl={...l}});
  const lgFg=players.reduce((s,p)=>s+p.pl.fgm,0)/players.reduce((s,p)=>s+p.pl.fga,0);
  const lgFt=players.reduce((s,p)=>s+p.pl.ftm,0)/players.reduce((s,p)=>s+p.pl.fta,0);
  players.forEach(p=>{const l=p.pl;l.fgImp=(l.fgm/Math.max(.1,l.fga)-lgFg)*l.fga;l.ftImp=(l.ftm/Math.max(.1,l.fta)-lgFt)*l.fta;l.ntov=-l.tov});
  const cats=["pts","reb","ast","stl","blk","tpm","fgImp","ftImp"];
  cats.forEach(c=>{const v=players.map(p=>p.pl[c]),m=mean(v),s=Math.sqrt(mean(v.map(x=>(x-m)**2)))||1;players.forEach(p=>{(p.z||(p.z={}))[c]=(p.pl[c]-m)/s})});
  players.forEach(p=>p.cat=cats.reduce((s,c)=>s+p.z[c],0));
  [...players].sort((a,b)=>b.projTot-a.projTot).forEach((p,i)=>p.modelRank=i+1);
  [...players].sort((a,b)=>b.cat-a.cat).forEach((p,i)=>p.catRank=i+1);
}
const CAT_LABEL={pts:"PTS",reb:"REB",ast:"AST",stl:"STL",blk:"BLK",tpm:"3PM",fgImp:"FG%",ftImp:"FT%"}; // ESPN default H2H categories
const MODEL_MS=Math.round(performance.now()-T0);
