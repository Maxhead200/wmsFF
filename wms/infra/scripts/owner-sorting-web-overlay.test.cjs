// TEST: exercise the exact published functions and verify the minimal graph delta.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const [source, candidate] = process.argv.slice(2);
const oldPrefix = 'requests-theme-20260929-', prefix = 'owner-sorting-20260929-';
const entry = fs.readFileSync(path.join(candidate, 'assets', prefix + '0.js'), 'utf8');
const menu = entry.match(/function a2\(t,n\)\{.*?\}function R5\(t\)\{.*?\}/s)[0];
const panel = entry.match(/function d4\(\{session:t\}\)\{.*?\}function Z1/s)[0].replace(/function Z1$/, '');
const context = {e:{jsx:(type, props)=>({type,...props})},h4:'sorting-screen'};
vm.createContext(context);vm.runInContext(menu + ';' + panel, context);
const item = {id:'pallet-sorting', permissions:['stock:write'], audience:'internal'};
for (const role of ['OWNER','ADMIN','MANAGER','OPERATOR','CLIENT']) {
  const user = {id:'test',activeWarehouseId:'wh',roleCodes:[role],permissionCodes:['system:admin'],workspaceVisibility:{'pallet-sorting':false}};
  const allowed = ['OWNER','ADMIN'].includes(role);
  assert.equal(context.a2(user,item), allowed);
  assert.equal(context.d4({session:{user}}).type === 'sorting-screen', allowed);
  assert.equal(context.a2({...user,isDemo:true},item), false);
}
const names = fs.readdirSync(path.join(candidate,'assets'));
assert.equal(names.length,29);
for (const name of names) {
  let s = fs.readFileSync(path.join(candidate,'assets',name),'utf8');
  assert(!s.includes(oldPrefix));
  for (const match of s.matchAll(/owner-sorting-20260929-\d+\.js/g)) assert(names.includes(match[0]));
  // Renaming aside, exactly two authorization checks and one explanatory message change.
  s = s.replaceAll(prefix,oldPrefix);
  if (name === prefix+'0.js') s = s.replace('n.id==="pallet-sorting"?t.roleCodes.some(r=>r==="ADMIN"||r==="OWNER")&&!t.isDemo','n.id==="pallet-sorting"?t.roleCodes.includes("ADMIN")&&!t.isDemo')
    .replace('function d4({session:t}){return t.user.roleCodes.some(r=>r==="ADMIN"||r==="OWNER")?','function d4({session:t}){return t.user.roleCodes.includes("ADMIN")?')
    .replace('Раздел доступен администратору и собственнику.','Раздел доступен только администратору.');
  assert.equal(s,fs.readFileSync(path.join(source,'assets',name.replace(prefix,oldPrefix)),'utf8'));
}
assert.equal(fs.readFileSync(path.join(candidate,'index.html'),'utf8').replaceAll(prefix,oldPrefix),fs.readFileSync(path.join(source,'index.html'),'utf8'));
console.log('PASS: live OWNER/ADMIN menu and screen, denied roles/demo, exact delta, 29-module graph');
