import { ref, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";
import { 
    createOrUpdateNotification, 
    checkAndDeleteNotifOnRecordDelete, 
    checkAndDeleteNotifOnZipDelete,
    getActiveNotificationsList
} from "./notifications-manager.js";

export function initChartsModule(state) {
    const {
        getLevels,
        getCurrentLanguage,
        getIsCreatorMode,
        getGlobalVisualAssets,
        getCurrentEditionModeFilter,
        showLoadingOverlay,
        hideLoadingOverlay,
        triggerDownloadAlert,
        formatStringToDMY,
        renderVideoPlayerMarkup,
        setupNativeVideoBehavior,
        requestUserDeleteConfirmation,
        audioPlayer,
        currentPlayingSongId,
        setCurrentPlayingSongId,
        updateSongPlayButtons
    } = state;

    let activeGenreFilter = "";
    let isDeluxeModeActiveInTable = false;
    let isExplicitModeActiveInTable = false;

    let pendingDeletes = {
        art: false,
        dateStd: false,
        dateDlx: false,
        dateExpStd: false,
        dateExpDlx: false,
        audioStd: false,
        zipStd: false,
        videoStd: false,
        audioExp: false,
        zipExp: false,
        videoExp: false,
        zipDlx: false,
        videoDlx: false,
        zipExpDlx: false,
        videoExpDlx: false
    };

    function setupChartFileOrDeleteSlot(slotId, hasExisting, keyName, isDate = false) {
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

        document.getElementById('editingId').value = '';
        Object.keys(pendingDeletes).forEach(k => pendingDeletes[k] = false);

        const lang = getCurrentLanguage();
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            const textSpan = submitBtn.querySelector('span');
            if (textSpan) textSpan.innerText = translations[lang].btnRegister;
            else submitBtn.innerText = translations[lang].btnRegister;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        document.getElementById('lvlIsComingSoon').value = "false";
        document.getElementById('lvlIsExclusive').checked = false;
        document.getElementById('hasExplicitToggle').checked = false;
        
        document.getElementById('section-deluxe-fields').classList.add('hidden');
        document.getElementById('section-explicit-fields').classList.add('hidden');
        document.getElementById('sub-section-explicit-deluxe').classList.add('hidden');

        document.querySelectorAll('.btn-slot-delete').forEach(btn => btn.remove());
        document.querySelectorAll('#level-form input[type="file"], #level-form input[type="date"]').forEach(inp => inp.classList.remove('hidden'));
    }

    function validateFormStateAndCheckChanges() {
        const submitBtn = document.getElementById('submitBtn');
        if (!submitBtn) return;

        const editingId = document.getElementById('editingId').value;
        const song = document.getElementById('lvlSong').value.trim();
        const artist = document.getElementById('lvlArtist').value.trim();
        const genre = document.getElementById('lvlGenre').value.trim();

        const hasRequired = song !== "" && artist !== "" && genre !== "";

        if (!editingId) {
            if (hasRequired) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
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
                genre !== (existingLvl.genre || '') ||
                document.getElementById('lvlEditionMode').value !== (existingLvl.editionMode || 'Standard') ||
                document.getElementById('lvlIsExclusive').checked !== !!existingLvl.isExclusive ||
                document.getElementById('hasExplicitToggle').checked !== !!existingLvl.hasExplicit ||
                document.getElementById('lvlDiff').value !== (existingLvl.diff || '') ||
                document.getElementById('lvlNotes').value !== (existingLvl.notes || '') ||
                document.getElementById('lvlDuration').value !== (existingLvl.duration || '') ||
                document.getElementById('lvlDate').value !== (existingLvl.date || '') ||
                document.getElementById('lvlDl1').value !== (existingLvl.dl1 || '') ||
                document.getElementById('lvlDl2').value !== (existingLvl.dl2 || '') ||
                document.getElementById('lvlDl3').value !== (existingLvl.dl3 || '') ||
                document.getElementById('lvlDiffDeluxe').value !== (existingLvl.diffDeluxe || '') ||
                document.getElementById('lvlNotesDeluxe').value !== (existingLvl.notesDeluxe || '') ||
                document.getElementById('lvlDurationDeluxe').value !== (existingLvl.durationDeluxe || '') ||
                document.getElementById('lvlDateDeluxe').value !== (existingLvl.dateDeluxe || '') ||
                document.getElementById('lvlDl1Deluxe').value !== (existingLvl.dl1Deluxe || '') ||
                document.getElementById('lvlDl2Deluxe').value !== (existingLvl.dl2Deluxe || '') ||
                document.getElementById('lvlDl3Deluxe').value !== (existingLvl.dl3Deluxe || '') ||
                // Corrección 1: Evaluación de campos explícitos sin URLs de descarga explícitas
                (document.getElementById('lvlNotesExplicit')?.value || '') !== (existingLvl.notesExplicit || '') ||
                (document.getElementById('lvlDurationExplicit')?.value || '') !== (existingLvl.durationExplicit || '') ||
                (document.getElementById('lvlDateExplicit')?.value || '') !== (existingLvl.dateExplicit || '') ||
                (document.getElementById('lvlNotesDeluxeExplicit')?.value || '') !== (existingLvl.notesDeluxeExplicit || '') ||
                (document.getElementById('lvlDurationDeluxeExplicit')?.value || '') !== (existingLvl.durationDeluxeExplicit || '') ||
                (document.getElementById('lvlDateDeluxeExplicit')?.value || '') !== (existingLvl.dateDeluxeExplicit || '');

            if (changed) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

    function renderLevelsTable() {
        const tbody = document.getElementById('tbody-levels');
        if (!tbody) return;

        const lang = getCurrentLanguage();
        const isCreatorMode = getIsCreatorMode();
        const globalVisualAssets = getGlobalVisualAssets();
        const currentEditionModeFilter = getCurrentEditionModeFilter();
        const levels = getLevels();

        // Corrección 4: Obtener notificaciones activas para comparar e inyectar insignia
        const activeNotifications = (typeof getActiveNotificationsList === 'function') ? getActiveNotificationsList() : [];

        let filtered = [...levels];

        if (currentEditionModeFilter !== 'All') {
            filtered = filtered.filter(l => (l.editionMode || 'Standard') === currentEditionModeFilter);
        }

        if (activeGenreFilter) {
            filtered = filtered.filter(l => l.genre && l.genre.toLowerCase().includes(activeGenreFilter.toLowerCase()));
        }

        const counterEl = document.getElementById('counter-levels');
        if (counterEl) {
            const hasFilter = currentEditionModeFilter !== 'All' || activeGenreFilter;
            counterEl.innerText = hasFilter ? `Charts: ${filtered.length}` : `Total: ${levels.length} Charts`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <img src="1455064703448645786.gif" alt="Boogie" class="w-28 h-auto">
                            <p class="text-sm font-extrabold text-zinc-300 font-sans tracking-wide">${translations[lang].noSongsBoogie}</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        const frag = document.createDocumentFragment();

        filtered.forEach((lvl) => {
            const isDeluxeActive = isDeluxeModeActiveInTable && (lvl.editionMode === 'Deluxe');
            const isExplicitActive = isExplicitModeActiveInTable && lvl.hasExplicit;

            // Corrección 4: Determinar si el chart tiene notificación activa
            const hasActiveNotif = activeNotifications.some(n => 
                n.category === 'chart' && 
                n.song?.toLowerCase() === lvl.song?.toLowerCase() && 
                n.artist?.toLowerCase() === lvl.artist?.toLowerCase()
            );

            const newBadgeImage = lang === 'en' ? 'New.png' : 'Nuevo.png';
            const newBadgeMarkup = hasActiveNotif ? `
                <img src="${newBadgeImage}" alt="New" class="absolute -top-2 -left-2 w-7 h-7 sm:w-9 sm:h-9 object-contain z-30 drop-shadow-lg pointer-events-none">
            ` : '';

            // Selección de datos según combinación de switches en tabla
            let currentDiff = lvl.diff;
            let currentNotes = lvl.notes;
            let currentDuration = lvl.duration;
            let currentDate = lvl.date;
            let currentVideo = lvl.video;
            let currentZip = lvl.chartDirectUrl;

            // Corrección 1: Asignación limpia de links de descarga utilizando los principales
            let currentDl1 = isDeluxeActive ? (lvl.dl1Deluxe || lvl.dl1) : lvl.dl1;
            let currentDl2 = isDeluxeActive ? (lvl.dl2Deluxe || lvl.dl2) : lvl.dl2;
            let currentDl3 = isDeluxeActive ? (lvl.dl3Deluxe || lvl.dl3) : lvl.dl3;

            if (isDeluxeActive) {
                currentDiff = lvl.diffDeluxe || lvl.diff;
                currentNotes = lvl.notesDeluxe || lvl.notes;
                currentDuration = lvl.durationDeluxe || lvl.duration;
                currentDate = lvl.dateDeluxe || lvl.date;
                currentVideo = lvl.videoDeluxe || lvl.video;
                currentZip = lvl.chartDirectUrlDeluxe || lvl.chartDirectUrl;
            }

            if (isExplicitActive) {
                if (isDeluxeActive) {
                    currentNotes = lvl.notesDeluxeExplicit || currentNotes;
                    currentDuration = lvl.durationDeluxeExplicit || currentDuration;
                    currentDate = lvl.dateDeluxeExplicit || currentDate;
                    currentVideo = lvl.videoDeluxeExplicit || currentVideo;
                    currentZip = lvl.zipDeluxeExplicit || currentZip;
                } else {
                    currentNotes = lvl.notesExplicit || currentNotes;
                    currentDuration = lvl.durationExplicit || currentDuration;
                    currentDate = lvl.dateExplicit || currentDate;
                    currentVideo = lvl.videoExplicit || currentVideo;
                    currentZip = lvl.zipExplicit || currentZip;
                }
            }

            let activeAudioUrl = lvl.audioDirectUrl || '';
            if (isExplicitActive && lvl.audioExplicit) {
                activeAudioUrl = lvl.audioExplicit;
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-purple-950/20 transition border-b-2 border-purple-900/50 shadow-sm";

            let pMarkup = renderVideoPlayerMarkup(currentVideo, true);

            const hasAnyLinks = currentZip || currentDl1 || currentDl2 || currentDl3;
            let linksLayout = `<div class="flex flex-col gap-1 sm:gap-1.5 max-w-[150px] sm:max-w-[240px] mx-auto">`;
            if (hasAnyLinks) {
                if (currentZip) {
                    linksLayout += `<button class="btn-direct-chart-download bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 sm:gap-1.5 shadow"><i class="fa-solid fa-circle-down"></i>${translations[lang].downloadDirectBtn}</button>`;
                }
                if (currentDl1) linksLayout += `<a href="${currentDl1}" target="_blank" class="bg-zinc-900 px-2 sm:px-4 py-1 sm:py-2 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1 sm:gap-1.5 hover:border-purple-500/40 transition"><img src="Discord_Logo.png" class="w-3 sm:w-3.5 h-3 sm:h-3.5 force-white-icon">Discord</a>`;
                if (currentDl2) linksLayout += `<a href="${currentDl2}" target="_blank" class="bg-zinc-900 px-2 sm:px-4 py-1 sm:py-2 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1 sm:gap-1.5 hover:border-purple-500/40 transition"><img src="BSCM_Logo.png" class="w-3 sm:w-3.5 h-3 sm:h-3.5 force-white-icon">BSCM</a>`;
                if (currentDl3) linksLayout += `<a href="${currentDl3}" target="_blank" class="bg-zinc-900 px-2 sm:px-4 py-1 sm:py-2 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1 sm:gap-1.5 hover:border-purple-500/40 transition"><img src="beatcharts_Logo.png" class="w-3 sm:w-3.5 h-3 sm:h-3.5 force-white-icon">beatcharts</a>`;
            } else {
                linksLayout += `<span class="text-[9px] sm:text-[10px] font-extrabold text-zinc-500 text-center block px-1.5 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg sm:rounded-xl">${translations[lang].noDownloadsAvailable}</span>`;
            }
            linksLayout += `</div>`;

            const exclusiveBadge = lvl.isExclusive ? `
                <div class="mt-1 text-[10px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-md w-max">
                    <i class="fa-solid fa-star text-amber-400"></i> ${translations[lang].skinExclusiveLabel}
                </div>
            ` : '';

            const isCurrentPlaying = (currentPlayingSongId === lvl.id);
            const playIconClass = isCurrentPlaying ? 'fa-pause' : 'fa-play';
            const playBtnColor = isCurrentPlaying ? 'bg-purple-600 text-white' : 'bg-black/70 text-white hover:bg-purple-600';

            const safeGenreKey = (lvl.genre || '').replace('/', '');
            const genreAsset = globalVisualAssets[`genre_${safeGenreKey}`];
            const genreGraphic = genreAsset 
                ? `<span class="dynamic-color-mask w-3.5 h-3.5 shrink-0" style="color: #a855f7; -webkit-mask-image: url('${genreAsset}'); mask-image: url('${genreAsset}');"></span>`
                : `<span class="w-2 h-2 rounded-full inline-block shrink-0 bg-purple-500"></span>`;

            tr.innerHTML = `
                <td class="p-2 sm:p-4 text-center align-middle">
                    <div class="relative w-20 h-20 sm:w-36 sm:h-36 mx-auto shrink-0">
                        <div class="w-full h-full border border-purple-950/80 rounded-xl overflow-hidden bg-zinc-950 p-1">
                            <img src="${lvl.art}" class="w-full h-full object-cover rounded-lg bg-zinc-900" onerror="this.src='free_song_Image.png'">
                        </div>
                        ${newBadgeMarkup}
                        ${activeAudioUrl ? `
                            <button data-song-id="${lvl.id}" data-audio-url="${activeAudioUrl}" class="btn-play-preview absolute inset-0 m-auto w-10 h-10 sm:w-12 sm:h-12 ${playBtnColor} rounded-full flex items-center justify-center text-sm sm:text-base shadow-xl transition backdrop-blur-sm border border-white/20 z-20">
                                <i class="fa-solid ${playIconClass}"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
                <td class="p-2 sm:p-4 min-w-[200px] sm:min-w-[320px] flex-1 align-middle">
                    <ul class="space-y-2 list-none text-zinc-300 whitespace-normal break-words">
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listName}:</span> 
                            <div class="inline-block flex-1">
                                <span class="text-white font-black tracking-wide text-base sm:text-xl">${lvl.song}</span>
                                ${exclusiveBadge}
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listArtist}:</span> 
                            <span class="text-zinc-200 font-bold inline-block">${lvl.artist}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formGenre}:</span> 
                            <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-black text-purple-400 border-purple-900/40 bg-purple-950/20">
                                ${genreGraphic}
                                <span class="inline truncate">${lvl.genre}</span>
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listDiff}:</span> 
                            <span class="text-purple-400 font-black">${currentDiff || 'N/A'}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listNotes}:</span> 
                            <span class="text-zinc-300 font-bold">${currentNotes || 'N/A'}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listDuration}:</span> 
                            <span class="font-mono text-zinc-400 text-xs sm:text-sm">${currentDuration || 'N/A'}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listRelease}:</span> 
                            <span class="font-sans font-bold text-zinc-400 text-xs sm:text-sm">${formatStringToDMY(currentDate)}</span>
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

            setupNativeVideoBehavior(tr.querySelector('.custom-native-video-wrapper'));

            if (currentZip) {
                tr.querySelector('.btn-direct-chart-download')?.addEventListener('click', () => triggerDownloadAlert(currentZip));
            }

            const playBtn = tr.querySelector('.btn-play-preview');
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    const songId = playBtn.getAttribute('data-song-id');
                    const url = playBtn.getAttribute('data-audio-url');

                    if (currentPlayingSongId === songId) {
                        audioPlayer.pause();
                        setCurrentPlayingSongId(null);
                        updateSongPlayButtons();
                    } else {
                        audioPlayer.src = url;
                        audioPlayer.play().then(() => {
                            setCurrentPlayingSongId(songId);
                            updateSongPlayButtons();
                        }).catch(err => console.error("Error reproduciendo audio preview:", err));
                    }
                });
            }

            // Corrección 1: Carga limpia de datos al editar un chart
            tr.querySelector('.btn-edit-lvl')?.addEventListener('click', () => {
                resetLevelFormState();

                document.getElementById('editingId').value = lvl.id;
                document.getElementById('lvlSong').value = lvl.song || '';
                document.getElementById('lvlArtist').value = lvl.artist || '';
                document.getElementById('lvlGenre').value = lvl.genre || '';
                document.getElementById('lvlEditionMode').value = lvl.editionMode || 'Standard';
                document.getElementById('lvlIsExclusive').checked = !!lvl.isExclusive;
                document.getElementById('lvlDiff').value = lvl.diff || '';
                document.getElementById('lvlNotes').value = lvl.notes || '';
                document.getElementById('lvlDuration').value = lvl.duration || '';
                document.getElementById('lvlDate').value = lvl.date || '';
                document.getElementById('lvlDl1').value = lvl.dl1 || '';
                document.getElementById('lvlDl2').value = lvl.dl2 || '';
                document.getElementById('lvlDl3').value = lvl.dl3 || '';

                if (lvl.editionMode === 'Deluxe') {
                    document.getElementById('section-deluxe-fields').classList.remove('hidden');
                    document.getElementById('lvlDiffDeluxe').value = lvl.diffDeluxe || '';
                    document.getElementById('lvlNotesDeluxe').value = lvl.notesDeluxe || '';
                    document.getElementById('lvlDurationDeluxe').value = lvl.durationDeluxe || '';
                    document.getElementById('lvlDateDeluxe').value = lvl.dateDeluxe || '';
                    document.getElementById('lvlDl1Deluxe').value = lvl.dl1Deluxe || '';
                    document.getElementById('lvlDl2Deluxe').value = lvl.dl2Deluxe || '';
                    document.getElementById('lvlDl3Deluxe').value = lvl.dl3Deluxe || '';
                }

                const hasExp = !!lvl.hasExplicit;
                document.getElementById('hasExplicitToggle').checked = hasExp;
                if (hasExp) {
                    document.getElementById('section-explicit-fields').classList.remove('hidden');
                    document.getElementById('lvlNotesExplicit').value = lvl.notesExplicit || '';
                    document.getElementById('lvlDurationExplicit').value = lvl.durationExplicit || '';
                    document.getElementById('lvlDateExplicit').value = lvl.dateExplicit || '';

                    if (lvl.editionMode === 'Deluxe') {
                        document.getElementById('sub-section-explicit-deluxe').classList.remove('hidden');
                        document.getElementById('lvlNotesDeluxeExplicit').value = lvl.notesDeluxeExplicit || '';
                        document.getElementById('lvlDurationDeluxeExplicit').value = lvl.durationDeluxeExplicit || '';
                        document.getElementById('lvlDateDeluxeExplicit').value = lvl.dateDeluxeExplicit || '';
                    }
                }

                setupChartFileOrDeleteSlot('slot-lvl-art', !!lvl.art && lvl.art !== 'free_song_Image.png', 'art');
                setupChartFileOrDeleteSlot('slot-lvl-date', !!lvl.date, 'dateStd', true);
                setupChartFileOrDeleteSlot('slot-lvl-audio', !!lvl.audioDirectUrl, 'audioStd');
                setupChartFileOrDeleteSlot('slot-lvl-zip', !!lvl.chartDirectUrl, 'zipStd');
                setupChartFileOrDeleteSlot('slot-lvl-video', !!lvl.video, 'videoStd');

                setupChartFileOrDeleteSlot('slot-lvl-date-deluxe', !!lvl.dateDeluxe, 'dateDlx', true);
                setupChartFileOrDeleteSlot('slot-lvl-zip-deluxe', !!lvl.chartDirectUrlDeluxe, 'zipDlx');
                setupChartFileOrDeleteSlot('slot-lvl-video-deluxe', !!lvl.videoDeluxe, 'videoDlx');

                setupChartFileOrDeleteSlot('slot-lvl-date-explicit', !!lvl.dateExplicit, 'dateExpStd', true);
                setupChartFileOrDeleteSlot('slot-lvl-audio-explicit', !!lvl.audioExplicit, 'audioExp');
                setupChartFileOrDeleteSlot('slot-lvl-zip-explicit', !!lvl.zipExplicit, 'zipExp');
                setupChartFileOrDeleteSlot('slot-lvl-video-explicit', !!lvl.videoExplicit, 'videoExp');

                setupChartFileOrDeleteSlot('slot-lvl-date-deluxe-explicit', !!lvl.dateDeluxeExplicit, 'dateExpDlx', true);
                setupChartFileOrDeleteSlot('slot-lvl-zip-deluxe-explicit', !!lvl.zipDeluxeExplicit, 'zipExpDlx');
                setupChartFileOrDeleteSlot('slot-lvl-video-deluxe-explicit', !!lvl.videoDeluxeExplicit, 'videoExpDlx');

                const submitBtn = document.getElementById('submitBtn');
                if (submitBtn) {
                    const span = submitBtn.querySelector('span');
                    if (span) span.innerText = translations[lang].btnSaveChanges;
                    else submitBtn.innerText = translations[lang].btnSaveChanges;
                }

                validateFormStateAndCheckChanges();
            });

            tr.querySelector('.btn-del-lvl')?.addEventListener('click', () => {
                requestUserDeleteConfirmation(async () => {
                    if (db) {
                        showLoadingOverlay();
                        try {
                            const filesToDelete = [
                                lvl.art,
                                lvl.audioDirectUrl,
                                lvl.chartDirectUrl,
                                lvl.video,
                                lvl.chartDirectUrlDeluxe,
                                lvl.videoDeluxe,
                                lvl.audioExplicit,
                                lvl.zipExplicit,
                                lvl.videoExplicit,
                                lvl.zipDeluxeExplicit,
                                lvl.videoDeluxeExplicit
                            ].filter(url => url && url.trim() !== "" && url !== "free_song_Image.png");

                            if (filesToDelete.length > 0) {
                                await Promise.all(filesToDelete.map(url => deleteFileFromCloudflareR2(url)));
                            }

                            await remove(ref(db, 'levels/' + lvl.id));
                            await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]);

                            await checkAndDeleteNotifOnRecordDelete('chart');
                            resetLevelFormState();
                        } catch (err) {
                            console.error("Error eliminando chart y sus archivos R2:", err);
                            alert("Ocurrió un error al intentar eliminar los archivos del chart.");
                        } finally {
                            hideLoadingOverlay();
                        }
                    }
                });
            });

            frag.appendChild(tr);
        });

        tbody.innerHTML = '';
        tbody.appendChild(frag);
    }

    document.getElementById('btn-cancel-lvl-form')?.addEventListener('click', resetLevelFormState);

    document.getElementById('lvlEditionMode')?.addEventListener('change', (e) => {
        const mode = e.target.value;
        const delSec = document.getElementById('section-deluxe-fields');
        const delExpSub = document.getElementById('sub-section-explicit-deluxe');
        const hasExp = document.getElementById('hasExplicitToggle').checked;

        if (mode === 'Deluxe') {
            delSec?.classList.remove('hidden');
            if (hasExp) delExpSub?.classList.remove('hidden');
        } else {
            delSec?.classList.add('hidden');
            delExpSub?.classList.add('hidden');
        }
        validateFormStateAndCheckChanges();
    });

    document.getElementById('hasExplicitToggle')?.addEventListener('change', (e) => {
        const active = e.target.checked;
        const expSec = document.getElementById('section-explicit-fields');
        const delExpSub = document.getElementById('sub-section-explicit-deluxe');
        const mode = document.getElementById('lvlEditionMode').value;

        if (active) {
            expSec?.classList.remove('hidden');
            if (mode === 'Deluxe') delExpSub?.classList.remove('hidden');
        } else {
            expSec?.classList.add('hidden');
            delExpSub?.classList.add('hidden');

            // Corrección Bug Audio Preview: Detener audio al desactivar versión explícita en el formulario
            if (audioPlayer && !audioPlayer.paused) {
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
                setCurrentPlayingSongId(null);
                updateSongPlayButtons();
            }
        }
        validateFormStateAndCheckChanges();
    });

    document.getElementById('level-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        showLoadingOverlay();

        try {
            let id = document.getElementById('editingId').value.trim() || Date.now().toString();
            const levels = getLevels();
            let existingLvl = levels.find(l => l.id === id) || {};

            const isZipDeleted = pendingDeletes.zipStd || pendingDeletes.zipDlx || pendingDeletes.zipExp || pendingDeletes.zipExpDlx;

            // Borrado preventivo en R2
            if (pendingDeletes.art && existingLvl.art) { await deleteFileFromCloudflareR2(existingLvl.art); existingLvl.art = "free_song_Image.png"; }
            if (pendingDeletes.audioStd && existingLvl.audioDirectUrl) { await deleteFileFromCloudflareR2(existingLvl.audioDirectUrl); existingLvl.audioDirectUrl = ""; }
            if (pendingDeletes.zipStd && existingLvl.chartDirectUrl) { await deleteFileFromCloudflareR2(existingLvl.chartDirectUrl); existingLvl.chartDirectUrl = ""; }
            if (pendingDeletes.videoStd && existingLvl.video) { await deleteFileFromCloudflareR2(existingLvl.video); existingLvl.video = ""; }

            if (pendingDeletes.zipDlx && existingLvl.chartDirectUrlDeluxe) { await deleteFileFromCloudflareR2(existingLvl.chartDirectUrlDeluxe); existingLvl.chartDirectUrlDeluxe = ""; }
            if (pendingDeletes.videoDlx && existingLvl.videoDeluxe) { await deleteFileFromCloudflareR2(existingLvl.videoDeluxe); existingLvl.videoDeluxe = ""; }

            if (pendingDeletes.audioExp && existingLvl.audioExplicit) { await deleteFileFromCloudflareR2(existingLvl.audioExplicit); existingLvl.audioExplicit = ""; }
            if (pendingDeletes.zipExp && existingLvl.zipExplicit) { await deleteFileFromCloudflareR2(existingLvl.zipExplicit); existingLvl.zipExplicit = ""; }
            if (pendingDeletes.videoExp && existingLvl.videoExplicit) { await deleteFileFromCloudflareR2(existingLvl.videoExplicit); existingLvl.videoExplicit = ""; }

            if (pendingDeletes.zipExpDlx && existingLvl.zipDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLvl.zipDeluxeExplicit); existingLvl.zipDeluxeExplicit = ""; }
            if (pendingDeletes.videoExpDlx && existingLvl.videoDeluxeExplicit) { await deleteFileFromCloudflareR2(existingLvl.videoDeluxeExplicit); existingLvl.videoDeluxeExplicit = ""; }

            // Subida de nuevos archivos
            let art = existingLvl.art || "free_song_Image.png";
            let audioDirectUrl = existingLvl.audioDirectUrl || "";
            let chartDirectUrl = existingLvl.chartDirectUrl || "";
            let video = existingLvl.video || "";

            let chartDirectUrlDeluxe = existingLvl.chartDirectUrlDeluxe || "";
            let videoDeluxe = existingLvl.videoDeluxe || "";

            let audioExplicit = existingLvl.audioExplicit || "";
            let zipExplicit = existingLvl.zipExplicit || "";
            let videoExplicit = existingLvl.videoExplicit || "";

            let zipDeluxeExplicit = existingLvl.zipDeluxeExplicit || "";
            let videoDeluxeExplicit = existingLvl.videoDeluxeExplicit || "";

            const artInput = document.getElementById('lvlArtFile');
            if (artInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(artInput.files[0], 'artworks'); if (u) art = u; }

            const audioInput = document.getElementById('lvlAudioFile');
            if (audioInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(audioInput.files[0], 'audios'); if (u) audioDirectUrl = u; }

            const zipInput = document.getElementById('lvlChartZipFile');
            if (zipInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(zipInput.files[0], 'charts'); if (u) chartDirectUrl = u; }

            const videoInput = document.getElementById('lvlVideoFile');
            if (videoInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(videoInput.files[0], 'prevsongs'); if (u) video = u; }

            const zipDeluxeInput = document.getElementById('lvlChartZipFileDeluxe');
            if (zipDeluxeInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(zipDeluxeInput.files[0], 'charts'); if (u) chartDirectUrlDeluxe = u; }

            const videoDeluxeInput = document.getElementById('lvlVideoFileDeluxe');
            if (videoDeluxeInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(videoDeluxeInput.files[0], 'prevsongs'); if (u) videoDeluxe = u; }

            const audioExpInput = document.getElementById('lvlAudioExplicitFile');
            if (audioExpInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(audioExpInput.files[0], 'audios'); if (u) audioExplicit = u; }

            const zipExpInput = document.getElementById('lvlChartZipExplicitFile');
            if (zipExpInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(zipExpInput.files[0], 'charts'); if (u) zipExplicit = u; }

            const videoExpInput = document.getElementById('lvlVideoExplicitFile');
            if (videoExpInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(videoExpInput.files[0], 'prevsongs'); if (u) videoExplicit = u; }

            const zipExpDeluxeInput = document.getElementById('lvlChartZipDeluxeExplicitFile');
            if (zipExpDeluxeInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(zipExpDeluxeInput.files[0], 'charts'); if (u) zipDeluxeExplicit = u; }

            const videoExpDeluxeInput = document.getElementById('lvlVideoDeluxeExplicitFile');
            if (videoExpDeluxeInput?.files?.[0]) { const u = await uploadFileToCloudflareR2(videoExpDeluxeInput.files[0], 'prevsongs'); if (u) videoDeluxeExplicit = u; }

            const editionMode = document.getElementById('lvlEditionMode').value;
            const song = document.getElementById('lvlSong').value.trim();
            const artist = document.getElementById('lvlArtist').value.trim();
            const genre = document.getElementById('lvlGenre').value.trim();
            const isExclusive = document.getElementById('lvlIsExclusive').checked;
            const hasExplicit = document.getElementById('hasExplicitToggle').checked;

            // Corrección 1: Payload limpio de enlaces de descarga redundantes
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
                videoExplicit,
                zipExplicit,
                notesDeluxeExplicit: document.getElementById('lvlNotesDeluxeExplicit').value,
                durationDeluxeExplicit: document.getElementById('lvlDurationDeluxeExplicit').value,
                dateDeluxeExplicit: pendingDeletes.dateExpDlx ? "" : document.getElementById('lvlDateExplicit').value,
                videoDeluxeExplicit,
                zipDeluxeExplicit
            };

            if (db) {
                await set(ref(db, 'levels/' + id), payload);
                await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]);

                if (isZipDeleted) {
                    await checkAndDeleteNotifOnZipDelete('chart');
                }

                // Corrección 3: Registro automático de notificación con IDs únicas
                const isNewRecord = !document.getElementById('editingId').value.trim();
                const zipAddedToExisting = !isNewRecord && !existingLvl.chartDirectUrl && !!chartDirectUrl;

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
            }
        } catch (err) {
            console.error("Error guardando el chart:", err);
            alert("Ocurrió un error al guardar el chart.");
        } finally {
            hideLoadingOverlay();
        }
    });

    document.getElementById('level-form')?.addEventListener('input', validateFormStateAndCheckChanges);
    document.getElementById('level-form')?.addEventListener('change', validateFormStateAndCheckChanges);

    return {
        resetLevelFormState,
        renderLevelsTable,
        setGenreFilter: (val) => { activeGenreFilter = val; },
        setIsDeluxeModeActiveInTable: (val) => { isDeluxeModeActiveInTable = val; },
        setIsExplicitModeActiveInTable: (val) => { isExplicitModeActiveInTable = val; }
    };
}