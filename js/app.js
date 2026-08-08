import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { translations } from "./i18n.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { 
    stopGlobalAudioPreview, 
    toggleAudioPreviewEngine, 
    getActiveAudioElement, 
    getAudioAnalyser, 
    startRadialCanvasVisualizer 
} from "./audio-player.js";
import { 
    subscribeToNotifications, 
    deleteNotificationManually, 
    setCreatorModeInNotifications,
    nextNotification,
    previousNotification
} from "./notifications-manager.js";
import { initChartsModule } from "./charts.js";
import { initSkinsModule } from "./skins.js";

// =========================================================
// 1. DECLARACIÓN DE CONSTANTES Y VARIABLES DE ESTADO GLOBALES
// =========================================================
const genreList = [
    { color: "#bf2726", label: "Rock" },
    { color: "#da6128", label: "Alternative" },
    { color: "#02fe03", label: "Classical" },
    { color: "#84532f", label: "Country" },
    { color: "#8836c7", label: "Dance/EDM" },
    { color: "#2660d2", label: "Hip-Hop" },
    { color: "#c43d73", label: "Pop" },
    { color: "#019ac4", label: "RnB" }
];

const skinUniversalGenreList = [
    { color: "#c43d73", label: "Pop" },
    { color: "#da6128", label: "Alternative" },
    { color: "#8836c7", label: "Dance/EDM" },
    { color: "#bf2726", label: "Rock" },
    { color: "#2660d2", label: "Hip-Hop" },
    { color: "#84532f", label: "Country" },
    { color: "#019ac4", label: "RnB" }
];

let isCreatorMode = false;
let currentLanguage = localStorage.getItem('nexus_lang') || 'es';
let currentViewName = 'home';
let levels = [];
let cosmetics = [];
let globalFooterLinks = { beatclone: '', bscm: '', beatcharts: '', tapwave: '' };
let currentSelectedSkinSubPlatform = 'Beatstar';
let globalVisualAssets = {};
let globalThanksVideos = [];
let brandCustomNamesMap = {};

let activeChartSelectedEditions = {};
let activeChartExplicitStates = {};
let currentActiveDownloadUrl = "";

let activeVideoElement = null;
let pendingDeleteActionCallback = null;
let activeModalBeatstarChart = null;

// Mantener la última notificación activa
let latestActiveNotification = null;
let latestNotifMeta = { totalActive: 0, currentIndex: 0 };

// =========================================================
// 2. FUNCIONES AUXILIARES DE RENDERIZADO PARA BANNER
// =========================================================

function renderNotifGenresBadgesHtml(rawGenre) {
    if (!rawGenre) return `<span class="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-fuchsia-950/40 border border-fuchsia-800/40 text-fuchsia-300 text-[10px] sm:text-[11px] font-black uppercase"><span class="hidden sm:inline">General</span></span>`;
    
    return rawGenre.split(' / ').map(g => {
        const trimmed = g.trim();
        const matched = genreList.find(item => item.label.toLowerCase() === trimmed.toLowerCase());
        const color = matched ? matched.color : '#f97316';
        
        const safeKey = trimmed.replace('/', '');
        const dynamicAssetSrc = globalVisualAssets[`genre_${safeKey}`] || globalVisualAssets[`genre_${trimmed}`];
        
        const graphicElement = dynamicAssetSrc 
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAssetSrc}'); mask-image: url('${dynamicAssetSrc}');"></span>`
            : `<span class="w-2.5 h-2.5 sm:w-2.5 sm:h-2.5 rounded-full inline-block shrink-0" style="background-color: ${color}"></span>`;

        return `
            <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded border text-[10px] sm:text-[11px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${trimmed}">
                ${graphicElement}
                <span class="hidden sm:inline">${trimmed}</span>
            </div>
        `;
    }).join(' ');
}

function renderNotifDiffTagHtml(diffVal) {
    let color = '#71717a';
    let label = diffVal || 'Normal';

    if (diffVal === 'Hard') color = '#f97316';
    else if (diffVal === 'Extreme') color = '#ef4444';

    const dynamicAsset = globalVisualAssets[`diff_${diffVal}`];
    const graphicMarkup = dynamicAsset
        ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAsset}'); mask-image: url('${dynamicAsset}');"></span>`
        : `<i class="fa-solid fa-layer-group text-[10px]"></i>`;

    return `
        <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded border text-[10px] sm:text-[11px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
            ${graphicMarkup}
            <span class="hidden sm:inline">${label}</span>
        </div>
    `;
}

function renderNotifEditionTagHtml(editionVal) {
    const isDeluxe = editionVal === 'Deluxe';
    const color = isDeluxe ? '#facc15' : '#71717a';
    const label = editionVal || 'Standard';

    const dynamicAsset = globalVisualAssets[`edit_${editionVal}`];
    const graphicMarkup = dynamicAsset
        ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAsset}'); mask-image: url('${dynamicAsset}');"></span>`
        : `<i class="fa-solid fa-star text-[10px]"></i>`;

    return `
        <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded border text-[10px] sm:text-[11px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
            ${graphicMarkup}
            <span class="hidden sm:inline">${label}</span>
        </div>
    `;
}

