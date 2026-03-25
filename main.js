// Electron main process code

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const {Database} = require('sqlite3').verbose();

let mainWindow;

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function initializeDatabase() {
    const db = new Database('./database.db', (err) => {
        if (err) {
            console.error('Database opening error: ', err);
        }
    });
    return db;
}

ipcMain.handle('validate-input', async (event, input) => {
    if (!input || input.length === 0) {
        throw new Error('Input cannot be empty!');
    }
    // Additional validations as necessary
});

ipcMain.handle('update-stock', async (event, productId, quantity) => {
    const db = initializeDatabase();
    db.serialize(() => {
        db.run(`UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE stock END WHERE id = ?`, [quantity, quantity, productId], function(err) {
            if (err) {
                console.error('Error updating stock:', err);
            }
        });
    });
    db.close();
});

ipcMain.handle('process-transaction', async (event, transaction) => {
    const db = initializeDatabase();
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        // Execute various SQL commands based on transaction details
        // Handle variants
        db.run('COMMIT');
    }, (err) => {
        if (err) {
            console.error('Transaction error:', err);
            db.run('ROLLBACK');
        }
    });
    db.close();
});

ipcMain.handle('generate-invoice', async (event, invoiceData) => {
    // Logic for invoice generation, validating data and handling errors
    if (!invoiceData) {
        throw new Error('No invoice data provided');
    }
    // Generate the invoice
});

app.on('ready', createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (mainWindow === null) createWindow();
});