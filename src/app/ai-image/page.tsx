'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
}

const PRESET_CATEGORIES = [
  {
    id: 'festival',
    title: 'Festival Wishes',
    emoji: '🎉',
    color: 'from-orange-500/20 to-yellow-500/10',
    border: 'border-orange-500/30',
    prompts: [
      { label: 'Diwali', prompt: 'Vibrant Diwali celebration with colorful diyas, fireworks, and festive decorations, golden light, Indian festival atmosphere' },
      { label: 'Christmas', prompt: 'Beautiful Christmas celebration with decorated tree, snow, gifts, warm golden lights, cozy winter atmosphere' },
      { label: 'Eid', prompt: 'Elegant Eid Mubarak greeting with crescent moon, mosque silhouette, lanterns, and Islamic geometric patterns' },
      { label: 'Holi', prompt: 'Joyful Holi festival with vibrant color powder explosions, people celebrating, rainbow colors, Indian spring festival' },
      { label: 'New Year', prompt: 'Spectacular New Year celebration with fireworks, confetti, champagne, midnight countdown, city skyline' },
    ],
  },
  {
    id: 'product',
    title: 'Product Banners',
    emoji: '🛍️',
    color: 'from-blue-500/20 to-cyan-500/10',
    border: 'border-blue-500/30',
    prompts: [
      { label: 'Product Showcase', prompt: 'Professional product showcase on clean white background with dramatic lighting, commercial photography style, luxury presentation' },
      { label: 'Promotional Banner', prompt: 'Eye-catching promotional banner with bold typography, modern design, gradient background, sale announcement, retail advertising' },
      { label: 'Flat Lay', prompt: 'Elegant flat lay product arrangement on marble surface with props, overhead shot, lifestyle photography, minimal aesthetic' },
      { label: 'Lifestyle Shot', prompt: 'Product in lifestyle setting, aspirational photography, natural light, real-world usage context, authentic feel' },
    ],
  },
  {
    id: 'social',
    title: 'Social Media Posts',
    emoji: '📱',
    color: 'from-purple-500/20 to-pink-500/10',
    border: 'border-purple-500/30',
    prompts: [
      { label: 'Motivational', prompt: 'Inspiring motivational quote background with dramatic landscape, sunrise, bold typography overlay, motivational poster aesthetic' },
      { label: 'Business Tips', prompt: 'Professional business tips infographic style, clean modern design, icons, gradient background, corporate aesthetic' },
      { label: 'Announcement', prompt: 'Exciting product announcement graphic with starburst effects, bold colors, modern typography, announcement poster style' },
      { label: 'Behind the Scenes', prompt: 'Authentic behind the scenes workspace, creative studio, natural candid photography, warm tones, storytelling' },
      { label: 'Quote Card', prompt: 'Elegant quote card with beautiful calligraphy, soft bokeh background, minimalist design, inspirational aesthetic' },
    ],
  },
  {
    id: 'business-card',
    title: 'Business Cards',
    emoji: '💼',
    color: 'from-emerald-500/20 to-teal-500/10',
    border: 'border-emerald-500/30',
    prompts: [
      { label: 'Minimalist', prompt: 'Minimalist business card design on premium paper, clean typography, white space, professional corporate identity' },
      { label: 'Luxury Black', prompt: 'Luxury black business card with gold foil accents, elegant typography, premium matte finish, sophisticated design' },
      { label: 'Creative', prompt: 'Creative artistic business card design with unique visual elements, bold colors, graphic design, distinctive brand identity' },
      { label: 'Tech Style', prompt: 'Modern tech company business card with circuit board patterns, dark background, neon accents, futuristic design' },
    ],
  },
  {
    id: 'logo',
    title: 'Logo Concepts',
    emoji: '✨',
    color: 'from-violet-500/20 to-indigo-500/10',
    border: 'border-violet-500/30',
    prompts: [
      { label: 'Abstract Mark', prompt: 'Abstract geometric logo mark, vector style, bold shapes, professional brand identity, clean white background' },
      { label: 'Letter Mark', prompt: 'Elegant monogram letter mark logo, sophisticated typography, premium brand identity, minimalist design' },
      { label: 'Icon + Text', prompt: 'Modern logo with icon and text combination, startup brand identity, scalable design, versatile color palette' },
      { label: 'Emblem Style', prompt: 'Classic emblem-style logo with circular badge design, ornate details, traditional craftsmanship, heritage brand' },
    ],
  },
  {
    id: 'thankyou',
    title: 'Thank You Cards',
    emoji: '💌',
    color: 'from-rose-500/20 to-pink-500/10',
    border: 'border-rose-500/30',
    prompts: [
      { label: 'Floral', prompt: 'Beautiful thank you card with elegant floral wreath, watercolor flowers, soft pastel colors, handwritten typography' },
      { label: 'Modern', prompt: 'Modern minimalist thank you card with geometric patterns, clean typography, subtle color palette, contemporary design' },
      { label: 'Luxury', prompt: 'Luxury thank you card with gold leaf accents, marble texture background, elegant serif typography, premium feel' },
      { label: 'Festive', prompt: 'Festive thank you card with celebration elements, confetti, bright colors, joyful typography, gratitude theme' },
    ],
  },
];

