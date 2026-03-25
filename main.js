// ============================================================
// main.js — Electron Main Process with Size Options Support
// ============================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Use userData for both database and images
const userDataPath = app.getPath('userData');
const DB_PATH = path.join(userDataPath, 'billing.db');
const IMG_DIR = path.join(userDataPath, 'product-images');

console.log('═══════════════════════════════════════════════════════════');
console.log('📁 User Data Path:', userDataPath);
console.log('🗄️ Database Path:', DB_PATH);
console.log('🖼️ Images Directory:', IMG_DIR);
console.log('═══════════════════════════════════════════════════════════');

let db;

// ── Database Init ─────────────────────────────────────────────
const initDatabase = () => {
  try {
    // Ensure images directory exists
    if (!fs.existsSync(IMG_DIR)) {
      fs.mkdirSync(IMG_DIR, { recursive: true });
      console.log('✅ Created images directory:', IMG_DIR);
    } else {
      console.log('✅ Images directory exists:', IMG_DIR);
    }

    // Ensure database directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        description TEXT,
        color       TEXT    NOT NULL DEFAULT '#007AFF',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        price       REAL    NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        category    TEXT    NOT NULL DEFAULT 'General',
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        image       TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS product_variants (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        size_type   TEXT    NOT NULL,  -- 'scoop', 'size', 'container'
        size_value  TEXT    NOT NULL,  -- '1', '2', '3' , 'small', 'medium', 'large', 'half_ltr', 'ltr'
        size_label  TEXT    NOT NULL,  -- '1 Scoop', '2 Scoops', '3 Scoops', 'Small', 'Medium', 'Large', 'Half Ltr', 'Ltr'
        price       REAL    NOT NULL,
        UNIQUE(product_id, size_type, size_value)
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_no   TEXT    NOT NULL UNIQUE,
        customer     TEXT    NOT NULL DEFAULT 'Walk-in Customer',
        subtotal     REAL    NOT NULL DEFAULT 0,
        discount     REAL    NOT NULL DEFAULT 0,
        tax          REAL    NOT NULL DEFAULT 0,
        total        REAL    NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
        variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
        name        TEXT    NOT NULL,
        price       REAL    NOT NULL,
        qty         INTEGER NOT NULL,
        total       REAL    NOT NULL
      );
    `);

    // Migrations
    const productCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
    if (!productCols.includes('category')) {
      db.prepare("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'General'").run();
    }
    if (!productCols.includes('category_id')) {
      db.prepare('ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL').run();
    }
    if (!productCols.includes('image')) {
      db.prepare('ALTER TABLE products ADD COLUMN image TEXT').run();
      console.log('✅ Added image column to products table');
    }

    // Check if variant_id column exists in invoice_items
    const invoiceItemsCols = db.prepare('PRAGMA table_info(invoice_items)').all().map(c => c.name);
    if (!invoiceItemsCols.includes('variant_id')) {
      db.prepare('ALTER TABLE invoice_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL').run();
      console.log('✅ Added variant_id column to invoice_items table');
    }

    const categoryCols = db.prepare('PRAGMA table_info(categories)').all().map(c => c.name);
    if (!categoryCols.includes('color')) {
      db.prepare("ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#007AFF'").run();
    }

    // Seed default categories if none exist
    // const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
    // if (catCount === 0) {
    //   const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, description, color) VALUES (?, ?, ?)');
    //   const defaults = [
    //     ['General', 'General purpose items', '#8E8E93'],
    //     ['Beverages', 'Drinks and liquid products', '#007AFF'],
    //     ['Food', 'Edible food items', '#34C759'],
    //     ['Electronics', 'Electronic devices', '#FF9500'],
    //     ['Clothing', 'Apparel and accessories', '#AF52DE'],
    //   ];
    //   defaults.forEach(([name, desc, color]) => insertCat.run(name, desc, color));
    //   console.log('✅ Seeded default categories');
    // }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

// ── Window ────────────────────────────────────────────────────
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#FAFAFA',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    console.log('✅ Window created and shown');
  });
  
  // DevTools disabled for production
  // win.webContents.openDevTools();
};

// ── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  console.log('🚀 App is ready');
  initDatabase();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  console.log('👋 App quitting');
  db?.close();
});

// ── Helpers ───────────────────────────────────────────────────
const nextInvoiceNo = () => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const prefix = `INV-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const last = db.prepare(
    'SELECT invoice_no FROM invoices WHERE invoice_no LIKE ? ORDER BY id DESC LIMIT 1'
  ).get(`${prefix}%`);
  if (!last) return `${prefix}-001`;
  const num = parseInt(last.invoice_no.split('-').pop(), 10) + 1;
  return `${prefix}-${String(num).padStart(3, '0')}`;
};

// ── Image IPC ─────────────────────────────────────────────────

// Open file picker and copy image to userData folder
ipcMain.handle('image:pick', async () => {
  console.log('🖱️ Image pick requested');
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Product Image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    });
    
    console.log('File pick result:', { canceled, filePaths });
    
    if (canceled || !filePaths.length) return null;

    const src = filePaths[0];
    const ext = path.extname(src);
    const fileName = `prod_${Date.now()}${ext}`;
    const dest = path.join(IMG_DIR, fileName);
    
    console.log('📸 Copying image from:', src);
    console.log('📸 To:', dest);
    
    fs.copyFileSync(src, dest);
    const stats = fs.statSync(dest);
    console.log('✅ Image saved successfully, size:', stats.size, 'bytes');
    
    return fileName;
  } catch (error) {
    console.error('❌ Error in image pick:', error);
    return null;
  }
});

