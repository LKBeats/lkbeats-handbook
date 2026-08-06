import { ref, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";
import { toggleAudioPreviewEngine } from "./audio-player.js";

export function initChartsModule(state) {
    const {
        genreList,
        getLevels,
        getCurrentLanguage,
        getIsCreatorMode,
        getGlobalVisualAssets,
        getActiveChartSelectedEditions,
        getActiveChartExplicitStates,
        showLoadingOverlay,
        hideLoadingOverlay,
        stopAllMedia,
        triggerDownloadAlert,
        formatStringToDMY,
        renderVideoPlayerMarkup,
        setupNativeVideoBehavior,
        requestUserDeleteConfirmation
    } = state;

    let activeLvlGenreFilter = "";
    let activeLvlDiffFilter = "";
    let activeLvlEditionFilter = "";

    let levelArtToRemove = false;
    let levelAudioToRemove = false;
    let levelVideoToRemove = false;
    let levelZipToRemove = false;

    let levelVideoDeluxeToRemove = false;
    let levelZipDeluxeToRemove = false;

    let levelAudioExplicitToRemove = false;
    let levelVideoExplicitToRemove = false;
    let levelZipExplicitToRemove = false;
    let levelVideoDeluxeExplicitToRemove = false;
    let levelZipDeluxeExplicitToRemove = false;

    let pendingExplicitActivationChartId = null;

    // --- CONSTRUCCIÓN DEL SELECTOR DE GÉNEROS ---
    function buildGenresSelector() {
        const container = document.getElementById('genres-container');
        if (!container) return;
        container.innerHTML = '';

        genreList.forEach(g => {
            const item = document.createElement('label');
            item.className = "flex items-center gap-3 p-1.5 hover:bg-zinc-900 rounded cursor-pointer text-zinc-300";
            item.innerHTML = `
                <input type="checkbox" name="lvlGenres" value="${g.label}" class="genre-checkbox accent-fuchsia-500">
                <span class="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow" style="background-color: ${g.color}"></span>
                <span class="font-extrabold text-sm text-zinc-200">${g.label}</span>
            `;
            item.querySelector('input').addEventListener('change', (e) => {
                const checked = document.querySelectorAll('.genre-checkbox:checked');
                if (checked.length > 2) e.target.checked = false;
            });
            container.appendChild(item);
        });
    }

    // --- REINICIAR FORMULARIO DE CHARTS ---
    function resetLevelFormState() {
        const form = document.getElementById('level-form');
        if (form) form.reset();

        document.getElementById('editingLvlId').value = '';
        
        const submitBtn = document.getElementById('lvlSubmitBtn');
        const lang = getCurrentLanguage();
        if (submitBtn) {
            const textSpan = submitBtn.querySelector('span');
            if (textSpan) textSpan.innerText = translations[lang].btnRegister;
            else submitBtn.innerText = translations[lang].btnRegister;
        }

        const badgesToHide = [
            'current-chart-zip-badge', 'btn-remove-chart-zip',
            'current-lvl-video-badge', 'btn-remove-lvl-video',
            'current-lvl-audio-badge', 'btn-remove-lvl-audio',
            'current-chart-deluxe-zip-badge', 'btn-remove-chart-deluxe-zip',
            'current-lvl-video-deluxe-badge', 'btn-remove-lvl-video-deluxe',
            'badge-lvl-audio-explicit', 'btn-remove-lvl-audio-explicit',
            'badge-lvl-video-explicit', 'btn-remove-lvl-video-explicit',
            'badge-lvl-zip-explicit', 'btn-remove-lvl-zip-explicit',
            'badge-lvl-video-dlx-explicit', 'btn-remove-lvl-video-dlx-explicit',
            'badge-lvl-zip-dlx-explicit', 'btn-remove-lvl-zip-dlx-explicit'
        ];

        badgesToHide.forEach(id => document.getElementById(id)?.classList.add('hidden'));

        document.getElementById('lvlArtPreviewBox')?.classList.add('hidden');
        document.getElementById('lvlIsComingSoon').value = "false";
        document.getElementById('lvlIsExclusive').checked = false;
        document.getElementById('lvlHasExplicit').checked = false;
        
        const editionModeSelect = document.getElementById('lvlEditionMode');
        if (editionModeSelect) editionModeSelect.value = "Standard";

        document.getElementById('section-deluxe-fields')?.classList.add('hidden');
        document.getElementById('section-explicit-fields')?.classList.add('hidden');

        levelZipToRemove = false;
        levelZipDeluxeToRemove = false;
        levelZipExplicitToRemove = false;
        levelZipDeluxeExplicitToRemove = false;

        levelArtToRemove = false;

        levelVideoToRemove = false;
        levelVideoDeluxeToRemove = false;
        levelVideoExplicitToRemove = false;
        levelVideoDeluxeExplicitToRemove = false;

        levelAudioToRemove = false;
        levelAudioExplicitToRemove = false;
        
        buildGenresSelector();
    }

    // --- HELPERS DE RENDERIZADO EN TABLA ---
    function renderGenresBadgesHtml(raw) {
        if (!raw) return '';
        const globalVisualAssets = getGlobalVisualAssets();
        return raw.split(' / ').map(g => {
            const trimmed = g.trim();
            const matched = genreList.find(item => item.label.toLowerCase() === trimmed.toLowerCase());
            const color = matched ? matched.color : '#f97316';
            
            const safeKey = trimmed.replace('/', '');
            const dynamicAssetSrc = globalVisualAssets[`genre_${safeKey}`];
            
            const graphicElement = dynamicAssetSrc 
                ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAssetSrc}'); mask-image: url('${dynamicAssetSrc}');"></span>`
                : `<span class="w-2 h-2 rounded-full inline-block shrink-0" style="background-color: ${color}"></span>`;

            return `
                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black" style="color:${color}; border-color:${color}40; background:${color}10">
                    ${graphicElement}
                    <span class="inline truncate">${trimmed}</span>
                </div>
            `;
        }).join(' ');
    }

    function renderDifficultyTagMarkup(diffVal) {
        const lang = getCurrentLanguage();
        let label = translations[lang].diffNormal;
        let color = '#71717a';
        let styleClass = 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';

        if (diffVal === 'Hard') {
            label = translations[lang].diffHard;
            color = '#f97316';
            styleClass = 'bg-orange-500/10 border-orange-500/30 text-orange-400';
        } else if (diffVal === 'Extreme') {
            label = translations[lang].diffExtreme;
            color = '#ef4444';
            styleClass = 'bg-red-500/10 border-red-500/30 text-red-500';
        }

        const globalVisualAssets = getGlobalVisualAssets();
        const dynamicAsset = globalVisualAssets[`diff_${diffVal}`];
        const graphicMarkup = dynamicAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5" style="color: ${color}; -webkit-mask-image: url('${dynamicAsset}'); mask-image: url('${dynamicAsset}');"></span>`
            : `<i class="fa-solid fa-layer-group"></i>`;

        return `<div class="w-max max-w-full inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${styleClass} font-black uppercase text-[10px]">${graphicMarkup} <span>${label}</span></div>`;
    }

    function sortAscendingByDate(arr) {
        return [...arr].sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;  
            if (!b.date) return -1; 
            return new Date(a.date) - new Date(b.date);
        });
    }

    // --- RENDERIZADO DE TABLA DE CHARTS ---
    function renderLevelsTable() {
        const tbody = document.getElementById('levels-tbody');
        if (!tbody) return; 

        const lang = getCurrentLanguage();
        const isCreatorMode = getIsCreatorMode();
        const globalVisualAssets = getGlobalVisualAssets();
        const activeChartSelectedEditions = getActiveChartSelectedEditions();
        const activeChartExplicitStates = getActiveChartExplicitStates();
        const levels = getLevels();

        const fragment = document.createDocumentFragment();
        let filtered = sortAscendingByDate(levels);

        if (activeLvlGenreFilter) filtered = filtered.filter(l => l.genre && l.genre.toLowerCase().includes(activeLvlGenreFilter.toLowerCase()));
        if (activeLvlDiffFilter) filtered = filtered.filter(l => (l.diff === activeLvlDiffFilter) || (l.diffDeluxe === activeLvlDiffFilter));
        if (activeLvlEditionFilter) filtered = filtered.filter(l => (l.edition === activeLvlEditionFilter) || (l.editionMode === 'Both'));

        const hasActiveFilters = activeLvlGenreFilter || activeLvlDiffFilter || activeLvlEditionFilter;
        const counterLbl = document.getElementById('lbl-counter-charts');
        if (counterLbl) {
            counterLbl.innerText = hasActiveFilters ? `Charts: ${filtered.length}` : `Total: ${levels.length} Charts`;
        }

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <img src="1455064703448645786.gif" alt="Boogie" class="w-28 h-auto">
                        <p class="text-sm font-extrabold text-zinc-300 font-sans tracking-wide">${translations[lang].noChartsBoogie}</p>
                    </div>
                </td>
            `;
            tbody.innerHTML = '';
            tbody.appendChild(tr);
            return;
        }

        filtered.forEach((lvl) => {
            const isDual = (lvl.editionMode === 'Both');
            
            if (!activeChartSelectedEditions[lvl.id]) {
                activeChartSelectedEditions[lvl.id] = (lvl.editionMode === 'Deluxe') ? 'Deluxe' : 'Standard';
            }

            const currentSelectedEdition = activeChartSelectedEditions[lvl.id];
            const isDeluxeActive = (currentSelectedEdition === 'Deluxe');
            const isExplicitActive = !!activeChartExplicitStates[lvl.id];

            let currentDiffVal = isDeluxeActive ? (lvl.diffDeluxe || 'Extreme') : (lvl.diff || 'Normal');
            let currentNotesVal = isExplicitActive 
                ? (isDeluxeActive ? (lvl.notesDeluxeExplicit || lvl.notesExplicit || lvl.notesDeluxe || lvl.notes) : (lvl.notesExplicit || lvl.notes))
                : (isDeluxeActive ? (lvl.notesDeluxe || lvl.notes) : lvl.notes);

            let currentDurationVal = isExplicitActive
                ? (isDeluxeActive ? (lvl.durationDeluxeExplicit || lvl.durationExplicit || lvl.durationDeluxe || lvl.duration) : (lvl.durationExplicit || lvl.duration))
                : (isDeluxeActive ? (lvl.durationDeluxe || lvl.duration) : lvl.duration);

            let currentDateVal = isExplicitActive
                ? (isDeluxeActive ? (lvl.dateDeluxeExplicit || lvl.dateExplicit || lvl.dateDeluxe || lvl.date) : (lvl.dateExplicit || lvl.date))
                : (isDeluxeActive ? (lvl.dateDeluxe || lvl.date) : lvl.date);

            let currentAudioUrl = isExplicitActive
                ? (lvl.audioExplicit || lvl.audioDirectUrl)
                : lvl.audioDirectUrl;

            let currentVideoUrl = isExplicitActive
                ? (isDeluxeActive ? (lvl.videoDeluxeExplicit || lvl.videoExplicit || lvl.videoDeluxe || lvl.video) : (lvl.videoExplicit || lvl.video))
                : (isDeluxeActive ? (lvl.videoDeluxe || lvl.video) : lvl.video);

            let currentChartZip = isExplicitActive
                ? (isDeluxeActive ? (lvl.zipDeluxeExplicit || lvl.zipExplicit || lvl.chartDirectUrlDeluxe || lvl.chartDirectUrl) : (lvl.zipExplicit || lvl.chartDirectUrl))
                : (isDeluxeActive ? (lvl.chartDirectUrlDeluxe || lvl.chartDirectUrl) : lvl.chartDirectUrl);

            let currentDl1 = isExplicitActive
                ? (isDeluxeActive ? (lvl.dl1DeluxeExplicit || lvl.dl1Explicit || lvl.dl1Deluxe || lvl.dl1) : (lvl.dl1Explicit || lvl.dl1))
                : (isDeluxeActive ? (lvl.dl1Deluxe || lvl.dl1) : lvl.dl1);

            let currentDl2 = isExplicitActive
                ? (isDeluxeActive ? (lvl.dl2DeluxeExplicit || lvl.dl2Explicit || lvl.dl2Deluxe || lvl.dl2) : (lvl.dl2Explicit || lvl.dl2))
                : (isDeluxeActive ? (lvl.dl2Deluxe || lvl.dl2) : lvl.dl2);

            let currentDl3 = isExplicitActive
                ? (isDeluxeActive ? (lvl.dl3DeluxeExplicit || lvl.dl3Explicit || lvl.dl3Deluxe || lvl.dl3) : (lvl.dl3Explicit || lvl.dl3))
                : (isDeluxeActive ? (lvl.dl3Deluxe || lvl.dl3) : lvl.dl3);

            const tr = document.createElement('tr');
            tr.className = "hover:bg-fuchsia-950/20 transition border-b-2 border-fuchsia-900/50 shadow-sm";

            let editionGraphicMarkup = '';
            if (isDual) {
                const dynamicStdAsset = globalVisualAssets[`edit_Standard`];
                const dynamicDlxAsset = globalVisualAssets[`edit_Deluxe`];

                editionGraphicMarkup = `
                    <div class="inline-flex items-center gap-1.5 flex-wrap">
                        <div class="w-max max-w-full inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-black text-[10px] uppercase truncate">
                            ${dynamicStdAsset ? `<span class="dynamic-color-mask w-3.5 h-3.5" style="color: #71717a; -webkit-mask-image: url('${dynamicStdAsset}'); mask-image: url('${dynamicStdAsset}');"></span>` : ''}
                            <span>Standard</span>
                        </div>
                        <div class="w-max max-w-full inline-flex items-center gap-1.5 px-2 py-0.5 rounded glow-gold bg-yellow-500/10 text-yellow-400 border border-yellow-500/40 font-black text-[10px] uppercase truncate">
                            ${dynamicDlxAsset ? `<span class="dynamic-color-mask w-3.5 h-3.5" style="color: #facc15; -webkit-mask-image: url('${dynamicDlxAsset}'); mask-image: url('${dynamicDlxAsset}');"></span>` : ''}
                            <span>Deluxe</span>
                        </div>
                    </div>
                `;
            } else {
                const targetEditionHex = isDeluxeActive ? "#facc15" : "#71717a";
                const editionContainerClass = isDeluxeActive ? "glow-gold bg-yellow-500/10 text-yellow-400 border border-yellow-500/40" : "bg-zinc-900 border border-zinc-800 text-zinc-400";
                const dynamicEditionAsset = globalVisualAssets[isDeluxeActive ? `edit_Deluxe` : `edit_Standard`];

                editionGraphicMarkup = dynamicEditionAsset
                    ? `<div class="w-max max-w-full inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${editionContainerClass} font-black text-[10px] uppercase truncate"><span class="dynamic-color-mask w-3.5 h-3.5" style="color: ${targetEditionHex}; -webkit-mask-image: url('${dynamicEditionAsset}'); mask-image: url('${dynamicEditionAsset}');"></span><span>${isDeluxeActive ? 'Deluxe' : 'Standard'}</span></div>`
                    : `<div class="w-max max-w-full inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${editionContainerClass} font-black text-[10px] uppercase truncate"><span>${isDeluxeActive ? 'Deluxe' : 'Standard'}</span></div>`;
            }

            const hasAudio = !!currentAudioUrl;
            const hasAnyLinks = currentChartZip || currentDl1 || currentDl2 || currentDl3;

            let linksLayout = `<div class="flex flex-col gap-1 max-w-[130px] sm:max-w-[160px] mx-auto">`;
            if (hasAnyLinks) {
                if (currentChartZip) {
                    linksLayout += `<button class="btn-direct-download-trigger bg-gradient-to-r from-emerald-500 to-teal-500 text-black px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow"><i class="fa-solid fa-circle-down"></i>${translations[lang].downloadDirectBtn}</button>`;
                }
                if (currentDl1) linksLayout += `<a href="${currentDl1}" target="_blank" class="bg-zinc-900 px-1.5 sm:px-2 py-0.5 sm:py-1 text-center rounded-lg text-[9px] sm:text-[10px] font-extrabold border border-zinc-800 flex items-center justify-center gap-1 hover:border-orange-500/40 transition"><img src="Discord_Logo.png" class="w-2.5 sm:w-3 h-2.5 sm:h-3 force-white-icon">Discord</a>`;
                if (currentDl2) linksLayout += `<a href="${currentDl2}" target="_blank" class="bg-zinc-900 px-1.5 sm:px-2 py-0.5 sm:py-1 text-center rounded-lg text-[9px] sm:text-[10px] font-extrabold border border-zinc-800 flex items-center justify-center gap-1 hover:border-orange-500/40 transition"><img src="BSCM_Logo.png" class="w-2.5 sm:w-3 h-2.5 sm:h-3 force-white-icon">BSCM</a>`;
                if (currentDl3) linksLayout += `<a href="${currentDl3}" target="_blank" class="bg-zinc-900 px-1.5 sm:px-2 py-0.5 sm:py-1 text-center rounded-lg text-[9px] sm:text-[10px] font-extrabold border border-zinc-800 flex items-center justify-center gap-1 hover:border-orange-500/40 transition"><img src="beatcharts_Logo.png" class="w-2.5 sm:w-3 h-2.5 sm:h-3 force-white-icon">beatcharts</a>`;
            } else {
                linksLayout += `<span class="text-[9px] sm:text-[10px] font-extrabold text-zinc-500 text-center block px-1.5 py-1 bg-zinc-950 border border-zinc-900 rounded-lg">${translations[lang].noDownloadsAvailable}</span>`;
            }
            linksLayout += `</div>`;

            let pMarkup = renderVideoPlayerMarkup(currentVideoUrl, false);

            const exclusiveBadge = lvl.isExclusive ? `
                <div class="mt-1 text-[10px] font-black text-orange-400 uppercase tracking-wider flex items-center gap-1 bg-orange-950/40 border border-orange-800/40 px-2 py-0.5 rounded-md w-max">
                    <i class="fa-solid fa-star text-orange-400"></i> ${translations[lang].chartExclusiveLabel}
                </div>
            ` : '';

            const artBoxBorderClass = isDeluxeActive ? "glow-gold border-2 border-yellow-400" : "border border-fuchsia-500/30";

            const artOverlayBadgeDesktop = isDeluxeActive 
                ? `<div class="hidden sm:block absolute bottom-1 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg z-20 tracking-wider">DELUXE</div>`
                : `<div class="hidden sm:block absolute bottom-1 left-1/2 -translate-x-1/2 bg-zinc-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg z-20 tracking-wider">STANDARD</div>`;

            const artOverlayBadgeMobileExternal = isDeluxeActive
                ? `<div class="block sm:hidden mt-1.5 text-center bg-yellow-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-md tracking-wider w-max mx-auto relative z-20">DELUXE</div>`
                : `<div class="block sm:hidden mt-1.5 text-center bg-zinc-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-md tracking-wider w-max mx-auto relative z-20">STANDARD</div>`;

            const explicitBtnStyle = isExplicitActive 
                ? "bg-red-600 text-black border-red-500 glow-red" 
                : "bg-black/80 text-zinc-400 border-zinc-700 hover:text-white";

            const explicitButtonMarkup = (lvl.hasExplicit || isExplicitActive) ? `
                <button class="btn-toggle-explicit-trigger absolute bottom-1 left-1 w-7 h-7 sm:w-8 sm:h-8 ${explicitBtnStyle} border rounded-full font-black text-xs sm:text-sm flex items-center justify-center shadow-2xl transition hover:scale-110 z-20" title="Versión sin censura">
                    E
                </button>
            ` : '';

            const targetAudioThemeColor = isDeluxeActive ? "#facc15" : "#d946ef";

            tr.innerHTML = `
                <td class="p-2 sm:p-4 text-center align-middle">
                    <div class="flex flex-col items-center justify-center relative">
                        <div class="relative w-20 h-20 sm:w-36 sm:h-36 mx-auto flex items-center justify-center shrink-0">
                            <canvas class="absolute -inset-5 w-[calc(100%+2.5rem)] h-[calc(100%+2.5rem)] pointer-events-none z-0"></canvas>
                            <div class="target-art-outer-container art-beatstar-transform ${isDual ? 'cursor-pointer hover:scale-105' : ''} w-full h-full relative z-10 overflow-hidden rounded-xl ${artBoxBorderClass} shadow-lg shrink-0">
                                <img src="${lvl.art}" class="target-lvl-art-img w-full h-full object-cover bg-zinc-900 transition-colors" onerror="this.src='free_song_Image.png'">
                                ${artOverlayBadgeDesktop}
                            </div>

                            ${explicitButtonMarkup}

                            ${hasAudio ? `
                                <button class="btn-play-audio-preview absolute bottom-1 right-1 w-7 h-7 sm:w-8 sm:h-8 bg-black/90 border border-fuchsia-500 rounded-full text-fuchsia-400 flex items-center justify-center shadow-2xl transition hover:scale-110 z-20">
                                    <i class="fa-solid fa-play text-[10px]"></i>
                                </button>
                            ` : ''}
                        </div>
                        ${artOverlayBadgeMobileExternal}
                    </div>
                </td>
                <td class="p-2 sm:p-4 min-w-[220px] sm:min-w-[320px] flex-1 align-middle">
                    <ul class="space-y-2 list-none text-zinc-300 whitespace-normal break-words">
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formSong} / ${translations[lang].formArtist}:</span> 
                            <div class="inline-block flex-1">
                                <span class="text-white font-black tracking-wide text-base sm:text-lg">${lvl.song}</span> 
                                <span class="text-zinc-400 text-xs sm:text-sm font-medium"> - ${lvl.artist}</span>
                                ${exclusiveBadge}
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formGenre}:</span> 
                            <div class="inline-flex flex-wrap gap-1">${renderGenresBadgesHtml(lvl.genre)}</div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formDifficulty}:</span> 
                            ${renderDifficultyTagMarkup(currentDiffVal)}
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formEdition}:</span> 
                            ${editionGraphicMarkup}
                        </li>

                        <li class="pt-1">
                            <button type="button" class="btn-toggle-more-info text-[10px] sm:text-xs font-extrabold text-orange-400 hover:text-orange-300 flex items-center gap-1 bg-orange-950/30 border border-orange-900/40 px-2 py-1 rounded-lg transition">
                                <span class="btn-more-info-label">${translations[lang].btnMoreInfo}</span>
                                <i class="fa-solid fa-chevron-down text-[9px] transition-transform duration-200"></i>
                            </button>
                            <div class="extra-info-box hidden space-y-1.5 mt-2 bg-black/40 p-2.5 rounded-xl border border-fuchsia-950/40">
                                <div class="flex items-center gap-2">
                                    <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs w-20 shrink-0">${translations[lang].listNotes}:</span> 
                                    <span class="text-zinc-200 font-extrabold text-xs sm:text-sm">${currentNotesVal || translations[lang].textComingSoon}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs w-20 shrink-0">${translations[lang].listDuration}:</span> 
                                    <span class="text-zinc-200 font-extrabold text-xs sm:text-sm">${currentDurationVal || translations[lang].textComingSoon}</span>
                                </div>
                            </div>
                        </li>

                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formRelease}:</span> 
                            <span class="font-sans font-bold text-zinc-400 text-xs sm:text-sm">${formatStringToDMY(currentDateVal)}</span>
                        </li>
                    </ul>
                </td>
                <td class="p-2 sm:p-4 text-center align-middle">${pMarkup}</td>
                <td class="p-2 sm:p-4 align-middle">${linksLayout}</td>
                <td class="p-2 sm:p-4 text-center align-middle ${isCreatorMode ? '':'hidden'}">
                    <div class="flex flex-col gap-1">
                        <button class="btn-edit-lvl bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow">${translations[lang].btnEdit}</button>
                        <button class="btn-del-lvl bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow">${translations[lang].btnDelete}</button>
                    </div>
                </td>
            `;

            const explicitBtn = tr.querySelector('.btn-toggle-explicit-trigger');
            explicitBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeChartExplicitStates[lvl.id]) {
                    stopAllMedia();
                    activeChartExplicitStates[lvl.id] = false;
                    renderLevelsTable();
                } else {
                    pendingExplicitActivationChartId = lvl.id;
                    document.getElementById('explicit-warning-modal')?.classList.remove('hidden');
                }
            });

            setupNativeVideoBehavior(tr.querySelector('.custom-native-video-wrapper'));

            const toggleBtn = tr.querySelector('.btn-toggle-more-info');
            const extraBox = tr.querySelector('.extra-info-box');
            const toggleLabel = tr.querySelector('.btn-more-info-label');
            const toggleIcon = toggleBtn?.querySelector('i');

            toggleBtn?.addEventListener('click', () => {
                const isHidden = extraBox.classList.contains('hidden');
                if (isHidden) {
                    extraBox.classList.remove('hidden');
                    toggleLabel.innerText = translations[lang].btnShowLess;
                    if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
                } else {
                    extraBox.classList.add('hidden');
                    toggleLabel.innerText = translations[lang].btnMoreInfo;
                    if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
                }
            });

            if (hasAudio) {
                const btn = tr.querySelector('.btn-play-audio-preview');
                const img = tr.querySelector('.target-lvl-art-img');
                const canvas = tr.querySelector('canvas');
                const containerBox = tr.querySelector('.target-art-outer-container');

                btn.addEventListener('click', () => toggleAudioPreviewEngine(currentAudioUrl, btn, img, canvas, containerBox, false, targetAudioThemeColor, false));
            }

            if (currentChartZip) {
                tr.querySelector('.btn-direct-download-trigger')?.addEventListener('click', () => triggerDownloadAlert(currentChartZip));
            }

            tr.querySelector('.btn-edit-lvl')?.addEventListener('click', () => {
                document.getElementById('editingLvlId').value = lvl.id;
                document.getElementById('lvlSong').value = lvl.song;
                document.getElementById('lvlArtist').value = lvl.artist;
                
                const editionModeSelect = document.getElementById('lvlEditionMode');
                if (editionModeSelect) editionModeSelect.value = lvl.editionMode || (lvl.edition === 'Deluxe' ? 'Deluxe' : 'Standard');

                const sectionDeluxe = document.getElementById('section-deluxe-fields');
                const subSectionExplicitDeluxe = document.getElementById('sub-section-explicit-deluxe');

                if (lvl.editionMode === 'Both' || lvl.editionMode === 'Deluxe') {
                    sectionDeluxe?.classList.remove('hidden');
                    subSectionExplicitDeluxe?.classList.remove('hidden');
                } else {
                    sectionDeluxe?.classList.add('hidden');
                    subSectionExplicitDeluxe?.classList.add('hidden');
                }

                document.getElementById('lvlDiff').value = lvl.diff || 'Hard';
                document.getElementById('lvlNotes').value = lvl.notes || '';
                document.getElementById('lvlDuration').value = lvl.duration || '';
                document.getElementById('lvlDate').value = lvl.date || '';

                document.getElementById('lvlDl1').value = lvl.dl1 || '';
                document.getElementById('lvlDl2').value = lvl.dl2 || '';
                document.getElementById('lvlDl3').value = lvl.dl3 || '';

                if (lvl.audioDirectUrl) { document.getElementById('current-lvl-audio-badge')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-audio')?.classList.remove('hidden'); }
                if (lvl.video) { document.getElementById('current-lvl-video-badge')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-video')?.classList.remove('hidden'); }
                if (lvl.chartDirectUrl) { document.getElementById('current-chart-zip-badge')?.classList.remove('hidden'); document.getElementById('btn-remove-chart-zip')?.classList.remove('hidden'); }

                document.getElementById('lvlDiffDeluxe').value = lvl.diffDeluxe || 'Extreme';
                document.getElementById('lvlNotesDeluxe').value = lvl.notesDeluxe || '';
                document.getElementById('lvlDurationDeluxe').value = lvl.durationDeluxe || '';
                document.getElementById('lvlDateDeluxe').value = lvl.dateDeluxe || '';

                document.getElementById('lvlDl1Deluxe').value = lvl.dl1Deluxe || '';
                document.getElementById('lvlDl2Deluxe').value = lvl.dl2Deluxe || '';
                document.getElementById('lvlDl3Deluxe').value = lvl.dl3Deluxe || '';

                if (lvl.videoDeluxe) { document.getElementById('current-lvl-video-deluxe-badge')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-video-deluxe')?.classList.remove('hidden'); }
                if (lvl.chartDirectUrlDeluxe) { document.getElementById('current-chart-deluxe-zip-badge')?.classList.remove('hidden'); document.getElementById('btn-remove-chart-deluxe-zip')?.classList.remove('hidden'); }

                document.getElementById('lvlIsExclusive').checked = !!lvl.isExclusive;
                document.getElementById('lvlHasExplicit').checked = !!lvl.hasExplicit;
                
                const sectionExplicit = document.getElementById('section-explicit-fields');
                if (lvl.hasExplicit) {
                    sectionExplicit?.classList.remove('hidden');
                    document.getElementById('lvlNotesExplicit').value = lvl.notesExplicit || '';
                    document.getElementById('lvlDurationExplicit').value = lvl.durationExplicit || '';
                    document.getElementById('lvlDateExplicit').value = lvl.dateExplicit || '';
                    document.getElementById('lvlDl1Explicit').value = lvl.dl1Explicit || '';
                    document.getElementById('lvlDl2Explicit').value = lvl.dl2Explicit || '';
                    document.getElementById('lvlDl3Explicit').value = lvl.dl3Explicit || '';

                    document.getElementById('lvlNotesDeluxeExplicit').value = lvl.notesDeluxeExplicit || '';
                    document.getElementById('lvlDurationDeluxeExplicit').value = lvl.durationDeluxeExplicit || '';
                    document.getElementById('lvlDateDeluxeExplicit').value = lvl.dateDeluxeExplicit || '';
                    document.getElementById('lvlDl1DeluxeExplicit').value = lvl.dl1DeluxeExplicit || '';
                    document.getElementById('lvlDl2DeluxeExplicit').value = lvl.dl2DeluxeExplicit || '';
                    document.getElementById('lvlDl3DeluxeExplicit').value = lvl.dl3DeluxeExplicit || '';

                    if (lvl.audioExplicit) { document.getElementById('badge-lvl-audio-explicit')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-audio-explicit')?.classList.remove('hidden'); }
                    if (lvl.videoExplicit) { document.getElementById('badge-lvl-video-explicit')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-video-explicit')?.classList.remove('hidden'); }
                    if (lvl.zipExplicit) { document.getElementById('badge-lvl-zip-explicit')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-zip-explicit')?.classList.remove('hidden'); }

                    if (lvl.videoDeluxeExplicit) { document.getElementById('badge-lvl-video-dlx-explicit')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-video-dlx-explicit')?.classList.remove('hidden'); }
                    if (lvl.zipDeluxeExplicit) { document.getElementById('badge-lvl-zip-dlx-explicit')?.classList.remove('hidden'); document.getElementById('btn-remove-lvl-zip-dlx-explicit')?.classList.remove('hidden'); }
                } else {
                    sectionExplicit?.classList.add('hidden');
                }

                const submitBtn = document.getElementById('lvlSubmitBtn');
                if (submitBtn) {
                    const span = submitBtn.querySelector('span');
                    if (span) span.innerText = translations[lang].btnSaveChanges;
                    else submitBtn.innerText = translations[lang].btnSaveChanges;
                }
                
                const pBox = document.getElementById('lvlArtPreviewBox');
                const pImg = document.getElementById('lvlArtPreviewImg');
                if (lvl.art) {
                    pImg.src = lvl.art;
                    pBox.classList.remove('hidden');
                } else { pBox.classList.add('hidden'); }

                const currentGenresArray = lvl.genre ? lvl.genre.split(' / ').map(g => g.trim().toLowerCase()) : [];
                document.querySelectorAll('.genre-checkbox').forEach(cb => {
                    cb.checked = currentGenresArray.includes(cb.value.trim().toLowerCase());
                });
            });

            tr.querySelector('.btn-del-lvl')?.addEventListener('click', () => {
                requestUserDeleteConfirmation(() => {
                    if (db) {
                        showLoadingOverlay();
                        remove(ref(db, 'levels/' + lvl.id)).finally(() => hideLoadingOverlay());
                    }
                });
            });
            fragment.appendChild(tr);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }

    // --- ESCUCHADORES Y SUBMIT DEL FORMULARIO ---
    document.getElementById('btn-cancel-lvl-form')?.addEventListener('click', resetLevelFormState);

    document.getElementById('btn-remove-lvl-audio')?.addEventListener('click', () => { levelAudioToRemove = true; document.getElementById('current-lvl-audio-badge')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-audio')?.classList.add('hidden'); });
    document.getElementById('btn-remove-lvl-video')?.addEventListener('click', () => { levelVideoToRemove = true; document.getElementById('current-lvl-video-badge')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-video')?.classList.add('hidden'); });
    document.getElementById('btn-remove-chart-zip')?.addEventListener('click', () => { levelZipToRemove = true; document.getElementById('current-chart-zip-badge')?.classList.add('hidden'); document.getElementById('btn-remove-chart-zip')?.classList.add('hidden'); });

    document.getElementById('btn-remove-lvl-video-deluxe')?.addEventListener('click', () => { levelVideoDeluxeToRemove = true; document.getElementById('current-lvl-video-deluxe-badge')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-video-deluxe')?.classList.add('hidden'); });
    document.getElementById('btn-remove-chart-deluxe-zip')?.addEventListener('click', () => { levelZipDeluxeToRemove = true; document.getElementById('current-chart-deluxe-zip-badge')?.classList.add('hidden'); document.getElementById('btn-remove-chart-deluxe-zip')?.classList.add('hidden'); });

    document.getElementById('btn-remove-lvl-audio-explicit')?.addEventListener('click', () => { levelAudioExplicitToRemove = true; document.getElementById('badge-lvl-audio-explicit')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-audio-explicit')?.classList.add('hidden'); });
    document.getElementById('btn-remove-lvl-video-explicit')?.addEventListener('click', () => { levelVideoExplicitToRemove = true; document.getElementById('badge-lvl-video-explicit')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-video-explicit')?.classList.add('hidden'); });
    document.getElementById('btn-remove-lvl-zip-explicit')?.addEventListener('click', () => { levelZipExplicitToRemove = true; document.getElementById('badge-lvl-zip-explicit')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-zip-explicit')?.classList.add('hidden'); });

    document.getElementById('btn-remove-lvl-video-dlx-explicit')?.addEventListener('click', () => { levelVideoDeluxeExplicitToRemove = true; document.getElementById('badge-lvl-video-dlx-explicit')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-video-dlx-explicit')?.classList.add('hidden'); });
    document.getElementById('btn-remove-lvl-zip-dlx-explicit')?.addEventListener('click', () => { levelZipDeluxeExplicitToRemove = true; document.getElementById('badge-lvl-zip-dlx-explicit')?.classList.add('hidden'); document.getElementById('btn-remove-lvl-zip-dlx-explicit')?.classList.add('hidden'); });

    document.getElementById('btn-delete-lvl-art-preview')?.addEventListener('click', () => {
        requestUserDeleteConfirmation(() => {
            levelArtToRemove = true;
            document.getElementById('lvlArtPreviewBox')?.classList.add('hidden');
            const fileIn = document.getElementById('lvlArtFile');
            if (fileIn) fileIn.value = "";
        });
    });

    document.getElementById('level-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingOverlay();

        try {
            const checked = Array.from(document.querySelectorAll('.genre-checkbox:checked')).map(cb => cb.value);
            let id = document.getElementById('editingLvlId').value.trim() || Date.now().toString();
            
            const levels = getLevels();
            let existingLvl = levels.find(l => l.id === id);

            let finalArtUrl = levelArtToRemove ? "free_song_Image.png" : (existingLvl?.art || "free_song_Image.png");
            let finalAudioUrl = levelAudioToRemove ? "" : (existingLvl?.audioDirectUrl || "");
            let finalVideoUrl = levelVideoToRemove ? "" : (existingLvl?.video || "");
            let finalVideoDeluxeUrl = levelVideoDeluxeToRemove ? "" : (existingLvl?.videoDeluxe || "");
            let finalChartDirectUrl = levelZipToRemove ? "" : (existingLvl?.chartDirectUrl || "");
            let finalChartDirectUrlDeluxe = levelZipDeluxeToRemove ? "" : (existingLvl?.chartDirectUrlDeluxe || "");

            let finalAudioExplicit = levelAudioExplicitToRemove ? "" : (existingLvl?.audioExplicit || "");
            let finalVideoExplicit = levelVideoExplicitToRemove ? "" : (existingLvl?.videoExplicit || "");
            let finalVideoDeluxeExplicit = levelVideoDeluxeExplicitToRemove ? "" : (existingLvl?.videoDeluxeExplicit || "");
            let finalZipExplicit = levelZipExplicitToRemove ? "" : (existingLvl?.zipExplicit || "");
            let finalZipDeluxeExplicit = levelZipDeluxeExplicitToRemove ? "" : (existingLvl?.zipDeluxeExplicit || "");

            const artFileInput = document.getElementById('lvlArtFile');
            if (artFileInput && artFileInput.files && artFileInput.files[0]) {
                const uploadedArt = await uploadFileToCloudflareR2(artFileInput.files[0], 'charts_art');
                if (uploadedArt) finalArtUrl = uploadedArt;
            }

            const audioFileInput = document.getElementById('lvlAudioFile');
            if (audioFileInput && audioFileInput.files && audioFileInput.files[0]) {
                const uploadedAudio = await uploadFileToCloudflareR2(audioFileInput.files[0], 'audio');
                if (uploadedAudio) finalAudioUrl = uploadedAudio;
            }

            const videoFileInput = document.getElementById('lvlVideoFile');
            if (videoFileInput && videoFileInput.files && videoFileInput.files[0]) {
                const uploadedVideo = await uploadFileToCloudflareR2(videoFileInput.files[0], 'prevchart');
                if (uploadedVideo) finalVideoUrl = uploadedVideo;
            }

            const videoDeluxeFileInput = document.getElementById('lvlVideoFileDeluxe');
            if (videoDeluxeFileInput && videoDeluxeFileInput.files && videoDeluxeFileInput.files[0]) {
                const uploadedVideoDeluxe = await uploadFileToCloudflareR2(videoDeluxeFileInput.files[0], 'prevchart');
                if (uploadedVideoDeluxe) finalVideoDeluxeUrl = uploadedVideoDeluxe;
            }

            const chartFileInput = document.getElementById('lvlChartZipFile');
            if (chartFileInput && chartFileInput.files && chartFileInput.files[0]) {
                const uploadedZip = await uploadFileToCloudflareR2(chartFileInput.files[0], 'charts_zip');
                if (uploadedZip) finalChartDirectUrl = uploadedZip;
            }

            const chartDeluxeFileInput = document.getElementById('lvlChartZipFileDeluxe');
            if (chartDeluxeFileInput && chartDeluxeFileInput.files && chartDeluxeFileInput.files[0]) {
                const uploadedZipDeluxe = await uploadFileToCloudflareR2(chartDeluxeFileInput.files[0], 'charts_zip');
                if (uploadedZipDeluxe) finalChartDirectUrlDeluxe = uploadedZipDeluxe;
            }

            const hasExplicit = document.getElementById('lvlHasExplicit')?.checked || false;
            if (hasExplicit) {
                const audioExpIn = document.getElementById('lvlAudioFileExplicit');
                if (audioExpIn && audioExpIn.files && audioExpIn.files[0]) {
                    const uploadedAudioExp = await uploadFileToCloudflareR2(audioExpIn.files[0], 'audio');
                    if (uploadedAudioExp) finalAudioExplicit = uploadedAudioExp;
                }

                const vidExpIn = document.getElementById('lvlVideoFileExplicit');
                if (vidExpIn && vidExpIn.files && vidExpIn.files[0]) {
                    const uploadedVidExp = await uploadFileToCloudflareR2(vidExpIn.files[0], 'prevchart');
                    if (uploadedVidExp) finalVideoExplicit = uploadedVidExp;
                }

                const vidDlxExpIn = document.getElementById('lvlVideoFileDeluxeExplicit');
                if (vidDlxExpIn && vidDlxExpIn.files && vidDlxExpIn.files[0]) {
                    const uploadedVidDlxExp = await uploadFileToCloudflareR2(vidDlxExpIn.files[0], 'prevchart');
                    if (uploadedVidDlxExp) finalVideoDeluxeExplicit = uploadedVidDlxExp;
                }

                const zipExpIn = document.getElementById('lvlChartZipFileExplicit');
                if (zipExpIn && zipExpIn.files && zipExpIn.files[0]) {
                    const uploadedZipExp = await uploadFileToCloudflareR2(zipExpIn.files[0], 'charts_zip');
                    if (uploadedZipExp) finalZipExplicit = uploadedZipExp;
                }

                const zipDlxExpIn = document.getElementById('lvlChartZipFileDeluxeExplicit');
                if (zipDlxExpIn && zipDlxExpIn.files && zipDlxExpIn.files[0]) {
                    const uploadedZipDlxExp = await uploadFileToCloudflareR2(zipDlxExpIn.files[0], 'charts_zip');
                    if (uploadedZipDlxExp) finalZipDeluxeExplicit = uploadedZipDlxExp;
                }
            }

            const selectedEditionMode = document.getElementById('lvlEditionMode')?.value || 'Standard';
            const isExclusive = document.getElementById('lvlIsExclusive')?.checked || false;

            const data = {
                id: id, 
                song: (document.getElementById('lvlSong')?.value || '').trim(), 
                artist: (document.getElementById('lvlArtist')?.value || '').trim(),
                art: finalArtUrl, 
                genre: checked.join(' / ') || 'General', 
                
                editionMode: selectedEditionMode,
                edition: (selectedEditionMode === 'Deluxe') ? 'Deluxe' : 'Standard',

                audioDirectUrl: finalAudioUrl, 

                diff: document.getElementById('lvlDiff')?.value || 'Normal',
                notes: (document.getElementById('lvlNotes')?.value || '').trim(),
                duration: (document.getElementById('lvlDuration')?.value || '').trim(),
                date: document.getElementById('lvlDate')?.value || '',
                video: finalVideoUrl,
                chartDirectUrl: finalChartDirectUrl,
                dl1: (document.getElementById('lvlDl1')?.value || '').trim(), 
                dl2: (document.getElementById('lvlDl2')?.value || '').trim(), 
                dl3: (document.getElementById('lvlDl3')?.value || '').trim(),

                diffDeluxe: document.getElementById('lvlDiffDeluxe')?.value || 'Extreme',
                notesDeluxe: (document.getElementById('lvlNotesDeluxe')?.value || '').trim(),
                durationDeluxe: (document.getElementById('lvlDurationDeluxe')?.value || '').trim(),
                dateDeluxe: document.getElementById('lvlDateDeluxe')?.value || '',
                videoDeluxe: finalVideoDeluxeUrl,
                chartDirectUrlDeluxe: finalChartDirectUrlDeluxe,
                dl1Deluxe: (document.getElementById('lvlDl1Deluxe')?.value || '').trim(),
                dl2Deluxe: (document.getElementById('lvlDl2Deluxe')?.value || '').trim(),
                dl3Deluxe: (document.getElementById('lvlDl3Deluxe')?.value || '').trim(),

                hasExplicit: hasExplicit,
                audioExplicit: finalAudioExplicit,
                notesExplicit: (document.getElementById('lvlNotesExplicit')?.value || '').trim(),
                durationExplicit: (document.getElementById('lvlDurationExplicit')?.value || '').trim(),
                dateExplicit: document.getElementById('lvlDateExplicit')?.value || '',
                videoExplicit: finalVideoExplicit,
                zipExplicit: finalZipExplicit,
                dl1Explicit: (document.getElementById('lvlDl1Explicit')?.value || '').trim(),
                dl2Explicit: (document.getElementById('lvlDl2Explicit')?.value || '').trim(),
                dl3Explicit: (document.getElementById('lvlDl3Explicit')?.value || '').trim(),

                notesDeluxeExplicit: (document.getElementById('lvlNotesDeluxeExplicit')?.value || '').trim(),
                durationDeluxeExplicit: (document.getElementById('lvlDurationDeluxeExplicit')?.value || '').trim(),
                dateDeluxeExplicit: document.getElementById('lvlDateDeluxeExplicit')?.value || '',
                videoDeluxeExplicit: finalVideoDeluxeExplicit,
                zipDeluxeExplicit: finalZipDeluxeExplicit,
                dl1DeluxeExplicit: (document.getElementById('lvlDl1DeluxeExplicit')?.value || '').trim(),
                dl2DeluxeExplicit: (document.getElementById('lvlDl2DeluxeExplicit')?.value || '').trim(),
                dl3DeluxeExplicit: (document.getElementById('lvlDl3DeluxeExplicit')?.value || '').trim(),

                isExclusive: isExclusive
            };

            if (db) {
                await set(ref(db, 'levels/' + id), data);
                await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]); 
                resetLevelFormState();
            }
        } catch(err) {
            console.error("Error al guardar chart en Firebase:", err);
            alert("Ocurrió un error al guardar el registro. Revisa la consola.");
        } finally {
            hideLoadingOverlay();
        }
    });

    return {
        buildGenresSelector,
        resetLevelFormState,
        renderLevelsTable,
        getPendingExplicitActivationChartId: () => pendingExplicitActivationChartId,
        setPendingExplicitActivationChartId: (val) => { pendingExplicitActivationChartId = val; },
        setLvlGenreFilter: (val) => { activeLvlGenreFilter = val; },
        setLvlDiffFilter: (val) => { activeLvlDiffFilter = val; },
        setLvlEditionFilter: (val) => { activeLvlEditionFilter = val; }
    };
}