function drawNotificationBanner(activeNotif, meta = latestNotifMeta) {
    const banner = document.getElementById('home-notification-banner');
    const content = document.getElementById('notif-banner-content');
    
    if (!banner || !content) return;

    if (!activeNotif) {
        banner.classList.add('hidden');
        return;
    }

    banner.classList.remove('hidden');

    document.getElementById('btn-banner-delete-x')?.remove();

    if (isCreatorMode) {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'btn-banner-delete-x';
        deleteBtn.type = 'button';
        deleteBtn.className = 'absolute top-3 right-3 w-7 h-7 bg-red-950/80 border border-red-800/80 text-red-400 hover:bg-red-900 hover:text-white rounded-full flex items-center justify-center font-black text-xs transition shadow-lg z-30';
        deleteBtn.title = currentLanguage === 'en' ? 'Delete Notification' : 'Eliminar Notificación';
        deleteBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
        
        deleteBtn.addEventListener('click', () => {
            stateForModules.requestUserDeleteConfirmation(() => {
                deleteNotificationManually(activeNotif.category);
            });
        });

        banner.appendChild(deleteBtn);
    }

    const isEn = currentLanguage === 'en';
    
    let notifTitle = '';
    if (activeNotif.type === 'new') {
        notifTitle = activeNotif.category === 'chart' 
            ? (isEn ? 'New Chart' : 'Nuevo Chart') 
            : (isEn ? 'New Skin' : 'Nueva Skin');
    } else {
        notifTitle = activeNotif.category === 'chart' 
            ? (isEn ? 'Chart Available' : 'Chart Disponible') 
            : (isEn ? 'Skin Available' : 'Skin Disponible');
    }

    let manualNavMarkup = '';
    if (isCreatorMode && meta.totalActive === 2) {
        manualNavMarkup = `
            <div class="flex items-center gap-2 mt-2 sm:mt-0 z-20">
                <button id="btn-notif-prev" type="button" class="w-7 h-7 bg-zinc-900 border border-fuchsia-800/60 text-fuchsia-400 hover:bg-fuchsia-950 rounded-lg flex items-center justify-center text-xs transition">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span class="text-[10px] font-black text-zinc-400 uppercase tracking-widest">${meta.currentIndex + 1} / 2</span>
                <button id="btn-notif-next" type="button" class="w-7 h-7 bg-zinc-900 border border-fuchsia-800/60 text-fuchsia-400 hover:bg-fuchsia-950 rounded-lg flex items-center justify-center text-xs transition">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    if (activeNotif.category === 'chart') {
        content.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 w-full pr-6 sm:pr-8">
                <!-- Información principal de la canción -->
                <div class="flex items-start sm:items-center justify-between w-full sm:w-auto gap-3">
                    <div class="flex items-center gap-3.5 flex-1 min-w-0">
                        <img src="${activeNotif.artOrIcon}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-orange-500/40 shadow-lg shrink-0">
                        <div class="truncate">
                            <span class="text-xs font-black uppercase tracking-widest text-orange-400 block mb-0.5">${notifTitle}</span>
                            <h3 class="text-sm sm:text-base font-black text-white leading-tight tracking-wide truncate">${activeNotif.song}</h3>
                            <p class="text-xs sm:text-sm text-zinc-400 font-bold truncate">${activeNotif.artist}</p>
                        </div>
                    </div>
                </div>

                <!-- Etiquetas organizadas en 3 filas alineadas a la derecha -->
                <div class="flex flex-col items-end gap-1.5 w-full sm:w-auto shrink-0">
                    <!-- Fila 1: Géneros -->
                    <div class="flex items-center justify-end gap-1.5 flex-wrap w-full">
                        ${renderNotifGenresBadgesHtml(activeNotif.genre)}
                    </div>
                    <!-- Fila 2: Dificultad -->
                    <div class="flex items-center justify-end gap-1.5 w-full">
                        ${renderNotifDiffTagHtml(activeNotif.diff)}
                    </div>
                    <!-- Fila 3: Ediciones -->
                    <div class="flex items-center justify-end gap-1.5 w-full">
                        ${renderNotifEditionTagHtml(activeNotif.edition)}
                    </div>

                    ${manualNavMarkup}
                </div>
            </div>
        `;
    } else if (activeNotif.category === 'skin') {
        const platformLogo = activeNotif.platform === 'TapWave' ? 'TapWaveWhiteLogo.png' : 'BeatstarWhiteLogo.png';
        content.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 w-full pr-6 sm:pr-8">
                <div class="flex items-start sm:items-center justify-between w-full sm:w-auto gap-3">
                    <div class="flex items-center gap-3.5 flex-1 min-w-0">
                        <img src="${activeNotif.artOrIcon}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-fuchsia-500/40 shadow-lg shrink-0">
                        <div class="truncate">
                            <span class="text-xs font-black uppercase tracking-widest text-fuchsia-400 block mb-0.5">${notifTitle}</span>
                            <h3 class="text-sm sm:text-base font-black text-white leading-tight tracking-wide truncate">${activeNotif.skinName}</h3>
                            <p class="text-xs sm:text-sm text-zinc-400 font-bold truncate">${activeNotif.artist}</p>
                        </div>
                    </div>

                    <div class="flex sm:hidden items-center justify-end shrink-0 pt-1">
                        <img src="${platformLogo}" alt="${activeNotif.platform}" class="h-5 object-contain">
                    </div>
                </div>

                <div class="hidden sm:flex flex-col items-end gap-2 w-auto">
                    <div class="flex items-center justify-end gap-2">
                        <img src="${platformLogo}" alt="${activeNotif.platform}" class="h-7 object-contain">
                    </div>
                    ${manualNavMarkup}
                </div>

                <div class="flex sm:hidden justify-end w-full">
                    ${manualNavMarkup}
                </div>
            </div>
        `;
    }

    document.getElementById('btn-notif-prev')?.addEventListener('click', () => previousNotification());
    document.getElementById('btn-notif-next')?.addEventListener('click', () => nextNotification());
}

// =========================================================
// 3. INICIALIZACIÓN DE NOTIFICACIONES Y EVENTOS MANUALES
// =========================================================
subscribeToNotifications((activeNotif, meta) => {
    latestActiveNotification = activeNotif;
    latestNotifMeta = meta;
    drawNotificationBanner(activeNotif, meta);
}, isCreatorMode);

document.getElementById('btn-delete-notif-chart')?.addEventListener('click', () => {
    stateForModules.requestUserDeleteConfirmation(() => deleteNotificationManually('chart'));
});
document.getElementById('btn-delete-notif-skin')?.addEventListener('click', () => {
    stateForModules.requestUserDeleteConfirmation(() => deleteNotificationManually('skin'));
});

// =========================================================
// 4. FUNCIONES UTILITARIAS Y DE NAVEGACIÓN
// =========================================================
function sanitizeFirebaseKey(key) {
    return btoa(key).replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-');
}

function desanitizeFirebaseKey(safeKey) {
    try {
        let base64 = safeKey.replace(/_/g, '/').replace(/-/g, '+');
        while (base64.length % 4) base64 += '=';
        return atob(base64);
    } catch (e) {
        return safeKey;
    }
}

function showLoadingOverlay() {
    const overlay = document.getElementById('global-loading-overlay');
    const text = document.getElementById('loading-overlay-text');
    if (text && translations[currentLanguage]) text.innerText = translations[currentLanguage].savingChanges || "Por favor espera un momento...";
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function closeAllActiveModalsAndMenus() {
    let wasModalOpen = false;
    const modalIds = [
        'beatstar-edition-modal', 'explicit-warning-modal', 'confirm-delete-modal',
        'boogie-auth-modal', 'boogie-exit-modal', 'download-custom-modal', 'thanks-custom-modal'
    ];

    modalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
            wasModalOpen = true;
        }
    });

    const dropdownIds = [
        'dropdown-custom-lvl-genre', 'dropdown-custom-lvl-diff',
        'dropdown-custom-lvl-edition', 'dropdown-custom-skin-genre'
    ];

    dropdownIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
            wasModalOpen = true;
        }
    });

    const activeAudio = getActiveAudioElement();
    if (!activeAudio || activeAudio.paused) {
        document.querySelectorAll('.target-art-outer-container').forEach(box => box.classList.remove('art-circle-shape'));
    }

    const thanksVideo = document.getElementById('download-thanks-video');
    if (thanksVideo) {
        thanksVideo.pause();
        thanksVideo.src = "";
    }

    return wasModalOpen;
}

function stopAllMedia() {
    stopGlobalAudioPreview();

    document.querySelectorAll('video').forEach(video => {
        video.pause();
        video.currentTime = 0;
    });

    document.querySelectorAll('.custom-native-video-wrapper').forEach(wrapper => {
        const iconEl = wrapper.querySelector('.video-play-icon');
        const controlsOverlay = wrapper.querySelector('.video-controls-overlay');
        const loaderEl = wrapper.querySelector('.video-loading-overlay');

        if (iconEl) iconEl.className = 'fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon';
        if (controlsOverlay) controlsOverlay.classList.remove('opacity-0', 'hidden');
        if (loaderEl) loaderEl.classList.add('hidden');
    });

    activeVideoElement = null;
}

function navigateTo(view, pushState = true) {
    stopAllMedia();
    closeAllActiveModalsAndMenus();
    currentViewName = view;
    ['home', 'levels', 'cosmetics'].forEach(v => document.getElementById(`view-${v}`)?.classList.add('hidden'));
    document.getElementById(`view-${view}`)?.classList.remove('hidden');

    const shortcuts = document.getElementById('nav-shortcuts');
    const sep = document.getElementById('nav-[#nav-separator]');
    const footerBoogieBox = document.getElementById('footer-boogie-admin-box');

    if (view === 'home') {
        shortcuts?.classList.add('hidden');
        sep?.classList.add('hidden');
        footerBoogieBox?.classList.remove('hidden');
    } else {
        shortcuts?.classList.remove('hidden');
        shortcuts?.classList.add('flex');
        sep?.classList.remove('hidden');
        footerBoogieBox?.classList.add('hidden');
    }

    if (view === 'cosmetics') resetCosmeticsSubmenuWorkspace();
    if (pushState) history.pushState({ view: view }, '', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetCosmeticsSubmenuWorkspace() {
    stopAllMedia();
    document.getElementById('cosmetics-submenu').classList.remove('hidden');
    document.getElementById('cosmetics-submenu').classList.add('flex');
    document.getElementById('cosmetics-active-workspace').classList.remove('flex');
    document.getElementById('cosmetics-active-workspace').classList.add('hidden');
}

function openCosmeticsSubmenuPlatform(platform) {
    stopAllMedia();
    currentSelectedSkinSubPlatform = platform;
    document.getElementById('cosmetics-submenu').classList.remove('flex');
    document.getElementById('cosmetics-submenu').classList.add('hidden');
    document.getElementById('cosmetics-active-workspace').classList.remove('hidden');
    document.getElementById('cosmetics-active-workspace').classList.add('flex');

    document.getElementById('container-workspace-beatstar').classList.toggle('hidden', platform !== 'Beatstar');
    document.getElementById('container-workspace-beatstar').classList.toggle('flex', platform === 'Beatstar');
    document.getElementById('container-workspace-tapwave').classList.toggle('hidden', platform !== 'TapWave');
    document.getElementById('container-workspace-tapwave').classList.toggle('flex', platform === 'TapWave');

    applyRoleUIVisibility();
}

function formatStringToDMY(rawDate) {
    if (!rawDate || rawDate.trim() === "") return translations[currentLanguage].textComingSoon;
    if (rawDate.includes('/')) return rawDate;
    const parts = rawDate.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return rawDate;
}

function renderVideoPlayerMarkup(videoUrl, isSkin = false) {
    if (!videoUrl || videoUrl.trim() === "") return '[No Preview]';
    const containerClass = isSkin
        ? "w-36 h-60 sm:w-36 sm:h-64 mx-auto border border-fuchsia-950/40 rounded-xl bg-black overflow-hidden shadow-2xl shrink-0 relative cursor-pointer group"
        : "w-full aspect-video max-w-[280px] sm:max-w-[280px] mx-auto border border-fuchsia-950/40 rounded-xl bg-black overflow-hidden shadow-2xl shrink-0 relative cursor-pointer group";

    return `
        <div class="${containerClass} custom-native-video-wrapper">
            <video class="w-full h-full object-cover pointer-events-none" playsinline preload="metadata" disablePictureInPicture>
                <source src="${videoUrl}" type="video/mp4">
            </video>
            <div class="video-loading-overlay hidden absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 z-10">
                <i class="fa-solid fa-circle-notch animate-spin text-fuchsia-400 text-2xl"></i>
            </div>
            <div class="video-controls-overlay absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity z-20">
                <i class="fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon"></i>
            </div>
        </div>
    `;
}

function setupNativeVideoBehavior(vidWrapper) {
    if (!vidWrapper) return;
    const videoEl = vidWrapper.querySelector('video');
    const iconEl = vidWrapper.querySelector('.video-play-icon');
    const loaderEl = vidWrapper.querySelector('.video-loading-overlay');
    const controlsOverlay = vidWrapper.querySelector('.video-controls-overlay');

    if (!videoEl) return;

    videoEl.addEventListener('waiting', () => loaderEl?.classList.remove('hidden'));
    videoEl.addEventListener('canplaythrough', () => loaderEl?.classList.add('hidden'));
    videoEl.addEventListener('playing', () => {
        loaderEl?.classList.add('hidden');
        controlsOverlay?.classList.add('hidden');
    });
    videoEl.addEventListener('pause', () => {
        if (iconEl) iconEl.className = 'fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon';
        controlsOverlay?.classList.remove('hidden');
    });
    videoEl.addEventListener('ended', () => {
        videoEl.currentTime = 0;
        if (iconEl) iconEl.className = 'fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon';
        controlsOverlay?.classList.remove('hidden');
    });

    vidWrapper.addEventListener('click', () => {
        if (videoEl.paused) {
            if (activeVideoElement && activeVideoElement !== videoEl) stopAllMedia();
            else stopGlobalAudioPreview();

            activeVideoElement = videoEl;
            if (loaderEl && videoEl.readyState < 4) loaderEl.classList.remove('hidden');
            videoEl.play().then(() => controlsOverlay?.classList.add('hidden')).catch(err => loaderEl?.classList.add('hidden'));
        } else {
            videoEl.pause();
            if (iconEl) iconEl.className = 'fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon';
            controlsOverlay?.classList.remove('hidden');
        }
    });
}

function triggerDownloadAlert(url) {
    currentActiveDownloadUrl = url;
    document.getElementById('download-modal-msg').innerText = translations[currentLanguage].beatcloneNotice;
    const thanksVideo = document.getElementById('download-thanks-video');
    if (thanksVideo) {
        thanksVideo.pause();
        thanksVideo.src = "";
    }
    document.getElementById('thanks-custom-modal')?.classList.add('hidden');
    document.getElementById('download-custom-modal')?.classList.remove('hidden');
}

function openBeatstarEditionSelectionModal(lvl) {
    activeModalBeatstarChart = lvl;

    const modal = document.getElementById('beatstar-edition-modal');
    if (!modal) return;

    const imgEl = document.getElementById('modal-edition-art-img');
    const titleEl = document.getElementById('modal-edition-song-title');
    const artistEl = document.getElementById('modal-edition-artist-title');
    const badgeStd = document.getElementById('modal-edition-standard-badge');
    const badgeDlx = document.getElementById('modal-edition-deluxe-badge');
    const checkStd = document.getElementById('modal-check-standard');
    const checkDlx = document.getElementById('modal-check-deluxe');

    if (imgEl) imgEl.src = lvl.art || 'free_song_Image.png';
    if (titleEl) titleEl.innerText = lvl.song || '';
    if (artistEl) artistEl.innerText = lvl.artist || '';

    const stdDiffContainer = document.getElementById('modal-opt-standard-diff-tag');
    const dlxDiffContainer = document.getElementById('modal-opt-deluxe-diff-tag');

    if (stdDiffContainer) {
        const stdDiffVal = lvl.diff || 'Normal';
        stdDiffContainer.innerHTML = chartsModule.renderDifficultyTagMarkup(stdDiffVal);
    }

    if (dlxDiffContainer) {
        const dlxDiffVal = lvl.diffDeluxe || 'Extreme';
        dlxDiffContainer.innerHTML = chartsModule.renderDifficultyTagMarkup(dlxDiffVal);
    }

    const currentSelected = activeChartSelectedEditions[lvl.id] || 'Standard';

    if (currentSelected === 'Deluxe') {
        badgeDlx?.classList.remove('hidden');
        badgeStd?.classList.add('hidden');
        checkDlx?.classList.remove('opacity-0');
        checkStd?.classList.add('opacity-0');
    } else {
        badgeStd?.classList.remove('hidden');
        badgeDlx?.classList.add('hidden');
        checkStd?.classList.remove('opacity-0');
        checkDlx?.classList.add('opacity-0');
    }

    modal.classList.remove('hidden');
}

function buildVisualAssetsGenresList() {
    const container = document.getElementById('asset-upload-genres-list');
    if (!container) return;

    container.innerHTML = '';
    genreList.forEach(g => {
        const safeKey = g.label.replace('/', '');
        const currentAsset = globalVisualAssets[`genre_${safeKey}`] || '';

        const item = document.createElement('div');
        item.className = 'bg-[#05020a] p-2 rounded border border-fuchsia-950/60 flex flex-col gap-1';
        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${g.color}"></span>
                    <span class="font-bold text-zinc-300 text-xs">${g.label}</span>
                </div>
                <button type="button" class="btn-clear-visual-asset text-red-400 hover:text-red-300 font-bold text-[10px]" data-asset-key="genre_${safeKey}">Eliminar</button>
            </div>
            <input type="file" data-asset-key="genre_${safeKey}" accept="image/*" class="visual-asset-file-uploader w-full bg-[#11091c] border border-fuchsia-950 p-1 rounded text-zinc-400 text-[11px]">
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.visual-asset-file-uploader').forEach(input => {
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            const assetKey = e.target.getAttribute('data-asset-key');
            if (file && assetKey) {
                showLoadingOverlay();
                try {
                    const uploadedUrl = await uploadFileToCloudflareR2(file, 'visual_assets');
                    if (uploadedUrl) {
                        await set(ref(db, `visual_assets/${assetKey}`), uploadedUrl);
                    }
                } catch (err) {
                    console.error("Error al subir asset:", err);
                } finally {
                    hideLoadingOverlay();
                }
            }
        });
    });

    container.querySelectorAll('.btn-clear-visual-asset').forEach(btn => {
        btn.addEventListener('click', async () => {
            const assetKey = btn.getAttribute('data-asset-key');
            if (assetKey && globalVisualAssets[assetKey]) {
                showLoadingOverlay();
                try {
                    await deleteFileFromCloudflareR2(globalVisualAssets[assetKey]);
                    await remove(ref(db, `visual_assets/${assetKey}`));
                } catch (err) {
                    console.error("Error al eliminar asset:", err);
                } finally {
                    hideLoadingOverlay();
                }
            }
        });
    });
}

function resetBoogieAuthModal() {
    document.getElementById('boogie-auth-modal')?.classList.add('hidden');
    const errorMsgEl = document.getElementById('boogie-auth-error-msg');
    if (errorMsgEl) {
        errorMsgEl.style.display = 'none';
        errorMsgEl.innerText = '';
    }
    ['boogieCred1', 'boogieCred2', 'boogieCred3'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

// =========================================================
// 5. INICIALIZACIÓN DE MÓDULOS DE VISTA
// =========================================================
const stateForModules = {
    genreList,
    skinUniversalGenreList,
    getLevels: () => levels,
    getCosmetics: () => cosmetics,
    getCurrentLanguage: () => currentLanguage,
    getIsCreatorMode: () => isCreatorMode,
    getGlobalVisualAssets: () => globalVisualAssets,
    getActiveChartSelectedEditions: () => activeChartSelectedEditions,
    getActiveChartExplicitStates: () => activeChartExplicitStates,
    getCurrentSelectedSkinSubPlatform: () => currentSelectedSkinSubPlatform,
    getBrandCustomNamesMap: () => brandCustomNamesMap,
    getActiveAudioElement,
    getAudioAnalyser,
    startRadialCanvasVisualizer,
    showLoadingOverlay,
    hideLoadingOverlay,
    stopAllMedia,
    triggerDownloadAlert,
    openBeatstarEditionSelectionModal,
    formatStringToDMY,
    renderVideoPlayerMarkup,
    setupNativeVideoBehavior,
    requestUserDeleteConfirmation: (cb) => {
        pendingDeleteActionCallback = cb;
        document.getElementById('confirm-delete-modal')?.classList.remove('hidden');
    }
};

const chartsModule = initChartsModule(stateForModules);
const skinsModule = initSkinsModule(stateForModules);

function applyRoleUIVisibility() {
    ['level-form-container', 'cosmetic-form-container', 'footer-links-management-box', 'visual-assets-panel-box', 'thanks-videos-panel-box'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', !isCreatorMode);
    });
    document.querySelectorAll('.creator-action-header').forEach(el => el.classList.toggle('hidden', !isCreatorMode));

    const lvlGrid = document.getElementById('levels-layout-grid');
    const cosGrid = document.getElementById('cosmetics-active-workspace');

    if (isCreatorMode) {
        lvlGrid?.classList.replace('flex-col', 'xl:flex-row');
        cosGrid?.classList.replace('flex-col', 'xl:flex-row');
    } else {
        lvlGrid?.classList.replace('xl:flex-row', 'flex-col');
        lvlGrid?.classList.add('flex-col');
        cosGrid?.classList.replace('xl:flex-row', 'flex-col');
        cosGrid?.classList.add('flex-col');
    }

    setCreatorModeInNotifications(isCreatorMode);
    if (latestActiveNotification) {
        drawNotificationBanner(latestActiveNotification);
    }

    chartsModule.renderLevelsTable();
    skinsModule.renderCosmeticsTables();
}

function updateCMSHeaderIcons() {
    const iconStdBox = document.getElementById('cms-icon-standard');
    const iconDlxBox = document.getElementById('cms-icon-deluxe');
    const stdAsset = globalVisualAssets[`edit_Standard`];
    const dlxAsset = globalVisualAssets[`edit_Deluxe`];

    if (iconStdBox) {
        iconStdBox.innerHTML = stdAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 align-middle" style="color: #71717a; -webkit-mask-image: url('${stdAsset}'); mask-image: url('${stdAsset}');"></span>`
            : `<i class="fa-solid fa-layer-group text-zinc-400"></i>`;
    }
    if (iconDlxBox) {
        iconDlxBox.innerHTML = dlxAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 align-middle" style="color: #facc15; -webkit-mask-image: url('${dlxAsset}'); mask-image: url('${dlxAsset}');"></span>`
            : `<i class="fa-solid fa-star text-yellow-400"></i>`;
    }
}

