import { ref, set, get, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./services.js";

/**
 * Crea o actualiza una notificación activa en Firebase.
 */
export async function createOrUpdateNotification(category, data) {
    if (!category || !data) return;

    try {
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        const existingData = snapshot.val() || {};

        let targetId = null;

        // Si es una actualización de ZIP, buscamos la notificación activa del MISMO elemento
        if (data.type === 'zip') {
            for (const key of Object.keys(existingData)) {
                const item = existingData[key];
                if (item.category === category) {
                    if (category === 'chart' && item.song === data.song && item.artist === data.artist) {
                        targetId = key;
                        break;
                    } else if (category === 'skin' && item.skinName === data.skinName && item.platform === data.platform) {
                        targetId = key;
                        break;
                    }
                }
            }
        }

        // Si no se encontró o es un nuevo registro, generamos un ID único
        if (!targetId) {
            targetId = `${category}_${Date.now()}`;
        }

        const notifPayload = {
            id: targetId,
            category: category,
            type: data.type || 'new',
            artOrIcon: data.artOrIcon || '',
            timestamp: Date.now(),
            song: data.song || null,
            artist: data.artist || null,
            genre: data.genre || null,
            diff: data.diff || null,
            diffDeluxe: data.diffDeluxe || null,
            edition: data.edition || null,
            skinName: data.skinName || null,
            platform: data.platform || null
        };

        const targetRef = ref(db, `notifications/${targetId}`);
        await set(targetRef, notifPayload);
    } catch (err) {
        console.error("Error al crear/actualizar notificación:", err);
    }
}

/**
 * Elimina la notificación específica vinculada a un registro cuando este es borrado.
 */
export async function checkAndDeleteNotifOnRecordDelete(category, recordData = {}) {
    if (!category || !db) return;

    try {
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        const existingData = snapshot.val() || {};

        for (const key of Object.keys(existingData)) {
            const item = existingData[key];
            if (item.category === category) {
                let matches = false;

                if (category === 'chart' && recordData.song && recordData.artist) {
                    if (item.song === recordData.song && item.artist === recordData.artist) {
                        matches = true;
                    }
                } else if (category === 'skin' && recordData.skinName && recordData.platform) {
                    if (item.skinName === recordData.skinName && item.platform === recordData.platform) {
                        matches = true;
                    }
                }

                if (matches) {
                    await remove(ref(db, `notifications/${key}`));
                }
            }
        }
    } catch (err) {
        console.error("Error al eliminar notificación asociada al registro:", err);
    }
}

/**
 * Elimina la notificación de tipo 'zip' asociada únicamente al registro cuyo archivo ZIP fue borrado.
 */
export async function checkAndDeleteNotifOnZipDelete(category, recordData = {}) {
    if (!category || !db) return;

    try {
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        const existingData = snapshot.val() || {};

        for (const key of Object.keys(existingData)) {
            const item = existingData[key];
            if (item.category === category && item.type === 'zip') {
                let matches = false;

                if (category === 'chart' && recordData.song && recordData.artist) {
                    if (item.song === recordData.song && item.artist === recordData.artist) {
                        matches = true;
                    }
                } else if (category === 'skin' && recordData.skinName && recordData.platform) {
                    if (item.skinName === recordData.skinName && item.platform === recordData.platform) {
                        matches = true;
                    }
                }

                if (matches) {
                    await remove(ref(db, `notifications/${key}`));
                }
            }
        }
    } catch (err) {
        console.error("Error al eliminar notificación ZIP:", err);
    }
}