// TEST: real form interactions preserve paid history and preview the multi-person total.
module.exports=async(page)=>{
 const assert=require('node:assert/strict');
 await page.getByLabel('Выбрать для оплаты: Марифат Рашидовна',{exact:true}).check();
 await page.getByLabel('Выбрать для оплаты: Соня',{exact:true}).check();
 await page.getByRole('button',{name:'Применить к выбранным начислениям (3)'}).waitFor();
 assert((await page.getByText('Выбрано людей:',{exact:false}).innerText()).includes('600'));
 await page.getByLabel('Статус оплаты',{exact:true}).selectOption('PAID');
 assert(await page.getByRole('button',{name:'Применить к выбранным начислениям (0)'}).isDisabled());
 assert.equal(await page.locator('table[aria-label="Записи табеля"] tbody tr').count(),1);
 await page.getByLabel('Статус оплаты',{exact:true}).selectOption('UNPAID');
 await page.getByLabel('Выбрать для оплаты: Марифат Рашидовна',{exact:true}).check();
 await page.getByLabel('Выбрать для оплаты: Соня',{exact:true}).check();
 await page.getByRole('button',{name:'Применить к выбранным начислениям (3)'}).click();
 await page.waitForFunction(()=>window.batchSaved);
 assert.equal((await page.evaluate(()=>window.batchSaved)).expectedAmountKopecks,60000);
 assert.equal((await page.evaluate(()=>window.batchSaved)).entries.length,3);
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByLabel('Сотрудник',{exact:true}).selectOption('main');
 await page.getByText('Несколько записей — один сотрудник',{exact:true}).click();
 await page.locator('.payroll-identity-list').getByText('Марифат',{exact:true}).locator('input').uncheck();
 await page.getByRole('button',{name:'Сохранить связь карточек'}).click();
 await page.waitForFunction(()=>window.identitySaved);
 assert.deepEqual((await page.evaluate(()=>window.identitySaved)).memberIds,[]);
};
