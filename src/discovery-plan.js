// Balanced discovery prevents eight keyword searches at source #1 from exhausting
// the search budget before source #20 is ever visited.
import { FEED_SOURCES } from './feeds.js';
export function buildDiscoveryPlan(config) {
  const ordered=[...new Set((config.sources||[]).filter(Boolean))];
  const feeds=ordered.filter(x=>FEED_SOURCES.has(x)).map(source=>({type:'feed',source,query:''}));
  const browsers=ordered.filter(x=>!FEED_SOURCES.has(x));
  const queries=[...new Set((config.searchQueries||[]).filter(Boolean))];
  const budget=Math.max(1,Math.min(100,Number(config.maxDiscoverySearchesPerRun)||100));
  const perSource=Math.max(1,Math.min(30,Number(config.maxQueriesPerSource)||20));
  const rounds=Math.min(queries.length,perSource);
  const tasks=[];
  // Rotate through all sources for each query round; do not bury sources.
  for(let r=0;r<rounds && tasks.length<budget;r++){
    for(let k=0;k<browsers.length && tasks.length<budget;k++){
      const source=browsers[k];
      const query=queries[(r+k)%queries.length];
      if(query) tasks.push({type:'browser',source,query});
    }
  }
  return {feeds,browserTasks:tasks,searchBudget:budget,sourceCount:ordered.length};
}
