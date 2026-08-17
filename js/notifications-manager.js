import { ref, set, onValue, remove, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./services.js";

let notificationsList = [];
let currentIndex = 0;
let rotationIntervalId = null;
let onNotificationChangeCallback = null;
let isCreatorModeActive = false;

export function subscribeToNotifications(callback, isCreatorMode = false) {
    onNotificationChangeCallback = callback;
    isCreatorModeActive = isCreatorMode;

    const notifRef = ref(db, 'notifications');
    onValue(notifRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            notificationsList = [];
            currentIndex = 0;
            triggerCallback();
            stopRotationTimer();
            return;
        }

        notificationsList = Object.values(data);
        if (currentIndex >= notificationsList.length) {
            currentIndex = 0;
        }

        triggerCallback();
        manageRotationTimer();
    });
}

export function setCreatorModeInNotifications(isCreator) {
    isCreatorModeActive = isCreator;
    manageRotationTimer();
    triggerCallback();
}

export async function createOrUpdateNotification(category, data) {
    if (!category || !data) return;

    try {
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        const existingData = snapshot.val() || {};

        let targetId = null;

        // Si es una actualización de ZIP, buscamos si existe una notificación activa previa para el mismo elemento
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

        // Si no se encontró una notificación activa que corresponda (o es de tipo 'new'), se crea un ID único
        if (!targetId) {
            targetId = `${category}_${Date.now()}`;
        }

    const notifPayload = {
            id: targetId,
            category: category,
            type: data.type || 'new',
            artOrIcon: data.artOrIcon || '',
            timestamp: Date.now(),
            // Específico para charts
            song: data.song || null,
            artist: data.artist || null,
            genre: data.genre || null,
            diff: data.diff || null,
            diffDeluxe: data.diffDeluxe || null,
            edition: data.edition || null,
            // Específico para skins
            skinName: data.skinName || null,
            platform: data.platform || null
        };

        const targetRef = ref(db, `notifications/${targetId}`);
        await set(targetRef, notifPayload);
    } catch (err) {
        console.error("Error al crear/actualizar notificación:", err);
    }
}

export async function deleteNotificationManually(category) {
    if (!category) return;
    const targetRef = ref(db, `notifications/${category}`);
    await remove(targetRef);
}

export async function checkAndDeleteNotifOnRecordDelete(category, recordIdentifier) {
    if (!category) return;
    try {
        const targetRef = ref(db, `notifications/${category}`);
        const snapshot = await get(targetRef);
        if (snapshot.exists()) {
            const notifData = snapshot.val();
            if (
                !recordIdentifier ||
                notifData.song === recordIdentifier ||
                notifData.skinName === recordIdentifier ||
                notifData.artOrIcon === recordIdentifier
            ) {
                await remove(targetRef);
            }
        }
    } catch (err) {
        console.error("Error al verificar/eliminar notificación asociada:", err);
    }
}

export async function checkAndDeleteNotifOnZipDelete(category, recordIdentifier) {
    if (!category) return;
    try {
        const targetRef = ref(db, `notifications/${category}`);
        const snapshot = await get(targetRef);
        if (snapshot.exists()) {
            const notifData = snapshot.val();
            if (
                notifData.type === 'available' &&
                (!recordIdentifier || notifData.song === recordIdentifier || notifData.skinName === recordIdentifier)
            ) {
                await remove(targetRef);
            }
        }
    } catch (err) {
        console.error("Error al verificar/eliminar notificación de zip:", err);
    }
}

export function nextNotification() {
    if (notificationsList.length <= 1) return;
    currentIndex = (currentIndex + 1) % notificationsList.length;
    triggerCallback();
    if (!isCreatorModeActive) restartRotationTimer();
}

export function previousNotification() {
    if (notificationsList.length <= 1) return;
    currentIndex = (currentIndex - 1 + notificationsList.length) % notificationsList.length;
    triggerCallback();
    if (!isCreatorModeActive) restartRotationTimer();
}

function triggerCallback() {
    if (typeof onNotificationChangeCallback === 'function') {
        const activeNotif = notificationsList.length > 0 ? notificationsList[currentIndex] : null;
        onNotificationChangeCallback(activeNotif, {
            totalActive: notificationsList.length,
            currentIndex: currentIndex
        });
    }
}

function manageRotationTimer() {
    stopRotationTimer();
    if (!isCreatorModeActive && notificationsList.length > 1) {
        startRotationTimer();
    }
}

function startRotationTimer() {
    rotationIntervalId = setInterval(() => {
        nextNotification();
    }, 15000);
}

function stopRotationTimer() {
    if (rotationIntervalId) {
        clearInterval(rotationIntervalId);
        rotationIntervalId = null;
    }
}

function restartRotationTimer() {
    stopRotationTimer();
    startRotationTimer();
}