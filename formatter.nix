{ ... }:
{
  perSystem =
    { config, ... }:
    {
      formatter = config.treefmt.build.wrapper;
      treefmt.config = {
        inherit (config.flake-root) projectRootFile;
        programs = {
          actionlint.enable = true;
          deno.enable = true;
          nixfmt.enable = true;
          yamlfmt.enable = true;
        };
      };
    };
}
