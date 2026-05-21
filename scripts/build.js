const { spawnSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const config = require('../config.js');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function run(cmd, args) {
  const cmdStr = [cmd, ...args.map(a => `"${a}"`)].join(' ');
  const r = spawnSync(cmdStr, { encoding: 'utf8', shell: true });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr || r.stdout}`);
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });

  // 1. SCSS → CSS
  run('sass', [
    path.join(SRC, 'style.scss'),
    path.join(DIST, 'style.css'),
    '--style=compressed',
    '--no-source-map',
  ]);
  console.log('✓ CSS compiled  →  dist/style.css');

  // 2. JS バンドル
  run('esbuild', [
    path.join(SRC, 'script.js'),
    '--bundle',
    '--minify',
    `--outfile=${path.join(DIST, 'script.js')}`,
  ]);
  console.log('✓ JS bundled    →  dist/script.js');

  // 3. HTML 生成（%%CSS_URL%% / %%JS_URL%% を CDN URL に置換）
  if (config.githubUser === 'YOUR_GITHUB_USER') {
    console.warn('⚠  config.js の githubUser / githubRepo を設定してください');
    console.warn('   %%CSS_URL%% / %%JS_URL%% は未置換のまま出力します');
  }

  const cdnBase = `https://${config.githubUser}.github.io/${config.githubRepo}`;
  let html = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');
  html = html
    .replace('%%CSS_URL%%', `${cdnBase}/style.css`)
    .replace('%%JS_URL%%', `${cdnBase}/script.js`);
  fs.writeFileSync(path.join(DIST, 'template.html'), html);
  console.log('✓ HTML generated →  dist/template.html');

  // 4. LP フラグメントをコピー（src/lp/ → dist/lp/）
  const srcLp  = path.join(SRC, 'lp');
  const distLp = path.join(DIST, 'lp');
  if (fs.existsSync(srcLp)) {
    fs.mkdirSync(distLp, { recursive: true });
    for (const file of fs.readdirSync(srcLp)) {
      fs.copyFileSync(path.join(srcLp, file), path.join(distLp, file));
    }
    console.log('✓ LP copied     →  dist/lp/');
  }

  // 4b. 元素詳細ページをコピー（src/element-cube-details/ → dist/element-cube-details/）
  const srcDetails  = path.join(SRC, 'element-cube-details');
  const distDetails = path.join(DIST, 'element-cube-details');
  if (fs.existsSync(srcDetails)) {
    fs.mkdirSync(distDetails, { recursive: true });
    for (const file of fs.readdirSync(srcDetails)) {
      const srcFile = path.join(srcDetails, file);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(distDetails, file));
      }
    }
    console.log('✓ Details copied →  dist/element-cube-details/');
  }

  // 5. クリップボードへコピー（Windows のみ、CI はスキップ）
  if (process.env.CI) return;
  try {
    const proc = spawn(
      'powershell.exe',
      ['-Command', `[System.IO.File]::ReadAllText("${path.join(DIST, 'template.html')}", [System.Text.Encoding]::UTF8) | Set-Clipboard`],
      { stdio: 'inherit' }
    );
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✓ クリップボードにコピー済み → BASE 管理画面に Ctrl+V で貼り付け');
      } else {
        console.warn('⚠  クリップボードへのコピー失敗（dist/template.html を手動でコピーしてください）');
      }
    });
  } catch {
    console.warn('⚠  クリップボードへのコピー失敗（dist/template.html を手動でコピーしてください）');
  }
}

try { build(); } catch (err) { console.error(err.message); process.exit(1); }
