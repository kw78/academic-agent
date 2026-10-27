const STYLE_ID = 'academic-ui-styles'

const CSS = `
.ac-shell {
  height: 100%;
  overflow: auto;
  padding: 28px 32px 56px;
  color: inherit;
  font: inherit;
  line-height: 1.55;
}
.ac-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.ac-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.ac-header p {
  margin: 4px 0 0;
  opacity: 0.66;
}
.ac-header-actions,
.ac-inline-actions,
.ac-section-actions,
.ac-banner-actions,
.ac-form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.ac-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  margin-bottom: 18px;
}
.ac-tab {
  appearance: none;
  background: transparent;
  color: inherit;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 8px 12px;
  font: inherit;
  opacity: 0.7;
  cursor: pointer;
}
.ac-tab:hover { opacity: 1; }
.ac-tab-active {
  opacity: 1;
  border-bottom-color: currentColor;
  font-weight: 600;
}
.ac-tab:focus-visible,
.ac-button:focus-visible,
.ac-check:focus-visible,
.ac-link:focus-visible,
.ac-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 45%, transparent);
  outline-offset: 2px;
  border-radius: 6px;
}
.ac-panel { min-height: 200px; }
.ac-button {
  appearance: none;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  color: inherit;
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.ac-button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.ac-button:disabled { opacity: 0.45; cursor: default; }
.ac-button-primary {
  border-color: color-mix(in srgb, #2563eb 55%, transparent);
  background: color-mix(in srgb, #2563eb 14%, transparent);
}
.ac-button-danger {
  border-color: color-mix(in srgb, #b3261e 55%, transparent);
  background: color-mix(in srgb, #b3261e 12%, transparent);
}
.ac-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
}
.ac-link:hover { opacity: 1; }
.ac-muted { opacity: 0.62; font-size: 13px; }
.ac-text-bad { color: color-mix(in srgb, #b3261e 80%, currentColor); }
.ac-text-warn { color: color-mix(in srgb, #b45309 80%, currentColor); }
.ac-footnote { margin-top: 28px; }
.ac-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
.ac-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  white-space: nowrap;
}
.ac-badge-ok {
  border-color: color-mix(in srgb, #16794a 45%, transparent);
  background: color-mix(in srgb, #16794a 12%, transparent);
}
.ac-badge-warn {
  border-color: color-mix(in srgb, #b45309 45%, transparent);
  background: color-mix(in srgb, #b45309 12%, transparent);
}
.ac-badge-bad {
  border-color: color-mix(in srgb, #b3261e 45%, transparent);
  background: color-mix(in srgb, #b3261e 12%, transparent);
}
.ac-badge-info {
  border-color: color-mix(in srgb, #2563eb 45%, transparent);
  background: color-mix(in srgb, #2563eb 10%, transparent);
}
.ac-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 12px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
}
.ac-chip-warn {
  border-color: color-mix(in srgb, #b45309 45%, transparent);
  background: color-mix(in srgb, #b45309 12%, transparent);
}
.ac-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 14px 0;
  background: color-mix(in srgb, currentColor 4%, transparent);
}
.ac-banner p { margin: 4px 0 0; opacity: 0.75; }
.ac-banner-error {
  border-color: color-mix(in srgb, #b3261e 40%, transparent);
  background: color-mix(in srgb, #b3261e 8%, transparent);
}
.ac-banner-warn {
  border-color: color-mix(in srgb, #b45309 40%, transparent);
  background: color-mix(in srgb, #b45309 8%, transparent);
}
.ac-banner-ok {
  border-color: color-mix(in srgb, #16794a 40%, transparent);
  background: color-mix(in srgb, #16794a 8%, transparent);
}
.ac-banner-info {
  border-color: color-mix(in srgb, #2563eb 40%, transparent);
  background: color-mix(in srgb, #2563eb 8%, transparent);
}
.ac-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}
.ac-stat-grid-small {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 12px 0;
}
.ac-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 10px;
  padding: 12px 14px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}
.ac-stat-label { font-size: 12px; opacity: 0.66; }
.ac-stat-value { font-size: 22px; line-height: 1.2; }
.ac-stat-hint { font-size: 12px; opacity: 0.58; }
.ac-stat-bad { border-color: color-mix(in srgb, #b3261e 35%, transparent); }
.ac-stat-warn { border-color: color-mix(in srgb, #b45309 35%, transparent); }
.ac-stat-ok { border-color: color-mix(in srgb, #16794a 35%, transparent); }
.ac-inline-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 12px 0;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-inline-bar > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.ac-section { margin-top: 26px; }
.ac-section-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.ac-section-title h2 { margin: 0; font-size: 16px; }
.ac-section-title p { margin: 3px 0 0; }
.ac-subsection { margin-top: 18px; }
.ac-subsection h3 { margin: 0 0 8px; font-size: 14px; }
.ac-two-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.ac-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 10px;
  padding: 12px 14px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}
.ac-card > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ac-card strong { font-size: 14px; }
.ac-course-list { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
.ac-source-grid { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
.ac-source-card { align-items: flex-start; }
.ac-source-main { flex: 1; }
.ac-source-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.ac-job-card { align-items: center; }
.ac-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ac-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-list-row > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ac-unread { border-left: 3px solid color-mix(in srgb, #2563eb 65%, transparent); }
.ac-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ac-timeline-row {
  display: grid;
  grid-template-columns: 92px 1fr auto;
  gap: 10px;
  align-items: center;
  border-left: 2px solid color-mix(in srgb, currentColor 20%, transparent);
  padding: 6px 0 6px 12px;
}
.ac-timeline-row time { font-size: 12px; opacity: 0.66; }
.ac-timeline-row > div { display: flex; flex-direction: column; }
.ac-empty {
  border: 1px dashed color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 12px;
  padding: 22px;
  text-align: center;
}
.ac-empty h3 { margin: 0 0 6px; font-size: 15px; }
.ac-empty p { margin: 0; opacity: 0.65; }
.ac-empty-action { margin-top: 12px; }
.ac-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0;
}
.ac-toggle {
  display: inline-flex;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  overflow: hidden;
}
.ac-toggle button {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  cursor: pointer;
}
.ac-toggle button:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
.ac-toggle-active {
  background: color-mix(in srgb, currentColor 10%, transparent) !important;
  font-weight: 600;
}
.ac-filter-bar {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 10px;
  margin-bottom: 16px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.ac-field-label { opacity: 0.72; }
.ac-field-hint { font-size: 12px; opacity: 0.55; }
.ac-field input,
.ac-field select,
.ac-form-card input,
.ac-form-card select {
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  padding: 5px 8px;
  min-width: 0;
}
.ac-field input:focus-visible,
.ac-field select:focus-visible,
.ac-form-card input:focus-visible,
.ac-form-card select:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 1px;
}
.ac-form-card {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0 18px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-form-card h3 { margin: 0 0 12px; font-size: 14px; }
.ac-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.ac-form-actions { margin-top: 14px; }
.ac-task-list,
.ac-item-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ac-task-row,
.ac-item-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 10px;
  padding: 12px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-task-completed { opacity: 0.62; }
.ac-check {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 26%, transparent);
  background: transparent;
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  margin-top: 1px;
}
.ac-check-done {
  border-color: color-mix(in srgb, #16794a 55%, transparent);
  background: color-mix(in srgb, #16794a 16%, transparent);
}
.ac-task-main { flex: 1; min-width: 0; }
.ac-task-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.ac-task-title strong { font-size: 14px; }
.ac-task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 3px;
  font-size: 12px;
  opacity: 0.68;
}
.ac-task-note { margin: 5px 0 0; font-size: 12px; }
.ac-task-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.ac-inline-form { display: flex; align-items: center; gap: 4px; }
.ac-inline-form input {
  width: 72px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 6px;
  padding: 4px 6px;
}
.ac-item-row { justify-content: space-between; }
.ac-item-due { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ac-day-groups { display: grid; gap: 14px; }
.ac-day-group h3 { margin: 0 0 6px; font-size: 13px; }
.ac-block-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.ac-block-row {
  display: grid;
  grid-template-columns: 96px 1fr auto auto;
  gap: 10px;
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 11%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.ac-block-row time { font-size: 12px; opacity: 0.7; }
.ac-warning-list {
  margin: 10px 0;
  padding-left: 20px;
  font-size: 13px;
  color: color-mix(in srgb, #b45309 85%, currentColor);
}
.ac-slot-list { list-style: none; margin: 0 0 10px; padding: 0; display: grid; gap: 8px; }
.ac-slot-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.ac-slot-row input,
.ac-slot-row select {
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  padding: 5px 8px;
}
.ac-secret-form {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  margin-top: 10px;
  padding-top: 10px;
}
.ac-secret-form input { min-width: 220px; }
.ac-table-wrap { overflow-x: auto; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; }
.ac-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ac-table th,
.ac-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  vertical-align: top;
}
.ac-table th { font-weight: 600; font-size: 12px; opacity: 0.72; }
.ac-table tr:last-child td { border-bottom: 0; }
@media (max-width: 1020px) {
  .ac-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ac-two-column { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .ac-shell { padding: 20px 14px 44px; }
  .ac-header { flex-direction: column; }
  .ac-stat-grid { grid-template-columns: 1fr; }
  .ac-task-row, .ac-item-row { flex-wrap: wrap; }
  .ac-task-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .ac-block-row { grid-template-columns: 1fr; }
  .ac-inline-bar { align-items: flex-start; flex-direction: column; }
  .ac-source-actions { flex-direction: row; flex-wrap: wrap; }
}
`

export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const existing = document.getElementById(STYLE_ID)
  if (existing) return () => undefined
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
  return () => element.remove()
}
