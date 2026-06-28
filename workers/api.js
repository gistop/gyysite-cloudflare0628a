const allowedExtensions = new Set([".html", ".css", ".js", ".json", ".txt", ".svg", ".png", ".jpg", ".jpeg", ".webp"]);
const projectAllowedExtensions = new Set([...allowedExtensions, ".jsx", ".ts", ".tsx", ".vue", ".md"]);
const encoder = new TextEncoder();
const aiJobPrefix = "ai-jobs";

function envValue(env, key, fallback = "") {
  return env?.[key] ?? fallback;
}

function corsHeaders(request, env) {
  const configuredOrigin = envValue(env, "CORS_ORIGIN", "*");
  const requestOrigin = request?.headers?.get("Origin") || "*";
  const allowOrigin = configuredOrigin === "true" ? requestOrigin : configuredOrigin || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env)
    }
  });
}

function jsonError(error, status = 400, request, env) {
  return json({ ok: false, error: error?.message || String(error) }, error?.status || status, request, env);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function randomId() {
  return crypto.randomUUID().slice(0, 8);
}

function makeJobId() {
  return `job_${crypto.randomUUID().replaceAll("-", "")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function requireBinding(env, key) {
  if (!env?.[key]) throw new Error(`Missing Cloudflare binding: ${key}`);
  return env[key];
}

function makeSiteId(input) {
  const slug = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || `site-${randomId()}`;
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

function posixNormalize(input) {
  const parts = [];
  for (const part of String(input || "").replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length) parts.pop();
      else parts.push("..");
    } else {
      parts.push(part);
    }
  }
  return parts.join("/") || ".";
}

function extname(filePath) {
  const name = String(filePath || "").split("/").pop() || "";
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}

function basename(filePath, ext = "") {
  const name = String(filePath || "").replaceAll("\\", "/").split("/").pop() || "";
  return ext && name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
}

function normalizeProjectPath(filePath, extensions = allowedExtensions) {
  const raw = String(filePath || "").replaceAll("\\", "/");
  const normalized = posixNormalize(raw);

  if (!normalized || normalized === "." || raw.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  const ext = extname(normalized);
  if (!extensions.has(ext)) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  return normalized;
}

function validateFiles(files, { htmlOnly = true, requireIndex = false, env }) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("files must be an object");
  }

  const entries = Object.entries(files);
  const maxFileCount = Number(envValue(env, "MAX_FILE_COUNT", "80"));
  const maxTotalBytes = Number(envValue(env, "MAX_TOTAL_BYTES", String(2 * 1024 * 1024)));
  if (!entries.length) throw new Error("files cannot be empty");
  if (entries.length > maxFileCount) throw new Error(`Too many files. Max: ${maxFileCount}`);

  let totalBytes = 0;
  const normalizedFiles = new Map();
  const extensions = htmlOnly ? allowedExtensions : projectAllowedExtensions;

  for (const [filePath, content] of entries) {
    if (typeof content !== "string") {
      throw new Error(`File content must be text: ${filePath}`);
    }

    const normalizedPath = normalizeProjectPath(filePath, extensions);
    totalBytes += byteLength(content);
    if (totalBytes > maxTotalBytes) throw new Error(`Project is too large. Max bytes: ${maxTotalBytes}`);

    normalizedFiles.set(normalizedPath, content);
  }

  if (requireIndex && !normalizedFiles.has("index.html")) {
    throw new Error("HTML project must include index.html");
  }

  return normalizedFiles;
}

function validateReturnedHtmlFiles(files, env) {
  const normalized = validateFiles(files, { htmlOnly: true, requireIndex: false, env });
  if (!normalized.size) throw new Error("AI response did not include any files");
  return Object.fromEntries(normalized);
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("AI response was not valid JSON");
    return JSON.parse(content.slice(start, end + 1));
  }
}

function encodeRfc3986(input) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3Path(input) {
  return input.split("/").map(encodeRfc3986).join("/");
}

async function hmac(key, value, output = "buffer") {
  const cryptoKey =
    key instanceof CryptoKey
      ? key
      : await crypto.subtle.importKey("raw", typeof key === "string" ? encoder.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, [
          "sign"
        ]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
  return output === "hex" ? [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("") : signature;
}

async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeR2ObjectKey(fileName, env) {
  const rawName = String(fileName || "").replaceAll("\\", "/").split("/").pop() || "asset";
  const ext = extname(rawName);
  const safeBase =
    basename(rawName, ext)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset";
  const prefix = envValue(env, "R2_ASSET_PREFIX", "assets").replace(/^\/+|\/+$/g, "");
  const date = new Date().toISOString().slice(0, 10);

  return `${prefix}/${date}/${randomId()}-${safeBase}${ext}`;
}

function getR2Config(env) {
  const accountId = envValue(env, "R2_ACCOUNT_ID");
  const endpoint = envValue(env, "R2_ENDPOINT", accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "").replace(/\/+$/g, "");
  const accessKeyId = envValue(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = envValue(env, "R2_SECRET_ACCESS_KEY");
  const bucket = envValue(env, "R2_BUCKET");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("R2 is not configured");

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: envValue(env, "R2_PUBLIC_BASE_URL").replace(/\/+$/g, "")
  };
}

async function createR2PresignedPutUrl({ key, env, expiresIn = 300 }) {
  const { endpoint, accessKeyId, secretAccessKey, bucket, publicBaseUrl } = getR2Config(env);
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
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256(canonicalRequest)].join("\n");
  const dateKey = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, service);
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = await hmac(signingKey, stringToSign, "hex");
  const uploadUrl = `${endpointUrl.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${encodeS3Path(key)}` : "";

  return { uploadUrl, key, publicUrl, expiresIn: Number(query["X-Amz-Expires"]) };
}

function getGitHubCredentials(env) {
  const owner = envValue(env, "GITHUB_OWNER");
  const token = envValue(env, "GITHUB_TOKEN");
  const branch = envValue(env, "GITHUB_BRANCH", "main");
  if (!owner || !token) throw new Error("GITHUB_OWNER and GITHUB_TOKEN are required");
  return { owner, branch, token };
}

function getGitHubConfig(env) {
  const { owner, branch, token } = getGitHubCredentials(env);
  const repo = envValue(env, "GITHUB_REPO");
  if (!repo) throw new Error("GitHub publishing is not configured");

  return {
    owner,
    repo,
    branch,
    token,
    prefix: envValue(env, "GITHUB_PUBLISH_PREFIX").replace(/^\/+|\/+$/g, ""),
    cloudflarePagesUrl: envValue(env, "CLOUDFLARE_PAGES_URL").replace(/\/+$/g, "")
  };
}

function getPublishGitHubConfig(env) {
  const config = getGitHubConfig(env);
  const projectRepo = envValue(env, "GITHUB_PROJECT_REPO").trim();
  return projectRepo ? { ...config, repo: makeRepositoryName(projectRepo) } : config;
}

async function requestGitHubApi(env, pathname, options = {}) {
  const { token } = getGitHubCredentials(env);
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "gyysite-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(body.errors) ? body.errors.map((item) => item.message || item.code || JSON.stringify(item)).join("; ") : "";
    const error = new Error([body.message || `GitHub request failed: ${response.status}`, details].filter(Boolean).join(": "));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function requestGitHub(env, pathname, options = {}) {
  const { owner, repo, token } = getGitHubConfig(env);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "gyysite-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `GitHub request failed: ${response.status}`);
  return body;
}

async function ensureGitHubRepository(env, repo) {
  const { owner, branch } = getGitHubCredentials(env);
  const repoName = makeRepositoryName(repo);
  let repository = null;

  try {
    repository = await requestGitHubApi(env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  if (!repository) {
    const user = await requestGitHubApi(env, "/user");
    const endpoint = user.login.toLowerCase() === owner.toLowerCase() ? "/user/repos" : `/orgs/${encodeURIComponent(owner)}/repos`;
    repository = await requestGitHubApi(env, endpoint, {
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

async function requestProjectRepository(env, repo, pathname, options = {}) {
  const { owner } = getGitHubCredentials(env);
  return requestGitHubApi(env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${pathname}`, options);
}

function toBase64(content) {
  const bytes = encoder.encode(content);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(content) {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function saveGitHubProjectVersion(env, files, message) {
  const repository = await ensureGitHubRepository(env, envValue(env, "GITHUB_PROJECT_REPO", "testsite"));
  const branch = repository.branch;
  const ref = await requestProjectRepository(env, repository.repo, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const baseCommitSha = ref.object?.sha;
  if (!baseCommitSha) throw new Error(`GitHub branch has no commit: ${branch}`);

  const tree = await requestProjectRepository(env, repository.repo, "/git/trees", {
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
  const commit = await requestProjectRepository(env, repository.repo, "/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseCommitSha]
    })
  });

  await requestProjectRepository(env, repository.repo, `/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { repository, branch, commitSha: commit.sha, commitUrl: commit.html_url };
}

async function listGitHubProjectVersions(env) {
  const { owner, branch } = getGitHubCredentials(env);
  const repo = makeRepositoryName(envValue(env, "GITHUB_PROJECT_REPO", "testsite"));
  let repository;

  try {
    repository = await requestGitHubApi(env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }

  const commits = await requestProjectRepository(
    env,
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

async function loadGitHubProjectVersion(env, sha) {
  const repo = makeRepositoryName(envValue(env, "GITHUB_PROJECT_REPO", "testsite"));
  const commit = await requestProjectRepository(env, repo, `/git/commits/${encodeURIComponent(sha)}`);
  const tree = await requestProjectRepository(env, repo, `/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`);
  if (tree.truncated) throw new Error("This project version is too large to load");

  const blobs = tree.tree.filter((item) => item.type === "blob" && projectAllowedExtensions.has(extname(item.path)));
  const maxFileCount = Number(envValue(env, "MAX_FILE_COUNT", "80"));
  const maxTotalBytes = Number(envValue(env, "MAX_TOTAL_BYTES", String(2 * 1024 * 1024)));
  if (!blobs.length) throw new Error("This version does not contain project files");
  if (blobs.length > maxFileCount) throw new Error(`Too many files. Max: ${maxFileCount}`);

  const files = {};
  let totalBytes = 0;
  await Promise.all(
    blobs.map(async (item) => {
      const blob = await requestProjectRepository(env, repo, `/git/blobs/${encodeURIComponent(item.sha)}`);
      if (blob.encoding !== "base64") throw new Error(`Unsupported GitHub blob encoding: ${item.path}`);
      const content = fromBase64(blob.content);
      totalBytes += byteLength(content);
      if (totalBytes > maxTotalBytes) throw new Error(`Project is too large. Max bytes: ${maxTotalBytes}`);
      files[normalizeProjectPath(item.path, projectAllowedExtensions)] = content;
    })
  );

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.message.split("\n")[0],
    savedAt: commit.author?.date || commit.committer?.date || null,
    url: `https://github.com/${getGitHubCredentials(env).owner}/${repo}/commit/${commit.sha}`,
    files
  };
}

async function getGitHubFileSha(env, filePath, branch) {
  const encodedPath = filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  const existing = await requestGitHub(env, `/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
  return existing?.sha || null;
}

function getCloudflareConfig(env) {
  const accountId = envValue(env, "CLOUDFLARE_ACCOUNT_ID");
  const apiToken = envValue(env, "CLOUDFLARE_API_TOKEN");
  if (!accountId || !apiToken) return null;

  return {
    accountId,
    apiToken,
    projectName: envValue(env, "CLOUDFLARE_PAGES_PROJECT_NAME").trim() || undefined,
    pagesUrl: envValue(env, "CLOUDFLARE_PAGES_URL").replace(/\/+$/g, "")
  };
}

function getCloudflareProjectName(env) {
  const config = getCloudflareConfig(env);
  return makeRepositoryName(config?.projectName || envValue(env, "GITHUB_PROJECT_REPO", "pages"));
}

async function requestCloudflare(env, pathname, options = {}) {
  const config = getCloudflareConfig(env);
  if (!config) throw new Error("Cloudflare Pages is not configured");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiToken}`,
        "User-Agent": "gyysite-worker",
        ...options.headers
      }
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const details = Array.isArray(body.errors) ? body.errors.map((item) => item.message || item.code || JSON.stringify(item)).join("; ") : "";
    const error = new Error([body.message || `Cloudflare request failed: ${response.status}`, details].filter(Boolean).join(": "));
    error.status = response.status;
    throw error;
  }
  return body.result !== undefined ? body.result : body;
}

async function ensureCloudflarePagesProject(env, repoOwner, repoName, branch) {
  if (!getCloudflareConfig(env)) return null;
  const projectName = getCloudflareProjectName(env);
  let existingProject = null;

  try {
    existingProject = await requestCloudflare(env, `/pages/projects/${encodeURIComponent(projectName)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const body = {
    name: projectName,
    production_branch: branch,
    source: {
      type: "github",
      config: { owner: repoOwner, repo_name: repoName, production_branch: branch, deployments_enabled: true }
    },
    build_config: { build_command: "", destination_dir: ".", root_dir: "/" }
  };

  if (existingProject) {
    const source = existingProject.source || {};
    const sourceConfig = source.config || {};
    const needsSourceUpdate =
      source.type !== "github" ||
      sourceConfig.owner !== repoOwner ||
      sourceConfig.repo_name !== repoName ||
      sourceConfig.production_branch !== branch ||
      existingProject?.status === "disconnected";

    if (!needsSourceUpdate) return existingProject;
    return requestCloudflare(env, `/pages/projects/${encodeURIComponent(projectName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: body.source, build_config: body.build_config })
    });
  }

  try {
    return await requestCloudflare(env, "/pages/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error.status === 409) return requestCloudflare(env, `/pages/projects/${encodeURIComponent(projectName)}`);
    throw error;
  }
}

async function createCloudflarePagesDeployment(env, branch) {
  if (!getCloudflareConfig(env)) return null;
  const projectName = getCloudflareProjectName(env);
  const pathname = `/pages/projects/${encodeURIComponent(projectName)}/deployments`;
  try {
    return await requestCloudflare(env, pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch })
    });
  } catch (error) {
    if (![400, 415, 422].includes(error.status)) throw error;
    return requestCloudflare(env, pathname, { method: "POST" });
  }
}

