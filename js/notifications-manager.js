import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db } from "./services.js";

const NOTIF_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const ROTATION_INTERVAL_MS = 15000; // 15 segundos entre notificaciones

let currentActiveNotifs = {
    chart: null,
    skin: null
};

let activeRotationIndex = 0;
let progressTimer = null;
let currentRenderCallback = null;
let currentIsCreatorMode = false;

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
 * Elimina manualmente una notificación (Uso desde el botón "X" o panel de creador).
 * @param {'chart'|'skin'} category 
 */
export async function deleteNotificationManually(category) {
    if (!db) return;
    await remove(ref(db, `active_notifications/${category}`));
}

/**
 * Elimina la notificación si se elimina el registro correspondiente.
 * @param {'chart'|'skin'} category 
 */
export async function checkAndDeleteNotifOnRecordDelete(category) {
    if (!db) return;
    if (currentActiveNotifs[category]) {
        await remove(ref(db, `active_notifications/${category}`));
    }
}

/**
 * Elimina la notificación si se elimina el archivo .zip y la notificación activa es de tipo 'zip' ("Chart/Skin Disponible").
 * @param {'chart'|'skin'} category 
 */
export async function checkAndDeleteNotifOnZipDelete(category) {
    if (!db) return;
    const activeNotif = currentActiveNotifs[category];
    if (activeNotif && activeNotif.type === 'zip') {
        await remove(ref(db, `active_notifications/${category}`));
    }
}

/**
 * Escucha las notificaciones activas de Firebase y limpia de manera automática las mayores a 7 días.
 * @param {Function} renderCallback 
 * @param {boolean} isCreatorMode 
 */
export function subscribeToNotifications(renderCallback, isCreatorMode = false) {
    if (!db) return;

    currentRenderCallback = renderCallback;
    currentIsCreatorMode = isCreatorMode;

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

        startRotationLoop();
    });
}

/**
 * Actualiza el estado del modo creador y re-evalúa la rotación/suspensión.
 * @param {boolean} isCreatorMode 
 */
export function setCreatorModeInNotifications(isCreatorMode) {
    currentIsCreatorMode = isCreatorMode;
    startRotationLoop();
}

/**
 * Alterna manualmente a la siguiente notificación (si hay 2 activas).
 */
export function nextNotification() {
    if (currentActiveNotifs.chart && currentActiveNotifs.skin) {
        stopRotationLoop();
        triggerAnimatedTransition(() => {
            activeRotationIndex = (activeRotationIndex + 1) % 2;
            renderActiveSelection();
        });
        startRotationLoop();
    }
}

/**
 * Alterna manualmente a la notificación anterior (si hay 2 activas).
 */
export function previousNotification() {
    if (currentActiveNotifs.chart && currentActiveNotifs.skin) {
        stopRotationLoop();
        triggerAnimatedTransition(() => {
            activeRotationIndex = (activeRotationIndex - 1 + 2) % 2;
            renderActiveSelection();
        });
        startRotationLoop();
    }
}

/**
 * Ejecuta la animación de salida (slideUpOut) y entrada (slideDownIn) del banner.
 */
function triggerAnimatedTransition(updateCallback) {
    const banner = document.getElementById('home-notification-banner');
    if (!banner) {
        if (updateCallback) updateCallback();
        return;
    }

    // 1. Animación hacia arriba (Cierre)
    banner.classList.remove('anim-notif-enter');
    banner.classList.add('anim-notif-leave');

    setTimeout(() => {
        // 2. Ejecutar cambio de contenido/notificación
        if (updateCallback) updateCallback();

        // 3. Animación hacia abajo (Apertura)
        banner.classList.remove('anim-notif-leave');
        banner.classList.add('anim-notif-enter');
    }, 350); // Tiempo equivalente a la animación CSS (0.35s)
}

/**
 * Renderiza la notificación basada en el índice activo actual.
 */
function renderActiveSelection() {
    if (!currentRenderCallback) return;

    const hasChart = !!currentActiveNotifs.chart;
    const hasSkin = !!currentActiveNotifs.skin;
    const totalActive = (hasChart ? 1 : 0) + (hasSkin ? 1 : 0);

    if (totalActive === 0) {
        currentRenderCallback(null, { totalActive: 0, currentIndex: 0 });
        return;
    }

    if (hasChart && !hasSkin) {
        activeRotationIndex = 0;
        currentRenderCallback(currentActiveNotifs.chart, { totalActive: 1, currentIndex: 0 });
        return;
    }

    if (!hasChart && hasSkin) {
        activeRotationIndex = 1;
        currentRenderCallback(currentActiveNotifs.skin, { totalActive: 1, currentIndex: 0 });
        return;
    }

    // Ambas activas
    const target = activeRotationIndex === 0 ? currentActiveNotifs.chart : currentActiveNotifs.skin;
    currentRenderCallback(target, { totalActive: 2, currentIndex: activeRotationIndex });
}

/**
 * Detiene el temporizador de rotación y limpia la barra de progreso.
 */
function stopRotationLoop() {
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
    const progressBar = document.getElementById('notif-progress-fill');
    if (progressBar) progressBar.style.width = '0%';
}

/**
 * Inicia, detiene o gestiona el ciclo de alternancia entre notificaciones.
 */
function startRotationLoop() {
    stopRotationLoop();

    const hasChart = !!currentActiveNotifs.chart;
    const hasSkin = !!currentActiveNotifs.skin;

    if (!hasChart || !hasSkin) {
        activeRotationIndex = hasChart ? 0 : (hasSkin ? 1 : 0);
        renderActiveSelection();
        return;
    }
    
    // Si ambas existen, renderizar selección inicial
    renderActiveSelection();
    
    // Si NO estamos en modo creador, rotar automáticamente actualizando la barra de progreso
    if (!currentIsCreatorMode) {
        
        let elapsedTime = 0;
        const step = 100;

        progressTimer = setInterval(() => {
            elapsedTime += step;
            const percentage = Math.min((elapsedTime / ROTATION_INTERVAL_MS) * 100, 100);
            
            const progressBar = document.getElementById('notif-progress-fill');
            if (progressBar) {
                progressBar.style.width = `${percentage}%`;
            }

            if (elapsedTime >= ROTATION_INTERVAL_MS) {
                elapsedTime = 0;
                triggerAnimatedTransition(() => {
                    activeRotationIndex = (activeRotationIndex + 1) % 2;
                    renderActiveSelection();
                });
            }
        }, step);
    }
}