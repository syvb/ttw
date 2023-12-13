# based on https://github.com/srid/rust-nix-template/blob/master/flake.nix
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    systems.url = "github:nix-systems/default";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import inputs.systems;
      perSystem = { config, self', pkgs, lib, system, ... }:
        let
          cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
          nonRustDeps = [
            pkgs.libiconv
          ];
          rust-toolchain = pkgs.symlinkJoin {
            name = "rust-toolchain";
            paths = [ pkgs.rustc-wasm32 pkgs.rustc-wasm32.llvmPackages.lld pkgs.cargo pkgs.rustPlatform.rustcSrc ];
          };
        in
        {
          # Rust dev environment
          devShells.default = pkgs.mkShell {
            buildInputs = nonRustDeps;
            nativeBuildInputs = with pkgs; [
              rust-toolchain
              pkgs.wasm-pack


              pkgs.nodejs_20
              pkgs.python3 # for node-gyp
              pkgs.yarn
              pkgs.nodePackages.nodemon
            ];
            NODE_OPTIONS = "--openssl-legacy-provider";
            CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = "lld";
            RUST_BACKTRACE = 1;
          };
        };
    };
}
