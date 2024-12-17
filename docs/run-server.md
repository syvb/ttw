# Running a server

Want to run your own Retag server? This is the documentation file for you!

## Notes
- The server is designed to be constantly running
- The server has only been tested on GNU/Linux distributions
- You should occasionally run `uservacuum.sh` in `serv2` to optimize user databases for speed and size.

## Steps
1. Ensure you have `git`, `rustc`, `cargo`, `node`, `npm`, and `yarn` installed. (yes, *both* package managers are required)
    - `git` comes pre-installed with most distros
    - `rustc` and `cargo` can be installed with [`rustup`](https://rustup.rs/). Retag is tested against the Rust stable and beta. It should also work on nightly builds.
    - `node` and `npm` can usually be installed from your distro's package manager.
1. Install `wasm-pack` with `cargo install wasm-pack`
1. From the `web` folder, run `yarn`
1. In the `serv2` directory, run `yarn`.
1. [Setup the config file](/docs/config.md).
1. In `web`, run `yarn build` (or `yarn start` in dev)
1. Publish `/web/dist` as a static site
1. In the `serv2` directory, run `./run.sh` to start the server (or `./watch.sh` in dev). This will start a server listening on the specified port that will serve the backend.
