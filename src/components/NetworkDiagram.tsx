import React from 'react';
import type { Bus, Line, PowerFlowResult } from '../utils/powerFlow';

interface NetworkDiagramProps {
  buses: Bus[];
  lines: Line[];
  results: PowerFlowResult | null;
}

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({
  buses,
  lines,
  results,
}) => {
  const N = buses.length;
  const width = 450;
  const height = 350;

  // Calculate coordinates for each bus
  const positions: { [id: number]: { x: number; y: number } } = {};
  
  if (N === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 italic bg-gray-50 border rounded-lg p-6">
        No buses to display. Add buses to view the diagram.
      </div>
    );
  }

  if (N === 1) {
    positions[buses[0].id] = { x: width / 2, y: height / 2 };
  } else if (N === 2) {
    positions[buses[0].id] = { x: 100, y: 175 };
    positions[buses[1].id] = { x: 350, y: 175 };
  } else if (N === 3) {
    // Equilateral triangle
    positions[buses[0].id] = { x: 225, y: 80 };
    positions[buses[1].id] = { x: 100, y: 260 };
    positions[buses[2].id] = { x: 350, y: 260 };
  } else {
    // Circular arrangement for 4+ buses
    const cx = width / 2;
    const cy = height / 2;
    const r = 110;
    buses.forEach((bus, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2;
      positions[bus.id] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
  }

  // Find power flow for a line from A to B
  const getLineFlow = (from: number, to: number) => {
    if (!results) return null;
    return results.lineResults.find(
      (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from)
    ) || null;
  };

  return (
    <div className="w-full flex flex-col items-center bg-[#0f1524] border border-[#14532d] rounded-lg p-4 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
      <h3 className="text-sm font-semibold text-[#fbbf24] mb-2 font-mono tracking-wider uppercase">
        SYSTEM NETWORK TOPOLOGY DIAGRAM
      </h3>
      <div className="relative w-full max-w-[450px] aspect-[450/350]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Definitions for arrow markers */}
          <defs>
            <marker
              id="arrow-forward"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
            </marker>
            <marker
              id="arrow-reverse"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 10 1 L 0 5 L 10 9 z" fill="#fbbf24" />
            </marker>
          </defs>

          {/* Grid lines for engineering feel */}
          <g stroke="rgba(34, 197, 94, 0.08)" strokeWidth="0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={`h-${i}`} x1="0" y1={(i + 1) * 35} x2={width} y2={(i + 1) * 35} />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`v-${i}`} x1={(i + 1) * 35} y1="0" x2={(i + 1) * 35} y2={height} />
            ))}
          </g>

          {/* Draw lines */}
          {lines.map((line) => {
            const posFrom = positions[line.from];
            const posTo = positions[line.to];
            if (!posFrom || !posTo) return null;

            const flow = getLineFlow(line.from, line.to);
            let pFlow = 0;
            let showArrow = false;
            let arrowDir: 'forward' | 'reverse' | null = null;

            if (flow) {
              // Determine direction based on sign of active power
              if (flow.from === line.from) {
                pFlow = flow.pFromTo;
              } else {
                pFlow = flow.pToFrom; // Flow from 'to' to 'from' relative to line definition
              }

              if (Math.abs(pFlow) > 0.005) {
                showArrow = true;
                arrowDir = pFlow > 0 ? 'forward' : 'reverse';
              }
            }

            // Line midpoint for label positioning
            const midX = (posFrom.x + posTo.x) / 2;
            const midY = (posFrom.y + posTo.y) / 2;

            return (
              <g key={line.id}>
                {/* Connection line */}
                <line
                  x1={posFrom.x}
                  y1={posFrom.y}
                  x2={posTo.x}
                  y2={posTo.y}
                  stroke={showArrow ? "#fbbf24" : "#14532d"}
                  strokeWidth="2.5"
                  className={showArrow ? (arrowDir === 'forward' ? 'active-flow-forward' : 'active-flow-reverse') : ''}
                  markerEnd={
                    showArrow && arrowDir === 'forward' ? 'url(#arrow-forward)' : undefined
                  }
                  markerStart={
                    showArrow && arrowDir === 'reverse' ? 'url(#arrow-reverse)' : undefined
                  }
                />
                
                {/* Flow label */}
                {results && (
                  <g>
                    <rect
                      x={midX - 35}
                      y={midY - 9}
                      width="70"
                      height="18"
                      rx="3"
                      fill="#080c14"
                      stroke="#fbbf24"
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#fbbf24"
                      className="font-mono"
                    >
                      P: {Math.abs(pFlow).toFixed(3)} pu
                    </text>
                  </g>
                )}

                {/* Impedance label (if space permits) */}
                {!results && (
                  <g>
                    <rect
                      x={midX - 45}
                      y={midY - 9}
                      width="90"
                      height="18"
                      rx="3"
                      fill="#080c14"
                      stroke="rgba(34, 197, 94, 0.4)"
                      strokeWidth="0.5"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#86efac"
                      className="font-mono"
                    >
                      Z: {line.r}+{line.x}j
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Draw buses */}
          {buses.map((bus) => {
            const pos = positions[bus.id];
            if (!pos) return null;

            // Highlight Slack vs PV vs PQ
            let busColor = '#64748b'; // Slack - Slate-500 (visible on dark bg)
            if (bus.type === 'pv') {
              busColor = '#0d9488'; // PV - Teal
            } else if (bus.type === 'pq') {
              busColor = '#2563eb'; // PQ - High-voltage blue
            }

            // Find voltage results
            let vDisplay = bus.v.toFixed(3);
            let thetaDisplay = bus.theta.toFixed(1);
            if (results) {
              const br = results.busResults.find((r) => r.id === bus.id);
              if (br) {
                vDisplay = br.v.toFixed(4);
                thetaDisplay = br.theta.toFixed(2);
              }
            }

            return (
              <g key={bus.id} transform={`translate(${pos.x}, ${pos.y})`}>
                {/* Thick Busbar Line representation inside SVG */}
                <line
                  x1="-25"
                  y1="0"
                  x2="25"
                  y2="0"
                  stroke={busColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                />

                {/* Info Box */}
                <rect
                  x="-35"
                  y="-40"
                  width="70"
                  height="32"
                  rx="4"
                  fill="#080c14"
                  stroke={busColor}
                  strokeWidth="1.5"
                  filter="drop-shadow(0 0 4px rgba(34, 197, 94, 0.1))"
                />

                {/* Bus label */}
                <text
                  x="0"
                  y="-28"
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="bold"
                  fill={busColor}
                  className="font-mono"
                >
                  Bus {bus.id} ({bus.type.toUpperCase()})
                </text>

                {/* Voltage Magnitude & Angle */}
                <text
                  x="0"
                  y="-18"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#86efac"
                  className="font-mono"
                >
                  {vDisplay}∠{thetaDisplay}°
                </text>

                {/* Active/Reactive load/gen indicators */}
                {results && (
                  <g transform="translate(0, 10)">
                    {/* Load indicator */}
                    {(bus.pLoad > 0 || bus.qLoad > 0) && (
                      <text
                        x="-10"
                        y="10"
                        textAnchor="end"
                        fontSize="8"
                        fill="#EF4444"
                        className="font-mono font-semibold"
                      >
                        L: {(bus.pLoad).toFixed(2)}
                      </text>
                    )}
                    {/* Gen indicator */}
                    {(bus.pGen > 0 || bus.qGen > 0 || bus.type === 'slack') && (
                      <text
                        x="10"
                        y="10"
                        textAnchor="start"
                        fontSize="8"
                        fill="#10B981"
                        className="font-mono font-semibold"
                      >
                        G: {results.busResults.find(r => r.id === bus.id)?.pGen.toFixed(2) || '0.00'}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-[#64748b] inline-block rounded"></span>
          Slack Bus
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-[#0d9488] inline-block rounded"></span>
          PV Bus
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-[#2563eb] inline-block rounded"></span>
          PQ Bus
        </div>
      </div>
    </div>
  );
};
