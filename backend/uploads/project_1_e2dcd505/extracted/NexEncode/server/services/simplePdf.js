function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function buildSimpleInvoicePdf(invoice) {
  const lines = [
    { text: 'NexEncode', size: 24, x: 56, y: 780 },
    { text: 'PREMIUM INVOICE', size: 14, x: 56, y: 746 },
    { text: `Invoice: ${invoice.invoiceNumber}`, size: 11, x: 56, y: 714 },
    { text: `Date: ${invoice.date}`, size: 11, x: 56, y: 696 },
    { text: `Payment status: ${invoice.status}`, size: 11, x: 56, y: 678 },
    { text: 'BILLED TO', size: 11, x: 56, y: 630 },
    { text: invoice.username, size: 12, x: 56, y: 610 },
    { text: invoice.email, size: 11, x: 56, y: 592 },
    { text: 'DESCRIPTION', size: 10, x: 56, y: 528 },
    { text: 'AMOUNT', size: 10, x: 430, y: 528 },
    { text: 'NexEncode Premium subscription', size: 12, x: 56, y: 500 },
    { text: invoice.amount, size: 12, x: 430, y: 500 },
    { text: `Provider: ${invoice.provider}`, size: 10, x: 56, y: 470 },
    { text: `Payment reference: ${invoice.paymentReference || 'N/A'}`, size: 10, x: 56, y: 452 },
    { text: `TOTAL: ${invoice.amount}`, size: 15, x: 365, y: 398 },
    { text: 'Thank you for using NexEncode.', size: 11, x: 56, y: 320 },
    { text: 'Generated electronically. No signature is required.', size: 9, x: 56, y: 300 },
  ];

  const content = [
    '0.9 0.9 0.92 RG 56 544 m 540 544 l S',
    '0.9 0.9 0.92 RG 56 484 m 540 484 l S',
    ...lines.map((line) => `BT /F1 ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`),
  ].join('\n');

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>');
  objects.push(`<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'binary');
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

module.exports = { buildSimpleInvoicePdf };
