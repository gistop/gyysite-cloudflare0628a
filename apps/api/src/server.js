import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import OSS from "ali-oss";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(apiRoot, "../..");
dotenv.config({ path: path.join(workspaceRoot, ".env") });
dotenv.config({ path: path.join(apiRoot, ".env") });

const app = express();
const port = Number(process.env.PORT || 3001);
const publishRoot = path.resolve(process.env.PUBLISH_ROOT || "published-sites");
const maxFileCount = Number(process.env.MAX_FILE_COUNT || 80);
const maxTotalBytes = Number(process.env.MAX_TOTAL_BYTES || 2 * 1024 * 1024);
const maxAssetBytes = Number(process.env.R2_MAX_ASSET_BYTES || 20 * 1024 * 1024);
const deployTargets = new Set(["web", "oss", "cloudflare"]);
const allowedExtensions = new Set([".html", ".css", ".js", ".json", ".txt", ".svg", ".png", ".jpg", ".jpeg", ".webp"]);
const projectAllowedExtensions = new Set([
  ...allowedExtensions,
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".md"
]);
const projectRepositoryName = process.env.GITHUB_PROJECT_REPO || "testsite";
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);
const deepseek = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "missing-key"
});

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || "4mb" }));
app.use("/sites", express.static(publishRoot));

function makeSiteId(input) {
  const slug = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || `site-${crypto.randomUUID().slice(0, 8)}`;
}

function makeRepositoryName(input) {
  const slug = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);

  return slug || "testsite";
}

function encodeRfc3986(input) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3Path(input) {
  return input.split("/").map(encodeRfc3986).join("/");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitizeR2ObjectKey(fileName) {
  const rawName = String(fileName || "").replaceAll("\\", "/").split("/").pop() || "asset";
  const ext = path.posix.extname(rawName).toLowerCase();
  const baseName = path.posix.basename(rawName, ext);
  const safeBase =
    baseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset";
  const prefix = (process.env.R2_ASSET_PREFIX || "assets").replace(/^\/+|\/+$/g, "");
  const date = new Date().toISOString().slice(0, 10);

  return `${prefix}/${date}/${crypto.randomUUID().slice(0, 8)}-${safeBase}${ext}`;
}

function getR2Config() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_ENDPOINT,
    R2_PUBLIC_BASE_URL
  } = process.env;

  const endpoint = (R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "")).replace(
    /\/+$/g,
    ""
  );

  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("R2 is not configured");
  }

  return {
    endpoint,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL?.replace(/\/+$/g, "") || ""
  };
}

function createR2PresignedPutUrl({ key, expiresIn = 300 }) {
  const { endpoint, accessKeyId, secretAccessKey, bucket, publicBaseUrl } = getR2Config();
  const endpointUrl = new URL(endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodeS3Path(key)}`;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(Math.max(Number(expiresIn) || 300, 1), 604800)),
    "X-Amz-SignedHeaders": "host"
  };
  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalHeaders = `host:${endpointUrl.host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const uploadUrl = `${endpointUrl.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${encodeS3Path(key)}` : "";

  return { uploadUrl, key, publicUrl, expiresIn: Number(query["X-Amz-Expires"]) };
}

function normalizeProjectPath(filePath, extensions = allowedExtensions) {
  const normalized = path.posix.normalize(String(filePath || "").replaceAll("\\", "/"));

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  const ext = path.posix.extname(normalized).toLowerCase();
  if (!extensions.has(ext)) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  return normalized;
}

function validateHtmlFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("files must be an object");
  }

  const entries = Object.entries(files);
  if (!entries.length) throw new Error("files cannot be empty");
  if (entries.length > maxFileCount) throw new Error(`Too many files. Max: ${maxFileCount}`);

  let totalBytes = 0;
  const normalizedFiles = new Map();

  for (const [filePath, content] of entries) {
    if (typeof content !== "string") {
      throw new Error(`File content must be text: ${filePath}`);
    }

    const normalizedPath = normalizeProjectPath(filePath);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > maxTotalBytes) throw new Error(`Project is too large. Max bytes: ${maxTotalBytes}`);

    normalizedFiles.set(normalizedPath, content);
  }

  if (!normalizedFiles.has("index.html")) {
    throw new Error("HTML project must include index.html");
  }

  return normalizedFiles;
}

function validateProjectFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("files must be an object");
  }

  const entries = Object.entries(files);
  if (!entries.length) throw new Error("files cannot be empty");
  if (entries.length > maxFileCount) throw new Error(`Too many files. Max: ${maxFileCount}`);

  let totalBytes = 0;
  const normalizedFiles = new Map();

  for (const [filePath, content] of entries) {
    if (typeof content !== "string") {
      throw new Error(`File content must be text: ${filePath}`);
    }

    const normalizedPath = normalizeProjectPath(filePath, projectAllowedExtensions);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > maxTotalBytes) throw new Error(`Project is too large. Max bytes: ${maxTotalBytes}`);

    normalizedFiles.set(normalizedPath, content);
  }

  return normalizedFiles;
}

function validateReturnedHtmlFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("AI response files must be an object");
  }

  const normalizedFiles = {};
  let totalBytes = 0;

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      throw new Error(`AI response file content must be text: ${filePath}`);
    }

    const normalizedPath = normalizeProjectPath(filePath);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > maxTotalBytes) throw new Error(`AI response is too large. Max bytes: ${maxTotalBytes}`);

    normalizedFiles[normalizedPath] = content;
  }

  if (!Object.keys(normalizedFiles).length) {
    throw new Error("AI response did not include any files");
  }

  return normalizedFiles;
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI response was not valid JSON");
    }

    return JSON.parse(content.slice(start, end + 1));
  }
}

