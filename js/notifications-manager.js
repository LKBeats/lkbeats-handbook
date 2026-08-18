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

    // 1. Si es actualización de ZIP, buscamos si ya existe una notificación de este elemento para actualizarla
    if (data.type === 'zip' || data.type === 'available') {
        const notifRef = ref(db, 'notifications');
        try {
            const snapshot = await get(notifRef);
            if (snapshot.exists()) {
                const allNotifs = snapshot.val();
                // Buscar coincidencia por nombre de canción o skin
                const targetEntry = Object.entries(allNotifs).find(([_, notif]) => {
                    if (category === 'chart') {
                        return notif.category === 'chart' && notif.song === data.song && notif.artist === data.artist;
                    } else if (category === 'skin') {
                        return notif.category === 'skin' && notif.skinName === data.skinName;
                    }
                    return false;
                });

                if (targetEntry) {
                    const [targetId, existingNotif] = targetEntry;
                    const updatedPayload = {
                        ...existingNotif,
                        type: 'available',
                        timestamp: Date.now()
                    };
                    await set(ref(db, `notifications/${targetId}`), updatedPayload);
                    return;
                }
            }
        } catch (err) {
            console.error("Error al buscar notificación existente para actualizar ZIP:", err);
        }
    }

    // 2. Si es una notificación nueva o no se encontró una previa para actualizar, generamos un ID único
    const uniqueId = `${category}_${Date.now()}`;

    const notifPayload = {
        id: uniqueId,
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

    const targetRef = ref(db, `notifications/${uniqueId}`);
    await set(targetRef, notifPayload);
}

export async function deleteNotificationManually(notifIdOrCategory) {
    if (!notifIdOrCategory) return;

    // Si nos pasa la categoría ('chart' o 'skin'), buscamos el ID de la notificación activa en ese momento
    let targetId = notifIdOrCategory;
    if (notifIdOrCategory === 'chart' || notifIdOrCategory === 'skin') {
        const activeNotif = notificationsList[currentIndex];
        if (activeNotif && activeNotif.category === notifIdOrCategory) {
            targetId = activeNotif.id;
        }
    }

    const targetRef = ref(db, `notifications/${targetId}`);
    await remove(targetRef);
}

export async function checkAndDeleteNotifOnRecordDelete(category, recordIdentifier) {
    if (!category) return;
    try {
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        if (snapshot.exists()) {
            const allNotifs = snapshot.val();
            // Buscar todas las notificaciones que pertenezcan a este elemento borrado
            for (const [id, notif] of Object.entries(allNotifs)) {
                if (notif.category === category) {
                    const matchesChart = category === 'chart' && (notif.song === recordIdentifier || !recordIdentifier);
                    const matchesSkin = category === 'skin' && (notif.skinName === recordIdentifier || !recordIdentifier);
                    
                    if (matchesChart || matchesSkin || notif.artOrIcon === recordIdentifier) {
                        await remove(ref(db, `notifications/${id}`));
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
        const notifRef = ref(db, 'notifications');
        const snapshot = await get(notifRef);
        if (snapshot.exists()) {
            const allNotifs = snapshot.val();
            for (const [id, notif] of Object.entries(allNotifs)) {
                if (notif.category === category && (notif.type === 'available' || notif.type === 'zip')) {
                    const matchesChart = category === 'chart' && (notif.song === recordIdentifier || !recordIdentifier);
                    const matchesSkin = category === 'skin' && (notif.skinName === recordIdentifier || !recordIdentifier);

                    if (matchesChart || matchesSkin) {
                        await remove(ref(db, `notifications/${id}`));
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