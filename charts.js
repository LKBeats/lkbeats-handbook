import { ref, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";
import { toggleAudioPreviewEngine } from "./audio-player.js";
import { createOrUpdateNotification } from "./notifications-manager.js";

export function initChartsModule(context) {
    let lvlGenreFilter = "";
    let lvlDiffFilter = "";
    let lvlEditionFilter = "";
    let pendingExplicitActivationChartId = null;

    let pendingChartDeletes = {
        art: false,
        audio: false,
        video: false,
        zip: false,
        date: false,
        videoDeluxe: false,
        zipDeluxe: false,
        dateDeluxe: false,
        audioExplicit: false,
        videoExplicit: false,
        zipExplicit: false,
        dateExplicit: false,
        videoDeluxeExplicit: false,
        zipDeluxeExplicit: false,
        dateDeluxeExplicit: false
    };

    function setLvlGenreFilter(v) { lvlGenreFilter = v; }
    function setLvlDiffFilter(v) { lvlDiffFilter = v; }
    function setLvlEditionFilter(v) { lvlEditionFilter = v; }
    function getPendingExplicitActivationChartId() { return pendingExplicitActivationChartId; }
    function setPendingExplicitActivationChartId(id) { pendingExplicitActivationChartId = id; }

    function renderDifficultyTagMarkup(diffVal) {
        const globalVisualAssets = context.getGlobalVisualAssets();
        let color = '#71717a';
        let label = diffVal || 'Normal';

        if (diffVal === 'Hard') color = '#f97316';
        else if (diffVal === 'Extreme') color = '#ef4444';

        const dynamicAsset = globalVisualAssets[`diff_${diffVal}`];
        const graphicMarkup = dynamicAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAsset}'); mask-image: url('${dynamicAsset}');"></span>`
            : `<i class="fa-solid fa-layer-group text-[10px]"></i>`;

        return `
            <div class="inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
                ${graphicMarkup}
                <span>${label}</span>
            </div>
        `;
    }

    function renderEditionTagMarkup(editionVal) {
        const globalVisualAssets = context.getGlobalVisualAssets();
        const isDeluxe = editionVal === 'Deluxe';
        const color = isDeluxe ? '#facc15' : '#71717a';
        const label = editionVal || 'Standard';
        const glowClass = isDeluxe ? 'glow-gold' : '';

        const dynamicAsset = globalVisualAssets[`edit_${editionVal}`];
        const graphicMarkup = dynamicAsset
            ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAsset}'); mask-image: url('${dynamicAsset}');"></span>`
            : `<i class="fa-solid fa-star text-[10px]"></i>`;

        return `
            <div class="inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${glowClass}" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
                ${graphicMarkup}
                <span>${label}</span>
            </div>
        `;
    }

    function buildGenresSelector() {
        const container = document.getElementById('genres-container');
        if (!container) return;
        container.innerHTML = '';
        context.genreList.forEach(g => {
            const label = document.createElement('label');
            label.className = "flex items-center gap-2 p-1.5 hover:bg-zinc-900 rounded cursor-pointer text-zinc-300";
            label.innerHTML = `
                <input type="checkbox" name="lvlGenres" value="${g.label}" class="lvl-genre-checkbox accent-fuchsia-500">
                <span class="w-3 h-3 rounded-full inline-block shrink-0" style="background-color: ${g.color}"></span>
                <span class="font-bold text-xs text-zinc-200">${g.label}</span>
            `;
            label.querySelector('input').addEventListener('change', validateChartFormState);
            container.appendChild(label);
        });
    }

    function setupChartFileSlot(slotId, hasExisting, keyName, isDate = false) {
        const slot = document.getElementById(slotId);
        if (!slot) return;

        const lang = context.getCurrentLanguage();
        const defaultText = isDate ? translations[lang].btnDeleteDate : translations[lang].btnDeleteFile;
        const pendingText = isDate ? translations[lang].btnDateDeletePending : translations[lang].btnFileDeletePending;

        let inputEl = slot.querySelector('input');
        let deleteBtn = slot.querySelector('.btn-slot-delete');

        if (hasExisting && !pendingChartDeletes[keyName]) {
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
                pendingChartDeletes[keyName] = !pendingChartDeletes[keyName];
                if (pendingChartDeletes[keyName]) {
                    deleteBtn.innerText = pendingText;
                    deleteBtn.classList.add('glow-red');
                } else {
                    deleteBtn.innerText = defaultText;
                    deleteBtn.classList.remove('glow-red');
                }
                validateChartFormState();
            };
        } else {
            if (inputEl) inputEl.classList.remove('hidden');
            if (deleteBtn) deleteBtn.classList.add('hidden');
        }
    }

    function resetChartFormState() {
        const form = document.getElementById('level-form');
        if (form) form.reset();

        document.getElementById('editingLvlId').value = '';
        Object.keys(pendingChartDeletes).forEach(k => pendingChartDeletes[k] = false);

        const lang = context.getCurrentLanguage();
        const submitBtn = document.getElementById('lvlSubmitBtn');
        if (submitBtn) {
            const span = submitBtn.querySelector('span');
            if (span) span.innerText = translations[lang].btnRegister;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        document.getElementById('lvlArtPreviewBox')?.classList.add('hidden');
        document.querySelectorAll('.btn-slot-delete').forEach(b => b.remove());
        document.querySelectorAll('#level-form input[type="file"], #level-form input[type="date"]').forEach(inp => inp.classList.remove('hidden'));

        updateFormEditionSections();
        buildGenresSelector();
    }

    function updateFormEditionSections() {
        const editionMode = document.getElementById('lvlEditionMode')?.value || 'Standard';
        const hasExplicit = document.getElementById('lvlHasExplicit')?.checked || false;

        const secStd = document.getElementById('section-standard-fields');
        const secDlx = document.getElementById('section-deluxe-fields');
        const secExp = document.getElementById('section-explicit-fields');
        const subExpDlx = document.getElementById('sub-section-explicit-deluxe');

        if (editionMode === 'Deluxe') {
            secStd?.classList.add('hidden');
            secDlx?.classList.remove('hidden');
        } else if (editionMode === 'Both') {
            secStd?.classList.remove('hidden');
            secDlx?.classList.remove('hidden');
        } else {
            secStd?.classList.remove('hidden');
            secDlx?.classList.add('hidden');
        }

        if (hasExplicit) {
            secExp?.classList.remove('hidden');
            if (subExpDlx) {
                subExpDlx.classList.toggle('hidden', editionMode === 'Standard');
            }
        } else {
            secExp?.classList.add('hidden');
        }
    }

    function validateChartFormState() {
        const submitBtn = document.getElementById('lvlSubmitBtn');
        if (!submitBtn) return;

        const song = (document.getElementById('lvlSong')?.value || '').trim();
        const artist = (document.getElementById('lvlArtist')?.value || '').trim();
        const checkedGenres = document.querySelectorAll('.lvl-genre-checkbox:checked');

        const hasRequired = song !== "" && artist !== "" && checkedGenres.length > 0;

        if (hasRequired) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    function renderLevelsTable() {
        const tbody = document.getElementById('levels-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const currentLanguage = context.getCurrentLanguage();
        const isCreatorMode = context.getIsCreatorMode();
        const globalVisualAssets = context.getGlobalVisualAssets();
        const activeChartSelectedEditions = context.getActiveChartSelectedEditions();
        const activeChartExplicitStates = context.getActiveChartExplicitStates();

        const levels = context.getLevels();
        const counterEl = document.getElementById('lbl-counter-charts');

        const filtered = levels.filter(lvl => {
            let passGenre = true;
            if (lvlGenreFilter) {
                const genres = (lvl.genre || '').split(' / ');
                passGenre = genres.some(g => g.toLowerCase() === lvlGenreFilter.toLowerCase());
            }

            let passDiff = true;
            if (lvlDiffFilter) {
                const isBoth = (lvl.editionMode === 'Both' || lvl.hasBothEditions);
                if (isBoth) {
                    passDiff = (lvl.diff === lvlDiffFilter || lvl.diffDeluxe === lvlDiffFilter);
                } else {
                    passDiff = ((lvl.editionMode === 'Deluxe' ? lvl.diffDeluxe : lvl.diff) === lvlDiffFilter);
                }
            }

            let passEdition = true;
            if (lvlEditionFilter) {
                const isBoth = (lvl.editionMode === 'Both' || lvl.hasBothEditions);
                if (isBoth) {
                    passEdition = true;
                } else {
                    passEdition = ((lvl.editionMode || lvl.edition || 'Standard') === lvlEditionFilter);
                }
            }

            return passGenre && passDiff && passEdition;
        });

        if (counterEl) {
            const hasFilter = lvlGenreFilter || lvlDiffFilter || lvlEditionFilter;
            counterEl.innerText = hasFilter ? `Charts: ${filtered.length}` : `Total: ${levels.length} Charts`;
        }

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <img src="1455064703448645786.gif" alt="Boogie" class="w-28 h-auto">
                        <p class="text-sm font-extrabold text-zinc-300 font-sans tracking-wide">${translations[currentLanguage].noChartsBoogie}</p>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        filtered.forEach(lvl => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-fuchsia-950/20 transition border-b-2 border-fuchsia-900/50 shadow-sm";

            const isBoth = (lvl.editionMode === 'Both' || lvl.hasBothEditions);
            const isDeluxeSelected = (activeChartSelectedEditions[lvl.id] === 'Deluxe');
            const activeEdition = isBoth 
                ? (isDeluxeSelected ? 'Deluxe' : 'Standard') 
                : (lvl.editionMode || lvl.edition || 'Standard');
            const isDeluxeActive = (activeEdition === 'Deluxe');

            const isExpActive = !!activeChartExplicitStates[lvl.id];

            let activeDiff = isDeluxeActive ? (lvl.diffDeluxe || 'Extreme') : (lvl.diff || 'Normal');
            let activeNotes = isDeluxeActive 
                ? (isExpActive && lvl.notesDeluxeExplicit ? lvl.notesDeluxeExplicit : (lvl.notesDeluxe || ''))
                : (isExpActive && lvl.notesExplicit ? lvl.notesExplicit : (lvl.notes || ''));
            
            let activeDuration = isDeluxeActive 
                ? (isExpActive && lvl.durationDeluxeExplicit ? lvl.durationDeluxeExplicit : (lvl.durationDeluxe || ''))
                : (isExpActive && lvl.durationExplicit ? lvl.durationExplicit : (lvl.duration || ''));

            let activeDate = isDeluxeActive 
                ? (isExpActive && lvl.dateDeluxeExplicit ? lvl.dateDeluxeExplicit : (lvl.dateDeluxe || ''))
                : (isExpActive && lvl.dateExplicit ? lvl.dateExplicit : (lvl.date || ''));

            let activeVideo = isDeluxeActive
                ? (isExpActive && lvl.videoDeluxeExplicit ? lvl.videoDeluxeExplicit : (lvl.videoDeluxe || ''))
                : (isExpActive && lvl.videoExplicit ? lvl.videoExplicit : (lvl.video || ''));

            let activeAudio = (isExpActive && lvl.audioExplicit) ? lvl.audioExplicit : (lvl.audio || '');

            let activeZip = isDeluxeActive
                ? (isExpActive && lvl.zipDeluxeExplicit ? lvl.zipDeluxeExplicit : (lvl.zipDeluxe || ''))
                : (isExpActive && lvl.zipExplicit ? lvl.zipExplicit : (lvl.zip || ''));

            let activeDl1 = isDeluxeActive ? (lvl.dl1Deluxe || '') : (lvl.dl1 || '');
            let activeDl2 = isDeluxeActive ? (lvl.dl2Deluxe || '') : (lvl.dl2 || '');
            let activeDl3 = isDeluxeActive ? (lvl.dl3Deluxe || '') : (lvl.dl3 || '');

            const currentAudio = context.getActiveAudioElement();
            const isPlayingThis = (currentAudio && currentAudio.dataset.url === activeAudio && !currentAudio.paused);
            const playIconClass = isPlayingThis ? 'fa-stop' : 'fa-play';
            const circularBorderClass = isPlayingThis ? 'art-circle-shape' : '';
            const artThemeBorder = isDeluxeActive ? 'border-edition-deluxe' : 'border-edition-standard';

            const genresMarkup = (lvl.genre || '').split(' / ').map(g => {
                const trimmed = g.trim();
                const matched = context.genreList.find(item => item.label.toLowerCase() === trimmed.toLowerCase());
                const color = matched ? matched.color : '#f97316';
                const safeKey = trimmed.replace('/', '');
                const dynamicAssetSrc = globalVisualAssets[`genre_${safeKey}`] || globalVisualAssets[`genre_${trimmed}`];
                
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

            const exclusiveBadge = lvl.isExclusive ? `
                <div class="mt-1 text-[10px] font-black text-orange-400 uppercase tracking-wider flex items-center gap-1 bg-orange-950/40 border border-orange-800/40 px-2 py-0.5 rounded-md w-max">
                    <i class="fa-solid fa-star text-orange-400"></i> ${translations[currentLanguage].chartExclusiveLabel}
                </div>
            ` : '';

            const explicitBadge = lvl.hasExplicit ? `
                <button class="btn-toggle-explicit text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 shadow transition ${isExpActive ? 'bg-red-600 text-black glow-red' : 'bg-red-950/60 border border-red-800/60 text-red-400'}" data-id="${lvl.id}">
                    <span class="w-3.5 h-3.5 bg-red-600 text-white rounded flex items-center justify-center text-[8px] font-black">E</span>
                    <span>${isExpActive ? 'Explicit ON' : 'Explicit OFF'}</span>
                </button>
            ` : '';

            const editionSelectorBtn = isBoth ? `
                <button class="btn-open-edition-modal px-2 py-0.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/50 hover:bg-fuchsia-900 text-fuchsia-300 text-[10px] font-black uppercase transition flex items-center gap-1 shadow" data-id="${lvl.id}">
                    <i class="fa-solid fa-sliders text-xs"></i> <span>Edición</span>
                </button>
            ` : '';

            const previewMarkup = context.renderVideoPlayerMarkup(activeVideo, false);

            const hasAnyLinks = activeZip || activeDl1 || activeDl2 || activeDl3;
            let linksLayout = `<div class="flex flex-col gap-1 sm:gap-1.5 max-w-[150px] sm:max-w-[200px] mx-auto">`;
            if (hasAnyLinks) {
                if (activeZip) {
                    linksLayout += `<button class="btn-direct-chart-download bg-gradient-to-r from-emerald-500 to-teal-500 text-black px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1.5 shadow" data-zip="${activeZip}"><i class="fa-solid fa-circle-down"></i>${translations[currentLanguage].downloadDirectBtn}</button>`;
                }
                if (activeDl1) linksLayout += `<a href="${activeDl1}" target="_blank" class="bg-zinc-900 px-2 sm:px-3 py-1 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1.5 hover:border-fuchsia-500/40 transition"><img src="Discord_Logo.png" class="w-3 h-3 force-white-icon">Discord</a>`;
                if (activeDl2) linksLayout += `<a href="${activeDl2}" target="_blank" class="bg-zinc-900 px-2 sm:px-3 py-1 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1.5 hover:border-fuchsia-500/40 transition"><img src="BSCM_Logo.png" class="w-3 h-3 force-white-icon">BSCM</a>`;
                if (activeDl3) linksLayout += `<a href="${activeDl3}" target="_blank" class="bg-zinc-900 px-2 sm:px-3 py-1 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1.5 hover:border-fuchsia-500/40 transition"><img src="beatcharts_Logo.png" class="w-3 h-3 force-white-icon">beatcharts</a>`;
            } else {
                linksLayout += `<span class="text-[9px] sm:text-[10px] font-extrabold text-zinc-500 text-center block px-1.5 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg sm:rounded-xl">${translations[currentLanguage].noDownloadsAvailable}</span>`;
            }
            linksLayout += `</div>`;

            tr.innerHTML = `
                <td class="p-2 sm:p-4 text-center align-middle">
                    <div class="relative w-20 h-20 sm:w-28 sm:h-28 mx-auto flex items-center justify-center">
                        <canvas class="audio-radial-canvas absolute -inset-2 w-[calc(100%+1rem)] h-[calc(100%+1rem)] pointer-events-none z-0"></canvas>
                        <div class="target-art-outer-container w-full h-full rounded-2xl overflow-hidden border-2 bg-zinc-950 art-beatstar-transform ${artThemeBorder} ${circularBorderClass} relative z-10 flex items-center justify-center">
                            <img src="${lvl.art || 'free_song_Image.png'}" class="w-full h-full object-cover rounded-xl" onerror="this.src='free_song_Image.png'">
                            ${activeAudio ? `
                                <button class="btn-play-chart-audio absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition rounded-xl z-20" data-audio="${activeAudio}">
                                    <i class="fa-solid ${playIconClass} text-xs sm:text-sm"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </td>
                <td class="p-2 sm:p-4 min-w-[200px] sm:min-w-[320px] flex-1 align-middle">
                    <ul class="space-y-1.5 list-none text-zinc-300 whitespace-normal break-words text-xs">
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formSong}:</span> 
                            <div class="inline-block flex-1">
                                <h4 class="text-white font-black tracking-wide text-base sm:text-lg inline-block">${lvl.song}</h4>
                                ${exclusiveBadge}
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formArtist}:</span> 
                            <span class="text-zinc-200 font-bold inline-block">${lvl.artist}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formRelease}:</span> 
                            <span class="font-sans font-bold text-zinc-400 text-xs">${context.formatStringToDMY(activeDate)}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formGenre}:</span> 
                            <div class="inline-flex flex-wrap gap-1">${genresMarkup}</div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formDifficulty}:</span> 
                            <div class="inline-flex items-center gap-2 flex-wrap">
                                ${renderDifficultyTagMarkup(activeDiff)}
                                ${activeNotes ? `<span class="text-zinc-400 font-bold text-[10px]">(${activeNotes} ${translations[currentLanguage].formNotes.toLowerCase()})</span>` : ''}
                                ${activeDuration ? `<span class="text-zinc-500 font-bold text-[10px]">${activeDuration}</span>` : ''}
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[currentLanguage].formEdition}:</span> 
                            <div class="inline-flex items-center gap-2 flex-wrap">
                                ${renderEditionTagMarkup(activeEdition)}
                                ${editionSelectorBtn}
                                ${explicitBadge}
                            </div>
                        </li>
                    </ul>
                </td>
                <td class="p-2 sm:p-4 text-center align-middle">${previewMarkup}</td>
                <td class="p-2 sm:p-4 align-middle">${linksLayout}</td>
                <td class="p-2 sm:p-4 text-center align-middle ${isCreatorMode ? '' : 'hidden'}">
                    <div class="flex flex-col gap-1">
                        <button class="btn-edit-chart bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow" data-id="${lvl.id}">${translations[currentLanguage].btnEdit}</button>
                        <button class="btn-delete-chart bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow" data-id="${lvl.id}">${translations[currentLanguage].btnDelete}</button>
                    </div>
                </td>
            `;

            context.setupNativeVideoBehavior(tr.querySelector('.custom-native-video-wrapper'));
            tbody.appendChild(tr);
        });

        attachLevelsTableEvents();
    }

    function attachLevelsTableEvents() {
        document.querySelectorAll('.btn-play-chart-audio').forEach(btn => {
            btn.addEventListener('click', () => {
                const audioUrl = btn.getAttribute('data-audio');
                const container = btn.closest('.target-art-outer-container');
                const wrapper = btn.closest('.relative');
                const img = container?.querySelector('img');
                const canvas = wrapper?.querySelector('.audio-radial-canvas');
                toggleAudioPreviewEngine(audioUrl, btn, img, canvas, container, false);
            });
        });

        document.querySelectorAll('.btn-direct-chart-download').forEach(btn => {
            btn.addEventListener('click', () => {
                const zipUrl = btn.getAttribute('data-zip');
                if (zipUrl) context.triggerDownloadAlert(zipUrl);
            });
        });

        document.querySelectorAll('.btn-open-edition-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                const matched = context.getLevels().find(l => l.id === chartId);
                if (matched) context.openBeatstarEditionSelectionModal(matched);
            });
        });

        document.querySelectorAll('.btn-toggle-explicit').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                const explicitStates = context.getActiveChartExplicitStates();
                if (explicitStates[chartId]) {
                    explicitStates[chartId] = false;
                    renderLevelsTable();
                } else {
                    pendingExplicitActivationChartId = chartId;
                    document.getElementById('explicit-warning-modal')?.classList.remove('hidden');
                }
            });
        });

        document.querySelectorAll('.btn-edit-chart').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                const matched = context.getLevels().find(l => l.id === chartId);
                if (matched) loadChartIntoForm(matched);
            });
        });

        document.querySelectorAll('.btn-delete-chart').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                const matched = context.getLevels().find(l => l.id === chartId);
                if (matched) {
                    context.requestUserDeleteConfirmation(async () => {
                        context.showLoadingOverlay();
                        try {
                            const files = [
                                matched.art, matched.audio, matched.video, matched.zip,
                                matched.videoDeluxe, matched.zipDeluxe,
                                matched.audioExplicit, matched.videoExplicit, matched.zipExplicit,
                                matched.videoDeluxeExplicit, matched.zipDeluxeExplicit
                            ].filter(u => u && u.trim() !== "" && u !== "free_song_Image.png");

                            if (files.length > 0) {
                                await Promise.all(files.map(u => deleteFileFromCloudflareR2(u)));
                            }
                            await remove(ref(db, `levels/${chartId}`));
                            await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]);
                            resetChartFormState();
                        } catch (err) {
                            console.error(err);
                        } finally {
                            context.hideLoadingOverlay();
                        }
                    });
                }
            });
        });
    }

    function loadChartIntoForm(lvl) {
        resetChartFormState();

        document.getElementById('editingLvlId').value = lvl.id || '';
        document.getElementById('lvlSong').value = lvl.song || '';
        document.getElementById('lvlArtist').value = lvl.artist || '';
        document.getElementById('lvlEditionMode').value = lvl.editionMode || (lvl.hasBothEditions ? 'Both' : (lvl.edition || 'Standard'));
        document.getElementById('lvlIsExclusive').checked = !!lvl.isExclusive;
        document.getElementById('lvlHasExplicit').checked = !!lvl.hasExplicit;

        // Standard
        document.getElementById('lvlDiff').value = lvl.diff || 'Normal';
        document.getElementById('lvlNotes').value = lvl.notes || '';
        document.getElementById('lvlDuration').value = lvl.duration || '';
        document.getElementById('lvlDate').value = lvl.date || '';
        document.getElementById('lvlDl1').value = lvl.dl1 || '';
        document.getElementById('lvlDl2').value = lvl.dl2 || '';
        document.getElementById('lvlDl3').value = lvl.dl3 || '';

        // Deluxe
        document.getElementById('lvlDiffDeluxe').value = lvl.diffDeluxe || 'Extreme';
        document.getElementById('lvlNotesDeluxe').value = lvl.notesDeluxe || '';
        document.getElementById('lvlDurationDeluxe').value = lvl.durationDeluxe || '';
        document.getElementById('lvlDateDeluxe').value = lvl.dateDeluxe || '';
        document.getElementById('lvlDl1Deluxe').value = lvl.dl1Deluxe || '';
        document.getElementById('lvlDl2Deluxe').value = lvl.dl2Deluxe || '';
        document.getElementById('lvlDl3Deluxe').value = lvl.dl3Deluxe || '';

        // Explicit Standard
        document.getElementById('lvlNotesExplicit').value = lvl.notesExplicit || '';
        document.getElementById('lvlDurationExplicit').value = lvl.durationExplicit || '';
        document.getElementById('lvlDateExplicit').value = lvl.dateExplicit || '';
        document.getElementById('lvlDl1Explicit').value = lvl.dl1Explicit || '';
        document.getElementById('lvlDl2Explicit').value = lvl.dl2Explicit || '';
        document.getElementById('lvlDl3Explicit').value = lvl.dl3Explicit || '';

        // Explicit Deluxe
        document.getElementById('lvlNotesDeluxeExplicit').value = lvl.notesDeluxeExplicit || '';
        document.getElementById('lvlDurationDeluxeExplicit').value = lvl.durationDeluxeExplicit || '';
        document.getElementById('lvlDateDeluxeExplicit').value = lvl.dateDeluxeExplicit || '';
        document.getElementById('lvlDl1DeluxeExplicit').value = lvl.dl1DeluxeExplicit || '';
        document.getElementById('lvlDl2DeluxeExplicit').value = lvl.dl2DeluxeExplicit || '';
        document.getElementById('lvlDl3DeluxeExplicit').value = lvl.dl3DeluxeExplicit || '';

        // Slots con botón de borrar archivo existente
        setupChartFileSlot('slot-lvl-art', !!lvl.art && lvl.art !== 'free_song_Image.png', 'art');
        setupChartFileSlot('slot-lvl-audio', !!lvl.audio, 'audio');
        setupChartFileSlot('slot-lvl-video-std', !!lvl.video, 'video');
        setupChartFileSlot('slot-lvl-zip-std', !!lvl.zip, 'zip');
        setupChartFileSlot('slot-lvl-date-std', !!lvl.date, 'date', true);

        setupChartFileSlot('slot-lvl-video-dlx', !!lvl.videoDeluxe, 'videoDeluxe');
        setupChartFileSlot('slot-lvl-zip-dlx', !!lvl.zipDeluxe, 'zipDeluxe');
        setupChartFileSlot('slot-lvl-date-dlx', !!lvl.dateDeluxe, 'dateDeluxe', true);

        setupChartFileSlot('slot-lvl-audio-exp', !!lvl.audioExplicit, 'audioExplicit');
        setupChartFileSlot('slot-lvl-video-exp-std', !!lvl.videoExplicit, 'videoExplicit');
        setupChartFileSlot('slot-lvl-zip-exp-std', !!lvl.zipExplicit, 'zipExplicit');
        setupChartFileSlot('slot-lvl-date-exp-std', !!lvl.dateExplicit, 'dateExplicit', true);

        setupChartFileSlot('slot-lvl-video-exp-dlx', !!lvl.videoDeluxeExplicit, 'videoDeluxeExplicit');
        setupChartFileSlot('slot-lvl-zip-exp-dlx', !!lvl.zipDeluxeExplicit, 'zipDeluxeExplicit');
        setupChartFileSlot('slot-lvl-date-exp-dlx', !!lvl.dateDeluxeExplicit, 'dateDeluxeExplicit', true);

        // Previsualización de Arte
        const pBox = document.getElementById('lvlArtPreviewBox');
        const pImg = document.getElementById('lvlArtPreviewImg');
        if (lvl.art) {
            pImg.src = lvl.art;
            pBox.classList.remove('hidden');
        } else {
            pBox.classList.add('hidden');
        }

        // Géneros
        const currentGenres = (lvl.genre || '').split(' / ').map(g => g.trim().toLowerCase());
        document.querySelectorAll('.lvl-genre-checkbox').forEach(cb => {
            cb.checked = currentGenres.includes(cb.value.trim().toLowerCase());
        });

        const lang = context.getCurrentLanguage();
        const submitBtn = document.getElementById('lvlSubmitBtn');
        if (submitBtn) {
            const span = submitBtn.querySelector('span');
            if (span) span.innerText = translations[lang].btnSaveChanges;
        }

        updateFormEditionSections();
        validateChartFormState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Listeners del Formulario
    document.getElementById('lvlEditionMode')?.addEventListener('change', () => {
        updateFormEditionSections();
        validateChartFormState();
    });

    document.getElementById('lvlHasExplicit')?.addEventListener('change', () => {
        updateFormEditionSections();
        validateChartFormState();
    });

    document.getElementById('btn-cancel-lvl-form')?.addEventListener('click', resetChartFormState);

    document.getElementById('level-form')?.addEventListener('input', validateChartFormState);
    document.getElementById('level-form')?.addEventListener('change', validateChartFormState);

    document.getElementById('level-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        context.showLoadingOverlay();

        try {
            const id = document.getElementById('editingLvlId').value.trim() || Date.now().toString();
            const existingLevel = context.getLevels().find(l => l.id === id) || {};

            // Eliminación de archivos marcados
            if (pendingChartDeletes.art && existingLevel.art) { await deleteFileFromCloudflareR2(existingLevel.art); existingLevel.art = "free_song_Image.png"; }
            if (pendingChartDeletes.audio && existingLevel.audio) { await deleteFileFromCloudflareR2(existingLevel.audio); existingLevel.audio = ""; }
            if (pendingChartDeletes.video && existingLevel.video) { await deleteFileFromCloudflareR2(existingLevel.video); existingLevel.video = ""; }
            if (pendingChartDeletes.zip && existingLevel.zip) { await deleteFileFromCloudflareR2(existingLevel.zip); existingLevel.zip = ""; }
            if (pendingChartDeletes.videoDeluxe && existingLevel.videoDeluxe) { await deleteFileFromCloudflareR2(existingLevel.videoDeluxe); existingLevel.videoDeluxe = ""; }
            if (pendingChartDeletes.zipDeluxe && existingLevel.zipDeluxe) { await deleteFileFromCloudflareR2(existingLevel.zipDeluxe); existingLevel.zipDeluxe = ""; }

            if (pendingChartDeletes.audioExplicit && existingLevel.audioExplicit) { await deleteFileFromCloudflareR2(existingLevel.audioExplicit); existingLevel.audioExplicit = ""; }
            if (pendingChartDeletes.videoExplicit && existingLevel.videoExplicit) { await deleteFileFromCloudflareR2(existingLevel.videoExplicit); existingLevel.videoExplicit = ""; }
            if (pendingChartDeletes.zipExplicit && existingLevel.zipExplicit) { await deleteFileFromCloudflareR2(existingLevel.zipExplicit); existingLevel.zipExplicit = ""; }
            if (pendingChartDeletes.videoDeluxeExplicit && existingLevel.videoDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLevel.videoDeluxeExplicit); existingLevel.videoDeluxeExplicit = ""; }
            if (pendingChartDeletes.zipDeluxeExplicit && existingLevel.zipDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLevel.zipDeluxeExplicit); existingLevel.zipDeluxeExplicit = ""; }

            // Subida de archivos nuevos
            let artUrl = existingLevel.art || "free_song_Image.png";
            let audioUrl = existingLevel.audio || "";
            let videoUrl = existingLevel.video || "";
            let zipUrl = existingLevel.zip || "";
            let videoDeluxeUrl = existingLevel.videoDeluxe || "";
            let zipDeluxeUrl = existingLevel.zipDeluxe || "";

            let audioExpUrl = existingLevel.audioExplicit || "";
            let videoExpUrl = existingLevel.videoExplicit || "";
            let zipExpUrl = existingLevel.zipExplicit || "";
            let videoDeluxeExpUrl = existingLevel.videoDeluxeExplicit || "";
            let zipDeluxeExpUrl = existingLevel.zipDeluxeExplicit || "";

            const artInput = document.getElementById('lvlArtFile');
            if (artInput?.files?.[0]) artUrl = await uploadFileToCloudflareR2(artInput.files[0], 'charts_art');

            const audioInput = document.getElementById('lvlAudioFile');
            if (audioInput?.files?.[0]) audioUrl = await uploadFileToCloudflareR2(audioInput.files[0], 'charts_audio');

            const videoInput = document.getElementById('lvlVideoFile');
            if (videoInput?.files?.[0]) videoUrl = await uploadFileToCloudflareR2(videoInput.files[0], 'prevcharts');

            const zipInput = document.getElementById('lvlChartZipFile');
            if (zipInput?.files?.[0]) zipUrl = await uploadFileToCloudflareR2(zipInput.files[0], 'charts_zips');

            const videoDlxInput = document.getElementById('lvlVideoFileDeluxe');
            if (videoDlxInput?.files?.[0]) videoDeluxeUrl = await uploadFileToCloudflareR2(videoDlxInput.files[0], 'prevcharts');

            const zipDlxInput = document.getElementById('lvlChartZipFileDeluxe');
            if (zipDlxInput?.files?.[0]) zipDeluxeUrl = await uploadFileToCloudflareR2(zipDlxInput.files[0], 'charts_zips');

            const audioExpInput = document.getElementById('lvlAudioFileExplicit');
            if (audioExpInput?.files?.[0]) audioExpUrl = await uploadFileToCloudflareR2(audioExpInput.files[0], 'charts_audio');

            const videoExpInput = document.getElementById('lvlVideoFileExplicit');
            if (videoExpInput?.files?.[0]) videoExpUrl = await uploadFileToCloudflareR2(videoExpInput.files[0], 'prevcharts');

            const zipExpInput = document.getElementById('lvlChartZipFileExplicit');
            if (zipExpInput?.files?.[0]) zipExpUrl = await uploadFileToCloudflareR2(zipExpInput.files[0], 'charts_zips');

            const videoDlxExpInput = document.getElementById('lvlVideoFileDeluxeExplicit');
            if (videoDlxExpInput?.files?.[0]) videoDeluxeExpUrl = await uploadFileToCloudflareR2(videoDlxExpInput.files[0], 'prevcharts');

            const zipDlxExpInput = document.getElementById('lvlChartZipFileDeluxeExplicit');
            if (zipDlxExpInput?.files?.[0]) zipDeluxeExpUrl = await uploadFileToCloudflareR2(zipDlxExpInput.files[0], 'charts_zips');

            const selectedGenres = Array.from(document.querySelectorAll('.lvl-genre-checkbox:checked'))
                .map(cb => cb.value)
                .join(' / ');

            const editionMode = document.getElementById('lvlEditionMode').value;
            const isBoth = (editionMode === 'Both');

            const payload = {
                id,
                song: (document.getElementById('lvlSong')?.value || '').trim(),
                artist: (document.getElementById('lvlArtist')?.value || '').trim(),
                genre: selectedGenres,
                editionMode,
                hasBothEditions: isBoth,
                edition: isBoth ? 'Both' : editionMode,
                isExclusive: document.getElementById('lvlIsExclusive')?.checked || false,
                hasExplicit: document.getElementById('lvlHasExplicit')?.checked || false,
                art: artUrl,
                audio: audioUrl,
                // Standard
                diff: document.getElementById('lvlDiff')?.value || 'Normal',
                notes: (document.getElementById('lvlNotes')?.value || '').trim(),
                duration: (document.getElementById('lvlDuration')?.value || '').trim(),
                date: pendingChartDeletes.date ? '' : (document.getElementById('lvlDate')?.value || ''),
                video: videoUrl,
                zip: zipUrl,
                dl1: (document.getElementById('lvlDl1')?.value || '').trim(),
                dl2: (document.getElementById('lvlDl2')?.value || '').trim(),
                dl3: (document.getElementById('lvlDl3')?.value || '').trim(),
                // Deluxe
                diffDeluxe: document.getElementById('lvlDiffDeluxe')?.value || 'Extreme',
                notesDeluxe: (document.getElementById('lvlNotesDeluxe')?.value || '').trim(),
                durationDeluxe: (document.getElementById('lvlDurationDeluxe')?.value || '').trim(),
                dateDeluxe: pendingChartDeletes.dateDeluxe ? '' : (document.getElementById('lvlDateDeluxe')?.value || ''),
                videoDeluxe: videoDeluxeUrl,
                zipDeluxe: zipDeluxeUrl,
                dl1Deluxe: (document.getElementById('lvlDl1Deluxe')?.value || '').trim(),
                dl2Deluxe: (document.getElementById('lvlDl2Deluxe')?.value || '').trim(),
                dl3Deluxe: (document.getElementById('lvlDl3Deluxe')?.value || '').trim(),
                // Explicit Standard
                audioExplicit: audioExpUrl,
                notesExplicit: (document.getElementById('lvlNotesExplicit')?.value || '').trim(),
                durationExplicit: (document.getElementById('lvlDurationExplicit')?.value || '').trim(),
                dateExplicit: pendingChartDeletes.dateExplicit ? '' : (document.getElementById('lvlDateExplicit')?.value || ''),
                videoExplicit: videoExpUrl,
                zipExplicit: zipExpUrl,
                dl1Explicit: (document.getElementById('lvlDl1Explicit')?.value || '').trim(),
                dl2Explicit: (document.getElementById('lvlDl2Explicit')?.value || '').trim(),
                dl3Explicit: (document.getElementById('lvlDl3Explicit')?.value || '').trim(),
                // Explicit Deluxe
                notesDeluxeExplicit: (document.getElementById('lvlNotesDeluxeExplicit')?.value || '').trim(),
                durationDeluxeExplicit: (document.getElementById('lvlDurationDeluxeExplicit')?.value || '').trim(),
                dateDeluxeExplicit: pendingChartDeletes.dateDeluxeExplicit ? '' : (document.getElementById('lvlDateDeluxeExplicit')?.value || ''),
                videoDeluxeExplicit: videoDeluxeExpUrl,
                zipDeluxeExplicit: zipDeluxeExpUrl,
                dl1DeluxeExplicit: (document.getElementById('lvlDl1DeluxeExplicit')?.value || '').trim(),
                dl2DeluxeExplicit: (document.getElementById('lvlDl2DeluxeExplicit')?.value || '').trim(),
                dl3DeluxeExplicit: (document.getElementById('lvlDl3DeluxeExplicit')?.value || '').trim()
            };

            await set(ref(db, `levels/${id}`), payload);
            await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]);

            const isNewChart = !document.getElementById('editingLvlId').value.trim();
            const zipAddedToExisting = !isNewChart && (!existingLevel.zip && !existingLevel.zipDeluxe) && (zipUrl || zipDeluxeUrl);

            if (isNewChart || zipAddedToExisting) {
                await createOrUpdateNotification('chart', {
                    type: isNewChart ? 'new' : 'available',
                    artOrIcon: artUrl,
                    song: payload.song,
                    artist: payload.artist,
                    genre: selectedGenres,
                    diff: payload.diff,
                    diffDeluxe: payload.diffDeluxe,
                    edition: payload.editionMode
                });
            }

            resetChartFormState();
        } catch (err) {
            console.error("Error al guardar el chart:", err);
            alert("Ocurrió un error al guardar el chart.");
        } finally {
            context.hideLoadingOverlay();
        }
    });

    return {
        setLvlGenreFilter,
        setLvlDiffFilter,
        setLvlEditionFilter,
        getPendingExplicitActivationChartId,
        setPendingExplicitActivationChartId,
        renderDifficultyTagMarkup,
        renderEditionTagMarkup,
        buildGenresSelector,
        renderLevelsTable
    };
}