'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import {
  ArrowLeft,
  Settings,
  Key,
  Check,
  X,
  Loader2,
  Image,
  Copy,
  Download,
  ChevronDown,
  Sparkles,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderName = 'openai' | 'anthropic' | 'google' | 'stabilityai' | 'openrouter'
type ImageProvider = 'openai' | 'stabilityai'
type TextProvider = 'openai' | 'anthropic' | 'google' | 'openrouter'

interface ProviderConfig {
  apiKey: string | null
  isEnabled: boolean
  model?: string
}

interface AIProviderConfig {
  providers: {
    openai: ProviderConfig & { model: string }
    anthropic: ProviderConfig & { model: string }
    google: ProviderConfig & { model: string }
    stabilityai: ProviderConfig
    openrouter: ProviderConfig & { model: string }
  }
  defaultImageProvider: ImageProvider
  defaultTextProvider: TextProvider
}

interface ProviderMeta {
  name: ProviderName
  label: string
  emoji: string
  description: string
  hasModel: boolean
  defaultModel?: string
  placeholder: string
  type: 'image' | 'text' | 'both'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_META: ProviderMeta[] = [
  {
    name: 'openai',
    label: 'OpenAI',
    emoji: '🤖',
    description: 'GPT-4o and DALL-E 3 image generation',
    hasModel: true,
    defaultModel: 'gpt-4o',
    placeholder: 'sk-...',
    type: 'both',
  },
  {
    name: 'anthropic',
    label: 'Anthropic',
    emoji: '🧠',
    description: 'Claude models for advanced reasoning',
    hasModel: true,
    defaultModel: 'claude-3-5-sonnet-20241022',
    placeholder: 'sk-ant-...',
    type: 'text',
  },
  {
    name: 'google',
    label: 'Google Gemini',
    emoji: '✨',
    description: 'Gemini models for multimodal tasks',
    hasModel: true,
    defaultModel: 'gemini-1.5-pro',
    placeholder: 'AIza...',
    type: 'text',
  },
  {
    name: 'stabilityai',
    label: 'Stability AI',
    emoji: '🎨',
    description: 'Stable Diffusion image generation',
    hasModel: false,
    placeholder: 'sk-...',
    type: 'image',
  },
  {
    name: 'openrouter',
    label: 'OpenRouter',
    emoji: '🔀',
    description: 'Access multiple AI models via one API',
    hasModel: true,
    defaultModel: 'openai/gpt-4o-mini',
    placeholder: 'sk-or-...',
    type: 'text',
  },
]

const IMAGE_STYLES = [
  'Realistic',
  'Cartoon',
  'Watercolor',
  'Oil Painting',
  'Sketch',
  'Digital Art',
  'Minimalist',
  'Vintage',
]

const IMAGE_SIZES = ['1024x1024', '1792x1024', '1024x1792']

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'Twitter', 'WhatsApp']

const TONES = ['Professional', 'Casual', 'Funny', 'Inspirational', 'Urgent', 'Friendly']

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ configured }: { configured: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        configured
          ? 'bg-green-100 text-green-700'
          : 'bg-red-100 text-red-600'
      )}
    >
      {configured ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {configured ? 'Configured' : 'Not configured'}
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        checked ? 'bg-blue-600' : 'bg-gray-300',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} />
}

// ---------------------------------------------------------------------------
// Provider Card
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  meta: ProviderMeta
  providerData: ProviderConfig & { model?: string }
  defaultImageProvider: ImageProvider
  defaultTextProvider: TextProvider
  onSave: (
    providerName: ProviderName,
    data: { apiKey: string; isEnabled: boolean; model?: string }
  ) => Promise<void>
  onSetDefaultImage: (p: ImageProvider) => void
  onSetDefaultText: (p: TextProvider) => void
}

