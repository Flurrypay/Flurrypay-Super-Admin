import { humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";

import { isSecretMetadataKey } from "./labels";

type State = Record<string, unknown> | null | undefined;

function display(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "empty";
  if (typeof value === "string") return value || "empty";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.length ? value.join(", ") : "none";
  }
  return JSON.stringify(value, null, 2);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Field-by-field comparison of the state an action recorded before and after it ran. */
export function AuditChanges({ before, after }: { before: State; after: State }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">No field values were recorded.</p>;
  }
  const changed = keys.filter((k) => !same(before?.[k], after?.[k]));
  const rows = [...changed, ...keys.filter((k) => !changed.includes(k))];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Recorded changes</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-medium">
              Field
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium">
              Before
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium">
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => {
            const isChanged = changed.includes(key);
            const secret = isSecretMetadataKey(key);
            return (
              <tr
                key={key}
                className={cn("border-t align-top", !isChanged && "text-muted-foreground")}
              >
                <th scope="row" className="px-2 py-1.5 font-medium">
                  {humanizeEnum(key)}
                  {isChanged && <span className="sr-only"> (changed)</span>}
                </th>
                {secret ? (
                  <td colSpan={2} className="px-2 py-1.5 text-muted-foreground">
                    Redacted
                  </td>
                ) : (
                  <>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono break-all whitespace-pre-wrap",
                        isChanged && "bg-destructive/5 line-through decoration-destructive/40",
                      )}
                    >
                      {display(before?.[key])}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono break-all whitespace-pre-wrap",
                        isChanged && "bg-success/10",
                      )}
                    >
                      {display(after?.[key])}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
