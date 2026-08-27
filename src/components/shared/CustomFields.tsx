'use client'

/**
 * Shared "extra fields" building block -- one hook + one renderer +
 * one validator, reused by every form that supports admin/vendor-defined
 * custom fields (see models/CustomFieldDefinition.ts). A form only needs:
 *
 *   const { fields } = useCustomFields('JOBSHEET')
 *   const [customFields, setCustomFields] = useState<Record<string, any>>({})
 *   ...
 *   <CustomFieldsRenderer fields={fields} values={customFields} onChange={setCustomFields} />
 *   ...
 *   const err = validateCustomFields(fields, customFields)  // before submit
 *   ...
 *   body: JSON.stringify({ ...existingFields, customFields })
 */

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'

export type CustomFieldForm = 'JOBSHEET' | 'CUSTOMER' | 'SALES_INVOICE' | 'QUOTATION' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PROFORMA_INVOICE'

export interface CustomFieldDef {
  _id: string
  fieldKey: string
  label: string
  inputType: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'SELECT' | 'CHECKBOX'
  options: string[]
  mandatory: boolean
  order: number
  vendorId: string | null
}

export function useCustomFields(formKey: CustomFieldForm) {
  const { data, isLoading, mutate } = useSWR(`/api/custom-fields?formKey=${formKey}`)
  const fields: CustomFieldDef[] = data?.success ? data.fields : []
  return { fields, loading: isLoading, refresh: mutate }
}

/** Returns an error message if any mandatory field is missing/empty, else null. */
export function validateCustomFields(fields: CustomFieldDef[], values: Record<string, any>): string | null {
  for (const f of fields) {
    if (!f.mandatory) continue
    const v = values[f.fieldKey]
    const empty = f.inputType === 'CHECKBOX' ? false : v === undefined || v === null || String(v).trim() === ''
    if (empty) return `${f.label} is required`
  }
  return null
}

export function CustomFieldsRenderer({
  fields,
  values,
  onChange,
  title = 'Additional Details',
}: {
  fields: CustomFieldDef[]
  values: Record<string, any>
  onChange: (next: Record<string, any>) => void
  title?: string
}) {
  if (fields.length === 0) return null

  function set(key: string, val: any) {
    onChange({ ...values, [key]: val })
  }

  return (
    <div className="space-y-4">
      <p className="eyebrow">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <Field key={f._id} label={f.label} required={f.mandatory} className={f.inputType === 'TEXTAREA' ? 'sm:col-span-2' : ''}>
            {f.inputType === 'TEXTAREA' ? (
              <Textarea value={values[f.fieldKey] ?? ''} onChange={(e) => set(f.fieldKey, e.target.value)} />
            ) : f.inputType === 'SELECT' ? (
              <Select value={values[f.fieldKey] ?? ''} onChange={(e) => set(f.fieldKey, e.target.value)}>
                <option value="">Select...</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            ) : f.inputType === 'CHECKBOX' ? (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={!!values[f.fieldKey]} onChange={(e) => set(f.fieldKey, e.target.checked)} className="rounded border-border" />
                Yes
              </label>
            ) : f.inputType === 'NUMBER' ? (
              <Input type="number" value={values[f.fieldKey] ?? ''} onChange={(e) => set(f.fieldKey, e.target.value)} />
            ) : f.inputType === 'DATE' ? (
              <Input type="date" value={values[f.fieldKey] ?? ''} onChange={(e) => set(f.fieldKey, e.target.value)} />
            ) : (
              <Input type="text" value={values[f.fieldKey] ?? ''} onChange={(e) => set(f.fieldKey, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
    </div>
  )
}

/** Read-only display, for detail/view pages that don't edit the record. */
export function CustomFieldsDisplay({ fields, values }: { fields: CustomFieldDef[]; values: Record<string, any> | undefined }) {
  const populated = fields.filter((f) => values?.[f.fieldKey] !== undefined && values[f.fieldKey] !== '' && values[f.fieldKey] !== null)
  if (populated.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="eyebrow">Additional Details</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {populated.map((f) => (
          <div key={f._id}>
            <p className="text-xs text-ink-3">{f.label}</p>
            <p className="text-sm text-ink">{f.inputType === 'CHECKBOX' ? (values![f.fieldKey] ? 'Yes' : 'No') : String(values![f.fieldKey])}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