function buildHtmlEditMessages({ instruction, activeFile, files }) {
  const serializedFiles = JSON.stringify(Object.fromEntries(files), null, 2);

  return [
    {
      role: "system",
      content: [
        "You are a frontend code editing assistant for a browser-only HTML project.",
        "Return JSON only. Do not return Markdown, code fences, or explanations outside JSON.",
        "The JSON shape must be: {\"summary\":\"short Chinese summary\",\"files\":{\"path\":\"full updated file content\"}}.",
        "Only edit files that belong to the given HTML project.",
        "Use complete file contents for every changed file.",
        "Keep the project directly runnable in a browser.",
        "Do not add backend code or require a build step.",
        "Avoid external scripts and remote dependencies unless the user explicitly asks for them."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Active file: ${activeFile}`,
        `User instruction: ${instruction}`,
        "Current project files JSON:",
        serializedFiles
      ].join("\n\n")
    }
  ];
}

async function writeLocalSite(siteId, files) {
  const siteDir = path.join(publishRoot, siteId);
  await fs.mkdir(siteDir, { recursive: true });

  for (const [filePath, content] of files) {
    const targetPath = path.join(siteDir, filePath);
    const resolved = path.resolve(targetPath);

    if (!resolved.startsWith(siteDir)) {
      throw new Error(`Invalid resolved path: ${filePath}`);
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
  }
}

function getOssClient() {
  const { OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET } = process.env;
  if (!OSS_REGION || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) return null;

  return new OSS({
    region: OSS_REGION,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    bucket: OSS_BUCKET,
    secure: true
  });
}

async function uploadOssSite(siteId, files) {
  const client = getOssClient();
  if (!client) throw new Error("OSS is not configured");

  const prefix = (process.env.OSS_PREFIX || "sites").replace(/^\/+|\/+$/g, "");

  for (const [filePath, content] of files) {
    const objectKey = `${prefix}/${siteId}/${filePath}`;
    const contentType = contentTypes.get(path.posix.extname(filePath).toLowerCase()) || "application/octet-stream";

    await client.put(objectKey, Buffer.from(content, "utf8"), {
      headers: {
        "Content-Type": contentType
      }
    });
  }

  const publicBaseUrl = process.env.OSS_PUBLIC_BASE_URL?.replace(/\/+$/g, "");
  if (!publicBaseUrl) throw new Error("OSS_PUBLIC_BASE_URL is not configured");

  return `${publicBaseUrl}/${prefix}/${siteId}/index.html`;
}

function getGitHubConfig() {
  const {
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_BRANCH = "main",
    GITHUB_TOKEN,
    GITHUB_PUBLISH_PREFIX = "",
    CLOUDFLARE_PAGES_URL
  } = process.env;

  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error("GitHub publishing is not configured");
  }

  return {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
    token: GITHUB_TOKEN,
    prefix: GITHUB_PUBLISH_PREFIX.replace(/^\/+|\/+$/g, ""),
    cloudflarePagesUrl: CLOUDFLARE_PAGES_URL?.replace(/\/+$/g, "")
  };
}

function getPublishGitHubConfig() {
  const config = getGitHubConfig();
  const projectRepo = process.env.GITHUB_PROJECT_REPO?.trim();

  if (!projectRepo) {
    return config;
  }

  return {
    ...config,
    repo: makeRepositoryName(projectRepo)
  };
}

function getGitHubCredentials() {
  const { GITHUB_OWNER, GITHUB_BRANCH = "main", GITHUB_TOKEN } = process.env;

  if (!GITHUB_OWNER || !GITHUB_TOKEN) {
    throw new Error("GITHUB_OWNER and GITHUB_TOKEN are required");
  }

  return {
    owner: GITHUB_OWNER,
    branch: GITHUB_BRANCH,
    token: GITHUB_TOKEN
  };
}

function getCloudflareConfig() {
  const {
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_PAGES_PROJECT_NAME = "",
    CLOUDFLARE_PAGES_URL,
    CLOUDFLARE_D1_BINDING_NAME = "DB",
    CLOUDFLARE_D1_DATABASE_ID = "",
    CLOUDFLARE_D1_DATABASE_NAME = ""
  } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) return null;

  return {
    accountId: CLOUDFLARE_ACCOUNT_ID,
    apiToken: CLOUDFLARE_API_TOKEN,
    projectName: CLOUDFLARE_PAGES_PROJECT_NAME.trim() || undefined,
    pagesUrl: CLOUDFLARE_PAGES_URL?.replace(/\/+$/g, ""),
    d1BindingName: CLOUDFLARE_D1_BINDING_NAME.trim() || "DB",
    d1DatabaseId: CLOUDFLARE_D1_DATABASE_ID.trim(),
    d1DatabaseName: CLOUDFLARE_D1_DATABASE_NAME.trim()
  };
}

function getCloudflareProjectName() {
  const config = getCloudflareConfig();
  const fallback = makeRepositoryName(projectRepositoryName || "pages");
  return makeRepositoryName(config?.projectName || fallback);
}

async function requestCloudflare(pathname, options = {}) {
  const config = getCloudflareConfig();
  if (!config) throw new Error("Cloudflare Pages is not configured");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        "User-Agent": "gyysite-pages-publisher",
        ...options.headers
      }
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const details = Array.isArray(body.errors)
      ? body.errors.map((item) => item.message || item.code || JSON.stringify(item)).join("; ")
      : body.message || "";
    const error = new Error([body.message || `Cloudflare request failed: ${response.status}`, details].filter(Boolean).join(": "));
    error.status = response.status;
    error.cloudflare = body;
    throw error;
  }

  return body.result !== undefined ? body.result : body;
}

async function updateCloudflarePagesProjectSource(projectName, repoOwner, repoName, branch) {
  return await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: {
        type: "github",
        config: {
          owner: repoOwner,
          repo_name: repoName,
          production_branch: branch,
          deployments_enabled: true
        }
      },
      build_config: {
        build_command: "",
        destination_dir: ".",
        root_dir: "/"
      }
    })
  });
}

async function ensureCloudflarePagesProject(repoOwner, repoName, branch) {
  const config = getCloudflareConfig();
  if (!config) return null;

  const projectName = getCloudflareProjectName();

  let existingProject = null;
  try {
    existingProject = await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  if (existingProject) {
    const source = existingProject.source || {};
    const sourceConfig = source.config || {};
    const needsSourceUpdate =
      source.type !== "github" ||
      sourceConfig.owner !== repoOwner ||
      sourceConfig.repo_name !== repoName ||
      sourceConfig.production_branch !== branch ||
      existingProject?.status === "disconnected";

    if (needsSourceUpdate) {
      return await updateCloudflarePagesProjectSource(projectName, repoOwner, repoName, branch);
    }

    return existingProject;
  }

  const body = {
    name: projectName,
    production_branch: branch,
    source: {
      type: "github",
      config: {
        owner: repoOwner,
        repo_name: repoName,
        production_branch: branch,
        deployments_enabled: true
      }
    },
    build_config: {
      build_command: "",
      destination_dir: ".",
      root_dir: "/"
    }
  };

  try {
    return await requestCloudflare(`/pages/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error.status === 409) {
      return await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`);
    }
    throw error;
  }
}

function getCloudflareD1Config() {
  const config = getCloudflareConfig();
  if (!config || (!config.d1DatabaseId && !config.d1DatabaseName)) return null;

  return {
    bindingName: config.d1BindingName,
    databaseId: config.d1DatabaseId,
    databaseName: config.d1DatabaseName
  };
}

async function findCloudflareD1DatabaseByName(databaseName) {
  const databases = await requestCloudflare(
    `/d1/database?name=${encodeURIComponent(databaseName)}&per_page=100`
  );
  const list = Array.isArray(databases) ? databases : databases?.result || [];

  return list.find((database) => database.name === databaseName) || null;
}

async function ensureCloudflareD1Database() {
  const d1Config = getCloudflareD1Config();
  if (!d1Config) return null;

  if (d1Config.databaseId) {
    return {
      id: d1Config.databaseId,
      name: d1Config.databaseName || null,
      created: false
    };
  }

  const existing = await findCloudflareD1DatabaseByName(d1Config.databaseName);
  if (existing?.uuid || existing?.id) {
    return {
      id: existing.uuid || existing.id,
      name: existing.name,
      created: false
    };
  }

  const created = await requestCloudflare("/d1/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: d1Config.databaseName })
  });

  return {
    id: created.uuid || created.id,
    name: created.name || d1Config.databaseName,
    created: true
  };
}

function withD1Binding(deploymentConfig, bindingName, databaseId) {
  const current = deploymentConfig && typeof deploymentConfig === "object" ? deploymentConfig : {};

  return {
    ...current,
    d1_databases: {
      ...(current.d1_databases || {}),
      [bindingName]: {
        ...(current.d1_databases?.[bindingName] || {}),
        id: databaseId
      }
    }
  };
}

async function ensureCloudflarePagesD1Binding(projectName) {
  const d1Config = getCloudflareD1Config();
  if (!d1Config) return null;

  const database = await ensureCloudflareD1Database();
  if (!database?.id) throw new Error("Cloudflare D1 database id is missing");

  const project = await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`);
  const deploymentConfigs = project.deployment_configs || {};
  const production = withD1Binding(deploymentConfigs.production, d1Config.bindingName, database.id);
  const preview = withD1Binding(deploymentConfigs.preview, d1Config.bindingName, database.id);
  const alreadyBound =
    deploymentConfigs.production?.d1_databases?.[d1Config.bindingName]?.id === database.id &&
    deploymentConfigs.preview?.d1_databases?.[d1Config.bindingName]?.id === database.id;

  if (!alreadyBound) {
    await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deployment_configs: {
          production,
          preview
        }
      })
    });
  }

  const updatedProject = await requestCloudflare(`/pages/projects/${encodeURIComponent(projectName)}`);
  const updatedConfigs = updatedProject.deployment_configs || {};
  const productionId = updatedConfigs.production?.d1_databases?.[d1Config.bindingName]?.id;
  const previewId = updatedConfigs.preview?.d1_databases?.[d1Config.bindingName]?.id;

  if (productionId !== database.id || previewId !== database.id) {
    throw new Error(
      `Cloudflare Pages D1 binding was not applied for ${d1Config.bindingName}`
    );
  }

  return {
    bindingName: d1Config.bindingName,
    databaseId: database.id,
    databaseName: database.name,
    databaseCreated: database.created,
    bound: true,
    updated: !alreadyBound
  };
}

