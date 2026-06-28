import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOMClientRuntime from "react-dom/client";
import Editor from "@monaco-editor/react";
import * as esbuild from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { compileScript, compileStyle, compileTemplate, parse } from "@vue/compiler-sfc";
import * as VueRuntime from "vue";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  Cloud,
  Code2,
  Database,
  FileCode2,
  Folder,
  GripHorizontal,
  HardDrive,
  LayoutDashboard,
  Maximize2,
  Loader2,
  Layers,
  Monitor,
  Paintbrush,
  PanelLeftOpen,
  PanelRightOpen,
  Play,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  UploadCloud,
  X
} from "lucide-react";
import "./styles.css";

const runtimeConfig = {
  // "remote" loads dependencies from esm.sh; "local" uses bundled runtime shims.
  dependencySource: "local",
  prewarmEsbuild: true
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/g, "");
const apiUrl = (path) => `${apiBaseUrl}${path}`;

const deployTargets = [
  { key: "web", label: "Web Server", icon: HardDrive },
  { key: "oss", label: "OSS", icon: Database },
  { key: "cloudflare", label: "Cloudflare", icon: Cloud }
];

window.__sandboxRuntimeDeps = {
  React,
  ReactDOMClient: ReactDOMClientRuntime,
  Vue: VueRuntime
};

const demoCopy = {
  brand: "\u661f\u6cb3\u79d1\u6280",
  home: "\u9996\u9875",
  products: "\u4ea7\u54c1\u4ecb\u7ecd",
  contact: "\u8054\u7cfb\u6211\u4eec",
  headline: "\u8ba9\u4e1a\u52a1\u7cfb\u7edf\u66f4\u6e05\u6670\u3001\u66f4\u9ad8\u6548\u5730\u8fd0\u8f6c",
  lead: "\u661f\u6cb3\u79d1\u6280\u4e3a\u4f01\u4e1a\u63d0\u4f9b\u6570\u636e\u770b\u677f\u3001\u81ea\u52a8\u5316\u6d41\u7a0b\u548c\u5ba2\u6237\u534f\u4f5c\u5de5\u5177\u3002",
  viewProducts: "\u67e5\u770b\u4ea7\u54c1",
  today: "\u4eca\u65e5\u6982\u89c8",
  delivery: "\u9879\u76ee\u4ea4\u4ed8\u7387",
  response: "\u5ba2\u6237\u54cd\u5e94\u65f6\u95f4",
  productHeadline: "\u4e09\u5957\u5de5\u5177\uff0c\u8986\u76d6\u4f01\u4e1a\u6838\u5fc3\u534f\u4f5c\u573a\u666f",
  dashboard: "\u6570\u636e\u9a7e\u9a76\u8231",
  dashboardText: "\u7edf\u4e00\u5c55\u793a\u9500\u552e\u3001\u8fd0\u8425\u548c\u9879\u76ee\u6307\u6807\uff0c\u8ba9\u7ba1\u7406\u5c42\u5feb\u901f\u5224\u65ad\u4e1a\u52a1\u72b6\u6001\u3002",
  automation: "\u6d41\u7a0b\u81ea\u52a8\u5316",
  automationText: "\u628a\u5ba1\u6279\u3001\u63d0\u9192\u3001\u5206\u6d3e\u548c\u5f52\u6863\u4e32\u8054\u8d77\u6765\uff0c\u51cf\u5c11\u91cd\u590d\u5f55\u5165\u548c\u624b\u5de5\u8ddf\u8fdb\u3002",
  portal: "\u5ba2\u6237\u534f\u4f5c\u95e8\u6237",
  portalText: "\u4e3a\u5ba2\u6237\u63d0\u4f9b\u9879\u76ee\u8fdb\u5ea6\u3001\u6587\u4ef6\u4ea4\u4ed8\u548c\u5728\u7ebf\u53cd\u9988\u5165\u53e3\uff0c\u6c9f\u901a\u66f4\u900f\u660e\u3002",
  contactHeadline: "\u544a\u8bc9\u6211\u4eec\u4f60\u7684\u4e1a\u52a1\u76ee\u6807",
  contactLead: "\u6211\u4eec\u4f1a\u5728\u4e00\u4e2a\u5de5\u4f5c\u65e5\u5185\u56de\u590d\uff0c\u5e76\u7ed9\u51fa\u9002\u5408\u5f53\u524d\u9636\u6bb5\u7684\u4ea7\u54c1\u65b9\u6848\u3002",
  phone: "\u7535\u8bdd\uff1a400-800-2026",
  email: "\u90ae\u7bb1\uff1ahello@example.com",
  address: "\u5730\u5740\uff1a\u4e0a\u6d77\u5e02\u6d66\u4e1c\u65b0\u533a\u521b\u65b0\u5927\u9053 88 \u53f7",
  name: "\u59d3\u540d",
  namePlaceholder: "\u8bf7\u8f93\u5165\u59d3\u540d",
  contactMethod: "\u8054\u7cfb\u65b9\u5f0f",
  needs: "\u9700\u6c42",
  needsPlaceholder: "\u7b80\u5355\u63cf\u8ff0\u4f60\u7684\u9700\u6c42",
  submit: "\u63d0\u4ea4\u54a8\u8be2"
};

