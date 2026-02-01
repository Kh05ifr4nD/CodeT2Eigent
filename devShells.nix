{ ... }:
{
  perSystem =
    { config, pkgs, ... }:
    {
      devShells.default = pkgs.mkShellNoCC {
        inputsFrom = with config; [
          flake-root.devShell
          pre-commit.devShell
          treefmt.build.devShell
        ];

        packages = with pkgs; [
          deno
          git
        ];
      };
    };
}