function updateDashboardCounts() {
    if (document.getElementById('home-levels-count')) document.getElementById('home-levels-count').innerText = levels.length;
    if (document.getElementById('home-cosmetics-count')) document.getElementById('home-cosmetics-count').innerText = cosmetics.length;
}

function syncFooterLinks() {
    const aB = document.getElementById('footer-link-beatclone'); if (aB) aB.href = globalFooterLinks.beatclone || '#';
    const aS = document.getElementById('footer-link-bscm'); if (aS) aS.href = globalFooterLinks.bscm || '#';
    const aC = document.getElementById('footer-link-beatcharts'); if (aC) aC.href = globalFooterLinks.beatcharts || '#';

    const tapNoticeBox = document.getElementById('tapwave-discord-notice-box');
    const tapJoinBtn = document.getElementById('btn-join-tapwave-discord');
    if (tapNoticeBox && tapJoinBtn) {
        if (globalFooterLinks.tapwave && globalFooterLinks.tapwave.trim() !== "") {
            tapJoinBtn.href = globalFooterLinks.tapwave.trim();
            tapNoticeBox.classList.remove('hidden');
            tapNoticeBox.classList.add('flex');
        } else {
            tapNoticeBox.classList.add('hidden');
            tapNoticeBox.classList.remove('flex');
        }
    }
}

