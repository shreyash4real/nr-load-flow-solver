/**
 * Solver Validation Script
 * Runs all 3 preloaded examples + edge cases through the NR solver.
 */
import { runNewtonRaphson } from './src/utils/powerFlow';
import { EXAMPLES } from './src/utils/examples';

const TOLERANCE = 1e-6;
const MAX_ITER = 20;

// ANSI colors
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';

let totalTests = 0, passed = 0, failed = 0;

function assert(label: string, ok: boolean, detail = '') {
  totalTests++;
  if (ok) { passed++; console.log(`  ${G}✅ ${label}${X}`); }
  else { failed++; console.log(`  ${R}❌ ${label}${detail ? ' — ' + detail : ''}${X}`); }
}

function check(label: string, value: number, min: number, max: number) {
  assert(`${label}: ${value.toFixed(5)} ∈ [${min}, ${max}]`, value >= min && value <= max);
}

function runTest(exampleName: string) {
  const example = EXAMPLES.find(e => e.name === exampleName)!;
  console.log(`\n${B}${C}${'═'.repeat(70)}${X}`);
  console.log(`${B}  TEST: ${example.name}${X}`);
  console.log(`${C}${'═'.repeat(70)}${X}`);

  const result = runNewtonRaphson(
    JSON.parse(JSON.stringify(example.buses)),
    JSON.parse(JSON.stringify(example.lines)),
    TOLERANCE, MAX_ITER, true, true
  );

  assert('Converged', result.converged);
  assert(`Iterations ≤ 10 (got ${result.iterations.length})`, result.iterations.length <= 10);

  // Last iteration's max mismatch
  const lastIter = result.iterations[result.iterations.length - 1];
  assert(`Max mismatch < tolerance (${lastIter.maxMismatch.toExponential(2)})`, lastIter.maxMismatch < TOLERANCE);

  // Bus Results Table
  console.log(`\n  ${B}Bus Results:${X}`);
  console.log(`  ${'─'.repeat(68)}`);
  console.log(`  ${'Bus'.padEnd(22)} ${'Type'.padEnd(14)} ${'|V| pu'.padStart(9)} ${'θ deg'.padStart(9)} ${'Pgen'.padStart(8)} ${'Qgen'.padStart(8)}`);
  console.log(`  ${'─'.repeat(68)}`);
  for (const b of result.busResults) {
    console.log(`  ${b.name.padEnd(22)} ${b.type.padEnd(14)} ${b.v.toFixed(5).padStart(9)} ${b.theta.toFixed(4).padStart(9)} ${b.pGen.toFixed(4).padStart(8)} ${b.qGen.toFixed(4).padStart(8)}`);
  }

  // Line Flows Table
  console.log(`\n  ${B}Line Flows:${X}`);
  console.log(`  ${'─'.repeat(68)}`);
  console.log(`  ${'From→To'.padEnd(10)} ${'P_ft'.padStart(10)} ${'Q_ft'.padStart(10)} ${'P_tf'.padStart(10)} ${'Q_tf'.padStart(10)} ${'Ploss'.padStart(10)}`);
  console.log(`  ${'─'.repeat(68)}`);
  for (const lf of result.lineResults) {
    console.log(`  ${(lf.from + '→' + lf.to).padEnd(10)} ${lf.pFromTo.toFixed(5).padStart(10)} ${lf.qFromTo.toFixed(5).padStart(10)} ${lf.pToFrom.toFixed(5).padStart(10)} ${lf.qToFrom.toFixed(5).padStart(10)} ${lf.pLoss.toFixed(5).padStart(10)}`);
  }
  console.log(`  ${Y}Total Losses: P = ${result.totalLosses.p.toFixed(5)} pu, Q = ${result.totalLosses.q.toFixed(5)} pu${X}`);

  // Power Balance
  const pBal = Math.abs(result.totalGeneration.p - result.totalLoad.p - result.totalLosses.p);
  const qBal = Math.abs(result.totalGeneration.q - result.totalLoad.q - result.totalLosses.q);
  console.log(`\n  ${B}Power Balance:${X}`);
  console.log(`  Pgen=${result.totalGeneration.p.toFixed(4)}  Pload=${result.totalLoad.p.toFixed(4)}  Ploss=${result.totalLosses.p.toFixed(4)}  Δ=${pBal.toExponential(2)}`);
  console.log(`  Qgen=${result.totalGeneration.q.toFixed(4)}  Qload=${result.totalLoad.q.toFixed(4)}  Qloss=${result.totalLosses.q.toFixed(4)}  Δ=${qBal.toExponential(2)}`);
  assert(`P balance error < 1e-4 (${pBal.toExponential(2)})`, pBal < 1e-4);
  assert(`Q balance error < 1e-4 (${qBal.toExponential(2)})`, qBal < 1e-4);

  return result;
}

