const STYLE_ID = 'academic-ui-styles'

const CSS = `
.ac-shell {
  --ac-space-1: 4px;
  --ac-space-2: 8px;
  --ac-space-3: 12px;
  --ac-space-4: 16px;
  --ac-space-5: 24px;
  --ac-space-6: 32px;
  --ac-radius-sm: 8px;
  --ac-radius-md: 12px;
  --ac-accent: #2563eb;
  --ac-ok: #16794a;
  --ac-warn: #b45309;
  --ac-danger: #b3261e;
  --ac-font-body: 14px;
  --ac-font-hint: 12px;
  --ac-border: color-mix(in srgb, currentColor 14%, transparent);
  --ac-surface: color-mix(in srgb, currentColor 3%, transparent);
  height: 100%;
  overflow: auto;
  padding: 28px 32px 56px;
  color: inherit;
  font: inherit;
  font-size: var(--ac-font-body);
  line-height: 1.55;
}
@media (prefers-color-scheme: dark) {
  .ac-shell {
    --ac-accent: #7aa2ff;
    --ac-ok: #5ccf9b;
    --ac-warn: #f0b45c;
    --ac-danger: #ff8a80;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ac-shell *,
  .ac-shell *::before,
  .ac-shell *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
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
  border-color: color-mix(in srgb, var(--ac-accent) 55%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 14%, transparent);
}
.ac-button-danger {
  border-color: color-mix(in srgb, var(--ac-danger) 55%, transparent);
  background: color-mix(in srgb, var(--ac-danger) 12%, transparent);
}
.ac-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
}
.ac-link:hover { opacity: 1; }
.ac-muted { opacity: 0.62; font-size: 13px; }
.ac-text-bad { color: color-mix(in srgb, var(--ac-danger) 80%, currentColor); }
.ac-text-warn { color: color-mix(in srgb, var(--ac-warn) 80%, currentColor); }
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
  border-color: color-mix(in srgb, var(--ac-ok) 45%, transparent);
  background: color-mix(in srgb, var(--ac-ok) 12%, transparent);
}
.ac-badge-warn {
  border-color: color-mix(in srgb, var(--ac-warn) 45%, transparent);
  background: color-mix(in srgb, var(--ac-warn) 12%, transparent);
}
.ac-badge-bad {
  border-color: color-mix(in srgb, var(--ac-danger) 45%, transparent);
  background: color-mix(in srgb, var(--ac-danger) 12%, transparent);
}
.ac-badge-info {
  border-color: color-mix(in srgb, var(--ac-accent) 45%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 10%, transparent);
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
  border-color: color-mix(in srgb, var(--ac-warn) 45%, transparent);
  background: color-mix(in srgb, var(--ac-warn) 12%, transparent);
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
  border-color: color-mix(in srgb, var(--ac-danger) 40%, transparent);
  background: color-mix(in srgb, var(--ac-danger) 8%, transparent);
}
.ac-banner-warn {
  border-color: color-mix(in srgb, var(--ac-warn) 40%, transparent);
  background: color-mix(in srgb, var(--ac-warn) 8%, transparent);
}
.ac-banner-ok {
  border-color: color-mix(in srgb, var(--ac-ok) 40%, transparent);
  background: color-mix(in srgb, var(--ac-ok) 8%, transparent);
}
.ac-banner-info {
  border-color: color-mix(in srgb, var(--ac-accent) 40%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 8%, transparent);
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
.ac-stat-bad { border-color: color-mix(in srgb, var(--ac-danger) 35%, transparent); }
.ac-stat-warn { border-color: color-mix(in srgb, var(--ac-warn) 35%, transparent); }
.ac-stat-ok { border-color: color-mix(in srgb, var(--ac-ok) 35%, transparent); }
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
.ac-unread { border-left: 3px solid color-mix(in srgb, var(--ac-accent) 65%, transparent); }
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
.ac-form-card select,
.ac-form-card textarea {
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  padding: 5px 8px;
  min-width: 0;
}
.ac-form-card textarea {
  width: 100%;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.ac-field input:focus-visible,
.ac-field select:focus-visible,
.ac-form-card input:focus-visible,
.ac-form-card select:focus-visible,
.ac-form-card textarea:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 1px;
}
.ac-config-details { margin-top: 10px; font-size: 12px; }
.ac-config-details summary { cursor: pointer; opacity: 0.68; }
.ac-config-details pre {
  max-height: 220px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 5%, transparent);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  border-color: color-mix(in srgb, var(--ac-ok) 55%, transparent);
  background: color-mix(in srgb, var(--ac-ok) 16%, transparent);
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
  color: color-mix(in srgb, var(--ac-warn) 85%, currentColor);
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

.ac-button {
  min-height: 32px;
}
.ac-skip-link {
  position: absolute;
  left: 16px;
  top: -60px;
  z-index: 20;
  border: 1px solid var(--ac-border);
  border-radius: var(--ac-radius-sm);
  background: Canvas;
  color: CanvasText;
  padding: 8px 12px;
}
.ac-skip-link:focus-visible { top: 12px; }
#ac-main:focus-visible { outline: none; }
.ac-button-quiet {
  border-color: transparent;
  background: transparent;
  padding-inline: 8px;
}
.ac-button-quiet:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.ac-header-title h1 { margin: 0; }
.ac-header-title p { margin: 3px 0 0; }
.ac-reminder-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: var(--ac-radius-sm);
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.ac-reminder-button:hover {
  background: color-mix(in srgb, currentColor 9%, transparent);
}
.ac-reminder-button:focus-visible,
.ac-summary-chip:focus-visible,
.ac-today-main:focus-visible,
.ac-compact-main:focus-visible,
.ac-course-select:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 45%, transparent);
  outline-offset: 2px;
}
.ac-reminder-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ac-accent) 20%, transparent);
  color: inherit;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.ac-tabs {
  align-items: flex-end;
  gap: 18px;
}
.ac-nav-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.ac-nav-group-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.48;
  padding-inline: 4px;
  white-space: nowrap;
}
.ac-nav-group-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.ac-today-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin: 4px 0 12px;
}
.ac-today-date {
  margin: 0;
  font-size: 20px;
  line-height: 1.3;
}
.ac-summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 18px;
}
.ac-summary-chip {
  appearance: none;
  display: flex;
  align-items: baseline;
  gap: 6px;
  border: 1px solid var(--ac-border);
  border-radius: var(--ac-radius-sm);
  background: var(--ac-surface);
  color: inherit;
  font: inherit;
  padding: 6px 10px;
  min-height: 32px;
  cursor: pointer;
}
.ac-summary-chip:hover {
  border-color: color-mix(in srgb, currentColor 26%, transparent);
}
.ac-summary-chip strong { font-size: 16px; line-height: 1; }
.ac-summary-chip span { font-size: var(--ac-font-hint); opacity: 0.7; }
.ac-summary-chip-bad strong { color: var(--ac-danger); }
.ac-summary-chip-warn strong { color: var(--ac-warn); }
.ac-today-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.85fr);
  gap: 22px;
  align-items: start;
}
.ac-today-primary,
.ac-today-side { min-width: 0; }
.ac-today-side .ac-section:first-child { margin-top: 0; }
.ac-next-block {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  border: 1px solid color-mix(in srgb, var(--ac-accent) 30%, transparent);
  border-left: 4px solid var(--ac-accent);
  border-radius: var(--ac-radius-md);
  padding: 14px;
  background: color-mix(in srgb, var(--ac-accent) 6%, transparent);
}
.ac-next-block > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 160px;
}
.ac-next-block-time {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.ac-today-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.ac-today-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, currentColor 11%, transparent);
  border-radius: var(--ac-radius-sm);
  padding: 7px 10px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-today-main {
  appearance: none;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 2px 0;
}
.ac-today-main:hover .ac-today-title { text-decoration: underline; text-underline-offset: 2px; }
.ac-today-title {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.ac-today-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ac-today-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 30%, transparent);
}
.ac-today-dot-bad { background: var(--ac-danger); }
.ac-compact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  padding: 6px 0;
}
.ac-compact-row:last-child { border-bottom: 0; }
.ac-compact-main {
  appearance: none;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 2px 0;
}
.ac-compact-main strong { overflow-wrap: anywhere; }
.ac-row-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.ac-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}
.ac-task-highlight {
  outline: 2px solid color-mix(in srgb, var(--ac-accent) 45%, transparent);
  outline-offset: 2px;
}
.ac-course-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.5fr);
  gap: 20px;
  align-items: start;
}
.ac-course-list-panel {
  border: 1px solid var(--ac-border);
  border-radius: var(--ac-radius-md);
  padding: 8px;
  background: var(--ac-surface);
}
.ac-course-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--ac-radius-sm);
  padding: 4px;
}
.ac-course-item + .ac-course-item { margin-top: 4px; }
.ac-course-item-selected {
  border-color: color-mix(in srgb, var(--ac-accent) 38%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 6%, transparent);
}
.ac-course-select {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
}
.ac-course-select:hover { background: color-mix(in srgb, currentColor 5%, transparent); }
.ac-course-title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.ac-course-title strong { overflow-wrap: anywhere; }
.ac-course-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  font-size: var(--ac-font-hint);
  opacity: 0.62;
}
.ac-course-item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.ac-course-editor {
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding-top: 10px;
}
.ac-course-detail { min-width: 0; }
.ac-course-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.ac-course-detail-head h2 { margin: 0; font-size: 18px; }
.ac-course-detail-head p { margin: 3px 0 0; }
.ac-course-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ac-source-flow {
  font-size: var(--ac-font-hint);
  border-left: 2px solid color-mix(in srgb, currentColor 16%, transparent);
  padding-left: 8px;
}
.ac-current-step {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.ac-source-status-text {
  font-size: 13px;
  opacity: 0.7;
  padding: 4px 2px;
}
.ac-source-more {
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding-top: 6px;
}
.ac-source-more-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding-top: 8px;
}
.ac-plan-steps {
  list-style: none;
  display: grid;
  gap: 6px;
  margin: 10px 0 4px;
  padding: 0;
}
.ac-plan-steps li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 3px solid color-mix(in srgb, currentColor 16%, transparent);
  padding: 4px 0 4px 10px;
}
.ac-plan-steps span { font-size: var(--ac-font-hint); opacity: 0.65; }
.ac-plan-step-current { border-left-color: var(--ac-accent) !important; }
.ac-plan-step-done { border-left-color: var(--ac-ok) !important; }
.ac-plan-step-warn { border-left-color: var(--ac-warn) !important; }
.ac-plan-step-pending { opacity: 0.75; }
.ac-plan-diff {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, currentColor 18%, transparent);
  border-radius: var(--ac-radius-sm);
}
.ac-guide-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.ac-guide-steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid color-mix(in srgb, currentColor 11%, transparent);
  border-radius: var(--ac-radius-sm);
  padding: 10px 12px;
}
.ac-guide-steps li > div:not(.ac-inline-actions) {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ac-guide-step-done {
  opacity: 0.62;
  border-color: color-mix(in srgb, var(--ac-ok) 30%, transparent) !important;
}
.ac-guide-index {
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  font-size: 11px;
}
.ac-guide-step-done .ac-guide-index {
  border-color: color-mix(in srgb, var(--ac-ok) 50%, transparent);
  color: var(--ac-ok);
}
@media (max-width: 1040px) {
  .ac-today-grid,
  .ac-course-workspace { grid-template-columns: 1fr; }
  .ac-today-side .ac-section:first-child { margin-top: 26px; }
}
@media (max-width: 720px) {
  .ac-header { flex-direction: column; align-items: stretch; }
  .ac-header-actions { justify-content: flex-start; }
  .ac-tabs { gap: 8px; }
  .ac-nav-group { flex-direction: column; align-items: flex-start; gap: 2px; }
  .ac-nav-group-label { padding: 0 2px; }
  .ac-today-meta { width: 100%; justify-content: flex-start; padding-left: 36px; }
  .ac-today-row { flex-wrap: wrap; }
  .ac-next-block { align-items: flex-start; }
  .ac-course-summary { display: none; }
  .ac-guide-steps li { flex-wrap: wrap; }
  .ac-guide-steps li .ac-inline-actions { width: 100%; }
}
@media (pointer: coarse) {
  .ac-button,
  .ac-tab,
  .ac-toggle button,
  .ac-reminder-button,
  .ac-summary-chip { min-height: 44px; }
  .ac-check { width: 32px; height: 32px; }
}

.ac-material-page { padding-bottom: 12px; }
.ac-material-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 16px 0 18px;
}
.ac-material-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(340px, 0.8fr);
  gap: 18px;
  align-items: start;
}
.ac-material-panel {
  border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
  border-radius: 14px;
  padding: 18px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-material-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.ac-material-head h2 { margin: 0; font-size: 16px; }
.ac-material-head p { margin: 3px 0 0; font-size: 12px; opacity: 0.62; }
.ac-material-course {
  max-width: 250px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 8px;
  padding: 6px 8px;
}
.ac-material-searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 10px;
  padding: 5px 6px 5px 12px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}
.ac-material-searchbar > svg { flex: none; opacity: 0.5; }
.ac-material-searchbar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  padding: 6px 0;
  outline: none;
}
.ac-material-clear {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  opacity: 0.5;
}
.ac-material-clear:hover { opacity: 0.9; }
.ac-material-results {
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--ac-accent) 22%, transparent);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--ac-accent) 4%, transparent);
}
.ac-material-results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
}
.ac-material-hit-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ac-material-hit {
  border-left: 3px solid color-mix(in srgb, var(--ac-accent) 55%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}
.ac-material-hit-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}
.ac-material-hit-head strong { overflow-wrap: anywhere; }
.ac-material-hit-place {
  flex: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
  white-space: nowrap;
}
.ac-material-hit p { margin: 6px 0 3px; font-size: 13px; line-height: 1.55; }
.ac-material-hit mark {
  background: color-mix(in srgb, #f5b301 32%, transparent);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}
.ac-material-hit-actions { text-align: right; }
.ac-material-list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.ac-material-list-head h3 { margin: 0; font-size: 13px; }
.ac-material-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ac-material-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-material-item:hover { border-color: color-mix(in srgb, currentColor 22%, transparent); }
.ac-material-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
}
.ac-material-icon-pdf {
  color: color-mix(in srgb, var(--ac-danger) 85%, currentColor);
  border-color: color-mix(in srgb, var(--ac-danger) 28%, transparent);
  background: color-mix(in srgb, var(--ac-danger) 9%, transparent);
}
.ac-material-icon-html {
  color: color-mix(in srgb, var(--ac-accent) 85%, currentColor);
  border-color: color-mix(in srgb, var(--ac-accent) 28%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 9%, transparent);
}
.ac-material-icon-pptx {
  color: color-mix(in srgb, var(--ac-warn) 85%, currentColor);
  border-color: color-mix(in srgb, var(--ac-warn) 28%, transparent);
  background: color-mix(in srgb, var(--ac-warn) 9%, transparent);
}
.ac-material-icon-docx {
  color: color-mix(in srgb, #1d4ed8 85%, currentColor);
  border-color: color-mix(in srgb, #1d4ed8 28%, transparent);
  background: color-mix(in srgb, #1d4ed8 9%, transparent);
}
.ac-material-item-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ac-material-item-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ac-material-item-title strong { font-size: 14px; overflow-wrap: anywhere; }
.ac-material-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  font-size: 12px;
  opacity: 0.62;
}
.ac-material-note {
  margin: 2px 0 0;
  font-size: 12px;
  color: color-mix(in srgb, var(--ac-warn) 78%, currentColor);
  overflow-wrap: anywhere;
}
.ac-material-item-actions { display: flex; align-items: center; gap: 8px; }
.ac-material-side { position: sticky; top: 16px; }
.ac-material-modes { width: 100%; margin-bottom: 12px; }
.ac-material-modes button { flex: 1; }
.ac-material-form { display: flex; flex-direction: column; gap: 12px; }
.ac-material-form textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: color-mix(in srgb, currentColor 4%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 7px;
  padding: 7px 9px;
}
.ac-material-form textarea:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 1px;
}
.ac-material-drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
  border: 1px dashed color-mix(in srgb, currentColor 26%, transparent);
  border-radius: 12px;
  padding: 20px 12px 16px;
  cursor: pointer;
  background: color-mix(in srgb, currentColor 2%, transparent);
}
.ac-material-drop:hover { border-color: color-mix(in srgb, var(--ac-accent) 45%, transparent); }
.ac-material-drop:focus-within {
  outline: 2px solid color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 2px;
}
.ac-material-drop strong { font-size: 13px; overflow-wrap: anywhere; }
.ac-material-drop span { font-size: 12px; opacity: 0.58; }
.ac-material-pick { margin-top: 6px; opacity: 1 !important; pointer-events: none; }
.ac-material-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.ac-material-drop-filled {
  border-style: solid;
  border-color: color-mix(in srgb, var(--ac-accent) 40%, transparent);
  background: color-mix(in srgb, var(--ac-accent) 5%, transparent);
}
.ac-material-submit { width: 100%; padding: 8px 12px; font-weight: 600; }
.ac-material-callout {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px dashed color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.ac-material-callout .ac-link {
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.ac-material-advanced {
  margin-top: 16px;
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  padding-top: 12px;
}
.ac-material-advanced summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  list-style: none;
}
.ac-material-advanced summary::-webkit-details-marker { display: none; }
.ac-material-advanced summary::before {
  content: '›';
  display: inline-block;
  margin-right: 4px;
  transition: transform 0.15s ease;
  opacity: 0.6;
}
.ac-material-advanced[open] summary::before { transform: rotate(90deg); }
.ac-material-advanced summary > span { flex: 1; }
.ac-material-advanced-body { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }
.ac-material-permission {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
}
.ac-material-permission > div { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.ac-material-auto-result {
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
}
.ac-material-auto-stats { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 6px; }
.ac-material-auto-list { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
.ac-material-auto-list li { display: flex; justify-content: space-between; gap: 10px; }
.ac-material-auto-list li span:first-child { overflow-wrap: anywhere; }
@media (max-width: 1180px) {
  .ac-material-layout { grid-template-columns: 1fr; }
  .ac-material-side { position: static; }
  .ac-material-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .ac-material-stats { grid-template-columns: 1fr; }
  .ac-material-head { flex-direction: column; }
  .ac-material-item { grid-template-columns: 32px minmax(0, 1fr); }
  .ac-material-item-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .ac-material-searchbar { flex-wrap: wrap; }
  .ac-material-course { max-width: 100%; }
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
