{
  description = "CodeT2Eigent";

  inputs = {
    flake-parts = {
      inputs.nixpkgs-lib.follows = "nixpkgs";
      url = "github:hercules-ci/flake-parts";
    };
    flake-root.url = "github:srid/flake-root";
    pre-commit-hooks = {
      inputs.nixpkgs.follows = "nixpkgs";
      url = "github:cachix/pre-commit-hooks.nix";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    treefmt-nix = {
      inputs.nixpkgs.follows = "nixpkgs";
      url = "github:numtide/treefmt-nix";
    };
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports =
        with inputs;
        [
          flake-root.flakeModule
          pre-commit-hooks.flakeModule
          treefmt-nix.flakeModule
        ]
        ++ [
          ./devShells.nix
          ./formatter.nix
          ./hook.nix
          ./nixpkgs.nix
        ];

      systems = import ./systems.nix;
    };
}
