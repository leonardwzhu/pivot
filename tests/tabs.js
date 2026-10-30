// The draft sidebar shows only on draft tabs; everything else uses the full width. Usage: node tests/tabs.js [build/draft-room.html]
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.setContent(fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../build/draft-room.html'),'utf8'),{waitUntil:'load'});await pg.waitForTimeout(5000);
const MODE={season:'season',waivers:'season',team:'season'};
for(const t of ['board','season','waivers','news','insights','mock','how','board']){await pg.click('#mode-'+(MODE[t]||'draft'));await pg.click('#tab-'+t);await pg.waitForTimeout(400);
 const r=await pg.evaluate(()=>({rail:!document.getElementById('rail').hidden,w:document.querySelector('main section').getBoundingClientRect().width|0}));console.log(t,JSON.stringify(r))}
console.log('errors',errs);await b.close()})();
