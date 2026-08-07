import { ref, set, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { db, uploadFileToCloudflareR2, deleteFileFromCloudflareR2 } from "./services.js";
import { translations } from "./i18n.js";

export function initSkinsModule(state) {
    const {
        skinUniversalGenreList,
        getCosmetics,
        getCurrentLanguage,
        getIsCreatorMode,
        getGlobalVisualAssets,
        getCurrentSelectedSkinSubPlatform,
        getBrandCustomNamesMap,
        showLoadingOverlay,
        hideLoadingOverlay,
        triggerDownloadAlert,
        formatStringToDMY,
        renderVideoPlayerMarkup,
        setupNativeVideoBehavior,
        requestUserDeleteConfirmation
    } = state;

    let activeSkinGenreFilter = "";
    let editingCosBrandUrlsList = [];

    let pendingSkinDeletes = {
        icon: false,
        video: false,
        zip: false,
        date: false
    };

    let pendingBrandFileToUpload = null;
    let tempPreviewBrandUrl = null;

    function sanitizeFirebaseKey(key) {
        return btoa(key).replace(/=/g, '').replace(/\//g, '_').replace(/\+/g, '-');
    }

    function saveBrandCustomNamesToDatabase() {
        if (db) {
            const brandCustomNamesMap = getBrandCustomNamesMap();
            const safeMap = {};
            Object.keys(brandCustomNamesMap).forEach(rawUrl => {
                const safeKey = sanitizeFirebaseKey(rawUrl);
                safeMap[safeKey] = brandCustomNamesMap[rawUrl];
            });
            set(ref(db, 'brand_custom_names'), safeMap);
        }
    }

    function getUniqueRegisteredBrandUrls() {
        const cosmetics = getCosmetics();
        const urlsSet = new Set();
        cosmetics.forEach(cos => {
            if (cos.insp) {
                cos.insp.split(/[\s,]+/).forEach(u => {
                    const cleanUrl = u.trim();
                    if (cleanUrl) urlsSet.add(cleanUrl);
                });
            }
        });
        return Array.from(urlsSet);
    }

    function populateExistingBrandsDropdown() {
        const selectEl = document.getElementById('selectExistingBrandUrl');
        if (!selectEl) return;
        
        const lang = getCurrentLanguage();
        const brandCustomNamesMap = getBrandCustomNamesMap();
        const uniqueUrls = getUniqueRegisteredBrandUrls();
        selectEl.innerHTML = `<option value="" disabled selected>${translations[lang].selectExistingBrand}...</option>`;

        if (uniqueUrls.length === 0) {
            selectEl.innerHTML += `<option value="" disabled>${translations[lang].noExistingBrands}</option>`;
            return;
        }

        uniqueUrls.forEach((url, idx) => {
            const opt = document.createElement('option');
            opt.value = url;
            const displayName = brandCustomNamesMap[url] || `Marca / Inspiración #${idx + 1}`;
            opt.innerText = displayName;
            selectEl.appendChild(opt);
        });
    }

    function renderBrandManagementFormInterface() {
        const container = document.getElementById('cosBrandManagementList');
        if (!container) return;
        
        if (editingCosBrandUrlsList.length === 0) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        container.innerHTML = '';
        
        editingCosBrandUrlsList.forEach((url, index) => {
            const item = document.createElement('div');
            item.className = "flex items-center justify-between gap-2 bg-[#05020a] p-1.5 rounded border border-zinc-800";
            item.innerHTML = `
                <div class="flex items-center gap-2 truncate">
                    <img src="${url}" class="w-10 h-8 object-contain bg-black/60 border border-zinc-900 rounded shrink-0">
                    <span class="text-[10px] text-zinc-500 truncate font-mono">${url}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button type="button" class="btn-move-brand-up w-5 h-5 bg-zinc-900 hover:bg-zinc-800 rounded text-zinc-400 flex items-center justify-center text-[10px]"><i class="fa-solid fa-arrow-up"></i></button>
                    <button type="button" class="btn-move-brand-down w-5 h-5 bg-zinc-900 hover:bg-zinc-800 rounded text-zinc-400 flex items-center justify-center text-[10px]"><i class="fa-solid fa-arrow-down"></i></button>
                    <button type="button" class="btn-delete-brand-single w-5 h-5 bg-red-950 border border-red-900 text-red-400 hover:bg-red-900 hover:text-white rounded flex items-center justify-center text-[10px] font-bold">X</button>
                </div>
            `;
            
            item.querySelector('.btn-move-brand-up').addEventListener('click', () => {
                if (index > 0) {
                    const temp = editingCosBrandUrlsList[index];
                    editingCosBrandUrlsList[index] = editingCosBrandUrlsList[index - 1];
                    editingCosBrandUrlsList[index - 1] = temp;
                    renderBrandManagementFormInterface();
                    validateSkinFormStateAndCheckChanges();
                }
            });
            
            item.querySelector('.btn-move-brand-down').addEventListener('click', () => {
                if (index < editingCosBrandUrlsList.length - 1) {
                    const temp = editingCosBrandUrlsList[index];
                    editingCosBrandUrlsList[index] = editingCosBrandUrlsList[index + 1];
                    editingCosBrandUrlsList[index + 1] = temp;
                    renderBrandManagementFormInterface();
                    validateSkinFormStateAndCheckChanges();
                }
            });
            
            item.querySelector('.btn-delete-brand-single').addEventListener('click', () => {
                requestUserDeleteConfirmation(() => {
                    editingCosBrandUrlsList.splice(index, 1);
                    renderBrandManagementFormInterface();
                    validateSkinFormStateAndCheckChanges();
                });
            });
            
            container.appendChild(item);
        });
    }

    function buildSkinGenresSelector() {
        const container = document.getElementById('skin-genres-container');
        if (!container) return;
        container.innerHTML = '';
        skinUniversalGenreList.forEach(g => {
            const item = document.createElement('label');
            item.className = "flex items-center gap-3 p-1.5 hover:bg-zinc-900 rounded cursor-pointer text-zinc-300";
            item.innerHTML = `
                <input type="checkbox" name="skinGenres" value="${g.label}" class="skin-genre-checkbox accent-[#d946ef]">
                <span class="w-3.5 h-3.5 rounded-full inline-block shrink-0 shadow" style="background-color: ${g.color}"></span>
                <span class="font-extrabold text-sm text-zinc-200">${g.label}</span>
            `;
            item.querySelector('input').addEventListener('change', (e) => {
                if (document.getElementById('cosSelectedGenreMode').value === 'universal') return;
                if (e.target.checked) {
                    document.querySelectorAll('.skin-genre-checkbox').forEach(cb => { if (cb !== e.target) cb.checked = false; });
                }
                validateSkinFormStateAndCheckChanges();
            });
            container.appendChild(item);
        });
    }

    function setupSkinFileOrDeleteSlot(slotId, hasExisting, keyName, isDate = false) {
        const slot = document.getElementById(slotId);
        if (!slot) return;

        const lang = getCurrentLanguage();
        const defaultText = isDate ? translations[lang].btnDeleteDate : translations[lang].btnDeleteFile;
        const pendingText = isDate ? translations[lang].btnDateDeletePending : translations[lang].btnFileDeletePending;

        let inputEl = slot.querySelector('input');
        let deleteBtn = slot.querySelector('.btn-slot-delete');

        if (hasExisting && !pendingSkinDeletes[keyName]) {
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
                pendingSkinDeletes[keyName] = !pendingSkinDeletes[keyName];
                if (pendingSkinDeletes[keyName]) {
                    deleteBtn.innerText = pendingText;
                    deleteBtn.classList.add('glow-red');
                } else {
                    deleteBtn.innerText = defaultText;
                    deleteBtn.classList.remove('glow-red');
                }
                validateSkinFormStateAndCheckChanges();
            };
        } else {
            if (inputEl) inputEl.classList.remove('hidden');
            if (deleteBtn) deleteBtn.classList.add('hidden');
        }
    }

    function resetCosmeticFormState() {
        const form = document.getElementById('cosmetic-form');
        if (form) form.reset();

        document.getElementById('editingCosId').value = '';
        Object.keys(pendingSkinDeletes).forEach(k => pendingSkinDeletes[k] = false);

        const lang = getCurrentLanguage();
        const submitBtn = document.getElementById('cosSubmitBtn');
        if (submitBtn) {
            const textSpan = submitBtn.querySelector('span');
            if (textSpan) textSpan.innerText = translations[lang].btnRegister;
            else submitBtn.innerText = translations[lang].btnRegister;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        document.getElementById('cosBrandManagementList')?.classList.add('hidden');
        document.getElementById('cosIconPreviewBox')?.classList.add('hidden');
        document.getElementById('cosIsComingSoon').value = "false";
        document.getElementById('cosIsExclusive').checked = false;
        
        document.getElementById('cosSelectedGenreMode').value = 'single';
        const btnU = document.getElementById('btn-skin-universal-genre');
        if (btnU) btnU.classList.replace('bg-emerald-600', 'bg-fuchsia-600');
        
        buildSkinGenresSelector();

        pendingBrandFileToUpload = null;
        tempPreviewBrandUrl = null;
        editingCosBrandUrlsList = [];

        document.querySelectorAll('.btn-slot-delete').forEach(btn => btn.remove());
        document.querySelectorAll('#cosmetic-form input[type="file"], #cosmetic-form input[type="date"]').forEach(inp => inp.classList.remove('hidden'));

        const nameInput = document.getElementById('cosBrandNameInput');
        if (nameInput) nameInput.value = "";
        document.getElementById('box-brand-name-field')?.classList.add('hidden');

        document.getElementById('box-brand-upload-new')?.classList.remove('hidden');
        document.getElementById('box-brand-select-existing')?.classList.add('hidden');
        document.getElementById('btn-brand-mode-upload')?.classList.replace('bg-zinc-900', 'bg-fuchsia-950/60');
        document.getElementById('btn-brand-mode-existing')?.classList.replace('bg-fuchsia-950/60', 'bg-zinc-900');
    }

    function validateSkinFormStateAndCheckChanges() {
        const submitBtn = document.getElementById('cosSubmitBtn');
        if (!submitBtn) return;

        const editingId = document.getElementById('editingCosId').value;
        const name = document.getElementById('cosName').value.trim();
        const artist = document.getElementById('cosArtist').value.trim();
        const isUniversal = document.getElementById('cosSelectedGenreMode').value === 'universal';
        const checkedGenres = document.querySelectorAll('.skin-genre-checkbox:checked');

        const hasRequired = name !== "" && artist !== "" && (isUniversal || checkedGenres.length > 0);

        if (!editingId) {
            if (hasRequired) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
            const existingCos = getCosmetics().find(c => c.id === editingId);
            if (!existingCos || !hasRequired) {
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            }

            const hasPendingDelete = Object.values(pendingSkinDeletes).some(v => v === true);
            const hasNewFile = Array.from(document.querySelectorAll('#cosmetic-form input[type="file"]')).some(inp => inp.files && inp.files.length > 0);

            const changed = hasPendingDelete || hasNewFile ||
                name !== (existingCos.name || '') ||
                artist !== (existingCos.artist || '') ||
                document.getElementById('cosDate').value !== (existingCos.date || '') ||
                document.getElementById('cosDl1').value !== (existingCos.dl1 || '') ||
                document.getElementById('cosDl2').value !== (existingCos.dl2 || '') ||
                document.getElementById('cosIsExclusive').checked !== !!existingCos.isExclusive ||
                editingCosBrandUrlsList.join(', ') !== (existingCos.insp || '');

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
            const matched = skinUniversalGenreList.find(item => item.label.toLowerCase() === trimmed.toLowerCase());
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

    function sortAscendingByDate(arr) {
        return [...arr].sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;  
            if (!b.date) return -1; 
            return new Date(a.date) - new Date(b.date);
        });
    }

    function renderCosmeticsTables() {
        const tbodyB = document.getElementById('tbody-beatstar');
        const tbodyT = document.getElementById('tbody-tapwave');
        if (!tbodyB || !tbodyT) return; 

        const lang = getCurrentLanguage();
        const isCreatorMode = getIsCreatorMode();
        const currentSelectedSkinSubPlatform = getCurrentSelectedSkinSubPlatform();
        const cosmetics = getCosmetics();

        const fragB = document.createDocumentFragment();
        const fragT = document.createDocumentFragment();

        let filtered = sortAscendingByDate(cosmetics);
        if (activeSkinGenreFilter) filtered = filtered.filter(c => c.genre && c.genre.toLowerCase().includes(activeSkinGenreFilter.toLowerCase()));

        const beatstarList = filtered.filter(c => c.platform !== 'TapWave');
        const tapwaveList = filtered.filter(c => c.platform === 'TapWave');

        const hasActiveFilter = !!activeSkinGenreFilter;

        const cB = document.getElementById('counter-beatstar');
        const cT = document.getElementById('counter-tapwave');

        const totalBeatstarAll = cosmetics.filter(c => c.platform !== 'TapWave').length;
        const totalTapwaveAll = cosmetics.filter(c => c.platform === 'TapWave').length;

        if (cB) cB.innerText = hasActiveFilter ? `Skins: ${beatstarList.length}` : `Total: ${totalBeatstarAll} Skins`;
        if (cT) cT.innerText = hasActiveFilter ? `Skins: ${tapwaveList.length}` : `Total: ${totalTapwaveAll} Skins`;

        const currentSubPlatformList = (currentSelectedSkinSubPlatform === 'TapWave') ? tapwaveList : beatstarList;
        if (currentSubPlatformList.length === 0) {
            const targetTbody = (currentSelectedSkinSubPlatform === 'TapWave') ? tbodyT : tbodyB;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="5" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center gap-3">
                        <img src="1455064703448645786.gif" alt="Boogie" class="w-28 h-auto">
                        <p class="text-sm font-extrabold text-zinc-300 font-sans tracking-wide">${translations[lang].noSkinsBoogie}</p>
                    </div>
                </td>
            `;
            targetTbody.innerHTML = '';
            targetTbody.appendChild(tr);
            return;
        }

        filtered.forEach((cos) => {
            const isT = (cos.platform === 'TapWave');

            const tr = document.createElement('tr');
            tr.className = "hover:bg-fuchsia-950/20 transition border-b-2 border-fuchsia-900/50 shadow-sm";
            
            let pMarkup = renderVideoPlayerMarkup(cos.video, true);
            
            let inspMarkup = '';
            if (cos.insp) {
                const urls = cos.insp.split(/[\s,]+/).filter(url => url.trim() !== "");
                let imagesHtml = urls.map((url) => {
                    const cleanUrl = url.trim();
                    return `
                    <div class="flex flex-col items-center gap-1 bg-[#05020a]/60 border border-zinc-800/40 rounded-lg p-1 shrink-0">
                        <div class="relative group h-20 w-32 sm:h-24 sm:w-36 flex items-center justify-center">
                            <img src="${cleanUrl}" class="max-h-full max-w-full object-contain rounded">
                        </div>
                    </div>
                `;}).join('');

                inspMarkup = `
                    <div class="flex flex-col md:flex-row flex-wrap gap-2 mt-1 bg-black/40 p-1.5 rounded-xl border border-fuchsia-950/30 w-max max-w-full shadow-lg">
                        ${imagesHtml}
                    </div>`;
            }

            const hasAnyLinks = cos.skinDirectUrl || cos.dl1 || cos.dl2;
            let linksLayout = `<div class="flex flex-col gap-1 sm:gap-1.5 max-w-[150px] sm:max-w-[240px] mx-auto">`;
            if (hasAnyLinks) {
                if (cos.skinDirectUrl) {
                    linksLayout += `<button class="btn-direct-skin-download bg-gradient-to-r from-fuchsia-500 to-pink-500 text-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 sm:gap-1.5 shadow"><i class="fa-solid fa-circle-down"></i>${translations[lang].downloadDirectBtn}</button>`;
                }
                if (cos.dl1) linksLayout += `<a href="${cos.dl1}" target="_blank" class="bg-zinc-900 px-2 sm:px-4 py-1 sm:py-2 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1 sm:gap-1.5 hover:border-fuchsia-500/40 transition"><img src="Discord_Logo.png" class="w-3 sm:w-3.5 h-3 sm:h-3.5 force-white-icon">Discord</a>`;
                if (cos.dl2) linksLayout += `<a href="${cos.dl2}" target="_blank" class="bg-zinc-900 px-2 sm:px-4 py-1 sm:py-2 text-center rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-black border border-zinc-800 flex items-center justify-center gap-1 sm:gap-1.5 hover:border-fuchsia-500/40 transition"><img src="BSCM_Logo.png" class="w-3 sm:w-3.5 h-3 sm:h-3.5 force-white-icon">BSCM</a>`;
            } else {
                linksLayout += `<span class="text-[9px] sm:text-[10px] font-extrabold text-zinc-500 text-center block px-1.5 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg sm:rounded-xl">${translations[lang].noDownloadsAvailable}</span>`;
            }
            linksLayout += `</div>`;

            const exclusiveBadge = cos.isExclusive ? `
                <div class="mt-1 text-[10px] font-black text-fuchsia-400 uppercase tracking-wider flex items-center gap-1 bg-fuchsia-950/40 border border-fuchsia-800/40 px-2 py-0.5 rounded-md w-max">
                    <i class="fa-solid fa-star text-fuchsia-400"></i> ${translations[lang].skinExclusiveLabel}
                </div>
            ` : '';

            tr.innerHTML = `
                <td class="p-2 sm:p-4 text-center align-middle">
                    <div class="w-20 h-20 sm:w-36 sm:h-36 border border-fuchsia-950/80 rounded-xl overflow-hidden bg-zinc-950 p-1 shrink-0 mx-auto">
                        <img src="${cos.icon}" class="w-full h-full object-cover rounded-lg bg-zinc-900" onerror="this.src='BoxSprite_MerchSkin2.png'">
                    </div>
                </td>
                <td class="p-2 sm:p-4 min-w-[200px] sm:min-w-[320px] flex-1 align-middle">
                    <ul class="space-y-2 list-none text-zinc-300 whitespace-normal break-words">
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listName}:</span> 
                            <div class="inline-block flex-1">
                                <h4 class="text-white font-black tracking-wide text-base sm:text-xl inline-block">${cos.name}</h4>
                                ${exclusiveBadge}
                            </div>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listArtist}:</span> 
                            <span class="text-zinc-200 font-bold inline-block">${cos.artist}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].listRelease}:</span> 
                            <span class="font-sans font-bold text-zinc-400 text-xs sm:text-sm">${formatStringToDMY(cos.date)}</span>
                        </li>
                        <li class="flex flex-col sm:flex-row sm:items-baseline">
                            <span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs block sm:inline-block w-full sm:w-28 shrink-0 mb-0.5 sm:mb-0">${translations[lang].formGenre}:</span> 
                            <div class="inline-flex flex-wrap gap-1">${renderGenresBadgesHtml(cos.genre)}</div>
                        </li>
                        <li class="flex flex-col gap-0.5 pt-0.5"><span class="text-zinc-500 font-bold uppercase text-[10px] sm:text-xs">${translations[lang].listInsp}:</span> ${inspMarkup || 'N/A'}</li>
                    </ul>
                </td>
                <td class="p-2 sm:p-4 text-center align-middle">${pMarkup}</td>
                <td class="p-2 sm:p-4 align-middle">${linksLayout}</td>
                <td class="p-2 sm:p-4 text-center align-middle ${isCreatorMode ? '':'hidden'}">
                    <div class="flex flex-col gap-1">
                        <button class="btn-edit-cos bg-white text-black px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow">${translations[lang].btnEdit}</button>
                        <button class="btn-del-cos bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow">${translations[lang].btnDelete}</button>
                    </div>
                </td>
            `;

            setupNativeVideoBehavior(tr.querySelector('.custom-native-video-wrapper'));
            
            if (cos.skinDirectUrl) {
                tr.querySelector('.btn-direct-skin-download')?.addEventListener('click', () => triggerDownloadAlert(cos.skinDirectUrl));
            }

            tr.querySelector('.btn-edit-cos')?.addEventListener('click', () => {
                resetCosmeticFormState();

                document.getElementById('editingCosId').value = cos.id;
                document.getElementById('cosName').value = cos.name;
                document.getElementById('cosArtist').value = cos.artist; 
                document.getElementById('cosDate').value = cos.date || '';
                document.getElementById('cosDl1').value = cos.dl1 || '';
                document.getElementById('cosDl2').value = cos.dl2 || '';
                document.getElementById('cosIsExclusive').checked = !!cos.isExclusive;
                
                setupSkinFileOrDeleteSlot('slot-cos-icon', !!cos.icon && cos.icon !== 'BoxSprite_MerchSkin2.png', 'icon');
                setupSkinFileOrDeleteSlot('slot-cos-video', !!cos.video, 'video');
                setupSkinFileOrDeleteSlot('slot-cos-zip', !!cos.skinDirectUrl, 'zip');
                setupSkinFileOrDeleteSlot('slot-cos-date', !!cos.date, 'date', true);

                const submitBtn = document.getElementById('cosSubmitBtn');
                if (submitBtn) {
                    const span = submitBtn.querySelector('span');
                    if (span) span.innerText = translations[lang].btnSaveChanges;
                    else submitBtn.innerText = translations[lang].btnSaveChanges;
                }
                
                const pBox = document.getElementById('cosIconPreviewBox');
                const pImg = document.getElementById('cosIconPreviewImg');
                if (cos.icon && !pendingSkinDeletes.icon) {
                    pImg.src = cos.icon;
                    pBox.classList.remove('hidden');
                } else { pBox.classList.add('hidden'); }

                editingCosBrandUrlsList = cos.insp ? cos.insp.split(/[\s,]+/).filter(url => url.trim() !== "") : [];
                renderBrandManagementFormInterface();

                const skinGenresArray = cos.genre ? cos.genre.split(' / ').map(g => g.trim().toLowerCase()) : [];
                const modeInput = document.getElementById('cosSelectedGenreMode');
                const btnUniversal = document.getElementById('btn-skin-universal-genre');
                const skinCheckboxes = document.querySelectorAll('.skin-genre-checkbox');

                const isUniversalGenre = skinUniversalGenreList.every(g => skinGenresArray.includes(g.label.toLowerCase()));

                if (isUniversalGenre) {
                    modeInput.value = 'universal';
                    skinCheckboxes.forEach(cb => { cb.checked = true; cb.disabled = true; });
                    if (btnUniversal) btnUniversal.classList.replace('bg-fuchsia-600', 'bg-emerald-600');
                } else {
                    modeInput.value = 'single';
                    skinCheckboxes.forEach(cb => {
                        cb.disabled = false;
                        cb.checked = skinGenresArray.includes(cb.value.trim().toLowerCase());
                    });
                    if (btnUniversal) btnUniversal.classList.replace('bg-emerald-600', 'bg-fuchsia-600');
                }

                validateSkinFormStateAndCheckChanges();
            });

            tr.querySelector('.btn-del-cos')?.addEventListener('click', () => {
                requestUserDeleteConfirmation(() => {
                    if (db) {
                        showLoadingOverlay();
                        remove(ref(db, 'cosmetics/' + cos.id)).finally(() => hideLoadingOverlay());
                    }
                });
            });
            
            if (isT) fragT.appendChild(tr); else fragB.appendChild(tr);
        });

        tbodyB.innerHTML = '';
        tbodyT.innerHTML = '';
        tbodyB.appendChild(fragB);
        tbodyT.appendChild(fragT);
    }

    document.getElementById('btn-skin-universal-genre')?.addEventListener('click', () => {
        const modeInput = document.getElementById('cosSelectedGenreMode');
        const checkboxes = document.querySelectorAll('.skin-genre-checkbox');
        const btn = document.getElementById('btn-skin-universal-genre');

        if (modeInput.value === 'single') {
            modeInput.value = 'universal';
            checkboxes.forEach(cb => { cb.checked = true; cb.disabled = true; });
            btn.classList.replace('bg-fuchsia-600', 'bg-emerald-600');
        } else {
            modeInput.value = 'single';
            checkboxes.forEach(cb => { cb.checked = false; cb.disabled = false; });
            btn.classList.replace('bg-emerald-600', 'bg-fuchsia-600');
        }
        validateSkinFormStateAndCheckChanges();
    });

    document.getElementById('btn-cancel-cos-form')?.addEventListener('click', resetCosmeticFormState);

    document.getElementById('btn-brand-mode-upload')?.addEventListener('click', () => {
        document.getElementById('box-brand-upload-new')?.classList.remove('hidden');
        document.getElementById('box-brand-select-existing')?.classList.add('hidden');
        document.getElementById('btn-brand-mode-upload')?.classList.replace('bg-zinc-900', 'bg-fuchsia-950/60');
        document.getElementById('btn-brand-mode-existing')?.classList.replace('bg-fuchsia-950/60', 'bg-zinc-900');
    });

    document.getElementById('btn-brand-mode-existing')?.addEventListener('click', () => {
        populateExistingBrandsDropdown();
        document.getElementById('box-brand-select-existing')?.classList.remove('hidden');
        document.getElementById('box-brand-upload-new')?.classList.add('hidden');
        document.getElementById('box-brand-name-field')?.classList.add('hidden');
        document.getElementById('btn-brand-mode-existing')?.classList.replace('bg-zinc-900', 'bg-fuchsia-950/60');
        document.getElementById('btn-brand-mode-upload')?.classList.replace('bg-fuchsia-950/60', 'bg-zinc-900');
    });

    document.getElementById('selectExistingBrandUrl')?.addEventListener('change', (e) => {
        const selectedUrl = e.target.value;
        if (selectedUrl) {
            if (!editingCosBrandUrlsList.includes(selectedUrl)) {
                editingCosBrandUrlsList.push(selectedUrl);
                renderBrandManagementFormInterface();
                validateSkinFormStateAndCheckChanges();
            }
        }
        e.target.value = "";
    });

    document.getElementById('cosBrandFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const nameBox = document.getElementById('box-brand-name-field');
        const nameInput = document.getElementById('cosBrandNameInput');

        if (file) {
            pendingBrandFileToUpload = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                if (tempPreviewBrandUrl) {
                    const idx = editingCosBrandUrlsList.indexOf(tempPreviewBrandUrl);
                    if (idx !== -1) editingCosBrandUrlsList.splice(idx, 1);
                }

                tempPreviewBrandUrl = event.target.result;
                editingCosBrandUrlsList.push(tempPreviewBrandUrl);
                renderBrandManagementFormInterface();

                if (nameBox) nameBox.classList.remove('hidden');
                if (nameInput) nameInput.focus();
                validateSkinFormStateAndCheckChanges();
            };
            reader.readAsDataURL(file);
            e.target.value = "";
        }
    });

    document.getElementById('cosmetic-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const lang = getCurrentLanguage();
        const isUniversal = document.getElementById('cosSelectedGenreMode').value === 'universal';
        const checkedGenres = document.querySelectorAll('.skin-genre-checkbox:checked');
        if (!isUniversal && checkedGenres.length === 0) {
            alert(translations[lang].selectGenreError);
            return;
        }

        const customNameInput = document.getElementById('cosBrandNameInput');
        const brandNameValue = customNameInput ? customNameInput.value.trim() : "";
        
        if (pendingBrandFileToUpload && !brandNameValue) {
            alert(translations[lang].brandNameRequiredError || "El nombre de la marca es obligatorio.");
            customNameInput?.focus();
            return;
        }

        showLoadingOverlay();

        try {
            let id = document.getElementById('editingCosId').value.trim() || Date.now().toString();
            const cosmetics = getCosmetics();
            let existingCos = cosmetics.find(c => c.id === id) || {};

            // Executar borrados en R2
            if (pendingSkinDeletes.icon && existingCos.icon) { await deleteFileFromCloudflareR2(existingCos.icon); existingCos.icon = "BoxSprite_MerchSkin2.png"; }
            if (pendingSkinDeletes.video && existingCos.video) { await deleteFileFromCloudflareR2(existingCos.video); existingCos.video = ""; }
            if (pendingSkinDeletes.zip && existingCos.skinDirectUrl) { await deleteFileFromCloudflareR2(existingCos.skinDirectUrl); existingCos.skinDirectUrl = ""; }

            let finalIconUrl = existingCos.icon || "BoxSprite_MerchSkin2.png";
            let finalVideoUrl = existingCos.video || "";
            let finalSkinDirectUrl = existingCos.skinDirectUrl || "";

            const iconFileInput = document.getElementById('cosIconFile');
            if (iconFileInput && iconFileInput.files && iconFileInput.files[0]) {
                const uploadedIcon = await uploadFileToCloudflareR2(iconFileInput.files[0], 'skins_icon');
                if (uploadedIcon) finalIconUrl = uploadedIcon;
            }

            const videoFileInput = document.getElementById('cosVideoFile');
            if (videoFileInput && videoFileInput.files && videoFileInput.files[0]) {
                const uploadedVideo = await uploadFileToCloudflareR2(videoFileInput.files[0], 'prevskins');
                if (uploadedVideo) finalVideoUrl = uploadedVideo;
            }

            const skinZipFileInput = document.getElementById('cosSkinZipFile');
            if (skinZipFileInput && skinZipFileInput.files && skinZipFileInput.files[0]) {
                const uploadedZip = await uploadFileToCloudflareR2(skinZipFileInput.files[0], 'skins_zip');
                if (uploadedZip) finalSkinDirectUrl = uploadedZip;
            }

            let finalBrandUrlsList = [...editingCosBrandUrlsList];
            if (pendingBrandFileToUpload) {
                const uploadedBrandUrl = await uploadFileToCloudflareR2(pendingBrandFileToUpload, 'brands');
                if (uploadedBrandUrl) {
                    const tempIndex = finalBrandUrlsList.findIndex(url => url.startsWith('data:image'));
                    if (tempIndex !== -1) {
                        finalBrandUrlsList[tempIndex] = uploadedBrandUrl;
                    } else {
                        finalBrandUrlsList.push(uploadedBrandUrl);
                    }
                    const brandCustomNamesMap = getBrandCustomNamesMap();
                    brandCustomNamesMap[uploadedBrandUrl] = brandNameValue;
                    await saveBrandCustomNamesToDatabase();
                }
            }

            let finalInspString = finalBrandUrlsList.join(', ');

            let finalSkinGenre = "General";
            if (isUniversal) {
                finalSkinGenre = skinUniversalGenreList.map(g => g.label).join(' / ');
            } else {
                const checkedCb = document.querySelector('.skin-genre-checkbox:checked');
                if (checkedCb) finalSkinGenre = checkedCb.value;
            }

            const dateVal = pendingSkinDeletes.date ? "" : (document.getElementById('cosDate')?.value || '');
            const isExclusive = document.getElementById('cosIsExclusive')?.checked || false;
            const currentSelectedSkinSubPlatform = getCurrentSelectedSkinSubPlatform();

            const data = {
                id: id, 
                name: (document.getElementById('cosName')?.value || '').trim(), 
                artist: (document.getElementById('cosArtist')?.value || '').trim(),
                icon: finalIconUrl, 
                video: finalVideoUrl,
                date: dateVal, 
                genre: finalSkinGenre,
                insp: finalInspString, 
                skinDirectUrl: finalSkinDirectUrl,
                platform: currentSelectedSkinSubPlatform, 
                isExclusive: isExclusive,
                dl1: (document.getElementById('cosDl1')?.value || '').trim(), 
                dl2: (document.getElementById('cosDl2')?.value || '').trim()
            };

            if (db) {
                await set(ref(db, 'cosmetics/' + id), data);
                await set(ref(db, 'last_update_date'), new Date().toISOString().split('T')[0]); 
                resetCosmeticFormState();
            }
        } catch(err) {
            console.error("Error al guardar skin en Firebase:", err);
            alert("Ocurrió un error al guardar la skin. Revisa la consola.");
        } finally {
            hideLoadingOverlay();
        }
    });

    document.getElementById('cosmetic-form')?.addEventListener('input', validateSkinFormStateAndCheckChanges);
    document.getElementById('cosmetic-form')?.addEventListener('change', validateSkinFormStateAndCheckChanges);

    return {
        buildSkinGenresSelector,
        populateExistingBrandsDropdown,
        resetCosmeticFormState,
        renderCosmeticsTables,
        setSkinGenreFilter: (val) => { activeSkinGenreFilter = val; }
    };
}