const templates = {
  html: {
    label: "HTML",
    entry: "index.html",
    files: {
      "index.html": `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${demoCopy.home} - ${demoCopy.brand}</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="logo" href="./index.html">${demoCopy.brand}</a>
      <nav>
        <a class="active" href="./index.html">${demoCopy.home}</a>
        <a href="./products.html">${demoCopy.products}</a>
        <a href="./contact.html">${demoCopy.contact}</a>
      </nav>
    </header>

    <main class="hero">
      <section>
        <p class="eyebrow">Digital operations platform</p>
        <h1>${demoCopy.headline}</h1>
        <p class="lead">${demoCopy.lead}</p>
        <a class="button" href="./products.html">${demoCopy.viewProducts}</a>
      </section>
      <section class="hero-panel">
        <h2>${demoCopy.today}</h2>
        <div class="metric">
          <span>${demoCopy.delivery}</span>
          <strong>96%</strong>
        </div>
        <div class="metric">
          <span>${demoCopy.response}</span>
          <strong>12m</strong>
        </div>
      </section>
    </main>
    <script src="./script.js"></script>
  </body>
</html>`,
      "products.html": `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${demoCopy.products} - ${demoCopy.brand}</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="logo" href="./index.html">${demoCopy.brand}</a>
      <nav>
        <a href="./index.html">${demoCopy.home}</a>
        <a class="active" href="./products.html">${demoCopy.products}</a>
        <a href="./contact.html">${demoCopy.contact}</a>
      </nav>
    </header>

    <main class="page">
      <p class="eyebrow">Products</p>
      <h1>${demoCopy.productHeadline}</h1>
      <section class="product-grid">
        <article>
          <h2>${demoCopy.dashboard}</h2>
          <p>${demoCopy.dashboardText}</p>
        </article>
        <article>
          <h2>${demoCopy.automation}</h2>
          <p>${demoCopy.automationText}</p>
        </article>
        <article>
          <h2>${demoCopy.portal}</h2>
          <p>${demoCopy.portalText}</p>
        </article>
      </section>
    </main>
    <script src="./script.js"></script>
  </body>
</html>`,
      "contact.html": `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${demoCopy.contact} - ${demoCopy.brand}</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="logo" href="./index.html">${demoCopy.brand}</a>
      <nav>
        <a href="./index.html">${demoCopy.home}</a>
        <a href="./products.html">${demoCopy.products}</a>
        <a class="active" href="./contact.html">${demoCopy.contact}</a>
      </nav>
    </header>

    <main class="page contact-layout">
      <section>
        <p class="eyebrow">Contact</p>
        <h1>${demoCopy.contactHeadline}</h1>
        <p class="lead">${demoCopy.contactLead}</p>
        <ul class="contact-list">
          <li>${demoCopy.phone}</li>
          <li>${demoCopy.email}</li>
          <li>${demoCopy.address}</li>
        </ul>
      </section>
      <form class="contact-form">
        <label>
          ${demoCopy.name}
          <input type="text" placeholder="${demoCopy.namePlaceholder}" />
        </label>
        <label>
          ${demoCopy.contactMethod}
          <input type="email" placeholder="name@example.com" />
        </label>
        <label>
          ${demoCopy.needs}
          <textarea rows="4" placeholder="${demoCopy.needsPlaceholder}"></textarea>
        </label>
        <button type="submit">${demoCopy.submit}</button>
      </form>
    </main>
    <script src="./script.js"></script>
  </body>
</html>`,      "style.css": `body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, system-ui, sans-serif;
  background: #f4f7fb;
  color: #172033;
}

a {
  color: inherit;
  text-decoration: none;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px min(5vw, 56px);
  border-bottom: 1px solid #dbe4ef;
  background: #ffffff;
}

.logo {
  font-size: 20px;
  font-weight: 800;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

nav a {
  border-radius: 8px;
  padding: 9px 12px;
  color: #516173;
  font-weight: 700;
}

nav a.active,
nav a:hover {
  background: #172033;
  color: #ffffff;
}

.hero,
.page {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 64px 0;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  align-items: center;
  gap: 48px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #1769e0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 760px;
  font-size: 42px;
  line-height: 1.15;
}

.lead {
  max-width: 680px;
  margin: 18px 0 0;
  color: #526170;
  font-size: 18px;
  line-height: 1.7;
}

.button,
.contact-form button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  margin-top: 26px;
  border: 0;
  border-radius: 8px;
  padding: 0 16px;
  background: #1769e0;
  color: white;
  cursor: pointer;
  font-weight: 800;
}

.hero-panel,
.product-grid article,
.contact-form {
  border: 1px solid #d9e3ee;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(23, 32, 51, 0.08);
}

.hero-panel {
  padding: 28px;
}

.hero-panel h2,
.product-grid h2 {
  margin: 0 0 16px;
}

.metric {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 0;
  border-top: 1px solid #e5edf5;
}

.metric strong {
  color: #1769e0;
  font-size: 28px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 28px;
}

.product-grid article {
  padding: 24px;
}

.product-grid p,
.contact-list {
  color: #526170;
  line-height: 1.7;
}

.contact-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 42px;
}

.contact-list {
  padding-left: 18px;
}

.contact-form {
  display: grid;
  gap: 16px;
  padding: 24px;
}

.contact-form label {
  display: grid;
  gap: 7px;
  color: #334155;
  font-weight: 800;
}

.contact-form input,
.contact-form textarea {
  width: 100%;
  border: 1px solid #cfd8e3;
  border-radius: 8px;
  padding: 11px 12px;
  font: inherit;
  resize: vertical;
}

@media (max-width: 760px) {
  .site-header,
  .hero,
  .contact-layout {
    grid-template-columns: 1fr;
  }

  .site-header {
    display: grid;
  }

  .product-grid {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 32px;
  }
}`,
      "script.js": `const form = document.querySelector(".contact-form");

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("\u611f\u8c22\u54a8\u8be2\uff0c\u6211\u4eec\u4f1a\u5c3d\u5feb\u8054\u7cfb\u4f60\u3002");
  });
}`
    }
  },
  react: {
    label: "React",
    entry: "src/App.jsx",
    files: {
      "src/App.jsx": `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Hello React</h1>
      <p>This JSX is bundled in your browser with esbuild-wasm.</p>
      <button onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);`,
      "src/style.css": `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: Inter, system-ui, sans-serif;
  background: #fbfaf7;
  color: #172033;
}

main {
  width: min(520px, calc(100vw - 32px));
}

button {
  border: 0;
  border-radius: 8px;
  padding: 10px 14px;
  background: #0f766e;
  color: white;
  cursor: pointer;
}`
    }
  },
  vue: {
    label: "Vue",
    entry: "src/main.js",
    files: {
      "src/main.js": `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#root");`,
      "src/App.vue": `<template>
  <main class="page">
    <section class="panel">
      <div class="eyebrow">Vue SFC</div>
      <h1>Hello Vue</h1>
      <p>This component is compiled in the browser, then bundled with esbuild-wasm.</p>
      <button @click="count++">Clicked {{ count }} times</button>
    </section>
  </main>
</template>

<script setup>
import { ref } from "vue";

const count = ref(0);
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-content: center;
  padding: 24px;
  font-family: Inter, system-ui, sans-serif;
  background: #f7fbf8;
  color: #172033;
}

.panel {
  width: min(520px, calc(100vw - 48px));
  border: 1px solid #c9d8d0;
  border-radius: 8px;
  padding: 28px;
  background: white;
  box-shadow: 0 20px 50px rgba(23, 32, 51, 0.12);
}

.eyebrow {
  margin-bottom: 10px;
  color: #16704a;
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 10px;
  font-size: 34px;
}

p {
  margin: 0 0 18px;
  color: #4b5b68;
  line-height: 1.6;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 11px 15px;
  background: #16704a;
  color: white;
  font-weight: 700;
  cursor: pointer;
}
</style>`
    }
  }
};

let esbuildReady;

