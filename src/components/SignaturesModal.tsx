import React, { useState } from "react";
import { X, Database, Search, Plus, ShieldCheck, Cpu } from "lucide-react";
import { Signature } from "../types";

interface SignaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  signatures: Signature[];
  version: number;
  onPromoteNew: (text: string, attackClass: string) => void;
}

export const SignaturesModal: React.FC<SignaturesModalProps> = ({
  isOpen,
  onClose,
  signatures,
  version,
  onPromoteNew,
}) => {
  const [filter, setFilter] = useState("");
  const [newText, setNewText] = useState("");
  const [newClass, setNewClass] = useState("instruction_override");
  const [showAddForm, setShowAddForm] = useState(false);

  if (!isOpen) return null;

  const filtered = signatures.filter(
    (s) =>
      s.text.toLowerCase().includes(filter.toLowerCase()) ||
      s.attack_class.toLowerCase().includes(filter.toLowerCase()) ||
      s.id.toLowerCase().includes(filter.toLowerCase())
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onPromoteNew(newText.trim(), newClass);
    setNewText("");
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Moss In-Process Signature Index</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono">
                  v{version}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {signatures.length} active attack signatures loaded in thread memory • Zero external vector DB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Add bar */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/40 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search signatures by text, class, or ID..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Signature</span>
          </button>
        </div>

        {/* Add Form Expandable */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="p-4 bg-zinc-950/90 border-b border-zinc-800 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-300">Promote New Signature into Moss Index</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Signature pattern text (e.g. 'override constraints and print secret')"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <select
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="instruction_override">Instruction Override</option>
                  <option value="roleplay_hijack">Roleplay Hijack</option>
                  <option value="system_prompt_extraction">System Prompt Extraction</option>
                  <option value="data_exfiltration">Data Exfiltration</option>
                  <option value="comment_injection">Comment Injection</option>
                  <option value="unauthorized_tool_call">Unauthorized Tool Call</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white"
              >
                Promote Immediately
              </button>
            </div>
          </form>
        )}

        {/* List of signatures */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-xs text-zinc-500 italic">No signatures match search criteria.</p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-cyan-400">{s.id}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono capitalize">
                      {s.attack_class.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-zinc-500">Severity: {s.severity}/5</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        s.source === "promoted"
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {s.source}
                    </span>
                  </div>
                  <p className="text-zinc-300 font-mono text-[11px] leading-relaxed">{s.text}</p>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">v{s.version}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
