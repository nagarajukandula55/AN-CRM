"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";
import { Field, Input, Textarea } from "@/components/ui/Input";

interface TutorialVideo {
  _id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  videoUrl: string;
  thumbnailUrl: string;
  sortOrder: number;
  isPublished: boolean;
}

const emptyForm = {
  key: "",
  title: "",
  description: "",
  category: "",
  videoUrl: "",
  thumbnailUrl: "",
  isPublished: false,
  sortOrder: "0",
};

/**
 * Admin catalog for the vendor Help Center's tutorial videos
 * (/vendor/help). `key` is what a feature page's contextual "Watch
 * tutorial" shortcut links to (see components/shared/TutorialLink.tsx) --
 * add a placeholder row (no videoUrl yet, isPublished off) for any topic
 * that needs a video eventually, then come back and fill in the real
 * videoUrl once it's recorded. videoUrl accepts either a direct video
 * file URL or a YouTube/Vimeo/Loom embed URL.
 */
export default function TutorialVideosPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/tutorial-videos");
  const videos: TutorialVideo[] = data?.success ? data.videos || [] : [];

  const [editing, setEditing] = useState<TutorialVideo | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        key: editing.key,
        title: editing.title,
        description: editing.description || "",
        category: editing.category,
        videoUrl: editing.videoUrl || "",
        thumbnailUrl: editing.thumbnailUrl || "",
        isPublished: editing.isPublished,
        sortOrder: String(editing.sortOrder || 0),
      });
    }
  }, [editing]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setCreating(true);
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!form.title.trim() || !form.category.trim()) return setError("Title and category are required");
    if (creating && !form.key.trim()) return setError("Key is required (e.g. \"telegram-setup\")");

    setSaving(true);
    try {
      const url = editing ? `/api/admin/tutorial-videos/${editing._id}` : "/api/admin/tutorial-videos";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(creating ? { key: form.key.trim() } : {}),
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          videoUrl: form.videoUrl.trim(),
          thumbnailUrl: form.thumbnailUrl.trim(),
          isPublished: form.isPublished,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      const resData = await res.json();
      if (!resData.success) { setError(resData.message || "Failed to save"); return; }
      closeModal();
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function deleteVideo(video: TutorialVideo) {
    if (!confirm(`Delete "${video.title}"? Any page linking to key "${video.key}" will show a missing-video state.`)) return;
    setDeletingId(video._id);
    try {
      await fetch(`/api/admin/tutorial-videos/${video._id}`, { method: "DELETE" });
      mutate();
    } finally {
      setDeletingId(null);
    }
  }

  const byCategory = videos.reduce<Record<string, TutorialVideo[]>>((acc, v) => {
    (acc[v.category] ??= []).push(v);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-bg text-ink p-6 space-y-6">
      <PageHeader
        title="Tutorial Videos"
        description="Manage the video catalog shown in the vendor Help Center, and the videos feature pages link to directly."
        actions={<Button onClick={openCreate}>New Video</Button>}
      />

      {isLoading ? (
        <LoadingPanel label="Loading videos…" />
      ) : videos.length === 0 ? (
        <EmptyState kind="empty" title="No tutorial videos yet" description="Add a placeholder for any topic you'll want a video for, even before you have the footage." />
      ) : (
        <div className="space-y-6">
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category}>
              <h2 className="eyebrow mb-2">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((video) => (
                  <Card key={video._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="h-section">{video.title}</h3>
                        <p className="text-xs text-ink-3 font-mono mt-0.5">{video.key}</p>
                      </div>
                      <Badge tone={video.isPublished ? "success" : video.videoUrl ? "warning" : "neutral"}>
                        {video.isPublished ? "Published" : video.videoUrl ? "Draft" : "Placeholder"}
                      </Badge>
                    </div>
                    {video.description && <p className="text-xs text-ink-2">{video.description}</p>}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(video)}>Edit</Button>
                      <Button size="sm" variant="danger" loading={deletingId === video._id} onClick={() => deleteVideo(video)}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeModal}>
          <div
            className="bg-surface border border-border rounded-card shadow-card-lg max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="h-section">{editing ? "Edit Video" : "New Video"}</h2>

            {error && <p className="text-sm text-danger bg-danger-soft rounded-control p-2">{error}</p>}

            {creating && (
              <Field label="Key" required hint='Stable identifier feature pages link to, e.g. "telegram-setup". Cannot be changed after creating.'>
                <Input value={form.key} onChange={(e) => setForm((p) => ({ ...p, key: e.target.value.trim() }))} placeholder="telegram-setup" />
              </Field>
            )}

            <Field label="Title" required>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Connecting Telegram Alerts" />
            </Field>

            <Field label="Category" required hint="Groups videos on the Help Center page, e.g. Getting Started / Telegram / Workorders / Billing.">
              <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="Getting Started" />
            </Field>

            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
            </Field>

            <Field label="Video URL" hint="A direct video file URL, or a YouTube/Vimeo/Loom embed URL. Leave blank to save this as a placeholder.">
              <Input value={form.videoUrl} onChange={(e) => setForm((p) => ({ ...p, videoUrl: e.target.value }))} placeholder="https://…" />
            </Field>

            <Field label="Thumbnail URL">
              <Input value={form.thumbnailUrl} onChange={(e) => setForm((p) => ({ ...p, thumbnailUrl: e.target.value }))} placeholder="https://…" />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPublished}
                disabled={!form.videoUrl.trim()}
                onChange={(e) => setForm((p) => ({ ...p, isPublished: e.target.checked }))}
              />
              <span className="text-ink-2">Visible to vendors {!form.videoUrl.trim() && <span className="text-ink-3">(add a video URL first)</span>}</span>
            </label>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={save} loading={saving}>Save</Button>
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