const localDependencyModules = {
  react: `
const React = window.parent.__sandboxRuntimeDeps.React;
export default React;
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version
} = React;
`,
  "react-dom/client": `
const ReactDOMClient = window.parent.__sandboxRuntimeDeps.ReactDOMClient;
export const { createRoot, hydrateRoot, version } = ReactDOMClient;
`,
  vue: `
const Vue = window.parent.__sandboxRuntimeDeps.Vue;
export const {
  BaseTransition,
  Comment,
  EffectScope,
  Fragment,
  KeepAlive,
  ReactiveEffect,
  Static,
  Suspense,
  Teleport,
  Text,
  Transition,
  TransitionGroup,
  callWithAsyncErrorHandling,
  callWithErrorHandling,
  cloneVNode,
  computed,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  createHydrationRenderer,
  createPropsRestProxy,
  createRenderer,
  createSlots,
  createStaticVNode,
  createTextVNode,
  createVNode,
  customRef,
  defineAsyncComponent,
  defineComponent,
  defineEmits,
  defineExpose,
  defineModel,
  defineOptions,
  defineProps,
  defineSlots,
  devtools,
  effect,
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  getCurrentWatcher,
  h,
  handleError,
  hasInjectionContext,
  hydrate,
  hydrateOnIdle,
  hydrateOnInteraction,
  hydrateOnMediaQuery,
  hydrateOnVisible,
  initCustomFormatter,
  inject,
  isMemoSame,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isRuntimeOnly,
  isShallow,
  markRaw,
  mergeDefaults,
  mergeModels,
  mergeProps,
  nextTick,
  normalizeClass,
  normalizeProps,
  normalizeStyle,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onScopeDispose,
  onServerPrefetch,
  onUnmounted,
  onUpdated,
  onWatcherCleanup,
  openBlock,
  popScopeId,
  provide,
  proxyRefs,
  pushScopeId,
  queuePostFlushCb,
  reactive,
  readonly,
  ref,
  registerRuntimeCompiler,
  render,
  renderList,
  renderSlot,
  resolveComponent,
  resolveDirective,
  resolveDynamicComponent,
  resolveFilter,
  resolveTransitionHooks,
  setBlockTracking,
  setDevtoolsHook,
  setTransitionHooks,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  ssrContextKey,
  ssrUtils,
  stop,
  toDisplayString,
  toHandlerKey,
  toHandlers,
  toRaw,
  toRef,
  toRefs,
  toValue,
  transformVNodeArgs,
  triggerRef,
  unref,
  useAttrs,
  useCssModule,
  useCssVars,
  useHost,
  useId,
  useModel,
  useSSRContext,
  useShadowRoot,
  useSlots,
  useTemplateRef,
  useTransitionState,
  vModelCheckbox,
  vModelDynamic,
  vModelRadio,
  vModelSelect,
  vModelText,
  vShow,
  version,
  warn,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  withAsyncContext,
  withCtx,
  withDefaults,
  withDirectives,
  withKeys,
  withMemo,
  withModifiers,
  withScopeId
} = Vue;

function mountInPreviewDocument(app) {
  const originalMount = app.mount;
  app.mount = (containerOrSelector, ...args) => {
    const container =
      typeof containerOrSelector === "string" ? window.document.querySelector(containerOrSelector) : containerOrSelector;
    return originalMount.call(app, container, ...args);
  };
  return app;
}

export function createApp(...args) {
  return mountInPreviewDocument(Vue.createApp(...args));
}

export function createSSRApp(...args) {
  return mountInPreviewDocument(Vue.createSSRApp(...args));
}

const previewVue = {
  ...Vue,
  createApp,
  createSSRApp
};

export default previewVue;
`
};

function normalizePath(path, base = "") {
  if (path.startsWith("/")) return path.slice(1);
  const stack = base ? base.split("/").filter(Boolean) : [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function getLoader(path) {
  const cleanPath = path.split("?")[0];
  if (cleanPath.endsWith(".tsx")) return "tsx";
  if (cleanPath.endsWith(".ts")) return "ts";
  if (cleanPath.endsWith(".jsx")) return "jsx";
  if (cleanPath.endsWith(".css")) return "css";
  if (cleanPath.endsWith(".json")) return "json";
  return "js";
}

function getLanguage(path) {
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".vue")) return "vue";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  return "javascript";
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  if (!text.trim()) {
    return { ok: false, error: fallbackMessage || `Empty response from ${response.url}` };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: response.ok ? fallbackMessage || "Invalid JSON response" : `${fallbackMessage || "Request failed"} (${response.status})`
    };
  }
}

async function ensureEsbuild() {
  if (!esbuildReady) {
    esbuildReady = esbuild.initialize({ wasmURL, worker: true });
  }
  return esbuildReady;
}

function makeHtmlPreview(files, entry) {
  let html = files[entry] ?? files["index.html"] ?? "";
  html = html.replace(
    /<link\s+[^>]*href=["']\.\/style\.css["'][^>]*>/i,
    `<style>${files["style.css"] ?? ""}</style>`
  );
  html = html.replace(
    /<script\s+[^>]*src=["']\.\/script\.js["'][^>]*><\/script>/i,
    `<script>${files["script.js"] ?? ""}<\/script>`
  );
  const navigationScript = `<script>
document.addEventListener("click", function (event) {
  const link = event.target.closest("a[href]");
  if (!link) return;

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || /^[a-zA-Z][a-zA-Z\\d+.-]*:/.test(href)) return;

  const path = href.replace(/^\\.\\//, "").split("#")[0].split("?")[0];
  if (!path.endsWith(".html")) return;

  event.preventDefault();
  window.parent.postMessage({ type: "preview:navigate", path }, "*");
});
<\/script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${navigationScript}</body>`);
  }

  return `${html}${navigationScript}`;
}

function extractEditableHtml(sourceHtml) {
  const doc = new DOMParser().parseFromString(sourceHtml || "", "text/html");
  return doc.body?.innerHTML || sourceHtml || "";
}

function serializeEditableHtml(sourceHtml, bodyHtml) {
  const hasDoctype = /^\s*<!doctype/i.test(sourceHtml || "");
  const doc = new DOMParser().parseFromString(
    sourceHtml || "<!doctype html><html><head></head><body></body></html>",
    "text/html"
  );

  if (!doc.body) {
    return bodyHtml;
  }

  doc.body.innerHTML = bodyHtml;
  const html = doc.documentElement.outerHTML;
  return `${hasDoctype ? "<!doctype html>\n" : ""}${html}`;
}

