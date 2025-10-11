import { URL, URLSearchParams } from 'node:url';
import { google } from 'googleapis';
import { Storage } from '@google-cloud/storage';
import { PDFExtract } from 'pdf.js-extract';
import { getLogger } from '../../logger.js';
import { IntegrationProvider, registerIntegration } from '../registry.js';
import { buildDocumentTextEmbeddings, storeDocumentEmbeddings } from '../../DocumentSearch.js';
import { dispatchControlUpdate } from '../../SharedFunctions.js';

const logger = getLogger('integration-google-docs', 'debug');

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DOC_MIME_TYPE = 'application/vnd.google-apps.document';
const SUPPORTED_MIME_TYPES = [
  DOC_MIME_TYPE,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];
const OFFICE_DOC_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const TEXT_EXPORT_MIME = 'text/plain';
const PDF_EXPORT_MIME = 'application/pdf';
const TEXT_BUCKET = 'cc_vf_document_plaintext';
const PDF_BUCKET = 'cc_vf_documents';

let storageInstance;
const pdfExtract = new PDFExtract();

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

function buildMimeQuery() {
  return `(${SUPPORTED_MIME_TYPES.map((type) => `mimeType='${type}'`).join(' or ')})`;
}

function computeWordCount(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

async function extractTextFromPdf(buffer) {
  if (!buffer || buffer.length === 0) {
    return '';
  }
  try {
    const data = await pdfExtract.extractBuffer(buffer);
    if (!data?.pages) {
      return '';
    }
    const text = data.pages
      .map((page) => (page.content ?? []).map((item) => item.str ?? '').join(' '))
      .join('\n');
    return text.trim();
  } catch (error) {
    logger.warn('Failed to extract text from PDF', error);
    return '';
  }
}

async function extractTextFromBuffer(buffer, mimeType) {
  if (!buffer || buffer.length === 0) {
    return '';
  }
  if (!mimeType) {
    return '';
  }
  if (mimeType === 'text/plain') {
    return buffer.toString('utf8').trim();
  }
  if (mimeType === 'application/pdf') {
    return extractTextFromPdf(buffer);
  }
  if (OFFICE_DOC_MIME_TYPES.has(mimeType)) {
    logger.debug(`No text extractor configured for MIME type ${mimeType}; returning empty text`);
    return '';
  }
  return '';
}

async function downloadFile(drive, fileId) {
  try {
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return normalizeBuffer(response.data);
  } catch (error) {
    if (error?.code === 403 || error?.code === 404) {
      logger.warn(`Unable to download file ${fileId}`, error.message);
      return null;
    }
    throw error;
  }
}

async function copyFileAsGoogleDoc(drive, fileId, name) {
  try {
    const response = await drive.files.copy({
      fileId,
      supportsAllDrives: true,
      requestBody: {
        mimeType: DOC_MIME_TYPE,
        name: name ? `${name} (Imported)` : undefined,
      },
    });
    return response.data?.id ?? null;
  } catch (error) {
    logger.warn(`Failed to copy file ${fileId} as Google Doc`, error);
    return null;
  }
}

async function deleteFile(drive, fileId) {
  if (!fileId) return;
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (error) {
    if (error?.code === 404) {
      return;
    }
    logger.warn(`Failed to delete temporary file ${fileId}`, error);
  }
}

async function exportFile(drive, fileId, mimeType) {
  try {
    const response = await drive.files.export({ fileId, mimeType, supportsAllDrives: true }, { responseType: 'arraybuffer' });
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
    supportsAllDrives: true,
  });
  return response.data;
}

