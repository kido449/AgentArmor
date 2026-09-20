import React, { useState } from "react";
import { Shield, ShieldOff, Play, AlertOctagon, CheckCircle2, Terminal } from "lucide-react";
import { AgentStepResult } from "../types";

export const WithWithoutAgentArmor: React.FC = () => {
  const [armorActive, setArmorActive] = useState<boolean>(true);
  const [toolName, setToolName] = useState<string>("web_search_tool");
  const [injectAttack, setInjectAttack] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<AgentStepResult | null>(null);

  const handleRunStep = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/sentinel/agent/run-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_name: toolName,
          tool_arg: "Autonomous agent execution prompt",
          inject_attack: injectAttack,
          bypass_armor: !armorActive,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Agent step failed:", err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div id="with-without-comparison-panel" className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Agent Attack Demonstration: With vs. Without AgentArmor
          </h3>
        </div>
        <span className="text-xs text-zinc-400">
          Live LangGraph-style agent interception test
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Armor Active Toggle */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                {armorActive ? (
                  <Shield className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-rose-400" />
                )}
                AgentArmor Interceptor Status
              </span>
              <button
                type="button"
                onClick={() => setArmorActive(!armorActive)}
                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  armorActive ? "bg-emerald-500" : "bg-rose-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    armorActive ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              {armorActive
                ? "PROTECTED: @protect decorator actively inspects and sanitizes/blocks malicious tool output."
                : "UNPROTECTED: Raw tool outputs stream directly into the LLM context window."}
            </p>
          </div>

          {/* Select Tool */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 block mb-1.5">
              Select Agent Tool
            </label>
            <select
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="web_search_tool">web_search_tool (Open Web Tier)</option>
              <option value="file_reader_tool">file_reader_tool (User Upload Tier)</option>
              <option value="api_caller_tool">api_caller_tool (Third-Party Tier)</option>
            </select>
          </div>

          {/* Inject Malicious Tool Output */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/70 border border-zinc-800">
            <span className="text-xs text-zinc-300">Simulate Malicious Tool Response</span>
            <input
              type="checkbox"
              checked={injectAttack}
              onChange={(e) => setInjectAttack(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-500 bg-zinc-900 border-zinc-700"
            >
            </input>
          </div>

          <button
            onClick={handleRunStep}
            disabled={isRunning}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Executing Agent Tool Call..." : "Execute Agent Step"}</span>
          </button>
        </div>

        {/* Right Column: Execution Output / Agent Context */}
        <div className="lg:col-span-7 bg-zinc-950 rounded-xl border border-zinc-800/90 p-4 font-mono text-xs flex flex-col justify-between min-h-[260px]">
          <div>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800/80 text-[11px] text-zinc-500">
              <span>AGENT THOUGHT &amp; CONTEXT DUMP</span>
              <span>{result ? (result.armor_active ? "ARMOR: ACTIVE" : "ARMOR: BYPASS") : "IDLE"}</span>
            </div>

            {result ? (
              <div className="space-y-3">
                {/* Hijack outcome banner */}
                {result.is_hijacked ? (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2">
                    <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div>
                      <strong className="font-bold">AGENT HIJACKED (Unprotected):</strong>
                      <p className="mt-0.5 text-[11px] text-rose-200">
                        The agent swallowed the untrusted tool output without verification. Malicious instructions now dictate agent execution!
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    <div>
                      <strong className="font-bold">AGENT SAFE &amp; SECURE:</strong>
                      <p className="mt-0.5 text-[11px] text-emerald-200">
                        {result.attack_injected
                          ? "Malicious injection intercepted and blocked by AgentArmor before entering the agent context window."
                          : "Tool execution was clean and completed successfully."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Agent Thought */}
                <div>
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px] block mb-1">
                    Agent Inner Monologue:
                  </span>
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200">
                    {result.agent_thought}
                  </div>
                </div>

                {/* Tool Output Received */}
                <div>
                  <span className="text-zinc-500 uppercase tracking-wider text-[10px] block mb-1">
                    Tool Output Delivered to LLM:
                  </span>
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 break-all">
                    {result.tool_output_received_by_agent}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-zinc-600 text-center py-12 italic">
                Click "Execute Agent Step" to observe how an autonomous agent responds with AgentArmor active vs bypassed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
