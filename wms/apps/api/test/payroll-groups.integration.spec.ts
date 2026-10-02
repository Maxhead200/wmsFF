import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PayrollService } from '../src/modules/expenses/payroll.service';
const url=process.env.ATTENDANCE_TEST_DATABASE_URL;
if(url && url!=='postgresql://codex_payroll@127.0.0.1:55487/payroll_tests')throw Error('Dedicated local payroll database only');
// TEST: identity links are reversible metadata; payments across people commit atomically.
describe.skipIf(!url).sequential('payroll identity and multiple payments',()=>{
 let db:PrismaClient,svc:PayrollService,a:string,b:string,c:string,w:string,user:any;
 const previous=process.env.WMS_PAYROLL_ATTENDANCE_ENABLED;
 beforeAll(async()=>{process.env.WMS_PAYROLL_ATTENDANCE_ENABLED='true';db=new PrismaClient({datasources:{db:{url:url!}}});svc=new PayrollService(db as never);w=randomUUID();
 a=randomUUID();b=randomUUID();c=randomUUID();user={id:'group-test',roleCodes:['ADMIN'],warehouseIds:[w],writableWarehouseIds:[w]};
 for(const [id,name,warehouseId] of [[a,'Марифат',w],[b,'Марифат Рашидовна',w],[c,'Другой филиал',randomUUID()]])await db.payrollEmployee.create({data:{id,name,warehouseId}});
 for(const [id,amount] of [[a,10000],[b,20000]] as const)await db.payrollHistorical.create({data:{key:id,employeeId:id,warehouseId:w,workDate:'2026-10-01',amountKopecks:amount,status:'UNPAID',data:{},sourceHash:'test',createdById:user.id}});
 });
 afterAll(async()=>{await db?.$disconnect();if(previous===undefined)delete process.env.WMS_PAYROLL_ATTENDANCE_ENABLED;else process.env.WMS_PAYROLL_ATTENDANCE_ENABLED=previous;});
 it('links and unlinks names without moving historical earnings',async()=>{
 await (svc as any).setIdentity(a,{memberIds:[b]},user);
 expect((await db.payrollEmployee.findUniqueOrThrow({where:{id:b}})) as any).toMatchObject({payrollPrimaryId:a});
 expect(await db.payrollHistorical.count({where:{employeeId:b}})).toBe(1);
 await expect((svc as any).setIdentity(b,{memberIds:[a]},user)).rejects.toThrow();
 await expect((svc as any).setIdentity(a,{memberIds:[c]},user)).rejects.toThrow();
 await (svc as any).setIdentity(a,{memberIds:[]},user);
 expect((await db.payrollEmployee.findUniqueOrThrow({where:{id:b}})) as any).toMatchObject({payrollPrimaryId:null});
 });
 const payload=(expectedAmountKopecks=30000)=>({dateFrom:'2026-10-01',dateTo:'2026-10-01',status:'PAID',comment:'Verified payment',expectedAmountKopecks,entries:[{employeeId:a,keys:['HISTORY:'+a]},{employeeId:b,keys:['HISTORY:'+b]}]});
 it('rejects a stale total and a foreign employee without partial payments',async()=>{
 await expect((svc as any).setStatusBatch(payload(30001),user)).rejects.toThrow();
 await expect((svc as any).setStatusBatch({...payload(),entries:[{employeeId:a,keys:['HISTORY:'+a]},{employeeId:c,keys:['bad']}]},user)).rejects.toThrow();
 expect(await db.payrollSettlement.count({where:{employeeId:{in:[a,b]}}})).toBe(0);
 });
 it('pays selected people once and rejects stale repeated payment',async()=>{
 expect(await (svc as any).setStatusBatch(payload(),user)).toMatchObject({updated:2,amountKopecks:30000});
 await expect((svc as any).setStatusBatch(payload(),user)).rejects.toThrow();
 expect(await db.payrollSettlement.count({where:{employeeId:{in:[a,b]},status:'PAID'}})).toBe(2);
 });
});
