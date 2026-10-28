window.__ModuleLoader__.load({
  id: "@academic/dsh-ui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/academic-dsh-ui/src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  default: () => index_default,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react9 = require("react");

// packages/academic-dsh-ui/src/client/api.ts
function mapRpcCode(code) {
  switch (code) {
    case "gateway/input-invalid":
      return "VALIDATION";
    case "gateway/cancelled":
    case "gateway/peer-disposed":
      return "UNAVAILABLE";
    case "gateway/invocation-unavailable":
    case "gateway/binding-invalid":
    case "gateway/method-unavailable":
      return "UNAVAILABLE";
    case "remote-access/denied":
      return "FORBIDDEN";
    default:
      return "ERROR";
  }
}
function failure(error) {
  return { ok: false, error };
}
async function callApi(ctx, method, request = {}, signal) {
  const rpc = ctx.connection?.rpc;
  if (!rpc?.call) {
    return failure({
      code: "UNAVAILABLE",
      message: "DSH Host \u8FDE\u63A5\u5C1A\u672A\u5EFA\u7ACB\uFF1B\u8BF7\u786E\u8BA4 DSH Host \u5DF2\u542F\u52A8\uFF0C\u6062\u590D\u540E\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002"
    });
  }
  try {
    const response = await rpc.call(
      "/api",
      `academic/${method}`,
      { args: { request } },
      signal
    );
    if (!response.ok) {
      const rpcCode = response.error?.code;
      if (rpcCode === "gateway/invocation-unavailable" || rpcCode === "gateway/binding-invalid" || rpcCode === "gateway/method-unavailable") {
        return failure({
          code: "UNAVAILABLE",
          message: "Academic Host \u672A\u52A0\u8F7D\u6216\u7248\u672C\u4E0D\u5339\u914D\uFF1A\u8BF7\u786E\u8BA4 DSH \u4E2D academic-host \u4E0E academic-ui \u63D2\u4EF6\u5DF2\u542F\u7528\uFF0C\u7136\u540E\u5237\u65B0\u9875\u9762\u3002"
        });
      }
      return failure({
        code: mapRpcCode(rpcCode),
        message: response.error?.message ?? "Host \u8BF7\u6C42\u5931\u8D25"
      });
    }
    return response.value;
  } catch {
    return failure({
      code: "UNAVAILABLE",
      message: "\u65E0\u6CD5\u8FDE\u63A5 Academic Host\u3002\u8BF7\u786E\u8BA4 DSH Host \u4ECD\u5728\u8FD0\u884C\u4E14 @academic/dsh-ui \u5DF2\u52A0\u8F7D\uFF1B\u6062\u590D\u540E\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002"
    });
  }
}

// packages/academic-dsh-ui/src/client/components.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function Badge({
  tone = "neutral",
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `ac-badge ac-badge-${tone}`, children });
}
function Section({
  title,
  subtitle,
  actions,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "ac-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ac-section-title", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: title }),
        subtitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ac-muted", children: subtitle })
      ] }),
      actions && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ac-section-actions", children: actions })
    ] }),
    children
  ] });
}
function StatCard({
  label,
  value,
  hint,
  tone = "neutral"
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `ac-stat ac-stat-${tone}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ac-stat-label", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { className: "ac-stat-value", children: value }),
    hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ac-stat-hint", children: hint })
  ] });
}
function EmptyState({
  title,
  children,
  action
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ac-empty", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }),
    children && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children }),
    action && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ac-empty-action", children: action })
  ] });
}
function NoticeBar({
  notice,
  onDismiss
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `ac-banner ac-banner-${notice.tone}`, role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: notice.text }),
    onDismiss && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "ac-button", onClick: onDismiss, children: "\u5173\u95ED" })
  ] });
}
function StateBanner({
  state,
  failure: failure2,
  updatedAt,
  onRetry,
  onNavigate
}) {
  if (state === "ready" || state === "empty" || state === "loading") return null;
  const stamp = updatedAt ? `\u6700\u8FD1\u6709\u6548\u6570\u636E\uFF1A${new Date(updatedAt).toLocaleString("zh-CN")}` : void 0;
  const map = {
    "auth-required": { title: "\u9700\u8981\u91CD\u65B0\u8BA4\u8BC1", action: "\u524D\u5F80\u8FDE\u63A5" },
    conflict: { title: "\u72B6\u6001\u5DF2\u53D8\u5316", action: "\u5237\u65B0" },
    unavailable: { title: "Host \u670D\u52A1\u4E0D\u53EF\u7528", action: "\u91CD\u8BD5" },
    error: { title: "\u8BF7\u6C42\u5931\u8D25", action: "\u91CD\u8BD5" }
  };
  const stale = state === "stale" || state === "degraded";
  const entry = stale ? {
    title: state === "stale" ? "\u663E\u793A\u7684\u662F\u6700\u540E\u4E00\u6B21\u6709\u6548\u6570\u636E" : "\u90E8\u5206\u80FD\u529B\u6216\u6570\u636E\u6E90\u4E0D\u53EF\u7528",
    action: "\u5237\u65B0"
  } : map[state];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: `ac-banner ${state === "unavailable" || state === "error" ? "ac-banner-error" : "ac-banner-warn"}`,
      role: "alert",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: entry.title }),
          failure2 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: failure2.message }),
          stamp && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ac-muted", children: stamp })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ac-banner-actions", children: state === "auth-required" && onNavigate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "ac-button", onClick: onNavigate, children: entry.action }) : onRetry && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "ac-button", onClick: onRetry, children: entry.action ?? "\u91CD\u8BD5" }) })
      ]
    }
  );
}
function ConfirmAction({
  label,
  confirmLabel = "\u786E\u8BA4\u64CD\u4F5C",
  onConfirm,
  disabled = false
}) {
  const [armed, setArmed] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    if (!armed) return void 0;
    const timer = window.setTimeout(() => setArmed(false), 5e3);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: armed ? "ac-button ac-button-danger" : "ac-button",
      disabled,
      onClick: () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        void onConfirm();
      },
      children: armed ? confirmLabel : label
    }
  );
}
function Field({
  label,
  hint,
  children
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ac-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ac-field-label", children: label }),
    children,
    hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ac-field-hint", children: hint })
  ] });
}
function LoadingLine({ children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ac-muted", role: "status", children: children ?? "\u6B63\u5728\u52A0\u8F7D\u2026" });
}

// packages/academic-dsh-ui/src/client/styles.ts
var STYLE_ID = "academic-ui-styles";
var CSS = `
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
`;
function injectStyles() {
  if (typeof document === "undefined") return () => void 0;
  const existing = document.getElementById(STYLE_ID);
  if (existing) return () => void 0;
  const element = document.createElement("style");
  element.id = STYLE_ID;
  element.textContent = CSS;
  document.head.appendChild(element);
  return () => element.remove();
}

// packages/academic-dsh-ui/src/client/pages/types.ts
function askAgent(ctx, prompt) {
  try {
    const workspace = ctx.get?.("uiWorkspace");
    if (!workspace?.startSession) return false;
    workspace.startSession(void 0, { prompt });
    return true;
  } catch {
    return false;
  }
}

// packages/academic-dsh-ui/src/client/pages/DashboardPage.tsx
var import_react3 = require("react");

// packages/academic-dsh-ui/src/client/hooks.ts
var import_react2 = require("react");

// packages/academic-dsh-ui/src/client/state.ts
function initialLoad() {
  return { loading: true, stale: false };
}
function beginLoad(previous) {
  return {
    ...previous,
    loading: true
  };
}
function loadSuccess(value, updatedAt) {
  return {
    data: value,
    loading: false,
    stale: false,
    updatedAt
  };
}
function failureState(failure2) {
  switch (failure2.code) {
    case "UNAVAILABLE":
      return "unavailable";
    case "AUTH_REQUIRED":
      return "auth-required";
    case "CONFLICT":
      return "conflict";
    case "VALIDATION":
    case "CAPABILITY_UNAVAILABLE":
      return "degraded";
    default:
      return "error";
  }
}
function loadFailure(previous, failure2, updatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  return {
    ...previous,
    loading: false,
    stale: previous.data !== void 0,
    failure: failure2,
    updatedAt: previous.updatedAt ?? updatedAt
  };
}
function dataFailureState(failure2) {
  switch (failure2.code) {
    case "UNAVAILABLE":
      return "unavailable";
    case "AUTH_REQUIRED":
      return "auth-required";
    case "CONFLICT":
      return "conflict";
    default:
      return "stale";
  }
}
function viewState(state, isEmpty) {
  if (state.loading && state.data === void 0) return "loading";
  if (state.failure && state.data === void 0) return failureState(state.failure);
  if (state.failure) return dataFailureState(state.failure);
  if (state.data !== void 0 && isEmpty?.(state.data)) return "empty";
  return "ready";
}

// packages/academic-dsh-ui/src/client/hooks.ts
function useLoad(load, active, intervalMs = 0) {
  const [state, setState] = (0, import_react2.useState)(() => initialLoad());
  const loadRef = (0, import_react2.useRef)(load);
  loadRef.current = load;
  const inFlight = (0, import_react2.useRef)();
  const refresh = (0, import_react2.useCallback)(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState((previous) => beginLoad(previous));
    const result = await loadRef.current(controller.signal);
    if (controller.signal.aborted) return result;
    if (result.ok) {
      setState(loadSuccess(result.value, (/* @__PURE__ */ new Date()).toISOString()));
    } else {
      setState((previous) => loadFailure(previous, result.error));
    }
    return result;
  }, []);
  (0, import_react2.useEffect)(() => {
    if (!active) return void 0;
    void refresh();
    const timer = intervalMs > 0 ? window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs) : void 0;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== void 0) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      inFlight.current?.abort();
    };
  }, [active, intervalMs, refresh]);
  (0, import_react2.useEffect)(() => {
    if (!active || state.failure?.code !== "UNAVAILABLE") return void 0;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5e3);
    return () => window.clearTimeout(timer);
  }, [active, state.failure?.code, refresh]);
  return { state, refresh };
}
function useAction(onDone) {
  const [pending, setPending] = (0, import_react2.useState)();
  const [notice, setNotice] = (0, import_react2.useState)();
  const run = (0, import_react2.useCallback)(
    async (label, action, successText = "\u5DF2\u4FDD\u5B58") => {
      setPending(label);
      setNotice(void 0);
      const result = await action();
      setPending(void 0);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error.message });
        return false;
      }
      setNotice({ tone: "ok", text: successText });
      await onDone?.();
      return true;
    },
    [onDone]
  );
  return { pending, notice, run, setNotice };
}

// packages/academic-dsh-ui/src/client/view.ts
var DEFAULT_TASK_FILTERS = {
  courseId: "all",
  kind: "all",
  due: "all",
  status: "active"
};
var DATE_FORMATTERS = /* @__PURE__ */ new Map();
function dateFormatter(timeZone) {
  const key = `date:${timeZone}`;
  const existing = DATE_FORMATTERS.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  DATE_FORMATTERS.set(key, formatter);
  return formatter;
}
var DATE_TIME_FORMATTERS = /* @__PURE__ */ new Map();
function dateTimeFormatter(timeZone) {
  const key = `datetime:${timeZone}`;
  const existing = DATE_TIME_FORMATTERS.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  DATE_TIME_FORMATTERS.set(key, formatter);
  return formatter;
}
function localDate(value, timeZone) {
  const instant = value instanceof Date ? value : new Date(value);
  return dateFormatter(timeZone).format(instant);
}
function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function formatDateTime(value, timeZone) {
  return dateTimeFormatter(timeZone).format(new Date(value));
}
function formatDateTimeOrDash(value, timeZone) {
  return value ? formatDateTime(value, timeZone) : "\u2014";
}
function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "\u2014";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} \u5206\u949F`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} \u5C0F\u65F6` : `${hours} \u5C0F\u65F6 ${rest} \u5206\u949F`;
}
function formatDue(due, timeZone, now = (/* @__PURE__ */ new Date()).toISOString()) {
  if (!due) {
    return {
      label: "\u622A\u6B62\u65F6\u95F4\u672A\u77E5",
      tone: "unknown",
      exact: false,
      note: "\u672A\u63D0\u4F9B\u622A\u6B62\u65F6\u95F4\uFF0C\u4E0D\u4F1A\u731C\u6210\u786E\u5B9A\u65E5\u671F"
    };
  }
  const today = localDate(now, timeZone);
  switch (due.kind) {
    case "instant": {
      const date = localDate(due.utc, timeZone);
      const tone = Date.parse(due.utc) < Date.parse(now) ? "overdue" : date === today ? "today" : date <= addDays(today, 7) ? "soon" : "later";
      return {
        label: formatDateTime(due.utc, timeZone),
        tone,
        exact: true
      };
    }
    case "local-date": {
      const tone = due.date < today ? "overdue" : due.date === today ? "today" : due.date <= addDays(today, 7) ? "soon" : "later";
      return {
        label: `${due.date}\uFF08\u4EC5\u65E5\u671F\uFF09`,
        tone,
        exact: false,
        note: "\u6765\u6E90\u53EA\u63D0\u4F9B\u65E5\u671F\uFF0C\u672A\u5F53\u4F5C\u5348\u591C\u65F6\u95F4"
      };
    }
    case "unknown":
      return {
        label: "\u622A\u6B62\u65F6\u95F4\u672A\u77E5",
        tone: "unknown",
        exact: false,
        note: "\u6765\u6E90\u672A\u63D0\u4F9B\u622A\u6B62\u65F6\u95F4"
      };
  }
}
function taskMatches(card, filters, timeZone, now) {
  if (filters.status !== "all" && card.task.status !== filters.status) return false;
  if (filters.courseId !== "all" && card.item?.courseId !== filters.courseId) return false;
  if (filters.kind !== "all" && card.item?.kind !== filters.kind) return false;
  const due = formatDue(card.effectiveDue, timeZone, now);
  switch (filters.due) {
    case "all":
      break;
    case "today":
      if (due.tone !== "today") return false;
      break;
    case "week":
      if (due.tone !== "today" && due.tone !== "soon" && due.tone !== "overdue") return false;
      break;
    case "overdue":
      if (due.tone !== "overdue") return false;
      break;
    case "unknown":
      if (due.tone !== "unknown") return false;
      break;
    case "unscheduled":
      if (card.planned) return false;
      break;
  }
  return true;
}
function filterTaskCards(cards, filters, timeZone, now = (/* @__PURE__ */ new Date()).toISOString()) {
  return cards.filter((card) => taskMatches(card, filters, timeZone, now)).sort((left, right) => {
    const leftDue = left.effectiveDue;
    const rightDue = right.effectiveDue;
    const leftKey = dueKey(leftDue);
    const rightKey = dueKey(rightDue);
    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
    return left.task.title.localeCompare(right.task.title, "zh-CN");
  });
}
function dueKey(due) {
  if (!due) return "9999-12-31T23:59:59.999Z";
  switch (due.kind) {
    case "instant":
      return due.utc;
    case "local-date":
      return `${due.date}T23:59:59.999Z`;
    case "unknown":
      return "9999-12-31T23:59:59.999Z";
  }
}
function groupBlocksByDate(blocks, timeZone) {
  const groups = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const date = localDate(block.start, timeZone);
    const entries = groups.get(date) ?? [];
    entries.push(block);
    groups.set(date, entries);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, entries]) => ({
    date,
    blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start))
  }));
}
function weekStart(date) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const value = new Date(Date.UTC(year, month - 1, day));
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}
function groupBlocksByWeek(blocks, timeZone) {
  const groups = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const key = weekStart(localDate(block.start, timeZone));
    const entries = groups.get(key) ?? [];
    entries.push(block);
    groups.set(key, entries);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, entries]) => ({
    date,
    endDate: addDays(date, 6),
    blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start))
  }));
}
function sortPlanBlocks(blocks) {
  return [...blocks].sort((left, right) => left.start.localeCompare(right.start));
}
function groupLockedByDate(blocks, timeZone) {
  const groups = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const date = localDate(block.start, timeZone);
    const entries = groups.get(date) ?? [];
    entries.push(block);
    groups.set(date, entries);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, entries]) => ({
    date,
    blocks: [...entries].sort((a, b) => a.start.localeCompare(b.start))
  }));
}
function weekdayLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}
function sourceStageLabel(stage) {
  switch (stage) {
    case "archived":
      return "\u5DF2\u5F52\u6863";
    case "disabled":
      return "\u5DF2\u505C\u7528";
    case "unsupported":
      return "\u5F15\u64CE\u4E0D\u53EF\u7528";
    case "login-required":
      return "\u5F85\u767B\u5F55";
    case "login-saved":
      return "\u5DF2\u767B\u5F55\u672A\u9A8C\u8BC1";
    case "verified":
      return "\u5DF2\u9A8C\u8BC1";
    case "ready":
      return "\u5F85\u9996\u6B21\u540C\u6B65";
    case "syncing":
      return "\u540C\u6B65\u4E2D";
    case "degraded":
      return "\u90E8\u5206\u540C\u6B65";
    case "failed":
      return "\u540C\u6B65\u5931\u8D25";
    case "enabled":
      return "\u5DF2\u542F\u7528";
    default:
      return stage;
  }
}
function sourceStageTone(stage) {
  switch (stage) {
    case "enabled":
      return "ok";
    case "ready":
    case "syncing":
      return "info";
    case "login-saved":
    case "verified":
      return "warn";
    case "login-required":
    case "degraded":
      return "warn";
    case "failed":
    case "unsupported":
      return "bad";
    default:
      return "neutral";
  }
}
function sourceConfigurationLabel(state) {
  switch (state) {
    case "configured":
      return "\u5DF2\u914D\u7F6E";
    case "disabled":
      return "\u5DF2\u505C\u7528";
    case "archived":
      return "\u5DF2\u5F52\u6863";
    default:
      return state;
  }
}
function sourceAuthenticationLabel(state) {
  switch (state) {
    case "not-required":
      return "\u65E0\u9700\u8BA4\u8BC1";
    case "missing":
      return "\u7F3A\u5C11\u4F1A\u8BDD";
    case "saved":
      return "\u4F1A\u8BDD\u5DF2\u4FDD\u5B58";
    case "verified":
      return "\u4F1A\u8BDD\u5DF2\u9A8C\u8BC1";
    case "expired":
      return "\u4F1A\u8BDD\u5DF2\u8FC7\u671F";
    case "rejected":
      return "\u8BA4\u8BC1\u88AB\u62D2\u7EDD";
    default:
      return state;
  }
}
function sourceSyncHealthLabel(state) {
  switch (state) {
    case "never-synced":
      return "\u4ECE\u672A\u540C\u6B65";
    case "running":
      return "\u540C\u6B65\u4E2D";
    case "healthy":
      return "\u540C\u6B65\u6B63\u5E38";
    case "partial":
      return "\u90E8\u5206\u540C\u6B65";
    case "auth-required":
      return "\u8BA4\u8BC1\u5931\u6548";
    case "failed":
      return "\u540C\u6B65\u5931\u8D25";
    case "stale":
      return "\u540C\u6B65\u8FC7\u671F";
    default:
      return state;
  }
}
function sourceSyncHealthTone(state) {
  switch (state) {
    case "healthy":
      return "ok";
    case "partial":
    case "auth-required":
    case "stale":
      return "warn";
    case "failed":
      return "bad";
    default:
      return "neutral";
  }
}
function jobLabel(jobId) {
  switch (jobId) {
    case "fixture-lms-sync":
      return "\u6570\u636E\u6E90\u540C\u6B65";
    case "planner.process-replans":
      return "\u8BA1\u5212\u91CD\u7B97";
    case "academic.reminders.scan":
      return "\u622A\u6B62\u63D0\u9192\u626B\u63CF";
    default:
      return jobId;
  }
}
function runStatusLabel(status) {
  switch (status) {
    case "running":
      return "\u8FD0\u884C\u4E2D";
    case "succeeded":
      return "\u6210\u529F";
    case "failed":
      return "\u5931\u8D25";
    case "interrupted":
      return "\u5DF2\u4E2D\u65AD";
    case "paused":
      return "\u5DF2\u6682\u505C";
    default:
      return status;
  }
}
function syncStatusLabel(status) {
  switch (status) {
    case "success":
      return "\u6210\u529F";
    case "partial":
      return "\u90E8\u5206\u6210\u529F";
    case "failed":
      return "\u5931\u8D25";
    case "auth-required":
      return "\u9700\u8981\u8BA4\u8BC1";
    case "running":
      return "\u8FD0\u884C\u4E2D";
    default:
      return status;
  }
}
function planStatusLabel(status) {
  return status === "active" ? "\u5DF2\u786E\u8BA4" : "\u5DF2\u5F52\u6863";
}
function fromLocalInputValue(value) {
  if (!value) return void 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
}

// packages/academic-dsh-ui/src/client/pages/DashboardPage.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function syncTone(health) {
  switch (health) {
    case "ok":
      return "ok";
    case "stale":
    case "degraded":
      return "warn";
    case "failed":
    case "auth-required":
      return "bad";
    default:
      return "neutral";
  }
}
function syncLabel(health) {
  switch (health) {
    case "ok":
      return "\u540C\u6B65\u6B63\u5E38";
    case "stale":
      return "\u6570\u636E\u53EF\u80FD\u8FC7\u671F";
    case "degraded":
      return "\u90E8\u5206\u540C\u6B65\u6210\u529F";
    case "failed":
      return "\u540C\u6B65\u5931\u8D25";
    case "auth-required":
      return "\u9700\u8981\u91CD\u65B0\u8BA4\u8BC1";
    default:
      return "\u5C1A\u672A\u540C\u6B65";
  }
}
function DashboardPage({ ctx, active, onNavigate }) {
  const load = (0, import_react3.useCallback)(
    (signal) => callApi(ctx, "dashboard", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active, 6e4);
  const action = useAction(refresh);
  const view = viewState(state);
  const data = state.data;
  const timeZone = data?.timeZone ?? "UTC";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const syncNow = async () => {
    const result = await callApi(ctx, "syncNow", {});
    if (!result.ok) return result;
    if (result.value.status === "success" || result.value.status === "partial") {
      return result;
    }
    return {
      ok: false,
      error: {
        code: result.value.status === "auth-required" ? "AUTH_REQUIRED" : "ERROR",
        message: result.value.errorMessage ?? `\u540C\u6B65\u672A\u6210\u529F\uFF1A${syncStatusLabel(result.value.status)}\uFF1B\u5DF2\u4FDD\u7559\u6700\u540E\u4E00\u6B21\u6709\u6548\u6570\u636E`
      }
    };
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh(),
        onNavigate: () => onNavigate("connections")
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u603B\u89C8\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-stat-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          StatCard,
          {
            label: "\u4ECA\u65E5\u4EFB\u52A1",
            value: data.todayTasks.length,
            hint: `\u5171 ${data.counts.activeTasks} \u4E2A\u8FDB\u884C\u4E2D\u4EFB\u52A1`
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          StatCard,
          {
            label: "\u8FD1\u671F\u622A\u6B62",
            value: data.counts.itemsDueSoon,
            hint: "\u672A\u6765 7 \u5929\uFF08\u542B\u903E\u671F\uFF09",
            tone: data.counts.itemsDueSoon > 0 ? "warn" : "neutral"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          StatCard,
          {
            label: "\u903E\u671F\u4EFB\u52A1",
            value: data.counts.overdueTasks,
            hint: "\u6309\u5F53\u524D\u622A\u6B62\u65F6\u95F4\u8BA1\u7B97",
            tone: data.counts.overdueTasks > 0 ? "bad" : "ok"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          StatCard,
          {
            label: "\u672A\u8BFB\u63D0\u9192",
            value: data.counts.unreadNotifications,
            hint: `\u672A\u5B89\u6392\u4EFB\u52A1 ${data.counts.unscheduledTasks} \u4E2A`,
            tone: data.counts.overdueTasks > 0 ? "warn" : "neutral"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-inline-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: syncTone(data.syncHealth), children: syncLabel(data.syncHealth) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ac-muted", children: [
            "\u6700\u8FD1\u6210\u529F\u540C\u6B65\uFF1A",
            formatDateTimeOrDash(data.lastSuccessfulSync?.finishedAt, timeZone)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-inline-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              disabled: action.pending !== void 0,
              onClick: () => void action.run("sync", syncNow, "\u540C\u6B65\u5B8C\u6210\uFF0C\u5DF2\u5237\u65B0\u603B\u89C8"),
              children: action.pending === "sync" ? "\u540C\u6B65\u4E2D\u2026" : "\u7ACB\u5373\u540C\u6B65"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "ac-button", onClick: () => void refresh(), children: "\u5237\u65B0" })
        ] })
      ] }),
      data.syncHealth !== "ok" && data.syncHealth !== "unknown" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-banner ac-banner-warn", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: syncLabel(data.syncHealth) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: data.lastSync?.errorMessage ?? "\u663E\u793A\u7684\u662F\u6700\u540E\u4E00\u6B21\u6709\u6548\u6570\u636E\uFF1B\u4E0B\u6B21\u6210\u529F\u540C\u6B65\u540E\u4F1A\u6062\u590D\u3002" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ac-banner-actions", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => onNavigate("connections"),
            children: "\u67E5\u770B\u6570\u636E\u6E90"
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-two-column", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Section,
          {
            title: "\u4ECA\u65E5\u5B66\u4E60\u8BA1\u5212",
            subtitle: data.plan ? `\u8BA1\u5212\u533A\u95F4 ${formatDateTimeOrDash(data.plan.range.start, timeZone)} \u8D77` : void 0,
            actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "ac-button",
                onClick: () => onNavigate("plan"),
                children: "\u6253\u5F00\u8BA1\u5212"
              }
            ),
            children: data.todayBlocks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyState, { title: "\u4ECA\u5929\u6CA1\u6709\u8BA1\u5212\u5757", children: "\u786E\u8BA4\u8BA1\u5212\u540E\uFF0CPlanner \u4F1A\u628A\u4EFB\u52A1\u5B89\u6392\u5230\u53EF\u7528\u65F6\u95F4\uFF1B\u672A\u5B89\u6392\u4EFB\u52A1\u4F1A\u7ED9\u51FA\u539F\u56E0\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-timeline", children: data.todayBlocks.map(({ block, task }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-timeline-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("time", { children: formatDateTimeOrDash(block.start, timeZone) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: task?.title ?? block.taskId }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ac-muted", children: formatMinutes(
                  (Date.parse(block.end) - Date.parse(block.start)) / 6e4
                ) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "ok", children: "\u5DF2\u786E\u8BA4\u8BA1\u5212" })
            ] }, `${block.taskId}:${block.start}`)) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Section,
          {
            title: "\u8FD1\u671F\u622A\u6B62",
            subtitle: "\u5B66\u6821\u6765\u6E90\u4E8B\u5B9E\uFF0C\u672A\u77E5\u622A\u6B62\u65E5\u671F\u4E0D\u4F1A\u731C\u6210\u786E\u5B9A\u65F6\u95F4",
            actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "ac-button",
                onClick: () => onNavigate("tasks"),
                children: "\u67E5\u770B\u5168\u90E8"
              }
            ),
            children: data.upcoming.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyState, { title: "\u672A\u6765 7 \u5929\u6CA1\u6709\u5DF2\u77E5\u622A\u6B62\u4E8B\u9879", children: "\u6CA1\u6709\u6765\u6E90\u4E8B\u9879\u65F6\uFF0C\u4E0D\u4EE3\u8868\u6CA1\u6709\u4F5C\u4E1A\uFF1B\u8BF7\u68C0\u67E5\u6570\u636E\u6E90\u662F\u5426\u540C\u6B65\u6210\u529F\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-list", children: data.upcoming.map((card) => {
              const due = formatDue(card.item.due, timeZone, now);
              return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-list-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: card.item.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ac-muted", children: [
                    card.course?.code ?? card.item.courseId,
                    " \xB7 ",
                    card.item.kind
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: due.tone === "overdue" ? "bad" : "warn", children: due.label })
              ] }, card.item.itemId);
            }) })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-two-column", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Section, { title: "\u4ECA\u65E5\u5F85\u529E", subtitle: "\u672C\u5730\u5B66\u4E60\u4EFB\u52A1\uFF1B\u5B8C\u6210\u72B6\u6001\u7531\u7528\u6237\u63A7\u5236", children: data.todayTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyState, { title: "\u4ECA\u5929\u6CA1\u6709\u5F85\u529E\u4EFB\u52A1", children: "\u53EF\u4EE5\u4ECE\u4EFB\u52A1\u9875\u521B\u5EFA\u672C\u5730\u4EFB\u52A1\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-list", children: data.todayTasks.map((card) => {
          const due = formatDue(card.effectiveDue, timeZone, now);
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-list-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: card.task.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ac-muted", children: [
                card.course?.code ?? "\u672C\u5730\u4EFB\u52A1",
                " \xB7 \u9884\u8BA1",
                " ",
                formatMinutes(card.task.estimateMinutes)
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ac-row-meta", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                Badge,
                {
                  tone: due.tone === "overdue" ? "bad" : due.tone === "today" ? "warn" : "neutral",
                  children: due.label
                }
              ),
              !card.planned && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "\u672A\u5B89\u6392" })
            ] })
          ] }, card.task.taskId);
        }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Section, { title: "\u672A\u8BFB\u63D0\u9192", subtitle: `\u672A\u8BFB ${data.counts.unreadNotifications} \u6761`, children: data.unread.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyState, { title: "\u6CA1\u6709\u672A\u8BFB\u63D0\u9192", children: "\u622A\u6B62\u63D0\u9192\u4F1A\u6309 72h/24h \u9608\u503C\u751F\u6210\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-list", children: data.unread.map((notification) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-list-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: notification.title }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ac-muted", children: notification.body })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ac-muted", children: formatDateTimeOrDash(notification.createdAt, timeZone) })
        ] }, notification.notificationId)) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Section, { title: "\u8FD1\u671F\u53D8\u5316", subtitle: "\u6765\u6E90\u4E8B\u9879\u6700\u8FD1\u66F4\u65B0\u65F6\u95F4", children: data.recentChanges.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u6765\u6E90\u4E8B\u9879" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-list", children: data.recentChanges.map((card) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-list-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: card.item.title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ac-muted", children: [
            card.course?.code ?? card.item.courseId,
            " \xB7 \u66F4\u65B0\u4E8E",
            " ",
            formatDateTimeOrDash(card.item.updatedAt, timeZone)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "info", children: "\u6765\u6E90\u4E8B\u9879" })
      ] }, card.item.itemId)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Section,
        {
          title: "\u6570\u636E\u6E90\u72B6\u6001",
          subtitle: "\u4FDD\u5B58\u51ED\u636E\u4E0D\u7B49\u4E8E\u5E73\u53F0\u5DF2\u9A8C\u8BC1\u53EF\u7528",
          actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              onClick: () => onNavigate("connections"),
              children: "\u7BA1\u7406\u8FDE\u63A5"
            }
          ),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ac-source-grid", children: data.sources.map((source) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "ac-card ac-source-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: source.displayName }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ac-muted", children: source.detail }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ac-muted", children: [
                "\u6700\u8FD1\u540C\u6B65\uFF1A",
                formatDateTimeOrDash(source.lastSync?.finishedAt, timeZone)
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: sourceStageTone(source.stage), children: sourceStageLabel(source.stage) })
          ] }, source.sourceId)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "ac-muted ac-footnote", children: [
        "\u5F53\u524D\u65F6\u533A ",
        timeZone,
        "\uFF1B\u4ECA\u65E5\u8303\u56F4\u81EA ",
        localDate(data.range.start, timeZone),
        " \u8D77\u3002"
      ] })
    ] })
  ] });
}

// packages/academic-dsh-ui/src/client/pages/TasksPage.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function kindLabel(kind) {
  switch (kind) {
    case "assignment":
      return "\u4F5C\u4E1A";
    case "exam":
      return "\u8003\u8BD5";
    case "quiz":
      return "\u6D4B\u9A8C";
  }
}
function toneForDue(tone) {
  switch (tone) {
    case "overdue":
      return "bad";
    case "today":
      return "warn";
    case "soon":
      return "info";
    default:
      return "neutral";
  }
}
function tutorPrompt(card, timeZone, now) {
  const course = card.course;
  const item = "item" in card ? card.item : void 0;
  const task = "task" in card ? card.task : void 0;
  const due = "task" in card ? card.effectiveDue : item?.due;
  const lines = [
    "\u8BF7\u57FA\u4E8E\u5DF2\u4FDD\u5B58\u7684\u5B66\u4E1A\u6570\u636E\uFF0C\u5E2E\u6211\u7406\u89E3\u6216\u62C6\u89E3\u4E0B\u9762\u7684\u5185\u5BB9\u3002",
    `\u8BFE\u7A0B\uFF1A${course ? `${course.code} ${course.title}` : "\u672A\u5173\u8054\u8BFE\u7A0B"}`,
    task ? `\u672C\u5730\u4EFB\u52A1\uFF1A${task.title}` : void 0,
    item ? `\u6765\u6E90\u4E8B\u9879\uFF1A${item.title}\uFF08${kindLabel(item.kind)}\uFF0C\u6570\u636E\u6E90 ${item.source.sourceId}\uFF09` : void 0,
    due ? `\u672C\u5730\u8BB0\u5F55\u7684\u622A\u6B62\uFF1A${formatDue(due, timeZone, now).label}` : "\u672C\u5730\u6CA1\u6709\u622A\u6B62\u65F6\u95F4",
    "\u5148\u7528\u53EA\u8BFB\u5DE5\u5177\u6838\u5BF9\u4E8B\u5B9E\uFF08\u5982 academic_get_item\u3001academic_get_study_plan\uFF09\uFF0C\u533A\u5206\u6570\u636E\u5E93\u4E8B\u5B9E\u4E0E\u4F60\u7684\u5EFA\u8BAE\u3002",
    "\u6CA1\u6709\u63D0\u4F9B\u6216\u8BFB\u53D6\u5230\u8BFE\u7A0B\u6750\u6599\u65F6\uFF0C\u4E0D\u8981\u58F0\u79F0\u8BFB\u8FC7\u6750\u6599\uFF1B\u4E0D\u8981\u4FEE\u6539\u4EFB\u4F55\u6570\u636E\u3002"
  ].filter((line) => Boolean(line));
  return lines.join("\n");
}
function toLocalDateTimeInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
}
function fromLocalDateTimeInput(value) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function TaskRow({
  card,
  timeZone,
  now,
  pending,
  onComplete,
  onReopen,
  onUpdate,
  onArchive,
  onRestore,
  onAsk
}) {
  const [editing, setEditing] = (0, import_react4.useState)(false);
  const [title, setTitle] = (0, import_react4.useState)(card.task.title);
  const [estimate, setEstimate] = (0, import_react4.useState)(String(card.task.estimateMinutes));
  const [priority, setPriority] = (0, import_react4.useState)(String(card.task.priority));
  const [dueInput, setDueInput] = (0, import_react4.useState)(toLocalDateTimeInput(card.task.dueAt));
  const due = formatDue(card.effectiveDue, timeZone, now);
  const completed = card.task.status === "completed";
  const archived = card.task.archived;
  const save = async () => {
    const minutes = Number(estimate);
    if (!title.trim() || !Number.isFinite(minutes) || minutes < 5) return;
    const ok = await onUpdate({
      title: title.trim(),
      estimateMinutes: Math.round(minutes),
      priority: Number(priority) || 0,
      dueAt: fromLocalDateTimeInput(dueInput)
    });
    if (ok) setEditing(false);
  };
  if (archived) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: "ac-task-row ac-task-completed", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-main", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: card.task.title }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "bad", children: "\u5DF2\u5220\u9664" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: card.course?.code ?? "\u672C\u5730\u4EFB\u52A1" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
            "\u9884\u8BA1 ",
            formatMinutes(card.task.estimateMinutes)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u5220\u9664\u540E\u4E0D\u518D\u53C2\u4E0E\u8BA1\u5212\uFF1B\u6062\u590D\u540E\u7EE7\u7EED\u53C2\u4E0E" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ac-task-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: pending,
          onClick: onRestore,
          children: "\u6062\u590D\u4EFB\u52A1"
        }
      ) })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: `ac-task-row${completed ? " ac-task-completed" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: completed ? "ac-check ac-check-done" : "ac-check",
        "aria-label": completed ? `\u91CD\u5F00\u4EFB\u52A1\uFF1A${card.task.title}` : `\u5B8C\u6210\u4EFB\u52A1\uFF1A${card.task.title}`,
        "aria-pressed": completed,
        disabled: pending,
        onClick: completed ? onReopen : onComplete,
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": "true", children: completed ? "\u2713" : "" })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: card.task.title }),
        completed && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "ok", children: "\u672C\u5730\u5DF2\u5B8C\u6210" }),
        !completed && !card.planned && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: "\u672A\u88AB\u8BA1\u5212\u5B89\u6392" })
      ] }),
      editing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-form-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u6807\u9898", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            value: title,
            onChange: (event) => setTitle(event.target.value),
            maxLength: 500
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u9884\u8BA1\u65F6\u957F\uFF08\u5206\u949F\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "number",
            min: 5,
            max: 1440,
            value: estimate,
            onChange: (event) => setEstimate(event.target.value)
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u4F18\u5148\u7EA7\uFF080\u20133\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "number",
            min: 0,
            max: 3,
            value: priority,
            onChange: (event) => setPriority(event.target.value)
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u672C\u5730\u622A\u6B62\uFF08\u53EF\u7559\u7A7A\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "datetime-local",
            value: dueInput,
            onChange: (event) => setDueInput(event.target.value)
          }
        ) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: card.course?.code ?? "\u672C\u5730\u4EFB\u52A1" }),
        card.item && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: kindLabel(card.item.kind) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
          card.dueSource === "item" ? "\u6765\u6E90\u622A\u6B62" : card.dueSource === "task" ? "\u672C\u5730\u622A\u6B62" : "\u65E0\u622A\u6B62",
          "\uFF1A",
          due.label
        ] }),
        due.note && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ac-muted", children: due.note }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
          "\u9884\u8BA1 ",
          formatMinutes(card.task.estimateMinutes)
        ] }),
        card.item?.sourceUrl && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "a",
          {
            className: "ac-link",
            href: card.item.sourceUrl,
            target: "_blank",
            rel: "noreferrer noopener",
            children: "\u6765\u6E90\u94FE\u63A5"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "ac-muted ac-task-note", children: "\u672C\u5730\u4EFB\u52A1\u72B6\u6001\u4E0E\u5B66\u6821\u63D0\u4EA4\u72B6\u6001\u5206\u5F00\u4FDD\u5B58\uFF1B\u6807\u8BB0\u5B8C\u6210\u4E0D\u4F1A\u63D0\u4EA4\u5B66\u6821\u4F5C\u4E1A\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: toneForDue(due.tone), children: due.label }),
      editing ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button ac-button-primary",
            disabled: pending,
            onClick: () => void save(),
            children: "\u4FDD\u5B58"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "ac-button", onClick: () => setEditing(false), children: "\u53D6\u6D88" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "ac-button", onClick: () => setEditing(true), children: "\u7F16\u8F91\u4EFB\u52A1" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          ConfirmAction,
          {
            label: "\u5220\u9664\u4EFB\u52A1",
            confirmLabel: "\u786E\u8BA4\u5220\u9664\u4EFB\u52A1",
            disabled: pending,
            onConfirm: onArchive
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "ac-button", onClick: onAsk, children: "\u8BF7\u6559 Agent" })
    ] })
  ] });
}
function ItemRow({
  card,
  timeZone,
  now,
  pending,
  onArchive,
  onRestore,
  onAsk
}) {
  const due = formatDue(card.item.due, timeZone, now);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: "ac-item-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: card.item.title }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "info", children: kindLabel(card.item.kind) }),
        card.item.archived && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "bad", children: "\u5DF2\u5F52\u6863" }),
        card.item.progress.status !== "not-started" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Badge, { tone: "neutral", children: [
          "\u8FDB\u5EA6 ",
          card.item.progress.percent,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: card.course?.code ?? card.item.courseId }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
          "\u6765\u6E90\uFF1A",
          card.item.source.sourceId
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
          "\u6E90\u66F4\u65B0\uFF1A",
          formatDateTimeOrDash(card.item.source.sourceUpdatedAt, timeZone)
        ] }),
        card.item.sourceUrl && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "a",
          {
            className: "ac-link",
            href: card.item.sourceUrl,
            target: "_blank",
            rel: "noreferrer noopener",
            children: "\u6253\u5F00\u6765\u6E90"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "ac-muted ac-task-note", children: card.item.archived ? "\u5DF2\u5F52\u6863\uFF1A\u540C\u6B65\u4F1A\u8DF3\u8FC7\u8BE5\u4E8B\u9879\uFF1B\u6062\u590D\u540E\u7EE7\u7EED\u63A5\u6536\u6765\u6E90\u66F4\u65B0\u3002" : "\u6765\u6E90\u4E8B\u5B9E\uFF1B\u5B66\u6821\u63D0\u4EA4\u72B6\u6001\u672A\u63A5\u5165\uFF0C\u4E0D\u80FD\u7531\u672C\u5730\u8FDB\u5EA6\u63A8\u65AD\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-item-due", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: toneForDue(due.tone), children: due.label }),
      due.note && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ac-muted", children: due.note }),
      card.item.archived ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: pending,
          onClick: onRestore,
          children: "\u6062\u590D\u4E8B\u9879"
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        ConfirmAction,
        {
          label: "\u5F52\u6863\u4E8B\u9879",
          confirmLabel: "\u786E\u8BA4\u5F52\u6863",
          disabled: pending,
          onConfirm: onArchive
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "ac-button", onClick: onAsk, children: "\u8BF7\u6559 Agent" })
    ] })
  ] });
}
function TasksPage({ ctx, active }) {
  const load = (0, import_react4.useCallback)(
    (signal) => callApi(
      ctx,
      "tasks",
      { status: "all", includeArchived: true },
      signal
    ),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active);
  const [filters, setFilters] = (0, import_react4.useState)(DEFAULT_TASK_FILTERS);
  const [pane, setPane] = (0, import_react4.useState)("tasks");
  const [showArchived, setShowArchived] = (0, import_react4.useState)(false);
  const [creating, setCreating] = (0, import_react4.useState)(false);
  const [title, setTitle] = (0, import_react4.useState)("");
  const [estimate, setEstimate] = (0, import_react4.useState)("60");
  const [itemId, setItemId] = (0, import_react4.useState)("");
  const [priority, setPriority] = (0, import_react4.useState)("1");
  const action = useAction(refresh);
  const view = viewState(state);
  const data = state.data;
  const timeZone = data?.timeZone ?? "UTC";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const visibleTasks = (0, import_react4.useMemo)(
    () => data ? filterTaskCards(
      showArchived ? data.cards : data.cards.filter((card) => !card.task.archived),
      filters,
      timeZone,
      now
    ) : [],
    [data, filters, timeZone, now, showArchived]
  );
  const visibleItems = (0, import_react4.useMemo)(() => {
    if (!data) return [];
    const rank = {
      overdue: 0,
      today: 1,
      soon: 2,
      later: 3,
      unknown: 4
    };
    return data.items.filter((card) => showArchived || !card.item.archived).filter((card) => filters.courseId === "all" || card.item.courseId === filters.courseId).filter((card) => filters.kind === "all" || card.item.kind === filters.kind).filter((card) => {
      if (filters.due === "all") return true;
      const tone = formatDue(card.item.due, timeZone, now).tone;
      if (filters.due === "unknown") return tone === "unknown";
      if (filters.due === "overdue") return tone === "overdue";
      if (filters.due === "today") return tone === "today";
      if (filters.due === "week") return tone !== "later" && tone !== "unknown";
      return true;
    }).sort((left, right) => {
      const leftTone = formatDue(left.item.due, timeZone, now).tone;
      const rightTone = formatDue(right.item.due, timeZone, now).tone;
      if (rank[leftTone] !== rank[rightTone]) return rank[leftTone] - rank[rightTone];
      return left.item.title.localeCompare(right.item.title, "zh-CN");
    });
  }, [data, filters, timeZone, now, showArchived]);
  const reviewGroups = (0, import_react4.useMemo)(() => {
    if (!data) return [];
    const tasksByItem = /* @__PURE__ */ new Map();
    for (const card of data.cards) {
      if (!card.item || card.task.archived) continue;
      const list = tasksByItem.get(card.item.itemId) ?? [];
      list.push(card);
      tasksByItem.set(card.item.itemId, list);
    }
    const plannedTaskIds = new Set(data.planBlocks.map((block) => block.taskId));
    const rank = {
      overdue: 0,
      today: 1,
      soon: 2,
      later: 3,
      unknown: 4
    };
    const groups = /* @__PURE__ */ new Map();
    for (const card of data.items) {
      if (card.item.archived) continue;
      if (card.item.kind !== "exam" && card.item.kind !== "quiz") continue;
      const key = card.item.courseId;
      const group = groups.get(key) ?? {
        key,
        label: card.course ? `${card.course.code} ${card.course.title}` : card.item.courseId,
        entries: []
      };
      const tasks = tasksByItem.get(card.item.itemId) ?? [];
      group.entries.push({
        card,
        tasks,
        planned: tasks.some((task) => plannedTaskIds.has(task.task.taskId))
      });
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN")).map((group) => ({
      ...group,
      entries: group.entries.sort((left, right) => {
        const leftTone = formatDue(left.card.item.due, timeZone, now).tone;
        const rightTone = formatDue(right.card.item.due, timeZone, now).tone;
        if (rank[leftTone] !== rank[rightTone]) return rank[leftTone] - rank[rightTone];
        return left.card.item.title.localeCompare(right.card.item.title, "zh-CN");
      })
    }));
  }, [data, timeZone, now]);
  const taskCommand = (label, method, taskId) => action.run(
    label,
    () => callApi(ctx, method, { id: taskId }),
    "\u4EFB\u52A1\u72B6\u6001\u5DF2\u66F4\u65B0"
  );
  const submitTask = async () => {
    const minutes = Number(estimate);
    if (!title.trim() || !Number.isFinite(minutes) || minutes < 5) {
      action.setNotice({ tone: "error", text: "\u8BF7\u586B\u5199\u4EFB\u52A1\u6807\u9898\u548C\u6709\u6548\u7684\u9884\u8BA1\u65F6\u957F" });
      return;
    }
    const success = await action.run(
      "create",
      () => callApi(ctx, "createTask", {
        title: title.trim(),
        estimateMinutes: Math.round(minutes),
        priority: Number(priority) || 0,
        ...itemId ? { itemId } : {}
      }),
      "\u5B66\u4E60\u4EFB\u52A1\u5DF2\u521B\u5EFA"
    );
    if (success) {
      setCreating(false);
      setTitle("");
      setEstimate("60");
      setItemId("");
    }
  };
  const selectedItemOptions = data ? data.items.filter((card) => !card.item.archived) : [];
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh()
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u4EFB\u52A1\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-toggle", role: "tablist", "aria-label": "\u4EFB\u52A1\u89C6\u56FE", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": pane === "tasks",
              className: pane === "tasks" ? "ac-toggle-active" : "",
              onClick: () => setPane("tasks"),
              children: "\u5B66\u4E60\u4EFB\u52A1"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": pane === "items",
              className: pane === "items" ? "ac-toggle-active" : "",
              onClick: () => setPane("items"),
              children: "\u6765\u6E90\u4E8B\u9879"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": pane === "review",
              className: pane === "review" ? "ac-toggle-active" : "",
              onClick: () => setPane("review"),
              children: "\u590D\u4E60\u6E05\u5355"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => setShowArchived((value) => !value),
            children: showArchived ? "\u9690\u85CF\u5DF2\u5F52\u6863/\u5DF2\u5220\u9664" : "\u663E\u793A\u5DF2\u5F52\u6863/\u5DF2\u5220\u9664"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => setCreating((value) => !value),
            children: creating ? "\u53D6\u6D88\u65B0\u5EFA" : "\u65B0\u5EFA\u5B66\u4E60\u4EFB\u52A1"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-filter-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u8BFE\u7A0B", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            value: filters.courseId,
            onChange: (event) => setFilters((current) => ({ ...current, courseId: event.target.value })),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "all", children: "\u5168\u90E8\u8BFE\u7A0B" }),
              data.courses.map((course) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: course.courseId, children: [
                course.code,
                " ",
                course.title
              ] }, course.courseId))
            ]
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u7C7B\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            value: filters.kind,
            onChange: (event) => setFilters((current) => ({
              ...current,
              kind: event.target.value
            })),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "all", children: "\u5168\u90E8\u7C7B\u578B" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "assignment", children: "\u4F5C\u4E1A" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "exam", children: "\u8003\u8BD5" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "quiz", children: "\u6D4B\u9A8C" })
            ]
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u622A\u6B62", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            value: filters.due,
            onChange: (event) => setFilters((current) => ({
              ...current,
              due: event.target.value
            })),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "all", children: "\u5168\u90E8\u622A\u6B62" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "overdue", children: "\u5DF2\u903E\u671F" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "today", children: "\u4ECA\u5929" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "week", children: "\u672A\u6765 7 \u5929" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "unknown", children: "\u622A\u6B62\u672A\u77E5" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "unscheduled", children: "\u672A\u5B89\u6392" })
            ]
          }
        ) }),
        pane === "tasks" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u72B6\u6001", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            value: filters.status,
            onChange: (event) => setFilters((current) => ({
              ...current,
              status: event.target.value
            })),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "active", children: "\u8FDB\u884C\u4E2D" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "completed", children: "\u5DF2\u5B8C\u6210" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "all", children: "\u5168\u90E8\u72B6\u6001" })
            ]
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => setFilters(DEFAULT_TASK_FILTERS),
            children: "\u91CD\u7F6E\u7B5B\u9009"
          }
        )
      ] }),
      creating && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "form",
        {
          className: "ac-form-card",
          onSubmit: (event) => {
            event.preventDefault();
            void submitTask();
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: "\u65B0\u5EFA\u672C\u5730\u5B66\u4E60\u4EFB\u52A1" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-form-grid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u6807\u9898", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  value: title,
                  onChange: (event) => setTitle(event.target.value),
                  maxLength: 500,
                  required: true
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u9884\u8BA1\u65F6\u957F\uFF08\u5206\u949F\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "number",
                  min: 5,
                  max: 1440,
                  value: estimate,
                  onChange: (event) => setEstimate(event.target.value)
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u5173\u8054\u6765\u6E90\u4E8B\u9879\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { value: itemId, onChange: (event) => setItemId(event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "\u4E0D\u5173\u8054" }),
                selectedItemOptions.map((card) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: card.item.itemId, children: card.item.title }, card.item.itemId))
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Field, { label: "\u4F18\u5148\u7EA7", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "number",
                  min: 0,
                  max: 9,
                  value: priority,
                  onChange: (event) => setPriority(event.target.value)
                }
              ) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "submit", className: "ac-button ac-button-primary", disabled: action.pending !== void 0, children: action.pending === "create" ? "\u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA\u4EFB\u52A1" }) })
          ]
        }
      ),
      data.truncated && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "ac-muted", children: "\u4EFB\u52A1\u8F83\u591A\uFF0C\u4EC5\u663E\u793A\u524D 500 \u6761\uFF1B\u8BF7\u4F7F\u7528\u7B5B\u9009\u7F29\u5C0F\u8303\u56F4\u3002" }),
      pane === "tasks" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Section,
        {
          title: "\u5B66\u4E60\u4EFB\u52A1",
          subtitle: `${visibleTasks.length} \u6761\uFF1B\u672C\u5730\u5B8C\u6210\u72B6\u6001\u4E0D\u4F1A\u5192\u5145\u5B66\u6821\u63D0\u4EA4\u72B6\u6001`,
          children: visibleTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EmptyState, { title: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u4EFB\u52A1", children: "\u68C0\u67E5\u7B5B\u9009\u6761\u4EF6\uFF0C\u6216\u65B0\u5EFA\u4E00\u4E2A\u672C\u5730\u5B66\u4E60\u4EFB\u52A1\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "ac-task-list", children: visibleTasks.map((card) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            TaskRow,
            {
              card,
              timeZone,
              now,
              pending: action.pending !== void 0,
              onComplete: () => void taskCommand("complete", "completeTask", card.task.taskId),
              onReopen: () => void taskCommand("reopen", "reopenTask", card.task.taskId),
              onUpdate: (input) => action.run(
                "task-update",
                () => callApi(ctx, "updateTask", {
                  taskId: card.task.taskId,
                  ...input
                }),
                "\u4EFB\u52A1\u5DF2\u66F4\u65B0"
              ),
              onArchive: () => void action.run(
                "task-archive",
                () => callApi(ctx, "archiveTask", {
                  id: card.task.taskId
                }),
                "\u4EFB\u52A1\u5DF2\u5220\u9664\uFF1B\u53EF\u5728\u201C\u663E\u793A\u5DF2\u5F52\u6863/\u5DF2\u5220\u9664\u201D\u4E2D\u6062\u590D"
              ),
              onRestore: () => void action.run(
                "task-restore",
                () => callApi(ctx, "restoreTask", {
                  id: card.task.taskId
                }),
                "\u4EFB\u52A1\u5DF2\u6062\u590D"
              ),
              onAsk: () => {
                const prompt = tutorPrompt(card, timeZone, now);
                if (!askAgent(ctx, prompt)) {
                  action.setNotice({
                    tone: "info",
                    text: "DSH \u804A\u5929\u5165\u53E3\u5F53\u524D\u4E0D\u53EF\u7528\uFF1B\u8BF7\u4ECE\u4F1A\u8BDD\u9875\u53D1\u8D77\u63D0\u95EE\u3002"
                  });
                }
              }
            },
            card.task.taskId
          )) })
        }
      ),
      pane === "items" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Section,
        {
          title: "\u6765\u6E90\u4E8B\u9879",
          subtitle: "\u7531\u6570\u636E\u6E90\u540C\u6B65\u5F97\u5230\uFF1B\u672A\u77E5\u622A\u6B62\u65E5\u671F\u548C\u4EC5\u65E5\u671F\u622A\u6B62\u4F1A\u660E\u786E\u6807\u8BB0",
          children: visibleItems.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EmptyState, { title: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6765\u6E90\u4E8B\u9879", children: "\u6CA1\u6709\u4E8B\u9879\u4E0D\u4EE3\u8868\u6CA1\u6709\u4F5C\u4E1A\uFF1B\u8BF7\u68C0\u67E5\u6570\u636E\u6E90\u540C\u6B65\u72B6\u6001\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "ac-item-list", children: visibleItems.map((card) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            ItemRow,
            {
              card,
              timeZone,
              now,
              pending: action.pending !== void 0,
              onArchive: () => void action.run(
                "item-archive",
                () => callApi(ctx, "archiveItem", {
                  id: card.item.itemId
                }),
                "\u6765\u6E90\u4E8B\u9879\u5DF2\u5F52\u6863\uFF1B\u540C\u6B65\u4F1A\u8DF3\u8FC7\u5B83"
              ),
              onRestore: () => void action.run(
                "item-restore",
                () => callApi(ctx, "restoreItem", {
                  id: card.item.itemId
                }),
                "\u6765\u6E90\u4E8B\u9879\u5DF2\u6062\u590D\uFF1B\u540E\u7EED\u540C\u6B65\u4F1A\u7EE7\u7EED\u66F4\u65B0"
              ),
              onAsk: () => {
                const prompt = tutorPrompt(card, timeZone, now);
                if (!askAgent(ctx, prompt)) {
                  action.setNotice({
                    tone: "info",
                    text: "DSH \u804A\u5929\u5165\u53E3\u5F53\u524D\u4E0D\u53EF\u7528\uFF1B\u8BF7\u4ECE\u4F1A\u8BDD\u9875\u53D1\u8D77\u63D0\u95EE\u3002"
                  });
                }
              }
            },
            card.item.itemId
          )) })
        }
      ),
      pane === "review" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        Section,
        {
          title: "\u590D\u4E60\u6E05\u5355",
          subtitle: "\u6309\u8BFE\u7A0B\u6574\u7406\u8003\u8BD5/\u6D4B\u9A8C\uFF1B\u53EA\u4F9D\u636E\u5DF2\u4FDD\u5B58\u4E8B\u9879\u3001\u672C\u5730\u4EFB\u52A1\u4E0E\u5F53\u524D\u8BA1\u5212",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "ac-muted", children: "\u4F9D\u636E\uFF1A\u6765\u6E90\u4E8B\u9879\u3001\u672C\u5730\u4EFB\u52A1\u4E0E\u5F53\u524D\u8BA1\u5212\u3002\u6CA1\u6709\u6210\u7EE9\u3001\u638C\u63E1\u5EA6\u6216\u8BFE\u7A0B\u6750\u6599\u6570\u636E\uFF0C \u56E0\u6B64\u4E0D\u751F\u6210\u80FD\u529B\u8BC4\u5206\u6216\u590D\u4E60\u6548\u679C\u9884\u6D4B\u3002" }),
            reviewGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EmptyState, { title: "\u6CA1\u6709\u8003\u8BD5\u6216\u6D4B\u9A8C\u6570\u636E", children: "\u6CA1\u6709\u6570\u636E\u4E0D\u4EE3\u8868\u6CA1\u6709\u8003\u8BD5\uFF1B\u8BF7\u68C0\u67E5\u6570\u636E\u6E90\u662F\u5426\u8986\u76D6\u8003\u8BD5/\u6D4B\u9A8C\u3002" }) : reviewGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-card", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: group.label }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "ac-item-list", children: group.entries.map(({ card, tasks, planned }) => {
                const due = formatDue(card.item.due, timeZone, now);
                return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { className: "ac-item-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-title", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: card.item.title }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "info", children: kindLabel(card.item.kind) })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-task-meta", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: tasks.length > 0 ? `\u672C\u5730\u4EFB\u52A1\uFF1A${tasks.map(
                        (task) => `${task.task.title}\uFF08${formatMinutes(task.task.estimateMinutes)}\uFF09`
                      ).join("\u3001")}` : "\u5C1A\u672A\u521B\u5EFA\u672C\u5730\u4EFB\u52A1" }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: planned ? "\u5DF2\u8FDB\u5165\u5F53\u524D\u8BA1\u5212" : "\u5C1A\u672A\u8FDB\u5165\u5F53\u524D\u8BA1\u5212" })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "ac-item-due", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: toneForDue(due.tone), children: due.label }),
                    due.note && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ac-muted", children: due.note }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "ac-button",
                        onClick: () => {
                          if (!askAgent(ctx, tutorPrompt(card, timeZone, now))) {
                            action.setNotice({
                              tone: "info",
                              text: "DSH \u804A\u5929\u5165\u53E3\u5F53\u524D\u4E0D\u53EF\u7528\uFF1B\u8BF7\u4ECE\u4F1A\u8BDD\u9875\u53D1\u8D77\u63D0\u95EE\u3002"
                            });
                          }
                        },
                        children: "\u8BF7\u6559\u590D\u4E60\u5EFA\u8BAE"
                      }
                    )
                  ] })
                ] }, card.item.itemId);
              }) })
            ] }, group.key))
          ]
        }
      )
    ] })
  ] });
}

// packages/academic-dsh-ui/src/client/pages/PlanPage.tsx
var import_react5 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function taskTitle(tasks, taskId) {
  return tasks.find((card) => card.task.taskId === taskId)?.task.title ?? taskId;
}
var UNSCHEDULED_REASON_LABELS = {
  "deadline-passed": "\u622A\u6B62\u65F6\u95F4\u5DF2\u8FC7",
  "insufficient-time": "\u53EF\u7528\u65F6\u95F4\u4E0D\u8DB3",
  "no-available-time": "\u6CA1\u6709\u53EF\u7528\u65F6\u6BB5",
  "invalid-duration": "\u9884\u8BA1\u65F6\u957F\u65E0\u6548"
};
function unscheduledReasonLabel(reason) {
  return UNSCHEDULED_REASON_LABELS[reason] ?? reason;
}
function displayGroups(blocks, timeZone, mode) {
  if (mode === "list") {
    return [{ key: "all", label: "\u5168\u90E8\u65F6\u95F4\u5757", blocks: sortPlanBlocks(blocks) }];
  }
  if (mode === "week") {
    return groupBlocksByWeek(blocks, timeZone).map((group) => ({
      key: group.date,
      label: `${group.date} \u2014 ${group.endDate}`,
      blocks: group.blocks
    }));
  }
  return groupBlocksByDate(blocks, timeZone).map((group) => ({
    key: group.date,
    label: `${group.date} ${weekdayLabel(group.date)}`,
    blocks: group.blocks
  }));
}
function availabilitySummary(availability) {
  const days = new Set(availability.weeklySlots.map((slot) => slot.weekday)).size;
  return `${availability.timeZone} \xB7 \u6BCF\u5468 ${days} \u5929\u53EF\u7528 \xB7 \u7C92\u5EA6 ${availability.granularityMinutes} \u5206\u949F \xB7 \u4E34\u65F6\u4E0D\u53EF\u7528 ${availability.temporaryBlocks.length} \u6BB5`;
}
function PlanPage({ ctx, active, onNavigate }) {
  const load = (0, import_react5.useCallback)(
    (signal) => callApi(ctx, "plan", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active);
  const action = useAction(refresh);
  const [candidate, setCandidate] = (0, import_react5.useState)();
  const [rangeDays, setRangeDays] = (0, import_react5.useState)("7");
  const [mode, setMode] = (0, import_react5.useState)("day");
  const [lockStart, setLockStart] = (0, import_react5.useState)("");
  const [lockEnd, setLockEnd] = (0, import_react5.useState)("");
  const [lockTitle, setLockTitle] = (0, import_react5.useState)("");
  const view = viewState(state);
  const data = state.data;
  const timeZone = data?.availability.timeZone ?? "UTC";
  const plan = data?.plan;
  const tasks = data?.tasks ?? [];
  const candidateGroups = (0, import_react5.useMemo)(
    () => candidate ? displayGroups(candidate.blocks, timeZone, mode) : [],
    [candidate, timeZone, mode]
  );
  const planGroups = (0, import_react5.useMemo)(
    () => plan ? displayGroups(plan.blocks, timeZone, mode) : [],
    [plan, timeZone, mode]
  );
  const lockedGroups = (0, import_react5.useMemo)(
    () => plan ? groupLockedByDate(plan.lockedBlocks, timeZone) : [],
    [plan, timeZone]
  );
  const generate = async () => {
    const start = /* @__PURE__ */ new Date();
    const end = new Date(start.getTime() + Number(rangeDays) * 864e5);
    return callApi(ctx, "previewPlan", {
      start: start.toISOString(),
      end: end.toISOString()
    });
  };
  const preview = async () => {
    await action.run(
      "preview",
      async () => {
        const result = await generate();
        if (result.ok) setCandidate(result.value);
        return result;
      },
      "\u5019\u9009\u8BA1\u5212\u5DF2\u751F\u6210\uFF1B\u786E\u8BA4\u524D\u4E0D\u4F1A\u5199\u5165\u786E\u8BA4\u8BA1\u5212"
    );
  };
  const accept = async () => {
    if (!candidate) {
      return { ok: false, error: { code: "VALIDATION", message: "\u6CA1\u6709\u5019\u9009\u8BA1\u5212" } };
    }
    return callApi(ctx, "acceptPlan", {
      previewId: candidate.previewId
    });
  };
  const lock = async (start, end, title) => {
    const result = await callApi(ctx, "lockPlanBlock", {
      start,
      end,
      ...title ? { title } : {}
    });
    if (!result.ok) {
      action.setNotice({ tone: "error", text: result.error.message });
      return;
    }
    action.setNotice({ tone: "ok", text: "\u65F6\u6BB5\u5DF2\u9501\u5B9A\uFF1B\u91CD\u53E0\u7684\u65E7\u8BA1\u5212\u5757\u5DF2\u79FB\u9664" });
    setCandidate(void 0);
    await refresh();
  };
  const addLock = async () => {
    const start = fromLocalInputValue(lockStart);
    const end = fromLocalInputValue(lockEnd);
    if (!start || !end || Date.parse(end) <= Date.parse(start)) {
      action.setNotice({ tone: "error", text: "\u8BF7\u586B\u5199\u6709\u6548\u7684\u9501\u5B9A\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4" });
      return;
    }
    await lock(start, end, lockTitle || void 0);
    setLockStart("");
    setLockEnd("");
    setLockTitle("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh(),
        onNavigate: () => onNavigate("settings")
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u8BA1\u5212\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-inline-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Badge, { tone: data.plannerAvailable ? "ok" : "bad", children: data.plannerAvailable ? "Planner \u5DF2\u52A0\u8F7D" : "Planner \u4E0D\u53EF\u7528" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-muted", children: availabilitySummary(data.availability) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-inline-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-toggle", role: "tablist", "aria-label": "\u8BA1\u5212\u89C6\u56FE", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": mode === "day",
                className: mode === "day" ? "ac-toggle-active" : "",
                onClick: () => setMode("day"),
                children: "\u6309\u65E5"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": mode === "week",
                className: mode === "week" ? "ac-toggle-active" : "",
                onClick: () => setMode("week"),
                children: "\u6309\u5468"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": mode === "list",
                className: mode === "list" ? "ac-toggle-active" : "",
                onClick: () => setMode("list"),
                children: "\u5217\u8868"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u89C4\u5212\u8303\u56F4", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("select", { value: rangeDays, onChange: (event) => setRangeDays(event.target.value), children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "7", children: "\u672A\u6765 7 \u5929" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "14", children: "\u672A\u6765 14 \u5929" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "30", children: "\u672A\u6765 30 \u5929" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button ac-button-primary",
              disabled: !data.plannerAvailable || action.pending !== void 0,
              onClick: () => void preview(),
              children: action.pending === "preview" ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u5019\u9009\u8BA1\u5212"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "ac-button", onClick: () => onNavigate("settings"), children: "\u4FEE\u6539\u53EF\u7528\u65F6\u95F4" })
        ] })
      ] }),
      !data.plannerAvailable && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ac-banner ac-banner-warn", role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: "\u89C4\u5212\u80FD\u529B\u5F53\u524D\u4E0D\u53EF\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u5DF2\u6709\u8BA1\u5212\u4ECD\u53EF\u67E5\u8BE2\u548C\u67E5\u770B\uFF1B\u751F\u6210\u65B0\u8BA1\u5212\u9700\u8981\u91CD\u65B0\u52A0\u8F7D Planner \u63D2\u4EF6\u3002" })
      ] }) }),
      candidate && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        Section,
        {
          title: "\u5019\u9009\u8BA1\u5212",
          subtitle: "\u5019\u9009\u672A\u786E\u8BA4\uFF0C\u4E0D\u4F1A\u8986\u76D6\u5DF2\u786E\u8BA4\u8BA1\u5212",
          actions: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-inline-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-chip ac-chip-warn", children: "\u5019\u9009 \xB7 \u672A\u786E\u8BA4" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: "ac-button ac-button-primary",
                disabled: action.pending !== void 0 || plan?.status === "active",
                onClick: () => void action.run("accept", accept, "\u5019\u9009\u8BA1\u5212\u5DF2\u786E\u8BA4").then((ok) => {
                  if (ok) setCandidate(void 0);
                }),
                children: action.pending === "accept" ? "\u786E\u8BA4\u4E2D\u2026" : "\u786E\u8BA4\u5019\u9009\u8BA1\u5212"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "ac-button", onClick: () => setCandidate(void 0), children: "\u653E\u5F03\u5019\u9009" })
          ] }),
          children: [
            plan?.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "ac-muted", children: "\u5DF2\u6709\u786E\u8BA4\u8BA1\u5212\uFF1B\u8BF7\u5148\u5F52\u6863\u65E7\u8BA1\u5212\uFF0C\u786E\u8BA4\u5019\u9009\u4E0D\u4F1A\u9759\u9ED8\u8986\u76D6\u5B83\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-stat-grid ac-stat-grid-small", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-stat", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-stat-label", children: "\u4EFB\u52A1" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { className: "ac-stat-value", children: candidate.stats.taskCount })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-stat", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-stat-label", children: "\u5DF2\u5B89\u6392" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { className: "ac-stat-value", children: formatMinutes(candidate.stats.scheduledMinutes) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-stat", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-stat-label", children: "\u53EF\u5B89\u6392" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { className: "ac-stat-value", children: formatMinutes(candidate.stats.availableMinutes) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-stat", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-stat-label", children: "\u672A\u5B89\u6392" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { className: "ac-stat-value", children: formatMinutes(candidate.stats.unscheduledMinutes) })
              ] })
            ] }),
            candidate.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "ac-warning-list", children: candidate.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: warning }, warning)) }),
            candidateGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EmptyState, { title: "\u6CA1\u6709\u53EF\u5B89\u6392\u7684\u5019\u9009\u65F6\u95F4\u5757", children: "\u68C0\u67E5\u53EF\u7528\u65F6\u95F4\u3001\u9501\u5B9A\u65F6\u6BB5\u548C\u4EFB\u52A1\u9884\u8BA1\u65F6\u957F\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ac-day-groups", children: candidateGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-day-group", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: group.label }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "ac-block-list", children: group.blocks.map((block) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "ac-block-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("time", { children: formatDateTime(block.start, timeZone) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: taskTitle(tasks, block.taskId) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-muted", children: formatMinutes(
                  (Date.parse(block.end) - Date.parse(block.start)) / 6e4
                ) })
              ] }, `${block.taskId}:${block.start}`)) })
            ] }, group.key)) }),
            candidate.unscheduled.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-subsection", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: "\u672A\u80FD\u5B89\u6392\u7684\u4EFB\u52A1" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "ac-list", children: candidate.unscheduled.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "ac-list-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: entry.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-muted", children: unscheduledReasonLabel(entry.reason) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Badge, { tone: "warn", children: formatMinutes(entry.remainingMinutes) })
              ] }, entry.taskId)) })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        Section,
        {
          title: "\u5F53\u524D\u8BA1\u5212",
          subtitle: plan ? `\u72B6\u6001\uFF1A${planStatusLabel(plan.status)}` : "\u5C1A\u672A\u786E\u8BA4\u8BA1\u5212",
          actions: plan?.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            ConfirmAction,
            {
              label: "\u5F52\u6863\u8BA1\u5212",
              confirmLabel: "\u786E\u8BA4\u5F52\u6863",
              disabled: action.pending !== void 0,
              onConfirm: () => void action.run(
                "archive",
                () => callApi(ctx, "archivePlan", {}),
                "\u8BA1\u5212\u5DF2\u5F52\u6863\uFF1B\u5DF2\u786E\u8BA4\u5386\u53F2\u4ECD\u53EF\u8FFD\u6EAF"
              ).then((ok) => {
                if (ok) setCandidate(void 0);
              })
            }
          ) : void 0,
          children: !plan ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u786E\u8BA4\u8BA1\u5212", children: "\u751F\u6210\u5019\u9009\u8BA1\u5212\u5E76\u786E\u8BA4\u540E\uFF0C\u8BA1\u5212\u5757\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            plan.status === "archived" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "ac-muted", children: "\u8BE5\u8BA1\u5212\u5DF2\u5F52\u6863\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4FEE\u6539\uFF1B\u53EF\u4EE5\u751F\u6210\u65B0\u7684\u5019\u9009\u8BA1\u5212\u3002" }),
            planGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EmptyState, { title: "\u5F53\u524D\u8BA1\u5212\u6CA1\u6709\u65F6\u95F4\u5757" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ac-day-groups", children: planGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-day-group", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: group.label }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "ac-block-list", children: group.blocks.map((block) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "ac-block-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("time", { children: formatDateTime(block.start, timeZone) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: taskTitle(tasks, block.taskId) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ac-muted", children: formatMinutes(
                  (Date.parse(block.end) - Date.parse(block.start)) / 6e4
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "ac-button",
                    disabled: plan.status !== "active" || action.pending !== void 0,
                    onClick: () => void lock(
                      block.start,
                      block.end,
                      taskTitle(tasks, block.taskId)
                    ),
                    children: "\u9501\u5B9A\u6B64\u5757"
                  }
                )
              ] }, `${block.taskId}:${block.start}`)) })
            ] }, group.key)) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-subsection", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: "\u9501\u5B9A\u65F6\u6BB5" }),
              lockedGroups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "ac-muted", children: "\u6CA1\u6709\u9501\u5B9A\u65F6\u6BB5\uFF1B\u9501\u5B9A\u662F\u786C\u7EA6\u675F\uFF0CPlanner \u4E0D\u4F1A\u5360\u7528\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { className: "ac-list", children: lockedGroups.flatMap(
                (group) => group.blocks.map((block) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "ac-list-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: block.title ?? "\u9501\u5B9A\u65F6\u6BB5" }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "ac-muted", children: [
                      formatDateTime(block.start, timeZone),
                      " \u2014",
                      " ",
                      formatDateTime(block.end, timeZone)
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    ConfirmAction,
                    {
                      label: "\u89E3\u9501",
                      confirmLabel: "\u786E\u8BA4\u89E3\u9501",
                      disabled: action.pending !== void 0,
                      onConfirm: () => void action.run(
                        "unlock",
                        () => callApi(ctx, "unlockPlanBlock", {
                          lockId: block.id
                        }),
                        "\u65F6\u6BB5\u5DF2\u89E3\u9501"
                      ).then((ok) => {
                        if (ok) setCandidate(void 0);
                      })
                    }
                  )
                ] }, block.id))
              ) })
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        Section,
        {
          title: "\u4E34\u65F6\u9501\u5B9A\u65F6\u6BB5",
          subtitle: "\u9501\u5B9A\u4E3A\u786C\u7EA6\u675F\uFF1B\u89E3\u9501\u540E\u91CD\u65B0\u751F\u6210\u5019\u9009\u8BA1\u5212",
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            "form",
            {
              className: "ac-form-card",
              onSubmit: (event) => {
                event.preventDefault();
                void addLock();
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "ac-form-grid", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u5F00\u59CB\u65F6\u95F4\uFF08\u6D4F\u89C8\u5668\u672C\u5730\u65F6\u95F4\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "datetime-local",
                      value: lockStart,
                      onChange: (event) => setLockStart(event.target.value),
                      required: true
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u7ED3\u675F\u65F6\u95F4\uFF08\u6D4F\u89C8\u5668\u672C\u5730\u65F6\u95F4\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "datetime-local",
                      value: lockEnd,
                      onChange: (event) => setLockEnd(event.target.value),
                      required: true
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Field, { label: "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      value: lockTitle,
                      onChange: (event) => setLockTitle(event.target.value),
                      maxLength: 200
                    }
                  ) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "submit",
                    className: "ac-button",
                    disabled: !plan || plan.status !== "active" || action.pending !== void 0,
                    children: "\u9501\u5B9A\u65F6\u6BB5"
                  }
                ) })
              ]
            }
          )
        }
      )
    ] })
  ] });
}

// packages/academic-dsh-ui/src/client/pages/ConnectionsPage.tsx
var import_react6 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function SourceCredentialForm({
  ctx,
  source,
  onDone
}) {
  const [secret, setSecret] = (0, import_react6.useState)("");
  const [pending, setPending] = (0, import_react6.useState)(false);
  const [message, setMessage] = (0, import_react6.useState)();
  const submit = async () => {
    if (!secret) {
      setMessage("\u8BF7\u586B\u5199\u51ED\u636E");
      return;
    }
    const value = secret;
    setSecret("");
    setPending(true);
    setMessage(void 0);
    const result = await callApi(ctx, "sourceSetSecret", {
      sourceId: source.sourceId,
      secret: value
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("\u51ED\u636E\u5DF2\u4EA4\u7ED9\u672C\u673A Host \u4FDD\u5B58\uFF1B\u9A8C\u8BC1\u6210\u529F\u524D\u4E0D\u4F1A\u663E\u793A\u4E3A\u5DF2\u8FDE\u63A5\u3002");
    await onDone();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      Field,
      {
        label: source.authKind === "token" ? "Token" : "\u5BC6\u7801",
        hint: "\u53EA\u63D0\u4EA4\u7ED9\u672C\u673A Host\uFF1B\u4E0D\u5199\u5165\u6D4F\u89C8\u5668\u5B58\u50A8\u3001URL \u6216\u65E5\u5FD7\u3002",
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "password",
            value: secret,
            onChange: (event) => setSecret(event.target.value),
            autoComplete: "off",
            spellCheck: false,
            "data-lpignore": "true",
            "data-1p-ignore": "true",
            name: "academic-credential"
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "button",
      {
        type: "button",
        className: "ac-button",
        disabled: pending,
        onClick: () => void submit(),
        children: pending ? "\u63D0\u4EA4\u4E2D\u2026" : source.connection ? "\u66F4\u65B0\u51ED\u636E" : "\u4FDD\u5B58\u51ED\u636E"
      }
    ),
    message && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: message })
  ] });
}
function SourceEditForm({
  ctx,
  source,
  engine,
  onDone,
  onCancel
}) {
  const [displayName, setDisplayName] = (0, import_react6.useState)(source.displayName);
  const [authKind, setAuthKind] = (0, import_react6.useState)(
    source.authKind === "unknown" ? "token" : source.authKind
  );
  const [loginMode, setLoginMode] = (0, import_react6.useState)(source.loginMode ?? "browser");
  const [capabilities, setCapabilities] = (0, import_react6.useState)(source.capabilities.join(", "));
  const [configJson, setConfigJson] = (0, import_react6.useState)(JSON.stringify(source.config, null, 2));
  const [pending, setPending] = (0, import_react6.useState)(false);
  const [message, setMessage] = (0, import_react6.useState)();
  const authKinds = engine?.authKinds ?? ["none", "password", "token", "oauth"];
  const loginModes = engine?.loginModes ?? ["browser", "manual"];
  const submit = async () => {
    let config;
    try {
      const parsed = JSON.parse(configJson || "{}");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("\u914D\u7F6E\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
      }
      config = parsed;
    } catch (error) {
      setMessage(`\u914D\u7F6E JSON \u65E0\u6548\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    setPending(true);
    setMessage(void 0);
    const result = await callApi(ctx, "updateSource", {
      sourceId: source.sourceId,
      displayName: displayName.trim(),
      authKind,
      ...authKind === "none" ? {} : { loginMode },
      capabilities: capabilities.split(",").map((value) => value.trim()).filter(Boolean),
      config,
      expectedVersion: source.version
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    await onDone();
    onCancel();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u663E\u793A\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          value: displayName,
          onChange: (event) => setDisplayName(event.target.value),
          required: true
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BA4\u8BC1\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "select",
        {
          value: authKind,
          onChange: (event) => {
            const next = event.target.value;
            setAuthKind(next);
            if (next === "none") setLoginMode("none");
            else if (loginMode === "none") setLoginMode(loginModes[0] ?? "browser");
          },
          children: authKinds.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: kind, children: kind }, kind))
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u767B\u5F55\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "select",
        {
          value: authKind === "none" ? "none" : loginMode,
          onChange: (event) => setLoginMode(event.target.value),
          disabled: authKind === "none" || engine?.supportsLogin === false,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "none", children: "\u4E0D\u767B\u5F55" }),
            loginModes.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: mode, children: mode }, mode))
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u80FD\u529B\uFF08\u9017\u53F7\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          value: capabilities,
          onChange: (event) => setCapabilities(event.target.value)
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      Field,
      {
        label: "\u975E\u654F\u611F\u914D\u7F6E\uFF08JSON\uFF09",
        hint: "URL\u3001\u9009\u62E9\u5668\u3001\u89C4\u5219\u7B49\uFF1B\u7981\u6B62 password/token/cookie \u5B57\u6BB5",
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "textarea",
          {
            rows: 8,
            value: configJson,
            onChange: (event) => setConfigJson(event.target.value),
            spellCheck: false
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button ac-button-primary",
          disabled: pending,
          onClick: () => void submit(),
          children: pending ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "ac-button", disabled: pending, onClick: onCancel, children: "\u53D6\u6D88" })
    ] }),
    message && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-bad", children: message })
  ] });
}
function SourceCard({
  ctx,
  source,
  engines,
  timeZone,
  refresh
}) {
  const action = useAction(async () => {
    await refresh();
  });
  const [preview, setPreview] = (0, import_react6.useState)();
  const [probe, setProbe] = (0, import_react6.useState)();
  const [agentNote, setAgentNote] = (0, import_react6.useState)();
  const [editing, setEditing] = (0, import_react6.useState)(false);
  const connection = source.connection;
  const archived = source.configuration === "archived";
  const engine = engines.find((entry) => entry.id === source.engine);
  const browserLogin = source.canLogin && source.loginMode === "browser";
  const manualCredential = source.authKind !== "none" && !browserLogin;
  const syncAllowed = source.nextStep.action === "sync";
  const askForAdapter = () => {
    const ok = askAgent(
      ctx,
      `\u8BF7\u4E3A\u6570\u636E\u6E90 ${source.sourceId}\uFF08${source.displayName}\uFF09\u751F\u6210\u53EF\u9A8C\u8BC1\u7684\u58F0\u660E\u5F0F Adapter\u3002\u6309\u9636\u6BB5\u6267\u884C\uFF0C\u8BC1\u636E\u4E0D\u8DB3\u65F6\u505C\u6B62\u5E76\u8BF4\u660E\uFF0C\u4E0D\u8981\u731C\u6D4B\u3002
1. \u5148\u8C03\u7528 academic_probe_source \u63A2\u6D4B\u5F53\u524D\u914D\u7F6E\u9875\u9762\uFF0C\u8BB0\u5F55 status/title/headings/links/scripts/endpointCandidates/tables/containers/jsonShape/digest\uFF1B\u4E0D\u8981\u8BB0\u5F55 Cookie\u3002
2. \u82E5\u9875\u9762\u662F SPA \u5916\u58F3\uFF08\u6807\u9898/\u5217\u8868/\u8868\u683C/\u94FE\u63A5\u57FA\u672C\u4E3A\u7A7A\uFF0C\u53EA\u6709\u201C\u52A0\u8F7D\u4E2D\u201D\uFF09\uFF0C\u4E0D\u8981\u751F\u6210 selector \u5360\u4F4D\u5019\u9009\uFF1B\u7528 academic_probe_source \u7684\u53EF\u9009 url \u53C2\u6570\u7EE7\u7EED\u63A2\u6D4B\u540C\u7AD9\u811A\u672C\u3001\u5206\u9875/\u5217\u8868\u94FE\u63A5\u548C\u5019\u9009\u63A5\u53E3\uFF0C\u4F18\u5148\u627E\u540C\u6E90 JSON \u63A5\u53E3\u5E76\u8BB0\u5F55\u5B57\u6BB5/\u6570\u7EC4\u5F62\u72B6\u3002\u6BCF\u6B21 URL \u5FC5\u987B\u4ECD\u5C5E\u4E8E\u8BE5\u6765\u6E90\u4E3B\u673A\u3002
3. \u627E\u5230\u771F\u5B9E\u5217\u8868\u9875\u6216 JSON \u63A5\u53E3\u540E\uFF0C\u5148\u6839\u636E tables[].className/headers\u3001containers[].className \u548C links \u63A8\u65AD\u9009\u62E9\u5668\uFF0C\u518D\u7528 academic_probe_source \u7684 capture=true \u6355\u83B7\u54CD\u5E94\uFF0C\u62FF\u5230 sampleId\uFF1B\u539F\u59CB\u9875\u9762\u53EA\u7559\u5728\u5BBF\u4E3B\uFF0C\u4E0D\u8981\u628A\u6574\u9875\u5185\u5BB9\u7C98\u8D34\u5230\u5BF9\u8BDD\u91CC\u3002
4. \u53EA\u6709\u62FF\u5230\u771F\u5B9E\u9875\u9762/\u771F\u5B9E JSON \u6837\u672C\u540E\u624D\u751F\u6210\u5B57\u6BB5\u6620\u5C04\uFF1B\u7528 sampleIds\uFF08\u6216\u771F\u5B9E samples\uFF09\u8C03\u7528 academic_validate_adapter_candidate\uFF0C\u6837\u672C\u5FC5\u987B\u8986\u76D6\u6240\u6709\u8BF7\u6C42 URL\u3002\u7981\u6B62\u7528\u5408\u6210 HTML \u8BA9\u9A8C\u8BC1\u53D8\u7EFF\uFF0C\u5931\u8D25\u53EA\u62A5\u544A\u7ED3\u6784\u5316\u539F\u56E0\u3002
5. \u4E0D\u6CE8\u518C\u3001\u4E0D\u542F\u7528\u3001\u4E0D\u6269\u5927\u57DF\u540D/\u8DEF\u5F84\uFF1B\u9700\u8981\u66F4\u5BBD\u8DEF\u5F84\u65F6\u7ED9\u51FA\u7CBE\u786E URL/\u524D\u7F00\uFF0C\u4EA4\u7531\u6211\u5728\u201C\u8FDE\u63A5\u201D\u9875\u786E\u8BA4\u3002
6. \u8F93\u51FA\uFF1A\u5DF2\u63A2\u6D4B URL/\u72B6\u6001\u3001\u5C1D\u8BD5\u8FC7\u7684\u811A\u672C/\u63A5\u53E3\u3001\u6355\u83B7\u5230\u7684 sampleId\u3001\u963B\u585E\u70B9\u3001\u9700\u8981\u6211\u63D0\u4F9B\u7684\u552F\u4E00\u4FE1\u606F\u3001\u5019\u9009\u662F\u5426\u5DF2\u4FDD\u5B58/\u9A8C\u8BC1\u3002`
    );
    setAgentNote(
      ok ? "\u5DF2\u6253\u5F00 Agent \u4F1A\u8BDD\uFF1B\u751F\u6210\u5B8C\u6210\u540E\u56DE\u5230\u201C\u8FDE\u63A5\u201D\u9875\u9A8C\u8BC1\u5E76\u542F\u7528\u5019\u9009\u3002" : "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684 Agent \u4F1A\u8BDD\u5165\u53E3\uFF0C\u8BF7\u5728 DSH \u5BF9\u8BDD\u4E2D\u53D1\u8D77\u3002"
    );
  };
  const runProbe = async () => {
    const result = await callApi(ctx, "probeSource", {
      sourceId: source.sourceId
    });
    if (result.ok) setProbe(result.value);
    return result;
  };
  const previewSync = async () => {
    const result = await callApi(ctx, "previewSourceSync", {
      sourceId: source.sourceId,
      ...connection ? { connectionId: connection.connectionId } : {}
    });
    if (result.ok) setPreview(result.value);
    return result;
  };
  const sync = async () => {
    const result = await callApi(ctx, "syncNow", {
      sourceId: source.sourceId,
      ...connection ? { connectionId: connection.connectionId } : {}
    });
    if (!result.ok) return result;
    if (result.value.status === "success" || result.value.status === "partial") {
      return result;
    }
    return {
      ok: false,
      error: {
        code: result.value.status === "auth-required" ? "AUTH_REQUIRED" : "ERROR",
        message: result.value.errorMessage ?? `\u540C\u6B65\u672A\u6210\u529F\uFF1A${syncStatusLabel(result.value.status)}\uFF1B\u65E7\u6570\u636E\u5DF2\u4FDD\u7559`
      }
    };
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "ac-card ac-source-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-source-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-task-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: source.displayName }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: sourceStageTone(source.stage), children: sourceStageLabel(source.stage) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Badge, { tone: source.engineKnown ? "info" : "bad", children: [
          "\u5F15\u64CE\uFF1A",
          source.engine
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: source.syncAvailable ? "ok" : "neutral", children: source.syncAvailable ? "\u540C\u6B65\u6E90" : "\u767B\u5F55\u6E90" }),
        source.canLogin && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: "info", children: "\u767B\u5F55\u53EF\u7528" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: source.detail }),
      source.diagnosis && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-text-warn", children: [
        "\u8BCA\u65AD\uFF1A",
        source.diagnosis.summary,
        " \xB7 \u5EFA\u8BAE\uFF1A",
        source.diagnosis.suggestion
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
          "\u4E0B\u4E00\u6B65\uFF1A",
          source.nextStep.label
        ] }),
        source.nextStep.reason ? ` \xB7 ${source.nextStep.reason}` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-task-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Badge, { tone: "neutral", children: [
          "\u914D\u7F6E\uFF1A",
          sourceConfigurationLabel(source.configuration)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          Badge,
          {
            tone: source.authentication === "verified" || source.authentication === "not-required" ? "ok" : source.authentication === "missing" ? "warn" : "bad",
            children: [
              "\u8BA4\u8BC1\uFF1A",
              sourceAuthenticationLabel(source.authentication)
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Badge, { tone: sourceSyncHealthTone(source.syncHealth), children: [
          "\u540C\u6B65\uFF1A",
          sourceSyncHealthLabel(source.syncHealth)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Badge, { tone: source.adapterReady ? "ok" : "warn", children: [
          "Adapter\uFF1A",
          source.adapterReady ? "\u5DF2\u5C31\u7EEA" : "\u672A\u5C31\u7EEA"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-task-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u6765\u6E90 ID\uFF1A",
          source.sourceId
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u8BA4\u8BC1\u65B9\u5F0F\uFF1A",
          source.authKind
        ] }),
        source.loginMode && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u767B\u5F55\u65B9\u5F0F\uFF1A",
          source.loginMode
        ] }),
        connection?.accountLabel && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u8D26\u53F7\uFF1A",
          connection.accountLabel
        ] }),
        source.capabilities.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u80FD\u529B\uFF1A",
          source.capabilities.join("\u3001")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u4E0A\u6B21\u9A8C\u8BC1\uFF1A",
          formatDateTimeOrDash(connection?.lastVerifiedAt, timeZone)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          "\u4E0A\u6B21\u540C\u6B65\uFF1A",
          formatDateTimeOrDash(source.lastSync?.finishedAt, timeZone)
        ] })
      ] }),
      connection?.lastError && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-text-bad", children: [
        "\u6700\u8FD1\u9519\u8BEF\uFF1A",
        connection.lastError
      ] }),
      connection?.status === "configured" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-warn", children: "\u5DF2\u4FDD\u5B58\u51ED\u636E\uFF0C\u4F46\u5C1A\u672A\u9A8C\u8BC1\uFF1B\u4FDD\u5B58\u51ED\u636E\u4E0D\u4EE3\u8868\u5E73\u53F0\u53EF\u7528\u3002" }),
      action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
      preview && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u9884\u89C8\uFF1A\u65B0\u589E ",
          preview.counts.create,
          " \xB7 \u66F4\u65B0 ",
          preview.counts.update,
          " \xB7 \u672A\u53D8",
          " ",
          preview.counts.unchanged,
          " \xB7 \u8DF3\u8FC7 ",
          preview.counts.skip,
          " \xB7 \u672A\u8FD4\u56DE",
          " ",
          preview.counts.missing,
          preview.completeness === "partial" ? "\uFF08\u90E8\u5206\u540C\u6B65\uFF0C\u65E7\u6570\u636E\u4FDD\u7559\uFF09" : ""
        ] }),
        preview.warnings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-warning-list", children: preview.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: warning }, warning)) }),
        preview.items.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-list", children: preview.items.slice(0, 5).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
          entry.action,
          " \xB7 ",
          entry.title,
          entry.reason ? `\uFF08${entry.reason}\uFF09` : ""
        ] }, `${entry.externalItemId ?? entry.title}-${entry.action}`)) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button ac-button-primary",
              disabled: action.pending !== void 0,
              onClick: () => void action.run("sync", sync, "\u540C\u6B65\u5B8C\u6210").then((ok) => {
                if (ok) setPreview(void 0);
              }),
              children: action.pending === "sync" ? "\u540C\u6B65\u4E2D\u2026" : "\u786E\u8BA4\u540C\u6B65"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              disabled: action.pending !== void 0,
              onClick: () => setPreview(void 0),
              children: "\u53D6\u6D88"
            }
          )
        ] })
      ] }),
      probe && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u63A2\u6D4B\u7ED3\u679C\uFF08\u53EA\u8BFB\uFF09\uFF1AHTTP ",
          probe.status,
          " \xB7 ",
          probe.title || "\u65E0\u6807\u9898",
          " \xB7",
          " ",
          probe.bytes,
          " \u5B57\u8282",
          probe.truncated ? "\uFF08\u5DF2\u622A\u65AD\uFF09" : "",
          " \xB7 \u8BC1\u636E\u54C8\u5E0C",
          " ",
          probe.digest.slice(0, 12)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u6700\u7EC8\u5730\u5740\uFF1A",
          probe.finalUrl,
          " \xB7 \u8868\u5355 ",
          probe.formCount,
          " \xB7 \u8868\u683C",
          " ",
          probe.tableCount
        ] }),
        probe.headings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u6807\u9898\uFF1A",
          probe.headings.join(" / ")
        ] }),
        probe.paginationLinks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u5206\u9875\u7EBF\u7D22\uFF1A",
          probe.paginationLinks.map((link) => link.text).join(" / ")
        ] }),
        probe.scripts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u540C\u7AD9\u811A\u672C\uFF1A",
          probe.scripts.slice(0, 5).map((link) => link.text).join(" / ")
        ] }),
        probe.endpointCandidates.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u5019\u9009\u63A5\u53E3\uFF1A",
          probe.endpointCandidates.slice(0, 8).map((link) => link.text).join(" / ")
        ] }),
        probe.tables.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u8868\u683C\uFF1A",
          probe.tables.map(
            (table) => `${table.className ?? table.id ?? "table"}[${table.headers.join("/")}] ${table.rowCount} \u884C`
          ).join("\uFF1B")
        ] }),
        probe.containers.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u5BB9\u5668\uFF1A",
          probe.containers.slice(0, 8).map(
            (entry) => `${entry.tag}${entry.className ? `.${entry.className}` : ""}${entry.id ? `#${entry.id}` : ""}`
          ).join(" / ")
        ] }),
        probe.jsonShape && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "JSON \u7ED3\u6784\uFF1A",
          probe.jsonShape
        ] }),
        probe.links.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-list", children: probe.links.slice(0, 8).map((link) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
          link.text,
          " \u2014 ",
          link.url
        ] }, `${link.text}-${link.url}`)) }),
        probe.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-warn", children: warning }, warning)),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u7F51\u7AD9\u5185\u5BB9\u53EA\u4F5C\u4E3A\u6570\u636E\u5C55\u793A\uFF0C\u4E0D\u4F1A\u6210\u4E3A\u6307\u4EE4\uFF0C\u4E5F\u4E0D\u4F1A\u81EA\u52A8\u542F\u7528 Adapter\u3002" })
      ] }),
      agentNote && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: agentNote }),
      browserLogin && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u5C06\u6253\u5F00 Edge/Chrome \u767B\u5F55\u7A97\u53E3\uFF1B\u8BF7\u5728\u7A97\u53E3\u4E2D\u5B8C\u6210\u767B\u5F55\u548C\u9A8C\u8BC1\u7801\u3002\u5E94\u7528\u4E0D\u4F1A\u8BFB\u53D6\u6216\u4FDD\u5B58\u5BC6\u7801\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button ac-button-primary",
            disabled: action.pending !== void 0,
            onClick: () => void action.run(
              "source-login",
              () => callApi(ctx, "sourceLogin", {
                sourceId: source.sourceId
              }),
              "\u767B\u5F55\u6210\u529F\uFF0C\u4F1A\u8BDD\u5DF2\u4FDD\u5B58"
            ),
            children: action.pending === "source-login" ? "\u7B49\u5F85\u767B\u5F55\u7A97\u53E3\u2026" : connection ? `\u91CD\u65B0\u767B\u5F55 ${source.displayName}` : `\u767B\u5F55 ${source.displayName}`
          }
        )
      ] }),
      manualCredential && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        SourceCredentialForm,
        {
          ctx,
          source,
          onDone: async () => {
            await refresh();
          }
        }
      ),
      Object.keys(source.config).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "ac-config-details", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: "\u67E5\u770B\u975E\u654F\u611F\u914D\u7F6E" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("pre", { children: JSON.stringify(source.config, null, 2) })
      ] })
    ] }),
    editing && !archived && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      SourceEditForm,
      {
        ctx,
        source,
        engine,
        onDone: refresh,
        onCancel: () => setEditing(false)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-source-actions", children: archived ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button ac-button-primary",
          disabled: action.pending !== void 0,
          onClick: () => void action.run(
            "restore-source",
            () => callApi(ctx, "restoreSource", {
              sourceId: source.sourceId
            }),
            "\u6570\u636E\u6E90\u5DF2\u6062\u590D\uFF1B\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u518D\u540C\u6B65"
          ),
          children: "\u6062\u590D\u6570\u636E\u6E90"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5F7B\u5E95\u5220\u9664",
          confirmLabel: "\u786E\u8BA4\u5F7B\u5E95\u5220\u9664",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "delete-source",
            () => callApi(ctx, "deleteSource", {
              sourceId: source.sourceId
            }),
            "\u6570\u636E\u6E90\u4E0E\u51ED\u636E\u5DF2\u5220\u9664\uFF1B\u5DF2\u540C\u6B65\u7684\u5B66\u4E1A\u6570\u636E\u4FDD\u7559"
          )
        }
      )
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: action.pending !== void 0,
          onClick: () => setEditing((value) => !value),
          children: editing ? "\u6536\u8D77\u7F16\u8F91" : "\u7F16\u8F91\u914D\u7F6E"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: !connection || source.authKind === "none" || action.pending !== void 0,
          onClick: () => void action.run("probe", runProbe, "\u63A2\u6D4B\u5B8C\u6210"),
          children: action.pending === "probe" ? "\u63A2\u6D4B\u4E2D\u2026" : "\u63A2\u6D4B\u9875\u9762"
        }
      ),
      connection && source.authKind !== "none" && !source.adapterReady && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: action.pending !== void 0,
          onClick: askForAdapter,
          children: "\u8BA9 Agent \u751F\u6210\u5019\u9009"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: !source.syncAvailable || action.pending !== void 0,
          onClick: () => void action.run("preview", previewSync, "\u9884\u89C8\u5B8C\u6210"),
          children: action.pending === "preview" ? "\u8BFB\u53D6\u4E2D\u2026" : "\u9884\u89C8\u540C\u6B65"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: !source.syncAvailable || !syncAllowed || action.pending !== void 0,
          title: syncAllowed ? void 0 : source.nextStep.label,
          onClick: () => void action.run("sync", sync, "\u540C\u6B65\u5B8C\u6210"),
          children: action.pending === "sync" ? "\u540C\u6B65\u4E2D\u2026" : syncAllowed ? "\u7ACB\u5373\u540C\u6B65" : "\u5148\u5B8C\u6210\u4E0B\u4E00\u6B65"
        }
      ),
      connection && source.canVerify && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: action.pending !== void 0,
          onClick: () => void action.run(
            "verify",
            () => callApi(ctx, "verifyConnection", {
              connectionId: connection.connectionId
            }),
            "\u8FDE\u63A5\u5DF2\u9A8C\u8BC1"
          ),
          children: "\u9A8C\u8BC1\u8FDE\u63A5"
        }
      ),
      connection && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u65AD\u5F00\u8FDE\u63A5",
          confirmLabel: "\u786E\u8BA4\u65AD\u5F00",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "disconnect",
            () => callApi(ctx, "disconnectConnection", {
              connectionId: connection.connectionId
            }),
            "\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF1B\u5DF2\u540C\u6B65\u5B66\u4E1A\u6570\u636E\u4FDD\u7559"
          )
        }
      ),
      connection?.hasCredential && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5220\u9664\u51ED\u636E",
          confirmLabel: "\u786E\u8BA4\u5220\u9664\u51ED\u636E",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "delete",
            () => callApi(ctx, "deleteConnectionCredential", {
              connectionId: connection.connectionId
            }),
            "\u51ED\u636E\u5DF2\u5220\u9664\uFF1B\u5B66\u4E1A\u4E8B\u4EF6\u672A\u5220\u9664"
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5F52\u6863\u6570\u636E\u6E90",
          confirmLabel: "\u786E\u8BA4\u5F52\u6863",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "archive-source",
            () => callApi(ctx, "archiveSource", {
              sourceId: source.sourceId
            }),
            "\u6570\u636E\u6E90\u5DF2\u5F52\u6863\uFF1B\u53EF\u5728\u4E0B\u65B9\u6062\u590D\u6216\u5F7B\u5E95\u5220\u9664"
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5F7B\u5E95\u5220\u9664",
          confirmLabel: "\u786E\u8BA4\u5F7B\u5E95\u5220\u9664",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "delete-source",
            () => callApi(ctx, "deleteSource", {
              sourceId: source.sourceId
            }),
            "\u6570\u636E\u6E90\u4E0E\u51ED\u636E\u5DF2\u5220\u9664\uFF1B\u5DF2\u540C\u6B65\u7684\u5B66\u4E1A\u6570\u636E\u4FDD\u7559"
          )
        }
      )
    ] }) })
  ] });
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function QuickAdd({
  ctx,
  data,
  onCreated
}) {
  const action = useAction(async () => {
    await onCreated();
  });
  const platforms = [
    {
      id: "blackboard",
      label: "Blackboard Learn\uFF08\u8BFE\u7A0B\u3001\u4F5C\u4E1A\u3001\u8003\u8BD5\u3001\u6D4B\u9A8C\uFF09"
    },
    {
      id: "browser-session",
      label: "\u901A\u7528\u7F51\u7AD9\uFF08\u5148\u767B\u5F55\uFF0C\u518D\u751F\u6210\u9002\u914D\u5668\uFF09"
    }
  ].filter((platform2) => data.engines.some((engine) => engine.id === platform2.id));
  const [platform, setPlatform] = (0, import_react6.useState)(platforms[0]?.id ?? "");
  const [url, setUrl] = (0, import_react6.useState)("");
  const [displayName, setDisplayName] = (0, import_react6.useState)("");
  const submit = async () => {
    let parsed;
    try {
      parsed = new URL(url.trim());
    } catch {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u8BF7\u586B\u5199\u6709\u6548\u7684\u5E73\u53F0\u7F51\u5740" }
      };
    }
    if (parsed.protocol !== "https:") {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u5E73\u53F0\u7F51\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS" }
      };
    }
    if (!platform) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u5F53\u524D Host \u6CA1\u6709\u53EF\u7528\u7684\u6570\u636E\u6E90\u5F15\u64CE" }
      };
    }
    const origin = parsed.origin;
    const host = parsed.hostname;
    const baseConfig = {
      loginUrl: parsed.toString(),
      authenticatedUrlPatterns: [`^${escapeRegex(origin)}/`],
      cookieDomains: [host],
      verifyUrl: parsed.toString(),
      loggedOutPatterns: ["/webapps/login", "/login"]
    };
    const config = platform === "blackboard" ? {
      ...baseConfig,
      portalUrl: parsed.toString(),
      maxAssignments: 100,
      maxContentPages: 20,
      delayMs: 150
    } : baseConfig;
    return callApi(ctx, "createSource", {
      engine: platform,
      displayName: displayName.trim() || host,
      authKind: "token",
      loginMode: "browser",
      capabilities: ["academic.sync"],
      config
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "form",
    {
      className: "ac-form-card",
      onSubmit: (event) => {
        event.preventDefault();
        void action.run("quick-add", submit, "\u6570\u636E\u6E90\u5DF2\u521B\u5EFA\uFF1B\u4E0B\u4E00\u6B65\u5B8C\u6210\u767B\u5F55").then(
          (ok) => {
            if (ok) {
              setUrl("");
              setDisplayName("");
            }
          }
        );
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: "\u5FEB\u901F\u6DFB\u52A0\u5E73\u53F0" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u586B\u5199\u5E73\u53F0\u9996\u9875\u5E76\u9009\u62E9\u7C7B\u578B\uFF0C\u7CFB\u7EDF\u4F1A\u751F\u6210\u975E\u654F\u611F\u914D\u7F6E\uFF1B\u968F\u540E\u5B8C\u6210\u767B\u5F55\u3001\u9A8C\u8BC1\u3001\u9884\u89C8\u548C\u9996\u6B21\u540C\u6B65\u3002 \u51ED\u636E\u548C Cookie \u4E0D\u4F1A\u5199\u5165\u914D\u7F6E\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5E73\u53F0\u7F51\u5740", hint: "\u5FC5\u987B\u662F HTTPS\uFF1B\u5EFA\u8BAE\u586B\u5199\u767B\u5F55\u540E\u7684\u9996\u9875", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              type: "url",
              value: url,
              onChange: (event) => setUrl(event.target.value),
              placeholder: "https://lms.example.edu/",
              required: true
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u663E\u793A\u540D\u79F0\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: displayName,
              onChange: (event) => setDisplayName(event.target.value),
              placeholder: "\u6211\u7684\u8BFE\u7A0B\u5E73\u53F0"
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5E73\u53F0\u7C7B\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "select",
            {
              value: platform,
              onChange: (event) => setPlatform(event.target.value),
              required: true,
              children: platforms.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: entry.id, children: entry.label }, entry.id))
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "submit",
            className: "ac-button ac-button-primary",
            disabled: action.pending !== void 0 || platforms.length === 0,
            children: action.pending === "quick-add" ? "\u521B\u5EFA\u4E2D\u2026" : "\u6DFB\u52A0\u5E73\u53F0"
          }
        ) }),
        action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) })
      ]
    }
  );
}
function SourceForm({
  ctx,
  data,
  onCreated
}) {
  const action = useAction(async () => {
    await onCreated();
  });
  const initialEngine = data.engines[0];
  const initialAuthKind = initialEngine?.authKinds?.[0] ?? "token";
  const [sourceId, setSourceId] = (0, import_react6.useState)("");
  const [engine, setEngine] = (0, import_react6.useState)(initialEngine?.id ?? "");
  const [displayName, setDisplayName] = (0, import_react6.useState)("");
  const [authKind, setAuthKind] = (0, import_react6.useState)(initialAuthKind);
  const [loginMode, setLoginMode] = (0, import_react6.useState)(
    initialAuthKind === "none" ? "none" : initialEngine?.loginModes?.[0] ?? "browser"
  );
  const [capabilities, setCapabilities] = (0, import_react6.useState)("");
  const [configJson, setConfigJson] = (0, import_react6.useState)("{}");
  const selectedEngine = data.engines.find((entry) => entry.id === engine);
  const authKinds = selectedEngine?.authKinds ?? [
    "none",
    "password",
    "token",
    "oauth"
  ];
  const loginModes = selectedEngine?.loginModes ?? ["browser", "manual"];
  const loginDisabled = authKind === "none" || selectedEngine?.supportsLogin === false;
  const submit = async () => {
    let config;
    try {
      const parsed = JSON.parse(configJson || "{}");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("\u914D\u7F6E\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
      }
      config = parsed;
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: `\u914D\u7F6E JSON \u65E0\u6548\uFF1A${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
    return callApi(ctx, "createSource", {
      ...sourceId.trim() ? { sourceId: sourceId.trim() } : {},
      engine: engine.trim(),
      displayName: displayName.trim(),
      authKind,
      loginMode: loginMode === "none" ? void 0 : loginMode,
      capabilities: capabilities.split(",").map((value) => value.trim()).filter(Boolean),
      config
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "form",
    {
      className: "ac-form-card",
      onSubmit: (event) => {
        event.preventDefault();
        void action.run("source", submit, "\u6570\u636E\u6E90\u5DF2\u521B\u5EFA").then((ok) => {
          if (ok) {
            setSourceId("");
            setDisplayName("");
            setConfigJson("{}");
          }
        });
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: "\u6DFB\u52A0\u6570\u636E\u6E90" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u6570\u636E\u6E90\u4FDD\u5B58\u5728\u672C\u673A\u6570\u636E\u5E93\uFF0C\u901A\u8FC7 engine + \u975E\u654F\u611F\u914D\u7F6E\u63CF\u8FF0\uFF0C\u4E0D\u9700\u8981\u4FEE\u6539\u5E94\u7528\u4EE3\u7801\u3002 \u51ED\u636E\u4E0D\u8981\u5199\u5165\u914D\u7F6E\uFF1B\u767B\u5F55\u6216\u51ED\u636E\u4F1A\u8FDB\u5165\u7CFB\u7EDF\u51ED\u636E\u5E93\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6765\u6E90 ID\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: sourceId,
              onChange: (event) => setSourceId(event.target.value),
              placeholder: "my-source"
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5F15\u64CE", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "select",
            {
              value: engine,
              onChange: (event) => {
                const nextId = event.target.value;
                const next = data.engines.find((entry) => entry.id === nextId);
                setEngine(nextId);
                const nextAuth = next?.authKinds ? next.authKinds[0] ?? "none" : "token";
                const nextLogin = next?.loginModes ? next.loginModes[0] ?? "none" : "browser";
                setAuthKind(nextAuth);
                setLoginMode(nextAuth === "none" ? "none" : nextLogin);
              },
              required: true,
              children: data.engines.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: entry.id, children: [
                entry.displayName,
                "\uFF08",
                entry.id,
                "\uFF09"
              ] }, entry.id))
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u663E\u793A\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: displayName,
              onChange: (event) => setDisplayName(event.target.value),
              required: true
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BA4\u8BC1\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "select",
            {
              value: authKind,
              onChange: (event) => {
                const next = event.target.value;
                setAuthKind(next);
                if (next === "none") {
                  setLoginMode("none");
                } else if (loginMode === "none" && loginModes[0]) {
                  setLoginMode(loginModes[0]);
                }
              },
              children: authKinds.map((kind) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: kind, children: kind }, kind))
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u767B\u5F55\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "select",
            {
              value: loginDisabled ? "none" : loginMode,
              onChange: (event) => setLoginMode(event.target.value),
              disabled: loginDisabled,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "none", children: "\u4E0D\u767B\u5F55" }),
                loginModes.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: mode, children: mode }, mode))
              ]
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u80FD\u529B\uFF08\u9017\u53F7\u5206\u9694\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              value: capabilities,
              onChange: (event) => setCapabilities(event.target.value),
              placeholder: "academic.sync"
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "ac-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: "\u9AD8\u7EA7\u8BBE\u7F6E" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            Field,
            {
              label: "\u975E\u654F\u611F\u914D\u7F6E\uFF08JSON\uFF09",
              hint: "URL\u3001\u9009\u62E9\u5668\u3001\u89C4\u5219\u7B49\uFF1B\u7981\u6B62 password/token/cookie \u5B57\u6BB5",
              children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "textarea",
                {
                  rows: 6,
                  value: configJson,
                  onChange: (event) => setConfigJson(event.target.value),
                  spellCheck: false
                }
              )
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "submit", className: "ac-button", disabled: action.pending !== void 0, children: action.pending === "source" ? "\u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA\u6570\u636E\u6E90" }) }),
        action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) })
      ]
    }
  );
}
var CANDIDATE_STAGE_LABELS = {
  schema: "Schema",
  contract: "\u5B57\u6BB5\u4E0E\u8BF7\u6C42\u5951\u7EA6",
  permissions: "\u8BBF\u95EE\u8303\u56F4",
  "sample-replay": "\u6837\u672C\u56DE\u653E"
};
var CANDIDATE_STATUS_LABELS = {
  candidate: "\u5F85\u9A8C\u8BC1",
  validated: "\u5DF2\u9A8C\u8BC1",
  revoked: "\u5DF2\u64A4\u9500"
};
function CandidateFileInput({
  label,
  onLoad
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label, hint: "\u4EC5\u5728\u672C\u673A\u8BFB\u53D6\uFF0C\u4E0D\u4E0A\u4F20", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "input",
    {
      type: "file",
      accept: ".json,application/json",
      onChange: (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void file.text().then(onLoad);
      }
    }
  ) });
}
function CandidatePanel({
  ctx,
  active,
  onChanged
}) {
  const load = (0, import_react6.useCallback)(
    (signal) => callApi(ctx, "adapterCandidates", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active);
  const action = useAction(async () => {
    await refresh();
    await onChanged();
  });
  const [manifestJson, setManifestJson] = (0, import_react6.useState)("");
  const [samplesJson, setSamplesJson] = (0, import_react6.useState)("[]");
  const [report, setReport] = (0, import_react6.useState)();
  const [message, setMessage] = (0, import_react6.useState)();
  const parseInput = () => {
    try {
      const manifest = JSON.parse(manifestJson);
      const samples = JSON.parse(samplesJson);
      if (!Array.isArray(samples) || samples.length === 0) {
        throw new Error("\u6837\u672C\u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4");
      }
      return {
        manifest,
        samples
      };
    } catch (error) {
      setMessage(`JSON \u65E0\u6548\uFF1A${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  };
  const validate = async () => {
    const input = parseInput();
    if (!input) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u8BF7\u68C0\u67E5 Manifest \u4E0E\u6837\u672C JSON" }
      };
    }
    const result = await callApi(
      ctx,
      "validateAdapterCandidate",
      input
    );
    if (result.ok) setReport(result.value.report);
    return result;
  };
  const register = async () => {
    const input = parseInput();
    if (!input) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u8BF7\u68C0\u67E5 Manifest \u4E0E\u6837\u672C JSON" }
      };
    }
    const result = await callApi(
      ctx,
      "registerAdapterCandidate",
      input
    );
    if (result.ok) setReport(result.value.report);
    return result;
  };
  const data = state.data;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    Section,
    {
      title: "Adapter \u5019\u9009",
      subtitle: "Agent \u8D1F\u8D23\u751F\u6210\uFF1B\u9A8C\u8BC1\u3001\u542F\u7528\u4E0E\u56DE\u6EDA\u7531\u7528\u6237\u5728\u6B64\u786E\u8BA4",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: "ac-muted", children: [
          "\u5728 DSH \u5BF9\u8BDD\u4E2D\u8BA9 Agent \u8C03\u7528 ",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { children: "academic_probe_source" }),
          " ",
          "\u8BFB\u53D6\u5DF2\u767B\u5F55\u9875\u9762\u7684\u8131\u654F\u8BC1\u636E\uFF0C\u518D\u751F\u6210 Manifest \u4E0E\u663E\u5F0F\u6837\u672C\u3002\u5019\u9009\u53EA\u6709\u901A\u8FC7\u79BB\u7EBF\u56DE\u653E\u624D\u80FD\u542F\u7528\uFF1B \u542F\u7528\u540E\u4F1A\u81EA\u52A8\u521B\u5EFA\u6216\u66F4\u65B0\u53EF\u540C\u6B65\u7684 declarative \u6570\u636E\u6E90\u3002"
        ] }),
        data?.candidates.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-list", children: data.candidates.map((candidate) => {
          const activeVersion = data.active.find(
            (entry) => entry.adapterId === candidate.adapterId
          )?.active;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "ac-list-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
                candidate.displayName,
                " \xB7 ",
                candidate.adapterId,
                "@",
                candidate.version
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
                CANDIDATE_STATUS_LABELS[candidate.status] ?? candidate.status,
                activeVersion === candidate.version ? " \xB7 \u5F53\u524D\u542F\u7528" : "",
                " \xB7 \u66F4\u65B0\u4E8E",
                " ",
                candidate.updatedAt
              ] }),
              candidate.scope && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
                  "\u5141\u8BB8\u4E3B\u673A\uFF1A",
                  candidate.scope.allowedOrigins.join("\u3001"),
                  " \xB7 \u8DEF\u5F84\uFF1A",
                  candidate.scope.allowedPathPrefixes.join("\u3001")
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
                  "\u6570\u636E\u7C7B\u578B\uFF1A",
                  candidate.scope.dataTypes.join(" / "),
                  "\uFF1B\u5B57\u6BB5\uFF1A",
                  Object.entries(candidate.scope.fields).map(([name2, fields]) => `${name2}[${fields.join(", ")}]`).join("\uFF1B")
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-source-actions", children: [
              candidate.status === "validated" && activeVersion !== candidate.version && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                ConfirmAction,
                {
                  label: "\u542F\u7528",
                  confirmLabel: "\u786E\u8BA4\u542F\u7528",
                  disabled: action.pending !== void 0,
                  onConfirm: () => void action.run(
                    `activate-${candidate.adapterId}-${candidate.version}`,
                    () => callApi(
                      ctx,
                      "activateAdapterCandidate",
                      {
                        adapterId: candidate.adapterId,
                        version: candidate.version
                      }
                    ),
                    "\u5019\u9009\u5DF2\u542F\u7528"
                  ).then(() => refresh())
                }
              ),
              activeVersion === candidate.version && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                ConfirmAction,
                {
                  label: "\u56DE\u6EDA",
                  confirmLabel: "\u786E\u8BA4\u56DE\u6EDA",
                  disabled: action.pending !== void 0,
                  onConfirm: () => void action.run(
                    `rollback-${candidate.adapterId}`,
                    () => callApi(
                      ctx,
                      "rollbackAdapterCandidate",
                      { adapterId: candidate.adapterId }
                    ),
                    "\u5DF2\u56DE\u6EDA\u5230\u4E0A\u4E00\u4E2A\u5DF2\u9A8C\u8BC1\u7248\u672C"
                  )
                }
              )
            ] })
          ] }, `${candidate.adapterId}@${candidate.version}`);
        }) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u5019\u9009\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "ac-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: "\u5BFC\u5165\u5019\u9009\uFF08Manifest + \u79BB\u7EBF\u6837\u672C\uFF09" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u79BB\u7EBF\u9A8C\u8BC1\u53EA\u56DE\u653E\u672C\u5730\u6837\u672C\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u8FDE\u63A5\u3001\u542F\u7528\u6216\u540C\u6B65\u5DF2\u7ECF\u901A\u8FC7\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CandidateFileInput, { label: "\u4ECE\u6587\u4EF6\u8BFB\u53D6 Manifest", onLoad: setManifestJson }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CandidateFileInput, { label: "\u4ECE\u6587\u4EF6\u8BFB\u53D6\u6837\u672C", onLoad: setSamplesJson }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "Manifest JSON", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "textarea",
            {
              rows: 8,
              value: manifestJson,
              onChange: (event) => setManifestJson(event.target.value),
              spellCheck: false,
              placeholder: '{"schemaVersion":1,...}'
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            Field,
            {
              label: "\u6837\u672C JSON",
              hint: '[{"url":"https://...","body":"...","contentType":"text/html"}]',
              children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "textarea",
                {
                  rows: 6,
                  value: samplesJson,
                  onChange: (event) => setSamplesJson(event.target.value),
                  spellCheck: false
                }
              )
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: "ac-button",
                disabled: action.pending !== void 0,
                onClick: () => void action.run("validate-candidate", validate, "\u9A8C\u8BC1\u5B8C\u6210"),
                children: action.pending === "validate-candidate" ? "\u9A8C\u8BC1\u4E2D\u2026" : "\u79BB\u7EBF\u9A8C\u8BC1"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: "ac-button",
                disabled: action.pending !== void 0 || !report?.ok,
                onClick: () => void action.run("register-candidate", register, "\u5019\u9009\u5DF2\u4FDD\u5B58"),
                children: action.pending === "register-candidate" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5019\u9009"
              }
            )
          ] })
        ] }),
        report && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-secret-form", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: report.ok ? "ac-muted" : "ac-text-bad", children: [
            "\u6837\u672C\u56DE\u653E",
            report.ok ? "\u901A\u8FC7" : "\u5931\u8D25",
            "\uFF08\u672A\u505A\u771F\u5B9E\u540C\u6B65\uFF09\uFF1A\u8BFE\u7A0B",
            " ",
            report.courses.length,
            " \xB7 \u4E8B\u9879 ",
            report.items.length
          ] }),
          report.checks?.map((check) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: check.ok ? "ac-muted" : "ac-text-bad", children: [
            CANDIDATE_STAGE_LABELS[check.stage],
            "\uFF1A",
            check.ok ? "\u901A\u8FC7" : "\u5931\u8D25",
            !check.ok && check.detail ? ` \u2014 ${check.detail}` : ""
          ] }, check.stage)),
          report.errors.map((error) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-bad", children: error }, error)),
          report.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-warn", children: warning }, warning))
        ] }),
        action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
        message && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-bad", children: message })
      ]
    }
  );
}
function ConnectionsPage({ ctx, active }) {
  const load = (0, import_react6.useCallback)(
    (signal) => callApi(ctx, "connections", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active);
  const action = useAction(refresh);
  const data = state.data;
  const view = viewState(state);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [courseTerm, setCourseTerm] = (0, import_react6.useState)("");
  const [courseCode, setCourseCode] = (0, import_react6.useState)("");
  const [courseTitle, setCourseTitle] = (0, import_react6.useState)("");
  const addCourse = async () => {
    if (!courseTerm.trim() || !courseCode.trim() || !courseTitle.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u8BF7\u586B\u5199\u5B66\u671F\u3001\u8BFE\u7A0B\u4EE3\u7801\u548C\u8BFE\u7A0B\u540D\u79F0" }
      };
    }
    return callApi(ctx, "addCourse", {
      termId: courseTerm.trim(),
      code: courseCode.trim(),
      title: courseTitle.trim()
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh()
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u6570\u636E\u6E90\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Section,
        {
          title: "\u6DFB\u52A0\u5E73\u53F0",
          subtitle: "\u5148\u914D\u7F6E\u5E73\u53F0\u94FE\u63A5\u5E76\u5B8C\u6210\u767B\u5F55\uFF1B\u540E\u7EED\u9A8C\u8BC1\u3001\u9884\u89C8\u548C\u540C\u6B65\u90FD\u4EE5\u8FD9\u91CC\u4E3A\u5165\u53E3",
          children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(QuickAdd, { ctx, data, onCreated: refresh })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        Section,
        {
          title: "\u6570\u636E\u6E90",
          subtitle: "\u6570\u636E\u5E93\u4E2D\u7684 source \u914D\u7F6E + \u901A\u7528 engine\uFF1B\u51ED\u636E\u4E0E\u72B6\u6001\u5206\u5F00\u4FDD\u5B58",
          children: [
            data.sources.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u6570\u636E\u6E90", children: "\u5728\u4E0A\u65B9\u586B\u5199\u5E73\u53F0\u7F51\u5740\u6DFB\u52A0\u6570\u636E\u6E90\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-source-grid", children: [...data.sources].sort(
              (left, right) => Number(left.configuration === "archived") - Number(right.configuration === "archived")
            ).map((source) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              SourceCard,
              {
                ctx,
                source,
                engines: data.engines,
                timeZone,
                refresh
              },
              source.sourceId
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "ac-advanced", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: "\u9AD8\u7EA7\uFF1A\u624B\u52A8\u914D\u7F6E Engine \u4E0E JSON" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SourceForm, { ctx, data, onCreated: refresh })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Section, { title: "\u8BFE\u7A0B", subtitle: "\u8BFE\u7A0B\u8EAB\u4EFD\u4E0E\u5916\u90E8\u6765\u6E90\u5206\u5F00\u4FDD\u5B58", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "form",
          {
            className: "ac-form-card",
            onSubmit: (event) => {
              event.preventDefault();
              void action.run(
                "course",
                addCourse,
                "\u8BFE\u7A0B\u5DF2\u6DFB\u52A0\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u521B\u5EFA\u6765\u6E90\u4E8B\u9879"
              ).then((ok) => {
                if (ok) {
                  setCourseTerm("");
                  setCourseCode("");
                  setCourseTitle("");
                }
              });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: "\u6DFB\u52A0\u8BFE\u7A0B" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5B66\u671F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    value: courseTerm,
                    onChange: (event) => setCourseTerm(event.target.value),
                    placeholder: "2026-fall",
                    required: true
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BFE\u7A0B\u4EE3\u7801", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    value: courseCode,
                    onChange: (event) => setCourseCode(event.target.value),
                    placeholder: "CS101",
                    required: true
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BFE\u7A0B\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    value: courseTitle,
                    onChange: (event) => setCourseTitle(event.target.value),
                    required: true
                  }
                ) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "submit", className: "ac-button", disabled: action.pending !== void 0, children: "\u6DFB\u52A0\u8BFE\u7A0B" }) })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          CourseTable,
          {
            ctx,
            courses: data.courses,
            timeZone,
            onChanged: refresh
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CandidatePanel, { ctx, active, onChanged: refresh }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(WebSessionPanel, { ctx }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Section, { title: "\u540C\u6B65\u8BB0\u5F55", subtitle: "\u5931\u8D25\u4E0D\u4F1A\u6E05\u7A7A\u5DF2\u6709\u5B66\u4E1A\u6570\u636E", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SyncRunTable, { runs: data.syncRuns, timeZone }) })
    ] })
  ] });
}
function CourseRow({
  ctx,
  course,
  timeZone,
  onChanged
}) {
  const action = useAction(async () => {
    await onChanged();
  });
  const [editing, setEditing] = (0, import_react6.useState)(false);
  const [termId, setTermId] = (0, import_react6.useState)(course.termId);
  const [code, setCode] = (0, import_react6.useState)(course.code);
  const [title, setTitle] = (0, import_react6.useState)(course.title);
  const save = async () => {
    if (!termId.trim() || !code.trim() || !title.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u5B66\u671F\u3001\u8BFE\u7A0B\u4EE3\u7801\u548C\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" }
      };
    }
    return callApi(ctx, "updateCourse", {
      id: course.courseId,
      termId: termId.trim(),
      code: code.trim(),
      title: title.trim()
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "ac-list-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-task-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
          course.code,
          " ",
          course.title
        ] }),
        course.deleted ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: "bad", children: "\u5DF2\u5220\u9664" }) : course.archived ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: "neutral", children: "\u5DF2\u5F52\u6863" }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
        course.termId,
        " \xB7 \u66F4\u65B0\u4E8E ",
        formatDateTimeOrDash(course.updatedAt, timeZone)
      ] }),
      editing && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5B66\u671F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { value: termId, onChange: (event) => setTermId(event.target.value) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BFE\u7A0B\u4EE3\u7801", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { value: code, onChange: (event) => setCode(event.target.value) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8BFE\u7A0B\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { value: title, onChange: (event) => setTitle(event.target.value) }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-source-actions", children: editing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button ac-button-primary",
          disabled: action.pending !== void 0,
          onClick: () => void action.run("course-update", save, "\u8BFE\u7A0B\u4FE1\u606F\u5DF2\u66F4\u65B0").then((ok) => {
            if (ok) setEditing(false);
          }),
          children: "\u4FDD\u5B58"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "ac-button", onClick: () => setEditing(false), children: "\u53D6\u6D88" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      !course.deleted && !course.archived && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "ac-button", onClick: () => setEditing(true), children: "\u7F16\u8F91" }),
      !course.deleted && !course.archived && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5F52\u6863\u8BFE\u7A0B",
          confirmLabel: "\u786E\u8BA4\u5F52\u6863",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "course-archive",
            () => callApi(ctx, "archiveCourse", {
              id: course.courseId
            }),
            "\u8BFE\u7A0B\u5DF2\u5F52\u6863\uFF1B\u53EF\u968F\u65F6\u6062\u590D"
          )
        }
      ),
      !course.deleted && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ConfirmAction,
        {
          label: "\u5220\u9664\u8BFE\u7A0B",
          confirmLabel: "\u786E\u8BA4\u5220\u9664\u8BFE\u7A0B",
          disabled: action.pending !== void 0,
          onConfirm: () => void action.run(
            "course-delete",
            () => callApi(ctx, "deleteCourse", {
              id: course.courseId
            }),
            "\u8BFE\u7A0B\u5DF2\u5220\u9664\uFF1B\u5173\u8054\u4E8B\u9879\u4E0E\u4EFB\u52A1\u5DF2\u5F52\u6863\uFF0C\u53EF\u5206\u522B\u6062\u590D"
          )
        }
      ),
      (course.archived || course.deleted) && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          className: "ac-button",
          disabled: action.pending !== void 0,
          onClick: () => void action.run(
            "course-restore",
            () => callApi(ctx, "restoreCourse", {
              id: course.courseId
            }),
            "\u8BFE\u7A0B\u5DF2\u6062\u590D\uFF1B\u5DF2\u5F52\u6863\u7684\u4E8B\u9879\u548C\u4EFB\u52A1\u9700\u8981\u5355\u72EC\u6062\u590D"
          ),
          children: "\u6062\u590D\u8BFE\u7A0B"
        }
      )
    ] }) })
  ] });
}
function CourseTable({
  ctx,
  courses,
  timeZone,
  onChanged
}) {
  if (courses.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-list", children: courses.map((course) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    CourseRow,
    {
      ctx,
      course,
      timeZone,
      onChanged
    },
    course.courseId
  )) });
}
function SyncRunTable({ runs, timeZone }) {
  if (runs.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u540C\u6B65\u8BB0\u5F55", children: "\u624B\u52A8\u6216\u5B9A\u65F6\u540C\u6B65\u540E\u4F1A\u663E\u793A\u7ED3\u679C\u3002" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("table", { className: "ac-table", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u65F6\u95F4" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u6765\u6E90" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u72B6\u6001" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u6293\u53D6 / \u65B0\u589E / \u66F4\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("th", { children: "\u9519\u8BEF" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("tbody", { children: runs.map((run) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("tr", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: formatDateTimeOrDash(run.finishedAt ?? run.startedAt, timeZone) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: run.sourceId }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: run.status === "success" ? "ok" : run.status === "failed" || run.status === "auth-required" ? "bad" : "warn", children: syncStatusLabel(run.status) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("td", { children: [
        run.itemsSeen,
        " / ",
        run.created,
        " / ",
        run.updated
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("td", { children: run.errorMessage ?? "\u2014" })
    ] }, run.runId)) })
  ] }) });
}
function WebSessionPanel({ ctx }) {
  const load = (0, import_react6.useCallback)(
    (signal) => callApi(ctx, "webSessions", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, true);
  const action = useAction(refresh);
  const [url, setUrl] = (0, import_react6.useState)("");
  const [label, setLabel] = (0, import_react6.useState)("");
  const login = async () => {
    if (!url.trim()) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "\u8BF7\u586B\u5199\u7F51\u7AD9 URL" }
      };
    }
    return callApi(ctx, "webLogin", {
      url: url.trim(),
      ...label.trim() ? { label: label.trim() } : {}
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    Section,
    {
      title: "\u7F51\u7AD9\u767B\u5F55\uFF08\u901A\u7528\u4F1A\u8BDD\uFF09",
      subtitle: "\u586B URL \u2192 \u62C9\u8D77\u6D4F\u89C8\u5668\u767B\u5F55 \u2192 Cookie \u52A0\u5BC6\u4FDD\u5B58\uFF1BAgent/\u811A\u672C\u5E26\u4F1A\u8BDD\u8BBF\u95EE\uFF0C\u4E0D\u66B4\u9732 Cookie",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "form",
          {
            className: "ac-form-card",
            onSubmit: (event) => {
              event.preventDefault();
              void action.run("web-login", login, "\u767B\u5F55\u6210\u529F\uFF0C\u4F1A\u8BDD\u5DF2\u4FDD\u5B58").then((ok) => {
                if (ok) {
                  setUrl("");
                  setLabel("");
                }
              });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "ac-form-grid", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u7F51\u7AD9 URL", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    value: url,
                    onChange: (event) => setUrl(event.target.value),
                    placeholder: "https://example.com/",
                    required: true
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u6807\u7B7E\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    value: label,
                    onChange: (event) => setLabel(event.target.value),
                    placeholder: "\u4F8B\u5982\uFF1A\u8BFE\u7A0B\u7F51\u7AD9"
                  }
                ) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-muted", children: "\u767B\u5F55\u7A97\u53E3\u91CC\u4F1A\u663E\u793A\u201C\u5B8C\u6210\u767B\u5F55\u201D\u6309\u94AE\uFF1B\u767B\u5F55\u5B8C\u6210\u540E\u70B9\u51FB\u5B83\uFF0C\u5E94\u7528\u53EA\u4FDD\u5B58\u8BE5\u57DF\u540D\u4E0B\u7684 Cookie\u3002" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "submit", className: "ac-button ac-button-primary", disabled: action.pending !== void 0, children: action.pending === "web-login" ? "\u7B49\u5F85\u767B\u5F55\u7A97\u53E3\u2026" : "\u767B\u5F55\u5E76\u4FDD\u5B58" }) }),
              action.notice && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) })
            ]
          }
        ),
        state.loading && !state.data && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u7F51\u7AD9\u4F1A\u8BDD\u2026" }),
        state.failure && !state.data && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "ac-text-bad", children: state.failure.message }),
        state.data && state.data.sessions.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u7F51\u7AD9\u4F1A\u8BDD", children: "\u586B\u5199 URL \u5E76\u5B8C\u6210\u767B\u5F55\u540E\uFF0C\u4F1A\u8BDD\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }),
        state.data && state.data.sessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "ac-list", children: state.data.sessions.map((session) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { className: "ac-list-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: session.label ?? session.domain }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
              session.domain,
              " \xB7 ",
              session.loginUrl
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ac-muted", children: [
              "\u6700\u8FD1\u4F7F\u7528\uFF1A",
              formatDateTimeOrDash(session.lastUsedAt, "UTC")
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            ConfirmAction,
            {
              label: "\u5220\u9664\u4F1A\u8BDD",
              confirmLabel: "\u786E\u8BA4\u5220\u9664",
              disabled: action.pending !== void 0,
              onConfirm: () => void action.run(
                "web-delete",
                () => callApi(ctx, "webDelete", {
                  sessionId: session.sessionId
                }),
                "\u7F51\u7AD9\u4F1A\u8BDD\u5DF2\u5220\u9664"
              )
            }
          )
        ] }, session.sessionId)) })
      ]
    }
  );
}

