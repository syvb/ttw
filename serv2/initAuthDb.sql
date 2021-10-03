-- This is run every time the server starts.

CREATE TABLE IF NOT EXISTS tokens (
    user_id INTEGER,
    token_data TEXT,
    created INTEGER
); -- WITH ROWID