function updateCustomDropdownButtonUI(btnId, labelId, val, categoryType) {
    const btn = document.getElementById(btnId);
    const label = document.getElementById(labelId);
    if (!btn || !label) return;

    if (!val) {
        label.innerHTML = `<span>${translations[currentLanguage].filterAll}</span>`;
        btn.style.backgroundColor = '#05020a';
        btn.style.borderColor = '#4c1d95';
        btn.style.color = '#d4d4d8';
        return;
    }

    if (categoryType === 'genre') {
        const matched = genreList.find(g => g.label.toLowerCase() === val.toLowerCase());
        const color = matched ? matched.color : '#f97316';
        const safeKey = val.replace('/', '');
        const imgAsset = globalVisualAssets[`genre_${safeKey}`];
        const graphicEl = imgAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${imgAsset}'); mask-image: url('${imgAsset}');"></span>`
            : `<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color:${color}"></span>`;

        label.innerHTML = `${graphicEl} <span class="truncate">${val}</span>`;
        btn.style.backgroundColor = `${color}20`;
        btn.style.borderColor = color;
        btn.style.color = color;
    } else if (categoryType === 'diff') {
        let color = '#71717a';
        let displayLabel = translations[currentLanguage].diffNormal;
        if (val === 'Hard') { color = '#f97316'; displayLabel = translations[currentLanguage].diffHard; }
        if (val === 'Extreme') { color = '#ef4444'; displayLabel = translations[currentLanguage].diffExtreme; }

        const imgAsset = globalVisualAssets[`diff_${val}`];
        const graphicEl = imgAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${color}'); mask-image: url('${imgAsset}');"></span>`
            : `<i class="fa-solid fa-layer-group text-[10px]"></i>`;

        label.innerHTML = `${graphicEl} <span class="truncate">${displayLabel}</span>`;
        btn.style.backgroundColor = `${color}20`;
        btn.style.borderColor = color;
        btn.style.color = color;
    } else if (categoryType === 'edition') {
        let color = (val === 'Deluxe') ? '#facc15' : '#71717a';
        const imgAsset = globalVisualAssets[`edit_${val}`];
        const graphicEl = imgAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${imgAsset}'); mask-image: url('${imgAsset}');"></span>`
            : `<i class="fa-solid fa-star text-[10px]"></i>`;

        label.innerHTML = `${graphicEl} <span class="truncate">${val}</span>`;
        btn.style.backgroundColor = `${color}20`;
        btn.style.borderColor = color;
        btn.style.color = color;
    }
}

