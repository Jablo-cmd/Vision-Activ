import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Grain, TrendPoint } from "../lib/metrics";
import { formatDay } from "../lib/dates";
import { TableWrap, Td, Th } from "./ui";

function label(period: string, grain: Grain): string {
  if (grain === "month")
    return new Date(`${period}T00:00:00Z`).toLocaleString("en-GB", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  if (grain === "quarter" || grain === "halfYear") return `${period.slice(0, 7)}`;
  return formatDay(period);
}

export function TrendChart({
  points,
  grain,
  title,
}: {
  points: TrendPoint[];
  grain: Grain;
  title: string;
}) {
  const data = points.map((p) => ({ name: label(p.period, grain), score: p.score }));
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dde5f1" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#465470", fontSize: 12 }} tickLine={false} />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fill: "#465470", fontSize: 12 }}
              tickLine={false}
            />
            <Tooltip formatter={(v) => [Number(v).toFixed(2), "Score"]} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#17357a"
              strokeWidth={3}
              dot={{ r: 4, fill: "#17357a" }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">
          View the data as a table
        </summary>
        <div className="mt-2">
          <TableWrap label={`${title} data`}>
            <thead>
              <tr>
                <Th>Period starting</Th>
                <Th>Score</Th>
                <Th>Responses</Th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.period}>
                  <Td>{p.period}</Td>
                  <Td className="tabular-nums">{p.score?.toFixed(2)}</Td>
                  <Td className="tabular-nums">{p.responses}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </details>
    </figure>
  );
}
