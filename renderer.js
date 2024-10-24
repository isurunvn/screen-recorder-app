const { ipcRenderer } = require('electron');
const { writeFile } = require('fs');

class ScreenRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.videoStream = null;
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.timerInterval = null;
        
        // Supported format configurations
        this.videoFormats = {
            'webm-vp9': {
                mimeType: 'video/webm;codecs=vp9',
                extension: 'webm',
                bitrate: 2500000,
                name: 'WebM (VP9)'
            },
            'webm-vp8': {
                mimeType: 'video/webm;codecs=vp8',
                extension: 'webm',
                bitrate: 2500000,
                name: 'WebM (VP8)'
            },
            'mp4-h264': {
                mimeType: 'video/mp4;codecs=h264',
                extension: 'mp4',
                bitrate: 2500000,
                name: 'MP4 (H.264)'
            }
        };
        
        // DOM elements
        this.elements = {
            videoSelect: document.getElementById('videoSelectBtn'),
            formatSelect: document.getElementById('formatSelect'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            preview: document.getElementById('preview'),
            recorded: document.getElementById('recorded'),
            trimStart: document.getElementById('trimStart'),
            trimEnd: document.getElementById('trimEnd'),
            saveBtn: document.getElementById('saveBtn'),
            editor: document.querySelector('.editor'),
            timer: document.getElementById('recordingTimer'),
            qualitySelect: document.getElementById('qualitySelect')
        };

        this.currentFormat = 'webm-vp9';
        
        // Initialize everything
        this.initializeEventListeners();
        this.initializeFormatSelect();
        this.initializeSourceList();
    }

    initializeFormatSelect() {
        // Clear existing options
        this.elements.formatSelect.innerHTML = '';
        
        // Add supported formats
        Object.entries(this.videoFormats).forEach(([key, format]) => {
            if (MediaRecorder.isTypeSupported(format.mimeType)) {
                const option = document.createElement('option');
                option.value = key;
                option.text = format.name;
                this.elements.formatSelect.add(option);
            }
        });

        // Set default format
        this.currentFormat = this.elements.formatSelect.value;
    }

    async initializeSourceList() {
        try {
            await this.getVideoSources();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.showError('Failed to initialize video sources. Please restart the application.');
        }
    }

    async getVideoSources() {
        try {
            const sources = await ipcRenderer.invoke('get-sources');
            
            // Clear previous options except the first default option
            while (this.elements.videoSelect.options.length > 1) {
                this.elements.videoSelect.remove(1);
            }

            // Add the sources to the select element
            sources.forEach(source => {
                const option = document.createElement('option');
                option.value = source.id;
                option.text = source.name;
                this.elements.videoSelect.add(option);
            });
        } catch (error) {
            console.error('Error getting video sources:', error);
            throw error;
        }
    }

    async setupVideoSource() {
        const sourceId = this.elements.videoSelect.value;
        
        if (!sourceId) {
            this.elements.startBtn.disabled = true;
            return;
        }

        // Stop any existing stream
        this.stopExistingStream();

        try {
            const constraints = {
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                }
            };

            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.preview.srcObject = this.videoStream;
            await this.elements.preview.play();

            await this.setupMediaRecorder();
            
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
        } catch (error) {
            console.error('Error setting up video source:', error);
            this.showError('Failed to setup video source. Please try again.');
        }
    }

    async setupMediaRecorder() {
        const format = this.videoFormats[this.currentFormat];
        const quality = this.elements.qualitySelect.value;
        
        // Adjust bitrate based on quality setting
        const bitrates = {
            'high': format.bitrate * 1.5,
            'medium': format.bitrate,
            'low': format.bitrate * 0.5
        };

        const options = {
            mimeType: format.mimeType,
            videoBitsPerSecond: bitrates[quality]
        };

        try {
            this.mediaRecorder = new MediaRecorder(this.videoStream, options);
            this.setupRecorderEvents();
        } catch (error) {
            console.error('Failed to create MediaRecorder with these options', error);
            this.showError('This format is not supported by your browser. Falling back to WebM...');
            
            // Fallback to WebM
            this.currentFormat = 'webm-vp8';
            this.elements.formatSelect.value = this.currentFormat;
            await this.setupMediaRecorder();
        }
    }

    setupRecorderEvents() {
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => this.handleRecordingStop();
        
        this.mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            this.showError('Recording error occurred. Please try again.');
            this.stopRecording();
        };
    }

    async startRecording() {
        try {
            if (!this.mediaRecorder) {
                throw new Error('Media Recorder not initialized');
            }
            
            this.recordedChunks = [];
            this.mediaRecorder.start(1000); // Capture data every second
            this.recordingStartTime = Date.now();
            this.isRecording = true;
            
            // Update UI
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.elements.editor.classList.add('hidden');
            this.elements.formatSelect.disabled = true;
            this.elements.qualitySelect.disabled = true;
            this.elements.videoSelect.disabled = true;
            
            this.startTimer();
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to start recording. Please try again.');
        }
    }

    stopRecording() {
        try {
            if (this.mediaRecorder?.state !== 'inactive') {
                this.mediaRecorder.stop();
                this.stopExistingStream();
            }
            
            this.isRecording = false;
            
            // Update UI
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
            this.elements.formatSelect.disabled = false;
            this.elements.qualitySelect.disabled = false;
            this.elements.videoSelect.disabled = false;
            
            this.stopTimer();
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.showError('Failed to stop recording. Please try again.');
        }
    }

    stopExistingStream() {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
        }
    }

    async handleRecordingStop() {
        try {
            if (this.recordedChunks.length === 0) {
                throw new Error('No video data recorded');
            }

            const format = this.videoFormats[this.currentFormat];
            const blob = new Blob(this.recordedChunks, {
                type: format.mimeType
            });

            this.elements.recorded.src = URL.createObjectURL(blob);
            this.elements.editor.classList.remove('hidden');

            await new Promise(resolve => {
                this.elements.recorded.onloadedmetadata = resolve;
            });

            this.setupTrimControls();
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showError('Error processing recording. Please try again.');
        }
    }

    setupTrimControls() {
        const duration = this.elements.recorded.duration;
        
        this.elements.trimStart.max = duration;
        this.elements.trimEnd.max = duration;
        this.elements.trimEnd.value = duration;
        this.elements.trimStart.value = 0;

        // Remove any existing event listeners
        const newTrimStart = this.elements.trimStart.cloneNode(true);
        const newTrimEnd = this.elements.trimEnd.cloneNode(true);
        this.elements.trimStart.parentNode.replaceChild(newTrimStart, this.elements.trimStart);
        this.elements.trimEnd.parentNode.replaceChild(newTrimEnd, this.elements.trimEnd);
        this.elements.trimStart = newTrimStart;
        this.elements.trimEnd = newTrimEnd;

        this.elements.trimStart.addEventListener('input', () => {
            const startVal = parseFloat(this.elements.trimStart.value);
            const endVal = parseFloat(this.elements.trimEnd.value);
            
            if (startVal >= endVal) {
                this.elements.trimStart.value = endVal - 0.1;
            }
            this.elements.recorded.currentTime = this.elements.trimStart.value;
        });

        this.elements.trimEnd.addEventListener('input', () => {
            const startVal = parseFloat(this.elements.trimStart.value);
            const endVal = parseFloat(this.elements.trimEnd.value);
            
            if (endVal <= startVal) {
                this.elements.trimEnd.value = startVal + 0.1;
            }
            this.elements.recorded.currentTime = this.elements.trimEnd.value;
        });
    }

    async saveVideo() {
        try {
            const format = this.videoFormats[this.currentFormat];
            const filePath = await ipcRenderer.invoke('save-dialog', format.extension);
            
            if (filePath && this.recordedChunks.length > 0) {
                const blob = new Blob(this.recordedChunks, {
                    type: format.mimeType
                });
                
                const buffer = Buffer.from(await blob.arrayBuffer());
                await new Promise((resolve, reject) => {
                    writeFile(filePath, buffer, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
                
                this.showSuccess('Video saved successfully!');
            }
        } catch (error) {
            console.error('Error saving video:', error);
            this.showError('Error saving video. Please try again.');
        }
    }

    startTimer() {
        this.elements.timer.classList.remove('hidden');
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.elements.timer.classList.add('hidden');
    }

    updateTimer() {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        this.elements.timer.textContent = `${minutes}:${seconds}`;
    }

    showError(message) {
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        alert(`Success: ${message}`);
    }

    initializeEventListeners() {
        this.elements.videoSelect.addEventListener('change', () => this.setupVideoSource());
        this.elements.formatSelect.addEventListener('change', () => {
            this.currentFormat = this.elements.formatSelect.value;
            if (this.videoStream) {
                this.setupMediaRecorder();
            }
        });
        this.elements.qualitySelect.addEventListener('change', () => {
            if (this.videoStream) {
                this.setupMediaRecorder();
            }
        });
        this.elements.startBtn.addEventListener('click', () => this.startRecording());
        this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveVideo());
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.stopRecording();
            this.stopExistingStream();
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ScreenRecorder();
});