// packages/academic-dsh-ui/src/client/pages/AutomationPage.tsx
var import_react7 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function AutomationPage({ ctx, active }) {
  const load = (0, import_react7.useCallback)(
    (signal) => callApi(ctx, "automation", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active, 3e4);
  const action = useAction(refresh);
  const data = state.data;
  const view = viewState(state);
  const timeZone = data?.timeZone ?? "UTC";
  const [thresholds, setThresholds] = (0, import_react7.useState)("");
  const toggleJob = async (job) => callApi(ctx, "setJobEnabled", {
    jobId: job.jobId,
    enabled: !job.enabled
  });
  const syncNow = async () => {
    const result = await callApi(ctx, "syncNow", {});
    if (!result.ok) return result;
    if (result.value.status === "success" || result.value.status === "partial") {
      return result;
    }
    return {
      ok: false,
      error: {
        code: result.value.status === "auth-required" ? "AUTH_REQUIRED" : "ERROR",
        message: result.value.errorMessage ?? `\u540C\u6B65\u672A\u6210\u529F\uFF1A${syncStatusLabel(result.value.status)}\uFF1B\u65E7\u6570\u636E\u5DF2\u4FDD\u7559`
      }
    };
  };
  const saveThresholds = async () => {
    const input = thresholds.trim() || data?.reminderSettings.thresholdsHours.join(",") || "";
    const values = input.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
    if (values.length === 0 || values.some((value) => value < 1 || value > 720)) {
      action.setNotice({ tone: "error", text: "\u63D0\u9192\u9608\u503C\u9700\u8981\u662F 1\u2013720 \u5C0F\u65F6\u7684\u6574\u6570" });
      return;
    }
    if (new Set(values).size !== values.length) {
      action.setNotice({ tone: "error", text: "\u63D0\u9192\u9608\u503C\u4E0D\u80FD\u91CD\u590D" });
      return;
    }
    await action.run(
      "thresholds",
      () => callApi(ctx, "updateReminderSettings", {
        thresholdsHours: values.map((value) => Math.round(value))
      }),
      "\u63D0\u9192\u9608\u503C\u5DF2\u4FDD\u5B58"
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh()
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u81EA\u52A8\u5316\u72B6\u6001\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-inline-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Badge, { tone: data.projection.consistent ? "ok" : "warn", children: data.projection.consistent ? "\u6838\u5FC3\u6295\u5F71\u4E00\u81F4" : "\u6295\u5F71\u843D\u540E" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "ac-muted", children: [
            "\u4E8B\u4EF6\u4F4D\u7F6E ",
            data.projection.eventPosition,
            " \xB7 \u6295\u5F71\u4F4D\u7F6E",
            " ",
            data.projection.projectionPosition,
            " \xB7 \u5F85\u5904\u7406",
            " ",
            data.projection.pendingEvents
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-inline-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              disabled: action.pending !== void 0,
              onClick: () => void action.run("sync", syncNow, "\u540C\u6B65\u5B8C\u6210"),
              children: action.pending === "sync" ? "\u540C\u6B65\u4E2D\u2026" : "\u7ACB\u5373\u540C\u6B65"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "ac-button", onClick: () => void refresh(), children: "\u5237\u65B0" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Section, { title: "\u81EA\u52A8\u5316\u4EFB\u52A1", subtitle: "\u6682\u505C\u540E\u65E2\u6709\u5B66\u4E1A\u6570\u636E\u4ECD\u53EF\u67E5\u8BE2", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "ac-source-grid", children: data.jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { className: "ac-card ac-job-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-task-title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: jobLabel(job.jobId) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Badge, { tone: job.enabled ? "ok" : "warn", children: job.enabled ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u6682\u505C" }),
            job.consecutiveFailures > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Badge, { tone: "bad", children: [
              "\u8FDE\u7EED\u5931\u8D25 ",
              job.consecutiveFailures,
              " \u6B21"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-task-meta", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
              "\u4EFB\u52A1 ID\uFF1A",
              job.jobId
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
              "\u5468\u671F\uFF1A",
              job.intervalMinutes,
              " \u5206\u949F"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
              "\u4E0B\u6B21\u6267\u884C\uFF1A",
              formatDateTimeOrDash(job.nextRunAt, timeZone)
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            disabled: action.pending !== void 0,
            onClick: () => void action.run(job.jobId, () => toggleJob(job), job.enabled ? "\u5DF2\u6682\u505C" : "\u5DF2\u6062\u590D"),
            children: job.enabled ? "\u6682\u505C" : "\u6062\u590D"
          }
        )
      ] }, job.jobId)) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Section, { title: "\u63D0\u9192\u8BBE\u7F6E", subtitle: "\u53EA\u53D1\u9001\u5F53\u524D\u6700\u7D27\u6025\u7684\u4E00\u6863\uFF1B\u626B\u63CF\u5728\u542F\u52A8\u65F6\u8865\u507F", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-form-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "ac-inline-bar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Badge, { tone: data.reminderSettings.enabled ? "ok" : "warn", children: data.reminderSettings.enabled ? "\u63D0\u9192\u5DF2\u542F\u7528" : "\u63D0\u9192\u5DF2\u5173\u95ED" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "ac-muted", children: [
              "\u5F53\u524D\u9608\u503C\uFF1A",
              data.reminderSettings.thresholdsHours.slice().sort((a, b) => b - a).map((hours) => `${hours}h`).join(" / ")
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              disabled: action.pending !== void 0,
              onClick: () => void action.run(
                "reminder-toggle",
                () => callApi(ctx, "updateReminderSettings", {
                  enabled: !data.reminderSettings.enabled
                }),
                data.reminderSettings.enabled ? "\u63D0\u9192\u5DF2\u5173\u95ED" : "\u63D0\u9192\u5DF2\u542F\u7528"
              ),
              children: data.reminderSettings.enabled ? "\u5173\u95ED\u63D0\u9192" : "\u542F\u7528\u63D0\u9192"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ac-form-grid", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u9608\u503C\uFF08\u5C0F\u65F6\uFF0C\u9017\u53F7\u5206\u9694\uFF09", hint: "\u9ED8\u8BA4 72,24\uFF1B\u6BCF\u4E2A\u4E8B\u9879\u6700\u591A\u53D1\u9001\u5F53\u524D\u6700\u7D27\u6025\u7684\u4E00\u6863\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            value: thresholds,
            onChange: (event) => setThresholds(event.target.value),
            placeholder: data.reminderSettings.thresholdsHours.join(",")
          }
        ) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            disabled: action.pending !== void 0,
            onClick: () => void saveThresholds(),
            children: "\u4FDD\u5B58\u9608\u503C"
          }
        ) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        Section,
        {
          title: "\u901A\u77E5",
          subtitle: `\u672A\u8BFB ${data.unread} \u6761`,
          actions: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "ac-button",
              disabled: data.unread === 0 || action.pending !== void 0,
              onClick: () => void action.run(
                "read-all",
                () => callApi(ctx, "markAllNotificationsRead", {}),
                "\u5168\u90E8\u63D0\u9192\u5DF2\u6807\u8BB0\u4E3A\u5DF2\u8BFB"
              ),
              children: "\u5168\u90E8\u5DF2\u8BFB"
            }
          ),
          children: data.notifications.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u63D0\u9192", children: "\u622A\u6B62\u63D0\u9192\u7531\u6301\u4E45\u5316\u626B\u63CF\u4F5C\u4E1A\u751F\u6210\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "ac-list", children: data.notifications.map((notification) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "li",
            {
              className: `ac-list-row${notification.readAt ? "" : " ac-unread"}`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: notification.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ac-muted", children: notification.body }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "ac-muted", children: formatDateTimeOrDash(notification.createdAt, timeZone) })
                ] }),
                !notification.readAt && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "ac-button",
                    disabled: action.pending !== void 0,
                    onClick: () => void action.run(
                      notification.notificationId,
                      () => callApi(ctx, "markNotificationRead", {
                        notificationId: notification.notificationId
                      }),
                      "\u63D0\u9192\u5DF2\u6807\u8BB0\u4E3A\u5DF2\u8BFB"
                    ),
                    children: "\u6807\u8BB0\u5DF2\u8BFB"
                  }
                )
              ]
            },
            notification.notificationId
          )) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Section, { title: "\u81EA\u52A8\u5316\u8FD0\u884C\u8BB0\u5F55", subtitle: "\u6700\u8FD1 5 \u6B21\u4F5C\u4E1A\u8FD0\u884C", children: data.jobRuns.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u8FD0\u884C\u8BB0\u5F55" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ac-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ac-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5F00\u59CB" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u4EFB\u52A1" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u5C1D\u8BD5" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u9519\u8BEF" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: data.jobRuns.map((run) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: formatDateTimeOrDash(run.startedAt, timeZone) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: jobLabel(run.jobId) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            Badge,
            {
              tone: run.status === "succeeded" ? "ok" : run.status === "failed" || run.status === "interrupted" ? "bad" : "warn",
              children: runStatusLabel(run.status)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: run.attempt }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: run.errorMessage ?? "\u2014" })
        ] }, run.runId)) })
      ] }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Section, { title: "\u6570\u636E\u6E90\u540C\u6B65\u8BB0\u5F55", subtitle: "\u5931\u8D25\u65F6\u4FDD\u7559\u6700\u540E\u4E00\u6B21\u6709\u6548\u6570\u636E", children: data.syncRuns.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u540C\u6B65\u8BB0\u5F55" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "ac-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "ac-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u65F6\u95F4" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6765\u6E90" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6293\u53D6 / \u65B0\u589E / \u66F4\u65B0" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u9519\u8BEF" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: data.syncRuns.map((run) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: formatDateTimeOrDash(run.finishedAt ?? run.startedAt, timeZone) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: run.sourceId }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            Badge,
            {
              tone: run.status === "success" ? "ok" : run.status === "failed" || run.status === "auth-required" ? "bad" : "warn",
              children: syncStatusLabel(run.status)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { children: [
            run.itemsSeen,
            " / ",
            run.created,
            " / ",
            run.updated
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: run.errorMessage ?? "\u2014" })
        ] }, run.runId)) })
      ] }) }) })
    ] })
  ] });
}

