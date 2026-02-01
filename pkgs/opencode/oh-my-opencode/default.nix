{ pkgs }:
let
  inherit (pkgs)
    lib
    stdenv
    fetchzip
    makeWrapper
    bun
    ;

  data = builtins.fromJSON (builtins.readFile ./hash.json);
  version = data.version;
  hash = data.hash;
in
stdenv.mkDerivation rec {
  pname = "oh-my-opencode";
  inherit version;

  src = fetchzip {
    url = "https://registry.npmjs.org/${pname}/-/${pname}-${version}.tgz";
    inherit hash;
  };

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/$pname
    cp -r $src/* $out/lib/$pname/
    chmod -R u+w $out/lib/$pname

    # The bundled CLI embeds an outdated version string; patch it so `--version`
    # matches the derivation version.
    sed -i '0,/^    name: "oh-my-opencode",$/ { /^    name: "oh-my-opencode",$/ { n; s/^    version: "[^"]*"/    version: "'"$version"'"/; } }' \
      $out/lib/$pname/dist/cli/index.js

    mkdir -p $out/bin
    makeWrapper ${bun}/bin/bun $out/bin/oh-my-opencode \
      --add-flags "$out/lib/$pname/dist/cli/index.js"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$(mktemp -d)"
    "$out/bin/oh-my-opencode" --version | head -n1 | grep -F "${version}"
    runHook postInstallCheck
  '';

  passthru.updateScript = ../../../lib/updater/main.ts;

  meta = with lib; {
    description = "OpenCode plugin - custom agents (oracle, librarian) and enhanced features";
    homepage = "https://github.com/code-yeongyu/oh-my-opencode";
    license = licenses.unfree;
    sourceProvenance = with sourceTypes; [ fromSource ];
    mainProgram = "oh-my-opencode";
    platforms = [ "x86_64-linux" ];
  };
}
