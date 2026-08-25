import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  Flame,
  Globe2,
  Laptop2,
  LockKeyhole,
  MapPin,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Smartphone,
  Terminal,
  TimerReset,
  Trash2,
  UnlockKeyhole,
  Wifi,
  Zap,
} from 'lucide-react';

type Tab = 'policy' | 'geofence' | 'tasks' | 'ledger';
type TargetType = 'app' | 'site';

type BlockedApp = {
  id: string;
  name: string;
  pkg: string;
  category: string;
  isActive: boolean;
};

type BlockedDomain = {
  id: string;
  domain: string;
  category: string;
  isActive: boolean;
};

type TaskItem = {
  id: string;
  title: string;
  description: string;
  rewardMins: number;
  evidenceType: 'photo' | 'geofence' | 'timer' | 'none';
  streak: number;
  isCompletedToday: boolean;
};

type LedgerEntry = {
  id: string;
  type: 'EARN' | 'SPEND' | 'EMERGENCY' | 'SYNC';
  description: string;
  deltaMins: number;
  balanceAfterMins: number;
  timestamp: string;
  signature: string;
};

type ActiveLease = {
  target: string;
  type: TargetType;
  secondsRemaining: number;
  isEmergency: boolean;
};

const tabs: Array<{ id: Tab; label: string; shortLabel: string; icon: typeof ShieldCheck }> = [
  { id: 'policy', label: 'Policy Engine', shortLabel: 'Policy', icon: ShieldCheck },
  { id: 'geofence', label: 'Geofence Radar', shortLabel: 'Radar', icon: MapPin },
  { id: 'tasks', label: 'Tasks & Habits', shortLabel: 'Tasks', icon: Activity },
  { id: 'ledger', label: 'Ledger Audit', shortLabel: 'Ledger', icon: Database },
];

function formatLeaseTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

function eventDescription(type: LedgerEntry['type']): string {
  if (type === 'EARN') return 'earned';
  if (type === 'SPEND') return 'spent';
  if (type === 'EMERGENCY') return 'penalized';
  return 'synced';
}

