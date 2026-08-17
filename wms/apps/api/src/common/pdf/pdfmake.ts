import pdfMake = require('pdfmake');
import { dirname, join } from 'node:path';

let isPdfMakeConfigured = false;

export function configurePdfMake() {
  if (isPdfMakeConfigured) {
    return;
  }

  const fontRoot = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

  // Русский комментарий: DejaVu Sans TTF содержит кириллицу и одинаково работает локально и на VPS.
  pdfMake.setFonts({
    DejaVuSans: {
      normal: join(fontRoot, 'DejaVuSans.ttf'),
      bold: join(fontRoot, 'DejaVuSans-Bold.ttf'),
      italics: join(fontRoot, 'DejaVuSans-Oblique.ttf'),
      bolditalics: join(fontRoot, 'DejaVuSans-BoldOblique.ttf'),
    },
  });
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy((filePath) => filePath.startsWith(fontRoot));
  isPdfMakeConfigured = true;
}
