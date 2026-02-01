{ inputs, ... }:
{
  perSystem =
    { system, ... }:
    let
      pkgs = import inputs.nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      listDirectories =
        path:
        builtins.sort builtins.lessThan (
          builtins.attrNames (pkgs.lib.filterAttrs (_name: type: type == "directory") (builtins.readDir path))
        );

      packageGroups = listDirectories ./pkgs;
      packagePairs = builtins.concatMap (
        group:
        let
          groupPath = ./pkgs + "/${group}";
          packageNames = listDirectories groupPath;
        in
        map (name: {
          inherit name;
          value = import (groupPath + "/${name}") { inherit pkgs; };
        }) packageNames
      ) packageGroups;
      packagesByName = builtins.listToAttrs packagePairs;
    in
    {
      _module.args.pkgs = pkgs;
      packages = packagesByName;
    };
}
