// Builds portable zips with @electron/packager.
// usage: node scripts/build.js [linux|win32|darwin|all]
const { packager } = require('@electron/packager');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const want = process.argv[2] || 'all';
const targets = [
  { platform: 'linux', arch: 'x64' },
  { platform: 'win32', arch: 'x64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' }
].filter((t) => want === 'all' || t.platform === want);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const t of targets) {
    console.log(`\n== ${t.platform}-${t.arch}`);
    const paths = await packager({
      dir: root,
      out,
      platform: t.platform,
      arch: t.arch,
      overwrite: true,
      asar: true,
      prune: true,
      ignore: [/^\/dist/, /^\/scripts/, /^\/PRD\.md/, /^\/\.git/, /^\/node_modules\/\.cache/],
      appCopyright: 'Apache-2.0',
      appBundleId: 'app.visualsnow.reliefkit',
      appCategoryType: 'public.app-category.utilities',
      win32metadata: { CompanyName: 'Visual Snow Relief Kit', FileDescription: 'Visual Snow Relief Kit', ProductName: 'Visual Snow Relief Kit' },
      extendInfo: { LSUIElement: true }
    });
    for (const p of paths) {
      // drop README and launcher into the folder
      fs.copyFileSync(path.join(root, 'README.md'), path.join(p, 'README.md'));
      if (t.platform === 'linux') fs.writeFileSync(path.join(p, 'run.sh'), '#!/bin/sh\ncd "$(dirname "$0")" && "./Visual Snow Relief Kit" "$@"\n', { mode: 0o755 });
      const zip = path.join(out, `VisualSnowReliefKit-${t.platform === 'win32' ? 'windows' : t.platform === 'darwin' ? 'macos' : 'linux'}-${t.arch}.zip`);
      if (fs.existsSync(zip)) fs.unlinkSync(zip);
      // zip with symlinks preserved (-y) so mac frameworks stay valid
      execSync(`cd "${path.dirname(p)}" && zip -qry "${zip}" "${path.basename(p)}"`, { stdio: 'inherit' });
      const mb = (fs.statSync(zip).size / 1e6).toFixed(1);
      console.log(`-> ${zip} (${mb} MB)`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
