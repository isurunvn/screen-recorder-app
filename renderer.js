// renderer.js
const { ipcRenderer } = require('electron');
const { writeFile } = require('fs');

class ScreenRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.videoStream = null;
        this.isRecording = false;
        this.recordingStartTime = 0;
        
        // DOM elements
        this.elements = {
            videoSelect: document.getElementById('videoSelectBtn'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            preview: document.getElementById('preview'),
            recorded: document.getElementById('recorded'),
            trimStart: document.getElementById('trimStart'),
            trimEnd: document.getElementById('trimEnd'),
            saveBtn: document.getElementById('saveBtn'),
            editor: document.querySelector('.editor'),
            timer: document.getElementById('recordingTimer')
        };

        this.initializeEventListeners();
        this.initializeSourceList();
    }

    async initializeSourceList() {
        try {
            await this.getVideoSources();
        } catch (error) {
            console.error('Error during initialization:', error);
            this.showError('Failed to initialize video sources');
        }
    }

    async getVideoSources() {
        try {
            const sources = await ipcRenderer.invoke('get-sources');
            
            // Clear previous options except the first default option
            while (this.elements.videoSelect.options.length > 1) {
                this.elements.videoSelect.remove(1);
            }

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

            const options = { 
                mimeType: 'video/webm; codecs=vp9',
                videoBitsPerSecond: 2500000 // 2.5 Mbps for better quality
            };
            
            this.mediaRecorder = new MediaRecorder(this.videoStream, options);
            this.setupRecorderEvents();
            
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
        } catch (error) {
            console.error('Error setting up video source:', error);
            this.showError('Failed to setup video source');
        }
    }

    setupRecorderEvents() {
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => this.handleRecordingStop();
    }

    startRecording() {
        try {
            if (!this.mediaRecorder) {
                throw new Error('Media Recorder not initialized');
            }
            
            this.recordedChunks = [];
            this.mediaRecorder.start(1000); // Capture data every second
            this.recordingStartTime = Date.now();
            this.isRecording = true;
            
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.elements.editor.classList.add('hidden');
            
            this.startTimer();
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to start recording');
        }
    }

    stopRecording() {
        try {
            if (this.mediaRecorder?.state !== 'inactive') {
                this.mediaRecorder.stop();
                this.stopExistingStream();
            }
            
            this.isRecording = false;
            this.elements.startBtn.disabled = false;
            this.elements.stopBtn.disabled = true;
            
            this.stopTimer();
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.showError('Failed to stop recording');
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

            const blob = new Blob(this.recordedChunks, {
                type: 'video/webm; codecs=vp9'
            });

            this.elements.recorded.src = URL.createObjectURL(blob);
            this.elements.editor.classList.remove('hidden');

            await new Promise(resolve => {
                this.elements.recorded.onloadedmetadata = resolve;
            });

            this.setupTrimControls();
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showError('Error processing recording');
        }
    }

    setupTrimControls() {
        const duration = this.elements.recorded.duration;
        
        this.elements.trimStart.max = duration;
        this.elements.trimEnd.max = duration;
        this.elements.trimEnd.value = duration;
        this.elements.trimStart.value = 0;

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
            const filePath = await ipcRenderer.invoke('save-dialog');
            
            if (filePath && this.recordedChunks.length > 0) {
                const blob = new Blob(this.recordedChunks, {
                    type: 'video/webm; codecs=vp9'
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
            this.showError('Error saving video');
        }
    }

    startTimer() {
        this.elements.timer.classList.remove('hidden');
        this.updateTimer();
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.elements.timer.classList.add('hidden');
    }

    updateTimer() {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        this.elements.timer.textContent = `${minutes}:${seconds}`;
    }

    showError(message) {
        // Implement your preferred error notification method
        alert(message);
    }

    showSuccess(message) {
        // Implement your preferred success notification method
        alert(message);
    }

    initializeEventListeners() {
        this.elements.videoSelect.addEventListener('change', () => this.setupVideoSource());
        this.elements.startBtn.addEventListener('click', () => this.startRecording());
        this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
        this.elements.saveBtn.addEventListener('click', () => this.saveVideo());
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ScreenRecorder();
});