function StatusMark({ tone = 'live' }: { tone?: 'live' | 'quiet' | 'warn' }) {
  return <span aria-hidden="true" className={`status-mark status-mark-${tone}`} />;
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('policy');
  const [balanceMins, setBalanceMins] = useState(60);
  const maxCapacityMins = 240;
  const [activeLease, setActiveLease] = useState<ActiveLease | null>(null);
  const [notice, setNotice] = useState('Authority synchronized 12 seconds ago.');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);

  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([
    { id: '1', name: 'Instagram', pkg: 'com.instagram.android', category: 'Social', isActive: true },
    { id: '2', name: 'YouTube', pkg: 'com.google.android.youtube', category: 'Video', isActive: true },
    { id: '3', name: 'TikTok', pkg: 'com.zhiliaoapp.musically', category: 'Social', isActive: true },
    { id: '4', name: 'X / Twitter', pkg: 'com.twitter.android', category: 'Social', isActive: true },
    { id: '5', name: 'Reddit', pkg: 'com.reddit.frontpage', category: 'Discussion', isActive: true },
    { id: '6', name: 'Netflix', pkg: 'com.netflix.mediaclient', category: 'Video', isActive: true },
  ]);
  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([
    { id: '1', domain: 'instagram.com', category: 'Social', isActive: true },
    { id: '2', domain: 'youtube.com', category: 'Video', isActive: true },
    { id: '3', domain: 'tiktok.com', category: 'Social', isActive: true },
    { id: '4', domain: 'twitter.com', category: 'Social', isActive: true },
    { id: '5', domain: 'x.com', category: 'Social', isActive: true },
    { id: '6', domain: 'reddit.com', category: 'Discussion', isActive: true },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTargetInput, setNewTargetInput] = useState('');
  const emergencyCancelRef = useRef<HTMLButtonElement>(null);
  const emergencyTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogWasOpenRef = useRef(false);
  const [newTargetType, setNewTargetType] = useState<TargetType>('app');

  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: 't-1',
      title: 'Morning Gym & Strength Training',
      description: '30+ min workout verified with physical proof',
      rewardMins: 45,
      evidenceType: 'photo',
      streak: 6,
      isCompletedToday: false,
    },
    {
      id: 't-2',
      title: 'Deep Engineering Sprint',
      description: '45 minutes of uninterrupted architecture work',
      rewardMins: 30,
      evidenceType: 'timer',
      streak: 12,
      isCompletedToday: true,
    },
    {
      id: 't-3',
      title: 'Read 20 Pages of Non-Fiction',
      description: 'Reading session verified with timestamped proof',
      rewardMins: 20,
      evidenceType: 'photo',
      streak: 4,
      isCompletedToday: false,
    },
  ]);

  const [ledger, setLedger] = useState<LedgerEntry[]>([
    {
      id: 'tx-1',
      type: 'EARN',
      description: 'Completed task: Deep Engineering Sprint',
      deltaMins: 30,
      balanceAfterMins: 60,
      timestamp: 'Just now',
      signature: '8f3a9e...e7b1',
    },
    {
      id: 'tx-2',
      type: 'SPEND',
      description: 'Unlocked YouTube on Android',
      deltaMins: -5,
      balanceAfterMins: 30,
      timestamp: '2 hours ago',
      signature: '2b4c1d...a94f',
    },
    {
      id: 'tx-3',
      type: 'EARN',
      description: 'Gym dwell verified at Strength Club',
      deltaMins: 35,
      balanceAfterMins: 35,
      timestamp: 'Today 07:15',
      signature: '5e8a2b...c38d',
    },
  ]);

  const filteredApps = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return blockedApps.filter((app) => app.name.toLowerCase().includes(query) || app.pkg.toLowerCase().includes(query));
  }, [blockedApps, searchQuery]);
  const filteredDomains = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return blockedDomains.filter((domain) => domain.domain.toLowerCase().includes(query));
  }, [blockedDomains, searchQuery]);
  const balancePercent = Math.round((balanceMins / maxCapacityMins) * 100);
  const activeMeterTiles = Math.round((balanceMins / maxCapacityMins) * 24);

  useEffect(() => {
    if (!activeLease) return undefined;
    const interval = window.setInterval(() => {
      setActiveLease((previous) => {
        if (!previous || previous.secondsRemaining <= 1) {
          setNotice('Lease expired. All devices returned to enforced mode.');
          return null;
        }
        return { ...previous, secondsRemaining: previous.secondsRemaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeLease]);
  useEffect(() => {
    if (emergencyOpen) {
      dialogWasOpenRef.current = true;
      emergencyCancelRef.current?.focus();
      return;
    }
    if (dialogWasOpenRef.current) {
      dialogWasOpenRef.current = false;
      emergencyTriggerRef.current?.focus();
    }
  }, [emergencyOpen]);

  const handleEmergencyKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setEmergencyOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentTab: Tab) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  };

  const handleUnlock = (target: string, type: TargetType, mins: number, isEmergency: boolean) => {
    if (activeLease) {
      setNotice(`Global lock busy: ${activeLease.target} has ${formatLeaseTime(activeLease.secondsRemaining)} remaining.`);
      return;
    }
    const cost = isEmergency ? mins * 3 : mins;
    if (balanceMins < cost) {
      setNotice(`Unlock refused: ${cost} minutes required, ${balanceMins} available.`);
      return;
    }
    const nextBalance = balanceMins - cost;
    setBalanceMins(nextBalance);
    setActiveLease({ target, type, secondsRemaining: mins * 60, isEmergency });
    setLedger((previous) => [
      {
        id: `tx-${Date.now()}`,
        type: isEmergency ? 'EMERGENCY' : 'SPEND',
        description: `${isEmergency ? 'Emergency' : 'Temporary'} unlock: ${target}`,
        deltaMins: -cost,
        balanceAfterMins: nextBalance,
        timestamp: 'Just now',
        signature: isEmergency ? 'emergency-3x...signed' : 'lease-hmac...signed',
      },
      ...previous,
    ]);
    setNotice(`${isEmergency ? 'Emergency lease' : 'Lease'} issued for ${mins} minutes. Global lock is active.`);
  };

  const handleCompleteTask = (taskId: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.isCompletedToday) return;
    const nextBalance = Math.min(maxCapacityMins, balanceMins + task.rewardMins);
    setTasks((previous) =>
      previous.map((candidate) =>
        candidate.id === taskId ? { ...candidate, isCompletedToday: true, streak: candidate.streak + 1 } : candidate,
      ),
    );
    setBalanceMins(nextBalance);
    setLedger((previous) => [
      {
        id: `tx-${Date.now()}`,
        type: 'EARN',
        description: `Task verified: ${task.title}`,
        deltaMins: task.rewardMins,
        balanceAfterMins: nextBalance,
        timestamp: 'Just now',
        signature: 'proof-sha256...verified',
      },
      ...previous,
    ]);
    setNotice(`Proof accepted. ${task.rewardMins} minutes added to the time bank.`);
  };

  const handleAddTarget = () => {
    const value = newTargetInput.trim();
    if (!value) {
      setNotice('Enter an app package or domain before adding a target.');
      return;
    }
    if (newTargetType === 'app') {
      setBlockedApps((previous) => [
        ...previous,
        {
          id: `app-${Date.now()}`,
          name: value.split('.').pop() || value,
          pkg: value,
          category: 'Custom',
          isActive: true,
        },
      ]);
    } else {
      setBlockedDomains((previous) => [
        ...previous,
        { id: `site-${Date.now()}`, domain: value.toLowerCase(), category: 'Custom', isActive: true },
      ]);
    }
    setNewTargetInput('');
    setNotice(`${newTargetType === 'app' ? 'App package' : 'Domain'} added to the enforced policy.`);
  };

  const queueRemoval = (targetType: TargetType, id: string) => {
    const key = `${targetType}:${id}`;
    if (pendingRemovals.includes(key)) return;
    setPendingRemovals((previous) => [...previous, key]);
    setNotice('Removal queued for server approval. The target stays blocked during the 24-hour cooling-off period.');
  };

  return (
    <div className="field-app">
      <div className="field-backdrop" aria-hidden="true" />
      <header className="field-header">
        <div className="field-header-inner">
          <div className="field-brand">
            <span className="brand-grid" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <div>
              <p className="brand-name">DISCIPLINE<span>OS</span></p>
              <p className="brand-subtitle">FOCUS FIELD // CONTROL ROOM</p>
            </div>
          </div>
          <div className="header-readout" aria-label="System status">
            <span className="readout-label">AUTHORITY</span>
            <span className="readout-value"><StatusMark /> ONLINE</span>
          </div>
          <div className="device-strip" aria-label="Connected devices">
            <span className="device-chip"><Smartphone aria-hidden="true" /> <span className="device-name">PIXEL 9 PRO</span><StatusMark /></span>
            <span className="device-chip"><Laptop2 aria-hidden="true" /> <span className="device-name">MACBOOK AIR</span><StatusMark /></span>
            <span className="device-chip"><Wifi aria-hidden="true" /> <span className="device-name">RAILWAY NODE</span><StatusMark /></span>
          </div>
        </div>
      </header>

      <main className="field-main">
        <section className="field-intro">
          <div>
            <h1>Your attention has a balance.</h1>
            <p>Earn access through verified effort. Spend it deliberately. One policy, enforced everywhere.</p>
          </div>
          <div className="protocol-stamp">
            <span>SESSION / 18</span>
            <strong>08:42:16</strong>
            <span>UTC // ACTIVE</span>
          </div>
        </section>

        <div className="field-notice" role="status" aria-live="polite">
          <Radio aria-hidden="true" />
          <span>{notice}</span>
          <span className="notice-code">SYNC/OK</span>
        </div>

        {activeLease && (
          <section className={`lease-band ${activeLease.isEmergency ? 'lease-band-emergency' : ''}`} aria-label="Active distraction lease">
            <div className="lease-symbol" aria-hidden="true"><UnlockKeyhole /></div>
            <div className="lease-copy">
              <h2>{activeLease.isEmergency ? 'Emergency lease active' : 'Temporary lease active'}</h2>
              <p><strong>{activeLease.target}</strong> · {activeLease.type === 'app' ? 'application package' : 'website domain'} · all other distractions remain locked</p>
            </div>
            <div className="lease-clock"><span>{formatLeaseTime(activeLease.secondsRemaining)}</span><small>REMAINING</small></div>
            <button className="button button-dark" type="button" onClick={() => setActiveLease(null)}><LockKeyhole aria-hidden="true" /> Lock now</button>
          </section>
        )}

        <section className="hero-field" aria-label="Time bank overview">
          <div className="bank-panel field-panel">
            <div className="panel-heading">
              <div>
                <h2>TIME BANK</h2>
                <p>Available distraction allowance</p>
              </div>
              <span className="panel-code">TB-04 // IMMUTABLE</span>
            </div>
            <div className="bank-readout">
              <div className="digital-time" aria-label={`${balanceMins} minutes available`}>
                {Math.floor(balanceMins / 60).toString().padStart(2, '0')}<span>:</span>{(balanceMins % 60).toString().padStart(2, '0')}
              </div>
              <div className="bank-unit">HOURS : MINUTES</div>
            </div>
            <div className="tile-meter" role="meter" aria-label="Time bank capacity" aria-valuenow={balanceMins} aria-valuemin={0} aria-valuemax={maxCapacityMins}>
              {Array.from({ length: 24 }, (_, index) => <span key={index} className={index < activeMeterTiles ? 'tile-on' : ''} />)}
            </div>
            <div className="meter-meta"><span>0 MIN</span><strong>{balancePercent}% STORED</strong><span>{maxCapacityMins} MIN CAP</span></div>
            <div className="bank-stats">
              <div><span>AVAILABLE</span><strong>{balanceMins}m</strong></div>
              <div><span>RESERVED</span><strong>0m</strong></div>
              <div><span>HARD CAP</span><strong>{maxCapacityMins}m</strong></div>
            </div>
            <div className="bank-actions">
              <button className="button button-primary" type="button" onClick={() => handleUnlock('instagram.com', 'site', 5, false)}><TimerReset aria-hidden="true" /> Test 5m lease <ArrowUpRight aria-hidden="true" /></button>
              <button className="button button-outline" type="button" onClick={() => setActiveTab('tasks')}><Zap aria-hidden="true" /> Earn time</button>
            </div>
          </div>

          <aside className="protection-panel field-panel">
            <div className="panel-heading"><div><h2>PROTECTION STATE</h2><p>Enforcement across the field</p></div><ShieldCheck aria-hidden="true" /></div>
            <div className="protection-list">
              <div><StatusMark /><span>GLOBAL POLICY</span><strong>ENFORCED</strong></div>
              <div><StatusMark /><span>ANDROID VPN</span><strong>CONNECTED</strong></div>
              <div><StatusMark /><span>MACOS AGENT</span><strong>CONNECTED</strong></div>
              <div><StatusMark tone="warn" /><span>SYNC LATENCY</span><strong>12s</strong></div>
            </div>
            <div className="protection-foot"><Terminal aria-hidden="true" /><span>Server authority is the source of truth.</span></div>
            <button className="text-action" type="button" onClick={() => setActiveTab('ledger')}>Inspect audit trail <ChevronRight aria-hidden="true" /></button>
          </aside>
        </section>

        <nav className="field-nav" aria-label="Control room sections" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                className={`field-tab ${selected ? 'field-tab-selected' : ''}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? `${tab.id}-workspace` : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              >
                <Icon aria-hidden="true" />
                <span className="tab-label-wide">{tab.label}</span>
                <span className="tab-label-short">{tab.shortLabel}</span>
                {selected && <span className="tab-cursor" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        {activeTab === 'policy' && (
          <section className="workspace" id="policy-workspace" role="tabpanel" aria-labelledby="policy-tab">
            <div className="workspace-heading">
              <div><h2>Policy engine</h2><p>Block by default. Weakening waits for the future version of you.</p></div>
              <div className="workspace-count"><strong>{blockedApps.length + blockedDomains.length}</strong><span>ACTIVE TARGETS</span></div>
            </div>
            <div className="policy-controls field-panel">
              <div className="search-field"><label htmlFor="policy-search">Find a blocked target</label><Search aria-hidden="true" /><input id="policy-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search app package or domain" /></div>
              <div className="add-target"><label htmlFor="target-type">Add target</label><select id="target-type" value={newTargetType} onChange={(event) => setNewTargetType(event.target.value as TargetType)}><option value="app">APP PACKAGE</option><option value="site">WEBSITE DOMAIN</option></select><input aria-label="New target identifier" value={newTargetInput} onChange={(event) => setNewTargetInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleAddTarget(); }} placeholder={newTargetType === 'app' ? 'com.example.app' : 'domain.com'} /><button className="button button-primary" type="button" onClick={handleAddTarget}><Plus aria-hidden="true" /> Add</button></div>
            </div>
            <div className="policy-grid">
              <section className="target-column" aria-labelledby="apps-heading">
                <div className="column-heading"><div><h3 id="apps-heading"><Smartphone aria-hidden="true" /> Applications</h3><p>USAGESTATS / ANDROID</p></div><span>{filteredApps.length.toString().padStart(2, '0')}</span></div>
                <div className="target-list">
                  {filteredApps.map((app) => {
                    const queued = pendingRemovals.includes(`app:${app.id}`);
                    return <div className="target-row" key={app.id}><div className="target-index" aria-hidden="true">A</div><div className="target-copy"><strong>{app.name}</strong><span>{app.pkg}</span></div><span className="target-category">{app.category}</span><div className="target-actions"><button className="mini-button" type="button" onClick={() => handleUnlock(app.name, 'app', 5, false)} disabled={queued || Boolean(activeLease)}>{queued ? 'QUEUED' : '5M LEASE'}</button><button className="icon-button" type="button" aria-label={`Queue removal of ${app.name}`} onClick={() => queueRemoval('app', app.id)} disabled={queued}><Trash2 aria-hidden="true" /></button></div></div>;
                  })}
                </div>
              </section>
              <section className="target-column" aria-labelledby="domains-heading">
                <div className="column-heading"><div><h3 id="domains-heading"><Globe2 aria-hidden="true" /> Websites</h3><p>DNS VPN / ALL DEVICES</p></div><span>{filteredDomains.length.toString().padStart(2, '0')}</span></div>
                <div className="target-list">
                  {filteredDomains.map((site) => {
                    const queued = pendingRemovals.includes(`site:${site.id}`);
                    return <div className="target-row" key={site.id}><div className="target-index target-index-alt" aria-hidden="true">W</div><div className="target-copy"><strong>{site.domain}</strong><span>Redirected to focus shield</span></div><span className="target-category">{site.category}</span><div className="target-actions"><button className="mini-button" type="button" onClick={() => handleUnlock(site.domain, 'site', 5, false)} disabled={queued || Boolean(activeLease)}>{queued ? 'QUEUED' : '5M LEASE'}</button><button className="icon-button" type="button" aria-label={`Queue removal of ${site.domain}`} onClick={() => queueRemoval('site', site.id)} disabled={queued}><Trash2 aria-hidden="true" /></button></div></div>;
                  })}
                </div>
              </section>
            </div>
            <div className="cooling-note"><AlertTriangle aria-hidden="true" /><span>Removal is never instant. The server holds every weakening request for 24 hours before it can take effect.</span></div>
          </section>
        )}

        {activeTab === 'geofence' && (
          <section className="workspace" id="geofence-workspace" role="tabpanel" aria-labelledby="geofence-tab">
            <div className="workspace-heading"><div><h2>Geofence radar</h2><p>Physical proof earns time without trusting a single client report.</p></div><div className="workspace-count"><strong>02</strong><span>ACTIVE ZONES</span></div></div>
            <div className="radar-layout">
              <div className="radar-panel field-panel">
                <div className="radar-stage" aria-label="Strength Club geofence currently active"><span className="radar-ring radar-ring-one" /><span className="radar-ring radar-ring-two" /><span className="radar-ring radar-ring-three" /><span className="radar-sweep" /><span className="radar-point"><MapPin aria-hidden="true" /></span><span className="radar-coordinate">40.7128° N<br />74.0060° W</span></div>
                <div className="radar-caption"><div><h3>Strength Club</h3><p>GYM ZONE / MOVEMENT VERIFIED</p></div><strong>42:18</strong></div>
                <div className="dwell-meter"><span style={{ width: '70%' }} /></div><div className="meter-meta"><span>00:00</span><strong>REWARD AT 30:00</strong><span>60 MIN</span></div>
              </div>
              <div className="zone-stream">
                <div className="stream-heading"><h3>Zone protocols</h3><span>SERVER-VERIFIED RULES</span></div>
                <div className="zone-row zone-row-active"><div className="zone-symbol"><MapPin aria-hidden="true" /></div><div><strong>Gym / Fitness Club</strong><p>30m dwell + movement telemetry</p></div><span className="zone-reward">+60m</span><StatusMark /></div>
                <div className="zone-row"><div className="zone-symbol"><CircleDot aria-hidden="true" /></div><div><strong>Deep Work Office</strong><p>Arrival starts total distraction lockdown</p></div><span className="zone-reward zone-reward-neutral">LOCK</span><StatusMark tone="quiet" /></div>
                <div className="zone-log"><span>LAST EVENT</span><strong>07:15:32</strong><p>Gym exit accepted · dwell 42m · movement signal present</p></div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'tasks' && (
          <section className="workspace" id="tasks-workspace" role="tabpanel" aria-labelledby="tasks-tab">
            <div className="workspace-heading"><div><h2>Tasks & habits</h2><p>Proof-of-work protocols turn real effort into future choice.</p></div><div className="workspace-count"><strong>{tasks.filter((task) => task.isCompletedToday).length}/{tasks.length}</strong><span>COMPLETE TODAY</span></div></div>
            <div className="task-board field-panel">
              <div className="task-board-head"><span>PROTOCOL</span><span>PROOF TYPE</span><span>STREAK</span><span>REWARD</span><span>STATE</span></div>
              {tasks.map((task, index) => <div className={`task-row ${task.isCompletedToday ? 'task-row-complete' : ''}`} key={task.id}><div className="task-main"><span className="task-number">0{index + 1}</span><div><strong>{task.title}</strong><p>{task.description}</p></div></div><span className="proof-type">{task.evidenceType === 'photo' ? <Camera aria-hidden="true" /> : <TimerReset aria-hidden="true" />}{task.evidenceType.toUpperCase()}</span><span className="streak"><Flame aria-hidden="true" /> {task.streak}D</span><strong className="task-reward">+{task.rewardMins}M</strong><div>{task.isCompletedToday ? <span className="complete-state"><Check aria-hidden="true" /> VERIFIED</span> : <button className="mini-button mini-button-primary" type="button" onClick={() => handleCompleteTask(task.id)}><Camera aria-hidden="true" /> SUBMIT PROOF</button>}</div></div>)}
            </div>
            <div className="task-foot"><span><CheckCircle2 aria-hidden="true" /> Evidence is reviewed by the server before crediting the ledger.</span><button className="text-action" type="button" onClick={() => setActiveTab('ledger')}>View earned time <ChevronRight aria-hidden="true" /></button></div>
          </section>
        )}

        {activeTab === 'ledger' && (
          <section className="workspace" id="ledger-workspace" role="tabpanel" aria-labelledby="ledger-tab">
            <div className="workspace-heading"><div><h2>Ledger audit</h2><p>Append-only history for every earned minute and every deliberate spend.</p></div><div className="workspace-count"><strong>SHA-256</strong><span>CHAIN INTACT</span></div></div>
            <div className="ledger-board field-panel"><div className="ledger-table-wrap"><table><caption className="sr-only">Immutable ledger history</caption><thead><tr><th scope="col">EVENT</th><th scope="col">DESCRIPTION</th><th scope="col">DELTA</th><th scope="col">BALANCE</th><th scope="col">SIGNATURE</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry.id}><td><span className={`ledger-tag ledger-tag-${entry.type.toLowerCase()}`}>{entry.type}</span></td><td><strong>{entry.description}</strong><span className="table-time">{entry.timestamp}</span></td><td className={entry.deltaMins > 0 ? 'delta-positive' : 'delta-negative'}>{entry.deltaMins > 0 ? '+' : ''}{entry.deltaMins}m <span className="sr-only">{eventDescription(entry.type)}</span></td><td>{entry.balanceAfterMins}m</td><td><span className="signature"><CheckCircle2 aria-hidden="true" /> {entry.signature}</span></td></tr>)}</tbody></table></div><div className="ledger-foot"><span><Database aria-hidden="true" /> 3 entries shown · local view mirrors server authority</span><span>READ ONLY</span></div></div>
          </section>
        )}

        <section className="emergency-panel" aria-label="Emergency unlock protocol">
          <div><AlertTriangle aria-hidden="true" /><div><h2>Emergency protocol</h2><p>When you must break the shield, the server charges a fixed 3× penalty. No client can choose the multiplier.</p></div></div>
          <button ref={emergencyTriggerRef} className="button button-emergency" type="button" onClick={() => setEmergencyOpen(true)}><UnlockKeyhole aria-hidden="true" /> Request emergency lease</button>
        </section>
      </main>

      <footer className="field-footer"><span>DISCIPLINEOS / CONTROLLED ATTENTION SYSTEM</span><span>POLICY v1.4 · AUTHORITY ONLINE</span></footer>

      {emergencyOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setEmergencyOpen(false)}>
          <section className="emergency-dialog" role="dialog" aria-modal="true" aria-labelledby="emergency-title" onKeyDown={handleEmergencyKeyDown} onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-icon"><AlertTriangle aria-hidden="true" /></div>
            <h2 id="emergency-title">Request a 5-minute emergency lease?</h2>
            <p>This action costs <strong>15 minutes</strong> from the authoritative time bank. The fixed 3× penalty cannot be changed by this dashboard.</p>
            <div className="dialog-actions"><button ref={emergencyCancelRef} className="button button-outline" type="button" onClick={() => setEmergencyOpen(false)}>Cancel</button><button className="button button-emergency" type="button" onClick={() => { setEmergencyOpen(false); handleUnlock('Emergency override', 'app', 5, true); }}>Confirm 3× cost</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
