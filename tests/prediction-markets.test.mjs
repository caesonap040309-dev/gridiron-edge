import test from "node:test";
import assert from "node:assert/strict";
import {normalizePolymarketEvent} from "../scripts/update-prediction-markets.mjs";

test("normalizes a Polymarket football moneyline without treating volume as public handle",()=>{
  const value=normalizePolymarketEvent({title:"Dallas Cowboys vs. New York Giants",slug:"nfl-dal-nyg",sports:{teams:[{name:"Dallas Cowboys",ordering:"away"},{name:"New York Giants",ordering:"home"}]},markets:[{sportsMarketType:"moneyline",outcomes:'["Dallas Cowboys","New York Giants"]',outcomePrices:'["0.42","0.58"]',volume:"250000",volume24hr:"15000",liquidity:"42000"}]},"NFL");
  assert.equal(value.home,"New York Giants");
  assert.equal(value.homeProbability,58);
  assert.equal(value.volume24h,15000);
  assert.equal(value.homeMoney,undefined);
});
