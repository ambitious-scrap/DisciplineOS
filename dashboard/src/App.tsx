import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Shield,
  Smartphone,
  Laptop,
  Globe,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  MapPin,
  Camera,
  Activity,
  Plus,
  Trash2,
  Search,
} from 'lucide-react';

interface BlockedApp {
  id: string;
  name: string;
  pkg: string;
  category: 'Social' | 'Entertainment' | 'Gaming' | 'News';
  isActive: boolean;
}

interface BlockedDomain {
  id: string;
  domain: string;
  category: string;
  isActive: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  rewardMins: number;
  evidenceType: 'photo' | 'geofence' | 'timer' | 'none';
  streak: number;
  isCompletedToday: boolean;
}

interface LedgerEntry {
  id: string;
  type: 'EARN' | 'SPEND' | 'EMERGENCY' | 'SYNC';
  description: string;
  deltaMins: number;
  balanceAfterMins: number;
  timestamp: string;
  signature: string;
}

export function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'policy' | 'geofence' | 'tasks' | 'ledger'>('policy');

  // Time Bank State
  const [balanceMins, setBalanceMins] = useState(60);
  const maxCapacityMins = 240;

  // Active Lease State
  const [activeLease, setActiveLease] = useState<{
    target: string;
    type: 'app' | 'site';
    secondsRemaining: number;
    isEmergency: boolean;
  } | null>(null);

  // Policy Data
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([
    { id: '1', name: 'Instagram', pkg: 'com.instagram.android', category: 'Social', isActive: true },
    { id: '2', name: 'YouTube', pkg: 'com.google.android.youtube', category: 'Entertainment', isActive: true },
    { id: '3', name: 'TikTok', pkg: 'com.zhiliaoapp.musically', category: 'Social', isActive: true },
    { id: '4', name: 'X / Twitter', pkg: 'com.twitter.android', category: 'Social', isActive: true },
    { id: '5', name: 'Reddit', pkg: 'com.reddit.frontpage', category: 'News', isActive: true },
    { id: '6', name: 'Netflix', pkg: 'com.netflix.mediaclient', category: 'Entertainment', isActive: true },
  ]);

  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([
    { id: '1', domain: 'instagram.com', category: 'Social', isActive: true },
    { id: '2', domain: 'youtube.com', category: 'Video', isActive: true },
    { id: '3', domain: 'tiktok.com', category: 'Social', isActive: true },
    { id: '4', domain: 'twitter.com', category: 'Social', isActive: true },
    { id: '5', domain: 'x.com', category: 'Social', isActive: true },
    { id: '6', domain: 'reddit.com', category: 'Discussion', isActive: true },
  ]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [newTargetInput, setNewTargetInput] = useState('');
  const [newTargetType, setNewTargetType] = useState<'app' | 'site'>('app');

  // Tasks
  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: 't-1',
      title: 'Morning Gym & Strength Training',
      description: '30+ min workout verified via real-time camera proof',
      rewardMins: 45,
      evidenceType: 'photo',
      streak: 6,
      isCompletedToday: false,
    },
    {
      id: 't-2',
      title: 'Deep Engineering Sprint',
      description: '45 mins of uninterrupted architecture design',
      rewardMins: 30,
      evidenceType: 'timer',
      streak: 12,
      isCompletedToday: true,
    },
    {
      id: 't-3',
      title: 'Read 20 Pages of Non-Fiction',
      description: 'Reading session verified with photo timestamp',
      rewardMins: 20,
      evidenceType: 'photo',
      streak: 4,
      isCompletedToday: false,
    },
  ]);

  // Ledger History
  const [ledger, setLedger] = useState<LedgerEntry[]>([
    {
      id: 'tx-1',
      type: 'EARN',
      description: 'Completed Task: Deep Engineering Sprint (45m)',
      deltaMins: 30,
      balanceAfterMins: 60,
      timestamp: 'Just now',
      signature: 'hmac-sha256-8f3a9e...e7b1',
    },
    {
      id: 'tx-2',
      type: 'SPEND',
      description: 'Unlocked YouTube (5m lease on Android)',
      deltaMins: -5,
      balanceAfterMins: 30,
      timestamp: '2 hours ago',
      signature: 'hmac-sha256-2b4c1d...a94f',
    },
    {
      id: 'tx-3',
      type: 'EARN',
      description: 'Gym Geofence Dwell (42 mins at Strength Club)',
      deltaMins: 35,
      balanceAfterMins: 35,
      timestamp: 'Today 07:15 AM',
      signature: 'hmac-sha256-5e8a2b...c38d',
    },
  ]);

  // Active Lease Timer Countdown
  useEffect(() => {
    if (!activeLease) return;
    const interval = setInterval(() => {
      setActiveLease((prev) => {
        if (!prev) return null;
        if (prev.secondsRemaining <= 1) {
          return null;
        }
        return { ...prev, secondsRemaining: prev.secondsRemaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeLease]);

  // Handle Unlock
  const handleUnlock = (target: string, type: 'app' | 'site', mins: number, isEmergency: boolean) => {
    const cost = isEmergency ? mins * 3 : mins;
    if (!isEmergency && balanceMins < cost) {
      alert(`Insufficient balance! You have ${balanceMins}m, but this unlock requires ${cost}m.`);
      return;
    }

    setBalanceMins((prev) => Math.max(0, prev - cost));
    setActiveLease({
      target,
      type,
      secondsRemaining: mins * 60,
      isEmergency,
    });

    const newTx: LedgerEntry = {
      id: `tx-${Date.now()}`,
      type: isEmergency ? 'EMERGENCY' : 'SPEND',
      description: `${isEmergency ? '🚨 Emergency' : '🔓 Temporary'} unlock for ${target} (${mins}m)`,
      deltaMins: -cost,
      balanceAfterMins: Math.max(0, balanceMins - cost),
      timestamp: 'Just now',
      signature: `hmac-sha256-${Math.random().toString(36).substring(2, 10)}...signed`,
    };

    setLedger((prev) => [newTx, ...prev]);
  };

  // Complete Task with Confetti
  const handleCompleteTask = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.isCompletedToday) return;

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#38bdf8', '#22c55e', '#6366f1'],
    });

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, isCompletedToday: true, streak: t.streak + 1 } : t
      )
    );

    const newBalance = Math.min(maxCapacityMins, balanceMins + task.rewardMins);
    setBalanceMins(newBalance);

    const newTx: LedgerEntry = {
      id: `tx-${Date.now()}`,
      type: 'EARN',
      description: `Task Verified: ${task.title} (+${task.rewardMins}m)`,
      deltaMins: task.rewardMins,
      balanceAfterMins: newBalance,
      timestamp: 'Just now',
      signature: `hmac-sha256-proof-${Math.random().toString(36).substring(2, 10)}`,
    };

    setLedger((prev) => [newTx, ...prev]);
  };

  const filteredApps = blockedApps.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.pkg.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDomains = blockedDomains.filter((d) =>
    d.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative min-h-[100dvh] bg-[#030712] text-white selection:bg-cyan-500/20 selection:text-cyan-200">
      <div className="ambient-mesh" />

      {/* Top Floating Glass Island Header */}
      <header className="sticky top-4 z-40 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="glass-panel rounded-full px-5 py-3 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-glow-cyan">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">DisciplineOS</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Authoritative Cross-Device Focus Engine
              </p>
            </div>
          </div>

          {/* Connected Device Ticker */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[12px] text-slate-300">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline font-mono">Pixel 9 Pro</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[12px] text-slate-300">
              <Laptop className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline font-mono">MacBook Air</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[12px] text-slate-300">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline font-mono">Railway Node</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-20 relative z-10">
        {/* Active Distraction Lease Banner */}
        <AnimatePresence>
          {activeLease && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              className="mb-8 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shadow-glow-amber">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white text-sm">
                      Active Distraction Session Unlocked
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-mono font-bold bg-amber-500/20 text-amber-300">
                      Global Lock Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Target: <span className="text-amber-300 font-mono">{activeLease.target}</span>{' '}
                    ({activeLease.type === 'app' ? 'Package' : 'Domain'})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
                    {Math.floor(activeLease.secondsRemaining / 60)}:
                    {(activeLease.secondsRemaining % 60).toString().padStart(2, '0')}
                  </div>
                  <span className="text-[10px] text-slate-400">Time Remaining</span>
                </div>
                <button
                  onClick={() => setActiveLease(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-white/10 transition-colors"
                >
                  Lock Now
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero HUD — Central Time Bank Vault & Physical Status */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          {/* Main Time Bank Vault */}
          <div className="lg:col-span-8 double-bezel">
            <div className="double-bezel-inner flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Vault Reserve
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Immutable Ledger Backed</span>
                </div>

                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight font-sans">
                      {balanceMins}
                    </span>
                    <span className="text-xl font-medium text-slate-400">/ {maxCapacityMins} mins</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Available distraction allowance across all synced devices.
                  </p>
                </div>

                {/* Progress Meter Bar */}
                <div className="space-y-1.5">
                  <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/[0.08]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(balanceMins / maxCapacityMins) * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-glow-cyan"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0m</span>
                    <span>Cap: 240m (4 Hours Strict Limit)</span>
                  </div>
                </div>

                {/* Quick Simulation Actions */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => {
                      confetti({ particleCount: 30, spread: 50 });
                      setBalanceMins((b) => Math.min(maxCapacityMins, b + 15));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> +15m Sprint Reward
                  </button>
                  <button
                    onClick={() => handleUnlock('instagram.com', 'site', 5, false)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" /> Test 5m Unlock
                  </button>
                </div>
              </div>

              {/* Holographic Radial Status Arc */}
              <div className="relative w-44 h-44 flex items-center justify-center flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-slate-800/80"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-cyan-400 transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * balanceMins) / maxCapacityMins}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <Lock className="w-6 h-6 text-cyan-400 mb-1" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Enforced
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Zero Bypass</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Security & Penalty Matrix */}
          <div className="lg:col-span-4 space-y-4">
            <div className="double-bezel">
              <div className="double-bezel-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Emergency Protocol</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300">
                    3.0x Multiplier
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Need to bypass a lock when balance is empty? Emergency unlocks penalize 3x cost
                  from your future balance.
                </p>
                <button
                  onClick={() => {
                    if (confirm('🚨 Emergency unlock charges 3x penalty (15 mins cost for 5 mins). Proceed?')) {
                      handleUnlock('Emergency Override', 'app', 5, true);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Trigger Emergency Unlock
                </button>
              </div>
            </div>

            <div className="double-bezel">
              <div className="double-bezel-inner flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Cryptographic Outbox</h4>
                  <p className="text-[11px] text-slate-400 font-mono">HMAC-SHA256 Signed</p>
                </div>
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-mono">
                  <CheckCircle2 className="w-4 h-4" /> 100% Synced
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Tabs (Glass Island Pill) */}
        <div className="flex justify-center mb-8">
          <div className="glass-panel p-1.5 rounded-2xl flex items-center gap-1 shadow-xl">
            {[
              { id: 'policy', label: 'Policy Engine', icon: Shield },
              { id: 'geofence', label: 'Geofence Radar', icon: MapPin },
              { id: 'tasks', label: 'Tasks & Habits', icon: Activity },
              { id: 'ledger', label: 'Ledger Audit', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 flex items-center gap-2 ${
                    isSelected
                      ? 'text-white shadow-glow-cyan'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab 1: Policy Engine & Shields */}
        {activeTab === 'policy' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Search & Add Target Bar */}
            <div className="double-bezel">
              <div className="double-bezel-inner flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search blocked apps or domains (e.g. YouTube, reddit.com)..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/90 border border-white/[0.08] text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={newTargetType}
                    onChange={(e) => setNewTargetType(e.target.value as any)}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="app">App Package</option>
                    <option value="site">Website Domain</option>
                  </select>
                  <input
                    type="text"
                    value={newTargetInput}
                    onChange={(e) => setNewTargetInput(e.target.value)}
                    placeholder={newTargetType === 'app' ? 'com.app.name' : 'domain.com'}
                    className="px-3 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-xs text-slate-200 focus:outline-none flex-1 sm:w-48"
                  />
                  <button
                    onClick={() => {
                      if (!newTargetInput.trim()) return;
                      if (newTargetType === 'app') {
                        setBlockedApps((prev) => [
                          ...prev,
                          {
                            id: `app-${Date.now()}`,
                            name: newTargetInput.split('.').pop() || newTargetInput,
                            pkg: newTargetInput.trim(),
                            category: 'Social',
                            isActive: true,
                          },
                        ]);
                      } else {
                        setBlockedDomains((prev) => [
                          ...prev,
                          {
                            id: `site-${Date.now()}`,
                            domain: newTargetInput.trim().toLowerCase(),
                            category: 'Web',
                            isActive: true,
                          },
                        ]);
                      }
                      setNewTargetInput('');
                    }}
                    className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs flex items-center gap-1.5 transition-colors shadow-glow-cyan"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* Blocked Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Blocked Applications Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Blocked Apps ({filteredApps.length})</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Enforced via UsageStats</span>
                </div>

                <div className="space-y-2.5">
                  {filteredApps.map((app) => (
                    <div key={app.id} className="double-bezel group">
                      <div className="double-bezel-inner flex items-center justify-between p-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{app.name}</span>
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400">
                              {app.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">{app.pkg}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUnlock(app.name, 'app', 5, false)}
                            className="px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-[11px] font-semibold transition-colors"
                          >
                            Unlock 5m
                          </button>
                          <button
                            onClick={() =>
                              setBlockedApps((prev) => prev.filter((a) => a.id !== app.id))
                            }
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blocked Domains Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">
                      Blocked Websites ({filteredDomains.length})
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Enforced via DNS VPN</span>
                </div>

                <div className="space-y-2.5">
                  {filteredDomains.map((site) => (
                    <div key={site.id} className="double-bezel group">
                      <div className="double-bezel-inner flex items-center justify-between p-3.5">
                        <div className="space-y-0.5">
                          <span className="text-sm font-semibold text-white font-mono">
                            {site.domain}
                          </span>
                          <p className="text-[11px] text-slate-500">Redirected to Focus Shield</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUnlock(site.domain, 'site', 5, false)}
                            className="px-3 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[11px] font-semibold transition-colors"
                          >
                            Unlock 5m
                          </button>
                          <button
                            onClick={() =>
                              setBlockedDomains((prev) => prev.filter((d) => d.id !== site.id))
                            }
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab 2: Geofence Radar & Physical Movement */}
        {activeTab === 'geofence' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Radar Visualizer */}
              <div className="lg:col-span-5 double-bezel">
                <div className="double-bezel-inner flex flex-col items-center justify-center p-8 space-y-6 text-center">
                  <div className="relative w-56 h-56 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
                    <div className="absolute inset-6 rounded-full border border-cyan-500/30" />
                    <div className="absolute inset-12 rounded-full border border-cyan-500/40" />
                    <div className="absolute inset-0 rounded-full bg-cyan-500/5 animate-radar" />

                    <div className="relative z-10 w-16 h-16 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shadow-glow-cyan">
                      <MapPin className="w-8 h-8 text-cyan-300 animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">Physical Zone: Strength Club</h4>
                    <p className="text-xs text-slate-400">
                      Step detection active · 42 mins dwell verified
                    </p>
                  </div>
                </div>
              </div>

              {/* Geofence Policies */}
              <div className="lg:col-span-7 space-y-4">
                <div className="double-bezel">
                  <div className="double-bezel-inner space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        <h4 className="font-semibold text-white text-sm">Zone: Gym / Fitness Club</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        +60m Reward Rule
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Staying inside this perimeter for &ge;30 minutes with active step acceleration
                      awards 60 minutes to your Time Bank.
                    </p>
                  </div>
                </div>

                <div className="double-bezel">
                  <div className="double-bezel-inner space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                        <h4 className="font-semibold text-white text-sm">Zone: Deep Work Office</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Auto-Lock Shield
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Automatically activates total distraction lockdown upon arrival.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab 3: Tasks & Habits */}
        {activeTab === 'tasks' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold text-white">Daily Habit Protocols</h3>
                <p className="text-xs text-slate-400">
                  Earn distraction points by proving habit execution.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <div key={task.id} className="double-bezel">
                  <div className="double-bezel-inner flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          +{task.rewardMins} mins
                        </span>
                        <span className="text-xs text-amber-400 font-mono flex items-center gap-1">
                          🔥 {task.streak}d streak
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm">{task.title}</h4>
                      <p className="text-xs text-slate-400">{task.description}</p>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06]">
                      {task.isCompletedToday ? (
                        <div className="py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Completed Today
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-glow-cyan"
                        >
                          <Camera className="w-3.5 h-3.5" /> Submit Proof
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tab 4: Immutable Ledger & Cryptographic Audit */}
        {activeTab === 'ledger' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="double-bezel">
              <div className="double-bezel-inner space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Append-Only Audit Stream</h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Zero Tampering Tolerance</span>
                </div>

                <div className="space-y-3">
                  {ledger.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              tx.type === 'EARN'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : tx.type === 'EMERGENCY'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span className="text-xs font-semibold text-white">{tx.description}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">{tx.signature}</p>
                      </div>

                      <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between">
                        <span
                          className={`text-sm font-mono font-bold ${
                            tx.deltaMins > 0 ? 'text-emerald-400' : 'text-slate-300'
                          }`}
                        >
                          {tx.deltaMins > 0 ? `+${tx.deltaMins}` : tx.deltaMins} mins
                        </span>
                        <span className="text-[10px] text-slate-500">{tx.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default App;