// Delete an image file
ipcMain.handle('image:delete', (_, fileName) => {
  console.log('🗑️ Deleting image:', fileName);
  try {
    if (!fileName) return;
    const fullPath = path.join(IMG_DIR, fileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('✅ Image deleted:', fullPath);
    } else {
      console.log('⚠️ Image not found for deletion:', fullPath);
    }
  } catch (error) {
    console.error('❌ Error deleting image:', error);
  }
});

// Read image as base64 for display
ipcMain.handle('image:getBase64', (_, fileName) => {
  console.log('📖 Reading image:', fileName);
  try {
    if (!fileName) {
      console.log('⚠️ No fileName provided');
      return null;
    }
    const fullPath = path.join(IMG_DIR, fileName);
    console.log('📖 Full path:', fullPath);
    
    if (!fs.existsSync(fullPath)) {
      console.log('❌ Image file does not exist:', fullPath);
      return null;
    }
    
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext;
    const data = fs.readFileSync(fullPath).toString('base64');
    const base64 = `data:image/${mime};base64,${data}`;
    console.log('✅ Image loaded, size:', data.length, 'chars');
    
    return base64;
  } catch (error) {
    console.error('❌ Error reading image:', error);
    return null;
  }
});

// ── Categories IPC ────────────────────────────────────────────
ipcMain.handle('categories:getAll', () => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  console.log('📁 Categories loaded:', categories.length);
  return categories;
});

ipcMain.handle('categories:add', (_, { name, description, color }) => {
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO categories (name, description, color) VALUES (?, ?, ?)'
  ).run(name, description || '', color || '#007AFF');
  console.log('✅ Category added:', name);
  return { id, name, description, color };
});

ipcMain.handle('categories:update', (_, { id, name, description, color }) => {
  db.prepare(
    'UPDATE categories SET name=?, description=?, color=? WHERE id=?'
  ).run(name, description || '', color || '#007AFF', id);
  console.log('✅ Category updated:', name);
  return { id, name, description, color };
});

ipcMain.handle('categories:delete', (_, id) => {
  db.prepare('UPDATE products SET category_id=NULL WHERE category_id=?').run(id);
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
  console.log('✅ Category deleted:', id);
  return { success: true };
});

// ── Products IPC with Variants Support ──────────────────────────────

