const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEventServer}=require('./event-server');
test('portable server exposes event search only and rejects invalid search dates',async()=>{
  const server=createEventServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base+'/health').then(r=>r.json())).ok,true);
    const page=await fetch(base+'/events').then(r=>r.text());assert.match(page,/event-sheet/);assert.match(page,/행사 검색 →/);assert.doesNotMatch(page,/통합관리 →/);
    const sources=await fetch(base+'/api/events/sources').then(r=>r.json());assert(sources.some(s=>s.id==='namgu'));
    for(const route of ['/api/state','/api/login','/db/staff.json','/event-corrections.json','/../server.js'])assert.equal((await fetch(base+route)).status,404);
    const bad=await fetch(base+'/api/events/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate:'2026-02-30',endDate:'2026-03-01',sources:['namgu']})});assert.equal(bad.status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