const STYLES = [
  { id: 'realistic', label: 'Realistic', desc: 'Photo-realistic' },
  { id: 'illustration', label: 'Illustration', desc: 'Digital art' },
  { id: 'artistic', label: 'Artistic', desc: 'Creative & expressive' },
  { id: 'minimalist', label: 'Minimalist', desc: 'Clean & simple' },
  { id: 'corporate', label: 'Corporate', desc: 'Professional' },
];

const SIZES = [
  { id: 'square', label: 'Square', desc: '1:1', width: 1024, height: 1024 },
  { id: 'landscape', label: 'Landscape', desc: '16:9', width: 1365, height: 768 },
  { id: 'portrait', label: 'Portrait', desc: '9:16', width: 576, height: 1024 },
  { id: 'banner', label: 'Banner', desc: '3:1', width: 1536, height: 512 },
];

export default function AIImagePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  const [selectedSize, setSelectedSize] = useState('square');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [recentImages, setRecentImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);

    const size = SIZES.find((s) => s.id === selectedSize) || SIZES[0];
    const style = STYLES.find((s) => s.id === selectedStyle);

    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          width: size.width,
          height: size.height,
          style: style?.label,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedImage(data.imageUrl);

      const newImage: GeneratedImage = {
        id: Date.now().toString(),
        imageUrl: data.imageUrl,
        prompt: prompt.trim(),
        timestamp: new Date(),
      };
      setRecentImages((prev) => [newImage, ...prev].slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-image-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  const handleShareToSocial = (imageUrl: string) => {
    const params = new URLSearchParams({ imageUrl, compose: '1' });
    router.push(`/social?${params}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-3">
          <span className="text-4xl">✦</span>
          AI Studio
        </h1>
        <p className="text-gray-400 mt-1">Generate stunning images with AI — completely free</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Controls */}
        <div className="xl:col-span-2 space-y-6">
          {/* Preset Categories */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">
              Quick Presets
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat.id ? null : cat.id)
                  }
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 text-left ${
                    activeCategory === cat.id
                      ? `bg-gradient-to-br ${cat.color} ${cat.border} text-white`
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                  }`}
                >
                  <span className="text-base">{cat.emoji}</span>
                  <span className="truncate">{cat.title}</span>
                </button>
              ))}
            </div>

            {activeCategory && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-gray-500 mb-3">
                  Click a preset to use it as your prompt:
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CATEGORIES.find((c) => c.id === activeCategory)?.prompts.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setPrompt(p.prompt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        prompt === p.prompt
                          ? 'bg-purple-600/40 border-purple-500/60 text-purple-200'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Describe your image
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A serene mountain landscape at golden hour with vibrant colors reflecting in a crystal clear lake..."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 resize-none transition-all"
            />
            <p className="text-xs text-gray-600 mt-2">
              Be descriptive — mention style, lighting, mood, colors, and composition for best results.
            </p>
          </div>

          {/* Style & Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Style */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
              <label className="block text-sm font-semibold text-gray-300 mb-3">Style</label>
              <div className="space-y-2">
                {STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border transition-all duration-200 ${
                      selectedStyle === style.id
                        ? 'bg-purple-600/30 border-purple-500/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-medium">{style.label}</span>
                    <span className="text-xs text-gray-500">{style.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
              <label className="block text-sm font-semibold text-gray-300 mb-3">Size</label>
              <div className="space-y-2">
                {SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setSelectedSize(size.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border transition-all duration-200 ${
                      selectedSize === size.id
                        ? 'bg-purple-600/30 border-purple-500/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-medium">{size.label}</span>
                    <span className="text-xs text-gray-500">{size.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-500 hover:via-purple-500 hover:to-pink-500 text-white transition-all duration-300 shadow-lg shadow-purple-900/50 hover:shadow-purple-900/70 hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
          >
            {generating ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating your image...
              </>
            ) : (
              <>
                <span className="text-xl">✦</span>
                Generate Image
              </>
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Right: Output */}
        <div className="space-y-6">
          {/* Generated Image */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">
              Generated Image
            </h2>

            {generatedImage ? (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden border border-white/10 group relative">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/512x512/1a1a2e/6b46c1?text=Image+Loading...';
                    }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleDownload(generatedImage)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={() => handleShareToSocial(generatedImage)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-purple-200 transition-all text-xs font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-medium disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regen
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600 rounded-xl border border-dashed border-white/10">
                <div className="text-5xl mb-4 opacity-30">✦</div>
                <p className="text-sm text-center">
                  Your generated image <br /> will appear here
                </p>
              </div>
            )}
          </div>

          {/* Recent Images */}
          {recentImages.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">
                Recent Generations
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {recentImages.map((img) => (
                  <div
                    key={img.id}
                    className="group relative rounded-xl overflow-hidden cursor-pointer border border-white/10 hover:border-purple-500/40 transition-all"
                    onClick={() => setGeneratedImage(img.imageUrl)}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      className="w-full h-20 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                      <p className="text-xs text-white p-1.5 line-clamp-2">{img.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
              Pro Tips
            </h2>
            <ul className="space-y-2 text-xs text-gray-500">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>Add lighting details: "dramatic side lighting", "golden hour", "neon glow"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>Specify camera: "shot on Canon 5D", "35mm lens", "macro photography"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>Use style keywords: "photorealistic", "8K resolution", "award-winning photography"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">•</span>
                <span>Set the mood: "moody", "vibrant", "ethereal", "minimalist", "cinematic"</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
