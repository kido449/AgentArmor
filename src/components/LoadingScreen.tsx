import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { Hyperspeed, hyperspeedPresets } from './Hyperspeed';

interface LoadingScreenProps {
  onComplete: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const [isWarping, setIsWarping] = useState(false);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    // 1. Initial calm tunnel for 1.5 seconds
    const warpTimer = setTimeout(() => {
      setIsWarping(true); // Trigger warp speed
    }, 1500);

    // 2. Warp speed runs for 2 seconds, then start fading out
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
    }, 3500);

    // 3. Unmount completely after fade finishes (4 seconds total)
    const unmountTimer = setTimeout(() => {
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(warpTimer);
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950 transition-opacity duration-500 ease-in-out"
      style={{ opacity }}
    >
      <Hyperspeed
        effectOptions={hyperspeedPresets.one}
        triggerSpeedUp={isWarping}
      />
      
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div 
          className={`flex flex-col items-center gap-6 transition-all duration-700 ${
            isWarping ? 'scale-110 opacity-0 blur-md' : 'scale-100 opacity-100'
          }`}
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30 animate-pulse">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-white uppercase italic">
              AgentArmor
            </h1>
            <p className="text-sm font-semibold tracking-[0.2em] uppercase text-cyan-400">
              Sentinel Gateway Initializing...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
