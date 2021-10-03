-- This is only run at the creation of a user database; to change the schema a
-- database migration would be needed.

-- The user's pings.
CREATE TABLE pings (
    time INTEGER NOT NULL PRIMARY KEY UNIQUE,
    tags TEXT NOT NULL,
    interval NUMBER NOT NULL,
    category TEXT,
    comment TEXT,
    last_change NUMBER NOT NULL
) WITHOUT ROWID;

-- A key-value store, used to store config.
CREATE TABLE meta (
    k TEXT PRIMARY KEY NOT NULL,
    v TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO meta (k, v) VALUES ('ver', '1');
