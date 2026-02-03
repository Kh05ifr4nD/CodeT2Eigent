{ pkgs }:
let
  inherit (pkgs)
    lib
    stdenv
    fetchFromGitHub
    installShellFiles
    rustPlatform
    pkg-config
    openssl
    versionCheckHook
    ;

  installShellCompletions = stdenv.buildPlatform.canExecute stdenv.hostPlatform;

  data = builtins.fromJSON (builtins.readFile ./hash.json);
  version = data.version;
  hash = data.hash;

  src = fetchFromGitHub {
    owner = "openai";
    repo = "codex";
    tag = "rust-v${version}";
    inherit hash;
  };
in
rustPlatform.buildRustPackage {
  pname = "codex";
  inherit version src;

  cargoLock = {
    lockFile = "${src}/codex-rs/Cargo.lock";
    outputHashes = data.outputHashes or { };
  };

  sourceRoot = "source/codex-rs";

  cargoBuildFlags = [
    "--package"
    "codex-cli"
  ];

  nativeBuildInputs = [
    installShellFiles
    pkg-config
  ];

  buildInputs = [ openssl ];

  preBuild = ''
    # Remove LTO to speed up builds
    substituteInPlace Cargo.toml \
      --replace-fail 'lto = "fat"' 'lto = false'
  '';

  doCheck = false;

  postInstall = lib.optionalString installShellCompletions ''
    installShellCompletion --cmd codex \
      --bash <($out/bin/codex completion bash) \
      --fish <($out/bin/codex completion fish) \
      --zsh <($out/bin/codex completion zsh)
  '';

  doInstallCheck = true;
  nativeInstallCheckInputs = [ versionCheckHook ];

  passthru.updateScript = ../../../lib/updater/main.ts;

  meta = with lib; {
    description = "OpenAI Codex CLI - a coding agent that runs locally on your computer";
    homepage = "https://github.com/openai/codex";
    changelog = "https://github.com/openai/codex/releases/tag/rust-v${version}";
    license = licenses.asl20;
    sourceProvenance = with sourceTypes; [ fromSource ];
    mainProgram = "codex";
    platforms = platforms.unix;
  };
}
