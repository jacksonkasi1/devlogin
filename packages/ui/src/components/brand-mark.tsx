import { useId } from "react"
import { cn } from "cn"

// Global Login logo; mirrors apps/extension/store/icon.svg. The globe lines
// only read at larger sizes, so small marks show just the keyhole.
export function BrandMark({
  className,
  globe = false,
}: {
  className?: string
  globe?: boolean
}) {
  const id = useId()
  return (
    <svg
      viewBox="16 16 96 96"
      className={cn("size-5 shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b6cff" />
          <stop offset="1" stopColor="#1238c9" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="96" height="96" rx="24" fill={`url(#${id}t)`} />
      {globe && (
        <g
          fill="none"
          stroke="#fff"
          strokeWidth="3.5"
          strokeOpacity=".38"
          strokeLinecap="round"
        >
          <circle cx="64" cy="64" r="32" />
          <ellipse cx="64" cy="64" rx="14" ry="32" />
          <path d="M33 53h62M33 75h62" />
        </g>
      )}
      <circle cx="64" cy="64" r={globe ? 21 : 28} fill="#fff" />
      <path
        d="M64 51.5a7 7 0 0 0-3.6 13l-2.4 10.5h12l-2.4-10.5a7 7 0 0 0-3.6-13z"
        fill="#1d47dc"
        transform={globe ? undefined : "translate(64 64) scale(1.3) translate(-64 -64)"}
      />
    </svg>
  )
}
