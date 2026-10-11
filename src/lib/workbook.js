import * as XLSX from 'xlsx';
import { mapMetrics } from './mapping.js';

export function parseWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellNF: true });
  const sheetRows = Object.fromEntries(
    workbook.SheetNames.map((name) => [
      name,
      XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      }),
    ]),
  );
  return {
    sheetNames: workbook.SheetNames,
    sheetRows,
    metrics: mapMetrics(sheetRows),
  };
}
