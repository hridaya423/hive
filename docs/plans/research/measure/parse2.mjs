import fs from "fs"; import vm from "vm";
for (const f of process.argv.slice(2)) {
  const src=fs.readFileSync(f,"utf8");
  const t=process.hrtime.bigint();
  try { new vm.SourceTextModule(src,{identifier:f}); console.log(f.split("/").slice(-3).join("/"),(src.length/1e6).toFixed(1)+"MB","parse ms",(Number(process.hrtime.bigint()-t)/1e6).toFixed(0)); } catch(e){ console.log("err",f,String(e).slice(0,100)); }
}
