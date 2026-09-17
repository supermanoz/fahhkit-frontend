/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import './MiniBarChart.css'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="mini-bar-tooltip">
      <span className="mini-bar-tooltip-label">{label}</span>
      <span className="mini-bar-tooltip-value">{payload[0].value}</span>
    </div>
  )
}

// Small recharts bar chart, styled to match the app's glass-card theme —
// used wherever the dashboard/report pages need a distribution the
// dependency-free DonutChart can't show (a breakdown across many buckets
// rather than a handful of proportions).
export default function MiniBarChart({
  data,
  color = 'var(--brand)',
  height = 220,
}) {
  return (
    <div className="mini-bar-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'var(--brand-light)' }}
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[6, 6, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
