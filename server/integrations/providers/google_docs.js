import { URL, URLSearchParams } from 'node:url';
import { google } from 'googleapis';
import { Storage } from '@google-cloud/storage';
import { getLogger } from '../../logger.js';
import { IntegrationProvider, registerIntegration } from '../registry.js';
import { buildDocumentTextEmbeddings, storeDocumentEmbeddings } from '../../DocumentSearch.js';
import { dispatchControlUpdate } from '../../SharedFunctions.js';

const logger = getLogger('integration-google-docs', 'debug');

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const TEXT_EXPORT_MIME = 'text/plain';
const PDF_EXPORT_MIME = 'application/pdf';
const TEXT_BUCKET = 'cc_vf_document_plaintext';
const PDF_BUCKET = 'cc_vf_documents';

let storageInstance;
function getStorage() {
  if (!storageInstance) {
    const options = {};
    if (process.env.GOOGLE_PROJECT_ID) {
      options.projectId = process.env.GOOGLE_PROJECT_ID;
    }
    storageInstance = new Storage(Object.keys(options).length ? options : undefined);
  }
  return storageInstance;
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} for Google Docs integration`);
  }
  return value;
}

function normalizeBuffer(data) {
  if (!data) {
    return null;
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8');
  }
  return Buffer.from([]);
}

async function uploadToBucket(bucketName, key, data, contentType) {
  if (!data || data.length === 0) {
    return;
  }
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(key);
  await file.save(data, {
    resumable: false,
    contentType,
    metadata: { cacheControl: 'no-cache' },
  });
}

function sanitizeSelections(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return { id: entry };
      }
      if (entry.id) {
        return { id: entry.id, name: entry.name ?? entry.title ?? entry.label ?? entry.id };
      }
      return null;
    })
    .filter(Boolean);
}

function mergeUniqueIds(...collections) {
  const map = new Map();
  collections.flat().forEach((entry) => {
    if (!entry) return;
    const id = typeof entry === 'string' ? entry : entry.id;
    if (!id) return;
    const key = id.toString();
    if (!map.has(key)) {
      map.set(key, { id: key, name: entry.name ?? entry.title ?? entry.label ?? key });
    }
  });
  return Array.from(map.values());
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function exportFile(drive, fileId, mimeType) {
  try {
    const response = await drive.files.export({ fileId, mimeType }, { responseType: 'arraybuffer' });
    return normalizeBuffer(response.data);
  } catch (error) {
    if (error?.code === 403 || error?.code === 404) {
      logger.warn(`Unable to export file ${fileId} (${mimeType})`, error.message);
      return null;
    }
    throw error;
  }
}

async function fetchFileMetadata(drive, fileId) {
  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, createdTime, modifiedTime, version, webViewLink, iconLink, parents, owners(displayName,emailAddress)',
  });
  return response.data;
}

async function listFolderDocuments(drive, folderId, { search, pageToken } = {}) {
  const escapedFolderId = String(folderId).replace(/'/g, "\'");
  const qParts = [
    `'${escapedFolderId}' in parents`,
    `mimeType='${DOC_MIME_TYPE}'`,
    'trashed=false',
  ];
  if (search) {
    qParts.push(`name contains '${search.replace(/'/g, "\'")}'`);
  }
  const response = await drive.files.list({
    q: qParts.join(' and '),
    fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, version, webViewLink, iconLink, parents)',
    pageSize: 100,
    pageToken,
    orderBy: 'modifiedTime desc',
  });
  return response.data;
}

