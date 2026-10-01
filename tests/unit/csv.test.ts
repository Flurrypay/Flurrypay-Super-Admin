import { describe, expect, it } from "vitest";

import type { DataColumn } from "@/components/data-table/types";
import { toCsv } from "@/components/export/csv";

interface Row {
  name: string;
  amount: string;
}

const columns: DataColumn<Row>[] = [
  { id: "name", header: "Name", cell: () => null, exportValue: (r) => r.name },
  { id: "amount", header: "Amount", cell: () => null, exportValue: (r) => r.amount },
  { id: "hidden", header: "Not exportable", cell: () => null },
];

describe("toCsv", () => {
  it("neutralises spreadsheet formulas but keeps negative amounts numeric", () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")', amount: "-500.25" }], columns);
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""x"")",-500.25`);
  });

  it("quotes commas and newlines and omits non-exportable columns", () => {
    expect(toCsv([{ name: "Ade, Bola\nline", amount: "1" }], columns)).toBe(
      'Name,Amount\r\n"Ade, Bola\nline",1',
    );
  });

  it("prefixes other formula triggers", () => {
    for (const trigger of ["+", "-x", "@SUM(A1)"]) {
      expect(
        toCsv([{ name: trigger, amount: "0" }], columns)
          .split("\r\n")[1]
          ?.startsWith("'"),
      ).toBe(true);
    }
  });
});
