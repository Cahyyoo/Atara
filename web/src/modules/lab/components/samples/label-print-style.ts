/** Shared by every label print surface so a reprint matches the original sheet. */
export const LABEL_PAGE_STYLE = `
  @page { size: A4; margin: 12mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Without this the last row of a sheet gets sliced by the page break. */
    .print-label-grid > * { break-inside: avoid; page-break-inside: avoid; }
  }
`;
