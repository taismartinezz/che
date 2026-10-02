// Generates the PWA PNG icons with ImageMagick (`convert`). Run: npm run icons
import { execFileSync } from 'node:child_process';

const PURPLE = '#6D3FD1';
const jobs = [
  // [file, size, maskable/full-bleed]
  ['pwa-192.png', 192, false],
  ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

for (const [name, size, full] of jobs) {
  const s = 1024; // draw big, then downscale for smooth edges
  const shape = full ? ['-fill', PURPLE, '-draw', `rectangle 0,0 ${s},${s}`] : ['-fill', PURPLE, '-draw', `circle ${s / 2},${s / 2} ${s / 2},2`];
  execFileSync('convert', [
    '-size', `${s}x${s}`, 'xc:none', ...shape,
    '-fill', 'white', '-font', 'DejaVu-Sans-Bold', '-pointsize', String(full ? 300 : 360),
    '-gravity', 'center', '-annotate', '+0+10', 'che',
    '-resize', `${size}x${size}`, `public/${name}`,
  ]);
  console.log('wrote', name);
}