async function createCloudflarePagesDeployment(branch) {
  const config = getCloudflareConfig();
  if (!config) return null;

  const projectName = getCloudflareProjectName();
  const pathname = `/pages/projects/${encodeURIComponent(projectName)}/deployments`;

  try {
    return await requestCloudflare(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch })
    });
  } catch (error) {
    if (![400, 415, 422].includes(error.status)) throw error;

    return await requestCloudflare(pathname, {
      method: "POST"
    });
  }
}

async function requestGitHubApi(pathname, options = {}) {
  const { token } = getGitHubCredentials();
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "gyysite-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = Array.isArray(body.errors)
      ? body.errors.map((item) => item.message || item.code || JSON.stringify(item)).join("; ")
      : "";
    const error = new Error(
      [body.message || `GitHub request failed: ${response.status}`, details].filter(Boolean).join(": ")
    );
    error.status = response.status;
    error.github = body;
    throw error;
  }

  return body;
}

async function requestGitHub(pathname, options = {}) {
  const { owner, repo, token } = getGitHubConfig();
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "gyysite-publisher",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });

  if (response.status === 404) return null;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `GitHub request failed: ${response.status}`);
  }

  return body;
}

async function ensureGitHubRepository(repo) {
  const { owner, branch } = getGitHubCredentials();
  const repoName = makeRepositoryName(repo);
  let repository = null;

  try {
    repository = await requestGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  if (!repository) {
    const user = await requestGitHubApi("/user");
    const endpoint =
      user.login.toLowerCase() === owner.toLowerCase()
        ? "/user/repos"
        : `/orgs/${encodeURIComponent(owner)}/repos`;

    repository = await requestGitHubApi(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: repoName,
        description: "Saved website project versions",
        private: false,
        auto_init: true
      })
    });
  }

  return {
    owner: repository.owner?.login || owner,
    repo: repository.name,
    branch: repository.default_branch || branch,
    url: repository.html_url,
    created: !repository.pushed_at
  };
}

