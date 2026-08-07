import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./services.js";

const NOTIF_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const ROTATION_INTERVAL_MS = 15000; // 15 segundos

let currentActiveNotifs = {
    chart: null,
    skin: null
};

let activeRotationIndex = 0;
let rotationTimer = null;

/**
 * Agrega o reemplaza la notificación actual para la categoría especificada.
 * @param {'chart'|'skin'} category 
 * @param {Object} data 
 */
export async function createOrUpdateNotification(category, data) {
    if (!db) return;

    const notifPayload = {
        id: `${category}_${Date.now()}`,
        category: category, // 'chart' | 'skin'
        type: data.type, // 'new' | 'zip'
        timestamp: Date.now(),
        // Datos comunes
        title: data.title,
        artist: data.artist,
        artOrIcon: data.artOrIcon,
        // Específico para charts
        song: data.song || null,
        genre: data.genre || null,
        diff: data.diff || null,
        edition: data.edition || null,
        // Específico para skins
        skinName: data.skinName || null,
        platform: data.platform || null // 'Beatstar' | 'TapWave'
    };

    await set(ref(db, `active_notifications/${category}`), notifPayload);
}

/**
 * Elimina manualmente una notificación (Uso desde el modo creador).
 * @param {'chart'|'skin'} category 
 */
export async function deleteNotificationManually(category) {
    if (!db) return;
    await remove(ref(db, `active_notifications/${category}`));
}

/**
 * Escucha las notificaciones activas de Firebase y limpia de manera automática las mayores a 7 días.
 * @param {Function} renderCallback 
 */
export function subscribeToNotifications(renderCallback) {
    if (!db) return;

    onValue(ref(db, 'active_notifications'), (snap) => {
        const data = snap.val() || {};
        const now = Date.now();

        // Verificar si la notificación de chart caducó (> 7 días)
        if (data.chart && (now - data.chart.timestamp > NOTIF_DURATION_MS)) {
            remove(ref(db, 'active_notifications/chart'));
            data.chart = null;
        }

        // Verificar si la notificación de skin caducó (> 7 días)
        if (data.skin && (now - data.skin.timestamp > NOTIF_DURATION_MS)) {
            remove(ref(db, 'active_notifications/skin'));
            data.skin = null;
        }

        currentActiveNotifs.chart = data.chart || null;
        currentActiveNotifs.skin = data.skin || null;

        startRotationLoop(renderCallback);
    });
}

/**
 * Inicia o reinicia el ciclo de alternancia entre notificaciones si ambas existen.
 */
function startRotationLoop(renderCallback) {
    if (rotationTimer) clearInterval(rotationTimer);

    const hasChart = !!currentActiveNotifs.chart;
    const hasSkin = !!currentActiveNotifs.skin;

    if (!hasChart && !hasSkin) {
        renderCallback(null);
        return;
    }

    if (hasChart && !hasSkin) {
        renderCallback(currentActiveNotifs.chart);
        return;
    }

    if (!hasChart && hasSkin) {
        renderCallback(currentActiveNotifs.skin);
        return;
    }

    // Si ambas existen, alternar cada 15 segundos
    activeRotationIndex = 0;
    renderCallback(currentActiveNotifs.chart);

    rotationTimer = setInterval(() => {
        activeRotationIndex = (activeRotationIndex + 1) % 2;
        const target = activeRotationIndex === 0 ? currentActiveNotifs.chart : currentActiveNotifs.skin;
        renderCallback(target);
    }, ROTATION_INTERVAL_MS);
}