import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { translations } from "./i18n.js";
import { db, uploadFileToCloudflareR2 } from "./services.js";
import { stopGlobalAudioPreview, toggleAudioPreviewEngine, getActiveAudioElement } from "./audio-player.js";
import { initChartsModule } from "./charts.js";
import { initSkinsModule } from "./skins.js";

// --- CONFIGURACIÓN DE GÉNEROS ---
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

// --- ESTADOS GLOBALES ---
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

// --- DICCIONARIO PARA NOMBRES DE MARCAS (FIREBASE KEY SANITIZATION) ---
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

// --- OVERLAY DE CARGA ---
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

// --- CONTROL DE MEDIOS Y MODALES ---
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

// --- NAVEGACIÓN DE VISTAS ---
function navigateTo(view, pushState = true) {
    stopAllMedia();
    closeAllActiveModalsAndMenus();
    currentViewName = view;
    ['home', 'levels', 'cosmetics'].forEach(v => document.getElementById(`view-${v}`)?.classList.add('hidden'));
    document.getElementById(`view-${view}`)?.classList.remove('hidden');

    const shortcuts = document.getElementById('nav-shortcuts');
    const sep = document.getElementById('nav-separator');
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
    thanksVideo.pause();
    thanksVideo.src = "";
    document.getElementById('thanks-custom-modal').classList.add('hidden');
    document.getElementById('download-custom-modal').classList.remove('hidden');
}

// --- INICIALIZACIÓN DE MÓDULOS HIJOS ---
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
    showLoadingOverlay,
    hideLoadingOverlay,
    stopAllMedia,
    triggerDownloadAlert,
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

// --- DROPDOWNS Y FILTROS ---
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

// --- CONEXIONES FIREBASE ---
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
        updateCMSHeaderIcons();
        chartsModule.renderLevelsTable();
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

// --- SUSCRIPCIÓN DE EVENTOS DOM ---
document.getElementById('submenu-card-beatstar')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('Beatstar'));
document.getElementById('submenu-card-tapwave')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('TapWave'));
document.getElementById('btn-toggle-to-tapwave')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('TapWave'));
document.getElementById('btn-toggle-to-beatstar')?.addEventListener('click', () => openCosmeticsSubmenuPlatform('TapWave'));

document.getElementById('nav-logo')?.addEventListener('click', () => navigateTo('home'));
document.getElementById('btn-nav-levels')?.addEventListener('click', () => navigateTo('levels'));
document.getElementById('btn-nav-cosmetics')?.addEventListener('click', () => navigateTo('cosmetics'));
document.getElementById('card-to-levels')?.addEventListener('click', () => navigateTo('levels'));
document.getElementById('card-to-cosmetics')?.addEventListener('click', () => navigateTo('cosmetics'));

document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
    stopAllMedia();
    currentLanguage = currentLanguage === 'es' ? 'en' : 'es';
    localStorage.setItem('nexus_lang', currentLanguage);
    applyLanguagePack();
});

const btnBoogieTrigger = document.getElementById('btn-boogie-admin-trigger');
btnBoogieTrigger?.addEventListener('click', () => {
    if (isCreatorMode) document.getElementById('boogie-exit-modal')?.classList.remove('hidden');
    else document.getElementById('boogie-auth-modal')?.classList.remove('hidden');
});

document.getElementById('btn-confirm-exit-creator')?.addEventListener('click', () => {
    isCreatorMode = false;
    btnBoogieTrigger?.classList.remove('glow-green');
    document.getElementById('boogie-exit-modal')?.classList.add('hidden');
    applyRoleUIVisibility();
});

document.getElementById('boogie-auth-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.getElementById('boogieCred1').value === "BeatstarTest") {
        isCreatorMode = true;
        btnBoogieTrigger?.classList.add('glow-green');
        applyRoleUIVisibility();
        document.getElementById('boogie-auth-modal')?.classList.add('hidden');
    }
});

document.getElementById('btn-action-delete')?.addEventListener('click', () => {
    if (pendingDeleteActionCallback) pendingDeleteActionCallback();
    pendingDeleteActionCallback = null;
    document.getElementById('confirm-delete-modal')?.classList.add('hidden');
});

// Inicialización básica
chartsModule.buildGenresSelector();
skinsModule.buildSkinGenresSelector();
applyLanguagePack();