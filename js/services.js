import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==================== CONFIGURACIÓN DE CLOUDFLARE R2 ====================
export const R2_PUBLIC_DOMAIN = "https://pub-4fdb8147f49d431e8ee7060936e6e3ee.r2.dev";
export const R2_BUCKET_NAME = "lkbeats-media";
export const R2_ENDPOINT = "https://a9904a6a17cc7246ea1e407774e25aeb.r2.cloudflarestorage.com";

export const s3 = new AWS.S3({
    endpoint: R2_ENDPOINT,
    accessKeyId: "41f4c4233d58713c80ce7a5af929c0b4",
    secretAccessKey: "1844d769d83b70306c08a08b8d31d28589c496ed7cc0f308da2414c2804adaeb",
    signatureVersion: 'v4',
    region: 'auto',
    s3ForcePathStyle: true
});

export async function uploadFileToCloudflareR2(fileObject, subfolderName) {
    if (!fileObject) return "";

    const rawFileName = fileObject.name.substring(0, fileObject.name.lastIndexOf('.')) || fileObject.name;
    const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const extension = fileObject.name.split('.').pop();
    
    // CORRECCIÓN: Se elimina la subcarpeta fija "lkbeats/" y se formatea la carpeta dinámica recibida
    const cleanSubfolder = subfolderName ? subfolderName.trim().replace(/\/+$|^\/+/g, '') : "";
    const folderPath = cleanSubfolder ? `${cleanSubfolder}/` : "";
    const fileKey = `${folderPath}${cleanFileName}_${Date.now()}.${extension}`;

    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        Body: fileObject,
        ContentType: fileObject.type || "application/octet-stream",
        ContentDisposition: `attachment; filename="${fileObject.name}"`,
        CacheControl: "public, max-age=31536000, immutable"
    };

    try {
        await s3.upload(params).promise();
        return `${R2_PUBLIC_DOMAIN}/${fileKey}`;
    } catch (e) {
        console.error("Error al subir archivo a Cloudflare R2:", e);
        alert("Error al subir el archivo a Cloudflare R2. Revisa la consola.");
        return "";
    }
}

// ==================== CONFIGURACIÓN DE FIREBASE ====================
export const firebaseConfig = {
    apiKey: "AIzaSyBmYQjQiHBH6pLqKNpjc3gNUsrF0fdYJsU",
    authDomain: "lkbeats-handbook.firebaseapp.com",
    databaseURL: "https://lkbeats-handbook-default-rtdb.firebaseio.com?auth=BeatstarTest",
    projectId: "lkbeats-handbook",
    storageBucket: "lkbeats-handbook.firebasestorage.app",
    messagingSenderId: "638032680948",
    appId: "1:638032680948:web:66d78be109a16356a80ba1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);