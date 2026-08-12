let audioCtx = null;
let audioAnalyser = null;
let audioSource = null;
let canvasAnimationId = null;
let currentRotationAngle = 0;

let activeAudioElement = null;
let activeAudioButton = null;
let activeAudioImg = null;
let activeCanvas = null;
let activeArtContainer = null;
let audioDataArray = null;
let activeOnEndCallback = null;

export function stopGlobalAudioPreview() {
    if (canvasAnimationId) {
        cancelAnimationFrame(canvasAnimationId);
        canvasAnimationId = null;
    }
    if (activeAudioElement) {
        activeAudioElement.pause();
        activeAudioElement.src = "";
        activeAudioElement.load();
        activeAudioElement = null;
    }
    if (audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend();
    }

    if (activeAudioButton) {
        activeAudioButton.innerHTML = `<i class="fa-solid fa-play text-[10px]"></i>`;
        activeAudioButton = null;
    }

    if (activeOnEndCallback) {
        try { activeOnEndCallback(); } catch(e) {}
        activeOnEndCallback = null;
    }

    document.querySelectorAll('button').forEach(btn => {
        if (btn.querySelector('.fa-stop') || btn.querySelector('.fa-circle-notch')) {
            btn.innerHTML = `<i class="fa-solid fa-play text-[10px]"></i>`;
        }
    });

    if (activeAudioImg) {
        activeAudioImg.classList.add('bg-zinc-900');
        activeAudioImg = null;
    }

    document.querySelectorAll('.target-art-outer-container, #modal-edition-art-container').forEach(box => {
        box.classList.remove('art-circle-shape');
        box.classList.remove('art-container-circular');
    });

    activeArtContainer = null;

    if (activeCanvas) {
        const ctx = activeCanvas.getContext('2d');
        ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        activeCanvas = null;
    }
    currentRotationAngle = 0;
}

export function startRadialCanvasVisualizer(canvas, analyser, containerElement, themeColor = "#d946ef") {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    if (!audioDataArray || audioDataArray.length !== bufferLength) {
        audioDataArray = new Uint8Array(bufferLength);
    }

    activeCanvas = canvas;

    function draw() {
        if (!activeCanvas || activeCanvas !== canvas) return;
        canvasAnimationId = requestAnimationFrame(draw);

        const rect = containerElement ? containerElement.getBoundingClientRect() : canvas.getBoundingClientRect();
        const displaySize = Math.max(rect.width, rect.height) || 144;

        if (canvas.width !== displaySize + 40 || canvas.height !== displaySize + 40) {
            canvas.width = displaySize + 40;
            canvas.height = displaySize + 40;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = (displaySize / 2) + 2;

        analyser.getByteFrequencyData(audioDataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentRotationAngle += 0.008;

        const barCount = 64;
        for (let i = 0; i < barCount; i++) {
            const angle = ((i / barCount) * Math.PI * 2) + currentRotationAngle;

            const targetIndex = i < barCount / 2 ? i : barCount - i;
            const dataIndex = Math.floor((targetIndex / (barCount / 2)) * (bufferLength * 0.7));
            const rawValue = audioDataArray[dataIndex] || 0;

            let barHeight = (rawValue / 255);
            if (dataIndex < 8) {
                barHeight = Math.pow(barHeight, 1.2) * 16;
            } else {
                barHeight = Math.pow(barHeight, 1.3) * 14;
            }

            const startX = centerX + Math.cos(angle) * radius;
            const startY = centerY + Math.sin(angle) * radius;
            const endX = centerX + Math.cos(angle) * (radius + barHeight);
            const endY = centerY + Math.sin(angle) * (radius + barHeight);

            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }
    draw();
}

export function toggleAudioPreviewEngine(audioUrl, btnElement, imgElement, canvasElement, containerElement, isModalOpen = false, themeColor = "#d946ef", keepPlayingIfSame = false, onEndCallback = null) {
    if (activeAudioElement && activeAudioElement.dataset.url === audioUrl && !activeAudioElement.paused) {
        if (keepPlayingIfSame) {
            activeAudioElement.loop = isModalOpen;
            if (containerElement) {
                containerElement.classList.add('art-container-circular');
                containerElement.classList.add('art-circle-shape');
            }
            if (btnElement) {
                btnElement.innerHTML = `<i class="fa-solid fa-stop text-[10px]"></i>`;
                activeAudioButton = btnElement;
            }
            if (canvasElement && audioAnalyser) {
                startRadialCanvasVisualizer(canvasElement, audioAnalyser, containerElement, themeColor);
            }
            return;
        }
        stopGlobalAudioPreview();
        return;
    }

    stopGlobalAudioPreview();

    document.querySelectorAll('video').forEach(vid => {
        vid.pause();
        vid.currentTime = 0;
    });
    document.querySelectorAll('.custom-native-video-wrapper').forEach(wrapper => {
        const iconEl = wrapper.querySelector('.video-play-icon');
        const controlsOverlay = wrapper.querySelector('.video-controls-overlay');
        const loaderEl = wrapper.querySelector('.video-loading-overlay');

        if (iconEl) iconEl.className = 'fa-solid fa-play text-white text-xl drop-shadow-lg video-play-icon';
        if (controlsOverlay) controlsOverlay.classList.remove('opacity-0', 'hidden');
        if (loaderEl) loaderEl.classList.add('hidden');
    });

    if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>`;

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        audioAnalyser = audioCtx.createAnalyser();
        audioAnalyser.fftSize = 64;
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = audioUrl;
    audio.dataset.url = audioUrl;
    audio.preload = "auto";
    audio.loop = isModalOpen;

    const handleCanPlayThrough = () => {
        if (activeAudioElement !== audio) return;

        if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-stop text-[10px]"></i>`;
        if (containerElement) {
            containerElement.classList.add('art-container-circular');
            containerElement.classList.add('art-circle-shape');
        }
        if (imgElement) imgElement.classList.remove('bg-zinc-900');

        if (audioCtx.state === 'suspended') audioCtx.resume();

        try {
            if (!audioSource || audioSource.mediaElement !== audio) {
                audioSource = audioCtx.createMediaElementSource(audio);
                audioSource.connect(audioAnalyser);
                audioAnalyser.connect(audioCtx.destination);
            }
        } catch (e) {}

        audio.play().then(() => {
            if (canvasElement) {
                startRadialCanvasVisualizer(canvasElement, audioAnalyser, containerElement, themeColor);
            }
        }).catch(err => {
            console.error("Audio playback error:", err);
            stopGlobalAudioPreview();
        });

        audio.removeEventListener('canplaythrough', handleCanPlayThrough);
    };

    audio.addEventListener('canplaythrough', handleCanPlayThrough);

    activeAudioElement = audio;
    activeAudioButton = btnElement;
    activeAudioImg = imgElement;
    activeArtContainer = containerElement;
    activeOnEndCallback = onEndCallback;

    audio.load();

    audio.onended = () => {
        if (!audio.loop) {
            if (btnElement) btnElement.innerHTML = `<i class="fa-solid fa-play text-[10px]"></i>`;
            stopGlobalAudioPreview();
        }
    };
}

export function setAudioLoopState(isLooping) {
    if (activeAudioElement) {
        activeAudioElement.loop = isLooping;
    }
}

export function getActiveAudioElement() {
    return activeAudioElement;
}

export function getAudioAnalyser() {
    return audioAnalyser;
}