function validateTextbook(result: any, name: string) {
  console.log(`\n  ${B}${Y}Textbook Checks:${X}`);

  const bus = (id: number) => result.busResults.find((b: any) => b.id === id);

  if (name === 'Simple 2-Bus System') {
    check('Bus 2 (Load) |V| in range', bus(2).v, 0.95, 1.05);
    check('Bus 2 (Load) θ < 0', bus(2).theta, -15, -0.001);
  }

  if (name.includes('Saadat')) {
    check('Bus 2 (PV) holds |V| ≈ 1.04', bus(2).v, 1.035, 1.045);
    check('Bus 3 (PQ) |V| under load', bus(3).v, 0.85, 1.05);
    check('Bus 3 θ < 0', bus(3).theta, -20, -0.001);
  }

  if (name.includes('Stagg')) {
    check('Bus 2 (PV) holds |V| ≈ 1.045', bus(2).v, 1.040, 1.050);
    check('Bus 3 |V| reasonable', bus(3).v, 0.95, 1.05);
    check('Bus 4 |V| reasonable', bus(4).v, 0.95, 1.05);
    check('Bus 5 |V| reasonable', bus(5).v, 0.95, 1.05);
    for (const id of [3, 4, 5]) {
      check(`Bus ${id} θ < 0`, bus(id).theta, -20, -0.001);
    }
  }
}

function testEdgeCases() {
  console.log(`\n${B}${C}${'═'.repeat(70)}${X}`);
  console.log(`${B}  EDGE CASE TESTS${X}`);
  console.log(`${C}${'═'.repeat(70)}${X}`);

  // No slack bus
  console.log(`\n  ${B}No slack bus:${X}`);
  try {
    runNewtonRaphson([{ id: 1, name: 'B1', type: 'pq', v: 1, theta: 0, pGen: 0, qGen: 0, pLoad: 0.5, qLoad: 0.2 }], [], 1e-6, 10, true, false);
    assert('Should throw', false);
  } catch (e: any) { assert(`Throws: "${e.message}"`, e.message.includes('No slack bus')); }

  // Multiple slack buses
  console.log(`\n  ${B}Multiple slack buses:${X}`);
  try {
    runNewtonRaphson(
      [{ id: 1, name: 'S1', type: 'slack', v: 1.05, theta: 0, pGen: 0, qGen: 0, pLoad: 0, qLoad: 0 },
       { id: 2, name: 'S2', type: 'slack', v: 1.02, theta: 0, pGen: 0, qGen: 0, pLoad: 0, qLoad: 0 }],
      [{ id: 'L1', from: 1, to: 2, r: 0.01, x: 0.1, b: 0 }],
      1e-6, 10, true, false);
    assert('Should throw', false);
  } catch (e: any) { assert(`Throws: "${e.message}"`, e.message.includes('Multiple slack')); }

  // Zero-impedance line
  console.log(`\n  ${B}Zero-impedance line:${X}`);
  try {
    const r = runNewtonRaphson(
      [{ id: 1, name: 'S', type: 'slack', v: 1.05, theta: 0, pGen: 0, qGen: 0, pLoad: 0, qLoad: 0 },
       { id: 2, name: 'L', type: 'pq', v: 1, theta: 0, pGen: 0, qGen: 0, pLoad: 0.5, qLoad: 0.2 }],
      [{ id: 'L1', from: 1, to: 2, r: 0.02, x: 0.08, b: 0 },
       { id: 'Lz', from: 1, to: 2, r: 0, x: 0, b: 0 }],
      1e-6, 10, true, false);
    assert('No crash, converged', r.converged);
    assert('Zero-impedance line has zero loss', r.lineResults.some((lf: any) => lf.pLoss === 0 && lf.qLoss === 0));
  } catch (e: any) { assert('No crash', false, e.message); }

  // Single slack bus, no lines
  console.log(`\n  ${B}Single slack bus, no lines:${X}`);
  try {
    const r = runNewtonRaphson(
      [{ id: 1, name: 'S', type: 'slack', v: 1.05, theta: 0, pGen: 0, qGen: 0, pLoad: 0, qLoad: 0 }],
      [], 1e-6, 10, true, false);
    assert('Converged', r.converged);
    assert('Pgen = 0 (no load)', Math.abs(r.busResults[0].pGen) < 1e-10);
  } catch (e: any) { assert('No crash', false, e.message); }

  // Convergence check: final voltages are NOT perturbed past convergence (Bug #1 fix)
  console.log(`\n  ${B}Bug #1 regression: NR stops at convergence, not one step past:${X}`);
  const ex = EXAMPLES[0];
  const r = runNewtonRaphson(JSON.parse(JSON.stringify(ex.buses)), JSON.parse(JSON.stringify(ex.lines)), 1e-6, 20, true, false);
  const lastIter = r.iterations[r.iterations.length - 1];
  assert('Last iteration is marked converged', lastIter.converged === true);
  assert('Last iteration has no corrections (stopped before Jacobian)', lastIter.corrections.length === 0);
}

// ====== Run ======
console.log(`${B}${C}`);
console.log(`  ╔══════════════════════════════════════════════════════════╗`);
console.log(`  ║   NEWTON-RAPHSON LOAD FLOW SOLVER — TEST SUITE         ║`);
console.log(`  ║   Tolerance: ${TOLERANCE}    Max Iterations: ${MAX_ITER}        ║`);
console.log(`  ╚══════════════════════════════════════════════════════════╝`);
console.log(`${X}`);

for (const ex of EXAMPLES) {
  const result = runTest(ex.name);
  if (result?.converged) validateTextbook(result, ex.name);
}

testEdgeCases();

console.log(`\n${B}${C}${'═'.repeat(70)}${X}`);
console.log(`${B}  RESULTS: ${passed}/${totalTests} passed, ${failed} failed${X}`);
if (failed === 0) console.log(`${G}${B}  🎉 ALL TESTS PASSED!${X}`);
else console.log(`${R}${B}  ⚠️  ${failed} TEST(S) FAILED${X}`);
console.log(`${C}${'═'.repeat(70)}${X}\n`);
