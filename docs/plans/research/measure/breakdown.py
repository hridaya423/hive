import json,sys,tiktoken
e=tiktoken.get_encoding("o200k_base")
T=lambda s: len(e.encode(s,disallowed_special=()))
f=sys.argv[1]
L=[json.loads(l) for l in open(f)]
rows=[]
sm=L[0]["payload"]
rows.append(("codex base_instructions (session_meta)",len(sm["base_instructions"]) if isinstance(sm["base_instructions"],str) else len(json.dumps(sm["base_instructions"])),T(sm["base_instructions"] if isinstance(sm["base_instructions"],str) else json.dumps(sm["base_instructions"]))))
at=[o for o in L if o["type"]=="response_item" and o["payload"].get("type")=="additional_tools"][0]["payload"]["tools"]
for ns in at:
    s=json.dumps(ns,separators=(",",":"))
    rows.append((f"tools ns:{ns['name']} ({len(ns.get('tools',[]))} fns)",len(s),T(s)))
dyn=json.dumps(sm["dynamic_tools"],separators=(",",":"))
rows.append(("dynamic_tools declared in session_meta (openbot ns, dup of tools ns:openbot)",len(dyn),T(dyn)))
def txt(p): return "".join(c.get("text","") for c in p["content"])
n=0
for i,o in enumerate(L[:30]):
    if o["type"]=="response_item" and o["payload"].get("type")=="message":
        t=txt(o["payload"]); rows.append((f"msg[{i}] role={o['payload']['role']} :: {t[:50]!r}",len(t),T(t)))
for r in rows: print(f"{r[1]:8} chars {r[2]:7} tok  {r[0]}")
