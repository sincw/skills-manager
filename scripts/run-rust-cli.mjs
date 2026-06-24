import { existsSync, readdirSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifestPath = 'cli/Cargo.toml';
const binName = `skills-manager-cli${process.platform === 'win32' ? '.exe' : ''}`;
const targetDir = process.env.CARGO_TARGET_DIR ?? join('cli', 'target');
const debugBinPath = join(targetDir, 'debug', binName);
const baseArgs = ['--manifest-path', manifestPath, '--bin', 'skills-manager-cli'];

function canRun(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function resolveCargo() {
  if (process.env.CARGO && existsSync(process.env.CARGO)) {
    return process.env.CARGO;
  }

  if (canRun('cargo')) {
    return 'cargo';
  }

  const rustupCheck = spawnSync('rustup', ['which', 'rustc'], { encoding: 'utf8' });
  if (rustupCheck.status === 0) {
    const rustcPath = rustupCheck.stdout.trim();
    if (rustcPath) {
      const cargoPath = join(dirname(rustcPath), 'cargo');
      if (existsSync(cargoPath)) {
        return cargoPath;
      }
    }
  }

  console.error('cargo not found. Install Rust or ensure cargo/rustup is on PATH.');
  process.exit(127);
}

const mode = process.argv[2];
const extraArgs = process.argv.slice(3);
const cargo = resolveCargo();

function newestMtimeMs(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;

  let newest = stat.mtimeMs;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'target') continue;
    newest = Math.max(newest, newestMtimeMs(join(path, entry.name)));
  }
  return newest;
}

function cliBinaryIsCurrent() {
  if (!existsSync(debugBinPath)) return false;
  const binaryMtime = statSync(debugBinPath).mtimeMs;
  const sourceMtime = Math.max(
    newestMtimeMs(manifestPath),
    newestMtimeMs('cli/Cargo.lock'),
    newestMtimeMs('cli/src'),
  );
  return binaryMtime >= sourceMtime;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${dirname(command)}${delimiter}${process.env.PATH ?? ''}`,
    },
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  return result.status ?? 1;
}

if (mode === 'cli') {
  if (!cliBinaryIsCurrent()) {
    const buildStatus = run(cargo, ['build', ...baseArgs]);
    if (buildStatus !== 0) process.exit(buildStatus);
  }
  process.exit(run(debugBinPath, extraArgs));
}

const cargoArgs =
  mode === 'build'
      ? ['build', ...baseArgs]
      : mode === 'install'
        ? ['install', '--path', 'cli', '--bin', 'skills-manager-cli', '--locked', '--force']
        : null;

if (!cargoArgs) {
  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}

process.exit(run(cargo, cargoArgs));
