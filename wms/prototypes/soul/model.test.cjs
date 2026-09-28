// TEST: navigation remains a view-only state machine; group browsing preserves the page.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {menu,transition,pageType}=require('./model.cjs');
test('all menu entries appear exactly once in four existing groups',()=>{
 const ids=menu.flatMap(g=>g.items.map(i=>i.id));
 assert.equal(menu.length,4); assert.equal(ids.length,36); assert.equal(new Set(ids).size,ids.length);
 assert.ok(!ids.includes('overview')); for(const id of ids)assert.ok(['table','cards','form'].includes(pageType(id)));
});
test('open, browse another group without replacement, then home',()=>{
 let s=transition({}, {type:'open',id:'fbs'}); assert.equal(s.selected,'fbs'); assert.equal(s.group,'client');
 s=transition(s,{type:'group',id:'management'});assert.equal(s.selected,'fbs');assert.equal(s.group,'management');
 s=transition(s,{type:'open',id:'billing'});assert.equal(s.selected,'billing');
 assert.deepEqual(transition(s,{type:'home'}),{group:null,selected:null});
 assert.equal(transition(s,{type:'open',id:'unknown'}),s);
});
