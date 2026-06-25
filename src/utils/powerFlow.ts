import { Complex } from './complex';

export interface Bus {
  id: number;
  name: string;
  type: 'slack' | 'pv' | 'pq';
  v: number; // initial voltage magnitude (pu)
  theta: number; // initial angle (degrees)
  pGen: number; // active power gen (pu)
  qGen: number; // reactive power gen (pu)
  pLoad: number; // active power load (pu)
  qLoad: number; // reactive power load (pu)
  shuntG?: number; // shunt conductance (pu)
  shuntB?: number; // shunt susceptance (pu)
  qMin?: number; // min Q limit (pu)
  qMax?: number; // max Q limit (pu)
  customInitialV?: number;
  customInitialTheta?: number;
}

export interface Line {
  id: string;
  from: number; // bus id
  to: number; // bus id
  r: number; // resistance (pu)
  x: number; // reactance (pu)
  b: number; // total shunt susceptance (pu)
}

export interface Mismatch {
  busId: number;
  busName: string;
  type: 'P' | 'Q';
  specVal: number;
  calcVal: number;
  mismatch: number;
}

export interface JacobianDetail {
  matrix: number[][];
  rowLabels: string[];
  colLabels: string[];
}

export interface CorrectionDetail {
  label: string;
  value: number;
  busId: number;
  type: 'theta' | 'v';
}

export interface IterationDetail {
  iteration: number;
  busVoltages: {
    id: number;
    name: string;
    type: string;
    v: number;
    theta: number;
    vComplex: Complex;
  }[];
  pCalc: number[]; // 0-based bus index
  qCalc: number[]; // 0-based bus index
  pSpec: number[]; // 0-based bus index
  qSpec: number[]; // 0-based bus index
  mismatches: Mismatch[];
  jacobian: JacobianDetail;
  corrections: CorrectionDetail[];
  converged: boolean;
  maxMismatch: number;
}

export interface PowerFlowResult {
  busResults: {
    id: number;
    name: string;
    type: string;
    v: number;
    theta: number;
    pGen: number;
    qGen: number;
    pLoad: number;
    qLoad: number;
    pNet: number;
    qNet: number;
  }[];
  lineResults: {
    from: number;
    to: number;
    pFromTo: number;
    qFromTo: number;
    pToFrom: number;
    qToFrom: number;
    pLoss: number;
    qLoss: number;
  }[];
  totalGeneration: { p: number; q: number };
  totalLoad: { p: number; q: number };
  totalLosses: { p: number; q: number };
  yBus: Complex[][];
  iterations: IterationDetail[];
  converged: boolean;
  error?: string;
}

export function calculateYBus(buses: Bus[], lines: Line[]): Complex[][] {
  const N = buses.length;
  const Y: Complex[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => Complex.zero())
  );
  
  const idToIdx = new Map<number, number>();
  buses.forEach((b, idx) => {
    idToIdx.set(b.id, idx);
  });

  // 1. Process transmission lines
  for (const line of lines) {
    const idxFrom = idToIdx.get(line.from);
    const idxTo = idToIdx.get(line.to);
    
    if (idxFrom === undefined || idxTo === undefined) {
      console.warn(`Warning: Line ${line.id} references non-existent bus (from: ${line.from}, to: ${line.to}). Skipping.`);
      continue;
    }

    // Series impedance Z = R + jX
    const z = new Complex(line.r, line.x);
    if (z.mag() === 0) {
      console.warn(`Warning: Line ${line.id} has zero impedance (from: ${line.from}, to: ${line.to}). Skipping in Y-bus.`);
      continue; // avoid division by zero
    }
    
    // Series admittance y = 1 / Z
    const y = Complex.fromRect(1, 0).div(z);

    // Shunt charging susceptance: add jB/2 to both ends
    const yShunt = new Complex(0, line.b / 2);

    // Diagonal elements Y_ii
    Y[idxFrom][idxFrom] = Y[idxFrom][idxFrom].add(y).add(yShunt);
    Y[idxTo][idxTo] = Y[idxTo][idxTo].add(y).add(yShunt);

    // Off-diagonal elements Y_ij
    Y[idxFrom][idxTo] = Y[idxFrom][idxTo].sub(y);
    Y[idxTo][idxFrom] = Y[idxTo][idxFrom].sub(y);
  }

  // 2. Process bus-connected shunts (if any)
  buses.forEach((bus, idx) => {
    const gShunt = bus.shuntG || 0;
    const bShunt = bus.shuntB || 0;
    if (gShunt !== 0 || bShunt !== 0) {
      Y[idx][idx] = Y[idx][idx].add(new Complex(gShunt, bShunt));
    }
  });

  return Y;
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0) return [];
  
  // Augment matrix A with vector b
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    M.push([...A[i], b[i]]);
  }

  for (let i = 0; i < n; i++) {
    // Pivoting
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    const diag = M[i][i];
    if (Math.abs(diag) < 1e-12) {
      throw new Error("Jacobian matrix is singular or near-singular. The load flow failed to solve.");
    }

    for (let j = i; j <= n; j++) {
      M[i][j] /= diag;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }

  const x: number[] = [];
  for (let i = 0; i < n; i++) {
    x.push(M[i][n]);
  }
  return x;
}

