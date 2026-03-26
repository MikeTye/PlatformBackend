import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "crypto";

const REGION = process.env.AWS_REGION;
if (!REGION) throw new Error("AWS_REGION env var is not set");

export const s3 = new S3Client({ region: REGION });

const BUCKET = process.env.BUCKET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL; // e.g. https://dxxx.cloudfront.net

if (!BUCKET) throw new Error("BUCKET env var is not set");
if (!PUBLIC_BASE_URL) throw new Error("PUBLIC_BASE_URL env var is not set");

type UploadUrlResult = { uploadUrl: string; key: string; assetUrl: string };

function normExt(fileExt: string) {
    return fileExt.startsWith(".") ? fileExt.slice(1) : fileExt;
}

async function getUploadUrl(prefix: string, fileExt: string, contentType: string): Promise<UploadUrlResult> {
    if (!prefix) throw new Error("prefix is required");
    if (!fileExt) throw new Error("fileExt is required");
    if (!contentType) throw new Error("contentType is required");

    const ext = normExt(fileExt);
    const key = `${prefix}/${randomUUID()}.${ext}`;

    const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
    const assetUrl = `${PUBLIC_BASE_URL}/${key}`;
    return { uploadUrl, key, assetUrl };
}

export async function createUploadUrlForCompanyClaim(
    companyId: string,
    fileName: string,
    contentType: string
): Promise<UploadUrlResult> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const hasExt = safeName.includes(".");
    const ext = hasExt ? safeName.split(".").pop() : "";
    const key = `company-claims/${companyId}/${randomUUID()}${ext ? `.${ext}` : ""}`;

    const putCmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(s3, putCmd, { expiresIn: 60 * 10 });

    const assetUrl = `${PUBLIC_BASE_URL}/${key}`;

    return { uploadUrl, key, assetUrl };
}

export function publicAssetUrlForKey(key: string) {
    const base = PUBLIC_BASE_URL!.replace(/\/+$/, "");
    const k = key.replace(/^\/+/, "");
    return `${base}/${k}`;
}

export async function getUploadUrlForProjectMedia(projectId: string, fileExt: string, contentType: string) {
    return getUploadUrl(`projects/${projectId}/media`, fileExt, contentType);
}

export async function getUploadUrlForProjectDocument(projectId: string, fileExt: string, contentType: string) {
    return getUploadUrl(`projects/${projectId}/documents`, fileExt, contentType);
}

export async function getUploadUrlForCompanyMedia(companyId: string, fileExt: string, contentType: string) {
    return getUploadUrl(`companies/${companyId}/media`, fileExt, contentType);
}

export async function getUploadUrlForCompanyDocument(companyId: string, fileExt: string, contentType: string) {
    return getUploadUrl(`companies/${companyId}/documents`, fileExt, contentType);
}

export async function getUploadUrlForUserMedia(userId: string, fileExt: string, contentType: string) {
    return getUploadUrl(`users/${userId}/media`, fileExt, contentType);
}

export function extractKeyFromAssetUrl(assetUrl?: string | null): string | null {
    if (!assetUrl) return null;
    try {
        const u = new URL(assetUrl);
        const pathname = u.pathname || "";
        const key = pathname.replace(/^\/+/, "");
        return key || null;
    } catch {
        // not a full URL; might already be a key
        const s = String(assetUrl).replace(/^\/+/, "");
        return s ? s : null;
    }
}

export function toPublicAssetUrl(input?: { asset_url?: string | null; s3_key?: string | null }): string | null {
    const assetUrl = input?.asset_url ?? null;
    const s3Key = input?.s3_key ?? null;

    // If it's already public/unsigned (your choice of rules), keep it.
    // Adjust the checks to your setup (CloudFront domain, S3 public domain, etc).
    if (assetUrl && PUBLIC_BASE_URL && assetUrl.startsWith(PUBLIC_BASE_URL)) return assetUrl;
    if (assetUrl && assetUrl.startsWith("data:")) return assetUrl; // if you ever store data URIs

    // Prefer explicit s3_key if present
    const key = s3Key || extractKeyFromAssetUrl(assetUrl);
    if (!key || !PUBLIC_BASE_URL) return assetUrl; // fallback: return whatever we have

    return `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/${key}`;
}
export async function getSignedReadUrlForKey(key: string, expiresInSeconds = 60 * 10): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

export async function deleteObjectByKey(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function uploadCompanyLogo(params: {
    companyId: string;
    originalName: string;
    contentType: string;
    body: Buffer;
}): Promise<{ key: string; assetUrl: string; sha256: string }> {

    const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.includes(".") ? safeName.split(".").pop() ?? "bin" : "bin";

    const key = `companies/${params.companyId}/logo/${randomUUID()}.${ext}`;

    // compute sha256
    const sha256 = createHash("sha256")
        .update(params.body)
        .digest("hex");

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.BUCKET,
            Key: key,
            Body: params.body,
            ContentType: params.contentType || "application/octet-stream",
        })
    );

    return {
        key,
        assetUrl: publicAssetUrlForKey(key),
        sha256,
    };
}