function ProviderCard({
  meta,
  providerData,
  defaultImageProvider,
  defaultTextProvider,
  onSave,
  onSetDefaultImage,
  onSetDefaultText,
}: ProviderCardProps) {
  const [apiKey, setApiKey] = useState(providerData.apiKey ?? '')
  const [isEnabled, setIsEnabled] = useState(providerData.isEnabled)
  const [model, setModel] = useState(providerData.model ?? meta.defaultModel ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    setApiKey(providerData.apiKey ?? '')
    setIsEnabled(providerData.isEnabled)
    setModel(providerData.model ?? meta.defaultModel ?? '')
  }, [providerData, meta.defaultModel])

  const isConfigured = Boolean(providerData.apiKey)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(meta.name, { apiKey, isEnabled, model: meta.hasModel ? model : undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const isDefaultImage = meta.type !== 'text' && defaultImageProvider === meta.name
  const isDefaultText = meta.type !== 'image' && defaultTextProvider === meta.name

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{meta.label}</h3>
            <p className="text-xs text-gray-500">{meta.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge configured={isConfigured} />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Enabled</span>
            <Toggle checked={isEnabled} onChange={setIsEnabled} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* API Key */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            <Key className="mr-1 inline h-3 w-3" />
            API Key
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? '••••••••' : meta.placeholder}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Model */}
        {meta.hasModel && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.defaultModel}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Default selectors */}
        <div className="flex flex-wrap gap-2 pt-1">
          {(meta.type === 'image' || meta.type === 'both') && (
            <button
              type="button"
              onClick={() => onSetDefaultImage(meta.name as ImageProvider)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                isDefaultImage
                  ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {isDefaultImage ? '★ Default for Images' : 'Set Default for Images'}
            </button>
          )}
          {(meta.type === 'text' || meta.type === 'both') && (
            <button
              type="button"
              onClick={() => onSetDefaultText(meta.name as TextProvider)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                isDefaultText
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {isDefaultText ? '★ Default for Text' : 'Set Default for Text'}
            </button>
          )}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (
            <Spinner className="h-4 w-4" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : null}
          {saved ? 'Saved!' : 'Save'}
        </button>
        {saveError && <p className="mt-1.5 text-xs text-red-600">{saveError}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Provider Settings Panel
// ---------------------------------------------------------------------------

interface ProviderSettingsPanelProps {
  config: AIProviderConfig | null
  loading: boolean
  onSaveProvider: (
    name: ProviderName,
    data: { apiKey: string; isEnabled: boolean; model?: string }
  ) => Promise<void>
  onSetDefaultImage: (p: ImageProvider) => void
  onSetDefaultText: (p: TextProvider) => void
}

function ProviderSettingsPanel({
  config,
  loading,
  onSaveProvider,
  onSetDefaultImage,
  onSetDefaultText,
}: ProviderSettingsPanelProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Provider Settings</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {config
              ? Object.values(config.providers).filter((p) => p.apiKey).length
              : 0}{' '}
            configured
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-6 pb-6 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-6 w-6 text-blue-600" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {PROVIDER_META.map((meta) => {
                const providerData = config?.providers[meta.name] ?? {
                  apiKey: null,
                  isEnabled: false,
                  model: meta.defaultModel,
                }
                return (
                  <ProviderCard
                    key={meta.name}
                    meta={meta}
                    providerData={providerData}
                    defaultImageProvider={config?.defaultImageProvider ?? 'openai'}
                    defaultTextProvider={config?.defaultTextProvider ?? 'openai'}
                    onSave={onSaveProvider}
                    onSetDefaultImage={onSetDefaultImage}
                    onSetDefaultText={onSetDefaultText}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image Generation Tab
// ---------------------------------------------------------------------------

interface ImageTabProps {
  config: AIProviderConfig | null
}

function ImageTab({ config }: ImageTabProps) {
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [generating, setGenerating] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const hasImageProvider =
    config?.providers?.openai?.isEnabled ||
    config?.providers?.stabilityai?.isEnabled

  async function handleGenerate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    setImageUrl(null)

    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, size }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setImageUrl(data.url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyUrl() {
    if (!imageUrl) return
    await copyToClipboard(imageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `ai-image-${Date.now()}.png`
    a.target = '_blank'
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">No specific style</option>
                {IMAGE_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {IMAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!hasImageProvider && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Configure OpenAI or Stability AI above to enable image generation.
            </p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!hasImageProvider || !prompt.trim() || generating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 py-3 text-sm font-semibold text-white hover:from-blue-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <Spinner className="h-4 w-4" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Image
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Generated Image</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy URL'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          </div>
          <div className="p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="AI generated"
              className="mx-auto max-h-[512px] rounded-xl object-contain shadow"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Caption Generator Tab
// ---------------------------------------------------------------------------

interface CaptionTabProps {
  config: AIProviderConfig | null
}

function CaptionTab({ config }: CaptionTabProps) {
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [tone, setTone] = useState('Professional')
  const [count, setCount] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [captions, setCaptions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const hasTextProvider =
    config?.providers?.openai?.isEnabled ||
    config?.providers?.anthropic?.isEnabled ||
    config?.providers?.google?.isEnabled ||
    config?.providers?.openrouter?.isEnabled

  async function handleGenerate() {
    if (!topic.trim()) return
    setGenerating(true)
    setError(null)
    setCaptions([])

    try {
      const res = await fetch('/api/ai/generate-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, tone, platform, count }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setCaptions(data.captions ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate captions')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyCaption(idx: number) {
    await copyToClipboard(captions[idx])
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Summer sale on sneakers, new product launch..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Count: <span className="font-semibold text-blue-600">{count}</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>5</span>
              </div>
            </div>
          </div>

          {!hasTextProvider && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Configure a text provider (OpenAI, Anthropic, Google, or OpenRouter) above to enable caption generation.
            </p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!hasTextProvider || !topic.trim() || generating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 text-sm font-semibold text-white hover:from-purple-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <Spinner className="h-4 w-4" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Captions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {captions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Generated Captions</h3>
          {captions.map((caption, idx) => (
            <div
              key={idx}
              className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <p className="pr-10 text-sm text-gray-800 leading-relaxed">{caption}</p>
              <button
                type="button"
                onClick={() => handleCopyCaption(idx)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
                title="Copy caption"
              >
                {copiedIdx === idx ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = 'image' | 'captions'

export default function AIStudioPage() {
  const [activeTab, setActiveTab] = useState<Tab>('image')

  const { data: configRes, isLoading: configLoading, mutate: refetchConfig } = useSWR('/api/ai/providers')
  const config: AIProviderConfig | null = configRes?.success ? configRes.config : null

  async function handleSaveProvider(
    providerName: ProviderName,
    data: { apiKey: string; isEnabled: boolean; model?: string }
  ) {
    const res = await fetch('/api/ai/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerName,
        apiKey: data.apiKey,
        isEnabled: data.isEnabled,
        model: data.model,
      }),
    })
    const result = await res.json().catch(() => ({}))
    // Was discarded entirely -- the card always showed "Saved!" even when
    // this 400'd (most commonly: no active business selected, see
    // /api/ai/providers' POST handler), so a save that silently did
    // nothing looked identical to a real one until the next page refresh.
    if (!res.ok || result?.success === false) {
      throw new Error(result?.error || 'Failed to save. Select a business (top-right switcher) and try again.')
    }
    await refetchConfig()
  }

  async function handleSetDefaultImage(p: ImageProvider) {
    await fetch('/api/ai/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultImageProvider: p }),
    })
    refetchConfig((prev: any) => (prev?.success ? { ...prev, config: { ...prev.config, defaultImageProvider: p } } : prev), false)
  }

  async function handleSetDefaultText(p: TextProvider) {
    await fetch('/api/ai/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultTextProvider: p }),
    })
    refetchConfig((prev: any) => (prev?.success ? { ...prev, config: { ...prev.config, defaultTextProvider: p } } : prev), false)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'image', label: 'Image Generation', icon: <Image className="h-4 w-4" /> },
    { id: 'captions', label: 'Caption Generator', icon: <Sparkles className="h-4 w-4" /> },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">AI Studio</h1>
                <p className="text-xs text-gray-500">Generate images and captions with AI</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Provider Settings */}
          <ProviderSettingsPanel
            config={config}
            loading={configLoading}
            onSaveProvider={handleSaveProvider}
            onSetDefaultImage={handleSetDefaultImage}
            onSetDefaultText={handleSetDefaultText}
          />

          {/* Tabs */}
          <div>
            <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'image' && <ImageTab config={config} />}
            {activeTab === 'captions' && <CaptionTab config={config} />}
          </div>
        </div>
      </div>
    </div>
  )
}
