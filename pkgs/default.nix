{ pkgs }:
let
  codex = import ./codex/codex { inherit pkgs; };
  opencode = import ./opencode/opencode { inherit pkgs; };
  ohMyOpencode = import ./opencode/oh-my-opencode { inherit pkgs; };
  skills = import ./skill/skills { inherit pkgs; };
in
{
  inherit codex;
  inherit opencode;
  inherit skills;
  default = opencode;
}
// {
  "oh-my-opencode" = ohMyOpencode;
}
