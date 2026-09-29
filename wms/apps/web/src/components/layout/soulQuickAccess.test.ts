import {describe,it,expect} from 'vitest';
import {parseUsage,recordUsage,popularItems,usageKey} from './soulUsage';
// TEST: personal popularity must not bypass the permission-filtered menu.
describe('Soul quick access',()=>{
 it('counts openings immutably and ranks frequency before recency',()=>{
  const empty={},one=recordUsage(empty,'fbs',1),two=recordUsage(one,'fbs',2),three=recordUsage(two,'billing',3);
  expect(empty).toEqual({});expect(one.fbs.count).toBe(1);expect(three.fbs.count).toBe(2);
  expect(popularItems([{id:'billing'},{id:'fbs'}],three).map(i=>i.id)).toEqual(['fbs','billing']);
 });
 it('breaks ties by recent opening, caps eight, and hides inaccessible items',()=>{
  const items=Array.from({length:12},(_,n)=>({id:`item${n}`}));let usage={};for(let n=0;n<12;n++)usage=recordUsage(usage,items[n].id,n);
  expect(popularItems(items,usage).map(i=>i.id)).toEqual(items.slice(4).reverse().map(i=>i.id));
  expect(popularItems([{id:'item0'}],usage)).toEqual([{id:'item0'}]);expect(popularItems([{id:'new'}],usage)).toEqual([]);
 });
 it('tolerates corrupted storage and rejects unsafe or invalid values',()=>{
  expect(parseUsage('broken')).toEqual({});expect(parseUsage('null')).toEqual({});expect(parseUsage('[]')).toEqual({});
  expect(parseUsage('{"fbs":{"count":3,"last":8},"bad":{"count":-1,"last":4},"__proto__":{"count":1,"last":2}}')).toEqual({fbs:{count:3,last:8}});
 });
 it('keeps different users separate and never records home',()=>{
  expect(usageKey('alice')).not.toBe(usageKey('bob'));expect(recordUsage({},'overview',1)).toEqual({});
 });
});