function buildCustomDropdownMenus() {
    const allTxt = translations[currentLanguage].filterAll;
    
    const dLvlGenre = document.getElementById('dropdown-custom-lvl-genre');
    if (dLvlGenre) {
        dLvlGenre.innerHTML = `<div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-300 font-extrabold flex items-center gap-2" data-type="lvlGenre" data-value=""><span>${allTxt}</span></div>`;
        genreList.forEach(g => {
            const safeKey = g.label.replace('/', '');
            const imgAsset = globalVisualAssets[`genre_${safeKey}`];
            const graphicEl = imgAsset
                ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${g.color}; -webkit-mask-image: url('${imgAsset}'); mask-image: url('${imgAsset}');"></span>`
                : `<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color:${g.color}"></span>`;

            dLvlGenre.innerHTML += `<div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer font-extrabold flex items-center gap-2" style="color:${g.color}" data-type="lvlGenre" data-value="${g.label}">${graphicEl} <span>${g.label}</span></div>`;
        });
    }

    const getDynamicIconMarkup = (assetKey, color, fallbackIconClass) => {
        const imgAsset = globalVisualAssets[assetKey];
        return imgAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0 inline-block align-middle" style="color: ${color}; -webkit-mask-image: url('${imgAsset}'); mask-image: url('${imgAsset}');"></span>`
            : `<i class="${fallbackIconClass} text-[10px]"></i>`;
    };

    const dLvlDiff = document.getElementById('dropdown-custom-lvl-diff');
    if (dLvlDiff) {
        const iconNormal = getDynamicIconMarkup('diff_Normal', '#71717a', 'fa-solid fa-layer-group');
        const iconHard = getDynamicIconMarkup('diff_Hard', '#f97316', 'fa-solid fa-layer-group');
        const iconExtreme = getDynamicIconMarkup('diff_Extreme', '#ef4444', 'fa-solid fa-layer-group');

        dLvlDiff.innerHTML = `
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-300 font-extrabold flex items-center gap-2" data-type="lvlDiff" data-value=""><span>${allTxt}</span></div>
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-400 font-extrabold flex items-center gap-2" data-type="lvlDiff" data-value="Normal">${iconNormal} <span>Normal</span></div>
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-orange-400 font-extrabold flex items-center gap-2" data-type="lvlDiff" data-value="Hard">${iconHard} <span>Hard</span></div>
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-red-500 font-extrabold flex items-center gap-2" data-type="lvlDiff" data-value="Extreme">${iconExtreme} <span>Extreme</span></div>
        `;
    }

    const dLvlEdition = document.getElementById('dropdown-custom-lvl-edition');
    if (dLvlEdition) {
        const iconStandard = getDynamicIconMarkup('edit_Standard', '#71717a', 'fa-solid fa-star');
        const iconDeluxe = getDynamicIconMarkup('edit_Deluxe', '#facc15', 'fa-solid fa-star');

        dLvlEdition.innerHTML = `
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-300 font-extrabold flex items-center gap-2" data-type="lvlEdition" data-value=""><span>${allTxt}</span></div>
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-400 font-extrabold flex items-center gap-2" data-type="lvlEdition" data-value="Standard">${iconStandard} <span>Standard</span></div>
            <div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-yellow-400 font-extrabold flex items-center gap-2" data-type="lvlEdition" data-value="Deluxe">${iconDeluxe} <span>Deluxe</span></div>
        `;
    }

    const dSkinGenre = document.getElementById('dropdown-custom-skin-genre');
    if (dSkinGenre) {
        dSkinGenre.innerHTML = `<div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer text-zinc-300 font-extrabold flex items-center gap-2" data-type="skinGenre" data-value=""><span>${allTxt}</span></div>`;
        skinUniversalGenreList.forEach(g => {
            const safeKey = g.label.replace('/', '');
            const imgAsset = globalVisualAssets[`genre_${safeKey}`];
            const graphicEl = imgAsset
                ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${g.color}; -webkit-mask-image: url('${imgAsset}'); mask-image: url('${imgAsset}');"></span>`
                : `<span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color:${g.color}"></span>`;

            dSkinGenre.innerHTML += `<div class="custom-opt-item p-2 hover:bg-fuchsia-950/40 cursor-pointer font-extrabold flex items-center gap-2" style="color:${g.color}" data-type="skinGenre" data-value="${g.label}">${graphicEl} <span>${g.label}</span></div>`;
        });
    }

    document.querySelectorAll('.custom-opt-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.getAttribute('data-type');
            const val = item.getAttribute('data-value');

            if (type === 'lvlGenre') {
                chartsModule.setLvlGenreFilter(val);
                updateCustomDropdownButtonUI('btn-custom-lvl-genre', 'label-custom-lvl-genre', val, 'genre');
                document.getElementById('dropdown-custom-lvl-genre')?.classList.add('hidden');
                chartsModule.renderLevelsTable();
            } else if (type === 'lvlDiff') {
                chartsModule.setLvlDiffFilter(val);
                updateCustomDropdownButtonUI('btn-custom-lvl-diff', 'label-custom-lvl-diff', val, 'diff');
                document.getElementById('dropdown-custom-lvl-diff')?.classList.add('hidden');
                chartsModule.renderLevelsTable();
            } else if (type === 'lvlEdition') {
                chartsModule.setLvlEditionFilter(val);
                updateCustomDropdownButtonUI('btn-custom-lvl-edition', 'label-custom-lvl-edition', val, 'edition');
                document.getElementById('dropdown-custom-lvl-edition')?.classList.add('hidden');
                chartsModule.renderLevelsTable();
            } else if (type === 'skinGenre') {
                skinsModule.setSkinGenreFilter(val);
                updateCustomDropdownButtonUI('btn-custom-skin-genre', 'label-custom-skin-genre', val, 'genre');
                document.getElementById('dropdown-custom-skin-genre')?.classList.add('hidden');
                skinsModule.renderCosmeticsTables();
            }
        });
    });
}

