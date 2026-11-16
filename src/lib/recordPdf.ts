/** Minimal standalone PDF: no browser print dialog, no external service or dependencies. */
export function recordPdf(lines: string[]): Blob {
  const printable = (s: string) => s.replace(/[^\x20-\xFF]/g, '?');
  const hex = (s: string) => [...s].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const wrapped = lines.flatMap(s => printable(s).match(/.{1,85}(?:\s|$)|.{1,85}/g) ?? ['']);
  const pages = Array.from({ length: Math.ceil(wrapped.length / 45) }, (_, n) => wrapped.slice(n * 45, (n + 1) * 45));
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids: string[] = [];
  for (const page of pages) {
    const pageId = objs.length + 1, streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const stream = 'BT /F1 11 Tf 40 800 Td 16 TL\n' + page.map(s => `<${hex(s)}> Tj T*`).join('\n') + '\nET';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objs.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
