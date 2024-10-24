const { app, BrowserWindow, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle get sources request from renderer
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen']
    });
    return sources;
  } catch (error) {
    console.error('Error getting sources:', error);
    throw error;
  }
});

ipcMain.handle('save-dialog', async (event, extension) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      buttonLabel: 'Save video',
      defaultPath: `vid-${Date.now()}.${extension}`,
      filters: [
        { name: `${extension.toUpperCase()} files`, extensions: [extension] }
      ]
    });
    return filePath;
  } catch (error) {
    console.error('Error in save dialog:', error);
    throw error;
  }
});
