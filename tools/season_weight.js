// Exports each player's walk-forward preseason projection for 2024-25 (model only) and 2025-26 (model blended with ESPN,
// as the app does) from the built page, for tools/season_weight.py. Usage: node tools/season_weight.js build/draft-room.html
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();await pg.setContent(fs.readFileSync(process.argv[2],'utf8'),{waitUntil:'load'});await pg.waitForTimeout(3500);
const r=await pg.evaluate(()=>({2025:WF.rows.filter(x=>x.T===2025&&ESPN_BY_PID[x.e.pid]&&x.blend!=null).map(x=>({e:ESPN_BY_PID[x.e.pid].e,prior:x.blend})),
  2026:BTE.rows.map(x=>({e:ESPN_BY_PID[x.e.pid].e,prior:OMEGA*x.espn+(1-OMEGA)*x.blend}))}));
for(const y of [2025,2026])fs.writeFileSync(path.join(__dirname,`../work/hist/priors_${y}.json`),JSON.stringify(r[y]));console.log('priors',r[2025].length,r[2026].length);await b.close()})();
