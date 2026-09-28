// TEST: overlay deployments must add a single layer, not one per JS chunk.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('single COPY uses staged payload and excludes proof metadata',()=>{
 const source=fs.readFileSync(__dirname+'/deploy-spirit.py','utf8');
 assert.ok(source.includes('COPY payload/ /usr/share/nginx/html/'));
 assert.ok(source.includes("shutil.copyfile(ROOT/'build/index.html',payload/'index.html')"));
 assert.ok(source.includes("shutil.copyfile(ROOT/'build'/n,payload/'assets'/n)"));
 assert.ok(!source.includes("'COPY build/'+n"));
});
