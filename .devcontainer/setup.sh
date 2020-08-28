## update and install some things we should probably have
apt-get update
apt-get install -y \
  curl \
  git \
  gnupg2 \
  jq \
  sudo \
  zsh \
  vim \
  build-essential \
  openssl \
  libcurl4-openssl-dev \
  libelf-dev \
  libdw-dev \
  cmake \
  gcc \
  binutils-dev \
  libiberty-dev

## Install rustup and common components
curl https://sh.rustup.rs -sSf | sh -s -- -y
rustup install nightly
rustup component add rustfmt
rustup component add rustfmt --toolchain nightly
rustup component add clippy
rustup component add clippy --toolchain nightly

cargo install cargo-expand
cargo install cargo-edit
cargo install wasm-pack

cp config.example.json config.json
