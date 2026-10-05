# Shutting down an instance

When you stop running an instance, you can replace it with `serv2/export-server.js`.
Users log in with their existing username and password and download their data.
Nothing else works: there is no tagging, syncing, Beeminder, or notifications.

The export server:
- replaces both the frontend and the backend, so the frontend no longer needs to be built or deployed
- only opens databases read-only, so it can't change or lose data
- doesn't need Rust, wasm-pack, or the frontend build, only the packages from `yarn` in `serv2`
- accepts old login cookies and API tokens, so users who are still logged in don't need their password

Users can download three formats:

| Download | Contents |
|----------|----------|
| TagTime log | One line per ping, readable by TagTime. The bracketed dates use the browser's time zone, or UTC without JavaScript. |
| JSON | Every ping with its tags, plus the user's settings |
| SQLite database | The user's database file, byte for byte |

API clients can fetch `/export/tags.log`, `/export/pings.json`, `/export/user.db`, and the old `/db` endpoint with their API token.
The `tz` query parameter picks the TagTime log's time zone, like `/export/tags.log?tz=America/Toronto`.

## Before the shutdown

1. Pick a shutdown date.
1. Set `disable-signups` to `true` (see [config.md](config.md)).
1. Announce the date. You can add a notice to the homepage with `extra-homepage-text` and rebuild the frontend.
1. Ask users to open the app while online before the shutdown.
   The app saves pings in the browser and syncs them later, so pings answered offline exist only in the browser until then.

## Switching over

These steps assume you're in the `serv2` directory and use the default database locations.
If you set `user-db-dir`, use that directory instead of `user-dbs`.

1. Stop the main server (`index.js`).
1. Back up `global.db`, `auth.db`, and `user-dbs` somewhere off the server.
1. Make sure no database was left mid-write.
   Opening each database with `sqlite3` rolls back any interrupted write, which a read-only server can't do.
   ```sh
   for f in global.db auth.db user-dbs/*.db; do sqlite3 "$f" "PRAGMA quick_check" | grep -qx ok || echo "problem: $f"; done
   ls user-dbs/*-journal global.db-journal auth.db-journal 2>/dev/null  # should print nothing
   ```
1. Make the data read-only:
   ```sh
   chmod -R a-w global.db auth.db user-dbs
   ```
1. Add the shutdown settings to `config.json` (all optional):

   | Key | Value |
   |-----|-------|
   | `export-extra-html` | HTML shown under the shutdown notice, such as a link to an announcement |
   | `export-listen-port` | Port to listen on. Defaults to `api-listen-port`. |
   | `global-db`, `auth-db` | Paths to the databases, if they aren't in the working directory |
   | `export-http-port` | With HTTPS, also listen on this port (usually 80) and redirect plain HTTP to HTTPS |
   | `acme-webroot` | With `export-http-port`, serve certbot's challenge files from this directory, so `certbot --webroot -w <dir>` can renew certificates while the server runs |

   The export server also uses `app-name`, `contact-email`, `cookie-secret`, `secure-cookie`, `cookie-domain`, `user-db-dir`, and the `https-*` keys, with the same meanings as before.
   It doesn't support `https-both-proto`; use `export-http-port` instead.
   If `auth.db` is missing, old login cookies and API tokens stop working but password logins still work.
1. Start the export server and keep it running, for example with systemd:
   ```ini
   [Unit]
   Description=TagTime Web data export
   After=network.target

   [Service]
   WorkingDirectory=/path/to/ttw/serv2
   ExecStart=/usr/bin/node export-server.js
   Restart=on-failure
   # The export server never writes, so the whole filesystem can be read-only for it
   ProtectSystem=strict
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```
1. Point both the frontend domain (`root-domain`) and the backend domain (`api-server`) at the export server, then take down the static frontend.
   The frontend domain matters: installed copies of the app check it for a new service worker.
   The export server serves one that deletes the app's caches and unregisters itself.
   Someone who opens an installed copy may see the old app once, and sees the shutdown page from then on.
1. Check that it works: log in, download each format, and open the old app URL.

Old app pages like `/app` redirect to the shutdown page.
Other old API endpoints return `410 Gone`.

Logins check old password hashes, which take about 500 MB of memory each.
The server checks one password at a time and turns logins away with a "server is busy" message when more than eight are waiting.

## Stopping the export server

If you eventually stop the export server, consider keeping the frontend domain, even if it only serves a static page.
If someone else registers it, browsers that still have the old app installed would run whatever service worker they serve.
