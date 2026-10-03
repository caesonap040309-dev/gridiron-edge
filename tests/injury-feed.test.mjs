import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCoversInjuries,fallbackSummary,selectInjuryReport} from '../scripts/injury-feed.mjs';
import {dataQuality} from '../scripts/team-enrichment.mjs';
const now=new Date('2026-10-03T02:00:00Z');
const team=(name,body)=>`<section><div class="covers-CoversMatchups-teamName"><a>${name}</a></div><table><tbody>${body}</tbody></table></section>`;
test('missing injury section retains timestamp and marks unverified coverage',()=>{
 const old={home:[{name:'QB',status:'Out'}],away:[],updatedAt:'2026-09-01',source:'ESPN'};
 const result=selectInjuryReport({}, {home:[],away:[],updatedAt:now.toISOString()},old,now.toISOString());
 assert.equal(result.updatedAt,old.updatedAt);assert.equal(result.coverage,'unavailable');assert.equal(result.home.length,1);
});
test('explicit empty report clears cached injuries',()=>{
 const result=selectInjuryReport({injuries:[]},{home:[],away:[],updatedAt:now.toISOString()}, {home:[{name:'QB'}]},now.toISOString());
 assert.equal(result.home.length,0);assert.equal(result.coverage,'reported');
});
test('public listing parses team, dated status and detail; rejects malformed tables',()=>{
 const html=team('Ohio State<br><span>Buckeyes</span>',`<tr><td>B. Jackson</td><td>RB</td><td><b>Questionable - Shoulder</b><br>(Fri, Oct 2)</td><td></td></tr><tr><td><div class="covers-CoversMatchups-injuryCopy">Shoulder issue</div></td></tr>`)+team('Iowa Hawkeyes','<tr><td>No injuries to report.</td></tr>')+team('Bad Team','<tr><td>Unexpected</td></tr>');
 const teams=parseCoversInjuries(html,now);assert.equal(teams.size,2);assert.equal(teams.get('ohiostatebuckeyes').injuries[0].reportedAt,'2026-10-02T12:00:00.000Z');
 const game={home:'Iowa Hawkeyes',away:'Ohio State Buckeyes',homeId:'1',awayId:'2'};
 assert.equal(fallbackSummary({teams},game,[]).injuries.length,2);
 assert.equal(fallbackSummary({teams},{...game,home:'Missing'},[]),null);
});
test('unavailable coverage and old unresolved status remain blocked',()=>{
 const game={date:'2026-10-03T16:00Z',injuries:{updatedAt:now.toISOString(),coverage:'unavailable'}};
 assert.ok(dataQuality(game,null,now).reasons.includes('Current injury coverage unavailable'));
 game.injuries={updatedAt:now.toISOString(),source:'Covers',home:[{status:'Questionable',reportedAt:'2026-09-20'}],away:[]};
 assert.ok(dataQuality(game,null,now).reasons.includes('Listed injury status needs confirmation'));
});
