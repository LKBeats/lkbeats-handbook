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
    s3ForcePathStyle: true,
    httpOptions: {
        timeout: 300000,        // 5 minutos de tiempo de espera total
        connectTimeout: 300000  // 5 minutos para establecer conexión
    }
});

export async function uploadFileToCloudflareR2(fileObject, subfolderName) {
    if (!fileObject) return "";

    const rawFileName = fileObject.name.substring(0, fileObject.name.lastIndexOf('.')) || fileObject.name;
    const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const extension = fileObject.name.split('.').pop();
    
    const cleanSubfolder = subfolderName ? subfolderName.trim().replace(/\/+$|^\/+/g, '') : "";
    const targetPath = cleanSubfolder ? `lkbeats/${cleanSubfolder}` : `lkbeats`;
    const fileKey = `${targetPath}/${cleanFileName}_${Date.now()}.${extension}`;

    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: fileKey,
        Body: fileObject,
        ContentType: fileObject.type || "application/octet-stream",
        ContentDisposition: `attachment; filename="${fileObject.name}"`,
        CacheControl: "public, max-age=31536000, immutable"
    };

    const uploadOptions = {
        partSize: 5 * 1024 * 1024, // Fragmentos de 5 MB
        queueSize: 1              // Enviar 1 fragmento a la vez para máxima estabilidad
    };

    try {
        await s3.upload(params, uploadOptions).promise();
        return `${R2_PUBLIC_DOMAIN}/${fileKey}`;
    } catch (e) {
        console.error("Error al subir archivo a Cloudflare R2:", e);
        alert("Error al subir el archivo a Cloudflare R2. Revisa la consola.");
        return "";
    }
}

export async function deleteFileFromCloudflareR2(fileUrlOrKey) {
    if (!fileUrlOrKey) return true;

    let fileKey = fileUrlOrKey;
    if (fileUrlOrKey.includes(R2_PUBLIC_DOMAIN)) {
        fileKey = fileUrlOrKey.replace(`${R2_PUBLIC_DOMAIN}/`, '');
    }

    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: fileKey
    };

    try {
        await s3.deleteObject(params).promise();
        console.log("Archivo eliminado con éxito de R2:", fileKey);
        return true;
    } catch (e) {
        console.error("Error al eliminar archivo de Cloudflare R2:", e);
        return false;
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