// Get all products with their variants
ipcMain.handle('products:getAll', () => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name, c.color as category_color
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.name ASC
  `).all();
  
  // Get variants for each product
  const getVariants = db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY price ASC');
  
  for (const product of products) {
    product.variants = getVariants.all(product.id);
    product.hasVariants = product.variants && product.variants.length > 0;
  }
  
  console.log('📦 Products loaded:', products.length);
  if (products.length > 0) {
    const withImages = products.filter(p => p.image).length;
    const withVariants = products.filter(p => p.hasVariants).length;
    console.log('📸 Products with images:', withImages);
    console.log('📏 Products with size variants:', withVariants);
  }
  return products;
});

// Add product with variants
ipcMain.handle('products:add', (_, { name, price, stock, category, category_id, image, hasVariants, variants }) => {
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO products (name, price, stock, category, category_id, image) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, price, stock, category || 'General', category_id || null, image || null);
  
  // Add variants if provided
  if (hasVariants && variants && variants.length > 0) {
    const insertVariant = db.prepare(
      'INSERT INTO product_variants (product_id, size_type, size_value, size_label, price) VALUES (?, ?, ?, ?, ?)'
    );
    for (const variant of variants) {
      insertVariant.run(id, variant.size_type, variant.size_value, variant.size_label, variant.price);
    }
    console.log(`✅ Added ${variants.length} variants for product:`, name);
  }
  
  console.log('✅ Product added:', name, 'Variants:', variants?.length || 0);
  return { id, name, price, stock, category, category_id, image, hasVariants, variants };
});

// Update product with variants
ipcMain.handle('products:update', (_, { id, name, price, stock, category, category_id, image, hasVariants, variants }) => {
  db.prepare(
    'UPDATE products SET name=?, price=?, stock=?, category=?, category_id=?, image=? WHERE id=?'
  ).run(name, price, stock, category || 'General', category_id || null, image || null, id);
  
  // Delete existing variants
  db.prepare('DELETE FROM product_variants WHERE product_id=?').run(id);
  
  // Add new variants if provided
  if (hasVariants && variants && variants.length > 0) {
    const insertVariant = db.prepare(
      'INSERT INTO product_variants (product_id, size_type, size_value, size_label, price) VALUES (?, ?, ?, ?, ?)'
    );
    for (const variant of variants) {
      insertVariant.run(id, variant.size_type, variant.size_value, variant.size_label, variant.price);
    }
    console.log(`✅ Updated ${variants.length} variants for product:`, name);
  }
  
  console.log('✅ Product updated:', name, 'Variants:', variants?.length || 0);
  return { id, name, price, stock, category, category_id, image, hasVariants, variants };
});

// Delete product and its variants
ipcMain.handle('products:delete', (_, id) => {
  const prod = db.prepare('SELECT image FROM products WHERE id=?').get(id);
  if (prod?.image) {
    const imgPath = path.join(IMG_DIR, prod.image);
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
      console.log('🗑️ Deleted product image:', imgPath);
    }
  }
  // Variants will be deleted automatically due to ON DELETE CASCADE
  db.prepare('DELETE FROM products WHERE id=?').run(id);
  console.log('✅ Product deleted:', id);
  return { success: true };
});

// ── Invoices IPC with Variant Support ──────────────────────────────
ipcMain.handle('invoices:create', (_, { customer, items, subtotal, discount, tax, total }) => {
  const invoice_no = nextInvoiceNo();
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (invoice_no, customer, subtotal, discount, tax, total) VALUES (?,?,?,?,?,?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO invoice_items (invoice_id, product_id, variant_id, name, price, qty, total) VALUES (?,?,?,?,?,?,?)'
  );
  const updateStock = db.prepare(
    'UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?'
  );

  const invoiceId = db.transaction(() => {
    const { lastInsertRowid } = insertInvoice.run(
      invoice_no, customer || 'Walk-in Customer', subtotal, discount, tax, total
    );
    for (const item of items) {
      insertItem.run(
        lastInsertRowid, 
        item.product_id ?? null, 
        item.variant_id ?? null,
        item.name, 
        item.price, 
        item.qty, 
        item.total
      );
      if (item.product_id) updateStock.run(item.qty, item.product_id);
    }
    return lastInsertRowid;
  })();

  console.log('🧾 Invoice created:', invoice_no);
  return { success: true, invoice_no, invoiceId };
});

ipcMain.handle('invoices:getAll', (_, { period } = {}) => {
  const filters = {
    today: `WHERE date(i.created_at) = date('now')`,
    month: `WHERE strftime('%Y-%m', i.created_at) = strftime('%Y-%m', 'now')`,
  };
  const sql = `
    SELECT i.*, COUNT(ii.id) as item_count
    FROM invoices i
    LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
    ${filters[period] ?? ''}
    GROUP BY i.id
    ORDER BY i.created_at DESC
  `;
  return db.prepare(sql).all();
});

ipcMain.handle('invoices:getById', (_, id) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!invoice) return null;
  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
  return invoice;
});

ipcMain.handle('invoices:getSummary', () => {
  const today = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count
    FROM invoices WHERE date(created_at) = date('now')
  `).get();
  const month = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as count
    FROM invoices WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get();
  const { c: totalProducts } = db.prepare('SELECT COUNT(*) as c FROM products').get();
  return { today, month, totalProducts };
});

