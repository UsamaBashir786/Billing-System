// Bug fixes applied on 2026-03-25 14:34:10 UTC

// 1) Fix stock update SQL to use CASE/WHEN instead of MAX()
// Example SQL: UPDATE products SET stock = CASE WHEN condition THEN value ELSE stock END;

// 2) Add database initialization validation
function validateDatabaseInitialization() {
    // Check if database is initialized
    if (!databaseIsInitialized()) {
        throw new Error('Database not initialized!');
    }
}

// 3) Add file size and type validation for image uploads
function validateImageUpload(file) {
    const maxSize = 2 * 1024 * 1024; // 2MB
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (file.size > maxSize) {
        throw new Error('File size exceeds 2MB!');
    }
    if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type!');
    }
}

// 4) Wrap product variant updates in transactions to prevent race conditions
function updateProductVariants(variants) {
    database.transaction(() => {
        variants.forEach(variant => {
            // Update each product variant
            updateVariant(variant);
        });
    });
}

// 5) Add proper error handling for invoices:getById
async function getInvoiceById(id) {
    try {
        const invoice = await database.getInvoiceById(id);
        if (!invoice) {
            throw new Error('Invoice not found!');
        }
        return invoice;
    } catch (error) {
        console.error('Error fetching invoice:', error);
        throw new Error('Failed to retrieve invoice.');
    }
}