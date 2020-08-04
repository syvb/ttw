# Vacuums and optimizes user databases
for filename in user-dbs/*.db; do
    sqlite3 "$filename" "VACUUM";
    sqlite3 "$filename" "PRAGMA optimize";
done
