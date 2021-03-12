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
  libssl-dev \
  libcurl4-openssl-dev \
  libelf-dev \
  libdw-dev \
  cmake \
  gcc \
  binutils-dev \
  pkg-config \
  libiberty-dev

## install node
curl -fsSL https://deb.nodesource.com/setup_15.x | bash -
apt-get install -y nodejs

## install yarn
curl -fsSL https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt-get update
apt-get -y install yarn

## Install rustup and common components
curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"
rustup install nightly
rustup component add rustfmt
rustup component add rustfmt --toolchain nightly
rustup component add clippy
rustup component add clippy --toolchain nightly

cargo install cargo-expand
cargo install cargo-edit
cargo install wasm-pack

## Install nodemon
npm install nodemon -g

ls
echo $CWD
git clone https://github.com/Smittyvb/ttw.git
