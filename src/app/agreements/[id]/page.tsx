'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface Party {
  name: string;
  email: string;
  role: string;
  phone?: string;
  address?: string;
  panNumber?: string;
}

interface Signature {
  partyEmail: string;
  partyName: string;
  partyRole: string;
  signedAt?: string;
  otpVerified: boolean;
}

interface Agreement {
  _id: string;
  title: string;
  templateType: string;
  parties: Party[];
  content: string;
  status: string;
  signatures: Signature[];
  governingLaw: string;
  jurisdiction: string;
  stampDutyNotice: string;
  expiresAt?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  PENDING_SIGNATURE: { label: 'Pending Signature', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  PARTIALLY_SIGNED: { label: 'Partially Signed', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  FULLY_SIGNED: { label: 'Fully Signed', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  EXPIRED: { label: 'Expired', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-900/20 text-red-400 border-red-900/30' },
};

const TEMPLATE_LABELS: Record<string, string> = {
  NDA: 'NDA',
  VENDOR_SUPPLY: 'Vendor Supply',
  EMPLOYMENT: 'Employment',
  SERVICE_AGREEMENT: 'Service Agreement',
  MOU: 'MOU',
  CUSTOM: 'Custom',
};

type ModalStep = 'otp' | 'sign';

interface SigningModalProps {
  partyName: string;
  partyEmail: string;
  agreementId: string;
  onClose: () => void;
  onSigned: () => void;
}

function SigningModal({ partyName, partyEmail, agreementId, onClose, onSigned }: SigningModalProps) {
  const [modalStep, setModalStep] = useState<ModalStep>('otp');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signError, setSignError] = useState('');
  const [signing, setSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const sendOtp = async () => {
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch(`/api/agreements/${agreementId}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        if (!data.sent) setOtpError(data.message || 'OTP generated but the email failed to send.');
      } else {
        setOtpError(data.error || 'Failed to send OTP');
      }
    } catch {
      setOtpError('Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setOtpError('Please enter a 6-digit OTP');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      // We don't verify OTP separately — verification happens at sign time
      // Move to signature step
      setModalStep('sign');
    } finally {
      setOtpLoading(false);
    }
  };

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    lastPos.current = getCanvasPos(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const pos = getCanvasPos(e);
    if (!pos || !lastPos.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return !data.some((v) => v !== 0);
  };

  const submitSignature = async () => {
    if (!signatureConsent) {
      setSignError('Please consent to the electronic signature terms');
      return;
    }
    if (isCanvasEmpty()) {
      setSignError('Please draw your signature');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL('image/png');

    setSigning(true);
    setSignError('');
    try {
      const res = await fetch(`/api/agreements/${agreementId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyEmail, otp, signatureData }),
      });
      const data = await res.json();
      if (res.ok) {
        onSigned();
      } else {
        setSignError(data.error || 'Failed to submit signature');
      }
    } catch {
      setSignError('Failed to submit signature');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-semibold">Sign Agreement</h3>
            <p className="text-gray-400 text-sm">{partyName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex px-6 pt-4 gap-2">
          <div className={`flex-1 h-1 rounded-full ${modalStep === 'otp' || modalStep === 'sign' ? 'bg-blue-500' : 'bg-white/10'}`} />
          <div className={`flex-1 h-1 rounded-full ${modalStep === 'sign' ? 'bg-blue-500' : 'bg-white/10'}`} />
        </div>

        <div className="px-6 py-5">
          {/* OTP Step */}
          {modalStep === 'otp' && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="text-4xl mb-3">📱</div>
                <p className="text-white font-medium">OTP Verification</p>
                <p className="text-gray-400 text-sm mt-1">
                  {otpSent
                    ? `Enter the OTP sent to ${partyEmail}`
                    : `We will send an OTP to ${partyEmail}`}
                </p>
              </div>

              {otpSent && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Enter 6-digit OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              )}

              {otpError && (
                <p className="text-red-400 text-sm text-center">{otpError}</p>
              )}

              <div className="flex gap-2">
                {!otpSent ? (
                  <button
                    onClick={sendOtp}
                    disabled={otpLoading}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                  >
                    {otpLoading ? 'Sending...' : 'Send OTP'}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={sendOtp}
                      disabled={otpLoading}
                      className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-sm transition-colors"
                    >
                      {otpLoading ? '...' : 'Resend'}
                    </button>
                    <button
                      onClick={verifyOtp}
                      disabled={otpLoading || otp.length !== 6}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                    >
                      Verify OTP →
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Signature Step */}
          {modalStep === 'sign' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-white font-medium">Draw Your Signature</p>
                <p className="text-gray-400 text-xs mt-1">Use your mouse or finger to sign below</p>
              </div>

              <div className="relative bg-white/5 border border-white/20 rounded-xl overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={160}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <button
                  onClick={clearCanvas}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-400 rounded-lg transition-colors"
                >
                  Clear
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/2 border-b border-gray-600 pointer-events-none" />
              </div>

              <div
                className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-xl cursor-pointer"
                onClick={() => setSignatureConsent(!signatureConsent)}
              >
                <div
                  className={`w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                    signatureConsent ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                  }`}
                >
                  {signatureConsent && <span className="text-white text-xs">✓</span>}
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">
                  I agree that this electronic signature is legally binding under the{' '}
                  <span className="text-blue-400">Information Technology Act, 2000</span>, and the{' '}
                  <span className="text-blue-400">Indian Contract Act, 1872</span>. I confirm that I am authorised to sign this agreement.
                </p>
              </div>

              {signError && (
                <p className="text-red-400 text-sm text-center">{signError}</p>
              )}

              <button
                onClick={submitSignature}
                disabled={signing || !signatureConsent}
                className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {signing ? 'Submitting...' : 'Submit Signature'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgreementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingParty, setSigningParty] = useState<{ name: string; email: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sendResult, setSendResult] = useState<Array<{ partyEmail: string; emailSent: boolean; signingLink: string }> | null>(null);

  const fetchAgreement = useCallback(async () => {
    try {
      const res = await fetch(`/api/agreements/${id}`);
      const data = await res.json();
      if (res.ok) {
        setAgreement(data.agreement);
      } else {
        console.error(data.error);
      }
    } catch (error) {
      console.error('Failed to fetch agreement:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchAgreement();
  }, [id, fetchAgreement]);

  const handleSendForSigning = async () => {
    if (!confirm('Send this agreement to all parties for signing?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/agreements/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSendResult(data.signingLinks);
        fetchAgreement();
      } else {
        alert(data.error || 'Failed to send agreement');
      }
    } catch {
      alert('Failed to send agreement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this agreement?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/agreements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/agreements');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to cancel');
      }
    } catch {
      alert('Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Agreement not found</p>
          <button onClick={() => router.push('/agreements')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
            Back to Agreements
          </button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[agreement.status] || STATUS_CONFIG.DRAFT;

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6 print:hidden">
      {signingParty && (
        <SigningModal
          partyName={signingParty.name}
          partyEmail={signingParty.email}
          agreementId={id}
          onClose={() => setSigningParty(null)}
          onSigned={() => {
            setSigningParty(null);
            fetchAgreement();
          }}
        />
      )}

      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/agreements')}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ←
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{agreement.title}</h1>
              <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium">
                {TEMPLATE_LABELS[agreement.templateType] || agreement.templateType}
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Created {new Date(agreement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              {agreement.expiresAt && ` · Expires ${new Date(agreement.expiresAt).toLocaleDateString('en-IN')}`}
            </p>
          </div>
        </div>

        {/* Send Result Banner */}
        {sendResult && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-yellow-400 font-medium">Agreement Sent for Signing</h3>
              <button onClick={() => setSendResult(null)} className="text-yellow-600 hover:text-yellow-400 text-sm">✕</button>
            </div>
            <p className="text-yellow-600 text-xs mb-3">Each party has been emailed a signing link and OTP.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sendResult.map((r) => (
                <div key={r.partyEmail} className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                  <p className="text-yellow-300 text-sm font-medium">{r.partyEmail}</p>
                  <p className={`text-xs mt-0.5 ${r.emailSent ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.emailSent ? 'Email sent' : 'Email failed to send'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Agreement Content */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-white font-semibold">Agreement Content</h2>
              </div>
              <div
                className="p-6 text-gray-200 text-sm leading-relaxed prose prose-invert max-w-none"
                style={{ minHeight: '500px', maxHeight: '700px', overflowY: 'auto' }}
                dangerouslySetInnerHTML={{
                  __html: agreement.content || '<p class="text-gray-500">No content available.</p>',
                }}
              />
              <div className="px-6 py-4 border-t border-white/10 bg-white/3">
                <p className="text-gray-600 text-xs">
                  <strong className="text-gray-500">Governing Law:</strong> {agreement.governingLaw} &nbsp;·&nbsp;
                  <strong className="text-gray-500">Jurisdiction:</strong> {agreement.jurisdiction}
                </p>
                <p className="text-gray-600 text-xs mt-1">{agreement.stampDutyNotice}</p>
              </div>
            </div>
          </div>

          {/* Right: Parties & Actions */}
          <div className="space-y-4">
            {/* Parties & Signatures */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="text-white font-semibold">Parties & Signatures</h2>
              </div>
              <div className="p-4 space-y-3">
                {agreement.parties.map((party, i) => {
                  const sig = agreement.signatures?.find((s) => s.partyEmail === party.email);
                  const hasSigned = !!sig?.signedAt;
                  return (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{party.name}</p>
                          <p className="text-gray-400 text-xs truncate">{party.email}</p>
                          <p className="text-gray-600 text-xs">{party.role}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {hasSigned ? (
                            <div>
                              <span className="text-green-400 text-sm">✅ Signed</span>
                              <p className="text-gray-600 text-xs">
                                {new Date(sig!.signedAt!).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                          ) : (
                            <span className="text-yellow-400 text-sm">⏳ Pending</span>
                          )}
                        </div>
                      </div>
                      {!hasSigned && ['PENDING_SIGNATURE', 'PARTIALLY_SIGNED'].includes(agreement.status) && (
                        <button
                          onClick={() => setSigningParty({ name: party.name, email: party.email })}
                          className="mt-3 w-full py-1.5 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors"
                        >
                          Sign Now
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
              <h2 className="text-white font-semibold mb-3">Actions</h2>

              {agreement.status === 'DRAFT' && (
                <button
                  onClick={handleSendForSigning}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-yellow-600/20 text-yellow-400 border border-yellow-500/30 rounded-xl hover:bg-yellow-600/30 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? 'Sending...' : '📤 Send for Signing'}
                </button>
              )}

              {agreement.status === 'DRAFT' && (
                <button
                  onClick={() => router.push(`/agreements/new`)}
                  className="w-full py-2.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl hover:bg-purple-600/30 transition-colors text-sm font-medium"
                >
                  ✏️ Edit Agreement
                </button>
              )}

              {agreement.status === 'FULLY_SIGNED' && (
                <button
                  onClick={() => window.print()}
                  className="w-full py-2.5 bg-green-600/20 text-green-400 border border-green-500/30 rounded-xl hover:bg-green-600/30 transition-colors text-sm font-medium"
                >
                  📥 Download Signed Copy
                </button>
              )}

              {!['FULLY_SIGNED', 'CANCELLED', 'EXPIRED'].includes(agreement.status) && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-600/30 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {actionLoading ? 'Cancelling...' : '🚫 Cancel Agreement'}
                </button>
              )}
            </div>

            {/* Legal Notice */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
              <p className="text-blue-400 text-xs font-medium mb-2">Legal Notice</p>
              <p className="text-gray-500 text-xs leading-relaxed">
                Electronic signatures on this agreement are valid under Section 5 of the Information Technology Act, 2000, and are admissible as evidence under the Indian Evidence Act, 1872.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Print-only signed copy — hidden on screen, the actual "Download
        Signed Copy" mechanism is the browser's Print > Save as PDF (see
        the CRM invoice viewer for the same established pattern in this
        repo; a server-side PDF renderer was previously tried and removed
        because it depended on the serverless filesystem). Light-themed
        since the rest of this page is a dark UI unsuitable for print. */}
    <div className="hidden print:block bg-white text-gray-900 p-10">
      <h1 className="text-2xl font-bold mb-1">{agreement.title}</h1>
      <p className="text-xs text-gray-500 mb-6">
        {TEMPLATE_LABELS[agreement.templateType] || agreement.templateType} · Fully Signed ·{' '}
        Created {new Date(agreement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <div
        className="text-sm leading-relaxed mb-8"
        dangerouslySetInnerHTML={{ __html: agreement.content || '' }}
      />

      <h2 className="text-base font-semibold mb-3 border-t border-gray-300 pt-4">Signatures</h2>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th className="py-1.5 pr-3">Party</th>
            <th className="py-1.5 pr-3">Role</th>
            <th className="py-1.5 pr-3">Email</th>
            <th className="py-1.5">Signed On</th>
          </tr>
        </thead>
        <tbody>
          {agreement.parties.map((party, i) => {
            const sig = agreement.signatures?.find((s) => s.partyEmail === party.email);
            return (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-1.5 pr-3">{party.name}</td>
                <td className="py-1.5 pr-3">{party.role}</td>
                <td className="py-1.5 pr-3">{party.email}</td>
                <td className="py-1.5">
                  {sig?.signedAt
                    ? new Date(sig.signedAt).toLocaleString('en-IN')
                    : 'Not signed'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] text-gray-500 mt-6">
        Governing Law: {agreement.governingLaw} · Jurisdiction: {agreement.jurisdiction}
      </p>
      <p className="text-[10px] text-gray-500 mt-1">{agreement.stampDutyNotice}</p>
      <p className="text-[10px] text-gray-400 mt-4">
        Electronic signatures on this agreement are valid under Section 5 of the Information Technology Act, 2000, and are admissible as evidence under the Indian Evidence Act, 1872.
      </p>
    </div>
    </>
  );
}
