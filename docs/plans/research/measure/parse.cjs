const fs=require("fs"),vm=require("vm");
for (const f of process.argv.slice(2)) {
  const src=fs.readFileSync(f,"utf8");
  const t=process.hrtime.bigint();
  try { new vm.Script(src.replace(/^#!.*\n/,""),{filename:f}); } catch(e){ console.log("compile err (ESM?)",f,String(e).slice(0,80)); continue; }
  console.log(f.split("/").slice(-3).join("/"),(src.length/1e6).toFixed(1)+"MB","parse(vm.Script) ms",Number(process.hrtime.bigint()-t)/1e6);
}
