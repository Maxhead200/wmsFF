import {it,expect} from 'vitest';
import {requestZoneTones} from './requestZoneTones';
const now=Date.parse('2026-09-29T10:00:00Z');
const order=(id:string,hours:number)=>({id,connectionId:'wb',category:'active',request:{id:'r'},createdAt:new Date(now-hours*3600000).toISOString()});
// TEST: majority and urgent ties use the same 12/19-hour boundaries as FBS.
it('uses actual order majority and urgent ties',()=>{
 expect(requestZoneTones([order('1',1),order('2',2),order('3',24)] as any,now)).toEqual({r:'normal'});
 expect(requestZoneTones([order('1',12),order('2',19)] as any,now)).toEqual({r:'critical'});
 expect(requestZoneTones([order('1',11),order('2',12)] as any,now)).toEqual({r:'warning'});
});
// TEST: duplicate, completed and invalid records cannot skew a request's zone.
it('ignores duplicates and unavailable age',()=>{
 expect(requestZoneTones([order('1',1),order('1',1),order('2',19)] as any,now)).toEqual({r:'critical'});
 expect(requestZoneTones([{...order('1',20),category:'archive'},{...order('2',20),createdAt:null}] as any,now)).toEqual({});
});

// TEST: marketplace shipment is not WMS completion; packed requests still need age colours.
it('includes shipped orders until the WMS request is done',()=>{
 expect(requestZoneTones([{...order('1',15),category:'shipped',request:{id:'r',status:'PACKED'}}] as any,now)).toEqual({r:'warning'});
 expect(requestZoneTones([{...order('1',15),category:'shipped',request:{id:'r',status:'DONE'}}] as any,now)).toEqual({});
});
