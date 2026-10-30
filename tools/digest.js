// The pre-game summary for the phone notification: prints "DIGEST: ..." from the built page's Today screen (empty before the draft).
// Usage: node tools/digest.js build/draft-room.html
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();await pg.setContent(fs.readFileSync(process.argv[2],'utf8'),{waitUntil:'load'});await pg.waitForTimeout(3000);
const d=await pg.evaluate(()=>todayDigest());await b.close();console.log('DIGEST: '+(d||'No roster yet, so nothing to report.'))})().catch(e=>{console.log('DIGEST: unavailable ('+e.message+')')});
