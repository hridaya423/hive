import sqlite3,sys
p="/Users/hridyaagrawal/Library/Application%20Support/OpenBot/openbot.db"
c=sqlite3.connect("file:"+p+"?mode=ro&immutable=1",uri=True)
for q in sys.argv[1:]:
    print(">>",q)
    cur=c.execute(q)
    print([d[0] for d in cur.description])
    for r in cur.fetchall(): print(r)