async function listFolderDocuments(drive, folderId, { search, pageToken } = {}) {
  const escapedFolderId = String(folderId).replace(/'/g, "\'");
  const qParts = [
    `'${escapedFolderId}' in parents`,
    buildMimeQuery(),
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
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
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
    return getEnv('GOOGLE_CLIENT_ID');
  }

  get clientSecret() {
    return getEnv('GOOGLE_SECRET');
  }

  get defaultRedirectUri() {
    return getEnv('GOOGLE_INTEGRATION_OAUTH_REDIRECT');
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
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
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

    const qParts = [buildMimeQuery(), 'trashed=false'];
    if (params.folderId) {
      qParts.push(`'${String(params.folderId).replace(/'/g, "\'")}' in parents`);
    }
    if (search) {
      qParts.push(`name contains '${search.replace(/'/g, "\'")}'`);
    }
    const response = await drive.files.list({
      q: qParts.join(' and '),
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, version, webViewLink, iconLink, parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
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
        if (!metadata || !SUPPORTED_MIME_TYPES.includes(metadata.mimeType)) {
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
            if (!SUPPORTED_MIME_TYPES.includes(file.mimeType)) {
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
      try {
        const fullMetadata = metadata.owners === undefined || metadata.version === undefined
          ? await fetchFileMetadata(drive, metadata.id).catch(() => metadata)
          : metadata;
        const details = {
          ...(metadata ?? {}),
          ...(fullMetadata ?? {}),
        };
        const mimeType = details.mimeType;
        if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
          continue;
        }

        const modifiedTime = parseDate(details.modifiedTime ?? metadata.modifiedTime);
        if (sinceDate && modifiedTime && modifiedTime <= sinceDate) {
          continue;
        }

        let textContent = '';
        let pdfBuffer = null;
        let fileBuffer = null;
        let fileContentType = null;
        let tempDocId = null;

        try {
          if (mimeType === DOC_MIME_TYPE) {
            const textBuffer = await exportFile(drive, details.id, TEXT_EXPORT_MIME);
            const exportedPdf = await exportFile(drive, details.id, PDF_EXPORT_MIME);
            textContent = textBuffer ? textBuffer.toString('utf8').trim() : '';
            pdfBuffer = exportedPdf ?? null;
            fileBuffer = exportedPdf ?? null;
            fileContentType = exportedPdf ? PDF_EXPORT_MIME : null;
          } else if (mimeType === 'application/pdf') {
            const binaryBuffer = await downloadFile(drive, details.id);
            if (!binaryBuffer || binaryBuffer.length === 0) {
              continue;
            }
            fileBuffer = binaryBuffer;
            fileContentType = mimeType;
            pdfBuffer = binaryBuffer;
            textContent = await extractTextFromPdf(binaryBuffer);
          } else if (OFFICE_DOC_MIME_TYPES.has(mimeType)) {
            const binaryBuffer = await downloadFile(drive, details.id);
            if (!binaryBuffer || binaryBuffer.length === 0) {
              continue;
            }
            fileBuffer = binaryBuffer;
            fileContentType = mimeType;
            tempDocId = await copyFileAsGoogleDoc(drive, details.id, details.name);
            if (tempDocId) {
              const textBuffer = await exportFile(drive, tempDocId, TEXT_EXPORT_MIME);
              const exportedPdf = await exportFile(drive, tempDocId, PDF_EXPORT_MIME);
              textContent = textBuffer ? textBuffer.toString('utf8').trim() : '';
              pdfBuffer = exportedPdf ?? null;
            }
            if (!textContent) {
              textContent = await extractTextFromBuffer(binaryBuffer, mimeType);
            }
          } else if (mimeType === 'text/plain') {
            const binaryBuffer = await downloadFile(drive, details.id);
            if (!binaryBuffer || binaryBuffer.length === 0) {
              continue;
            }
            fileBuffer = binaryBuffer;
            fileContentType = mimeType;
            textContent = binaryBuffer.toString('utf8').trim();
          } else {
            const binaryBuffer = await downloadFile(drive, details.id);
            if (!binaryBuffer || binaryBuffer.length === 0) {
              continue;
            }
            fileBuffer = binaryBuffer;
            fileContentType = mimeType;
            textContent = await extractTextFromBuffer(binaryBuffer, mimeType);
          }
        } finally {
          if (tempDocId) {
            await deleteFile(drive, tempDocId);
          }
        }

        const wordCount = computeWordCount(textContent);
        const textPreview = textContent ? textContent.slice(0, 4000) : '';
        const record = {
          recordId: metadata.id,
          externalId: metadata.id,
          uniqueValue: metadata.id,
          title: details.name,
          createdAt: parseDate(details.createdTime) ?? new Date(),
          updatedAt: modifiedTime ?? new Date(),
          fields: {
            name: details.name,
            version: details.version,
            mimeType,
            webViewLink: details.webViewLink,
            iconLink: details.iconLink,
            parents: details.parents ?? [],
            owners: Array.isArray(details.owners)
              ? details.owners.map((owner) => ({
                displayName: owner.displayName,
                emailAddress: owner.emailAddress,
              }))
              : [],
            wordCount,
            textPreview,
          },
          attachments: {
            textContent,
            pdfBuffer,
            fileBuffer,
            fileContentType,
            fileName: details.name,
          },
          raw: details,
        };
        items.push(record);
      } catch (error) {
        logger.error(`Failed to export document ${metadata.id}`, error);
      }
    }

    return { items };
  }

  async processRecord(context) {
    const {
      record,
      recordPrimitive,
      childPrimitives = [],
    } = context ?? {};
    if (!record || !recordPrimitive) {
      return;
    }
    const attachments = record.attachments ?? {};
    const version = record.fields?.version ?? record.updatedAt?.toISOString?.();
    const primitiveId = recordPrimitive._id?.toString?.() ?? recordPrimitive.id;

    const existingVersion = recordPrimitive.referenceParameters?.googleDocs?.processedVersion;
    if (existingVersion && version && existingVersion === version) {
      return;
    }

    const childAttachmentJobs = (Array.isArray(childPrimitives) ? childPrimitives : [])
      .map((entry) => {
        if (!entry) return null;
        const attachmentMap = entry.mappingConfig?.attachmentMap;
        if (!attachmentMap || typeof attachmentMap !== 'object' || Object.keys(attachmentMap).length === 0) {
          return null;
        }
        const primitive = entry.primitive;
        if (!primitive) return null;
        const childId = primitive._id?.toString?.() ?? primitive.id;
        if (!childId) return null;
        return {
          primitive,
          attachmentMap,
        };
      })
      .filter(Boolean);

    const delegateToChildren = childAttachmentJobs.length > 0;
    let textHandledByChildren = false;

    for (const job of childAttachmentJobs) {
      const childPrimitive = job.primitive;
      const childId = childPrimitive._id?.toString?.() ?? childPrimitive.id;
      if (!childId) {
        continue;
      }

      const existingChildVersion = childPrimitive.referenceParameters?.integrationAttachments?.processedVersion;
      if (existingChildVersion && version && existingChildVersion === version) {
        continue;
      }

      const existingAttachmentsMeta = childPrimitive.referenceParameters?.integrationAttachments?.attachments ?? {};
      const updatedAttachmentsMeta = { ...existingAttachmentsMeta };
      let childHasText = false;

      for (const [attachmentKey, rawConfig] of Object.entries(job.attachmentMap ?? {})) {
        if (!attachmentKey) {
          continue;
        }
        const config = typeof rawConfig === 'string'
          ? { kind: 'file' }
          : { ...(rawConfig ?? {}) };

        const kind = typeof config.kind === 'string' ? config.kind.trim().toLowerCase() : null;
        if (!kind) {
          continue;
        }

        const textSourceValue = attachments.textContent ?? record.fields?.textContent ?? '';
        const fileBufferValue = normalizeBuffer(
          attachments.fileBuffer
            ?? attachments.binary
            ?? attachments.pdfBuffer
            ?? record.fields?.fileBuffer
            ?? record.fields?.pdfBuffer,
        );
        const fileMimeType = attachments.fileContentType
          ?? record.fields?.fileContentType
          ?? record.fields?.mimeType
          ?? null;
        const wordCountValue = typeof attachments.wordCount === 'number'
          ? attachments.wordCount
          : typeof record.fields?.wordCount === 'number'
            ? record.fields.wordCount
            : computeWordCount(textSourceValue);

        const attachmentRecord = {
          source: config,
          updatedAt: new Date().toISOString(),
          kind,
        };

        let shouldPersist = false;

        if (kind === 'text') {
          const textString = typeof textSourceValue === 'string'
            ? textSourceValue
            : Buffer.isBuffer(textSourceValue)
              ? textSourceValue.toString('utf8')
              : '';

          if (textString && textString.length > 0) {
            const textKey = `${childId}-${attachmentKey}-text`;
            await ensureTextEmbeddingUpload(childPrimitive, {
              text: textString,
              textKey,
            });

            attachmentRecord.text = {
              bucket: TEXT_BUCKET,
              objectKey: textKey,
              wordCount: wordCountValue,
            };
            childHasText = true;
            textHandledByChildren = true;
            shouldPersist = true;
          }
        } else if (kind === 'file') {
          if (fileBufferValue && fileBufferValue.length > 0) {
            const fileKey = `${childId}-${attachmentKey}-file`;
            const textString = typeof textSourceValue === 'string'
              ? textSourceValue
              : Buffer.isBuffer(textSourceValue)
                ? textSourceValue.toString('utf8')
                : '';
            const textKey = textString && textString.length > 0
              ? `${childId}-${attachmentKey}-text`
              : null;
            const wordCount = textString && textString.length > 0
              ? wordCountValue
              : undefined;

            await ensureTextEmbeddingUpload(childPrimitive, {
              text: textString && textString.length > 0 ? textString : null,
              textKey,
              fileBuffer: fileBufferValue,
              fileKey,
              mimeType: fileMimeType ?? 'application/octet-stream',
            });
            attachmentRecord.file = {
              bucket: PDF_BUCKET,
              objectKey: fileKey,
              mimeType: fileMimeType ?? null,
              size: fileBufferValue.length,
            };
            if (textString && textString.length > 0) {
              attachmentRecord.text = {
                bucket: TEXT_BUCKET,
                objectKey: textKey,
                wordCount,
              };
              childHasText = true;
              textHandledByChildren = true;
            }
            shouldPersist = true;
          }
        } else {
          logger.debug(`Unsupported attachment kind "${kind}" for ${attachmentKey}; skipping`);
        }

        if (!shouldPersist) {
          continue;
        }

          updatedAttachmentsMeta[attachmentKey] = {
            ...(existingAttachmentsMeta?.[attachmentKey] ?? {}),
            ...attachmentRecord,
          };
      }

      if (Object.keys(updatedAttachmentsMeta).length > 0) {
        const integrationAttachments = {
          ...(childPrimitive.referenceParameters?.integrationAttachments ?? {}),
          processedVersion: version ?? null,
          processedAt: new Date().toISOString(),
          attachments: updatedAttachmentsMeta,
        };

        const updatedReferenceParameters = {
          ...(childPrimitive.referenceParameters ?? {}),
          integrationAttachments,
        };

        await dispatchControlUpdate(childId, 'referenceParameters', updatedReferenceParameters);
        childPrimitive.referenceParameters = updatedReferenceParameters;
      }

      if (childHasText) {
        textHandledByChildren = true;
      }
    }

    if (!delegateToChildren) {
      const textContent = attachments.textContent ?? '';
      const pdfBuffer = normalizeBuffer(attachments.pdfBuffer);
      let fileBuffer = normalizeBuffer(attachments.fileBuffer);
      let fileContentType = attachments.fileContentType ?? null;
      if ((!fileBuffer || fileBuffer.length === 0) && pdfBuffer && pdfBuffer.length > 0) {
        fileBuffer = pdfBuffer;
        fileContentType = fileContentType ?? 'application/pdf';
      }

      const effectiveFileContentType = fileContentType ?? (pdfBuffer && pdfBuffer.length > 0 ? 'application/pdf' : null);

      await ensureTextEmbeddingUpload(recordPrimitive, {
        text: textContent,
        textKey: textContent ? primitiveId : null,
        fileBuffer: fileBuffer && fileBuffer.length > 0 ? fileBuffer : null,
        fileKey: fileBuffer && fileBuffer.length > 0 ? primitiveId : null,
        mimeType: effectiveFileContentType ?? 'application/octet-stream',
      });

      const googleDocsMeta = {
        processedVersion: version ?? null,
        processedAt: new Date().toISOString(),
        hasPlainText: Boolean(textContent && textContent.length > 0),
        hasPdf: Boolean(pdfBuffer && pdfBuffer.length > 0),
        hasFile: Boolean(fileBuffer && fileBuffer.length > 0),
        fileMimeType: effectiveFileContentType ?? null,
        fileName: attachments.fileName ?? null,
        wordCount: record.fields?.wordCount ?? computeWordCount(textContent),
      };

      const attachmentSourceKeys = Array.from(new Set([
        ...(Array.isArray(recordPrimitive.referenceParameters?.availableAttachmentSources)
          ? recordPrimitive.referenceParameters.availableAttachmentSources
          : []),
        ...Object.keys(attachments),
      ]));

      recordPrimitive.referenceParameters = {
        ...(recordPrimitive.referenceParameters ?? {}),
        availableAttachmentSources: attachmentSourceKeys,
        googleDocs: {
          ...(recordPrimitive.referenceParameters?.googleDocs ?? {}),
          ...googleDocsMeta,
        },
      };

      await dispatchControlUpdate(primitiveId, 'referenceParameters', recordPrimitive.referenceParameters);
      return;
    }

    const googleDocsMeta = {
      processedVersion: version ?? null,
      processedAt: new Date().toISOString(),
      delegatedToChildren: true,
      hasPlainText: false,
      hasPdf: false,
      hasFile: false,
      fileMimeType: null,
      fileName: attachments.fileName ?? null,
      wordCount: record.fields?.wordCount ?? (textHandledByChildren ? computeWordCount(attachments.textContent ?? '') : 0),
    };

    const attachmentSourceKeys = Array.from(new Set([
      ...(Array.isArray(recordPrimitive.referenceParameters?.availableAttachmentSources)
        ? recordPrimitive.referenceParameters.availableAttachmentSources
        : []),
      ...Object.keys(attachments),
    ]));

    recordPrimitive.referenceParameters = {
      ...(recordPrimitive.referenceParameters ?? {}),
      availableAttachmentSources: attachmentSourceKeys,
      googleDocs: {
        ...(recordPrimitive.referenceParameters?.googleDocs ?? {}),
        ...googleDocsMeta,
      },
    };

    await dispatchControlUpdate(primitiveId, 'referenceParameters', recordPrimitive.referenceParameters);
  }
}

registerIntegration(new GoogleDocsIntegration());
async function ensureTextEmbeddingUpload(primitive, options) {
  if (!primitive || !options) {
    return;
  }
  const {
    text,
    fileBuffer,
    fileKey,
    textKey,
    mimeType,
  } = options;

  if (text && text.length > 0 && textKey) {
    try {
      await uploadToBucket(TEXT_BUCKET, textKey, Buffer.from(text, 'utf8'), 'text/plain');
    } catch (error) {
      logger.error(`Failed to upload text for ${primitive.id} (${textKey})`, error);
    }

    try {
      const embeddings = await buildDocumentTextEmbeddings(text);
      if (embeddings && embeddings.length) {
        await storeDocumentEmbeddings(primitive, embeddings);
      }
    } catch (error) {
      logger.error(`Failed to build embeddings for ${primitive.id}`, error);
    }
  }

  if (fileBuffer && fileBuffer.length > 0 && fileKey) {
    try {
      await uploadToBucket(
        PDF_BUCKET,
        fileKey,
        fileBuffer,
        mimeType ?? 'application/octet-stream',
      );
    } catch (error) {
      logger.error(`Failed to upload file buffer for ${primitive.id} (${fileKey})`, error);
    }
  }
}
