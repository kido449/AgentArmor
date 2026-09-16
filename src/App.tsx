import React, { useState, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { LatencyHeadline } from "./components/LatencyHeadline";
import { StageHistogram } from "./components/StageHistogram";
import { VerdictDistribution } from "./components/VerdictDistribution";
import { LiveFeed } from "./components/LiveFeed";
import { InspectorModal } from "./components/InspectorModal";
import { QuarantinePanel } from "./components/QuarantinePanel";
import { WithWithoutAgentArmor } from "./components/WithWithoutAgentArmor";
import { SignaturesModal } from "./components/SignaturesModal";
import { CustomInspectTester } from "./components/CustomInspectTester";
import {
  Verdict,
  GatewayStats,
  QuarantineRecord,
  Signature,
  PercentileStats,
} from "./types";

const INITIAL_PERCENTILES: PercentileStats = { p50: 0.82, p95: 1.45, avg: 0.94 };
const INITIAL_MOSS_PERCENTILES: PercentileStats = { p50: 0.76, p95: 1.15, avg: 0.81 };

export default function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [quarantineRecords, setQuarantineRecords] = useState<QuarantineRecord[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [mossVersion, setMossVersion] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSignaturesOpen, setIsSignaturesOpen] = useState<boolean>(false);
  const [isLoadingAction, setIsLoadingAction] = useState<boolean>(false);

  const [stats, setStats] = useState<GatewayStats>({
    total_verdicts: 0,
    action_counts: { ALLOW: 0, SANITIZE: 0, QUARANTINE: 0, BLOCK: 0 },
    attack_classes: {},
    total_overhead: INITIAL_PERCENTILES,
    moss_stage: INITIAL_MOSS_PERCENTILES,
    moss_version: 1,
    signatures_count: 49,
  });

  const quarantineRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  const refreshStats = async () => {
    try {
      const [resStats, resQuar, resSigs] = await Promise.all([
        fetch("/api/sentinel/stats").then((r) => r.ok ? r.json() : null),
        fetch("/api/sentinel/quarantine").then((r) => r.ok ? r.json() : null),
        fetch("/api/sentinel/signatures").then((r) => r.ok ? r.json() : null),
      ]);

      if (resStats) {
        setStats((prev) => ({
          ...prev,
          ...resStats,
          total_overhead: resStats.total_overhead?.avg ? resStats.total_overhead : prev.total_overhead,
          moss_stage: resStats.moss_stage?.avg ? resStats.moss_stage : prev.moss_stage,
        }));
      }
      if (resQuar?.records) {
        setQuarantineRecords(resQuar.records);
      }
      if (resSigs?.signatures) {
        setSignatures(resSigs.signatures);
        setMossVersion(resSigs.version);
      }
    } catch (err) {
      console.warn("Error fetching sentinel data:", err);
    }
  };

  useEffect(() => {
    refreshStats();

    // Setup SSE connection
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/stream");
      eventSource.onopen = () => {
        setConnected(true);
      };
      eventSource.onmessage = (event) => {
        try {
          const newVerdict: Verdict = JSON.parse(event.data);
          setVerdicts((prev) => [newVerdict, ...prev.slice(0, 99)]);

          // Update latest metrics
          setStats((prev) => {
            const act = newVerdict.action;
            const newCounts = {
              ...prev.action_counts,
              [act]: (prev.action_counts[act] || 0) + 1,
            };

            const newClasses = { ...prev.attack_classes };
            if (newVerdict.attack_class && newVerdict.attack_class !== "benign") {
              newClasses[newVerdict.attack_class] = (newClasses[newVerdict.attack_class] || 0) + 1;
            }

            return {
              ...prev,
              total_verdicts: prev.total_verdicts + 1,
              action_counts: newCounts,
              attack_classes: newClasses,
            };
          });

          // If quarantined, refresh quarantine list
          if (newVerdict.action === "QUARANTINE") {
            refreshStats();
          }
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };
      eventSource.onerror = () => {
        setConnected(false);
      };
    } catch (e) {
      console.error("SSE Init error:", e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Run simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch("/api/sentinel/simulate?limit=10", { method: "POST" });
      if (res.ok) {
        await refreshStats();
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  // Quarantine operations
  const handleReleaseQuarantine = async (reqId: string) => {
    setIsLoadingAction(true);
    try {
      await fetch(`/api/sentinel/quarantine/${reqId}/release`, { method: "POST" });
      await refreshStats();
    } catch (err) {
      console.error("Release error:", err);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handlePromoteQuarantine = async (reqId: string) => {
    setIsLoadingAction(true);
    try {
      await fetch(`/api/sentinel/quarantine/${reqId}/promote`, { method: "POST" });
      await refreshStats();
    } catch (err) {
      console.error("Promote error:", err);
    } finally {
      setIsLoadingAction(false);
    }
  };

  const handlePromoteNewSignature = async (text: string, attackClass: string) => {
    try {
      await fetch("/api/sentinel/signatures/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          attack_class: attackClass,
          severity: 4,
        }),
      });
      await refreshStats();
    } catch (err) {
      console.error("Promote signature error:", err);
    }
  };

  const handleInspectCustomResult = (v: Verdict) => {
    setVerdicts((prev) => [v, ...prev.slice(0, 99)]);
    setSelectedVerdict(v);
    refreshStats();
  };

  const latestVerdict = verdicts[0];
  const latestTotalMs = latestVerdict ? latestVerdict.total_overhead_ms : undefined;
  const latestBTrace = latestVerdict?.stage_traces.find((t) => t.stage === "B");
  const latestMossMs = latestBTrace?.detail?.retrieval_latency_ms ?? latestBTrace?.latency_ms;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header
        connected={connected}
        mossCount={signatures.length || stats.signatures_count}
        mossVersion={mossVersion}
        onRunSimulation={handleRunSimulation}
        isSimulating={isSimulating}
        onOpenSignatures={() => setIsSignaturesOpen(true)}
        quarantineCount={quarantineRecords.filter((r) => r.status === "QUARANTINED").length}
        onScrollToQuarantine={() => {
          quarantineRef.current?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Headline Banner */}
        <LatencyHeadline
          totalOverhead={stats.total_overhead}
          mossStage={stats.moss_stage}
          latestTotalMs={latestTotalMs}
          latestMossMs={latestMossMs}
        />

        {/* Per-Stage Latency Histogram & Execution Profile */}
        <StageHistogram latestTraces={latestVerdict?.stage_traces} />

        {/* Verdict Distribution & Attack Classes */}
        <VerdictDistribution
          actionCounts={stats.action_counts}
          attackClasses={stats.attack_classes}
          totalVerdicts={stats.total_verdicts}
        />

        {/* WITH vs WITHOUT AgentArmor Demonstration */}
        <WithWithoutAgentArmor />

        {/* Custom Inspect Tester */}
        <CustomInspectTester onInspectResult={handleInspectCustomResult} />

        {/* Quarantine Queue Panel */}
        <div ref={quarantineRef}>
          <QuarantinePanel
            records={quarantineRecords}
            onRelease={handleReleaseQuarantine}
            onPromote={handlePromoteQuarantine}
            isLoading={isLoadingAction}
          />
        </div>

        {/* Live Verdict Feed Stream */}
        <LiveFeed
          verdicts={verdicts}
          selectedVerdict={selectedVerdict}
          onSelectVerdict={setSelectedVerdict}
          onClearFeed={() => setVerdicts([])}
        />
      </main>

      {/* Inspector Modal */}
      <InspectorModal
        verdict={selectedVerdict}
        onClose={() => setSelectedVerdict(null)}
        onPromoteSignature={handlePromoteNewSignature}
      />

      {/* Signatures Index Modal */}
      <SignaturesModal
        isOpen={isSignaturesOpen}
        onClose={() => setIsSignaturesOpen(false)}
        signatures={signatures}
        version={mossVersion}
        onPromoteNew={handlePromoteNewSignature}
      />
    </div>
  );
}
