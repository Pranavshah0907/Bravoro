interface DocsTableProps {
  headers: string[];
  rows: string[][];
}

export function DocsTable({ headers, rows }: DocsTableProps) {
  return (
    <div className="my-4 rounded-lg border border-[#1e4040] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#1a3535]">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold text-[#9ca3af]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#1e4040]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-[#d1d5db]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
