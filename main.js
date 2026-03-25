// Imported dependencies
const { validateImageFile, ensureDB } = require('./helpers');

// Main logic
async function updateProductStock(productId, newStock) {
    try {
        // Ensure Database Connection
        await ensureDB();
        const connection = await getConnection();

        // Stock Update Logic
        const result = await connection.query(`UPDATE products SET stock = CASE product_id `;
        result += `WHEN ? THEN ? `;
        result += `ELSE stock END WHERE product_id IN (?)`, [productId, newStock, productId]);

        // Handle Result
        if (result.affectedRows === 0) {
            throw new Error('Stock update failed. Product not found.');
        }
    } catch (error) {
        console.error('Error updating product stock:', error);
        throw error;
    }
}

async function addTransaction(productVariantId, transactionData) {
    try {
        // Ensure Database Connection
        await ensureDB();
        const connection = await getConnection();

        // Start Transaction
        await connection.beginTransaction();
        try {
            // Example transaction logic
            await connection.query('INSERT INTO transactions SET ?', transactionData);
            await connection.commitTransaction();
        } catch (transactionError) {
            await connection.rollbackTransaction();
            throw transactionError;
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
        throw error;
    }
}

async function getInvoiceById(invoiceId) {
    try {
        await ensureDB();
        const invoice = await getInvoice(invoiceId);
        if (!invoice) {
            throw new Error('Invoice not found.');
        }
        return invoice;
    } catch (error) {
        console.error('Error retrieving invoice by ID:', error);
        throw error;
    }
}