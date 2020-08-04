CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    pw TEXT NOT NULL,
    register_date NUMBER NOT NULL,
    plan NUMBER NOT NULL
); -- WITH ROWID

CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    token TEXT,
    verified INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
); -- WITH ROWID

CREATE TABLE IF NOT EXISTS pushregs (
    endpoint_uri TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    seed INTEGER NOT NULL,
    avg_interval INTEGER NOT NULL,
    PRIMARY KEY (endpoint_uri, p256dh, auth)
) WITHOUT ROWID;
