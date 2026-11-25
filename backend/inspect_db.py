import sqlite3
con=sqlite3.connect("quiz_hero.db")
cur=con.cursor()
print("reviewitem counts:")
for r in cur.execute("SELECT user_email, COUNT(*) FROM reviewitem GROUP BY user_email").fetchall():
    print(r)
print("submissions counts:")
for r in cur.execute("SELECT student_email, COUNT(*) FROM submissions GROUP BY student_email").fetchall():
    print(r)
print("users:")
for r in cur.execute("SELECT id,email,role FROM users").fetchall():
    print(r)