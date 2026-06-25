import type { Bus, Line } from './powerFlow';

export interface ExampleSystem {
  name: string;
  description: string;
  buses: Bus[];
  lines: Line[];
  tolerance: number;
  maxIterations: number;
}

export const EXAMPLES: ExampleSystem[] = [
  {
    name: "Simple 2-Bus System",
    description: "Standard academic 2-bus system. One Slack bus and one PQ load bus connected by a transmission line.",
    tolerance: 0.001,
    maxIterations: 10,
    buses: [
      {
        id: 1,
        name: "Slack Bus",
        type: "slack",
        v: 1.05,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0,
        qLoad: 0,
      },
      {
        id: 2,
        name: "Load Bus",
        type: "pq",
        v: 1.0,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0.5,
        qLoad: 0.2,
      }
    ],
    lines: [
      {
        id: "L1-2",
        from: 1,
        to: 2,
        r: 0.02,
        x: 0.08,
        b: 0.0,
      }
    ]
  },
  {
    name: "Hadi Saadat 3-Bus System",
    description: "Standard 3-bus textbook case from Power System Analysis by Hadi Saadat. One Slack, one PV generator, and one PQ load.",
    tolerance: 0.0001,
    maxIterations: 10,
    buses: [
      {
        id: 1,
        name: "Bus 1 (Slack)",
        type: "slack",
        v: 1.05,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0,
        qLoad: 0,
      },
      {
        id: 2,
        name: "Bus 2 (PV Generator)",
        type: "pv",
        v: 1.04,
        theta: 0,
        pGen: 4.0,
        qGen: 0,
        pLoad: 0,
        qLoad: 0,
        qMin: 0.0,
        qMax: 5.0,
      },
      {
        id: 3,
        name: "Bus 3 (PQ Load)",
        type: "pq",
        v: 1.0,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 4.0,
        qLoad: 2.5,
      }
    ],
    lines: [
      {
        id: "L1-2",
        from: 1,
        to: 2,
        r: 0.02,
        x: 0.04,
        b: 0.0,
      },
      {
        id: "L1-3",
        from: 1,
        to: 3,
        r: 0.01,
        x: 0.03,
        b: 0.0,
      },
      {
        id: "L2-3",
        from: 2,
        to: 3,
        r: 0.0125,
        x: 0.025,
        b: 0.0,
      }
    ]
  },
  {
    name: "Stagg & El-Abiad 5-Bus System",
    description: "Classic 5-bus network with multiple PQ load buses and line charging susceptances (B).",
    tolerance: 0.0001,
    maxIterations: 12,
    buses: [
      {
        id: 1,
        name: "Bus 1 (Slack)",
        type: "slack",
        v: 1.06,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0,
        qLoad: 0,
      },
      {
        id: 2,
        name: "Bus 2 (PV Bus)",
        type: "pv",
        v: 1.045,
        theta: 0,
        pGen: 0.4,
        qGen: 0,
        pLoad: 0.2,
        qLoad: 0.1,
        qMin: -0.4,
        qMax: 1.2,
      },
      {
        id: 3,
        name: "Bus 3 (PQ Bus)",
        type: "pq",
        v: 1.0,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0.45,
        qLoad: 0.15,
      },
      {
        id: 4,
        name: "Bus 4 (PQ Bus)",
        type: "pq",
        v: 1.0,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0.4,
        qLoad: 0.05,
      },
      {
        id: 5,
        name: "Bus 5 (PQ Bus)",
        type: "pq",
        v: 1.0,
        theta: 0,
        pGen: 0,
        qGen: 0,
        pLoad: 0.6,
        qLoad: 0.1,
      }
    ],
    lines: [
      { id: "L1-2", from: 1, to: 2, r: 0.02, x: 0.06, b: 0.06 },
      { id: "L1-3", from: 1, to: 3, r: 0.08, x: 0.24, b: 0.05 },
      { id: "L2-3", from: 2, to: 3, r: 0.06, x: 0.25, b: 0.04 },
      { id: "L2-4", from: 2, to: 4, r: 0.06, x: 0.18, b: 0.04 },
      { id: "L2-5", from: 2, to: 5, r: 0.04, x: 0.12, b: 0.03 },
      { id: "L3-4", from: 3, to: 4, r: 0.01, x: 0.03, b: 0.02 },
      { id: "L4-5", from: 4, to: 5, r: 0.08, x: 0.24, b: 0.05 }
    ]
  }
];