async function requestProjectRepository(repo, pathname, options = {}) {
  const { owner } = getGitHubCredentials();
  return requestGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${pathname}`, options);
}

async function saveGitHubProjectVersion(files, message) {
  const repository = await ensureGitHubRepository(projectRepositoryName);
  const branch = repository.branch;
  const ref = await requestProjectRepository(repository.repo, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const baseCommitSha = ref.object?.sha;
  if (!baseCommitSha) throw new Error(`GitHub branch has no commit: ${branch}`);

  const baseCommit = await requestProjectRepository(repository.repo, `/git/commits/${encodeURIComponent(baseCommitSha)}`);
  const tree = await requestProjectRepository(repository.repo, "/git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tree: [...files].map(([filePath, content]) => ({
        path: filePath,
        mode: "100644",
        type: "blob",
        content
      }))
    })
  });
  const commit = await requestProjectRepository(repository.repo, "/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseCommitSha]
    })
  });

  await requestProjectRepository(repository.repo, `/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sha: commit.sha,
      force: false
    })
  });

  return {
    repository,
    branch,
    commitSha: commit.sha,
    commitUrl: commit.html_url
  };
}

async function listGitHubProjectVersions() {
  const { owner, branch } = getGitHubCredentials();
  const repo = makeRepositoryName(projectRepositoryName);
  let repository;

  try {
    repository = await requestGitHubApi(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }

  const commits = await requestProjectRepository(
    repo,
    `/commits?sha=${encodeURIComponent(repository.default_branch || branch)}&per_page=100`
  );

  return commits
    .filter((item) => item.commit?.message?.startsWith("Save project version"))
    .slice(0, 30)
    .map((item) => ({
      sha: item.sha,
      shortSha: item.sha.slice(0, 7),
      message: item.commit.message.split("\n")[0],
      savedAt: item.commit.author?.date || item.commit.committer?.date || null,
      author: item.commit.author?.name || item.author?.login || "",
      url: item.html_url
    }));
}

async function loadGitHubProjectVersion(sha) {
  const repo = makeRepositoryName(projectRepositoryName);
  const commit = await requestProjectRepository(repo, `/git/commits/${encodeURIComponent(sha)}`);
  const tree = await requestProjectRepository(
    repo,
    `/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`
  );

  if (tree.truncated) {
    throw new Error("This project version is too large to load");
  }

  const blobs = tree.tree.filter((item) => {
    if (item.type !== "blob") return false;
    const ext = path.posix.extname(item.path).toLowerCase();
    return projectAllowedExtensions.has(ext);
  });

  if (!blobs.length) throw new Error("This version does not contain project files");
  if (blobs.length > maxFileCount) throw new Error(`Too many files. Max: ${maxFileCount}`);

  const files = {};
  let totalBytes = 0;

  await Promise.all(
    blobs.map(async (item) => {
      const blob = await requestProjectRepository(repo, `/git/blobs/${encodeURIComponent(item.sha)}`);
      if (blob.encoding !== "base64") throw new Error(`Unsupported GitHub blob encoding: ${item.path}`);

      const content = Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8");
      totalBytes += Buffer.byteLength(content, "utf8");
      if (totalBytes > maxTotalBytes) throw new Error(`Project is too large. Max bytes: ${maxTotalBytes}`);
      files[normalizeProjectPath(item.path, projectAllowedExtensions)] = content;
    })
  );

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.message.split("\n")[0],
    savedAt: commit.author?.date || commit.committer?.date || null,
    url: `https://github.com/${getGitHubCredentials().owner}/${repo}/commit/${commit.sha}`,
    files
  };
}

