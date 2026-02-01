{ pkgs }:
let
  inherit (pkgs)
    lib
    stdenv
    fetchzip
    makeWrapper
    nodejs
    git
    ;

  data = builtins.fromJSON (builtins.readFile ./hash.json);
  version = data.version;
  hash = data.hash;
in
stdenv.mkDerivation rec {
  pname = "skills";
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

    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/skills \
      --prefix PATH : ${lib.makeBinPath [ git ]} \
      --add-flags "$out/lib/$pname/bin/cli.mjs"

    makeWrapper ${nodejs}/bin/node $out/bin/add-skill \
      --prefix PATH : ${lib.makeBinPath [ git ]} \
      --add-flags "$out/lib/$pname/bin/cli.mjs"

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$(mktemp -d)"
    "$out/bin/skills" --version | head -n1 | grep -F "${version}"
    runHook postInstallCheck
  '';

  passthru.updateScript = ../../../lib/updater/main.ts;

  meta = with lib; {
    description = "The open agent skills ecosystem";
    homepage = "https://github.com/vercel-labs/skills";
    downloadPage = "https://www.npmjs.com/package/skills";
    license = licenses.mit;
    sourceProvenance = with sourceTypes; [ binaryBytecode ];
    platforms = platforms.all;
    mainProgram = "skills";
  };
}
