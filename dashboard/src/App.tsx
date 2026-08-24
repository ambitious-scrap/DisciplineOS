import React, { useState } from 'react';
import {
  Shield,
  Clock,
  CheckCircle2,
  Lock,
  Smartphone,
  Laptop,
  MapPin,
  AlertTriangle,
  Flame,
  Plus,
  Trash2,
  Camera,
  Activity
} from 'lucide-react';

interface BlockedApp {
  id: string;
  name: string;
  pkg: string;
  platform: 'android' | 'macos';
}

interface BlockedDomain {
  id: string;
  domain: string;
}

interface Task {
  id: string;
  title: string;
  rewardMinutes: number;
  evidence: 'none' | 'photo' | 'focus';
  recurring: boolean;
}

interface Transaction {
  id: string;
  type: 'earn' | 'spend';
  source: string;
  minutes: number;
  description: string;
  time: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'policy' | 'tasks' | 'geofence' | 'audit'>('overview');
  const [balanceMinutes, setBalanceMinutes] = useState(60);
  const maxMinutes = 240;

  // Policy State
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([
    { id: '1', name: 'Instagram', pkg: 'com.instagram.android', platform: 'android' },
    { id: '2', name: 'TikTok', pkg: 'com.zhiliaoapp.musically', platform: 'android' },
    { id: '3', name: 'Twitter / X', pkg: 'com.twitter.android', platform: 'android' },
  ]);
  const [newAppName, setNewAppName] = useState('');
  const [newAppPkg, setNewAppPkg] = useState('');

  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([
    { id: '1', domain: 'reddit.com' },
    { id: '2', domain: 'youtube.com' },
    { id: '3', domain: 'x.com' },
  ]);
  const [newDomain, setNewDomain] = useState('');

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Read 20 pages of non-fiction', rewardMinutes: 20, evidence: 'photo', recurring: true },
    { id: '2', title: 'Deep Work Session (45m)', rewardMinutes: 45, evidence: 'focus', recurring: true },
    { id: '3', title: 'Review System Architecture', rewardMinutes: 15, evidence: 'none', recurring: false },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReward, setNewTaskReward] = useState(15);
  const [newTaskEvidence, setNewTaskEvidence] = useState<'none' | 'photo' | 'focus'>('none');

  // Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: 't1', type: 'earn', source: 'gym', minutes: 60, description: 'Verified gym workout (45 min)', time: '10:30 AM' },
    { id: 't2', type: 'spend', source: 'usage', minutes: 15, description: 'Unlocked Instagram', time: '12:15 PM' },
    { id: 't3', type: 'earn', source: 'task', minutes: 20, description: 'Completed: Read 20 pages', time: '02:00 PM' },
    { id: 't4', type: 'spend', source: 'emergency', minutes: 15, description: 'Emergency Unlock YouTube (3x penalty for 5m)', time: '04:45 PM' },
  ]);

  // Handlers
  const handleAddApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName || !newAppPkg) return;
    setBlockedApps([...blockedApps, { id: Date.now().toString(), name: newAppName, pkg: newAppPkg, platform: 'android' }]);
    setNewAppName('');
    setNewAppPkg('');
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    setBlockedDomains([...blockedDomains, { id: Date.now().toString(), domain: newDomain.toLowerCase().trim() }]);
    setNewDomain('');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle) return;
    setTasks([...tasks, { id: Date.now().toString(), title: newTaskTitle, rewardMinutes: newTaskReward, evidence: newTaskEvidence, recurring: true }]);
    setNewTaskTitle('');
  };

  const handleCompleteTask = (task: Task) => {
    setBalanceMinutes((prev) => Math.min(maxMinutes, prev + task.rewardMinutes));
    setTransactions([
      {
        id: Date.now().toString(),
        type: 'earn',
        source: 'task',
        minutes: task.rewardMinutes,
        description: `Completed: ${task.title}`,
        time: 'Just now'
      },
      ...transactions
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-cyan/10 border border-brand-cyan/30 rounded-xl text-brand-cyan">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                DisciplineOS
              </span>
              <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan">
                v1.0-live
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* Live Balance Pill */}
            <div className="flex items-center space-x-3 bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-1.5">
              <Clock className="w-4 h-4 text-brand-cyan" />
              <div className="text-right">
                <div className="text-sm font-bold text-white font-mono">{balanceMinutes} mins available</div>
                <div className="text-[10px] text-slate-400">Cap: {maxMinutes} mins</div>
              </div>
            </div>

            {/* Sync Badge */}
            <div className="hidden sm:flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>3 Devices Enforced</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-3 space-y-2">
          <nav className="space-y-1">
            {[
              { id: 'overview', label: 'Overview & Ledger', icon: Activity },
              { id: 'policy', label: 'Distraction Policy', icon: Lock },
              { id: 'tasks', label: 'Tasks & Habits', icon: CheckCircle2 },
              { id: 'geofence', label: 'Geofences & Zones', icon: MapPin },
              { id: 'audit', label: 'Audit & Tamper Log', icon: AlertTriangle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/25 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Connected Hardware Card */}
          <div className="pt-6 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">Connected Devices</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-brand-cyan" />
                  <span>Pixel 8 Pro (Phone)</span>
                </div>
                <span className="text-emerald-400">Locked</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-brand-cyan" />
                  <span>Pixel Tablet</span>
                </div>
                <span className="text-emerald-400">Locked</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs">
                <div className="flex items-center space-x-2">
                  <Laptop className="w-4 h-4 text-brand-cyan" />
                  <span>MacBook Air (M3)</span>
                </div>
                <span className="text-emerald-400">Locked</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Dynamic Main Pane */}
        <main className="lg:col-span-9 space-y-6">

          {/* TAB 1: OVERVIEW & LEDGER */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs font-medium text-slate-400 mb-1">Time Bank Balance</div>
                  <div className="text-3xl font-bold text-brand-cyan font-mono">{balanceMinutes} <span className="text-sm font-normal text-slate-400">mins</span></div>
                  <div className="mt-3 text-xs text-slate-500 flex items-center space-x-1">
                    <Flame className="w-3.5 h-3.5 text-brand-emerald" />
                    <span>Earned from verified gym & tasks</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs font-medium text-slate-400 mb-1">Single Active Session Lock</div>
                  <div className="text-xl font-bold text-emerald-400 font-mono mt-1">Zero Active</div>
                  <div className="mt-3 text-xs text-slate-400">No distraction leases running</div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs font-medium text-slate-400 mb-1">Offline Device Reserve</div>
                  <div className="text-xl font-bold text-white font-mono mt-1">30 mins <span className="text-xs text-slate-400">(Phone)</span></div>
                  <div className="mt-3 text-xs text-slate-500">Autonomous offline spending ready</div>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base text-white">Immutable Ledger Transactions</h3>
                  <span className="text-xs text-slate-400 font-mono">Real-time Append Only</span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-3">
                        <span className={`w-2 h-2 rounded-full ${tx.type === 'earn' ? 'bg-emerald-400' : 'bg-brand-rose'}`} />
                        <div>
                          <div className="font-medium text-slate-200">{tx.description}</div>
                          <div className="text-xs text-slate-500 capitalize">{tx.source} • {tx.time}</div>
                        </div>
                      </div>
                      <div className={`font-mono font-bold ${tx.type === 'earn' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.type === 'earn' ? `+${tx.minutes}m` : `-${tx.minutes}m`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: POLICY MANAGEMENT */}
          {activeTab === 'policy' && (
            <div className="space-y-6">
              {/* Blocked Apps */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="font-semibold text-base text-white">Blocked Applications</h3>
                <form onSubmit={handleAddApp} className="flex gap-3">
                  <input
                    type="text"
                    placeholder="App Name (e.g. Reddit)"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  />
                  <input
                    type="text"
                    placeholder="Package (e.g. com.reddit.frontpage)"
                    value={newAppPkg}
                    onChange={(e) => setNewAppPkg(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  />
                  <button type="submit" className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 flex items-center space-x-1">
                    <Plus className="w-4 h-4" />
                    <span>Block App</span>
                  </button>
                </form>

                <div className="space-y-2">
                  {blockedApps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                      <div>
                        <span className="font-medium text-sm text-slate-200">{app.name}</span>
                        <span className="ml-2 text-xs font-mono text-slate-500">({app.pkg})</span>
                      </div>
                      <button
                        onClick={() => setBlockedApps(blockedApps.filter((a) => a.id !== app.id))}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blocked Websites */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="font-semibold text-base text-white">Blocked Domains (DNS Filtering)</h3>
                <form onSubmit={handleAddDomain} className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Domain (e.g. twitter.com)"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  />
                  <button type="submit" className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 flex items-center space-x-1">
                    <Plus className="w-4 h-4" />
                    <span>Block Domain</span>
                  </button>
                </form>

                <div className="space-y-2">
                  {blockedDomains.map((domain) => (
                    <div key={domain.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                      <span className="font-medium text-sm font-mono text-slate-200">{domain.domain}</span>
                      <button
                        onClick={() => setBlockedDomains(blockedDomains.filter((d) => d.id !== domain.id))}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TASKS & HABITS */}
          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="font-semibold text-base text-white">Add Productivity Task</h3>
                <form onSubmit={handleAddTask} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Task Title (e.g. Morning Workout)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  />
                  <input
                    type="number"
                    min="5"
                    max="120"
                    placeholder="Reward Mins"
                    value={newTaskReward}
                    onChange={(e) => setNewTaskReward(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  />
                  <select
                    value={newTaskEvidence}
                    onChange={(e) => setNewTaskEvidence(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="none">No Photo Required</option>
                    <option value="photo">Live Camera Proof Required</option>
                    <option value="focus">Focus Timer Session</option>
                  </select>
                  <button type="submit" className="bg-brand-emerald text-slate-950 font-bold px-4 py-2 rounded-xl text-sm hover:bg-emerald-400 flex items-center justify-center space-x-1">
                    <Plus className="w-4 h-4" />
                    <span>Create Task (+{newTaskReward}m)</span>
                  </button>
                </form>

                <div className="space-y-3 pt-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm text-slate-100">{task.title}</div>
                        <div className="text-xs text-slate-400 flex items-center space-x-2 mt-1">
                          <span className="text-emerald-400 font-bold">+{task.rewardMinutes} mins reward</span>
                          {task.evidence === 'photo' && (
                            <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                              <Camera className="w-3 h-3" />
                              <span>Live Photo Proof</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCompleteTask(task)}
                        className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Mark Complete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GEOFENCES */}
          {activeTab === 'geofence' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="font-semibold text-base text-white">Geofenced Movement Zones</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-200">🏋️ Gym Workout Zone</span>
                      <span className="text-xs text-emerald-400 font-mono">+60 mins reward</span>
                    </div>
                    <p className="text-xs text-slate-400">Min. dwell time: 30 mins • Movement steps verification active</p>
                    <div className="text-xs font-mono text-slate-500">Radius: 100m • Cooldown: 1 / day</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-200">🌳 Outdoor Walk Zone</span>
                      <span className="text-xs text-emerald-400 font-mono">+30 mins reward</span>
                    </div>
                    <p className="text-xs text-slate-400">Home exit duration: 60 mins • Movement steps verification active</p>
                    <div className="text-xs font-mono text-slate-500">Radius: 150m • Cooldown: 1 / day</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h3 className="font-semibold text-base text-white">Protection Degradation & Tamper Events</h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>UsageStats & Accessibility services operational</span>
                  </div>
                  <span className="text-slate-500 font-mono">Pixel 8 Pro</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Local VpnService DNS shield connected</span>
                  </div>
                  <span className="text-slate-500 font-mono">Pixel Tablet</span>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
