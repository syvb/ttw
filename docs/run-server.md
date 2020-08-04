# Running a Retag server

Want to run your own Retag server? This is the documentation file for you!

## Notes
- The server is designed to be constantly running
- The server has only been tested on GNU/Linux distributions

## Steps
1. Ensure you have `git`, `rustc`, `cargo`, `node`, and `yarn` installed.
    - `git` comes pre-installed with most distros
    - `rustc` and `cargo` can be installed with [`rustup`](https://rustup.rs/). Retag is tested against the Rust stable and beta. It should also work on nightly builds.
    - `node` and `npm` can usually be installed from your distro's package manager.
2. From the `web` folder, run `yarn`
3. [Setup the config file](/docs/config.md).
4. In `web`, run `yarn build` (or `yarn watch` in dev)
5. Publish `/web/dist` as a static site
6. In the `serv2` directory, run `./run.sh` to start the server (or `./watch.sh` in dev). This will start a server listening on the specified port that will serve the backend. 