class GoogleDocsIntegration extends IntegrationProvider {
  constructor() {
    super({
      name: 'google-docs',
      title: 'Google Docs',
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ],
      description: 'Import documents and folders from Google Docs.',
      requiresPkce: false,
      supportsDiscovery: true,
    });
  }

  describeConfiguration() {
    return {
      account: [
        {
          key: 'documents',
          label: 'Documents',
          description: 'Specific documents to sync by default.',
        },
        {
          key: 'folders',
          label: 'Folders',
          description: 'Folders whose documents should be imported.',
        },
      ],
      primitive: [
        {
          key: 'documents',
          label: 'Documents',
          description: 'Override documents for this primitive.',
        },
        {
          key: 'folders',
          label: 'Folders',
          description: 'Override folders for this primitive.',
        },
      ],
    };
  }

  get clientId() {
    return getEnv('GOOGLE_DOCS_CLIENT_ID');
  }

  get clientSecret() {
    return getEnv('GOOGLE_DOCS_CLIENT_SECRET');
  }

  get defaultRedirectUri() {
    return getEnv('GOOGLE_DOCS_OAUTH_REDIRECT');
  }

  getAuthorizationUrl({ state, redirectUri, scopes } = {}) {
    const url = new URL(AUTH_BASE);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri || this.defaultRedirectUri,
      scope: (scopes && scopes.length ? scopes : this.scopes).join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });
    if (state) {
      params.set('state', state);
    }
    url.search = params.toString();
    return url.toString();
  }

  async exchangeCodeForToken({ code, redirectUri }) {
    const params = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri || this.defaultRedirectUri,
      grant_type: 'authorization_code',
    });
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google token exchange failed (${response.status}): ${errorBody}`);
    }
    const body = await response.json();
    const expiresIn = body.expires_in ? Number(body.expires_in) : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn,
      expiresAt,
      scope: body.scope ? String(body.scope).split(' ') : undefined,
      metadata: {
        tokenType: body.token_type,
      },
    };
  }

  async refreshToken(refreshToken) {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google token refresh failed (${response.status}): ${errorBody}`);
    }
    const body = await response.json();
    const expiresIn = body.expires_in ? Number(body.expires_in) : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresIn,
      expiresAt,
      scope: body.scope ? String(body.scope).split(' ') : undefined,
      metadata: {
        tokenType: body.token_type,
      },
    };
  }

  createDriveClient(accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: 'v3', auth });
  }

  async discover(account, params = {}) {
    await this.ensureAccessToken(account);
    const drive = this.createDriveClient(account.accessToken);
    const type = params.type ?? 'documents';
    const pageToken = params.cursor ?? params.pageToken;
    const search = params.search ? String(params.search).trim() : '';

    if (type === 'folders') {
      const qParts = ["mimeType='application/vnd.google-apps.folder'", 'trashed=false'];
      if (search) {
        qParts.push(`name contains '${search.replace(/'/g, "\'")}'`);
      }
      const response = await drive.files.list({
        q: qParts.join(' and '),
        fields: 'nextPageToken, files(id, name, parents, modifiedTime)',
        pageSize: 100,
        pageToken,
        orderBy: 'name asc',
      });
      const items = (response.data.files ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        parents: file.parents ?? [],
      }));
      return {
        type: 'folders',
        items,
        cursor: response.data.nextPageToken ?? null,
      };
    }

    const qParts = [`mimeType='${DOC_MIME_TYPE}'`, 'trashed=false'];
    if (params.folderId) {
      qParts.push(`'${String(params.folderId).replace(/'/g, "\'")}' in parents`);
    }
    if (search) {
      qParts.push(`name contains '${search.replace(/'/g, "\'")}'`);
    }
    const response = await drive.files.list({
      q: qParts.join(' and '),
      fields: 'nextPageToken, files(id, name, modifiedTime, createdTime, version, webViewLink, iconLink, parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken,
    });
    const items = (response.data.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      version: file.version,
      webViewLink: file.webViewLink,
      iconLink: file.iconLink,
      parents: file.parents ?? [],
    }));
    return {
      type: 'documents',
      items,
      cursor: response.data.nextPageToken ?? null,
    };
  }

  async fetchRecords(account, config = {}, options = {}) {
    await this.ensureAccessToken(account);
    const drive = this.createDriveClient(account.accessToken);

    const accountConfig = account.metadata?.['google-docs'] ?? account.metadata?.googleDocs ?? {};
    const accountDocs = sanitizeSelections(accountConfig.documents);
    const accountFolders = sanitizeSelections(accountConfig.folders);
    const configDocs = sanitizeSelections(config.documents || config.documentIds);
    const configFolders = sanitizeSelections(config.folders || config.folderIds);

    const documentsToFetch = mergeUniqueIds(accountDocs, configDocs);
    const foldersToFetch = mergeUniqueIds(accountFolders, configFolders);

    if (documentsToFetch.length === 0 && foldersToFetch.length === 0) {
      return { items: [] };
    }

    const sinceDate = parseDate(options.since);
    const maxRecords = Number(options.maxRecords ?? config.maxRecords ?? 100);

    const fileMap = new Map();

    for (const doc of documentsToFetch) {
      try {
        const metadata = await fetchFileMetadata(drive, doc.id);
        if (!metadata || metadata.mimeType !== DOC_MIME_TYPE) {
          continue;
        }
        fileMap.set(metadata.id, metadata);
      } catch (error) {
        logger.error(`Failed to load document ${doc.id}`, error);
      }
    }

    for (const folder of foldersToFetch) {
      let pageToken;
      do {
        try {
          const payload = await listFolderDocuments(drive, folder.id, { pageToken });
          for (const file of payload.files ?? []) {
            if (file.mimeType !== DOC_MIME_TYPE) {
              continue;
            }
            fileMap.set(file.id, file);
            if (fileMap.size >= maxRecords) {
              break;
            }
          }
          pageToken = payload.nextPageToken;
        } catch (error) {
          logger.error(`Failed to list folder ${folder.id}`, error);
          break;
        }
      } while (pageToken && fileMap.size < maxRecords);
      if (fileMap.size >= maxRecords) {
        break;
      }
    }

    const items = [];
    for (const metadata of fileMap.values()) {
      if (items.length >= maxRecords) {
        break;
      }
      const modifiedTime = parseDate(metadata.modifiedTime);
      if (sinceDate && modifiedTime && modifiedTime <= sinceDate) {
        continue;
      }
      try {
        const textBuffer = await exportFile(drive, metadata.id, TEXT_EXPORT_MIME);
        const pdfBuffer = await exportFile(drive, metadata.id, PDF_EXPORT_MIME);
        const textContent = textBuffer ? textBuffer.toString('utf8').trim() : '';
        const record = {
          recordId: metadata.id,
          externalId: metadata.id,
          uniqueValue: metadata.id,
          title: metadata.name,
          createdAt: parseDate(metadata.createdTime) ?? new Date(),
          updatedAt: modifiedTime ?? new Date(),
          fields: {
            name: metadata.name,
            version: metadata.version,
            mimeType: metadata.mimeType,
            webViewLink: metadata.webViewLink,
            iconLink: metadata.iconLink,
            parents: metadata.parents ?? [],
            owners: Array.isArray(metadata.owners)
              ? metadata.owners.map((owner) => ({
                displayName: owner.displayName,
                emailAddress: owner.emailAddress,
              }))
              : [],
            wordCount: textContent ? textContent.split(/\s+/).filter(Boolean).length : 0,
            textPreview: textContent ? textContent.slice(0, 4000) : '',
          },
          attachments: {
            textContent,
            pdfBuffer,
          },
          raw: metadata,
        };
        items.push(record);
      } catch (error) {
        logger.error(`Failed to export document ${metadata.id}`, error);
      }
    }

    return { items };
  }

  async processRecord(context) {
    const { record, recordPrimitive } = context ?? {};
    if (!record || !recordPrimitive) {
      return;
    }
    const attachments = record.attachments ?? {};
    const textContent = attachments.textContent ?? '';
    const pdfBuffer = attachments.pdfBuffer ?? null;
    const version = record.fields?.version ?? record.updatedAt?.toISOString?.();

    const existingVersion = recordPrimitive.referenceParameters?.googleDocs?.processedVersion;
    if (existingVersion && version && existingVersion === version) {
      return;
    }

    const primitiveId = recordPrimitive._id?.toString?.() ?? recordPrimitive.id;

    if (textContent && textContent.length > 0) {
      await uploadToBucket(TEXT_BUCKET, primitiveId, Buffer.from(textContent, 'utf8'), 'text/plain');
      try {
        const embeddings = await buildDocumentTextEmbeddings(textContent);
        if (embeddings && embeddings.length) {
          await storeDocumentEmbeddings(recordPrimitive, embeddings);
        }
      } catch (error) {
        logger.error(`Failed to build embeddings for ${primitiveId}`, error);
      }
    }

    if (pdfBuffer && pdfBuffer.length > 0) {
      await uploadToBucket(PDF_BUCKET, primitiveId, pdfBuffer, 'application/pdf');
    }

    const googleDocsMeta = {
      processedVersion: version ?? null,
      processedAt: new Date().toISOString(),
      hasPlainText: Boolean(textContent && textContent.length > 0),
      hasPdf: Boolean(pdfBuffer && pdfBuffer.length > 0),
      wordCount: record.fields?.wordCount ?? (textContent ? textContent.split(/\s+/).filter(Boolean).length : 0),
    };

    recordPrimitive.referenceParameters = {
      ...(recordPrimitive.referenceParameters ?? {}),
      googleDocs: {
        ...(recordPrimitive.referenceParameters?.googleDocs ?? {}),
        ...googleDocsMeta,
      },
    };

    await dispatchControlUpdate(primitiveId, 'referenceParameters', recordPrimitive.referenceParameters);
  }
}

registerIntegration(new GoogleDocsIntegration());
