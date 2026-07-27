'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId';

interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  options?: string[];
  required: boolean;
}

interface Template {
  _id: string;
  type: string;
  name: string;
  description: string;
  variables: TemplateVariable[];
  indianLawClauses: string[];
}

interface Party {
  name: string;
  email: string;
  role: 'COMPANY' | 'VENDOR' | 'EMPLOYEE' | 'PARTY_A' | 'PARTY_B';
  phone: string;
  address: string;
  panNumber: string;
}

const TEMPLATE_ICONS: Record<string, string> = {
  NDA: '🔒',
  VENDOR_SUPPLY: '📦',
  EMPLOYMENT: '👷',
  SERVICE_AGREEMENT: '🤝',
  MOU: '📋',
  CUSTOM: '📝',
};

const ROLE_OPTIONS = ['COMPANY', 'VENDOR', 'EMPLOYEE', 'PARTY_A', 'PARTY_B'];

const defaultParty = (): Party => ({
  name: '',
  email: '',
  role: 'PARTY_A',
  phone: '',
  address: '',
  panNumber: '',
});

function substituteVariables(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] || `<span style="background:rgba(234,179,8,0.2);padding:0 4px;border-radius:3px;">[${key}]</span>`;
  });
}

export default function NewAgreementPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateContent, setTemplateContent] = useState('');
  const [title, setTitle] = useState('');
  const [parties, setParties] = useState<Party[]>([defaultParty(), defaultParty()]);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [expiresAt, setExpiresAt] = useState('');
  const [governingLaw, setGoverningLaw] = useState('Indian Contract Act, 1872');
  const [jurisdiction, setJurisdiction] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { businessId } = useActiveBusinessId();
  const [customContent, setCustomContent] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agreements/templates');
      const data = await res.json();
      if (res.ok) {
        const customTemplate = {
          _id: 'custom',
          type: 'CUSTOM',
          name: 'Custom Agreement',
          description: 'Write your own agreement from scratch',
          variables: [],
          indianLawClauses: [
            'This Agreement is governed by and construed in accordance with the Indian Contract Act, 1872.',
            'Any disputes shall be subject to the exclusive jurisdiction of courts in the specified jurisdiction.',
            'This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899.',
          ],
        };
        setTemplates([...data.templates, customTemplate]);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (template: Template) => {
    setSelectedTemplate(template);
    if (template.type === 'CUSTOM') {
      setTemplateContent('');
      return;
    }
    try {
      const res = await fetch('/api/agreements/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: template.type }),
      });
      const data = await res.json();
      if (res.ok) {
        setTemplateContent(data.template.content || '');
      }
    } catch {
      console.error('Failed to load template content');
    }
  };

  const handleAddParty = () => {
    setParties([...parties, defaultParty()]);
  };

  const handleRemoveParty = (index: number) => {
    if (parties.length <= 2) return;
    setParties(parties.filter((_, i) => i !== index));
  };

  const handlePartyChange = (index: number, field: keyof Party, value: string) => {
    const updated = [...parties];
    updated[index] = { ...updated[index], [field]: value };
    setParties(updated);
  };

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const getRenderedContent = () => {
    if (selectedTemplate?.type === 'CUSTOM') return customContent;
    return substituteVariables(templateContent, variables);
  };

  const validateStep2 = () => {
    if (!title.trim()) { alert('Please enter an agreement title'); return false; }
    for (const p of parties) {
      if (!p.name.trim() || !p.email.trim() || !p.role) {
        alert('Please fill in all required party fields (Name, Email, Role)');
        return false;
      }
    }
    const emails = parties.map((p) => p.email);
    if (new Set(emails).size !== emails.length) {
      alert('Each party must have a unique email address');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && !selectedTemplate) { alert('Please select a template'); return; }
    if (step === 2 && !validateStep2()) return;
    setStep(step + 1);
  };

  const handleSave = async (proceedToSend = false) => {
    setSaving(true);
    try {
      const content = getRenderedContent();
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          templateType: selectedTemplate?.type,
          title,
          parties,
          content,
          variables,
          expiresAt: expiresAt || undefined,
          governingLaw,
          jurisdiction,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const agreementId = data.agreement._id;
        if (proceedToSend) {
          const sendRes = await fetch(`/api/agreements/${agreementId}/send`, { method: 'POST' });
          if (!sendRes.ok) {
            const sendData = await sendRes.json();
            alert(sendData.error || 'Failed to send for signing');
          }
        }
        router.push(`/agreements/${agreementId}`);
      } else {
        alert(data.error || 'Failed to create agreement');
      }
    } catch {
      alert('Failed to save agreement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : router.push('/agreements')}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">New Agreement</h1>
            <p className="text-gray-400 text-sm">Indian law compliant electronic agreement</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-0 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div className={`h-0.5 w-20 transition-colors ${step > s ? 'bg-blue-600' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
          <div className="ml-4 flex gap-8 text-sm">
            {['Choose Template', 'Fill Details', 'Preview & Save'].map((label, i) => (
              <span key={i} className={step === i + 1 ? 'text-blue-400 font-medium' : 'text-gray-600'}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: Choose Template */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Choose Agreement Template</h2>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <button
                    key={template._id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`p-6 rounded-2xl border text-left transition-all ${
                      selectedTemplate?.type === template.type
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="text-4xl mb-3">{TEMPLATE_ICONS[template.type] || '📄'}</div>
                    <h3 className="text-white font-semibold mb-1">{template.name}</h3>
                    <p className="text-gray-400 text-xs leading-relaxed">{template.description}</p>
                    {selectedTemplate?.type === template.type && (
                      <div className="mt-3 text-blue-400 text-xs font-medium">✓ Selected</div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-8">
              <button
                onClick={handleNextStep}
                disabled={!selectedTemplate}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
              >
                Next: Fill Details →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fill Details */}
        {step === 2 && selectedTemplate && (
          <div className="space-y-8">
            {/* Agreement Title */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Agreement Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Agreement Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={`${selectedTemplate.name} - ${new Date().getFullYear()}`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Governing Law</label>
                  <input
                    type="text"
                    value={governingLaw}
                    onChange={(e) => setGoverningLaw(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Jurisdiction (City)</label>
                  <input
                    type="text"
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Expiry Date (optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Parties */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Parties</h2>
                <button
                  onClick={handleAddParty}
                  className="px-3 py-1.5 text-sm bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors"
                >
                  + Add Party
                </button>
              </div>
              <div className="space-y-4">
                {parties.map((party, index) => (
                  <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-400">Party {index + 1}</span>
                      {parties.length > 2 && (
                        <button
                          onClick={() => handleRemoveParty(index)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                        <input
                          type="text"
                          value={party.name}
                          onChange={(e) => handlePartyChange(index, 'name', e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Email *</label>
                        <input
                          type="email"
                          value={party.email}
                          onChange={(e) => handlePartyChange(index, 'email', e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Role *</label>
                        <select
                          value={party.role}
                          onChange={(e) => handlePartyChange(index, 'role', e.target.value)}
                          className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={party.phone}
                          onChange={(e) => handlePartyChange(index, 'phone', e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">PAN (optional)</label>
                        <input
                          type="text"
                          value={party.panNumber}
                          onChange={(e) => handlePartyChange(index, 'panNumber', e.target.value.toUpperCase())}
                          maxLength={10}
                          placeholder="ABCDE1234F"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Address</label>
                        <input
                          type="text"
                          value={party.address}
                          onChange={(e) => handlePartyChange(index, 'address', e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Template Variables */}
            {selectedTemplate.type === 'CUSTOM' ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Agreement Content</h2>
                <textarea
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                  placeholder="Write your agreement content here. You can use HTML for formatting..."
                  rows={20}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 font-mono text-sm resize-y"
                />
              </div>
            ) : selectedTemplate.variables.length > 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Template Variables</h2>
                <p className="text-gray-500 text-sm mb-4">Fill in the values to populate the agreement template.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedTemplate.variables.map((v) => (
                    <div key={v.key}>
                      <label className="block text-sm text-gray-400 mb-1.5">
                        {v.label} {v.required && <span className="text-red-400">*</span>}
                      </label>
                      {v.type === 'select' ? (
                        <select
                          value={variables[v.key] || ''}
                          onChange={(e) => handleVariableChange(v.key, e.target.value)}
                          className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50"
                        >
                          <option value="">Select...</option>
                          {v.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={v.type === 'date' ? 'date' : v.type === 'number' ? 'number' : 'text'}
                          value={variables[v.key] || ''}
                          onChange={(e) => handleVariableChange(v.key, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleNextStep}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
              >
                Preview →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && selectedTemplate && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <span className="px-3 py-1 bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded-lg text-sm">
                  DRAFT
                </span>
              </div>

              {/* Agreement Content */}
              <div
                className="prose prose-invert max-w-none bg-white/3 border border-white/10 rounded-xl p-6 text-sm text-gray-200 leading-relaxed"
                style={{ minHeight: '400px' }}
                dangerouslySetInnerHTML={{ __html: getRenderedContent() || '<p class="text-gray-500">No content. Please go back and fill in the template variables.</p>' }}
              />

              {/* Indian Law Clauses */}
              {selectedTemplate.indianLawClauses && selectedTemplate.indianLawClauses.length > 0 && (
                <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                  <h3 className="text-blue-400 font-medium mb-3 text-sm">Indian Law Compliance Clauses</h3>
                  <ul className="space-y-2">
                    {selectedTemplate.indianLawClauses.map((clause, i) => (
                      <li key={i} className="text-gray-400 text-xs flex gap-2">
                        <span className="text-blue-500 mt-0.5">•</span>
                        {clause}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Legal Footer */}
              <div className="mt-6 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-xs text-yellow-400/80">
                <strong>Governing Law:</strong> {governingLaw} &nbsp;|&nbsp;
                <strong>Jurisdiction:</strong> {jurisdiction || 'As specified in agreement'} &nbsp;|&nbsp;
                <strong>Stamp Duty Notice:</strong> This agreement may be subject to stamp duty as per the Indian Stamp Act, 1899.
              </div>

              {/* Parties Summary */}
              <div className="mt-6">
                <h3 className="text-white font-medium mb-3">Signing Parties</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {parties.map((party, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3">
                      <p className="text-white font-medium text-sm">{party.name}</p>
                      <p className="text-gray-400 text-xs">{party.email}</p>
                      <p className="text-gray-500 text-xs">{party.role}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* IT Act Notice */}
              <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-500">
                Electronic signatures on this agreement are legally valid under Section 5 of the Information Technology Act, 2000, and the Indian Evidence Act, 1872.
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition-colors"
              >
                ← Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save & Send for Signing'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
