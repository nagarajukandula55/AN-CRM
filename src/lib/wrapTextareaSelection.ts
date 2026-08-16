/**
 * Wraps the current selection in a <textarea> with before/after markup
 * (e.g. "<b>" / "</b>") and returns the new full value -- shared by every
 * plain-textarea template editor (Telegram/WhatsApp templates in Settings,
 * Email Templates admin page) so formatting buttons work identically
 * everywhere instead of each page reinventing selection handling.
 * Restores focus + selection around the inserted markup afterward so a
 * user can keep formatting without having to re-click into the field.
 */
export function wrapTextareaSelection(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = ""
): string {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const selected = el.value.slice(start, end) || placeholder;
  const next = el.value.slice(0, start) + before + selected + after + el.value.slice(end);

  // Re-select the inserted text (not the markup) on the next tick, once
  // React has re-rendered the textarea with the new value.
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + before.length, start + before.length + selected.length);
  });

  return next;
}
