import { ref, set, onValue, remove, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./services.js";

let notificationsList = [];
let currentIndex = 0;
let rotationIntervalId = null;
let onNotificationChangeCallback = null;
let isCreatorModeActive = false;

export function getActiveNotificationsList() {
    return notificationsList;
}

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

    // Genera una ID única si no viene una explícita (para no sobreescribir la categoría entera)
    const notifId = data.notifId || `${category}_${Date.now()}`;

    const notifPayload = {
        id: notifId,
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

    const targetRef = ref(db, `notifications/${notifId}`);
    await set(targetRef, notifPayload);
}

export async function deleteNotificationManually(notifIdOrCategory) {
    if (!notifIdOrCategory) return;
    const targetRef = ref(db, `notifications/${notifIdOrCategory}`);
    await remove(targetRef);
}

export async function checkAndDeleteNotifOnRecordDelete(category, recordIdentifier) {
    if (!category) return;
    try {
        const targetRef = ref(db, 'notifications');
        const snapshot = await get(targetRef);
        if (snapshot.exists()) {
            const allNotifs = snapshot.val();
            for (const key in allNotifs) {
                const notifData = allNotifs[key];
                if (notifData.category === category) {
                    if (
                        !recordIdentifier ||
                        notifData.song === recordIdentifier ||
                        notifData.skinName === recordIdentifier ||
                        notifData.artOrIcon === recordIdentifier
                    ) {
                        await remove(ref(db, `notifications/${key}`));
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error al verificar/eliminar notificación asociada:", err);
    }
}

export async function checkAndDeleteNotifOnZipDelete(category, recordIdentifier) {
    if (!category) return;
    try {
        const targetRef = ref(db, 'notifications');
        const snapshot = await get(targetRef);
        if (snapshot.exists()) {
            const allNotifs = snapshot.val();
            for (const key in allNotifs) {
                const notifData = allNotifs[key];
                if (notifData.category === category && notifData.type === 'zip') {
                    if (
                        !recordIdentifier ||
                        notifData.song === recordIdentifier ||
                        notifData.skinName === recordIdentifier
                    ) {
                        await remove(ref(db, `notifications/${key}`));
                    }
                }
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