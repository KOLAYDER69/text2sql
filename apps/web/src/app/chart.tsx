"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type ChartDataset = { label: string; data: number[] };
type ChartConfig = {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: ChartDataset[];
};

const COLORS = ["#3b82f6", "#34d399", "#fbbf24", "#a78bfa", "#f87171"];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "rgba(17, 17, 17, 0.95)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
  },
  itemStyle: { color: "#fff" },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
};

export function QueryChart({ config }: { config: ChartConfig }) {
  // Transform to recharts format: [{label, val1, val2, ...}, ...]
  const data = config.labels.map((label, i) => {
    const point: Record<string, string | number> = { label };
    for (const ds of config.datasets) {
      point[ds.label] = ds.data[i] ?? 0;
    }
    return point;
  });

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden p-4">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {config.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <Tooltip {...tooltipStyle} />
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}
              />
              {config.datasets.map((ds, i) => (
                <Line
                  key={ds.label}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          ) : config.type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
              />
              <Tooltip {...tooltipStyle} />
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}
              />
              {config.datasets.map((ds, i) => (
                <Bar
                  key={ds.label}
                  dataKey={ds.label}
                  fill={COLORS[i % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                dataKey={config.datasets[0].label}
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                strokeWidth={0}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
