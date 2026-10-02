import { expect, it } from 'vitest';
import { payrollPaymentSummary, payrollIdentityId, payrollSelectedTotal, payrollFilterRows } from './PayrollManagement';
// TEST: selection spans people but never hidden, paid or review rows.
it('sums only visible unpaid selected rows across employees without duplicates', () => {
 const rows=[{key:'a',employeeId:'a',amountKopecks:10000,status:'UNPAID'},{key:'b',employeeId:'b',amountKopecks:20000,status:'UNPAID'},{key:'paid',employeeId:'b',amountKopecks:99999,status:'PAID'},{key:'review',employeeId:'b',amountKopecks:77777,status:'REVIEW'}];
 expect(payrollSelectedTotal(rows,['a','a','b','hidden','paid','review'])).toBe(30000);
 expect(payrollFilterRows(rows,'PAID').map(r=>r.key)).toEqual(['paid']);
 expect(payrollFilterRows(rows,'UNPAID').map(r=>r.key)).toEqual(['a','b']);
 expect(payrollIdentityId({id:'alias',payrollPrimaryId:'main'})).toBe('main');
 expect(payrollIdentityId({id:'main'})).toBe('main');
});

// TEST: linked aliases form one recipient but retain paid/unpaid distinctions.
it('combines aliases under the primary recipient and preserves payment status',()=>{
 const people=[{id:'main',name:'Марифат Рашидовна',paymentMethod:'CASH'},{id:'alias',name:'Марифат',payrollPrimaryId:'main',paymentMethod:'TRANSFER',paymentBank:'old'}];
 const rows=[{employeeId:'main',amountKopecks:10000,status:'UNPAID'},{employeeId:'alias',amountKopecks:20000,status:'UNPAID'},{employeeId:'alias',amountKopecks:5000,status:'PAID'}];
 const summary=payrollPaymentSummary(people,rows,'__all');expect(summary).toHaveLength(1);
 expect(summary[0]).toMatchObject({id:'main',amountKopecks:35000,unpaidKopecks:30000,paidKopecks:5000,payment:'Наличные'});
 expect(payrollPaymentSummary(people,rows,'alias')).toEqual(summary);
});
