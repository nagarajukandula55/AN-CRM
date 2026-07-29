"use client";

/**
 * Module Builder — drag-and-drop designer for a ModuleDefinition's field
 * layout (Option A dynamic module system, see core/module-registry/). This
 * is additive to /console/modules (the existing list + inline-form editor,
 * now trimmed to just list/enable/disable/delete + links here for
 * create/edit) — one visual surface for designing a module's fields
 * instead of a flat inline form, reusing the exact same
 * createModuleDefinition/updateModuleDefinition service + validateRecord
 * system, not a parallel schema.
 *
 * Interaction model mirrors the existing /console/document-templates
 * builder (palette buttons add a block/field, canvas entries are
 * drag-reorderable via @dnd-kit/sortable, already a dependency): click a
 * palette field type to drop it onto the canvas, drag canvas entries to
 * reorder, click a canvas entry to edit it in the inspector panel on the
 * right.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  GripVertical,
  Trash2,
  Type,
  Hash,
  AlignLeft,
  ChevronDown,
  CheckSquare,
  Calendar,
  Link2,
  Mail,
  Phone,
  IndianRupee,
  ListChecks,
  FileText as FileTextIcon,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";
import { STANDARD_ACTIONS } from "@/core/access/actions";

type FieldType =
  | "text" | "textarea" | "number" | "boolean" | "date"
  | "select" | "multiselect" | "reference" | "email" | "phone"
  | "currency" | "richtext";

interface FieldOption { value: string; label: string }

interface FieldDefinition {
  _uid: string; // client-only stable id for drag-and-drop, never sent to the API
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique?: boolean;
  options?: FieldOption[];
  referenceModuleKey?: string;
  helpText?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface ModuleDef {
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  route: string;
  isSystem: boolean;
  fields: Omit<FieldDefinition, "_uid">[];
  applicableActions?: string[];
  sortOrder: number;
}

interface BusinessOption { _id: string; name: string; brandName?: string }

const FIELD_PALETTE: { type: FieldType; label: string; icon: React.ElementType }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "number", label: "Number", icon: Hash },
  { type: "currency", label: "Currency", icon: IndianRupee },
  { type: "textarea", label: "Text Area", icon: AlignLeft },
  { type: "select", label: "Dropdown", icon: ChevronDown },
  { type: "multiselect", label: "Multi-select", icon: ListChecks },
  { type: "boolean", label: "Checkbox", icon: CheckSquare },
  { type: "date", label: "Date", icon: Calendar },
  { type: "reference", label: "Relation to Module", icon: Link2 },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Phone", icon: Phone },
  { type: "richtext", label: "Rich Text", icon: FileTextIcon },
];

let uidCounter = 0;
function makeUid() {
  uidCounter += 1;
  return `f_${Date.now()}_${uidCounter}`;
}

function emptyField(type: FieldType): FieldDefinition {
  return {
    _uid: makeUid(),
    key: "",
    label: "",
    type,
    required: false,
    unique: false,
    options: type === "select" || type === "multiselect" ? [] : undefined,
    helpText: "",
  };
}

function slugifyKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1");
}

function CanvasField({
  field,
  selected,
  onSelect,
  onRemove,
}: {
  field: FieldDefinition;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field._uid });
  const paletteEntry = FIELD_PALETTE.find((p) => p.type === field.type);
  const Icon = paletteEntry?.icon ?? Type;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-3 p-3 rounded-control border cursor-pointer transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="text-ink-3 hover:text-ink cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Icon className="w-4 h-4 text-ink-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">
          {field.label || <span className="text-ink-3 italic">Untitled field</span>}
        </p>
        <p className="text-xs text-ink-3 truncate">
          {field.key || "no_key"} · {paletteEntry?.label ?? field.type}
          {field.required ? " · required" : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-ink-3 hover:text-danger shrink-0"
        title="Remove field"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ModuleBuilderPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading…" />}>
      <ModuleBuilderPageInner />
    </Suspense>
  );
}

function ModuleBuilderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingKey = searchParams.get("key");

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(!editingKey);

  const [meta, setMeta] = useState({
    key: "",
    label: "",
    pluralLabel: "",
    description: "",
    route: "",
    applicableActions: [] as string[],
  });
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const { data: meRes, isLoading: meLoading } = useSWR("/api/auth/me");
  const isSuperAdmin = !!meRes?.user?.isSuperAdmin;
  const allBusinesses: BusinessOption[] = meRes?.businesses || [];

  useEffect(() => {
    if (!meRes) return;
    const bId: string | null = meRes?.user?.activeBusinessId || (isSuperAdmin ? null : allBusinesses?.[0]?._id || null);
    setBusinessId(bId);
  }, [meRes]);

  // Load the existing module definition when editing.
  useEffect(() => {
    if (!editingKey || !businessId || loadedExisting) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/modules/${editingKey}?businessId=${businessId}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.success) {
          setError(data.error || "Module not found.");
          setLoadedExisting(true);
          return;
        }
        const mod: ModuleDef = data.module;
        setMeta({
          key: mod.key,
          label: mod.label,
          pluralLabel: mod.pluralLabel,
          description: mod.description || "",
          route: mod.route,
          applicableActions: mod.applicableActions || [],
        });
        setFields(mod.fields.map((f) => ({ ...f, _uid: makeUid() })));
        setLoadedExisting(true);
      } catch {
        if (!cancelled) {
          setError("Failed to load module.");
          setLoadedExisting(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingKey, businessId, loadedExisting]);

  const selectedField = fields.find((f) => f._uid === selectedUid) || null;

  function addField(type: FieldType) {
    const f = emptyField(type);
    setFields((prev) => [...prev, f]);
    setSelectedUid(f._uid);
  }

  function updateSelectedField(updates: Partial<FieldDefinition>) {
    if (!selectedUid) return;
    setFields((prev) => prev.map((f) => (f._uid === selectedUid ? { ...f, ...updates } : f)));
  }

  function removeField(uid: string) {
    setFields((prev) => prev.filter((f) => f._uid !== uid));
    if (selectedUid === uid) setSelectedUid(null);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f._uid === active.id);
      const newIndex = prev.findIndex((f) => f._uid === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    if (!businessId) {
      setError("Select a business first.");
      return;
    }
    setError(null);

    if (!editingKey) {
      if (!meta.key.trim() || !meta.label.trim() || !meta.pluralLabel.trim() || !meta.route.trim()) {
        setError("Key, Label, Plural Label, and Route are required.");
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(meta.key.trim())) {
        setError('Key must be lowercase letters, numbers, and underscores only, starting with a letter (e.g. "warranty_claim").');
        return;
      }
    }

    const fieldKeys = new Set<string>();
    for (const f of fields) {
      if (!f.key.trim() || !f.label.trim()) {
        setError("Every field needs both a key and a label — select a field in the canvas to fill these in.");
        return;
      }
      if (fieldKeys.has(f.key)) {
        setError(`Duplicate field key "${f.key}" — each field needs a unique key.`);
        return;
      }
      fieldKeys.add(f.key);
    }

    const payloadFields = fields.map(({ _uid, ...rest }) => rest);

    setSaving(true);
    try {
      let res: Response;
      if (editingKey) {
        res = await fetch(`/api/modules/${editingKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId,
            label: meta.label,
            pluralLabel: meta.pluralLabel,
            description: meta.description,
            fields: payloadFields,
            applicableActions: meta.applicableActions,
          }),
        });
      } else {
        res = await fetch("/api/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...meta, businessId, fields: payloadFields }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setError(data.error || "Failed to save module.");
        return;
      }
      router.push("/console/modules");
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setSaving(false);
    }
  }

  const loading = meLoading || !loadedExisting;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PageHeader
        eyebrow="Modules"
        title={editingKey ? `Edit Module: ${meta.label || editingKey}` : "Module Builder"}
        description="Drag field types onto the canvas, reorder them, and configure each one in the inspector. Saves as a real ModuleDefinition — the same system that powers every module on this platform."
        actions={
          <>
            <Link href="/console/modules">
              <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>Back to Modules</Button>
            </Link>
            <Button onClick={handleSave} loading={saving} disabled={!businessId}>
              Save Module
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingPanel label="Loading…" />
      ) : (
        <>
          {isSuperAdmin && allBusinesses.length > 0 && (
            <Card className="mb-6">
              <CardBody className="flex items-center gap-3 py-4">
                <span className="text-xs text-ink-3 shrink-0">Building for:</span>
                <Select
                  className="w-auto"
                  value={businessId ?? ""}
                  onChange={(e) => setBusinessId(e.target.value || null)}
                >
                  <option value="" disabled>Select a business…</option>
                  {allBusinesses.map((b) => (
                    <option key={b._id} value={b._id}>{b.brandName || b.name}</option>
                  ))}
                </Select>
              </CardBody>
            </Card>
          )}

          {error && (
            <Card className="mb-6 border-danger/30 bg-danger-soft">
              <CardBody className="py-3 text-sm text-danger">{error}</CardBody>
            </Card>
          )}

          <Card className="mb-6">
            <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Key" required hint={editingKey ? "Cannot be changed once created." : "Lowercase, e.g. warranty_claim"}>
                <Input
                  value={meta.key}
                  disabled={!!editingKey}
                  onChange={(e) => {
                    const key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                    setMeta((prev) => ({
                      ...prev,
                      key,
                      route: prev.route && prev.route !== `/console/modules/${prev.key}` ? prev.route : `/console/modules/${key}`,
                    }));
                  }}
                  placeholder="warranty_claim"
                />
              </Field>
              <Field label="Route" hint="Where this module's record page lives.">
                <Input value={meta.route} onChange={(e) => setMeta({ ...meta, route: e.target.value })} placeholder="/console/modules/warranty_claim" />
              </Field>
              <Field label="Label (singular)" required>
                <Input value={meta.label} onChange={(e) => setMeta({ ...meta, label: e.target.value })} placeholder="Warranty Claim" />
              </Field>
              <Field label="Label (plural)" required>
                <Input value={meta.pluralLabel} onChange={(e) => setMeta({ ...meta, pluralLabel: e.target.value })} placeholder="Warranty Claims" />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
              </Field>
              <Field label="Applicable Actions" hint="None checked = all standard actions apply." className="md:col-span-2">
                <div className="flex flex-wrap gap-3">
                  {STANDARD_ACTIONS.map((a) => (
                    <label key={a.key} className="flex items-center gap-1.5 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        checked={meta.applicableActions.includes(a.key)}
                        onChange={(e) =>
                          setMeta((prev) => ({
                            ...prev,
                            applicableActions: e.target.checked
                              ? [...prev.applicableActions, a.key]
                              : prev.applicableActions.filter((k) => k !== a.key),
                          }))
                        }
                      />
                      {a.label}
                    </label>
                  ))}
                </div>
              </Field>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-6 items-start">
            {/* Palette */}
            <Card>
              <CardBody>
                <p className="eyebrow mb-3">Field Types</p>
                <div className="space-y-1.5">
                  {FIELD_PALETTE.map((p) => (
                    <button
                      key={p.type}
                      type="button"
                      onClick={() => addField(p.type)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-control text-sm text-ink-2 border border-border hover:border-accent hover:bg-accent-soft hover:text-ink transition-colors text-left"
                    >
                      <p.icon className="w-4 h-4 shrink-0" />
                      {p.label}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Canvas */}
            <Card>
              <CardBody>
                <p className="eyebrow mb-3">Canvas ({fields.length} field{fields.length === 1 ? "" : "s"})</p>
                {fields.length === 0 ? (
                  <EmptyState
                    kind="empty"
                    title="No fields yet"
                    description="Click a field type on the left to add it to this module."
                  />
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={fields.map((f) => f._uid)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {fields.map((field) => (
                          <CanvasField
                            key={field._uid}
                            field={field}
                            selected={field._uid === selectedUid}
                            onSelect={() => setSelectedUid(field._uid)}
                            onRemove={() => removeField(field._uid)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardBody>
            </Card>

            {/* Inspector */}
            <Card>
              <CardBody>
                <p className="eyebrow mb-3">Inspector</p>
                {!selectedField ? (
                  <p className="text-sm text-ink-3">Select a field in the canvas to configure it.</p>
                ) : (
                  <div className="space-y-3">
                    <Badge tone="info">{FIELD_PALETTE.find((p) => p.type === selectedField.type)?.label ?? selectedField.type}</Badge>

                    <Field label="Label" required>
                      <Input
                        value={selectedField.label}
                        onChange={(e) => {
                          const label = e.target.value;
                          const shouldAutoKey = !selectedField.key || selectedField.key === slugifyKey(selectedField.label);
                          updateSelectedField({ label, key: shouldAutoKey ? slugifyKey(label) : selectedField.key });
                        }}
                      />
                    </Field>

                    <Field label="Key" required hint="Machine key, stored on every record.">
                      <Input
                        value={selectedField.key}
                        onChange={(e) => updateSelectedField({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                      />
                    </Field>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-ink-2">
                        <input
                          type="checkbox"
                          checked={selectedField.required}
                          onChange={(e) => updateSelectedField({ required: e.target.checked })}
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-ink-2">
                        <input
                          type="checkbox"
                          checked={!!selectedField.unique}
                          onChange={(e) => updateSelectedField({ unique: e.target.checked })}
                        />
                        Unique
                      </label>
                    </div>

                    <Field label="Help Text">
                      <Input
                        value={selectedField.helpText || ""}
                        onChange={(e) => updateSelectedField({ helpText: e.target.value })}
                      />
                    </Field>

                    {(selectedField.type === "select" || selectedField.type === "multiselect") && (
                      <div>
                        <p className="text-xs text-ink-2 mb-1.5">Options</p>
                        <div className="space-y-1.5">
                          {(selectedField.options || []).map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1.5">
                              <Input
                                className="text-xs"
                                placeholder="value"
                                value={opt.value}
                                onChange={(e) => {
                                  const options = [...(selectedField.options || [])];
                                  options[oi] = { ...options[oi], value: e.target.value };
                                  updateSelectedField({ options });
                                }}
                              />
                              <Input
                                className="text-xs"
                                placeholder="Label"
                                value={opt.label}
                                onChange={(e) => {
                                  const options = [...(selectedField.options || [])];
                                  options[oi] = { ...options[oi], label: e.target.value };
                                  updateSelectedField({ options });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const options = (selectedField.options || []).filter((_, i) => i !== oi);
                                  updateSelectedField({ options });
                                }}
                                className="text-ink-3 hover:text-danger shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedField({ options: [...(selectedField.options || []), { value: "", label: "" }] })
                            }
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            + Add option
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedField.type === "reference" && (
                      <Field label="Related Module Key" hint="The module key this field points to (e.g. customers).">
                        <Input
                          value={selectedField.referenceModuleKey || ""}
                          onChange={(e) => updateSelectedField({ referenceModuleKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                        />
                      </Field>
                    )}

                    {(selectedField.type === "text" || selectedField.type === "textarea") && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Min length">
                          <Input
                            type="number"
                            value={selectedField.validation?.minLength ?? ""}
                            onChange={(e) =>
                              updateSelectedField({
                                validation: { ...selectedField.validation, minLength: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </Field>
                        <Field label="Max length">
                          <Input
                            type="number"
                            value={selectedField.validation?.maxLength ?? ""}
                            onChange={(e) =>
                              updateSelectedField({
                                validation: { ...selectedField.validation, maxLength: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </Field>
                      </div>
                    )}

                    {(selectedField.type === "number" || selectedField.type === "currency") && (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Min">
                          <Input
                            type="number"
                            value={selectedField.validation?.min ?? ""}
                            onChange={(e) =>
                              updateSelectedField({
                                validation: { ...selectedField.validation, min: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </Field>
                        <Field label="Max">
                          <Input
                            type="number"
                            value={selectedField.validation?.max ?? ""}
                            onChange={(e) =>
                              updateSelectedField({
                                validation: { ...selectedField.validation, max: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