function applyLanguagePack() {
    document.getElementById('lang-label').innerText = currentLanguage.toUpperCase();
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLanguage][key]) el.innerText = translations[currentLanguage][key];
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        if (translations[currentLanguage][key]) el.placeholder = translations[currentLanguage][key];
    });

    applyRoleUIVisibility();
    buildCustomDropdownMenus();
}

// =========================================================
// 6. SUSCRIPCIONES A BASE DE DATOS FIREBASE
// =========================================================
try {
    showLoadingOverlay();

    onValue(ref(db, 'levels'), (snap) => {
        levels = snap.val() ? Object.values(snap.val()) : [];
        chartsModule.renderLevelsTable();
        updateDashboardCounts();
        hideLoadingOverlay();
    });
    onValue(ref(db, 'cosmetics'), (snap) => {
        cosmetics = snap.val() ? Object.values(snap.val()) : [];
        skinsModule.renderCosmeticsTables();
        updateDashboardCounts();
        skinsModule.populateExistingBrandsDropdown();
        hideLoadingOverlay();
    });
    onValue(ref(db, 'brand_custom_names'), (snap) => {
        const rawData = snap.val() || {};
        brandCustomNamesMap = {};
        Object.keys(rawData).forEach(safeKey => {
            const originalUrl = desanitizeFirebaseKey(safeKey);
            brandCustomNamesMap[originalUrl] = rawData[safeKey];
        });
        skinsModule.populateExistingBrandsDropdown();
        skinsModule.renderCosmeticsTables();
    });
    onValue(ref(db, 'visual_assets'), (snap) => {
        globalVisualAssets = snap.val() || {};
        buildCustomDropdownMenus();
        buildVisualAssetsGenresList();
        updateCMSHeaderIcons();
        chartsModule.renderLevelsTable();
        
        if (latestActiveNotification) {
            drawNotificationBanner(latestActiveNotification);
        }
    });
    onValue(ref(db, 'thanks_videos'), (snap) => {
        globalThanksVideos = snap.val() ? Object.values(snap.val()) : [];
    });
    onValue(ref(db, 'footer_links'), (snap) => {
        if (snap.val()) {
            globalFooterLinks = snap.val();
            syncFooterLinks();
        }
    });
    onValue(ref(db, 'last_update_date'), (snap) => {
        if (snap.val()) document.getElementById('dynamic-update-date').innerText = formatStringToDMY(snap.val());
    });
} catch (e) {
    console.error(e);
    hideLoadingOverlay();
}