function GrapesPreviewEditor({
  html,
  css,
  isOverlayLayout,
  isSidePanelOpen,
  activePanel,
  panelToolbar,
  onChange,
  onReady
}) {
  const containerRef = useRef(null);
  const blocksRef = useRef(null);
  const layersRef = useRef(null);
  const stylesRef = useRef(null);
  const traitsRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const changeTimerRef = useRef(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    if (isOverlayLayout && (!blocksRef.current || !layersRef.current || !stylesRef.current || !traitsRef.current)) {
      return undefined;
    }

    const managerConfig = isOverlayLayout
      ? {
          panels: {
            defaults: []
          },
          layerManager: {
            appendTo: layersRef.current
          },
          styleManager: {
            appendTo: stylesRef.current
          },
          traitManager: {
            appendTo: traitsRef.current
          }
        }
      : {};

    const editor = grapesjs.init({
      container: containerRef.current,
      height: "100%",
      width: "100%",
      storageManager: false,
      selectorManager: { componentFirst: true },
      canvas: {
        styles: []
      },
      ...managerConfig,
      blockManager: {
        ...(isOverlayLayout ? { appendTo: blocksRef.current } : {}),
        blocks: [
          {
            id: "section",
            label: "Section",
            category: "Basic",
            content: "<section><h2>New section</h2><p>Edit this text.</p></section>"
          },
          { id: "text", label: "Text", category: "Basic", content: "<p>Edit this text.</p>" },
          { id: "image", label: "Image", category: "Basic", content: { type: "image" } },
          { id: "button", label: "Button", category: "Basic", content: '<a class="button" href="#">Button</a>' }
        ]
      }
    });

    editor.setComponents(html);
    editor.setStyle(css);
    editorRef.current = editor;
    onReadyRef.current?.(editor);

    const changeEvents = "component:update component:add component:remove style:property:update";
    let isDestroying = false;
    const emitChange = () => {
      if (isDestroying) return;
      window.clearTimeout(changeTimerRef.current);
      changeTimerRef.current = window.setTimeout(() => {
        if (isDestroying) return;
        onChangeRef.current?.({
          html: editor.getHtml(),
          css: editor.getCss()
        });
      }, 250);
    };

    editor.on(changeEvents, emitChange);

    return () => {
      isDestroying = true;
      editor.off(changeEvents, emitChange);
      window.clearTimeout(changeTimerRef.current);
      onReadyRef.current?.(null);
      editor.destroy();
      editorRef.current = null;
    };
  }, [isOverlayLayout]);

  return (
    <>
      <div className="grapes-preview-editor" ref={containerRef} />
      {isOverlayLayout && (
        <aside className={`grapes-side-panel ${isSidePanelOpen ? "open" : ""}`} aria-hidden={!isSidePanelOpen}>
          {panelToolbar && <div className="grapes-panel-toolbar">{panelToolbar}</div>}
          <div className="grapes-panel-content">
            <div className={activePanel === "blocks" ? "grapes-manager active" : "grapes-manager"} ref={blocksRef} />
            <div className={activePanel === "layers" ? "grapes-manager active" : "grapes-manager"} ref={layersRef} />
            <div className={activePanel === "styles" ? "grapes-manager active" : "grapes-manager"} ref={stylesRef} />
            <div className={activePanel === "settings" ? "grapes-manager active" : "grapes-manager"} ref={traitsRef} />
          </div>
        </aside>
      )}
    </>
  );
}

function compileVueFile(path, source) {
  const parsed = parse(source, { filename: path });
  const { descriptor } = parsed;
  if (parsed.errors.length) throw parsed.errors[0];

  const id = path.replace(/[^a-z0-9]/gi, "-");
  const script = compileScript(descriptor, { id });
  const template = compileTemplate({
    id,
    source: descriptor.template?.content ?? "",
    filename: path,
    scoped: descriptor.styles.some((style) => style.scoped),
    compilerOptions: {
      bindingMetadata: script.bindings
    }
  });

  if (template.errors.length) throw template.errors[0];

  const styles = descriptor.styles
    .map((style) => compileStyle({ id, source: style.content, filename: path, scoped: style.scoped }).code)
    .join("\n");

  const scriptContent = script.content.replace("export default", "const __sfc__ =");
  return `${scriptContent}
${template.code.replace("export function render", "function render")}
__sfc__.render = render;
${descriptor.styles.some((style) => style.scoped) ? `__sfc__.__scopeId = "data-v-${id}";` : ""}
const style = document.createElement("style");
style.textContent = ${JSON.stringify(styles)};
document.head.appendChild(style);
export default __sfc__;`;
}

function sandboxPlugin(files, onStatus) {
  return {
    name: "sandbox-files",
    setup(build) {
      build.onResolve({ filter: /^https?:\/\// }, (args) => ({
        path: args.path,
        namespace: "http-url"
      }));

      build.onResolve({ filter: /^[^./].*/ }, (args) => {
        const localPath = normalizePath(args.path);
        if (files[localPath] != null) {
          return { path: localPath, namespace: "sandbox" };
        }
        if (runtimeConfig.dependencySource === "local" && localDependencyModules[args.path]) {
          return { path: args.path, namespace: "local-dependency" };
        }
        return {
          path: `https://esm.sh/${args.path}?dev`,
          namespace: "http-url"
        };
      });

      build.onResolve({ filter: /.*/, namespace: "http-url" }, (args) => ({
        path: new URL(args.path, args.importer).toString(),
        namespace: "http-url"
      }));

      build.onLoad({ filter: /.*/, namespace: "http-url" }, async (args) => {
        onStatus?.("Loading dependencies");
        const response = await fetch(args.path);
        if (!response.ok) throw new Error(`Failed to fetch ${args.path}`);
        return {
          contents: await response.text(),
          loader: getLoader(args.path),
          resolveDir: args.path
        };
      });

      build.onLoad({ filter: /.*/, namespace: "local-dependency" }, (args) => ({
        contents: localDependencyModules[args.path],
        loader: "js"
      }));

      build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        const base = args.importer.includes("/") ? args.importer.split("/").slice(0, -1).join("/") : "";
        return { path: normalizePath(args.path, base), namespace: "sandbox" };
      });

      build.onResolve({ filter: /.*/ }, (args) => ({
        path: normalizePath(args.path),
        namespace: "sandbox"
      }));

      build.onLoad({ filter: /.*/, namespace: "sandbox" }, (args) => {
        const source = files[args.path];
        if (source == null) throw new Error(`File not found: ${args.path}`);
        if (args.path.endsWith(".vue")) {
          return {
            contents: compileVueFile(args.path, source),
            loader: "js",
            resolveDir: args.path.split("/").slice(0, -1).join("/")
          };
        }
        return {
          contents: source,
          loader: getLoader(args.path),
          resolveDir: args.path.split("/").slice(0, -1).join("/")
        };
      });
    }
  };
}

async function bundleProject(mode, files, entry, onStatus) {
  if (mode === "html") return makeHtmlPreview(files, entry);

  onStatus?.("Initializing");
  await ensureEsbuild();
  onStatus?.(runtimeConfig.dependencySource === "local" ? "Building" : "Loading dependencies");
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    outdir: "/sandbox-dist",
    format: "iife",
    target: "es2020",
    define: {
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false"
    },
    plugins: [sandboxPlugin(files, onStatus)]
  });

  onStatus?.("Rendering");
  const js = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
  const css = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}<\/script>
  </body>