export function runNewtonRaphson(
  originalBuses: Bus[],
  lines: Line[],
  tolerance = 0.001,
  maxIterations = 10,
  useFlatStart = true,
  enforceQLimits = false
): PowerFlowResult {
  const N = originalBuses.length;
  const yBus = calculateYBus(originalBuses, lines);

  // Initialize active variables
  const buses: Bus[] = originalBuses.map((b) => {
    let vInit = b.v;
    let thetaInit = b.theta;

    if (useFlatStart) {
      if (b.type === 'slack') {
        vInit = b.v; // slack voltage magnitude is fixed
        thetaInit = b.theta; // slack angle is fixed
      } else if (b.type === 'pv') {
        vInit = b.v; // PV voltage magnitude is fixed
        thetaInit = 0;
      } else {
        vInit = 1.0;
        thetaInit = 0;
      }
    } else {
      if (b.customInitialV !== undefined && b.type === 'pq') {
        vInit = b.customInitialV;
      }
      if (b.customInitialTheta !== undefined && b.type !== 'slack') {
        thetaInit = b.customInitialTheta;
      }
    }

    return {
      ...b,
      v: vInit,
      theta: thetaInit,
    };
  });

  const idToIdx = new Map<number, number>();
  buses.forEach((b, idx) => {
    idToIdx.set(b.id, idx);
  });

  const iterations: IterationDetail[] = [];
  let converged = false;
  let iter = 0;
  
  // Validate exactly one slack bus
  const slackBuses = buses.filter((b) => b.type === 'slack');
  if (slackBuses.length === 0) {
    throw new Error('No slack bus defined. Exactly one bus must be type Slack.');
  }
  if (slackBuses.length > 1) {
    throw new Error('Multiple slack buses found. Exactly one bus must be type Slack.');
  }

  // Track dynamic bus types if Q-limits are enforced
  const busTypes = buses.map((b) => b.type);

  while (iter < maxIterations && !converged) {
    // 1. Calculate active & reactive powers
    const pCalc = new Array(N).fill(0);
    const qCalc = new Array(N).fill(0);
    const pSpec = new Array(N).fill(0);
    const qSpec = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      const b_i = buses[i];
      pSpec[i] = b_i.pGen - b_i.pLoad;
      qSpec[i] = b_i.qGen - b_i.qLoad;

      const v_i = b_i.v;
      const theta_i = (b_i.theta * Math.PI) / 180;

      let pSum = 0;
      let qSum = 0;

      for (let j = 0; j < N; j++) {
        const b_j = buses[j];
        const v_j = b_j.v;
        const theta_j = (b_j.theta * Math.PI) / 180;

        const Y_ij = yBus[i][j];
        const G = Y_ij.re;
        const B = Y_ij.im;
        
        const diffTheta = theta_i - theta_j;

        pSum += v_j * (G * Math.cos(diffTheta) + B * Math.sin(diffTheta));
        qSum += v_j * (G * Math.sin(diffTheta) - B * Math.cos(diffTheta));
      }

      pCalc[i] = v_i * pSum;
      qCalc[i] = v_i * qSum;
    }

    // 2. Q-Limit Enforcement Check
    if (enforceQLimits) {
      for (let i = 0; i < N; i++) {
        if (busTypes[i] === 'pv') {
          const b_i = buses[i];
          // Q required to maintain voltage at PV bus is qCalc[i] + qLoad[i]
          const qGenRequired = qCalc[i] + b_i.qLoad;
          
          if (b_i.qMin !== undefined && qGenRequired < b_i.qMin) {
            // Violates QMin: convert to PQ, set QGen to QMin
            busTypes[i] = 'pq';
            b_i.qGen = b_i.qMin;
            // Now Q is specified, V magnitude is free to float
          } else if (b_i.qMax !== undefined && qGenRequired > b_i.qMax) {
            // Violates QMax: convert to PQ, set QGen to QMax
            busTypes[i] = 'pq';
            b_i.qGen = b_i.qMax;
          }
        }
      }
      
      // Re-calculate specs based on potentially updated PV-to-PQ types
      for (let i = 0; i < N; i++) {
        pSpec[i] = buses[i].pGen - buses[i].pLoad;
        qSpec[i] = buses[i].qGen - buses[i].qLoad;
      }
    }

    // 3. Construct Mismatches
    const mismatches: Mismatch[] = [];
    const activeAngles: number[] = []; // indices of buses for angle equations
    const activeVoltages: number[] = []; // indices of buses for voltage equations

    for (let i = 0; i < N; i++) {
      const type = busTypes[i];
      if (type !== 'slack') {
        activeAngles.push(i);
        mismatches.push({
          busId: buses[i].id,
          busName: buses[i].name,
          type: 'P',
          specVal: pSpec[i],
          calcVal: pCalc[i],
          mismatch: pSpec[i] - pCalc[i],
        });
      }
    }

    for (let i = 0; i < N; i++) {
      const type = busTypes[i];
      if (type === 'pq') {
        activeVoltages.push(i);
        mismatches.push({
          busId: buses[i].id,
          busName: buses[i].name,
          type: 'Q',
          specVal: qSpec[i],
          calcVal: qCalc[i],
          mismatch: qSpec[i] - qCalc[i],
        });
      }
    }

    // Check convergence
    let maxMismatch = 0;
    for (const m of mismatches) {
      if (Math.abs(m.mismatch) > maxMismatch) {
        maxMismatch = Math.abs(m.mismatch);
      }
    }

    if (maxMismatch < tolerance) {
      converged = true;

      // Record final iteration snapshot before breaking (pre-correction state)
      iterations.push({
        iteration: iter + 1,
        busVoltages: buses.map((b) => ({
          id: b.id,
          name: b.name,
          type: busTypes[idToIdx.get(b.id)!],
          v: b.v,
          theta: b.theta,
          vComplex: Complex.fromPolar(b.v, (b.theta * Math.PI) / 180),
        })),
        pCalc: [...pCalc],
        qCalc: [...qCalc],
        pSpec: [...pSpec],
        qSpec: [...qSpec],
        mismatches,
        jacobian: {
          matrix: [],
          rowLabels: [],
          colLabels: [],
        },
        corrections: [],
        converged,
        maxMismatch,
      });
      break;
    }

    // 4. Construct Jacobian Matrix
    // Size = activeAngles.length + activeVoltages.length
    const nAngles = activeAngles.length;
    const nVoltages = activeVoltages.length;
    const dim = nAngles + nVoltages;

    const J: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
    const rowLabels: string[] = [];
    const colLabels: string[] = [];

    // Create labels for documentation
    for (let r = 0; r < nAngles; r++) {
      rowLabels.push(`ΔP${buses[activeAngles[r]].id}`);
    }
    for (let r = 0; r < nVoltages; r++) {
      rowLabels.push(`ΔQ${buses[activeVoltages[r]].id}`);
    }
    for (let c = 0; c < nAngles; c++) {
      colLabels.push(`Δθ${buses[activeAngles[c]].id}`);
    }
    for (let c = 0; c < nVoltages; c++) {
      colLabels.push(`Δ|V|${buses[activeVoltages[c]].id}`);
    }

    // Populate J
    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        // Determine whether row is active Angle (P) or active Voltage (Q)
        const isRowP = r < nAngles;
        const rowBusIdx = isRowP ? activeAngles[r] : activeVoltages[r - nAngles];

        // Determine whether column is active Angle (theta) or active Voltage (V)
        const isColTheta = c < nAngles;
        const colBusIdx = isColTheta ? activeAngles[c] : activeVoltages[c - nAngles];

        const V_i = buses[rowBusIdx].v;
        const V_j = buses[colBusIdx].v;
        const theta_i = (buses[rowBusIdx].theta * Math.PI) / 180;
        const theta_j = (buses[colBusIdx].theta * Math.PI) / 180;
        const diffTheta = theta_i - theta_j;

        const Y_ij = yBus[rowBusIdx][colBusIdx];
        const G = Y_ij.re;
        const B = Y_ij.im;

        if (isRowP) {
          // Row: dP_i
          if (isColTheta) {
            // Col: dtheta_j
            if (rowBusIdx !== colBusIdx) {
              J[r][c] = V_i * V_j * (G * Math.sin(diffTheta) - B * Math.cos(diffTheta));
            } else {
              J[r][c] = -qCalc[rowBusIdx] - V_i * V_i * B;
            }
          } else {
            // Col: dV_j
            if (rowBusIdx !== colBusIdx) {
              J[r][c] = V_i * (G * Math.cos(diffTheta) + B * Math.sin(diffTheta));
            } else {
              J[r][c] = pCalc[rowBusIdx] / V_i + V_i * G;
            }
          }
        } else {
          // Row: dQ_i
          if (isColTheta) {
            // Col: dtheta_j
            if (rowBusIdx !== colBusIdx) {
              J[r][c] = -V_i * V_j * (G * Math.cos(diffTheta) + B * Math.sin(diffTheta));
            } else {
              J[r][c] = pCalc[rowBusIdx] - V_i * V_i * G;
            }
          } else {
            // Col: dV_j
            if (rowBusIdx !== colBusIdx) {
              J[r][c] = V_i * (G * Math.sin(diffTheta) - B * Math.cos(diffTheta));
            } else {
              J[r][c] = qCalc[rowBusIdx] / V_i - V_i * B;
            }
          }
        }
      }
    }

    // Solve for corrections: J * dx = mismatches
    const bVec = mismatches.map((m) => m.mismatch);
    let dx: number[] = [];
    let solverError = '';

    try {
      if (dim > 0) {
        dx = solveLinearSystem(J, bVec);
      }
    } catch (e: any) {
      solverError = e.message || 'Error solving linear equations.';
    }

    // Map corrections back
    const corrections: CorrectionDetail[] = [];
    // Capture bus voltages BEFORE voltage update (consistent with mismatches/Jacobian)
    let snapshotVoltages = buses.map((b) => ({
      id: b.id,
      name: b.name,
      type: busTypes[idToIdx.get(b.id)!],
      v: b.v,
      theta: b.theta,
      vComplex: Complex.fromPolar(b.v, (b.theta * Math.PI) / 180),
    }));

    if (!solverError && dim > 0) {
      for (let c = 0; c < nAngles; c++) {
        const busIdx = activeAngles[c];
        corrections.push({
          label: `Δθ${buses[busIdx].id}`,
          value: dx[c], // in radians
          busId: buses[busIdx].id,
          type: 'theta',
        });
      }
      for (let c = 0; c < nVoltages; c++) {
        const busIdx = activeVoltages[c];
        corrections.push({
          label: `Δ|V|${buses[busIdx].id}`,
          value: dx[nAngles + c],
          busId: buses[busIdx].id,
          type: 'v',
        });
      }

      // 5. Update Voltages and Angles
      for (const corr of corrections) {
        const idx = idToIdx.get(corr.busId)!;
        if (corr.type === 'theta') {
          // Update angle (convert correction from radians to degrees)
          buses[idx].theta += (corr.value * 180) / Math.PI;
        } else {
          // Update voltage magnitude
          buses[idx].v += corr.value;
        }
      }
    }

    // Record iteration snapshot (busVoltages captured before voltage update)
    iterations.push({
      iteration: iter + 1,
      busVoltages: snapshotVoltages,
      pCalc: [...pCalc],
      qCalc: [...qCalc],
      pSpec: [...pSpec],
      qSpec: [...qSpec],
      mismatches,
      jacobian: {
        matrix: J.map((row) => [...row]),
        rowLabels,
        colLabels,
      },
      corrections,
      converged,
      maxMismatch,
    });

    if (solverError) {
      return {
        busResults: [],
        lineResults: [],
        totalGeneration: { p: 0, q: 0 },
        totalLoad: { p: 0, q: 0 },
        totalLosses: { p: 0, q: 0 },
        yBus,
        iterations,
        converged: false,
        error: solverError,
      };
    }

    iter++;
  }

  // 6. Calculate Final Line Flows and Slack Bus/PV Bus Generation
  const busResults = buses.map((b, idx) => {
    const type = busTypes[idx];
    let pGen = b.pGen;
    let qGen = b.qGen;

    // Slack bus: P and Q are computed from net flow
    // PV bus: Q is computed from net flow (unless Q limits violated, which is already set)
    const pCalcFinal = iterations[iterations.length - 1].pCalc[idx];
    const qCalcFinal = iterations[iterations.length - 1].qCalc[idx];

    if (type === 'slack') {
      pGen = pCalcFinal + b.pLoad;
      qGen = qCalcFinal + b.qLoad;
    } else if (type === 'pv') {
      // If PV mode was active (not converted to PQ)
      qGen = qCalcFinal + b.qLoad;
    }

    return {
      id: b.id,
      name: b.name,
      type: originalBuses[idx].type === 'pv' && type === 'pq' ? 'PV (Q-Limited PQ)' : b.type.toUpperCase(),
      v: b.v,
      theta: b.theta,
      pGen,
      qGen,
      pLoad: b.pLoad,
      qLoad: b.qLoad,
      pNet: pGen - b.pLoad,
      qNet: qGen - b.qLoad,
    };
  });

  const lineResults: PowerFlowResult['lineResults'] = [];
  let totalPLosses = 0;
  let totalQLosses = 0;

  for (const line of lines) {
    const idxFrom = idToIdx.get(line.from);
    const idxTo = idToIdx.get(line.to);
    
    if (idxFrom === undefined || idxTo === undefined) continue;

    const V_i = Complex.fromPolar(buses[idxFrom].v, (buses[idxFrom].theta * Math.PI) / 180);
    const V_j = Complex.fromPolar(buses[idxTo].v, (buses[idxTo].theta * Math.PI) / 180);

    const Z_line = new Complex(line.r, line.x);
    if (Z_line.mag() === 0) {
      // Zero-impedance line: report zeros
      lineResults.push({
        from: line.from,
        to: line.to,
        pFromTo: 0,
        qFromTo: 0,
        pToFrom: 0,
        qToFrom: 0,
        pLoss: 0,
        qLoss: 0,
      });
      continue;
    }
    const Y_line = Complex.fromRect(1, 0).div(Z_line);
    const Y_shunt = new Complex(0, line.b / 2);

    // Current from i to j: I_ij = (V_i - V_j) * Y_line + V_i * Y_shunt
    const I_ij = V_i.sub(V_j).mul(Y_line).add(V_i.mul(Y_shunt));
    // S_ij = V_i * conj(I_ij)
    const S_ij = V_i.mul(I_ij.conj());

    // Current from j to i: I_ji = (V_j - V_i) * Y_line + V_j * Y_shunt
    const I_ji = V_j.sub(V_i).mul(Y_line).add(V_j.mul(Y_shunt));
    // S_ji = V_j * conj(I_ji)
    const S_ji = V_j.mul(I_ji.conj());

    const pFromTo = S_ij.re;
    const qFromTo = S_ij.im;

    const pToFrom = S_ji.re;
    const qToFrom = S_ji.im;

    // Loss = S_ij + S_ji
    const pLoss = pFromTo + pToFrom;
    const qLoss = qFromTo + qToFrom;

    totalPLosses += pLoss;
    totalQLosses += qLoss;

    lineResults.push({
      from: line.from,
      to: line.to,
      pFromTo,
      qFromTo,
      pToFrom,
      qToFrom,
      pLoss,
      qLoss,
    });
  }

  let totalPGen = 0;
  let totalQGen = 0;
  let totalPLoad = 0;
  let totalQLoad = 0;

  busResults.forEach((br) => {
    totalPGen += br.pGen;
    totalQGen += br.qGen;
    totalPLoad += br.pLoad;
    totalQLoad += br.qLoad;
  });

  return {
    busResults,
    lineResults,
    totalGeneration: { p: totalPGen, q: totalQGen },
    totalLoad: { p: totalPLoad, q: totalQLoad },
    totalLosses: { p: totalPLosses, q: totalQLosses },
    yBus,
    iterations,
    converged,
  };
}