// packages/academic-dsh-ui/src/client/pages/SettingsPage.tsx
var import_react8 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
var WEEKDAYS = [
  { value: 1, label: "\u5468\u4E00" },
  { value: 2, label: "\u5468\u4E8C" },
  { value: 3, label: "\u5468\u4E09" },
  { value: 4, label: "\u5468\u56DB" },
  { value: 5, label: "\u5468\u4E94" },
  { value: 6, label: "\u5468\u516D" },
  { value: 0, label: "\u5468\u65E5" }
];
var temporarySequence = 0;
function newTemporaryBlock(start, end, title) {
  temporarySequence += 1;
  return {
    id: `temp-${Date.now()}-${temporarySequence}`,
    start,
    end,
    ...title ? { title } : {}
  };
}
function SettingsPage({ ctx, active, onNavigate }) {
  const load = (0, import_react8.useCallback)(
    (signal) => callApi(ctx, "settings", {}, signal),
    [ctx]
  );
  const { state, refresh } = useLoad(load, active);
  const action = useAction(refresh);
  const data = state.data;
  const view = viewState(state);
  const initialized = (0, import_react8.useRef)(false);
  const [timeZone, setTimeZone] = (0, import_react8.useState)("");
  const [granularity, setGranularity] = (0, import_react8.useState)("15");
  const [slots, setSlots] = (0, import_react8.useState)([]);
  const [blocks, setBlocks] = (0, import_react8.useState)([]);
  const [blockStart, setBlockStart] = (0, import_react8.useState)("");
  const [blockEnd, setBlockEnd] = (0, import_react8.useState)("");
  const [blockTitle, setBlockTitle] = (0, import_react8.useState)("");
  const [interval, setIntervalMinutes] = (0, import_react8.useState)("60");
  const [coursePriorities, setCoursePriorities] = (0, import_react8.useState)({});
  const [agentAdapterAutomation, setAgentAdapterAutomation] = (0, import_react8.useState)(false);
  const [dirty, setDirty] = (0, import_react8.useState)(false);
  (0, import_react8.useEffect)(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setTimeZone(data.availability.timeZone);
    setGranularity(String(data.availability.granularityMinutes));
    setSlots(data.availability.weeklySlots.map((slot) => ({ ...slot })));
    setBlocks(data.availability.temporaryBlocks.map((block) => ({ ...block })));
    setIntervalMinutes(String(data.sync.intervalMinutes));
    setCoursePriorities({ ...data.preferences.coursePriorities });
    setAgentAdapterAutomation(data.preferences.agentAdapterAutomation);
  }, [data]);
  const saveAvailability = async () => {
    const minutes = Number(granularity);
    if (!timeZone.trim()) {
      return { ok: false, error: { code: "VALIDATION", message: "\u8BF7\u586B\u5199 IANA \u65F6\u533A" } };
    }
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 60) {
      return { ok: false, error: { code: "VALIDATION", message: "\u8BA1\u5212\u7C92\u5EA6\u9700\u8981\u662F 5\u201360 \u5206\u949F" } };
    }
    const result = await callApi(ctx, "updateAvailability", {
      timeZone: timeZone.trim(),
      granularityMinutes: Math.round(minutes),
      weeklySlots: slots,
      temporaryBlocks: blocks
    });
    if (result.ok) setDirty(false);
    return result;
  };
  const saveInterval = async () => {
    const minutes = Number(interval);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) {
      return { ok: false, error: { code: "VALIDATION", message: "\u540C\u6B65\u5468\u671F\u9700\u8981\u662F 1\u201310080 \u5206\u949F" } };
    }
    return callApi(ctx, "updateSyncSchedule", {
      intervalMinutes: Math.round(minutes)
    });
  };
  const savePreferences = async () => callApi(ctx, "updatePreferences", {
    coursePriorities,
    agentAdapterAutomation
  });
  const addTemporary = () => {
    const start = fromLocalInputValue(blockStart);
    const end = fromLocalInputValue(blockEnd);
    if (!start || !end || Date.parse(end) <= Date.parse(start)) {
      action.setNotice({ tone: "error", text: "\u8BF7\u586B\u5199\u6709\u6548\u7684\u4E34\u65F6\u4E0D\u53EF\u7528\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4" });
      return;
    }
    setBlocks((current) => [...current, newTemporaryBlock(start, end, blockTitle || void 0)]);
    setBlockStart("");
    setBlockEnd("");
    setBlockTitle("");
    setDirty(true);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      StateBanner,
      {
        state: view,
        failure: state.failure,
        updatedAt: state.updatedAt,
        onRetry: () => void refresh()
      }
    ),
    action.notice && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(NoticeBar, { notice: action.notice, onDismiss: () => action.setNotice(void 0) }),
    !data && state.loading && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(LoadingLine, { children: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026" }),
    data && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      !data.plannerAvailable && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "ac-banner ac-banner-warn", role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "Planner \u5F53\u524D\u4E0D\u53EF\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u53EF\u4EE5\u4FDD\u5B58\u53EF\u7528\u65F6\u95F4\uFF1B\u751F\u6210\u8BA1\u5212\u548C\u5019\u9009\u9700\u8981\u91CD\u65B0\u52A0\u8F7D Planner \u63D2\u4EF6\u3002" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Section,
        {
          title: "\u5B66\u4E60\u65F6\u95F4",
          subtitle: "Planner \u4E0D\u4F1A\u9ED8\u8BA4\u5168\u5929\u53EF\u7528\uFF1B\u4EE5\u4E0B\u8BBE\u7F6E\u4F1A\u6301\u4E45\u5316\u5230 Host",
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "form",
            {
              className: "ac-form-card",
              onSubmit: (event) => {
                event.preventDefault();
                void action.run("availability", saveAvailability, "\u53EF\u7528\u65F6\u95F4\u5DF2\u4FDD\u5B58");
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-form-grid", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "IANA \u65F6\u533A", hint: "\u4F8B\u5982 Asia/Shanghai", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                    "input",
                    {
                      value: timeZone,
                      onChange: (event) => {
                        setTimeZone(event.target.value);
                        setDirty(true);
                      },
                      required: true
                    }
                  ) }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "\u8BA1\u5212\u7C92\u5EA6\uFF08\u5206\u949F\uFF09", hint: "5\u201360 \u5206\u949F", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                    "input",
                    {
                      type: "number",
                      min: 5,
                      max: 60,
                      value: granularity,
                      onChange: (event) => {
                        setGranularity(event.target.value);
                        setDirty(true);
                      }
                    }
                  ) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-subsection", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: "\u6BCF\u5468\u53EF\u7528\u65F6\u6BB5" }),
                  slots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u53EF\u7528\u65F6\u6BB5", children: "\u6CA1\u6709\u53EF\u7528\u65F6\u6BB5\u65F6 Planner \u4E0D\u4F1A\u81EA\u884C\u628A\u5168\u5929\u89C6\u4E3A\u53EF\u7528\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "ac-slot-list", children: slots.map((slot, index) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { className: "ac-slot-row", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "select",
                      {
                        "aria-label": "\u661F\u671F",
                        value: slot.weekday,
                        onChange: (event) => {
                          const weekday = Number(event.target.value);
                          setSlots(
                            (current) => current.map(
                              (entry, entryIndex) => entryIndex === index ? { ...entry, weekday } : entry
                            )
                          );
                          setDirty(true);
                        },
                        children: WEEKDAYS.map((day) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: day.value, children: day.label }, day.value))
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        "aria-label": "\u5F00\u59CB\u65F6\u95F4",
                        type: "time",
                        value: slot.start,
                        onChange: (event) => {
                          const start = event.target.value;
                          setSlots(
                            (current) => current.map(
                              (entry, entryIndex) => entryIndex === index ? { ...entry, start } : entry
                            )
                          );
                          setDirty(true);
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "ac-muted", children: "\u81F3" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        "aria-label": "\u7ED3\u675F\u65F6\u95F4",
                        type: "time",
                        value: slot.end,
                        onChange: (event) => {
                          const end = event.target.value;
                          setSlots(
                            (current) => current.map(
                              (entry, entryIndex) => entryIndex === index ? { ...entry, end } : entry
                            )
                          );
                          setDirty(true);
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "ac-button",
                        onClick: () => {
                          setSlots((current) => current.filter((_, entryIndex) => entryIndex !== index));
                          setDirty(true);
                        },
                        children: "\u5220\u9664"
                      }
                    )
                  ] }, `${slot.weekday}:${slot.start}:${slot.end}:${index}`)) }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                    "button",
                    {
                      type: "button",
                      className: "ac-button",
                      onClick: () => {
                        setSlots((current) => [...current, { weekday: 1, start: "19:00", end: "22:00" }]);
                        setDirty(true);
                      },
                      children: "\u6DFB\u52A0\u65F6\u6BB5"
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-subsection", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: "\u4E34\u65F6\u4E0D\u53EF\u7528\u65F6\u95F4" }),
                  blocks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "ac-muted", children: "\u6CA1\u6709\u4E34\u65F6\u4E0D\u53EF\u7528\u65F6\u95F4\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "ac-list", children: blocks.map((block) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { className: "ac-list-row", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: block.title ?? "\u4E34\u65F6\u4E0D\u53EF\u7528" }),
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
                        formatDateTimeOrDash(block.start, timeZone),
                        " \u2014",
                        " ",
                        formatDateTimeOrDash(block.end, timeZone)
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "ac-button",
                        onClick: () => {
                          setBlocks((current) => current.filter((entry) => entry.id !== block.id));
                          setDirty(true);
                        },
                        children: "\u5220\u9664"
                      }
                    )
                  ] }, block.id)) }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-form-grid", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "\u5F00\u59CB\uFF08\u6D4F\u89C8\u5668\u672C\u5730\u65F6\u95F4\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        type: "datetime-local",
                        value: blockStart,
                        onChange: (event) => setBlockStart(event.target.value)
                      }
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "\u7ED3\u675F\uFF08\u6D4F\u89C8\u5668\u672C\u5730\u65F6\u95F4\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        type: "datetime-local",
                        value: blockEnd,
                        onChange: (event) => setBlockEnd(event.target.value)
                      }
                    ) }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "\u8BF4\u660E\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        value: blockTitle,
                        onChange: (event) => setBlockTitle(event.target.value),
                        maxLength: 200
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "ac-button", onClick: addTemporary, children: "\u6DFB\u52A0\u4E34\u65F6\u4E0D\u53EF\u7528" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-form-actions", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "submit", className: "ac-button ac-button-primary", disabled: action.pending !== void 0, children: action.pending === "availability" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u53EF\u7528\u65F6\u95F4" }),
                  dirty && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "ac-muted", children: "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539" })
                ] })
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Section, { title: "\u540C\u6B65\u5468\u671F", subtitle: "\u53EA\u4FEE\u6539\u5185\u7F6E\u540C\u6B65\u4EFB\u52A1\u7684\u5468\u671F\uFF1B\u4E0D\u4F1A\u542F\u52A8\u7B2C\u4E8C\u4EFD Runtime", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "form",
        {
          className: "ac-form-card",
          onSubmit: (event) => {
            event.preventDefault();
            void action.run("interval", saveInterval, "\u540C\u6B65\u5468\u671F\u5DF2\u4FDD\u5B58");
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "ac-form-grid", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: "\u5468\u671F\uFF08\u5206\u949F\uFF09", hint: `\u5F53\u524D\u4EFB\u52A1\uFF1A${data.sync.jobId}`, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "number",
                min: 1,
                max: 10080,
                value: interval,
                onChange: (event) => setIntervalMinutes(event.target.value)
              }
            ) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-form-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "submit", className: "ac-button", disabled: action.pending !== void 0, children: "\u4FDD\u5B58\u5468\u671F" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
                "\u4E0B\u6B21\u6267\u884C\uFF1A",
                formatDateTimeOrDash(data.sync.nextRunAt, data.availability.timeZone)
              ] })
            ] })
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Section,
        {
          title: "\u8BFE\u7A0B\u4F18\u5148\u7EA7",
          subtitle: "\u7528\u6237\u660E\u786E\u8BBE\u5B9A\uFF1B\u4EC5\u5728\u4EFB\u52A1\u81EA\u8EAB\u4F18\u5148\u7EA7\u76F8\u540C\u65F6\u5F71\u54CD\u8BA1\u5212\u6392\u5E8F",
          children: data.preferences.courses.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u8BFE\u7A0B", children: "\u6DFB\u52A0\u8BFE\u7A0B\u540E\u53EF\u8BBE\u7F6E\u4F18\u5148\u7EA7\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "form",
            {
              className: "ac-form-card",
              onSubmit: (event) => {
                event.preventDefault();
                void action.run(
                  "preferences",
                  savePreferences,
                  "\u8BFE\u7A0B\u4F18\u5148\u7EA7\u5DF2\u4FDD\u5B58"
                );
              },
              children: [
                data.preferences.courses.map((course) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-inline-bar", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("strong", { children: [
                      course.code,
                      " ",
                      course.title
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "ac-muted", children: course.courseId })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                    "select",
                    {
                      value: coursePriorities[course.courseId] ?? 0,
                      onChange: (event) => setCoursePriorities((current) => ({
                        ...current,
                        [course.courseId]: Number(event.target.value)
                      })),
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: 0, children: "0 \xB7 \u666E\u901A" }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: 1, children: "1 \xB7 \u8F83\u9AD8" }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: 2, children: "2 \xB7 \u9AD8" }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: 3, children: "3 \xB7 \u6700\u9AD8" })
                      ]
                    }
                  )
                ] }, course.courseId)),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-form-actions", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                    "button",
                    {
                      type: "submit",
                      className: "ac-button",
                      disabled: action.pending !== void 0,
                      children: action.pending === "preferences" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BFE\u7A0B\u4F18\u5148\u7EA7"
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
                    "\u66F4\u65B0\u4E8E ",
                    formatDateTimeOrDash(data.preferences.updatedAt, data.availability.timeZone)
                  ] })
                ] })
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Section,
        {
          title: "Agent \u81EA\u52A8\u63A5\u5165",
          subtitle: "\u4E00\u6B21\u6027\u5F00\u542F\uFF1B\u4E0D\u9700\u8981\u9010\u4E2A\u5019\u9009\u70B9\u51FB\u5BA1\u6838",
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "form",
            {
              className: "ac-form-card",
              onSubmit: (event) => {
                event.preventDefault();
                void action.run(
                  "preferences",
                  savePreferences,
                  "Agent \u81EA\u52A8\u63A5\u5165\u8BBE\u7F6E\u5DF2\u4FDD\u5B58"
                );
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { className: "ac-inline-bar", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: agentAdapterAutomation,
                      onChange: (event) => setAgentAdapterAutomation(event.target.checked)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "\u5141\u8BB8 Agent \u81EA\u52A8\u542F\u7528\u5DF2\u9A8C\u8BC1 Adapter \u5E76\u540C\u6B65\u5176\u58F0\u660E\u5F0F\u6570\u636E\u6E90" }),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "ac-muted", children: "\u4ECD\u4E0D\u80FD\u542F\u7528\u672A\u9A8C\u8BC1\u5019\u9009\u3001\u8BFB\u53D6\u51ED\u636E\u3001\u63D0\u4EA4\u4F5C\u4E1A\u6216\u4FEE\u6539\u5B66\u6821\u5E73\u53F0\uFF1B \u5173\u95ED\u540E\u6062\u590D\u9010\u6B21\u5BA1\u6838\u3002" })
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "ac-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  "button",
                  {
                    type: "submit",
                    className: "ac-button",
                    disabled: action.pending !== void 0,
                    children: action.pending === "preferences" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u81EA\u52A8\u63A5\u5165\u8BBE\u7F6E"
                  }
                ) })
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Section, { title: "\u63D0\u9192", subtitle: "\u9608\u503C\u4E0E\u672A\u8BFB\u63D0\u9192\u5728\u81EA\u52A8\u5316\u9875\u7BA1\u7406", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "ac-inline-bar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { tone: data.reminders.enabled ? "ok" : "warn", children: data.reminders.enabled ? "\u63D0\u9192\u5DF2\u542F\u7528" : "\u63D0\u9192\u5DF2\u5173\u95ED" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
            "\u9608\u503C\uFF1A",
            data.reminders.thresholdsHours.slice().sort((a, b) => b - a).map((hours) => `${hours}h`).join(" / ")
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "ac-button", onClick: () => onNavigate("automation"), children: "\u6253\u5F00\u81EA\u52A8\u5316" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Section,
        {
          title: "\u5DF2\u52A0\u8F7D\u80FD\u529B",
          subtitle: "\u53EA\u8BFB\uFF1B\u542F\u505C\u7531\u63D2\u4EF6\u751F\u547D\u5468\u671F\u63A7\u5236\uFF0C\u505C\u7528\u540E\u76F8\u5173\u64CD\u4F5C\u8FD4\u56DE CAPABILITY_UNAVAILABLE",
          children: data.capabilities.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(EmptyState, { title: "\u6CA1\u6709\u5DF2\u6CE8\u518C\u80FD\u529B", children: "\u68C0\u67E5 Host \u63D2\u4EF6\u662F\u5426\u52A0\u8F7D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: "ac-list", children: data.capabilities.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { className: "ac-list-row", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("strong", { children: [
              entry.id,
              " \xB7 ",
              entry.version
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
              entry.kind,
              " \xB7 \u63D0\u4F9B\u65B9 ",
              entry.providerPlugin
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ac-muted", children: [
              "\u80FD\u529B\uFF1A",
              entry.capabilities.join("\u3001") || "\u2014",
              " \xB7 \u6743\u9650\uFF1A",
              entry.requiredPermissions.join("\u3001") || "\u65E0"
            ] })
          ] }) }, entry.id)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Section, { title: "\u754C\u9762\u504F\u597D", subtitle: "\u53EA\u4FDD\u5B58\u975E\u654F\u611F UI \u504F\u597D", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "ac-muted", children: "\u5F53\u524D\u9875\u9762\u548C\u7B5B\u9009\u7B49\u7EAF\u754C\u9762\u504F\u597D\u4FDD\u5B58\u5728\u672C\u673A\u6D4F\u89C8\u5668\uFF1B\u8BFE\u7A0B\u3001\u4EFB\u52A1\u3001\u8BA1\u5212\u3001\u53EF\u7528\u65F6\u95F4\u4E0E\u51ED\u636E\u4E0D\u4F1A\u4FDD\u5B58\u5728\u6D4F\u89C8\u5668\u5B58\u50A8\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => {
              try {
                window.localStorage.removeItem("academic.ui.tab.v1");
              } catch {
              }
              action.setNotice({ tone: "ok", text: "\u5DF2\u6E05\u9664\u672C\u673A\u754C\u9762\u504F\u597D\uFF1B\u4E1A\u52A1\u6570\u636E\u4E0D\u53D7\u5F71\u54CD" });
            },
            children: "\u6E05\u9664\u754C\u9762\u504F\u597D"
          }
        )
      ] })
    ] })
  ] });
}

