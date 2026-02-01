{ pkgs }:
let
  inherit (pkgs)
    lib
    stdenv
    fetchurl
    makeWrapper
    unzip
    fzf
    ripgrep
    autoPatchelfHook
    ;

  data = builtins.fromJSON (builtins.readFile ./hash.json);
  version = data.version;
  hashes = data.hashes;

  platformMap = {
    x86_64-linux = {
      asset = "opencode-linux-x64.tar.gz";
      isZip = false;
    };
    aarch64-linux = {
      asset = "opencode-linux-arm64.tar.gz";
      isZip = false;
    };
    x86_64-darwin = {
      asset = "opencode-darwin-x64.zip";
      isZip = true;
    };
    aarch64-darwin = {
      asset = "opencode-darwin-arm64.zip";
      isZip = true;
    };
  };

  platform = stdenv.hostPlatform.system;
  platformInfo = platformMap.${platform} or (throw "Unsupported system: ${platform}");
in
stdenv.mkDerivation rec {
  pname = "opencode";
  inherit version;

  src = fetchurl {
    url = "https://github.com/anomalyco/opencode/releases/download/v${version}/${platformInfo.asset}";
    hash = hashes.${platform};
  };

  nativeBuildInputs = [
    makeWrapper
  ]
  ++ lib.optionals platformInfo.isZip [ unzip ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    stdenv.cc.cc.lib
  ];

  dontConfigure = true;
  dontBuild = true;
  dontStrip = true;

  unpackPhase = ''
    runHook preUnpack
  ''
  + lib.optionalString platformInfo.isZip ''
    unzip $src
  ''
  + lib.optionalString (!platformInfo.isZip) ''
    tar -xzf $src
  ''
  + ''
    runHook postUnpack
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin
    install -m755 opencode $out/bin/opencode

    wrapProgram $out/bin/opencode \
      --prefix PATH : ${
        lib.makeBinPath [
          fzf
          ripgrep
        ]
      }

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    export HOME="$(mktemp -d)"
    "$out/bin/opencode" --version | head -n1 | grep -F "${version}"
    runHook postInstallCheck
  '';

  passthru.category = "OpenCode Ecosystem";
  passthru.updateScript = ../../../lib/updater/main.ts;

  meta = with lib; {
    description = "AI coding agent built for the terminal";
    longDescription = ''
      OpenCode is a terminal-based agent that can build anything.
      It provides an interactive AI coding experience directly in your terminal.
    '';
    homepage = "https://github.com/anomalyco/opencode";
    license = licenses.mit;
    sourceProvenance = with sourceTypes; [ binaryNativeCode ];
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
    mainProgram = "opencode";
  };
}
