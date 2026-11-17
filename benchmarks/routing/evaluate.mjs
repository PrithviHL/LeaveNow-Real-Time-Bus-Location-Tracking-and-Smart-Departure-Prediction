import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
const repo = process.argv[2] || new URL('../../', import.meta.url).pathname;
const feed = process.argv[3] || `${repo}/data/gtfs.json.gz`;
const output = process.argv[4];
if (!output) throw new Error('Usage: node benchmarks/routing/evaluate.mjs REPO FEED OUTPUT_JSON');
const {Schedule} = await import(pathToFileURL(`${repo}/src/server/schedule.js`));
const t=performance.now();
const s=Schedule.load(feed);
const loadMs=performance.now()-t;
let seed=20261116;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const cases=[];
for(let i=0;i<60;i++){
 const a=s.stops[Math.floor(rand()*s.stops.length)], b=s.stops[Math.floor(rand()*s.stops.length)];
 const hour=[8,12,17][i%3];
 const when=Date.parse(`2026-11-16T${String(hour).padStart(2,'0')}:00:00-05:00`);
 cases.push({origin:a,destination:b,mode:['leave_now','depart_at','arrive_by'][i%3],when});
}
const baseline=cases.map((c,i)=>{ const r=s.search(c.origin,c.destination,{mode:c.mode,when:c.when,maxWalk:15,maxTransfers:0},c.mode==='arrive_by'?c.when-4*3600000:c.when); return {case:i,journeys:r.journeys.length}; });
const rows=[];
for(let repeat=0;repeat<2;repeat++)for(const [i,c] of cases.entries()){
 const start=performance.now();
 const r=s.search(c.origin,c.destination,{mode:c.mode,when:c.when,maxWalk:15,maxTransfers:1},c.mode==='arrive_by'?c.when-4*3600000:c.when);
 const ms=performance.now()-start;
 rows.push({case:i,repeat,mode:c.mode,origin:c.origin.id,destination:c.destination.id,ms,journeys:r.journeys.length,direct:r.journeys.some(j=>j.transfers===0),transfer:r.journeys.some(j=>j.transfers===1)});
}
function stats(rows){const times=rows.map(r=>r.ms).sort((a,b)=>a-b); const p=q=>times[Math.ceil(times.length*q)-1];return {queries:rows.length,p50Ms:p(.5),p95Ms:p(.95),maxMs:times.at(-1),withResults:rows.filter(r=>r.journeys>0).length,withDirect:rows.filter(r=>r.direct).length,withTransfer:rows.filter(r=>r.transfer).length};}
const result={baseline:{directOnlyWithResults:baseline.filter(r=>r.journeys>0).length,oneTransferWithResults:rows.filter(r=>r.repeat===1&&r.journeys>0).length,additionalReachableCases:baseline.filter(b=>b.journeys===0&&rows.some(r=>r.case===b.case&&r.repeat===1&&r.journeys>0)).length},node:process.version,cpu:os.cpus()[0]?.model,platform:process.platform,arch:process.arch,seed:20261116,loadMs,feed:s.metadata(),scale:{stops:s.stops.length,trips:s.data.trips.length,routes:Object.keys(s.data.routes).length,shapes:Object.keys(s.data.shapes||{}).length,stopTimes:s.data.trips.reduce((n,t)=>n+t.stops.length,0)},firstPass:stats(rows.filter(r=>r.repeat===0)),warmPass:stats(rows.filter(r=>r.repeat===1)),byMode:Object.fromEntries(['leave_now','depart_at','arrive_by'].map(mode=>[mode,stats(rows.filter(r=>r.repeat===1&&r.mode===mode))])),rows};
writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:undefined},null,2));
