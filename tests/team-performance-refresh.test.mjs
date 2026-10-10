import test from 'node:test';
import assert from 'node:assert/strict';
import {performanceNeedsRefresh,loadPerformance} from '../scripts/team-performance.mjs';
const now=new Date('2026-10-10T10:00:00Z');
const game={id:'refresh-test',date:'2026-10-09T00:00:00Z',season:2026,status:'Final'};
test('recent final statistics are rechecked after six hours',()=>{
  assert.equal(performanceNeedsRefresh(game,{schemaVersion:6,fetchedAt:'2026-10-10T05:00:00Z'},now),false);
  assert.equal(performanceNeedsRefresh(game,{schemaVersion:6,fetchedAt:'2026-10-10T03:00:00Z'},now),true);
});
test('old undated caches and explicit refreshes are rechecked',()=>{
  assert.equal(performanceNeedsRefresh(game,{schemaVersion:6},now),true);
  assert.equal(performanceNeedsRefresh(game,{schemaVersion:6,fetchedAt:now.toISOString()},now,true),true);
  const older={...game,date:'2026-09-01T00:00:00Z'};
  assert.equal(performanceNeedsRefresh(older,{schemaVersion:6,fetchedAt:'2026-10-09T00:00:00Z'},now),false);
  assert.equal(performanceNeedsRefresh(older,{schemaVersion:6,fetchedAt:'2026-10-01T00:00:00Z'},now),true);
});
test('failed refresh retains verified metrics without marking them fresh',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('feed unavailable')};
  const cached={schemaVersion:6,home:{snaps:0},away:{snaps:0}};
  try{
    const games=[{...game}];
    await loadPerformance(games,{games:[{...game,performance:cached}]},'nfl');
    assert.equal(games[0].performance,cached);
    assert.equal(games[0].performance.fetchedAt,undefined);
  }finally{globalThis.fetch=original}
});
