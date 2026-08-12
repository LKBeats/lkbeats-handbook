import { ref, set, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";
import { toggleAudioPreviewEngine } from "./audio-player.js";
import { 
    createOrUpdateNotification, 
    checkAndDeleteNotifOnRecordDelete, 
    checkAndDeleteNotifOnZipDelete 
} from "./notifications-manager.js";

export function initChartsModule(context) {
    let lvlGenreFilter = "";
    let lvlDiffFilter = "";
    let lvlEditionFilter = "";
    let pendingExplicitActivationChartId = null;

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
            <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2 sm:py-0.5 rounded border text-[10px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
                ${graphicMarkup}
                <span class="hidden sm:inline">${label}</span>
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
            <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2 sm:py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${glowClass}" style="color:${color}; border-color:${color}50; background:${color}15" title="${label}">
                ${graphicMarkup}
                <span class="hidden sm:inline">${label}</span>
            </div>
        `;
    }

    function buildGenresSelector() {
        const container = document.getElementById('genres-container');
        if (!container) return;
        container.innerHTML = '';
        context.genreList.forEach(g => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'genre-pill-btn px-3 py-1 rounded-full text-xs font-black transition border border-zinc-700 bg-zinc-900 text-zinc-400 select-none m-0.5';
            btn.innerText = g.label;
            btn.style.color = g.color;
            btn.dataset.genre = g.label;
            btn.dataset.color = g.color;

            btn.addEventListener('click', () => {
                const isSelected = btn.classList.contains('active-genre-pill');
                const selectedPills = container.querySelectorAll('.active-genre-pill');

                if (isSelected) {
                    btn.classList.remove('active-genre-pill');
                    btn.style.backgroundColor = '#18181b';
                    btn.style.borderColor = '#3f3f46';
                } else {
                    if (selectedPills.length >= 2) return;
                    btn.classList.add('active-genre-pill');
                    btn.style.backgroundColor = `${g.color}30`;
                    btn.style.borderColor = g.color;
                }
            });
            container.appendChild(btn);
        });
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
        const allLevels = context.getLevels();

        const filtered = allLevels.filter(lvl => {
            let passGenre = true;
            if (lvlGenreFilter) {
                const genres = (lvl.genre || '').split(' / ');
                passGenre = genres.includes(lvlGenreFilter);
            }

            let passDiff = true;
            if (lvlDiffFilter) {
                if (lvl.hasBothEditions) {
                    passDiff = (lvl.diff === lvlDiffFilter || lvl.diffDeluxe === lvlDiffFilter);
                } else {
                    passDiff = (lvl.diff === lvlDiffFilter);
                }
            }

            let passEdition = true;
            if (lvlEditionFilter) {
                if (lvl.hasBothEditions) {
                    passEdition = true;
                } else {
                    passEdition = ((lvl.edition || 'Standard') === lvlEditionFilter);
                }
            }

            return passGenre && passDiff && passEdition;
        });

        const counterEl = document.getElementById('lbl-counter-charts');
        if (counterEl) {
            const hasFilter = !!(lvlGenreFilter || lvlDiffFilter || lvlEditionFilter);
            counterEl.innerText = hasFilter ? `Charts: ${filtered.length}` : `Total: ${allLevels.length} Charts`;
        }

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <img src="1455064703448645786.gif" alt="Boogie" class="w-28 h-auto">
                        <p class="text-sm font-extrabold text-zinc-300 font-sans tracking-wide">${translations[currentLanguage].noChartsBoogie || "No hay charts registrados."}</p>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        filtered.forEach(lvl => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-fuchsia-950/20 hover:bg-white/[0.02] transition';

            const isDeluxeSelected = (activeChartSelectedEditions[lvl.id] === 'Deluxe');
            const activeEdition = lvl.hasBothEditions 
                ? (isDeluxeSelected ? 'Deluxe' : 'Standard')
                : (lvl.edition || 'Standard');

            const activeDiff = (lvl.hasBothEditions && isDeluxeSelected) 
                ? (lvl.diffDeluxe || 'Extreme') 
                : (lvl.diff || 'Normal');

            const hasActiveZip = (lvl.hasBothEditions && isDeluxeSelected)
                ? (lvl.zipDeluxe && lvl.zipDeluxe.trim() !== "")
                : (lvl.zip && lvl.zip.trim() !== "");

            let downloadButtonMarkup = '';
            if (hasActiveZip) {
                const targetZipUrl = (lvl.hasBothEditions && isDeluxeSelected) ? lvl.zipDeluxe : lvl.zip;
                downloadButtonMarkup = `
                    <button class="btn-download-chart w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-fuchsia-950/40 border border-fuchsia-700/40 text-fuchsia-400 hover:bg-fuchsia-900 hover:text-white flex items-center justify-center transition shadow" data-zip="${targetZipUrl}">
                        <i class="fa-solid fa-download text-xs"></i>
                    </button>
                `;
            } else {
                downloadButtonMarkup = `
                    <div class="px-2 py-1 rounded bg-zinc-900/60 border border-zinc-800 text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                        ${translations[currentLanguage].textComingSoon}
                    </div>
                `;
            }

            let songDisplayTitle = lvl.song || '';
            let explicitWarningBtnMarkup = '';
            if (lvl.isExplicit) {
                if (!activeChartExplicitStates[lvl.id]) {
                    songDisplayTitle = (currentLanguage === 'en') ? '[Explicit Warning]' : '[Aviso Explícito]';
                    explicitWarningBtnMarkup = `
                        <button class="btn-trigger-explicit-warning text-xs text-amber-400 hover:text-amber-300 ml-1.5" data-id="${lvl.id}" title="Explicit Chart">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </button>
                    `;
                }
            }

            const activeAudio = context.getActiveAudioElement();
            const isPlayingThis = (activeAudio && activeAudio.dataset.url === (lvl.audio || '') && !activeAudio.paused);
            const playIconClass = isPlayingThis ? 'fa-stop' : 'fa-play';
            const circularBorderClass = isPlayingThis ? 'art-circle-shape' : '';

            const artThemeBorder = (lvl.hasBothEditions && isDeluxeSelected) ? 'border-edition-deluxe' : 'border-edition-standard';

            const genresMarkup = (lvl.genre || '').split(' / ').map(g => {
                const trimmed = g.trim();
                const matched = context.genreList.find(item => item.label.toLowerCase() === trimmed.toLowerCase());
                const color = matched ? matched.color : '#f97316';
                const safeKey = trimmed.replace('/', '');
                const dynamicAssetSrc = globalVisualAssets[`genre_${safeKey}`] || globalVisualAssets[`genre_${trimmed}`];
                
                const graphicElement = dynamicAssetSrc 
                    ? `<span class="dynamic-color-mask w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" style="color: ${color}; -webkit-mask-image: url('${dynamicAssetSrc}'); mask-image: url('${dynamicAssetSrc}');"></span>`
                    : `<span class="w-2.5 h-2.5 sm:w-2.5 sm:h-2.5 rounded-full inline-block shrink-0" style="background-color: ${color}"></span>`;

                return `
                    <div class="inline-flex items-center justify-center gap-1.5 p-1 sm:px-2 sm:py-0.5 rounded border text-[10px] font-black uppercase tracking-wider" style="color:${color}; border-color:${color}50; background:${color}15" title="${trimmed}">
                        ${graphicElement}
                        <span class="hidden sm:inline">${trimmed}</span>
                    </div>
                `;
            }).join(' ');

            let creatorActionsMarkup = '';
            if (isCreatorMode) {
                creatorActionsMarkup = `
                    <td class="p-2 sm:p-3 text-right creator-action-header">
                        <div class="flex items-center justify-end gap-1.5">
                            <button class="btn-edit-chart p-1.5 text-zinc-400 hover:text-white" data-id="${lvl.id}" title="Editar Chart">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn-delete-chart p-1.5 text-red-400 hover:text-red-300" data-id="${lvl.id}" title="Eliminar Chart">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
            }

            let editionSelectorBtnMarkup = '';
            if (lvl.hasBothEditions) {
                editionSelectorBtnMarkup = `
                    <button class="btn-trigger-edition-modal ml-2 text-zinc-400 hover:text-yellow-400 transition" data-id="${lvl.id}">
                        <i class="fa-solid fa-sliders text-xs"></i>
                    </button>
                `;
            }

            tr.innerHTML = `
                <td class="p-2 sm:p-3">
                    <div class="flex items-center gap-2.5">
                        <div class="target-art-outer-container relative w-12 h-12 rounded-xl overflow-hidden shrink-0 ${artThemeBorder} ${circularBorderClass}">
                            <img src="${lvl.art || 'free_song_Image.png'}" class="w-full h-full object-cover">
                            ${lvl.audio ? `
                                <canvas class="audio-radial-canvas absolute inset-0 pointer-events-none w-full h-full"></canvas>
                                <button class="btn-play-chart-audio absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition" data-audio="${lvl.audio}">
                                    <i class="fa-solid ${playIconClass} text-[10px]"></i>
                                </button>
                            ` : ''}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center flex-wrap">
                                <h4 class="text-xs sm:text-sm font-black text-white truncate leading-tight">${songDisplayTitle}</h4>
                                ${explicitWarningBtnMarkup}
                            </div>
                            <p class="text-[11px] text-zinc-400 font-bold truncate">${lvl.artist || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="p-2 sm:p-3 text-center">
                    <div class="flex items-center justify-center gap-1 flex-wrap">
                        ${genresMarkup}
                    </div>
                </td>
                <td class="p-2 sm:p-3 text-center">
                    <div class="flex items-center justify-center">
                        ${renderDifficultyTagMarkup(activeDiff)}
                    </div>
                </td>
                <td class="p-2 sm:p-3 text-center">
                    <div class="flex items-center justify-center">
                        ${renderEditionTagMarkup(activeEdition)}
                        ${editionSelectorBtnMarkup}
                    </div>
                </td>
                <td class="p-2 sm:p-3 text-center">
                    <span class="text-[11px] font-bold text-zinc-400">${context.formatStringToDMY(lvl.date)}</span>
                </td>
                <td class="p-2 sm:p-3 text-center">
                    <div class="flex items-center justify-center">
                        ${downloadButtonMarkup}
                    </div>
                </td>
                ${creatorActionsMarkup}
            `;

            tbody.appendChild(tr);
        });

        attachLevelsTableEvents();
    }

    function attachLevelsTableEvents() {
        document.querySelectorAll('.btn-play-chart-audio').forEach(btn => {
            btn.addEventListener('click', () => {
                const audioUrl = btn.getAttribute('data-audio');
                const container = btn.closest('.target-art-outer-container');
                const img = container?.querySelector('img');
                const canvas = container?.querySelector('.audio-radial-canvas');
                toggleAudioPreviewEngine(audioUrl, btn, img, canvas, container, false);
            });
        });

        document.querySelectorAll('.btn-download-chart').forEach(btn => {
            btn.addEventListener('click', () => {
                const zipUrl = btn.getAttribute('data-zip');
                if (zipUrl) context.triggerDownloadAlert(zipUrl);
            });
        });

        document.querySelectorAll('.btn-trigger-explicit-warning').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                pendingExplicitActivationChartId = chartId;
                document.getElementById('explicit-warning-modal')?.classList.remove('hidden');
            });
        });

        document.querySelectorAll('.btn-trigger-edition-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const chartId = btn.getAttribute('data-id');
                const matched = context.getLevels().find(l => l.id === chartId);
                if (matched) context.openBeatstarEditionSelectionModal(matched);
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
                            if (matched.art) await deleteFileFromCloudflareR2(matched.art);
                            if (matched.audio) await deleteFileFromCloudflareR2(matched.audio);
                            if (matched.zip) await deleteFileFromCloudflareR2(matched.zip);
                            if (matched.zipDeluxe) await deleteFileFromCloudflareR2(matched.zipDeluxe);
                            await remove(ref(db, `levels/${chartId}`));
                            await checkAndDeleteNotifOnRecordDelete('chart', matched.song);
                        } catch (err) {
                            console.error(err);
                        } finally {
                            context.hideLoadingOverlay();
                        }
                    });
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
    }

    function loadChartIntoForm(lvl) {
        document.getElementById('editingLvlId').value = lvl.id || '';
        document.getElementById('lvlSong').value = lvl.song || '';
        document.getElementById('lvlArtist').value = lvl.artist || '';
        document.getElementById('lvlDiff').value = lvl.diff || 'Normal';
        
        const dlxDiffInput = document.getElementById('lvlDiffDeluxe');
        if (dlxDiffInput) dlxDiffInput.value = lvl.diffDeluxe || 'Extreme';

        document.getElementById('lvlDate').value = lvl.date || '';
        
        const expCheck = document.getElementById('lvlHasExplicit');
        if (expCheck) expCheck.checked = !!lvl.isExplicit;

        const editionSelect = document.getElementById('lvlEditionMode');
        if (editionSelect) {
            editionSelect.value = lvl.hasBothEditions ? 'Both' : (lvl.edition || 'Standard');
            editionSelect.dispatchEvent(new Event('change'));
        }

        const container = document.getElementById('genres-container');
        if (container) {
            const currentGenres = (lvl.genre || '').split(' / ');
            container.querySelectorAll('.genre-pill-btn').forEach(btn => {
                const gLabel = btn.dataset.genre;
                const gColor = btn.dataset.color;
                if (currentGenres.includes(gLabel)) {
                    btn.classList.add('active-genre-pill');
                    btn.style.backgroundColor = `${gColor}30`;
                    btn.style.borderColor = gColor;
                } else {
                    btn.classList.remove('active-genre-pill');
                    btn.style.backgroundColor = '#18181b';
                    btn.style.borderColor = '#3f3f46';
                }
            });
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Listener del selector de modo de edición en formulario de creación
    document.getElementById('lvlEditionMode')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const sectionDeluxe = document.getElementById('section-deluxe-fields');
        if (val === 'Both' || val === 'Deluxe') {
            sectionDeluxe?.classList.remove('hidden');
        } else {
            sectionDeluxe?.classList.add('hidden');
        }
    });

    // Envío del Formulario de Levels / Charts
    document.getElementById('level-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        context.showLoadingOverlay();

        try {
            const lvlId = document.getElementById('editingLvlId').value;
            const song = document.getElementById('lvlSong').value.trim();
            const artist = document.getElementById('lvlArtist').value.trim();
            const diff = document.getElementById('lvlDiff').value;
            const diffDeluxe = document.getElementById('lvlDiffDeluxe')?.value || 'Extreme';
            const date = document.getElementById('lvlDate').value;
            const isExplicit = document.getElementById('lvlHasExplicit')?.checked || false;
            const editionMode = document.getElementById('lvlEditionMode').value;

            const selectedGenres = Array.from(document.querySelectorAll('#genres-container .active-genre-pill'))
                .map(el => el.dataset.genre)
                .join(' / ');

            const existingLevel = lvlId ? context.getLevels().find(l => l.id === lvlId) : null;

            const artFile = document.getElementById('lvlArtFile')?.files[0];
            const audioFile = document.getElementById('lvlAudioFile')?.files[0];
            const zipFile = document.getElementById('lvlChartZipFile')?.files[0];
            const zipDeluxeFile = document.getElementById('lvlChartZipFileDeluxe')?.files[0];

            let artUrl = existingLevel ? existingLevel.art : '';
            let audioUrl = existingLevel ? existingLevel.audio : '';
            let zipUrl = existingLevel ? existingLevel.zip : '';
            let zipDeluxeUrl = existingLevel ? existingLevel.zipDeluxe : '';

            if (artFile) {
                if (existingLevel && existingLevel.art) await deleteFileFromCloudflareR2(existingLevel.art);
                artUrl = await uploadFileToCloudflareR2(artFile, 'charts_art');
            }
            if (audioFile) {
                if (existingLevel && existingLevel.audio) await deleteFileFromCloudflareR2(existingLevel.audio);
                audioUrl = await uploadFileToCloudflareR2(audioFile, 'charts_audio');
            }
            if (zipFile) {
                if (existingLevel && existingLevel.zip) await deleteFileFromCloudflareR2(existingLevel.zip);
                zipUrl = await uploadFileToCloudflareR2(zipFile, 'charts_zips');
            }
            if (zipDeluxeFile) {
                if (existingLevel && existingLevel.zipDeluxe) await deleteFileFromCloudflareR2(existingLevel.zipDeluxe);
                zipDeluxeUrl = await uploadFileToCloudflareR2(zipDeluxeFile, 'charts_zips');
            }

            const isBoth = (editionMode === 'Both');
            const targetRef = lvlId ? ref(db, `levels/${lvlId}`) : push(ref(db, 'levels'));
            const finalId = lvlId || targetRef.key;

            const payload = {
                id: finalId,
                song,
                artist,
                genre: selectedGenres,
                diff,
                diffDeluxe: (isBoth || editionMode === 'Deluxe') ? diffDeluxe : null,
                date,
                isExplicit,
                hasBothEditions: isBoth,
                edition: isBoth ? 'Both' : editionMode,
                art: artUrl,
                audio: audioUrl,
                zip: zipUrl,
                zipDeluxe: isBoth ? zipDeluxeUrl : null
            };

            await set(targetRef, payload);

            // GESTIÓN DE NOTIFICACIÓN
            const isNewChart = !existingLevel;
            const zipBecameAvailable = existingLevel && (!existingLevel.zip && !existingLevel.zipDeluxe) && (zipUrl || zipDeluxeUrl);

            if (isNewChart || zipBecameAvailable) {
                await createOrUpdateNotification('chart', {
                    type: isNewChart ? 'new' : 'available',
                    artOrIcon: artUrl,
                    song: song,
                    artist: artist,
                    genre: selectedGenres,
                    diff: diff,
                    diffDeluxe: diffDeluxe,
                    edition: isBoth ? 'Both' : editionMode
                });
            }

            document.getElementById('level-form').reset();
            document.getElementById('editingLvlId').value = '';
            buildGenresSelector();
            document.getElementById('lvlEditionMode').dispatchEvent(new Event('change'));

        } catch (err) {
            console.error("Error saving chart:", err);
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