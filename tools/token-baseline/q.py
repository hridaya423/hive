import sqlite3
import sys
from pathlib import Path
from urllib.parse import quote

database, *queries = sys.argv[1:]
connection = sqlite3.connect(f"file:{quote(str(Path(database).expanduser().resolve()))}?mode=ro", uri=True)
for query in queries:
    print(">>", query)
    cursor = connection.execute(query)
    print([column[0] for column in cursor.description])
    for row in cursor.fetchall():
        print(row)
