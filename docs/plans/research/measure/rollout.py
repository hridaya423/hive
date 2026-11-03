import json,sys
f=sys.argv[1]
for i,l in enumerate(open(f)):
    o=json.loads(l)
    t=o.get("type"); p=o.get("payload",{})
    s=json.dumps(p)
    kind=p.get("type") or p.get("role")
    extra=""
    if t=="response_item" and p.get("type")=="message":
        txt="".join(c.get("text","") for c in p.get("content",[]))
        extra=f"role={p.get('role')} chars={len(txt)} :: {txt[:90]!r}"
    elif t=="session_meta":
        extra="keys="+",".join(p.keys())+ f" base_instructions_chars={len(json.dumps(p.get('base_instructions','')))} dyn_tools={len(json.dumps(p.get('dynamic_tools','')))}"
    elif t=="turn_context":
        extra="keys="+",".join(p.keys())+f" dev_chars={len(json.dumps(p.get('developer_instructions','')))}"
    print(i,t,kind,len(s),extra)
    if i>40: break