// packages/academic-dsh-ui/src/client/index.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var name = "academic-ui";
var inject = ["slots", "connection"];
var PANEL_ID = "academic";
var TAB_KEY = "academic.ui.tab.v1";
var TABS = [
  { id: "dashboard", label: "\u603B\u89C8" },
  { id: "tasks", label: "\u4EFB\u52A1" },
  { id: "plan", label: "\u8BA1\u5212" },
  { id: "connections", label: "\u8FDE\u63A5" },
  { id: "automation", label: "\u81EA\u52A8\u5316" },
  { id: "settings", label: "\u8BBE\u7F6E" }
];
function readTab() {
  try {
    const value = window.localStorage.getItem(TAB_KEY);
    if (value && TABS.some((tab) => tab.id === value)) return value;
  } catch {
  }
  return "dashboard";
}
function writeTab(tab) {
  try {
    window.localStorage.setItem(TAB_KEY, tab);
  } catch {
  }
}
function AcademicIcon({ size = 18 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M6 9.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3V9.5" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M21 7.5V14" })
      ]
    }
  );
}
function AcademicPanel({ ctx }) {
  const [tab, setTab] = (0, import_react9.useState)(() => readTab());
  const [status, setStatus] = (0, import_react9.useState)();
  const [statusError, setStatusError] = (0, import_react9.useState)();
  const loadStatus = (0, import_react9.useCallback)(async () => {
    const result = await callApi(ctx, "status");
    if (result.ok) {
      setStatus(result.value);
      setStatusError(void 0);
    } else {
      setStatus(void 0);
      setStatusError(result.error.message);
    }
  }, [ctx]);
  (0, import_react9.useEffect)(() => {
    void loadStatus();
  }, [loadStatus]);
  (0, import_react9.useEffect)(() => {
    if (!statusError) return void 0;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void loadStatus();
    }, 5e3);
    return () => window.clearTimeout(timer);
  }, [loadStatus, statusError]);
  (0, import_react9.useEffect)(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadStatus();
    }, 15e3);
    return () => window.clearInterval(timer);
  }, [loadStatus]);
  const navigate = (next) => {
    setTab(next);
    writeTab(next);
  };
  const pageProps = { ctx, active: true, onNavigate: navigate };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "ac-shell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { className: "ac-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h1", { children: "\u5B66\u4E1A" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { children: "\u8BFE\u7A0B\u3001\u4EFB\u52A1\u3001\u8BA1\u5212\u4E0E\u6570\u636E\u6E90" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "ac-header-actions", children: [
        status && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Badge, { tone: status.plannerAvailable ? "ok" : "warn", children: status.plannerAvailable ? "Host \u5DF2\u8FDE\u63A5" : "\u89C4\u5212\u80FD\u529B\u672A\u52A0\u8F7D" }),
        !status && statusError && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Badge, { tone: "bad", children: "Host \u4E0D\u53EF\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            type: "button",
            className: "ac-button",
            onClick: () => {
              askAgent(
                ctx,
                "\u6211\u60F3\u67E5\u770B\u5F53\u524D\u7684\u5B66\u4E1A\u4E8B\u5B9E\uFF08\u8BFE\u7A0B\u3001\u622A\u6B62\u4E8B\u9879\u3001\u5B66\u4E60\u4EFB\u52A1\u548C\u5DF2\u786E\u8BA4\u8BA1\u5212\uFF09\uFF0C\u8BF7\u5148\u8C03\u7528\u53EA\u8BFB\u5DE5\u5177\u67E5\u8BE2\uFF0C\u518D\u533A\u5206\u6570\u636E\u5E93\u4E8B\u5B9E\u4E0E\u4F60\u7684\u5EFA\u8BAE\u3002"
              );
            },
            children: "\u54A8\u8BE2 Agent"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("nav", { className: "ac-tabs", role: "tablist", "aria-label": "\u5B66\u4E1A\u9875\u9762", children: TABS.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": tab === entry.id,
        className: tab === entry.id ? "ac-tab ac-tab-active" : "ac-tab",
        onClick: () => navigate(entry.id),
        children: entry.label
      },
      entry.id
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("main", { className: "ac-panel", role: "tabpanel", "aria-label": TABS.find((entry) => entry.id === tab)?.label, children: [
      tab === "dashboard" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(DashboardPage, { ...pageProps }),
      tab === "tasks" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(TasksPage, { ...pageProps }),
      tab === "plan" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PlanPage, { ...pageProps }),
      tab === "connections" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ConnectionsPage, { ...pageProps }),
      tab === "automation" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AutomationPage, { ...pageProps }),
      tab === "settings" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(SettingsPage, { ...pageProps })
    ] })
  ] });
}
function apply(ctx) {
  ctx.effect(() => injectStyles(), "academic-ui: styles");
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 20,
        label: "\u5B66\u4E1A"
      },
      AcademicIcon
    )
  );
  ctx.slots.inject(
    "main",
    () => ctx.slots.register(
      {
        name: "main",
        key: PANEL_ID
      },
      () => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AcademicPanel, { ctx })
    )
  );
}
var index_default = { name, inject, apply };

    return module.exports;
  }
});
