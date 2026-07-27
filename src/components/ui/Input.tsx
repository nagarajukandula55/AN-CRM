'use client'

import { forwardRef } from 'react'
import { cn } from './cn'

interface FieldWrapProps {
  label?: React.ReactNode
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/** Consistent label/hint/error chrome around any control -- one place that
 * decides how a required marker, a hint line, and an error message look,
 * instead of each form page inventing its own. */
export function Field({ label, hint, error, required, className, children }: FieldWrapProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-ink-2 mb-1.5">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

const controlCls = cn(
  'w-full bg-surface border border-border-strong rounded-control px-4 py-2.5 text-sm text-ink',
  'outline-none transition-colors placeholder:text-ink-3',
  'focus:border-accent focus:ring-2 focus:ring-accent-soft',
  'disabled:opacity-50 disabled:cursor-not-allowed'
)

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(controlCls, error && 'border-danger focus:border-danger focus:ring-danger-soft', className)}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(controlCls, 'resize-none', className)} {...props} />
  )
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlCls, className)} {...props}>
      {children}
    </select>
  )
)
Select.displayName = 'Select'