function getCloudflareD1Config(env) {
  const bindingName = envValue(env, "CLOUDFLARE_D1_BINDING_NAME", "DB").trim() || "DB";
  const databaseId = envValue(env, "CLOUDFLARE_D1_DATABASE_ID").trim();
  const databaseName = envValue(env, "CLOUDFLARE_D1_DATABASE_NAME").trim();

  if (!getCloudflareConfig(env) || (!databaseId && !databaseName)) return null;

  return {
    bindingName,
    databaseId,
    databaseName
  };
}

async function findCloudflareD1DatabaseByName(env, databaseName) {
  const databases = await requestCloudflare(env, `/d1/database?name=${encodeURIComponent(databaseName)}&per_page=100`);
  const list = Array.isArray(databases) ? databases : databases?.result || [];

  return list.find((database) => database.name === databaseName) || null;
}

async function ensureCloudflareD1Database(env) {
  const d1Config = getCloudflareD1Config(env);
  if (!d1Config) return null;

  if (d1Config.databaseId) {
    return {
      id: d1Config.databaseId,
      name: d1Config.databaseName || null,
      created: false
    };
  }

  const existing = await findCloudflareD1DatabaseByName(env, d1Config.databaseName);
  if (existing?.uuid || existing?.id) {
    return {
      id: existing.uuid || existing.id,
      name: existing.name,
      created: false
    };
  }

  const created = await requestCloudflare(env, "/d1/database", {
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

async function ensureCloudflarePagesD1Binding(env, projectName) {
  const d1Config = getCloudflareD1Config(env);
  if (!d1Config) return null;

  const database = await ensureCloudflareD1Database(env);
  if (!database?.id) throw new Error("Cloudflare D1 database id is missing");

  const project = await requestCloudflare(env, `/pages/projects/${encodeURIComponent(projectName)}`);
  const deploymentConfigs = project.deployment_configs || {};
  const production = withD1Binding(deploymentConfigs.production, d1Config.bindingName, database.id);
  const preview = withD1Binding(deploymentConfigs.preview, d1Config.bindingName, database.id);
  const alreadyBound =
    deploymentConfigs.production?.d1_databases?.[d1Config.bindingName]?.id === database.id &&
    deploymentConfigs.preview?.d1_databases?.[d1Config.bindingName]?.id === database.id;

  if (!alreadyBound) {
    await requestCloudflare(env, `/pages/projects/${encodeURIComponent(projectName)}`, {
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

  return {
    bindingName: d1Config.bindingName,
    databaseId: database.id,
    databaseName: database.name,
    databaseCreated: database.created,
    bound: true,
    updated: !alreadyBound
  };
}

async function publishGitHubSite(env, siteId, files) {
  const { owner, repo, branch, prefix, cloudflarePagesUrl } = getPublishGitHubConfig(env);
  const commitUrls = [];

  for (const [filePath, content] of files) {
    const githubPath = prefix ? `${prefix}/${filePath}` : filePath;
    const sha = await getGitHubFileSha(env, githubPath, branch);
    const encodedPath = githubPath.split("/").map((part) => encodeURIComponent(part)).join("/");
    const result = await requestGitHub(env, `/contents/${encodedPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Publish ${siteId}: ${filePath}`,
        content: toBase64(content),
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
    const project = await ensureCloudflarePagesProject(env, owner, repo, branch);
    if (project) {
      cloudflareD1Binding = await ensureCloudflarePagesD1Binding(env, getCloudflareProjectName(env));
    }
    cloudflareDeployment = await createCloudflarePagesDeployment(env, branch);
    cloudflareUrl =
      cloudflareDeployment?.url ||
      cloudflareDeployment?.deployment_trigger?.metadata?.deployment_url ||
      project?.canonical_deployment?.url ||
      (project?.subdomain ? `https://${project.subdomain}` : cloudflareUrl);
  } catch (error) {
    cloudflareError = error.message || String(error);
    if (getCloudflareD1Config(env)) {
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

function buildHtmlEditMessages({ instruction, activeFile, files }) {
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
      content: [`Active file: ${activeFile}`, `User instruction: ${instruction}`, "Current project files JSON:", JSON.stringify(Object.fromEntries(files), null, 2)].join(
        "\n\n"
      )
    }
  ];
}

async function editHtmlWithAi(env, body) {
  const apiKey = envValue(env, "DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const instruction = String(body?.instruction || "").trim();
  if (!instruction) throw new Error("Please enter an edit instruction first.");

  const files = validateFiles(body?.files, { htmlOnly: true, requireIndex: true, env });
  const activeFile = normalizeProjectPath(body?.activeFile || "index.html");
  if (!files.has(activeFile)) throw new Error(`Active file not found: ${activeFile}`);

  const response = await fetch(`${envValue(env, "DEEPSEEK_BASE_URL", "https://api.deepseek.com").replace(/\/+$/g, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: envValue(env, "DEEPSEEK_MODEL", "deepseek-v4-pro"),
      messages: buildHtmlEditMessages({ instruction, activeFile, files }),
      response_format: { type: "json_object" },
      stream: false
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `DeepSeek API request failed: ${response.status}`);

  const content = result.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(content);
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "AI edit completed.",
    files: validateReturnedHtmlFiles(parsed.files, env)
  };
}

function jobObjectKey(jobId, name) {
  return `${aiJobPrefix}/${jobId}/${name}`;
}

function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress || 0,
    stage: job.stage || "",
    summary: job.summary || "",
    error: job.error || "",
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    resultKey: job.result_key || ""
  };
}

async function upsertAiJob(env, job) {
  const db = requireBinding(env, "AI_JOBS_DB");
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO ai_jobs (id, status, progress, stage, input_key, result_key, summary, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         progress = excluded.progress,
         stage = excluded.stage,
         input_key = excluded.input_key,
         result_key = excluded.result_key,
         summary = excluded.summary,
         error = excluded.error,
         updated_at = excluded.updated_at`
    )
    .bind(
      job.id,
      job.status,
      job.progress ?? 0,
      job.stage || "",
      job.inputKey || "",
      job.resultKey || "",
      job.summary || "",
      job.error || "",
      job.createdAt || timestamp,
      job.updatedAt || timestamp
    )
    .run();
}

async function updateAiJob(env, jobId, patch) {
  const current = await getAiJob(env, jobId);
  if (!current) throw new Error(`AI job not found: ${jobId}`);
  await upsertAiJob(env, {
    id: jobId,
    status: patch.status ?? current.status,
    progress: patch.progress ?? current.progress,
    stage: patch.stage ?? current.stage,
    inputKey: patch.inputKey ?? current.input_key,
    resultKey: patch.resultKey ?? current.result_key,
    summary: patch.summary ?? current.summary,
    error: patch.error ?? current.error,
    createdAt: current.created_at,
    updatedAt: nowIso()
  });
  const updated = await getAiJob(env, jobId);
  await notifyAiJob(env, jobId, publicJob(updated));
  return updated;
}

async function getAiJob(env, jobId) {
  const db = requireBinding(env, "AI_JOBS_DB");
  return db.prepare("SELECT * FROM ai_jobs WHERE id = ?").bind(jobId).first();
}

async function notifyAiJob(env, jobId, event) {
  if (!env?.AI_JOB_DO) return;
  const id = env.AI_JOB_DO.idFromName(jobId);
  const stub = env.AI_JOB_DO.get(id);
  await stub.fetch("https://ai-job.local/notify", {
    method: "POST",
    body: JSON.stringify(event)
  });
}

async function readR2Json(env, key) {
  if (!key) return null;
  const bucket = requireBinding(env, "AI_JOB_BUCKET");
  const object = await bucket.get(key);
  if (!object) return null;
  return JSON.parse(await object.text());
}

async function createAiEditJob(env, body) {
  requireBinding(env, "AI_JOBS_DB");
  const bucket = requireBinding(env, "AI_JOB_BUCKET");
  const queue = requireBinding(env, "AI_JOBS_QUEUE");

  const instruction = String(body?.instruction || "").trim();
  if (!instruction) throw new Error("Please enter an edit instruction first.");

  const files = validateFiles(body?.files, { htmlOnly: true, requireIndex: true, env });
  const activeFile = normalizeProjectPath(body?.activeFile || "index.html");
  if (!files.has(activeFile)) throw new Error(`Active file not found: ${activeFile}`);

  const jobId = makeJobId();
  const inputKey = jobObjectKey(jobId, "input.json");
  const payload = {
    jobId,
    instruction,
    activeFile,
    files: Object.fromEntries(files),
    createdAt: nowIso()
  };

  await bucket.put(inputKey, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  await upsertAiJob(env, {
    id: jobId,
    status: "queued",
    progress: 5,
    stage: "Queued",
    inputKey,
    createdAt: payload.createdAt,
    updatedAt: payload.createdAt
  });
  await queue.send({ jobId, inputKey });
  await notifyAiJob(env, jobId, { jobId, status: "queued", progress: 5, stage: "Queued", createdAt: payload.createdAt });

  return { jobId, status: "queued", progress: 5, stage: "Queued" };
}

async function runAiEditJob(env, message) {
  const jobId = String(message?.jobId || "");
  if (!jobId) throw new Error("Queue message is missing jobId");

  const job = await getAiJob(env, jobId);
  if (!job) throw new Error(`AI job not found: ${jobId}`);
  if (job.status === "cancel_requested" || job.status === "cancelled") {
    await updateAiJob(env, jobId, { status: "cancelled", progress: 100, stage: "Cancelled" });
    return;
  }

  await updateAiJob(env, jobId, { status: "running", progress: 20, stage: "Preparing AI request" });
  const payload = await readR2Json(env, message.inputKey || job.input_key);
  if (!payload) throw new Error(`AI job payload not found: ${jobId}`);

  await updateAiJob(env, jobId, { status: "streaming", progress: 40, stage: "Generating website code" });
  const result = await editHtmlWithAi(env, payload);
  const latestJob = await getAiJob(env, jobId);
  if (latestJob?.status === "cancel_requested" || latestJob?.status === "cancelled") {
    await updateAiJob(env, jobId, { status: "cancelled", progress: 100, stage: "Cancelled" });
    return;
  }
  const resultKey = jobObjectKey(jobId, "result.json");
  await requireBinding(env, "AI_JOB_BUCKET").put(resultKey, JSON.stringify(result), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });

  await updateAiJob(env, jobId, {
    status: "succeeded",
    progress: 100,
    stage: "Completed",
    resultKey,
    summary: result.summary || "AI edit completed."
  });
}

async function failAiEditJob(env, jobId, error) {
  await updateAiJob(env, jobId, {
    status: "failed",
    progress: 100,
    stage: "Failed",
    error: error?.message || String(error)
  });
}

function ssePayload(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class AiJobDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/events") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const client = { writer };
      this.clients.add(client);

      const send = async (event, data) => {
        await writer.write(encoder.encode(ssePayload(event, data)));
      };

      const lastEvent = await this.state.storage.get("lastEvent");
      await send("connected", lastEvent || { status: "connected" });
      const keepAlive = setInterval(() => {
        writer.write(encoder.encode(": keepalive\n\n")).catch(() => {});
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        this.clients.delete(client);
        writer.close().catch(() => {});
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/notify") {
      const event = await request.json();
      await this.state.storage.put("lastEvent", event);
      const eventName = event.status || "message";
      const chunk = encoder.encode(ssePayload(eventName, event));
      for (const client of [...this.clients]) {
        try {
          await client.writer.write(chunk);
        } catch {
          this.clients.delete(client);
        }
      }
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (method === "GET" && url.pathname === "/api/health") return json({ ok: true, runtime: "cloudflare-worker" }, 200, request, env);

  if (method === "POST" && url.pathname === "/api/assets/r2/presign") {
    const body = await readJson(request);
    const fileName = String(body?.fileName || "").trim();
    const fileSize = Number(body?.fileSize || 0);
    const maxAssetBytes = Number(envValue(env, "R2_MAX_ASSET_BYTES", String(20 * 1024 * 1024)));
    if (!fileName) throw new Error("fileName is required");
    if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("fileSize is required");
    if (fileSize > maxAssetBytes) throw new Error(`Asset is too large. Max bytes: ${maxAssetBytes}`);
    return json({ ok: true, ...(await createR2PresignedPutUrl({ key: sanitizeR2ObjectKey(fileName, env), env })) });
  }

  if (method === "POST" && url.pathname === "/api/projects/save-version") {
    const body = await readJson(request);
    const files = validateFiles(body?.files, { htmlOnly: false, env });
    const message = String(body?.message || "").trim() || `Save project version ${new Date().toISOString()}`;
    const result = await saveGitHubProjectVersion(env, files, message);
    return json({
      ok: true,
      repo: result.repository.repo,
      owner: result.repository.owner,
      branch: result.branch,
      repoUrl: result.repository.url,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl
    });
  }

  if (method === "GET" && url.pathname === "/api/projects/versions") {
    return json({ ok: true, repo: makeRepositoryName(envValue(env, "GITHUB_PROJECT_REPO", "testsite")), versions: await listGitHubProjectVersions(env) });
  }

  const versionMatch = url.pathname.match(/^\/api\/projects\/versions\/([a-f0-9]{7,40})$/i);
  if (method === "GET" && versionMatch) {
    return json({ ok: true, repo: makeRepositoryName(envValue(env, "GITHUB_PROJECT_REPO", "testsite")), ...(await loadGitHubProjectVersion(env, versionMatch[1])) });
  }

  if (method === "POST" && url.pathname === "/api/deploy/html") {
    const body = await readJson(request);
    const siteId = makeSiteId(body?.siteId);
    const files = validateFiles(body?.files, { htmlOnly: true, requireIndex: true, env });
    const target = String(body?.target || "web").toLowerCase();
    if (target === "web") throw new Error("Web Server deploy target is only available in the traditional server deployment.");
    if (target === "oss") throw new Error("OSS deploy target is only available in the traditional server deployment.");
    if (target !== "cloudflare") throw new Error(`Unsupported deploy target: ${target}`);
    const githubResult = await publishGitHubSite(env, siteId, files);
    return json({ ok: true, target, siteId, ...githubResult, url: githubResult.cloudflareUrl || githubResult.githubCommitUrl });
  }

  if (method === "POST" && (url.pathname === "/api/ai/jobs" || url.pathname === "/api/ai/edit-html")) {
    return json({ ok: true, ...(await createAiEditJob(env, await readJson(request))) }, 202, request, env);
  }

  const aiJobMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)$/);
  if (method === "GET" && aiJobMatch) {
    const job = await getAiJob(env, aiJobMatch[1]);
    if (!job) return json({ ok: false, error: "AI job not found" }, 404, request, env);
    return json({ ok: true, job: publicJob(job) }, 200, request, env);
  }

  const aiJobResultMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)\/result$/);
  if (method === "GET" && aiJobResultMatch) {
    const job = await getAiJob(env, aiJobResultMatch[1]);
    if (!job) return json({ ok: false, error: "AI job not found" }, 404, request, env);
    if (job.status !== "succeeded") return json({ ok: false, error: "AI job is not complete", job: publicJob(job) }, 409, request, env);
    const result = await readR2Json(env, job.result_key);
    return json({ ok: true, job: publicJob(job), ...result }, 200, request, env);
  }

  const aiJobCancelMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)\/cancel$/);
  if (method === "POST" && aiJobCancelMatch) {
    const job = await updateAiJob(env, aiJobCancelMatch[1], { status: "cancel_requested", stage: "Cancellation requested" });
    return json({ ok: true, job: publicJob(job) }, 200, request, env);
  }

  const aiJobEventsMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)\/events$/);
  if (method === "GET" && aiJobEventsMatch) {
    requireBinding(env, "AI_JOB_DO");
    const id = env.AI_JOB_DO.idFromName(aiJobEventsMatch[1]);
    return env.AI_JOB_DO.get(id).fetch("https://ai-job.local/events");
  }

  return json({ ok: false, error: "Not found" }, 404);
}

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const jobId = message.body?.jobId;
      try {
        await runAiEditJob(env, message.body);
        message.ack();
      } catch (error) {
        if (jobId) await failAiEditJob(env, jobId, error).catch(() => {});
        message.retry();
      }
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await handleApi(request, env);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders(request, env))) {
          headers.set(key, value);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }
      return json({ ok: false, error: "Not found" }, 404, request, env);
    } catch (error) {
      return jsonError(error, 400, request, env);
    }
  }
};
