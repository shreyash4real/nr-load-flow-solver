import React from 'react';
import type { Bus, PowerFlowResult } from '../utils/powerFlow';

interface PhasorDiagramProps {
  buses: Bus[];
  results: PowerFlowResult | null;
}

export const PhasorDiagram: React.FC<PhasorDiagramProps> = ({
  buses,
  results,
}) => {
  const width = 240;
  const height = 240;
  const cx = width / 2;
  const cy = height / 2;
  const scale = 80; // 1.0 pu voltage = 80 pixels radius

  // Circle radii to draw
  const gridRadii = [0.5, 1.0, 1.2];

  // Helper to convert polar to cartesian
  const getCoordinates = (r: number, thetaDeg: number) => {
    const thetaRad = (thetaDeg * Math.PI) / 180;
    return {
      x: cx + r * scale * Math.cos(thetaRad),
      // Negative because SVG y coordinates increase downwards
      y: cy - r * scale * Math.sin(thetaRad),
    };
  };

  const getBusColor = (type: string) => {
    if (type === 'slack') return '#fbbf24'; // Amber
    if (type.includes('PV') || type === 'pv') return '#34d399'; // Emerald
    return '#60a5fa'; // Blue
  };

  return (
    <div className="w-full flex flex-col items-center bg-[#0f1524] border border-[#14532d] rounded-lg p-4 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
      <h3 className="text-xs font-bold text-[#fbbf24] mb-2 font-mono uppercase tracking-wider">
        VOLTAGE PHASOR DIAGRAM (POLAR)
      </h3>
      <div className="relative w-[240px] h-[240px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Defs for vector arrow heads */}
          <defs>
            {buses.map((bus) => {
              const color = getBusColor(bus.type);
              return (
                <marker
                  key={`marker-${bus.id}`}
                  id={`phasor-arrow-${bus.id}`}
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={color} />
                </marker>
              );
            })}
          </defs>

          {/* Polar Grid: Circles */}
          {gridRadii.map((r) => (
            <g key={`grid-c-${r}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r * scale}
                className="phasor-grid-circle"
                stroke="rgba(34, 197, 94, 0.15)"
                strokeWidth="0.75"
                fill="none"
              />
              <text
                x={cx + r * scale + 2}
                y={cy - 2}
                fontSize="7"
                fill="#86efac"
                className="font-mono"
              >
                {r.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Polar Grid: Radial Axes (Every 30 degrees) */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angleDeg = i * 30;
            const outerPt = getCoordinates(1.3, angleDeg);
            return (
              <line
                key={`grid-a-${angleDeg}`}
                x1={cx}
                y1={cy}
                x2={outerPt.x}
                y2={outerPt.y}
                className="phasor-grid-axis"
                stroke="rgba(34, 197, 94, 0.1)"
              />
            );
          })}

          {/* Core horizontal/vertical axes */}
          <line x1={0} y1={cy} x2={width} y2={cy} stroke="rgba(34, 197, 94, 0.3)" strokeWidth="0.75" />
          <line x1={cx} y1={0} x2={cx} y2={height} stroke="rgba(34, 197, 94, 0.3)" strokeWidth="0.75" />

          {/* Axis labels */}
          <text x={width - 15} y={cy - 4} fontSize="8" fill="#86efac" className="font-mono text-right">0°</text>
          <text x={cx + 4} y={12} fontSize="8" fill="#86efac" className="font-mono">90°</text>
          <text x={5} y={cy - 4} fontSize="8" fill="#86efac" className="font-mono">180°</text>
          <text x={cx + 4} y={height - 5} fontSize="8" fill="#86efac" className="font-mono">270°</text>

          {/* Draw Voltage Vectors */}
          {buses.map((bus) => {
            // Retrieve computed values if available
            let v = bus.v;
            let theta = bus.theta;

            if (results) {
              const br = results.busResults.find((r) => r.id === bus.id);
              if (br) {
                v = br.v;
                theta = br.theta;
              }
            }

            const pt = getCoordinates(v, theta);
            const color = getBusColor(bus.type);

            return (
              <g key={`phasor-vector-${bus.id}`}>
                {/* Phasor Line */}
                <line
                  x1={cx}
                  y1={cy}
                  x2={pt.x}
                  y2={pt.y}
                  stroke={color}
                  strokeWidth="2.5"
                  markerEnd={`url(#phasor-arrow-${bus.id})`}
                />
                {/* Phasor Label */}
                <text
                  x={pt.x + (pt.x > cx ? 4 : -14)}
                  y={pt.y + (pt.y > cy ? 8 : -4)}
                  fontSize="9"
                  fontWeight="bold"
                  fill={color}
                  className="font-mono"
                >
                  V{bus.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-[9px] text-slate-500 font-mono mt-2 text-center">
        Vectors represent bus voltage magnitude & relative phase angle shift.
      </div>
    </div>
  );
};