</html>`;
}

function DraggableSurface({ position, setPosition, className = "", title, children }) {
  const dragRef = useRef(null);

  function startDrag(event) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = position.x;
    const startTop = position.y;

    function moveDrag(moveEvent) {
      const nextX = Math.min(Math.max(8, startLeft + moveEvent.clientX - startX), window.innerWidth - 72);
      const nextY = Math.min(Math.max(8, startTop + moveEvent.clientY - startY), window.innerHeight - 56);
      setPosition({ x: nextX, y: nextY });
    }

    function stopDrag() {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", stopDrag);
      dragRef.current?.releasePointerCapture?.(event.pointerId);
    }

    dragRef.current?.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", stopDrag);
  }

  return (
    <div className={`draggable-surface ${className}`} style={{ left: position.x, top: position.y }}>
      <div
        className="drag-handle"
        ref={dragRef}
        onPointerDown={startDrag}
        role="button"
        tabIndex={0}
        aria-label={`Move ${title}`}
      >
        <GripHorizontal size={18} />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function App() {
  const [mode, setMode] = useState("html");
  const [files, setFiles] = useState(templates.html.files);
  const [activeFile, setActiveFile] = useState(templates.html.entry);
  const [preview, setPreview] = useState(() => makeHtmlPreview(templates.html.files, templates.html.entry));
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("Running");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isDeployMenuOpen, setIsDeployMenuOpen] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiJob, setAiJob] = useState(null);
  const [aiSnapshot, setAiSnapshot] = useState(null);
  const [leftPanelTab, setLeftPanelTab] = useState("project");
  const [isAssetUploading, setIsAssetUploading] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [assets, setAssets] = useState([]);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("current");
  const [savedVersion, setSavedVersion] = useState(null);
  const [layoutMode, setLayoutMode] = useState("classic");
  const [drawerSide, setDrawerSide] = useState("left");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFloatingEditorOpen, setIsFloatingEditorOpen] = useState(false);
  const [isFloatingAiOpen, setIsFloatingAiOpen] = useState(false);
  const [isMonacoVisible, setIsMonacoVisible] = useState(true);
  const [isGrapesEditorOpen, setIsGrapesEditorOpen] = useState(false);
  const [grapesEditor, setGrapesEditor] = useState(null);
  const [grapesDevice, setGrapesDevice] = useState("Desktop");
  const [activeGrapesPanel, setActiveGrapesPanel] = useState("blocks");
  const [isGrapesSidePanelOpen, setIsGrapesSidePanelOpen] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 18, y: 18 });
  const [editorPosition, setEditorPosition] = useState({ x: 84, y: 548 });
  const frameRef = useRef(null);
  const aiEventSourceRef = useRef(null);

  const fileNames = useMemo(() => Object.keys(files), [files]);
  const previewSandbox =
    mode === "html" || runtimeConfig.dependencySource !== "local" ? "allow-scripts" : "allow-scripts allow-same-origin";
  const isCombinedPanelOpen = isFloatingEditorOpen || isFloatingAiOpen;
  const monacoPanelOffset = 462;
  const combinedPanelStyle =
    layoutMode === "preview"
      ? {
          left: editorPosition.x,
          top: Math.max(8, editorPosition.y - (isMonacoVisible ? monacoPanelOffset : 0))
        }
      : undefined;

  function toggleCombinedPanel() {
    const shouldOpen = !isCombinedPanelOpen;
    setIsFloatingEditorOpen(shouldOpen);
    setIsFloatingAiOpen(shouldOpen);
  }

  function closeCombinedPanel() {
    setIsFloatingEditorOpen(false);
    setIsFloatingAiOpen(false);
  }

  function toggleGrapesEditor() {
    setIsGrapesEditorOpen((isOpen) => {
      const nextIsOpen = !isOpen;
      if (!nextIsOpen) {
        setGrapesEditor(null);
        setIsGrapesSidePanelOpen(false);
      } else if (layoutMode === "preview") {
        setActiveGrapesPanel("blocks");
        setIsGrapesSidePanelOpen(true);
      }
      return nextIsOpen;
    });
  }

  function switchGrapesDevice(device) {
    setGrapesDevice(device);
    grapesEditor?.setDevice(device);
  }

  function toggleGrapesPanel(panel) {
    setActiveGrapesPanel(panel);
    setIsGrapesSidePanelOpen(true);
  }

  function updateHtmlFromGrapes(nextPreview) {
    if (mode !== "html" || !activeFile.endsWith(".html")) return;

    const nextFiles = {
      ...files,
      [activeFile]: serializeEditableHtml(files[activeFile], nextPreview.html),
      "style.css": nextPreview.css
    };

    setFiles(nextFiles);
    setPreview(makeHtmlPreview(nextFiles, activeFile));
    setDeployResult(null);
    setSavedVersion(null);
    setSelectedVersion("current");
  }

  function startFloatingDrag(event, position, setPosition) {
    if (layoutMode !== "preview" || event.button !== 0) return;
    if (event.target.closest("button")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = position.x;
    const startTop = position.y;

    function moveDrag(moveEvent) {
      const nextX = Math.min(Math.max(8, startLeft + moveEvent.clientX - startX), window.innerWidth - 96);
      const nextY = Math.min(Math.max(8, startTop + moveEvent.clientY - startY), window.innerHeight - 72);
      setPosition({ x: nextX, y: nextY });
    }

    function stopDrag() {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", stopDrag);
    }

    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", stopDrag);
  }

  async function runProject(entryOverride) {
    setIsRunning(true);
    setRunStatus("Running");
    setError("");
    try {
      const entry =
        entryOverride ?? (mode === "html" && activeFile.endsWith(".html") ? activeFile : templates[mode].entry);
      const html = await bundleProject(mode, files, entry, setRunStatus);
      setPreview(html);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setIsRunning(false);
    }
  }

  function switchMode(nextMode) {
    const nextFiles = templates[nextMode].files;
    const nextEntry = templates[nextMode].entry;
    setMode(nextMode);
    setFiles(nextFiles);
    setActiveFile(nextEntry);
    setPreview(nextMode === "html" ? makeHtmlPreview(nextFiles, nextEntry) : "");
    setError("");
    setDeployResult(null);
    setSavedVersion(null);
    setSelectedVersion("current");
    setIsGrapesEditorOpen(false);
    setGrapesEditor(null);
    setIsGrapesSidePanelOpen(false);
  }

  async function deployHtmlProject(target) {
    if (mode !== "html") return;

    setIsDeployMenuOpen(false);
    setIsDeploying(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/deploy/html"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          target,
          siteId: "demo-html-site",
          files
        })
      });
      const result = await readJsonResponse(response, "Deploy failed");

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Deploy failed");
      }

      setDeployResult(result);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setIsDeploying(false);
    }
  }

  async function saveProjectVersion() {
    if (isSavingVersion) return;

    setIsSavingVersion(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/projects/save-version"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          files,
          message: `Save project version ${new Date().toISOString()}`
        })
      });
      const result = await readJsonResponse(response, "Save failed");

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Save failed");
      }

      setSavedVersion(result);
      setSelectedVersion(result.commitSha);
      await refreshProjectVersions();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setIsSavingVersion(false);
    }
  }

  async function refreshProjectVersions() {
    setIsLoadingVersions(true);

    try {
      const response = await fetch(apiUrl("/api/projects/versions"));
      const result = await readJsonResponse(response, "Failed to load versions");

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Failed to load versions");
      }

      setVersions(result.versions);
    } catch (err) {
      console.warn("Failed to load project versions", err);
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function switchProjectVersion(event) {
    const sha = event.target.value;
    if (!sha || sha === "current" || sha === selectedVersion) return;

    setIsLoadingVersions(true);
    setError("");

    try {
      const response = await fetch(apiUrl(`/api/projects/versions/${encodeURIComponent(sha)}`));
      const result = await readJsonResponse(response, "Failed to load version");

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Failed to load version");
      }

      const nextActiveFile =
        result.files[activeFile] != null
          ? activeFile
          : result.files[templates[mode].entry] != null
            ? templates[mode].entry
            : Object.keys(result.files)[0];

      setFiles(result.files);
      setActiveFile(nextActiveFile);
      setPreview("");
      setDeployResult(null);
      setSelectedVersion(result.sha);
      setSavedVersion({
        repo: result.repo,
        commitSha: result.sha,
        commitUrl: result.url
      });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function uploadAssetToR2(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isAssetUploading) return;

    setIsAssetUploading(true);
    setAssetError("");

    try {
      const signResponse = await fetch(apiUrl("/api/assets/r2/presign"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || "application/octet-stream"
        })
      });
      const signed = await readJsonResponse(signResponse, "Failed to create upload URL");

      if (!signResponse.ok || !signed.ok) {
        throw new Error(signed.error || "Failed to create upload URL");
      }

      const uploadResponse = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed: ${uploadResponse.status}`);
      }

      setAssets((currentAssets) => [
        {
          id: crypto.randomUUID(),
          name: file.name,
          key: signed.key,
          url: signed.publicUrl,
          size: file.size
        },
        ...currentAssets
      ]);
    } catch (err) {
      setAssetError(err.message || String(err));
    } finally {
      setIsAssetUploading(false);
    }
  }

  function closeAiEvents() {
    if (aiEventSourceRef.current) {
      aiEventSourceRef.current.close();
      aiEventSourceRef.current = null;
    }
  }

  async function applyAiEditResult(result, fallbackSummary) {
    const nextFiles = {
      ...files,
      ...result.files
    };
    const nextActiveFile = result.files[activeFile] != null ? activeFile : Object.keys(result.files)[0] || activeFile;
    const entry = nextActiveFile.endsWith(".html") ? nextActiveFile : templates.html.entry;
    const html = await bundleProject("html", nextFiles, entry);

    setFiles(nextFiles);
    setActiveFile(nextActiveFile);
    setPreview(html);
    setAiSummary(result.summary || fallbackSummary || "AI edit completed.");
    setAiInstruction("");
    setAiJob(null);
    setDeployResult(null);
    setSavedVersion(null);
    setSelectedVersion("current");
  }

  async function loadAiJobResult(jobId, fallbackSummary) {
    const response = await fetch(apiUrl(`/api/ai/jobs/${jobId}/result`));
    const result = await readJsonResponse(response, "AI edit result failed");

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "AI edit result failed");
    }

    await applyAiEditResult(result, fallbackSummary);
  }

  function watchAiJob(jobId) {
    closeAiEvents();

    const source = new EventSource(apiUrl(`/api/ai/jobs/${jobId}/events`));
    aiEventSourceRef.current = source;

    const handleProgress = (event) => {
      const data = JSON.parse(event.data || "{}");
      setAiJob(data);
      if (data.stage) {
        const percent = Number.isFinite(data.progress) ? ` ${data.progress}%` : "";
        setAiSummary(`${data.stage}${percent}`);
      }
    };

    for (const eventName of ["connected", "queued", "running", "streaming", "cancel_requested"]) {
      source.addEventListener(eventName, handleProgress);
    }

    source.addEventListener("cancelled", (event) => {
      const data = JSON.parse(event.data || "{}");
      closeAiEvents();
      setAiJob(data);
      setAiSummary("AI edit cancelled.");
      setIsAiEditing(false);
    });

    source.addEventListener("succeeded", async (event) => {
      const data = JSON.parse(event.data || "{}");
      setAiJob(data);
      setAiSummary(data.summary || "AI edit completed.");
      closeAiEvents();
      try {
        await loadAiJobResult(jobId, data.summary);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setIsAiEditing(false);
      }
    });

    source.addEventListener("failed", (event) => {
      const data = JSON.parse(event.data || "{}");
      closeAiEvents();
      setAiJob(data);
      setError(data.error || "AI edit failed");
      setIsAiEditing(false);
    });

    source.onerror = () => {
      setAiSummary("Connection interrupted, checking job status...");
    };
  }

  async function editHtmlWithAi() {
    if (mode !== "html" || isAiEditing) return;

    const instruction = aiInstruction.trim();
    if (!instruction) {
      setError("Describe the change you want AI to make first.");
      return;
    }

    setIsAiEditing(true);
    setError("");
    setAiSummary("Creating AI job...");
    setAiJob(null);
    setAiSnapshot({ files, activeFile, preview });

    try {
      const response = await fetch(apiUrl("/api/ai/jobs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instruction,
          activeFile,
          files
        })
      });
      const result = await readJsonResponse(response, "AI edit failed");

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "AI edit failed");
      }

      setAiJob(result);
      setAiSummary(`Queued AI job ${result.jobId.slice(0, 12)}...`);
      watchAiJob(result.jobId);
    } catch (err) {
      closeAiEvents();
      setError(err.message || String(err));
      setIsAiEditing(false);
    }
  }

  async function cancelAiJob() {
    if (!aiJob?.jobId || !isAiEditing) return;

    try {
      setAiSummary("Cancelling AI job...");
      const response = await fetch(apiUrl(`/api/ai/jobs/${aiJob.jobId}/cancel`), { method: "POST" });
      const result = await readJsonResponse(response, "AI cancel failed");
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "AI cancel failed");
      }
      setAiJob(result.job);
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function undoAiEdit() {
    if (!aiSnapshot) return;

    setFiles(aiSnapshot.files);
    setActiveFile(aiSnapshot.activeFile);
    setPreview(aiSnapshot.preview);
    setAiSummary("Last AI edit was undone.");
    setAiJob(null);
    setAiSnapshot(null);
    setSavedVersion(null);
    setSelectedVersion("current");
  }

  useEffect(() => {
    runProject();
  }, []);

  useEffect(() => {
    refreshProjectVersions();
  }, []);

  useEffect(() => {
    return () => closeAiEvents();
  }, []);

  useEffect(() => {
    if (layoutMode === "classic") {
      setIsGrapesSidePanelOpen(false);
      setIsDrawerOpen(false);
    }
  }, [layoutMode]);

  useEffect(() => {
    if (!runtimeConfig.prewarmEsbuild) return;

    ensureEsbuild().catch((err) => {
      console.warn("Failed to prewarm esbuild", err);
    });
  }, []);

  useEffect(() => {
    function handlePreviewMessage(event) {
      if (mode !== "html" || event.data?.type !== "preview:navigate") return;

      const path = normalizePath(event.data.path);
      if (!path.endsWith(".html") || files[path] == null) return;

      setActiveFile(path);
      runProject(path);
    }

    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [mode, files]);

  return (
    <div
      className={[
        "app-shell",
        layoutMode === "preview" ? "app-shell-preview" : "",
        isDrawerOpen ? "drawer-open" : "",
        `drawer-${drawerSide}`,
        isCombinedPanelOpen ? "editor-open" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="topbar">
        <div className="brand">
          <Code2 size={22} />
          <span>Online Code Preview</span>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Project template">
          {Object.entries(templates).map(([key, template]) => (
            <button
              className={key === mode ? "active" : ""}
              key={key}
              onClick={() => switchMode(key)}
              type="button"
            >
              {template.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="icon-button" title="Reset template" onClick={() => switchMode(mode)}>
            <RotateCcw size={18} />
          </button>
          {mode === "html" && (
            <div className="deploy-menu">
              <button
                type="button"
                className="deploy-button"
                onClick={() => setIsDeployMenuOpen((isOpen) => !isOpen)}
                disabled={isDeploying}
                aria-haspopup="menu"
                aria-expanded={isDeployMenuOpen}
              >
                {isDeploying ? <Loader2 size={17} className="spin" /> : <UploadCloud size={17} />}
                {isDeploying ? "Publishing" : "Publish"}
                <ChevronDown size={16} />
              </button>
              {isDeployMenuOpen && (
                <div className="deploy-menu-list" role="menu">
                  {deployTargets.map((target) => {
                    const Icon = target.icon;

                    return (
                      <button
                        type="button"
                        role="menuitem"
                        key={target.key}
                        onClick={() => deployHtmlProject(target.key)}
                      >
                        <Icon size={16} />
                        <span>{target.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button type="button" className="run-button" onClick={() => runProject()} disabled={isRunning}>
            {isRunning ? <Loader2 size={17} className="spin" /> : <Play size={17} />}
            {isRunning ? runStatus : "Run"}
          </button>
        </div>
      </header>

      <DraggableSurface className="floating-toolbar" position={toolbarPosition} setPosition={setToolbarPosition} title="Tools">
        <div className="floating-toolbar-actions">
          <button
            type="button"
            className={layoutMode === "classic" ? "active" : ""}
            title="Classic layout"
            onClick={() => setLayoutMode("classic")}
          >
            <LayoutDashboard size={17} />
          </button>
          <button
            type="button"
            className={layoutMode === "preview" ? "active" : ""}
            title="Full preview layout"
            onClick={() => setLayoutMode("preview")}
          >
            <Maximize2 size={17} />
          </button>
          <button type="button" title="Reset template" onClick={() => switchMode(mode)}>
            <RotateCcw size={17} />
          </button>
          {layoutMode === "preview" && (
            <button
              type="button"
              className={isDrawerOpen ? "active" : ""}
              title="Project and assets"
              onClick={() => setIsDrawerOpen((isOpen) => !isOpen)}
            >
              {drawerSide === "left" ? <PanelLeftOpen size={17} /> : <PanelRightOpen size={17} />}
            </button>
          )}
          {layoutMode === "preview" && (
            <button
              type="button"
              className={isCombinedPanelOpen ? "active" : ""}
              title="Code and AI editor"
              onClick={toggleCombinedPanel}
            >
              <Code2 size={17} />
            </button>
          )}
          {mode === "html" && (
            <button
              type="button"
              className={isGrapesEditorOpen ? "active" : ""}
              title={
                activeFile.endsWith(".html")
                  ? isGrapesEditorOpen
                    ? "Close GrapesJS preview editor"
                    : "Edit preview with GrapesJS"
                  : "Select an HTML page to edit with GrapesJS"
              }
              onClick={toggleGrapesEditor}
              disabled={!activeFile.endsWith(".html") && !isGrapesEditorOpen}
            >
              <Paintbrush size={17} />
            </button>
          )}
          {mode === "html" && (
            <div className="deploy-menu">
              <button
                type="button"
                className="deploy-button"
                onClick={() => setIsDeployMenuOpen((isOpen) => !isOpen)}
                disabled={isDeploying}
                aria-haspopup="menu"
                aria-expanded={isDeployMenuOpen}
                title="Publish"
              >
                {isDeploying ? <Loader2 size={17} className="spin" /> : <UploadCloud size={17} />}
                <ChevronDown size={15} />
              </button>
              {isDeployMenuOpen && (
                <div className="deploy-menu-list" role="menu">
                  {deployTargets.map((target) => {
                    const Icon = target.icon;

                    return (
                      <button type="button" role="menuitem" key={target.key} onClick={() => deployHtmlProject(target.key)}>
                        <Icon size={16} />
                        <span>{target.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <button type="button" className="run-button" onClick={() => runProject()} disabled={isRunning} title={runStatus}>
            {isRunning ? <Loader2 size={17} className="spin" /> : <Play size={17} />}
            <span>{isRunning ? runStatus : "Run"}</span>
          </button>
        </div>
      </DraggableSurface>

      <main className="workspace">
        <aside className="file-panel">
          <button className="drawer-close" type="button" onClick={() => setIsDrawerOpen(false)} title="Close panel">
            <X size={16} />
          </button>
          <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
            <button
              className={leftPanelTab === "project" ? "active" : ""}
              onClick={() => setLeftPanelTab("project")}
              type="button"
              role="tab"
              aria-selected={leftPanelTab === "project"}
            >
              <Folder size={15} />
              Project
            </button>
            <button
              className={leftPanelTab === "assets" ? "active" : ""}
              onClick={() => setLeftPanelTab("assets")}
              type="button"
              role="tab"
              aria-selected={leftPanelTab === "assets"}
            >
              <Database size={15} />
              Assets
            </button>
          </div>
          {leftPanelTab === "project" ? (
            <div className="project-panel">
              <div className="project-toolbar">
                <button type="button" onClick={saveProjectVersion} disabled={isSavingVersion}>
                  {isSavingVersion ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                  Save version
                </button>
                <select
                  value={selectedVersion}
                  onChange={switchProjectVersion}
                  disabled={isLoadingVersions || !versions.length}
                  aria-label="Switch version"
                >
                  <option value="current">{isLoadingVersions ? "Loading versions..." : "Current editing version"}</option>
                  {versions.map((version) => (
                    <option value={version.sha} key={version.sha}>
                      {new Date(version.savedAt).toLocaleString("zh-CN")} - {version.shortSha}
                    </option>
                  ))}
                </select>
              </div>
              {savedVersion && (
                <a className="version-link" href={savedVersion.commitUrl} target="_blank" rel="noreferrer">
                  {savedVersion.repo}@{savedVersion.commitSha.slice(0, 7)}
                </a>
              )}
              <div className="file-list">
                {fileNames.map((name) => (
                  <button
                    className={name === activeFile ? "file active" : "file"}
                    key={name}
                    onClick={() => setActiveFile(name)}
                    type="button"
                  >
                    <FileCode2 size={15} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="asset-panel">
              <label className="asset-upload-button">
                {isAssetUploading ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />}
                {isAssetUploading ? "Uploading..." : "Upload asset"}
                <input type="file" onChange={uploadAssetToR2} disabled={isAssetUploading} />
              </label>
              {assetError && <div className="asset-error">{assetError}</div>}
              <div className="asset-list">
                {assets.length ? (
                  assets.map((asset) => (
                    <div className="asset-item" key={asset.id}>
                      <div>
                        <strong>{asset.name}</strong>
                        <span>{asset.key}</span>
                      </div>
                      {asset.url ? (
                        <a href={asset.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="asset-url-missing">No public URL</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="asset-empty">No assets yet</div>
                )}
              </div>
            </div>
          )}
        </aside>

        <section
          className={`editor-panel ${layoutMode === "preview" && !isMonacoVisible ? "monaco-collapsed" : ""}`}
          style={combinedPanelStyle}
        >
          <div className="panel-title" onPointerDown={(event) => startFloatingDrag(event, editorPosition, setEditorPosition)}>
            <span>{activeFile}</span>
            {!isEditorReady && <span className="muted">Loading editor</span>}
            {layoutMode === "preview" && (
              <button className="panel-close" type="button" onClick={closeCombinedPanel} title="Close editor">
                <X size={15} />
              </button>
            )}
          </div>
          <div className="editor-frame">
            <Editor
              height="100%"
              language={getLanguage(activeFile)}
              path={activeFile}
              theme="vs-dark"
              value={files[activeFile]}
              onMount={() => setIsEditorReady(true)}
              onChange={(value) => {
                setFiles({ ...files, [activeFile]: value ?? "" });
                setSavedVersion(null);
                setSelectedVersion("current");
              }}
              options={{
                automaticLayout: true,
                fontFamily: "Cascadia Code, Consolas, monospace",
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 14, bottom: 14 },
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: "on"
              }}
            />
          </div>
          {mode === "html" && (
            <div className="ai-panel">
              <div className="ai-title" onPointerDown={(event) => startFloatingDrag(event, editorPosition, setEditorPosition)}>
                <span>
                  <Bot size={16} />
                  AI Edit HTML
                </span>
                {aiSummary && <span className="ai-summary">{aiSummary}</span>}
                {layoutMode === "preview" && (
                  <div className="ai-title-actions">
                    <button
                      className="panel-close"
                      type="button"
                      onClick={() => setIsMonacoVisible((isVisible) => !isVisible)}
                      title={isMonacoVisible ? "Hide Monaco Editor" : "Show Monaco Editor"}
                    >
                      <Code2 size={15} />
                    </button>
                    <button className="panel-close" type="button" onClick={closeCombinedPanel} title="Close panel">
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="ai-controls">
                <textarea
                  value={aiInstruction}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  placeholder="Describe the HTML change you want AI to make"
                  rows={3}
                  disabled={isAiEditing}
                />
                <div className="ai-actions">
                  {aiJob && (
                    <span className="ai-job-status" title={aiJob.jobId || ""}>
                      {aiJob.status}
                      {Number.isFinite(aiJob.progress) ? ` ${aiJob.progress}%` : ""}
                    </span>
                  )}
                  {isAiEditing && aiJob?.jobId && (
                    <button type="button" className="ai-cancel-button" onClick={cancelAiJob}>
                      <X size={16} />
                      Cancel
                    </button>
                  )}
                  <button type="button" className="ai-undo-button" onClick={undoAiEdit} disabled={!aiSnapshot || isAiEditing}>
                    <RotateCcw size={16} />
                    Undo
                  </button>
                  <button type="button" className="ai-edit-button" onClick={editHtmlWithAi} disabled={isAiEditing}>
                    {isAiEditing ? <Loader2 size={16} className="spin" /> : <Bot size={16} />}
                    {isAiEditing ? "Editing" : "Ask AI"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="preview-panel">
          <div className="panel-title">
            <span>Preview</span>
            {deployResult && (
              <a
                className="deploy-link"
                href={deployResult.url || deployResult.githubCommitUrl}
                target="_blank"
                rel="noreferrer"
              >
                Published to {deployTargets.find((target) => target.key === deployResult.target)?.label || "Target"}
              </a>
            )}
          </div>
          {error ? (
            <div className="error-box">
              <AlertTriangle size={18} />
              <pre>{error}</pre>
            </div>
          ) : isGrapesEditorOpen && mode === "html" && activeFile.endsWith(".html") ? (
            <GrapesPreviewEditor
              key={activeFile}
              html={extractEditableHtml(files[activeFile])}
              css={files["style.css"] ?? ""}
              isOverlayLayout={layoutMode === "preview"}
              isSidePanelOpen={isGrapesSidePanelOpen}
              activePanel={activeGrapesPanel}
              panelToolbar={
                layoutMode === "preview" ? (
                  <div className="grapes-panel-controls">
                    <button
                      type="button"
                      className={grapesDevice === "Desktop" ? "active" : ""}
                      title="Desktop preview"
                      onClick={() => switchGrapesDevice("Desktop")}
                    >
                      <Monitor size={17} />
                    </button>
                    <button
                      type="button"
                      className={grapesDevice === "Tablet" ? "active" : ""}
                      title="Tablet preview"
                      onClick={() => switchGrapesDevice("Tablet")}
                    >
                      <Tablet size={17} />
                    </button>
                    <button
                      type="button"
                      className={grapesDevice === "Mobile portrait" ? "active" : ""}
                      title="Mobile preview"
                      onClick={() => switchGrapesDevice("Mobile portrait")}
                    >
                      <Smartphone size={17} />
                    </button>
                    <span className="toolbar-divider" aria-hidden="true" />
                    <button
                      type="button"
                      className={isGrapesSidePanelOpen && activeGrapesPanel === "blocks" ? "active" : ""}
                      title="Blocks"
                      onClick={() => toggleGrapesPanel("blocks")}
                    >
                      <LayoutDashboard size={17} />
                    </button>
                    <button
                      type="button"
                      className={isGrapesSidePanelOpen && activeGrapesPanel === "layers" ? "active" : ""}
                      title="Layer manager"
                      onClick={() => toggleGrapesPanel("layers")}
                    >
                      <Layers size={17} />
                    </button>
                    <button
                      type="button"
                      className={isGrapesSidePanelOpen && activeGrapesPanel === "styles" ? "active" : ""}
                      title="Style manager"
                      onClick={() => toggleGrapesPanel("styles")}
                    >
                      <SlidersHorizontal size={17} />
                    </button>
                    <button
                      type="button"
                      className={isGrapesSidePanelOpen && activeGrapesPanel === "settings" ? "active" : ""}
                      title="Settings"
                      onClick={() => toggleGrapesPanel("settings")}
                    >
                      <Settings size={17} />
                    </button>
                  </div>
                ) : null
              }
              onChange={updateHtmlFromGrapes}
              onReady={(editor) => {
                setGrapesEditor(editor);
                editor?.setDevice(grapesDevice);
              }}
            />
          ) : (
            <iframe ref={frameRef} title="preview" sandbox={previewSandbox} srcDoc={preview} />
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
