// FIX: overlay only the verified live navigation graph; preserve historical assets.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function prepare(source, target) {
  assert(!fs.existsSync(target), 'Use a fresh candidate directory');
  const prefix = 'requests-theme-20260929-', next = 'owner-sorting-20260929-';
  const assets = path.join(source, 'assets');
  const names = fs.readdirSync(assets).filter(n => n.startsWith(prefix) && n.endsWith('.js')).sort();
  assert.equal(names.length, 29, 'Unexpected live graph; review before adapting');
  const index = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  assert(index.includes(`/assets/${prefix}0.js`));
  const menu = 'n.id==="pallet-sorting"?t.roleCodes.includes("ADMIN")&&!t.isDemo';
  const panel = 'function d4({session:t}){return t.user.roleCodes.includes("ADMIN")?';
  const rename = s => s.replaceAll(prefix, next);
  fs.mkdirSync(path.join(target, 'assets'), {recursive: true});
  for (const name of names) {
    let s = fs.readFileSync(path.join(assets, name), 'utf8');
    if (name === `${prefix}0.js`) {
      assert.equal(s.split(menu).length, 2);
      assert.equal(s.split(panel).length, 2);
      s = s.replace(menu, 'n.id==="pallet-sorting"?t.roleCodes.some(r=>r==="ADMIN"||r==="OWNER")&&!t.isDemo')
        .replace(panel, 'function d4({session:t}){return t.user.roleCodes.some(r=>r==="ADMIN"||r==="OWNER")?')
        .replace('Раздел доступен только администратору.', 'Раздел доступен администратору и собственнику.');
    }
    fs.writeFileSync(path.join(target, 'assets', rename(name)), rename(s));
  }
  fs.writeFileSync(path.join(target, 'index.html'), rename(index));
  return {entry: `${next}0.js`, files: names.length + 1};
}
module.exports = {prepare};
if (require.main === module) console.log(JSON.stringify(prepare(process.argv[2], process.argv[3])));
