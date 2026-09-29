import {describe, expect, it} from 'vitest';
import {regroupWorkspaces} from './workspace-groups';

// TEST: exact requested navigation, including separate monitoring and API entries.
const expected = [
  ['client','Клиентский контур','cabinet contracts analytics catalog'],
  ['marketplaces','Маркетплейсы','requests fbs fbo-ozon dbs operations-statistics'],
  ['operations','Склад и операции','warehouse storage-zones inventory kiz kiz-circulation turnover fbs-packed order-assembly relabeling'],
  ['management','Управление','access monitoring integration-api branches imports services own-companies factory print'],
  ['control','Контроль','ai administration service debug data'],
  ['logistics','Логистика','logistics'],
  ['finance','Финансы','billing expenses'],
];
const fixture = [{id:'management',title:'Управление',items:expected.flatMap(g=>g[2].split(' ').map(id=>({id,title:id,permissions:['existing']}))).concat([{id:'directories',title:'Справочники',permissions:['existing']}])}];
describe('our WMS menu regrouping',()=>{
  it('moves every requested item into its exact ordered group',()=>{
    const result=regroupWorkspaces(fixture,'wms.logoff.pro');
    expect(result.map(g=>g.id)).toEqual(expected.map(g=>g[0]));
    for(const [id,title,items] of expected){const group=result.find(g=>g.id===id)!;expect(group.title).toBe(title);expect(group.items.map(i=>i.id)).toEqual([...items.split(' '),...(id==='management'?['directories']:[])]);}
  });
  it('preserves each item once, metadata, and input without mutation',()=>{
    const before=JSON.stringify(fixture), result=regroupWorkspaces(fixture,'localhost').flatMap(g=>g.items);
    expect(result).toHaveLength(fixture[0].items.length);expect(new Set(result.map(i=>i.id)).size).toBe(result.length);
    for(const item of fixture[0].items)expect(result.find(i=>i.id===item.id)).toBe(item);
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('never invents unavailable items and keeps unknown groups',()=>{
    const input=[{id:'control',title:'Контроль',items:[{id:'monitoring'}]},{id:'other',title:'Другое',items:[{id:'unlisted'}]}];
    expect(regroupWorkspaces(input,'127.0.0.1')).toEqual([{id:'management',title:'Управление',items:[{id:'monitoring'}]},input[1]]);
    expect(regroupWorkspaces([],'localhost')).toEqual([]);
  });
  it('leaves sold and unknown environments untouched',()=>{
    for(const host of ['sold.example','ffulhab.ru','wms.logoff.pro.evil',''])expect(regroupWorkspaces(fixture,host)).toBe(fixture);
  });
});
