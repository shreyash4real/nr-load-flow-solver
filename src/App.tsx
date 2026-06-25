import { useState, useEffect, useMemo } from 'react';
import { runNewtonRaphson, calculateYBus } from './utils/powerFlow';
import type { Bus, Line, PowerFlowResult } from './utils/powerFlow';
import { EXAMPLES } from './utils/examples';
import type { ExampleSystem } from './utils/examples';
import { NetworkDiagram } from './components/NetworkDiagram';
import { PhasorDiagram } from './components/PhasorDiagram';
import { Plus, Trash2, Play, FileText, CheckCircle, RefreshCw } from 'lucide-react';

function App() {
  // State for network parameters
  const [buses, setBuses] = useState<Bus[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  
  // Solver Options
  const [tolerance, setTolerance] = useState<number>(0.001);
  const [maxIterations, setMaxIterations] = useState<number>(10);
  const [useFlatStart, setUseFlatStart] = useState<boolean>(true);
  const [enforceQLimits, setEnforceQLimits] = useState<boolean>(false);

  // Example Selection State
  const [selectedExample, setSelectedExample] = useState<string>('Hadi Saadat 3-Bus System');

  // Solution Results
  const [results, setResults] = useState<PowerFlowResult | null>(null);
  
  // UI States
  const [activeTab, setActiveTab] = useState<'inputs' | 'diagram' | 'ybus' | 'iterations' | 'results'>('inputs');
  const [selectedIteration, setSelectedIteration] = useState<number>(1);
  const [validationError, setValidationError] = useState<string>('');

  // Memoized Y-bus calculation
  const yBus = useMemo(() => calculateYBus(buses, lines), [buses, lines]);

  // Load example system on initial mount or when example changes
  useEffect(() => {
    const example = EXAMPLES.find((ex) => ex.name === selectedExample);
    if (example) {
      loadSystem(example);
    }
  }, [selectedExample]);

  const loadSystem = (sys: ExampleSystem) => {
    setBuses(JSON.parse(JSON.stringify(sys.buses)));
    setLines(JSON.parse(JSON.stringify(sys.lines)));
    setTolerance(sys.tolerance);
    setMaxIterations(sys.maxIterations);
    setResults(null);
    setValidationError('');
    setActiveTab('inputs');
  };

  // Run Solver
  const handleSolve = () => {
    setValidationError('');
    
    // Validations
    if (buses.length === 0) {
      setValidationError('Cannot run load flow: No buses defined.');
      return;
    }
    const slackCount = buses.filter(b => b.type === 'slack').length;
    if (slackCount !== 1) {
      setValidationError(`Cannot run load flow: Must have exactly 1 Slack Bus. Current count: ${slackCount}`);
      return;
    }

    // Ensure all line connections point to valid buses
    const busIds = buses.map(b => b.id);
    for (const line of lines) {
      if (!busIds.includes(line.from) || !busIds.includes(line.to)) {
        setValidationError(`Line ${line.id} connects to a non-existent Bus ID (from Bus ${line.from} to Bus ${line.to}).`);
        return;
      }
    }

    try {
      const res = runNewtonRaphson(
        buses,
        lines,
        tolerance,
        maxIterations,
        useFlatStart,
        enforceQLimits
      );
      setResults(res);
      setSelectedIteration(1);
      
      if (res.error) {
        setValidationError(res.error);
        setActiveTab('iterations'); 
      } else if (!res.converged) {
        setValidationError(`Solver finished but failed to converge within ${maxIterations} iterations.`);
        setActiveTab('iterations');
      } else {
        setActiveTab('results');
      }
    } catch (e: any) {
      setValidationError(e.message || 'An error occurred during calculations.');
    }
  };

  // Handlers for Bus Table
  const handleBusChange = (id: number, field: keyof Bus, value: any) => {
    setResults(null);
    setBuses((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          const updated = { ...b, [field]: value };
          if (field === 'type') {
            if (value === 'pq') {
              delete updated.qMin;
              delete updated.qMax;
            } else if (value === 'pv') {
              updated.qMin = 0.0;
              updated.qMax = 2.0;
            }
          }
          return updated;
        }
        return b;
      })
    );
  };

  const addBus = () => {
    setResults(null);
    setBuses(prev => {
      const nextId = prev.length > 0 ? Math.max(...prev.map(b => b.id)) + 1 : 1;
      const newBus: Bus = {
        id: nextId,
        name: `Bus ${nextId}`,
        type: 'pq',
        v: 1.0,
        theta: 0.0,
        pGen: 0.0,
        qGen: 0.0,
        pLoad: 0.0,
        qLoad: 0.0,
      };
      return [...prev, newBus];
    });
  };

  const removeBus = (id: number) => {
    setResults(null);
    setBuses(prev => prev.filter((b) => b.id !== id));
    setLines(prev => prev.filter((l) => l.from !== id && l.to !== id));
  };

  // Handlers for Line Table
  const handleLineChange = (id: string, field: keyof Line, value: any) => {
    setResults(null);
    setLines((prev) => {
      // BUG 7: Prevent duplicate line IDs
      if (field === 'id') {
        if (prev.some((l) => l.id !== id && l.id === value)) return prev;
      }
      // BUG 9: Prevent self-loops
      if (field === 'from' || field === 'to') {
        const target = prev.find((l) => l.id === id);
        if (target) {
          const updated = { ...target, [field]: value };
          if (updated.from === updated.to) return prev;
        }
      }
      return prev.map((l) => (l.id === id ? { ...l, [field]: value } : l));
    });
  };

  const addLine = () => {
    setResults(null);
    if (buses.length < 2) {
      setValidationError('Add at least 2 buses before adding a transmission line.');
      return;
    }
    setLines(prev => {
      const nextNum = Math.max(...prev.map(l => parseInt(l.id.replace('L-',''))||0), 0) + 1;
      const newLine: Line = {
        id: `L-${nextNum}`,
        from: buses[0].id,
        to: buses[1].id,
        r: 0.05,
        x: 0.1,
        b: 0.0,
      };
      return [...prev, newLine];
    });
  };

  const removeLine = (id: string) => {
    setResults(null);
    setLines(prev => prev.filter((l) => l.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Phosphor Grid Title Header */}
      <header className="border-b border-[#22c55e] bg-[#0f1524] py-6 px-8 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#fbbf24]" />
              <h1 className="text-xl font-bold text-[#fbbf24] textbook-title glow-amber">
                CRITICAL MONITOR: POWER FLOW SOLVER
              </h1>
            </div>
            <p className="text-[10px] text-[#4ade80] font-mono tracking-widest uppercase mt-1 glow-text">
              System Dispatch Node: Newton-Raphson Solver Terminal
            </p>
          </div>
          
          {/* Examples Selector */}
          <div className="flex items-center gap-2 bg-[#080c14] border border-[#14532d] p-2 rounded">
            <span className="text-[9px] font-mono font-bold text-[#86efac] uppercase">Select SCADA Case:</span>
            <select
              value={selectedExample}
              onChange={(e) => setSelectedExample(e.target.value)}
              className="bg-[#0f1524] border border-[#14532d] rounded px-2 py-1 text-xs font-mono text-[#4ade80] focus:outline-none"
            >
              {EXAMPLES.map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const ex = EXAMPLES.find((e) => e.name === selectedExample);
                if (ex) loadSystem(ex);
              }}
              title="Reset System Database"
              className="p-1 hover:bg-[#14532d] rounded text-[#4ade80] transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Solver Constants Sheet */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
            <h3 className="text-xs font-bold text-[#fbbf24] tracking-wider uppercase font-mono border-b border-[#22c55e] pb-2 mb-4 glow-amber">
              I. Dispatch Setup
            </h3>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[#86efac] mb-1 font-mono uppercase">
                  Error Threshold (ε)
                </label>
                <input
                  type="number"
                  step="any"
                  value={tolerance}
                  onChange={(e) => { setResults(null); setTolerance(parseFloat(e.target.value) || 0.001); }}
                  className="drafting-input"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#86efac] mb-1 font-mono uppercase">
                  Iteration Limit
                </label>
                <input
                  type="number"
                  value={maxIterations}
                  onChange={(e) => { setResults(null); setMaxIterations(parseInt(e.target.value) || 10); }}
                  className="drafting-input"
                />
              </div>

              {/* Startup Guess Type */}
              <div className="border-t border-[#14532d] pt-3 flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#86efac] font-mono uppercase">Start Guess</label>
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="flex items-center gap-2 text-xs font-mono text-[#86efac] cursor-pointer">
                    <input
                      type="radio"
                      checked={useFlatStart}
                      onChange={() => { setResults(null); setUseFlatStart(true); }}
                      className="border-[#14532d] bg-[#080c14] text-[#fbbf24] focus:ring-transparent"
                    />
                    Flat (1.0 ∠ 0°)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-mono text-[#86efac] cursor-pointer">
                    <input
                      type="radio"
                      checked={!useFlatStart}
                      onChange={() => { setResults(null); setUseFlatStart(false); }}
                      className="border-[#14532d] bg-[#080c14] text-[#fbbf24] focus:ring-transparent"
                    />
                    Custom States
                  </label>
                </div>
              </div>

              {/* Q constraints limits */}
              <div className="border-t border-[#14532d] pt-3">
                <label className="flex items-center gap-2 text-xs font-mono text-[#86efac] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforceQLimits}
                    onChange={(e) => { setResults(null); setEnforceQLimits(e.target.checked); }}
                    className="border-[#14532d] bg-[#080c14] text-[#fbbf24] focus:ring-transparent"
                  />
                  Enforce PV Q-Limits
                </label>
              </div>
            </div>

            {/* Run calculation button */}
            <button
              onClick={handleSolve}
              className="mt-6 w-full flex items-center justify-center gap-2 py-2 px-4 border border-[#22c55e] rounded bg-[#166534] hover:bg-[#15803d] text-[#4ade80] text-xs font-bold font-mono transition shadow-[0_0_8px_rgba(34,197,94,0.3)] hover:text-white"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              SOLVE GRID FLOWS
            </button>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="bg-[#1c1015] border border-[#f43f5e] rounded p-4 text-xs font-mono text-[#f43f5e]">
              <div className="font-bold uppercase tracking-wider mb-1">SYSTEM ALERT:</div>
              {validationError}
            </div>
          )}

          {results?.converged && (
            <div className="bg-[#061c14] border border-[#34d399] rounded p-4 text-xs font-mono text-[#34d399] flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-[#34d399] shrink-0" />
              <div>
                <div className="font-bold uppercase tracking-wider">FLOW SOLVED!</div>
                Converged in {results.iterations.length} steps.
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Tabbed Sheets */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Engineering Tab Headers */}
          <div className="border-b border-[#14532d] flex overflow-x-auto bg-[#0f1524] rounded-t-lg border-x border-t">
            <button
              onClick={() => setActiveTab('inputs')}
              className={`drafting-tab ${activeTab === 'inputs' ? 'active' : ''}`}
            >
              [I] NODE DATABASE
            </button>
            <button
              onClick={() => setActiveTab('diagram')}
              className={`drafting-tab ${activeTab === 'diagram' ? 'active' : ''}`}
            >
              [II] CONSOLE MAP
            </button>
            <button
              onClick={() => setActiveTab('ybus')}
              className={`drafting-tab ${activeTab === 'ybus' ? 'active' : ''}`}
            >
              [III] ADMITTANCE [Y]
            </button>
            <button
              onClick={() => setActiveTab('iterations')}
              className={`drafting-tab ${activeTab === 'iterations' ? 'active' : ''}`}
            >
              [IV] MATH LOG
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`drafting-tab ${activeTab === 'results' ? 'active' : ''} ${!results ? 'opacity-40 cursor-not-allowed' : ''}`}
              disabled={!results}
            >
              [V] POWER FLOWS
            </button>
          </div>

          {/* Tab 1: Database Inputs */}
          {activeTab === 'inputs' && (
            <div className="flex flex-col gap-6">
              {/* Buses Sheet */}
              <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
                <div className="flex justify-between items-center border-b border-[#14532d] pb-3 mb-4">
                  <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase glow-amber">
                    1. Grid Bus Specifications
                  </h3>
                  <button
                    onClick={addBus}
                    className="flex items-center gap-1 text-[10px] font-mono font-bold py-1 px-3 border border-[#22c55e] rounded hover:bg-[#14532d] text-[#4ade80] transition"
                  >
                    <Plus className="w-3 h-3" />
                    ADD NODE
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="logbook-table">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">ID</th>
                        <th className="w-28 text-left">BUS NAME</th>
                        <th className="w-24 text-left">BUS TYPE</th>
                        <th className="text-right">V_spec (PU)</th>
                        <th className="text-right">θ_spec (DEG)</th>
                        <th className="text-right">P_gen (PU)</th>
                        <th className="text-right">Q_gen (PU)</th>
                        <th className="text-right">P_load (PU)</th>
                        <th className="text-right">Q_load (PU)</th>
                        <th className="w-32 text-center">Q LIMITS</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {buses.map((bus) => (
                        <tr key={bus.id}>
                          <td className="text-center font-mono font-bold text-xs text-[#fbbf24]">{bus.id}</td>
                          <td>
                            <input
                              type="text"
                              value={bus.name}
                              onChange={(e) => handleBusChange(bus.id, 'name', e.target.value)}
                              className="drafting-input text-left"
                            />
                          </td>
                          <td>
                            <select
                              value={bus.type}
                              onChange={(e) => handleBusChange(bus.id, 'type', e.target.value as any)}
                              className="drafting-input text-left"
                            >
                              <option value="slack">Slack</option>
                              <option value="pv">PV (Gen)</option>
                              <option value="pq">PQ (Load)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.type === 'slack' || bus.type === 'pv' ? bus.v : (useFlatStart ? 1.0 : bus.customInitialV ?? 1.0)}
                              disabled={bus.type === 'pq' && useFlatStart}
                              onChange={(e) => {
                                const val = Math.max(0.01, parseFloat(e.target.value) || 1.0);
                                if (bus.type === 'slack' || bus.type === 'pv') {
                                  handleBusChange(bus.id, 'v', val);
                                } else {
                                  handleBusChange(bus.id, 'customInitialV', val);
                                }
                              }}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.type === 'slack' ? bus.theta : (useFlatStart ? 0.0 : bus.customInitialTheta ?? 0.0)}
                              disabled={bus.type === 'slack' || useFlatStart}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                if (bus.type === 'slack') {
                                  handleBusChange(bus.id, 'theta', val);
                                } else {
                                  handleBusChange(bus.id, 'customInitialTheta', val);
                                }
                              }}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.pGen}
                              disabled={bus.type === 'slack'}
                              onChange={(e) => handleBusChange(bus.id, 'pGen', parseFloat(e.target.value) || 0)}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.qGen}
                              disabled={bus.type !== 'pq'}
                              onChange={(e) => handleBusChange(bus.id, 'qGen', parseFloat(e.target.value) || 0)}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.pLoad}
                              onChange={(e) => handleBusChange(bus.id, 'pLoad', parseFloat(e.target.value) || 0)}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={bus.qLoad}
                              onChange={(e) => handleBusChange(bus.id, 'qLoad', parseFloat(e.target.value) || 0)}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            {bus.type === 'pv' ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  placeholder="Min"
                                  value={bus.qMin ?? 0.0}
                                  onChange={(e) => handleBusChange(bus.id, 'qMin', parseFloat(e.target.value) || 0)}
                                  className="drafting-input text-right w-12"
                                />
                                <span className="text-slate-400 font-mono text-[9px]">-</span>
                                <input
                                  type="number"
                                  placeholder="Max"
                                  value={bus.qMax ?? 2.0}
                                  onChange={(e) => handleBusChange(bus.id, 'qMax', parseFloat(e.target.value) || 0)}
                                  className="drafting-input text-right w-12"
                                />
                              </div>
                            ) : (
                              <div className="text-center text-slate-500 font-mono text-xs italic">N/A</div>
                            )}
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => removeBus(bus.id)}
                              className="text-slate-500 hover:text-rose-500 transition"
                              title="Delete Node"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lines Sheet */}
              <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
                <div className="flex justify-between items-center border-b border-[#14532d] pb-3 mb-4">
                  <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase glow-amber">
                    2. Inter-node Transmission Lines (π-Model)
                  </h3>
                  <button
                    onClick={addLine}
                    className="flex items-center gap-1 text-[10px] font-mono font-bold py-1 px-3 border border-[#22c55e] rounded hover:bg-[#14532d] text-[#4ade80] transition"
                  >
                    <Plus className="w-3 h-3" />
                    ADD LINE
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="logbook-table">
                    <thead>
                      <tr>
                        <th className="w-24 text-left">LINE ID</th>
                        <th className="text-left">FROM BUS</th>
                        <th className="text-left">TO BUS</th>
                        <th className="text-right">RESISTANCE R (PU)</th>
                        <th className="text-right">REACTANCE X (PU)</th>
                        <th className="text-right">TOTAL CHARGING B (PU)</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            <input
                              type="text"
                              value={line.id}
                              onChange={(e) => handleLineChange(line.id, 'id', e.target.value)}
                              className="drafting-input text-left"
                            />
                          </td>
                          <td>
                            <select
                              value={line.from}
                              onChange={(e) => handleLineChange(line.id, 'from', parseInt(e.target.value))}
                              className="drafting-input text-left"
                            >
                              {buses.map((b) => (
                                <option key={`from-${b.id}`} value={b.id}>
                                  Bus {b.id} ({b.name})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={line.to}
                              onChange={(e) => handleLineChange(line.id, 'to', parseInt(e.target.value))}
                              className="drafting-input text-left"
                            >
                              {buses.map((b) => (
                                <option key={`to-${b.id}`} value={b.id}>
                                  Bus {b.id} ({b.name})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={line.r}
                              onChange={(e) => handleLineChange(line.id, 'r', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={line.x}
                              onChange={(e) => handleLineChange(line.id, 'x', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              value={line.b}
                              onChange={(e) => handleLineChange(line.id, 'b', parseFloat(e.target.value) || 0)}
                              className="drafting-input text-right"
                            />
                          </td>
                          <td className="text-center">
                            <button
                              onClick={() => removeLine(line.id)}
                              className="text-slate-500 hover:text-rose-500 transition"
                              title="Delete Line"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Visual Layout */}
          {activeTab === 'diagram' && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="md:col-span-3">
                <NetworkDiagram buses={buses} lines={lines} results={results} />
              </div>
              <div className="md:col-span-2">
                <PhasorDiagram buses={buses} results={results} />
              </div>
            </div>
          )}

          {/* Tab 3: Y-Bus */}
          {activeTab === 'ybus' && (
            <div className="calculation-sheet p-6 border border-[#14532d] rounded-lg flex flex-col gap-6">
              <div>
                <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase glow-amber">
                  3. N-Bus Admittance Matrix [Y-bus]
                </h3>
                <p className="text-[10px] text-[#86efac] font-mono mt-1">
                  Formula: Y_ii = Σ(y_ik + j*b_ik/2) + y_shunt, &nbsp; Y_ij = -y_ij
                </p>
              </div>

              <div className="overflow-x-auto py-4 flex items-center justify-center">
                <div className="math-matrix">
                  <div className="matrix-brackets">[</div>
                  <div
                    className="matrix-grid"
                    style={{
                      gridTemplateColumns: `repeat(${buses.length}, minmax(180px, 1fr))`,
                    }}
                  >
                    {yBus.map((row, rIdx) =>
                      row.map((val, cIdx) => (
                        <div
                          key={`y-${rIdx}-${cIdx}`}
                          className={`p-2 border-dashed border-[#14532d] border-b border-r text-right ${
                            rIdx === cIdx ? 'bg-slate-900/50 font-bold' : ''
                          }`}
                        >
                          <div className="text-[10px] text-slate-500 font-mono">
                            Y({rIdx+1},{cIdx+1})
                          </div>
                          <div className="text-xs text-[#86efac] font-mono mt-0.5">
                            {val.toString(4)}
                          </div>
                          <div className="text-[9px] text-[#fbbf24] font-mono mt-0.5">
                            {val.toPolarString(3)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="matrix-brackets">]</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Step-by-Step Maths */}
          {activeTab === 'iterations' && (
            <div className="calculation-sheet p-6 border border-[#14532d] rounded-lg flex flex-col gap-6">
              {!results ? (
                <div className="text-center py-12 text-slate-500 italic font-mono text-xs">
                  No calculations compiled. Run load solver.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#14532d] pb-3">
                    <div>
                      <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase glow-amber">
                        4. Step-by-Step Newton-Raphson Iteration Audit
                      </h3>
                      <p className="text-[10px] text-[#86efac] font-mono mt-1">
                        Examine active power mismatch corrections and Jacobian sensitivities.
                      </p>
                    </div>
                    
                    {/* Iteration Selector */}
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span>AUDIT ITERATION:</span>
                      <div className="flex border border-[#14532d] rounded overflow-hidden">
                        {results.iterations.map((it) => (
                          <button
                            key={`it-btn-${it.iteration}`}
                            onClick={() => setSelectedIteration(it.iteration)}
                            className={`px-3 py-1 border-r border-[#14532d] last:border-0 hover:bg-[#14532d]/40 font-mono text-xs font-bold ${
                              selectedIteration === it.iteration
                                ? 'bg-[#22c55e] text-black hover:bg-[#22c55e]'
                                : 'text-[#86efac] bg-transparent'
                            }`}
                          >
                            #{it.iteration}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {results.iterations.find((it) => it.iteration === selectedIteration) && (() => {
                    const detail = results.iterations.find((it) => it.iteration === selectedIteration)!;
                    return (
                      <div className="flex flex-col gap-8">
                        
                        {/* A. Voltages */}
                        <div>
                          <h4 className="text-[10px] font-bold text-[#fbbf24] font-mono uppercase tracking-wider mb-2">
                            A. Node Voltage Vectors (Iteration #{selectedIteration} Start)
                          </h4>
                          <table className="logbook-table">
                            <thead>
                              <tr>
                                <th className="text-left">NODE</th>
                                <th className="text-right">MAGNITUDE |V_i| (PU)</th>
                                <th className="text-right">PHASE ANGLE θ_i (DEG)</th>
                                <th className="text-right">RECTANGULAR FORM</th>
                                <th className="text-right">POLAR FORM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.busVoltages.map((v) => (
                                <tr key={`it-v-${v.id}`}>
                                  <td className="font-mono text-xs font-semibold text-[#86efac]">
                                    Bus {v.id} ({v.name}) [{v.type.toUpperCase()}]
                                  </td>
                                  <td className="numeric text-slate-300">{v.v.toFixed(6)}</td>
                                  <td className="numeric text-slate-300">{v.theta.toFixed(4)}°</td>
                                  <td className="numeric text-slate-500">{v.vComplex.toString(5)}</td>
                                  <td className="numeric text-[#fbbf24] font-bold">{v.vComplex.toPolarString(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* B. Mismatches */}
                        <div>
                          <h4 className="text-[10px] font-bold text-[#fbbf24] font-mono uppercase tracking-wider mb-2">
                            B. Mismatch Vector [ΔM] calculation (P and Q errors)
                          </h4>
                          <table className="logbook-table">
                            <thead>
                              <tr>
                                <th className="text-left">ROW</th>
                                <th className="text-left">VARIABLE</th>
                                <th className="text-right">SPECIFIED VALUE (PU)</th>
                                <th className="text-right">CALCULATED VALUE (PU)</th>
                                <th className="text-right">MISMATCH ERROR (PU)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.mismatches.map((m, idx) => (
                                <tr key={`it-m-${idx}`}>
                                  <td className="font-mono text-xs font-semibold text-slate-600">#{idx+1}</td>
                                  <td className="font-mono text-xs font-bold text-[#fbbf24]">
                                    Δ{m.type}_{m.busId}
                                  </td>
                                  <td className="numeric text-slate-300">{m.specVal.toFixed(6)}</td>
                                  <td className="numeric text-slate-300">{m.calcVal.toFixed(6)}</td>
                                  <td className={`numeric font-bold ${
                                    Math.abs(m.mismatch) > tolerance ? 'text-rose-400' : 'text-teal-400'
                                  }`}>
                                    {m.mismatch.toFixed(6)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-2 text-xs font-mono text-slate-400">
                            Max mismatch error: <span className="font-bold text-[#4ade80]">{detail.maxMismatch.toFixed(6)}</span> 
                            {detail.maxMismatch < tolerance ? (
                              <span className="text-teal-400 font-bold ml-1"> (threshold met)</span>
                            ) : (
                              <span className="text-rose-400 font-bold ml-1"> (above limit: {tolerance})</span>
                            )}
                          </div>
                        </div>

                        {/* C. Jacobian Matrix */}
                        {detail.jacobian.matrix.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold text-[#fbbf24] font-mono uppercase tracking-wider mb-2">
                              C. Computed Jacobian Matrix [J] Elements
                            </h4>
                            <div className="overflow-x-auto border border-[#14532d] rounded p-4 bg-[#080c14] flex justify-center">
                              <div className="math-matrix">
                                <div className="matrix-brackets">[</div>
                                <div className="flex flex-col">
                                  {/* Col Headers */}
                                  <div className="flex text-[9px] font-mono text-slate-500 font-bold mb-1 border-b border-[#14532d] pb-1">
                                    <div className="w-16"></div> 
                                    {detail.jacobian.colLabels.map((lbl, idx) => (
                                      <div key={`lbl-c-${idx}`} className="w-24 text-right pr-2">
                                        ∂/∂{lbl.replace('Δ', '')}
                                      </div>
                                    ))}
                                  </div>
                                  
                                  {/* Rows */}
                                  {detail.jacobian.matrix.map((row, rIdx) => (
                                    <div key={`j-row-${rIdx}`} className="flex items-center text-xs font-mono text-[#86efac] py-1">
                                      {/* Row Label */}
                                      <div className="w-16 text-left font-bold text-[9px] text-slate-500 border-r border-[#14532d] pr-2 shrink-0">
                                        d{detail.jacobian.rowLabels[rIdx].replace('Δ', '')}
                                      </div>
                                      {/* Row values */}
                                      {row.map((val, cIdx) => (
                                        <div key={`j-val-${rIdx}-${cIdx}`} className="w-24 text-right pr-2">
                                          {val.toFixed(5)}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                                <div className="matrix-brackets">]</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* D. Corrections */}
                        {detail.corrections.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold text-[#fbbf24] font-mono uppercase tracking-wider mb-2">
                              D. Correction Updates [Δx = J⁻¹ * ΔM]
                            </h4>
                            <table className="logbook-table">
                              <thead>
                                <tr>
                                  <th className="text-left">VARIABLE</th>
                                  <th className="text-right">CORRECTION Δx (RAD)</th>
                                  <th className="text-right">CORRECTION Δx (DEG)</th>
                                  <th className="text-right">NEW VALUE FOR ITERATION #{selectedIteration + 1}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.corrections.map((corr, idx) => {
                                  const nextItDetail = results.iterations.find(it => it.iteration === selectedIteration + 1);
                                  let nextValDisplay = 'Final solution reached';
                                  if (nextItDetail) {
                                    const nextV = nextItDetail.busVoltages.find(v => v.id === corr.busId);
                                    if (nextV) {
                                      nextValDisplay = corr.type === 'theta' 
                                        ? `${nextV.theta.toFixed(6)}°` 
                                        : `${nextV.v.toFixed(6)} pu`;
                                    }
                                  }

                                  return (
                                    <tr key={`it-corr-${idx}`}>
                                      <td className="font-mono text-xs font-bold text-[#fbbf24]">{corr.label}</td>
                                      <td className="numeric text-slate-300">{corr.value.toFixed(6)}</td>
                                      <td className="numeric">
                                        {corr.type === 'theta' 
                                          ? `${((corr.value * 180) / Math.PI).toFixed(4)}°` 
                                          : <span className="text-slate-500 italic">N/A</span>
                                        }
                                      </td>
                                      <td className="numeric font-bold text-[#4ade80]">{nextValDisplay}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Tab 5: Final Flows */}
          {activeTab === 'results' && results && (
            <div className="flex flex-col gap-6">
              
              {/* Bus Results */}
              <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
                <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase mb-2 glow-amber">
                  5. Active/Reactive Converged Node Summary
                </h3>
                <div className="overflow-x-auto">
                  <table className="logbook-table">
                    <thead>
                      <tr>
                        <th className="text-center w-12">ID</th>
                        <th className="text-left">BUS NAME</th>
                        <th className="text-left">TYPE</th>
                        <th className="text-right">V (PU)</th>
                        <th className="text-right">PHASE θ (DEG)</th>
                        <th className="text-right">GEN P (PU)</th>
                        <th className="text-right">GEN Q (PU)</th>
                        <th className="text-right">LOAD P (PU)</th>
                        <th className="text-right">LOAD Q (PU)</th>
                        <th className="text-right">NET P (PU)</th>
                        <th className="text-right">NET Q (PU)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.busResults.map((br) => (
                        <tr key={`res-bus-${br.id}`}>
                          <td className="text-center font-mono font-bold text-xs text-[#fbbf24]">{br.id}</td>
                          <td className="text-[#86efac]">{br.name}</td>
                          <td className="font-mono text-[9px] font-bold text-slate-500 uppercase">{br.type}</td>
                          <td className="numeric font-bold text-[#60a5fa]">{br.v.toFixed(5)}</td>
                          <td className="numeric text-[#60a5fa]">{br.theta.toFixed(3)}°</td>
                          <td className="numeric text-emerald-400 font-semibold">{br.pGen.toFixed(5)}</td>
                          <td className="numeric text-emerald-400">{br.qGen.toFixed(5)}</td>
                          <td className="numeric text-rose-400">{br.pLoad.toFixed(5)}</td>
                          <td className="numeric text-rose-400">{br.qLoad.toFixed(5)}</td>
                          <td className="numeric">{br.pNet.toFixed(5)}</td>
                          <td className="numeric">{br.qNet.toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Line Flows */}
              <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
                <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase mb-2 glow-amber">
                  6. Transmission Line Power Flows and Real Losses
                </h3>
                <div className="overflow-x-auto">
                  <table className="logbook-table">
                    <thead>
                      <tr>
                        <th className="text-left">FROM</th>
                        <th className="text-left">TO</th>
                        <th className="text-right">P_flow (FROM→TO) (PU)</th>
                        <th className="text-right">Q_flow (FROM→TO) (PU)</th>
                        <th className="text-right">P_flow (TO→FROM) (PU)</th>
                        <th className="text-right">Q_flow (TO→FROM) (PU)</th>
                        <th className="text-right">REAL LOSS P_loss (PU)</th>
                        <th className="text-right">REACTIVE LOSS Q_loss (PU)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.lineResults.map((lr, idx) => (
                        <tr key={`res-line-${idx}`}>
                          <td className="font-mono text-xs font-semibold text-[#86efac]">Bus {lr.from}</td>
                          <td className="font-mono text-xs font-semibold text-[#86efac]">Bus {lr.to}</td>
                          <td className="numeric text-slate-300">{lr.pFromTo.toFixed(5)}</td>
                          <td className="numeric text-slate-300">{lr.qFromTo.toFixed(5)}</td>
                          <td className="numeric text-slate-300">{lr.pToFrom.toFixed(5)}</td>
                          <td className="numeric text-slate-300">{lr.qToFrom.toFixed(5)}</td>
                          <td className="numeric font-bold text-rose-400">{lr.pLoss.toFixed(5)}</td>
                          <td className="numeric font-bold text-rose-400">{lr.qLoss.toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Balance Totals sheet */}
              <div className="calculation-sheet p-5 border border-[#14532d] rounded-lg">
                <h3 className="text-xs font-bold text-[#fbbf24] font-mono tracking-wider uppercase mb-2 glow-amber">
                  7. SCADA Dispatch Power Balance totals
                </h3>
                <table className="logbook-table">
                  <thead>
                    <tr>
                      <th className="text-left">Dispatch Category</th>
                      <th className="text-right">ACTIVE POWER P (PU)</th>
                      <th className="text-right">REACTIVE POWER Q (PU)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Total Grid Generation</td>
                      <td className="numeric text-emerald-400 font-bold">{results.totalGeneration.p.toFixed(5)}</td>
                      <td className="numeric text-emerald-400">{results.totalGeneration.q.toFixed(5)}</td>
                    </tr>
                    <tr>
                      <td>Total Grid Loads Connected</td>
                      <td className="numeric text-rose-400 font-bold">{results.totalLoad.p.toFixed(5)}</td>
                      <td className="numeric text-rose-400">{results.totalLoad.q.toFixed(5)}</td>
                    </tr>
                    <tr className="total-row">
                      <td className="glow-amber">NET GRID SYSTEM LOSSES</td>
                      <td className="numeric text-rose-400 font-bold">{results.totalLosses.p.toFixed(5)}</td>
                      <td className="numeric text-rose-400 font-bold">{results.totalLosses.q.toFixed(5)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>

      </main>

      <footer className="border-t border-[#14532d] py-4 text-center text-[10px] text-[#166534] font-mono mt-auto bg-[#070a13] glow-text">
        POWER SYSTEM SCADA DISPATCH CONSOLE • DESIGNED BY RETRO-FUTURE LABS
      </footer>
    </div>
  );
}

export default App;
