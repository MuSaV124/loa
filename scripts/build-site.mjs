import { access, readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const index = new URL('index.html', publicDir);
const brandAssets = ['site.css', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'share.png', 'site.webmanifest'];
await Promise.all(brandAssets.map(asset => access(new URL(`brand/${asset}`, publicDir))));

// The checked-in HTML uses relative URLs for local development. Build-time social metadata
// uses the deployed host so crawlers can resolve the image without running JavaScript.
if (process.env.VERCEL === '1') {
  const host = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL;
  if (host) {
    if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(host)) throw new Error('Invalid Vercel deployment host');
    const html = await readFile(index, 'utf8');
    await writeFile(index, html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]+("\s*\/>)/g,
      `$1https://${host}/brand/share.png$2`));
  }
}

console.log('XXAPICK static site is ready.');
