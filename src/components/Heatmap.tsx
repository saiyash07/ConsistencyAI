import type { ResponseInput, SimilarityMatrix } from "../../engine/types";

/** Accessible similarity matrix; colour is supplemented by the numeric value in every cell. */
export function Heatmap({ matrix, responses, caption }: { matrix: SimilarityMatrix; responses: ResponseInput[]; caption: string }) {
  const label = (id: string) => responses.find((r) => r.id === id)?.label ?? id;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th />
            {matrix.ids.map((id) => (
              <th key={id} scope="col" className="px-2 py-1 text-xs font-medium text-slate-600">{label(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.values.map((row, i) => (
            <tr key={matrix.ids[i]}>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left text-xs font-medium text-slate-600">{label(matrix.ids[i])}</th>
              {row.map((v, j) => (
                <td
                  key={j}
                  className="rounded-md px-2 py-2 text-center text-xs font-medium tabular-nums"
                  style={{ backgroundColor: `rgba(55,48,163,${(0.06 + v * 0.8).toFixed(2)})`, color: v > 0.45 ? "#fff" : "#1e1b4b" }}
                >
                  {v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
