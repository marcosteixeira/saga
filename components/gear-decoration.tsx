"use client";

export function GearDecoration() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top-right cluster */}
      <svg
        className="gear-spin-animation absolute -right-16 -top-16 h-64 w-64 opacity-[0.06]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 80s linear infinite" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={16} toothDepth={14} />
      </svg>
      <svg
        className="gear-spin-animation absolute right-20 top-20 h-40 w-40 opacity-[0.04]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 60s linear infinite reverse" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={12} toothDepth={14} />
      </svg>

      {/* Bottom-left cluster */}
      <svg
        className="gear-spin-animation absolute -bottom-20 -left-20 h-72 w-72 opacity-[0.05]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 90s linear infinite" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={20} toothDepth={12} />
      </svg>
      <svg
        className="gear-spin-animation absolute bottom-16 left-32 h-36 w-36 opacity-[0.04]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 70s linear infinite reverse" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={10} toothDepth={16} />
      </svg>
    </div>
  );
}

function GearSVG({
  cx,
  cy,
  r,
  teeth,
  toothDepth,
}: {
  cx: number;
  cy: number;
  r: number;
  teeth: number;
  toothDepth: number;
}) {
  const innerR = r - toothDepth;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const angle1 = (i / teeth) * Math.PI * 2;
    const angle2 = ((i + 0.35) / teeth) * Math.PI * 2;
    const angle3 = ((i + 0.5) / teeth) * Math.PI * 2;
    const angle4 = ((i + 0.85) / teeth) * Math.PI * 2;
    // Round to 4 decimal places for deterministic SSR/client hydration
    const round = (n: number) => Math.round(n * 10000) / 10000;
    points.push(`${round(cx + r * Math.cos(angle1))},${round(cy + r * Math.sin(angle1))}`);
    points.push(`${round(cx + r * Math.cos(angle2))},${round(cy + r * Math.sin(angle2))}`);
    points.push(`${round(cx + innerR * Math.cos(angle3))},${round(cy + innerR * Math.sin(angle3))}`);
    points.push(`${round(cx + innerR * Math.cos(angle4))},${round(cy + innerR * Math.sin(angle4))}`);
  }

  const innerHubR = Math.round(innerR * 0.4 * 10000) / 10000;
  const axleR = Math.round(innerR * 0.15 * 10000) / 10000;

  return (
    <g fill="var(--gunmetal)" stroke="var(--ash)" strokeWidth="1">
      <polygon points={points.join(" ")} />
      <circle cx={cx} cy={cy} r={innerHubR} fill="var(--iron)" stroke="var(--ash)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={axleR} fill="var(--gunmetal)" />
    </g>
  );
}
