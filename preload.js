// ============================================================
// preload.js — Secure IPC Bridge
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('api', {
  // Images
  image: {
    pick: () => ipcRenderer.invoke('image:pick'),
    delete: (fileName) => ipcRenderer.invoke('image:delete', fileName),
    getBase64: (fileName) => ipcRenderer.invoke('image:getBase64', fileName),
  },

  // Categories
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    add: (data) => ipcRenderer.invoke('categories:add', data),
    update: (data) => ipcRenderer.invoke('categories:update', data),
    delete: (id) => ipcRenderer.invoke('categories:delete', id),
  },

  // Products
  products: {
    getAll: () => ipcRenderer.invoke('products:getAll'),
    add: (data) => ipcRenderer.invoke('products:add', data),
    update: (data) => ipcRenderer.invoke('products:update', data),
    delete: (id) => ipcRenderer.invoke('products:delete', id),
  },

  // Invoices (with clear history methods)
  invoices: {
    create: (data) => ipcRenderer.invoke('invoices:create', data),
    getAll: (opts) => ipcRenderer.invoke('invoices:getAll', opts),
    getById: (id) => ipcRenderer.invoke('invoices:getById', id),
    getSummary: () => ipcRenderer.invoke('invoices:getSummary'),
    // Clear History Methods
    clearAll: () => ipcRenderer.invoke('invoices:clearAll'),
    clearByDate: (startDate, endDate) => ipcRenderer.invoke('invoices:clearByDate', { startDate, endDate }),
    clearOlderThan: (days) => ipcRenderer.invoke('invoices:clearOlderThan', { days }),
  },
});