// =========================================================
// 7. LISTENERS DE EVENTOS DOM
// =========================================================
document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('nav-logo')?.addEventListener('click', () => navigateTo('home'));
    document.getElementById('btn-nav-levels')?.addEventListener('click', () => navigateTo('levels'));
    document.getElementById('btn-nav-cosmetics')?.addEventListener('click', () => navigateTo('cosmetics'));
    document.getElementById('card-to-levels')?.addEventListener('click', () => navigateTo('levels'));
    document.getElementById('card-to-cosmetics')?.addEventListener('click', () => navigateTo('cosmetics'));

    document.querySelectorAll('.btn-back-to-home').forEach(btn => {
        btn.addEventListener('click', () => navigateTo('home'));
    });

    document.getElementById('submenu-card-beatstar')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('Beatstar'));
    document.getElementById('submenu-card-tapwave')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('TapWave'));
    document.getElementById('btn-toggle-to-tapwave')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('TapWave'));
    document.getElementById('btn-toggle-to-beatstar')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('Beatstar'));

    document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
        stopAllMedia();
        currentLanguage = currentLanguage === 'es' ? 'en' : 'es';
        localStorage.setItem('nexus_lang', currentLanguage);
        applyLanguagePack();
    });

    const btnBoogieTrigger = document.getElementById('btn-boogie-admin-trigger');
    btnBoogieTrigger?.addEventListener('click', () => {
        if (isCreatorMode) document.getElementById('boogie-exit-modal')?.classList.remove('hidden');
        else {
            resetBoogieAuthModal();
            document.getElementById('boogie-auth-modal')?.classList.remove('hidden');
        }
    });

    document.getElementById('btn-confirm-exit-creator')?.addEventListener('click', () => {
        isCreatorMode = false;
        btnBoogieTrigger?.classList.remove('glow-green');
        document.getElementById('boogie-exit-modal')?.classList.add('hidden');
        applyRoleUIVisibility();
    });

    document.getElementById('boogie-auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputVal = document.getElementById('boogieCred1').value;
    const errorMsgEl = document.getElementById('boogie-auth-error-msg');

    if (inputVal === "BeatstarTest") {
        isCreatorMode = true;
        btnBoogieTrigger?.classList.add('glow-green');
        applyRoleUIVisibility();
        resetBoogieAuthModal();
    } else {
        if (errorMsgEl) {
            errorMsgEl.innerText = translations[currentLanguage].invalidCredentials || "Credenciales incorrectas";
            errorMsgEl.style.display = 'block';
        }
    }
});

    document.getElementById('download-modal-btn-close')?.addEventListener('click', () => {
        stopAllMedia();
        document.getElementById('download-custom-modal')?.classList.add('hidden');
    });
    
    document.getElementById('thanks-modal-btn-close')?.addEventListener('click', () => {
        stopAllMedia();
        document.getElementById('thanks-custom-modal')?.classList.add('hidden');
    });
    
    document.getElementById('btn-close-boogie-modal')?.addEventListener('click', resetBoogieAuthModal);
    document.getElementById('btn-close-boogie-modal-x')?.addEventListener('click', resetBoogieAuthModal);
    document.getElementById('btn-cancel-exit-creator')?.addEventListener('click', () => document.getElementById('boogie-exit-modal')?.classList.add('hidden'));
    document.getElementById('btn-cancel-delete')?.addEventListener('click', () => document.getElementById('confirm-delete-modal')?.classList.add('hidden'));
    document.getElementById('btn-cancel-explicit')?.addEventListener('click', () => document.getElementById('explicit-warning-modal')?.classList.add('hidden'));
    
    document.getElementById('btn-close-beatstar-modal')?.addEventListener('click', () => {
        const activeAudio = getActiveAudioElement();
        if (activeAudio) activeAudio.loop = false;
        
        document.getElementById('beatstar-edition-modal')?.classList.add('hidden');
        chartsModule.renderLevelsTable();
    });

    document.getElementById('btn-confirm-explicit')?.addEventListener('click', () => {
        stopAllMedia();
        const pendingId = chartsModule.getPendingExplicitActivationChartId();
        if (pendingId) {
            activeChartExplicitStates[pendingId] = true;
            chartsModule.setPendingExplicitActivationChartId(null);
            chartsModule.renderLevelsTable();
        }
        document.getElementById('explicit-warning-modal')?.classList.add('hidden');
    });

    document.getElementById('download-modal-btn-confirm')?.addEventListener('click', () => {
        if (currentActiveDownloadUrl) {
            window.open(currentActiveDownloadUrl, '_blank');
        }
        document.getElementById('download-custom-modal')?.classList.add('hidden');

        if (globalThanksVideos && globalThanksVideos.length > 0) {
            const randomVid = globalThanksVideos[Math.floor(Math.random() * globalThanksVideos.length)];
            const thanksVid = document.getElementById('download-thanks-video');
            if (thanksVid && randomVid) {
                thanksVid.src = randomVid;
                thanksVid.play().catch(() => {});
                document.getElementById('thanks-custom-modal')?.classList.remove('hidden');
            }
        }
    });

    document.getElementById('modal-opt-standard')?.addEventListener('click', () => {
        if (activeModalBeatstarChart) {
            activeChartSelectedEditions[activeModalBeatstarChart.id] = 'Standard';
            
            const activeAudio = getActiveAudioElement();
            if (activeAudio) activeAudio.loop = false;
            
            document.getElementById('beatstar-edition-modal')?.classList.add('hidden');
            chartsModule.renderLevelsTable();
        }
    });

    document.getElementById('modal-opt-deluxe')?.addEventListener('click', () => {
        if (activeModalBeatstarChart) {
            activeChartSelectedEditions[activeModalBeatstarChart.id] = 'Deluxe';
            
            const activeAudio = getActiveAudioElement();
            if (activeAudio) activeAudio.loop = false;
            
            document.getElementById('beatstar-edition-modal')?.classList.add('hidden');
            chartsModule.renderLevelsTable();
        }
    });

    document.querySelectorAll('button[id^="btn-picker-"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const parentSection = btn.parentElement.parentElement;
            const dateInput = parentSection?.querySelector('input[type="date"]');
            
            if (dateInput) {
                if (typeof dateInput.showPicker === 'function') {
                    dateInput.showPicker();
                } else {
                    dateInput.focus();
                    dateInput.click();
                }
            }
        });
    });

    document.getElementById('btn-custom-lvl-genre')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-custom-lvl-genre')?.classList.toggle('hidden'); });
    document.getElementById('btn-custom-lvl-diff')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-custom-lvl-diff')?.classList.toggle('hidden'); });
    document.getElementById('btn-custom-lvl-edition')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-custom-lvl-edition')?.classList.toggle('hidden'); });
    document.getElementById('btn-custom-skin-genre')?.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-custom-skin-genre')?.classList.toggle('hidden'); });

    document.getElementById('btn-clear-lvl-filters')?.addEventListener('click', () => {
        chartsModule.setLvlGenreFilter("");
        chartsModule.setLvlDiffFilter("");
        chartsModule.setLvlEditionFilter("");
        updateCustomDropdownButtonUI('btn-custom-lvl-genre', 'label-custom-lvl-genre', "", 'genre');
        updateCustomDropdownButtonUI('btn-custom-lvl-diff', 'label-custom-lvl-diff', "", 'diff');
        updateCustomDropdownButtonUI('btn-custom-lvl-edition', 'label-custom-lvl-edition', "", 'edition');
        chartsModule.renderLevelsTable();
    });

    document.getElementById('btn-clear-skin-filters')?.addEventListener('click', () => {
        skinsModule.setSkinGenreFilter("");
        updateCustomDropdownButtonUI('btn-custom-skin-genre', 'label-custom-skin-genre', "", 'genre');
        skinsModule.renderCosmeticsTables();
    });

    document.addEventListener('click', () => {
        ['dropdown-custom-lvl-genre', 'dropdown-custom-lvl-diff', 'dropdown-custom-lvl-edition', 'dropdown-custom-skin-genre'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    });

    document.getElementById('btn-action-delete')?.addEventListener('click', () => {
        if (pendingDeleteActionCallback) pendingDeleteActionCallback();
        pendingDeleteActionCallback = null;
        document.getElementById('confirm-delete-modal')?.classList.add('hidden');
    });

    chartsModule.buildGenresSelector();
    skinsModule.buildSkinGenresSelector();
    buildVisualAssetsGenresList();
    applyLanguagePack();
});

window.toggleBoogiePassword = function(inputId, btnElement) {
    const input = document.getElementById(inputId);
    const icon = btnElement ? btnElement.querySelector('i') : null;

    if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        if (icon) {
            if (isPassword) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    }
};