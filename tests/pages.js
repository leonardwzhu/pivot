// The GitHub Pages copy (build/index.html served at its github.io address): the update panel's full update links to the
// repository's Pages workflow, and after the click the page watches its own address and offers a reload once a newer build is
// live. The newer build is the same page with a later BUILD time. Takes about 2 minutes (the first check waits a minute).
// Usage: node tests/pages.js [build/index.html]
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{const b=await chromium.launch();const file=process.argv[2]||path.join(__dirname,'../build/index.html');let fail=0;const check=(ok,msg)=>{console.log((ok?'ok   ':'FAIL ')+msg);if(!ok)fail++};
  const html=fs.readFileSync(file,'utf8'),at=(html.match(/const BUILD=\{"at":"([^"]+)"/)||[])[1];let served=html;
  if(!at){console.log('skip: this build has no BUILD time');await b.close();return}
  const pg=await b.newPage({viewport:{width:1100,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('https://leonardwzhu.github.io/pivot/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:served}));
  await pg.route('**/lm-api-reads.fantasy.espn.com/**',r=>r.abort());
  await pg.goto('https://leonardwzhu.github.io/pivot/');await pg.waitForFunction(()=>typeof setMode==='function');await pg.waitForTimeout(800);
  await pg.click('#updBtn');await pg.waitForTimeout(500);
  const link=await pg.evaluate(()=>{const a=document.querySelector('#updPop a[data-upd="gh"]');return a&&a.href});
  check(link==='https://github.com/leonardwzhu/pivot/actions/workflows/pages.yml',`the full update links to the Pages workflow (${link})`);
  check(await pg.evaluate(()=>!/Allow Claude Code Remote|claude\.ai/.test(document.getElementById('updPop').innerText)),'no claude.ai wording on GitHub');
  const [tab]=await Promise.all([pg.context().waitForEvent('page'),pg.click('#updPop a[data-upd="gh"]')]);await tab.close();
  check(await pg.evaluate(()=>UPD.g.st==='wait'&&/Waiting for the new version/.test(document.getElementById('updPop').innerText)),'after the click it waits for the new version');
  await pg.waitForTimeout(65000);check(await pg.evaluate(()=>UPD.g.st==='wait'),'the same build still live: keeps waiting');
  served=html.replace(`const BUILD={"at":"${at}"`,'const BUILD={"at":"2099-01-01T00:00Z"');await pg.waitForTimeout(32000);
  check(await pg.evaluate(()=>UPD.g.st==='done'&&!!document.querySelector('#updPop [data-upd="reload"]')),'a newer build live: it offers Reload');
  check(!errs.length,'no page errors '+errs.join(' | '));await b.close();process.exit(fail?1:0)})();