async function getGitHubFileSha(filePath, branch) {
  const encodedPath = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const existing = await requestGitHub(`/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
  return existing?.sha || null;
}

async function publishGitHubSite(siteId, files) {
  const { owner, repo, branch, prefix, cloudflarePagesUrl } = getPublishGitHubConfig();
  const commitUrls = [];

  for (const [filePath, content] of files) {
    const githubPath = prefix ? `${prefix}/${filePath}` : filePath;
    const sha = await getGitHubFileSha(githubPath, branch);
    const encodedPath = githubPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const result = await requestGitHub(`/contents/${encodedPath}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Publish ${siteId}: ${filePath}`,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });

    if (result?.commit?.html_url) commitUrls.push(result.commit.html_url);
  }

  const sitePath = prefix ? `${prefix}/index.html` : "index.html";
  let cloudflareUrl = cloudflarePagesUrl ? `${cloudflarePagesUrl}/${sitePath}` : null;
  let cloudflareDeployment = null;
  let cloudflareError = null;
  let cloudflareD1Binding = null;

  try {
    const project = await ensureCloudflarePagesProject(owner, repo, branch);
    if (project) {
      cloudflareD1Binding = await ensureCloudflarePagesD1Binding(getCloudflareProjectName());
    }
    cloudflareDeployment = await createCloudflarePagesDeployment(branch);

    if (cloudflareDeployment?.url) {
      cloudflareUrl = cloudflareDeployment.url;
    } else if (cloudflareDeployment?.deployment_trigger?.metadata?.deployment_url) {
      cloudflareUrl = cloudflareDeployment.deployment_trigger.metadata.deployment_url;
    }

    if (!cloudflareDeployment?.url && project?.canonical_deployment?.url) {
      cloudflareUrl = project.canonical_deployment.url;
    } else if (!cloudflareDeployment?.url && project?.subdomain) {
      cloudflareUrl = `https://${project.subdomain}`;
    }
  } catch (error) {
    cloudflareError = error.message || String(error);
    console.warn("Cloudflare Pages project ensure failed:", error.message || error);
    if (getCloudflareD1Config()) {
      throw error;
    }
  }

  return {
    cloudflareUrl,
    cloudflareDeploymentId: cloudflareDeployment?.id || null,
    cloudflareDeploymentUrl: cloudflareDeployment?.url || null,
    cloudflareD1Binding,
    cloudflareError,
    githubCommitUrl: commitUrls.at(-1) || null,
    githubCommitUrls: commitUrls
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/assets/r2/presign", (req, res) => {
  try {
    const fileName = String(req.body?.fileName || "").trim();
    const fileSize = Number(req.body?.fileSize || 0);

    if (!fileName) throw new Error("fileName is required");
    if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("fileSize is required");
    if (fileSize > maxAssetBytes) throw new Error(`Asset is too large. Max bytes: ${maxAssetBytes}`);

    const key = sanitizeR2ObjectKey(fileName);
    const signed = createR2PresignedPutUrl({ key });

    res.json({
      ok: true,
      ...signed
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.post("/api/projects/save-version", async (req, res) => {
  try {
    const files = validateProjectFiles(req.body?.files);
    const message = String(req.body?.message || "").trim() || `Save project version ${new Date().toISOString()}`;
    const result = await saveGitHubProjectVersion(files, message);

    res.json({
      ok: true,
      repo: result.repository.repo,
      owner: result.repository.owner,
      branch: result.branch,
      repoUrl: result.repository.url,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl
    });
  } catch (error) {
    res.status(error.status || 400).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.get("/api/projects/versions", async (req, res) => {
  try {
    const versions = await listGitHubProjectVersions();
    res.json({ ok: true, repo: makeRepositoryName(projectRepositoryName), versions });
  } catch (error) {
    res.status(error.status || 400).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.get("/api/projects/versions/:sha", async (req, res) => {
  try {
    const sha = String(req.params.sha || "").trim();
    if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new Error("Invalid version");

    const version = await loadGitHubProjectVersion(sha);
    res.json({ ok: true, repo: makeRepositoryName(projectRepositoryName), ...version });
  } catch (error) {
    res.status(error.status || 400).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.post("/api/deploy/html", async (req, res) => {
  try {
    const siteId = makeSiteId(req.body?.siteId);
    const files = validateHtmlFiles(req.body?.files);
    const target = String(req.body?.target || "web").toLowerCase();

    if (!deployTargets.has(target)) {
      throw new Error(`Unsupported deploy target: ${target}`);
    }

    if (target === "web") {
      const localUrl = `/sites/${siteId}/index.html`;
      await writeLocalSite(siteId, files);

      return res.json({
        ok: true,
        target,
        siteId,
        localUrl,
        url: localUrl
      });
    }

    if (target === "oss") {
      const ossUrl = await uploadOssSite(siteId, files);

      return res.json({
        ok: true,
        target,
        siteId,
        ossUrl,
        url: ossUrl
      });
    }

    const githubResult = await publishGitHubSite(siteId, files);

    res.json({
      ok: true,
      target,
      siteId,
      ...githubResult,
      url: githubResult.cloudflareUrl || githubResult.githubCommitUrl
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});

app.post("/api/ai/edit-html", async (req, res) => {
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "缺少环境变量 DEEPSEEK_API_KEY"
      });
    }

    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) {
      return res.status(400).json({
        ok: false,
        error: "请先输入修改需求"
      });
    }

    const files = validateHtmlFiles(req.body?.files);
    const activeFile = normalizeProjectPath(req.body?.activeFile || "index.html");
    if (!files.has(activeFile)) {
      throw new Error(`Active file not found: ${activeFile}`);
    }

    const completion = await deepseek.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
      messages: buildHtmlEditMessages({ instruction, activeFile, files }),
      response_format: { type: "json_object" },
      stream: false
    });

    const content = completion.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    const changedFiles = validateReturnedHtmlFiles(parsed.files);

    res.json({
      ok: true,
      summary: typeof parsed.summary === "string" ? parsed.summary : "AI 已完成修改",
      files: changedFiles
    });
  } catch (error) {
    const status = error.status || 400;
    const message = error.response?.data?.error?.message || error.message || "DeepSeek API 调用失败";

    res.status(status).json({
      ok: false,
      error: message
    });
  }
});

app.listen(port, () => {
  console.log(`API server listening on ${port}`);
});
