# Configuring

There are two config files that you should create in order to run this, `config.json` and `config-private.json`.
`config.json` is used by the front-end, and both are used by the backend.
The complete contents of `config.json` are visible to anyone who can access the front-end, so make sure you don't add any private data in it (which will be the case if you follow this guide).
This guide will assume you are in the repo root.

1. In the repo root, create `config.json` with this content. You will be adding to it later. If you wish, you can change the `db-max-size` to allow for user databases larger than 40 MiB
  ```json
  {
      "api-server": "<publicly acessible path to backend>",
      "api-listen-port": 80,
      "root-domain": "<publicly acessible path to frontend>",
      "contact-email": "<public contact email>",
      "db-max-size": 41943040
  }
  ```
2. Generate some random text (either with your keyboard or a secure RNG), and create `config-private.json`:
  ```json
  {
      "cookie-secret": "<random text>"
  }
  ```
3. Run `node serv2/genVapidKeys.js`.
4. Take the first line of output (such as `"vapid-public": "BNvbIdpCwZ85...",`) and add it to `config.json`. Ensure each line except the last has a trailing comma.
  ```diff
-    "db-max-size": 41943040
+    "db-max-size": 41943040,
+    "vapid-public": "BNvbIdpCwZ85..."
  ```
5. Add the second line to `config-private.json`.
  ```diff
-    "cookie-secret": "<random text>"
+    "cookie-secret": "<random text>",
+    "vapid-private": "lvPFj0f8pYx0f..."
  ```
6. If the backend is only accessible over HTTPS, set `secure-cookie` to `true` in `config.json`.
7. (optional) If you want, you can store user databases in a custom location with the `user-db-dir` config key in `config-private.json`.
8. (optional) You can set `extra-footer-text` or `extra-homepage-text` to add extra text to the footer/homepage.
9. (optional) Add Beeminder support (see `beem.md`).

**Note:** If login/signup loads forever or takes a long time, then the randomness pool is running dry. Installing `rng-tools` should fix the issue on Linux by automatically topping up the randomness pool via `rngd`.

You're done!
