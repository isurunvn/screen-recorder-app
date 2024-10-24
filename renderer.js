const { ipcRenderer } = require('electron');
const { writeFile } = require('fs');

let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;

// Get DOM elements
const videoSelectBtn = document.getElementById('videoSelectBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const preview = document.getElementById('preview');
const recorded = document.getElementById('recorded');
const trimStart = document.getElementById('trimStart');
const trimEnd = document.getElementById('trimEnd');
const saveBtn = document.getElementById('saveBtn');
const editor = document.querySelector('.editor');

// Initialize the source list when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await getVideoSources();
    } catch (error) {
        console.error('Error during initialization:', error);
        alert('Failed to initialize video sources. Please restart the application.');
    }
});

// Get available video sources
async function getVideoSources() {
    try {
        const sources = await ipcRenderer.invoke('get-sources');
        
        // Clear previous options except the first default option
        while (videoSelectBtn.options.length > 1) {
            videoSelectBtn.remove(1);
        }

        // Add the sources to the select element
        sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source.id;
            option.text = source.name;
            videoSelectBtn.add(option);
        });
    } catch (error) {
        console.error('Error getting video sources:', error);
        throw error;
    }
}

// Handle source selection
videoSelectBtn.addEventListener('change', async () => {
    try {
        await getVideoSource();
    } catch (error) {
        console.error('Error selecting video source:', error);
        alert('Error selecting video source. Please try again.');
    }
});

// Set up video source
async function getVideoSource() {
    const sourceId = videoSelectBtn.value;
    
    if (!sourceId) {
        startBtn.disabled = true;
        return;
    }

    // Stop any existing stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    try {
        const constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            }
        };

        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        preview.srcObject = videoStream;
        preview.play();

        const options = { mimeType: 'video/webm; codecs=vp9' };
        mediaRecorder = new MediaRecorder(videoStream, options);

        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onstop = handleStop;

        startBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (error) {
        console.error('Error setting up video source:', error);
        throw error;
    }
}

// Start recording
startBtn.addEventListener('click', () => {
    try {
        if (!mediaRecorder) {
            throw new Error('Media Recorder not initialized');
        }
        mediaRecorder.start();
        startBtn.disabled = true;
        stopBtn.disabled = false;
        recordedChunks = [];
        editor.classList.add('hidden');
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please try again.');
    }
});

// Stop recording
stopBtn.addEventListener('click', () => {
    try {
        if (mediaRecorder?.state !== 'inactive') {
            mediaRecorder.stop();
            videoStream.getTracks().forEach(track => track.stop());
        }
        startBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (error) {
        console.error('Error stopping recording:', error);
        alert('Failed to stop recording. Please try again.');
    }
});

function handleDataAvailable(e) {
    if (e.data.size > 0) {
        recordedChunks.push(e.data);
    }
}

function handleStop() {
    try {
        if (recordedChunks.length === 0) {
            throw new Error('No video data recorded');
        }

        const blob = new Blob(recordedChunks, {
            type: 'video/webm; codecs=vp9'
        });

        recorded.src = URL.createObjectURL(blob);
        editor.classList.remove('hidden');

        recorded.onloadedmetadata = () => {
            trimStart.max = recorded.duration;
            trimEnd.max = recorded.duration;
            trimEnd.value = recorded.duration;
            trimStart.value = 0;
        };
    } catch (error) {
        console.error('Error processing recording:', error);
        alert('Error processing recording. Please try again.');
    }
}

// Trim controls
trimStart.addEventListener('input', () => {
    const startVal = parseFloat(trimStart.value);
    const endVal = parseFloat(trimEnd.value);
    
    if (startVal >= endVal) {
        trimStart.value = endVal - 0.1;
    }
    recorded.currentTime = trimStart.value;
});

trimEnd.addEventListener('input', () => {
    const startVal = parseFloat(trimStart.value);
    const endVal = parseFloat(trimEnd.value);
    
    if (endVal <= startVal) {
        trimEnd.value = startVal + 0.1;
    }
    recorded.currentTime = trimEnd.value;
});

// Save video
saveBtn.addEventListener('click', async () => {
    try {
        const filePath = await ipcRenderer.invoke('save-dialog');
        
        if (filePath && recordedChunks.length > 0) {
            const blob = new Blob(recordedChunks, {
                type: 'video/webm; codecs=vp9'
            });
            
            writeFile(filePath, Buffer.from(await blob.arrayBuffer()), (error) => {
                if (error) {
                    throw error;
                }
                alert('Video saved successfully!');
            });
        }
    } catch (error) {
        console.error('Error saving video:', error);
        alert('Error saving video. Please try again.');
    }
});