// ════════════════════════════════════════════════════════════
// ── CLEAR HISTORY IPC HANDLERS ───────────────────────────────
// ════════════════════════════════════════════════════════════

// Clear All History
ipcMain.handle('invoices:clearAll', async () => {
  try {
    console.log('🗑️ Clearing all invoice history...');
    
    // Start a transaction
    const clearTransaction = db.transaction(() => {
      // Delete all invoice items first (due to foreign key constraints)
      const itemResult = db.prepare('DELETE FROM invoice_items').run();
      console.log(`  - Deleted ${itemResult.changes} invoice items`);
      
      // Delete all invoices
      const invoiceResult = db.prepare('DELETE FROM invoices').run();
      console.log(`  - Deleted ${invoiceResult.changes} invoices`);
      
      return invoiceResult.changes;
    });
    
    const count = clearTransaction();
    console.log(`✅ Cleared ${count} invoices and their items`);
    return { success: true, count: count };
  } catch (error) {
    console.error('❌ Error clearing history:', error);
    return { success: false, error: error.message };
  }
});

// Clear History by Date Range
ipcMain.handle('invoices:clearByDate', async (_, { startDate, endDate }) => {
  try {
    console.log(`🗑️ Clearing invoices from ${startDate} to ${endDate}`);
    
    const clearByDateTransaction = db.transaction(() => {
      // Get invoice IDs within date range
      const invoices = db.prepare(`
        SELECT id FROM invoices 
        WHERE date(created_at) BETWEEN date(?) AND date(?)
      `).all(startDate, endDate);
      
      const invoiceIds = invoices.map(inv => inv.id);
      
      if (invoiceIds.length === 0) {
        console.log('  - No invoices found in date range');
        return 0;
      }
      
      // Delete invoice items for these invoices
      const placeholders = invoiceIds.map(() => '?').join(',');
      const itemResult = db.prepare(`
        DELETE FROM invoice_items 
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);
      console.log(`  - Deleted ${itemResult.changes} invoice items`);
      
      // Delete invoices within date range
      const invoiceResult = db.prepare(`
        DELETE FROM invoices 
        WHERE date(created_at) BETWEEN date(?) AND date(?)
      `).run(startDate, endDate);
      console.log(`  - Deleted ${invoiceResult.changes} invoices`);
      
      return invoiceResult.changes;
    });
    
    const count = clearByDateTransaction();
    console.log(`✅ Cleared ${count} invoices between ${startDate} and ${endDate}`);
    return { success: true, count: count };
  } catch (error) {
    console.error('❌ Error clearing history by date:', error);
    return { success: false, error: error.message };
  }
});

// Clear History Older Than Days
ipcMain.handle('invoices:clearOlderThan', async (_, { days }) => {
  try {
    console.log(`🗑️ Clearing invoices older than ${days} days`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    console.log(`  - Cutoff date: ${cutoffDateStr}`);
    
    const clearOlderThanTransaction = db.transaction(() => {
      // Get invoice IDs older than cutoff
      const invoices = db.prepare(`
        SELECT id FROM invoices 
        WHERE date(created_at) < date(?)
      `).all(cutoffDateStr);
      
      const invoiceIds = invoices.map(inv => inv.id);
      
      if (invoiceIds.length === 0) {
        console.log('  - No invoices found older than cutoff');
        return 0;
      }
      
      // Delete invoice items for these invoices
      const placeholders = invoiceIds.map(() => '?').join(',');
      const itemResult = db.prepare(`
        DELETE FROM invoice_items 
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);
      console.log(`  - Deleted ${itemResult.changes} invoice items`);
      
      // Delete invoices older than cutoff
      const invoiceResult = db.prepare(`
        DELETE FROM invoices 
        WHERE date(created_at) < date(?)
      `).run(cutoffDateStr);
      console.log(`  - Deleted ${invoiceResult.changes} invoices`);
      
      return invoiceResult.changes;
    });
    
    const count = clearOlderThanTransaction();
    console.log(`✅ Cleared ${count} invoices older than ${days} days`);
    return { success: true, count: count };
  } catch (error) {
    console.error('❌ Error clearing old invoices:', error);
    return { success: false, error: error.message };
  }
});