{ ... }:
{
  perSystem =
    { config, ... }:
    {
      pre-commit = {
        check.enable = true;
        settings = {
          src = ./.;
          hooks = {
            check-merge-conflicts.enable = true;
            end-of-file-fixer.enable = true;
            treefmt = {
              enable = true;
              package = config.treefmt.build.wrapper;
              pass_filenames = false;
            };
            trim-trailing-whitespace.enable = true;
          };
        };
      };
    };
}
