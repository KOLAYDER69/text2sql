type ChartDataset = { label: string; data: number[] };
type ChartConfig = {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: ChartDataset[];
};

const COLORS = ["#3b82f6", "#34d399", "#fbbf24", "#a78bfa", "#f87171"];

export function buildQuickChartUrl(config: ChartConfig): string {
  const chartConfig: Record<string, unknown> = {
    type: config.type === "pie" ? "doughnut" : config.type,
    data: {
      labels: config.labels,
      datasets: config.datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor:
          config.type === "pie"
            ? COLORS.slice(0, ds.data.length)
            : COLORS[i % COLORS.length],
        borderColor:
          config.type === "line" ? COLORS[i % COLORS.length] : undefined,
        fill: config.type === "line" ? false : undefined,
        borderWidth: config.type === "line" ? 2 : 0,
      })),
    },
    options: {
      plugins: {
        legend: { labels: { color: "#333", font: { size: 13 } } },
      },
      scales:
        config.type === "pie"
          ? undefined
          : {
              x: { ticks: { color: "#555", font: { size: 11 } } },
              y: { ticks: { color: "#555", font: { size: 11 } } },
            },
    },
  };

  const json = JSON.stringify(chartConfig);
  return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&w=800&h=400&bkg=white`;
}
