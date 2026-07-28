'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId';

type PostingMode = 'MANUAL' | 'SEMI_AUTO' | 'AUTO';

interface StatusCount { _id: string; count: number }
interface ChannelSummary { total: number; active: number; manual: number; semiAuto: number; auto: number }
interface DashboardStatus {
  byStatus: StatusCount[];
  byMode: StatusCount[];
  totals: { totalViews?: number; totalLikes?: number; totalComments?: number };
  channels: ChannelSummary;
}

interface ZenforgeChannel {
  _id: string;
  channelName: string;
  language: string;
  youtubeChannelId: string;
  niche?: string;
  active: boolean;
  postingMode: PostingMode;
}

interface ZenforgeVideo {
  _id: string;
  videoId: string;
  language: string;
  mode: PostingMode;
  status: string;
  content: { idea: string; hashtags?: string[] };
  video?: { mainVideoUrl?: string };
  createdAt: string;
}

function countFor(list: StatusCount[], id: string): number {
  return list.find((s) => s._id === id)?.count ?? 0;
}

export default function ZenforgeDashboardPage() {
  const { businessId } = useActiveBusinessId();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // New channel form
  const [formOpen, setFormOpen] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [language, setLanguage] = useState('en');
  const [youtubeChannelId, setYoutubeChannelId] = useState('');
  const [niche, setNiche] = useState('ambient');
  const [postingMode, setPostingMode] = useState<PostingMode>('SEMI_AUTO');

  // Manual post form
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLanguage, setManualLanguage] = useState('en');
  const [manualIdea, setManualIdea] = useState('');
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [manualAutoPublish, setManualAutoPublish] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const headers = useCallback(
    (): HeadersInit => ({ 'x-active-business-id': businessId || '' }),
    [businessId]
  );

  const {
    data: statusData,
    error: statusFetchError,
    isLoading: statusLoading,
    mutate: refetchStatus,
  } = useSWR(
    businessId ? ['/api/admin/zenforge/status', businessId] : null,
    async ([url]) => {
      const res = await fetch(url, { headers: headers() });
      if (res.status === 404) return { notConnected: true } as const;
      if (!res.ok) throw new Error('Failed to load status');
      return { notConnected: false, data: (await res.json()) as DashboardStatus };
    }
  );
  const connected: boolean | null = statusLoading ? null : statusFetchError ? false : statusData ? !statusData.notConnected : null;
  const status: DashboardStatus | null = statusData && !statusData.notConnected ? statusData.data : null;

  const { data: channels = [], mutate: refetchChannels } = useSWR(
    businessId && connected ? ['/api/admin/zenforge/channels', businessId] : null,
    async ([url]) => {
      const res = await fetch(url, { headers: headers() });
      return res.ok ? ((await res.json()) as ZenforgeChannel[]) : [];
    }
  );

  const { data: pending = [], mutate: refetchPending } = useSWR(
    businessId && connected ? ['/api/admin/zenforge/videos?status=PENDING_APPROVAL&limit=20', businessId] : null,
    async ([url]) => {
      const res = await fetch(url, { headers: headers() });
      return res.ok ? ((await res.json()) as ZenforgeVideo[]) : [];
    }
  );

  const loading = statusLoading;

  const load = useCallback(() => {
    refetchStatus();
    refetchChannels();
    refetchPending();
  }, [refetchStatus, refetchChannels, refetchPending]);

  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('add-channel');
    try {
      const res = await fetch('/api/admin/zenforge/channels', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, language, youtubeChannelId, niche, postingMode, active: true }),
      });
      if (!res.ok) throw new Error();
      showToast('Channel saved', 'success');
      setChannelName('');
      setYoutubeChannelId('');
      setFormOpen(false);
      load();
    } catch {
      showToast('Failed to save channel', 'error');
    } finally {
      setBusy(null);
    }
  };

  const updateChannelMode = async (channel: ZenforgeChannel, mode: PostingMode) => {
    setBusy(channel._id);
    try {
      const res = await fetch('/api/admin/zenforge/channels', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: channel.channelName, language: channel.language, postingMode: mode }),
      });
      if (!res.ok) throw new Error();
      showToast(`${channel.channelName} set to ${mode}`, 'success');
      load();
    } catch {
      showToast('Failed to update posting mode', 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleChannelActive = async (channel: ZenforgeChannel) => {
    setBusy(channel._id);
    try {
      const res = await fetch('/api/admin/zenforge/channels', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: channel.channelName, language: channel.language, active: !channel.active }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      showToast('Failed to update channel', 'error');
    } finally {
      setBusy(null);
    }
  };

  const decide = async (video: ZenforgeVideo, action: 'approve' | 'reject') => {
    setBusy(video.videoId);
    try {
      const res = await fetch('/api/admin/zenforge/approve', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.videoId, action }),
      });
      if (!res.ok) throw new Error();
      showToast(action === 'approve' ? 'Approved — queued for upload' : 'Rejected', 'success');
      load();
    } catch {
      showToast('Action failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const generateNow = async (lang?: string) => {
    setBusy(`generate-${lang || 'all'}`);
    try {
      const res = await fetch('/api/admin/zenforge/trigger', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) throw new Error();
      showToast(lang ? `Generation triggered for "${lang}"` : 'Generation triggered for all channels', 'success');
    } catch {
      showToast('Could not trigger generation — check GH_PAT/GH_REPO are set in Zenforge', 'error');
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSaving(true);
    try {
      const res = await fetch('/api/admin/zenforge/manual', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: manualLanguage,
          idea: manualIdea,
          mainVideoUrl: manualVideoUrl,
          autoPublish: manualAutoPublish,
        }),
      });
      if (!res.ok) throw new Error();
      showToast(manualAutoPublish ? 'Published' : 'Queued for approval', 'success');
      setManualIdea('');
      setManualVideoUrl('');
      setManualOpen(false);
      load();
    } catch {
      showToast('Failed to create manual post', 'error');
    } finally {
      setManualSaving(false);
    }
  };

  if (connected === false) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-4xl mb-4">🎬</div>
          <h1 className="text-xl font-bold mb-2">Zenforge isn&apos;t connected yet</h1>
          <p className="text-sm text-gray-500 mb-6">
            Connect your deployed Zenforge instance (base URL + API secret) to monitor and control it from here.
          </p>
          <Link
            href="/console/integrations"
            className="inline-block px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium"
          >
            Go to Integrations → Zenforge
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Zenforge</h1>
            <p className="mt-1 text-sm text-gray-500">
              Content generation + posting pipeline — monitored and controlled from here, hosted separately.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => generateNow()}
              disabled={busy === 'generate-all'}
              className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium"
            >
              {busy === 'generate-all' ? 'Triggering…' : '▶ Generate now (all channels)'}
            </button>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">Loading…</div>}

        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Uploaded" value={countFor(status.byStatus, 'UPLOADED')} />
            <StatCard label="Pending approval" value={countFor(status.byStatus, 'PENDING_APPROVAL')} />
            <StatCard label="Failed" value={countFor(status.byStatus, 'FAILED')} />
            <StatCard label="Total YouTube views" value={status.totals.totalViews || 0} />
          </div>
        )}

        {/* Channels */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold">Channels</h2>
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium hover:bg-violet-100"
            >
              {formOpen ? 'Cancel' : '+ Add channel'}
            </button>
          </div>

          {formOpen && (
            <form onSubmit={addChannel} className="px-6 py-4 border-b border-gray-100 grid grid-cols-2 gap-3">
              <input required placeholder="Channel name" value={channelName} onChange={(e) => setChannelName(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="Language (en/hi/te/ta)" value={language} onChange={(e) => setLanguage(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="YouTube channel ID" value={youtubeChannelId} onChange={(e) => setYoutubeChannelId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <select value={postingMode} onChange={(e) => setPostingMode(e.target.value as PostingMode)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="SEMI_AUTO">Semi-auto (generate + human approval)</option>
                <option value="AUTO">Auto (generate + publish immediately)</option>
                <option value="MANUAL">Manual (content supplied directly)</option>
              </select>
              <button disabled={busy === 'add-channel'} className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium">
                {busy === 'add-channel' ? 'Saving…' : 'Save channel'}
              </button>
            </form>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">Name</th>
                <th className="px-6 py-2 font-medium">Language</th>
                <th className="px-6 py-2 font-medium">Mode</th>
                <th className="px-6 py-2 font-medium">Active</th>
                <th className="px-6 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c._id} className="border-b border-gray-50">
                  <td className="px-6 py-3">{c.channelName}</td>
                  <td className="px-6 py-3">{c.language}</td>
                  <td className="px-6 py-3">
                    <select
                      value={c.postingMode || 'SEMI_AUTO'}
                      onChange={(e) => updateChannelMode(c, e.target.value as PostingMode)}
                      disabled={busy === c._id}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="SEMI_AUTO">Semi-auto</option>
                      <option value="AUTO">Auto</option>
                      <option value="MANUAL">Manual</option>
                    </select>
                  </td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => toggleChannelActive(c)}
                      disabled={busy === c._id}
                      className={`text-xs px-2 py-1 rounded-full border ${c.active ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-gray-500 border-gray-200 bg-gray-50'}`}
                    >
                      {c.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {c.postingMode !== 'MANUAL' && (
                      <button
                        onClick={() => generateNow(c.language)}
                        disabled={busy === `generate-${c.language}`}
                        className="text-xs text-violet-600 hover:text-violet-700 underline"
                      >
                        {busy === `generate-${c.language}` ? 'Triggering…' : 'Generate now'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {channels.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-gray-400">No channels yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Pending approvals */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold">Pending approval</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((v) => (
              <div key={v.videoId} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{v.content.idea}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{v.language} · {v.videoId}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => decide(v, 'approve')}
                    disabled={busy === v.videoId}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100"
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => decide(v, 'reject')}
                    disabled={busy === v.videoId}
                    className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-100"
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
            {pending.length === 0 && (
              <div className="px-6 py-6 text-center text-gray-400 text-sm">Nothing waiting on approval.</div>
            )}
          </div>
        </section>

        {/* Manual post */}
        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold">Manual post</h2>
            <button
              onClick={() => setManualOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium hover:bg-violet-100"
            >
              {manualOpen ? 'Cancel' : '+ New manual post'}
            </button>
          </div>
          {manualOpen && (
            <form onSubmit={submitManual} className="px-6 py-4 space-y-3">
              <input required placeholder="Language (must match an active channel)" value={manualLanguage} onChange={(e) => setManualLanguage(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <textarea required placeholder="Idea / caption" value={manualIdea} onChange={(e) => setManualIdea(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="Already-hosted video URL" value={manualVideoUrl} onChange={(e) => setManualVideoUrl(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={manualAutoPublish} onChange={(e) => setManualAutoPublish(e.target.checked)} />
                Publish immediately (skip approval)
              </label>
              <button disabled={manualSaving} className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium">
                {manualSaving ? 'Saving…' : manualAutoPublish ? 'Publish' : 'Queue for approval'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
