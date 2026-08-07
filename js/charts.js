import { ref, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";
import { toggleAudioPreviewEngine } from "./audio-player.js";
import { createOrUpdateNotification } from "./notifications-manager.js";

export function initChartsModule(state) {
    const {
        genreList,
        getLevels,
        getCurrentLanguage,
        getIsCreatorMode,
        getGlobalVisualAssets,
        getActiveChartSelectedEditions,
        getActiveChartExplicitStates,
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
        requestUserDeleteConfirmation
    } = state;

    let activeLvlGenreFilter = "";
    let activeLvlDiffFilter = "";
    let activeLvlEditionFilter = "";

    let pendingExplicitActivationChartId = null;

    // Estado para gestionar los borrados diferidos de archivos y fechas
    let pendingDeletes = {
        art: false,
        audio: false,
        videoStd: false,
        zipStd: false,
        dateStd: false,
        videoDlx: false,
        zipDlx: false,
        dateDlx: false,
        audioExp: false,
        videoExpStd: false,
        zipExpStd: false,
        dateExpStd: false,
        videoExpDlx: false,
        zipExpDlx: false,
        dateExpDlx: false
    };

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
                validateFormStateAndCheckChanges();
            });
            container.appendChild(item);
        });
    }

    // Configura un slot para alternar entre el file/date input y el botón de borrado diferido
    function setupFileOrDeleteSlot(slotId, hasExisting, keyName, isDate = false) {
        const slot = document.getElementById(slotId);
        if (!slot) return;

        const lang = getCurrentLanguage();
        const defaultText = isDate ? translations[lang].btnDeleteDate : translations[lang].btnDeleteFile;
        const pendingText = isDate ? translations[lang].btnDateDeletePending : translations[lang].btnFileDeletePending;

        let inputEl = slot.querySelector('input');
        let deleteBtn = slot.querySelector('.btn-slot-delete');

        if (hasExisting && !pendingDeletes[keyName]) {
            if (inputEl) inputEl.classList.add('hidden');
            if (!deleteBtn) {
                deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn-slot-delete w-full py-2 bg-red-950/60 border border-red-800/60 text-red-400 font-extrabold rounded-lg uppercase text-xs transition hover:bg-red-900/60';
                slot.appendChild(deleteBtn);
            }
            deleteBtn.classList.remove('hidden', 'glow-red');
            deleteBtn.innerText = defaultText;

            deleteBtn.onclick = () => {
                pendingDeletes[keyName] = !pendingDeletes[keyName];
                if (pendingDeletes[keyName]) {
                    deleteBtn.innerText = pendingText;
                    deleteBtn.classList.add('glow-red');
                } else {
                    deleteBtn.innerText = defaultText;
                    deleteBtn.classList.remove('glow-red');
                }
                validateFormStateAndCheckChanges();
            };
        } else {
            if (inputEl) inputEl.classList.remove('hidden');
            if (deleteBtn) deleteBtn.classList.add('hidden');
        }
    }

    function resetLevelFormState() {
        const form = document.getElementById('level-form');
        if (form) form.reset();

        document.getElementById('editingLvlId').value = '';
        
        Object.keys(pendingDeletes).forEach(k => pendingDeletes[k] = false);

        const submitBtn = document.getElementById('lvlSubmitBtn');
        const lang = getCurrentLanguage();
        if (submitBtn) {
            const textSpan = submitBtn.querySelector('span');
            if (textSpan) textSpan.innerText = translations[lang].btnRegister;
            else submitBtn.innerText = translations[lang].btnRegister;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        document.getElementById('lvlArtPreviewBox')?.classList.add('hidden');
        document.getElementById('lvlIsComingSoon').value = "false";
        document.getElementById('lvlIsExclusive').checked = false;
        document.getElementById('lvlHasExplicit').checked = false;
        
        const editionModeSelect = document.getElementById('lvlEditionMode');
        if (editionModeSelect) {
            editionModeSelect.value = "Standard";
            editionModeSelect.disabled = false;
            Array.from(editionModeSelect.options).forEach(opt => opt.disabled = false);
        }

        document.getElementById('section-standard-fields')?.classList.remove('hidden');
        document.getElementById('section-deluxe-fields')?.classList.add('hidden');
        document.getElementById('section-explicit-fields')?.classList.add('hidden');

        // Limpiar botones de borrado dinámicos
        document.querySelectorAll('.btn-slot-delete').forEach(btn => btn.remove());
        document.querySelectorAll('#level-form input[type="file"], #level-form input[type="date"]').forEach(inp => inp.classList.remove('hidden'));

        buildGenresSelector();
    }

    function validateFormStateAndCheckChanges() {
        const submitBtn = document.getElementById('lvlSubmitBtn');
        if (!submitBtn) return;

        const editingId = document.getElementById('editingLvlId').value;
        const song = document.getElementById('lvlSong').value.trim();
        const artist = document.getElementById('lvlArtist').value.trim();
        const selectedGenres = document.querySelectorAll('.genre-checkbox:checked');

        const hasRequired = song !== "" && artist !== "" && selectedGenres.length > 0;

        if (!editingId) {
            // Modo Registrar
            if (hasRequired) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
            // Modo Guardar Cambios: evaluar si cambió respecto a la base de datos
            const existingLvl = getLevels().find(l => l.id === editingId);
            if (!existingLvl || !hasRequired) {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            }

            const hasPendingDelete = Object.values(pendingDeletes).some(v => v === true);
            const hasNewFile = Array.from(document.querySelectorAll('#level-form input[type="file"]')).some(inp => inp.files && inp.files.length > 0);

            const changed = hasPendingDelete || hasNewFile ||
                song !== (existingLvl.song || '') ||
                artist !== (existingLvl.artist || '') ||
                document.getElementById('lvlEditionMode').value !== (existingLvl.editionMode || 'Standard') ||
                document.getElementById('lvlDiff').value !== (existingLvl.diff || 'Hard') ||
                document.getElementById('lvlNotes').value !== (existingLvl.notes || '') ||
                document.getElementById('lvlDuration').value !== (existingLvl.duration || '') ||
                document.getElementById('lvlDate').value !== (existingLvl.date || '') ||
                document.getElementById('lvlDl1').value !== (existingLvl.dl1 || '') ||
                document.getElementById('lvlDl2').value !== (existingLvl.dl2 || '') ||
                document.getElementById('lvlDl3').value !== (existingLvl.dl3 || '') ||
                document.getElementById('lvlDiffDeluxe').value !== (existingLvl.diffDeluxe || 'Extreme') ||
                document.getElementById('lvlNotesDeluxe').value !== (existingLvl.notesDeluxe || '') ||
                document.getElementById('lvlDurationDeluxe').value !== (existingLvl.durationDeluxe || '') ||
                document.getElementById('lvlDateDeluxe').value !== (existingLvl.dateDeluxe || '') ||
                document.getElementById('lvlDl1Deluxe').value !== (existingLvl.dl1Deluxe || '') ||
                document.getElementById('lvlDl2Deluxe').value !== (existingLvl.dl2Deluxe || '') ||
                document.getElementById('lvlDl3Deluxe').value !== (existingLvl.dl3Deluxe || '') ||
                document.getElementById('lvlIsExclusive').checked !== !!existingLvl.isExclusive ||
                document.getElementById('lvlHasExplicit').checked !== !!existingLvl.hasExplicit;

            if (changed) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

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
        if (activeLvlEditionFilter) filtered = filtered.filter(l => (l.editionMode === activeLvlEditionFilter) || (l.editionMode === 'Both') || (l.edition === activeLvlEditionFilter));

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

            const activeAudio = (typeof getActiveAudioElement === 'function') ? getActiveAudioElement() : null;
            const isThisAudioPlaying = activeAudio && !activeAudio.paused && activeAudio.dataset.url === currentAudioUrl;

            const audioBtnIcon = isThisAudioPlaying ? 'fa-stop' : 'fa-play';
            const artShapeClass = isThisAudioPlaying ? 'art-circle-shape art-container-circular' : '';

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
                            <div class="target-art-outer-container art-beatstar-transform ${isDual ? 'cursor-pointer hover:scale-105' : ''} ${artShapeClass} w-full h-full relative z-10 overflow-hidden rounded-xl ${artBoxBorderClass} shadow-lg shrink-0">
                                <img src="${lvl.art}" class="target-lvl-art-img w-full h-full object-cover bg-zinc-900 transition-colors" onerror="this.src='free_song_Image.png'">
                                ${artOverlayBadgeDesktop}
                            </div>

                            ${explicitButtonMarkup}

                            ${hasAudio ? `
                                <button class="btn-play-audio-preview absolute bottom-1 right-1 w-7 h-7 sm:w-8 sm:h-8 bg-black/90 border border-fuchsia-500 rounded-full text-fuchsia-400 flex items-center justify-center shadow-2xl transition hover:scale-110 z-20">
                                    <i class="fa-solid ${audioBtnIcon} text-[10px]"></i>
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

            if (isThisAudioPlaying) {
                const canvas = tr.querySelector('canvas');
                const containerBox = tr.querySelector('.target-art-outer-container');
                const analyser = (typeof getAudioAnalyser === 'function') ? getAudioAnalyser() : null;
                if (canvas && analyser && typeof startRadialCanvasVisualizer === 'function') {
                    startRadialCanvasVisualizer(canvas, analyser, containerBox, targetAudioThemeColor);
                }
            }

            if (isDual) {
                const artBox = tr.querySelector('.target-art-outer-container');
                artBox?.addEventListener('click', () => {
                    openBeatstarEditionSelectionModal(lvl);
                    
                    if (currentAudioUrl) {
                        const modalCanvas = document.getElementById('modal-edition-canvas');
                        const modalImg = document.getElementById('modal-edition-art-img');
                        const modalContainer = document.getElementById('modal-edition-art-container');
                        const targetColor = isDeluxeActive ? "#facc15" : "#d946ef";

                        toggleAudioPreviewEngine(currentAudioUrl, null, modalImg, modalCanvas, modalContainer, true, targetColor, true);
                    }
                });
            }

            const explicitBtn = tr.querySelector('.btn-toggle-explicit-trigger');
            explicitBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeChartExplicitStates[lvl.id]) {
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

            // EDICIÓN DE UN CHART REGISTRADO
            tr.querySelector('.btn-edit-lvl')?.addEventListener('click', () => {
                resetLevelFormState();

                document.getElementById('editingLvlId').value = lvl.id;
                document.getElementById('lvlSong').value = lvl.song;
                document.getElementById('lvlArtist').value = lvl.artist;
                
                const editionModeSelect = document.getElementById('lvlEditionMode');
                const sectionStandard = document.getElementById('section-standard-fields');
                const sectionDeluxe = document.getElementById('section-deluxe-fields');
                const subSectionExplicitDeluxe = document.getElementById('sub-section-explicit-deluxe');

                // Regla de bloqueo de versión registrada
                const currentEditMode = lvl.editionMode || (lvl.edition === 'Deluxe' ? 'Deluxe' : 'Standard');
                if (editionModeSelect) {
                    editionModeSelect.value = currentEditMode;
                    if (currentEditMode === 'Standard') {
                        Array.from(editionModeSelect.options).forEach(opt => {
                            if (opt.value === 'Deluxe') opt.disabled = true;
                        });
                    } else if (currentEditMode === 'Deluxe') {
                        Array.from(editionModeSelect.options).forEach(opt => {
                            if (opt.value === 'Standard') opt.disabled = true;
                        });
                    }
                }

                if (currentEditMode === 'Deluxe') {
                    sectionStandard?.classList.add('hidden');
                    sectionDeluxe?.classList.remove('hidden');
                    subSectionExplicitDeluxe?.classList.remove('hidden');
                } else if (currentEditMode === 'Both') {
                    sectionStandard?.classList.remove('hidden');
                    sectionDeluxe?.classList.remove('hidden');
                    subSectionExplicitDeluxe?.classList.remove('hidden');
                } else {
                    sectionStandard?.classList.remove('hidden');
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

                document.getElementById('lvlDiffDeluxe').value = lvl.diffDeluxe || 'Extreme';
                document.getElementById('lvlNotesDeluxe').value = lvl.notesDeluxe || '';
                document.getElementById('lvlDurationDeluxe').value = lvl.durationDeluxe || '';
                document.getElementById('lvlDateDeluxe').value = lvl.dateDeluxe || '';

                document.getElementById('lvlDl1Deluxe').value = lvl.dl1Deluxe || '';
                document.getElementById('lvlDl2Deluxe').value = lvl.dl2Deluxe || '';
                document.getElementById('lvlDl3Deluxe').value = lvl.dl3Deluxe || '';

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
                } else {
                    sectionExplicit?.classList.add('hidden');
                }

                // Configuración de slots para los botones de Borrar Archivo / Borrar Fecha
                setupFileOrDeleteSlot('slot-lvl-art', !!lvl.art, 'art');
                setupFileOrDeleteSlot('slot-lvl-audio', !!lvl.audioDirectUrl, 'audio');
                setupFileOrDeleteSlot('slot-lvl-video-std', !!lvl.video, 'videoStd');
                setupFileOrDeleteSlot('slot-lvl-zip-std', !!lvl.chartDirectUrl, 'zipStd');
                setupFileOrDeleteSlot('slot-lvl-date-std', !!lvl.date, 'dateStd', true);

                setupFileOrDeleteSlot('slot-lvl-video-dlx', !!lvl.videoDeluxe, 'videoDlx');
                setupFileOrDeleteSlot('slot-lvl-zip-dlx', !!lvl.chartDirectUrlDeluxe, 'zipDlx');
                setupFileOrDeleteSlot('slot-lvl-date-dlx', !!lvl.dateDeluxe, 'dateDlx', true);

                setupFileOrDeleteSlot('slot-lvl-audio-exp', !!lvl.audioExplicit, 'audioExp');
                setupFileOrDeleteSlot('slot-lvl-video-exp-std', !!lvl.videoExplicit, 'videoExpStd');
                setupFileOrDeleteSlot('slot-lvl-zip-exp-std', !!lvl.zipExplicit, 'zipExpStd');
                setupFileOrDeleteSlot('slot-lvl-date-exp-std', !!lvl.dateExplicit, 'dateExpStd', true);

                setupFileOrDeleteSlot('slot-lvl-video-exp-dlx', !!lvl.videoDeluxeExplicit, 'videoExpDlx');
                setupFileOrDeleteSlot('slot-lvl-zip-exp-dlx', !!lvl.zipDeluxeExplicit, 'zipExpDlx');
                setupFileOrDeleteSlot('slot-lvl-date-exp-dlx', !!lvl.dateDeluxeExplicit, 'dateExpDlx', true);

                const submitBtn = document.getElementById('lvlSubmitBtn');
                if (submitBtn) {
                    const span = submitBtn.querySelector('span');
                    if (span) span.innerText = translations[lang].btnSaveChanges;
                    else submitBtn.innerText = translations[lang].btnSaveChanges;
                }
                
                const pBox = document.getElementById('lvlArtPreviewBox');
                const pImg = document.getElementById('lvlArtPreviewImg');
                if (lvl.art && !pendingDeletes.art) {
                    pImg.src = lvl.art;
                    pBox.classList.remove('hidden');
                } else { pBox.classList.add('hidden'); }

                const currentGenresArray = lvl.genre ? lvl.genre.split(' / ').map(g => g.trim().toLowerCase()) : [];
                document.querySelectorAll('.genre-checkbox').forEach(cb => {
                    cb.checked = currentGenresArray.includes(cb.value.trim().toLowerCase());
                });

                validateFormStateAndCheckChanges();
            });

            tr.querySelector('.btn-del-lvl')?.addEventListener('click', () => {
                requestUserDeleteConfirmation(async () => {
                    if (db) {
                        showLoadingOverlay();
                        try {
                            // 1. Recopilar todos los archivos vinculados (Standard, Deluxe y Explicit)
                            const filesToDelete = [
                                lvl.art,
                                lvl.audioDirectUrl,
                                lvl.video,
                                lvl.chartDirectUrl,
                                lvl.videoDeluxe,
                                lvl.chartDirectUrlDeluxe,
                                lvl.audioExplicit,
                                lvl.videoExplicit,
                                lvl.zipExplicit,
                                lvl.videoDeluxeExplicit,
                                lvl.zipDeluxeExplicit
                            ].filter(url => url && url.trim() !== "");

                            // 2. Eliminarlos de Cloudflare R2 en paralelo
                            if (filesToDelete.length > 0) {
                                await Promise.all(filesToDelete.map(url => deleteFileFromCloudflareR2(url)));
                            }

                            // 3. Eliminar de Firebase
                            await remove(ref(db, 'levels/' + lvl.id));

                            // 4. Reiniciar formulario
                            resetLevelFormState();
                        } catch (err) {
                            console.error("Error al borrar el chart y sus archivos:", err);
                            alert("Ocurrió un error al intentar eliminar todos los archivos vinculados.");
                        } finally {
                            hideLoadingOverlay();
                        }
                    }
                });
            });

            fragment.appendChild(tr);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }

    // FORM SUBMIT Y PROCESAMIENTO DIFERIDO
    document.getElementById('level-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingOverlay();

        try {
            const editingId = document.getElementById('editingLvlId').value;
            const id = editingId || 'lvl_' + Date.now();
            const existingLvl = getLevels().find(l => l.id === id) || {};

            const song = document.getElementById('lvlSong').value.trim();
            const artist = document.getElementById('lvlArtist').value.trim();
            const editionMode = document.getElementById('lvlEditionMode').value;
            const isExclusive = document.getElementById('lvlIsExclusive').checked;
            const hasExplicit = document.getElementById('lvlHasExplicit').checked;

            const selectedGenres = Array.from(document.querySelectorAll('.genre-checkbox:checked')).map(cb => cb.value);
            const genre = selectedGenres.join(' / ');

            // 1. Borrados reales en Cloudflare R2 si se confirmó el botón "Borrar Archivo"
            if (pendingDeletes.art && existingLvl.art) { await deleteFileFromCloudflareR2(existingLvl.art); existingLvl.art = ""; }
            if (pendingDeletes.audio && existingLvl.audioDirectUrl) { await deleteFileFromCloudflareR2(existingLvl.audioDirectUrl); existingLvl.audioDirectUrl = ""; }
            if (pendingDeletes.videoStd && existingLvl.video) { await deleteFileFromCloudflareR2(existingLvl.video); existingLvl.video = ""; }
            if (pendingDeletes.zipStd && existingLvl.chartDirectUrl) { await deleteFileFromCloudflareR2(existingLvl.chartDirectUrl); existingLvl.chartDirectUrl = ""; }
            if (pendingDeletes.videoDlx && existingLvl.videoDeluxe) { await deleteFileFromCloudflareR2(existingLvl.videoDeluxe); existingLvl.videoDeluxe = ""; }
            if (pendingDeletes.zipDlx && existingLvl.chartDirectUrlDeluxe) { await deleteFileFromCloudflareR2(existingLvl.chartDirectUrlDeluxe); existingLvl.chartDirectUrlDeluxe = ""; }

            if (pendingDeletes.audioExp && existingLvl.audioExplicit) { await deleteFileFromCloudflareR2(existingLvl.audioExplicit); existingLvl.audioExplicit = ""; }
            if (pendingDeletes.videoExpStd && existingLvl.videoExplicit) { await deleteFileFromCloudflareR2(existingLvl.videoExplicit); existingLvl.videoExplicit = ""; }
            if (pendingDeletes.zipExpStd && existingLvl.zipExplicit) { await deleteFileFromCloudflareR2(existingLvl.zipExplicit); existingLvl.zipExplicit = ""; }
            if (pendingDeletes.videoExpDlx && existingLvl.videoDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLvl.videoDeluxeExplicit); existingLvl.videoDeluxeExplicit = ""; }
            if (pendingDeletes.zipExpDlx && existingLvl.zipDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLvl.zipDeluxeExplicit); existingLvl.zipDeluxeExplicit = ""; }

            // 2. Subida de nuevos archivos si fueron seleccionados
            let art = existingLvl.art || '';
            const artFile = document.getElementById('lvlArtFile')?.files[0];
            if (artFile) art = await uploadFileToCloudflareR2(artFile, 'charts_art');

            let audioDirectUrl = existingLvl.audioDirectUrl || '';
            const audioFile = document.getElementById('lvlAudioFile')?.files[0];
            if (audioFile) audioDirectUrl = await uploadFileToCloudflareR2(audioFile, 'audio');

            let video = existingLvl.video || '';
            const videoFile = document.getElementById('lvlVideoFile')?.files[0];
            if (videoFile) video = await uploadFileToCloudflareR2(videoFile, 'prevchart');

            let chartDirectUrl = existingLvl.chartDirectUrl || '';
            const zipFile = document.getElementById('lvlChartZipFile')?.files[0];
            if (zipFile) chartDirectUrl = await uploadFileToCloudflareR2(zipFile, 'charts_zip');

            let videoDeluxe = existingLvl.videoDeluxe || '';
            const videoDeluxeFile = document.getElementById('lvlVideoFileDeluxe')?.files[0];
            if (videoDeluxeFile) videoDeluxe = await uploadFileToCloudflareR2(videoDeluxeFile, 'prevchart');

            let chartDirectUrlDeluxe = existingLvl.chartDirectUrlDeluxe || '';
            const zipDeluxeFile = document.getElementById('lvlChartZipFileDeluxe')?.files[0];
            if (zipDeluxeFile) chartDirectUrlDeluxe = await uploadFileToCloudflareR2(zipDeluxeFile, 'charts_zip');

            let audioExplicit = existingLvl.audioExplicit || '';
            const audioExplicitFile = document.getElementById('lvlAudioFileExplicit')?.files[0];
            if (audioExplicitFile) audioExplicit = await uploadFileToCloudflareR2(audioExplicitFile, 'audio');

            let videoExplicit = existingLvl.videoExplicit || '';
            const videoExplicitFile = document.getElementById('lvlVideoFileExplicit')?.files[0];
            if (videoExplicitFile) videoExplicit = await uploadFileToCloudflareR2(videoExplicitFile, 'prevchart');

            let zipExplicit = existingLvl.zipExplicit || '';
            const zipExplicitFile = document.getElementById('lvlChartZipFileExplicit')?.files[0];
            if (zipExplicitFile) zipExplicit = await uploadFileToCloudflareR2(zipExplicitFile, 'charts_zip');

            let videoDeluxeExplicit = existingLvl.videoDeluxeExplicit || '';
            const videoDeluxeExplicitFile = document.getElementById('lvlVideoFileDeluxeExplicit')?.files[0];
            if (videoDeluxeExplicitFile) videoDeluxeExplicit = await uploadFileToCloudflareR2(videoDeluxeExplicitFile, 'prevchart');

            let zipDeluxeExplicit = existingLvl.zipDeluxeExplicit || '';
            const zipDeluxeExplicitFile = document.getElementById('lvlChartZipFileDeluxeExplicit')?.files[0];
            if (zipDeluxeExplicitFile) zipDeluxeExplicit = await uploadFileToCloudflareR2(zipDeluxeExplicitFile, 'charts_zip');

            const payload = {
                id,
                song,
                artist,
                genre,
                art,
                audioDirectUrl,
                editionMode,
                edition: editionMode === 'Deluxe' ? 'Deluxe' : 'Standard',
                isExclusive,
                hasExplicit,
                diff: document.getElementById('lvlDiff').value,
                notes: document.getElementById('lvlNotes').value,
                duration: document.getElementById('lvlDuration').value,
                date: pendingDeletes.dateStd ? "" : document.getElementById('lvlDate').value,
                dl1: document.getElementById('lvlDl1').value,
                dl2: document.getElementById('lvlDl2').value,
                dl3: document.getElementById('lvlDl3').value,
                video,
                chartDirectUrl,
                diffDeluxe: document.getElementById('lvlDiffDeluxe').value,
                notesDeluxe: document.getElementById('lvlNotesDeluxe').value,
                durationDeluxe: document.getElementById('lvlDurationDeluxe').value,
                dateDeluxe: pendingDeletes.dateDlx ? "" : document.getElementById('lvlDateDeluxe').value,
                dl1Deluxe: document.getElementById('lvlDl1Deluxe').value,
                dl2Deluxe: document.getElementById('lvlDl2Deluxe').value,
                dl3Deluxe: document.getElementById('lvlDl3Deluxe').value,
                videoDeluxe,
                chartDirectUrlDeluxe,
                audioExplicit,
                notesExplicit: document.getElementById('lvlNotesExplicit').value,
                durationExplicit: document.getElementById('lvlDurationExplicit').value,
                dateExplicit: pendingDeletes.dateExpStd ? "" : document.getElementById('lvlDateExplicit').value,
                dl1Explicit: document.getElementById('lvlDl1Explicit').value,
                dl2Explicit: document.getElementById('lvlDl2Explicit').value,
                dl3Explicit: document.getElementById('lvlDl3Explicit').value,
                videoExplicit,
                zipExplicit,
                notesDeluxeExplicit: document.getElementById('lvlNotesDeluxeExplicit').value,
                durationDeluxeExplicit: document.getElementById('lvlDurationDeluxeExplicit').value,
                dateDeluxeExplicit: pendingDeletes.dateExpDlx ? "" : document.getElementById('lvlDateDeluxeExplicit').value,
                dl1DeluxeExplicit: document.getElementById('lvlDl1DeluxeExplicit').value,
                dl2DeluxeExplicit: document.getElementById('lvlDl2DeluxeExplicit').value,
                dl3DeluxeExplicit: document.getElementById('lvlDl3DeluxeExplicit').value,
                videoDeluxeExplicit,
                zipDeluxeExplicit
            };

            await set(ref(db, 'levels/' + id), payload);

            // Registro automático de notificación
            const isNewRecord = !editingId;
            const zipAddedToExisting = !!editingId && !existingLvl.chartDirectUrl && !!chartDirectUrl;

            if (isNewRecord) {
                await createOrUpdateNotification('chart', {
                    type: 'new',
                    title: 'Nuevo Chart',
                    song: song,
                    artist: artist,
                    artOrIcon: art || 'free_song_Image.png',
                    genre: genre,
                    diff: document.getElementById('lvlDiff').value,
                    edition: editionMode
                });
            } else if (zipAddedToExisting) {
                await createOrUpdateNotification('chart', {
                    type: 'zip',
                    title: 'Chart Disponible',
                    song: song,
                    artist: artist,
                    artOrIcon: art || 'free_song_Image.png',
                    genre: genre,
                    diff: document.getElementById('lvlDiff').value,
                    edition: editionMode
                });
            }

            resetLevelFormState();
        } catch (err) {
            console.error("Error al registrar chart:", err);
            alert("Ocurrió un error al guardar el registro.");
        } finally {
            hideLoadingOverlay();
        }
    });

    document.getElementById('btn-cancel-lvl-form')?.addEventListener('click', () => {
        resetLevelFormState();
    });

    // Escuchadores dinámicos para visibilidad de Standard/Deluxe y Explicit
    document.getElementById('lvlEditionMode')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const sectionStandard = document.getElementById('section-standard-fields');
        const sectionDeluxe = document.getElementById('section-deluxe-fields');
        const subSectionExplicitDeluxe = document.getElementById('sub-section-explicit-deluxe');

        if (val === 'Deluxe') {
            sectionStandard?.classList.add('hidden');
            sectionDeluxe?.classList.remove('hidden');
            subSectionExplicitDeluxe?.classList.remove('hidden');
        } else if (val === 'Both') {
            sectionStandard?.classList.remove('hidden');
            sectionDeluxe?.classList.remove('hidden');
            subSectionExplicitDeluxe?.classList.remove('hidden');
        } else {
            sectionStandard?.classList.remove('hidden');
            sectionDeluxe?.classList.add('hidden');
            subSectionExplicitDeluxe?.classList.add('hidden');
        }
        validateFormStateAndCheckChanges();
    });

    document.getElementById('lvlHasExplicit')?.addEventListener('change', (e) => {
        const sectionExplicit = document.getElementById('section-explicit-fields');
        if (e.target.checked) sectionExplicit?.classList.remove('hidden');
        else sectionExplicit?.classList.add('hidden');
        validateFormStateAndCheckChanges();
    });

    // Añadir escuchador universal a las entradas para habilitar/deshabilitar el botón Submit
    document.getElementById('level-form')?.addEventListener('input', validateFormStateAndCheckChanges);
    document.getElementById('level-form')?.addEventListener('change', validateFormStateAndCheckChanges);

    return {
        buildGenresSelector,
        resetLevelFormState,
        renderLevelsTable,
        renderDifficultyTagMarkup,
        openBeatstarEditionSelectionModal,
        getPendingExplicitActivationChartId: () => pendingExplicitActivationChartId,
        setPendingExplicitActivationChartId: (val) => { pendingExplicitActivationChartId = val; },
        setLvlGenreFilter: (val) => { activeLvlGenreFilter = val; },
        setLvlDiffFilter: (val) => { activeLvlDiffFilter = val; },
        setLvlEditionFilter: (val) => { activeLvlEditionFilter = val; }
    };
}